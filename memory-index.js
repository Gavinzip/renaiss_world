const fs = require('fs');
const path = require('path');
const https = require('https');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'memory_index.sqlite');

const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const EMBEDDING_MODEL = String(process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small').trim();
const DEFAULT_NAMESPACE = 'story';
const STRICT_EMBEDDING = true;

const MEMORY_INDEX_CONFIG = {
  maxFactsPerMemory: 2,
  maxFactChars: 180,
  maxMemoryTextChars: 520,
  recallTopK: 8,
  recallCandidateLimit: 140,
  similarityThreshold: 0.22,
  recencyBoost: 0.22,
  sameLocationBoost: 0.2
};

let db = null;
let writeQueue = Promise.resolve();

function clipText(text, maxChars = 120) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (source.length <= maxChars) return source;
  return source.slice(0, maxChars) + '...';
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeNamespace(namespace) {
  const source = String(namespace || DEFAULT_NAMESPACE).trim();
  return source || DEFAULT_NAMESPACE;
}

function normalizeOwnerId(ownerId) {
  const source = String(ownerId || '').trim();
  return source;
}

function sanitizeMemoryPlayerId(raw, fallback = '') {
  const source = String(raw || '').trim().toLowerCase();
  if (!source) return fallback;
  const safe = source
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe || fallback;
}

function getDb() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_vectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      memory_timestamp INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL,
      location TEXT,
      type TEXT,
      content TEXT NOT NULL,
      outcome TEXT,
      tags TEXT,
      importance REAL,
      fact_text TEXT NOT NULL,
      memory_text TEXT NOT NULL,
      embedding_model TEXT,
      embedding_json TEXT,
      UNIQUE(player_id, namespace, fact_text, memory_timestamp)
    );

    CREATE INDEX IF NOT EXISTS idx_memory_vectors_player_ns_ts
      ON memory_vectors(player_id, namespace, memory_timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_memory_vectors_player_ns_location_ts
      ON memory_vectors(player_id, namespace, location, memory_timestamp DESC);
  `);
  return db;
}

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function parseEmbedding(raw) {
  const arr = parseJsonArray(raw);
  if (!arr.length) return null;
  const numeric = arr.map(v => Number(v)).filter(Number.isFinite);
  return numeric.length ? numeric : null;
}

function tokenize(text) {
  const source = String(text || '').toLowerCase();
  if (!source) return [];

  const words = source.match(/[a-z0-9_]+|[\u4e00-\u9fff]+/g) || [];
  const tokens = [];

  for (const word of words) {
    if (/^[\u4e00-\u9fff]+$/.test(word)) {
      if (word.length <= 2) {
        tokens.push(word);
      } else {
        for (let i = 0; i < word.length - 1; i++) {
          tokens.push(word.slice(i, i + 2));
        }
        tokens.push(word);
      }
    } else {
      tokens.push(word);
    }
  }

  return tokens;
}

function lexicalSimilarity(queryText, targetText) {
  const qTokens = tokenize(queryText);
  const tTokens = tokenize(targetText);
  if (!qTokens.length || !tTokens.length) return 0;

  const qMap = new Map();
  const tMap = new Map();

  for (const token of qTokens) {
    qMap.set(token, (qMap.get(token) || 0) + 1);
  }
  for (const token of tTokens) {
    tMap.set(token, (tMap.get(token) || 0) + 1);
  }

  let dot = 0;
  let qNorm = 0;
  let tNorm = 0;

  for (const [, count] of qMap) qNorm += count * count;
  for (const [, count] of tMap) tNorm += count * count;

  for (const [token, qCount] of qMap) {
    const tCount = tMap.get(token) || 0;
    if (tCount > 0) dot += qCount * tCount;
  }

  if (dot <= 0 || qNorm <= 0 || tNorm <= 0) return 0;
  const cosine = dot / (Math.sqrt(qNorm) * Math.sqrt(tNorm));

  const qRaw = String(queryText || '').trim();
  const tRaw = String(targetText || '').trim();
  if (qRaw && tRaw && (tRaw.includes(qRaw) || qRaw.includes(tRaw))) {
    return Math.min(1, cosine + 0.08);
  }
  return cosine;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
  const size = Math.min(a.length, b.length);
  if (!size) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < size; i++) {
    const va = Number(a[i]);
    const vb = Number(b[i]);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function requestEmbedding(inputText) {
  return new Promise((resolve, reject) => {
    if (!OPENAI_API_KEY) {
      reject(new Error('OPENAI_API_KEY missing (memory embedding strict mode)'));
      return;
    }

    const input = clipText(inputText, 4000);
    if (!input) {
      reject(new Error('embedding input is empty'));
      return;
    }

    const body = JSON.stringify({
      model: EMBEDDING_MODEL,
      input
    });

    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            const parsed = JSON.parse(data || '{}');
            const msg = parsed?.error?.message || `HTTP ${res.statusCode}`;
            reject(new Error(`embedding request failed: ${msg}`));
            return;
          }
          const parsed = JSON.parse(data);
          const embedding = parsed?.data?.[0]?.embedding;
          if (!Array.isArray(embedding) || embedding.length === 0) {
            reject(new Error('embedding response missing vector'));
            return;
          }
          resolve(embedding.map(v => Number(v)).filter(Number.isFinite));
        } catch (e) {
          reject(new Error(`embedding parse failed: ${e?.message || e}`));
        }
      });
    });

    req.setTimeout(12000, () => {
      req.destroy(new Error('embedding timeout'));
    });

    req.on('error', (e) => reject(new Error(`embedding network error: ${e?.message || e}`)));
    req.write(body);
    req.end();
  });
}

function buildMemoryText(memory, factText) {
  const type = String(memory?.type || '').trim();
  const content = String(memory?.content || '').trim();
  const outcome = String(memory?.outcome || '').trim();
  const location = String(memory?.location || '').trim();
  const tags = Array.isArray(memory?.tags) ? memory.tags.filter(Boolean).join('、') : '';

  const lines = [];
  if (type) lines.push(`類型:${type}`);
  if (location) lines.push(`地點:${location}`);
  if (content) lines.push(`事件:${content}`);
  if (outcome) lines.push(`結果:${outcome}`);
  if (tags) lines.push(`標籤:${tags}`);
  lines.push(`事實:${factText}`);

  return clipText(lines.join(' | '), MEMORY_INDEX_CONFIG.maxMemoryTextChars);
}

function extractFactsFromMemory(memory) {
  const type = String(memory?.type || '').trim();
  const content = String(memory?.content || '').trim();
  const outcome = String(memory?.outcome || '').trim();
  const location = String(memory?.location || '').trim();
  const tags = Array.isArray(memory?.tags) ? memory.tags.map(t => String(t).trim()).filter(Boolean) : [];

  if (!content) return [];

  const candidates = [];
  const base = `${content}${outcome ? `，結果：${outcome}` : ''}`;
  candidates.push(base);

  if (location) {
    candidates.push(`在${location}，${base}`);
  }

  if (type) {
    candidates.push(`【${type}】${base}`);
  }

  if (tags.length) {
    candidates.push(`${base}（標籤：${tags.slice(0, 4).join('、')}）`);
  }

  const seen = new Set();
  const facts = [];
  for (const item of candidates) {
    const text = clipText(item, MEMORY_INDEX_CONFIG.maxFactChars);
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    facts.push(text);
    if (facts.length >= MEMORY_INDEX_CONFIG.maxFactsPerMemory) break;
  }

  return facts;
}

async function rememberEntityMemoryInternal(ownerId, memory, options = {}) {
  const subjectId = normalizeOwnerId(ownerId);
  if (!subjectId || !memory || !memory.content) return { inserted: 0 };

  const namespace = normalizeNamespace(options.namespace);
  const type = String(memory.type || '').trim();
  const content = clipText(memory.content, 280);
  const outcome = clipText(memory.outcome || '', 280);
  const location = clipText(memory.location || options.defaultLocation || '', 120);
  const tagsArray = Array.isArray(memory.tags) ? memory.tags.map(t => String(t)).filter(Boolean).slice(0, 8) : [];
  const tags = JSON.stringify(tagsArray);
  const importance = safeNumber(memory.importance, 0);
  const memoryTimestamp = safeNumber(memory.timestamp, Date.now());

  const facts = extractFactsFromMemory({ ...memory, content, outcome, location, tags: tagsArray });
  if (facts.length === 0) return { inserted: 0 };

  const insertStmt = getDb().prepare(`
    INSERT OR IGNORE INTO memory_vectors (
      player_id, namespace, memory_timestamp, indexed_at,
      location, type, content, outcome, tags, importance,
      fact_text, memory_text, embedding_model, embedding_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  for (const factText of facts) {
    const memoryText = buildMemoryText({ type, content, outcome, location, tags: tagsArray }, factText);
    const embedding = await requestEmbedding(memoryText);
    const result = insertStmt.run(
      subjectId,
      namespace,
      memoryTimestamp,
      Date.now(),
      location,
      type,
      content,
      outcome,
      tags,
      importance,
      factText,
      memoryText,
      embedding ? EMBEDDING_MODEL : null,
      embedding ? JSON.stringify(embedding) : null
    );
    inserted += safeNumber(result?.changes, 0);
  }

  return { inserted };
}

async function rememberPlayerMemoryInternal(player, memory, options = {}) {
  const playerId = String(player?.id || '').trim();
  if (!playerId) return { inserted: 0 };
  return rememberEntityMemoryInternal(playerId, memory, {
    ...options,
    defaultLocation: player?.location || ''
  });
}

function enqueueWrite(task) {
  writeQueue = writeQueue
    .then(task)
    .catch((err) => {
      const msg = err?.message || String(err);
      console.log('[MemoryIndex] write error:', msg);
      return { inserted: 0, error: msg };
    });
  return writeQueue;
}

function rememberPlayerMemory(player, memory, options = {}) {
  return enqueueWrite(() => rememberPlayerMemoryInternal(player, memory, options));
}

function rememberEntityMemory(ownerId, memory, options = {}) {
  return enqueueWrite(() => rememberEntityMemoryInternal(ownerId, memory, options));
}

async function recallEntityMemories(options = {}) {
  const ownerId = normalizeOwnerId(options.ownerId || options.playerId);
  if (!ownerId) return [];

  const namespaces = Array.isArray(options.namespaces) && options.namespaces.length > 0
    ? options.namespaces.map(normalizeNamespace).filter(Boolean)
    : [normalizeNamespace(options.namespace)];
  if (namespaces.length === 0) return [];

  const topK = Math.max(1, safeNumber(options.topK, MEMORY_INDEX_CONFIG.recallTopK));
  const candidateLimit = Math.max(topK, safeNumber(options.candidateLimit, MEMORY_INDEX_CONFIG.recallCandidateLimit));
  const similarityThreshold = safeNumber(options.similarityThreshold, MEMORY_INDEX_CONFIG.similarityThreshold);
  const recencyBoost = safeNumber(options.recencyBoost, MEMORY_INDEX_CONFIG.recencyBoost);
  const sameLocationBoost = safeNumber(options.sameLocationBoost, MEMORY_INDEX_CONFIG.sameLocationBoost);
  const location = String(options.location || '').trim();
  const queryText = clipText(options.queryText || '', 600);
  const providedEmbedding = Array.isArray(options.queryEmbedding)
    ? options.queryEmbedding.map(v => Number(v)).filter(Number.isFinite)
    : null;
  const queryEmbedding = providedEmbedding && providedEmbedding.length > 0
    ? providedEmbedding
    : (queryText ? await requestEmbedding(queryText) : null);

  const namespacePlaceholders = namespaces.map(() => '?').join(', ');
  const rows = getDb().prepare(`
    SELECT id, player_id, namespace, memory_timestamp, location, type, content, outcome,
           tags, importance, fact_text, memory_text, embedding_json
      FROM memory_vectors
     WHERE player_id = ? AND namespace IN (${namespacePlaceholders})
     ORDER BY memory_timestamp DESC
     LIMIT ?
  `).all(ownerId, ...namespaces, candidateLimit);

  if (!rows.length) return [];
  const now = Date.now();

  const ranked = [];
  for (const row of rows) {
    const contentText = `${row.fact_text || ''}\n${row.memory_text || ''}`;
    let similarity = 0;

    if (queryEmbedding) {
      const rowEmbedding = parseEmbedding(row.embedding_json);
      if (!rowEmbedding) {
        if (STRICT_EMBEDDING) {
          throw new Error('indexed memory missing embedding vector, please run npm run reindex:memory');
        }
        similarity = lexicalSimilarity(queryText, contentText);
      } else {
        similarity = cosineSimilarity(queryEmbedding, rowEmbedding);
      }
    } else if (queryText) {
      if (STRICT_EMBEDDING) {
        throw new Error('query embedding unavailable in strict mode');
      }
      similarity = lexicalSimilarity(queryText, contentText);
    }

    const ageHours = Math.max(0, (now - safeNumber(row.memory_timestamp, now)) / (3600 * 1000));
    const recency = Math.exp(-ageHours / (24 * 7));
    const localBoost = location && row.location && String(row.location).trim() === location ? sameLocationBoost : 0;
    const importanceBoost = Math.max(0, Math.min(5, safeNumber(row.importance, 0))) * 0.03;

    if (queryEmbedding && similarity < similarityThreshold && localBoost <= 0) {
      continue;
    }
    if (!queryEmbedding && queryText && similarity < 0.05 && localBoost <= 0) {
      continue;
    }

    const score = similarity + recencyBoost * recency + localBoost + importanceBoost;

    ranked.push({
      id: row.id,
      ownerId: String(row.player_id || ''),
      namespace: String(row.namespace || ''),
      type: String(row.type || ''),
      content: String(row.content || ''),
      outcome: String(row.outcome || ''),
      location: String(row.location || ''),
      tags: parseJsonArray(row.tags),
      factText: String(row.fact_text || ''),
      memoryTimestamp: safeNumber(row.memory_timestamp, now),
      similarity: Number(similarity.toFixed(4)),
      score: Number(score.toFixed(4))
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.memoryTimestamp - a.memoryTimestamp;
  });

  const dedup = [];
  const seen = new Set();
  for (const row of ranked) {
    const key = `${row.type}|${row.content}|${row.memoryTimestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(row);
    if (dedup.length >= topK) break;
  }

  return dedup;
}

async function recallPlayerMemories(options = {}) {
  return recallEntityMemories({
    ...options,
    ownerId: options.playerId
  });
}

function clearEntityNamespace(ownerId, namespace = DEFAULT_NAMESPACE) {
  const owner = normalizeOwnerId(ownerId);
  if (!owner) return 0;
  const ns = normalizeNamespace(namespace);
  const result = getDb().prepare('DELETE FROM memory_vectors WHERE player_id = ? AND namespace = ?').run(owner, ns);
  return safeNumber(result?.changes, 0);
}

function clearPlayerNamespace(playerId, namespace = DEFAULT_NAMESPACE) {
  return clearEntityNamespace(playerId, namespace);
}

function clearPlayerRelatedMemories(playerId) {
  const owner = normalizeOwnerId(playerId);
  if (!owner) return 0;
  const playerNsKey = sanitizeMemoryPlayerId(playerId, '');
  const privateNamespace = playerNsKey ? `npc_private:${playerNsKey}` : '';

  let totalChanges = 0;
  const byOwner = getDb().prepare('DELETE FROM memory_vectors WHERE player_id = ?').run(owner);
  totalChanges += safeNumber(byOwner?.changes, 0);

  if (privateNamespace) {
    const byPrivateNamespace = getDb()
      .prepare('DELETE FROM memory_vectors WHERE namespace = ?')
      .run(privateNamespace);
    totalChanges += safeNumber(byPrivateNamespace?.changes, 0);
  }

  return totalChanges;
}

function clearAllMemories() {
  const result = getDb().prepare('DELETE FROM memory_vectors').run();
  return safeNumber(result?.changes, 0);
}

function rebuildEntityIndexFromMemories(ownerId, memories, options = {}) {
  const owner = normalizeOwnerId(ownerId);
  if (!owner) return Promise.resolve({ inserted: 0, cleared: 0 });
  const namespace = normalizeNamespace(options.namespace);
  const source = Array.isArray(memories) ? memories.slice() : [];

  return enqueueWrite(async () => {
    const cleared = clearEntityNamespace(owner, namespace);
    let inserted = 0;

    const ordered = source
      .filter(Boolean)
      .slice()
      .sort((a, b) => safeNumber(a.timestamp, 0) - safeNumber(b.timestamp, 0));

    for (const memory of ordered) {
      const res = await rememberEntityMemoryInternal(owner, memory, { namespace });
      inserted += safeNumber(res?.inserted, 0);
    }

    return { inserted, cleared };
  });
}

function rebuildPlayerIndexFromMemories(player, memories, options = {}) {
  const playerId = String(player?.id || '').trim();
  if (!playerId) return Promise.resolve({ inserted: 0, cleared: 0 });
  return rebuildEntityIndexFromMemories(playerId, memories, options);
}

function getEntityIndexStats(ownerId, namespace = DEFAULT_NAMESPACE) {
  const owner = normalizeOwnerId(ownerId);
  if (!owner) return null;
  const ns = normalizeNamespace(namespace);

  const row = getDb().prepare(`
    SELECT COUNT(*) AS count,
           MIN(memory_timestamp) AS oldest,
           MAX(memory_timestamp) AS latest
      FROM memory_vectors
     WHERE player_id = ? AND namespace = ?
  `).get(owner, ns);

  return {
    ownerId: owner,
    playerId: owner,
    namespace: ns,
    count: safeNumber(row?.count, 0),
    oldest: safeNumber(row?.oldest, 0),
    latest: safeNumber(row?.latest, 0),
    embeddingEnabled: Boolean(OPENAI_API_KEY),
    embeddingModel: EMBEDDING_MODEL,
    strictEmbedding: STRICT_EMBEDDING
  };
}

function getIndexStats(playerId, namespace = DEFAULT_NAMESPACE) {
  return getEntityIndexStats(playerId, namespace);
}

module.exports = {
  rememberEntityMemory,
  rememberPlayerMemory,
  recallEntityMemories,
  recallPlayerMemories,
  rebuildEntityIndexFromMemories,
  rebuildPlayerIndexFromMemories,
  clearEntityNamespace,
  clearPlayerNamespace,
  clearPlayerRelatedMemories,
  clearAllMemories,
  getEntityIndexStats,
  getIndexStats,
  isEmbeddingEnabled: () => Boolean(OPENAI_API_KEY),
  isStrictEmbedding: () => STRICT_EMBEDDING,
  getEmbeddingModel: () => EMBEDDING_MODEL
};
