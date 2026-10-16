'use strict';
exports.init = db => db.run(`
CREATE TABLE IF NOT EXISTS organizer_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('task','shopping')),
 title TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
 priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
 quantity TEXT NOT NULL DEFAULT '',
 due_at TEXT,
 remind_at TEXT,
 reminder_sent_at TEXT,
 archived INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 completed_at TEXT,
 request_key TEXT,
 UNIQUE(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS organizer_owner ON organizer_items(user_id,kind,archived);
CREATE TABLE IF NOT EXISTS organizer_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 item_id INTEGER NOT NULL REFERENCES organizer_items(id),
 user_id INTEGER NOT NULL,
 action TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS organizer_devices (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 token_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL
);
`);
