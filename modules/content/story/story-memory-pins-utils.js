function createStoryMemoryPinsUtils(deps = {}) {
  const {
    CORE,
    STORY,
    normalizeComparableStoryText = (v) => String(v || '').trim().toLowerCase(),
    extractStoryDialogues = () => [],
    appendNpcDialogueLog = () => {},
    ensurePlayerGenerationSchema = () => false,
    ensurePlayerCodexSchema = () => false,
    normalizeMapViewMode = (mode) => mode,
    STORY_DIALOGUE_MAX_QUOTE_LEN = 120,
    STORY_DIALOGUE_PIN_LIMIT = 80,
    STORY_DIALOGUE_PIN_TTL_TURNS = 20,
    MAINLINE_CUE_PATTERN = /./,
    MAINLINE_PIN_LIMIT = 80,
    MAINLINE_PIN_TTL_TURNS = 60
  } = deps;

  function stableHashCode(source = '') {
    const text = String(source || '');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function normalizeStoryDialoguePins(pins = [], currentTurn = 0) {
    const list = Array.isArray(pins) ? pins : [];
    const nowTurn = Math.max(0, Math.floor(Number(currentTurn) || 0));
    const out = [];
    const seen = new Set();
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const speaker = String(item.speaker || '').trim().slice(0, 24);
      const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, STORY_DIALOGUE_MAX_QUOTE_LEN);
      if (!speaker || !text) continue;
      const expiresTurn = Math.max(nowTurn, Math.floor(Number(item.expiresTurn || 0)));
      if (expiresTurn < nowTurn) continue;
      const key = `${speaker}|${normalizeComparableStoryText(text)}`;
      if (!normalizeComparableStoryText(text) || seen.has(key)) continue;
      seen.add(key);
      out.push({
        speaker,
        text,
        location: String(item.location || '').trim().slice(0, 24),
        source: String(item.source || 'story_quote').trim().slice(0, 24),
        firstTurn: Math.max(0, Math.floor(Number(item.firstTurn || nowTurn))),
        lastSeenTurn: Math.max(0, Math.floor(Number(item.lastSeenTurn || nowTurn))),
        expiresTurn
      });
    }
    out.sort((a, b) => {
      if (b.expiresTurn !== a.expiresTurn) return b.expiresTurn - a.expiresTurn;
      return b.lastSeenTurn - a.lastSeenTurn;
    });
    return out.slice(0, STORY_DIALOGUE_PIN_LIMIT);
  }

  function upsertStoryDialoguePins(player, rows = []) {
    if (!player || typeof player !== 'object') return 0;
    const entries = Array.isArray(rows) ? rows : [];
    if (entries.length === 0) return 0;
    const currentTurn = Math.max(0, Math.floor(Number(player.storyTurns || 0)));
    const list = normalizeStoryDialoguePins(player.storyDialoguePins, currentTurn);
    const index = new Map();
    for (const item of list) {
      const key = `${item.speaker}|${normalizeComparableStoryText(item.text)}`;
      if (key) index.set(key, item);
    }

    let changed = 0;
    for (const row of entries) {
      const speaker = String(row?.speaker || '').trim().slice(0, 24);
      const text = String(row?.text || '').replace(/\s+/g, ' ').trim().slice(0, STORY_DIALOGUE_MAX_QUOTE_LEN);
      if (!speaker || !text) continue;
      const cmp = normalizeComparableStoryText(text);
      if (!cmp) continue;
      const key = `${speaker}|${cmp}`;
      const existing = index.get(key);
      if (existing) {
        existing.lastSeenTurn = currentTurn;
        existing.expiresTurn = Math.max(existing.expiresTurn, currentTurn + STORY_DIALOGUE_PIN_TTL_TURNS);
        if (!existing.location && player.location) existing.location = String(player.location).slice(0, 24);
        changed += 1;
        continue;
      }
      const item = {
        speaker,
        text,
        location: String(player.location || '').trim().slice(0, 24),
        source: String(row?.source || 'story_quote').trim().slice(0, 24),
        firstTurn: currentTurn,
        lastSeenTurn: currentTurn,
        expiresTurn: currentTurn + STORY_DIALOGUE_PIN_TTL_TURNS
      };
      list.push(item);
      index.set(key, item);
      changed += 1;
    }

    player.storyDialoguePins = normalizeStoryDialoguePins(list, currentTurn);
    return changed;
  }

  function extractMainlineForeshadowClues(storyText = '') {
    const text = String(storyText || '');
    if (!text) return [];
    const chunks = text
      .split(/\n+/)
      .flatMap((line) => line.split(/[。！？!?]/))
      .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
      .filter((line) => line.length >= 10 && line.length <= 140);
    const out = [];
    const seen = new Set();
    for (const line of chunks) {
      if (!MAINLINE_CUE_PATTERN.test(line)) continue;
      const cmp = normalizeComparableStoryText(line);
      if (!cmp || seen.has(cmp)) continue;
      seen.add(cmp);
      out.push(line);
      if (out.length >= 6) break;
    }
    return out;
  }

  function normalizeMainlineForeshadowPins(pins = [], currentTurn = 0) {
    const list = Array.isArray(pins) ? pins : [];
    const nowTurn = Math.max(0, Math.floor(Number(currentTurn) || 0));
    const out = [];
    const seen = new Set();
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      if (!text) continue;
      const expiresTurn = Math.max(nowTurn, Math.floor(Number(item.expiresTurn || 0)));
      if (expiresTurn < nowTurn) continue;
      const cmp = normalizeComparableStoryText(text);
      if (!cmp || seen.has(cmp)) continue;
      seen.add(cmp);
      out.push({
        text,
        location: String(item.location || '').trim().slice(0, 24),
        source: String(item.source || 'mainline').trim().slice(0, 24),
        firstTurn: Math.max(0, Math.floor(Number(item.firstTurn || nowTurn))),
        lastSeenTurn: Math.max(0, Math.floor(Number(item.lastSeenTurn || nowTurn))),
        expiresTurn
      });
    }
    out.sort((a, b) => {
      if (b.expiresTurn !== a.expiresTurn) return b.expiresTurn - a.expiresTurn;
      return b.lastSeenTurn - a.lastSeenTurn;
    });
    return out.slice(0, MAINLINE_PIN_LIMIT);
  }

  function upsertMainlineForeshadowPins(player, clues = []) {
    if (!player || typeof player !== 'object') return 0;
    const lines = Array.isArray(clues) ? clues : [];
    if (lines.length === 0) return 0;
    const currentTurn = Math.max(0, Math.floor(Number(player.storyTurns || 0)));
    const list = normalizeMainlineForeshadowPins(player.mainlineForeshadowPins, currentTurn);
    const index = new Map();
    for (const item of list) {
      const key = normalizeComparableStoryText(item.text);
      if (key) index.set(key, item);
    }

    let changed = 0;
    for (const line of lines) {
      const text = String(line || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      const key = normalizeComparableStoryText(text);
      if (!text || !key) continue;
      const existing = index.get(key);
      if (existing) {
        existing.lastSeenTurn = currentTurn;
        existing.expiresTurn = Math.max(existing.expiresTurn, currentTurn + MAINLINE_PIN_TTL_TURNS);
        if (!existing.location && player.location) existing.location = String(player.location).slice(0, 24);
        changed += 1;
        continue;
      }
      const item = {
        text,
        location: String(player.location || '').trim().slice(0, 24),
        source: 'mainline',
        firstTurn: currentTurn,
        lastSeenTurn: currentTurn,
        expiresTurn: currentTurn + MAINLINE_PIN_TTL_TURNS
      };
      list.push(item);
      index.set(key, item);
      changed += 1;
    }

    player.mainlineForeshadowPins = normalizeMainlineForeshadowPins(list, currentTurn);
    return changed;
  }

  function rememberStoryDialogues(player, storyText = '') {
    if (!player || !player.id) return 0;
    const rows = extractStoryDialogues(storyText);
    const clues = extractMainlineForeshadowClues(storyText);
    if ((!Array.isArray(rows) || rows.length === 0) && (!Array.isArray(clues) || clues.length === 0)) {
      return { quotes: 0, mainline: 0 };
    }
    let added = 0;
    for (const row of rows) {
      appendNpcDialogueLog(player, {
        speaker: row.speaker,
        text: row.text,
        location: player.location,
        source: row.source || 'story_quote'
      });
      if (typeof CORE.appendNpcQuoteMemory === 'function') {
        try {
          CORE.appendNpcQuoteMemory(player.id, {
            npcId: row.speaker,
            npcName: row.speaker,
            speaker: row.speaker,
            text: row.text,
            location: player.location || '',
            source: row.source || 'story_quote'
          });
        } catch (e) {
          console.log('[StoryQuote] appendNpcQuoteMemory failed:', e?.message || e);
        }
      }
      added += 1;
    }
    const pinCount = upsertStoryDialoguePins(player, rows);
    const mainlineCount = upsertMainlineForeshadowPins(player, clues);
    if (typeof CORE.appendPlayerMemoryAudit === 'function') {
      if (added > 0 || pinCount > 0) {
        const quotePreview = rows.slice(0, 2).map((row) => `${row.speaker}：「${String(row.text || '').slice(0, 24)}」`).join('、');
        CORE.appendPlayerMemoryAudit(player, {
          layer: 'npc_quote_pin',
          category: '對話記憶',
          reason: `從故事抽取可驗證對話 ${added} 條；寫入對話釘選 ${pinCount} 條`,
          content: quotePreview || '本回合抽取到可驗證對話',
          source: 'story_quote_extract',
          tags: ['npc_quote', 'dialogue_pin']
        });
      }
      if (mainlineCount > 0) {
        const cluePreview = clues.slice(0, 2).join('、');
        CORE.appendPlayerMemoryAudit(player, {
          layer: 'mainline_pin',
          category: '主線記憶',
          reason: `命中主線鋪陳線索，保留 ${mainlineCount} 條供後續延續`,
          content: cluePreview || '本回合新增主線鋪陳',
          source: 'story_mainline_extract',
          tags: ['main_story', 'mainline_pin']
        });
      }
    }
    return { quotes: added, dialoguePins: pinCount, mainline: mainlineCount };
  }

  function triggerMainlineForeshadowAIInBackground(player, options = {}) {
    const playerId = String(player?.id || '').trim();
    const storyText = String(options.storyText || '').trim();
    if (!playerId || !storyText) return;
    if (!STORY || typeof STORY.analyzeMainlineForeshadowCandidates !== 'function') return;

    const location = String(options.location || player?.location || '').trim();
    const previousAction = String(options.previousAction || '').trim();
    const playerLang = String(options.playerLang || player?.language || 'zh-TW').trim();
    const phase = String(options.phase || 'story').trim();

    Promise.resolve()
      .then(async () => {
        const lines = await STORY.analyzeMainlineForeshadowCandidates({
          storyText,
          location,
          previousAction,
          playerLang
        });
        if (!Array.isArray(lines) || lines.length === 0) return;
        const fresh = CORE.loadPlayer(playerId);
        if (!fresh) return;
        ensurePlayerGenerationSchema(fresh);
        const inserted = upsertMainlineForeshadowPins(fresh, lines);
        if (inserted > 0) {
          if (typeof CORE.appendPlayerMemoryAudit === 'function') {
            CORE.appendPlayerMemoryAudit(fresh, {
              layer: 'mainline_ai',
              category: '主線記憶',
              reason: `背景AI判定為長期鋪陳，寫入 ${inserted} 條主線釘選`,
              content: lines.slice(0, 2).join('、') || '背景AI補充主線鋪陳',
              source: `mainline_ai_${phase}`,
              tags: ['main_story', 'mainline_ai']
            });
          }
          CORE.savePlayer(fresh);
          console.log(`[MainlineAI] phase=${phase} player=${playerId} inserted=${inserted}`);
        }
      })
      .catch((e) => {
        console.log('[MainlineAI] background error:', e?.message || e);
      });
  }

  return {
    stableHashCode,
    normalizeStoryDialoguePins,
    upsertStoryDialoguePins,
    extractMainlineForeshadowClues,
    normalizeMainlineForeshadowPins,
    upsertMainlineForeshadowPins,
    rememberStoryDialogues,
    triggerMainlineForeshadowAIInBackground,
    ensurePlayerCodexSchema,
    normalizeMapViewMode
  };
}

module.exports = {
  createStoryMemoryPinsUtils
};
