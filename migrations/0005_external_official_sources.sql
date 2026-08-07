CREATE TABLE IF NOT EXISTS external_sources (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content_hash TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS external_sources_url_hash_idx ON external_sources(url, content_hash);
CREATE INDEX IF NOT EXISTS external_sources_fetched_at_idx ON external_sources(fetched_at DESC);
