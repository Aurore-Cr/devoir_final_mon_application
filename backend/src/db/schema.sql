-- JARMES— Schema
-- Indispensable : SQLite désactive les FK par défaut à chaque connexion.
-- Sans cette ligne, les "ON DELETE CASCADE" ci-dessous ne s'appliquent pas.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER  PRIMARY KEY AUTO_INCREMENT,
  username      TEXT     NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT     NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT     NOT NULL,
  avatar        TEXT     NOT NULL DEFAULT '🤖',
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  last_login    DATETIME
);

CREATE TABLE IF NOT EXISTS schedules (
  id         INTEGER  PRIMARY KEY AUTO_INCREMENT,
  user_id    INTEGER  NOT NULL,
  label      TEXT     NOT NULL,
  icon       TEXT     NOT NULL DEFAULT '📌',
  start_time TEXT     NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time   TEXT     NOT NULL CHECK (end_time   GLOB '[0-2][0-9]:[0-5][0-9]'),
  order_idx  INTEGER  NOT NULL DEFAULT 0,
  color      TEXT     NOT NULL DEFAULT '#58a6ff',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER  PRIMARY KEY AUTO_INCREMENT,
  user_id    INTEGER  NOT NULL,
  endpoint   TEXT     NOT NULL,
  p256dh     TEXT     NOT NULL,
  auth_key   TEXT     NOT NULL,
  user_agent TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, endpoint),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules (user_id, order_idx);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id);

-- Exemples de requêtes SQL utilisées dans l'application :
-- SELECT * FROM users WHERE email = ?
-- SELECT s.*, u.username FROM schedules s INNER JOIN users u ON u.id = s.user_id WHERE s.user_id = ?
-- INSERT INTO schedules (user_id, label, icon, start_time, end_time) VALUES (?, ?, ?, ?, ?)
-- UPDATE users SET last_login = datetime('now') WHERE id = ?
-- DELETE FROM schedules WHERE user_id = ?
