-- DePara REBORN preview database only. Never run against depara-db.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  group_id TEXT,
  bio TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT 'public',
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS user_state (
  user_id INTEGER PRIMARY KEY,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS social_friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON social_friend_requests(receiver_id,status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON social_friend_requests(sender_id,status);

CREATE TABLE IF NOT EXISTS social_friends (
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,friend_id)
);

CREATE TABLE IF NOT EXISTS social_direct_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dm_sender_receiver ON social_direct_messages(sender_id,receiver_id,id);
CREATE INDEX IF NOT EXISTS idx_dm_receiver_sender ON social_direct_messages(receiver_id,sender_id,id);

CREATE TABLE IF NOT EXISTS social_group_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  sender_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON social_group_messages(group_id,id);

CREATE TABLE IF NOT EXISTS social_read_state (
  user_id INTEGER NOT NULL,
  conversation_key TEXT NOT NULL,
  last_message_id INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,conversation_key)
);
