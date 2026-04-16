const fs = require('fs');
const path = require('path');

const SHARED_FILE_STORES = new Map();

function deepCloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeObjectRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function safeReadJsonFileSync(filePath, defaultValueFactory = () => ({}), normalize = (value) => value) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return normalize(deepCloneJson(defaultValueFactory()));
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalize(parsed);
  } catch {
    return normalize(deepCloneJson(defaultValueFactory()));
  }
}

async function atomicWriteJson(filePath, data) {
  const dirPath = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const tempPath = path.join(
    dirPath,
    `.${baseName}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  const payload = JSON.stringify(data, null, 2);

  await fs.promises.mkdir(dirPath, { recursive: true });
  try {
    await fs.promises.writeFile(tempPath, payload, 'utf8');
    await fs.promises.rename(tempPath, filePath);
  } finally {
    try {
      await fs.promises.rm(tempPath, { force: true });
    } catch {
      // ignore cleanup failure
    }
  }
}

function getSharedQueuedJsonFileStore(options = {}) {
  const filePath = String(options.filePath || '').trim();
  if (!filePath) {
    throw new Error('filePath is required');
  }

  const normalizedPath = path.resolve(filePath);
  if (SHARED_FILE_STORES.has(normalizedPath)) {
    return SHARED_FILE_STORES.get(normalizedPath);
  }

  const defaultValueFactory = typeof options.defaultValueFactory === 'function'
    ? options.defaultValueFactory
    : () => ({});
  const normalize = typeof options.normalize === 'function'
    ? options.normalize
    : (value) => value;
  const onWriteError = typeof options.onWriteError === 'function'
    ? options.onWriteError
    : () => {};

  let cache = safeReadJsonFileSync(normalizedPath, defaultValueFactory, normalize);
  let writeQueue = Promise.resolve();

  function read() {
    return deepCloneJson(cache);
  }

  function peek() {
    return cache;
  }

  function enqueuePersist(nextState) {
    const snapshot = deepCloneJson(nextState);
    writeQueue = writeQueue
      .then(() => atomicWriteJson(normalizedPath, snapshot))
      .catch((error) => {
        onWriteError(error);
        return null;
      });
    return writeQueue;
  }

  function replace(nextValue) {
    cache = normalize(deepCloneJson(nextValue));
    enqueuePersist(cache);
    return read();
  }

  function update(updater) {
    const draft = deepCloneJson(cache);
    const result = updater(draft);
    const nextValue = result === undefined ? draft : result;
    cache = normalize(deepCloneJson(nextValue));
    enqueuePersist(cache);
    return read();
  }

  async function flush() {
    await writeQueue;
  }

  const store = {
    filePath: normalizedPath,
    read,
    peek,
    replace,
    update,
    flush
  };

  SHARED_FILE_STORES.set(normalizedPath, store);
  return store;
}

function createQueuedJsonObjectRegistry() {
  function getStore(filePath) {
    return getSharedQueuedJsonFileStore({
      filePath,
      defaultValueFactory: () => ({}),
      normalize: normalizeObjectRecord
    });
  }

  function loadJsonObject(filePath) {
    const target = String(filePath || '').trim();
    if (!target) return {};
    return getStore(target).read();
  }

  function saveJsonObject(filePath, data) {
    const target = String(filePath || '').trim();
    if (!target) return {};
    return getStore(target).replace(data);
  }

  async function flushJsonObject(filePath) {
    const target = String(filePath || '').trim();
    if (!target) return;
    await getStore(target).flush();
  }

  return {
    loadJsonObject,
    saveJsonObject,
    flushJsonObject
  };
}

module.exports = {
  atomicWriteJson,
  createQueuedJsonObjectRegistry,
  deepCloneJson,
  getSharedQueuedJsonFileStore,
  normalizeObjectRecord,
  safeReadJsonFileSync
};
