const path = require('path');
const {
  atomicWriteJson,
  deepCloneJson,
  safeReadJsonFileSync
} = require('./queued-json-store');
const {
  readNamespaceObject,
  readSingletonValue,
  replaceNamespaceObject,
  replaceSingletonValue,
  upsertNamespaceEntry,
  deleteNamespaceEntry
} = require('./runtime-state-sqlite');

const SHARED_OBJECT_REPOSITORIES = new Map();
const SHARED_SINGLETON_STORES = new Map();

function normalizeMirrorPath(filePath = '') {
  const source = String(filePath || '').trim();
  return source ? path.resolve(source) : '';
}

function normalizeNamespace(namespace = '') {
  const safe = String(namespace || '').trim();
  if (!safe) throw new Error('namespace is required');
  return safe;
}

function defaultObjectNormalizer(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function createSqliteMirroredObjectRepository(options = {}) {
  const namespace = normalizeNamespace(options.namespace);
  const mirrorFilePath = normalizeMirrorPath(options.mirrorFilePath);
  const sharedKey = `${namespace}::${mirrorFilePath}`;
  if (SHARED_OBJECT_REPOSITORIES.has(sharedKey)) {
    return SHARED_OBJECT_REPOSITORIES.get(sharedKey);
  }

  const normalizeEntry = typeof options.normalizeEntry === 'function'
    ? options.normalizeEntry
    : (value) => value;
  const normalizeAll = typeof options.normalizeAll === 'function'
    ? options.normalizeAll
    : defaultObjectNormalizer;
  const defaultValueFactory = typeof options.defaultValueFactory === 'function'
    ? options.defaultValueFactory
    : () => ({});
  const onWriteError = typeof options.onWriteError === 'function'
    ? options.onWriteError
    : () => {};

  function normalizeState(value = {}) {
    const safeSource = normalizeAll(value);
    const out = {};
    for (const [rawKey, rawValue] of Object.entries(safeSource || {})) {
      const safeKey = String(rawKey || '').trim();
      if (!safeKey) continue;
      const normalizedValue = normalizeEntry(rawValue, safeKey);
      if (normalizedValue === null || normalizedValue === undefined) continue;
      out[safeKey] = normalizedValue;
    }
    return out;
  }

  function loadInitialState() {
    const fromDb = normalizeState(readNamespaceObject(namespace));
    if (Object.keys(fromDb).length > 0) return fromDb;
    const fromMirror = mirrorFilePath
      ? normalizeState(safeReadJsonFileSync(mirrorFilePath, defaultValueFactory, normalizeState))
      : normalizeState(defaultValueFactory());
    if (Object.keys(fromMirror).length > 0) {
      replaceNamespaceObject(namespace, fromMirror);
    }
    return fromMirror;
  }

  let cache = loadInitialState();
  let writeQueue = Promise.resolve();

  function enqueuePersist(task) {
    writeQueue = writeQueue
      .then(task)
      .catch((error) => {
        onWriteError(error);
        return null;
      });
    return writeQueue;
  }

  function readAll() {
    return deepCloneJson(cache);
  }

  function replaceAll(nextValue) {
    cache = normalizeState(nextValue);
    const snapshot = deepCloneJson(cache);
    enqueuePersist(async () => {
      replaceNamespaceObject(namespace, snapshot);
      if (mirrorFilePath) await atomicWriteJson(mirrorFilePath, snapshot);
    });
    return readAll();
  }

  function getEntry(key) {
    const safeKey = String(key || '').trim();
    if (!safeKey) return null;
    const current = cache[safeKey];
    return current === undefined ? null : deepCloneJson(current);
  }

  function setEntry(key, value) {
    const safeKey = String(key || '').trim();
    if (!safeKey) return null;
    const normalizedValue = normalizeEntry(value, safeKey);
    if (normalizedValue === null || normalizedValue === undefined) return null;
    cache[safeKey] = normalizedValue;
    const snapshot = deepCloneJson(cache);
    const persistedValue = deepCloneJson(normalizedValue);
    enqueuePersist(async () => {
      upsertNamespaceEntry(namespace, safeKey, persistedValue);
      if (mirrorFilePath) await atomicWriteJson(mirrorFilePath, snapshot);
    });
    return deepCloneJson(normalizedValue);
  }

  function updateEntry(key, updater) {
    const safeKey = String(key || '').trim();
    if (!safeKey || typeof updater !== 'function') return null;
    const current = cache[safeKey] === undefined ? null : deepCloneJson(cache[safeKey]);
    const draft = current && typeof current === 'object' && !Array.isArray(current)
      ? { ...current }
      : current;
    const result = updater(draft);
    if (result === null) {
      return deleteEntry(safeKey) ? null : null;
    }
    const nextValue = result === undefined ? draft : result;
    return setEntry(safeKey, nextValue);
  }

  function deleteEntry(key) {
    const safeKey = String(key || '').trim();
    if (!safeKey || !Object.prototype.hasOwnProperty.call(cache, safeKey)) return false;
    delete cache[safeKey];
    const snapshot = deepCloneJson(cache);
    enqueuePersist(async () => {
      deleteNamespaceEntry(namespace, safeKey);
      if (mirrorFilePath) await atomicWriteJson(mirrorFilePath, snapshot);
    });
    return true;
  }

  async function flush() {
    await writeQueue;
  }

  const repository = {
    deleteEntry,
    flush,
    getAll: readAll,
    getEntry,
    replaceAll,
    setEntry,
    updateEntry
  };

  SHARED_OBJECT_REPOSITORIES.set(sharedKey, repository);
  return repository;
}

function createSqliteMirroredSingletonStore(options = {}) {
  const namespace = normalizeNamespace(options.namespace);
  const mirrorFilePath = normalizeMirrorPath(options.mirrorFilePath);
  const sharedKey = `${namespace}::${mirrorFilePath}`;
  if (SHARED_SINGLETON_STORES.has(sharedKey)) {
    return SHARED_SINGLETON_STORES.get(sharedKey);
  }

  const normalize = typeof options.normalize === 'function'
    ? options.normalize
    : (value) => value;
  const defaultValueFactory = typeof options.defaultValueFactory === 'function'
    ? options.defaultValueFactory
    : () => ({});
  const onWriteError = typeof options.onWriteError === 'function'
    ? options.onWriteError
    : () => {};

  function normalizeState(value) {
    return normalize(deepCloneJson(value === undefined ? defaultValueFactory() : value));
  }

  function loadInitialState() {
    const fromDb = readSingletonValue(namespace);
    if (fromDb !== undefined) return normalizeState(fromDb);
    const fromMirror = mirrorFilePath
      ? safeReadJsonFileSync(mirrorFilePath, defaultValueFactory, normalizeState)
      : normalizeState(defaultValueFactory());
    replaceSingletonValue(namespace, fromMirror);
    return fromMirror;
  }

  let cache = loadInitialState();
  let writeQueue = Promise.resolve();

  function enqueuePersist(task) {
    writeQueue = writeQueue
      .then(task)
      .catch((error) => {
        onWriteError(error);
        return null;
      });
    return writeQueue;
  }

  function read() {
    return deepCloneJson(cache);
  }

  function replace(nextValue) {
    cache = normalizeState(nextValue);
    const snapshot = deepCloneJson(cache);
    enqueuePersist(async () => {
      replaceSingletonValue(namespace, snapshot);
      if (mirrorFilePath) await atomicWriteJson(mirrorFilePath, snapshot);
    });
    return read();
  }

  function update(updater) {
    const draft = deepCloneJson(cache);
    const result = typeof updater === 'function' ? updater(draft) : draft;
    const nextValue = result === undefined ? draft : result;
    return replace(nextValue);
  }

  async function flush() {
    await writeQueue;
  }

  const store = {
    flush,
    read,
    replace,
    update
  };

  SHARED_SINGLETON_STORES.set(sharedKey, store);
  return store;
}

module.exports = {
  createSqliteMirroredObjectRepository,
  createSqliteMirroredSingletonStore
};
