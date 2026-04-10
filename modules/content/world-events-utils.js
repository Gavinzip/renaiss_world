function createWorldEventsUtils(deps = {}) {
  const { CORE = null, EVENTS = null } = deps;

  function normalizeWorldEventEntry(entry, source) {
    if (!entry) return null;
    if (typeof entry === 'string') return { message: entry, timestamp: 0, source };
    if (typeof entry !== 'object') return null;
    return {
      message: String(entry.message || '').trim(),
      timestamp: Number.isFinite(Number(entry.timestamp)) ? Number(entry.timestamp) : 0,
      source
    };
  }

  function getMergedWorldEvents(limit = 5) {
    const targetLimit = Math.max(1, Math.min(5, Number(limit) || 5));
    const coreEvents = (CORE?.getRecentWorldEvents?.(targetLimit * 2) || [])
      .map((e) => normalizeWorldEventEntry(e, 'core'))
      .filter((e) => e && e.message);

    let boardEvents = [];
    try {
      const raw = EVENTS?.getWorldEvents?.();
      boardEvents = (raw?.events || [])
        .slice(0, targetLimit * 2)
        .map((e) => normalizeWorldEventEntry(e, 'board'))
        .filter((e) => e && e.message);
    } catch {
      boardEvents = [];
    }

    const merged = [...boardEvents, ...coreEvents].sort((a, b) => b.timestamp - a.timestamp);
    const uniq = [];
    const seen = new Set();
    for (const item of merged) {
      if (seen.has(item.message)) continue;
      seen.add(item.message);
      uniq.push(item);
      if (uniq.length >= targetLimit) break;
    }
    return uniq;
  }

  function publishWorldEvent(message, type = 'player_action', extra = null) {
    const text = String(message || '').trim();
    if (!text) return;
    try {
      if (typeof CORE?.recordWorldEvent === 'function') CORE.recordWorldEvent(text, type, extra || {});
    } catch (e) {
      console.log('[WorldEvent] core publish failed:', e?.message || e);
    }
    try {
      if (typeof EVENTS?.addWorldEvent === 'function') EVENTS.addWorldEvent(text, type);
    } catch (e) {
      console.log('[WorldEvent] board publish failed:', e?.message || e);
    }
  }

  function publishBattleWorldEvent(player, enemyName, kind = 'battle', impact = '') {
    const actor = String(player?.name || '冒險者').trim() || '冒險者';
    const location = String(player?.location || '未知地點').trim() || '未知地點';
    const target = String(enemyName || '未知敵人').trim() || '未知敵人';
    const impactText = String(impact || '').trim();
    let message = '';
    if (kind === 'battle_start') {
      message = `⚔️ ${actor} 在${location}與 ${target} 爆發交鋒。`;
    } else if (kind === 'battle_win') {
      message = `🏆 ${actor} 在${location}擊敗了 ${target}。`;
    } else if (kind === 'battle_flee') {
      message = `🏃 ${actor} 在${location}成功脫離 ${target} 的追擊。`;
    } else if (kind === 'battle_flee_fail') {
      message = `🩸 ${actor} 在${location}嘗試逃離 ${target} 失敗，局勢惡化。`;
    } else if (kind === 'pet_down') {
      message = `💥 ${actor} 的夥伴在${location}被 ${target} 重創倒下。`;
    } else if (kind === 'player_down') {
      message = `☠️ ${actor} 在${location}與 ${target} 一戰中敗亡。`;
    } else {
      message = `⚔️ ${actor} 在${location}與 ${target} 的衝突升級。`;
    }
    if (impactText) message += ` ${impactText.slice(0, 80)}`;
    publishWorldEvent(message, kind, { actor, target, location, impact: impactText });
  }

  return {
    normalizeWorldEventEntry,
    getMergedWorldEvents,
    publishWorldEvent,
    publishBattleWorldEvent
  };
}

module.exports = {
  createWorldEventsUtils
};

