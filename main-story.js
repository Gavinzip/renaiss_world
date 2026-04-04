/**
 * 📖 Renaiss 主線（被動觸發版）
 * 不提供固定主線按鈕，隨玩家遊玩行為自然推進。
 */

const { sanitizeWorldObject } = require('./style-sanitizer');
const BATTLE = require('./battle-system');
const ISLAND_STORY = require('./island-story');

const STORY_ACTS = {
  1: 'Act 1 誘惑（The Cheap Choice）',
  2: 'Act 2 流言（Whispers）',
  3: 'Act 3 狩獵（Marked）',
  4: 'Act 4 市場戰爭（War）',
  5: 'Act 5 四巨頭（Endgame）',
  6: 'Act 6 Winchman 抉擇'
};

const DIGITAL_KINGS = ['Nemo', 'Wolf', 'Adaloc', 'Hom'];
const KING_ENCOUNTER_GAP_EVENTS = Math.max(1, Number(process.env.KING_ENCOUNTER_GAP_EVENTS || 2));
const ASSASSIN_PRESSURE_GAP_EVENTS = Math.max(2, Number(process.env.ASSASSIN_PRESSURE_GAP_EVENTS || 4));

const ENDING_RULES = {
  order: { fakeRate: 0.12, ambushRate: 0.15, volatility: 0.08, rewardVariance: 0.2 },
  chaos: { fakeRate: 0.48, ambushRate: 0.42, volatility: 0.35, rewardVariance: 0.65 },
  controller: { fakeRate: 0.28, ambushRate: 0.24, volatility: 0.18, rewardVariance: 0.4 }
};

function getCompletedLocationCount(player) {
  if (ISLAND_STORY && typeof ISLAND_STORY.countCompletedIslands === 'function') {
    const total = Number(ISLAND_STORY.countCompletedIslands(player));
    if (Number.isFinite(total) && total >= 0) return total;
  }
  const completed = player?.locationArcState?.completedLocations;
  if (!completed || typeof completed !== 'object' || Array.isArray(completed)) return 0;
  return Object.keys(completed).length;
}

function pickVariant(lines = [], seed = 0) {
  const arr = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (arr.length === 0) return '';
  const idx = Math.abs(Number(seed || 0)) % arr.length;
  return String(arr[idx] || '').trim();
}

function getIslandContext(player, location = '') {
  const loc = String(location || player?.location || '').trim() || '當前地區';
  const islandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
    ? ISLAND_STORY.getIslandStoryState(player, loc)
    : null;
  const stageCount = Math.max(1, Number(islandState?.stageCount || 8));
  const stage = Math.max(1, Number(islandState?.stage || 1));
  const chapter = ISLAND_STORY && typeof ISLAND_STORY.getStoryChapterTitle === 'function'
    ? String(ISLAND_STORY.getStoryChapterTitle(loc) || '島內篇章').trim()
    : '島內篇章';
  const roadmap = ISLAND_STORY && typeof ISLAND_STORY.getStoryRoadmap === 'function'
    ? ISLAND_STORY.getStoryRoadmap(loc, stageCount)
    : [];
  const stageIdx = Math.max(0, Math.min(Math.max(0, stageCount - 1), stage - 1));
  const stageGoal = String((Array.isArray(roadmap) && roadmap[stageIdx]) || '').trim();
  const nextPrimary = ISLAND_STORY && typeof ISLAND_STORY.getNextPrimaryLocation === 'function'
    ? String(ISLAND_STORY.getNextPrimaryLocation(loc) || '').trim()
    : '';
  const nextPortalHub = nextPrimary ? String(getLocationPortalHub(nextPrimary) || '').trim() : '';

  return {
    location: loc,
    chapter,
    stage,
    stageCount,
    stageGoal,
    nextPrimary,
    nextPortalHub
  };
}

function buildMainlineBeatText(player, state, beat, extras = {}) {
  const ctx = getIslandContext(player, extras.location || player?.location || '');
  const seed = Number(state?.eventCount || 0);
  const goalLine = ctx.stageGoal ? `當前落點：${ctx.stageGoal}` : '';

  switch (beat) {
    case 'act1_anomaly':
      return pickVariant([
        `📖 **主線異動**：你在${ctx.location}發現一支「新手友善供應」隊伍正快速收客，開價低得不尋常。${goalLine ? `\n${goalLine}` : ''}`,
        `📖 **主線異動**：${ctx.location}出現過度友善的低價服務，吸走了大量注意力。${goalLine ? `\n${goalLine}` : ''}`
      ], seed);
    case 'act2_whispers':
      return pickVariant([
        `📖 **主線異動**：${ctx.location}流言升溫，有人回報「上架很快、成交很慢」，低價供應線的貨流開始不對勁。`,
        `📖 **主線異動**：你在${ctx.location}聽見相同傳聞反覆出現：價格漂亮，但實際流動性很差。`
      ], seed);
    case 'act3_marked':
      return pickVariant([
        `📖 **主線異動**：你追查到「宣稱有貨、實際無貨」的交易糾紛後，行蹤開始被人標記。`,
        `📖 **主線異動**：你剛靠近供應鏈缺口，就察覺有人在記錄你的路線與停留節點。`
      ], seed);
    case 'act4_pressure':
      return pickVariant([
        `📖 **主線異動**：跟監壓力升高，對方開始試探你的節奏，還沒正面動手。`,
        `📖 **主線異動**：你在${ctx.location}明顯感到尾隨存在，對手正在等你露出破口。`
      ], seed);
    case 'act4_probe':
      return pickVariant([
        `📖 **主線異動**：追兵已貼近，但仍停在試探距離；你有一個短窗口可先佈局。`,
        `📖 **主線異動**：對方沒有立刻開戰，卻持續壓縮你的活動空間。`
      ], seed);
    case 'act4_side': {
      const side = String(extras.side || '未定').trim();
      return pickVariant([
        `📖 **主線異動**：市場戰況升級，你目前的行動傾向被判定為「${side}」。`,
        `📖 **主線異動**：你的決策軌跡已形成明顯立場：${side}。`
      ], seed);
    }
    case 'act5_all_defeated':
      return pickVariant([
        '📖 **主線異動**：四巨頭已全數潰退，終章入口正在打開。',
        '📖 **主線異動**：四巨頭戰線收束完成，最終抉擇階段即將展開。'
      ], seed);
    case 'act5_king_hunt': {
      const king = String(extras.king || '目標').trim();
      const cleared = Math.max(0, Number(extras.cleared || 0));
      return pickVariant([
        `📖 **主線異動**：四巨頭追擊戰鎖定「${king}」，目前擊破進度 ${cleared}/${DIGITAL_KINGS.length}。`,
        `📖 **主線異動**：你鎖定四巨頭「${king}」活動區，戰線進度 ${cleared}/${DIGITAL_KINGS.length}。`
      ], seed);
    }
    case 'act6_remaining_kings': {
      const remaining = Array.isArray(extras.remaining) ? extras.remaining.filter(Boolean).join('、') : '';
      return `📖 **主線線索**：終章前仍需清掉未完成目標：${remaining || '四巨頭殘餘'}。`;
    }
    case 'act6_ending': {
      const ending = String(extras.ending || '未定').trim();
      return `📖 **主線終局**：真相公開後，你把世界線收束到【${ending}】。`;
    }
    default:
      return '';
  }
}

function buildTravelGateHint(state, required, completed, player = null) {
  const need = Math.max(0, Number(required || 0) - Number(completed || 0));
  if (need <= 0) return '';
  const eventCount = Number(state?.eventCount || 0);
  const lastHintAt = Number(state?.lastTravelHintEventCount || -999);
  if (eventCount - lastHintAt < 2) return '';
  state.lastTravelHintEventCount = eventCount;
  const ctx = getIslandContext(player, player?.location || '');
  const portalTarget = ctx.nextPortalHub || ctx.nextPrimary || '下一個可用地區';
  return [
    `📖 **主線線索**：你在${ctx.location}已拿到可延伸線索，下一步需要跨區驗證。`,
    ctx.stageGoal ? `當前落點：${ctx.stageGoal}` : '',
    `請靠近主傳送門，朝「${portalTarget}」推進；尚需完成 ${need} 個地區篇章。`,
    `${ctx.chapter}｜${ctx.stage}/${ctx.stageCount}`
  ].filter(Boolean).join('\n');
}

function normalizeKingProgressState(state) {
  if (!state || typeof state !== 'object') return;
  if (!Array.isArray(state.defeatedKings)) state.defeatedKings = [];
  state.defeatedKings = state.defeatedKings
    .map((name) => String(name || '').trim())
    .filter((name, idx, arr) => DIGITAL_KINGS.includes(name) && arr.indexOf(name) === idx);
  if (!Number.isFinite(Number(state.lastKingEncounterEventCount))) {
    state.lastKingEncounterEventCount = -999;
  }
  if (state.pendingKing != null) {
    const pending = String(state.pendingKing || '').trim();
    state.pendingKing = DIGITAL_KINGS.includes(pending) ? pending : null;
  } else {
    state.pendingKing = null;
  }
}

function getRemainingKings(state) {
  normalizeKingProgressState(state);
  const defeated = new Set(state.defeatedKings || []);
  return DIGITAL_KINGS.filter((name) => !defeated.has(name));
}

function ensureMainStoryState(player) {
  if (!player) return null;
  if (!player.mainStory || typeof player.mainStory !== 'object') {
    player.mainStory = {
      act: 1,
      node: 'act1_market',
      side: null,
      completed: false,
      ending: null,
      history: [],
      pressure: 0,
      eventCount: 0,
      lastTravelHintEventCount: -999,
      lastAssassinPressureEventCount: -999,
      defeatedKings: [],
      lastKingEncounterEventCount: -999,
      pendingKing: null,
      signals: {
        order: 0,
        chaos: 0,
        control: 0
      }
    };
  }
  if (!player.mainStory.signals) {
    player.mainStory.signals = { order: 0, chaos: 0, control: 0 };
  }
  if (typeof player.mainStory.eventCount !== 'number') {
    player.mainStory.eventCount = 0;
  }
  if (!Number.isFinite(Number(player.mainStory.lastTravelHintEventCount))) {
    player.mainStory.lastTravelHintEventCount = -999;
  }
  if (!Number.isFinite(Number(player.mainStory.lastAssassinPressureEventCount))) {
    player.mainStory.lastAssassinPressureEventCount = -999;
  }
  normalizeKingProgressState(player.mainStory);
  return player.mainStory;
}

function getMainStoryBrief(player) {
  const state = ensureMainStoryState(player);
  if (!state) return '主線未初始化';
  const endingText = state.ending ? `｜結局：${state.ending}` : '';
  const kingProgressText =
    Number(state.act || 1) >= 5 || state.node === 'act6_winchman'
      ? `｜四巨頭：${Number((state.defeatedKings || []).length)}/${DIGITAL_KINGS.length}`
      : '';
  return `${STORY_ACTS[state.act] || '未知章節'}｜節點：${state.node}${kingProgressText}${endingText}`;
}

function pushHistory(state, text) {
  state.history.unshift({ text, at: Date.now() });
  if (state.history.length > 24) state.history.pop();
}

function markNode(state, act, node, note) {
  state.act = act;
  state.node = node;
  if (note) pushHistory(state, note);
}

function addSignal(state, key, amount) {
  state.signals[key] = (state.signals[key] || 0) + amount;
}

function absorbPlayerBehavior(state, event, result) {
  const action = String(event?.action || '');
  const type = String(result?.type || '');

  state.eventCount += 1;

  if (['gossip', 'social', 'quest', 'help', 'rest', 'meditate', 'forage', 'hunt'].includes(action)) {
    addSignal(state, 'order', 2);
  }
  if (['fight', 'rob', 'assassinate', 'extort', 'wish_pool'].includes(action)) {
    addSignal(state, 'chaos', 2);
  }
  if (['explore', 'teleport', 'treasure', 'wish_pool', 'shop'].includes(action)) {
    addSignal(state, 'control', 1);
  }

  if (type === 'combat') addSignal(state, 'chaos', 1);
  if (type === 'wish_pool') addSignal(state, 'control', 2);
}

function chooseEnding(state) {
  const order = state.signals.order || 0;
  const chaos = state.signals.chaos || 0;
  const control = state.signals.control || 0;

  if (control >= Math.max(order, chaos) + 2) return '控制者';
  if (order >= chaos) return '秩序';
  return '混亂';
}

function finalizeEnding(state, player) {
  const ending = chooseEnding(state);
  state.ending = ending;
  state.completed = true;
  state.node = 'epilogue';

  if (ending === '秩序') {
    state.worldRule = { mode: 'order', ...ENDING_RULES.order };
  } else if (ending === '混亂') {
    state.worldRule = { mode: 'chaos', ...ENDING_RULES.chaos };
  } else {
    state.worldRule = { mode: 'controller', ...ENDING_RULES.controller, controllerId: player?.id || '' };
  }

  pushHistory(state, `Act 6 結局：${ending}`);
  return ending;
}

function buildMaskedAssassinEncounter() {
  const enemy = {
    id: 'masked_assassin_story',
    name: '覆面獵手',
    hp: 130,
    maxHp: 130,
    attack: 32,
    defense: 12,
    moves: BATTLE.buildEnemyMoveLoadout('覆面獵手', 12, ['突襲', '奪包', '煙霧'], {
      villain: true,
      attack: 32
    }),
    reward: { gold: [70, 130] },
    isMonster: true
  };
  return sanitizeWorldObject({
    type: 'combat',
    message: '💀 你被暗潮勢力注意到了。覆面獵手夜襲而來，先試你深淺。',
    enemy,
    canFlee: true,
    fleeRate: 0.7,
    fleeAttempts: 2
  });
}

function buildKingEncounter(forcedKing = '') {
  const king = DIGITAL_KINGS.includes(String(forcedKing || '').trim())
    ? String(forcedKing || '').trim()
    : DIGITAL_KINGS[Math.floor(Math.random() * DIGITAL_KINGS.length)];
  const kingEnemy = BATTLE.createDigitalKingEnemy(king);
  return sanitizeWorldObject({
    king,
    encounter: {
      type: 'combat',
      message: `👑 四巨頭「${king}」現身，變異寵物在你面前失控咆哮。`,
      enemy: kingEnemy,
      canFlee: true,
      fleeRate: 0.7,
      fleeAttempts: 2
    }
  });
}

function maybeTriggerPassiveStory(player, context = {}) {
  const state = ensureMainStoryState(player);
  if (!state || state.completed) return null;

  const event = context.event || {};
  const result = context.result || {};
  absorbPlayerBehavior(state, event, result);

  const count = state.eventCount;
  const completedLocations = getCompletedLocationCount(player);
  const triggered = {
    appendText: '',
    overrideResult: null,
    announcement: '',
    memory: ''
  };

  if (state.node === 'act1_market' && count >= 2) {
    markNode(state, 1, 'act1_anomaly', 'Act1 -> 市場誘惑被看見');
    triggered.appendText = buildMainlineBeatText(player, state, 'act1_anomaly');
    triggered.memory = '你注意到一股看似友善的新勢力正在搶占市場信任。';
    return triggered;
  }

  if (state.node === 'act1_anomaly' && count >= 4) {
    markNode(state, 2, 'act2_whispers', 'Act2 -> 流言啟動');
    triggered.appendText = buildMainlineBeatText(player, state, 'act2_whispers');
    triggered.announcement = '🗣️ 市場流言升溫：某支常幫新手的隊伍，帳本來源與實際成交量出現異常。';
    triggered.memory = '你聽見「某低價供應線看似熱賣、其實流動性很差」的傳言。';
    return triggered;
  }

  if (state.node === 'act2_whispers' && count >= 6) {
    if (completedLocations < 1) {
      const travelHint = buildTravelGateHint(state, 1, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '你需要跨區追查，主線才會繼續推進。';
      return triggered;
    }
    markNode(state, 3, 'act3_marked', 'Act3 -> 被盯上');
    triggered.appendText = buildMainlineBeatText(player, state, 'act3_marked');
    triggered.memory = '你聽見低價供應鏈出現「流動性差、空單偽造」的風聲，並因此被對方注意到。';
    return triggered;
  }

  if (state.node === 'act3_marked' && count >= 8) {
    if (completedLocations < 1) {
      const travelHint = buildTravelGateHint(state, 1, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '你仍在同一區，主線暫時卡在追查階段。';
      return triggered;
    }
    markNode(state, 4, 'act4_war', 'Act4 -> 蒙面狩獵觸發');
    state.lastAssassinPressureEventCount = count;
    triggered.appendText = buildMainlineBeatText(player, state, 'act4_pressure');
    triggered.memory = '你被暗潮勢力盯上，追兵開始尾隨試探。';
    return triggered;
  }

  if (state.node === 'act4_war' && count < 10) {
    const sinceLastPressure = count - Number(state.lastAssassinPressureEventCount || -999);
    if (count >= 9 && sinceLastPressure >= ASSASSIN_PRESSURE_GAP_EVENTS) {
      state.lastAssassinPressureEventCount = count;
      if (Math.random() < 0.42) {
        triggered.overrideResult = buildMaskedAssassinEncounter();
        triggered.announcement = `💀 ${player.name}遭遇了暗潮覆面獵手的狩獵測試。`;
        triggered.memory = '覆面獵手現身並發動了突襲。';
      } else {
        triggered.appendText = buildMainlineBeatText(player, state, 'act4_probe');
        triggered.memory = '追兵尚未開戰，但你確定自己正在被鎖定。';
      }
      return triggered;
    }
  }

  if (state.node === 'act4_war' && count >= 10) {
    if (completedLocations < 2) {
      const travelHint = buildTravelGateHint(state, 2, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '你需要走訪更多地區，市場戰爭才會升級。';
      return triggered;
    }
    state.side = (state.signals.chaos || 0) > (state.signals.order || 0)
      ? 'Digital（機變策略）'
      : 'Renaiss（秩序）';
    markNode(state, 5, 'act5_kings', `Act5 -> 市場戰爭立場：${state.side}`);
    triggered.appendText = buildMainlineBeatText(player, state, 'act4_side', { side: state.side });
    triggered.announcement = `⚔️ 市場戰爭進入白熱化，${player.name}立場傾向 ${state.side}。`;
    triggered.memory = `你在市場戰爭中的傾向為 ${state.side}。`;
    return triggered;
  }

  if (state.node === 'act5_kings' && count >= 13) {
    if (completedLocations < 2) {
      const travelHint = buildTravelGateHint(state, 2, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '你尚未累積足夠跨區戰績，四巨頭暫未現身。';
      return triggered;
    }
    normalizeKingProgressState(state);
    const remainingKings = getRemainingKings(state);
    if (remainingKings.length === 0) {
      markNode(state, 6, 'act6_winchman', 'Act6 前置 -> 四巨頭全滅');
      triggered.appendText = buildMainlineBeatText(player, state, 'act5_all_defeated');
      triggered.announcement = `🏁 ${player.name}已擊破四巨頭，最終章即將開啟。`;
      triggered.memory = '你已擊敗四巨頭，終章只差最後抉擇。';
      return triggered;
    }
    const sinceLastEncounter = count - Number(state.lastKingEncounterEventCount || -999);
    if (sinceLastEncounter < KING_ENCOUNTER_GAP_EVENTS) {
      return null;
    }
    const preferredKing = state.pendingKing && remainingKings.includes(state.pendingKing)
      ? state.pendingKing
      : remainingKings[Math.floor(Math.random() * remainingKings.length)];
    state.pendingKing = preferredKing;
    state.lastKingEncounterEventCount = count;
    const kingData = buildKingEncounter(preferredKing);
    triggered.overrideResult = kingData.encounter;
    triggered.appendText = buildMainlineBeatText(player, state, 'act5_king_hunt', {
      king: kingData.king,
      cleared: (state.defeatedKings || []).length
    });
    triggered.announcement = `👑 ${player.name}遭遇四巨頭「${kingData.king}」的追擊。`;
    triggered.memory = `你與四巨頭 ${kingData.king} 交手。`;
    return triggered;
  }

  if (state.node === 'act6_winchman' && count >= 16) {
    const remainingKings = getRemainingKings(state);
    if (remainingKings.length > 0) {
      triggered.appendText = buildMainlineBeatText(player, state, 'act6_remaining_kings', { remaining: remainingKings });
      triggered.memory = `你尚未擊敗全部四巨頭：${remainingKings.join('、')}。`;
      return triggered;
    }
    if (completedLocations < 3) {
      const travelHint = buildTravelGateHint(state, 3, completedLocations, player);
      if (!travelHint) return null;
      triggered.appendText = travelHint;
      triggered.memory = '終局前仍需跨區蒐證，避免在單一地區收束主線。';
      return triggered;
    }
    const ending = finalizeEnding(state, player);
    triggered.appendText = buildMainlineBeatText(player, state, 'act6_ending', { ending });
    triggered.announcement = `🌍 ${player.name}完成主線終局，世界偏向「${ending}」路徑。`;
    triggered.memory = `你完成主線並走向「${ending}」結局。`;
    return triggered;
  }

  return null;
}

function recordCombatOutcome(player, context = {}) {
  const state = ensureMainStoryState(player);
  if (!state || state.completed) return null;
  normalizeKingProgressState(state);

  const victory = Boolean(context?.victory);
  if (!victory) return null;
  const enemyName = String(context?.enemyName || '').trim();
  if (!enemyName) return null;

  const defeatedKing = DIGITAL_KINGS.find((name) => enemyName === name || enemyName.includes(name));
  if (!defeatedKing) return null;
  if (state.defeatedKings.includes(defeatedKing)) return null;

  state.defeatedKings.push(defeatedKing);
  state.pendingKing = state.pendingKing === defeatedKing ? null : state.pendingKing;
  const cleared = state.defeatedKings.length;
  const remainingKings = getRemainingKings(state);

  const progressLines = [
    `👑 **四巨頭進度更新**：你擊破了「${defeatedKing}」，戰線推進到 ${cleared}/${DIGITAL_KINGS.length}。`,
    `👑 **四巨頭進度更新**：目標「${defeatedKing}」已被你壓制，累積進度 ${cleared}/${DIGITAL_KINGS.length}。`
  ];
  const triggered = {
    appendText: pickVariant(progressLines, Number(state?.eventCount || 0) + cleared),
    announcement: `👑 ${player?.name || '玩家'}擊破四巨頭「${defeatedKing}」。（${cleared}/${DIGITAL_KINGS.length}）`,
    memory: `你擊敗四巨頭 ${defeatedKing}，目前進度 ${cleared}/${DIGITAL_KINGS.length}。`
  };

  if (remainingKings.length === 0 && state.node === 'act5_kings') {
    markNode(state, 6, 'act6_winchman', 'Act6 前置 -> 四巨頭全滅');
    triggered.appendText += '\n📖 四巨頭全滅，終章入口已解鎖。';
    triggered.announcement = `🏁 ${player?.name || '玩家'}已擊破四巨頭，終章入口開啟。`;
    triggered.memory = '你已擊敗全部四巨頭，終章即將展開。';
  }

  return triggered;
}

function getWorldRuleProfile(player) {
  const state = ensureMainStoryState(player);
  return state?.worldRule || null;
}

function getMainStoryChoice() {
  // 被動觸發版：不再提供固定主線按鈕
  return null;
}

function resolveMainStoryAction(player) {
  // 舊流程相容：若玩家點到舊版按鈕，只回提示
  ensureMainStoryState(player);
  return {
    result: {
      type: 'main_story',
      message: '📖 主線已改為被動觸發：你在開放世界行動時會自然推進劇情。'
    },
    announcement: null
  };
}

module.exports = {
  STORY_ACTS,
  DIGITAL_KINGS,
  ENDING_RULES,
  ensureMainStoryState,
  getMainStoryBrief,
  getMainStoryChoice,
  resolveMainStoryAction,
  maybeTriggerPassiveStory,
  getWorldRuleProfile,
  recordCombatOutcome
};
