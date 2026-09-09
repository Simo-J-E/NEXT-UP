const base = process.env.LIVE_API_BASE;
if (!base || new URL(base).protocol !== 'https:')
  throw new Error('Set LIVE_API_BASE to your deployed HTTPS Worker URL.');
const health = await fetch(`${base.replace(/\/$/, '')}/api/health`, {
  signal: AbortSignal.timeout(15000),
});
if (!health.ok) throw new Error('Health check failed.');
const status = await health.json();
if (!status.configured || !status.steam)
  throw new Error('Live Steam configuration is incomplete.');
console.log('Health check passed.');
// Opt-in: this sends the explicitly configured profile to the deployed service.
if (process.env.LIVE_STEAM_PROFILE) {
  const response = await fetch(`${base.replace(/\/$/, '')}/api/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: process.env.LIVE_STEAM_PROFILE }),
    signal: AbortSignal.timeout(55000),
  });
  if (!response.ok)
    throw new Error(`Profile contract check failed (${response.status}).`);
  const data = await response.json();
  if (typeof data.profile?.steamId !== 'string' || !Array.isArray(data.games))
    throw new Error('Unexpected live profile response.');
  console.log(
    'Profile contract check passed. Personal data omitted from logs.',
  );
}
