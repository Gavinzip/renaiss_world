function createTeleportDeviceUtils(deps = {}) {
  const durationMs = Math.max(1, Number(deps.durationMs || 6 * 60 * 60 * 1000));
  const stockLimit = Math.max(10, Number(deps.stockLimit || 999));
  const getLocationPortalHub = deps.getLocationPortalHub;

  function formatTeleportDeviceRemaining(ms = 0) {
    const safe = Math.max(0, Number(ms || 0));
    const totalMinutes = Math.ceil(safe / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}m`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }

  function normalizeTeleportDeviceStock(player, options = {}) {
    if (!player || typeof player !== 'object') return [];
    const nowMs = Number(options.nowMs || Date.now());
    const existingRaw = Array.isArray(player.teleportDeviceStock) ? player.teleportDeviceStock : [];
    const existing = [];
    for (const item of existingRaw) {
      if (Number.isFinite(Number(item))) {
        existing.push(Number(item));
        continue;
      }
      if (item && typeof item === 'object' && Number.isFinite(Number(item.expiresAt))) {
        existing.push(Number(item.expiresAt));
      }
    }

    let legacyCount = 0;
    if (Boolean(player.teleportDeviceOwned)) legacyCount += 1;
    if (Array.isArray(player.inventory) && player.inventory.length > 0) {
      const kept = [];
      for (const item of player.inventory) {
        const text = String(item || '').trim();
        if (/Teleport Device/i.test(text) || /傳送裝置/u.test(text)) {
          const countMatch = text.match(/x\s*(\d+)/i) || text.match(/×\s*(\d+)/u);
          legacyCount += Math.max(1, Number(countMatch?.[1] || 1));
          continue;
        }
        kept.push(item);
      }
      if (kept.length !== player.inventory.length) {
        player.inventory = kept;
      }
    }
    if (Object.prototype.hasOwnProperty.call(player, 'teleportDeviceOwned')) {
      delete player.teleportDeviceOwned;
    }

    const normalized = existing
      .filter((expiresAt) => Number.isFinite(expiresAt) && expiresAt > nowMs)
      .sort((a, b) => a - b)
      .slice(0, stockLimit);

    if (legacyCount > 0 && normalized.length === 0) {
      const count = Math.max(1, Math.min(legacyCount, stockLimit));
      for (let i = 0; i < count; i += 1) {
        normalized.push(nowMs + durationMs);
      }
    }

    player.teleportDeviceStock = normalized;
    return normalized;
  }

  function getTeleportDeviceStockInfo(player, options = {}) {
    const nowMs = Number(options.nowMs || Date.now());
    const stock = normalizeTeleportDeviceStock(player, { nowMs });
    const count = stock.length;
    const soonestExpiresAt = count > 0 ? stock[0] : 0;
    const soonestRemainingMs = Math.max(0, soonestExpiresAt - nowMs);
    return {
      count,
      stock,
      soonestExpiresAt,
      soonestRemainingMs
    };
  }

  function playerOwnsTeleportDevice(player) {
    const info = getTeleportDeviceStockInfo(player);
    return info.count > 0;
  }

  function grantTeleportDevice(player, count = 1, options = {}) {
    if (!player || typeof player !== 'object') return;
    const nowMs = Number(options.nowMs || Date.now());
    const info = getTeleportDeviceStockInfo(player, { nowMs });
    const add = Math.max(1, Number(count || 1));
    const capped = Math.max(0, stockLimit - info.count);
    const actual = Math.min(add, capped);
    for (let i = 0; i < actual; i += 1) {
      info.stock.push(nowMs + durationMs);
    }
    info.stock.sort((a, b) => a - b);
    player.teleportDeviceStock = info.stock.slice(0, stockLimit);
    return actual;
  }

  function consumeTeleportDevice(player, options = {}) {
    if (!player || typeof player !== 'object') return null;
    const nowMs = Number(options.nowMs || Date.now());
    const stock = normalizeTeleportDeviceStock(player, { nowMs });
    if (stock.length <= 0) return null;
    const consumedExpiresAt = stock.shift();
    player.teleportDeviceStock = stock;
    return {
      consumedExpiresAt,
      remainingCount: stock.length
    };
  }

  function isMainPortalHubLocation(location = '') {
    const loc = String(location || '').trim();
    if (!loc || typeof getLocationPortalHub !== 'function') return false;
    return String(getLocationPortalHub(loc) || '').trim() === loc;
  }

  return {
    formatTeleportDeviceRemaining,
    normalizeTeleportDeviceStock,
    getTeleportDeviceStockInfo,
    playerOwnsTeleportDevice,
    grantTeleportDevice,
    consumeTeleportDevice,
    isMainPortalHubLocation
  };
}

module.exports = {
  createTeleportDeviceUtils
};
