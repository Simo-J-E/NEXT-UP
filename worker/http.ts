import type { Env } from './env';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
const hosts = new Set([
  'api.steampowered.com',
  'store.steampowered.com',
  'www.steamwebapi.com',
]);
export async function bucket(
  env: Env,
  key: string,
  window: number,
  limit: number,
) {
  const now = Date.now(),
    slot = Math.floor(now / window);
  const row = await env.DB.prepare(
    'INSERT INTO request_buckets (key,bucket,hits,expires_at) VALUES (?,?,1,?) ON CONFLICT(key,bucket) DO UPDATE SET hits=hits+1 RETURNING hits',
  )
    .bind(key, slot, (slot + 2) * window)
    .first<{ hits: number }>();
  if (!row || row.hits > limit)
    throw new ApiError(
      429,
      'rate-limit',
      'Too many requests. Please try again shortly.',
      Math.ceil(((slot + 1) * window - now) / 1000),
    );
}
export async function clientLimit(request: Request, env: Env) {
  if (!env.RATE_LIMIT_SALT)
    throw new ApiError(
      503,
      'configuration',
      'The live service is not configured yet. Custom games are ready to use.',
    );
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      `${env.RATE_LIMIT_SALT}:${Math.floor(Date.now() / 86400_000)}:${ip}`,
    ),
  );
  const hash = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  await bucket(env, `client:${hash}`, 60_000, 60);
}
export function retryMilliseconds(header: string | null, now = Date.now()) {
  if (!header) return 1000;
  const seconds = Number(header);
  return Math.max(
    0,
    Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(header) - now || 1000,
  );
}
export async function upstream(
  env: Env,
  url: URL,
  headers?: HeadersInit,
): Promise<Response> {
  if (
    !hosts.has(url.hostname) ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port
  )
    throw new ApiError(400, 'host', 'Unsupported data source.');
  const cooldown = await env.DB.prepare(
    'SELECT until_ms FROM provider_cooldowns WHERE host=?',
  )
    .bind(url.hostname)
    .first<{ until_ms: number }>();
  if (cooldown && cooldown.until_ms > Date.now())
    throw new ApiError(
      429,
      'upstream-limit',
      'The data provider is cooling down. Try again later.',
      Math.ceil((cooldown.until_ms - Date.now()) / 1000),
    );
  for (let attempt = 0; attempt < 2; attempt++) {
    await bucket(
      env,
      `upstream:${url.hostname}`,
      60_000,
      Math.max(1, Math.min(100, Number(env.UPSTREAM_PER_MINUTE) || 16)),
    );
    await bucket(
      env,
      `upstream-day:${url.hostname}`,
      86400_000,
      Math.max(1, Math.min(90000, Number(env.UPSTREAM_PER_DAY) || 300)),
    );
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      if (attempt === 0) continue;
      throw new ApiError(
        502,
        'provider-unavailable',
        'The data provider is not responding. Try again later.',
      );
    }
    if (
      response.status === 429 ||
      (response.status === 503 && response.headers.has('Retry-After'))
    ) {
      const delay = Math.max(
        1000,
        retryMilliseconds(response.headers.get('Retry-After')),
      );
      await env.DB.prepare(
        'INSERT INTO provider_cooldowns(host,until_ms) VALUES(?,?) ON CONFLICT(host) DO UPDATE SET until_ms=MAX(until_ms,excluded.until_ms)',
      )
        .bind(url.hostname, Date.now() + delay)
        .run();
      throw new ApiError(
        429,
        'provider-limit',
        'The data provider has paused requests. Cached results remain available.',
        Math.ceil(delay / 1000),
      );
    }
    if (response.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    return response;
  }
  throw new ApiError(
    502,
    'provider-unavailable',
    'The data provider is not responding.',
  );
}
export async function jsonData(response: Response): Promise<unknown> {
  if (!response.ok)
    throw new ApiError(
      502,
      'provider-error',
      'The data provider could not complete this request.',
    );
  const text = await response.text();
  if (text.length > 25_000_000)
    throw new ApiError(
      502,
      'provider-format',
      'The provider response is too large.',
    );
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      502,
      'provider-format',
      'The provider returned an unreadable response.',
    );
  }
}
const inflight = new Map<string, Promise<unknown>>();
export function deduplicate<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const found = inflight.get(key);
  if (found) return found as Promise<T>;
  const promise = task().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
