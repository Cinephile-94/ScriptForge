const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'scriptforge.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema migration
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#c9a84c',
    api_key TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled Script',
    owner_id TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '[]',
    scene_count INTEGER DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collaborators (
    script_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    permission TEXT NOT NULL DEFAULT 'edit',
    invited_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (script_id, user_id),
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invite_links (
    token TEXT PRIMARY KEY,
    script_id TEXT NOT NULL,
    permission TEXT NOT NULL DEFAULT 'edit',
    created_by TEXT NOT NULL,
    uses INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 100,
    expires_at INTEGER,
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
  );
`);

// Prepared statements
const stmts = {
  // Users
  createUser: db.prepare(`INSERT INTO users (id, email, password_hash, display_name, color) VALUES (?, ?, ?, ?, ?)`),
  getUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  getUserById: db.prepare(`SELECT id, email, display_name, color, created_at FROM users WHERE id = ?`),

  // Scripts
  createScript: db.prepare(`INSERT INTO scripts (id, title, owner_id, content) VALUES (?, ?, ?, ?)`),
  getScript: db.prepare(`SELECT * FROM scripts WHERE id = ?`),
  updateScript: db.prepare(`UPDATE scripts SET title = ?, content = ?, scene_count = ?, word_count = ?, updated_at = strftime('%s', 'now') WHERE id = ?`),
  deleteScript: db.prepare(`DELETE FROM scripts WHERE id = ?`),
  listUserScripts: db.prepare(`
    SELECT s.id, s.title, s.owner_id, s.scene_count, s.word_count, s.created_at, s.updated_at,
           u.display_name as owner_name
    FROM scripts s
    JOIN users u ON s.owner_id = u.id
    WHERE s.owner_id = ?
    UNION
    SELECT s.id, s.title, s.owner_id, s.scene_count, s.word_count, s.created_at, s.updated_at,
           u.display_name as owner_name
    FROM scripts s
    JOIN collaborators c ON s.id = c.script_id
    JOIN users u ON s.owner_id = u.id
    WHERE c.user_id = ?
    ORDER BY updated_at DESC
  `),

  // Collaborators
  addCollaborator: db.prepare(`INSERT OR IGNORE INTO collaborators (script_id, user_id, permission) VALUES (?, ?, ?)`),
  getCollaborators: db.prepare(`
    SELECT u.id, u.display_name, u.color, c.permission
    FROM collaborators c JOIN users u ON c.user_id = u.id
    WHERE c.script_id = ?
  `),
  canAccess: db.prepare(`
    SELECT 1 FROM scripts WHERE id = ? AND owner_id = ?
    UNION
    SELECT 1 FROM collaborators WHERE script_id = ? AND user_id = ?
    LIMIT 1
  `),

  // Invite links
  createInvite: db.prepare(`INSERT INTO invite_links (token, script_id, permission, created_by, expires_at) VALUES (?, ?, ?, ?, ?)`),
  getInvite: db.prepare(`SELECT * FROM invite_links WHERE token = ?`),
  useInvite: db.prepare(`UPDATE invite_links SET uses = uses + 1 WHERE token = ?`),
};

module.exports = { db, stmts };
