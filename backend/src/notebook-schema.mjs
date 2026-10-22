// Additive bootstrap schema. Generated from 0002_notebook_social.sql.
export default [
  "CREATE TABLE IF NOT EXISTS nb_profiles (\n id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL DEFAULT '',\n group_id TEXT NOT NULL, friend_code TEXT NOT NULL UNIQUE,\n privacy TEXT NOT NULL DEFAULT 'none', status TEXT NOT NULL DEFAULT '', status_until INTEGER NOT NULL DEFAULT 0,\n joined_at INTEGER NOT NULL, updated_at INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS nb_friendships (\n a TEXT NOT NULL, b TEXT NOT NULL, sender TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',\n created_at INTEGER NOT NULL, PRIMARY KEY(a,b), CHECK(a < b)\n)",
  "CREATE TABLE IF NOT EXISTS nb_friend_options (\n user_id TEXT NOT NULL, friend_id TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0,\n privacy TEXT NOT NULL DEFAULT 'inherit', PRIMARY KEY(user_id,friend_id)\n)",
  "CREATE TABLE IF NOT EXISTS nb_notes (\n id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,\n body TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'note', due TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0,\n visibility TEXT NOT NULL DEFAULT 'private', audience TEXT NOT NULL DEFAULT '[]', group_id TEXT NOT NULL,\n attachments TEXT NOT NULL DEFAULT '[]', lesson TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,\n created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER NOT NULL DEFAULT 0\n)",
  "CREATE INDEX IF NOT EXISTS nb_notes_owner ON nb_notes(owner_id,updated_at)",
  "CREATE INDEX IF NOT EXISTS nb_notes_audience ON nb_notes(group_id,visibility,updated_at)",
  "CREATE TABLE IF NOT EXISTS nb_messages (\n id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, author_id TEXT NOT NULL,\n group_id TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, note_id TEXT NOT NULL DEFAULT '',\n attachments TEXT NOT NULL DEFAULT '[]', reply_id INTEGER NOT NULL DEFAULT 0,\n created_at INTEGER NOT NULL, edited_at INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0\n)",
  "CREATE INDEX IF NOT EXISTS nb_messages_channel ON nb_messages(channel,id)",
  "CREATE TABLE IF NOT EXISTS nb_reactions (\n message_id INTEGER NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,\n PRIMARY KEY(message_id,user_id)\n)",
  "CREATE TABLE IF NOT EXISTS nb_reads (\n user_id TEXT NOT NULL, channel TEXT NOT NULL, last_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,channel)\n)",
  "CREATE TABLE IF NOT EXISTS nb_invitations (\n id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL, place TEXT NOT NULL,\n starts_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS nb_leaders (\n group_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, elected_at INTEGER NOT NULL, election_id TEXT NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS nb_elections (\n id TEXT PRIMARY KEY, group_id TEXT NOT NULL, candidate_id TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'elect',\n starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'open', winner INTEGER NOT NULL DEFAULT 0\n)",
  "CREATE UNIQUE INDEX IF NOT EXISTS nb_elections_active ON nb_elections(group_id) WHERE state='open'",
  "CREATE TABLE IF NOT EXISTS nb_electors (\n election_id TEXT NOT NULL, user_id TEXT NOT NULL, vote INTEGER, PRIMARY KEY(election_id,user_id)\n)",
  "CREATE TABLE IF NOT EXISTS nb_mutes (\n channel TEXT NOT NULL, user_id TEXT NOT NULL, until_at INTEGER NOT NULL, moderator_id TEXT NOT NULL,\n PRIMARY KEY(channel,user_id)\n)"
];
