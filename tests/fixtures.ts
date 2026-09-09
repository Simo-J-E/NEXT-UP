import { emptyState, type Game, type Item, type Quote } from '../shared/model';
export const game = (id: string, minutes: number | null = 0): Game => ({
  id,
  name: id,
  platform: 'Steam',
  image: '',
  tags: ['Co-op'],
  minutes,
  kind: 'steam',
  appId: Number(id.replace(/\D/g, '')) || 620,
});
export const quote = (
  minor = 1000,
  at = '2026-09-01T12:00:00.000Z',
): Quote => ({
  minor,
  regularMinor: null,
  currency: 'EUR',
  region: 'global',
  source: 'steamwebapi',
  basis: 'steam-lowest-listing',
  observedAt: at,
  fetchedAt: at,
  providerUpdatedAt: at,
});
export const filters = emptyState().filters;
export const item: Item = {
  id: '730:2:9007199254740993',
  assetId: '9007199254740993',
  appId: 730,
  contextId: '2',
  classId: '100',
  instanceId: '0',
  name: 'AK-47 | Redline (Field-Tested)',
  marketHashName: 'AK-47 | Redline (Field-Tested)',
  image: '',
  quantity: 3,
  category: 'Rifle',
  condition: 'Field-Tested',
  rarity: 'Classified',
  marketable: true,
};
export const rawPage = (assetId: string, next?: string) => ({
  success: 1,
  assets: [
    {
      appid: 730,
      contextid: '2',
      assetid: assetId,
      classid: '100',
      instanceid: '0',
      amount: '3',
    },
  ],
  descriptions: [
    {
      appid: 730,
      classid: '100',
      instanceid: '0',
      name: item.name,
      market_hash_name: item.marketHashName,
      marketable: 1,
      tags: [{ category: 'Exterior', localized_tag_name: 'Field-Tested' }],
    },
  ],
  more_items: next ? 1 : 0,
  ...(next ? { last_assetid: next } : {}),
});
