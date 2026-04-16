const { createSqliteMirroredObjectRepository } = require('./sqlite-mirrored-state');

function normalizeWalletEntry(entry = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const next = { ...entry };
  if (next.walletAddress !== undefined && next.walletAddress !== null) {
    next.walletAddress = String(next.walletAddress).toLowerCase().trim();
  }
  return next;
}

function normalizeWalletSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [userId, entry] of Object.entries(value)) {
    const normalizedEntry = normalizeWalletEntry(entry);
    if (!normalizedEntry) continue;
    out[String(userId || '').trim()] = normalizedEntry;
  }
  return out;
}

function createWalletSettingsRepository(options = {}) {
  const filePath = String(options.filePath || '').trim();
  const store = createSqliteMirroredObjectRepository({
    namespace: String(options.namespace || 'wallet_settings'),
    mirrorFilePath: filePath,
    defaultValueFactory: () => ({}),
    normalizeAll: normalizeWalletSettings,
    normalizeEntry: normalizeWalletEntry,
    onWriteError: (error) => {
      console.error('[錢包] 儲存失敗:', error?.message || error);
    }
  });

  function getAll() {
    return store.getAll();
  }

  function replaceAll(settings) {
    return store.replaceAll(settings);
  }

  function getWallet(discordUserId) {
    const userId = String(discordUserId || '').trim();
    if (!userId) return null;
    return store.getEntry(userId);
  }

  function getWalletAddress(discordUserId) {
    return getWallet(discordUserId)?.walletAddress || null;
  }

  function setWallet(discordUserId, walletData) {
    const userId = String(discordUserId || '').trim();
    if (!userId) return null;
    const normalized = normalizeWalletEntry(walletData);
    if (!normalized) return null;
    return store.setEntry(userId, normalized);
  }

  function updateWallet(discordUserId, updater) {
    const userId = String(discordUserId || '').trim();
    if (!userId || typeof updater !== 'function') return null;
    return store.updateEntry(userId, (current) => {
      const base = normalizeWalletEntry(current || {}) || {};
      const result = updater({ ...base });
      if (result === null) return null;
      return normalizeWalletEntry(result === undefined ? base : result) || null;
    });
  }

  function deleteWallet(discordUserId) {
    const userId = String(discordUserId || '').trim();
    if (!userId) return false;
    return store.deleteEntry(userId);
  }

  async function flush() {
    await store.flush();
  }

  return {
    deleteWallet,
    flush,
    getAll,
    getWallet,
    getWalletAddress,
    replaceAll,
    setWallet,
    updateWallet
  };
}

module.exports = {
  createWalletSettingsRepository
};
