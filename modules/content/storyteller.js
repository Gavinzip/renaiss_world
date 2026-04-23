/**
 * 📖 AI 故事生成器 v6 - 記憶+風險標籤+NPC狀態
 */

const { loadProjectEnv } = require('../core/load-env');

loadProjectEnv();

const {
  LOCATION_DESCRIPTIONS,
  getPortalDestinations,
  getConnectedLocations,
  findLocationPath,
  getLocationStoryContext,
  getLocationProfile,
  getNearbyPoints
} = require('./world-map');
const ISLAND_STORY = require('./story/island-story');
const MAIN_STORY = require('./story/main-story');
const WORLD_LORE = require('../core/world-lore');
const CORE = require('../core/game-core');
const { createGlobalLanguageResources } = require('../systems/runtime/utils/global-language-resources');
const {
  getLocationPlaystyleProfile,
  getLocationPlaystylePromptBlock,
  countChoiceKeywordHits
} = require('./location-playstyle');
const {
  getCollectibleCulturePrompt
} = require('./collectible-culture');
const {
  getLocationWeatherPrompt,
  getLocationWeatherProfile
} = require('./location-weather');
const DYNAMIC_WORLD = require('./dynamic-world-utils');
const { computeAlignmentProfileFromPlayer } = require('./alignment-profile-utils');
const {
  getChoiceTag,
  localizeChoiceTag,
  getChoiceTagPromptLines,
  isAggressiveChoiceTag,
  normalizeLangCode
} = require('../systems/runtime/utils/global-language-resources');

const LANGUAGE_RESOURCES = createGlobalLanguageResources({
  normalizeLangCode: (lang = 'zh-TW') => {
    const raw = String(lang || '').trim();
    const lower = raw.toLowerCase();
    if (
      raw === 'zh-CN' ||
      lower === 'zh-cn' ||
      lower === 'zh_cn' ||
      lower === 'zh-hans' ||
      lower === 'cn' ||
      lower === 'sc' ||
      lower.includes('简体')
    ) return 'zh-CN';
    if (
      raw === 'en' ||
      lower === 'english' ||
      lower === 'en_us' ||
      lower === 'en-us' ||
      lower.startsWith('en-')
    ) return 'en';
    if (
      raw === 'ko' ||
      raw === 'ko-KR' ||
      lower === 'ko' ||
      lower === 'ko-kr' ||
      lower === 'kr' ||
      lower === 'korean' ||
      lower.includes('한국')
    ) return 'ko';
    return 'zh-TW';
  }
});

function getAiLanguageDirective(lang = 'zh-TW', tone = 'output') {
  const table = LANGUAGE_RESOURCES.getSection('aiLanguageDirectives', lang) || {};
  if (tone === 'plain') return table.plain || '請用繁體中文';
  if (tone === 'narrate') return table.narrate || '請用繁體中文講述';
  if (tone === 'outputFullstop') return table.outputFullstop || '請用繁體中文輸出。';
  return table.output || '請用繁體中文輸出';
}

const API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_MODEL = 'MiniMax-M2.5';

const RENAISS_LOCATIONS = { ...LOCATION_DESCRIPTIONS };

const RENAISS_NPCS = {
  '草原部落': [
    { name: '凱爾', title: '巡航隊長', level: 15, pet: '熾蹄獸', petType: '熱能', align: '信標聯盟', desc: '擅長地形導航與護送任務' },
    { name: '薩伊', title: '生態監測員', level: 20, pet: '霜尾狼', petType: '低溫', align: '信標聯盟', desc: '負責氣候與資源穩定' },
    { name: '阿列姆', title: '補給商隊領航', level: 8, pet: '載重駝機', petType: '地脈', align: '中立', desc: '熟悉跨區物流路線' }
  ],
  '襄陽城': [
    { name: '林工程師', title: '機械整備師', level: 15, pet: '齒輪獸', petType: '機甲', align: '信標聯盟', desc: '專門修復戰鬥模組與部件' },
    { name: '蘇醫生', title: '細胞治療師', level: 20, pet: '治癒水母', petType: '液態', align: '信標聯盟', desc: '精通生體修復與中毒處理' },
    { name: '黑影商人', title: '訊息中介', level: 8, pet: '隱幽鼠', petType: '暗域', align: '中立', desc: '情報與稀有貨品都能談' }
  ],
  '大都': [
    { name: '阿爾文', title: '節點執行官', level: 25, pet: '金焰獅', petType: '熱能', align: '信標聯盟', desc: '主導大型區域治理與調度' },
    { name: '季衡', title: '情資網路管理者', level: 18, pet: '棱鏡烏鴉', petType: '訊號', align: '中立', desc: '擅長追蹤異常訊號與偽造流言' },
    { name: '牡丹', title: '公共關係顧問', level: 12, pet: '花仙蝶', petType: '生質', align: '信標聯盟', desc: '精於社交協商與多方協調' }
  ],
  '蓬萊觀測島': [
    { name: '蓮白', title: '觀測站負責人', level: 30, pet: '蓮芯靈', petType: '共鳴', align: '信標聯盟', desc: '管理高維訊號觀測與封存' }
  ],
  '蓬萊仙島': [
    { name: '蓮白', title: '觀測站負責人', level: 30, pet: '蓮芯靈', petType: '共鳴', align: '信標聯盟', desc: '管理高維訊號觀測與封存' }
  ]
};

const https = require('https');
let convertCNToTW = (text) => text;
let convertTWToCN = (text) => text;
try {
  const OpenCC = require('opencc-js');
  convertCNToTW = OpenCC.Converter({ from: 'cn', to: 'tw' });
  convertTWToCN = OpenCC.Converter({ from: 'tw', to: 'cn' });
} catch (e) {
  console.log('[Storyteller] OpenCC not available, skip script conversion:', e.message);
}

const AI_MAX_RETRIES = 3;
const AI_TIMEOUT_MS = 90000;
const AI_MAX_RESPONSE_TOKENS = Math.max(512, Number(process.env.AI_MAX_RESPONSE_TOKENS || 4096));
const AI_UNLIMITED_TIMEOUT = !/^(0|false|off|no)$/i.test(String(process.env.AI_UNLIMITED_TIMEOUT || '0').trim());
const AI_UNLIMITED_MAX_TOKENS = !/^(0|false|off|no)$/i.test(String(process.env.AI_UNLIMITED_MAX_TOKENS || '1').trim());
const STORY_TIMEOUT_MS = Math.max(12000, Number(process.env.STORY_TIMEOUT_MS || 40000));
const STORY_GEN_RETRIES = Math.max(2, Math.min(3, Number(process.env.STORY_GEN_RETRIES || 2)));
const CHOICE_TIMEOUT_MS = Math.max(8000, Number(process.env.CHOICE_TIMEOUT_MS || 180000));
const SYSTEM_CHOICE_TIMEOUT_MS = Math.max(8000, Number(process.env.SYSTEM_CHOICE_TIMEOUT_MS || 180000));
const CHOICE_GEN_RETRIES = Math.max(1, Math.min(2, Number(process.env.CHOICE_GEN_RETRIES || 1)));
const CHOICE_VALIDATION_PASSES = Math.max(1, Math.min(3, Number(process.env.CHOICE_VALIDATION_PASSES || 1)));
const CHOICE_MAX_TOKENS = Math.max(500, Number(process.env.CHOICE_MAX_TOKENS || 1200));
const CHOICE_OUTPUT_COUNT = 5;
const AI_GLOBAL_CONCURRENCY = Math.max(1, Math.min(20, Number(process.env.AI_GLOBAL_CONCURRENCY || 20)));
const AI_RATE_LIMIT_RETRIES = Math.max(0, Math.min(5, Number(process.env.AI_RATE_LIMIT_RETRIES || 5)));
const AI_RATE_LIMIT_RETRY_DELAY_MS = Math.max(200, Math.min(5000, Number(process.env.AI_RATE_LIMIT_RETRY_DELAY_MS || 1000)));
const BATTLE_CADENCE_TURNS = Math.max(3, Math.min(10, Number(process.env.BATTLE_CADENCE_TURNS || 5)));
const WANTED_AMBUSH_MIN_LEVEL = Math.max(1, Math.min(10, Number(process.env.WANTED_AMBUSH_MIN_LEVEL || 1)));
const RIVAL_NAME_REVEAL_ACT = Math.max(1, Math.min(6, Number(process.env.RIVAL_NAME_REVEAL_ACT || 3)));
const DIGITAL_MASK_TURNS = Math.max(1, Number(process.env.DIGITAL_MASK_TURNS || 12));
const LOCATION_ARC_COMPLETE_TURNS = Math.max(3, Math.min(16, Number(process.env.LOCATION_ARC_COMPLETE_TURNS || 10)));
const PERF_MAX_SAMPLES = Math.max(10, Math.min(300, Number(process.env.AI_PERF_MAX_SAMPLES || 80)));

const AI_PERF = {
  story: [],
  choices: [],
  initialChoices: []
};

const AI_QUEUE = [];
let AI_ACTIVE_REQUESTS = 0;
const AI_RUNTIME = {
  currentQueued: 0,
  maxQueued: 0,
  maxActive: 0,
  totalRateLimitRetries: 0
};

const FACTION_DISPLAY_MAP = Object.freeze({
  '正派': '信標聯盟',
  '機變派': '灰域協定',
  '反派': '灰域協定'
});

const NARRATIVE_TERM_REPLACEMENTS = [
  [/\b寶可夢\b/gi, '晶獸'],
  [/\b數碼寶貝\b/gi, '碼獸'],
  [/\b斗羅大陸\b/gi, '星核紀元'],
  [/江湖/g, '星域網路'],
  [/俠客|俠士|俠義|大俠/g, '探索者'],
  [/武林/g, '探索圈'],
  [/門派/g, '陣營'],
  [/武功|武學/g, '戰技模組'],
  [/內力/g, '能量'],
  [/打坐/g, '靜態校準'],
  [/修煉/g, '同步校準'],
  [/劍/g, '刃械'],
  [/掌法|拳法/g, '近戰模組'],
  [/師父|道長|掌門/g, '導師'],
  [/寺廟/g, '中繼站'],

  // 降低金融語感，改為科技收藏語境
  [/數據風暴|資料風暴/g, '訊號風暴'],
  [/數據擾動|資料擾動/g, '訊號亂流'],
  [/數據進化|資料進化/g, '模組演化'],
  [/估值|估價/g, '真偽鑑定'],
  [/報價/g, '開價'],
  [/收益率|回報率/g, '收穫幅度'],
  [/套利/g, '轉手調度']
];

const DIGITAL_KING_CODENAMES = Object.freeze(['NemoX', 'WolfX', 'AdalocX', 'HomX']);
const DIGITAL_KING_CODENAME_REGEX = /\b(?:NemoX|WolfX|AdalocX|HomX)\b/u;

function canonicalizeKingCodenamesText(text = '') {
  let out = String(text || '');
  if (!out) return '';
  out = out
    .replace(/\bNemo(?!X)\b/giu, 'NemoX')
    .replace(/\bWolf(?!X)\b/giu, 'WolfX')
    .replace(/\bAdaloc(?!X)\b/giu, 'AdalocX')
    .replace(/\bHom(?!X)\b/giu, 'HomX');
  return out;
}

function canonicalizeKingCodenamesChoice(choice = null) {
  if (!choice || typeof choice !== 'object') return choice;
  return {
    ...choice,
    name: canonicalizeKingCodenamesText(choice.name || ''),
    choice: canonicalizeKingCodenamesText(choice.choice || ''),
    desc: canonicalizeKingCodenamesText(choice.desc || '')
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildAIError(message = 'AI request failed', meta = {}) {
  const error = new Error(String(message || 'AI request failed'));
  Object.assign(error, meta);
  return error;
}

function isAIRateLimitError(error) {
  if (!error) return false;
  if (error.isRateLimit) return true;
  const statusCode = Number(error.statusCode || 0);
  if (statusCode === 429) return true;
  const raw = `${String(error.message || '')}\n${String(error.responseText || '')}`.toLowerCase();
  return /rate limit|too many requests|429|quota/i.test(raw);
}

function updateAIQueueMetrics() {
  AI_RUNTIME.currentQueued = AI_QUEUE.length;
  if (AI_RUNTIME.currentQueued > AI_RUNTIME.maxQueued) {
    AI_RUNTIME.maxQueued = AI_RUNTIME.currentQueued;
  }
  if (AI_ACTIVE_REQUESTS > AI_RUNTIME.maxActive) {
    AI_RUNTIME.maxActive = AI_ACTIVE_REQUESTS;
  }
}

function releaseAISlot() {
  if (AI_QUEUE.length > 0) {
    const next = AI_QUEUE.shift();
    updateAIQueueMetrics();
    if (typeof next === 'function') next();
    return;
  }
  AI_ACTIVE_REQUESTS = Math.max(0, AI_ACTIVE_REQUESTS - 1);
  updateAIQueueMetrics();
}

async function withAIConcurrency(task, label = 'requestAI') {
  await new Promise((resolve) => {
    if (AI_ACTIVE_REQUESTS < AI_GLOBAL_CONCURRENCY) {
      AI_ACTIVE_REQUESTS += 1;
      updateAIQueueMetrics();
      resolve();
      return;
    }
    AI_QUEUE.push(() => {
      updateAIQueueMetrics();
      resolve();
    });
    updateAIQueueMetrics();
    console.log(`[AI][${label}] queued active=${AI_ACTIVE_REQUESTS}/${AI_GLOBAL_CONCURRENCY} waiting=${AI_QUEUE.length}`);
  });

  try {
    return await task();
  } finally {
    releaseAISlot();
  }
}

function recordAIPerf(kind = 'story', ms = 0) {
  const key = kind === 'choices' || kind === 'initialChoices' ? kind : 'story';
  const value = Math.max(0, Number(ms || 0));
  if (!Number.isFinite(value)) return;
  const bucket = AI_PERF[key];
  bucket.push(value);
  if (bucket.length > PERF_MAX_SAMPLES) bucket.splice(0, bucket.length - PERF_MAX_SAMPLES);
}

function summarizeAIPerfBucket(list = []) {
  if (!Array.isArray(list) || list.length === 0) {
    return { count: 0, avgMs: 0, p95Ms: 0, maxMs: 0 };
  }
  const sorted = [...list].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, cur) => acc + cur, 0);
  const avgMs = Math.round(sum / count);
  const p95Idx = Math.max(0, Math.min(count - 1, Math.ceil(count * 0.95) - 1));
  const p95Ms = Math.round(sorted[p95Idx]);
  const maxMs = Math.round(sorted[count - 1]);
  return { count, avgMs, p95Ms, maxMs };
}

function getAIPerfStats() {
  return {
    config: {
      globalConcurrency: AI_GLOBAL_CONCURRENCY,
      rateLimitRetries: AI_RATE_LIMIT_RETRIES,
      rateLimitRetryDelayMs: AI_RATE_LIMIT_RETRY_DELAY_MS
    },
    runtime: {
      active: AI_ACTIVE_REQUESTS,
      queued: AI_RUNTIME.currentQueued,
      maxActive: AI_RUNTIME.maxActive,
      maxQueued: AI_RUNTIME.maxQueued,
      totalRateLimitRetries: AI_RUNTIME.totalRateLimitRetries
    },
    story: summarizeAIPerfBucket(AI_PERF.story),
    choices: summarizeAIPerfBucket(AI_PERF.choices),
    initialChoices: summarizeAIPerfBucket(AI_PERF.initialChoices)
  };
}

function mapFactionLabel(raw = '') {
  const key = String(raw || '').trim();
  return FACTION_DISPLAY_MAP[key] || key || '信標聯盟';
}

function isInNewbiePhase(player) {
  return Number(player?.storyTurns || 0) <= DIGITAL_MASK_TURNS;
}

function getLocationArcMeta(player) {
  const state = (player?.locationArcState && typeof player.locationArcState === 'object')
    ? player.locationArcState
    : {};
  const currentLocation = String(player?.location || state.currentLocation || '');
  const exposureByLocation = state.systemExposureByLocation && typeof state.systemExposureByLocation === 'object'
    ? state.systemExposureByLocation
    : {};
  const exposure = exposureByLocation[currentLocation] && typeof exposureByLocation[currentLocation] === 'object'
    ? exposureByLocation[currentLocation]
    : {};
  const turns = Math.max(0, Number(state.turnsInLocation || 0));
  const completed = state.completedLocations && typeof state.completedLocations === 'object'
    ? Object.keys(state.completedLocations).length
    : 0;
  const nearCompletion = turns >= Math.max(1, LOCATION_ARC_COMPLETE_TURNS - 1);
  let phase = '起';
  if (turns >= Math.ceil(LOCATION_ARC_COMPLETE_TURNS * 0.75)) phase = '合';
  else if (turns >= Math.ceil(LOCATION_ARC_COMPLETE_TURNS * 0.5)) phase = '轉';
  else if (turns >= Math.ceil(LOCATION_ARC_COMPLETE_TURNS * 0.25)) phase = '承';
  return {
    turnsInLocation: turns,
    completedLocations: completed,
    nearCompletion,
    seenPortalChoice: Boolean(exposure.portalShown),
    seenWishPoolChoice: Boolean(exposure.wishPoolShown),
    seenMarketChoice: Boolean(exposure.marketShown),
    phase,
    targetTurns: LOCATION_ARC_COMPLETE_TURNS
  };
}

function getRoamingDigitalPresence(location = '', limit = 2) {
  try {
    if (!location || typeof CORE.getRoamingDigitalVillainsAtLocation !== 'function') return [];
    const list = CORE.getRoamingDigitalVillainsAtLocation(location, limit);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function formatRoamingDigitalPresence(location = '', limit = 2) {
  const list = getRoamingDigitalPresence(location, limit);
  if (!Array.isArray(list) || list.length <= 0) return '暫無明顯無名滲透者活動';
  return list
    .map((entry, idx) => `無名滲透者${idx + 1}(第${String(entry.group || 'NemoX')}組)`)
    .join('、');
}

function normalizeNpcAlignValue(raw = '') {
  const text = String(raw || '').trim().toLowerCase();
  if (text === 'evil' || text === 'bad' || text === 'villain') return 'evil';
  if (text === 'good' || text === 'hero') return 'good';
  if (text === 'neutral') return 'neutral';
  return '';
}

function isHostileNpcRecord(npc = null) {
  if (!npc || typeof npc !== 'object') return false;
  const align = normalizeNpcAlignValue(npc.align);
  if (align === 'evil') return true;
  const identity = [npc.name || '', npc.title || '', npc.sect || ''].join(' ');
  return /(digital|暗潮|黑市|滲透|叛徒|賊|匪|殺手|刺客|掠奪)/iu.test(identity);
}

function getWantedPressure(player = null) {
  if (!player || typeof player !== 'object') return 0;
  const localWanted = Math.max(0, Number(player?.wanted || 0));
  const alignment = computeAlignmentProfileFromPlayer(player, String(player?.location || '').trim());
  const wantedFloor = Math.max(0, Number(alignment?.wantedFloor || 0));
  const wantedBoost = Math.max(0, Number(alignment?.wantedBoost || 0));
  const playerId = String(player?.id || '').trim();
  let coreWanted = 0;
  if (playerId && CORE && typeof CORE.getPlayerWantedLevel === 'function') {
    coreWanted = Math.max(0, Number(CORE.getPlayerWantedLevel(playerId) || 0));
  }
  return Math.max(localWanted, coreWanted, wantedFloor + wantedBoost);
}

function getBattleCadenceInfo(player = null) {
  const turns = Math.max(0, Number(player?.storyTurns || 0));
  const span = BATTLE_CADENCE_TURNS;
  const step = (turns % span) + 1;
  return {
    turns,
    span,
    step,
    nearConflict: step >= Math.max(2, span - 1),
    dueConflict: step === span
  };
}

function getNearbyHostileNpcSummary(location = '', limit = 3) {
  const loc = String(location || '').trim();
  if (!loc || !CORE || typeof CORE.getNearbyNpcIds !== 'function') {
    return { names: [], count: 0 };
  }
  const ids = CORE.getNearbyNpcIds(loc, 8);
  if (!Array.isArray(ids) || ids.length <= 0) return { names: [], count: 0 };
  const seen = new Set();
  const names = [];
  for (const npcId of ids) {
    const info = typeof CORE.getAgentFullInfo === 'function'
      ? CORE.getAgentFullInfo(npcId)
      : null;
    if (!info) continue;
    if (String(info.loc || '').trim() !== loc) continue;
    if (!isHostileNpcRecord(info)) continue;
    const name = String(info.name || npcId || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= Math.max(1, Number(limit || 3))) break;
  }
  return { names, count: names.length };
}

function buildIslandKnowledgeBoundaryPrompt(location = '', stage = 0, stageCount = 8, completed = false) {
  if (!ISLAND_STORY || typeof ISLAND_STORY.getStoryRoadmap !== 'function') return '';
  const loc = String(location || '').trim();
  if (!loc) return '';
  const safeStageCount = Math.max(1, Number(stageCount || 8));
  const roadmap = ISLAND_STORY.getStoryRoadmap(loc, safeStageCount);
  if (!Array.isArray(roadmap) || roadmap.length <= 0) return '';
  if (completed) {
    return [
      '【島嶼知識邊界】',
      '本島主線已完成：可自由探索，不需再受「僅揭露到某段」限制。',
      '但若提及其他島關鍵真相，仍需透過當下行動或新證據逐步揭露。'
    ].join('\n');
  }

  const visibleStage = Math.max(1, Math.min(safeStageCount, Number(stage || 1)));
  const revealed = roadmap.slice(0, visibleStage).map((goal, idx) => `${idx + 1}. ${goal}`);
  const nextHint = String(roadmap[visibleStage] || '').trim();
  const hiddenCount = Math.max(0, roadmap.length - visibleStage);
  return [
    '【島嶼知識邊界（硬規則）】',
    `目前只可把「第 1~${visibleStage} 段」內容當成已知事實；第 ${visibleStage + 1} 段以後禁止提前當成既定真相。`,
    '已揭露段落：',
    ...revealed,
    nextHint
      ? `可預告方向（不可下結論）：下一段將朝「${nextHint}」推進`
      : '可預告方向：本島段落已接近收束',
    `尚未揭露段落數：${hiddenCount}`
  ].join('\n');
}

function sanitizeNarrativeText(text = '') {
  let output = String(text || '');
  for (const [pattern, replacement] of NARRATIVE_TERM_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

function sanitizeStoryTurnMarker(text = '') {
  const source = String(text || '');
  if (!source) return '';
  // 不對玩家顯示系統標記行（回合標記 / 掉寶標記）。
  return source
    .replace(/^\s*🧾\s*回合標記[:：].*$/gmu, '')
    .replace(/^\s*🧰\s*掉寶標記[:：].*$/gmu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripNarrativeDraftLeak(text = '') {
  let out = String(text || '');
  if (!out) return '';

  const draftMarker = /(等等[，,]?讓我|讓我重新|我來重新|好的[，,]?讓我重新|我需要讓玩家|玩家還在|前一段的最後是|我之前的開頭有誤|重新寫過|讓我看一下|根據前文)/u;
  const directIdx = out.search(draftMarker);
  if (directIdx >= 0 && directIdx > 120) {
    out = out.slice(0, directIdx).trim();
  }

  const splitIdx = out.search(/\n-{3,}\n/u);
  if (splitIdx >= 0) {
    const tail = out.slice(splitIdx + 1);
    if (draftMarker.test(tail)) {
      out = out.slice(0, splitIdx).trim();
    }
  }

  // 清理提示詞控制段落或內部規則名稱外漏到玩家故事正文。
  const leakedControlTokens = [
    '【主線鋪陳保留',
    '【島嶼知識邊界',
    '【關鍵任務選項規則',
    '【關鍵任務敘事規則',
    '【關鍵NPC移動導引',
    '【導航約束',
    '【跨島真相邊界',
    '【前一段故事',
    '【玩家之前的足跡',
    '【可驗證 NPC 對話原句',
    '【主線橋接鎖定',
    '【開局敘事硬規則',
    '【完整故事全文（必讀）',
    '【已出現元素清單',
    '【上一個行動結果',
    '【本回移動摘要'
  ];
  out = out
    .split('\n')
    .filter((line) => !leakedControlTokens.some((token) => line.includes(token)))
    .join('\n');

  // 清理行內「根據【規則】...」之類敘事污染。
  out = out
    .replace(/根據【[^】]{2,40}】[^。！？\n]{0,120}[。！？]?/gu, '')
    .replace(/按照【[^】]{2,40}】[^。！？\n]{0,120}[。！？]?/gu, '')
    .replace(/依據【[^】]{2,40}】[^。！？\n]{0,120}[。！？]?/gu, '')
    .replace(/按規則[^。！？\n]{0,120}[。！？]?/gu, '')
    .replace(/依規則[^。！？\n]{0,120}[。！？]?/gu, '')
    .replace(/地區進度\s*\d+\s*\/\s*\d+/gu, '')
    .replace(/stage\s*\d+\s*\/\s*\d+/giu);

  return out
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function sanitizeAIContent(content) {
  let source = '';
  if (typeof content === 'string') {
    source = content;
  } else if (Array.isArray(content)) {
    source = content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return item.text || item.content || '';
        }
        return '';
      })
      .join('\n');
  } else if (content && typeof content === 'object') {
    source = content.text || content.content || '';
  }

  if (!source || typeof source !== 'string') return '';
  let cleaned = source.trim();
  // 移除 <think>...</think> 思考標籤（多行）
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/\uFFFD/g, '');
  return cleaned.trim();
}

function normalizeOutputByLanguage(text, playerLang = 'zh-TW') {
  const source = typeof text === 'string' ? text : String(text || '');
  if (!source) return '';
  const sanitized = sanitizeNarrativeText(source);
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  if (langCode === 'zh-TW') return convertCNToTW(sanitized);
  if (langCode === 'zh-CN') return convertTWToCN(sanitized);
  return sanitized;
}

function countRegexMatches(text = '', regex = null) {
  const source = String(text || '');
  if (!source || !(regex instanceof RegExp)) return 0;
  const match = source.match(regex);
  return Array.isArray(match) ? match.length : 0;
}

function getLanguageComplianceIssue(text = '', playerLang = 'zh-TW', mode = 'story') {
  const source = String(text || '');
  if (!source) return '';
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  if (langCode !== 'ko') return '';
  const hangulCount = countRegexMatches(source, /[가-힣]/g);
  const minHangul = mode === 'story' ? 80 : 8;
  if (hangulCount >= minHangul) return '';
  return `語言違規：目前語言是韓文（ko），但輸出韓文字元不足（${hangulCount}/${minHangul}）`;
}

function normalizeChoiceByLanguage(choice, playerLang = 'zh-TW') {
  if (!choice || typeof choice !== 'object') return choice;
  return {
    ...choice,
    name: normalizeOutputByLanguage(choice.name || '', playerLang),
    choice: normalizeOutputByLanguage(choice.choice || '', playerLang),
    desc: normalizeOutputByLanguage(choice.desc || '', playerLang),
    tag: localizeChoiceTag(choice.tag || '', playerLang)
  };
}

function normalizeDynamicEventMeta(raw = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const archetype = String(raw.archetype || raw.type || '').trim().slice(0, 32);
  if (!archetype) return null;
  return {
    archetype,
    phase: String(raw.phase || '').trim().slice(0, 20) || 'offered',
    intensity: Math.max(1, Math.min(5, Math.round(Number(raw.intensity || 2) || 2))),
    chainHint: String(raw.chainHint || '').trim().slice(0, 60)
  };
}

function buildChoiceRoutePreview(path = [], maxStops = 4) {
  const list = Array.isArray(path) ? path.filter(Boolean) : [];
  if (list.length <= maxStops) return list.join(' → ');
  return `${list.slice(0, maxStops).join(' → ')} → …`;
}

function normalizeChoiceRouteForMap(choice = {}, player = null, location = '') {
  if (!choice || typeof choice !== 'object') return choice;
  const currentLocation = String(location || '').trim();
  const moveTo = normalizeMoveToLocation(choice?.move_to || choice?.moveTo || '');
  if (!currentLocation || !moveTo || moveTo === currentLocation) return choice;

  const routePath = typeof findLocationPath === 'function'
    ? findLocationPath(currentLocation, moveTo)
    : [];
  if (!Array.isArray(routePath) || routePath.length < 2) return choice;

  const nextHop = String(routePath[1] || '').trim();
  const finalTarget = String(routePath[routePath.length - 1] || moveTo).trim();
  if (!nextHop) return choice;

  const next = { ...choice, move_to: nextHop };
  if (Object.prototype.hasOwnProperty.call(next, 'moveTo')) delete next.moveTo;
  if (nextHop === finalTarget) return next;

  const routePreview = buildChoiceRoutePreview(routePath);
  const playerLang = String(player?.language || 'zh-TW').trim();
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  const replaceTarget = (text = '') => String(text || '').replace(new RegExp(escapeRegex(finalTarget), 'u'), nextHop);
  const tweakLead = (text = '') => String(text || '')
    .replace(/^前往/u, '先往')
    .replace(/^趕往/u, '先趕往')
    .replace(/^赶往/u, '先赶往')
    .replace(/^Go to /u, 'Head to ')
    .replace(/^Move to /u, 'Move to ');

  if (langCode === 'en') {
    const originalName = String(choice.name || '').trim();
    const originalChoice = String(choice.choice || '').trim();
    const originalDesc = String(choice.desc || '').trim();
    next.name = originalName ? tweakLead(replaceTarget(originalName)) : `Head to ${nextHop} first`;
    let choiceText = originalChoice ? tweakLead(replaceTarget(originalChoice)) : `Head to ${nextHop} first`;
    if (!choiceText.includes(finalTarget)) choiceText = `${choiceText.replace(/[.]\s*$/u, '')}, following the mapped route toward ${finalTarget}`;
    next.choice = choiceText;
    let descText = originalDesc ? replaceTarget(originalDesc) : `Secure ${nextHop} first, then continue toward ${finalTarget}`;
    if (!descText.includes(finalTarget)) descText = `${descText.replace(/[.]\s*$/u, '')} | Final target: ${finalTarget}`;
    if (routePreview) descText = `${descText} | Route: ${routePreview}`;
    next.desc = descText;
    return next;
  }
  if (langCode === 'ko') {
    const originalName = String(choice.name || '').trim();
    const originalChoice = String(choice.choice || '').trim();
    const originalDesc = String(choice.desc || '').trim();
    next.name = originalName ? tweakLead(replaceTarget(originalName)) : `${nextHop} 선행 이동`;
    let choiceText = originalChoice ? tweakLead(replaceTarget(originalChoice)) : `${nextHop}로 먼저 이동한다`;
    if (!choiceText.includes(finalTarget)) {
      choiceText = `${choiceText.replace(/[.。；;]\s*$/u, '')}, ${finalTarget} 방향 경로를 이어간다`;
    }
    next.choice = choiceText;
    let descText = originalDesc ? replaceTarget(originalDesc) : `${nextHop}에서 먼저 진입 거점을 확보한 뒤 ${finalTarget}로 밀어붙인다`;
    if (!descText.includes(finalTarget)) descText = `${descText.replace(/[.。；;]\s*$/u, '')} | 최종 목표: ${finalTarget}`;
    if (routePreview) descText = `${descText} | 경로: ${routePreview}`;
    next.desc = descText;
    return next;
  }

  const originalName = String(choice.name || '').trim();
  const originalChoice = String(choice.choice || '').trim();
  const originalDesc = String(choice.desc || '').trim();
  next.name = originalName ? tweakLead(replaceTarget(originalName)) : `先往${nextHop}`;
  let choiceText = originalChoice ? tweakLead(replaceTarget(originalChoice)) : `先前往${nextHop}`;
  if (!choiceText.includes(finalTarget)) choiceText = `${choiceText.replace(/[。；]\s*$/u, '')}，沿地圖路線朝${finalTarget}推進`;
  next.choice = choiceText;
  let descText = originalDesc ? replaceTarget(originalDesc) : `先到${nextHop}卡位，再往${finalTarget}推進`;
  if (!descText.includes(finalTarget)) descText = `${descText.replace(/[。；]\s*$/u, '')}｜最終目標：${finalTarget}`;
  if (routePreview) descText = `${descText}｜路線：${routePreview}`;
  next.desc = descText;
  return next;
}

function normalizeChoiceSemanticMeta(choice = {}, player = null, location = '') {
  if (!choice || typeof choice !== 'object') return choice;
  const routeNormalized = normalizeChoiceRouteForMap(choice, player, location);
  const dynamicContext = DYNAMIC_WORLD.buildDynamicWorldContext(player, location, {
    playerLang: String(player?.language || 'zh-TW').trim()
  });
  const styleTag = DYNAMIC_WORLD.inferStyleTag(routeNormalized, routeNormalized?.hiddenMeta);
  const hiddenMeta = DYNAMIC_WORLD.normalizeChoiceHiddenMeta(routeNormalized?.hiddenMeta, routeNormalized, {
    locationWanted: Number(dynamicContext?.wanted || 0)
  });
  const dynamicEvent = normalizeDynamicEventMeta(routeNormalized?.dynamicEvent || routeNormalized?.eventMeta);
  const out = { ...routeNormalized, styleTag, hiddenMeta };
  if (dynamicEvent) out.dynamicEvent = dynamicEvent;
  return out;
}

function sanitizeMainlineBridgeChoiceTone(choice = {}, {
  playerLang = 'zh-TW',
  location = '',
  progressText = ''
} = {}) {
  if (!choice || typeof choice !== 'object') return choice;
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  const safeLocation = String(location || '當前區域').trim() || '當前區域';
  const safeProgress = String(progressText || '').trim() || '地區進度 1/8';
  const next = { ...choice };
  const clean = (text = '') => {
    let out = String(text || '').trim();
    if (!out) return out;
    out = out
      .replace(/主傳送門測試/gu, '主傳送門')
      .replace(/測試([^，。；、\n]{0,24})是否可用/gu, '確認$1是否穩定')
      .replace(/方向是否可用/gu, '航線是否穩定')
      .replace(/直接通過/gu, '先到')
      .replace(/追查供應線/gu, '接續線索核查')
      .replace(/測試/gu, '確認');
    if (/是否可用/u.test(out)) {
      out = out.replace(/是否可用/gu, '是否穩定');
    }
    return out;
  };
  next.name = clean(next.name);
  next.choice = clean(next.choice);
  next.desc = clean(next.desc);

  // 若仍呈現系統測試語氣，改成自然敘事版主線動作。
  const merged = [next.name || '', next.choice || '', next.desc || ''].join(' ');
  if (/測試|是否可用|可不可用/u.test(merged)) {
    if (langCode === 'en') {
      next.name = 'Trace transfer route';
      next.choice = `Go to the main gate near ${safeLocation} and confirm route records before moving on`;
      next.desc = `${safeProgress} | Keep continuity by linking current clues to the next area`;
    } else if (langCode === 'ko') {
      next.name = '이동 경로 추적';
      next.choice = `${safeLocation} 인근 주 관문에서 이동 기록을 대조한 뒤 다음 경로를 결정한다`;
      next.desc = `${safeProgress} | 현장 단서를 이어 다음 구역 연결을 준비한다`;
    } else {
      next.name = '追查跨區路線';
      next.choice = `先到${safeLocation}主傳送門核對跨區航線紀錄，再決定下一步`;
      next.desc = `${safeProgress}｜承接現場線索，先做跨區前的資訊核對`;
    }
  }
  if (/主傳送門.*前往.*接續線索核查/u.test(merged) || /主傳送門.*前往.*追查/u.test(merged)) {
    if (langCode === 'en') {
      next.name = 'Verify local witness timing';
      next.choice = `Re-check witness timeline near ${safeLocation} before deciding cross-zone movement`;
      next.desc = `${safeProgress} | Keep continuity by closing local evidence first`;
    } else if (langCode === 'ko') {
      next.name = '현장 목격 시점 재확인';
      next.choice = `${safeLocation}에서 목격 시간대와 접촉 출처를 다시 맞춘 뒤 이동 여부를 정한다`;
      next.desc = `${safeProgress} | 지역 증거 사슬을 먼저 닫아 흐름 단절을 막는다`;
    } else {
      next.name = '核對現場目擊時序';
      next.choice = `先在${safeLocation}回頭核對目擊時序與服務來源，再決定是否跨區`;
      next.desc = `${safeProgress}｜先補齊本地證據鏈，避免跨區後線索斷裂`;
    }
  }
  return next;
}

function previewAIContent(content) {
  try {
    if (typeof content === 'string') return content.slice(0, 120);
    return JSON.stringify(content).slice(0, 120);
  } catch {
    return String(content).slice(0, 120);
  }
}

function extractJsonPayload(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const objectStart = raw.indexOf('{');
  const objectEnd = raw.lastIndexOf('}');
  const arrayStart = raw.indexOf('[');
  const arrayEnd = raw.lastIndexOf(']');
  const objectCandidate = objectStart >= 0 && objectEnd > objectStart
    ? raw.slice(objectStart, objectEnd + 1).trim()
    : '';
  const arrayCandidate = arrayStart >= 0 && arrayEnd > arrayStart
    ? raw.slice(arrayStart, arrayEnd + 1).trim()
    : '';
  if (arrayCandidate && (!objectCandidate || arrayStart < objectStart)) return arrayCandidate;
  if (objectCandidate) return objectCandidate;
  return raw;
}

function parseJsonOrThrow(text = '', expect = 'object') {
  const payload = extractJsonPayload(text);
  let parsed = null;
  try {
    parsed = JSON.parse(payload);
  } catch (e) {
    throw new Error(`JSON parse failed: ${e?.message || e}`);
  }
  if (expect === 'array' && !Array.isArray(parsed)) {
    throw new Error('Expected JSON array');
  }
  if (expect === 'object' && (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')) {
    throw new Error('Expected JSON object');
  }
  return parsed;
}

async function generatePlayerMemoryRecap(player = {}, payload = {}) {
  const playerLang = String(player?.language || 'zh-TW').trim();
  const langInstruction = getAiLanguageDirective(playerLang, 'output');

  const name = String(player?.name || '冒險者').trim() || '冒險者';
  const location = String(player?.location || '').trim();
  const storyTurns = Math.max(0, Number(player?.storyTurns || 0));
  const currentStory = summarizeContext(String(payload?.currentStory || player?.currentStory || ''), 780, 10);
  const memoryContext = summarizeContext(String(payload?.memoryContext || ''), 1400, 20);
  const recentStories = Array.isArray(payload?.recentStories)
    ? payload.recentStories
      .map((item, idx) => `${idx + 1}. ${summarizeContext(String(item || ''), 220, 3)}`)
      .filter(Boolean)
      .join('\n')
    : '';
  const recentActions = Array.isArray(payload?.recentActions)
    ? payload.recentActions
      .map((item, idx) => `${idx + 1}. ${summarizeContext(String(item || ''), 180, 2)}`)
      .filter(Boolean)
      .join('\n')
    : '';

  const prompt = [
    '你是 RPG 世界的記憶檔案官。',
    '任務：把玩家過往經歷濃縮成「可讀、像故事、可快速回想」的角色回顧。',
    `語言要求：${langInstruction}`,
    `玩家：${name}`,
    `目前位置：${location || '未知'}`,
    `已進行回合：${storyTurns}`,
    '',
    '輸出要求：',
    '1. 以敘事摘要輸出（不是條列流水帳）。',
    '2. 長度約 220~420 字（英文可 140~260 words）。',
    '3. 必須包含：',
    '   - 目前主線/衝突進度',
    '   - 最近最重要的 2~4 個事件',
    '   - 與 NPC 關係或關鍵線索狀態',
    '   - 接下來最合理的一步（1 句）',
    '4. 禁止模板語氣、禁止系統術語（例如 topK/embedding/namespace）。',
    '5. 不要杜撰未提供的具體人名、證據、地點。',
    '',
    '【目前故事】',
    currentStory || '（無）',
    '',
    '【記憶上下文】',
    memoryContext || '（無）',
    '',
    '【最近故事片段】',
    recentStories || '（無）',
    '',
    '【最近行動重點】',
    recentActions || '（無）'
  ].join('\n');

  try {
    const raw = await callAI(prompt, 0.35, {
      label: 'generatePlayerMemoryRecap',
      model: MINIMAX_MODEL,
      maxTokens: 680,
      timeoutMs: 30000,
      retries: 1,
      unlimitedTimeout: false,
      unlimitedMaxTokens: false
    });
    const normalized = normalizeOutputByLanguage(raw, playerLang);
    const cleaned = sanitizeAIContent(normalized);
    if (cleaned) return cleaned;
  } catch (e) {
    console.log('[MemoryRecap] AI fallback:', e?.message || e);
  }

  // AI 失敗時的保底（非模板文案，只是避免空白）
  const fallbackChunks = [];
  if (currentStory) fallbackChunks.push(`你目前的冒險主軸仍圍繞在：${currentStory.slice(0, 160)}。`);
  if (recentActions) fallbackChunks.push(`最近你連續採取了幾個關鍵行動，行動軌跡顯示你正在把線索往同一方向收束。`);
  if (memoryContext) fallbackChunks.push(`從既有記憶來看，重要事件與人物互動都已留下足夠痕跡，可作為後續劇情延續依據。`);
  fallbackChunks.push('下一步建議：先沿當前地點最接近的關鍵線索繼續推進，避免同場景重複繞圈。');
  return fallbackChunks.join('\n');
}

async function generateSystemChoiceWithAI({ action, playerLang = 'zh-TW', location = '', destinations = [] }) {
  const langInstruction = getAiLanguageDirective(playerLang, 'plain');
  const portalPreview = Array.isArray(destinations) && destinations.length > 0
    ? destinations.slice(0, 3).join('、')
    : '未知地點';
  const actionSpec = {
    portal_intent:
      `用途：玩家在 ${location || '目前位置'} 附近偵測到傳送門。\n` +
      `限制：必須明確提到「開啟地圖後選擇傳送目的地」。\n` +
      `可達地點：${portalPreview}\n` +
      '固定標籤：tag 必須是 [🌀可傳送]',
    wish_pool:
      '用途：玩家主動前往許願池並準備許願。\n' +
      '限制：描述要有儀式感，不要出現「模板」或「系統」字眼。\n' +
      '固定標籤：tag 必須是 [🪙奇遇]',
    mentor_spar:
      `用途：玩家在 ${location || '目前位置'} 遇到正派名師，主動提出友誼賽求指導。\n` +
      '限制：要清楚描述這是「友誼賽」，不是生死戰；語氣尊重且有學習目的。\n' +
      `固定標籤：tag 必須是 ${getChoiceTag('friendly_spar', playerLang)}`,
    storage_heist:
      `用途：故事中有人攜帶封存艙，玩家起心動念要直接搶奪。\n` +
      `限制：必須明確是針對「對方手上的封存艙」採取行動；語句要貼合 ${location || '當前場景'}。\n` +
      '限制：封存艙是便攜小型艙體（約小背包大小），禁止寫成巨大艙體。\n' +
      '限制：choice 必須同時包含「搶奪封存艙」+「現場打開/撬開檢視」+「把內容佔為己有/私吞」。\n' +
      '限制：不得使用模板句型（例如固定開頭「盯準對方手上的封存艙...」）。\n' +
      '限制：這是高風險衝突，choice 句尾必須附上「（會進入戰鬥）」。\n' +
      `固定標籤：tag 必須是 ${getChoiceTag('combat', playerLang)}`
  }[action];

  if (!actionSpec) throw new Error(`Unsupported system choice action: ${action}`);

  const prompt = `你在設計 Renaiss 遊戲中的互動選項，請回傳 JSON 物件，不要任何額外文字。
風格限制：原創科幻生態敘事，禁止武俠語氣與既有 IP 名詞。

語言：${playerLang}（${langInstruction}）
行動代碼：${action}
${actionSpec}

輸出格式：
{"name":"12字內短標題","choice":"20-36字具體動作","desc":"20-42字補充敘述","tag":"[標籤]"}

規則：
1. 不能使用通用空話，不要「隨便逛逛」「先看看」。
2. 內容要有畫面感，且和 Renaiss 世界觀一致。
3. 禁止出現武俠詞彙：江湖、俠客、門派、武功、內力、修煉、打坐。
4. 直接輸出 JSON。`;

  const response = await callAI(prompt, 0.9, {
    label: `systemChoice.${action}`,
    model: MINIMAX_MODEL,
    maxTokens: 260,
    timeoutMs: SYSTEM_CHOICE_TIMEOUT_MS,
    retries: 1,
    unlimitedTimeout: false,
    unlimitedMaxTokens: true
  });
  const parsed = parseJsonOrThrow(response, 'object');
  if (!parsed.name || !parsed.choice || !parsed.desc || !parsed.tag) {
    throw new Error(`Incomplete system choice for ${action}`);
  }
  return normalizeChoiceByLanguage({
    name: String(parsed.name).trim(),
    choice: String(parsed.choice).trim(),
    desc: String(parsed.desc).trim(),
    tag: String(parsed.tag).trim(),
    action
  }, playerLang);
}

async function generateMarketChoicesWithAI(playerLang = 'zh-TW', location = '', newbieMask = false) {
  const langInstruction = getAiLanguageDirective(playerLang, 'plain');
  const digitalTag = newbieMask ? getChoiceTag('friendly_appraisal', playerLang) : getChoiceTag('mystery_appraisal', playerLang);
  const digitalTask = newbieMask
    ? '第二個選項要對應 market_digital（外在要友善、強調新手照顧與檢測協助，不可直接露出惡意）'
    : '第二個選項要對應 market_digital（話術壓價、對玩家不利但說得漂亮）';
  const digitalRule = newbieMask
    ? 'Digital 選項要像熱心店員，語氣友善；只能放微弱違和感，不能明說詐騙。'
    : 'Digital 版本要讓玩家感到被話術帶走，呈現看似有利但實際不划算。';

  const prompt = `你要生成 Renaiss 遊戲的市場選項，請回傳 JSON 陣列，不要任何額外文字。
風格限制：原創科幻生態敘事，禁止武俠語氣與既有 IP 名詞。

語言：${playerLang}（${langInstruction}）
地點：${location || '未知地點'}

任務：
1. 第一個選項要對應 market_renaiss（公道鑑價、偏公平）
2. ${digitalTask}

輸出格式（固定兩筆）：
[
  {"action":"market_renaiss","name":"...","choice":"...","desc":"...","tag":"${getChoiceTag('appraisal', playerLang)}"},
  {"action":"market_digital","name":"...","choice":"...","desc":"...","tag":"${digitalTag}"}
]

規則：
1. 內容要具體，不要套句。
2. 兩筆語氣必須明顯不同。
3. ${digitalRule}
4. 禁止出現武俠詞彙：江湖、俠客、門派、武功、內力、修煉、打坐。
5. 文案禁止直接寫勢力名稱（例如 Renaiss、Digital），只能用「鑑價站／神秘鑑價站」表述。
6. 直接輸出 JSON。`;

  const response = await callAI(prompt, 0.92, {
    label: 'systemChoice.market',
    model: MINIMAX_MODEL,
    maxTokens: 420,
    timeoutMs: SYSTEM_CHOICE_TIMEOUT_MS,
    retries: 1,
    unlimitedTimeout: false,
    unlimitedMaxTokens: true
  });
  const parsed = parseJsonOrThrow(response, 'array');
  const actionOrder = ['market_renaiss', 'market_digital'];
  const mapped = [];
  for (const action of actionOrder) {
    const item = parsed.find(entry => entry && entry.action === action);
    if (!item || !item.name || !item.choice || !item.desc || !item.tag) {
      throw new Error(`Incomplete market choice for ${action}`);
    }
    const normalized = normalizeChoiceByLanguage({
      action,
      name: String(item.name).trim(),
      choice: String(item.choice).trim(),
      desc: String(item.desc).trim(),
      tag: String(item.tag).trim()
    }, playerLang);
    mapped.push(sanitizeMarketChoiceText(normalized, playerLang));
  }
  return mapped;
}

function sanitizeMarketChoiceText(choice = {}, playerLang = 'zh-TW') {
  if (!choice || typeof choice !== 'object') return choice;
  const action = String(choice.action || '').trim();
  if (action !== 'market_renaiss' && action !== 'market_digital') return choice;

  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  const isEn = langCode === 'en';
  const isCn = langCode === 'zh-CN';
  const isKo = langCode === 'ko';
  const stationLabel = isEn
    ? (action === 'market_digital' ? 'mysterious appraisal station' : 'appraisal station')
    : (isKo
      ? (action === 'market_digital' ? '수상한 감정소' : '감정소')
      : (isCn
        ? (action === 'market_digital' ? '神秘鉴价站' : '鉴价站')
        : (action === 'market_digital' ? '神秘鑑價站' : '鑑價站')));

  const replaceBrand = (value = '') => String(value || '')
    .replace(/\bRenaiss\b/giu, stationLabel)
    .replace(/\bDigital\b/giu, stationLabel)
    .replace(/Renaiss\s*(商城|鑑價站|鉴价站)/gu, stationLabel)
    .replace(/Digital\s*(商城|鑑價站|鉴价站)/gu, stationLabel);

  const next = { ...choice };
  next.name = replaceBrand(next.name);
  next.choice = replaceBrand(next.choice);
  next.desc = replaceBrand(next.desc);

  if (action === 'market_renaiss' && /神秘/u.test(String(next.name || ''))) {
    next.name = isEn ? 'Visit nearby appraisal station'
      : (isKo ? '근처 감정소로 이동' : (isCn ? '前往附近鉴价站' : '前往附近鑑價站'));
  }
  if (action === 'market_digital' && !/神秘|mysterious|수상한/iu.test(String(next.name || ''))) {
    next.name = isEn ? 'Visit mysterious appraisal station'
      : (isKo ? '수상한 감정소로 이동' : (isCn ? '前往神秘鉴价站' : '前往神秘鑑價站'));
  }
  return next;
}

function buildLocationFeatureText(location = '') {
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

function containsAnyKeyword(text = '', keywords = []) {
  const source = String(text || '');
  return keywords.some((keyword) => source.includes(keyword));
}

function getNearbySystemAvailability(location = '') {
  const featureText = buildLocationFeatureText(location);
  const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const portalNodeDegree = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(location).length
    : 0;
  const nearPortal = portalNodeDegree >= 2;
  const nearWishPool = containsAnyKeyword(featureText, [
    '祭壇', '古祭', '靈泉', '神殿', '祈願', '祈福', '仙島', '巫', '石碑', '湖', '泉', '神龕', '祈', '塔', '雲橋'
  ]) || Number(profile?.difficulty || 3) <= 2;
  const nearMarket = containsAnyKeyword(featureText, [
    '市集', '巴扎', '交易', '拍賣', '商隊', '商都', '商港', '碼頭', '港', '驛站', '公會', '商店'
  ]) || Number(profile?.difficulty || 3) <= 3;
  const nearMentor = containsAnyKeyword(featureText, [
    '工坊', '研究', '學院', '訓練', '巡察', '指揮', '守備', '哨站', '茶師'
  ]) || Number(profile?.difficulty || 3) <= 3;
  return { nearPortal, nearWishPool, nearMarket, nearMentor };
}

async function injectPortalChoice(choices, location, playerLang = 'zh-TW', options = {}) {
  const base = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  const destinations = typeof getPortalDestinations === 'function' ? getPortalDestinations(location) : [];
  if (!destinations || destinations.length === 0) return base.slice(0, CHOICE_OUTPUT_COUNT);
  const forcePortal = Boolean(options?.forcePortal);
  const storyPortalCue = Boolean(options?.storySignals?.portal);
  const { nearPortal } = getNearbySystemAvailability(location);
  if (!forcePortal && !nearPortal && !storyPortalCue) return base.slice(0, CHOICE_OUTPUT_COUNT);

  const withoutPortal = base.filter(c => c.action !== 'teleport' && c.action !== 'portal_intent');
  const portalChoice = await generateSystemChoiceWithAI({
    action: 'portal_intent',
    playerLang,
    location,
    destinations
  });

  if (withoutPortal.length >= 7) {
    withoutPortal[6] = portalChoice;
  } else {
    withoutPortal.push(portalChoice);
  }

  return withoutPortal.slice(0, CHOICE_OUTPUT_COUNT);
}

async function injectWishPoolChoice(
  choices,
  playerLang = 'zh-TW',
  location = '',
  options = {}
) {
  const base = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  if (base.some(c => c.action === 'wish_pool')) return base.slice(0, CHOICE_OUTPUT_COUNT);
  const { nearWishPool } = getNearbySystemAvailability(location);
  const forceWishPool = Boolean(options?.forceWishPool);
  const storyWishCue = Boolean(options?.storySignals?.wishPool);
  if (!forceWishPool && !nearWishPool && !storyWishCue) return base.slice(0, CHOICE_OUTPUT_COUNT);

  const wishChoice = await generateSystemChoiceWithAI({
    action: 'wish_pool',
    playerLang
  });
  if (base.length >= 7) {
    base[6] = wishChoice;
  } else {
    base.push(wishChoice);
  }
  return base.slice(0, CHOICE_OUTPUT_COUNT);
}

async function injectMarketChoices(
  choices,
  playerLang = 'zh-TW',
  location = '',
  newbieMask = false,
  options = {}
) {
  const base = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  const forceMarket = Boolean(options?.forceMarket);
  const storyMarketCue = Boolean(options?.storySignals?.market);
  const { nearMarket } = getNearbySystemAvailability(location);
  if (!forceMarket && !nearMarket && !storyMarketCue) return base.slice(0, CHOICE_OUTPUT_COUNT);
  const removeActions = new Set(['market_renaiss', 'market_digital']);
  let work = base.filter(c => !removeActions.has(c.action));
  const marketChoices = await generateMarketChoicesWithAI(playerLang, location, newbieMask);
  const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const preferDigital = !newbieMask && Number(profile?.difficulty || 3) >= 4;
  let selectedMarketChoices = marketChoices;
  if (!forceMarket && !storyMarketCue) {
    const preferred = marketChoices.find((item) => String(item?.action || '') === (preferDigital ? 'market_digital' : 'market_renaiss'))
      || marketChoices[0];
    selectedMarketChoices = preferred ? [preferred] : [];
  }
  if (selectedMarketChoices.length === 0 && marketChoices.length > 0) {
    selectedMarketChoices = [marketChoices[0]];
  }
  const reservedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'mentor_spar']);

  for (const marketChoice of selectedMarketChoices) {
    if (work.some(c => c.action === marketChoice.action)) continue;
    if (work.length < 7) {
      work.push(marketChoice);
      continue;
    }
    let replaceIdx = -1;
    for (let i = work.length - 1; i >= 0; i--) {
      if (!reservedActions.has(work[i].action)) {
        replaceIdx = i;
        break;
      }
    }
    if (replaceIdx < 0) replaceIdx = work.length - 1;
    work[replaceIdx] = marketChoice;
  }

  return work.slice(0, CHOICE_OUTPUT_COUNT);
}

function isStorageHeistChoice(choice = {}) {
  if (!choice || typeof choice !== 'object') return false;
  if (String(choice.action || '').trim() === 'storage_heist') return true;
  const text = [choice.name || '', choice.choice || '', choice.desc || '', choice.tag || ''].join(' ');
  const hasVaultCue = /(封存[艙舱倉藏]|sealed cache pod|storage pod)/iu.test(text);
  const hasHeistCue = /(搶|搶奪|奪走|強奪|劫|掠奪|snatch|rob|seize|grab)/iu.test(text);
  return hasVaultCue && hasHeistCue;
}

async function injectStorageHeistChoice(choices, playerLang = 'zh-TW', location = '', options = {}) {
  const base = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  if (base.some(isStorageHeistChoice)) return base.slice(0, CHOICE_OUTPUT_COUNT);

  const storySignals = options?.storySignals || {};
  const hasCarrierCue = Boolean(storySignals?.storageCarrier);
  const hasSuspiciousTradeCue = Boolean(storySignals?.suspiciousTrade);
  if (!hasCarrierCue && !hasSuspiciousTradeCue) return base.slice(0, CHOICE_OUTPUT_COUNT);
  const hasThreatCueSignal = Boolean(storySignals?.threat);
  if (!hasCarrierCue) {
    const chance = hasThreatCueSignal ? 0.9 : 0.78;
    if (Math.random() > chance) return base.slice(0, CHOICE_OUTPUT_COUNT);
  }

  let heistChoice = null;
  try {
    heistChoice = await generateSystemChoiceWithAI({
      action: 'storage_heist',
      playerLang,
      location
    });
  } catch {
    return base.slice(0, CHOICE_OUTPUT_COUNT);
  }
  if (!heistChoice || !heistChoice.name || !heistChoice.choice || !heistChoice.desc || !heistChoice.tag) {
    return base.slice(0, CHOICE_OUTPUT_COUNT);
  }

  const normalizedChoice = normalizeChoiceByLanguage({
    ...heistChoice,
    action: 'fight'
  }, playerLang);

  const reservedActions = new Set([
    'portal_intent',
    'wish_pool',
    'market_renaiss',
    'market_digital',
    'mentor_spar',
    'location_story_battle'
  ]);
  if (base.length < CHOICE_OUTPUT_COUNT) {
    base.push(normalizedChoice);
    return base.slice(0, CHOICE_OUTPUT_COUNT);
  }

  let replaceIdx = -1;
  for (let i = base.length - 1; i >= 0; i--) {
    if (!reservedActions.has(String(base[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  if (replaceIdx < 0) replaceIdx = base.length - 1;
  base[replaceIdx] = normalizedChoice;
  return base.slice(0, CHOICE_OUTPUT_COUNT);
}

async function injectMentorSparChoice(choices, playerLang = 'zh-TW', location = '', options = {}) {
  const base = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  if (base.some(c => c.action === 'mentor_spar')) return base.slice(0, CHOICE_OUTPUT_COUNT);
  const { nearMentor } = getNearbySystemAvailability(location);
  const storyMentorCue = Boolean(options?.storySignals?.mentor);
  if (!nearMentor && !storyMentorCue) return base.slice(0, CHOICE_OUTPUT_COUNT);

  let mentorChoice = null;
  try {
    mentorChoice = await generateSystemChoiceWithAI({
      action: 'mentor_spar',
      playerLang,
      location
    });
  } catch {
    mentorChoice = normalizeChoiceByLanguage({
      action: 'mentor_spar',
      name: '拜訪名師',
      choice: `向${location || '附近'}的正派名師提出友誼賽請求`,
      desc: '在切磋中證明實力，達到門檻可獲收徒指導',
      tag: getChoiceTag('friendly_spar', playerLang)
    }, playerLang);
  }

  const reservedActions = new Set([
    'portal_intent',
    'wish_pool',
    'market_renaiss',
    'market_digital',
    'mentor_spar'
  ]);
  if (base.length < 7) {
    base.push(mentorChoice);
    return base.slice(0, CHOICE_OUTPUT_COUNT);
  }

  let replaceIdx = -1;
  for (let i = base.length - 1; i >= 0; i--) {
    if (!reservedActions.has(String(base[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  if (replaceIdx < 0) replaceIdx = base.length - 1;
  base[replaceIdx] = mentorChoice;
  return base.slice(0, CHOICE_OUTPUT_COUNT);
}

function mapDynamicArchetypeToAction(archetype = '') {
  const key = String(archetype || '').trim();
  if (key === 'ambush' || key === 'bounty_hunt') return 'fight';
  if (key === 'storage_heist') return 'fight';
  if (key === 'witness_chase') return 'explore';
  if (key === 'smuggling') return 'social';
  if (key === 'artifact_dispute') return 'explore';
  if (key === 'secret_realm') return 'explore';
  return 'explore';
}

function requestAIOnce(body, timeoutMs = AI_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.minimax.io',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log('[AI] HTTP 錯誤:', res.statusCode, data.substring(0, 300));
          reject(buildAIError(`HTTP ${res.statusCode}`, {
            statusCode: Number(res.statusCode || 0),
            responseText: data.substring(0, 300),
            isRateLimit: Number(res.statusCode || 0) === 429 || /rate limit|too many requests|quota/i.test(String(data || ''))
          }));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(buildAIError(parsed.error.message || 'API Error', {
              statusCode: Number(parsed.error?.status || 0) || 0,
              responseText: data.substring(0, 300),
              isRateLimit: /rate limit|too many requests|quota|429/i.test(String(parsed.error.message || ''))
            }));
            return;
          }
          // MiniMax 會在成功時回傳 base_resp.status_msg = "success"
          // 不能單憑 status_msg 判斷失敗，需看 status_code 是否非 0
          if (parsed.base_resp) {
            const statusCode = Number(parsed.base_resp.status_code);
            const statusMsg = String(parsed.base_resp.status_msg || '');
            if (!Number.isNaN(statusCode) && statusCode !== 0) {
              reject(buildAIError(statusMsg || `status_code=${statusCode}`, {
                statusCode,
                responseText: data.substring(0, 300),
                isRateLimit: /rate limit|too many requests|quota|429/i.test(statusMsg)
              }));
              return;
            }
          }

          const choice = parsed.choices?.[0];
          const rawContent = choice?.message?.content || '';
          if (!rawContent) {
            reject(buildAIError('Empty AI content', {
              statusCode: Number(res.statusCode || 0),
              responseText: data.substring(0, 300)
            }));
            return;
          }

          resolve({
            content: rawContent,
            finishReason: choice?.finish_reason || ''
          });
        } catch (e) {
          console.log('[AI] Parse error, raw:', data.substring(0, 300));
          reject(e);
        }
      });
    });

    const numericTimeout = Number(timeoutMs);
    if (Number.isFinite(numericTimeout) && numericTimeout > 0) {
      req.setTimeout(numericTimeout, () => {
        req.destroy(new Error('AI timeout'));
      });
    }

    req.on('error', (e) => {
      console.log('[AI] Network error:', e.message);
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

async function requestAI(body, timeoutMs = AI_TIMEOUT_MS, options = {}) {
  const label = String(options.label || 'requestAI');
  const rateLimitRetries = Math.max(0, Math.min(5, Number(options.rateLimitRetries ?? AI_RATE_LIMIT_RETRIES)));
  const rateLimitRetryDelayMs = Math.max(200, Math.min(5000, Number(options.rateLimitRetryDelayMs ?? AI_RATE_LIMIT_RETRY_DELAY_MS)));

  for (let attempt = 0; attempt <= rateLimitRetries; attempt++) {
    try {
      return await withAIConcurrency(() => requestAIOnce(body, timeoutMs), label);
    } catch (error) {
      if (!isAIRateLimitError(error) || attempt >= rateLimitRetries) {
        throw error;
      }
      AI_RUNTIME.totalRateLimitRetries += 1;
      console.warn(
        `[AI][${label}] rate limited; retry ${attempt + 1}/${rateLimitRetries} in ${rateLimitRetryDelayMs}ms`
      );
      await sleep(rateLimitRetryDelayMs);
    }
  }

  throw new Error('AI request failed after rate limit retries');
}

function summarizeContext(rawText, maxChars = 240, maxLines = 3) {
  const text = String(rawText || '').trim();
  if (!text) return '';
  const lines = text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, maxLines);
  const merged = lines.join('\n');
  return merged.length > maxChars ? merged.slice(0, maxChars) + '...' : merged;
}

function normalizeComparableText(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[「」『』"'`“”‘’\s，。！？!?；;：:、（）()\[\]【】-]/g, '')
    .trim();
}

function sanitizeAnchorToken(token = '', maxLen = 18) {
  let text = String(token || '')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;

  const keywordMatch = text.match(/(封存艙|金屬壓印痕跡|星沙藤|齒輪徽章|天秤圖案|航海羅盤|修復臺|修復台|檢測儀|傳送門|許願池|願池|攤位|港務塔)/u);
  if (keywordMatch) return keywordMatch[1];

  return '';
}

function dedupeNpcDialogueEvidence(items = []) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const speaker = String(item.speaker || '').trim().slice(0, 24);
    const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!speaker || !text) continue;
    const location = String(item.location || '').trim().slice(0, 24);
    const at = Number.isFinite(Number(item.at)) ? Number(item.at) : Date.now();
    const key = `${speaker}|${normalizeComparableText(text)}|${location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      speaker,
      text,
      location,
      at,
      source: String(item.source || 'npc').trim().slice(0, 24)
    });
  }
  return out;
}

function getRecentNpcDialogueEvidence(player, limit = 10, options = {}) {
  const logs = Array.isArray(player?.npcDialogueLog) ? player.npcDialogueLog : [];
  let items = [];
  for (const item of logs) {
    if (!item || typeof item !== 'object') continue;
    const speaker = String(item.speaker || '').trim().slice(0, 24);
    const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!speaker || !text) continue;
    items.push({
      speaker,
      text,
      location: String(item.location || '').trim().slice(0, 24),
      at: Number(item.at || 0)
    });
  }
  if (player?.id && typeof CORE.getPlayerNpcQuoteEvidence === 'function') {
    const dedicated = CORE.getPlayerNpcQuoteEvidence(player.id, {
      limit: Math.max(Number(limit || 10) * 2, 12),
      location: String(options.location || player?.location || '').trim(),
      queryText: String(options.queryText || '').trim(),
      nearbyLimit: 2
    });
    if (Array.isArray(dedicated) && dedicated.length > 0) {
      items = items.concat(dedicated);
    }
  }
  const deduped = dedupeNpcDialogueEvidence(items)
    .sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
  return deduped.slice(-Math.max(1, Number(limit || 10)));
}

function buildNpcDialogueEvidenceText(evidence = [], playerLang = 'zh-TW') {
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  if (!Array.isArray(evidence) || evidence.length <= 0) {
    if (langCode === 'en') return '(No verified prior NPC lines.)';
    if (langCode === 'ko') return '(검증 가능한 기존 NPC 대사가 아직 없습니다)';
    if (langCode === 'zh-CN') return '（目前没有可验证的 NPC 旧对话原句）';
    return '（目前沒有可驗證的 NPC 舊對話原句）';
  }
  return evidence
    .slice(-10)
    .map((entry, idx) => {
      const loc = entry.location ? `＠${entry.location}` : '';
      return `${idx + 1}. ${entry.speaker}${loc}：「${entry.text}」`;
    })
    .join('\n');
}

function tokenizeStoryFocusText(text = '') {
  const source = String(text || '').toLowerCase();
  if (!source) return [];
  const zh = source.match(/[\u4e00-\u9fff]{1,2}/g) || [];
  const alpha = source.match(/[a-z0-9]{2,}/g) || [];
  return [...new Set([...zh, ...alpha].map((item) => item.trim()).filter(Boolean))].slice(0, 80);
}

function getActiveMainlineForeshadowPins(player, limit = 6, options = {}) {
  const list = Array.isArray(player?.mainlineForeshadowPins) ? player.mainlineForeshadowPins : [];
  if (list.length === 0) return [];
  const nowTurn = Math.max(0, Math.floor(Number(player?.storyTurns || 0)));
  const location = String(options.location || player?.location || '').trim();
  const queryTokens = tokenizeStoryFocusText(options.queryText || '');

  const ranked = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    if (!text) continue;
    const expiresTurn = Math.max(0, Math.floor(Number(item.expiresTurn || 0)));
    if (expiresTurn < nowTurn) continue;
    const lastSeenTurn = Math.max(0, Math.floor(Number(item.lastSeenTurn || 0)));
    const itemTokens = tokenizeStoryFocusText(text);
    const overlap = queryTokens.length > 0 && itemTokens.length > 0
      ? queryTokens.filter((token) => itemTokens.includes(token)).length
      : 0;
    const overlapScore = queryTokens.length > 0 ? Math.min(0.72, (overlap / queryTokens.length) * 1.05) : 0;
    const sameLocation = location && String(item.location || '').trim() === location ? 0.34 : 0;
    const recency = Math.exp(-Math.max(0, nowTurn - lastSeenTurn) / 8);
    const recencyScore = 0.3 * recency;
    const score = Number((overlapScore + sameLocation + recencyScore).toFixed(4));
    ranked.push({
      text,
      location: String(item.location || '').trim().slice(0, 24),
      score,
      lastSeenTurn,
      expiresTurn
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.expiresTurn !== a.expiresTurn) return b.expiresTurn - a.expiresTurn;
    return b.lastSeenTurn - a.lastSeenTurn;
  });

  const out = [];
  const seen = new Set();
  for (const item of ranked) {
    const key = normalizeComparableText(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= Math.max(1, Number(limit || 6))) break;
  }
  return out;
}

function buildMainlineForeshadowText(pins = [], playerLang = 'zh-TW') {
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  if (!Array.isArray(pins) || pins.length === 0) {
    if (langCode === 'en') return '(No preserved mainline foreshadowing in this phase.)';
    if (langCode === 'ko') return '(현재 단계에서 유지할 메인라인 복선이 없습니다)';
    if (langCode === 'zh-CN') return '（当前没有需保留的主线铺陈）';
    return '（目前沒有需要保留的主線鋪陳）';
  }
  return pins
    .slice(0, 8)
    .map((item, idx) => {
      const loc = item.location ? `＠${item.location}` : '';
      return `${idx + 1}. ${item.text}${loc}`;
    })
    .join('\n');
}

function extractCarryItemNames(player = {}) {
  const names = [];
  const pushName = (value) => {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (!name) return;
    names.push(name.slice(0, 32));
  };

  for (const item of Array.isArray(player?.inventory) ? player.inventory : []) {
    if (typeof item === 'string') pushName(item);
    else if (item && typeof item === 'object') pushName(item.name || item.itemName || item.id);
  }
  for (const herb of Array.isArray(player?.herbs) ? player.herbs : []) {
    pushName(herb);
  }
  for (const crafted of Array.isArray(player?.craftedItems) ? player.craftedItems : []) {
    if (typeof crafted === 'string') pushName(crafted);
    else if (crafted && typeof crafted === 'object') pushName(crafted.name || crafted.itemName || crafted.id);
  }
  for (const good of Array.isArray(player?.tradeGoods) ? player.tradeGoods : []) {
    if (typeof good === 'string') pushName(good);
    else if (good && typeof good === 'object') pushName(good.name || good.itemName || good.id);
  }

  const uniq = [];
  const seen = new Set();
  for (const item of names) {
    const key = normalizeComparableText(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniq.push(item);
  }
  return uniq;
}

function buildInventoryContextText(player = {}, playerLang = 'zh-TW') {
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  const items = extractCarryItemNames(player);
  if (items.length <= 0) {
    if (langCode === 'en') return '(Backpack is currently empty.)';
    if (langCode === 'ko') return '(가방이 비어 있습니다)';
    if (langCode === 'zh-CN') return '（背包当前为空）';
    return '（背包目前為空）';
  }
  return items.slice(0, 24).join('、');
}

function getAppraisalExampleLine(maxCount = 8) {
  const list = Array.isArray(WORLD_LORE?.WORLD_LORE?.appraisalExamples)
    ? WORLD_LORE.WORLD_LORE.appraisalExamples
    : [];
  if (list.length <= 0) return '古董機械錶、封存科技晶片、能量核心碎片';
  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(3, Number(maxCount || 8)))
    .join('、');
}

function buildStoryFocusForChoices(rawStory = '') {
  const story = String(rawStory || '').replace(/\s+/g, ' ').trim();
  if (!story) return { lead: '', tail: '', closing: '' };
  const lead = story.slice(0, 240);
  const tail = story.length > 420 ? story.slice(-420) : story;
  const sentences = story
    .split(/(?<=[。！？!?])/)
    .map(s => s.trim())
    .filter(Boolean);
  const closing = sentences.length > 0 ? sentences[sentences.length - 1] : tail.slice(-60);
  return { lead, tail, closing };
}

function isLikelyDirectedLocationToken(token = '') {
  const text = String(token || '').trim();
  if (!text || text.length < 2 || text.length > 16) return false;
  return /(城|市|鎮|站|港|島|都|關|關口|關隘|谷|原|渡口|山莊|山城)$/u.test(text);
}

function extractDirectedDestinationFromStoryTail(story = '', sourceChoice = '') {
  const source = [story, sourceChoice].filter(Boolean).join('\n');
  if (!source) return '';
  const tail = source.slice(-620);
  const seen = new Set();
  const hits = [];
  const push = (raw = '') => {
    const token = String(raw || '').replace(/[「」『』【】（）()]/g, '').trim();
    if (!isLikelyDirectedLocationToken(token)) return;
    if (seen.has(token)) return;
    seen.add(token);
    hits.push(token);
  };

  const patterns = [
    /(?:得去|要去|需要去|應該去|該去|盡快去|尽快去|前往|趕往|赶往|去)\s*([^\s，。、「」『』【】]{2,16}(?:城|市|鎮|站|港|島|都|關|谷|原|渡口|山莊|山城))/gu,
    /(?:下一站|下一步|下一個目的地|下一个目的地)\s*(?:是|到|往|：|:)?\s*([^\s，。、「」『』【】]{2,16}(?:城|市|鎮|站|港|島|都|關|谷|原|渡口|山莊|山城))/gu,
    /([^\s，。、「」『』【】]{2,16}(?:城|市|鎮|站|港|島|都|關|谷|原|渡口|山莊|山城)).{0,20}(?:才(?:有|能)|才能|可查到|找得到|找到真正)/gu
  ];

  for (const regex of patterns) {
    let match = regex.exec(tail);
    while (match) {
      push(match[1]);
      match = regex.exec(tail);
    }
  }
  return hits[0] || '';
}

const CHOICE_BANNED_PHRASES = [
  /一鍵成交|立即變現|秒賺|躺賺|暴富|無風險套利/gu
];

const CHOICE_VAGUE_PHRASES = [
  /追尋神秘交易/gu,
  /追問她留下的線索|追查她留下的線索|查她的線索/gu,
  /某個線索|不明線索|神秘線索(?!來源)/gu,
  /持續追查來源與流向|继续追查来源与流向/gu,
  /沿著.{0,18}(追查|追蹤).{0,20}(來源與流向|来源与流向)/gu,
  /先處理本區關鍵|先处理本区关键/gu,
  /回到核心線索|回到核心线索/gu,
  /現場目擊者逐一確認出現時間|现场目击者逐一确认出现时间/gu,
  /可疑人物|可疑隊伍|可疑目标|可疑目標/gu
];

const CHOICE_ENTITY_TOKENS = [
  '神祕人',
  '神秘人',
  '可疑人物',
  '可疑隊伍',
  '神祕隊伍',
  '神秘隊伍',
  '黑衣人',
  '斗篷人',
  '陌生隊伍'
];
const CHOICE_PORTAL_PATTERNS = [
  /傳送門|主傳送門|跨區傳送|跨區移動|傳送裝置|瞬間位移|portal|teleport/iu
];

function collectQuotedPhrases(text = '', limit = 8) {
  const source = String(text || '');
  if (!source) return [];
  const list = [];
  const regex = /「([^」]{2,20})」/gu;
  let match = regex.exec(source);
  while (match && list.length < limit) {
    const token = String(match[1] || '').trim();
    if (token) list.push(token);
    match = regex.exec(source);
  }
  return list;
}

function extractStoryAnchors(story = '', npcs = [], location = '', sourceChoice = '') {
  const source = String(story || '');
  const anchors = [];
  const seen = new Set();
  const add = (value) => {
    const token = String(value || '').trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    anchors.push(token);
  };

  if (location) add(location);
  if (sourceChoice) {
    const cleanedSourceChoice = sanitizeAnchorToken(sourceChoice, 16);
    if (cleanedSourceChoice) add(cleanedSourceChoice);
  }

  for (const npc of Array.isArray(npcs) ? npcs : []) {
    const npcName = String(npc?.name || '').trim();
    if (npcName && source.includes(npcName)) add(npcName);
  }
  for (const phrase of collectQuotedPhrases(source, 8)) {
    const cleanedPhrase = sanitizeAnchorToken(phrase, 18);
    if (cleanedPhrase) add(cleanedPhrase);
  }

  const cueKeywords = [
    '感溫貼片', '封存艙', '修復臺', '修復台', '來源代碼', '臨時艙', '舊倉街', '黑影商人',
    '茶師', '傳送門', '橋面', '目光', '徽章', '檢測儀', '座標', '編碼', '攤位', '市集'
  ];
  for (const keyword of cueKeywords) {
    if (source.includes(keyword)) add(keyword);
  }
  return anchors.slice(0, 12);
}

function hasAnyRegex(text = '', regexList = []) {
  const source = String(text || '');
  return regexList.some((pattern) => pattern.test(source));
}

function escapeRegex(source = '') {
  return String(source || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeMoveToLocation(raw = '') {
  const text = String(raw || '')
    .replace(/[「」『』【】（）()]/g, '')
    .trim();
  if (!text) return '';
  const locations = Object.keys(RENAISS_LOCATIONS || {});
  if (locations.includes(text)) return text;
  const matched = locations.filter((location) => text.includes(location));
  if (matched.length === 1) return matched[0];
  return '';
}

function parseChoicesFromAIResult(raw = '', playerLang = 'zh-TW', options = {}) {
  const player = options?.player || null;
  const location = String(options?.location || player?.location || '').trim();
  const payload = extractJsonPayload(raw);
  if (payload && payload.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(payload);
      if (Array.isArray(parsedJson) && parsedJson.length > 0) {
        const mapped = parsedJson
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const name = String(item.name || item.action || '').trim();
            const choice = String(item.choice || item.text || item.desc || '').trim();
            const desc = String(item.desc || item.choice || item.text || '').trim();
            const tag = String(item.tag || '').trim();
            const action = String(item.action || '').trim().slice(0, 40);
            const styleTag = DYNAMIC_WORLD.normalizeStyleTag(item.styleTag || item.style || item.mood || '');
            const hiddenMeta = DYNAMIC_WORLD.normalizeChoiceHiddenMeta(item.hiddenMeta || item.meta || null, item, {});
            const dynamicEvent = normalizeDynamicEventMeta(item.dynamicEvent || item.eventMeta || null);
            const moveTo = normalizeMoveToLocation(
              item.move_to || item.moveTo || item.destination || item.to || ''
            );
            if (!choice || !tag) return null;
            const normalized = normalizeChoiceSemanticMeta(normalizeChoiceByLanguage({
              name: name || choice.slice(0, 15),
              choice,
              desc: desc || choice,
              tag: tag.startsWith('[') ? tag : `[${tag}]`
            }, playerLang), player, location);
            if (action) normalized.action = action;
            if (styleTag) normalized.styleTag = normalizeOutputByLanguage(styleTag, playerLang);
            if (hiddenMeta && typeof hiddenMeta === 'object') normalized.hiddenMeta = hiddenMeta;
            if (dynamicEvent) normalized.dynamicEvent = dynamicEvent;
            if (moveTo) normalized.move_to = moveTo;
            return normalized;
          })
          .filter(Boolean);
        if (mapped.length > 0) return mapped.slice(0, CHOICE_OUTPUT_COUNT);
      }
    } catch {
      const looseParsed = parseLooseChoiceArray(payload, playerLang, { player, location });
      if (looseParsed.length > 0) return looseParsed.slice(0, CHOICE_OUTPUT_COUNT);
    }
  }

  const lines = String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = [];
  for (const line of lines.slice(0, CHOICE_OUTPUT_COUNT)) {
    const tagMatch = line.match(/\[([^\]]+)\]\s*(.+?)[：:]\s*(.+)/);
    if (tagMatch) {
      const tag = String(tagMatch[1] || '').trim();
      const action = String(tagMatch[2] || '').trim();
      const desc = String(tagMatch[3] || '').trim();
      if (!action || !desc) continue;
      parsed.push(normalizeChoiceSemanticMeta(normalizeChoiceByLanguage({
        name: action,
        choice: desc,
        desc,
        tag: `[${tag}]`
      }, playerLang), player, location));
      continue;
    }
    const content = line.replace(/^\d+\.?\s*/, '').trim();
    if (!content || content.length < 6) continue;
      parsed.push(normalizeChoiceSemanticMeta(normalizeChoiceByLanguage({
        name: content.slice(0, 15),
        choice: content,
        desc: content,
        tag: getChoiceTag('surprise', playerLang)
      }, playerLang), player, location));
  }
  return parsed.slice(0, CHOICE_OUTPUT_COUNT);
}

function parseLooseChoiceArray(text = '', playerLang = 'zh-TW', options = {}) {
  const player = options?.player || null;
  const location = String(options?.location || player?.location || '').trim();
  const source = String(text || '');
  if (!source) return [];
  const objectBlocks = source.match(/\{[\s\S]*?\}/g) || [];
  const out = [];

  const readField = (block = '', keys = []) => {
    for (const key of keys) {
      const patterns = [
        new RegExp(`[\"'“”]?${key}[\"'“”]?\\s*:\\s*\"([^\"]+)\"`, 'u'),
        new RegExp(`[\"'“”]?${key}[\"'“”]?\\s*:\\s*'([^']+)'`, 'u'),
        new RegExp(`[\"'“”]?${key}[\"'“”]?\\s*[:：]\\s*([^,\\n\\r}\\]]+)`, 'u')
      ];
      for (const pattern of patterns) {
        const match = block.match(pattern);
        if (match && match[1]) return String(match[1]).trim();
      }
    }
    return '';
  };

  for (const block of objectBlocks) {
    const name = readField(block, ['name', 'title', 'action']);
    const choice = readField(block, ['choice', 'text', 'option', 'content', 'desc']);
    const desc = readField(block, ['desc', 'description', 'detail', 'choice', 'text']);
    const tag = readField(block, ['tag', 'risk', 'label']);
    const styleTag = DYNAMIC_WORLD.normalizeStyleTag(readField(block, ['styleTag', 'style', 'mood']));
    const action = readField(block, ['action', 'type']).slice(0, 40);
    const moveTo = normalizeMoveToLocation(
      readField(block, ['move_to', 'moveTo', 'destination', 'to'])
    );
    if (!choice || !tag) continue;
    const normalized = normalizeChoiceSemanticMeta(normalizeChoiceByLanguage({
      name: name || choice.slice(0, 15),
      choice,
      desc: desc || choice,
      tag: tag.startsWith('[') ? tag : `[${tag}]`
    }, playerLang), player, location);
    if (styleTag) normalized.styleTag = normalizeOutputByLanguage(styleTag, playerLang);
    if (action) normalized.action = action;
    if (moveTo) normalized.move_to = moveTo;
    out.push(normalized);
    if (out.length >= CHOICE_OUTPUT_COUNT) break;
  }
  return out;
}

function getChoiceFingerprint(choice = {}) {
  return normalizeComparableText([
    choice?.name || '',
    choice?.choice || '',
    choice?.desc || ''
  ].join(' '));
}

function mergeChoicePool(pool = [], incoming = [], playerLang = 'zh-TW', options = {}) {
  const player = options?.player || null;
  const location = String(options?.location || player?.location || '').trim();
  const out = Array.isArray(pool) ? pool.filter(Boolean).slice(0, 30) : [];
  const seen = new Set(out.map(getChoiceFingerprint).filter(Boolean));
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    if (!raw || typeof raw !== 'object') continue;
    const choice = normalizeChoiceSemanticMeta(normalizeChoiceByLanguage(raw, playerLang), player, location);
    if (!choice?.choice || !choice?.tag) continue;
    const fp = getChoiceFingerprint(choice);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    out.push(choice);
    if (out.length >= 30) break;
  }
  return out;
}

function scoreChoiceCandidate(choice = {}, { anchors = [], location = '', previousStory = '', locationPlaystyle = null } = {}) {
  const text = [choice?.name || '', choice?.choice || '', choice?.desc || '', choice?.tag || ''].join(' ');
  if (!String(choice?.choice || '').trim() || !String(choice?.tag || '').trim()) return -999;

  let score = 0;
  const anchorList = (Array.isArray(anchors) ? anchors : []).map((x) => String(x || '').trim()).filter(Boolean);
  if (anchorList.length > 0 && anchorList.some((anchor) => text.includes(anchor))) score += 2.4;
  if (String(previousStory || '').trim()) score += 0.6;
  if (hasAnyRegex(text, CHOICE_BANNED_PHRASES)) score -= 3.5;
  if (hasAnyRegex(text, CHOICE_VAGUE_PHRASES)) score -= 2.6;

  const locationRegex = location
    ? new RegExp(`把[「"]?${escapeRegex(location)}[」"]?\\s*(送|帶去|拿去|送去)`, 'u')
    : null;
  if (locationRegex && locationRegex.test(text)) score -= 2.5;

  const choiceLen = String(choice?.choice || '').trim().length;
  const descLen = String(choice?.desc || '').trim().length;
  if (choiceLen >= 10 && choiceLen <= 34) score += 0.6;
  if (descLen >= 10 && descLen <= 42) score += 0.4;
  if (locationPlaystyle && Array.isArray(locationPlaystyle.keywords) && locationPlaystyle.keywords.length > 0) {
    const hit = locationPlaystyle.keywords.some((keyword) => String(keyword || '').trim() && text.includes(String(keyword).trim()));
    if (hit) score += 1.1;
  }
  return Number(score.toFixed(4));
}

function pickTopChoicesFromPool(pool = [], context = {}, maxCount = CHOICE_OUTPUT_COUNT) {
  const source = Array.isArray(pool) ? pool.filter(Boolean) : [];
  const scored = source
    .map((choice, idx) => ({
      choice,
      idx,
      score: scoreChoiceCandidate(choice, context),
      fp: getChoiceFingerprint(choice)
    }))
    .filter((row) => row.fp)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    });

  const out = [];
  const seen = new Set();
  for (const row of scored) {
    if (seen.has(row.fp)) continue;
    seen.add(row.fp);
    out.push(row.choice);
    if (out.length >= maxCount) break;
  }
  return out;
}

function validateChoiceSet(choices = [], {
  anchors = [],
  location = '',
  previousStory = '',
  locationPlaystyle = null,
  playerLang = 'zh-TW'
} = {}) {
  const issues = [];
  const list = Array.isArray(choices) ? choices.filter(Boolean) : [];
  if (list.length !== CHOICE_OUTPUT_COUNT) {
    issues.push(`選項數量必須是 ${CHOICE_OUTPUT_COUNT} 個，目前 ${list.length} 個`);
    return issues;
  }

  const anchorList = (Array.isArray(anchors) ? anchors : [])
    .map((token) => sanitizeAnchorToken(token, 18))
    .filter(Boolean);
  const seen = new Set();
  let duplicateCount = 0;
  let anchorHitCount = 0;
  let aggressiveCount = 0;
  const adjacentSet = new Set(
    location && typeof getConnectedLocations === 'function'
      ? getConnectedLocations(location)
      : []
  );
  const locationRegex = location
    ? new RegExp(`把[「"]?${escapeRegex(location)}[」"]?\\s*(送|帶去|拿去|送去)`, 'u')
    : null;
  const langCode = normalizeLangCode(playerLang || 'zh-TW');

  for (let i = 0; i < list.length; i++) {
    const choice = list[i];
    const text = [choice?.name || '', choice?.choice || '', choice?.desc || '', choice?.tag || ''].join(' ');
    const fp = normalizeComparableText([choice?.name || '', choice?.choice || '', choice?.desc || ''].join(' '));
    const moveTo = normalizeMoveToLocation(choice?.move_to || choice?.moveTo || '');
    const hasCityMoveIntent = /(?:前往|趕往|赶往|轉往|转往|去往|前去|啟程|启程|移動到|移动到)[^，。；\n]{0,24}(?:城|市|鎮|站|港|島|都|關|谷|原|渡口|山莊|山城)/u.test(text);
    if (!fp) {
      issues.push(`第 ${i + 1} 個選項為空或格式錯誤`);
      continue;
    }
    if (seen.has(fp)) duplicateCount += 1;
    seen.add(fp);

    if (hasAnyRegex(text, CHOICE_BANNED_PHRASES)) issues.push(`第 ${i + 1} 個含跳 tone 詞彙`);
    if (hasAnyRegex(text, CHOICE_VAGUE_PHRASES)) issues.push(`第 ${i + 1} 個語意空泛或暴露過早`);
    if (hasAnyRegex(text, CHOICE_PORTAL_PATTERNS)) issues.push(`第 ${i + 1} 個包含傳送類選項（已改由地圖按鈕）`);
    if (hasUnanchoredEntityToken(text, anchorList)) issues.push(`第 ${i + 1} 個引入了前文未鋪陳的可疑角色稱呼`);
    if (locationRegex && locationRegex.test(text)) issues.push(`第 ${i + 1} 個把地名當作物件`);
    if (moveTo && !text.includes(moveTo)) issues.push(`第 ${i + 1} 個 move_to=${moveTo} 但文案未提到該地點`);
    if (hasCityMoveIntent && !moveTo) issues.push(`第 ${i + 1} 個是跨城移動選項但缺少 move_to 欄位`);
    if (moveTo && adjacentSet.size > 0 && moveTo !== location && !adjacentSet.has(moveTo)) {
      issues.push(`第 ${i + 1} 個 move_to=${moveTo} 與目前位置 ${location} 不相鄰；若要去更遠城市，必須改成第一跳城市`);
    }
    if (langCode === 'ko') {
      const coreText = [choice?.name || '', choice?.choice || '', choice?.desc || ''].join(' ');
      const hangulCount = countRegexMatches(coreText, /[가-힣]/g);
      if (hangulCount < 6) {
        issues.push(`第 ${i + 1} 個選項不是韓文輸出（韓文字元不足）`);
      }
    }

    if (anchorList.length > 0 && anchorList.some((anchor) => text.includes(anchor))) {
      anchorHitCount += 1;
    }
    if (isAggressiveChoiceTag(String(choice?.tag || ''))) {
      aggressiveCount += 1;
    }
  }

  if (duplicateCount > 0) issues.push(`有 ${duplicateCount} 個重複選項`);
  if (aggressiveCount < 1) issues.push('至少需要 1 個偏激進選項（高風險或戰鬥張力）');
  if (locationPlaystyle && Array.isArray(locationPlaystyle.keywords) && locationPlaystyle.keywords.length > 0) {
    const minKeywordHits = Math.max(1, Number(locationPlaystyle.minKeywordHits || 1));
    const keywordHits = countChoiceKeywordHits(list, locationPlaystyle.keywords);
    if (keywordHits < minKeywordHits) {
      issues.push(`至少需要 ${minKeywordHits} 個選項符合地區玩法口味（目前 ${keywordHits} 個）`);
    }
  }
  // 「是否命中過往元素」改為提示詞引導，不作為硬性失敗條件，
  // 避免選項已合理但因命中門檻造成整組失敗。

  // 威脅應對改由提示詞引導，不作為硬性擋下條件，避免故事已成功但選項為空。
  return issues;
}

function isMainlineGuideChoiceText(choice = {}) {
  if (!choice || typeof choice !== 'object') return false;
  if (String(choice.action || '').trim() === 'main_story') return true;
  const text = [choice.tag || '', choice.name || '', choice.choice || '', choice.desc || ''].join(' ');
  return /(主線|導引|回到線索|沿線追查|下一段|下一步)/u.test(text);
}

function hasUnanchoredEntityToken(text = '', anchors = []) {
  const source = String(text || '');
  if (!source) return false;
  const anchorList = Array.isArray(anchors) ? anchors.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return CHOICE_ENTITY_TOKENS.some((token) => {
    if (!source.includes(token)) return false;
    return !anchorList.some((anchor) => anchor.includes(token) || token.includes(anchor));
  });
}

function buildStorySystemSignals(story = '') {
  const text = String(story || '');
  const storageVaultPattern = /封存[艙舱倉藏函]/u;
  const storageCarrierPattern =
    /(手(?:上|中|裡|里)|懷裡|怀里|背著|背着|抱著|抱着|提著|提着|攜帶|携带|拿著|拿着|夾著|夹着|腰間|腰间).{0,14}封存[艙舱倉藏函]|封存[艙舱倉藏函].{0,12}(在手上|在手中|在手裡|在手里|被抱著|被抱着|被提著|被提着|被背著|被背着|被攜帶|被携带|掛在腰間|挂在腰间)/u;
  const suspiciousTradePattern =
    /(可疑|低價|壓價|異常開價|友善供應|黑影商人|神秘鑑價站|來源不明|贗品|假貨|套走|攤位|鑑價品|貨樣).{0,10}(商人|攤販|隊伍|供應|開價|交易)|((商人|攤販|隊伍|供應|開價|交易).{0,12}(可疑|低價|壓價|友善供應|來源不明|贗品|假貨))/u;
  return {
    portal: /(傳送門|門紋|節點|躍遷|空間折疊|坐標轉移)/u.test(text),
    wishPool: /(許願|願望|祈願|祈福|祭壇|願池)/u.test(text),
    market: /(市集|攤位|交易|收購|鑑價|鑑定|封存艙|修復臺|修復台|商人|倉管|貨艙)/u.test(text),
    mentor: /(導師|名師|友誼賽|切磋|指導|拜師)/u.test(text),
    storageVault: storageVaultPattern.test(text),
    storageCarrier: storageCarrierPattern.test(text),
    suspiciousTrade: suspiciousTradePattern.test(text),
    threat: hasThreatCue(text)
  };
}

const THREAT_ACTIVE_KEYWORDS = [
  '殺手', '刺客', '追兵', '伏擊', '埋伏', '危機', '殺機', '敵影',
  '攔截', '侵蝕', '逼近', '包圍', '開打', '迎戰', '對峙', '降臨'
];

const THREAT_RESOLVED_KEYWORDS = [
  '停戰', '通過試煉', '危機解除', '擊退', '擊敗', '化解', '撤離成功', '脫離',
  '遠去', '離去', '收兵', '結束戰鬥'
];

function hasThreatKeyword(text = '') {
  const source = String(text || '');
  return THREAT_ACTIVE_KEYWORDS.some((keyword) => source.includes(keyword));
}

function getTailWindow(text = '', size = 320) {
  const source = String(text || '');
  if (!source) return '';
  return source.slice(-Math.max(80, Number(size || 320)));
}

function hasThreatCue(text = '') {
  const tail = getTailWindow(text, 360);
  if (!hasThreatKeyword(tail)) return false;
  return !THREAT_RESOLVED_KEYWORDS.some((keyword) => tail.includes(keyword));
}

const WANTED_IMMERSION_CUE_RE = /(通緝|通缉|追兵|尾隨|尾随|盯上|賞金獵人|赏金猎人|bounty|wanted|hunter|hunters|tailing|tracked|현상금|추적|추격|추적자|매복)/iu;

function hasWantedImmersionCue(story = '') {
  return WANTED_IMMERSION_CUE_RE.test(String(story || ''));
}

function buildWantedImmersionLine(playerLang = 'zh-TW', wantedPressure = 0, hostileNames = []) {
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  const names = Array.isArray(hostileNames)
    ? hostileNames.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const nameJoiner = (langCode === 'en' || langCode === 'ko') ? ', ' : '、';
  const primaryTarget = names.length > 0 ? names.slice(0, 2).join(nameJoiner) : '';
  const level = Math.max(0, Number(wantedPressure || 0));
  if (langCode === 'en') {
    if (primaryTarget) {
      return `Bounty pressure Lv.${level}: hostile spotters tied to ${primaryTarget} start shadowing your route, and contact feels imminent.`;
    }
    return `Bounty pressure Lv.${level}: unfamiliar spotters keep tracking your route, signaling that a hostile probe is closing in.`;
  }
  if (langCode === 'ko') {
    if (primaryTarget) {
      return `수배 압력 Lv.${level}: ${primaryTarget}와 연계된 적대 감시자들이 동선을 미행하기 시작했고, 곧 접촉이 예상된다.`;
    }
    return `수배 압력 Lv.${level}: 정체불명의 감시자들이 동선을 계속 추적하며 적대 세력의 접근이 가까워지고 있다.`;
  }
  if (langCode === 'zh-CN') {
    if (primaryTarget) {
      return `通缉压力 Lv.${level}：与${primaryTarget}有关的敌对眼线开始跟踪你的动线，接触风险正在上升。`;
    }
    return `通缉压力 Lv.${level}：陌生眼线持续跟踪你的动线，敌对试探正在逼近。`;
  }
  if (primaryTarget) {
    return `通緝壓力 Lv.${level}：與${primaryTarget}有關的敵對眼線開始跟監你的動線，接觸風險正在升高。`;
  }
  return `通緝壓力 Lv.${level}：陌生眼線持續跟監你的動線，敵對試探正在逼近。`;
}

function ensureWantedImmersionNarrative(story = '', options = {}) {
  const source = String(story || '').trim();
  if (!source) return source;
  const wantedPressure = Math.max(0, Number(options?.wantedPressure || 0));
  const threshold = Math.max(1, Number(options?.minLevel || WANTED_AMBUSH_MIN_LEVEL));
  if (wantedPressure < threshold) return source;
  if (hasWantedImmersionCue(source)) return source;
  const line = buildWantedImmersionLine(
    String(options?.playerLang || 'zh-TW').trim(),
    wantedPressure,
    Array.isArray(options?.hostileNames) ? options.hostileNames : []
  );
  if (!line) return source;
  const joiner = /[。！？.!?]$/u.test(source) ? '\n' : '。\n';
  return `${source}${joiner}${line}`;
}

function buildNpcMentionPattern(name = '') {
  const safe = String(name || '').trim();
  if (!safe) return null;
  if (/^[A-Za-z0-9]$/u.test(safe)) {
    return new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(safe)}(?=[^A-Za-z0-9_]|$)`, 'u');
  }
  return new RegExp(escapeRegex(safe), 'u');
}

function findNpcMentionIndex(text = '', name = '') {
  const source = String(text || '');
  const pattern = buildNpcMentionPattern(name);
  if (!source || !pattern) return -1;
  const matched = pattern.exec(source);
  if (!matched) return -1;
  if (/^[A-Za-z0-9]$/u.test(String(name || '').trim())) {
    return matched.index + String(matched[1] || '').length;
  }
  return matched.index;
}

function hasNpcIntroCueAroundMention(text = '', name = '') {
  const source = String(text || '');
  const safeName = String(name || '').trim();
  if (!source || !safeName) return true;
  const pattern = buildNpcMentionPattern(safeName);
  if (!pattern) return true;
  const introRegex = new RegExp(
    `(?:看見|看到|見到|遇見|注意到|發現|一名|一位|名叫|叫做|自稱|站在|站著|從旁|走來|走近|靠近|攔下|出現在|現身|不遠處).{0,14}${pattern.source}|` +
    `${pattern.source}.{0,18}(?:站在|走來|走近|靠近|攔下|從旁|從後|出聲|開口|自我介紹|向你|朝你|現身|出現在|停在)`,
    'u'
  );
  return introRegex.test(source);
}

function validateStoryNpcContinuity(story = '', options = {}) {
  const source = String(story || '').trim();
  if (!source) return [];
  const immediateContext = [
    options.previousStorySummary || '',
    options.previousAction || '',
    options.previousOutcome || ''
  ].join('\n');
  const npcList = Array.isArray(options.npcs) ? options.npcs : [];
  const issues = [];

  for (const npc of npcList) {
    const npcName = String(npc?.name || '').trim();
    if (!npcName) continue;
    const idx = findNpcMentionIndex(source, npcName);
    if (idx < 0) continue;
    if (findNpcMentionIndex(immediateContext, npcName) >= 0) continue;
    const windowStart = Math.max(0, idx - 28);
    const windowEnd = Math.min(source.length, idx + Math.max(48, npcName.length + 24));
    const mentionWindow = source.slice(windowStart, windowEnd);
    if (hasNpcIntroCueAroundMention(mentionWindow, npcName)) continue;
    issues.push(`NPC「${npcName}」首次出場缺少介紹，像是前文已在場人物`);
  }

  return issues;
}

function resolveMainlineBridgeLock(player = null, previousChoice = null) {
  const fromPlayer = player && typeof player === 'object' && player.mainlineBridgeLock && typeof player.mainlineBridgeLock === 'object'
    ? player.mainlineBridgeLock
    : null;
  const fromChoice = previousChoice && typeof previousChoice === 'object'
    ? previousChoice
    : null;

  const goal = String(fromPlayer?.goal || fromChoice?.mainlineGoal || '').trim();
  if (!goal) return null;

  const stage = Math.max(1, Number(fromPlayer?.stage || fromChoice?.mainlineStage || 1));
  const stageCount = Math.max(stage, Number(fromPlayer?.stageCount || fromChoice?.mainlineStageCount || 8));
  const progress = String(fromPlayer?.progress || fromChoice?.mainlineProgress || `地區進度 ${stage}/${stageCount}`).trim();
  const location = String(fromPlayer?.location || player?.location || '').trim();
  const sourceChoice = String(fromPlayer?.sourceChoice || fromChoice?.choice || fromChoice?.name || '').trim();
  return {
    goal,
    stage,
    stageCount,
    progress,
    location,
    sourceChoice
  };
}

function buildDeterministicFallbackStory({
  player = null,
  pet = null,
  previousAction = '',
  previousOutcome = '',
  previousStorySummary = '',
  playerLang = 'zh-TW',
  location = ''
} = {}) {
  const safeName = String(player?.name || '冒險者').trim() || '冒險者';
  const safePet = String(pet?.name || '夥伴').trim() || '夥伴';
  const safeLocation = String(location || player?.location || '未知區域').trim() || '未知區域';
  const action = String(previousAction || '繼續探索').trim();
  const outcome = String(previousOutcome || '').trim();
  const summary = String(previousStorySummary || '').trim();
  const langCode = normalizeLangCode(playerLang || 'zh-TW');

  if (langCode === 'en') {
    return (
      `${safeName} and ${safePet} moved through ${safeLocation} while regrouping after "${action}". ` +
      `${outcome ? `Current result: ${outcome}. ` : ''}` +
      `They checked nearby merchants, scanned container labels, and marked two leads that can be traced next. ` +
      `${summary ? `Context retained: ${summary.slice(0, 120)}. ` : ''}` +
      `The atmosphere stayed tense, but the route ahead remained open for the next decision.`
    );
  }
  if (langCode === 'ko') {
    return (
      `${safeName}와 ${safePet}은 ${safeLocation} 일대에서 대형을 다시 정비하며 방금 선택한 행동 "${action}"의 흐름을 이어갔다.` +
      `${outcome ? ` 현재 결과: ${outcome}.` : ''}` +
      ` 두 사람은 주변 상점과 봉인 캐니스터 표기를 다시 확인하고, 다음 장면으로 이어질 핵심 단서 두 갈래를 추려냈다.` +
      `${summary ? ` 이전 맥락: ${summary.slice(0, 90)}.` : ''}` +
      ' 현장 긴장은 유지되고 있으며, 다음 행동으로 바로 이어질 창구가 열려 있다.'
    );
  }
  if (langCode === 'zh-CN') {
    return (
      `${safeName}与${safePet}在${safeLocation}一带重新整队，承接你刚才的行动「${action}」。` +
      `${outcome ? `目前结果：${outcome}。` : ''}` +
      `他们先确认周边摊位与封存舱标签，锁定了两条可继续追查的来源线索。` +
      `${summary ? `前情保留：${summary.slice(0, 90)}。` : ''}` +
      `现场气氛仍然紧绷，但下一步行动窗口已经打开。`
    );
  }
  return (
    `${safeName}與${safePet}在${safeLocation}一帶重新整隊，承接你剛才的行動「${action}」。` +
    `${outcome ? `目前結果：${outcome}。` : ''}` +
    `他們先確認周邊攤位與封存艙標籤，鎖定了兩條可繼續追查的來源線索。` +
    `${summary ? `前情保留：${summary.slice(0, 90)}。` : ''}` +
    `現場氣氛仍然緊繃，但下一步行動窗口已經打開。`
  );
}

function buildDeterministicFallbackChoices({
  location = '',
  connectedLocations = [],
  directedDestination = '',
  stageGoal = '',
  playerLang = 'zh-TW'
} = {}) {
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  const currentLocation = String(location || '河港鎮').trim() || '河港鎮';
  const connected = Array.isArray(connectedLocations)
    ? connectedLocations.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const connectedSet = new Set(connected);
  const directed = String(directedDestination || '').trim();
  const moveTo = directed && connectedSet.has(directed)
    ? directed
    : (connected[0] || '');
  const immediateBattleMarker = langCode === 'ko'
    ? '（전투 진입）'
    : (langCode === 'en' ? '(Immediate battle)' : (langCode === 'zh-CN' ? '（会进入战斗）' : '（會進入戰鬥）'));
  const stageHint = String(stageGoal || '').trim();

  const baseMeta = {
    explore: { law: 1, harm: -1, trust: 1, selfInterest: 0, targetFaction: 'none', witnessRisk: 0.12 },
    social: { law: 1, harm: -1, trust: 1, selfInterest: 0, targetFaction: 'civic', witnessRisk: 0.16 },
    trade: { law: 1, harm: -1, trust: 0, selfInterest: 1, targetFaction: 'beacon', witnessRisk: 0.08 },
    route: { law: 0, harm: 0, trust: 0, selfInterest: 1, targetFaction: 'none', witnessRisk: 0.22 },
    fight: { law: -1, harm: 1, trust: -1, selfInterest: 1, targetFaction: 'digital', witnessRisk: 0.74 }
  };

  if (langCode === 'ko') {
    return [
      {
        action: 'explore',
        name: '현장 단서 재확인',
        choice: `${currentLocation} 주변에서 방금 드러난 단서를 다시 대조해 빈칸을 메운다`,
        desc: `${stageHint ? `현재 단계: ${stageHint} | ` : ''}무리하지 않고 정보 정확도를 끌어올린다`,
        tag: getChoiceTag('explore', playerLang),
        styleTag: '穩健',
        move_to: '',
        hiddenMeta: { ...baseMeta.explore }
      },
      {
        action: 'social',
        name: '목격자 접촉',
        choice: `${currentLocation}의 목격자 한 명을 설득해 적대 세력 동선을 캐묻는다`,
        desc: '대화 중심으로 위험을 낮추면서 다음 분기를 연다',
        tag: getChoiceTag('social', playerLang),
        styleTag: '交涉',
        move_to: '',
        hiddenMeta: { ...baseMeta.social }
      },
      {
        action: 'trade',
        name: '감정소 대조',
        choice: '가까운 감정소에서 확보한 샘플의 출처 흔적을 교차 검증한다',
        desc: '거래 전에 진위와 공급 경로를 먼저 고정한다',
        tag: getChoiceTag('appraisal', playerLang),
        styleTag: '佈局',
        move_to: '',
        hiddenMeta: { ...baseMeta.trade }
      },
      {
        action: 'explore',
        name: moveTo ? `${moveTo} 선행 이동` : '추적선 압축',
        choice: moveTo
          ? `보급을 정리한 뒤 ${moveTo}로 먼저 전진해 다음 구간을 잇는다`
          : '상대가 빠진 경로를 짧게 추적해 다음 접점을 특정한다',
        desc: moveTo
          ? '이동 선택: 이번 턴 첫 이동 거점을 확정한다'
          : '즉시 교전 없이 동선 우위를 확보한다',
        tag: getChoiceTag('explore', playerLang),
        styleTag: moveTo ? '佈局' : '追獵',
        move_to: moveTo,
        hiddenMeta: { ...baseMeta.route }
      },
      {
        action: 'fight',
        name: '즉시 요격',
        choice: `근처 미행 인원을 먼저 차단해 정면으로 충돌한다${immediateBattleMarker}`,
        desc: '고위험 선택: 즉시 교전으로 전환될 수 있다',
        tag: getChoiceTag('combat', playerLang),
        styleTag: '強奪',
        move_to: '',
        hiddenMeta: { ...baseMeta.fight }
      }
    ];
  }

  if (langCode === 'en') {
    return [
      {
        action: 'explore',
        name: 'Recheck scene clues',
        choice: `Return to the latest scene in ${currentLocation} and verify each suspicious trace`,
        desc: `${stageHint ? `Current stage: ${stageHint} | ` : ''}Stabilize facts before committing`,
        tag: getChoiceTag('explore', playerLang),
        styleTag: '穩健',
        move_to: '',
        hiddenMeta: { ...baseMeta.explore }
      },
      {
        action: 'social',
        name: 'Question a witness',
        choice: `Stop a local witness in ${currentLocation} and ask where the target group moved`,
        desc: 'Trade dialogue for intel while keeping escalation low',
        tag: getChoiceTag('social', playerLang),
        styleTag: '交涉',
        move_to: '',
        hiddenMeta: { ...baseMeta.social }
      },
      {
        action: 'trade',
        name: 'Cross-check appraisal',
        choice: 'Bring your sample to a nearby appraisal desk and cross-check origin marks',
        desc: 'Confirm authenticity and route evidence before any sale',
        tag: getChoiceTag('appraisal', playerLang),
        styleTag: '佈局',
        move_to: '',
        hiddenMeta: { ...baseMeta.trade }
      },
      {
        action: 'explore',
        name: moveTo ? `Advance to ${moveTo}` : 'Compress pursuit line',
        choice: moveTo
          ? `Restock and advance to ${moveTo} as the first hop toward the next segment`
          : 'Trace the retreat lane at short range and lock the next contact point',
        desc: moveTo
          ? 'Travel option: secure first-hop continuity this turn'
          : 'Hold pressure without opening combat immediately',
        tag: getChoiceTag('explore', playerLang),
        styleTag: moveTo ? '佈局' : '追獵',
        move_to: moveTo,
        hiddenMeta: { ...baseMeta.route }
      },
      {
        action: 'fight',
        name: 'Preemptive intercept',
        choice: `Intercept the nearby tailing unit before they regroup ${immediateBattleMarker}`,
        desc: 'High-risk line: likely to trigger immediate combat',
        tag: getChoiceTag('combat', playerLang),
        styleTag: '強奪',
        move_to: '',
        hiddenMeta: { ...baseMeta.fight }
      }
    ];
  }

  if (langCode === 'zh-CN') {
    return [
      {
        action: 'explore',
        name: '重查现场线索',
        choice: `回到${currentLocation}的上一处现场，逐项核对刚出现的可疑痕迹`,
        desc: `${stageHint ? `当前阶段：${stageHint}｜` : ''}先补齐信息再决策`,
        tag: getChoiceTag('explore', playerLang),
        styleTag: '穩健',
        move_to: '',
        hiddenMeta: { ...baseMeta.explore }
      },
      {
        action: 'social',
        name: '接触目击者',
        choice: `在${currentLocation}拦住一名目击者，追问刚才那批人的去向`,
        desc: '以交涉换情报，降低正面冲突风险',
        tag: getChoiceTag('social', playerLang),
        styleTag: '交涉',
        move_to: '',
        hiddenMeta: { ...baseMeta.social }
      },
      {
        action: 'trade',
        name: '送鉴价比对',
        choice: '把手上样本送到附近鉴价站做来源比对',
        desc: '先确认真伪与来源路径，再决定是否交易',
        tag: getChoiceTag('appraisal', playerLang),
        styleTag: '佈局',
        move_to: '',
        hiddenMeta: { ...baseMeta.trade }
      },
      {
        action: 'explore',
        name: moveTo ? `转进 ${moveTo}` : '压线追踪',
        choice: moveTo
          ? `整备补给后先往${moveTo}推进，衔接下一段路线`
          : '沿着对方撤离路线做短程追踪，确认下一个接点',
        desc: moveTo
          ? '移动型选项：先走第一跳城市，维持剧情连续'
          : '先跟上动线，不直接开打',
        tag: getChoiceTag('explore', playerLang),
        styleTag: moveTo ? '佈局' : '追獵',
        move_to: moveTo,
        hiddenMeta: { ...baseMeta.route }
      },
      {
        action: 'fight',
        name: '先发拦截',
        choice: `对附近可疑尾随者发动先手拦截${immediateBattleMarker}`,
        desc: '高风险行动：可能立刻进入正面交锋',
        tag: getChoiceTag('combat', playerLang),
        styleTag: '強奪',
        move_to: '',
        hiddenMeta: { ...baseMeta.fight }
      }
    ];
  }

  return [
    {
      action: 'explore',
      name: '重查現場線索',
      choice: `回到${currentLocation}的上一個現場，逐項核對剛出現的可疑痕跡`,
      desc: `${stageHint ? `當前階段：${stageHint}｜` : ''}先補齊資訊再決策`,
      tag: getChoiceTag('explore', playerLang),
      styleTag: '穩健',
      move_to: '',
      hiddenMeta: { ...baseMeta.explore }
    },
    {
      action: 'social',
      name: '接觸目擊者',
      choice: `在${currentLocation}攔住一名目擊者，追問剛才那批人的去向`,
      desc: '以交涉換情報，降低正面衝突風險',
      tag: getChoiceTag('social', playerLang),
      styleTag: '交涉',
      move_to: '',
      hiddenMeta: { ...baseMeta.social }
    },
    {
      action: 'trade',
      name: '送鑑價比對',
      choice: '把手上樣本送到附近鑑價站做來源比對',
      desc: '先確認真偽與來源路徑，再決定是否交易',
      tag: getChoiceTag('appraisal', playerLang),
      styleTag: '佈局',
      move_to: '',
      hiddenMeta: { ...baseMeta.trade }
    },
    {
      action: 'explore',
      name: moveTo ? `轉進 ${moveTo}` : '壓線追蹤',
      choice: moveTo
        ? `整備補給後先往${moveTo}推進，銜接下一段路線`
        : '沿著對方撤離路線做短程追蹤，確認下一個接點',
      desc: moveTo
        ? '移動型選項：先走第一跳城市，維持劇情連續'
        : '先跟上動線，不直接開打',
      tag: getChoiceTag('explore', playerLang),
      styleTag: moveTo ? '佈局' : '追獵',
      move_to: moveTo,
      hiddenMeta: { ...baseMeta.route }
    },
    {
      action: 'fight',
      name: '先發攔截',
      choice: `對附近可疑尾隨者發動先手攔截${immediateBattleMarker}`,
      desc: '高風險行動：可能立刻進入正面交鋒',
      tag: getChoiceTag('combat', playerLang),
      styleTag: '強奪',
      move_to: '',
      hiddenMeta: { ...baseMeta.fight }
    }
  ];
}

function choiceMentionsThreat(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const text = [choice.name || '', choice.choice || '', choice.desc || '', choice.tag || ''].join(' ');
  return hasThreatKeyword(text);
}

function isImmediateBattleChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  if (String(choice.action || '') === 'fight') return true;
  const text = [choice.choice || '', choice.desc || '', choice.name || ''].join(' ');
  return /[（(]\s*(?:會進入戰鬥|会进入战斗|전투\s*진입|Immediate\s*battle)\s*[)）]/iu.test(text)
    || /(即時戰鬥|即时战斗|立刻開打|立刻开打|立即戰鬥|立即战斗|즉시\s*전투|바로\s*전투|immediate\s*battle)/iu.test(text);
}

async function injectSystemChoicesSafely(
  baseChoices,
  {
    playerLang = 'zh-TW',
    location = '',
    newbieMask = false,
    storyText = '',
    forcePortal = false,
    forceWishPool = false,
    forceMarket = false
  } = {}
) {
  let work = Array.isArray(baseChoices) ? baseChoices.slice(0, CHOICE_OUTPUT_COUNT) : [];
  const storySignals = buildStorySystemSignals(storyText);
  try {
    work = await injectPortalChoice(work, location, playerLang, { forcePortal, storySignals });
  } catch (e) {
    console.error('[AI] injectPortalChoice 失敗，略過:', e?.message || e);
  }
  try {
    work = await injectWishPoolChoice(work, playerLang, location, { forceWishPool, storySignals });
  } catch (e) {
    console.error('[AI] injectWishPoolChoice 失敗，略過:', e?.message || e);
  }
  try {
    work = await injectMarketChoices(work, playerLang, location, newbieMask, { forceMarket, storySignals });
  } catch (e) {
    console.error('[AI] injectMarketChoices 失敗，略過:', e?.message || e);
  }
  try {
    work = await injectStorageHeistChoice(work, playerLang, location, { storySignals });
  } catch (e) {
    console.error('[AI] injectStorageHeistChoice 失敗，略過:', e?.message || e);
  }
  try {
    work = await injectMentorSparChoice(work, playerLang, location, { storySignals });
  } catch (e) {
    console.error('[AI] injectMentorSparChoice 失敗，略過:', e?.message || e);
  }
  return Array.isArray(work) ? work.slice(0, CHOICE_OUTPUT_COUNT) : [];
}

async function callAI(prompt, temperature = 0.9, options = {}) {
  if (!API_KEY) throw new Error('No API Key');

  const retries = Math.max(1, Number(options.retries || AI_MAX_RETRIES));
  const unlimitedTimeout = typeof options.unlimitedTimeout === 'boolean'
    ? options.unlimitedTimeout
    : AI_UNLIMITED_TIMEOUT;
  const unlimitedMaxTokens = typeof options.unlimitedMaxTokens === 'boolean'
    ? options.unlimitedMaxTokens
    : AI_UNLIMITED_MAX_TOKENS;
  const timeoutMs = unlimitedTimeout ? 0 : Math.max(5000, Number(options.timeoutMs || AI_TIMEOUT_MS));
  const maxTokens = unlimitedMaxTokens ? null : Math.max(120, Number(options.maxTokens || AI_MAX_RESPONSE_TOKENS));
  const model = String(options.model || MINIMAX_MODEL);
  const label = String(options.label || 'callAI');
  const strictFinalOnly = Boolean(options.strictFinalOnly);
  const continueOnLength = Boolean(options.continueOnLength);
  const maxContinuations = continueOnLength
    ? Math.max(1, Math.min(2, Number(options.maxContinuations || 1)))
    : 0;
  const hardRule = '\n\n【硬性輸出規則】只輸出最終答案，禁止輸出任何思考過程、XML標籤或系統說明。';
  let lastError = null;

  const mergeContinuation = (baseText = '', continuationText = '') => {
    const base = String(baseText || '');
    const extra = String(continuationText || '');
    if (!base) return extra;
    if (!extra) return base;
    const maxOverlap = Math.min(320, base.length, extra.length);
    for (let len = maxOverlap; len >= 24; len--) {
      if (base.slice(-len) === extra.slice(0, len)) {
        return `${base}${extra.slice(len)}`;
      }
    }
    return `${base}\n${extra}`;
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startAt = Date.now();
      const attemptPrompt =
        prompt +
        hardRule +
        (
          attempt > 1
            ? '\n上一輪你可能只輸出了<think>內容。這一輪禁止輸出<think>，直接輸出最終內容。'
            : ''
        );
      const attemptMaxTokens = Number.isFinite(Number(maxTokens))
        ? (attempt > 1 ? Math.max(Number(maxTokens), Math.floor(Number(maxTokens) * 1.5)) : Number(maxTokens))
        : null;
      const invokeOnce = async (requestPrompt = '', requestTokens = null) => {
        const payload = {
          model,
          messages: [{ role: 'user', content: requestPrompt }],
          temperature: temperature
        };
        if (Number.isFinite(Number(requestTokens)) && Number(requestTokens) > 0) {
          payload.max_tokens = Number(requestTokens);
        }
        const body = JSON.stringify(payload);
        const { content, finishReason } = await requestAI(body, timeoutMs, { label });
        const cleaned = sanitizeAIContent(content);
        if (!cleaned || cleaned.length < 30) {
          throw new Error(`Empty cleaned content raw=${previewAIContent(content)}`);
        }
        return { cleaned, finishReason: String(finishReason || '').trim() };
      };

      let { cleaned: mergedContent, finishReason } = await invokeOnce(attemptPrompt, attemptMaxTokens);
      let continuationCount = 0;
      while (continuationCount < maxContinuations && finishReason === 'length') {
        const continuePrompt =
          `${attemptPrompt}\n\n` +
          `【你上一段已輸出的內容（前半）】\n${mergedContent}\n\n` +
          '【續寫要求】上一段內容被截斷。請直接從中斷處續寫後半段，' +
          '只輸出續寫內容，不要重複前半段，不要任何說明。';
        const continuationTokens = Number.isFinite(Number(attemptMaxTokens))
          ? Math.max(Number(attemptMaxTokens), Math.floor(Number(attemptMaxTokens) * 1.2))
          : null;
        const continuation = await invokeOnce(continuePrompt, continuationTokens);
        mergedContent = mergeContinuation(mergedContent, continuation.cleaned);
        finishReason = continuation.finishReason;
        continuationCount += 1;
      }

      const strictProbe = stripNarrativeDraftLeak(mergedContent);
      if (strictFinalOnly && (!strictProbe || strictProbe.length < 120)) {
        throw new Error('Detected draft/meta leakage in output');
      }
      if (finishReason === 'length' && mergedContent.length < 120) {
        throw new Error('Truncated content');
      }

      console.log(
        `[AI][${label}] model=${model} attempt ${attempt}/${retries} ok in ${Date.now() - startAt}ms` +
        `${continuationCount > 0 ? ` (continued x${continuationCount})` : ''}`
      );
      return mergedContent;
    } catch (e) {
      lastError = e;
      console.log(`[AI][${label}] model=${model} attempt ${attempt}/${retries} failed: ${e.message}`);
      if (attempt < retries) {
        await sleep(400 * attempt);
        continue;
      }
    }
  }

  throw lastError || new Error('AI request failed');
}

// ========== 生成故事（帶記憶）============
async function generateStory(event, player, pet, previousChoice, memoryContext = '') {
  const startedAt = Date.now();
  DYNAMIC_WORLD.ensureDynamicWorldState(player);
  const location = player.location || '河港鎮';
  const playerName = player.name || '冒險者';
  const petName = pet?.name || '寵物';
  const petType = mapFactionLabel(pet?.type || '正派');
  const alignmentRaw = player.alignment || '正派';
  const alignment = mapFactionLabel(alignmentRaw);
  const newbieMask = isInNewbiePhase(player);
  const arcMeta = getLocationArcMeta(player);
  const islandState = ISLAND_STORY.getIslandStoryState(player, location) || null;
  const islandGuidePrompt = ISLAND_STORY.buildIslandGuidancePrompt(player, location);
  const islandStage = Number(islandState?.stage || 0);
  const islandStageCount = Math.max(1, Number(islandState?.stageCount || 8));
  const islandCompleted = Boolean(islandState?.completed);
  const islandKnowledgePrompt = buildIslandKnowledgeBoundaryPrompt(location, islandStage, islandStageCount, islandCompleted);
  const islandRoadmapPrompt = ISLAND_STORY && typeof ISLAND_STORY.buildStoryRoadmapPrompt === 'function'
    ? ISLAND_STORY.buildStoryRoadmapPrompt(location, islandStage, islandStageCount)
    : '';
  const mainStoryState = typeof MAIN_STORY.ensureMainStoryState === 'function'
    ? MAIN_STORY.ensureMainStoryState(player)
    : null;
  const truthLevel = typeof MAIN_STORY.getTruthDisclosureLevel === 'function'
    ? Number(MAIN_STORY.getTruthDisclosureLevel(player) || 1)
    : 1;
  const revealRivalName = truthLevel >= Math.max(3, RIVAL_NAME_REVEAL_ACT);
  const truthGatePrompt = typeof MAIN_STORY.getTruthGatePrompt === 'function'
    ? MAIN_STORY.getTruthGatePrompt(player, location)
    : '';
  const missionInfo = typeof MAIN_STORY.getCurrentRegionMission === 'function'
    ? MAIN_STORY.getCurrentRegionMission(player, location)
    : null;
  const missionCityTurnsNarrative = Math.max(1, Number(arcMeta?.turnsInLocation || 1));
  const missionNpcAppearTurns = Math.max(1, Number(missionInfo?.minTurnsInLocation || 5));
  const missionNarrativeRule = missionInfo && !missionInfo.keyFound
    ? (missionInfo.regionId === 'island_routes'
      ? '本區關鍵任務未完成：四巨頭尚未全滅前，不可把終章真相寫成已成立。'
      : (
        String(location || '').trim() === String(missionInfo.npcLocation || '').trim()
          ? (
            missionCityTurnsNarrative < missionNpcAppearTurns
              ? `本區關鍵任務未完成：你現在在唯一來源城市，但僅第 ${missionCityTurnsNarrative} 回合；「${missionInfo.npcName}」在第 ${missionNpcAppearTurns} 回合前不可出場。此階段只能鋪陳打聽、堵點、追查路線，不能直接見到關鍵NPC或拿到證據「${missionInfo.evidenceName}」。`
              : `本區關鍵任務未完成：你現在就在唯一來源城市，且已達第 ${missionNpcAppearTurns} 回合，可鋪陳接觸「${missionInfo.npcName}」，但本回合仍不可直接寫成證據「${missionInfo.evidenceName}」已到手。`
          )
          : `本區關鍵任務未完成：證據「${missionInfo.evidenceName}」唯一來源是 ${missionInfo.npcLocation} 的 ${missionInfo.npcName}，本回合不可寫成已取得；且敘事必須自然引導玩家往「${missionInfo.npcLocation}」移動（透過在地口供/地標/路徑線索）。`
      ))
    : '';
  const missionMoveGuidance = missionInfo && !missionInfo.keyFound && missionInfo.regionId !== 'island_routes'
    ? `關鍵NPC導引：${missionInfo.npcName}@${missionInfo.npcLocation}（未完成）。本段至少一次讓玩家明確知道「下一步要往該城市靠近」。`
    : '';
  const mainStoryBrief = MAIN_STORY.getMainStoryBrief(player);
  const loreSnippet = WORLD_LORE.getLorePromptSnippet({ revealRivalName, newbieDeception: newbieMask });
  const appraisalExamples = getAppraisalExampleLine(8);
  const rivalDisclosureRule = revealRivalName
    ? '可使用第二勢力正式名稱（Digital）描述局勢。'
    : (newbieMask
      ? '前期敘事禁止直接使用「Digital」名稱；若提到對手，必須呈現為表面友善、看似幫助玩家。'
      : '前期敘事禁止直接使用「Digital」名稱，請用「暗潮勢力／另一股勢力／不明供應鏈」表述。');
  
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座科技藏品城市';
  const locProfile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const locContext = typeof getLocationStoryContext === 'function' ? getLocationStoryContext(location) : '';
  const nearbyPoints = typeof getNearbyPoints === 'function' ? getNearbyPoints(location, 4) : [];
  const nearbyHint = nearbyPoints.length > 0 ? nearbyPoints.join('、') : '周遭地標資訊不足';
  const portalDestinations = typeof getPortalDestinations === 'function' ? getPortalDestinations(location) : [];
  const portalHint = portalDestinations.length > 0 ? portalDestinations.slice(0, 4).join('、') : '附近沒有穩定傳送門';
  const navigationTarget = String(player?.navigationTarget || '').trim();
  const navigationInstruction = navigationTarget
    ? `玩家已在地圖設定座標導航目標：${navigationTarget}。本段敘事必須讓行動朝該地點推進，並在環境描寫中呈現前進路徑。`
    : '';
  const digitalPresenceText = formatRoamingDigitalPresence(location, 2);
  const battleCadence = getBattleCadenceInfo(player);
  const battleCadenceHint = battleCadence.dueConflict
    ? '本輪是戰鬥節奏點（5/5），可把衝突推進到可交手邊緣，但仍需符合當前鋪陳。'
    : (battleCadence.nearConflict
      ? '本輪接近戰鬥節奏點（4/5），可升高張力，先鋪備戰/追蹤/對峙。'
      : '本輪非強制衝突點，優先維持線索連續與地區推進。');
  const wantedPressure = getWantedPressure(player);
  const dynamicWorldContext = DYNAMIC_WORLD.buildDynamicWorldContext(player, location, { playerLang: player?.language || 'zh-TW' });
  const nearbyHostile = getNearbyHostileNpcSummary(location, 3);
  const nearbyHostileHint = nearbyHostile.count > 0 ? nearbyHostile.names.join('、') : '（附近暫無明確敵對 NPC）';
  const npcs = RENAISS_NPCS[location] || [];
  
  // 檢查 NPC 狀態
  let npcStatusText = '當地的人：';
  for (const npc of npcs) {
    const alive = player.isNPCAlive ? player.isNPCAlive(npc.name) : true;
    if (alive) {
      npcStatusText += `✅${npc.name}(${npc.title})、`;
    } else {
      npcStatusText += `❌${npc.name}(重傷休養中)、`;
    }
  }
  npcStatusText = npcStatusText.slice(0, -1); // 移除最後的頓號
  
  const previousAction =
    previousChoice?.choice ||
    previousChoice?.name ||
    player?.generationState?.sourceChoice ||
    '開始探索';
  const previousActionCode = String(previousChoice?.action || '').trim();
  const previousOutcome = canonicalizeKingCodenamesText(
    summarizeContext(
      previousChoice?.outcome || previousChoice?.desc || '',
      360,
      4
    )
  );
  const pendingLoot = previousChoice?.pendingLoot && typeof previousChoice.pendingLoot === 'object'
    ? previousChoice.pendingLoot
    : null;
  const turnMoveSummary = String(previousChoice?.turnMoveSummary || '').trim();
  const pendingLootName = String(pendingLoot?.name || '').trim();
  const pendingLootRarity = String(pendingLoot?.rarity || '').trim() || '普通';
  const pendingLootValue = Math.max(1, Math.floor(Number(pendingLoot?.value || 0)));
  const pendingLootCategory = String(pendingLoot?.category || '').trim();
  const pendingLootSection = pendingLootName
    ? `\n【本回候選戰利品（由敘事決定是否落地）】\n` +
      `名稱：${pendingLootName}\n` +
      `稀有度：${pendingLootRarity}\n` +
      `參考鑑價：${pendingLootValue} Rns 代幣\n` +
      `${pendingLootCategory ? `類別：${pendingLootCategory}\n` : ''}` +
      `若本回合確實取得，請在故事最後一行加：🧰 掉寶標記: ${pendingLootName}`
    : '';
  const lootConsistencySection = pendingLootName
    ? `\n【掉寶一致性硬規則（必須遵守）】\n` +
      `- ${pendingLootName} 只有在正文明確完成「來源揭露 -> 玩家取得動作 -> 收進手上/行囊」三步時，才算真正入手。\n` +
      `- 只看到封存艙、抱著封存艙、猜測艙內有東西、聽到別人提到、準備交換、打算取得，都不算入手。\n` +
      `- 若本回合沒有真的入手 ${pendingLootName}，禁止輸出「🧰 掉寶標記: ${pendingLootName}」，也不要把它寫成已經在玩家手上。\n` +
      `- 錯誤示例：只寫「抱著封存艙」或「察覺艙內可能有 ${pendingLootName}」，最後卻輸出掉寶標記。\n` +
      `- 正確示例：先寫打開/取出來源，再寫玩家把 ${pendingLootName} 拿到手或收進行囊，最後一行才輸出掉寶標記。`
    : '';
  const turnMoveSection = turnMoveSummary
    ? `\n【本回移動摘要（供敘事連貫參考）】\n${turnMoveSummary}`
    : '';
  
  // 保留玩家原始名稱，避免模型把玩家名誤當其他 NPC。
  let safePlayerName = playerName.trim();
  if (!safePlayerName) safePlayerName = '冒險者';
  
  // 根據玩家語言設定決定輸出語言
  const playerLang = player.language || 'zh-TW';
  const langInstruction = getAiLanguageDirective(playerLang, 'narrate');
  const collectibleCulturePrompt = getCollectibleCulturePrompt(location, playerLang);
  const locationWeatherProfile = getLocationWeatherProfile(location);
  const locationWeatherPrompt = getLocationWeatherPrompt(location, playerLang);
  
  // 上一段故事摘要（提升連貫性）
  const previousStorySummary = canonicalizeKingCodenamesText(
    summarizeContext(player.currentStory || '', 520, 8)
  );
  const previousStorySection = previousStorySummary
    ? `\n【前一段故事（重點）】\n${previousStorySummary}`
    : '';
  const isOpeningBeat = (
    Number(player?.storyTurns || 0) <= 0 &&
    !String(player?.currentStory || '').trim() &&
    !previousChoice
  );
  const isPortalArrivalBeat = ['portal_jump_followup', 'device_jump_followup'].includes(previousActionCode);
  const canLeadWithWeather = isOpeningBeat || isPortalArrivalBeat;
  const weatherLeadRule = canLeadWithWeather
    ? `本回合屬於${isOpeningBeat ? '開局' : '傳送抵達'}段落，可用天候作為開場主句，但需在 1-2 句內迅速回到人物行動。`
    : '非開局且非傳送抵達時，禁止用「天氣/雨絲/晴空/風雪」當開場主句；必須先從人物動作、對話或現場事件切入，再把天候融入行動細節。';

  // 記憶上下文
  const focusedMemory = canonicalizeKingCodenamesText(
    summarizeContext(memoryContext, 980, 12)
  );
  const memorySection = focusedMemory ? `\n【玩家之前的足跡（重點）】\n${focusedMemory}` : '';
  const inventorySection =
    `\n【玩家背包與可用物件（唯一合法來源）】\n` +
    `${buildInventoryContextText(player, playerLang)}`;
  const npcDialogueEvidence = getRecentNpcDialogueEvidence(player, 12, {
    location,
    queryText: [previousAction, previousStorySummary, focusedMemory].filter(Boolean).join('\n')
  });
  const npcDialogueSection =
    `\n【可驗證 NPC 對話原句（僅以下內容可被回憶為「曾說過」）】\n` +
    `${buildNpcDialogueEvidenceText(npcDialogueEvidence, playerLang)}`;
  const mainlinePins = getActiveMainlineForeshadowPins(player, 6, {
    location,
    queryText: [previousAction, previousStorySummary, focusedMemory].filter(Boolean).join('\n')
  });
  const mainlinePinsSection =
    `\n【主線鋪陳保留（必要延續，但非每句都提）】\n` +
    `${buildMainlineForeshadowText(mainlinePins, playerLang)}`;
  const openingBeatSection = isOpeningBeat
    ? `\n【開局敘事硬規則（必須遵守）】
- 這是玩家第一次踏入世界的開場段落，必須有「剛開局」氛圍。
- 開頭 1-2 段要自然交代主角自我定位：你是誰、為何來到 Renaiss 海域、此刻第一個短目標是什麼。
- 不要像履歷或系統說明，必須寫成故事內心與現場感受。
- 可以用第一人稱或第三人稱，但主角身份描述要明確，不能只叫「冒險者」帶過。`
    : '';
  const mainlineBridgeLock = resolveMainlineBridgeLock(player, previousChoice);
  const mainlineBridgeSection = mainlineBridgeLock
    ? `\n【主線橋接鎖定（本回合必須先落地）】
地點：${mainlineBridgeLock.location || location}
目標：${mainlineBridgeLock.goal}
進度：${mainlineBridgeLock.progress}
來源行動：${mainlineBridgeLock.sourceChoice || previousAction}
要求：開場 1-2 段先把這個目標落到可執行場景，再往外延展。`
    : '';
  
  const prompt = `你是 Renaiss 世界的原創敘事引擎，風格是「科技收藏 + 夥伴協作 + 區域事件」。
禁止武俠腔、禁止借用任何既有作品專有名詞或角色名。

【當前場景】
位置：${location} - ${locDesc}
區域資訊：${locContext || `${locProfile?.region || '未知'} / 難度D${locProfile?.difficulty || 3}`}
收藏文明口味：
${collectibleCulturePrompt}
城市天候主調：
${locationWeatherPrompt}
地區篇章進度：第 ${Math.max(1, arcMeta.turnsInLocation)} / ${arcMeta.targetTurns} 段（階段：${arcMeta.phase}）
已完成跨區篇章：${arcMeta.completedLocations}
島嶼劇情狀態：stage ${islandStage}/${islandStageCount}｜${islandCompleted ? '已完成（開放世界）' : '進行中（優先引導）'}
戰鬥節奏：第 ${battleCadence.step}/${battleCadence.span} 格｜${battleCadenceHint}
通緝熱度：${wantedPressure}（>=${WANTED_AMBUSH_MIN_LEVEL} 時，敵對勢力更可能主動接近）
動態世界狀態：${dynamicWorldContext?.summary || '（無）'}
附近敵對 NPC：${nearbyHostileHint}
附近可互動地點：${nearbyHint}
附近傳送門可通往：${portalHint}
導航目標：${navigationTarget || '（未設定）'}
附近可疑勢力：${digitalPresenceText}
玩家：${safePlayerName}
寵物：${petName}(${petType})
陣營：${alignment}
主線進度：${mainStoryBrief}
世界設定：
${loreSnippet}
可被鑑定的物件示例：${appraisalExamples}
封存艙尺寸規格：便攜小型艙體（約小背包大小，可單人攜行）
勢力揭露規則：${rivalDisclosureRule}
語言設定：${playerLang}
${npcStatusText}
${previousStorySection}
${memorySection}
${inventorySection}
${npcDialogueSection}
${mainlinePinsSection}
${islandGuidePrompt ? `\n${islandGuidePrompt}` : ''}
${islandKnowledgePrompt ? `\n${islandKnowledgePrompt}` : ''}
${truthGatePrompt ? `\n${truthGatePrompt}` : ''}
${missionNarrativeRule ? `\n【關鍵任務敘事規則】\n${missionNarrativeRule}` : ''}
${missionMoveGuidance ? `\n【關鍵NPC移動導引】\n${missionMoveGuidance}` : ''}
${islandRoadmapPrompt ? `\n${islandRoadmapPrompt}` : ''}
${navigationInstruction ? `\n【導航約束】\n${navigationInstruction}` : ''}
${openingBeatSection}
${mainlineBridgeSection}
${lootConsistencySection}

【上一個行動】
動作代碼：${previousActionCode || '（無）'}
${previousAction}
${previousOutcome ? `\n【上一個行動結果（必須銜接）】\n${previousOutcome}` : ''}
${turnMoveSection}
${pendingLootSection}

【任務】
${langInstruction}，講述玩家「${safePlayerName}」執行「${previousAction}」後發生了什麼。故事目標長度約 400-500 字。要點：
1. 有具體的場景（光線、聲音、氣味、溫度、觸感）
2. 有NPC或環境的互動
3. 強調原創世界觀：收藏品真偽鑑識、封存艙/修復台、來源線索、夥伴協作
3a. 天候「${locationWeatherProfile?.name || '晴空'}」要融入角色行動與互動（路線、接觸方式、風險判斷），不要每回合都把天氣寫成固定開場句
3b. ${weatherLeadRule}
4. 故事要有懸念，讓人想繼續看
5. 嚴格使用對應語言，${langInstruction.replace('請用', '全部')}
6. 若語言設定為 zh-TW，嚴禁使用簡體字
6a. 若語言設定為 ko，整段故事必須是自然韓文敘事，禁止以中文或英文句子作為主體內容
7. 若【玩家之前的足跡】提到同地點人物/衝突/情緒，優先做出連貫呼應（例如老闆記得你、壞人記得你、你記得天空與環境）
8. 若角色說出抽象口號（例如「真實的代價」），必須在接下來 1-2 句交代具體含義（要付出什麼代價）
9. 禁止出現武俠相關詞：江湖、俠客、門派、武功、內力、打坐、修煉等
10. 盡量避免金融術語：估值、報價、收益率、資本、套利、金融風暴；改用收藏與科技語彙
11. 勢力敘事必須遵守「勢力揭露規則」
12. 若仍在新手期，對手勢力要先以友善包裝出場（如優惠、協助、照顧新手），不能直接反派口吻
13. 每個地區要有自己的小篇章（起承轉合），不可在同一地區直接完結整個世界故事
14. 若「地區篇章進度」接近完成，結尾要自然帶出傳送門或跨區線索，引導前往其他島/區域，但不要強制瞬移
15. 開場第一句必須直接承接「上一個行動」，不能突然切到無關場景
16. 不可憑空補出前文未出現的關鍵道具/代碼/人物關係（例如突然出現座標卡）；若要引入新線索，必須在當下情境交代它如何被發現
16a. 若前文只寫「攜帶封存艙/抱著封存艙」但沒有「打開/撬開/開艙檢視」動作，禁止突然揭露艙內具體物件；要揭露內容前，必須先寫出開艙過程
17. 若使用「線索」「交易」等抽象詞，必須指向具體對象（誰提供、哪個物件、哪個位置）
18. 若寫「某 NPC 曾說過／提醒過」且使用引號，內容必須逐字對得上【可驗證 NPC 對話原句】；找不到就禁止寫引號引用
19. 回憶 NPC 提醒時，盡量補上當時場景（例如在哪個地點發生）
20. 若【上一個行動結果】包含移動（例如從 A 到 B／抵達 B），開場 1-2 句必須寫出過場與抵達，不可直接瞬間換景
21. 角色「手中持有／使用／遞出／展示」的物件，必須來自【玩家背包與可用物件】；若清單沒有，最多只能寫成「想取得/去購買/去詢問」
22. 禁止憑空產生關鍵道具（通行卡、座標碼、專用藥劑、啟動器等）；若劇情需要，必須先在當下場景明確寫出取得動作
22a. 若【上一個行動結果】已明確寫出「打開封存艙並取得某物」，後續不得再把該物寫成仍在艙內未知狀態；只能寫成已在手上或已收進行囊
23. 若本回合為開局段落，必須明確完成主角身份與動機介紹，且語氣要像故事開場而非條列設定
24. 凡出現引號對話，必須標明發話者；若是未命名角色，請給固定臨時代號（例如：神秘女子A、神秘女子B）並在後續沿用
25. 若【主線鋪陳保留】有內容，至少延續其中 1 個重點，但只在相關段落自然呼應，不要每句都硬提
26. 若「島嶼劇情狀態」顯示進行中，優先推進該地在地衝突與線索，不要跳過島內收束直接跨區
27. 若「島嶼劇情狀態」顯示已完成，移除硬引導語氣，改為開放世界敘事
28. 「玩家：${safePlayerName}」是主角唯一名稱，禁止把同名當成其他 NPC 或通訊器另一端人物；若要新增角色，必須使用不同名字
29. 避免地理刻板描寫與舊套路意象（例如沙漠駱駝、武林門派式修行），改以「收藏品真偽、供應鏈、滲透、證據」推進劇情
30. 嚴格遵守【島嶼知識邊界】：未解鎖段落不可提前揭露為已知真相，只能做模糊預告
30a. 若【跨島真相邊界】指定「唯一來源 NPC + 城市」，只有在該 NPC 且該城市才能寫成「已取得關鍵證據」；其他情況最多只能寫成傳聞或疑點
31. 戰鬥節奏僅作敘事節拍參考：第 4/5 可拉高張力、第 5/5 可推向衝突，但不可硬跳不連貫場景
32. 若通緝熱度 >= ${WANTED_AMBUSH_MIN_LEVEL}，本回合正文必須至少一次讓敵對勢力主動接近，且明確交代「誰靠近、如何接觸」
33. 若要讓 NPC 主動出現，必須在當前地點或附近可互動地點內合理登場，不可跨區瞬移
34. 高通緝壓迫需採「漸進式」：先可疑視線/尾隨，再試探接觸，最後才進入正面衝突；不可一開場就連續跳多名追兵
35. 若提到「可鑑定品」，優先使用「可被鑑定的物件示例」中的物件，避免憑空造出不合世界觀的品項
36. 封存艙一律描寫為便攜小型艙體（約小背包大小），禁止寫成人體尺寸或大型貨櫃
37. 若人物攜帶封存艙，請寫成可單人抱持/背負的尺度，不可描述為巨型艙體
38. 若存在【主線橋接鎖定】，開場 1-2 段必須優先承接該目標，且給出「現在就能做」的行動落點
39. 主線橋接鎖定只能當「本回合先落地」的方向，不可直接照抄成模板句或條列宣告
40. 若「動作代碼」是 portal_jump_followup 或 device_jump_followup，開場必須採三段銜接：先交代原地點最後情勢（1-2句）→ 再寫啟動傳送與過程（1-2句）→ 最後落在新地點且立刻有可互動對象/環境回應（至少2句），禁止只寫「已抵達」空句
41. 若有【本回候選戰利品】，先判斷本回合是否真的完成「來源揭露 -> 玩家取得動作 -> 收進手上/行囊」三步；缺任何一步都視為未取得。
42. 若物品仍在封存艙、貨架、地面、NPC 手上，或只是看見/聽說/推測/準備交換/打算取得，全部視為未取得。
43. 只有在正文至少有一句同時滿足「明確出現物件名稱 + 玩家取得動作 + 玩家持有結果」時，才允許最後一行輸出「🧰 掉寶標記: 寶物名稱」。
44. 若本回合沒有取得任何寶物，禁止輸出「🧰 掉寶標記」；不要因為有候選戰利品就硬塞標記。
45. 即使沒有候選戰利品，若你判斷本回合劇情自然會拿到寶物，也可以新增一個合理寶物；但必須符合地區與場景，不可突兀亂給。
46. 若有【本回移動摘要】，可在故事內容自然描述，不要輸出機械標記格式。
47. 禁止輸出任何「🧾 回合標記」或同義的系統欄位行；僅允許第43條的「🧰 掉寶標記」作為隱藏結算標記。
48. 當地 NPC 名稱必須逐字使用【當地的人】中的原名，禁止自行改寫成別名、前綴職稱或擴寫稱呼（例如只能寫既定原名，不能自行加前綴或換代號）。
49. 若某個 NPC 不在【前一段故事】、【上一個行動】或【上一個行動結果】中，則他本回合第一次出場時，必須先交代「他從哪裡出現／你怎麼注意到他」；禁止一開場就把他寫成已經在身邊接話很久的人。

直接開始講：`;

  // AI-only：固定使用 MiniMax-M2.5；不使用本地假故事
  const modelCandidates = [MINIMAX_MODEL];
  const uniqCandidates = modelCandidates.filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  for (let i = 0; i < uniqCandidates.length; i++) {
    const model = uniqCandidates[i];
    let repairIssues = [];
    try {
      for (let pass = 0; pass < 2; pass += 1) {
        const promptWithRepair = repairIssues.length > 0
          ? `${prompt}\n\n【上一個候選稿被退回，請完整重寫並修正以下問題】\n- ${repairIssues.join('\n- ')}`
          : prompt;
        const story = await callAI(promptWithRepair, 0.95, {
          label: i === 0 ? 'generateStory.fast' : 'generateStory.fallback',
          model,
          maxTokens: 1600,
          timeoutMs: STORY_TIMEOUT_MS,
          retries: STORY_GEN_RETRIES,
          strictFinalOnly: true,
          continueOnLength: true,
          maxContinuations: 1,
          unlimitedTimeout: false,
          unlimitedMaxTokens: false
        });
        let normalizedStory = normalizeOutputByLanguage(stripNarrativeDraftLeak(story), playerLang);
        normalizedStory = canonicalizeKingCodenamesText(normalizedStory);
        normalizedStory = sanitizeStoryTurnMarker(normalizedStory);
        if (!normalizedStory || normalizedStory.length < 120) {
          throw new Error('Story too short');
        }

        const continuityIssues = validateStoryNpcContinuity(normalizedStory, {
          previousStorySummary,
          previousAction,
          previousOutcome,
          npcs
        });
        if (continuityIssues.length > 0) {
          repairIssues = continuityIssues;
          console.warn(`[Storyteller] generateStory continuity retry: ${continuityIssues.join(' | ')}`);
          if (pass < 1) continue;
          throw new Error(continuityIssues[0]);
        }

        normalizedStory = ensureWantedImmersionNarrative(normalizedStory, {
          wantedPressure,
          minLevel: WANTED_AMBUSH_MIN_LEVEL,
          playerLang,
          hostileNames: nearbyHostile?.names || []
        });
        const languageIssue = getLanguageComplianceIssue(normalizedStory, playerLang, 'story');
        if (languageIssue) {
          repairIssues = [languageIssue];
          console.warn(`[Storyteller] generateStory language retry: ${languageIssue}`);
          if (pass < 1) continue;
          throw new Error(languageIssue);
        }

        if (normalizedStory.length > 2600) {
          recordAIPerf('story', Date.now() - startedAt);
          return normalizedStory.substring(0, 2600) + '...[故事過長已截斷]';
        }
        recordAIPerf('story', Date.now() - startedAt);
        console.log(`[AI][generateStory] total ${Date.now() - startedAt}ms`);
        return normalizedStory;
      }
    } catch (e) {
      console.error(`[Storyteller] generateStory model=${model} 失敗:`, e.message);
    }
  }

  const fallbackStory = normalizeOutputByLanguage(
    buildDeterministicFallbackStory({
      player,
      pet,
      previousAction,
      previousOutcome,
      previousStorySummary,
      playerLang,
      location
    }),
    playerLang
  );
  let safeFallbackStory = canonicalizeKingCodenamesText(fallbackStory);
  safeFallbackStory = sanitizeStoryTurnMarker(safeFallbackStory);
  safeFallbackStory = ensureWantedImmersionNarrative(safeFallbackStory, {
    wantedPressure,
    minLevel: WANTED_AMBUSH_MIN_LEVEL,
    playerLang,
    hostileNames: nearbyHostile?.names || []
  });
  recordAIPerf('story', Date.now() - startedAt);
  console.warn('[Storyteller] generateStory 使用本地保底故事，避免中斷流程');
  return safeFallbackStory;
}

// ========== AI 生成選項（帶風險標籤+更具體）============
async function generateChoicesWithAI(player, pet, previousStory, memoryContext = '') {
  const startedAt = Date.now();
  DYNAMIC_WORLD.ensureDynamicWorldState(player);
  const newbieMask = isInNewbiePhase(player);
  const arcMeta = getLocationArcMeta(player);
  const location = player.location || '河港鎮';
  const locationPlaystyle = getLocationPlaystyleProfile(location);
  const locationPlaystylePrompt = getLocationPlaystylePromptBlock(location, player?.language || 'zh-TW');
  const islandState = ISLAND_STORY.getIslandStoryState(player, location) || null;
  const islandGuidePrompt = ISLAND_STORY.buildIslandGuidancePrompt(player, location);
  const islandStage = Number(islandState?.stage || 0);
  const islandStageCount = Math.max(1, Number(islandState?.stageCount || 8));
  const islandCompleted = Boolean(islandState?.completed);
  const islandKnowledgePrompt = buildIslandKnowledgeBoundaryPrompt(location, islandStage, islandStageCount, islandCompleted);
  const islandRoadmapPrompt = ISLAND_STORY && typeof ISLAND_STORY.buildStoryRoadmapPrompt === 'function'
    ? ISLAND_STORY.buildStoryRoadmapPrompt(location, islandStage, islandStageCount)
    : '';
  const roadmap = ISLAND_STORY && typeof ISLAND_STORY.getStoryRoadmap === 'function'
    ? ISLAND_STORY.getStoryRoadmap(location, islandStageCount)
    : [];
  const safeStage = Math.max(1, Number(islandStage || 1));
  const stageIndex = Math.max(0, Math.min(Math.max(0, roadmap.length - 1), safeStage - 1));
  const stageGoal = String((Array.isArray(roadmap) && roadmap[stageIndex]) || '').trim();
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座科技藏品城市';
  const locProfile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const locContext = typeof getLocationStoryContext === 'function' ? getLocationStoryContext(location) : '';
  const nearbyPoints = typeof getNearbyPoints === 'function' ? getNearbyPoints(location, 4) : [];
  const nearbyHint = nearbyPoints.length > 0 ? nearbyPoints.join('、') : '周遭地標資訊不足';
  const portalDestinations = typeof getPortalDestinations === 'function' ? getPortalDestinations(location) : [];
  const portalHint = portalDestinations.length > 0 ? portalDestinations.slice(0, 4).join('、') : '附近沒有穩定傳送門';
  const connectedLocations = typeof getConnectedLocations === 'function' ? getConnectedLocations(location) : [];
  const connectedHint = connectedLocations.length > 0 ? connectedLocations.join('、') : '（本城無明確相鄰城市資料）';
  const navigationTarget = String(player?.navigationTarget || '').trim();
  const digitalPresenceText = formatRoamingDigitalPresence(location, 2);
  const battleCadence = getBattleCadenceInfo(player);
  const wantedPressure = getWantedPressure(player);
  const dynamicWorldContext = DYNAMIC_WORLD.buildDynamicWorldContext(player, location, { playerLang: player?.language || 'zh-TW' });
  const nearbyHostile = getNearbyHostileNpcSummary(location, 3);
  const nearbyHostileHint = nearbyHostile.count > 0 ? nearbyHostile.names.join('、') : '（附近暫無明確敵對 NPC）';
  const cadenceRequirement = battleCadence.dueConflict
    ? `本回合為戰鬥節奏點（第 ${battleCadence.step}/${battleCadence.span} 格），5 個選項中至少 1 個要是衝突相關，且可直接進入戰鬥。`
    : (battleCadence.nearConflict
      ? `本回合接近戰鬥節奏點（第 ${battleCadence.step}/${battleCadence.span} 格），至少 1 個選項要是衝突預備（追蹤/備戰/對峙/攔截）。`
      : `本回合為節奏第 ${battleCadence.step}/${battleCadence.span} 格，衝突選項非硬性，但若劇情有威脅需自然提供。`);
  const wantedRequirement = wantedPressure >= WANTED_AMBUSH_MIN_LEVEL
    ? `玩家通緝熱度 ${wantedPressure}（>=${WANTED_AMBUSH_MIN_LEVEL}）：若附近有敵對 NPC，至少 1 個選項可表現「對方主動接近/尾隨/試探」。`
    : `玩家通緝熱度 ${wantedPressure}：可選擇不主動引戰。`;
  const petName = pet?.name || '寵物';
  const playerName = player.name || '冒險者';
  const npcs = RENAISS_NPCS[location] || [];
  
  // 檢查 NPC 狀態
  let npcStatusText = '';
  for (const npc of npcs) {
    const alive = player.isNPCAlive ? player.isNPCAlive(npc.name) : true;
    if (alive) {
      npcStatusText += `${npc.name}、`;
    }
  }
  
  const playerLang = player?.language || 'zh-TW';
  const langCode = normalizeLangCode(playerLang || 'zh-TW');
  const langInstruction = getAiLanguageDirective(playerLang, 'output');
  const choiceValidationPasses = langCode === 'ko'
    ? Math.max(2, CHOICE_VALIDATION_PASSES)
    : CHOICE_VALIDATION_PASSES;
  const immediateBattleMarker = langCode === 'ko'
    ? '（전투 진입）'
    : (langCode === 'en' ? '(Immediate battle)' : (langCode === 'zh-CN' ? '（会进入战斗）' : '（會進入戰鬥）'));
  const collectibleCulturePrompt = getCollectibleCulturePrompt(location, playerLang);
  const locationWeatherProfile = getLocationWeatherProfile(location);
  const locationWeatherPrompt = getLocationWeatherPrompt(location, playerLang);
  const truthGatePrompt = typeof MAIN_STORY.getTruthGatePrompt === 'function'
    ? MAIN_STORY.getTruthGatePrompt(player, location)
    : '';
  const missionInfo = typeof MAIN_STORY.getCurrentRegionMission === 'function'
    ? MAIN_STORY.getCurrentRegionMission(player, location)
    : null;
  const missionInCity = Boolean(
    missionInfo &&
    !missionInfo.keyFound &&
    String(location || '').trim() === String(missionInfo.npcLocation || '').trim()
  );
  const missionCityTurns = missionInCity ? Math.max(1, Number(arcMeta?.turnsInLocation || 1)) : 0;
  const localTurns = Math.max(1, Number(arcMeta?.turnsInLocation || 1));
  const missionNpcAppearTurnsForChoices = Math.max(1, Number(missionInfo?.minTurnsInLocation || 5));
  const missionApproachRule = (() => {
    if (!missionInfo || missionInfo.keyFound) return '';
    if (missionInfo.regionId === 'island_routes') {
      return '本區關鍵任務未完成：四巨頭未全滅前，只能鋪陳追蹤或備戰，不能寫成已拿到終章核心憑證。';
    }
    if (missionInCity) {
      if (missionCityTurns < missionNpcAppearTurnsForChoices) {
        const remainTurns = Math.max(0, missionNpcAppearTurnsForChoices - missionCityTurns);
        return `你已在任務城市（第${missionCityTurns}回合）：關鍵NPC「${missionInfo.npcName}」在第 ${missionNpcAppearTurnsForChoices} 回合前不可直接出現（還需 ${remainTurns} 回合）。本回合至少 2 個選項要做前置追查（口供、堵點、追蹤路線、交易時間、常去地點），且不得直接寫成拿到「${missionInfo.evidenceName}」。`;
      }
      if (missionCityTurns === missionNpcAppearTurnsForChoices) {
        return `你已在任務城市（第${missionCityTurns}回合）：本回合可讓「${missionInfo.npcName}」首次出現，並提供可接觸的選項；但仍不可直接寫成已取得「${missionInfo.evidenceName}」。`;
      }
      return `你已在任務城市（第${missionCityTurns}回合）：本回合至少 1 個選項可直接接觸「${missionInfo.npcName}」或其代理人；仍不可直接寫成已取得「${missionInfo.evidenceName}」。`;
    }
    if (localTurns <= 2) {
      return `你剛到當前城市（第${localTurns}回合）：本回合禁止直接輸出「前往${missionInfo.npcLocation}」或 move_to=${missionInfo.npcLocation}；至少 2 個選項要聚焦在地觀察/打聽/驗證（先理解城市局勢），僅可用「為前往做準備」方式間接推進。`;
    }
    if (localTurns === 3) {
      return `你在當前城市第3回合：可有 1 個選項開始規劃前往「${missionInfo.npcLocation}」，但優先仍是本地收束線索；避免整組選項直接趕路。`;
    }
    return `你尚未到任務城市：本回合至少 1 個選項要透過在地線索把路徑推向「${missionInfo.npcLocation}」，並讓玩家看得懂「下一步應往該城市移動」；不可在當地直接拿到「${missionInfo.evidenceName}」。`;
  })();
  const missionChoiceRule = missionInfo && !missionInfo.keyFound
    ? missionApproachRule
    : '';
  const navigationPacingRule = (() => {
    if (!navigationTarget) return '';
    const target = String(navigationTarget || '').trim();
    if (!target || target === String(location || '').trim()) {
      return `玩家已在地圖設定導航目標「${target || location}」，至少 1 個選項要讓玩家感覺到正在接近目標。`;
    }
    if (localTurns <= 2) {
      return `玩家已在地圖設定導航目標「${target}」，但你剛到新城市（第${localTurns}回合）：本回合禁止直接「前往${target}」與 move_to=${target}；至少 1 個選項改成前置準備（問路、補給、查路線、聯絡中介）。`;
    }
    if (localTurns === 3) {
      return `玩家已在地圖設定導航目標「${target}」，第3回合可開始規劃移動；最多 1 個選項可直接前往，其餘維持本地推進。`;
    }
    return `玩家已在地圖設定導航目標「${target}」，至少 1 個選項必須是朝該地點推進的具體行動。`;
  })();
  
  const focusedMemory = canonicalizeKingCodenamesText(summarizeContext(memoryContext, 560, 8));
  const memorySection = focusedMemory ? `\n【玩家之前的足跡（重點）】\n${focusedMemory}` : '';
  const fullStoryText = canonicalizeKingCodenamesText(String(previousStory || '').trim());
  const storyFocus = buildStoryFocusForChoices(fullStoryText || '');
  const kingCodenameMentioned = DIGITAL_KING_CODENAME_REGEX.test(fullStoryText);
  const kingSpreadRule = kingCodenameMentioned
    ? `若本段已提到高層代號（${DIGITAL_KING_CODENAMES.join('/')}），最多 1 個選項可直接追該代號；至少 3 個選項要維持當前地點可立即執行的行動。`
    : '';
  const sourceChoiceText = String(player?.generationState?.sourceChoice || '').trim();
  const directedDestination = extractDirectedDestinationFromStoryTail(fullStoryText, sourceChoiceText);
  const directedDestinationFirstHop = directedDestination && directedDestination !== location
    ? (typeof findLocationPath === 'function'
      ? String((findLocationPath(location, directedDestination) || [])[1] || directedDestination).trim()
      : directedDestination)
    : '';
  const destinationContinuityRule = directedDestination
    ? (directedDestinationFirstHop && directedDestinationFirstHop !== directedDestination
      ? `故事結尾已明確指向「${directedDestination}」：5 個選項中至少 1 個要直接銜接「先往${directedDestinationFirstHop}」或「為前往${directedDestination}準備」，不可整組忽略此去向。`
      : `故事結尾已明確指向「${directedDestination}」：5 個選項中至少 1 個要直接銜接「前往${directedDestination}」或「為前往${directedDestination}準備」，不可整組忽略此去向。`)
    : '若結尾明確提到下一站/下一個城市，至少 1 個選項要直接承接該去向，不能只給平行支線。';
  const routeConstraintRule = (() => {
    const base = `目前城市是「${location}」，相鄰可直達城市只有：${connectedHint}。一般移動選項的 move_to 只能填這些相鄰城市；若真正目標更遠，本回合 move_to 必須改成第一跳城市。`;
    if (!navigationTarget) return base;
    const navFirstHop = typeof findLocationPath === 'function'
      ? String((findLocationPath(location, navigationTarget) || [])[1] || navigationTarget).trim()
      : navigationTarget;
    if (navFirstHop && navFirstHop !== navigationTarget) {
      return `${base} 目前導航目標是「${navigationTarget}」，若要推進，這回合真正可移動的第一跳是「${navFirstHop}」。`;
    }
    return `${base} 目前導航目標是「${navigationTarget}」，若要移動可直接以該城市作為 move_to。`;
  })();
  const memoryRelevanceRule = '使用記憶內容時，需符合「現在場景可作用」。允許「突然想起過去某句話/某人物提醒」作為起點，但必須寫成可執行路徑（回想→驗證來源→前往對應地點或對象）；若該人物此刻不在場，禁止寫成立即當面互動。';
  const npcRelevanceRule = '禁止憑空新增未鋪陳敵對稱呼（例如匿名滲透者、可疑隊伍）；除非故事全文、當地NPC或附近敵對NPC已出現對應依據。';
  const pendingConflict = player?.pendingConflictFollowup && typeof player.pendingConflictFollowup === 'object'
    ? player.pendingConflictFollowup
    : null;
  const currentTurn = Math.max(0, Number(player?.storyTurns || 0));
  const pendingConflictActive = Boolean(
    pendingConflict?.active &&
    currentTurn >= Number(pendingConflict?.triggerTurn || 0) &&
    currentTurn <= Number(pendingConflict?.expireTurn || 0)
  );
  const pendingConflictName = String(pendingConflict?.displayName || '').trim();
  const pendingConflictRule = pendingConflictActive
    ? `你在上一輪採取了激進行動，衝突必須延續：本回合 5 個選項中，至少 1 個要直接對上「${pendingConflictName || '剛才出現的人'}」並可立刻進入戰鬥；不可改寫成匿名敵人或系統詞。`
    : '';
  const dynamicPlan = DYNAMIC_WORLD.chooseDynamicEventPlan(player, location, {
    storyTurn: Math.max(0, Number(player?.storyTurns || 0)),
    storyText: fullStoryText
  });
  const dynamicArchetypeHint = String(dynamicPlan?.archetype || '').trim();
  const dynamicActionHint = dynamicArchetypeHint ? mapDynamicArchetypeToAction(dynamicArchetypeHint) : '';
  const dynamicThemeHint = String(dynamicPlan?.hint || '').trim();
  const dynamicInjectRule = dynamicPlan?.inject
    ? `20. 本回合必須在 5 個選項中內建 1 個「動態事件選項」，並在該筆 JSON 填上 dynamicEvent={"archetype":"${dynamicArchetypeHint || 'smuggling'}","phase":"offered","intensity":${Math.max(1, Math.min(5, Number(dynamicPlan?.intensity || 2) || 2))},"chainHint":"一句短提示"}；該選項必須與當前場景因果相連，不可模板句。建議 action=${dynamicActionHint || 'explore'}。${dynamicThemeHint ? `主題提示：${dynamicThemeHint}。` : ''}`
    : '20. 非必要時可不輸出 dynamicEvent；若輸出，最多 1 筆，且必須與當前場景因果相連。';
  const recentChoiceText = Array.isArray(player?.recentChoiceHistory)
    ? player.recentChoiceHistory
      .slice(-5)
      .map((item, idx) => {
        const action = String(item?.action || 'unknown');
        const locationHint = String(item?.location || '').trim();
        const choiceLine = String(item?.choice || '').trim();
        return `${idx + 1}. [${action}] ${choiceLine}${locationHint ? ` @${locationHint}` : ''}`;
      })
      .filter(Boolean)
      .join('\n')
    : '';
  const storyAnchors = extractStoryAnchors(fullStoryText, npcs, location, sourceChoiceText);
  const anchorText = storyAnchors.length > 0 ? storyAnchors.join('、') : '（無）';
  const storageCarrierByOthers = (
    /(?:對方|他|她|商人|攤販|中間人|守衛|黑影商人|匿名滲透者|someone|enemy|merchant)[^。；\n]{0,24}(?:抱著|抱着|背著|背着|提著|提着|攜帶|携带|拿著|拿着|手(?:上|中|裡|里))[^。；\n]{0,16}封存[艙舱倉藏函]/u.test(fullStoryText) ||
    /封存[艙舱倉藏函][^。；\n]{0,16}(?:被|由)?(?:對方|他|她|商人|攤販|中間人|守衛|黑影商人|匿名滲透者|someone|enemy|merchant)[^。；\n]{0,16}(?:抱著|抱着|背著|背着|提著|提着|攜帶|携带|拿著|拿着|手(?:上|中|裡|里))/u.test(fullStoryText)
  );
  const needsStorageHeistRule = Boolean(storageCarrierByOthers);
  const storageHeistPromptRule = needsStorageHeistRule
    ? [
      '21. 僅當故事已明確寫出「他人正攜帶封存艙/貨樣」時：至少 1 個選項要提供高風險搶艙路線（可進入戰鬥）；行動語彙需隨場景變體（攔截/設局/調包/夜襲/脅迫擇一），避免固定三段同句',
      '22. 封存艙一律視為便攜小型艙體（約小背包大小），不得描寫成人體尺寸或大型艙體',
      '22a. 至少 1 個選項要明確帶出可獲得實體物件或可交易物（例如奪取、開艙、驗貨、帶走）'
    ].join('\n')
    : '';
  const pendingConflictRuleNumber = needsStorageHeistRule ? 23 : 21;
  const bridgeTail = [storyFocus.closing, storyFocus.tail]
    .map((text) => String(text || '').trim())
    .filter(Boolean)
    .join('\n');
  const bridgeContext = [
    `上一個選擇：${sourceChoiceText || '（無）'}`,
    `最近已做過的選擇：${recentChoiceText || '（無）'}`,
    `已出現元素：${anchorText}`,
    `附近可互動地點：${nearbyHint}`,
    `附近可疑勢力：${digitalPresenceText}`,
    `當地NPC：${npcStatusText || '（無）'}`,
    navigationTarget ? `導航目標：${navigationTarget}` : '',
    focusedMemory ? `記憶摘要：${focusedMemory}` : '',
    islandGuidePrompt ? `島內引導：${islandGuidePrompt}` : ''
  ].filter(Boolean).join('\n');
  const prompt = `你是 Renaiss 世界的冒險策劃師，設計的選項要有創意、刺激。
風格限制：原創「科技收藏×真偽鑑識」敘事，禁止武俠語氣，禁止既有 IP 名詞（寶可夢、數碼寶貝、斗羅大陸等）。

【當前情境】
位置：${location} - ${locDesc}
區域資訊：${locContext || `${locProfile?.region || '未知'} / 難度D${locProfile?.difficulty || 3}`}
收藏文明口味：
${collectibleCulturePrompt}
地區玩法口味：${locationPlaystylePrompt}
城市天候主調：
${locationWeatherPrompt}
島嶼劇情狀態：stage ${islandStage}/${islandStageCount}｜${islandCompleted ? '已完成（開放世界）' : '進行中（優先引導）'}
戰鬥節奏：第 ${battleCadence.step}/${battleCadence.span} 格
通緝熱度：${wantedPressure}
動態世界狀態：${dynamicWorldContext?.summary || '（無）'}
附近敵對 NPC：${nearbyHostileHint}
封存艙尺寸規格：便攜小型艙體（約小背包大小，可單人攜行）
附近可互動地點：${nearbyHint}
附近傳送門可通往：${portalHint}
本城相鄰可直達城市：${connectedHint}
導航目標：${navigationTarget || '（未設定）'}
結尾導向地點：${directedDestination || '（未明示）'}
附近可疑勢力：${digitalPresenceText}
玩家：${playerName}
寵物：${petName}
當地NPC：${npcStatusText || '沒有人'}
語言設定：${playerLang}
上一個選擇：${sourceChoiceText || '（無）'}
最近已做過的選擇（避免重複）：${recentChoiceText || '（無）'}
${memorySection}
${islandGuidePrompt ? `\n${islandGuidePrompt}` : ''}
${islandKnowledgePrompt ? `\n${islandKnowledgePrompt}` : ''}
${truthGatePrompt ? `\n${truthGatePrompt}` : ''}
${routeConstraintRule ? `\n【地圖路線硬規則】\n${routeConstraintRule}` : ''}
${missionChoiceRule ? `\n【關鍵任務選項規則】\n${missionChoiceRule}` : ''}
${pendingConflictRule ? `\n【衝突延續硬規則】\n${pendingConflictRule}` : ''}
${islandRoadmapPrompt ? `\n${islandRoadmapPrompt}` : ''}
${navigationPacingRule ? `\n【導航約束】\n${navigationPacingRule}` : ''}

【完整故事全文（必讀）】
${fullStoryText || '（無）'}

【前面的故事（開頭重點）】
${storyFocus.lead || '（無）'}

【前面的故事（結尾重點，優先對齊）】
${storyFocus.tail || '（無）'}

【最後一句（最高優先）】
${storyFocus.closing || '（無）'}

【已出現元素清單（優先引用）】
${anchorText}

【任務】
根據上面的故事，生成5個獨特且合理的冒險選項。${langInstruction}。要求：
1. 每個選項要有創意！拒絕無聊！
2. 5 個選項都要符合故事劇情發展，且與本段故事有因果關聯，不可出現平行無關支線
3. 回傳 JSON 陣列，固定 5 筆，每筆格式：
   {"name":"12字內短標題","choice":"12-28字具體動作","desc":"12-30字補充說明","tag":"[風險標籤]","move_to":"目的城市或空字串","action":"explore|social|fight|trade","styleTag":"穩健|交涉|灰線|強奪|追獵|佈局","hiddenMeta":{"law":-2..2,"harm":-2..2,"trust":-2..2,"selfInterest":-2..2,"targetFaction":"beacon|gray|digital|civic|none","witnessRisk":0..1},"dynamicEvent":{"archetype":"","phase":"offered","intensity":1..5,"chainHint":"一句短提示"}}
3a. 不得少於 5 筆、不得輸出 null/空物件；就算資訊不足也要輸出完整 5 筆且保持合理
3b. move_to 規則：只有「真的會移動到另一座城市」才填城市名；非移動選項必須填空字串 ""
3c. move_to 只能填地圖中的城市名，且必須是「本城相鄰可直達城市」之一；若真正目標更遠，本回合必須填第一跳城市
3d. move_to 自檢：若 choice 文案出現「前往/趕往/啟程去 + 城市名」，必須填同一城市；若文案是在描述「先往第一跳、再朝更遠目標推進」，move_to 只能填第一跳城市；若只是城內行動（調查、詢問、監視、交易），move_to 必須是 ""
3e. 禁止「文案寫跨城但 move_to 空白」與「move_to 有城市但文案沒提該城市」兩種錯誤
3f. styleTag 必填，且僅能為：穩健、交涉、灰線、強奪、追獵、佈局
3g. hiddenMeta 必填，且只作系統判讀，不要在文案中出現善惡分數字眼
3h. 若語言設定為 ko，5 個選項的 name/choice/desc 必須全部使用自然韓文，不可混用中文或英文當主句
4. 至少 2 個選項要直接回應「結尾重點/最後一句」裡的當前人物、場景或衝突
4a. ${destinationContinuityRule}
5. 至少 1 個選項必須包含「已出現元素清單」中的詞（NPC名、道具名、地點名、關鍵物件）
5a. ${memoryRelevanceRule}
5b. ${npcRelevanceRule}
6. 不可憑空新增前文不存在的關鍵道具/暗號/座標，除非先交代如何取得
7. 若寫「線索」，必須明說來源（例如哪個人、哪個艙、哪個檢測結果）
8. 刮刮樂只允許在鑑價站互動中出現，這裡禁止輸出「刮刮樂」相關選項
9. 地名只能用於「在某地調查/前往某地」，禁止把地名當物件（例如禁止「把廣州送去檢測」）
9a. 禁止輸出任何「傳送門／傳送裝置／跨區傳送」類選項（這些改由地圖按鈕處理）
10. 避免與「最近已做過的選擇」重複同動詞同目的（例如連續多次「檢測」「詢問」「追查同線索」）
11. 5 個選項要有足夠發散度，避免都在做同一件事
11a. 禁止模板句型：不可出現「沿著/沿XX繼續追查來源與流向」「先處理本區關鍵」「回到核心線索」這類制式措辭
11b. 每個選項都要有具體對象（人/物/地點/行動），不能只寫抽象目標
11c. 禁止把規則文字直接寫進選項（例如「關鍵任務」「唯一來源」「地區進度 x/8」「鎖定某某拿到某證據」）
12. 至少 1 個選項要偏激進（高風險或戰鬥張力標籤），但不必每輪都立刻開打
13. 若島嶼劇情進行中，至少 1 個選項要明確推進島內主題（來自島內引導段），且不得超過 1 個主線強引導選項
13a. 地區玩法口味必須落地：至少 ${Math.max(1, Number(locationPlaystyle?.minKeywordHits || 1))} 個選項要明顯反映「${locationPlaystyle?.name || '在地探索'}」（${Array.isArray(locationPlaystyle?.keywords) && locationPlaystyle.keywords.length > 0 ? locationPlaystyle.keywords.slice(0, 6).join('、') : '請使用在地語境關鍵詞'}）
13b. 至少 1 個選項要反映當前天候「${locationWeatherProfile?.name || '晴空'}」帶來的行動差異（例如改走掩體、調整接觸策略、改變查驗方式），但不可模板化
14. 若島嶼劇情已完成，避免硬塞主線引導，保持開放探索選項比例
15. 玩家名稱「${playerName}」只能指主角本人；禁止再創建同名 NPC
16. 嚴格遵守【島嶼知識邊界】：未解鎖段落不可直接當成已知真相寫進選項
16a. 若【跨島真相邊界】指定「唯一來源 NPC + 城市」，禁止產生「在其他人/其他城市直接拿到關鍵證據」的選項
16b. 若有【關鍵任務選項規則】，必須完整遵守
${kingSpreadRule ? `16c. ${kingSpreadRule}` : ''}
17. ${cadenceRequirement}
18. ${wantedRequirement}
19. 若通緝熱度偏高，5 個選項中最多只允許 1 個「敵對主動逼近/立即戰鬥」類，其餘需維持調查、移動、社交或交易分散度
${dynamicInjectRule}
${storageHeistPromptRule ? `${storageHeistPromptRule}` : ''}
${pendingConflictRule ? `${pendingConflictRuleNumber}. ${pendingConflictRule}` : ''}

風險標籤可選（根據劇情選擇適合的）：
${getChoiceTagPromptLines(playerLang)}

額外規則：
1. 只有「立刻進入戰鬥」的選項，才在句尾加上「${immediateBattleMarker}」。
2. 其餘戰鬥張力標籤只代表故事走向偏向衝突，不要馬上開打。
3. 若故事「結尾段」仍有明確威脅（例如正在逼近、尚未解除），至少要有 1 個衝突相關選項（可為備戰、追蹤、佈防、談判、撤離或立即戰鬥）。
4. 是否立刻開打由情境判斷：若尚在鋪陳，可先給非即時衝突選項；若已正面對峙，再給立即戰鬥選項。

禁止出現：打坐修煉、隨便逛逛、原地休息這類選項！
也禁止出現武俠詞彙：江湖、俠客、門派、武功、內力。
禁止使用跳 tone 行銷詞：一鍵成交、立即變現、秒賺、躺賺。
禁止輸出傳送類選項：傳送門、主傳送門、傳送裝置、跨區傳送、瞬間位移。
並避免過度金融術語：估值、報價、收益率、資本、套利、金融風暴（可用：真偽鑑定、來源線索、藏品修復、封存編號）。

輸出前請先在內部完成自檢（不要把自檢內容輸出）：
- 檢查 5 筆是否齊全，且每筆都有 name/choice/desc/tag/move_to
- 檢查至少 1 筆高風險或戰鬥張力標籤
- 檢查至少 ${Math.max(1, Number(locationPlaystyle?.minKeywordHits || 1))} 筆符合地區玩法口味
- 逐筆檢查 move_to 與文案一致：跨城就填本回合真正移動到的那一站，且該站必須與目前城市相鄰；非跨城就填 ""

${langInstruction}只輸出 JSON 陣列，不可輸出任何額外說明。`;

  try {
    let validatedChoices = null;
    let lastIssues = [];
    let feedbackText = '';
    let choicePool = [];

    for (let pass = 0; pass < choiceValidationPasses; pass++) {
      const passPrompt = feedbackText
        ? `${prompt}\n\n【上一輪違規問題】\n${feedbackText}\n\n請完全重寫 5 個選項，不可沿用上一輪句子。`
        : prompt;
      const result = await callAI(passPrompt, 1.0, {
        label: `generateChoicesWithAI.pass${pass + 1}`,
        model: MINIMAX_MODEL,
        maxTokens: CHOICE_MAX_TOKENS,
        timeoutMs: CHOICE_TIMEOUT_MS,
        retries: CHOICE_GEN_RETRIES,
        unlimitedTimeout: false,
        unlimitedMaxTokens: true
      });
      const normalizedResult = normalizeOutputByLanguage(result, playerLang);
      const parsedChoices = parseChoicesFromAIResult(normalizedResult, playerLang, { player, location });
      choicePool = mergeChoicePool(choicePool, parsedChoices, playerLang, { player, location });
      const candidateChoices = pickTopChoicesFromPool(choicePool, {
        anchors: storyAnchors,
        location,
        previousStory: fullStoryText,
        locationPlaystyle
      }, CHOICE_OUTPUT_COUNT);
      const issues = validateChoiceSet(candidateChoices, {
        anchors: storyAnchors,
        location,
        previousStory: fullStoryText,
        locationPlaystyle,
        playerLang
      });
      if (issues.length === 0) {
        validatedChoices = candidateChoices.slice(0, CHOICE_OUTPUT_COUNT);
        break;
      }
      lastIssues = issues;
      feedbackText = issues.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
      console.warn(`[AI][choices] pass${pass + 1} invalid: ${issues.join(' | ')} | pool=${choicePool.length}`);
    }

    if (!validatedChoices) {
      const mergedChoices = pickTopChoicesFromPool(choicePool, {
        anchors: storyAnchors,
        location,
        previousStory: fullStoryText,
        locationPlaystyle
      }, CHOICE_OUTPUT_COUNT);
      const mergedIssues = validateChoiceSet(mergedChoices, {
        anchors: storyAnchors,
        location,
        previousStory: fullStoryText,
        locationPlaystyle,
        playerLang
      });
      if (mergedChoices.length === CHOICE_OUTPUT_COUNT && mergedIssues.length === 0) {
        console.warn(`[AI][choices] use merged pool fallback, issues=${lastIssues.join(' | ') || 'none'} pool=${choicePool.length}`);
        validatedChoices = mergedChoices;
      } else {
        const deterministicFallback = buildDeterministicFallbackChoices({
          location,
          connectedLocations,
          directedDestination,
          stageGoal,
          playerLang
        }).slice(0, CHOICE_OUTPUT_COUNT);
        const fallbackIssues = validateChoiceSet(deterministicFallback, {
          anchors: storyAnchors,
          location,
          previousStory: fullStoryText,
          locationPlaystyle,
          playerLang
        });
        if (deterministicFallback.length === CHOICE_OUTPUT_COUNT && fallbackIssues.length === 0) {
          console.warn(`[AI][choices] use deterministic fallback, mergedIssues=${mergedIssues.join(' | ') || 'none'} pool=${choicePool.length}`);
          validatedChoices = deterministicFallback;
        } else {
          throw new Error(`choice validation failed: ${lastIssues.join(' | ') || mergedIssues.join(' | ') || fallbackIssues.join(' | ') || 'unknown issue'}`);
        }
      }
    }

    let safeChoices = (Array.isArray(validatedChoices) ? validatedChoices : [])
      .map((choice) => normalizeChoiceSemanticMeta(canonicalizeKingCodenamesChoice(choice), player, location));
    if (dynamicPlan?.inject) {
      let eventIdx = safeChoices.findIndex((choice) => String(choice?.dynamicEvent?.archetype || '').trim());
      if (eventIdx < 0 && safeChoices.length > 0) {
        const protectedActions = new Set(['wish_pool', 'market_renaiss', 'market_digital', 'mentor_spar', 'location_story_battle']);
        eventIdx = safeChoices.findIndex((choice) => !protectedActions.has(String(choice?.action || '').trim()));
        if (eventIdx < 0) eventIdx = safeChoices.length - 1;
        const chosen = { ...(safeChoices[eventIdx] || {}) };
        chosen.dynamicEvent = {
          archetype: dynamicArchetypeHint || 'smuggling',
          phase: 'offered',
          intensity: Math.max(1, Math.min(5, Number(dynamicPlan?.intensity || 2) || 2)),
          chainHint: ''
        };
        const currentMeta = chosen.hiddenMeta && typeof chosen.hiddenMeta === 'object' ? { ...chosen.hiddenMeta } : {};
        currentMeta.eventArchetype = chosen.dynamicEvent.archetype;
        currentMeta.intensity = chosen.dynamicEvent.intensity;
        chosen.hiddenMeta = DYNAMIC_WORLD.normalizeChoiceHiddenMeta(currentMeta, chosen, {
          locationWanted: Number(dynamicWorldContext?.wanted || 0)
        });
        safeChoices[eventIdx] = normalizeChoiceSemanticMeta(chosen, player, location);
      }
      if (eventIdx >= 0) {
        const eventChoice = safeChoices[eventIdx];
        const eventArchetype = String(eventChoice?.dynamicEvent?.archetype || dynamicArchetypeHint || '').trim();
        if (eventArchetype) {
          DYNAMIC_WORLD.recordDynamicEventOffered(player, {
            location,
            archetype: eventArchetype,
            intensity: Math.max(1, Math.min(5, Number(eventChoice?.dynamicEvent?.intensity || dynamicPlan?.intensity || 2) || 2)),
            phase: 'offered',
            storyTurn: Math.max(0, Number(player?.storyTurns || 0))
          });
        }
      }
    }
    recordAIPerf('choices', Date.now() - startedAt);
    console.log(`[AI][generateChoicesWithAI] total ${Date.now() - startedAt}ms`);
    return safeChoices;
  } catch (e) {
    console.error('[AI] 生成選項失敗（無本地模板補位）:', e.message);
    recordAIPerf('choices', Date.now() - startedAt);
    return [];
  }
}

async function analyzeMainlineForeshadowCandidates(payload = {}) {
  const storyText = String(payload.storyText || '').trim();
  if (!storyText) return [];
  const location = String(payload.location || '').trim();
  const previousAction = String(payload.previousAction || '').trim();
  const playerLang = String(payload.playerLang || 'zh-TW').trim();
  const langInstruction = getAiLanguageDirective(playerLang, 'plain');

  const prompt = [
    '你是劇情鋪陳分析器，只做「是否屬於主線伏筆」判斷。',
    '任務：從故事中挑出 0~4 條真正需要跨回合保留的伏筆句。',
    `場景地點：${location || '未知地點'}`,
    `上一行動：${previousAction || '（無）'}`,
    `語言要求：${langInstruction}`,
    '判定原則：',
    '1. 必須是會影響後續劇情推進的資訊（人物動機、可疑勢力、來源流向、關鍵物件、傳送節點、主線試煉）。',
    '2. 一般風景描寫、情緒描寫、一次性寒暄不要選。',
    '3. 句子要可直接作為後續回憶依據，不要改寫太多。',
    '4. 不要輸出模板話術。',
    '',
    '輸出格式（僅 JSON array）：',
    '[{"text":"伏筆句","importance":0.0~1.0}]',
    '',
    '故事全文：',
    storyText
  ].join('\n');

  try {
    const raw = await callAI(prompt, 0.2, {
      label: 'analyzeMainlineForeshadowCandidates',
      model: MINIMAX_MODEL,
      maxTokens: 260,
      timeoutMs: 30000,
      retries: 1,
      unlimitedTimeout: false,
      unlimitedMaxTokens: false
    });
    const normalized = normalizeOutputByLanguage(raw, playerLang);
    const parsed = parseJsonOrThrow(normalized, 'array');
    const rows = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const text = String(item.text || item.content || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 8) continue;
      const importance = Number(item.importance || 0);
      if (Number.isFinite(importance) && importance < 0.45) continue;
      rows.push(text.slice(0, 180));
      if (rows.length >= 4) break;
    }
    return rows;
  } catch (e) {
    console.log('[MainlineAI] analyze skipped:', e?.message || e);
    return [];
  }
}

module.exports = {
  generateStory,
  generateChoicesWithAI,
  generatePlayerMemoryRecap,
  analyzeMainlineForeshadowCandidates,
  getAIPerfStats,
  RENAISS_NPCS,
  RENAISS_LOCATIONS
};
