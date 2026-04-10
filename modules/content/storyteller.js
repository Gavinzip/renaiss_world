/**
 * 📖 AI 故事生成器 v6 - 記憶+風險標籤+NPC狀態
 */

const fs = require('fs');
const path = require('path');
const {
  LOCATION_DESCRIPTIONS,
  getPortalDestinations,
  getLocationStoryContext,
  getLocationProfile,
  getNearbyPoints
} = require('./world-map');
const ISLAND_STORY = require('./story/island-story');
const MAIN_STORY = require('./story/main-story');
const WORLD_LORE = require('../core/world-lore');
const CORE = require('../core/game-core');
const { PROJECT_ROOT } = require('../core/storage-paths');

const envPath = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
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
    { name: 'Q', title: '情資網路管理者', level: 18, pet: '棱鏡烏鴉', petType: '訊號', align: '中立', desc: '擅長追蹤異常訊號與偽造流言' },
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
const STORY_TIMEOUT_MS = Math.max(15000, Number(process.env.STORY_TIMEOUT_MS || 30000) * 2);
const CHOICE_TIMEOUT_MS = Math.max(12000, Number(process.env.CHOICE_TIMEOUT_MS || 26000) * 2);
const SYSTEM_CHOICE_TIMEOUT_MS = Math.max(10000, Number(process.env.SYSTEM_CHOICE_TIMEOUT_MS || 20000) * 2);
const CHOICE_MAX_TOKENS = Math.max(700, Number(process.env.CHOICE_MAX_TOKENS || 3000));
const CHOICE_OUTPUT_COUNT = 5;
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    .map((entry, idx) => `無名滲透者${idx + 1}(第${String(entry.group || 'Nemo')}組)`)
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
  const playerId = String(player?.id || '').trim();
  let coreWanted = 0;
  if (playerId && CORE && typeof CORE.getPlayerWantedLevel === 'function') {
    coreWanted = Math.max(0, Number(CORE.getPlayerWantedLevel(playerId) || 0));
  }
  return Math.max(localWanted, coreWanted);
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

  return out.trim();
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
  if (playerLang === 'zh-TW') return convertCNToTW(sanitized);
  if (playerLang === 'zh-CN') return convertTWToCN(sanitized);
  return sanitized;
}

function normalizeChoiceByLanguage(choice, playerLang = 'zh-TW') {
  if (!choice || typeof choice !== 'object') return choice;
  return {
    ...choice,
    name: normalizeOutputByLanguage(choice.name || '', playerLang),
    choice: normalizeOutputByLanguage(choice.choice || '', playerLang),
    desc: normalizeOutputByLanguage(choice.desc || '', playerLang),
    tag: normalizeOutputByLanguage(choice.tag || '', playerLang)
  };
}

function sanitizeMainlineBridgeChoiceTone(choice = {}, {
  playerLang = 'zh-TW',
  location = '',
  progressText = ''
} = {}) {
  if (!choice || typeof choice !== 'object') return choice;
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
    next.name = playerLang === 'en' ? 'Trace transfer route' : '追查跨區路線';
    next.choice = playerLang === 'en'
      ? `Go to the main gate near ${safeLocation} and confirm route records before moving on`
      : `先到${safeLocation}主傳送門核對跨區航線紀錄，再決定下一步`;
    next.desc = playerLang === 'en'
      ? `${safeProgress} | Keep continuity by linking current clues to the next area`
      : `${safeProgress}｜承接現場線索，先做跨區前的資訊核對`;
  }
  if (/主傳送門.*前往.*接續線索核查/u.test(merged) || /主傳送門.*前往.*追查/u.test(merged)) {
    next.name = playerLang === 'en' ? 'Verify local witness timing' : '核對現場目擊時序';
    next.choice = playerLang === 'en'
      ? `Re-check witness timeline near ${safeLocation} before deciding cross-zone movement`
      : `先在${safeLocation}回頭核對目擊時序與服務來源，再決定是否跨區`;
    next.desc = playerLang === 'en'
      ? `${safeProgress} | Keep continuity by closing local evidence first`
      : `${safeProgress}｜先補齊本地證據鏈，避免跨區後線索斷裂`;
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
  const langInstruction = {
    'zh-TW': '請用繁體中文輸出',
    'zh-CN': '請用簡體中文輸出',
    'en': 'Please output in English'
  }[playerLang] || '請用繁體中文輸出';

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
      retries: 1
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
  const langInstruction = {
    'zh-TW': '請用繁體中文',
    'zh-CN': '請用簡體中文',
    'en': 'Please output in English'
  }[playerLang] || '請用繁體中文';
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
      '固定標籤：tag 必須是 [🤝友誼賽]',
    storage_heist:
      `用途：故事中有人攜帶封存艙，玩家起心動念要直接搶奪。\n` +
      `限制：必須明確是針對「對方手上的封存艙」採取行動；語句要貼合 ${location || '當前場景'}。\n` +
      '限制：封存艙是便攜小型艙體（約小背包大小），禁止寫成巨大艙體。\n' +
      '限制：這是高風險衝突，choice 句尾必須附上「（會進入戰鬥）」。\n' +
      '固定標籤：tag 必須是 [⚔️會戰鬥]'
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
    retries: 2
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
  const langInstruction = {
    'zh-TW': '請用繁體中文',
    'zh-CN': '請用簡體中文',
    'en': 'Please output in English'
  }[playerLang] || '請用繁體中文';
  const digitalTag = newbieMask ? '[🧩友善報價]' : '[🕳️精明殺價]';
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
  {"action":"market_renaiss","name":"...","choice":"...","desc":"...","tag":"[🏪公道鑑價]"},
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
    retries: 2
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

  const isEn = playerLang === 'en';
  const isCn = playerLang === 'zh-CN';
  const stationLabel = isEn
    ? (action === 'market_digital' ? 'mysterious appraisal station' : 'appraisal station')
    : (isCn
      ? (action === 'market_digital' ? '神秘鉴价站' : '鉴价站')
      : (action === 'market_digital' ? '神秘鑑價站' : '鑑價站'));

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
    next.name = isEn ? 'Visit nearby appraisal station' : (isCn ? '前往附近鉴价站' : '前往附近鑑價站');
  }
  if (action === 'market_digital' && !/神秘|mysterious/iu.test(String(next.name || ''))) {
    next.name = isEn ? 'Visit mysterious appraisal station' : (isCn ? '前往神秘鉴价站' : '前往神秘鑑價站');
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
  const chance = hasCarrierCue
    ? (hasThreatCueSignal ? 0.98 : 0.9)
    : (hasThreatCueSignal ? 0.86 : 0.72);
  if (Math.random() > chance) return base.slice(0, CHOICE_OUTPUT_COUNT);

  let heistChoice = null;
  try {
    heistChoice = await generateSystemChoiceWithAI({
      action: 'storage_heist',
      playerLang,
      location
    });
  } catch {
    heistChoice = normalizeChoiceByLanguage({
      action: 'storage_heist',
      name: '直接奪取封存艙',
      choice: `盯準對方手上的封存艙，強行貼身奪取後立刻撤離（會進入戰鬥）`,
      desc: '高風險硬搶，可能引來附近敵對勢力圍堵',
      tag: '[⚔️會戰鬥]'
    }, playerLang);
  }

  const normalizedChoice = normalizeChoiceByLanguage({
    ...heistChoice,
    action: 'fight',
    tag: '[⚔️會戰鬥]',
    choice: (() => {
      const baseChoiceText = String(heistChoice?.choice || '').trim() || '盯準對方手上的封存艙，直接近身強奪';
      return /[（(]\s*會進入戰鬥\s*[)）]/u.test(baseChoiceText)
        ? baseChoiceText
        : `${baseChoiceText}（會進入戰鬥）`;
    })(),
    desc: String(heistChoice?.desc || '高風險：你試圖奪走對方手上的封存艙，附近勢力可能立刻介入。').trim()
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
      tag: '[🤝友誼賽]'
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

function requestAI(body, timeoutMs = AI_TIMEOUT_MS) {
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
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'API Error'));
            return;
          }
          // MiniMax 會在成功時回傳 base_resp.status_msg = "success"
          // 不能單憑 status_msg 判斷失敗，需看 status_code 是否非 0
          if (parsed.base_resp) {
            const statusCode = Number(parsed.base_resp.status_code);
            const statusMsg = String(parsed.base_resp.status_msg || '');
            if (!Number.isNaN(statusCode) && statusCode !== 0) {
              reject(new Error(statusMsg || `status_code=${statusCode}`));
              return;
            }
          }

          const choice = parsed.choices?.[0];
          const rawContent = choice?.message?.content || '';
          if (!rawContent) {
            reject(new Error('Empty AI content'));
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

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('AI timeout'));
    });

    req.on('error', (e) => {
      console.log('[AI] Network error:', e.message);
      reject(e);
    });

    req.write(body);
    req.end();
  });
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
  if (!Array.isArray(evidence) || evidence.length <= 0) {
    if (playerLang === 'en') return '(No verified prior NPC lines.)';
    if (playerLang === 'zh-CN') return '（目前没有可验证的 NPC 旧对话原句）';
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
  if (!Array.isArray(pins) || pins.length === 0) {
    if (playerLang === 'en') return '(No preserved mainline foreshadowing in this phase.)';
    if (playerLang === 'zh-CN') return '（当前没有需保留的主线铺陈）';
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
  const items = extractCarryItemNames(player);
  if (items.length <= 0) {
    if (playerLang === 'en') return '(Backpack is currently empty.)';
    if (playerLang === 'zh-CN') return '（背包当前为空）';
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

function parseChoicesFromAIResult(raw = '', playerLang = 'zh-TW') {
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
            if (!choice || !tag) return null;
            return normalizeChoiceByLanguage({
              name: name || choice.slice(0, 15),
              choice,
              desc: desc || choice,
              tag: tag.startsWith('[') ? tag : `[${tag}]`
            }, playerLang);
          })
          .filter(Boolean);
        if (mapped.length > 0) return mapped.slice(0, CHOICE_OUTPUT_COUNT);
      }
    } catch {
      const looseParsed = parseLooseChoiceArray(payload, playerLang);
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
      parsed.push(normalizeChoiceByLanguage({
        name: action,
        choice: desc,
        desc,
        tag: `[${tag}]`
      }, playerLang));
      continue;
    }
    const content = line.replace(/^\d+\.?\s*/, '').trim();
    if (!content || content.length < 6) continue;
    parsed.push(normalizeChoiceByLanguage({
      name: content.slice(0, 15),
      choice: content,
      desc: content,
      tag: '[❓有驚喜]'
    }, playerLang));
  }
  return parsed.slice(0, CHOICE_OUTPUT_COUNT);
}

function parseLooseChoiceArray(text = '', playerLang = 'zh-TW') {
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
    if (!choice || !tag) continue;
    out.push(normalizeChoiceByLanguage({
      name: name || choice.slice(0, 15),
      choice,
      desc: desc || choice,
      tag: tag.startsWith('[') ? tag : `[${tag}]`
    }, playerLang));
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

function mergeChoicePool(pool = [], incoming = [], playerLang = 'zh-TW') {
  const out = Array.isArray(pool) ? pool.filter(Boolean).slice(0, 30) : [];
  const seen = new Set(out.map(getChoiceFingerprint).filter(Boolean));
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    if (!raw || typeof raw !== 'object') continue;
    const choice = normalizeChoiceByLanguage(raw, playerLang);
    if (!choice?.choice || !choice?.tag) continue;
    const fp = getChoiceFingerprint(choice);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    out.push(choice);
    if (out.length >= 30) break;
  }
  return out;
}

function scoreChoiceCandidate(choice = {}, { anchors = [], location = '', previousStory = '' } = {}) {
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

function validateChoiceSet(choices = [], { anchors = [], location = '', previousStory = '' } = {}) {
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
  const locationRegex = location
    ? new RegExp(`把[「"]?${escapeRegex(location)}[」"]?\\s*(送|帶去|拿去|送去)`, 'u')
    : null;

  for (let i = 0; i < list.length; i++) {
    const choice = list[i];
    const text = [choice?.name || '', choice?.choice || '', choice?.desc || '', choice?.tag || ''].join(' ');
    const fp = normalizeComparableText([choice?.name || '', choice?.choice || '', choice?.desc || ''].join(' '));
    if (!fp) {
      issues.push(`第 ${i + 1} 個選項為空或格式錯誤`);
      continue;
    }
    if (seen.has(fp)) duplicateCount += 1;
    seen.add(fp);

    if (hasAnyRegex(text, CHOICE_BANNED_PHRASES)) issues.push(`第 ${i + 1} 個含跳 tone 詞彙`);
    if (hasAnyRegex(text, CHOICE_VAGUE_PHRASES)) issues.push(`第 ${i + 1} 個語意空泛或暴露過早`);
    if (hasAnyRegex(text, CHOICE_PORTAL_PATTERNS)) issues.push(`第 ${i + 1} 個包含傳送類選項（已改由地圖按鈕）`);
    if (locationRegex && locationRegex.test(text)) issues.push(`第 ${i + 1} 個把地名當作物件`);

    if (anchorList.length > 0 && anchorList.some((anchor) => text.includes(anchor))) {
      anchorHitCount += 1;
    }
    if (/\[(?:🔥高風險|⚔️會戰鬥)\]/u.test(String(choice?.tag || ''))) {
      aggressiveCount += 1;
    }
  }

  if (duplicateCount > 0) issues.push(`有 ${duplicateCount} 個重複選項`);
  if (aggressiveCount < 1) issues.push('至少需要 1 個偏激進選項（[🔥高風險] 或 [⚔️會戰鬥]）');
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

  if (playerLang === 'en') {
    return (
      `${safeName} and ${safePet} moved through ${safeLocation} while regrouping after "${action}". ` +
      `${outcome ? `Current result: ${outcome}. ` : ''}` +
      `They checked nearby merchants, scanned container labels, and marked two leads that can be traced next. ` +
      `${summary ? `Context retained: ${summary.slice(0, 120)}. ` : ''}` +
      `The atmosphere stayed tense, but the route ahead remained open for the next decision.`
    );
  }
  if (playerLang === 'zh-CN') {
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

function choiceMentionsThreat(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const text = [choice.name || '', choice.choice || '', choice.desc || '', choice.tag || ''].join(' ');
  return hasThreatKeyword(text);
}

function isImmediateBattleChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  if (String(choice.action || '') === 'fight') return true;
  const text = [choice.choice || '', choice.desc || '', choice.name || ''].join(' ');
  return /[（(]\s*會進入戰鬥\s*[)）]/u.test(text) || /(即時戰鬥|立刻開打|立即戰鬥)/u.test(text);
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
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || AI_TIMEOUT_MS));
  const maxTokens = Math.max(120, Number(options.maxTokens || AI_MAX_RESPONSE_TOKENS));
  const model = String(options.model || MINIMAX_MODEL);
  const label = String(options.label || 'callAI');
  const strictFinalOnly = Boolean(options.strictFinalOnly);
  const hardRule = '\n\n【硬性輸出規則】只輸出最終答案，禁止輸出任何思考過程、XML標籤或系統說明。';
  let lastError = null;

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
      const attemptMaxTokens = attempt > 1 ? Math.max(maxTokens, Math.floor(maxTokens * 1.5)) : maxTokens;
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: attemptPrompt }],
        temperature: temperature,
        max_tokens: attemptMaxTokens
      });

      const { content, finishReason } = await requestAI(body, timeoutMs);
      const cleaned = sanitizeAIContent(content);
      const strictProbe = stripNarrativeDraftLeak(cleaned);

      if (!cleaned || cleaned.length < 30) {
        throw new Error(`Empty cleaned content raw=${previewAIContent(content)}`);
      }
      if (strictFinalOnly && (!strictProbe || strictProbe.length < 120)) {
        throw new Error('Detected draft/meta leakage in output');
      }
      if (finishReason === 'length' && cleaned.length < 80) {
        throw new Error('Truncated content');
      }

      console.log(`[AI][${label}] model=${model} attempt ${attempt}/${retries} ok in ${Date.now() - startAt}ms`);
      return cleaned;
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
  const missionNarrativeRule = missionInfo && !missionInfo.keyFound
    ? (missionInfo.regionId === 'island_routes'
      ? '本區關鍵任務未完成：四巨頭尚未全滅前，不可把終章真相寫成已成立。'
      : (
        String(location || '').trim() === String(missionInfo.npcLocation || '').trim()
          ? `本區關鍵任務未完成：你現在就在唯一來源城市，可鋪陳接觸「${missionInfo.npcName}」，但證據「${missionInfo.evidenceName}」只能由他交付。`
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
  
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座奇幻城市';
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
  const previousOutcome = summarizeContext(
    previousChoice?.outcome || previousChoice?.desc || '',
    360,
    4
  );
  
  // 保留玩家原始名稱，避免模型把玩家名誤當其他 NPC。
  let safePlayerName = playerName.trim();
  if (!safePlayerName) safePlayerName = '冒險者';
  
  // 根據玩家語言設定決定輸出語言
  const playerLang = player.language || 'zh-TW';
  const langInstruction = {
    'zh-TW': '請用繁體中文講述',
    'zh-CN': '請用簡體中文講述',
    'en': '請用英文講述'
  }[playerLang] || '請用繁體中文講述';
  
  // 上一段故事摘要（提升連貫性）
  const previousStorySummary = summarizeContext(player.currentStory || '', 520, 8);
  const previousStorySection = previousStorySummary
    ? `\n【前一段故事（重點）】\n${previousStorySummary}`
    : '';
  const isOpeningBeat = (
    Number(player?.storyTurns || 0) <= 0 &&
    !String(player?.currentStory || '').trim() &&
    !previousChoice
  );

  // 記憶上下文
  const focusedMemory = summarizeContext(memoryContext, 980, 12);
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
地區篇章進度：第 ${Math.max(1, arcMeta.turnsInLocation)} / ${arcMeta.targetTurns} 段（階段：${arcMeta.phase}）
已完成跨區篇章：${arcMeta.completedLocations}
島嶼劇情狀態：stage ${islandStage}/${islandStageCount}｜${islandCompleted ? '已完成（開放世界）' : '進行中（優先引導）'}
戰鬥節奏：第 ${battleCadence.step}/${battleCadence.span} 格｜${battleCadenceHint}
通緝熱度：${wantedPressure}（>=${WANTED_AMBUSH_MIN_LEVEL} 時，敵對勢力更可能主動接近）
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

【上一個行動】
動作代碼：${previousActionCode || '（無）'}
${previousAction}
${previousOutcome ? `\n【上一個行動結果（必須銜接）】\n${previousOutcome}` : ''}

【任務】
${langInstruction}，講述玩家「${safePlayerName}」執行「${previousAction}」後發生了什麼。故事目標長度約 400-500 字。要點：
1. 有具體的場景（光線、聲音、氣味、溫度、觸感）
2. 有NPC或環境的互動
3. 強調原創世界觀：收藏品真偽鑑識、封存艙/修復台、來源線索、夥伴協作
4. 故事要有懸念，讓人想繼續看
5. 嚴格使用對應語言，${langInstruction.replace('請用', '全部')}
6. 若語言設定為 zh-TW，嚴禁使用簡體字
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
17. 若使用「線索」「交易」等抽象詞，必須指向具體對象（誰提供、哪個物件、哪個位置）
18. 若寫「某 NPC 曾說過／提醒過」且使用引號，內容必須逐字對得上【可驗證 NPC 對話原句】；找不到就禁止寫引號引用
19. 回憶 NPC 提醒時，盡量補上當時場景（例如在哪個地點發生）
20. 若【上一個行動結果】包含移動（例如從 A 到 B／抵達 B），開場 1-2 句必須寫出過場與抵達，不可直接瞬間換景
21. 角色「手中持有／使用／遞出／展示」的物件，必須來自【玩家背包與可用物件】；若清單沒有，最多只能寫成「想取得/去購買/去詢問」
22. 禁止憑空產生關鍵道具（通行卡、座標碼、專用藥劑、啟動器等）；若劇情需要，必須先在當下場景明確寫出取得動作
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
32. 若通緝熱度 >= ${WANTED_AMBUSH_MIN_LEVEL}，可讓敵對勢力主動接近，但要明確交代「誰靠近、如何接觸」
33. 若要讓 NPC 主動出現，必須在當前地點或附近可互動地點內合理登場，不可跨區瞬移
34. 高通緝壓迫需採「漸進式」：先可疑視線/尾隨，再試探接觸，最後才進入正面衝突；不可一開場就連續跳多名追兵
35. 若提到「可鑑定品」，優先使用「可被鑑定的物件示例」中的物件，避免憑空造出不合世界觀的品項
36. 封存艙一律描寫為便攜小型艙體（約小背包大小），禁止寫成人體尺寸或大型貨櫃
37. 若人物攜帶封存艙，請寫成可單人抱持/背負的尺度，不可描述為巨型艙體
38. 若存在【主線橋接鎖定】，開場 1-2 段必須優先承接該目標，且給出「現在就能做」的行動落點
39. 主線橋接鎖定只能當「本回合先落地」的方向，不可直接照抄成模板句或條列宣告
40. 若「動作代碼」是 portal_jump_followup 或 device_jump_followup，開場必須採三段銜接：先交代原地點最後情勢（1-2句）→ 再寫啟動傳送與過程（1-2句）→ 最後落在新地點且立刻有可互動對象/環境回應（至少2句），禁止只寫「已抵達」空句

直接開始講：`;

  // AI-only：固定使用 MiniMax-M2.5；不使用本地假故事
  const modelCandidates = [MINIMAX_MODEL];
  const uniqCandidates = modelCandidates.filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  for (let i = 0; i < uniqCandidates.length; i++) {
    const model = uniqCandidates[i];
    try {
      const story = await callAI(prompt, 0.95, {
        label: i === 0 ? 'generateStory.fast' : 'generateStory.fallback',
        model,
        maxTokens: 1600,
        timeoutMs: STORY_TIMEOUT_MS,
        retries: 3,
        strictFinalOnly: true
      });
      const normalizedStory = normalizeOutputByLanguage(stripNarrativeDraftLeak(story), playerLang);
      if (!normalizedStory || normalizedStory.length < 120) {
        throw new Error('Story too short');
      }

      if (normalizedStory.length > 2600) {
        recordAIPerf('story', Date.now() - startedAt);
        return normalizedStory.substring(0, 2600) + '...[故事過長已截斷]';
      }
      recordAIPerf('story', Date.now() - startedAt);
      console.log(`[AI][generateStory] total ${Date.now() - startedAt}ms`);
      return normalizedStory;
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
  recordAIPerf('story', Date.now() - startedAt);
  console.warn('[Storyteller] generateStory 使用本地保底故事，避免中斷流程');
  return fallbackStory;
}

// ========== AI 生成選項（帶風險標籤+更具體）============
async function generateChoicesWithAI(player, pet, previousStory, memoryContext = '') {
  const startedAt = Date.now();
  const newbieMask = isInNewbiePhase(player);
  const arcMeta = getLocationArcMeta(player);
  const location = player.location || '河港鎮';
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
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座奇幻城市';
  const locProfile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const locContext = typeof getLocationStoryContext === 'function' ? getLocationStoryContext(location) : '';
  const nearbyPoints = typeof getNearbyPoints === 'function' ? getNearbyPoints(location, 4) : [];
  const nearbyHint = nearbyPoints.length > 0 ? nearbyPoints.join('、') : '周遭地標資訊不足';
  const portalDestinations = typeof getPortalDestinations === 'function' ? getPortalDestinations(location) : [];
  const portalHint = portalDestinations.length > 0 ? portalDestinations.slice(0, 4).join('、') : '附近沒有穩定傳送門';
  const navigationTarget = String(player?.navigationTarget || '').trim();
  const digitalPresenceText = formatRoamingDigitalPresence(location, 2);
  const battleCadence = getBattleCadenceInfo(player);
  const wantedPressure = getWantedPressure(player);
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
  const langInstruction = {
    'zh-TW': '請用繁體中文輸出',
    'zh-CN': '請用簡體中文輸出',
    'en': 'Please output in English'
  }[playerLang] || '請用繁體中文輸出';
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
  const missionApproachRule = (() => {
    if (!missionInfo || missionInfo.keyFound) return '';
    if (missionInfo.regionId === 'island_routes') {
      return '本區關鍵任務未完成：四巨頭未全滅前，只能鋪陳追蹤或備戰，不能寫成已拿到終章核心憑證。';
    }
    if (missionInCity) {
      if (missionCityTurns <= 1) {
        return `你已在任務城市（第${missionCityTurns}回合）：本回合至少 1 個選項要自然引出「${missionInfo.npcName}」的出沒線索（旁觀者口供、交易時間、常去地點等），語句不可像任務模板。`;
      }
      if (missionCityTurns === 2) {
        return `你已在任務城市（第2回合）：本回合至少 1 個選項要把線索收斂成可執行接觸（堵點、約見、尾隨、換取情報），但不得直接寫成證據到手。`;
      }
      return `你已在任務城市（第${missionCityTurns}回合）：本回合至少 1 個選項可直接接觸「${missionInfo.npcName}」或其代理人；仍不可直接寫成已取得「${missionInfo.evidenceName}」。`;
    }
    return `你尚未到任務城市：本回合至少 1 個選項要透過在地線索把路徑推向「${missionInfo.npcLocation}」，並讓玩家看得懂「下一步應往該城市移動」；不可在當地直接拿到「${missionInfo.evidenceName}」。`;
  })();
  const missionChoiceRule = missionInfo && !missionInfo.keyFound
    ? missionApproachRule
    : '';
  
  const focusedMemory = summarizeContext(memoryContext, 560, 8);
  const memorySection = focusedMemory ? `\n【玩家之前的足跡（重點）】\n${focusedMemory}` : '';
  const storyFocus = buildStoryFocusForChoices(previousStory || '');
  const fullStoryText = String(previousStory || '').trim();
  const sourceChoiceText = String(player?.generationState?.sourceChoice || '').trim();
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
島嶼劇情狀態：stage ${islandStage}/${islandStageCount}｜${islandCompleted ? '已完成（開放世界）' : '進行中（優先引導）'}
戰鬥節奏：第 ${battleCadence.step}/${battleCadence.span} 格
通緝熱度：${wantedPressure}
附近敵對 NPC：${nearbyHostileHint}
封存艙尺寸規格：便攜小型艙體（約小背包大小，可單人攜行）
附近可互動地點：${nearbyHint}
附近傳送門可通往：${portalHint}
導航目標：${navigationTarget || '（未設定）'}
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
${missionChoiceRule ? `\n【關鍵任務選項規則】\n${missionChoiceRule}` : ''}
${pendingConflictRule ? `\n【衝突延續硬規則】\n${pendingConflictRule}` : ''}
${islandRoadmapPrompt ? `\n${islandRoadmapPrompt}` : ''}
${navigationTarget ? `\n【導航約束】\n玩家已在地圖設定導航目標「${navigationTarget}」，至少 1 個選項必須是朝該地點推進的具體行動。` : ''}

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
2. 要符合故事的劇情發展
3. 回傳 JSON 陣列，固定 5 筆，每筆格式：
   {"name":"12字內短標題","choice":"12-28字具體動作","desc":"12-30字補充說明","tag":"[風險標籤]"}
4. 至少 2 個選項要直接回應「結尾重點/最後一句」裡的當前人物、場景或衝突
5. 至少 1 個選項必須包含「已出現元素清單」中的詞（NPC名、道具名、地點名、關鍵物件）
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
12. 至少 1 個選項要偏激進（[🔥高風險] 或 [⚔️會戰鬥]），但不必每輪都立刻開打
13. 若島嶼劇情進行中，至少 1 個選項要明確推進島內主題（來自島內引導段），且不得超過 1 個主線強引導選項
14. 若島嶼劇情已完成，避免硬塞主線引導，保持開放探索選項比例
15. 玩家名稱「${playerName}」只能指主角本人；禁止再創建同名 NPC
16. 嚴格遵守【島嶼知識邊界】：未解鎖段落不可直接當成已知真相寫進選項
16a. 若【跨島真相邊界】指定「唯一來源 NPC + 城市」，禁止產生「在其他人/其他城市直接拿到關鍵證據」的選項
16b. 若有【關鍵任務選項規則】，必須完整遵守
17. ${cadenceRequirement}
18. ${wantedRequirement}
19. 若通緝熱度偏高，5 個選項中最多只允許 1 個「敵對主動逼近/立即戰鬥」類，其餘需維持調查、移動、社交或交易分散度
20. 若故事已明確提到有人手持/背著封存艙，可允許其中 1 個選項走「直接搶奪封存艙」高風險路線（可進入戰鬥），但文句必須貼合當下人物與場景，不可模板化
21. 封存艙一律視為便攜小型艙體（約小背包大小），不得描寫成人體尺寸或大型艙體
${pendingConflictRule ? `22. ${pendingConflictRule}` : ''}

風險標籤可選（根據劇情選擇適合的）：
- [🔥高風險] - 可能會受傷或失敗
- [💰需花錢] - 需要花費金錢
- [🤝需社交] - 需要與人交談
- [🔍需探索] - 需要探索或搜尋
- [⚔️會戰鬥] - 戰鬥張力升高（不一定立刻開打）
- [🎁高回報] - 成功後收獲豐厚
- [❓有驚喜] - 結果未知

額外規則：
1. 只有「立刻進入戰鬥」的選項，才在句尾加上「（會進入戰鬥）」。
2. 其餘 [⚔️會戰鬥] 只代表故事走向偏向衝突，不要馬上開打。
3. 若故事「結尾段」仍有明確威脅（例如正在逼近、尚未解除），至少要有 1 個衝突相關選項（可為備戰、追蹤、佈防、談判、撤離或立即戰鬥）。
4. 是否立刻開打由情境判斷：若尚在鋪陳，可先給非即時衝突選項；若已正面對峙，再給立即戰鬥選項。

禁止出現：打坐修煉、隨便逛逛、原地休息這類選項！
也禁止出現武俠詞彙：江湖、俠客、門派、武功、內力。
禁止使用跳 tone 行銷詞：一鍵成交、立即變現、秒賺、躺賺。
禁止輸出傳送類選項：傳送門、主傳送門、傳送裝置、跨區傳送、瞬間位移。
並避免過度金融術語：估值、報價、收益率、資本、套利、金融風暴（可用：真偽鑑定、來源線索、藏品修復、封存編號）。

${langInstruction}只輸出 JSON 陣列，不可輸出任何額外說明。`;

  try {
    let validatedChoices = null;
    let lastIssues = [];
    let feedbackText = '';
    let choicePool = [];

    for (let pass = 0; pass < 3; pass++) {
      const passPrompt = feedbackText
        ? `${prompt}\n\n【上一輪違規問題】\n${feedbackText}\n\n請完全重寫 5 個選項，不可沿用上一輪句子。`
        : prompt;
      const result = await callAI(passPrompt, 1.0, {
        label: `generateChoicesWithAI.pass${pass + 1}`,
        model: MINIMAX_MODEL,
        maxTokens: CHOICE_MAX_TOKENS,
        timeoutMs: CHOICE_TIMEOUT_MS,
        retries: 3
      });
      const normalizedResult = normalizeOutputByLanguage(result, playerLang);
      const parsedChoices = parseChoicesFromAIResult(normalizedResult, playerLang);
      choicePool = mergeChoicePool(choicePool, parsedChoices, playerLang);
      const candidateChoices = pickTopChoicesFromPool(choicePool, {
        anchors: storyAnchors,
        location,
        previousStory: fullStoryText
      }, CHOICE_OUTPUT_COUNT);
      const issues = validateChoiceSet(candidateChoices, {
        anchors: storyAnchors,
        location,
        previousStory: fullStoryText
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
        previousStory: fullStoryText
      }, CHOICE_OUTPUT_COUNT);
      if (mergedChoices.length === CHOICE_OUTPUT_COUNT) {
        console.warn(`[AI][choices] use merged pool fallback, issues=${lastIssues.join(' | ') || 'none'} pool=${choicePool.length}`);
        validatedChoices = mergedChoices;
      } else {
        throw new Error(`choice validation failed: ${lastIssues.join(' | ') || 'unknown issue'}`);
      }
    }

    recordAIPerf('choices', Date.now() - startedAt);
    console.log(`[AI][generateChoicesWithAI] total ${Date.now() - startedAt}ms`);
    return validatedChoices;
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
  const langInstruction = {
    'zh-TW': '請用繁體中文',
    'zh-CN': '請用簡體中文',
    'en': 'Please output in English'
  }[playerLang] || '請用繁體中文';

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
      retries: 1
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
