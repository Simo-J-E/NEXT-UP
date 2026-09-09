import { z } from 'zod';
import type { ScheduledController } from '@cloudflare/workers-types/experimental';
import { INVENTORIES, marketKey, storeKey } from '../shared/model';
import { cachedPrice, priceHistory } from './cache';
import type { Env } from './env';
import { ApiError, clientLimit, deduplicate } from './http';
import { inventoryResponse, steamWebInventory } from './providers/inventory';
import { steamWebMarket } from './providers/market';
import { loadLibrary, storePrice } from './providers/steam';

const marketRequest = z.object({
  items: z
    .array(
      z.object({
        appId: z
          .number()
          .int()
          .refine((id) => INVENTORIES.some((g) => g.appId === id)),
        name: z.string().min(1).max(256),
      }),
    )
    .min(1)
    .max(8),
});
async function body(request: Request) {
  const text = await request.text();
  if (text.length > 12000)
    throw new ApiError(413, 'request-size', 'Request is too large.');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, 'request-format', 'Send a valid JSON request.');
  }
}
async function mapBounded<T, U>(
  values: T[],
  fn: (value: T) => Promise<U>,
): Promise<U[]> {
  const result: U[] = [];
  for (let i = 0; i < values.length; i += 2)
    result.push(...(await Promise.all(values.slice(i, i + 2).map(fn))));
  return result;
}
async function route(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET')
    return {
      steam: Boolean(env.STEAM_API_KEY),
      inventory: Boolean(env.STEAMWEBAPI_KEY),
      store: env.STORE_ENABLED === 'true',
      configured: Boolean(
        env.RATE_LIMIT_SALT &&
        env.CONTROLLER_NAME &&
        env.PRIVACY_CONTACT &&
        env.DATA_COUNTRIES,
      ),
      privacy: {
        contact: env.PRIVACY_CONTACT || '',
        controller: env.CONTROLLER_NAME || '',
        countries: env.DATA_COUNTRIES || '',
      },
    };
  if (!env.CONTROLLER_NAME || !env.PRIVACY_CONTACT || !env.DATA_COUNTRIES)
    throw new ApiError(
      503,
      'configuration',
      'The site owner has not configured live service details yet. Custom games still work.',
    );
  await clientLimit(request, env);
  if (url.pathname === '/api/profile' && request.method === 'POST') {
    const { profile } = z
      .object({ profile: z.string().min(1).max(300) })
      .parse(await body(request));
    const key = profile.trim();
    const data = await deduplicate(`profile:${key}`, () =>
      loadLibrary(env, key),
    );
    return data;
  }
  if (url.pathname === '/api/store/prices' && request.method === 'POST') {
    const { appIds } = z
      .object({
        appIds: z.array(z.number().int().min(1).max(100000000)).min(1).max(8),
      })
      .parse(await body(request));
    return {
      prices: await mapBounded([...new Set(appIds)], (appId) =>
        cachedPrice(env, storeKey(appId), () => storePrice(env, appId)),
      ),
    };
  }
  if (url.pathname === '/api/inventory' && request.method === 'POST') {
    const data = z
      .object({
        steamId: z.string().regex(/^7656119\d{10}$/),
        appId: z
          .number()
          .int()
          .refine((id) => INVENTORIES.some((g) => g.appId === id)),
        cursor: z
          .string()
          .regex(/^\d{1,30}$/)
          .optional(),
      })
      .parse(await body(request));
    const page = await deduplicate(
      `inventory:${data.steamId}:${data.appId}:${data.cursor || ''}`,
      () => steamWebInventory(env).page(data.steamId, data.appId, data.cursor),
    );
    return inventoryResponse(data.steamId, data.appId, page);
  }
  if (url.pathname === '/api/market/prices' && request.method === 'POST') {
    const { items } = marketRequest.parse(await body(request));
    const provider = steamWebMarket(env);
    return {
      prices: await mapBounded(items, async ({ appId, name }) => {
        const key = marketKey(appId, name);
        const value = await cachedPrice(env, key, () =>
          provider.price(appId, name),
        );
        if (value.quote)
          await env.DB.prepare(
            'INSERT INTO tracked_items(key,app_id,market_name,last_requested,last_refreshed) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET last_requested=excluded.last_requested',
          )
            .bind(key, appId, name, Date.now(), Date.now())
            .run();
        return value;
      }),
    };
  }
  if (url.pathname === '/api/history' && request.method === 'POST') {
    const { key } = z
      .object({
        key: z
          .string()
          .min(1)
          .max(512)
          .regex(/^(market|store):/),
      })
      .parse(await body(request));
    return priceHistory(env, key);
  }
  throw new ApiError(404, 'not-found', 'This API route does not exist.');
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Origin',
    });
    if (origin && !allowed.includes(origin))
      return new Response(
        JSON.stringify({
          error: {
            code: 'origin',
            message: 'This site origin is not allowed.',
          },
        }),
        { status: 403, headers },
      );
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Max-Age', '600');
      return new Response(null, { status: 204, headers });
    }
    try {
      return new Response(JSON.stringify(await route(request, env)), {
        headers,
      });
    } catch (error) {
      const e =
        error instanceof ApiError
          ? error
          : error instanceof z.ZodError
            ? new ApiError(
                400,
                'validation',
                'The request or provider data did not match the expected format.',
              )
            : new ApiError(
                502,
                'unavailable',
                'The service is temporarily unavailable. Custom games still work.',
              );
      if (e.retryAfter) headers.set('Retry-After', String(e.retryAfter));
      // Never log requests, URLs, personal data or upstream exceptions.
      return new Response(
        JSON.stringify({ error: { code: e.code, message: e.message } }),
        { status: e.status, headers },
      );
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM observations WHERE observed_at < ?').bind(
        new Date(now - 400 * 86400_000).toISOString(),
      ),
      env.DB.prepare('DELETE FROM tracked_items WHERE last_requested < ?').bind(
        now - 7 * 86400_000,
      ),
      env.DB.prepare('DELETE FROM price_cache WHERE expires_at < ?').bind(
        now - 7 * 86400_000,
      ),
      env.DB.prepare('DELETE FROM request_buckets WHERE expires_at < ?').bind(
        now,
      ),
      env.DB.prepare('DELETE FROM provider_cooldowns WHERE until_ms < ?').bind(
        now,
      ),
    ]);
    if (!env.STEAMWEBAPI_KEY) return;
    const tracked = await env.DB.prepare(
      'SELECT key,app_id,market_name FROM tracked_items WHERE last_requested>? AND last_refreshed<? ORDER BY last_refreshed LIMIT 8',
    )
      .bind(now - 7 * 86400_000, now - 6 * 3600_000)
      .all<{ key: string; app_id: number; market_name: string }>();
    for (const item of tracked.results) {
      await cachedPrice(
        env,
        item.key,
        () => steamWebMarket(env).price(item.app_id, item.market_name),
        true,
      );
      await env.DB.prepare(
        'UPDATE tracked_items SET last_refreshed=? WHERE key=?',
      )
        .bind(now, item.key)
        .run();
    }
  },
};
