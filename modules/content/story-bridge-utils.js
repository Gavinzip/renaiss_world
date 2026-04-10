function createStoryBridgeUtils(deps = {}) {
  const {
    MAINLINE_BRIDGE_LOCK_TTL_TURNS = 2
  } = deps;

  function formatRecoveryTurnsShort(turns = 0) {
    const safe = Math.max(0, Math.floor(Number(turns) || 0));
    return `${safe}回合`;
  }

  function normalizePendingStoryTrigger(raw = null) {
    if (!raw || typeof raw !== 'object') return null;
    const choice = String(raw.choice || '').trim().slice(0, 220);
    const desc = String(raw.desc || '').trim().slice(0, 320);
    const outcome = String(raw.outcome || '').trim().slice(0, 1200);
    const name = String(raw.name || '').trim().slice(0, 120);
    const action = String(raw.action || '').trim().slice(0, 80);
    const source = String(raw.source || '').trim().slice(0, 80);
    const forceFreshStory = Boolean(raw.forceFreshStory);
    if (!choice && !desc && !outcome && !name && !action) return null;
    return {
      name: name || '後續推進',
      choice,
      desc,
      action: action || 'followup',
      outcome,
      source: source || 'system',
      forceFreshStory,
      createdAt: Number(raw.createdAt || Date.now()) || Date.now()
    };
  }

  function queuePendingStoryTrigger(player, trigger = {}) {
    if (!player || typeof player !== 'object') return;
    const normalized = normalizePendingStoryTrigger({
      ...trigger,
      forceFreshStory: true,
      createdAt: Date.now()
    });
    if (!normalized) return;
    player.pendingStoryTrigger = normalized;
  }

  function getPendingStoryTrigger(player) {
    return normalizePendingStoryTrigger(player?.pendingStoryTrigger || null);
  }

  function clearPendingStoryTrigger(player) {
    if (!player || typeof player !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(player, 'pendingStoryTrigger')) {
      delete player.pendingStoryTrigger;
    }
  }

  function normalizeMainlineBridgeLock(raw = null, player = null) {
    if (!raw || typeof raw !== 'object') return null;
    const goal = String(raw.goal || raw.mainlineGoal || '').trim().slice(0, 220);
    if (!goal) return null;
    const location = String(raw.location || player?.location || '').trim().slice(0, 40);
    const stage = Math.max(1, Math.floor(Number(raw.stage || raw.mainlineStage || 1) || 1));
    const stageCount = Math.max(stage, Math.floor(Number(raw.stageCount || raw.mainlineStageCount || 8) || 8));
    const progress = String(raw.progress || raw.mainlineProgress || `地區進度 ${stage}/${stageCount}`).trim().slice(0, 80);
    const sourceChoice = String(raw.sourceChoice || '').trim().slice(0, 220);
    const createdAt = Number(raw.createdAt || Date.now()) || Date.now();
    const currentTurn = Math.max(0, Math.floor(Number(player?.storyTurns || 0)));
    const expireRaw = Number(raw.expireTurn);
    const expireTurn = Number.isFinite(expireRaw)
      ? Math.max(currentTurn, Math.floor(expireRaw))
      : (currentTurn + MAINLINE_BRIDGE_LOCK_TTL_TURNS);
    return {
      goal,
      location,
      stage,
      stageCount,
      progress,
      sourceChoice,
      createdAt,
      expireTurn
    };
  }

  function getMainlineBridgeLock(player, options = {}) {
    if (!player || typeof player !== 'object') return null;
    const autoClear = options?.autoClear !== false;
    const normalized = normalizeMainlineBridgeLock(player.mainlineBridgeLock, player);
    if (!normalized) {
      if (autoClear && Object.prototype.hasOwnProperty.call(player, 'mainlineBridgeLock')) {
        delete player.mainlineBridgeLock;
      }
      return null;
    }
    const currentTurn = Math.max(0, Math.floor(Number(player?.storyTurns || 0)));
    if (currentTurn > Number(normalized.expireTurn || 0)) {
      if (autoClear && Object.prototype.hasOwnProperty.call(player, 'mainlineBridgeLock')) {
        delete player.mainlineBridgeLock;
      }
      return null;
    }
    if (autoClear && JSON.stringify(player.mainlineBridgeLock || {}) !== JSON.stringify(normalized)) {
      player.mainlineBridgeLock = normalized;
    }
    return normalized;
  }

  function setMainlineBridgeLock(player, payload = {}) {
    if (!player || typeof player !== 'object') return null;
    const currentTurn = Math.max(0, Math.floor(Number(player?.storyTurns || 0)));
    const normalized = normalizeMainlineBridgeLock({
      ...payload,
      createdAt: Date.now(),
      expireTurn: currentTurn + MAINLINE_BRIDGE_LOCK_TTL_TURNS
    }, player);
    if (!normalized) return null;
    player.mainlineBridgeLock = normalized;
    return normalized;
  }

  function clearMainlineBridgeLock(player) {
    if (!player || typeof player !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(player, 'mainlineBridgeLock')) {
      delete player.mainlineBridgeLock;
    }
  }

  function consumeMainlineBridgeLock(player) {
    const lock = getMainlineBridgeLock(player, { autoClear: false });
    clearMainlineBridgeLock(player);
    return lock;
  }

  return {
    formatRecoveryTurnsShort,
    normalizePendingStoryTrigger,
    queuePendingStoryTrigger,
    getPendingStoryTrigger,
    clearPendingStoryTrigger,
    normalizeMainlineBridgeLock,
    getMainlineBridgeLock,
    setMainlineBridgeLock,
    clearMainlineBridgeLock,
    consumeMainlineBridgeLock
  };
}

module.exports = {
  createStoryBridgeUtils
};

