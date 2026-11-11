// One local SQLite file: profile, conversations, memory graph, agent jobs, requests to the team, settings.
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA } from './config.mjs';

export const db = new DatabaseSync(path.join(DATA, 'vit.db'));
db.exec(`PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, kind TEXT, email TEXT, name TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS convs (id INTEGER PRIMARY KEY, user TEXT, title TEXT, created INTEGER, updated INTEGER);
CREATE TABLE IF NOT EXISTS msgs (id INTEGER PRIMARY KEY, conv INTEGER, role TEXT, content TEXT, meta TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS nodes (id INTEGER PRIMARY KEY, user TEXT, cat TEXT, text TEXT, quote TEXT, weight REAL DEFAULT 1, emb BLOB, created INTEGER);
CREATE TABLE IF NOT EXISTS edges (a INTEGER, b INTEGER, kind TEXT, w REAL, PRIMARY KEY (a, b));
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, user TEXT, conv INTEGER, title TEXT, goal TEXT, status TEXT, steps TEXT, created INTEGER, updated INTEGER);
CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY, user TEXT, title TEXT, detail TEXT, status TEXT, log TEXT, sent INTEGER DEFAULT 0, created INTEGER, updated INTEGER);
CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, provider TEXT, model TEXT, ms INTEGER, ok INTEGER, created INTEGER);
CREATE INDEX IF NOT EXISTS msgs_conv ON msgs (conv, id);
CREATE INDEX IF NOT EXISTS nodes_user ON nodes (user);`);
// token counts per call, for the cost of cloud models (columns added after 0.3)
for (const col of ['tin', 'tout']) { try { db.exec(`ALTER TABLE usage ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch { /* already there */ } }

const stmts = new Map();
const prep = (sql) => stmts.get(sql) || (stmts.set(sql, db.prepare(sql)), stmts.get(sql));
export const all = (sql, ...a) => prep(sql).all(...a);
export const one = (sql, ...a) => prep(sql).get(...a);
export const run = (sql, ...a) => prep(sql).run(...a);
export const now = () => Date.now();

export function getSetting(k, def = null) { const r = one('SELECT v FROM settings WHERE k = ?', k); if (!r) return def; try { return JSON.parse(r.v); } catch { return def; } }
export function setSetting(k, v) { run('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v)); }
