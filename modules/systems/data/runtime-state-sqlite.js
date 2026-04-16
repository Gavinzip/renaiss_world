const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { LEGACY_DATA_DIR } = require('../../core/storage-paths');

const DB_FILE = path.join(LEGACY_DATA_DIR, 'runtime_state.sqlite');

let db = null;

function ensureDb() {
  if (db) return db;
  if (!fs.existsSync(LEGACY_DATA_DIR)) fs.mkdirSync(LEGACY_DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_state_entries (
      namespace TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      json_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(namespace, entry_key)
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_state_entries_namespace_updated
      ON runtime_state_entries(namespace, updated_at DESC);
  `);
  return db;
}

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(String(raw || ''));
  } catch {
    return fallback;
  }
}

function normalizeNamespace(namespace) {
  const safe = String(namespace || '').trim();
  if (!safe) throw new Error('runtime state namespace is required');
  return safe;
}

function normalizeKey(key) {
  const safe = String(key || '').trim();
  if (!safe) throw new Error('runtime state key is required');
  return safe;
}

function readNamespaceObject(namespace) {
  const safeNamespace = normalizeNamespace(namespace);
  const rows = ensureDb().prepare(`
    SELECT entry_key, json_value
      FROM runtime_state_entries
     WHERE namespace = ?
  `).all(safeNamespace);
  const out = {};
  for (const row of rows) {
    const key = String(row?.entry_key || '').trim();
    if (!key) continue;
    const parsed = parseJson(row?.json_value, undefined);
    if (parsed === undefined) continue;
    out[key] = parsed;
  }
  return out;
}

function readNamespaceEntry(namespace, key) {
  const row = ensureDb().prepare(`
    SELECT json_value
      FROM runtime_state_entries
     WHERE namespace = ? AND entry_key = ?
     LIMIT 1
  `).get(normalizeNamespace(namespace), normalizeKey(key));
  if (!row) return undefined;
  return parseJson(row.json_value, undefined);
}

function readSingletonValue(namespace, key = 'state') {
  const row = ensureDb().prepare(`
    SELECT json_value
      FROM runtime_state_entries
     WHERE namespace = ? AND entry_key = ?
     LIMIT 1
  `).get(normalizeNamespace(namespace), normalizeKey(key));
  if (!row) return undefined;
  return parseJson(row.json_value, undefined);
}

function listNamespaceKeys(namespace) {
  return ensureDb().prepare(`
    SELECT entry_key
      FROM runtime_state_entries
     WHERE namespace = ?
     ORDER BY entry_key ASC
  `).all(normalizeNamespace(namespace)).map((row) => String(row?.entry_key || '').trim()).filter(Boolean);
}

function countNamespaceEntries(namespace) {
  const row = ensureDb().prepare(`
    SELECT COUNT(*) AS total
      FROM runtime_state_entries
     WHERE namespace = ?
  `).get(normalizeNamespace(namespace));
  return Math.max(0, Number(row?.total || 0));
}

function replaceNamespaceObject(namespace, entries = {}) {
  const safeNamespace = normalizeNamespace(namespace);
  const safeEntries = entries && typeof entries === 'object' && !Array.isArray(entries) ? entries : {};
  const database = ensureDb();
  const deleteStmt = database.prepare('DELETE FROM runtime_state_entries WHERE namespace = ?');
  const upsertStmt = database.prepare(`
    INSERT INTO runtime_state_entries (namespace, entry_key, json_value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(namespace, entry_key) DO UPDATE SET
      json_value = excluded.json_value,
      updated_at = excluded.updated_at
  `);

  database.exec('BEGIN IMMEDIATE');
  try {
    deleteStmt.run(safeNamespace);
    const now = Date.now();
    for (const [rawKey, value] of Object.entries(safeEntries)) {
      const safeKey = String(rawKey || '').trim();
      if (!safeKey) continue;
      upsertStmt.run(safeNamespace, safeKey, JSON.stringify(value), now);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function upsertNamespaceEntry(namespace, key, value) {
  ensureDb().prepare(`
    INSERT INTO runtime_state_entries (namespace, entry_key, json_value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(namespace, entry_key) DO UPDATE SET
      json_value = excluded.json_value,
      updated_at = excluded.updated_at
  `).run(
    normalizeNamespace(namespace),
    normalizeKey(key),
    JSON.stringify(value),
    Date.now()
  );
}

function deleteNamespaceEntry(namespace, key) {
  return ensureDb().prepare(`
    DELETE FROM runtime_state_entries
     WHERE namespace = ? AND entry_key = ?
  `).run(normalizeNamespace(namespace), normalizeKey(key));
}

function replaceSingletonValue(namespace, value, key = 'state') {
  upsertNamespaceEntry(namespace, key, value);
}

function clearNamespace(namespace) {
  return ensureDb().prepare(`
    DELETE FROM runtime_state_entries
     WHERE namespace = ?
  `).run(normalizeNamespace(namespace));
}

module.exports = {
  DB_FILE,
  clearNamespace,
  countNamespaceEntries,
  readNamespaceObject,
  readNamespaceEntry,
  readSingletonValue,
  listNamespaceKeys,
  replaceNamespaceObject,
  replaceSingletonValue,
  upsertNamespaceEntry,
  deleteNamespaceEntry
};
