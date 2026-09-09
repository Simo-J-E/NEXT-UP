import { readFileSync, writeFileSync } from 'node:fs';
const required = [
  'D1_DATABASE_ID',
  'ALLOWED_ORIGINS',
  'PRIVACY_CONTACT',
  'CONTROLLER_NAME',
  'DATA_COUNTRIES',
];
for (const name of required)
  if (!process.env[name]?.trim())
    throw new Error(`Set repository variable ${name} before deploying.`);
if (
  !/^[a-f0-9-]{36}$/i.test(process.env.D1_DATABASE_ID) ||
  process.env.D1_DATABASE_ID.startsWith('00000000')
)
  throw new Error('Use the real D1_DATABASE_ID.');
for (const origin of process.env.ALLOWED_ORIGINS.split(',')) {
  const url = new URL(origin.trim());
  if (url.origin !== origin.trim() || url.protocol !== 'https:')
    throw new Error(
      'ALLOWED_ORIGINS must contain exact HTTPS origins, without paths or a trailing slash.',
    );
}
const config = JSON.parse(readFileSync('worker/wrangler.jsonc', 'utf8'));
config.d1_databases[0].database_id = process.env.D1_DATABASE_ID;
for (const name of [
  ...required.slice(1),
  'STORE_ENABLED',
  'UPSTREAM_PER_MINUTE',
  'UPSTREAM_PER_DAY',
])
  if (process.env[name]) config.vars[name] = process.env[name];
writeFileSync(
  'worker/wrangler.deploy.json',
  JSON.stringify(config, null, 2) + '\n',
);
console.log('Deployment configuration prepared. No credentials were written.');
