-- Public, immutable snapshots contain only board definitions and display titles.
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
  board_json TEXT NOT NULL CHECK(length(board_json) <= 8192),
  created_at TEXT NOT NULL
);

-- Short-lived HMAC identifiers only: never photos, prompts, or raw IP addresses.
CREATE TABLE IF NOT EXISTS admissions (
  request_key TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('ai', 'share')),
  actor_key TEXT NOT NULL,
  ip_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admissions_actor_time ON admissions(kind, actor_key, created_at);
CREATE INDEX IF NOT EXISTS admissions_ip_time ON admissions(kind, ip_key, created_at);
CREATE INDEX IF NOT EXISTS admissions_kind_time ON admissions(kind, created_at);
CREATE INDEX IF NOT EXISTS admissions_time ON admissions(created_at);
