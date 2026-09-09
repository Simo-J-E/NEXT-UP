import type { D1Database } from '@cloudflare/workers-types/experimental';
export interface Env {
  DB: D1Database;
  STEAM_API_KEY?: string;
  STEAMWEBAPI_KEY?: string;
  RATE_LIMIT_SALT?: string;
  ALLOWED_ORIGINS?: string;
  STORE_ENABLED?: string;
  UPSTREAM_PER_MINUTE?: string;
  UPSTREAM_PER_DAY?: string;
  PRIVACY_CONTACT?: string;
  CONTROLLER_NAME?: string;
  DATA_COUNTRIES?: string;
}
