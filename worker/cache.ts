import { priceSchema, quoteSchema, type Price } from '../shared/model';
import type { Env } from './env';
import { deduplicate } from './http';

export async function cachedPrice(
  env: Env,
  key: string,
  fetcher: () => Promise<Price>,
  force = false,
): Promise<Price> {
  return deduplicate(`price:${key}`, async () => {
    const cached = await env.DB.prepare(
      'SELECT payload,expires_at FROM price_cache WHERE key=?',
    )
      .bind(key)
      .first<{ payload: string; expires_at: number }>();
    const old = cached
      ? priceSchema.safeParse(JSON.parse(cached.payload))
      : null;
    if (!force && cached && cached.expires_at > Date.now() && old?.success)
      return old.data;
    try {
      const next = await fetcher();
      if (next.status === 'error') return next;
      const ttl = next.quote ? 6 * 3600_000 : 15 * 60_000;
      const statements = [
        env.DB.prepare(
          'INSERT INTO price_cache(key,payload,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at',
        ).bind(key, JSON.stringify(next), Date.now() + ttl),
      ];
      if (next.quote)
        statements.push(
          env.DB.prepare(
            'INSERT OR IGNORE INTO observations(key,observed_at,payload) VALUES(?,?,?)',
          ).bind(key, next.quote.observedAt, JSON.stringify(next.quote)),
        );
      await env.DB.batch(statements);
      return next;
    } catch {
      if (old?.success && old.data.quote)
        return {
          ...old.data,
          note: 'Refresh failed. Showing cached price; check its observation date.',
        };
      return {
        key,
        status: 'error',
        quote: null,
        note: 'Price unavailable. Retry after the provider limit resets.',
      };
    }
  });
}
export async function priceHistory(env: Env, key: string) {
  const rows = await env.DB.prepare(
    'SELECT payload FROM observations WHERE key=? ORDER BY observed_at DESC LIMIT 1500',
  )
    .bind(key)
    .all<{ payload: string }>();
  const observations = rows.results
    .map((r) => quoteSchema.parse(JSON.parse(r.payload)))
    .reverse();
  return { key, observations, startedAt: observations[0]?.observedAt || null };
}
