import { z } from 'zod';
import {
  historySchema,
  inventorySchema,
  librarySchema,
  priceSchema,
} from '../shared/model';
export class ClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
const base = (import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '' : null)) as string | null;
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (base === null)
    throw new ClientError(
      'Live Steam data is not connected yet. Use custom games or open the demo.',
      'configuration',
    );
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/api/${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers:
        data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(55000)])
        : AbortSignal.timeout(55000),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const result = z
        .object({ error: z.object({ message: z.string(), code: z.string() }) })
        .safeParse(body);
      throw new ClientError(
        result.success
          ? result.data.error.message
          : 'The service is unavailable.',
        result.success ? result.data.error.code : 'unavailable',
        Number(response.headers.get('Retry-After')) || 0,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new ClientError(
        'The data format changed. Your saved data has been kept.',
        'format',
      );
    return parsed.data;
  } catch (error) {
    if (error instanceof ClientError || signal?.aborted) throw error;
    throw new ClientError(
      'Could not reach the Steam service. Check your connection and try again.',
      'network',
    );
  }
}
const healthSchema = z.object({
  steam: z.boolean(),
  inventory: z.boolean(),
  store: z.boolean(),
  configured: z.boolean(),
  privacy: z.object({
    contact: z.string(),
    controller: z.string(),
    countries: z.string(),
  }),
});
export type Health = z.infer<typeof healthSchema>;
export const api = {
  health: () => request('health', healthSchema),
  profile: (profile: string) => request('profile', librarySchema, { profile }),
  inventory: (
    steamId: string,
    appId: number,
    cursor?: string,
    signal?: AbortSignal,
  ) =>
    request('inventory', inventorySchema, { steamId, appId, cursor }, signal),
  store: (appIds: number[], signal?: AbortSignal) =>
    request(
      'store/prices',
      z.object({ prices: z.array(priceSchema) }),
      { appIds },
      signal,
    ),
  market: (items: { appId: number; name: string }[], signal?: AbortSignal) =>
    request(
      'market/prices',
      z.object({ prices: z.array(priceSchema) }),
      { items },
      signal,
    ),
  history: (key: string) => request('history', historySchema, { key }),
};
