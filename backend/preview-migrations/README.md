# Preview D1 migrations

Only the **depara-preview-db** database is targeted. Production database migrations are not run by this workflow.

Add sequential SQL files here, e.g. `0001_add_notes.sql`, after reviewing the existing schema.

The GitHub workflow validates files and applies them with Wrangler's migration tracking, so already-applied migrations are not repeated.

Safety policy: additive SQL only (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, ALTER TABLE ADD COLUMN). No DROP, DELETE, UPDATE, INSERT, REPLACE, TRUNCATE, ATTACH, PRAGMA or schema renames. A backup and separate review are required before destructive changes.

No SQL migrations have been created yet; the existing database remains unchanged.
