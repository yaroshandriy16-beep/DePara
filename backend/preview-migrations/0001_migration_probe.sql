-- Non-destructive smoke test for automatic preview D1 migrations.
-- This table stores no user data and is isolated to depara-preview-db.
CREATE TABLE IF NOT EXISTS depara_preview_migration_probe (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
