const https = require('https');

const MINIMAX_MODEL = String(process.env.EQUIPMENT_FUSION_MODEL || 'MiniMax-M2.5');
const FUSION_TIMEOUT_RAW = Number(process.env.EQUIPMENT_FUSION_TIMEOUT_MS || 0);
const FUSION_TIMEOUT_MS = Number.isFinite(FUSION_TIMEOUT_RAW) ? Math.max(0, Math.floor(FUSION_TIMEOUT_RAW)) : 0;
const FUSION_MAX_RETRIES = Math.max(1, Number(process.env.EQUIPMENT_FUSION_MAX_RETRIES || 2));
const FUSION_AI_MAX_TOKENS_RAW = Number(process.env.EQUIPMENT_FUSION_MAX_TOKENS || 0);
const FUSION_AI_MAX_TOKENS = Number.isFinite(FUSION_AI_MAX_TOKENS_RAW) ? Math.max(0, Math.floor(FUSION_AI_MAX_TOKENS_RAW)) : 0;

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
const EQUIPMENT_FUSION_SYSTEM_PROMPT = '你是 Renaiss 裝備融合 AI。任務：根據三件素材輸出一個裝備 JSON。';

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

  const tryParse = (candidate = '') => {
    const source = String(candidate || '').trim();
    if (!source) return null;
    try {
      const obj = JSON.parse(source);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const blocks = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        blocks.push(cleaned.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const parsed = tryParse(blocks[i]);
    if (parsed) return parsed;
  }

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
    const requestOptions = {
      hostname: 'api.minimax.io',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    if (Number(timeoutMs) > 0) requestOptions.timeout = Number(timeoutMs);

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`minimax http ${res.statusCode}: ${String(data || '').slice(0, 220)}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed?.error) {
            reject(new Error(parsed.error.message || 'minimax api error'));
            return;
          }
          const statusCode = Number(parsed?.base_resp?.status_code);
          if (Number.isFinite(statusCode) && statusCode !== 0) {
            reject(new Error(String(parsed?.base_resp?.status_msg || `status_code=${statusCode}`)));
            return;
          }

          const message = parsed?.choices?.[0]?.message || {};
          const content = typeof message?.content === 'string' ? message.content : '';
          const reasoning = typeof message?.reasoning_content === 'string' ? message.reasoning_content : '';
          const text = String(content || '').trim() || String(reasoning || '').trim();
          if (!text) {
            reject(new Error('empty minimax content'));
            return;
          }
          resolve(String(text));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (Number(timeoutMs) > 0) {
      req.on('timeout', () => req.destroy(new Error('fusion minimax timeout')));
    }
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
  const lang = String(options.lang || 'zh-TW');
  const languageRule = lang === 'en'
    ? 'Output all text fields in English.'
    : lang === 'zh-CN'
      ? '请使用简体中文输出文本字段。'
      : '請使用繁體中文輸出文字欄位。';
  const materialsText = items.map((row, idx) =>
    `${idx + 1}. ${normalizeText(row?.name || '未知素材', 80)}|${Math.max(1, Math.floor(Number(row?.value || 1)))}|${normalizeText(row?.source || 'inventory', 24)}`
  ).join('\n');

  return [
    EQUIPMENT_FUSION_SYSTEM_PROMPT,
    `玩家=${playerName} 地點=${location}`,
    `素材:\n${materialsText}`,
    '只輸出 JSON（一行或多行都可），禁止任何解釋、前後綴、markdown。',
    'JSON schema: {"equipmentName":"名稱","slot":"helmet|armor|shoes","rarity":"N|R|SR|SSR|UR","value":123,"primaryStat":10,"lore":"敘述"}',
    '規則: slot=helmet=>attack; slot=armor=>hp; slot=shoes=>speed; rarity/value 需與素材估值相稱；名稱需有科技藏品感且不與素材名完全相同。',
    languageRule
  ].join('\n');
}

function stripNameCore(text = '') {
  return String(text || '').replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, '').trim();
}

function pickFallbackSlot(materials = [], options = {}) {
  const seed = calcHash(
    `${materials.map((m) => m?.name || '').join('|')}|${String(options?.location || '')}|${String(options?.playerName || '')}`
  );
  return EQUIPMENT_SLOTS[Math.abs(seed) % EQUIPMENT_SLOTS.length] || 'helmet';
}

function pickFallbackRarity(materials = []) {
  const total = materials.reduce((sum, row) => sum + Math.max(1, Number(row?.value || 1)), 0);
  const seed = calcHash(`${total}|${materials.map((m) => m?.name || '').join('|')}`);
  const roll = Math.abs(seed) % 1000; // 0..999

  const table = total < 240
    ? [['N', 740], ['R', 940], ['SR', 992], ['SSR', 999], ['UR', 1000]]
    : total < 520
      ? [['N', 500], ['R', 820], ['SR', 960], ['SSR', 997], ['UR', 1000]]
      : total < 980
        ? [['N', 320], ['R', 680], ['SR', 900], ['SSR', 985], ['UR', 1000]]
        : [['N', 200], ['R', 520], ['SR', 820], ['SSR', 960], ['UR', 1000]];

  for (const [rarity, threshold] of table) {
    if (roll < threshold) return rarity;
  }
  return 'N';
}

function buildFallbackName(materials = [], slot = 'helmet', rarity = 'N') {
  const cores = (Array.isArray(materials) ? materials : [])
    .map((row) => stripNameCore(row?.name || ''))
    .filter(Boolean);
  const a = cores[0] ? cores[0].slice(0, 2) : '星紋';
  const b = cores[1] ? cores[1].slice(-1) : '核';
  const slotSuffix = slot === 'helmet' ? '冠' : (slot === 'armor' ? '甲' : '靴');
  return sanitizeEquipmentName(`${rarity}${a}${b}${slotSuffix}`, slot, rarity);
}

function buildFallbackLore(slot = 'helmet', materials = []) {
  const source = materials.map((row) => normalizeText(row?.name || '', 12)).filter(Boolean).join('、') || '三件藏品';
  const map = {
    helmet: `由${source}重構出的攻擊型護具，會在出手瞬間放大衝擊節奏。`,
    armor: `由${source}重構出的防護型裝備，能穩定承受高壓傷害。`,
    shoes: `由${source}重構出的機動型裝備，能縮短行動間隔並提升先手。`
  };
  return sanitizeLore(map[slot] || `由${source}重構出的未知裝備。`, slot);
}

function computeValueFromMaterials(materials = [], rarity = 'N', seed = 0) {
  const total = (Array.isArray(materials) ? materials : [])
    .reduce((sum, row) => sum + Math.max(1, Math.floor(Number(row?.value || 1))), 0);
  const range = EQUIPMENT_VALUE_RANGES[rarity] || EQUIPMENT_VALUE_RANGES.N;
  const jitter = (Math.abs(Number(seed) || 0) % 61) - 30;
  const rarityScale = { N: 1.05, R: 1.18, SR: 1.28, SSR: 1.38, UR: 1.5 }[rarity] || 1.12;
  return clampInt(Math.round(total * rarityScale) + jitter, range.min, range.max, range.min);
}

function extractFusionHintsFromText(raw = '') {
  const text = String(raw || '');
  if (!text) return {};
  const rarityToken = '(SSR|SR|UR|R|N)';
  const name =
    text.match(/"equipmentName"\s*:\s*"([^"\n]{1,60})"/i)?.[1]
    || text.match(/equipmentName[^:\n]{0,12}[:：]\s*"([^"\n]{1,60})"/i)?.[1]
    || '';
  const slot =
    text.match(/"slot"\s*:\s*"(helmet|armor|shoes)"/i)?.[1]
    || text.match(/\bslot\b[^a-z]{0,16}(helmet|armor|shoes)\b/i)?.[1]
    || '';
  const rarity =
    text.match(new RegExp(`"rarity"\\s*:\\s*"${rarityToken}"`, 'i'))?.[1]
    || text.match(new RegExp(`\\brarity\\b[^A-Z]{0,16}${rarityToken}\\b`, 'i'))?.[1]
    || text.match(new RegExp(`\\bpick\\b[^A-Z]{0,12}"?${rarityToken}"?`, 'i'))?.[1]
    || '';
  const value = Number(text.match(/"value"\s*:\s*(\d{2,6})/i)?.[1] || 0);
  const primaryStat = Number(text.match(/"primaryStat"\s*:\s*(\d{1,5})/i)?.[1] || 0);
  const lore =
    text.match(/"lore"\s*:\s*"([^"\n]{3,160})"/i)?.[1]
    || '';

  return {
    equipmentName: String(name || '').trim(),
    slot: String(slot || '').trim(),
    rarity: String(rarity || '').trim().toUpperCase(),
    value: Number.isFinite(value) ? value : 0,
    primaryStat: Number.isFinite(primaryStat) ? primaryStat : 0,
    lore: String(lore || '').trim()
  };
}

function hasUsableFusionHints(hints = {}) {
  if (!hints || typeof hints !== 'object') return false;
  if (String(hints.equipmentName || '').trim()) return true;
  if (normalizeSlot(hints.slot || '')) return true;
  if (normalizeRarity(hints.rarity || '')) return true;
  if (Number(hints.value || 0) > 0) return true;
  if (Number(hints.primaryStat || 0) > 0) return true;
  return false;
}

function buildGuidedEquipment(materials = [], options = {}, hints = {}, parsed = {}) {
  const seed = calcHash(`${JSON.stringify(hints || {})}|${JSON.stringify(parsed || {})}|${Date.now()}`);
  const hintedSlot = normalizeSlot(parsed?.slot || hints?.slot || '');
  const hintedRarity = normalizeRarity(parsed?.rarity || hints?.rarity || '');
  const slot = hintedSlot || pickFallbackSlot(materials, options);
  const rarity = hintedRarity || pickFallbackRarity(materials);

  const parsedValue = Number(parsed?.value || 0);
  const hintValue = Number(hints?.value || 0);
  const valueRange = EQUIPMENT_VALUE_RANGES[rarity] || EQUIPMENT_VALUE_RANGES.N;
  const value = (Number.isFinite(parsedValue) && parsedValue > 0)
    ? clampInt(Math.floor(parsedValue), valueRange.min, valueRange.max, valueRange.min)
    : ((Number.isFinite(hintValue) && hintValue > 0)
      ? clampInt(Math.floor(hintValue), valueRange.min, valueRange.max, valueRange.min)
      : computeValueFromMaterials(materials, rarity, seed));

  const parsedPrimary = Number(parsed?.primaryStat || 0);
  const hintPrimary = Number(hints?.primaryStat || 0);
  const primaryStat = derivePrimaryStat(
    slot,
    rarity,
    (Number.isFinite(parsedPrimary) && parsedPrimary > 0) ? parsedPrimary : hintPrimary,
    seed + value
  );

  const rawName = String(parsed?.equipmentName || parsed?.name || hints?.equipmentName || '').trim();
  const rawLore = String(parsed?.lore || parsed?.desc || hints?.lore || '').trim();
  return {
    id: `eq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: rawName ? sanitizeEquipmentName(rawName, slot, rarity) : buildFallbackName(materials, slot, rarity),
    slot,
    rarity,
    value,
    stats: buildEquipmentStats(slot, primaryStat),
    lore: rawLore ? sanitizeLore(rawLore, slot) : buildFallbackLore(slot, materials),
    sourceMaterials: materials.map((row) => ({
      name: normalizeText(row?.name || '未知素材', 80),
      value: Math.max(1, Math.floor(Number(row?.value || 1))),
      source: normalizeText(row?.source || 'inventory', 24)
    })),
    createdAt: Date.now(),
    generatedBy: 'ai_guided'
  };
}

function buildFallbackFusionEquipment(materials = [], options = {}) {
  const slot = pickFallbackSlot(materials, options);
  const rarity = pickFallbackRarity(materials);
  const seed = calcHash(`${slot}|${rarity}|${materials.map((m) => m?.name || '').join('|')}`);
  const value = computeValueFromMaterials(materials, rarity, seed);
  const primaryStat = derivePrimaryStat(slot, rarity, 0, seed + value);

  return {
    id: `eq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: buildFallbackName(materials, slot, rarity),
    slot,
    rarity,
    value,
    stats: buildEquipmentStats(slot, primaryStat),
    lore: buildFallbackLore(slot, materials),
    sourceMaterials: materials.map((row) => ({
      name: normalizeText(row?.name || '未知素材', 80),
      value: Math.max(1, Math.floor(Number(row?.value || 1))),
      source: normalizeText(row?.source || 'inventory', 24)
    })),
    createdAt: Date.now(),
    generatedBy: 'fallback'
  };
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
  const prompt = buildFusionPrompt(materials, options);
  const requestPayload = {
    model: MINIMAX_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    top_p: 0.8
  };
  if (FUSION_AI_MAX_TOKENS > 0) requestPayload.max_tokens = FUSION_AI_MAX_TOKENS;
  const body = JSON.stringify(requestPayload);

  const apiKey = normalizeText(process.env.MINIMAX_API_KEY || '', 240);
  let lastError = null;
  if (!apiKey) {
    lastError = new Error('MINIMAX_API_KEY missing');
  } else {
    for (let attempt = 1; attempt <= FUSION_MAX_RETRIES; attempt += 1) {
      try {
        const raw = await requestMiniMax(body, apiKey, FUSION_TIMEOUT_MS);
        const parsed = parseJsonFromText(raw) || {};
        const hints = extractFusionHintsFromText(raw);
        const hasParsed = parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0;
        if (!hasParsed && !hasUsableFusionHints(hints)) {
          throw new Error('fusion agent returned non-JSON payload');
        }
        const equipment = buildGuidedEquipment(materials, options, hints, parsed);
        equipment.generatedBy = 'ai';
        return { equipment, usedAI: true, raw, attempts: attempt };
      } catch (err) {
        lastError = err;
      }
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

function buildEmptyEquipmentSlots() {
  return { helmet: null, armor: null, shoes: null };
}

function cloneEquipmentItem(item = null) {
  if (!item || typeof item !== 'object') return null;
  return {
    ...item,
    stats: item.stats && typeof item.stats === 'object'
      ? { ...item.stats }
      : { attack: 0, hp: 0, speed: 0 }
  };
}

function normalizeEquipmentItem(item = null) {
  if (!item || typeof item !== 'object') return null;
  const slot = normalizeSlot(item.slot);
  if (!slot) return null;
  const rarity = normalizeRarity(item.rarity) || 'N';
  const stats = item.stats && typeof item.stats === 'object'
    ? {
      attack: Math.max(0, Math.floor(Number(item.stats.attack || 0))),
      hp: Math.max(0, Math.floor(Number(item.stats.hp || 0))),
      speed: Math.max(0, Math.floor(Number(item.stats.speed || 0)))
    }
    : buildEquipmentStats(slot, Math.max(0, Number(item.primaryStat || 0)));
  return {
    ...item,
    slot,
    rarity,
    value: Math.max(0, Math.floor(Number(item.value || 0))),
    stats
  };
}

function buildNormalizedSlotMap(raw = null) {
  const out = buildEmptyEquipmentSlots();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const slot of EQUIPMENT_SLOTS) {
    out[slot] = normalizeEquipmentItem(raw[slot]) || null;
  }
  return out;
}

function hasAnyEquipped(slots = null) {
  if (!slots || typeof slots !== 'object') return false;
  return EQUIPMENT_SLOTS.some((slot) => Boolean(slots[slot] && typeof slots[slot] === 'object'));
}

function syncLegacyEquipmentMirror(player, preferredPetId = '') {
  if (!player || typeof player !== 'object') return false;
  const petId = String(preferredPetId || player?.activePetId || '').trim();
  const currentMirror = buildNormalizedSlotMap(player.equipment);
  const targetMap = (petId && player?.petEquipment && player.petEquipment[petId] && typeof player.petEquipment[petId] === 'object')
    ? buildNormalizedSlotMap(player.petEquipment[petId])
    : currentMirror;
  const before = JSON.stringify(currentMirror);
  const after = JSON.stringify(targetMap);
  if (before === after) return false;
  player.equipment = targetMap;
  return true;
}

function ensurePlayerEquipmentState(player) {
  if (!player || typeof player !== 'object') return false;
  let changed = false;
  if (!player.equipment || typeof player.equipment !== 'object' || Array.isArray(player.equipment)) {
    player.equipment = buildEmptyEquipmentSlots();
    changed = true;
  }
  player.equipment = buildNormalizedSlotMap(player.equipment);

  if (!player.petEquipment || typeof player.petEquipment !== 'object' || Array.isArray(player.petEquipment)) {
    player.petEquipment = {};
    changed = true;
  }
  for (const [rawPetId, rawSlots] of Object.entries(player.petEquipment || {})) {
    const petId = String(rawPetId || '').trim();
    if (!petId) {
      delete player.petEquipment[rawPetId];
      changed = true;
      continue;
    }
    const normalizedSlots = buildNormalizedSlotMap(rawSlots);
    const before = JSON.stringify(buildNormalizedSlotMap(player.petEquipment[petId]));
    const after = JSON.stringify(normalizedSlots);
    player.petEquipment[petId] = normalizedSlots;
    if (before !== after) changed = true;
  }

  const legacySlots = buildNormalizedSlotMap(player.equipment);
  const hasLegacy = hasAnyEquipped(legacySlots);
  const hasMapped = Object.values(player.petEquipment || {}).some((slots) => hasAnyEquipped(slots));
  const activePetId = String(player?.activePetId || '').trim();
  if (hasLegacy && !hasMapped && activePetId) {
    player.petEquipment[activePetId] = buildNormalizedSlotMap(legacySlots);
    changed = true;
  }
  if (syncLegacyEquipmentMirror(player, activePetId)) changed = true;

  if (!Array.isArray(player.equipmentBag)) {
    player.equipmentBag = [];
    changed = true;
  }
  const normalizedBag = [];
  for (const row of player.equipmentBag) {
    const normalized = normalizeEquipmentItem(row);
    if (normalized) normalizedBag.push(normalized);
  }
  if (normalizedBag.length !== player.equipmentBag.length) changed = true;
  player.equipmentBag = normalizedBag;
  return changed;
}

function getPetEquipmentSlots(player, petId = '', options = {}) {
  if (!player || typeof player !== 'object') return buildEmptyEquipmentSlots();
  ensurePlayerEquipmentState(player);
  const safePetId = String(petId || '').trim();
  if (!safePetId) return buildNormalizedSlotMap(player.equipment);
  if (!player.petEquipment[safePetId] || typeof player.petEquipment[safePetId] !== 'object') {
    if (!options?.ensure) return buildEmptyEquipmentSlots();
    player.petEquipment[safePetId] = buildEmptyEquipmentSlots();
  }
  player.petEquipment[safePetId] = buildNormalizedSlotMap(player.petEquipment[safePetId]);
  return player.petEquipment[safePetId];
}

function addEquipmentToPlayer(player, equipment, options = {}) {
  if (!player || !equipment || typeof equipment !== 'object') {
    return { success: false, equipped: false, replaced: null };
  }
  ensurePlayerEquipmentState(player);
  const slot = normalizeSlot(equipment.slot);
  if (!slot) return { success: false, equipped: false, replaced: null };

  const targetPetId = String(options?.petId || player?.activePetId || '').trim();
  const targetSlots = getPetEquipmentSlots(player, targetPetId, { ensure: true });
  const current = targetSlots[slot] && typeof targetSlots[slot] === 'object'
    ? targetSlots[slot]
    : null;
  const normalizedIncoming = normalizeEquipmentItem(equipment);
  if (!normalizedIncoming) return { success: false, equipped: false, replaced: null };
  const newScore = getEquipmentPowerScore(normalizedIncoming);
  const oldScore = getEquipmentPowerScore(current);

  let equipped = false;
  let replaced = null;
  if (!current || newScore > oldScore) {
    if (current) {
      replaced = current;
      player.equipmentBag.unshift(current);
      if (player.equipmentBag.length > 120) player.equipmentBag.length = 120;
    }
    targetSlots[slot] = normalizedIncoming;
    equipped = true;
  } else {
    player.equipmentBag.unshift(normalizedIncoming);
    if (player.equipmentBag.length > 120) player.equipmentBag.length = 120;
  }
  syncLegacyEquipmentMirror(player, targetPetId);
  return { success: true, equipped, replaced, petId: targetPetId };
}

function equipBagItemToPet(player, petId = '', bagIndex = -1) {
  if (!player || typeof player !== 'object') {
    return { success: false, reason: 'invalid_player' };
  }
  ensurePlayerEquipmentState(player);
  const targetPetId = String(petId || '').trim();
  if (!targetPetId) return { success: false, reason: 'invalid_pet' };
  if (!Array.isArray(player.equipmentBag)) player.equipmentBag = [];
  const idx = Math.floor(Number(bagIndex));
  if (!Number.isFinite(idx) || idx < 0 || idx >= player.equipmentBag.length) {
    return { success: false, reason: 'invalid_bag_index' };
  }
  const picked = normalizeEquipmentItem(player.equipmentBag[idx]);
  if (!picked) return { success: false, reason: 'invalid_item' };
  const slot = normalizeSlot(picked.slot);
  if (!slot) return { success: false, reason: 'invalid_slot' };
  const slots = getPetEquipmentSlots(player, targetPetId, { ensure: true });
  const replaced = slots[slot] && typeof slots[slot] === 'object'
    ? slots[slot]
    : null;
  player.equipmentBag.splice(idx, 1);
  if (replaced) {
    player.equipmentBag.unshift(replaced);
  }
  slots[slot] = picked;
  if (player.equipmentBag.length > 120) player.equipmentBag.length = 120;
  syncLegacyEquipmentMirror(player, targetPetId);
  return { success: true, petId: targetPetId, slot, equipped: picked, replaced };
}

function unequipPetSlotToBag(player, petId = '', rawSlot = '') {
  if (!player || typeof player !== 'object') {
    return { success: false, reason: 'invalid_player' };
  }
  ensurePlayerEquipmentState(player);
  const targetPetId = String(petId || '').trim();
  if (!targetPetId) return { success: false, reason: 'invalid_pet' };
  const slot = normalizeSlot(rawSlot);
  if (!slot) return { success: false, reason: 'invalid_slot' };
  const slots = getPetEquipmentSlots(player, targetPetId, { ensure: true });
  const equipped = slots[slot] && typeof slots[slot] === 'object'
    ? slots[slot]
    : null;
  if (!equipped) return { success: false, reason: 'slot_empty' };
  slots[slot] = null;
  player.equipmentBag.unshift(equipped);
  if (player.equipmentBag.length > 120) player.equipmentBag.length = 120;
  syncLegacyEquipmentMirror(player, targetPetId);
  return { success: true, petId: targetPetId, slot, unequipped: equipped };
}

function getEquippedBonuses(player = null, petId = '') {
  const out = { attack: 0, hp: 0, speed: 0 };
  if (!player || typeof player !== 'object') return out;
  ensurePlayerEquipmentState(player);
  const safePetId = String(petId || '').trim();
  const equipment = safePetId
    ? getPetEquipmentSlots(player, safePetId, { ensure: false })
    : buildNormalizedSlotMap(player.equipment);
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
  getPetEquipmentSlots,
  equipBagItemToPet,
  unequipPetSlotToBag,
  getEquippedBonuses,
  getEquipmentPowerScore,
  addEquipmentToPlayer,
  fuseTreasuresToEquipment
};
