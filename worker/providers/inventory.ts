import { z } from 'zod';
import { INVENTORIES, type Inventory, type Item } from '../../shared/model';
import type { Env } from '../env';
import { ApiError, jsonData, upstream } from '../http';

const digits = z.string().regex(/^\d+$/);
const pageSchema = z.object({
  success: z.union([z.literal(1), z.literal(true)]).optional(),
  assets: z
    .array(
      z.object({
        appid: z.number().int(),
        contextid: digits,
        assetid: digits,
        classid: digits,
        instanceid: digits,
        amount: digits,
      }),
    )
    .default([]),
  descriptions: z
    .array(
      z.object({
        appid: z.number().int(),
        classid: digits,
        instanceid: digits,
        name: z.string().max(256),
        market_hash_name: z.string().max(256).optional(),
        icon_url: z.string().optional(),
        type: z.string().optional(),
        marketable: z.number().optional(),
        tags: z
          .array(
            z.object({
              category: z.string(),
              localized_tag_name: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .default([]),
  more_items: z.union([z.number(), z.boolean()]).optional(),
  last_assetid: digits.optional(),
  total_inventory_count: z.number().int().optional(),
});
export type InventoryPage = { items: Item[]; cursor: string | null };
export interface InventoryProvider {
  page(steamId: string, appId: number, cursor?: string): Promise<InventoryPage>;
}
export function normalizeInventory(
  raw: unknown,
  appId: number,
  headerCursor?: string | null,
): InventoryPage {
  const result = pageSchema.safeParse(raw);
  if (!result.success)
    throw new ApiError(
      502,
      'provider-format',
      'Inventory format changed. No items were discarded.',
    );
  const page = result.data;
  if (!page.success && !(raw && typeof raw === 'object' && 'assets' in raw))
    throw new ApiError(
      502,
      'inventory-unavailable',
      'The inventory could not be read.',
    );
  const meta = new Map(
    page.descriptions.map((d) => [
      `${d.appid}:${d.classid}:${d.instanceid}`,
      d,
    ]),
  );
  const items = page.assets.map((asset) => {
    if (asset.appid !== appId)
      throw new ApiError(
        502,
        'inventory-identity',
        'The provider returned an inventory for another game.',
      );
    const description = meta.get(
      `${appId}:${asset.classid}:${asset.instanceid}`,
    );
    const tag = (category: string) =>
      description?.tags?.find((t) => t.category.toLowerCase() === category)
        ?.localized_tag_name || null;
    const quantity = Number(asset.amount);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000)
      throw new ApiError(
        502,
        'inventory-quantity',
        'The provider returned an invalid item quantity.',
      );
    return {
      id: `${appId}:${asset.contextid}:${asset.assetid}`,
      assetId: asset.assetid,
      appId,
      contextId: asset.contextid,
      classId: asset.classid,
      instanceId: asset.instanceid,
      name: description?.name || `Item ${asset.assetid}`,
      marketHashName: description?.market_hash_name || null,
      image: description?.icon_url
        ? `https://community.cloudflare.steamstatic.com/economy/image/${description.icon_url}`
        : '',
      quantity,
      category: tag('type') || description?.type || 'Unclassified',
      condition: tag('exterior'),
      rarity: tag('rarity'),
      marketable: description?.marketable === 1,
    };
  });
  const cursor =
    headerCursor || (page.more_items ? page.last_assetid : null) || null;
  if (cursor && !/^\d{1,30}$/.test(cursor))
    throw new ApiError(
      502,
      'inventory-cursor',
      'The provider returned an invalid continuation cursor.',
    );
  if (page.more_items && !cursor)
    throw new ApiError(
      502,
      'inventory-incomplete',
      'The inventory is incomplete and the provider did not supply its next page.',
    );
  return { items, cursor };
}
export function steamWebInventory(env: Env): InventoryProvider {
  return {
    async page(steamId, appId, cursor) {
      if (!env.STEAMWEBAPI_KEY)
        throw new ApiError(
          503,
          'configuration',
          'Inventory loading is not configured yet. Your games and wheel remain available.',
        );
      const game = INVENTORIES.find((g) => g.appId === appId);
      if (!game)
        throw new ApiError(
          400,
          'inventory-game',
          'This inventory is not supported.',
        );
      const url = new URL('https://www.steamwebapi.com/steam/api/inventory');
      url.search = new URLSearchParams({
        steam_id: steamId,
        game: game.providerGame,
        parse: '0',
        group: '0',
        state: 'active',
        no_cache: '1',
        with_no_tradable: '1',
        limit: '10000',
        language: 'english',
        production: '1',
        ...(cursor ? { start_assetid: cursor } : {}),
      }).toString();
      const response = await upstream(env, url, {
        'X-Api-Key': env.STEAMWEBAPI_KEY,
      });
      if (response.status === 403)
        throw new ApiError(
          403,
          'inventory-private',
          'Steam reports this inventory as private. Set Inventory to Public in Steam Privacy Settings.',
        );
      if (response.status === 410) return { items: [], cursor: null };
      if (response.status === 411)
        throw new ApiError(
          502,
          'inventory-unavailable',
          'The provider did not return non-tradable items. This is not a confirmed empty inventory.',
        );
      if (response.status === 401)
        throw new ApiError(
          503,
          'configuration',
          'The inventory provider rejected its configuration.',
        );
      return normalizeInventory(
        await jsonData(response),
        appId,
        response.headers.get('last_assetid'),
      );
    },
  };
}
export function mergeInventoryPage(
  previous: Item[],
  page: InventoryPage,
  cursor?: string,
) {
  if (cursor && cursor === page.cursor)
    throw new Error(
      'Inventory pagination stopped: the provider repeated its cursor. Loaded items are incomplete.',
    );
  return [
    ...new Map(
      [...previous, ...page.items].map((item) => [item.id, item]),
    ).values(),
  ];
}
export function inventoryResponse(
  steamId: string,
  appId: number,
  page: InventoryPage,
): Inventory {
  return {
    steamId,
    appId,
    status: page.cursor ? 'partial' : 'complete',
    ...page,
    fetchedAt: new Date().toISOString(),
  };
}
