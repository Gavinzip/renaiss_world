const https = require('https');

const MINIMAX_MODEL = String(process.env.EQUIPMENT_FUSION_MODEL || 'MiniMax-M2.5');
const FUSION_TIMEOUT_MS = Math.max(4000, Number(process.env.EQUIPMENT_FUSION_TIMEOUT_MS || 9000));
const FUSION_MAX_RETRIES = Math.max(1, Number(process.env.EQUIPMENT_FUSION_MAX_RETRIES || 3));

const EQUIPMENT_SLOTS = ['helmet', 'armor', 'shoes'];
const EQUIPMENT_SLOT_LABELS = Object.freeze({
  helmet: '頭盔',
  armor: '盔甲',
  shoes: '鞋子'
});
const EQUIPMENT_SLOT_ALIAS = Object.freeze({
  helmet: 'helmet',
  頭盔: 'helmet',
  帽子: 'helmet',
  armor: 'armor',
  盔甲: 'armor',
  護甲: 'armor',
  胸甲: 'armor',
  shoes: 'shoes',
  鞋子: 'shoes',
  靴子: 'shoes'
});
const EQUIPMENT_SLOT_STAT_KEY = Object.freeze({
  helmet: 'attack',
  armor: 'hp',
  shoes: 'speed'
});

const EQUIPMENT_RARITY_ORDER = ['N', 'R', 'SR', 'SSR', 'UR'];
const EQUIPMENT_RARITY_ALIAS = Object.freeze({
  N: 'N',
  普通: 'N',
  COMMON: 'N',
  R: 'R',
  稀有: 'R',
  RARE: 'R',
  SR: 'SR',
  史詩: 'SR',
  EPIC: 'SR',
  SSR: 'SSR',
  傳說: 'SSR',
  LEGENDARY: 'SSR',
  UR: 'UR',
  神話: 'UR',
  MYTHIC: 'UR'
});
const EQUIPMENT_RARITY_LABELS = Object.freeze({
  N: 'N',
  R: 'R',
  SR: 'SR',
  SSR: 'SSR',
  UR: 'UR'
});

const EQUIPMENT_VALUE_RANGES = Object.freeze({
  N: { min: 80, max: 220 },
  R: { min: 220, max: 520 },
  SR: { min: 520, max: 980 },
  SSR: { min: 980, max: 1800 },
  UR: { min: 1800, max: 3200 }
});

const EQUIPMENT_STAT_RANGES = Object.freeze({
  helmet: {
    N: [2, 6],
    R: [6, 12],
    SR: [12, 20],
    SSR: [20, 30],
    UR: [30, 40]
  },
  armor: {
    N: [20, 50],
    R: [50, 90],
    SR: [90, 130],
    SSR: [130, 170],
    UR: [170, 220]
  },
  shoes: {
    N: [1, 2],
    R: [2, 3],
    SR: [3, 4],
    SSR: [4, 5],
    UR: [5, 6]
  }
});

// 這段就是獨立的融合 Agent 提示詞，後續你可直接改這裡微調風格與決策。
const EQUIPMENT_FUSION_SYSTEM_PROMPT = `你是 Renaiss 世界的「寶物融合裝備鍛造AI」。
你會根據 3 個素材的名稱與估值，生成 1 件裝備。

裝備規則：
1) slot 只能是 helmet / armor / shoes
2) rarity 只能是 N / R / SR / SSR / UR
3) helmet 代表攻擊型；armor 代表生命型；shoes 代表速度型
4) 請依世界觀產生有收藏科技感的名稱，不要與素材名稱完全重複
5) 回傳 JSON，禁止輸出任何額外說明文字`;

function clamp(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max, fallback = min) {
  return Math.floor(clamp(value, min, max, fallback));
}

function normalizeText(text = '', maxLen = 80) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, Math.max(1, Number(maxLen) || 80));
}

function parseJsonFromText(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return null;
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return null;
  }
}

function requestMiniMax(body, apiKey, timeoutMs = FUSION_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://api.minimax.io/v1/text/chatcompletion_v2',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        timeout: timeoutMs
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const text = parsed?.choices?.[0]?.message?.content || '';
            if (!text) {
              reject(new Error(`empty minimax content: ${res.statusCode}`));
              return;
            }
            resolve(String(text));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('fusion minimax timeout')));
    req.write(body);
    req.end();
  });
}

function normalizeSlot(raw = '') {
  const key = String(raw || '').trim();
  if (!key) return '';
  return EQUIPMENT_SLOT_ALIAS[key] || EQUIPMENT_SLOT_ALIAS[key.toLowerCase()] || '';
}

function normalizeRarity(raw = '') {
  const key = String(raw || '').trim();
  if (!key) return '';
  return EQUIPMENT_RARITY_ALIAS[key] || EQUIPMENT_RARITY_ALIAS[key.toUpperCase()] || '';
}

function calcHash(text = '') {
  let hash = 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function sanitizeEquipmentName(name = '', slot = 'helmet', rarity = 'N') {
  const text = normalizeText(name, 24).replace(/[「」『』《》【】]/g, '');
  if (text.length >= 2) return text;
  const fallback = {
    helmet: `${rarity} 星紋頭盔`,
    armor: `${rarity} 守脈盔甲`,
    shoes: `${rarity} 風域靴`
  };
  return fallback[slot] || `${rarity} 鍛造裝備`;
}

function sanitizeLore(text = '', slot = 'helmet') {
  const safe = normalizeText(text, 120);
  if (safe.length >= 8) return safe;
  const fallback = {
    helmet: '以碎片訊號重編而成，能放大攻擊節奏。',
    armor: '多層結構吸收衝擊，穩定生命循環。',
    shoes: '相位底板減少拖滯，提升移動與出手節奏。'
  };
  return fallback[slot] || '由三件寶物重構出的未知裝備。';
}

function derivePrimaryStat(slot = 'helmet', rarity = 'N', suggested = 0, seed = 0) {
  const range = EQUIPMENT_STAT_RANGES?.[slot]?.[rarity] || [1, 1];
  const [min, max] = range;
  const safeSuggested = Number(suggested);
  if (Number.isFinite(safeSuggested) && safeSuggested > 0) {
    return clampInt(Math.round(safeSuggested), min, max, min);
  }
  const span = Math.max(0, max - min);
  if (span <= 0) return min;
  return min + (Math.abs(Number(seed) || 0) % (span + 1));
}

function buildEquipmentStats(slot = 'helmet', primaryStat = 0) {
  const attack = slot === 'helmet' ? Math.max(0, Math.floor(primaryStat)) : 0;
  const hp = slot === 'armor' ? Math.max(0, Math.floor(primaryStat)) : 0;
  const speed = slot === 'shoes' ? Math.max(0, Math.floor(primaryStat)) : 0;
  return { attack, hp, speed };
}

function buildFusionPrompt(items = [], options = {}) {
  const location = normalizeText(options.location || '未知地點', 60);
  const playerName = normalizeText(options.playerName || '旅人', 60);
  const worldHint = normalizeText(options.worldHint || '科技收藏＋夥伴冒險＋群島探索', 200);
  const lang = String(options.lang || 'zh-TW');
  const languageRule = lang === 'en'
    ? 'Output all text fields in English.'
    : lang === 'zh-CN'
      ? '请使用简体中文输出文本字段。'
      : '請使用繁體中文輸出文字欄位。';
  const materialsText = items
    .map((row, idx) => `- #${idx + 1} 名稱:${normalizeText(row?.name || '未知素材', 80)}｜估值:${Math.max(1, Math.floor(Number(row?.value || 1)))}｜來源:${normalizeText(row?.source || 'inventory', 24)}`)
    .join('\n');

  return `${EQUIPMENT_FUSION_SYSTEM_PROMPT}

背景：
- 玩家：${playerName}
- 地點：${location}
- 世界觀基調：${worldHint}

輸入素材（固定三件）：
${materialsText}

請輸出 JSON 物件，欄位：
{
  "equipmentName": "裝備名稱",
  "slot": "helmet|armor|shoes",
  "rarity": "N|R|SR|SSR|UR",
  "value": 123,
  "primaryStat": 15,
  "lore": "一句裝備敘述"
}

補充限制：
1) slot=helmet 時 primaryStat 表示 attack
2) slot=armor 時 primaryStat 表示 hp
3) slot=shoes 時 primaryStat 表示 speed
4) rarity 與 value 要與三件素材整體價值合理對應
5) 只輸出 JSON，不要 markdown。
6) ${languageRule}`;
}

async function fuseTreasuresToEquipment(items = [], options = {}) {
  const materials = (Array.isArray(items) ? items : [])
    .slice(0, 3)
    .map((row) => ({
      name: normalizeText(row?.name || '未知素材', 80),
      value: Math.max(1, Math.floor(Number(row?.value || 1))),
      source: normalizeText(row?.source || 'inventory', 24)
    }));
  if (materials.length !== 3) {
    throw new Error('equipment fusion requires exactly 3 materials');
  }
  const apiKey = normalizeText(process.env.MINIMAX_API_KEY || '', 240);
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY missing');
  }

  const prompt = buildFusionPrompt(materials, options);
  const body = JSON.stringify({
    model: MINIMAX_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.95,
    top_p: 0.9,
    max_tokens: 260
  });

  let lastError = null;
  for (let attempt = 1; attempt <= FUSION_MAX_RETRIES; attempt += 1) {
    try {
      const raw = await requestMiniMax(body, apiKey, FUSION_TIMEOUT_MS);
      const parsed = parseJsonFromText(raw);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('fusion agent returned non-JSON payload');
      }

      const slot = normalizeSlot(parsed.slot);
      const rarity = normalizeRarity(parsed.rarity);
      if (!slot) throw new Error('fusion agent returned invalid slot');
      if (!rarity) throw new Error('fusion agent returned invalid rarity');
      const valueRange = EQUIPMENT_VALUE_RANGES[rarity] || EQUIPMENT_VALUE_RANGES.N;

      const rawValue = Number(parsed.value);
      if (!Number.isFinite(rawValue) || rawValue <= 0) {
        throw new Error('fusion agent returned invalid value');
      }
      const value = clampInt(
        Math.floor(rawValue),
        valueRange.min,
        valueRange.max,
        valueRange.min
      );

      const rawPrimary = Number(parsed.primaryStat);
      if (!Number.isFinite(rawPrimary) || rawPrimary <= 0) {
        throw new Error('fusion agent returned invalid primaryStat');
      }
      const primaryStat = derivePrimaryStat(
        slot,
        rarity,
        rawPrimary,
        calcHash(`${parsed.equipmentName || ''}|${value}|${slot}|${rarity}`)
      );
      const stats = buildEquipmentStats(slot, primaryStat);
      const equipment = {
        id: `eq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        name: sanitizeEquipmentName(parsed.equipmentName || parsed.name || '', slot, rarity),
        slot,
        rarity,
        value,
        stats,
        lore: sanitizeLore(parsed.lore || parsed.desc || '', slot),
        sourceMaterials: materials.map((row) => ({
          name: normalizeText(row?.name || '未知素材', 80),
          value: Math.max(1, Math.floor(Number(row?.value || 1))),
          source: normalizeText(row?.source || 'inventory', 24)
        })),
        createdAt: Date.now(),
        generatedBy: 'ai'
      };
      return { equipment, usedAI: true, raw, attempts: attempt };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`fusion generation failed after ${FUSION_MAX_RETRIES} attempts: ${String(lastError?.message || lastError || 'unknown error')}`);
}

function getEquipmentPowerScore(item = null) {
  if (!item || typeof item !== 'object') return 0;
  const stats = item.stats && typeof item.stats === 'object' ? item.stats : {};
  const rarity = normalizeRarity(item.rarity) || 'N';
  const rarityIndex = Math.max(0, EQUIPMENT_RARITY_ORDER.indexOf(rarity));
  const attack = Math.max(0, Number(stats.attack || 0));
  const hp = Math.max(0, Number(stats.hp || 0));
  const speed = Math.max(0, Number(stats.speed || 0));
  return attack * 3 + hp * 0.18 + speed * 8 + rarityIndex * 5;
}

function ensurePlayerEquipmentState(player) {
  if (!player || typeof player !== 'object') return false;
  let changed = false;
  if (!player.equipment || typeof player.equipment !== 'object' || Array.isArray(player.equipment)) {
    player.equipment = { helmet: null, armor: null, shoes: null };
    changed = true;
  } else {
    for (const slot of EQUIPMENT_SLOTS) {
      if (!(slot in player.equipment)) {
        player.equipment[slot] = null;
        changed = true;
      }
    }
  }
  if (!Array.isArray(player.equipmentBag)) {
    player.equipmentBag = [];
    changed = true;
  }
  return changed;
}

function addEquipmentToPlayer(player, equipment) {
  if (!player || !equipment || typeof equipment !== 'object') {
    return { success: false, equipped: false, replaced: null };
  }
  ensurePlayerEquipmentState(player);
  const slot = normalizeSlot(equipment.slot);
  if (!slot) return { success: false, equipped: false, replaced: null };

  const current = player.equipment[slot] && typeof player.equipment[slot] === 'object'
    ? player.equipment[slot]
    : null;
  const newScore = getEquipmentPowerScore(equipment);
  const oldScore = getEquipmentPowerScore(current);

  let equipped = false;
  let replaced = null;
  if (!current || newScore > oldScore) {
    if (current) {
      replaced = current;
      player.equipmentBag.unshift(current);
      if (player.equipmentBag.length > 120) player.equipmentBag.length = 120;
    }
    player.equipment[slot] = equipment;
    equipped = true;
  } else {
    player.equipmentBag.unshift(equipment);
    if (player.equipmentBag.length > 120) player.equipmentBag.length = 120;
  }
  return { success: true, equipped, replaced };
}

function getEquippedBonuses(player = null) {
  const out = { attack: 0, hp: 0, speed: 0 };
  if (!player || typeof player !== 'object') return out;
  const equipment = player.equipment && typeof player.equipment === 'object' ? player.equipment : {};
  for (const slot of EQUIPMENT_SLOTS) {
    const item = equipment[slot];
    if (!item || typeof item !== 'object') continue;
    const stats = item.stats && typeof item.stats === 'object' ? item.stats : {};
    out.attack += Math.max(0, Number(stats.attack || 0));
    out.hp += Math.max(0, Number(stats.hp || 0));
    out.speed += Math.max(0, Number(stats.speed || 0));
  }
  out.attack = Math.floor(out.attack);
  out.hp = Math.floor(out.hp);
  out.speed = Math.floor(out.speed);
  return out;
}

module.exports = {
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOT_STAT_KEY,
  EQUIPMENT_RARITY_ORDER,
  EQUIPMENT_RARITY_LABELS,
  EQUIPMENT_FUSION_SYSTEM_PROMPT,
  ensurePlayerEquipmentState,
  getEquippedBonuses,
  getEquipmentPowerScore,
  addEquipmentToPlayer,
  fuseTreasuresToEquipment
};
