import { describe, expect, it } from 'vitest';
import {
  decimalToMinor,
  eligibleGames,
  landedIndex,
  landingRotation,
  parseProfile,
  priceChange,
  randomIndex,
  snapshotChange,
  sumPrices,
  wheelPreview,
} from '../shared/core';
import { type Snapshot } from '../shared/model';
import { filters, game, quote } from './fixtures';

describe('profile identity', () => {
  it.each([
    '76561198000000000',
    'https://steamcommunity.com/profiles/76561198000000000/',
    'steamcommunity.com/profiles/76561198000000000?x=1',
  ])('keeps SteamID64 as a string: %s', (input) => {
    expect(parseProfile(input)).toEqual({
      type: 'id',
      value: '76561198000000000',
    });
  });
  it('resolves vanity profile paths', () => {
    expect(parseProfile('https://steamcommunity.com/id/example-name/')).toEqual(
      { type: 'vanity', value: 'example-name' },
    );
  });
  it.each([
    'https://steamcommunity.com.evil.invalid/id/a',
    'https://steamcommunity.com@evil.invalid/id/a',
    'http://steamcommunity.com/id/test',
    'https://steamcommunity.com:81/id/test',
    '765611980000000001',
    'https://steamcommunity.com/id/../admin',
  ])('rejects invalid or deceptive input: %s', (input) =>
    expect(() => parseProfile(input)).toThrow(),
  );
});
describe('unbiased selection and the displayed result', () => {
  it('rejects overflowing random words instead of modulo bias', () => {
    const words = [0xffffffff, 7];
    expect(randomIndex(3, () => words.shift()!)).toBe(1);
  });
  it('handles empty and single pools', () => {
    expect(() => randomIndex(0)).toThrow();
    expect(randomIndex(1)).toBe(0);
  });
  it('lands on the selected slice for every slice over repeated rotations', () => {
    let angle = 0;
    for (let n = 1; n <= 12; n++)
      for (let index = 0; index < n; index++) {
        angle = landingRotation(angle, index, n);
        expect(landedIndex(angle, n)).toBe(index);
      }
  });
  it('all 10,000 games can win, while visual previews include the winner', () => {
    const games = Array.from({ length: 10000 }, (_, i) => game(String(i)));
    const pool = eligibleGames(games, filters, [], [], []);
    expect(pool).toHaveLength(10000);
    const selected = pool[randomIndex(pool.length, () => 9999)]!;
    expect(selected.id).toBe('9999');
    expect(wheelPreview(pool, selected)).toHaveLength(12);
    expect(wheelPreview(pool, selected)).toContain(selected);
  });
  it('combines favorites, exclusions, unknown playtime and no-repeat fairly', () => {
    const games = [
      game('a'),
      game('b', 30),
      game('c', null),
      game('d'),
      game('e'),
    ];
    expect(
      eligibleGames(
        games,
        { ...filters, unplayed: true, favoritesOnly: true },
        ['a', 'd', 'e'],
        ['d'],
        ['a'],
      ),
    ).toEqual([game('e')]);
  });
});
describe('money and comparisons', () => {
  it('uses decimal rounding into integer cents', () => {
    expect(decimalToMinor('1.005')).toBe(101);
    expect(decimalToMinor(19.99)).toBe(1999);
    expect(decimalToMinor('0.29')).toBe(29);
    expect(decimalToMinor(null)).toBeNull();
    expect(decimalToMinor('NaN')).toBeNull();
  });
  it('unknown items remain unknown and stack quantities are counted', () => {
    const priced = { key: 'a', status: 'priced' as const, quote: quote(1234) };
    expect(
      sumPrices([{ price: priced, quantity: 3 }, { quantity: 7 }]),
    ).toEqual({ total: 3702, priced: 3, unknown: 7 });
    expect(sumPrices([{ quantity: 5 }]).total).toBeNull();
  });
  it('a known free item counts toward pricing coverage', () => {
    expect(
      sumPrices([
        {
          price: {
            key: 'free',
            status: 'free',
            quote: { ...quote(0), regularMinor: 0 },
          },
          quantity: 1,
        },
      ]),
    ).toEqual({ total: 0, priced: 1, unknown: 0 });
  });
  it('rejects integer overflow instead of rounding totals', () => {
    expect(() =>
      sumPrices([
        {
          price: {
            key: 'x',
            status: 'priced',
            quote: quote(Number.MAX_SAFE_INTEGER),
          },
          quantity: 2,
        },
      ]),
    ).toThrow();
  });
  it('does not compare prices across source, currency basis, or region', () => {
    expect(
      priceChange([
        quote(100),
        { ...quote(200, '2026-09-02T12:00:00.000Z'), region: 'FI' },
      ]),
    ).toBeNull();
    expect(
      priceChange([quote(100), quote(120, '2026-09-02T12:00:00.000Z')])
        ?.percent,
    ).toBe(20);
  });
  it('separates market movement from quantity changes without claiming profit', () => {
    const before: Snapshot = {
      owner: 'one',
      appId: 730,
      at: quote().observedAt,
      complete: true,
      holdings: [{ id: 'old', key: 'case', quantity: 3, quote: quote(100) }],
    };
    const after: Snapshot = {
      ...before,
      at: '2026-09-02T12:00:00.000Z',
      holdings: [{ id: 'new', key: 'case', quantity: 5, quote: quote(150) }],
    };
    expect(snapshotChange(before, after)).toMatchObject({
      priceEffect: 150,
      compositionEffect: 300,
      unresolved: 0,
    });
    expect(snapshotChange(before, { ...after, complete: false })).toBeNull();
    expect(
      snapshotChange(before, { ...after, owner: 'someone-else' }),
    ).toBeNull();
  });
});
