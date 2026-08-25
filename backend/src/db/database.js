"use strict";

// ============================================================
//  JAMES — src/db/database.js
//  Base de données relationnelle SQLite via sql.js
//  sql.js = SQLite en WebAssembly — aucun module natif C++
//  Compatible Windows / Mac / Linux
// ============================================================

const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "../../data");
const DB_PATH = path.join(DATA_DIR, "jarvis.db");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let _db = null;

function save() {
  if (!_db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

// Exécuter sans résultat (INSERT / UPDATE / DELETE)
function run(sql, params) {
  _db.run(sql, params || []);
  const r = _db.exec("SELECT last_insert_rowid() AS id");
  const lastId = r[0]?.values[0]?.[0] || 0;
  save();
  return { lastInsertRowid: lastId };
}

// Récupérer une seule ligne (SELECT ... WHERE)
function get(sql, params) {
  const stmt = _db.prepare(sql);
  if (params) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

// Récupérer toutes les lignes
function all(sql, params) {
  const stmt = _db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

const DEFAULT_SCHEDULE = [
  {
    label: "Réveil & Prépa",
    icon: "🌅",
    start_time: "06:30",
    end_time: "07:00",
  },
  { label: "Sport", icon: "💪", start_time: "07:00", end_time: "08:30" },
  {
    label: "Petit-déjeuner",
    icon: "☕",
    start_time: "08:30",
    end_time: "09:00",
  },
  {
    label: "Cours / Travail",
    icon: "📚",
    start_time: "09:00",
    end_time: "12:00",
  },
  { label: "Repas midi", icon: "🍽️", start_time: "12:00", end_time: "13:00" },
  {
    label: "Pause & Récupération",
    icon: "😴",
    start_time: "13:00",
    end_time: "14:00",
  },
  {
    label: "Révision & Projets",
    icon: "💻",
    start_time: "14:00",
    end_time: "17:00",
  },
  {
    label: "Jarvis — Défis",
    icon: "🤖",
    start_time: "17:00",
    end_time: "18:00",
  },
  {
    label: "Sport / Détente",
    icon: "🏃",
    start_time: "18:00",
    end_time: "19:00",
  },
  { label: "Dîner", icon: "🍴", start_time: "19:00", end_time: "20:00" },
  {
    label: "Révision soirée",
    icon: "📖",
    start_time: "20:00",
    end_time: "22:00",
  },
  {
    label: "Détente / Lecture",
    icon: "🌙",
    start_time: "22:00",
    end_time: "23:00",
  },
];

async function initDatabase() {
  const SQL = await initSqlJs();
  _db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  _db.run("PRAGMA foreign_keys = ON");

  _db.run(`CREATE TABLE IF NOT EXISTS users (
    id            INTEGER  PRIMARY KEY AUTOINCREMENT,
    username      TEXT     NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT     NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT     NOT NULL,
    avatar        TEXT     NOT NULL DEFAULT '🤖',
    created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
    last_login    DATETIME
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS schedules (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER  NOT NULL,
    label      TEXT     NOT NULL,
    icon       TEXT     NOT NULL DEFAULT '📌',
    start_time TEXT     NOT NULL,
    end_time   TEXT     NOT NULL,
    order_idx  INTEGER  NOT NULL DEFAULT 0,
    color      TEXT     NOT NULL DEFAULT '#58a6ff',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER  NOT NULL,
    endpoint   TEXT     NOT NULL,
    p256dh     TEXT     NOT NULL,
    auth_key   TEXT     NOT NULL,
    user_agent TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, endpoint),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  _db.run(
    "CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules (user_id, order_idx)",
  );
  _db.run(
    "CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id)",
  );
  save();

  console.log("[DB] ✅ SQLite initialisé —", DB_PATH);
  return _db;
}

// ── Composants d'accès aux données SQL (AT2-C4) ────────────

const createUser = {
  run: (d) =>
    run(
      "INSERT INTO users (username, email, password_hash, avatar) VALUES (?, ?, ?, ?)",
      [d.username, d.email, d.password_hash, d.avatar || "🤖"],
    ),
};

const findUserByEmail = {
  get: (email) =>
    get("SELECT * FROM users WHERE email = ? COLLATE NOCASE", [email]),
};

const findUserByUsername = {
  get: (username) =>
    get("SELECT * FROM users WHERE username = ? COLLATE NOCASE", [username]),
};

const findUserById = {
  get: (id) =>
    get(
      "SELECT id, username, email, avatar, created_at, last_login FROM users WHERE id = ?",
      [Number(id)],
    ),
};

const updateLastLogin = {
  run: (id) =>
    run("UPDATE users SET last_login = datetime('now') WHERE id = ?", [
      Number(id),
    ]),
};

const getUserSchedule = {
  all: (userId) =>
    all(
      "SELECT * FROM schedules WHERE user_id = ? ORDER BY order_idx ASC, start_time ASC",
      [Number(userId)],
    ),
};

const insertSlot = {
  run: (d) =>
    run(
      "INSERT INTO schedules (user_id, label, icon, start_time, end_time, order_idx, color) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        Number(d.user_id),
        d.label,
        d.icon,
        d.start_time,
        d.end_time,
        d.order_idx || 0,
        d.color || "#58a6ff",
      ],
    ),
};

const updateSlot = {
  run: (d) =>
    run(
      "UPDATE schedules SET label=?, icon=?, start_time=?, end_time=?, order_idx=?, color=? WHERE id=? AND user_id=?",
      [
        d.label,
        d.icon,
        d.start_time,
        d.end_time,
        d.order_idx,
        d.color,
        Number(d.id),
        Number(d.user_id),
      ],
    ),
};

const deleteSlot = {
  run: (id, uid) =>
    run("DELETE FROM schedules WHERE id=? AND user_id=?", [
      Number(id),
      Number(uid),
    ]),
};

const deleteUserSchedule = {
  run: (uid) => run("DELETE FROM schedules WHERE user_id=?", [Number(uid)]),
};

const savePushSub = {
  run: (d) => {
    run("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?", [
      Number(d.user_id),
      d.endpoint,
    ]);
    return run(
      "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent) VALUES (?, ?, ?, ?, ?)",
      [
        Number(d.user_id),
        d.endpoint,
        d.p256dh,
        d.auth_key,
        d.user_agent || null,
      ],
    );
  },
};

const getUserPushSubs = {
  all: (uid) =>
    all("SELECT * FROM push_subscriptions WHERE user_id=?", [Number(uid)]),
};

const getAllPushSubs = {
  all: () =>
    all(`
    SELECT ps.*, u.username
    FROM push_subscriptions ps
    INNER JOIN users u ON u.id = ps.user_id
  `),
};

const deletePushSub = {
  run: (uid, endpoint) =>
    run("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?", [
      Number(uid),
      endpoint,
    ]),
};

function createUserWithSchedule(userData) {
  const { lastInsertRowid: userId } = createUser.run(userData);
  DEFAULT_SCHEDULE.forEach((s, i) =>
    insertSlot.run({
      user_id: userId,
      label: s.label,
      icon: s.icon,
      start_time: s.start_time,
      end_time: s.end_time,
      order_idx: i,
      color: "#58a6ff",
    }),
  );
  return userId;
}

const db = {
  db: {
    transaction:
      (fn) =>
      (...args) =>
        fn(...args),
  },
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  updateLastLogin,
  getUserSchedule,
  insertSlot,
  updateSlot,
  deleteSlot,
  deleteUserSchedule,
  savePushSub,
  getUserPushSubs,
  getAllPushSubs,
  deletePushSub,
  createUserWithSchedule,
};

module.exports = { initDatabase, DEFAULT_SCHEDULE, ...db };
