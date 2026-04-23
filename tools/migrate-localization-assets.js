const fs = require('fs');
const path = require('path');
const { sanitizeWorldText } = require('../modules/core/style-sanitizer');

const {
  ITEM_LOCALIZATION_LANGS,
  MOVE_LOCALIZATION,
  normalizeLangCode,
  localizeScriptOnly,
  buildItemNamePack,
  buildItemDescPack,
  getMoveLocalization,
  stripSkillChipPrefix,
  formatSkillChipDisplay
} = require('../modules/systems/runtime/utils/global-language-resources');

const ROOT = path.resolve(__dirname, '..');
const PLAYERS_DIR = path.join(ROOT, 'data', 'players');
const LOCALIZATION_DIR = path.join(ROOT, 'data', 'localization');
const DEFAULT_LANGS = Array.isArray(ITEM_LOCALIZATION_LANGS) && ITEM_LOCALIZATION_LANGS.length > 0
  ? ITEM_LOCALIZATION_LANGS
  : ['zh-TW', 'zh-CN', 'en'];

function safeText(value = '') {
  return String(value || '').trim();
}

function normalizeNameKey(name = '') {
  return String(name || '')
    .replace(/\u3000/g, ' ')
    .replace(/[「」『』"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectMoveNameVariants(moveName = '') {
  const seed = safeText(moveName);
  if (!seed) return [];
  const out = [];
  const seen = new Set();
  function addVariant(value = '') {
    const safe = safeText(value);
    if (!safe || seen.has(safe)) return;
    seen.add(safe);
    out.push(safe);
  }
  const directVariants = [
    seed,
    localizeScriptOnly(seed, 'zh-TW'),
    localizeScriptOnly(seed, 'zh-CN')
  ];
  for (const value of directVariants) addVariant(value);
  const sanitized = safeText(sanitizeWorldText(seed));
  if (sanitized && sanitized !== seed) {
    const sanitizedVariants = [
      sanitized,
      localizeScriptOnly(sanitized, 'zh-TW'),
      localizeScriptOnly(sanitized, 'zh-CN')
    ];
    for (const value of sanitizedVariants) addVariant(value);
  }
  return out;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function parseArgs(argv = []) {
  const langs = new Set(DEFAULT_LANGS.map((lang) => safeText(lang)).filter(Boolean));
  let sourceLang = 'zh-TW';
  let write = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (!token) continue;
    if (token === '--write') {
      write = true;
      continue;
    }
    if (token === '--source-lang') {
      sourceLang = safeText(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--langs') {
      const raw = safeText(argv[i + 1]);
      i += 1;
      if (raw) {
        langs.clear();
        for (const lang of raw.split(',').map((v) => safeText(v)).filter(Boolean)) {
          langs.add(lang);
        }
      }
      continue;
    }
    if (token === '--add-lang') {
      const raw = safeText(argv[i + 1]);
      i += 1;
      if (raw) langs.add(raw);
      continue;
    }
  }

  if (!langs.has('zh-TW')) langs.add('zh-TW');
  if (!langs.has('zh-CN')) langs.add('zh-CN');
  if (!langs.has('en')) langs.add('en');

  return {
    write,
    sourceLang: safeText(sourceLang) || 'zh-TW',
    targetLangs: Array.from(langs)
  };
}

function pickBaseText(pack = {}, sourceLang = 'zh-TW') {
  const keys = [sourceLang, 'zh-TW', 'zh-CN', 'en', ...Object.keys(pack || {})];
  for (const key of keys) {
    const text = safeText(pack?.[key]);
    if (text) return text;
  }
  return '';
}

function deriveTextByLang(baseText = '', targetLang = 'zh-TW') {
  const text = safeText(baseText);
  if (!text) return '';
  if (targetLang === 'zh-CN') return safeText(localizeScriptOnly(text, 'zh-CN')) || text;
  if (targetLang === 'zh-TW') return safeText(localizeScriptOnly(text, 'zh-TW')) || text;
  return text;
}

function expandLocalizedPack(pack = {}, options = {}) {
  const source = pack && typeof pack === 'object' && !Array.isArray(pack) ? pack : {};
  const targetLangs = Array.isArray(options?.targetLangs) ? options.targetLangs : DEFAULT_LANGS;
  const sourceLang = safeText(options?.sourceLang || 'zh-TW') || 'zh-TW';
  const baseText = pickBaseText(source, sourceLang);
  if (!baseText) return null;

  const out = {};
  for (const key of Object.keys(source)) {
    const text = safeText(source[key]);
    if (text) out[key] = text;
  }
  for (const lang of targetLangs) {
    const safeLang = safeText(lang);
    if (!safeLang) continue;
    if (safeText(out[safeLang])) continue;
    const fallback = pickBaseText(out, sourceLang) || baseText;
    const text = deriveTextByLang(fallback, safeLang);
    if (text) out[safeLang] = text;
  }
  return out;
}

function normalizeTradeGood(good = null, options = {}) {
  if (!good || typeof good !== 'object' || Array.isArray(good)) return null;
  if (Object.keys(good).length <= 0) return null;

  const nameSeed = buildItemNamePack(good) || buildItemNamePack(safeText(good?.name || ''));
  const descSeed = buildItemDescPack(good) || buildItemDescPack({ desc: safeText(good?.desc || '') });
  const names = expandLocalizedPack(nameSeed || {}, options);
  const descs = expandLocalizedPack(descSeed || {}, options);
  if (!names) return null;

  const canonicalName = safeText(names['zh-TW'] || pickBaseText(names, options?.sourceLang));
  const canonicalDesc = safeText(descs?.['zh-TW'] || pickBaseText(descs || {}, options?.sourceLang));

  return {
    ...good,
    name: canonicalName,
    names,
    desc: canonicalDesc,
    descs: descs || {}
  };
}

function normalizeMaterial(row = null, options = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const sourceName = safeText(row?.name || '');
  const nameSeed = buildItemNamePack({ names: row?.names, name: sourceName }) || buildItemNamePack(sourceName);
  const names = expandLocalizedPack(nameSeed || {}, options);
  if (!names) return null;
  return {
    ...row,
    name: safeText(names['zh-TW'] || pickBaseText(names, options?.sourceLang)),
    names
  };
}

function normalizeEquipmentItem(item = null, options = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const nameSeed = buildItemNamePack(item) || buildItemNamePack(safeText(item?.name || ''));
  const descSeed = buildItemDescPack(item) || buildItemDescPack({ lore: safeText(item?.lore || ''), desc: safeText(item?.desc || '') });
  const names = expandLocalizedPack(nameSeed || {}, options);
  const descs = expandLocalizedPack(descSeed || {}, options);
  if (!names) return null;

  const canonicalName = safeText(names['zh-TW'] || pickBaseText(names, options?.sourceLang));
  const canonicalDesc = safeText(descs?.['zh-TW'] || pickBaseText(descs || {}, options?.sourceLang));

  const sourceMaterials = Array.isArray(item.sourceMaterials)
    ? item.sourceMaterials.map((row) => normalizeMaterial(row, options)).filter(Boolean)
    : [];

  return {
    ...item,
    name: canonicalName,
    names,
    lore: canonicalDesc,
    desc: canonicalDesc,
    descs: descs || {},
    sourceMaterials
  };
}

function buildMoveLookup() {
  const byId = new Map();
  const byNameKey = new Map();
  for (const row of MOVE_LOCALIZATION) {
    const moveId = safeText(row?.[0]);
    const zhName = safeText(row?.[1]);
    const enName = safeText(row?.[2]);
    if (!moveId) continue;
    byId.set(moveId, { moveId, zhName, enName });

    const variants = [
      zhName,
      localizeScriptOnly(zhName, 'zh-CN'),
      localizeScriptOnly(zhName, 'zh-TW'),
      enName
    ];
    for (const name of variants) {
      const key = normalizeNameKey(name);
      if (!key || byNameKey.has(key)) continue;
      byNameKey.set(key, moveId);
    }
  }
  return { byId, byNameKey };
}

const MOVE_LOOKUP = buildMoveLookup();

function resolveMoveId(moveName = '') {
  const variants = collectMoveNameVariants(moveName);
  for (const variant of variants) {
    const key = normalizeNameKey(variant);
    if (!key) continue;
    const moveId = MOVE_LOOKUP.byNameKey.get(key);
    if (moveId) return moveId;
  }
  return '';
}

function normalizeSkillChipEntry(raw = '', options = {}) {
  const source = safeText(raw);
  if (!source) return source;
  const core = stripSkillChipPrefix(source);
  if (!core) return source;
  const moveId = resolveMoveId(core);
  if (!moveId) return source;
  const canonicalZhTw = safeText(getMoveLocalization(moveId, core, 'zh-TW')) || core;
  return formatSkillChipDisplay(moveId, canonicalZhTw, 'zh-TW');
}

function normalizePlayerData(player = null, options = {}) {
  if (!player || typeof player !== 'object' || Array.isArray(player)) {
    return { player, changed: false, stats: {} };
  }

  let changed = false;
  const stats = {
    prunedTradeGoods: 0,
    migratedTradeGoods: 0,
    migratedEquipment: 0,
    normalizedSkillChips: 0
  };

  const tradeGoods = Array.isArray(player.tradeGoods) ? player.tradeGoods : [];
  const nextTradeGoods = [];
  for (const good of tradeGoods) {
    const normalized = normalizeTradeGood(good, options);
    if (!normalized) {
      stats.prunedTradeGoods += 1;
      changed = true;
      continue;
    }
    if (JSON.stringify(good) !== JSON.stringify(normalized)) {
      stats.migratedTradeGoods += 1;
      changed = true;
    }
    nextTradeGoods.push(normalized);
  }
  if (!Array.isArray(player.tradeGoods) || JSON.stringify(player.tradeGoods) !== JSON.stringify(nextTradeGoods)) {
    player.tradeGoods = nextTradeGoods;
    changed = true;
  }

  if (Array.isArray(player.equipmentBag)) {
    const nextBag = player.equipmentBag.map((item) => normalizeEquipmentItem(item, options)).filter(Boolean);
    if (JSON.stringify(player.equipmentBag) !== JSON.stringify(nextBag)) {
      stats.migratedEquipment += nextBag.length;
      player.equipmentBag = nextBag;
      changed = true;
    }
  }

  if (player.equipment && typeof player.equipment === 'object' && !Array.isArray(player.equipment)) {
    const nextSlots = {};
    for (const [slot, item] of Object.entries(player.equipment)) {
      const normalized = normalizeEquipmentItem(item, options);
      nextSlots[slot] = normalized;
      if (JSON.stringify(item) !== JSON.stringify(normalized)) {
        stats.migratedEquipment += 1;
        changed = true;
      }
    }
    if (JSON.stringify(player.equipment) !== JSON.stringify(nextSlots)) {
      player.equipment = nextSlots;
      changed = true;
    }
  }

  if (player.petEquipment && typeof player.petEquipment === 'object' && !Array.isArray(player.petEquipment)) {
    const nextPetEquipment = {};
    for (const [petId, slots] of Object.entries(player.petEquipment)) {
      if (!slots || typeof slots !== 'object' || Array.isArray(slots)) continue;
      const nextSlots = {};
      for (const [slot, item] of Object.entries(slots)) {
        const normalized = normalizeEquipmentItem(item, options);
        nextSlots[slot] = normalized;
        if (JSON.stringify(item) !== JSON.stringify(normalized)) {
          stats.migratedEquipment += 1;
          changed = true;
        }
      }
      nextPetEquipment[petId] = nextSlots;
    }
    if (JSON.stringify(player.petEquipment) !== JSON.stringify(nextPetEquipment)) {
      player.petEquipment = nextPetEquipment;
      changed = true;
    }
  }

  if (Array.isArray(player.inventory)) {
    const nextInventory = player.inventory.map((item) => {
      if (typeof item !== 'string') return item;
      const normalized = normalizeSkillChipEntry(item, options);
      if (normalized !== item) {
        stats.normalizedSkillChips += 1;
        changed = true;
      }
      return normalized;
    });
    if (JSON.stringify(player.inventory) !== JSON.stringify(nextInventory)) {
      player.inventory = nextInventory;
      changed = true;
    }
  }

  return { player, changed, stats };
}

function buildMoveCatalog(options = {}) {
  const targetLangs = Array.isArray(options?.targetLangs) ? options.targetLangs : DEFAULT_LANGS;
  const sourceLang = safeText(options?.sourceLang || 'zh-TW') || 'zh-TW';
  const moves = {};
  const chips = {};

  for (const row of MOVE_LOCALIZATION) {
    const moveId = safeText(row?.[0]);
    const zhName = safeText(row?.[1]);
    if (!moveId || !zhName) continue;

    const seed = {
      'zh-TW': safeText(getMoveLocalization(moveId, zhName, 'zh-TW')),
      'zh-CN': safeText(getMoveLocalization(moveId, zhName, 'zh-CN')),
      en: safeText(getMoveLocalization(moveId, zhName, 'en'))
    };
    const names = expandLocalizedPack(seed, { targetLangs, sourceLang }) || seed;
    moves[moveId] = names;

    const chipMap = {};
    for (const lang of targetLangs) {
      const safeLang = safeText(lang);
      if (!safeLang) continue;
      if (safeLang === 'zh-TW' || safeLang === 'zh-CN' || safeLang === 'en') {
        chipMap[safeLang] = formatSkillChipDisplay(moveId, names[safeLang] || names['zh-TW'], safeLang);
      } else {
        const fallback = names[safeLang] || names[sourceLang] || names['zh-TW'];
        chipMap[safeLang] = formatSkillChipDisplay(moveId, fallback, 'zh-TW');
      }
    }
    chips[moveId] = chipMap;
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceLang,
    targetLangs,
    moves,
    chips
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = fs.existsSync(PLAYERS_DIR)
    ? fs.readdirSync(PLAYERS_DIR).filter((name) => name.endsWith('.json')).sort()
    : [];

  let changedFiles = 0;
  let totalPrunedTradeGoods = 0;
  let totalMigratedTradeGoods = 0;
  let totalMigratedEquipment = 0;
  let totalNormalizedSkillChips = 0;

  for (const file of files) {
    const fullPath = path.join(PLAYERS_DIR, file);
    const player = readJson(fullPath);
    if (!player || typeof player !== 'object') continue;

    const before = JSON.stringify(player);
    const result = normalizePlayerData(player, options);
    const after = JSON.stringify(result.player);

    totalPrunedTradeGoods += Number(result?.stats?.prunedTradeGoods || 0);
    totalMigratedTradeGoods += Number(result?.stats?.migratedTradeGoods || 0);
    totalMigratedEquipment += Number(result?.stats?.migratedEquipment || 0);
    totalNormalizedSkillChips += Number(result?.stats?.normalizedSkillChips || 0);

    if (before !== after) {
      changedFiles += 1;
      if (options.write) writeJson(fullPath, result.player);
    }
  }

  const catalog = buildMoveCatalog(options);
  const catalogPath = path.join(LOCALIZATION_DIR, 'skill_localization_catalog.json');
  if (options.write) {
    ensureDir(LOCALIZATION_DIR);
    writeJson(catalogPath, catalog);
  }

  console.log(`[i18n:migrate] write mode: ${options.write ? 'ON' : 'OFF'}`);
  console.log(`[i18n:migrate] sourceLang: ${options.sourceLang}`);
  console.log(`[i18n:migrate] targetLangs: ${options.targetLangs.join(', ')}`);
  console.log(`[i18n:migrate] players scanned: ${files.length}`);
  console.log(`[i18n:migrate] player files changed: ${changedFiles}`);
  console.log(`[i18n:migrate] tradeGoods migrated: ${totalMigratedTradeGoods}`);
  console.log(`[i18n:migrate] tradeGoods pruned(empty): ${totalPrunedTradeGoods}`);
  console.log(`[i18n:migrate] equipment migrated: ${totalMigratedEquipment}`);
  console.log(`[i18n:migrate] skill chips normalized: ${totalNormalizedSkillChips}`);
  console.log(`[i18n:migrate] catalog path: ${catalogPath}`);
}

main();
