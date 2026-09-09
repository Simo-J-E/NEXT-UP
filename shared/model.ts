import { z } from 'zod';

const minor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const dateSchema = z.string().datetime();
export const imageSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password;
    } catch {
      return false;
    }
  }, 'Use an HTTPS image URL.');
export const gameSchema = z.object({
  id: z.string().min(1).max(100),
  appId: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(160),
  platform: z.string().trim().min(1).max(50),
  image: imageSchema.default(''),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
  minutes: minor.nullable(),
  kind: z.enum(['steam', 'custom', 'demo']),
});
export type Game = z.infer<typeof gameSchema>;
export const quoteSchema = z.object({
  minor,
  regularMinor: minor.nullable(),
  currency: z.literal('EUR'),
  region: z.enum(['FI', 'global']),
  source: z.enum(['steam-store', 'steamwebapi', 'demo']),
  basis: z.enum(['store-current', 'steam-lowest-listing']),
  observedAt: dateSchema,
  providerUpdatedAt: dateSchema.nullable(),
  fetchedAt: dateSchema,
});
export type Quote = z.infer<typeof quoteSchema>;
export const priceSchema = z.object({
  key: z.string().max(512),
  status: z.enum(['priced', 'free', 'unknown', 'error']),
  quote: quoteSchema.nullable(),
  note: z.string().max(500).optional(),
  image: imageSchema.optional(),
});
export type Price = z.infer<typeof priceSchema>;
export const itemSchema = z.object({
  id: z.string().max(120),
  assetId: z.string().regex(/^\d+$/),
  appId: z.number().int().positive(),
  contextId: z.string().regex(/^\d+$/),
  classId: z.string(),
  instanceId: z.string(),
  name: z.string().max(256),
  marketHashName: z.string().max(256).nullable(),
  image: imageSchema,
  quantity: z.number().int().positive().max(1_000_000),
  category: z.string().max(200),
  condition: z.string().max(100).nullable(),
  rarity: z.string().max(100).nullable(),
  marketable: z.boolean(),
});
export type Item = z.infer<typeof itemSchema>;
export const profileSchema = z.object({
  steamId: z.string().regex(/^7656119\d{10}$/),
  name: z.string().max(160),
  avatar: imageSchema,
  visibility: z.enum(['public', 'private', 'unavailable']),
});
export const librarySchema = z.object({
  profile: profileSchema,
  status: z.enum(['public', 'private', 'unavailable']),
  games: z.array(gameSchema).max(30000),
  fetchedAt: dateSchema,
  message: z.string().max(500).optional(),
});
export type Library = z.infer<typeof librarySchema>;
export const inventorySchema = z.object({
  steamId: z.string(),
  appId: z.number().int(),
  status: z.enum(['complete', 'partial', 'private', 'unavailable']),
  items: z.array(itemSchema).max(100000),
  fetchedAt: dateSchema,
  cursor: z.string().max(100).nullable(),
  message: z.string().max(500).optional(),
});
export type Inventory = z.infer<typeof inventorySchema>;
export const filtersSchema = z.object({
  unplayed: z.boolean(),
  favoritesOnly: z.boolean(),
  noRepeat: z.boolean(),
  instant: z.boolean(),
  platform: z.string().max(50),
  tag: z.string().max(32),
});
export type Filters = z.infer<typeof filtersSchema>;
export const rollSchema = z.object({
  id: z.string(),
  game: gameSchema,
  at: dateSchema,
  poolSize: z.number().int().positive(),
});
export type Roll = z.infer<typeof rollSchema>;
export const snapshotSchema = z.object({
  at: dateSchema,
  owner: z.string(),
  appId: z.number().int(),
  complete: z.boolean(),
  holdings: z
    .array(
      z.object({
        id: z.string(),
        key: z.string(),
        quantity: minor,
        quote: quoteSchema.nullable(),
      }),
    )
    .max(100000),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
const baseStateSchema = z.object({
  version: z.literal(1),
  mode: z.enum(['live', 'demo']),
  customGames: z.array(gameSchema.refine((g) => g.kind === 'custom')).max(2000),
  library: librarySchema.nullable(),
  inventories: z.record(z.string(), inventorySchema),
  favorites: z.array(z.string()).max(50000),
  excluded: z.array(z.string()).max(50000),
  used: z.array(z.string()).max(50000),
  filters: filtersSchema,
  rolls: z.array(rollSchema).max(1000),
  prices: z.record(z.string(), priceSchema),
  snapshots: z.array(snapshotSchema).max(365),
});
export const stateSchema = baseStateSchema.extend({
  liveBackup: baseStateSchema.nullable().default(null),
});
export type State = z.infer<typeof stateSchema>;
export const emptyState = (): State => ({
  version: 1,
  mode: 'live',
  customGames: [],
  library: null,
  inventories: {},
  favorites: [],
  excluded: [],
  used: [],
  rolls: [],
  prices: {},
  snapshots: [],
  liveBackup: null,
  filters: {
    unplayed: false,
    favoritesOnly: false,
    noRepeat: true,
    instant: false,
    platform: '',
    tag: '',
  },
});
export const INVENTORIES = [
  {
    appId: 730,
    contextId: '2',
    name: 'Counter-Strike 2',
    short: 'CS2',
    providerGame: 'cs2',
  },
  {
    appId: 570,
    contextId: '2',
    name: 'Dota 2',
    short: 'Dota 2',
    providerGame: 'dota',
  },
  {
    appId: 440,
    contextId: '2',
    name: 'Team Fortress 2',
    short: 'TF2',
    providerGame: 'tf2',
  },
  {
    appId: 753,
    contextId: '6',
    name: 'Steam Community',
    short: 'Steam',
    providerGame: 'steam',
  },
  {
    appId: 252490,
    contextId: '2',
    name: 'Rust',
    short: 'Rust',
    providerGame: 'rust',
  },
] as const;
export const marketKey = (appId: number, name: string) =>
  `market:${appId}:${name}`;
export const storeKey = (appId: number) => `store:${appId}`;
export const marketLink = (item: Item) =>
  item.marketHashName
    ? `https://steamcommunity.com/market/listings/${item.appId}/${encodeURIComponent(item.marketHashName)}`
    : null;
export const historySchema = z.object({
  key: z.string(),
  observations: z.array(quoteSchema),
  startedAt: dateSchema.nullable(),
});
