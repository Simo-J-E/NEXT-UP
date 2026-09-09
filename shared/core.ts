import {
  type Filters,
  type Game,
  type Price,
  type Quote,
  type Snapshot,
} from './model';

// getRandomValues also works on local HTTP previews where randomUUID is absent.
export function uniqueId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseProfile(input: string): {
  type: 'id' | 'vanity';
  value: string;
} {
  const value = input.trim();
  if (/^7656119\d{10}$/.test(value)) return { type: 'id', value };
  let url: URL;
  try {
    url = new URL(
      value.startsWith('steamcommunity.com/') ? `https://${value}` : value,
    );
  } catch {
    throw new Error('Paste a Steam profile link or a 17-digit SteamID64.');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'steamcommunity.com' ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error('Use a profile link from https://steamcommunity.com.');
  const match = /^\/(id|profiles)\/([^/]+)\/?$/.exec(url.pathname);
  if (!match?.[1] || !match[2])
    throw new Error('Use a Steam /id/name or /profiles/SteamID64 link.');
  if (match[1] === 'profiles' && /^7656119\d{10}$/.test(match[2]))
    return { type: 'id', value: match[2] };
  if (match[1] === 'id' && /^[a-zA-Z0-9_-]{2,64}$/.test(match[2]))
    return { type: 'vanity', value: match[2] };
  throw new Error('That Steam profile address is not valid.');
}
export function eligibleGames(
  games: Game[],
  filters: Filters,
  favorites: string[],
  excluded: string[],
  used: string[],
) {
  const fav = new Set(favorites),
    exc = new Set(excluded),
    seen = new Set(used);
  return [...new Map(games.map((g) => [g.id, g])).values()].filter(
    (g) =>
      !exc.has(g.id) &&
      (!filters.unplayed || g.minutes === 0) &&
      (!filters.favoritesOnly || fav.has(g.id)) &&
      (!filters.noRepeat || !seen.has(g.id)) &&
      (!filters.platform || g.platform === filters.platform) &&
      (!filters.tag || g.tags.includes(filters.tag)),
  );
}
// Rejection sampling avoids the modulo bias of a raw uint32 % n.
export function randomIndex(
  length: number,
  getWord = () => crypto.getRandomValues(new Uint32Array(1))[0]!,
) {
  if (!Number.isInteger(length) || length < 1 || length > 0x100000000)
    throw new Error('No eligible games.');
  const limit = Math.floor(0x100000000 / length) * length;
  let word: number;
  do {
    word = getWord();
  } while (word >= limit);
  return word % length;
}
export const normalAngle = (angle: number) => ((angle % 360) + 360) % 360;
export function landingRotation(
  current: number,
  index: number,
  length: number,
) {
  return (
    current + 360 * 5 + normalAngle(-(((index + 0.5) * 360) / length) - current)
  );
}
export function landedIndex(rotation: number, length: number) {
  return Math.min(
    length - 1,
    Math.floor(normalAngle(-rotation) / (360 / length)),
  );
}
export function wheelPreview(games: Game[], winner?: Game) {
  if (games.length <= 12) return games;
  const selected = Array.from(
    { length: 12 },
    (_, i) => games[Math.floor((i * games.length) / 12)]!,
  );
  if (winner && !selected.some((g) => g.id === winner.id))
    selected[games.findIndex((g) => g.id === winner.id) % 12] = winner;
  return selected;
}
export function decimalToMinor(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole = '0', fraction = ''] = s.split('.');
  const units =
    BigInt(whole) * 100n +
    BigInt((fraction + '00').slice(0, 2)) +
    (Number(fraction[2] || 0) >= 5 ? 1n : 0n);
  return units <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(units) : null;
}
export function safeProduct(minor: number, quantity: number) {
  const n = minor * quantity;
  if (!Number.isSafeInteger(n))
    throw new Error('Value is outside the supported money range.');
  return n;
}
export function sumPrices(
  rows: { price?: Price; quantity: number }[],
  regular = false,
) {
  let total = 0,
    priced = 0,
    unknown = 0;
  for (const { price, quantity } of rows) {
    const value = regular ? price?.quote?.regularMinor : price?.quote?.minor;
    if (value == null) {
      unknown += quantity;
      continue;
    }
    total += safeProduct(value, quantity);
    priced += quantity;
    if (!Number.isSafeInteger(total))
      throw new Error('Total is outside the supported money range.');
  }
  return { total: priced ? total : null, priced, unknown };
}
export const money = (minor: number | null | undefined) =>
  minor == null
    ? 'Unknown'
    : new Intl.NumberFormat('fi-FI', {
        style: 'currency',
        currency: 'EUR',
      }).format(minor / 100);
export const hours = (minutes: number | null) =>
  minutes === null
    ? 'Playtime hidden'
    : minutes === 0
      ? 'Unplayed'
      : `${new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 }).format(minutes / 60)} h played`;
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('fi-FI', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
export const isStale = (quote: Quote, now = Date.now()) =>
  now - Date.parse(quote.providerUpdatedAt || quote.observedAt) > 24 * 3600_000;
export function comparable(a: Quote, b: Quote) {
  return (
    a.currency === b.currency &&
    a.source === b.source &&
    a.basis === b.basis &&
    a.region === b.region
  );
}
export function priceChange(observations: Quote[]) {
  const sorted = [...observations].sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt),
  );
  const last = sorted.at(-1);
  const first =
    last &&
    sorted.find((q) => q.observedAt !== last.observedAt && comparable(q, last));
  return first && last
    ? {
        minor: last.minor - first.minor,
        percent: first.minor
          ? ((last.minor - first.minor) / first.minor) * 100
          : null,
        from: first.observedAt,
        to: last.observedAt,
      }
    : null;
}
// Price effect uses the overlapping quantity. Composition uses added/removed quantity.
// Unknown or incomparable quotes are excluded explicitly via the unresolved count.
export function snapshotChange(before: Snapshot, after: Snapshot) {
  if (
    before.owner !== after.owner ||
    before.appId !== after.appId ||
    !before.complete ||
    !after.complete
  )
    return null;
  const aggregate = (s: Snapshot) => {
    const map = new Map<string, { quantity: number; quote: Quote | null }>();
    for (const h of s.holdings) {
      const old = map.get(h.key);
      map.set(h.key, {
        quantity: h.quantity + (old?.quantity || 0),
        quote: h.quote,
      });
    }
    return map;
  };
  const a = aggregate(before),
    b = aggregate(after);
  let priceEffect = 0,
    compositionEffect = 0,
    unresolved = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(key),
      y = b.get(key);
    if (
      (x && !x.quote) ||
      (y && !y.quote) ||
      (x?.quote && y?.quote && !comparable(x.quote, y.quote))
    ) {
      unresolved++;
      continue;
    }
    const oldQty = x?.quantity || 0,
      newQty = y?.quantity || 0;
    const overlap = Math.min(oldQty, newQty);
    priceEffect += overlap * ((y?.quote?.minor || 0) - (x?.quote?.minor || 0));
    compositionEffect +=
      Math.max(0, newQty - oldQty) * (y?.quote?.minor || 0) -
      Math.max(0, oldQty - newQty) * (x?.quote?.minor || 0);
  }
  return {
    priceEffect,
    compositionEffect,
    unresolved,
    from: before.at,
    to: after.at,
  };
}
