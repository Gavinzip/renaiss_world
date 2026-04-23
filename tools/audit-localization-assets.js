const fs = require('fs');
const path = require('path');

const {
  ITEM_LOCALIZATION_LANGS,
  MOVE_LOCALIZATION,
  COMMON_ITEM_TRANSLATIONS,
  buildItemNamePack,
  buildItemDescPack,
  getMoveLocalization,
  formatSkillChipDisplay,
  stripSkillChipPrefix
} = require('../modules/systems/runtime/utils/global-language-resources');

const ROOT = path.resolve(__dirname, '..');
const PLAYERS_DIR = path.join(ROOT, 'data', 'players');
const DEFAULT_LANGS = Array.isArray(ITEM_LOCALIZATION_LANGS) && ITEM_LOCALIZATION_LANGS.length > 0
  ? ITEM_LOCALIZATION_LANGS
  : ['zh-TW', 'zh-CN', 'en'];
const SHOW_LIMIT = 60;

function safeText(value = '') {
  return String(value || '').trim();
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function hasLangs(map = null, langs = []) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
  return langs.every((lang) => safeText(map[lang]).length > 0);
}

function pushIssue(bucket = [], scope = '', detail = '') {
  if (!scope || !detail) return;
  bucket.push(`[${scope}] ${detail}`);
}

function getStoredMap(source = null, key = '') {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const row = source[key];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  return row;
}

function formatPathLabel(file = '', suffix = '') {
  return suffix ? `${file}:${suffix}` : file;
}

function parseAuditArgs(argv = []) {
  const langs = new Set(DEFAULT_LANGS.map((lang) => safeText(lang)).filter(Boolean));
  for (let i = 0; i < argv.length; i += 1) {
    const token = safeText(argv[i]);
    if (!token) continue;
    if (token === '--langs') {
      const raw = safeText(argv[i + 1]);
      i += 1;
      if (raw) {
        langs.clear();
        for (const lang of raw.split(',').map((value) => safeText(value)).filter(Boolean)) {
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
  return Array.from(langs);
}

function collectEquipmentRows(player = {}) {
  const rows = [];
  const bag = Array.isArray(player.equipmentBag) ? player.equipmentBag : [];
  for (let i = 0; i < bag.length; i += 1) {
    rows.push({ item: bag[i], scope: `equipmentBag[${i}]` });
  }
  const legacy = player.equipment && typeof player.equipment === 'object' && !Array.isArray(player.equipment)
    ? player.equipment
    : null;
  if (legacy) {
    for (const [slot, item] of Object.entries(legacy)) {
      rows.push({ item, scope: `equipment.${slot}` });
    }
  }
  const petEquipment = player.petEquipment && typeof player.petEquipment === 'object' && !Array.isArray(player.petEquipment)
    ? player.petEquipment
    : null;
  if (petEquipment) {
    for (const [petId, slots] of Object.entries(petEquipment)) {
      if (!slots || typeof slots !== 'object' || Array.isArray(slots)) continue;
      for (const [slot, item] of Object.entries(slots)) {
        rows.push({ item, scope: `petEquipment.${petId}.${slot}` });
      }
    }
  }
  return rows;
}

function auditSkillLocalization(errors = [], warnings = [], langs = DEFAULT_LANGS) {
  const seenMoveIds = new Set();
  for (const row of MOVE_LOCALIZATION) {
    const moveId = safeText(row?.[0]);
    const zhName = safeText(row?.[1]);
    const enName = safeText(row?.[2]);
    if (!moveId) {
      pushIssue(errors, 'skills', 'empty move id in MOVE_LOCALIZATION');
      continue;
    }
    if (seenMoveIds.has(moveId)) {
      pushIssue(errors, 'skills', `duplicate move id: ${moveId}`);
    }
    seenMoveIds.add(moveId);
    if (!zhName || !enName) {
      pushIssue(errors, 'skills', `${moveId} has empty zh/en name`);
    }
    for (const lang of langs) {
      const localized = safeText(getMoveLocalization(moveId, zhName, lang));
      const chip = safeText(formatSkillChipDisplay(moveId, zhName, lang));
      if (!localized) {
        pushIssue(errors, 'skills', `${moveId} missing localized move name for ${lang}`);
      }
      if (!chip) {
        pushIssue(errors, 'skills', `${moveId} missing localized chip label for ${lang}`);
      }
    }
  }

  for (const [name, pack] of Object.entries(COMMON_ITEM_TRANSLATIONS || {})) {
    if (!hasLangs(pack, langs)) {
      pushIssue(warnings, 'common-items', `${name} missing one or more language keys (${langs.join(', ')})`);
    }
  }
}

function auditPlayerData(errors = [], warnings = [], langs = DEFAULT_LANGS) {
  if (!fs.existsSync(PLAYERS_DIR)) {
    pushIssue(errors, 'players', `players directory not found: ${PLAYERS_DIR}`);
    return { files: 0, tradeGoods: 0, equipment: 0, chips: 0 };
  }

  const files = fs.readdirSync(PLAYERS_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();

  let tradeGoodsCount = 0;
  let equipmentCount = 0;
  let skillChipCount = 0;

  for (const file of files) {
    const fullPath = path.join(PLAYERS_DIR, file);
    const player = readJson(fullPath);
    if (!player || typeof player !== 'object') {
      pushIssue(errors, file, 'invalid JSON payload');
      continue;
    }

    const tradeGoods = Array.isArray(player.tradeGoods) ? player.tradeGoods : [];
    for (let i = 0; i < tradeGoods.length; i += 1) {
      const good = tradeGoods[i];
      if (!good || typeof good !== 'object') continue;
      const scope = formatPathLabel(file, `tradeGoods[${i}]`);
      if (Object.keys(good).length <= 0) {
        pushIssue(warnings, scope, 'empty trade goods entry (can be auto-pruned)');
        continue;
      }
      tradeGoodsCount += 1;

      const namePack = buildItemNamePack(good);
      const descPack = buildItemDescPack(good);
      if (!hasLangs(namePack, langs)) {
        pushIssue(errors, scope, `effective name pack missing languages (${langs.join(', ')})`);
      }
      if (!hasLangs(descPack, langs)) {
        pushIssue(errors, scope, `effective desc pack missing languages (${langs.join(', ')})`);
      }

      const storedNames = getStoredMap(good, 'names');
      const storedDescs = getStoredMap(good, 'descs');
      if (!hasLangs(storedNames, langs)) {
        pushIssue(warnings, scope, `stored names map missing languages (${langs.join(', ')})`);
      }
      if (!hasLangs(storedDescs, langs)) {
        pushIssue(warnings, scope, `stored descs map missing languages (${langs.join(', ')})`);
      }
    }

    const equipmentRows = collectEquipmentRows(player);
    for (const row of equipmentRows) {
      if (!row?.item || typeof row.item !== 'object') continue;
      equipmentCount += 1;
      const scope = formatPathLabel(file, row.scope || 'equipment');
      const namePack = buildItemNamePack(row.item);
      const descPack = buildItemDescPack(row.item);
      if (!hasLangs(namePack, langs)) {
        pushIssue(errors, scope, `effective equipment name pack missing languages (${langs.join(', ')})`);
      }
      if (!hasLangs(descPack, langs)) {
        pushIssue(errors, scope, `effective equipment desc pack missing languages (${langs.join(', ')})`);
      }
      const storedNames = getStoredMap(row.item, 'names');
      const storedDescs = getStoredMap(row.item, 'descs');
      if (!hasLangs(storedNames, langs)) {
        pushIssue(warnings, scope, `stored equipment names map missing languages (${langs.join(', ')})`);
      }
      if (!hasLangs(storedDescs, langs)) {
        pushIssue(warnings, scope, `stored equipment descs map missing languages (${langs.join(', ')})`);
      }
    }

    const inventory = Array.isArray(player.inventory) ? player.inventory : [];
    for (let i = 0; i < inventory.length; i += 1) {
      const raw = safeText(inventory[i]);
      if (!raw) continue;
      const core = stripSkillChipPrefix(raw);
      if (!core) continue;
      skillChipCount += 1;
      const scope = formatPathLabel(file, `inventory[${i}]`);
      const namePack = buildItemNamePack(raw);
      if (!hasLangs(namePack, langs)) {
        pushIssue(errors, scope, `skill chip effective name pack missing languages (${langs.join(', ')})`);
      }
      if (safeText(getMoveLocalization('', core, 'en')) === core) {
        pushIssue(warnings, scope, `possible missing explicit EN move translation for chip core: ${core}`);
      }
    }
  }

  return {
    files: files.length,
    tradeGoods: tradeGoodsCount,
    equipment: equipmentCount,
    chips: skillChipCount
  };
}

function printIssues(title = '', issues = []) {
  if (!issues.length) {
    console.log(`${title}: 0`);
    return;
  }
  console.log(`${title}: ${issues.length}`);
  for (const line of issues.slice(0, SHOW_LIMIT)) {
    console.log(`- ${line}`);
  }
  if (issues.length > SHOW_LIMIT) {
    console.log(`- ... and ${issues.length - SHOW_LIMIT} more`);
  }
}

function main() {
  const langs = parseAuditArgs(process.argv.slice(2));
  const strict = process.argv.includes('--strict');
  const errors = [];
  const warnings = [];

  auditSkillLocalization(errors, warnings, langs);
  const counts = auditPlayerData(errors, warnings, langs);

  console.log(`[i18n] languages: ${langs.join(', ')}`);
  console.log(`[i18n] players scanned: ${counts.files}`);
  console.log(`[i18n] trade goods checked: ${counts.tradeGoods}`);
  console.log(`[i18n] equipment checked: ${counts.equipment}`);
  console.log(`[i18n] skill chips checked: ${counts.chips}`);

  printIssues('[i18n] errors', errors);
  printIssues('[i18n] warnings', warnings);

  if (strict && (errors.length > 0 || warnings.length > 0)) {
    process.exit(1);
  }
}

main();
