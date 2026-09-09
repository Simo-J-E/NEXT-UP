import { describe, expect, it } from 'vitest';
import { normalizeOwned, normalizeStore } from '../worker/providers/steam';
import {
  normalizeInventory,
  mergeInventoryPage,
} from '../worker/providers/inventory';
import { normalizeMarket } from '../worker/providers/market';
import { retryMilliseconds } from '../worker/http';
import { item, rawPage } from './fixtures';
describe('Steam visibility and store prices', () => {
  it('does not classify inaccessible games as an empty library', () => {
    expect(normalizeOwned({ response: {} }).status).toBe('private');
    expect(normalizeOwned({ response: { game_count: 0 } })).toEqual({
      status: 'public',
      games: [],
    });
    expect(normalizeOwned({ response: { game_count: 3 } }).status).toBe(
      'unavailable',
    );
  });
  it('deduplicates owned games and preserves hidden playtime', () => {
    const g = { appid: 620, name: 'Portal 2' };
    expect(
      normalizeOwned({ response: { game_count: 1, games: [g, g] } }).games,
    ).toHaveLength(1);
    expect(
      normalizeOwned({ response: { games: [g] } }).games[0]?.minutes,
    ).toBeNull();
  });
  it('differentiates free, unpriced, wrong-currency, and discounted games', () => {
    expect(
      normalizeStore({ 620: { success: true, data: { is_free: true } } }, 620)
        .status,
    ).toBe('free');
    expect(normalizeStore({ 620: { success: false } }, 620).quote).toBeNull();
    expect(
      normalizeStore(
        {
          620: {
            success: true,
            data: {
              price_overview: { currency: 'USD', initial: 1000, final: 500 },
            },
          },
        },
        620,
      ).quote,
    ).toBeNull();
    expect(
      normalizeStore(
        {
          620: {
            success: true,
            data: {
              price_overview: { currency: 'EUR', initial: 1000, final: 500 },
            },
          },
        },
        620,
      ).quote,
    ).toMatchObject({ minor: 500, regularMinor: 1000, region: 'FI' });
  });
});
describe('inventory pagination and variants', () => {
  it('preserves asset IDs beyond safe JS integer precision and quantity', () => {
    const page = normalizeInventory(
      rawPage('9007199254740993', '9007199254740994'),
      730,
    );
    expect(page.items[0]).toMatchObject({
      assetId: '9007199254740993',
      quantity: 3,
      condition: 'Field-Tested',
    });
    expect(page.cursor).toBe('9007199254740994');
  });
  it('keeps undescribed items and uses class plus instance identity', () => {
    const raw = rawPage('1');
    raw.assets[0]!.instanceid = '2';
    expect(normalizeInventory(raw, 730).items[0]).toMatchObject({
      name: 'Item 1',
      marketHashName: null,
      marketable: false,
    });
  });
  it('merges pages without counting an asset twice and detects stuck cursors', () => {
    const a = normalizeInventory(rawPage('1', '2'), 730);
    const b = normalizeInventory(rawPage('2'), 730);
    expect(mergeInventoryPage(a.items, b, '2')).toHaveLength(2);
    expect(mergeInventoryPage(a.items, a)).toHaveLength(1);
    expect(() => mergeInventoryPage(a.items, a, '2')).toThrow(/repeated/);
  });
  it('reads the documented provider header cursor', () => {
    expect(normalizeInventory(rawPage('1'), 730, '2').cursor).toBe('2');
  });
  it('rejects truncated pages without a cursor and invalid quantities', () => {
    expect(() =>
      normalizeInventory({ ...rawPage('1'), more_items: 1 }, 730),
    ).toThrow(/incomplete/);
    const raw = rawPage('1');
    raw.assets[0]!.amount = '0';
    expect(() => normalizeInventory(raw, 730)).toThrow(/quantity/);
  });
  it('only prices the exact wear and StatTrak variant', () => {
    const rows = [
      {
        markethashname: 'StatTrak™ AK-47 | Redline (Field-Tested)',
        pricelatest: 95.5,
      },
      { markethashname: item.marketHashName, pricelatest: 24.99 },
    ];
    expect(normalizeMarket(rows, 730, item.marketHashName!).quote?.minor).toBe(
      2499,
    );
    expect(
      normalizeMarket(rows, 730, 'AK-47 | Redline (Minimal Wear)').quote,
    ).toBeNull();
  });
  it('never presents an absent or zero listing as a free item', () => {
    expect(
      normalizeMarket([{ markethashname: 'x', pricelatest: 0 }], 730, 'x')
        .status,
    ).toBe('unknown');
  });
  it('respects numeric and HTTP-date Retry-After values', () => {
    expect(retryMilliseconds('60')).toBe(60000);
    expect(
      retryMilliseconds(
        'Wed, 09 Sep 2026 10:00:00 GMT',
        Date.parse('2026-09-09T09:59:00Z'),
      ),
    ).toBe(60000);
  });
});
