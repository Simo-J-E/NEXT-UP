# NEXT UP

A game picker, Steam library browser, and inventory viewer. React, strict TypeScript, Tailwind, a Cloudflare Worker, and D1. The interface opens into the wheel; there is no landing page or account system.

## Run locally

Use Node 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:4173`. **Try demo** loads explicitly labeled sample playtime and prices. Custom games and the wheel work without credentials. Demo mode preserves your previously loaded library; **Use my library** restores it.

For live requests, in another terminal:

```sh
cp worker/.dev.vars.example worker/.dev.vars
# Fill in the private keys and operator details in worker/.dev.vars.
npm run db:local
npm run dev:api
```

Vite proxies `/api` to port 8787. Do not create a frontend `.env` for this local setup. `.env.example` documents the public Worker URL used for production. Never put API keys in `VITE_` variables.

## Data providers

| Data                           | Provider and configuration                                        | Limits                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile, owned games, playtime | Valve Steam Web API; Worker secret `STEAM_API_KEY`                | Game details must be public. A private or inaccessible library is not an empty library.                                                                                                   |
| Finnish store prices           | Isolated Steam Store `appdetails` adapter; `STORE_ENABLED=true`   | This is an undocumented public store endpoint, without a supported Web API contract or availability guarantee. Disabled by default. Review permission and suitability before enabling it. |
| Inventory assets               | Independent provider SteamWebAPI; Worker secret `STEAMWEBAPI_KEY` | CS2, Dota 2, TF2, Rust, and Steam Community inventories. Uses the provider's active-inventory mode and paginated raw assets. Private inventories remain inaccessible.                     |
| Market prices                  | SteamWebAPI `/steam/api/items`, exact market name, EUR            | CS2, Dota 2, TF2, and Rust. Community cards, backgrounds, and emoticons remain visible but unpriced because that pricing coverage is not documented.                                      |

Get a [Steam Web API key](https://steamcommunity.com/dev/apikey) and review the [API terms](https://steamcommunity.com/dev/apiterms), [owned-games documentation](https://partner.steamgames.com/doc/webapi/iplayerservice), and [profile documentation](https://partner.steamgames.com/doc/webapi/ISteamUser). Visitors use the operator's server-side key.

SteamWebAPI is a commercial third party, not Valve. Review its [documentation](https://www.steamwebapi.com/api/steam/documentation), [inventory contract](https://api.steamwebapi.com/steam-inventory-api), [plans](https://www.steamwebapi.com/pricing), [terms](https://www.steamwebapi.com/legal/terms), and [privacy policy](https://www.steamwebapi.com/legal/privacy). Choose a plan that includes **both inventory and items endpoints**. The free allowance is not sufficient for this application. Endpoint access, quotas, and prices depend on the plan; confirm them before paying. Fresh inventory requests can consume extra credits. Provider terms restrict redistribution and competing databases; obtain any permission required by your intended deployment.

The Worker defaults to 16 upstream requests per minute and 300 per day **per host**. Set `UPSTREAM_PER_MINUTE` and `UPSTREAM_PER_DAY` to your actual allowances. A limit pauses loading; received items remain available and pagination can resume. Provider HTTP contracts were checked against documentation; authenticated live responses were not tested for this delivery.

## What the numbers mean

- Library figures are current **replacement estimates**, with sale and regular-price subtotals and pricing coverage. Free is zero; unavailable is unknown. Steam app IDs are counted once. Returned games do not establish DLC ownership, purchased editions, original spending, or resale value.
- Inventory figures use exact market variants and quantities. Prices are **Steam Wallet listing estimates**, converted to EUR by the provider, not withdrawable money or proceeds after fees. Wear and StatTrak variants remain distinct. Float, pattern, sticker, and special-premium valuations are not inferred.
- Money uses integer cents. Quotes carry currency, region, provider, basis, observation time, and provider update time where supplied. Stale quotes remain labeled. Unpriced items stay in the list and are excluded from subtotals.
- Shared history begins with real observations in D1. The hourly job refreshes at most eight eligible variants, no more often than every six hours, while the item has been requested within seven days. This is bounded sampling, not a complete historical market feed.
- Personal snapshots stay in IndexedDB. Two complete snapshots separate comparable price changes from added or removed quantities. Price coverage can change; value changes are not profit. Charts expose data tables and leave gaps over two days unconnected. Longer ranges appear only when observations span them.

## Cloudflare and GitHub Pages

1. Create a **public GitHub repository**, push this folder including `package-lock.json`, and set Pages → Source to **GitHub Actions**. Hash navigation and repository asset paths are configured for project Pages URLs.
2. Sign in with Wrangler and create a D1 database:

   ```sh
   npx wrangler login
   npx wrangler d1 create next-up --jurisdiction=eu
   ```

   Keep the returned database ID. EU jurisdiction covers D1 storage, not all Worker or third-party processing; see [D1 locations](https://developers.cloudflare.com/d1/configuration/data-location/).

3. Set the following environment values locally, then prepare the deployment configuration. The generated file contains public configuration, not keys, and is ignored by Git:

   ```sh
   export D1_DATABASE_ID='REPLACE_WITH_DATABASE_UUID'
   export ALLOWED_ORIGINS='https://YOUR_USER.github.io'
   export CONTROLLER_NAME='YOUR_OPERATOR_NAME'
   export PRIVACY_CONTACT='YOUR_PRIVACY_CONTACT'
   export DATA_COUNTRIES='ACTUAL_PROCESSING_AND_STORAGE_COUNTRIES'
   node scripts/configure-deploy.mjs
   npx wrangler d1 migrations apply next-up --remote --config worker/wrangler.deploy.json
   npx wrangler deploy --config worker/wrangler.deploy.json
   ```

   Origins are exact HTTPS origins, without a repository path or trailing slash. Fill in actual operator details and provider processing locations. Live routes remain unavailable until privacy fields and the rate-limit salt are configured.

4. Store credentials interactively in Cloudflare. Use a long random value for `RATE_LIMIT_SALT`; for example, generate one locally with `openssl rand -hex 32`.

   ```sh
   npx wrangler secret put STEAM_API_KEY --config worker/wrangler.deploy.json
   npx wrangler secret put STEAMWEBAPI_KEY --config worker/wrangler.deploy.json
   npx wrangler secret put RATE_LIMIT_SALT --config worker/wrangler.deploy.json
   ```

5. Configure GitHub Actions:

   | Kind                                    | Names                                                                                       |
   | --------------------------------------- | ------------------------------------------------------------------------------------------- |
   | Secrets in the `production` environment | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`                                             |
   | Repository variables                    | `D1_DATABASE_ID`, `ALLOWED_ORIGINS`, `CONTROLLER_NAME`, `PRIVACY_CONTACT`, `DATA_COUNTRIES` |
   | Repository variable for the frontend    | `API_BASE_URL`: the deployed HTTPS Worker origin, without a trailing slash                  |
   | Optional repository variables           | `STORE_ENABLED`, `UPSTREAM_PER_MINUTE`, `UPSTREAM_PER_DAY`                                  |
   | Deployment switch                       | Set `DEPLOY_ENABLED` to `true` after configuration is complete.                             |

   Scope the Cloudflare token to the account's Worker and D1 deployment permissions. The Steam/provider keys belong only in Worker secrets. Protect `main` and the `production` environment as appropriate. Enable GitHub secret scanning and push protection where available.

6. Push to `main` or dispatch **Check and deploy**. Successful checks deploy D1 migrations and the Worker, then Pages. Actions are pinned to commit revisions; pull requests receive no deployment secrets. Dependabot covers npm and Actions. For a root `USER.github.io` repository or custom domain served at `/`, change the workflow's `BASE_PATH` to `/`.

Deployment has not been performed for this delivery. The archive does not include a public repository, provisioned services, credentials, or a paid provider subscription.

## Checks

```sh
npm run check                 # Formatting, lint, both type checks, Vitest, both builds
npx playwright install chromium
npm run test:e2e              # Desktop + mobile, persistence, errors, keyboard, axe
```

Delivery verification: 37 Vitest tests passed; TypeScript, ESLint, frontend build, and Worker dry-run build passed. The demo layout was inspected in a browser. A browser compatibility issue in roll IDs was found and corrected; the final interactive flows still need the included Playwright suite, which could not be run in this delivery environment. No authenticated live-provider check was run.

The optional **Live provider check** workflow is separate from normal CI. Set repository variable `API_BASE_URL`; optionally add secret `LIVE_STEAM_PROFILE` for a profile lookup. Locally, use `LIVE_API_BASE=https://YOUR_WORKER_ORIGIN npm run test:live`. Personal response data is omitted from logs. This checks health and an optional profile contract, not every pricing/inventory provider path.

## Implementation notes

`src/` contains the three views, wheel, and IndexedDB state. `shared/` holds schemas, selection, and money calculations. `worker/providers/` isolates upstream adapters; `worker/cache.ts` handles D1 caches, observations, rate limits, and tracking. SQL migrations are in `worker/migrations/`.

The wheel uses rejection sampling over all eligible games, then animates to the selected result. Up to 12 labels are displayed; large libraries retain their full selection pool. Settings, favorites, custom games, and the selected result save immediately. No-repeat mode ends when its pool is exhausted and provides an explicit reset.

Requests use validated inputs, allowed upstream hosts, no redirects, timeouts, bounded retries, provider cooldowns, and deduplication. Prices cache for six hours; unknown results for 15 minutes. D1 retains observations for up to 400 days. Personal profiles/inventories are not written to D1. Device data can be exported, imported, or cleared. There are no analytics or advertising trackers. The in-app privacy notice includes configured operator details; the operator must confirm its legal bases, provider agreements, processing locations, and retention practices for the actual deployment.

Accessibility targets [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) and relevant [EN 301 549 V4.1.1 requirements](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf). Native controls, dialog focus, visible focus, reduced motion, result announcements, and chart tables are implemented. Automated axe checks are included. A full screen-reader, zoom, contrast, and assistive-technology audit is still required before claiming conformance.

Application code is MIT licensed. Game names, logos, and remote artwork belong to their owners and are not relicensed by this project. Demo image references are listed in `src/artwork.json`.
