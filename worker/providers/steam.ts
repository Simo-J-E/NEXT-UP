import { z } from 'zod';
import { parseProfile } from '../../shared/core';
import {
  type Game,
  type Library,
  type Price,
  storeKey,
} from '../../shared/model';
import type { Env } from '../env';
import { ApiError, jsonData, upstream } from '../http';

const playerSchema = z.object({
  steamid: z.string(),
  personaname: z.string().default('Steam player'),
  avatarfull: z.string().default(''),
  communityvisibilitystate: z.number().optional(),
  timecreated: z.number().int().nonnegative().optional(),
});
const ownedSchema = z.object({
  response: z.object({
    game_count: z.number().int().nonnegative().optional(),
    games: z
      .array(
        z.object({
          appid: z.number().int().positive(),
          name: z.string().optional(),
          img_icon_url: z.string().optional(),
          playtime_forever: z.number().nonnegative().optional(),
        }),
      )
      .optional(),
  }),
});
export function normalizeOwned(raw: unknown): {
  status: Library['status'];
  games: Game[];
} {
  const data = ownedSchema.parse(raw).response;
  // An empty response is ambiguous/private, never a public empty library.
  if (data.game_count === undefined && !data.games)
    return { status: 'private', games: [] };
  if (!data.games && data.game_count !== 0)
    return { status: 'unavailable', games: [] };
  return {
    status: 'public',
    games: [
      ...new Map(
        (data.games || []).map((g) => [
          g.appid,
          {
            id: `steam:${g.appid}`,
            appId: g.appid,
            name: g.name || `Steam app ${g.appid}`,
            platform: 'Steam',
            image: g.img_icon_url
              ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
              : '',
            tags: [],
            minutes: g.playtime_forever ?? null,
            kind: 'steam' as const,
          },
        ]),
      ).values(),
    ],
  };
}
async function steamCall(
  env: Env,
  path: string,
  params: Record<string, string>,
) {
  if (!env.STEAM_API_KEY)
    throw new ApiError(
      503,
      'configuration',
      'Steam profile loading is not configured yet. Add custom games or try the demo.',
    );
  const url = new URL(`https://api.steampowered.com/${path}`);
  url.search = new URLSearchParams({
    key: env.STEAM_API_KEY,
    ...params,
  }).toString();
  const res = await upstream(env, url);
  if (res.status === 401 || res.status === 403)
    throw new ApiError(
      503,
      'configuration',
      'The Steam API key needs attention from the site owner.',
    );
  return jsonData(res);
}
export async function loadLibrary(env: Env, input: string): Promise<Library> {
  const ref = parseProfile(input);
  let steamId = ref.value;
  if (ref.type === 'vanity') {
    const data = z
      .object({
        response: z.object({
          success: z.number(),
          steamid: z.string().optional(),
        }),
      })
      .parse(
        await steamCall(env, 'ISteamUser/ResolveVanityURL/v1/', {
          vanityurl: ref.value,
        }),
      );
    if (data.response.success !== 1 || !data.response.steamid)
      throw new ApiError(
        404,
        'profile-not-found',
        'That Steam profile could not be found.',
      );
    steamId = parseProfile(data.response.steamid).value;
  }
  const [profileResult, gamesResult, levelResult] = await Promise.allSettled([
    steamCall(env, 'ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }),
    steamCall(env, 'IPlayerService/GetOwnedGames/v1/', {
      steamid: steamId,
      include_appinfo: 'true',
      include_played_free_games: 'true',
      include_free_sub: 'true',
      skip_unvetted_apps: 'false',
    }),
    steamCall(env, 'IPlayerService/GetSteamLevel/v1/', { steamid: steamId }),
  ]);
  let profile: Library['profile'] = {
    steamId,
    name: 'Steam player',
    avatar: '',
    visibility: 'unavailable',
  };
  if (profileResult.status === 'fulfilled') {
    const player = z
      .object({ response: z.object({ players: z.array(playerSchema) }) })
      .parse(profileResult.value).response.players[0];
    if (!player)
      throw new ApiError(
        404,
        'profile-not-found',
        'That Steam profile could not be found.',
      );
    profile = {
      steamId,
      name: player.personaname,
      avatar: /^https:\/\//.test(player.avatarfull) ? player.avatarfull : '',
      visibility: player.communityvisibilitystate === 3 ? 'public' : 'private',
      createdAt: player.timecreated
        ? new Date(player.timecreated * 1000).toISOString()
        : null,
    };
  }
  if (levelResult.status === 'fulfilled') {
    const level = z
      .object({
        response: z.object({ player_level: z.number().int().nonnegative() }),
      })
      .safeParse(levelResult.value);
    if (level.success) profile.level = level.data.response.player_level;
  }
  const library =
    gamesResult.status === 'fulfilled'
      ? normalizeOwned(gamesResult.value)
      : { status: 'unavailable' as const, games: [] };
  return {
    profile,
    ...library,
    fetchedAt: new Date().toISOString(),
    message:
      library.status === 'private'
        ? 'Steam did not expose game details. Set Game details to Public in Steam Privacy Settings, then reload.'
        : library.status === 'unavailable'
          ? 'Game details could not be loaded. This is not an empty library.'
          : undefined,
  };
}
const storeSchema = z.record(
  z.string(),
  z.object({
    success: z.boolean(),
    data: z
      .object({
        is_free: z.boolean().optional(),
        header_image: z.string().optional(),
        price_overview: z
          .object({
            currency: z.string(),
            initial: z.number().int().nonnegative(),
            final: z.number().int().nonnegative(),
          })
          .optional(),
      })
      .optional(),
  }),
);
export function normalizeStore(raw: unknown, appId: number): Price {
  const data = storeSchema.parse(raw)[String(appId)];
  const unknown: Price = {
    key: storeKey(appId),
    status: 'unknown',
    quote: null,
  };
  if (!data?.success || !data.data) return unknown;
  const p = data.data.price_overview,
    now = new Date().toISOString();
  if (!data.data.is_free && (!p || p.currency !== 'EUR')) return unknown;
  return {
    key: storeKey(appId),
    status: data.data.is_free ? 'free' : 'priced',
    quote: {
      minor: data.data.is_free ? 0 : p!.final,
      regularMinor: data.data.is_free ? 0 : p!.initial,
      currency: 'EUR',
      region: 'FI',
      source: 'steam-store',
      basis: 'store-current',
      observedAt: now,
      fetchedAt: now,
      providerUpdatedAt: null,
    },
  };
}
export async function storePrice(
  env: Env,
  appId: number,
): Promise<Price & { image?: string }> {
  if (env.STORE_ENABLED !== 'true')
    return {
      key: storeKey(appId),
      status: 'unknown',
      quote: null,
      note: 'Store pricing is not enabled.',
    };
  // This is a public Store endpoint, not a guaranteed Steamworks API. Isolated here.
  const url = new URL('https://store.steampowered.com/api/appdetails');
  url.search = new URLSearchParams({
    appids: String(appId),
    cc: 'fi',
    l: 'english',
  }).toString();
  const raw = await jsonData(await upstream(env, url));
  const image = storeSchema.parse(raw)[String(appId)]?.data?.header_image;
  return {
    ...normalizeStore(raw, appId),
    ...(image?.startsWith('https://') ? { image } : {}),
  };
}
