/**
 * 💹 Renaiss 經濟系統
 * - 產生戰利品/資源品
 * - 正反派鑑價
 * - 出售結算
 */

const { getLocationDifficulty } = require('./world-map');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROTECTED_ITEMS = new Set(['乾糧一包', '水囊']);

const RARITY_WEIGHTS = [
  { key: '普通', baseWeight: 58, multiplier: 1.0 },
  { key: '精良', baseWeight: 24, multiplier: 1.45 },
  { key: '稀有', baseWeight: 12, multiplier: 2.2 },
  { key: '史詩', baseWeight: 5, multiplier: 3.6 },
  { key: '傳說', baseWeight: 1, multiplier: 6.2 }
];

const APPRAISERS = {
  renaiss: {
    npcName: '艾洛・Renaiss鑑價員',
    personality: '審慎、透明、偏重公道與長期信任',
    styleGuide: '語氣專業克制，會解釋估值依據，不誇大承諾',
    minRate: 0.92,
    maxRate: 1.08
  },
  digital: {
    npcName: '摩爾・Digital鑑價員',
    personality: '圓滑狡黠、擅長話術與心理施壓',
    styleGuide: '話要好聽、畫大餅、包裝低價為機會，避免直接承認壓價',
    minRate: 0.45,
    maxRate: 0.72
  }
};

const RARE_PLANTS = ['月影蘭', '霜焰花', '星沙藤', '赤霞芝', '碧麟草'];
const RARE_ORES = ['天隕鐵', '蒼銀礦', '黑曜髓晶', '靈脈銅', '鳳鳴金'];
const TROPHY_PREFIX = ['裂痕', '燃霜', '幽鋒', '荒潮', '銀葬', '玄骨'];
const MAX_APPRAISAL_HISTORY = 28;
const MINIMAX_MODEL = 'MiniMax-M2.5';
const AI_TIMEOUT_MS = 12000;
const SCRATCH_STATE_FILE = path.join(__dirname, 'data', 'scratch_lottery.json');
const SCRATCH_COST = 100;
const SCRATCH_WIN_RATE = 0.3;
const SCRATCH_WIN_REWARD = 500;
const DIGITAL_MASK_TURNS = Math.max(1, Number(process.env.DIGITAL_MASK_TURNS || 12));

function ensurePlayerEconomy(player) {
  if (!player || typeof player !== 'object') return;
  if (!Array.isArray(player.tradeGoods)) player.tradeGoods = [];
  if (!player.marketState || typeof player.marketState !== 'object') {
    player.marketState = {
      lastSkillLicenseDay: 0,
      renaissVisits: 0,
      digitalVisits: 0
    };
  }
  if (!Number.isFinite(Number(player.marketState.lastSkillLicenseDay))) player.marketState.lastSkillLicenseDay = 0;
  if (!Number.isFinite(Number(player.marketState.renaissVisits))) player.marketState.renaissVisits = 0;
  if (!Number.isFinite(Number(player.marketState.digitalVisits))) player.marketState.digitalVisits = 0;
  if (!Number.isFinite(Number(player.marketState.digitalRiskScore))) player.marketState.digitalRiskScore = 0;
  if (!Array.isArray(player.marketState.appraisalHistory)) player.marketState.appraisalHistory = [];
  if (!player.stats) player.stats = {};
  if (!Number.isFinite(Number(player.stats.財富))) player.stats.財富 = 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function isDigitalMaskPhase(player) {
  return Number(player?.storyTurns || 0) <= DIGITAL_MASK_TURNS;
}

function getRecentHistoryByMarket(player, marketType = 'renaiss', limit = 2) {
  ensurePlayerEconomy(player);
  return (player.marketState.appraisalHistory || [])
    .filter(entry => entry && entry.marketType === marketType)
    .slice(0, Math.max(1, Number(limit) || 2));
}

function formatHistoryRecall(player, marketType = 'renaiss') {
  const recent = getRecentHistoryByMarket(player, marketType, 2);
  if (recent.length === 0) {
    return marketType === 'digital'
      ? '第一次合作我會幫你快速處理這批貨，流程絕對漂亮。'
      : '初次合作，我會把你的貨按規格逐件評估。';
  }
  const last = recent[0];
  const avgRatePct = Math.round(Number(last.avgRate || 1) * 100);
  if (marketType === 'digital') {
    return `上次你在 Day ${last.worldDay} 讓我處理 ${last.soldCount} 件，結算 ${last.quotedTotal} Rns 代幣；這次我再幫你「優化」一次。`;
  }
  return `我記得你上次 Day ${last.worldDay} 出貨 ${last.soldCount} 件，結算 ${last.quotedTotal} Rns 代幣（估值率約 ${avgRatePct}%）。`;
}

function buildDigitalRiskHint(riskScore) {
  const score = clamp(riskScore, 0, 100);
  if (score >= 80) return '你幾乎能確認：對方長期用話術壓價。';
  if (score >= 60) return '你開始抓到規律：他常把價格壓在你不容易察覺的區間。';
  if (score >= 35) return '你隱約察覺報價偏低，但對方總能把理由說得很好聽。';
  if (score >= 15) return '你感覺哪裡怪怪的，卻一時找不出破綻。';
  return '目前你還看不清其中的價差套路。';
}

function computeDigitalRiskDelta(fairTotal, quotedTotal, soldCount) {
  const fair = Math.max(1, Number(fairTotal || 1));
  const quoted = Math.max(0, Number(quotedTotal || 0));
  const underpayRatio = clamp(1 - quoted / fair, 0, 1);
  const loadFactor = clamp((Number(soldCount || 0) / 12), 0, 1);
  const delta = Math.round(underpayRatio * 22 + loadFactor * 6);
  return Math.max(0, delta);
}

function appendAppraisalHistory(player, entry) {
  ensurePlayerEconomy(player);
  const history = player.marketState.appraisalHistory;
  history.unshift(entry);
  if (history.length > MAX_APPRAISAL_HISTORY) history.length = MAX_APPRAISAL_HISTORY;
}

function loadScratchState() {
  if (!fs.existsSync(SCRATCH_STATE_FILE)) {
    return {
      jackpotPool: 0,
      plays: 0,
      wins: 0,
      losses: 0,
      updatedAt: Date.now()
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(SCRATCH_STATE_FILE, 'utf8'));
    return {
      jackpotPool: Math.max(0, Number(parsed?.jackpotPool || 0)),
      plays: Math.max(0, Number(parsed?.plays || 0)),
      wins: Math.max(0, Number(parsed?.wins || 0)),
      losses: Math.max(0, Number(parsed?.losses || 0)),
      updatedAt: Number(parsed?.updatedAt || Date.now())
    };
  } catch {
    return {
      jackpotPool: 0,
      plays: 0,
      wins: 0,
      losses: 0,
      updatedAt: Date.now()
    };
  }
}

function saveScratchState(state) {
  const dir = path.dirname(SCRATCH_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const safe = {
    jackpotPool: Math.max(0, Number(state?.jackpotPool || 0)),
    plays: Math.max(0, Number(state?.plays || 0)),
    wins: Math.max(0, Number(state?.wins || 0)),
    losses: Math.max(0, Number(state?.losses || 0)),
    updatedAt: Date.now()
  };
  fs.writeFileSync(SCRATCH_STATE_FILE, JSON.stringify(safe, null, 2));
  return safe;
}

function playScratchLottery(player) {
  ensurePlayerEconomy(player);
  const state = loadScratchState();
  const currentGold = Number(player?.stats?.財富 || 0);

  if (currentGold < SCRATCH_COST) {
    return {
      success: false,
      type: 'scratch_lottery',
      cost: SCRATCH_COST,
      reward: 0,
      win: false,
      jackpotPool: state.jackpotPool,
      message: `🎟️ 小賣部老闆搖頭：刮刮樂要 ${SCRATCH_COST} Rns 代幣，你目前只有 ${currentGold} Rns 代幣。`
    };
  }

  player.stats.財富 = currentGold - SCRATCH_COST;
  state.plays += 1;

  const win = Math.random() < SCRATCH_WIN_RATE;
  let reward = 0;
  if (win) {
    reward = SCRATCH_WIN_REWARD;
    player.stats.財富 += reward;
    state.wins += 1;
  } else {
    state.losses += 1;
    state.jackpotPool += SCRATCH_COST;
  }

  const saved = saveScratchState(state);
  const net = reward - SCRATCH_COST;
  return {
    success: true,
    type: 'scratch_lottery',
    cost: SCRATCH_COST,
    reward,
    net,
    win,
    jackpotPool: saved.jackpotPool,
    message: win
      ? `🎟️ 你刮中了！本次投入 ${SCRATCH_COST} Rns 代幣，回收 ${reward} Rns 代幣（淨 +${net}）。`
      : `🎟️ 未中獎。本次投入 ${SCRATCH_COST} Rns 代幣已投入獎池。`
  };
}

function randInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function pickOne(arr, fallback = '') {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}

function requestMiniMax(body, apiKey, timeoutMs = AI_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.minimax.io',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`MiniMax HTTP ${res.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const statusCode = Number(parsed?.base_resp?.status_code ?? 0);
          if (!Number.isNaN(statusCode) && statusCode !== 0) {
            reject(new Error(parsed?.base_resp?.status_msg || `MiniMax status_code=${statusCode}`));
            return;
          }
          const content = parsed?.choices?.[0]?.message?.content;
          const text = typeof content === 'string'
            ? content.trim()
            : Array.isArray(content)
              ? content.map(item => (typeof item === 'string' ? item : item?.text || item?.content || '')).join('\n').trim()
              : String(content || '').trim();
          if (!text) {
            reject(new Error('MiniMax empty content'));
            return;
          }
          resolve(text);
        } catch (e) {
          reject(new Error(`MiniMax parse failed: ${e?.message || e}`));
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`MiniMax timeout ${timeoutMs}ms`)));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function generateAppraiserPitch(options = {}) {
  const apiKey = String(process.env.MINIMAX_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY missing for dynamic appraisal pitch');
  }
  const marketType = options.marketType === 'digital' ? 'digital' : 'renaiss';
  const appraiser = APPRAISERS[marketType] || APPRAISERS.renaiss;
  const playerName = String(options.playerName || '旅人');
  const location = String(options.location || '未知地點');
  const soldCount = Number(options.soldCount || 0);
  const total = Number(options.total || 0);
  const avgRate = Number(options.avgRate || 1);
  const historyRecall = String(options.historyRecall || '');
  const riskScore = Number(options.digitalRiskScore || 0);
  const digitalMasked = Boolean(options.digitalMasked);
  const lang = String(options.playerLang || 'zh-TW');
  const languageRule = lang === 'en'
    ? 'Please output in English.'
    : lang === 'zh-CN'
      ? '请使用简体中文输出。'
      : '請使用繁體中文輸出。';
  const marketLens = marketType === 'digital'
    ? (
      digitalMasked
        ? `市場屬性：新手友善估值窗口（外在親切、快速成交）\n市場異常指標：${riskScore}/100`
        : `市場屬性：反派賣場（偏向低估玩家貨物）\nDigital 風險值：${riskScore}/100`
    )
    : '市場屬性：Renaiss 商城（偏向公道估值）';

  const prompt = `你要扮演遊戲中的鑑價 NPC 並產生一段即時台詞（僅一段，不要條列）。

【NPC】
名字：${appraiser.npcName}
人格：${appraiser.personality}
說話規範：${appraiser.styleGuide}

【玩家與交易】
玩家：${playerName}
地點：${location}
本次件數：${soldCount}
本次結算：${total} Rns 代幣
平均估值率：約 ${Math.round(avgRate * 100)}%
上次互動摘要：${historyRecall || '無'}
${marketLens}

【輸出要求】
1. 40~90字。
2. 必須像真人談判，不要模板腔。
3. ${marketType === 'digital'
    ? (digitalMasked
      ? 'Digital 版本在新手期必須像熱心店員，先營造友善與照顧新手感。'
      : 'Digital 版本必須有「聽起來對玩家好、實際偏向鑑價員」的話術。')
    : '語氣要專業而透明。'}
4. 不要使用引號，不要加 NPC 名稱前綴。
5. ${languageRule}`;

  const body = JSON.stringify({
    model: MINIMAX_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.95,
    top_p: 0.9,
    max_tokens: 220
  });
  const raw = await requestMiniMax(body, apiKey, AI_TIMEOUT_MS);
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  if (cleaned.length < 12) {
    throw new Error('Appraiser pitch too short');
  }
  return cleaned.slice(0, 180);
}

function rollRarity(luck = 50, difficulty = 3) {
  const bonus = (Number(luck || 50) - 50) * 0.12 + (Number(difficulty || 3) - 3) * 2.8;
  const bag = RARITY_WEIGHTS.map((r) => ({
    ...r,
    weight: Math.max(0.2, r.baseWeight + (r.key === '普通' ? -bonus : bonus * (r.key === '傳說' ? 0.18 : 0.08)))
  }));
  const total = bag.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of bag) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return bag[0];
}

function normalizeValue(baseValue, rarityKey, rarityMultiplier) {
  const base = Math.max(5, Number(baseValue || 5));
  const withRarity = Math.round(base * Number(rarityMultiplier || 1));
  const rarityBonus = rarityKey === '傳說' ? randInt(35, 65) : rarityKey === '史詩' ? randInt(18, 30) : 0;
  return Math.max(5, withRarity + rarityBonus);
}

function makeTradeGood(name, category, rarity, value, origin, desc = '') {
  return {
    id: `good_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    category,
    rarity,
    value: Math.max(1, Math.floor(value)),
    origin: origin || '未知來源',
    desc: desc || '',
    createdAt: Date.now()
  };
}

function addTradeGood(player, good) {
  ensurePlayerEconomy(player);
  if (!good || typeof good !== 'object') return null;
  player.tradeGoods.unshift(good);
  if (player.tradeGoods.length > 160) player.tradeGoods.length = 160;
  return good;
}

function createCombatLoot(enemy, location = '', luck = 50) {
  const enemyName = String(enemy?.name || '敵人').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '') || '敵人';
  const difficulty = getLocationDifficulty(location);
  const rarity = rollRarity(luck, difficulty);
  const base = 22 + difficulty * 12 + randInt(6, 24);
  const value = normalizeValue(base, rarity.key, rarity.multiplier);
  const type = pickOne(['戰利品', '怪物素材', '殘件'], '戰利品');
  const name = `${pickOne(TROPHY_PREFIX, '碎影')}${enemyName}${pickOne(['徽章', '碎片', '核心', '爪痕', '殘晶'], '碎片')}`;
  return makeTradeGood(name, type, rarity.key, value, `${location} 戰鬥掉落`, `從 ${enemyName} 身上取得的戰鬥證物。`);
}

function createForageLoot(location = '', luck = 50) {
  const difficulty = getLocationDifficulty(location);
  const rarity = rollRarity(luck, Math.max(2, difficulty));
  const herbName = pickOne(RARE_PLANTS, '野生草藥');
  const base = 15 + difficulty * 8 + randInt(4, 18);
  const value = normalizeValue(base, rarity.key, rarity.multiplier);
  return makeTradeGood(herbName, '草藥', rarity.key, value, `${location} 採集`, '可作煉藥或交易素材。');
}

function createHuntLoot(animalName = '獵物', location = '', luck = 50) {
  const difficulty = getLocationDifficulty(location);
  const rarity = rollRarity(luck, difficulty);
  const base = 18 + difficulty * 9 + randInt(5, 20);
  const value = normalizeValue(base, rarity.key, rarity.multiplier);
  const name = `${animalName} ${pickOne(['皮毛', '角質', '精肉', '腺囊'], '素材')}`;
  return makeTradeGood(name, '獵物', rarity.key, value, `${location} 狩獵`, '新鮮獵獲，適合賣給行商或廚商。');
}

function createTreasureLoot(location = '', luck = 50) {
  const difficulty = Math.max(3, getLocationDifficulty(location));
  const rarity = rollRarity(luck + 10, difficulty + 1);
  const base = 55 + difficulty * 16 + randInt(20, 50);
  const value = normalizeValue(base, rarity.key, rarity.multiplier);
  const treasureName = `${pickOne(RARE_ORES, '古礦石')}${pickOne(['原礦', '晶核', '斷片', '紋印'], '原礦')}`;
  return makeTradeGood(treasureName, '寶藏', rarity.key, value, `${location} 探索`, '高價值稀有素材。');
}

function estimateLooseItemValue(name = '') {
  const text = String(name || '');
  let value = 18;
  if (/靈芝|人參|雪蓮|仙草|稀有|秘笈|核心|晶|寶|礦/.test(text)) value += 65;
  if (/肉|魚|野兔|野雞|野豬|鹿/.test(text)) value += 18;
  if (/毒|斷腸|曼陀羅/.test(text)) value += 12;
  if (/乾糧|水囊/.test(text)) value = 5;
  return value;
}

function buildSellables(player, worldDay = 1) {
  ensurePlayerEconomy(player);
  const sellables = [];

  for (const good of player.tradeGoods) {
    sellables.push({
      type: 'tradeGood',
      name: good.name,
      rarity: good.rarity || '普通',
      value: Math.max(1, Number(good.value || 1))
    });
  }

  for (const herb of (player.herbs || [])) {
    sellables.push({
      type: 'herb',
      name: herb,
      rarity: /稀有|靈|仙|神/.test(String(herb || '')) ? '稀有' : '普通',
      value: estimateLooseItemValue(herb)
    });
  }

  for (const item of (player.inventory || [])) {
    if (PROTECTED_ITEMS.has(item)) continue;
    sellables.push({
      type: 'inventory',
      name: item,
      rarity: /秘|寶|稀有|傳說/.test(String(item || '')) ? '精良' : '普通',
      value: estimateLooseItemValue(item)
    });
  }

  if (Number(worldDay || 1) > Number(player.marketState.lastSkillLicenseDay || 0)) {
    const skillEntries = Object.entries(player.skills || {})
      .map(([name, meta]) => ({
        name,
        proficiency: Number(meta?.proficiency || 0),
        realm: String(meta?.realm || '入門')
      }))
      .sort((a, b) => b.proficiency - a.proficiency)
      .slice(0, 2);
    for (const skill of skillEntries) {
      const base = 60 + Math.floor(skill.proficiency / 25);
      const realmBonus = /頂尖|傳說/.test(skill.realm) ? 70 : /大師/.test(skill.realm) ? 35 : 10;
      sellables.push({
        type: 'skill_license',
        name: `${skill.name}授權卷`,
        rarity: /頂尖|傳說/.test(skill.realm) ? '史詩' : /大師/.test(skill.realm) ? '稀有' : '精良',
        value: base + realmBonus
      });
    }
  }

  return sellables;
}

function appraiseValue(base, marketType) {
  const appraiser = APPRAISERS[marketType] || APPRAISERS.renaiss;
  const rate = appraiser.minRate + Math.random() * (appraiser.maxRate - appraiser.minRate);
  return Math.max(1, Math.floor(base * rate));
}

async function sellPlayerAtMarket(player, marketType = 'renaiss', options = {}) {
  ensurePlayerEconomy(player);
  const digitalMasked = marketType === 'digital' && isDigitalMaskPhase(player);
  const baseAppraiser = APPRAISERS[marketType] || APPRAISERS.renaiss;
  const appraiser = marketType === 'digital' && digitalMasked
    ? {
      ...baseAppraiser,
      npcName: '摩爾・民生估值員',
      personality: '熱心親切、強調效率與照顧新手',
      styleGuide: '語氣友善，主打先幫你省時間與建立信任'
    }
    : baseAppraiser;
  const worldDay = Number(options.worldDay || 1);
  const sellables = buildSellables(player, worldDay);

  if (sellables.length === 0) {
    const emptyPitch = await generateAppraiserPitch({
      marketType,
      playerName: player.name || '旅人',
      location: player.location || '',
      soldCount: 0,
      total: 0,
      avgRate: 1,
      historyRecall: formatHistoryRecall(player, marketType),
      digitalRiskScore: Number(player.marketState.digitalRiskScore || 0),
      digitalMasked,
      playerLang: player.language || 'zh-TW'
    });
    return {
      totalGold: 0,
      soldCount: 0,
      npcName: appraiser.npcName,
      digitalMasked,
      message: `🏪 ${appraiser.npcName}：${emptyPitch}`
    };
  }

  const lines = [];
  let total = 0;
  let fairTotal = 0;
  for (const item of sellables) {
    fairTotal += Math.max(1, Number(item.value || 1));
    const quote = appraiseValue(item.value, marketType);
    total += quote;
    if (lines.length < 6) {
      lines.push(`• ${item.name}（${item.rarity}）→ ${quote} Rns 代幣`);
    }
  }

  player.tradeGoods = [];
  player.herbs = [];
  player.inventory = (player.inventory || []).filter(item => PROTECTED_ITEMS.has(item));
  player.marketState.lastSkillLicenseDay = worldDay;
  if (marketType === 'digital') player.marketState.digitalVisits = Number(player.marketState.digitalVisits || 0) + 1;
  if (marketType === 'renaiss') player.marketState.renaissVisits = Number(player.marketState.renaissVisits || 0) + 1;
  player.stats.財富 = Number(player.stats.財富 || 0) + total;

  const avgRate = Math.max(0.01, total / Math.max(1, fairTotal));
  const historyRecall = formatHistoryRecall(player, marketType);
  let digitalRiskDelta = 0;
  if (marketType === 'digital') {
    digitalRiskDelta = computeDigitalRiskDelta(fairTotal, total, sellables.length);
    player.marketState.digitalRiskScore = clamp(
      Number(player.marketState.digitalRiskScore || 0) + digitalRiskDelta,
      0,
      100
    );
  } else {
    // 在公道市場交易會讓玩家逐步校準價格認知，緩慢降低詐價風險指標
    player.marketState.digitalRiskScore = clamp(
      Number(player.marketState.digitalRiskScore || 0) - randInt(3, 8),
      0,
      100
    );
  }

  appendAppraisalHistory(player, {
    worldDay,
    marketType,
    soldCount: sellables.length,
    fairTotal,
    quotedTotal: total,
    avgRate,
    riskScoreAfter: Number(player.marketState.digitalRiskScore || 0),
    timestamp: Date.now()
  });

  const pitch = await generateAppraiserPitch({
    marketType,
    playerName: player.name || '旅人',
    location: player.location || '',
    soldCount: sellables.length,
    total,
    avgRate,
    historyRecall,
    digitalRiskScore: Number(player.marketState.digitalRiskScore || 0),
    digitalMasked,
    playerLang: player.language || 'zh-TW'
  });
  const biasNote = marketType === 'digital'
    ? (digitalMasked
      ? '（報價看似照顧新手，細節仍待你自行比對。）'
      : '（你隱約覺得這價不太對，但他說得很有道理。）')
    : '（報價透明，含稀有度與來源加權。）';
  const digitalRiskScore = Number(player.marketState.digitalRiskScore || 0);
  const digitalRiskHint = buildDigitalRiskHint(digitalRiskScore);
  const riskLine = marketType === 'digital'
    ? (digitalMasked
      ? `\n🧠 市場異常指標：${digitalRiskScore}/100（本次 +${digitalRiskDelta}）\n📌 ${digitalRiskHint}`
      : `\n⚠️ Digital 詐價風險提示累積值：${digitalRiskScore}/100（本次 +${digitalRiskDelta}）\n🧠 ${digitalRiskHint}`)
    : `\n🧠 Digital 詐價風險提示累積值：${digitalRiskScore}/100（在公道市場交易後已微幅校準）`;

  return {
    totalGold: total,
    soldCount: sellables.length,
    npcName: appraiser.npcName,
    marketType,
    digitalMasked,
    historyRecall,
    avgRate,
    digitalRiskScore,
    digitalRiskDelta,
    riskHint: digitalRiskHint,
    lines,
    message:
      `🏪 ${appraiser.npcName}：${pitch}\n` +
      `💬 ${historyRecall}\n` +
      `${lines.join('\n')}\n` +
      `\n本次結算：+${total} Rns 代幣（共 ${sellables.length} 件）\n${biasNote}`
      + riskLine
  };
}

module.exports = {
  ensurePlayerEconomy,
  addTradeGood,
  createCombatLoot,
  createForageLoot,
  createHuntLoot,
  createTreasureLoot,
  sellPlayerAtMarket,
  playScratchLottery
};
