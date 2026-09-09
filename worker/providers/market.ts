import { z } from 'zod';
import { decimalToMinor } from '../../shared/core';
import { INVENTORIES, marketKey, type Price } from '../../shared/model';
import type { Env } from '../env';
import { ApiError, jsonData, upstream } from '../http';

const rowsSchema = z.array(
  z.object({
    markethashname: z.string(),
    pricelatest: z.union([z.number(), z.string()]).nullable().optional(),
    priceupdatedat: z.string().nullable().optional(),
  }),
);
export interface MarketProvider {
  price(appId: number, marketHashName: string): Promise<Price>;
}
export function normalizeMarket(
  raw: unknown,
  appId: number,
  name: string,
): Price {
  const rows = rowsSchema.parse(raw);
  // Exact market-hash matching keeps wear, StatTrak and Souvenir separate.
  const row = rows.find((r) => r.markethashname === name);
  const value = decimalToMinor(row?.pricelatest);
  const key = marketKey(appId, name);
  // A zero listing is unavailable, unlike an explicitly free store game.
  if (value === null || value === 0)
    return { key, status: 'unknown', quote: null };
  const now = new Date().toISOString();
  const updated =
    row?.priceupdatedat && Number.isFinite(Date.parse(row.priceupdatedat))
      ? new Date(row.priceupdatedat).toISOString()
      : null;
  return {
    key,
    status: 'priced',
    quote: {
      minor: value,
      regularMinor: null,
      currency: 'EUR',
      region: 'global',
      source: 'steamwebapi',
      basis: 'steam-lowest-listing',
      observedAt: now,
      fetchedAt: now,
      providerUpdatedAt: updated,
    },
  };
}
export function steamWebMarket(env: Env): MarketProvider {
  return {
    async price(appId, name) {
      const key = marketKey(appId, name);
      if (!env.STEAMWEBAPI_KEY)
        return {
          key,
          status: 'unknown',
          quote: null,
          note: 'Inventory pricing is not configured.',
        };
      const game = INVENTORIES.find((g) => g.appId === appId);
      if (!game || appId === 753)
        return {
          key,
          status: 'unknown',
          quote: null,
          note: 'This provider does not document community-item prices. The item is still included.',
        };
      const url = new URL('https://www.steamwebapi.com/steam/api/items');
      url.search = new URLSearchParams({
        game: game.providerGame,
        search: name,
        max: '100',
        page: '1',
        currency: 'EUR',
        production: '1',
        select: 'markethashname,pricelatest,priceupdatedat',
      }).toString();
      const response = await upstream(env, url, {
        'X-Api-Key': env.STEAMWEBAPI_KEY,
      });
      if (response.status === 401 || response.status === 403)
        throw new ApiError(
          503,
          'configuration',
          'The pricing provider needs an API key with access to item prices.',
        );
      return normalizeMarket(await jsonData(response), appId, name);
    },
  };
}
