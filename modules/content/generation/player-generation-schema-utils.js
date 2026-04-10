function createPlayerGenerationSchemaUtils(deps = {}) {
  const {
    ensurePlayerCodexSchema = () => false,
    normalizeMapViewMode = (mode) => mode,
    normalizeNpcDialogueLog = (logs = []) => logs,
    normalizeStoryDialoguePins = (pins = []) => pins,
    normalizeMainlineForeshadowPins = (pins = []) => pins,
    normalizePendingConflictFollowupState = () => null,
    normalizeRecentChoiceHistory = (history = []) => history,
    normalizeMainlineBridgeLock = () => null,
    normalizeGenerationStatus = (status) => String(status || 'idle'),
    cloneChoiceSnapshot = (choices = []) => (Array.isArray(choices) ? choices : []),
    GENERATION_PENDING_STALE_MS = 180000,
    GENERATION_HISTORY_LIMIT = 20
  } = deps;

  function ensurePlayerGenerationSchema(player) {
    if (!player || typeof player !== 'object') return false;
    let mutated = false;

    if (ensurePlayerCodexSchema(player)) {
      mutated = true;
    }

    if (typeof player.currentStory !== 'string') {
      player.currentStory = player.currentStory ? String(player.currentStory) : '';
      mutated = true;
    }
    if (!Array.isArray(player.eventChoices)) {
      player.eventChoices = [];
      mutated = true;
    }
    if (!Array.isArray(player.generationHistory)) {
      player.generationHistory = [];
      mutated = true;
    }
    const normalizedMapViewMode = normalizeMapViewMode(player.mapViewMode);
    if (player.mapViewMode !== normalizedMapViewMode) {
      player.mapViewMode = normalizedMapViewMode;
      mutated = true;
    }
    if (!Number.isFinite(Number(player.lastQuickShopTurn))) {
      player.lastQuickShopTurn = 0;
      mutated = true;
    } else {
      const normalizedLastQuickShopTurn = Math.max(0, Math.floor(Number(player.lastQuickShopTurn)));
      if (normalizedLastQuickShopTurn !== Number(player.lastQuickShopTurn)) {
        player.lastQuickShopTurn = normalizedLastQuickShopTurn;
        mutated = true;
      }
    }
    const normalizedNpcLog = normalizeNpcDialogueLog(player.npcDialogueLog);
    if (JSON.stringify(player.npcDialogueLog || []) !== JSON.stringify(normalizedNpcLog)) {
      player.npcDialogueLog = normalizedNpcLog;
      mutated = true;
    }
    const currentTurn = Math.max(0, Math.floor(Number(player.storyTurns || 0)));
    const normalizedStoryPins = normalizeStoryDialoguePins(player.storyDialoguePins, currentTurn);
    if (JSON.stringify(player.storyDialoguePins || []) !== JSON.stringify(normalizedStoryPins)) {
      player.storyDialoguePins = normalizedStoryPins;
      mutated = true;
    }
    const normalizedMainlinePins = normalizeMainlineForeshadowPins(player.mainlineForeshadowPins, currentTurn);
    if (JSON.stringify(player.mainlineForeshadowPins || []) !== JSON.stringify(normalizedMainlinePins)) {
      player.mainlineForeshadowPins = normalizedMainlinePins;
      mutated = true;
    }
    const normalizedPendingConflict = normalizePendingConflictFollowupState(player.pendingConflictFollowup, currentTurn);
    if (normalizedPendingConflict) {
      if (JSON.stringify(player.pendingConflictFollowup || {}) !== JSON.stringify(normalizedPendingConflict)) {
        player.pendingConflictFollowup = normalizedPendingConflict;
        mutated = true;
      }
    } else if (Object.prototype.hasOwnProperty.call(player, 'pendingConflictFollowup')) {
      delete player.pendingConflictFollowup;
      mutated = true;
    }
    const normalizedRecentChoices = normalizeRecentChoiceHistory(player.recentChoiceHistory);
    if (JSON.stringify(player.recentChoiceHistory || []) !== JSON.stringify(normalizedRecentChoices)) {
      player.recentChoiceHistory = normalizedRecentChoices;
      mutated = true;
    }
    const normalizedMainlineBridge = normalizeMainlineBridgeLock(player.mainlineBridgeLock, player);
    const activeMainlineBridge = normalizedMainlineBridge && currentTurn <= Number(normalizedMainlineBridge.expireTurn || 0)
      ? normalizedMainlineBridge
      : null;
    if (activeMainlineBridge) {
      if (JSON.stringify(player.mainlineBridgeLock || {}) !== JSON.stringify(activeMainlineBridge)) {
        player.mainlineBridgeLock = activeMainlineBridge;
        mutated = true;
      }
    } else if (Object.prototype.hasOwnProperty.call(player, 'mainlineBridgeLock')) {
      delete player.mainlineBridgeLock;
      mutated = true;
    }

    const rawState = player.generationState && typeof player.generationState === 'object'
      ? player.generationState
      : {};
    if (player.generationState !== rawState) mutated = true;

    const normalizedState = {
      id: rawState.id ? String(rawState.id) : null,
      source: rawState.source ? String(rawState.source) : 'none',
      status: normalizeGenerationStatus(rawState.status),
      phase: rawState.phase ? String(rawState.phase) : 'idle',
      startedAt: Number(rawState.startedAt) || 0,
      updatedAt: Number(rawState.updatedAt) || 0,
      sourceChoice: rawState.sourceChoice ? String(rawState.sourceChoice) : '',
      lastError: rawState.lastError || null,
      storySnapshot: rawState.storySnapshot ? String(rawState.storySnapshot) : '',
      choicesSnapshot: cloneChoiceSnapshot(rawState.choicesSnapshot),
      loadingMessageId: rawState.loadingMessageId ? String(rawState.loadingMessageId) : null,
      attempts: Math.max(0, Number(rawState.attempts) || 0)
    };

    if (normalizedState.status === 'pending') {
      const now = Date.now();
      const staleBase = Math.max(0, Number(normalizedState.updatedAt || normalizedState.startedAt || 0));
      const elapsed = staleBase > 0 ? now - staleBase : 0;
      if (elapsed > GENERATION_PENDING_STALE_MS) {
        normalizedState.status = 'failed';
        normalizedState.phase = 'stale_pending_recovered';
        normalizedState.loadingMessageId = null;
        normalizedState.lastError = {
          message: `generation pending stale timeout (${elapsed}ms)`,
          at: now,
          phase: 'stale_pending_recovered'
        };
        normalizedState.updatedAt = now;
        normalizedState.storySnapshot = normalizedState.storySnapshot || String(player.currentStory || '');
        normalizedState.choicesSnapshot = cloneChoiceSnapshot(normalizedState.choicesSnapshot);
        mutated = true;
      }
    }

    if (JSON.stringify(player.generationState || {}) !== JSON.stringify(normalizedState)) {
      player.generationState = normalizedState;
      mutated = true;
    }

    const history = [];
    for (const item of player.generationHistory) {
      if (!item || typeof item !== 'object') continue;
      history.push({
        id: item.id ? String(item.id) : null,
        source: item.source ? String(item.source) : 'unknown',
        status: normalizeGenerationStatus(item.status),
        phase: item.phase ? String(item.phase) : '',
        startedAt: Number(item.startedAt) || 0,
        endedAt: Number(item.endedAt) || 0,
        sourceChoice: item.sourceChoice ? String(item.sourceChoice) : '',
        story: item.story ? String(item.story) : '',
        choices: cloneChoiceSnapshot(item.choices),
        error: item.error ? String(item.error) : '',
        location: item.location ? String(item.location) : ''
      });
    }

    const trimmed = history.slice(-GENERATION_HISTORY_LIMIT);
    if (JSON.stringify(player.generationHistory) !== JSON.stringify(trimmed)) {
      player.generationHistory = trimmed;
      mutated = true;
    }

    if (!player.generationState || typeof player.generationState !== 'object') {
      player.generationState = normalizedState;
      mutated = true;
    }

    return mutated;
  }

  return {
    ensurePlayerGenerationSchema
  };
}

module.exports = { createPlayerGenerationSchemaUtils };
