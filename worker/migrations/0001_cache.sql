CREATE TABLE price_cache (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE observations (
  key TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (key, observed_at)
);
CREATE INDEX observations_time ON observations(observed_at);
CREATE TABLE tracked_items (
  key TEXT PRIMARY KEY,
  app_id INTEGER NOT NULL,
  market_name TEXT NOT NULL,
  last_requested INTEGER NOT NULL,
  last_refreshed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE request_buckets (
  key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (key, bucket)
);
CREATE TABLE provider_cooldowns (host TEXT PRIMARY KEY, until_ms INTEGER NOT NULL);
