CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 username TEXT,
 first_name TEXT NOT NULL DEFAULT '',
 photo_url TEXT,
 friend_code TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS friend_requests (
 id TEXT PRIMARY KEY,
 sender_id TEXT NOT NULL REFERENCES users(id),
 receiver_id TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(sender_id, receiver_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_receiver ON friend_requests(receiver_id,status);
CREATE INDEX IF NOT EXISTS friend_requests_sender ON friend_requests(sender_id,status);
