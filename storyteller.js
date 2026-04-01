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
const MAIN_STORY = require('./main-story');
const WORLD_LORE = require('./world-lore');

const envPath = path.join(__dirname, '.env');
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
    { name: 'Q', title: '情資網路管理者', level: 18, pet: '數據烏鴉', petType: '數據', align: '中立', desc: '擅長追蹤異常訊號與假消息' },
    { name: '牡丹', title: '公共關係顧問', level: 12, pet: '花仙蝶', petType: '生質', align: '信標聯盟', desc: '精於社交協商與多方協調' }
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
const STORY_TIMEOUT_MS = Math.max(10000, Number(process.env.STORY_TIMEOUT_MS || 30000));
const CHOICE_TIMEOUT_MS = Math.max(8000, Number(process.env.CHOICE_TIMEOUT_MS || 26000));
const SYSTEM_CHOICE_TIMEOUT_MS = Math.max(8000, Number(process.env.SYSTEM_CHOICE_TIMEOUT_MS || 20000));

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
  [/寺廟/g, '中繼站']
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapFactionLabel(raw = '') {
  const key = String(raw || '').trim();
  return FACTION_DISPLAY_MAP[key] || key || '信標聯盟';
}

function sanitizeNarrativeText(text = '') {
  let output = String(text || '');
  for (const [pattern, replacement] of NARRATIVE_TERM_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }
  return output;
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
    scratch_lottery:
      `用途：玩家在 ${location || '目前位置'} 附近的小賣部購買刮刮樂。\n` +
      '限制：要明確點出本次投入 100 Rns、可能中 500 Rns。\n' +
      '固定標籤：tag 必須是 [🎟️刮刮樂]'
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
3. 直接輸出 JSON。`;

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

async function generateMarketChoicesWithAI(playerLang = 'zh-TW', location = '') {
  const langInstruction = {
    'zh-TW': '請用繁體中文',
    'zh-CN': '請用簡體中文',
    'en': 'Please output in English'
  }[playerLang] || '請用繁體中文';

  const prompt = `你要生成 Renaiss 遊戲的市場選項，請回傳 JSON 陣列，不要任何額外文字。
風格限制：原創科幻生態敘事，禁止武俠語氣與既有 IP 名詞。

語言：${playerLang}（${langInstruction}）
地點：${location || '未知地點'}

任務：
1. 第一個選項要對應 market_renaiss（公道鑑價、偏公平）
2. 第二個選項要對應 market_digital（話術壓價、對玩家不利但說得漂亮）

輸出格式（固定兩筆）：
[
  {"action":"market_renaiss","name":"...","choice":"...","desc":"...","tag":"[🏪公道鑑價]"},
  {"action":"market_digital","name":"...","choice":"...","desc":"...","tag":"[🕳️精明殺價]"}
]

規則：
1. 內容要具體，不要套句。
2. 兩筆語氣必須明顯不同。
3. 禁止出現武俠詞彙：江湖、俠客、門派、武功、內力、修煉、打坐。
3. 直接輸出 JSON。`;

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
    mapped.push(normalizeChoiceByLanguage({
      action,
      name: String(item.name).trim(),
      choice: String(item.choice).trim(),
      desc: String(item.desc).trim(),
      tag: String(item.tag).trim()
    }, playerLang));
  }
  return mapped;
}

const SYSTEM_OPTION_CHANCE = Object.freeze({
  portal: 0.28,
  wishPool: 0.22,
  market: 0.5,
  marketEach: 0.72,
  scratchLottery: 0.45
});

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
  const portalNodeDegree = typeof getPortalDestinations === 'function'
    ? getPortalDestinations(location).length
    : 0;
  const nearPortal = portalNodeDegree >= 4;
  const nearWishPool = containsAnyKeyword(featureText, [
    '祭壇', '古祭', '靈泉', '神殿', '祈願', '祈福', '仙島', '巫', '石碑'
  ]);
  const nearMarket = containsAnyKeyword(featureText, [
    '市集', '巴扎', '交易', '拍賣', '商隊', '商都', '商港', '碼頭', '港', '驛站', '公會', '商店'
  ]);
  return { nearPortal, nearWishPool, nearMarket };
}

async function injectPortalChoice(choices, location, playerLang = 'zh-TW') {
  const base = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  const destinations = typeof getPortalDestinations === 'function' ? getPortalDestinations(location) : [];
  if (!destinations || destinations.length === 0) return base.slice(0, 7);
  const { nearPortal } = getNearbySystemAvailability(location);
  if (!nearPortal) return base.slice(0, 7);
  if (Math.random() > SYSTEM_OPTION_CHANCE.portal) return base.slice(0, 7);

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

  return withoutPortal.slice(0, 7);
}

async function injectWishPoolChoice(choices, playerLang = 'zh-TW', location = '', chance = SYSTEM_OPTION_CHANCE.wishPool) {
  const base = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  if (base.some(c => c.action === 'wish_pool')) return base.slice(0, 7);
  const { nearWishPool } = getNearbySystemAvailability(location);
  if (!nearWishPool) return base.slice(0, 7);
  if (Math.random() > chance) return base.slice(0, 7);

  const wishChoice = await generateSystemChoiceWithAI({
    action: 'wish_pool',
    playerLang
  });
  if (base.length >= 7) {
    base[6] = wishChoice;
  } else {
    base.push(wishChoice);
  }
  return base.slice(0, 7);
}

async function injectMarketChoices(choices, playerLang = 'zh-TW', location = '', chance = SYSTEM_OPTION_CHANCE.market) {
  const base = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  const { nearMarket } = getNearbySystemAvailability(location);
  if (!nearMarket) return base.slice(0, 7);
  if (Math.random() > chance) return base.slice(0, 7);
  const removeActions = new Set(['market_renaiss', 'market_digital']);
  let work = base.filter(c => !removeActions.has(c.action));
  const marketChoices = await generateMarketChoicesWithAI(playerLang, location);
  const selectedMarketChoices = marketChoices.filter(() => Math.random() <= SYSTEM_OPTION_CHANCE.marketEach);
  if (selectedMarketChoices.length === 0) {
    selectedMarketChoices.push(marketChoices[Math.floor(Math.random() * marketChoices.length)]);
  }
  const reservedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery']);

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

  return work.slice(0, 7);
}

async function injectScratchLotteryChoice(choices, playerLang = 'zh-TW', location = '', chance = SYSTEM_OPTION_CHANCE.scratchLottery) {
  const base = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  if (base.some(c => c.action === 'scratch_lottery')) return base.slice(0, 7);
  const { nearMarket } = getNearbySystemAvailability(location);
  if (!nearMarket) return base.slice(0, 7);
  if (Math.random() > chance) return base.slice(0, 7);

  const scratchChoice = await generateSystemChoiceWithAI({
    action: 'scratch_lottery',
    playerLang,
    location
  });

  const reservedActions = new Set([
    'portal_intent',
    'wish_pool',
    'market_renaiss',
    'market_digital',
    'scratch_lottery'
  ]);
  if (base.length < 7) {
    base.push(scratchChoice);
    return base.slice(0, 7);
  }

  let replaceIdx = -1;
  for (let i = base.length - 1; i >= 0; i--) {
    if (!reservedActions.has(String(base[i]?.action || ''))) {
      replaceIdx = i;
      break;
    }
  }
  if (replaceIdx < 0) replaceIdx = base.length - 1;
  base[replaceIdx] = scratchChoice;
  return base.slice(0, 7);
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

const THREAT_KEYWORDS = [
  '殺手', '刺客', '追兵', '伏擊', '埋伏', '危機', '殺機', '湍流', '毒素',
  '敵人', '敵影', '戰鬥', '開打', '迎戰', '對峙', '威脅', '攔截', '侵蝕', '降臨'
];

function hasThreatCue(text = '') {
  const source = String(text || '');
  return THREAT_KEYWORDS.some(k => source.includes(k));
}

function choiceMentionsThreat(choice) {
  if (!choice || typeof choice !== 'object') return false;
  const text = [choice.name || '', choice.choice || '', choice.desc || '', choice.tag || ''].join(' ');
  return hasThreatCue(text);
}

function isImmediateBattleChoice(choice) {
  if (!choice || typeof choice !== 'object') return false;
  if (String(choice.action || '') === 'fight') return true;
  const text = [choice.choice || '', choice.desc || '', choice.name || ''].join(' ');
  return /[（(]\s*會進入戰鬥\s*[)）]/u.test(text) || /(即時戰鬥|立刻開打|立即戰鬥)/u.test(text);
}

function createThreatImmediateChoice(playerLang = 'zh-TW') {
  const byLang = {
    'zh-CN': {
      name: '迎击来袭者',
      choice: '直冲面具杀手正面交锋，阻止其逼近（會進入戰鬥）',
      desc: '你主动抢先出手，压住对方节奏（會進入戰鬥）'
    },
    en: {
      name: 'Intercept Assassin',
      choice: 'Rush the masked assassin and force a direct clash (會進入戰鬥)',
      desc: 'Take initiative before the attacker controls the bridge (會進入戰鬥)'
    }
  };
  const pack = byLang[playerLang] || {
    name: '迎擊來襲者',
    choice: '直衝面具殺手正面交鋒，阻止其逼近（會進入戰鬥）',
    desc: '你主動先手壓制，避免讓對方掌握節奏（會進入戰鬥）'
  };
  return { ...pack, tag: '[⚔️會戰鬥]', action: 'fight' };
}

function createThreatCounterChoice(playerLang = 'zh-TW') {
  const byLang = {
    'zh-CN': {
      name: '联手布防',
      choice: '请茶师启动护膜并一起封锁桥面，先稳住局势',
      desc: '不贸然开打，先切断对方的进攻路线'
    },
    en: {
      name: 'Fortify with Tea Master',
      choice: 'Ask the tea master to raise warding fields and lock the bridge lanes',
      desc: 'Stabilize the scene first, then look for the attacker\'s weak point'
    }
  };
  const pack = byLang[playerLang] || {
    name: '聯手佈防',
    choice: '請茶師啟動護膜並封鎖橋面節點，先穩住局勢',
    desc: '不急著硬碰硬，先切斷對方進攻路徑'
  };
  return { ...pack, tag: '[🤝需社交]', action: 'social' };
}

function upsertCriticalChoice(work, replacement) {
  if (!Array.isArray(work) || !replacement) return;
  if (work.some(c => (c?.choice || '') === replacement.choice)) return;
  const protectedActions = new Set(['portal_intent', 'wish_pool', 'market_renaiss', 'market_digital', 'scratch_lottery']);
  let replaceIdx = -1;
  for (let i = work.length - 1; i >= 0; i--) {
    const item = work[i];
    if (protectedActions.has(String(item?.action || ''))) continue;
    if (!choiceMentionsThreat(item)) {
      replaceIdx = i;
      break;
    }
  }
  if (replaceIdx < 0) {
    replaceIdx = Math.max(0, work.length - 1);
  }
  work[replaceIdx] = replacement;
}

function enforceThreatChoiceContinuity(choices = [], previousStory = '', playerLang = 'zh-TW') {
  const work = Array.isArray(choices) ? choices.filter(Boolean).map(c => ({ ...c })) : [];
  if (work.length === 0) return work;
  if (!hasThreatCue(previousStory)) return work;

  const hasImmediate = work.some(choice => isImmediateBattleChoice(choice));
  const hasCounter = work.some(choice => choiceMentionsThreat(choice) && !isImmediateBattleChoice(choice));

  if (!hasImmediate) {
    upsertCriticalChoice(work, createThreatImmediateChoice(playerLang));
  }
  if (!hasCounter) {
    upsertCriticalChoice(work, createThreatCounterChoice(playerLang));
  }

  return work.slice(0, 7);
}

async function injectSystemChoicesSafely(baseChoices, { playerLang = 'zh-TW', location = '' } = {}) {
  let work = Array.isArray(baseChoices) ? baseChoices.slice(0, 7) : [];
  try {
    work = await injectPortalChoice(work, location, playerLang);
  } catch (e) {
    console.error('[AI] injectPortalChoice 失敗，略過:', e?.message || e);
  }
  try {
    work = await injectWishPoolChoice(work, playerLang, location);
  } catch (e) {
    console.error('[AI] injectWishPoolChoice 失敗，略過:', e?.message || e);
  }
  try {
    work = await injectMarketChoices(work, playerLang, location);
  } catch (e) {
    console.error('[AI] injectMarketChoices 失敗，略過:', e?.message || e);
  }
  try {
    work = await injectScratchLotteryChoice(work, playerLang, location);
  } catch (e) {
    console.error('[AI] injectScratchLotteryChoice 失敗，略過:', e?.message || e);
  }
  return Array.isArray(work) ? work.slice(0, 7) : [];
}

async function callAI(prompt, temperature = 0.9, options = {}) {
  if (!API_KEY) throw new Error('No API Key');

  const retries = Math.max(1, Number(options.retries || AI_MAX_RETRIES));
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || AI_TIMEOUT_MS));
  const maxTokens = Math.max(120, Number(options.maxTokens || 700));
  const model = String(options.model || MINIMAX_MODEL);
  const label = String(options.label || 'callAI');
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
      const attemptMaxTokens = attempt > 1 ? Math.min(2200, Math.floor(maxTokens * 2)) : maxTokens;
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: attemptPrompt }],
        temperature: temperature,
        max_tokens: attemptMaxTokens
      });

      const { content, finishReason } = await requestAI(body, timeoutMs);
      const cleaned = sanitizeAIContent(content);

      if (!cleaned || cleaned.length < 30) {
        throw new Error(`Empty cleaned content raw=${previewAIContent(content)}`);
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
  const mainStoryBrief = MAIN_STORY.getMainStoryBrief(player);
  const loreSnippet = WORLD_LORE.getLorePromptSnippet();
  
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座奇幻城市';
  const locProfile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const locContext = typeof getLocationStoryContext === 'function' ? getLocationStoryContext(location) : '';
  const nearbyPoints = typeof getNearbyPoints === 'function' ? getNearbyPoints(location, 4) : [];
  const nearbyHint = nearbyPoints.length > 0 ? nearbyPoints.join('、') : '周遭地標資訊不足';
  const portalDestinations = typeof getPortalDestinations === 'function' ? getPortalDestinations(location) : [];
  const portalHint = portalDestinations.length > 0 ? portalDestinations.slice(0, 4).join('、') : '附近沒有穩定傳送門';
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
  
  const previousAction = previousChoice?.choice || previousChoice?.name || '開始探索';
  
  // 確保玩家名字是中文（如果全是英文就用冒險者）
  let safePlayerName = playerName.trim();
  if (/^[a-zA-Z0-9]+$/.test(safePlayerName)) {
    safePlayerName = '冒險者';
  }
  
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

  // 記憶上下文
  const focusedMemory = summarizeContext(memoryContext, 980, 12);
  const memorySection = focusedMemory ? `\n【玩家之前的足跡（重點）】\n${focusedMemory}` : '';
  
  const prompt = `你是 Renaiss 世界的原創敘事引擎，風格是「生態夥伴 + 數據進化 + 區域事件」。
禁止武俠腔、禁止借用任何既有作品專有名詞或角色名。

【當前場景】
位置：${location} - ${locDesc}
區域資訊：${locContext || `${locProfile?.region || '未知'} / 難度D${locProfile?.difficulty || 3}`}
附近可互動地點：${nearbyHint}
附近傳送門可通往：${portalHint}
玩家：${safePlayerName}
寵物：${petName}(${petType})
陣營：${alignment}
主線進度：${mainStoryBrief}
世界設定：
${loreSnippet}
語言設定：${playerLang}
${npcStatusText}
${previousStorySection}
${memorySection}

【上一個行動】
${previousAction}

【任務】
${langInstruction}，講述玩家「${safePlayerName}」執行「${previousAction}」後發生了什麼。故事目標長度約 400-500 字。要點：
1. 有具體的場景（光線、聲音、氣味、溫度、觸感）
2. 有NPC或環境的互動
3. 強調原創世界觀：夥伴連線、數據擾動、環境事件、資源博弈
4. 故事要有懸念，讓人想繼續看
5. 嚴格使用對應語言，${langInstruction.replace('請用', '全部')}
6. 若語言設定為 zh-TW，嚴禁使用簡體字
7. 若【玩家之前的足跡】提到同地點人物/衝突/情緒，優先做出連貫呼應（例如老闆記得你、壞人記得你、你記得天空與環境）
8. 若角色說出抽象口號（例如「真實的代價」），必須在接下來 1-2 句交代具體含義（要付出什麼代價）
9. 禁止出現武俠相關詞：江湖、俠客、門派、武功、內力、打坐、修煉等

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
        retries: 2
      });
      const normalizedStory = normalizeOutputByLanguage(story, playerLang);
      if (!normalizedStory || normalizedStory.length < 120) {
        throw new Error('Story too short');
      }

      if (normalizedStory.length > 2600) {
        return normalizedStory.substring(0, 2600) + '...[故事過長已截斷]';
      }
      console.log(`[AI][generateStory] total ${Date.now() - startedAt}ms`);
      return normalizedStory;
    } catch (e) {
      console.error(`[Storyteller] generateStory model=${model} 失敗:`, e.message);
    }
  }

  throw new Error('AI story generation failed (no fallback story)');
}

// ========== AI 生成選項（帶風險標籤+更具體）============
async function generateChoicesWithAI(player, pet, previousStory, memoryContext = '') {
  const startedAt = Date.now();
  const location = player.location || '河港鎮';
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座奇幻城市';
  const locProfile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const locContext = typeof getLocationStoryContext === 'function' ? getLocationStoryContext(location) : '';
  const nearbyPoints = typeof getNearbyPoints === 'function' ? getNearbyPoints(location, 4) : [];
  const nearbyHint = nearbyPoints.length > 0 ? nearbyPoints.join('、') : '周遭地標資訊不足';
  const portalDestinations = typeof getPortalDestinations === 'function' ? getPortalDestinations(location) : [];
  const portalHint = portalDestinations.length > 0 ? portalDestinations.slice(0, 4).join('、') : '附近沒有穩定傳送門';
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
  
  const focusedMemory = summarizeContext(memoryContext, 560, 8);
  const memorySection = focusedMemory ? `\n【玩家之前的足跡（重點）】\n${focusedMemory}` : '';
  const storyFocus = buildStoryFocusForChoices(previousStory || '');
  const fullStoryText = String(previousStory || '').trim();
  
  const prompt = `你是 Renaiss 世界的冒險策劃師，設計的選項要有創意、刺激。
風格限制：原創科幻生態敘事，禁止武俠語氣，禁止既有 IP 名詞（寶可夢、數碼寶貝、斗羅大陸等）。

【當前情境】
位置：${location} - ${locDesc}
區域資訊：${locContext || `${locProfile?.region || '未知'} / 難度D${locProfile?.difficulty || 3}`}
附近可互動地點：${nearbyHint}
附近傳送門可通往：${portalHint}
玩家：${playerName}
寵物：${petName}
當地NPC：${npcStatusText || '沒有人'}
語言設定：${playerLang}
${memorySection}

【完整故事全文（必讀）】
${fullStoryText || '（無）'}

【前面的故事（開頭重點）】
${storyFocus.lead || '（無）'}

【前面的故事（結尾重點，優先對齊）】
${storyFocus.tail || '（無）'}

【最後一句（最高優先）】
${storyFocus.closing || '（無）'}

【任務】
根據上面的故事，生成7個獨特的冒險選項。${langInstruction}。要求：
1. 每個選項要有創意！拒絕無聊！
2. 要符合故事的劇情發展
3. 每個選項格式：「[風險標籤] 具體動作：20字內描述」
4. 至少 2 個選項要直接回應「結尾重點/最後一句」裡的當前威脅或人物

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
3. 若故事結尾出現殺手/攔截/殺機/危機等威脅，至少要有：
   - 1 個立即戰鬥選項（句尾含「（會進入戰鬥）」）
   - 1 個非戰鬥應對選項（例如佈防、談判、撤離、求援）

禁止出現：打坐修煉、隨便逛逛、原地休息這類選項！
也禁止出現武俠詞彙：江湖、俠客、門派、武功、內力。

${langInstruction}輸出7個選項，每行一個。例如：
[⚔️會戰鬥] 衝上去阻止：飛身撲向失控的飛行器（會進入戰鬥）
[🔥高風險] 追進暗巷：代價不明但可能有好處
[🤝需社交] 直接詢問：禮貌地向對方表明來意
[🔍需探索] 搜索周圍：檢查附近的線索
[🎁高回報] 接受交易：對方開出的條件很誘人
[💰需花錢] 購買物資：在商店補充必需品
[❓有驚喜] 嘗試呼喚：看寵物感應到了什麼`;

  try {
    const result = await callAI(prompt, 1.0, {
      label: 'generateChoicesWithAI',
      model: MINIMAX_MODEL,
      maxTokens: 700,
      timeoutMs: CHOICE_TIMEOUT_MS,
      retries: 2
    });

    const choices = [];
    const normalizedResult = normalizeOutputByLanguage(result, playerLang);
    const lines = normalizedResult.split('\n').filter(line => line.trim());

    for (const line of lines.slice(0, 7)) {
      // 解析格式：「[標籤] 動作：描述」
      const tagMatch = line.match(/\[([^\]]+)\]\s*(.+?)[：:]\s*(.+)/);

      if (tagMatch) {
        const tag = tagMatch[1];
        const action = tagMatch[2].trim();
        const desc = tagMatch[3].trim();

        // 過濾無聊選項
        const boring = ['打坐', '修煉', '隨便', '逛逛', '休息', '原地', '隨意'];
        if (boring.some(b => action.includes(b) || desc.includes(b))) {
          continue;
        }

        if (action && desc) {
          choices.push(normalizeChoiceByLanguage({
            name: action,
            choice: desc,
            desc: desc,
            tag: `[${tag}]`
          }, playerLang));
        }
      } else {
        // 如果解析失敗，用簡單格式
        const content = line.replace(/^\d+\.?\s*/, '').trim();
        if (content && content.length > 5 && !content.includes('打坐') && !content.includes('修煉')) {
          choices.push(normalizeChoiceByLanguage({
            name: content.substring(0, 15),
            choice: content,
            desc: content,
            tag: '[❓有驚喜]'
          }, playerLang));
        }
      }
    }

    if (choices.length < 5) {
      throw new Error(`choices too few: ${choices.length}`);
    }
    const normalized = choices.slice(0, 7).map(c => normalizeChoiceByLanguage(c, playerLang));
    const withMarket = await injectSystemChoicesSafely(normalized, { playerLang, location });
    const finalChoices = enforceThreatChoiceContinuity(withMarket, previousStory || '', playerLang);
    console.log(`[AI][generateChoicesWithAI] total ${Date.now() - startedAt}ms`);
    return finalChoices;
  } catch (e) {
    console.error('[AI] 生成選項失敗:', e.message);
    throw new Error(`AI choice generation failed (no fallback choices): ${e?.message || e}`);
  }
}

// ========== 初始選項生成（開場用）============
async function generateInitialChoices(player, pet) {
  const startedAt = Date.now();
  const location = player.location || '河港鎮';
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座奇幻城市';
  const locProfile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const locContext = typeof getLocationStoryContext === 'function' ? getLocationStoryContext(location) : '';
  const nearbyPoints = typeof getNearbyPoints === 'function' ? getNearbyPoints(location, 4) : [];
  const nearbyHint = nearbyPoints.length > 0 ? nearbyPoints.join('、') : '周遭地標資訊不足';
  const portalDestinations = typeof getPortalDestinations === 'function' ? getPortalDestinations(location) : [];
  const portalHint = portalDestinations.length > 0 ? portalDestinations.slice(0, 4).join('、') : '附近沒有穩定傳送門';
  const petName = pet?.name || '寵物';
  const playerName = player.name || '冒險者';
  const npcs = RENAISS_NPCS[location] || [];
  
  let npcStatusText = '';
  for (const npc of npcs) {
    npcStatusText += `${npc.name}、`;
  }
  
  const playerLang = player?.language || 'zh-TW';
  const langInstruction = {
    'zh-TW': '請用繁體中文輸出',
    'zh-CN': '請用簡體中文輸出',
    'en': 'Please output in English'
  }[playerLang] || '請用繁體中文輸出';
  
  const prompt = `你是 Renaiss 世界的冒險策劃師，設計開場選項要有吸引力。
風格限制：原創科幻生態敘事，禁止武俠語氣，禁止既有 IP 名詞（寶可夢、數碼寶貝、斗羅大陸等）。

【開場情境】
位置：${location} - ${locDesc}
區域資訊：${locContext || `${locProfile?.region || '未知'} / 難度D${locProfile?.difficulty || 3}`}
附近可互動地點：${nearbyHint}
附近傳送門可通往：${portalHint}
玩家：${playerName}
寵物：${petName}
當地NPC：${npcStatusText || '沒有重要NPC'}
語言設定：${playerLang}

【任務】
玩家剛來到${location}，請設計7個吸引人的冒險選項。${langInstruction}。要求：
1. 每個選項要有創意、有畫面感
2. 不要無聊選項
3. 每個選項格式：「[風險標籤] 具體動作：20字內描述」
4. 禁止出現武俠詞彙：江湖、俠客、門派、武功、內力、修煉、打坐

風險標籤：
- [🔥高風險] - 可能危險
- [💰需花錢] - 需要金錢
- [🤝需社交] - 需要交談
- [🔍需探索] - 需要探索
- [⚔️會戰鬥] - 衝突升高（不一定立刻戰鬥）
- [🎁高回報] - 回報豐厚
- [❓有驚喜] - 結果未知

規則補充：
1. 真正會立刻戰鬥的選項，句尾要加「（會進入戰鬥）」。
2. [⚔️會戰鬥] 多數是衝突鋪陳，不要全部都即時開打。

${langInstruction}輸出7個選項，每行一個。例如：
[🔍需探索] 走進維修站：看看有沒有高科技道具
[🤝需社交] 參觀商店：和店主聊聊最近的傳聞
[⚔️會戰鬥] 參加比武：廣場有寵物對戰賽事（會進入戰鬥）
[🎁高回報] 打聽懸賞：找到能賺大錢的任務
[❓有驚喜] 找人問路：隨機找個路人攀談
[💰需花錢] 購買裝備：去裝備店武裝自己
[🔥高風險] 探索禁區：據說那裡有寶藏`;

  try {
    const result = await callAI(prompt, 1.0, {
      label: 'generateInitialChoices',
      maxTokens: 700,
      timeoutMs: CHOICE_TIMEOUT_MS,
      retries: 2
    });

    const choices = [];
    const normalizedResult = normalizeOutputByLanguage(result, playerLang);
    const lines = normalizedResult.split('\n').filter(line => line.trim());

    for (const line of lines.slice(0, 7)) {
      const tagMatch = line.match(/\[([^\]]+)\]\s*(.+?)[：:]\s*(.+)/);

      if (tagMatch) {
        const tag = tagMatch[1];
        const action = tagMatch[2].trim();
        const desc = tagMatch[3].trim();

        const boring = ['打坐', '修煉', '隨便', '逛逛', '休息', '原地', '隨意'];
        if (boring.some(b => action.includes(b) || desc.includes(b))) {
          continue;
        }

        if (action && desc) {
          choices.push(normalizeChoiceByLanguage({ name: action, choice: desc, desc: desc, tag: `[${tag}]` }, playerLang));
        }
      }
    }

    if (choices.length < 5) {
      throw new Error(`initial choices too few: ${choices.length}`);
    }
    const normalized = choices.slice(0, 7).map(c => normalizeChoiceByLanguage(c, playerLang));
    const finalChoices = await injectSystemChoicesSafely(normalized, { playerLang, location });
    console.log(`[AI][generateInitialChoices] total ${Date.now() - startedAt}ms`);
    return finalChoices;
  } catch (e) {
    console.error('[AI] 生成開場選項失敗:', e.message);
    throw new Error(`AI initial choice generation failed (no fallback choices): ${e?.message || e}`);
  }
}

module.exports = {
  generateStory,
  generateChoicesWithAI,
  generateInitialChoices,
  RENAISS_NPCS,
  RENAISS_LOCATIONS
};
