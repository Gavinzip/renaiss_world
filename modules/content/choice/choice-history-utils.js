function createChoiceHistoryUtils(deps = {}) {
  const {
    getLocationProfile,
    getPlayerStoryTurns,
    RECENT_CHOICE_HISTORY_LIMIT = 12
  } = deps;

  function buildLocationFeatureTextForChoiceScoring(location = '') {
    const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
    const parts = [
      location || '',
      profile?.region || '',
      profile?.desc || '',
      ...(Array.isArray(profile?.nearby) ? profile.nearby : []),
      ...(Array.isArray(profile?.landmarks) ? profile.landmarks : []),
      ...(Array.isArray(profile?.resources) ? profile.resources : [])
    ];
    return parts.filter(Boolean).join(' ');
  }

  function textIncludesAnyKeyword(text = '', keywords = []) {
    const source = String(text || '');
    return keywords.some((keyword) => source.includes(keyword));
  }

  function normalizeChoiceFingerprintText(text = '') {
    return String(text || '')
      .toLowerCase()
      .replace(/[（(][^）)]*[）)]/g, ' ')
      .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildChoiceFingerprint(choice = {}) {
    const action = String(choice?.action || '').trim().toLowerCase();
    const text = normalizeChoiceFingerprintText([
      choice?.name || '',
      choice?.choice || '',
      choice?.desc || ''
    ].join(' '));
    return `${action}|${text}`.slice(0, 240);
  }

  function computeChoiceSimilarityByTokens(a = '', b = '') {
    const ta = normalizeChoiceFingerprintText(a).split(' ').filter(Boolean);
    const tb = normalizeChoiceFingerprintText(b).split(' ').filter(Boolean);
    if (ta.length === 0 || tb.length === 0) return 0;
    const sa = new Set(ta);
    const sb = new Set(tb);
    let inter = 0;
    for (const token of sa) {
      if (sb.has(token)) inter += 1;
    }
    const union = new Set([...sa, ...sb]).size || 1;
    return inter / union;
  }

  function normalizeRecentChoiceHistory(list = []) {
    const arr = Array.isArray(list) ? list : [];
    const normalized = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const action = String(item.action || '').trim().toLowerCase();
      const choiceText = String(item.choice || '').trim().slice(0, 220);
      if (!choiceText) continue;
      const fingerprint = String(item.fingerprint || '').trim() || buildChoiceFingerprint({
        action,
        choice: choiceText,
        name: String(item.name || ''),
        desc: String(item.desc || '')
      });
      normalized.push({
        action,
        choice: choiceText,
        name: String(item.name || '').trim().slice(0, 80),
        desc: String(item.desc || '').trim().slice(0, 120),
        location: String(item.location || '').trim().slice(0, 32),
        turn: Number.isFinite(Number(item.turn)) ? Math.max(0, Math.floor(Number(item.turn))) : 0,
        at: Number.isFinite(Number(item.at)) ? Number(item.at) : Date.now(),
        fingerprint: fingerprint.slice(0, 240)
      });
    }
    return normalized.slice(-RECENT_CHOICE_HISTORY_LIMIT);
  }

  function ensureRecentChoiceHistory(player) {
    if (!player || typeof player !== 'object') return [];
    if (!Array.isArray(player.recentChoiceHistory)) {
      player.recentChoiceHistory = [];
    }
    const normalized = normalizeRecentChoiceHistory(player.recentChoiceHistory);
    if (JSON.stringify(player.recentChoiceHistory) !== JSON.stringify(normalized)) {
      player.recentChoiceHistory = normalized;
    }
    return player.recentChoiceHistory;
  }

  function getRecentChoiceHistory(player, limit = 8) {
    const list = ensureRecentChoiceHistory(player);
    const max = Math.max(1, Math.min(32, Number(limit) || 8));
    return list.slice(-max).reverse();
  }

  function recordPlayerChoiceHistory(player, event = {}, selectedChoice = '') {
    if (!player) return;
    const list = ensureRecentChoiceHistory(player);
    const record = {
      action: String(event?.action || '').trim().toLowerCase(),
      choice: String(selectedChoice || event?.choice || event?.name || '').trim().slice(0, 220),
      name: String(event?.name || '').trim().slice(0, 80),
      desc: String(event?.desc || '').trim().slice(0, 120),
      location: String(player?.location || '').trim().slice(0, 32),
      turn: typeof getPlayerStoryTurns === 'function' ? getPlayerStoryTurns(player) : 0,
      at: Date.now()
    };
    if (!record.choice) return;
    record.fingerprint = buildChoiceFingerprint(record);
    list.push(record);
    player.recentChoiceHistory = normalizeRecentChoiceHistory(list);
  }

  return {
    buildLocationFeatureTextForChoiceScoring,
    textIncludesAnyKeyword,
    normalizeChoiceFingerprintText,
    buildChoiceFingerprint,
    computeChoiceSimilarityByTokens,
    normalizeRecentChoiceHistory,
    ensureRecentChoiceHistory,
    getRecentChoiceHistory,
    recordPlayerChoiceHistory
  };
}

module.exports = { createChoiceHistoryUtils };
