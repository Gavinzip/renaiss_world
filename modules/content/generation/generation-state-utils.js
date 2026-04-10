function createGenerationStateUtils(deps = {}) {
  const {
    CHOICE_DISPLAY_COUNT = 5,
    NPC_DIALOGUE_LOG_LIMIT = 80,
    ensurePlayerGenerationSchema
  } = deps;

  function cloneChoiceSnapshot(choices = []) {
    if (!Array.isArray(choices)) return [];
    return choices
      .filter(choice => choice && typeof choice === 'object')
      .slice(0, CHOICE_DISPLAY_COUNT)
      .map(choice => ({ ...choice }));
  }

  function normalizeGenerationStatus(status) {
    const value = String(status || 'idle');
    if (value === 'pending' || value === 'done' || value === 'failed' || value === 'idle') {
      return value;
    }
    return 'idle';
  }

  function normalizeNpcDialogueLog(logs = []) {
    const list = Array.isArray(logs) ? logs : [];
    const normalized = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const speaker = String(item.speaker || '').trim().slice(0, 24);
      const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      if (!speaker || !text) continue;
      normalized.push({
        speaker,
        text,
        location: String(item.location || '').trim().slice(0, 24),
        source: String(item.source || 'npc').trim().slice(0, 24),
        at: Number.isFinite(Number(item.at)) ? Number(item.at) : Date.now()
      });
    }
    return normalized.slice(-NPC_DIALOGUE_LOG_LIMIT);
  }

  function appendNpcDialogueLog(player, payload = {}) {
    if (!player || typeof player !== 'object') return;
    if (typeof ensurePlayerGenerationSchema === 'function') {
      ensurePlayerGenerationSchema(player);
    }
    const speaker = String(payload.speaker || '').trim().slice(0, 24);
    const text = String(payload.text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!speaker || !text) return;
    const logs = Array.isArray(player.npcDialogueLog) ? player.npcDialogueLog : [];
    logs.push({
      speaker,
      text,
      location: String(payload.location || player.location || '').trim().slice(0, 24),
      source: String(payload.source || 'npc').trim().slice(0, 24),
      at: Date.now()
    });
    player.npcDialogueLog = normalizeNpcDialogueLog(logs);
  }

  return {
    cloneChoiceSnapshot,
    normalizeGenerationStatus,
    normalizeNpcDialogueLog,
    appendNpcDialogueLog
  };
}

module.exports = { createGenerationStateUtils };
