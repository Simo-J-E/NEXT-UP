import artwork from './artwork.json';
import {
  emptyState,
  marketKey,
  storeKey,
  type Item,
  type Price,
  type State,
} from '../shared/model';
export function demoState(previous: State): State {
  const now = new Date().toISOString();
  const { liveBackup, ...realData } = previous;
  const minutes = [0, 1860, 7260, 540, 0, 2100, 0, 0];
  const tags = [
    ['Metroidvania'],
    ['Roguelike'],
    ['Relaxed'],
    ['Puzzle'],
    ['Platformer'],
    ['Sandbox'],
    ['Co-op'],
    ['Exploration'],
  ];
  const store = [1479, 2449, 1399, 975, 1950, 975, 2999, 5899];
  const games = artwork.map((g, i) => ({
    id: `demo:${g.appId}`,
    appId: g.appId,
    name: g.name,
    image: g.headerUrl,
    platform: 'Steam',
    tags: tags[i]!,
    minutes: minutes[i]!,
    kind: 'demo' as const,
  }));
  const prices: Record<string, Price> = {};
  games.forEach((g, i) => {
    const key = storeKey(g.appId);
    prices[key] = {
      key,
      status: 'priced',
      quote: {
        minor: store[i]!,
        regularMinor: store[i]!,
        currency: 'EUR',
        region: 'FI',
        source: 'demo',
        basis: 'store-current',
        observedAt: now,
        fetchedAt: now,
        providerUpdatedAt: null,
      },
    };
  });
  const names = [
    'AK-47 | Redline (Field-Tested)',
    'AK-47 | Redline (Minimal Wear)',
    'Kilowatt Case',
    'Operation Breakout Weapon Case',
    'Service Medal',
  ];
  const amounts = [1, 1, 12, 4, 1];
  const values = [2845, 9170, 52, 786, null];
  const items: Item[] = names.map((name, i) => ({
    id: `730:2:${i + 1}`,
    assetId: String(i + 1),
    contextId: '2',
    appId: 730,
    classId: String(i + 1),
    instanceId: '0',
    name,
    marketHashName: i < 4 ? name : null,
    image: '',
    quantity: amounts[i]!,
    category: i < 2 ? 'Rifle' : i < 4 ? 'Container' : 'Collectible',
    condition: i === 0 ? 'Field-Tested' : i === 1 ? 'Minimal Wear' : null,
    rarity: i < 2 ? 'Classified' : null,
    marketable: i < 4,
  }));
  items.forEach((item, i) => {
    const key = marketKey(730, item.marketHashName || item.id);
    prices[key] = {
      key,
      status: values[i] === null ? 'unknown' : 'priced',
      quote:
        values[i] === null
          ? null
          : {
              minor: values[i]!,
              regularMinor: null,
              currency: 'EUR',
              region: 'global',
              source: 'demo',
              basis: 'steam-lowest-listing',
              observedAt: now,
              fetchedAt: now,
              providerUpdatedAt: null,
            },
    };
  });
  return {
    ...emptyState(),
    customGames: previous.customGames,
    liveBackup: previous.mode === 'live' ? realData : liveBackup,
    mode: 'demo',
    library: {
      profile: {
        steamId: '76561198000000000',
        name: 'Demo library',
        avatar: '',
        visibility: 'public',
      },
      games,
      status: 'public',
      fetchedAt: now,
    },
    prices,
    inventories: {
      730: {
        steamId: 'demo',
        appId: 730,
        items,
        status: 'complete',
        fetchedAt: now,
        cursor: null,
      },
    },
  };
}
