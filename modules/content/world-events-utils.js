function createWorldEventsUtils(deps = {}) {
  const {
    CORE = null,
    EVENTS = null,
    getLocationDisplayName = (value = '') => String(value || ''),
    getNpcDisplayName = (value = '') => String(value || ''),
    localizeDisplayText = (value = '') => String(value || ''),
    formatWorldEventText = null
  } = deps;

  function summarizeWorldEventMessage(message = '') {
    const source = String(message || '').replace(/\r/g, '').trim();
    if (!source) return '';
    const firstLine = source
      .split('\n')
      .map((line) => String(line || '').trim())
      .find(Boolean);
    const base = firstLine || source;
    return base.replace(/\s+/g, ' ').trim();
  }

  function buildWorldEventSummaryKey(message = '') {
    return summarizeWorldEventMessage(message)
      .replace(/[。．.!！?？]+$/u, '')
      .trim();
  }

  function sanitizeEventTargetName(target = '') {
    const source = String(target || '').trim();
    if (!source) return '';
    if (source.length > 36) return '';
    if (/[，。！？]/u.test(source)) return '';
    if (/(然後|壓低聲音|说了一句|說了一句|心頭一沉|心头一沉|看著你|看着你)/u.test(source)) return '';
    return source;
  }

  function inferEventFieldsFromMessage(type = '', rawMessage = '') {
    const source = String(rawMessage || '').trim();
    const kind = String(type || '').trim();
    if (!source) return {};

    if (kind === 'custom_input') {
      const match = source.match(/^✍️\s*(.+?)在(.+?)採取自訂行動「(.+?)」，後續傳聞[:：]\s*(.+)$/u);
      if (match) {
        return {
          actor: String(match[1] || '').trim(),
          location: String(match[2] || '').trim(),
          actionText: String(match[3] || '').trim(),
          rumor: String(match[4] || '').trim()
        };
      }
    }

    if (kind === 'wish_pool') {
      const match = source.match(/^🪙\s*(.+?)在(.+?)的許願池許願「(.+?)」，結果[:：]\s*(.+)$/u);
      if (match) {
        return {
          actor: String(match[1] || '').trim(),
          location: String(match[2] || '').trim(),
          wish: String(match[3] || '').trim(),
          rumor: String(match[4] || '').trim()
        };
      }
    }

    if (kind === 'main_story') {
      const evidenceMatch = source.match(/^🧭\s*(.+?)交出關鍵證據[「"](.+?)[」"]。?$/u);
      if (evidenceMatch) {
        return {
          actor: String(evidenceMatch[1] || '').trim(),
          evidenceName: String(evidenceMatch[2] || '').trim()
        };
      }
    }

    if (kind === 'faction_skirmish') {
      const match = source.match(/^⚔️\s*第\s*(\d+)\s*日[:：]\s*(.+?)週邊對峙爆發拉鋸/u);
      if (match) {
        return {
          day: String(match[1] || '').trim(),
          location: String(match[2] || '').trim()
        };
      }
    }

    if (kind === 'battle_start') {
      const match = source.match(/^⚔️\s*(.+?)\s*在(.+?)與\s*(.+?)\s*爆發交鋒/u);
      if (match) {
        return {
          actor: String(match[1] || '').trim(),
          location: String(match[2] || '').trim(),
          target: sanitizeEventTargetName(match[3])
        };
      }
    }

    if (kind === 'battle_flee') {
      const match = source.match(/^🏃\s*(.+?)\s*在(.+?)成功脫離\s*(.+?)\s*的追擊/u);
      if (match) {
        return {
          actor: String(match[1] || '').trim(),
          location: String(match[2] || '').trim(),
          target: sanitizeEventTargetName(match[3])
        };
      }
    }

    if (kind === 'battle_flee_fail') {
      const match = source.match(/^🩸\s*(.+?)\s*在(.+?)嘗試逃離\s*(.+?)\s*失敗，局勢惡化/u);
      const attemptMatch = source.match(/第\s*(\d+)\s*次逃跑失敗/u);
      return {
        actor: match ? String(match[1] || '').trim() : '',
        location: match ? String(match[2] || '').trim() : '',
        target: match ? sanitizeEventTargetName(match[3]) : '',
        fleeAttempt: attemptMatch ? String(attemptMatch[1] || '').trim() : '',
        forcedContinue: /被迫續戰/u.test(source) ? '1' : ''
      };
    }

    if (kind === 'pet_down') {
      const match = source.match(/^💥\s*(.+?)\s*的夥伴在(.+?)被\s*(.+?)\s*重創倒下/u);
      const reviveMatch = source.match(/([^\s]+)復活倒數\s*(\d+)\s*回合/u);
      return {
        actor: match ? String(match[1] || '').trim() : '',
        location: match ? String(match[2] || '').trim() : '',
        target: match ? sanitizeEventTargetName(match[3]) : '',
        petName: reviveMatch ? String(reviveMatch[1] || '').trim() : '',
        reviveTurns: reviveMatch ? String(reviveMatch[2] || '').trim() : ''
      };
    }

    return {};
  }

  function mergeWorldEventPayload(entry = {}) {
    const rawMessage = String(entry?.message || '').trim();
    const type = String(entry?.type || '').trim();
    const inferred = inferEventFieldsFromMessage(type, rawMessage);
    const out = { ...inferred };
    for (const key of ['actor', 'target', 'location', 'impact', 'actionText', 'wish', 'rumor', 'verdict', 'evidenceName', 'petName', 'reviveTurns', 'fleeAttempt', 'forcedContinue', 'day']) {
      const rawValue = String(entry?.[key] || '').trim();
      if (!rawValue) continue;
      if (key === 'target') {
        const safeTarget = sanitizeEventTargetName(rawValue);
        if (safeTarget) out[key] = safeTarget;
        continue;
      }
      out[key] = rawValue;
    }
    if (!out.target && /^(battle_start|battle_flee|battle_flee_fail|pet_down|player_down)$/u.test(type)) {
      out.target = '未知敵人';
    }
    return out;
  }

  function normalizeWorldEventEntry(entry, source, lang = 'zh-TW') {
    if (!entry) return null;
    const safeLang = String(lang || 'zh-TW').trim() || 'zh-TW';
    if (typeof entry === 'string') {
      const localized = localizeDisplayText(String(entry), safeLang);
      const summary = summarizeWorldEventMessage(localized);
      return summary
        ? {
          message: summary,
          rawMessage: String(entry),
          dedupeKey: buildWorldEventSummaryKey(summary),
          timestamp: 0,
          source,
          type: '',
          actor: '',
          target: '',
          location: '',
          impact: ''
        }
        : null;
    }
    if (typeof entry !== 'object') return null;
    const rawMessage = String(entry.message || '').trim();
    const merged = mergeWorldEventPayload(entry);
    const payload = {
      type: String(entry.type || '').trim(),
      actor: String(merged.actor || '').trim(),
      target: String(merged.target || '').trim(),
      location: String(merged.location || '').trim(),
      impact: String(merged.impact || '').trim(),
      actionText: String(merged.actionText || '').trim(),
      wish: String(merged.wish || '').trim(),
      rumor: String(merged.rumor || '').trim(),
      verdict: String(merged.verdict || '').trim(),
      evidenceName: String(merged.evidenceName || '').trim(),
      petName: String(merged.petName || '').trim(),
      reviveTurns: String(merged.reviveTurns || '').trim(),
      fleeAttempt: String(merged.fleeAttempt || '').trim(),
      forcedContinue: String(merged.forcedContinue || '').trim(),
      day: String(merged.day || entry.day || entry?.meta?.day || '').trim(),
      message: rawMessage,
      rawMessage
    };
    const localizedMessage = typeof formatWorldEventText === 'function'
      ? String(formatWorldEventText(payload, safeLang) || '').trim()
      : '';
    const summary = summarizeWorldEventMessage(localizedMessage || localizeDisplayText(rawMessage, safeLang));
    if (!summary) return null;
    return {
      message: summary,
      rawMessage,
      dedupeKey: buildWorldEventSummaryKey(summary),
      timestamp: Number.isFinite(Number(entry.timestamp)) ? Number(entry.timestamp) : 0,
      source,
      type: payload.type,
      actor: payload.actor,
      target: payload.target,
      location: payload.location,
      impact: payload.impact,
      actionText: payload.actionText,
      wish: payload.wish,
      rumor: payload.rumor,
      verdict: payload.verdict,
      evidenceName: payload.evidenceName,
      petName: payload.petName,
      reviveTurns: payload.reviveTurns,
      fleeAttempt: payload.fleeAttempt,
      forcedContinue: payload.forcedContinue,
      day: payload.day
    };
  }

  function getMergedWorldEvents(limit = 5, lang = 'zh-TW') {
    const targetLimit = Math.max(1, Math.min(5, Number(limit) || 5));
    const safeLang = String(lang || 'zh-TW').trim() || 'zh-TW';
    const coreEvents = (CORE?.getRecentWorldEvents?.(targetLimit * 2) || [])
      .map((e) => normalizeWorldEventEntry(e, 'core', safeLang))
      .filter((e) => e && e.message);

    let boardEvents = [];
    try {
      const raw = EVENTS?.getWorldEvents?.();
      boardEvents = (raw?.events || [])
        .slice(0, targetLimit * 2)
        .map((e) => normalizeWorldEventEntry(e, 'board', safeLang))
        .filter((e) => e && e.message);
    } catch {
      boardEvents = [];
    }

    const merged = [...boardEvents, ...coreEvents].sort((a, b) => b.timestamp - a.timestamp);
    const uniq = [];
    const seen = new Set();
    for (const item of merged) {
      const dedupeKey = String(item.dedupeKey || item.message || '').trim();
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      uniq.push(item);
      if (uniq.length >= targetLimit) break;
    }
    return uniq;
  }

  function publishWorldEvent(message, type = 'player_action', extra = null) {
    const text = String(message || '').trim();
    if (!text) return;
    const payloadExtra = extra && typeof extra === 'object' ? extra : {};
    try {
      if (typeof CORE?.recordWorldEvent === 'function') CORE.recordWorldEvent(text, type, payloadExtra);
    } catch (e) {
      console.log('[WorldEvent] core publish failed:', e?.message || e);
    }
    try {
      if (typeof EVENTS?.addWorldEvent === 'function') EVENTS.addWorldEvent(text, type, payloadExtra);
    } catch (e) {
      console.log('[WorldEvent] board publish failed:', e?.message || e);
    }
  }

  function publishBattleWorldEvent(player, enemyName, kind = 'battle', impact = '') {
    const actor = String(player?.name || '冒險者').trim() || '冒險者';
    const location = String(player?.location || '未知地點').trim() || '未知地點';
    const target = String(enemyName || '未知敵人').trim() || '未知敵人';
    const impactObj = impact && typeof impact === 'object' && !Array.isArray(impact) ? impact : null;
    const impactText = impactObj ? String(impactObj.impact || '').trim() : String(impact || '').trim();
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
    publishWorldEvent(message, kind, {
      actor,
      target,
      location,
      impact: impactText,
      petName: impactObj ? String(impactObj.petName || '').trim() : '',
      reviveTurns: impactObj ? String(impactObj.reviveTurns || '').trim() : '',
      fleeAttempt: impactObj ? String(impactObj.fleeAttempt || '').trim() : '',
      forcedContinue: impactObj ? String(impactObj.forcedContinue || '').trim() : '',
      actorDisplay: localizeDisplayText(actor, 'zh-TW'),
      targetDisplay: getNpcDisplayName(target, 'zh-TW') || getLocationDisplayName(target, 'zh-TW') || localizeDisplayText(target, 'zh-TW'),
      locationDisplay: getLocationDisplayName(location, 'zh-TW') || localizeDisplayText(location, 'zh-TW')
    });
  }

  return {
    summarizeWorldEventMessage,
    buildWorldEventSummaryKey,
    normalizeWorldEventEntry,
    getMergedWorldEvents,
    publishWorldEvent,
    publishBattleWorldEvent
  };
}

module.exports = {
  createWorldEventsUtils
};
