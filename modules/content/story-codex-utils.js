function createStoryCodexUtils(deps = {}) {
  const {
    CORE,
    PLAYER_CODEX_NPC_LIMIT = 500,
    PLAYER_CODEX_DRAW_LIMIT = 800,
    STORY_GENERIC_SPEAKER_PATTERN = /(女子|少女|女聲|女人|姑娘|她|某人|有人|對方|對面|其中一人|另一人|另一名|男子|男聲|男人|老年人|中年人|技師|商人|攤主|守衛|巡邏員|倉管)/u,
    STORY_DIALOGUE_MAX_QUOTE_LEN = 160,
    STORY_DIALOGUE_MAX_PER_STORY = 8
  } = deps;

  function ensurePlayerCodexSchema(player) {
    if (!player || typeof player !== 'object') return false;
    let mutated = false;
    if (!player.codex || typeof player.codex !== 'object') {
      player.codex = {};
      mutated = true;
    }
    if (!player.codex.npcEncountered || typeof player.codex.npcEncountered !== 'object') {
      player.codex.npcEncountered = {};
      mutated = true;
    }
    if (!player.codex.drawnMoves || typeof player.codex.drawnMoves !== 'object') {
      player.codex.drawnMoves = {};
      mutated = true;
    }
    if (!Number.isFinite(Number(player.codex.npcEncounterTotal))) {
      player.codex.npcEncounterTotal = 0;
      mutated = true;
    }
    if (!Number.isFinite(Number(player.codex.drawTotalCount))) {
      player.codex.drawTotalCount = 0;
      mutated = true;
    }
    if (!Number.isFinite(Number(player.codex.lastNpcEncounterAt))) {
      player.codex.lastNpcEncounterAt = 0;
      mutated = true;
    }
    if (!Number.isFinite(Number(player.codex.lastDrawAt))) {
      player.codex.lastDrawAt = 0;
      mutated = true;
    }

    const sanitizeEntries = (obj = {}, kind = 'npc') => {
      const rows = [];
      for (const [rawId, rawEntry] of Object.entries(obj || {})) {
        const id = String(rawId || '').trim();
        if (!id || !rawEntry || typeof rawEntry !== 'object') continue;
        const base = {
          id,
          name: String(rawEntry.name || id).trim().slice(0, 40),
          count: Math.max(1, Number(rawEntry.count || 1)),
          firstAt: Number(rawEntry.firstAt || rawEntry.lastAt || Date.now()),
          lastAt: Number(rawEntry.lastAt || rawEntry.firstAt || Date.now())
        };
        if (kind === 'npc') {
          rows.push({
            ...base,
            title: String(rawEntry.title || '').trim().slice(0, 24),
            firstLocation: String(rawEntry.firstLocation || '').trim().slice(0, 24),
            lastLocation: String(rawEntry.lastLocation || '').trim().slice(0, 24),
            lastSeenTurn: Math.max(0, Number(rawEntry.lastSeenTurn || 0))
          });
        } else {
          rows.push({
            ...base,
            tier: Math.max(1, Math.min(3, Number(rawEntry.tier || 1))),
            element: String(rawEntry.element || '未知').trim().slice(0, 16)
          });
        }
      }
      rows.sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));
      const cap = kind === 'npc' ? PLAYER_CODEX_NPC_LIMIT : PLAYER_CODEX_DRAW_LIMIT;
      return rows.slice(0, cap);
    };

    const normalizedNpcEntries = sanitizeEntries(player.codex.npcEncountered, 'npc');
    const normalizedNpcMap = Object.fromEntries(normalizedNpcEntries.map((entry) => [entry.id, entry]));
    if (JSON.stringify(player.codex.npcEncountered || {}) !== JSON.stringify(normalizedNpcMap)) {
      player.codex.npcEncountered = normalizedNpcMap;
      mutated = true;
    }

    const normalizedDrawEntries = sanitizeEntries(player.codex.drawnMoves, 'draw');
    const normalizedDrawMap = Object.fromEntries(normalizedDrawEntries.map((entry) => [entry.id, entry]));
    if (JSON.stringify(player.codex.drawnMoves || {}) !== JSON.stringify(normalizedDrawMap)) {
      player.codex.drawnMoves = normalizedDrawMap;
      mutated = true;
    }

    const drawTotalFromEntries = normalizedDrawEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.count || 0)), 0);
    if (Number(player.codex.drawTotalCount || 0) < drawTotalFromEntries) {
      player.codex.drawTotalCount = drawTotalFromEntries;
      mutated = true;
    }

    return mutated;
  }

  function recordNpcEncounter(player, npc = null, location = '') {
    if (!player || !npc || typeof npc !== 'object') return false;
    ensurePlayerCodexSchema(player);
    const npcId = String(npc.id || '').trim();
    if (!npcId) return false;
    const now = Date.now();
    const turn = Math.max(0, Number(player.storyTurns || 0));
    const loc = String(location || player.location || npc.loc || '').trim();
    const bucket = player.codex.npcEncountered;
    const prev = bucket[npcId] && typeof bucket[npcId] === 'object' ? bucket[npcId] : null;
    if (prev && Number(prev.lastSeenTurn || 0) === turn && String(prev.lastLocation || '') === loc) {
      return false;
    }

    const nextCount = Math.max(0, Number(prev?.count || 0)) + 1;
    bucket[npcId] = {
      id: npcId,
      name: String(npc.name || prev?.name || npcId).trim().slice(0, 40),
      title: String(npc.title || prev?.title || '').trim().slice(0, 24),
      count: nextCount,
      firstAt: prev ? Number(prev.firstAt || now) : now,
      lastAt: now,
      firstLocation: prev ? String(prev.firstLocation || loc).trim().slice(0, 24) : loc.slice(0, 24),
      lastLocation: loc.slice(0, 24),
      lastSeenTurn: turn
    };
    player.codex.npcEncounterTotal = Math.max(0, Number(player.codex.npcEncounterTotal || 0)) + 1;
    player.codex.lastNpcEncounterAt = now;
    return true;
  }

  function recordNearbyNpcEncounters(player, limit = 8) {
    if (!player) return false;
    ensurePlayerCodexSchema(player);
    const location = String(player.location || '').trim();
    if (!location) return false;
    const nearbyIds = typeof CORE.getNearbyNpcIds === 'function'
      ? CORE.getNearbyNpcIds(location, Math.max(1, Number(limit || 8)))
      : [];
    let mutated = false;
    for (const npcId of Array.isArray(nearbyIds) ? nearbyIds : []) {
      if (typeof CORE.isNPCAlive === 'function' && !CORE.isNPCAlive(npcId)) continue;
      const npc = typeof CORE.getAgentFullInfo === 'function'
        ? CORE.getAgentFullInfo(npcId)
        : (Array.isArray(CORE.getAgents?.()) ? CORE.getAgents().find((a) => String(a?.id || '') === String(npcId)) : null);
      if (!npc) continue;
      if (recordNpcEncounter(player, npc, location)) mutated = true;
    }
    return mutated;
  }

  function formatCodexLines(lines = [], maxLen = 1000, emptyText = '（尚無）') {
    if (!Array.isArray(lines) || lines.length === 0) return emptyText;
    const picked = [];
    let size = 0;
    for (const raw of lines) {
      const line = String(raw || '').trim();
      if (!line) continue;
      const next = size + line.length + 1;
      if (next > maxLen) break;
      picked.push(line);
      size = next;
    }
    return picked.length > 0 ? picked.join('\n') : emptyText;
  }

  function extractNarrativeSpeakerSeed(raw = '') {
    const source = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!source) return '';
    const rules = [
      [/工坊試樣師/u, '工坊試樣師'],
      [/老船伕|老船夫/u, '老船伕'],
      [/聯絡員/u, '聯絡員'],
      [/試樣師/u, '試樣師'],
      [/船伕|船夫/u, '船伕'],
      [/技師/u, '技師'],
      [/守衛/u, '守衛'],
      [/巡邏員/u, '巡邏員'],
      [/倉管/u, '倉管'],
      [/攤主/u, '攤主'],
      [/商人/u, '商人'],
      [/中年男子/u, '中年男子'],
      [/中年女子/u, '中年女子'],
      [/老人/u, '老人'],
      [/婦人/u, '婦人'],
      [/男子|男聲|男人|他/u, '男子'],
      [/女子|女聲|女人|她/u, '女子'],
      [/對方|对方/u, '對方']
    ];
    for (const [pattern, label] of rules) {
      if (pattern.test(source)) return label;
    }
    return '';
  }

  function looksLikeNarrativeSpeakerFragment(text = '') {
    const source = String(text || '').trim();
    if (!source) return true;
    if (/^(我|我們|我们|咱們|咱们|你|妳|你們|你们|妳們|妳们)/u.test(source)) return true;
    return /(壓低聲音|压低声音|低聲|低声|回應|回应|說了一句|说了一句|說道|说道|開口|开口|提醒|補充|补充|沉默|皺起眉頭|皱起眉头|上下打量|看向|轉頭|转头|轉身|转身|消失在|握緊|握紧|抬腳|抬脚|停下腳步|停下脚步|探出頭|探出头|笑了笑|笑容|語氣|语气|目光|身影)/u.test(source);
  }

  function normalizeStorySpeakerText(raw = '') {
    const original = String(raw || '')
      .replace(/\s+/g, ' ')
      .replace(/[「」『』"“”]/g, '')
      .trim();
    if (!original) return '';
    const seededFromOriginal = extractNarrativeSpeakerSeed(original);
    if (looksLikeNarrativeSpeakerFragment(original)) {
      return seededFromOriginal;
    }
    let text = original;
    const chunks = text.split(/[，。！？!?：:]/).map((s) => s.trim()).filter(Boolean);
    if (chunks.length > 0) text = chunks[chunks.length - 1];
    text = text.replace(/^(一名|一位|某位|某個|那位|這位|該名|那名)/u, '').trim();
    text = text.replace(/(突然|輕聲|低聲|沙啞地|微笑著|笑著|開口|轉身|回頭)$/u, '').trim();
    if (!text) return '';
    if (looksLikeNarrativeSpeakerFragment(text)) {
      return seededFromOriginal || extractNarrativeSpeakerSeed(text);
    }
    return text.slice(0, 24);
  }

  function normalizeComparableStoryText(text = '') {
    return String(text || '')
      .toLowerCase()
      .replace(/[「」『』"'`“”‘’\s，。！？!?；;：:、（）()\[\]【】\-]/g, '')
      .trim();
  }

  function detectSpeakerGroup(speaker = '') {
    const text = String(speaker || '');
    if (/(女子|少女|女聲|女人|姑娘|姊|她)/u.test(text)) return 'female';
    if (/(男子|男聲|男人|叔|伯|他)/u.test(text)) return 'male';
    return 'neutral';
  }

  function isGenericSpeaker(speaker = '') {
    const text = String(speaker || '').trim();
    if (!text) return true;
    if (text.length <= 2) return true;
    return STORY_GENERIC_SPEAKER_PATTERN.test(text);
  }

  function toAlphaIndex(index = 1) {
    const n = Math.max(1, Number(index) || 1);
    return String.fromCharCode(64 + Math.min(26, n));
  }

  function aliasGenericSpeaker(speaker = '', state = {}) {
    const key = String(speaker || '').toLowerCase();
    state.aliasByKey = state.aliasByKey || new Map();
    state.counts = state.counts || { female: 0, male: 0, neutral: 0 };
    if (state.aliasByKey.has(key)) return state.aliasByKey.get(key);
    const group = detectSpeakerGroup(speaker);
    state.counts[group] = Number(state.counts[group] || 0) + 1;
    const suffix = toAlphaIndex(state.counts[group]);
    const alias = group === 'female'
      ? `神秘女子${suffix}`
      : (group === 'male' ? `神秘男子${suffix}` : `神秘人物${suffix}`);
    state.aliasByKey.set(key, alias);
    return alias;
  }

  function extractStoryDialogues(storyText = '') {
    const text = String(storyText || '');
    if (!text) return [];
    const out = [];
    const seen = new Set();
    const aliasState = { aliasByKey: new Map(), counts: { female: 0, male: 0, neutral: 0 } };

    const pushRow = (speakerRaw, quoteRaw, source = 'story_quote') => {
      const quote = String(quoteRaw || '').replace(/\s+/g, ' ').trim().slice(0, STORY_DIALOGUE_MAX_QUOTE_LEN);
      if (!quote || quote.length < 2) return;
      let speaker = normalizeStorySpeakerText(speakerRaw);
      if (!speaker) return;
      if (/^(我|我們|我们|咱們|咱们|你|妳|你們|你们|妳們|妳们|旁白)$/u.test(speaker)) return;
      if (isGenericSpeaker(speaker)) {
        speaker = aliasGenericSpeaker(speaker, aliasState);
      }
      const key = `${speaker}|${quote}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ speaker, text: quote, source });
    };

    // 型態一：人物說：「台詞」
    const preQuotePattern = /([^\n「」]{1,32}?)(?:說道|說|問道|問|回道|回應|提醒|補充|低語|喊道|表示|開口|答道|笑道|低聲道)?[:：]\s*「([^」\n]{2,220})」/gu;
    let match = preQuotePattern.exec(text);
    while (match && out.length < STORY_DIALOGUE_MAX_PER_STORY) {
      pushRow(match[1], match[2], 'story_quote_pre');
      match = preQuotePattern.exec(text);
    }

    // 型態二：💬 角色：台詞
    const markerPattern = /💬\s*([^：:\n]{1,24})\s*[：:]\s*([^\n]{2,220})/gu;
    match = markerPattern.exec(text);
    while (match && out.length < STORY_DIALOGUE_MAX_PER_STORY) {
      pushRow(match[1], match[2], 'story_quote_marker');
      match = markerPattern.exec(text);
    }

    return out.slice(0, STORY_DIALOGUE_MAX_PER_STORY);
  }

  return {
    ensurePlayerCodexSchema,
    recordNpcEncounter,
    recordNearbyNpcEncounters,
    formatCodexLines,
    normalizeStorySpeakerText,
    normalizeComparableStoryText,
    detectSpeakerGroup,
    isGenericSpeaker,
    toAlphaIndex,
    aliasGenericSpeaker,
    extractStoryDialogues
  };
}

module.exports = { createStoryCodexUtils };
