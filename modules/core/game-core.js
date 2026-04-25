/**
 * 🌟 Renaiss World - AI 開放世界科幻 RPG
 * 
 * 核心遊戲引擎
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const MEMORY_INDEX = require('../systems/data/memory-index');
const {
  deepCloneJson,
  safeReadJsonFileSync
} = require('../systems/data/queued-json-store');
const { createPlayerStateRepository } = require('../systems/data/player-state-repository');
const { createSqliteMirroredSingletonStore } = require('../systems/data/sqlite-mirrored-state');
const FACTION_DIRECTOR = require('./faction-war-director');
const { sanitizeWorldText } = require('./style-sanitizer');
const PET = require('../systems/pet/pet-system');
const { LEGACY_DATA_DIR } = require('./storage-paths');
const {
  MAP_LOCATIONS,
  LOCATION_PROFILES,
  REGION_CATALOG,
  getBeginnerSpawnLocations,
  getLocationDifficulty
} = require('../content/world-map');

// ============== 設定 ==============
const DATA_DIR = LEGACY_DATA_DIR;
const PLAYERS_DIR = path.join(DATA_DIR, 'players');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const CRAFTING_FILE = path.join(DATA_DIR, 'crafting.json');
const NPC_QUOTES_FILE = path.join(DATA_DIR, 'npc_quote_memory.json');

const NPC_QUOTE_PLAYER_LIMIT = Math.max(120, Math.min(5000, Number(process.env.NPC_QUOTE_PLAYER_LIMIT || 1200)));
const NPC_QUOTE_DEFAULT_LIMIT = Math.max(5, Math.min(80, Number(process.env.NPC_QUOTE_DEFAULT_LIMIT || 16)));
const NPC_QUOTE_INDEX_NAMESPACE_ALL = 'npc_quote:all';
let worldStateStore = null;
let playerStateRepository = null;
let npcQuoteStoreState = null;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PLAYERS_DIR)) fs.mkdirSync(PLAYERS_DIR, { recursive: true });

// ============== Renaiss星球地圖（統一來源） ==============
const WORLD_MAP = {
  regions: REGION_CATALOG.map(region => ({
    name: region.name,
    difficultyRange: region.difficultyRange,
    theme: region.theme,
    cities: region.locations.map((locationName) => {
      const profile = LOCATION_PROFILES[locationName] || {};
      return {
        name: locationName,
        desc: profile.desc || '',
        resources: Array.isArray(profile.resources) ? [...profile.resources] : [],
        nearby: Array.isArray(profile.nearby) ? [...profile.nearby] : [],
        landmarks: Array.isArray(profile.landmarks) ? [...profile.landmarks] : [],
        difficulty: Number(getLocationDifficulty(locationName) || 3),
        starterEligible: profile.starterEligible !== false
      };
    })
  })),
  getAllCities: function() {
    const cities = [];
    this.regions.forEach(r => {
      r.cities.forEach(c => cities.push({ ...c, region: r.name }));
    });
    return cities;
  },
  getBeginnerCities: function() {
    const beginnerSet = new Set(
      (typeof getBeginnerSpawnLocations === 'function' ? getBeginnerSpawnLocations() : [])
        .filter(Boolean)
    );
    const allCities = this.getAllCities();
    if (beginnerSet.size === 0) {
      return allCities.filter(c => Number(c.difficulty || 3) <= 2);
    }
    return allCities.filter(c => beginnerSet.has(c.name));
  },
  getRandomCity: function() {
    const cities = this.getAllCities();
    if (cities.length === 0) {
      const fallbackName = MAP_LOCATIONS[0] || '襄陽城';
      return { name: fallbackName, desc: '', resources: [], difficulty: 1, region: '未知' };
    }
    return cities[Math.floor(Math.random() * cities.length)];
  },
  getRandomBeginnerCity: function() {
    const beginnerCities = this.getBeginnerCities();
    if (beginnerCities.length === 0) {
      return this.getRandomCity();
    }
    return beginnerCities[Math.floor(Math.random() * beginnerCities.length)];
  },
  getCityByName: function(name) {
    const cities = this.getAllCities();
    return cities.find(c => c.name === name) || null;
  }
};

// ============== 世界狀態 ==============
function buildDefaultWorldState() {
  return {
    day: 1,
    season: "春天",
    weather: "晴",
    weatherEffects: {
      "雨": { 火系傷害: -30, 移動速度: -20, 視距: -30 },
      "雪": { 能量消耗: +20, 移動速度: -30, 視距: -50 },
      "霧": { 視距: -60, 偷襲成功率: +20 },
      "晴": { 無影響: 0 }
    },
    events: [],      // 世界事件（如 NPC 死亡）
    rumors: [],       // 謠言
    npcStatus: {}    // NPC 生死狀態 { npcId: { alive: true, killedBy: null, killedAt: null } }
  };
}

let world = buildDefaultWorldState();
const MAX_WORLD_EVENTS = 5;

const DIGITAL_ROAMER_TOTAL = 20;
const DIGITAL_ROAMER_GROUPS = Object.freeze(['NemoX', 'WolfX', 'AdalocX', 'HomX']);
const DIGITAL_ROAMER_GROUP_ALIAS = Object.freeze({
  Nemo: 'NemoX',
  Wolf: 'WolfX',
  Adaloc: 'AdalocX',
  Hom: 'HomX',
  NemoX: 'NemoX',
  WolfX: 'WolfX',
  AdalocX: 'AdalocX',
  HomX: 'HomX'
});
const DIGITAL_ROAMER_GROUP_MOVES = Object.freeze({
  NemoX: ['golden_needle', 'ice_palm', 'flood_torrent', 'silver_snake'],
  WolfX: ['blaze_sky', 'hell_fire', 'thunder_crash', 'explosive_pill'],
  AdalocX: ['spider_silk', 'plague_cloud', 'bone_dissolver', 'rejuvenation'],
  HomX: ['ultimate_dark', 'hot_sand_hell', 'ghost_fire', 'shadow_lock']
});
const DIGITAL_ROAMER_GROUP_ELEMENT = Object.freeze({
  NemoX: '水',
  WolfX: '火',
  AdalocX: '草',
  HomX: '火'
});
const DIGITAL_ROAMER_GROUP_BASE = Object.freeze({
  NemoX: { battle: 34, hp: 160, attack: 28, defense: 16, petAttack: 22, petHp: 84 },
  WolfX: { battle: 36, hp: 168, attack: 30, defense: 16, petAttack: 24, petHp: 88 },
  AdalocX: { battle: 38, hp: 176, attack: 31, defense: 18, petAttack: 25, petHp: 92 },
  HomX: { battle: 40, hp: 184, attack: 33, defense: 18, petAttack: 26, petHp: 96 }
});
const LOCATION_NPC_MIN_COUNT = Math.max(1, Math.min(3, Number(process.env.LOCATION_NPC_MIN_COUNT || 2)));
const MENTOR_MASTER_MOVE_IDS = Object.freeze(['ultimate_dark', 'blaze_sky', 'thunder_crash', 'flood_torrent', 'ghost_fire']);
const MENTOR_MASTER_BLUEPRINTS = Object.freeze([
  { id: 'mentor_winchman', name: 'Winchman', title: '前線總導師', element: '火', battle: 98, hp: 240, energy: 120, wealth: 95 },
  { id: 'mentor_tom', name: 'Tom', title: '航道戰術導師', element: '水', battle: 95, hp: 232, energy: 116, wealth: 88 },
  { id: 'mentor_harry', name: 'Harry', title: '機動壓制導師', element: '火', battle: 96, hp: 236, energy: 118, wealth: 84 },
  { id: 'mentor_kathy', name: 'Kathy', title: '修復與反制導師', element: '草', battle: 93, hp: 228, energy: 122, wealth: 82 },
  { id: 'mentor_yuzu', name: 'Ryan', title: '節點追跡導師', element: '水', battle: 94, hp: 230, energy: 120, wealth: 80 }
]);
const PERSISTENT_NPC_BOSS_IDS = new Set(['bandit_king', 'traitor', 'chamberlain', 'shadow_assassin']);

const NPC_COMBAT_PROFILES = Object.freeze({
  lin_engineer: { element: '火', petName: '齒輪熔芯豹', moveIds: ['iron_palm', 'flame_armor', 'thunder_crash', 'blaze_sky'] },
  su_doctor: { element: '水', petName: '淨潮醫療狐', moveIds: ['willow_water', 'mist_step', 'ice_palm', 'golden_needle'] },
  shadow_merchant: { element: '草', petName: '暗藤帳簿鼠', moveIds: ['shadow_lock', 'spider_silk', 'curse_word', 'minor_poison'] },
  crown_prince: { element: '水', petName: '皇庭潮紋獅', moveIds: ['golden_needle', 'willow_water', 'mist_step', 'thunder_crash'] },
  general_wang: { element: '火', petName: '鋼炎戰騎', moveIds: ['iron_palm', 'arhat_kick', 'flame_armor', 'wind_fire_blade'] },
  spy_q: { element: '草', petName: '裂幕潛行隼', moveIds: ['shadow_lock', 'soul_scatter', 'spider_silk', 'silver_snake'] },
  peony_lady: { element: '草', petName: '牡丹靈芯蝶', moveIds: ['grass_cloak', 'heavenly_flowers', 'spider_net', 'rejuvenation'] },
  storyteller_zhang: { element: '水', petName: '書海潮鳶', moveIds: ['mist_step', 'golden_needle', 'quicksand', 'willow_water'] },
  bounty_hunter_lei: { element: '火', petName: '裂火追跡狼', moveIds: ['iron_palm', 'blaze_sky', 'thunder_crash', 'explosive_pill'] },
  abu_trader: { element: '水', petName: '駝鈴潮行獸', moveIds: ['mist_step', 'quicksand', 'water_splash', 'willow_water'] },
  dunhuang_guardian: { element: '草', petName: '壁畫守靈龜', moveIds: ['golden_bell', 'rock_trap', 'rejuvenation', 'arhat_kick'] },
  sand_bandit_leader: { element: '火', petName: '炙砂掠奪鷹', moveIds: ['hot_sand_hell', 'bone_dissolver', 'hell_fire', 'explosive_pill'] },
  island_master: { element: '草', petName: '島核混相龍', moveIds: ['flood_torrent', 'wind_fire_blade', 'ultimate_dark', 'rejuvenation'] },
  dragon_wood_master: { element: '水', petName: '潮木試煉麟', moveIds: ['flood_torrent', 'thunder_crash', 'golden_bell', 'ice_toxin'] },
  ice_queen: { element: '水', petName: '霜冠冰棱狐', moveIds: ['ice_palm', 'flood_torrent', 'mist_step', 'willow_water'] },
  hunter_old_chen: { element: '草', petName: '雪林追痕犬', moveIds: ['rock_trap', 'spider_silk', 'needle_rain', 'quicksand'] },
  chief_son: { element: '火', petName: '草原赤騎虎', moveIds: ['arhat_kick', 'wind_fire_blade', 'iron_palm', 'flame_armor'] },
  wandering_poet: { element: '水', petName: '吟潮風琴鳥', moveIds: ['mist_step', 'willow_water', 'golden_needle', 'soul_scatter'] },
  bandit_king: { element: '火', petName: '蹄焰劫掠馬', moveIds: ['hell_fire', 'hot_sand_hell', 'bone_dissolver', 'ultimate_dark'] },
  ming_emperor: { element: '火', petName: '聖焰光翼獅', moveIds: ['blaze_sky', 'flame_armor', 'wind_fire_blade', 'thunder_crash'] },
  flame_ember: { element: '火', petName: '燼紋突擊鷹', moveIds: ['fire_lotus', 'blaze_sky', 'hell_fire', 'iron_palm'] },
  traitor: { element: '草', petName: '墮光噬影蛇', moveIds: ['ultimate_dark', 'shadow_slash', 'soul_scatter', 'ghost_fire'] },
  chamberlain: { element: '草', petName: '暗議裂脈蛛', moveIds: ['ultimate_dark', 'soul_drain', 'shadow_lock', 'silver_snake'] },
  shadow_assassin: { element: '火', petName: '夜焰絕命豹', moveIds: ['shadow_slash', 'silver_snake', 'explosive_pill', 'ghost_fire'] },
  double_agent: { element: '水', petName: '鏡潮雙棲狐', moveIds: ['mist_step', 'shadow_lock', 'curse_word', 'soul_scatter'] },
  mentor_winchman: { element: '火', petName: '熾核導師獸', moveIds: ['blaze_sky', 'thunder_crash', 'ultimate_dark', 'ghost_fire'] },
  mentor_tom: { element: '水', petName: '潮汐導師獸', moveIds: ['flood_torrent', 'golden_needle', 'mist_step', 'thunder_crash'] },
  mentor_harry: { element: '火', petName: '裂焰導師獸', moveIds: ['hell_fire', 'blaze_sky', 'wind_fire_blade', 'thunder_crash'] },
  mentor_kathy: { element: '草', petName: '纖維導師獸', moveIds: ['rejuvenation', 'spider_silk', 'ultimate_dark', 'golden_bell'] },
  mentor_yuzu: { element: '水', petName: '鏡潮導師獸', moveIds: ['flood_torrent', 'mist_step', 'golden_needle', 'ice_palm'] }
});
const NPC_MOVE_TIER_PLAN_BY_DIFFICULTY = Object.freeze({
  1: [1, 1, 1, 2],
  2: [1, 1, 2, 2],
  3: [1, 2, 2, 3],
  4: [2, 2, 3, 3],
  5: [2, 3, 3, 3]
});
const NPC_PET_BASELINE_BY_DIFFICULTY = Object.freeze({
  1: { attack: 12, defense: 7, hp: 64 },
  2: { attack: 16, defense: 9, hp: 80 },
  3: { attack: 21, defense: 12, hp: 98 },
  4: { attack: 27, defense: 16, hp: 124 },
  5: { attack: 34, defense: 20, hp: 152 }
});

function normalizePetElement(value = '') {
  if (PET && typeof PET.normalizePetElement === 'function') {
    return PET.normalizePetElement(value);
  }
  const text = String(value || '').trim();
  if (text === '火') return '火';
  if (text === '草') return '草';
  return '水';
}

function sanitizeLocationIdPart(value = '') {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return 'loc';
  const safe = source.replace(/[^\w\u4e00-\u9fff]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return safe || 'loc';
}

function getMoveTemplateById(moveId = '') {
  const id = String(moveId || '').trim();
  if (!id) return null;
  if (PET && typeof PET.getMoveById === 'function') {
    return PET.getMoveById(id);
  }
  const fallback = [
    ...(Array.isArray(PET?.POSITIVE_MOVES) ? PET.POSITIVE_MOVES : []),
    ...(Array.isArray(PET?.NEGATIVE_MOVES) ? PET.NEGATIVE_MOVES : []),
    ...(Array.isArray(PET?.INITIAL_MOVES) ? PET.INITIAL_MOVES : [])
  ];
  return fallback.find((m) => String(m?.id || '').trim() === id) || null;
}

function getMovePoolByElement(element = '') {
  if (PET && typeof PET.getMovesByElement === 'function') {
    return PET.getMovesByElement(element);
  }
  return [];
}

function buildNpcSkillDictFromMoveIds(moveIds = []) {
  const out = {};
  const realmByTier = { 1: '精通', 2: '大師', 3: '頂尖' };
  let idx = 0;
  for (const moveId of Array.isArray(moveIds) ? moveIds : []) {
    const tpl = getMoveTemplateById(moveId);
    if (!tpl?.name) continue;
    const tier = Math.max(1, Math.min(3, Number(tpl.tier || 1)));
    out[tpl.name] = {
      realm: realmByTier[tier] || '精通',
      proficiency: 260 + tier * 90 + idx * 35
    };
    idx += 1;
    if (idx >= 4) break;
  }
  return out;
}

function ensureNpcCombatProfile(npc = null, index = 0) {
  if (!npc || typeof npc !== 'object') return npc;
  const profile = NPC_COMBAT_PROFILES[String(npc.id || '').trim()] || {};
  const element = normalizePetElement(profile.element || npc.petElement || (npc.align === 'evil' ? '火' : '水'));
  const pool = getMovePoolByElement(element);
  const fallbackIds = pool.map((m) => String(m?.id || '').trim()).filter(Boolean);
  const allowedIds = new Set(fallbackIds);
  const moveTierById = new Map(pool.map((m) => [String(m?.id || '').trim(), Math.max(1, Math.min(3, Number(m?.tier || 1)))]));
  const tierBuckets = { 1: [], 2: [], 3: [] };
  for (const id of fallbackIds) {
    const tier = moveTierById.get(id) || 1;
    if (!tierBuckets[tier]) tierBuckets[tier] = [];
    tierBuckets[tier].push(id);
  }
  const locationDifficulty = Math.max(1, Math.min(5, Number(getLocationDifficulty(String(npc.loc || '')) || 3)));
  const tierPlan = Array.isArray(NPC_MOVE_TIER_PLAN_BY_DIFFICULTY[locationDifficulty])
    ? NPC_MOVE_TIER_PLAN_BY_DIFFICULTY[locationDifficulty]
    : NPC_MOVE_TIER_PLAN_BY_DIFFICULTY[3];
  const chosen = [];
  const used = new Set();

  const preferredByTier = { 1: [], 2: [], 3: [] };
  for (const moveId of Array.isArray(profile.moveIds) ? profile.moveIds : []) {
    const id = String(moveId || '').trim();
    if (!id || !allowedIds.has(id) || used.has(id)) continue;
    const tier = moveTierById.get(id) || 1;
    if (!preferredByTier[tier]) preferredByTier[tier] = [];
    preferredByTier[tier].push(id);
  }

  let cursor = Math.max(0, Number(index || 0));
  const pickForTier = (tier = 1) => {
    const preferred = preferredByTier[tier] || [];
    for (const id of preferred) {
      if (!id || used.has(id)) continue;
      used.add(id);
      return id;
    }
    const bucket = tierBuckets[tier] || [];
    // 防止 bucket 內全都已被 used 時進入無限迴圈
    let attempts = 0;
    const maxAttempts = bucket.length;
    while (bucket.length > 0 && attempts < maxAttempts) {
      const id = bucket[cursor % bucket.length];
      cursor += 1;
      attempts += 1;
      if (!id || used.has(id)) continue;
      used.add(id);
      return id;
    }
    return null;
  };

  const fallbackTierOrder = {
    1: [1, 2, 3],
    2: [2, 1, 3],
    3: [3, 2, 1]
  };

  for (const wantedTier of tierPlan) {
    const order = fallbackTierOrder[wantedTier] || [wantedTier, 2, 1, 3];
    let picked = null;
    for (const t of order) {
      picked = pickForTier(t);
      if (picked) break;
    }
    if (picked) chosen.push(picked);
  }

  // 防止 fallbackIds 全部都已 used 時進入無限迴圈
  let fillAttempts = 0;
  const maxFillAttempts = fallbackIds.length;
  while (chosen.length < 4 && fallbackIds.length > 0 && fillAttempts < maxFillAttempts) {
    const id = fallbackIds[cursor % fallbackIds.length];
    cursor += 1;
    fillAttempts += 1;
    if (!id || used.has(id)) continue;
    used.add(id);
    chosen.push(id);
  }
  if (chosen.length === 0 && fallbackIds.length > 0) {
    chosen.push(...fallbackIds.slice(0, 4));
  }

  const battle = Math.max(10, Number(npc?.stats?.戰力 || 20));
  const life = Math.max(40, Number(npc?.stats?.生命 || 80));
  const energy = Math.max(10, Number(npc?.stats?.能量 || 24));
  const baseline = NPC_PET_BASELINE_BY_DIFFICULTY[locationDifficulty] || NPC_PET_BASELINE_BY_DIFFICULTY[3];
  const hp = Math.max(48, Math.floor(baseline.hp + life * 0.18));
  const petAttack = Math.max(9, Math.floor(baseline.attack + battle * 0.14));
  const petDefense = Math.max(6, Math.floor(baseline.defense + energy * 0.08));

  npc.petElement = element;
  npc.npcDifficulty = locationDifficulty;
  npc.battleMoveIds = chosen.slice(0, 5);
  npc.skills = buildNpcSkillDictFromMoveIds(npc.battleMoveIds);
  npc.petTemplate = {
    name: String(profile.petName || `${npc.name}的伴寵`),
    element,
    attack: petAttack,
    defense: petDefense,
    speed: Math.max(12, Math.floor((Number(npc?.stats?.能量 || 30) + petAttack) * 0.24)),
    hp,
    maxHp: hp,
    moveIds: npc.battleMoveIds.slice(0, 4)
  };
  return npc;
}

function pickMentorMasterInitialLocation(index = 0) {
  if (!Array.isArray(MAP_LOCATIONS) || MAP_LOCATIONS.length === 0) return '襄陽城';
  const idx = Math.abs(Number(index || 0)) % MAP_LOCATIONS.length;
  return String(MAP_LOCATIONS[idx] || MAP_LOCATIONS[0] || '襄陽城');
}

function createMentorMasterAgent(profile = {}, index = 0) {
  const element = normalizePetElement(profile.element || '火');
  const moveIds = MENTOR_MASTER_MOVE_IDS.slice(0, 4);
  const loc = pickMentorMasterInitialLocation(index);
  return {
    id: String(profile.id || `mentor_master_${index + 1}`),
    name: String(profile.name || `導師${index + 1}`),
    title: String(profile.title || '前線導師'),
    sect: 'Renaiss',
    loc,
    align: 'good',
    mentorMaster: true,
    roaming: true,
    personality: '巡行各地，擅長以高強度友誼賽磨練新手。',
    stats: {
      戰力: Math.max(88, Number(profile.battle || 92)),
      生命: Math.max(220, Number(profile.hp || 232)),
      能量: Math.max(100, Number(profile.energy || 116)),
      智商: 92,
      魅力: 88,
      運氣: 84,
      財富: Math.max(75, Number(profile.wealth || 82))
    },
    skills: buildNpcSkillDictFromMoveIds(moveIds),
    inventory: ['導師徽章', '前線通行碼'],
    relationships: {},
    memory: [],
    petElement: element,
    battleMoveIds: moveIds,
    npcDifficulty: 5,
    petTemplate: {
      name: `${String(profile.name || '導師')}伴寵`,
      element,
      attack: 42,
      defense: 24,
      speed: 28,
      hp: 186,
      maxHp: 186,
      moveIds: moveIds.slice(0, 4)
    },
    alive: true,
    exp: 0,
    party: null,
    status: '巡行'
  };
}

function ensureMentorMasters(targetAgents = []) {
  if (!Array.isArray(targetAgents)) return false;
  let changed = false;
  const validLocSet = new Set(Array.isArray(MAP_LOCATIONS) ? MAP_LOCATIONS : []);

  for (let i = 0; i < MENTOR_MASTER_BLUEPRINTS.length; i++) {
    const blueprint = MENTOR_MASTER_BLUEPRINTS[i];
    const idx = targetAgents.findIndex((agent) => String(agent?.id || '') === String(blueprint.id || ''));
    if (idx < 0) {
      targetAgents.push(createMentorMasterAgent(blueprint, i));
      changed = true;
      continue;
    }
    const current = targetAgents[idx] || {};
    const loc = validLocSet.has(String(current.loc || '').trim())
      ? String(current.loc || '').trim()
      : pickMentorMasterInitialLocation(i);
    const merged = {
      ...current,
      name: String(blueprint.name || current.name || `導師${i + 1}`),
      title: String(blueprint.title || current.title || '前線導師'),
      sect: 'Renaiss',
      align: 'good',
      mentorMaster: true,
      roaming: true,
      loc,
      personality: String(current.personality || '巡行各地，擅長以高強度友誼賽磨練新手。'),
      stats: {
        ...(current.stats || {}),
        戰力: Math.max(Number(current?.stats?.戰力 || 0), Math.max(88, Number(blueprint.battle || 92))),
        生命: Math.max(Number(current?.stats?.生命 || 0), Math.max(220, Number(blueprint.hp || 232))),
        能量: Math.max(Number(current?.stats?.能量 || 0), Math.max(100, Number(blueprint.energy || 116))),
        智商: Math.max(Number(current?.stats?.智商 || 0), 90),
        魅力: Math.max(Number(current?.stats?.魅力 || 0), 86),
        運氣: Math.max(Number(current?.stats?.運氣 || 0), 82),
        財富: Math.max(Number(current?.stats?.財富 || 0), Math.max(75, Number(blueprint.wealth || 82)))
      },
      alive: current?.alive !== false,
      status: current?.status || '巡行'
    };
    if (JSON.stringify(current) !== JSON.stringify(merged)) {
      targetAgents[idx] = merged;
      changed = true;
    }
  }
  return changed;
}

function buildLocationAnchorAgent(location = '', slot = 1) {
  const loc = String(location || '').trim() || '襄陽城';
  const index = Math.max(1, Math.min(3, Number(slot || 1)));
  const locDiff = getLocationDifficultyValue(loc);
  const element = normalizePetElement(index % 3 === 0 ? '草' : (locDiff >= 4 ? '火' : '水'));
  const baseBattle = 16 + locDiff * 5 + index;
  const baseHp = 86 + locDiff * 18 + index * 6;
  const baseEnergy = 30 + locDiff * 8 + index * 2;
  const safeLoc = sanitizeLocationIdPart(loc);
  const id = `loc_anchor_${safeLoc}_${index}`;
  return {
    id,
    name: `${loc}聯絡員${index}`,
    title: `${loc}在地聯絡員`,
    sect: '中立',
    loc,
    align: 'neutral',
    localAnchor: true,
    roaming: false,
    personality: '熟悉地區動線與風險，會在關鍵時刻介入。',
    stats: {
      戰力: Math.max(18, baseBattle),
      生命: Math.max(90, baseHp),
      能量: Math.max(32, baseEnergy),
      智商: 72 + locDiff,
      魅力: 65 + index,
      運氣: 60 + locDiff,
      財富: 45 + locDiff * 4
    },
    skills: {},
    inventory: ['地區通行證', '便攜檢測貼片'],
    relationships: {},
    memory: [],
    petElement: element,
    alive: true,
    exp: 0,
    party: null,
    status: '駐守'
  };
}

function ensureLocationNpcCoverage(targetAgents = []) {
  if (!Array.isArray(targetAgents) || !Array.isArray(MAP_LOCATIONS)) return false;
  let changed = false;

  const isDigitalRoamer = (agent) => Boolean(agent?.roaming) && String(agent?.id || '').startsWith('digital_roamer_');

  for (const location of MAP_LOCATIONS) {
    const loc = String(location || '').trim();
    if (!loc) continue;
    const aliveHere = targetAgents.filter((agent) => {
      if (!agent || !agent.id) return false;
      if (String(agent.loc || '').trim() !== loc) return false;
      if (agent.alive === false) return false;
      if (isDigitalRoamer(agent)) return false;
      return true;
    });

    const currentCount = aliveHere.length;
    if (currentCount >= LOCATION_NPC_MIN_COUNT) continue;

    for (let slot = 1; slot <= LOCATION_NPC_MIN_COUNT; slot++) {
      const anchor = buildLocationAnchorAgent(loc, slot);
      const idx = targetAgents.findIndex((agent) => String(agent?.id || '') === String(anchor.id || ''));
      if (idx >= 0) {
        const merged = { ...targetAgents[idx], ...anchor, alive: true, status: String(targetAgents[idx]?.status || '駐守') };
        if (JSON.stringify(targetAgents[idx]) !== JSON.stringify(merged)) {
          targetAgents[idx] = merged;
          changed = true;
        }
      } else {
        targetAgents.push(anchor);
        changed = true;
      }
    }
  }
  return changed;
}

function deepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

let npcQuoteStore = { version: 1, quotesByPlayer: {} };
let npcQuoteStoreLoaded = false;

function normalizeQuoteComparableText(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[「」『』"'`“”‘’\s，。！？!?；;：:、（）()\[\]【】<>《》\-_.]/g, '')
    .trim();
}

function sanitizeQuoteId(input = '') {
  return String(input || '')
    .trim()
    .replace(/[^\w\u4e00-\u9fff:-]/g, '_')
    .slice(0, 72);
}

function normalizeNpcQuoteStorePayload(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawQuotes = source.quotesByPlayer && typeof source.quotesByPlayer === 'object' && !Array.isArray(source.quotesByPlayer)
    ? source.quotesByPlayer
    : {};
  const quotesByPlayer = {};
  for (const [playerId, entries] of Object.entries(rawQuotes)) {
    const safePlayerId = String(playerId || '').trim();
    if (!safePlayerId) continue;
    quotesByPlayer[safePlayerId] = (Array.isArray(entries) ? entries : [])
      .map((entry) => normalizeNpcQuoteEntry(entry, safePlayerId))
      .filter(Boolean);
  }
  return {
    version: Math.max(1, Number(source.version || 1)),
    quotesByPlayer
  };
}

function getNpcQuoteStore() {
  if (npcQuoteStoreState) return npcQuoteStoreState;
  npcQuoteStoreState = createSqliteMirroredSingletonStore({
    namespace: 'npc_quotes',
    mirrorFilePath: NPC_QUOTES_FILE,
    defaultValueFactory: () => ({ version: 1, quotesByPlayer: {} }),
    normalize: normalizeNpcQuoteStorePayload,
    onWriteError: (error) => {
      console.error('[NPC Quote] save failed:', error?.message || error);
    }
  });
  return npcQuoteStoreState;
}

function ensureNpcQuoteStoreLoaded() {
  if (npcQuoteStoreLoaded) return;
  npcQuoteStoreLoaded = true;
  try {
    npcQuoteStore = getNpcQuoteStore().read();
  } catch (e) {
    console.error('[NPC Quote] load failed:', e?.message || e);
    npcQuoteStore = { version: 1, quotesByPlayer: {} };
  }
}

function saveNpcQuoteStore() {
  ensureNpcQuoteStoreLoaded();
  try {
    npcQuoteStore = getNpcQuoteStore().replace(npcQuoteStore);
  } catch (e) {
    console.error('[NPC Quote] save failed:', e?.message || e);
  }
}

function normalizeNpcQuoteEntry(raw = {}, forcedPlayerId = '') {
  const playerId = String(forcedPlayerId || raw.playerId || '').trim();
  const speaker = String(raw.speaker || raw.npcName || '').trim().slice(0, 48);
  const text = String(raw.text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  if (!playerId || !speaker || !text) return null;
  const npcId = sanitizeQuoteId(raw.npcId || speaker || 'npc');
  const location = String(raw.location || '').trim().slice(0, 32);
  const source = String(raw.source || 'npc_dialogue').trim().slice(0, 40);
  const at = Number.isFinite(Number(raw.at)) ? Number(raw.at) : Date.now();
  return {
    playerId,
    npcId,
    speaker,
    text,
    location,
    source,
    at
  };
}

function buildNpcQuoteOwnerId(playerId = '') {
  const pid = sanitizeQuoteId(playerId);
  return pid ? `npc_quote_player:${pid}` : '';
}

function buildNpcQuoteNamespace(npcId = '') {
  const safe = sanitizeQuoteId(npcId);
  return safe ? `npc_quote:${safe}` : NPC_QUOTE_INDEX_NAMESPACE_ALL;
}

function tokenizeQuoteSearchText(text = '') {
  const source = String(text || '').toLowerCase();
  if (!source) return [];
  const zh = source.match(/[\u4e00-\u9fff]{1,2}/g) || [];
  const alpha = source.match(/[a-z0-9]{2,}/g) || [];
  const tokens = [...zh, ...alpha].map((item) => item.trim()).filter(Boolean);
  return [...new Set(tokens)].slice(0, 60);
}

function scoreNpcQuoteEntry(entry, context = {}) {
  const now = Date.now();
  const location = String(context.location || '').trim();
  const nearbyNpcSet = context.nearbyNpcSet instanceof Set ? context.nearbyNpcSet : new Set();
  const queryTokens = Array.isArray(context.queryTokens) ? context.queryTokens : [];
  const textTokens = tokenizeQuoteSearchText(entry.text);
  let overlap = 0;
  if (queryTokens.length > 0 && textTokens.length > 0) {
    const tokenSet = new Set(textTokens);
    for (const token of queryTokens) {
      if (tokenSet.has(token)) overlap += 1;
    }
  }
  const overlapScore = queryTokens.length > 0 ? Math.min(0.68, (overlap / queryTokens.length) * 0.9) : 0;
  const sameLocation = location && entry.location && entry.location === location ? 0.35 : 0;
  const nearbyNpcBoost = nearbyNpcSet.has(entry.npcId) ? 0.5 : 0;
  const ageHours = Math.max(0, (now - Number(entry.at || now)) / (3600 * 1000));
  const recency = Math.exp(-ageHours / (24 * 5)); // 5 天半衰
  const recencyScore = 0.32 * recency;
  return Number((overlapScore + sameLocation + nearbyNpcBoost + recencyScore).toFixed(4));
}

function appendNpcQuoteMemory(playerId, payload = {}) {
  const entry = normalizeNpcQuoteEntry(payload, playerId);
  if (!entry) return null;
  ensureNpcQuoteStoreLoaded();
  let finalEntry = null;
  npcQuoteStore = getNpcQuoteStore().update((store) => {
    const byPlayer = store.quotesByPlayer || {};
    const list = Array.isArray(byPlayer[entry.playerId]) ? byPlayer[entry.playerId] : [];

    const normText = normalizeQuoteComparableText(entry.text);
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (!item || typeof item !== 'object') continue;
      if (String(item.npcId || '') !== String(entry.npcId || '')) continue;
      const cmp = normalizeQuoteComparableText(item.text || '');
      if (!cmp || cmp !== normText) continue;
      const delta = Math.abs(Number(entry.at || 0) - Number(item.at || 0));
      if (delta <= 15 * 60 * 1000) {
        finalEntry = item;
        return store;
      }
    }

    list.push(entry);
    if (list.length > NPC_QUOTE_PLAYER_LIMIT) {
      list.splice(0, list.length - NPC_QUOTE_PLAYER_LIMIT);
    }
    byPlayer[entry.playerId] = list;
    store.quotesByPlayer = byPlayer;
    finalEntry = entry;
    return store;
  });

  if (!finalEntry) return null;

  const ownerId = buildNpcQuoteOwnerId(finalEntry.playerId);
  if (ownerId) {
    const memoryPayload = {
      type: 'npc_quote',
      content: `${finalEntry.speaker}：「${finalEntry.text}」`,
      outcome: `source=${finalEntry.source}${finalEntry.location ? `|loc=${finalEntry.location}` : ''}`,
      location: finalEntry.location,
      timestamp: finalEntry.at,
      tags: ['npc_quote', finalEntry.npcId, finalEntry.source],
      importance: 2
    };
    MEMORY_INDEX.rememberEntityMemory(ownerId, memoryPayload, {
      namespace: buildNpcQuoteNamespace(finalEntry.npcId)
    }).catch((e) => {
      console.log('[NPC Quote][Index] remember failed:', e?.message || e);
    });
    MEMORY_INDEX.rememberEntityMemory(ownerId, memoryPayload, {
      namespace: NPC_QUOTE_INDEX_NAMESPACE_ALL
    }).catch((e) => {
      console.log('[NPC Quote][Index all] remember failed:', e?.message || e);
    });
  }

  return finalEntry;
}

function getPlayerNpcQuoteEvidence(playerId, options = {}) {
  const pid = String(playerId || '').trim();
  if (!pid) return [];
  ensureNpcQuoteStoreLoaded();
  const list = Array.isArray(npcQuoteStore?.quotesByPlayer?.[pid]) ? npcQuoteStore.quotesByPlayer[pid] : [];
  if (list.length <= 0) return [];
  const location = String(options.location || '').trim();
  const queryText = clipText(options.queryText || '', 760);
  const limit = Math.max(1, Number(options.limit || NPC_QUOTE_DEFAULT_LIMIT));
  const nearbyNpcIds = Array.isArray(options.nearbyNpcIds) && options.nearbyNpcIds.length > 0
    ? options.nearbyNpcIds
    : (location ? getNearbyNpcIds(location, Math.max(1, Number(options.nearbyLimit || 2))) : []);
  const nearbyNpcSet = new Set(nearbyNpcIds.map((id) => sanitizeQuoteId(id)));
  const queryTokens = tokenizeQuoteSearchText(queryText);

  const ranked = list
    .map((item) => normalizeNpcQuoteEntry(item, pid))
    .filter(Boolean)
    .map((item) => ({
      ...item,
      score: scoreNpcQuoteEntry(item, { location, nearbyNpcSet, queryTokens })
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.at || 0) - Number(a.at || 0);
    });

  const out = [];
  const seen = new Set();
  for (const item of ranked) {
    const key = `${item.speaker}|${normalizeQuoteComparableText(item.text)}|${item.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      speaker: item.speaker,
      text: item.text,
      location: item.location,
      source: item.source,
      npcId: item.npcId,
      at: Number(item.at || 0),
      score: Number(item.score || 0)
    });
    if (out.length >= limit) break;
  }
  return out;
}

function clearPlayerNpcQuoteMemory(playerId = '') {
  const pid = String(playerId || '').trim();
  if (!pid) return 0;
  ensureNpcQuoteStoreLoaded();
  const current = Array.isArray(npcQuoteStore?.quotesByPlayer?.[pid]) ? npcQuoteStore.quotesByPlayer[pid].length : 0;
  npcQuoteStore = getNpcQuoteStore().update((store) => {
    if (store?.quotesByPlayer && Object.prototype.hasOwnProperty.call(store.quotesByPlayer, pid)) {
      delete store.quotesByPlayer[pid];
    }
    return store;
  });
  return current;
}

function clearAllNpcQuoteMemory() {
  ensureNpcQuoteStoreLoaded();
  let total = 0;
  for (const key of Object.keys(npcQuoteStore?.quotesByPlayer || {})) {
    const len = Array.isArray(npcQuoteStore.quotesByPlayer[key]) ? npcQuoteStore.quotesByPlayer[key].length : 0;
    total += len;
  }
  npcQuoteStore = getNpcQuoteStore().replace({ version: 1, quotesByPlayer: {} });
  return total;
}

function getLocationDifficultyValue(location = '') {
  return Math.max(1, Number(getLocationDifficulty(String(location || '').trim()) || 3));
}

function pickDigitalRoamerSpawnLocation() {
  if (!Array.isArray(MAP_LOCATIONS) || MAP_LOCATIONS.length === 0) return '襄陽城';
  const pool = MAP_LOCATIONS.map((loc) => {
    const diff = getLocationDifficultyValue(loc);
    const weight = diff <= 2 ? 0.95 : diff === 3 ? 1.1 : diff === 4 ? 1.35 : 1.55;
    return { loc, weight };
  });
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * Math.max(0.0001, total);
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item.loc;
  }
  return pool[pool.length - 1]?.loc || '襄陽城';
}

function normalizeDigitalRoamerGroup(group = '') {
  const text = String(group || '').trim();
  if (!text) return DIGITAL_ROAMER_GROUPS[0];
  if (DIGITAL_ROAMER_GROUP_ALIAS[text]) return DIGITAL_ROAMER_GROUP_ALIAS[text];
  const lower = text.toLowerCase();
  const matched = Object.keys(DIGITAL_ROAMER_GROUP_ALIAS).find((alias) => alias.toLowerCase() === lower);
  return matched ? DIGITAL_ROAMER_GROUP_ALIAS[matched] : DIGITAL_ROAMER_GROUPS[0];
}

function createDigitalRoamerBlueprint(index = 0, group = 'NemoX') {
  const safeGroup = normalizeDigitalRoamerGroup(group);
  const base = DIGITAL_ROAMER_GROUP_BASE[safeGroup] || DIGITAL_ROAMER_GROUP_BASE.NemoX;
  const moveIds = DIGITAL_ROAMER_GROUP_MOVES[safeGroup] || DIGITAL_ROAMER_GROUP_MOVES.NemoX;
  const petElement = normalizePetElement(DIGITAL_ROAMER_GROUP_ELEMENT[safeGroup] || '水');
  const serial = String(index + 1).padStart(2, '0');
  const loc = pickDigitalRoamerSpawnLocation();

  return {
    id: `digital_roamer_${serial}`,
    name: '匿名滲透者',
    title: `Digital 滲透者第${serial}號`,
    sect: 'Digital',
    loc,
    align: 'evil',
    roaming: true,
    hiddenName: true,
    digitalGroup: safeGroup,
    personality: '擅長偽裝與試探，不主動暴露真實目的',
    stats: {
      戰力: base.battle + (index % 3) * 2,
      生命: base.hp + (index % 4) * 6,
      能量: 45 + (index % 5) * 4,
      智商: 72 + (index % 6),
      魅力: 58 + (index % 7),
      運氣: 55 + (index % 4) * 3,
      財富: 70 + (index % 5) * 6
    },
    skills: buildNpcSkillDictFromMoveIds(moveIds),
    inventory: ['偽裝徽章', '干擾發射器'],
    relationships: {},
    memory: [],
    petElement,
    petTemplate: {
      name: `${safeGroup}影獸`,
      element: petElement,
      attack: base.petAttack + (index % 3),
      hp: base.petHp + (index % 4) * 4,
      maxHp: base.petHp + (index % 4) * 4,
      defense: Math.max(8, Math.floor((base.petAttack + (index % 3)) * 0.62)),
      speed: 16 + (index % 4),
      moveIds: [...moveIds]
    }
  };
}

function buildDigitalRoamerBlueprints() {
  const list = [];
  for (let i = 0; i < DIGITAL_ROAMER_TOTAL; i++) {
    const group = DIGITAL_ROAMER_GROUPS[Math.floor(i / 5)] || DIGITAL_ROAMER_GROUPS[0];
    list.push(createDigitalRoamerBlueprint(i, group));
  }
  return list;
}

const DIGITAL_ROAMER_BLUEPRINTS = buildDigitalRoamerBlueprints();

function ensureDigitalRoamers(targetAgents = []) {
  if (!Array.isArray(targetAgents)) return false;
  let changed = false;
  for (const blueprint of DIGITAL_ROAMER_BLUEPRINTS) {
    const idx = targetAgents.findIndex((agent) => String(agent?.id || '') === String(blueprint.id || ''));
    if (idx < 0) {
      targetAgents.push({
        ...deepClone(blueprint),
        alive: true,
        exp: 0,
        party: null,
        status: '游走'
      });
      changed = true;
      continue;
    }
    const current = targetAgents[idx];
    const merged = {
      ...current,
      name: '匿名滲透者',
      title: blueprint.title,
      sect: 'Digital',
      align: 'evil',
      roaming: true,
      hiddenName: true,
      digitalGroup: blueprint.digitalGroup,
      personality: blueprint.personality,
      petElement: blueprint.petElement,
      skills: buildNpcSkillDictFromMoveIds(blueprint.petTemplate?.moveIds || []),
      petTemplate: deepClone(blueprint.petTemplate),
      alive: current?.alive !== false,
      status: current?.status || '游走'
    };
    if (JSON.stringify(current) !== JSON.stringify(merged)) {
      targetAgents[idx] = merged;
      changed = true;
    }
  }
  return changed;
}

function pickDigitalRoamerDestination(currentLoc = '') {
  if (!Array.isArray(MAP_LOCATIONS) || MAP_LOCATIONS.length === 0) return currentLoc || '襄陽城';
  const current = String(currentLoc || '').trim();
  const pool = MAP_LOCATIONS
    .filter((loc) => String(loc || '').trim() && String(loc || '').trim() !== current)
    .map((loc) => {
      const diff = getLocationDifficultyValue(loc);
      const weight = diff <= 2 ? 0.95 : diff === 3 ? 1.1 : diff === 4 ? 1.35 : 1.55;
      return { loc, weight };
    });
  if (pool.length <= 0) return current || MAP_LOCATIONS[0];
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * Math.max(0.0001, total);
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item.loc;
  }
  return pool[pool.length - 1]?.loc || current || MAP_LOCATIONS[0];
}

function stepDigitalRoamerMovement(stepCount = 1) {
  const steps = Math.max(1, Math.floor(Number(stepCount || 1)));
  let moved = 0;
  for (let step = 0; step < steps; step++) {
    for (const agent of agents) {
      if (!agent?.roaming || !String(agent?.id || '').startsWith('digital_roamer_')) continue;
      if (agent.alive === false) continue;
      if (Math.random() > 0.42) continue;
      const nextLoc = pickDigitalRoamerDestination(agent.loc);
      if (!nextLoc || nextLoc === agent.loc) continue;
      agent.loc = nextLoc;
      agent.status = '游走';
      moved += 1;
    }
  }
  return moved;
}

function stepMentorMasterMovement(stepCount = 1) {
  const steps = Math.max(1, Math.floor(Number(stepCount || 1)));
  let moved = 0;
  for (let step = 0; step < steps; step++) {
    for (const agent of agents) {
      if (!agent?.mentorMaster || agent?.roaming !== true) continue;
      if (agent.alive === false) continue;
      if (Math.random() > 0.36) continue;
      const nextLoc = pickDigitalRoamerDestination(agent.loc);
      if (!nextLoc || nextLoc === agent.loc) continue;
      agent.loc = nextLoc;
      agent.status = '巡行';
      moved += 1;
    }
  }
  return moved;
}

function getRoamingDigitalVillainsAtLocation(location, limit = 2) {
  const loc = String(location || '').trim();
  if (!loc) return [];
  ensureDigitalRoamers(agents);
  const maxItems = Math.max(1, Math.min(8, Number(limit || 2)));
  const candidates = agents
    .filter((agent) => agent?.roaming && agent?.alive !== false && String(agent.loc || '').trim() === loc)
    .map((agent) => ({
      id: String(agent.id || ''),
      group: normalizeDigitalRoamerGroup(agent.digitalGroup || 'NemoX'),
      location: String(agent.loc || loc),
      title: String(agent.title || 'Digital 滲透者'),
      petTemplate: deepClone(agent.petTemplate || {})
    }));
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, maxItems);
}

function buildRoamingDigitalEncounterEnemy(location, options = {}) {
  let list = getRoamingDigitalVillainsAtLocation(location, Math.max(1, Number(options.limit || 3)));
  if (!Array.isArray(list) || list.length === 0) {
    const fallbackPool = agents.filter((agent) => agent?.roaming && agent?.alive !== false);
    if (fallbackPool.length > 0 && (options.forceRelocate === true || Math.random() < 0.62)) {
      const fallback = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
      fallback.loc = String(location || fallback.loc || '襄陽城');
      fallback.status = '滲透中';
      list = [{
        id: String(fallback.id || ''),
        group: normalizeDigitalRoamerGroup(fallback.digitalGroup || 'NemoX'),
        location: String(fallback.loc || location || '襄陽城'),
        title: String(fallback.title || 'Digital 滲透者'),
        petTemplate: deepClone(fallback.petTemplate || {})
      }];
      if (options.persist !== false) saveWorld();
    }
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  const picked = list[Math.floor(Math.random() * list.length)];
  const difficulty = getLocationDifficultyValue(location || picked.location);
  const source = agents.find((agent) => String(agent?.id || '') === String(picked.id || '')) || {};
  const petTemplate = source.petTemplate || picked.petTemplate || {};

  const hpBase = Math.max(90, Math.floor(Number(source?.stats?.生命 || 150) * (0.72 + difficulty * 0.08)));
  const atkBase = Math.max(16, Math.floor(Number(source?.stats?.戰力 || 32) * (0.64 + difficulty * 0.05)));
  const defBase = Math.max(8, Math.floor(atkBase * 0.52));
  const petAttack = Math.max(10, Number(petTemplate.attack || 18));
  const petHp = Math.max(36, Number(petTemplate.hp || 72));
  const moveIds = Array.isArray(petTemplate.moveIds) ? petTemplate.moveIds.filter(Boolean).slice(0, 5) : [];
  const rewardMin = 45 + difficulty * 22;
  const rewardMax = rewardMin + 80;

  return {
    npcId: String(source.id || picked.id || ''),
    group: normalizeDigitalRoamerGroup(source.digitalGroup || picked.group || 'NemoX'),
    enemy: {
      id: String(source.id || picked.id || ''),
      name: '匿名滲透者',
      hp: hpBase,
      maxHp: hpBase,
      attack: atkBase,
      defense: defBase,
      moves: moveIds.map((id) => ({ id: String(id) })),
      reward: { gold: [rewardMin, rewardMax] },
      faction: 'digital',
      villain: true,
      isMonster: false,
      companionPet: {
        name: String(petTemplate.name || '無名伴寵'),
        element: normalizePetElement(petTemplate.element || source.petElement || '水'),
        attack: petAttack,
        hp: petHp,
        maxHp: petHp
      }
    },
    hint: `你在${location || picked.location}察覺到一名無名滲透者正在試探路線，對方的伴寵先一步撲了上來。`
  };
}

function advanceRoamingDigitalVillains(options = {}) {
  const steps = Math.max(1, Math.floor(Number(options.steps || 1)));
  const changedByRoamerEnsure = ensureDigitalRoamers(agents);
  const changedByMentorEnsure = ensureMentorMasters(agents);
  const changedByCoverage = ensureLocationNpcCoverage(agents);
  const movedDigital = stepDigitalRoamerMovement(steps);
  const movedMentor = stepMentorMasterMovement(steps);
  const moved = movedDigital + movedMentor;
  const changed = changedByRoamerEnsure || changedByMentorEnsure || changedByCoverage || moved > 0;
  if (changed && options.persist !== false) {
    saveWorld();
  }
  return { changed, moved, movedDigital, movedMentor };
}

const FACTION_WAR_CONFIG = {
  minIntervalDays: 2,
  maxIntervalDays: 5,
  minPower: 35,
  maxPower: 65,
  maxGap: 12,
  minTension: 30,
  maxTension: 90,
  historyLimit: 32
};

const FACTION_PRESENCE_CONFIG = {
  orderDailyMin: 2,
  orderDailyMax: 4,
  chaosDailyMin: 1,
  chaosDailyMax: 3,
  lowTierOrderSpawnDayRate: 0.35
};

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function randInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function pickRandomItem(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeightedUniqueLocations(pool, count) {
  if (!Array.isArray(pool) || pool.length === 0 || count <= 0) return [];
  const draft = pool
    .map(item => ({
      name: item.name,
      weight: Math.max(0.01, Number(item.weight || 0.01))
    }))
    .filter(item => item.name);
  const picked = [];

  while (draft.length > 0 && picked.length < count) {
    const total = draft.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < draft.length; i++) {
      roll -= draft[i].weight;
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    picked.push(draft[idx].name);
    draft.splice(idx, 1);
  }

  return picked;
}

function buildFactionPresencePools() {
  const entries = MAP_LOCATIONS
    .map((name) => {
      return {
        name,
        difficulty: Number(getLocationDifficulty(name) || 3)
      };
    })
    .filter(item => item.name);

  const orderLow = [];
  const orderHigh = [];
  const chaosHigh = [];

  for (const entry of entries) {
    const diff = entry.difficulty;
    if (diff <= 2) {
      orderLow.push({
        name: entry.name,
        weight: diff <= 1 ? 0.25 : 0.4
      });
    } else {
      orderHigh.push({
        name: entry.name,
        weight: 0.8 + (diff - 2) * 0.35
      });
    }

    if (diff >= 4) {
      chaosHigh.push({
        name: entry.name,
        weight: diff >= 5 ? 1.45 : 1.0
      });
    }
  }

  return { orderLow, orderHigh, chaosHigh };
}

function maybeGenerateFactionPresenceForDay() {
  if (!world.factionPresence || typeof world.factionPresence !== 'object') {
    world.factionPresence = {
      day: 0,
      orderLocations: [],
      chaosLocations: [],
      generatedAt: 0
    };
  }

  const state = world.factionPresence;
  if (Number(state.day || 0) === Number(world.day)) {
    return state;
  }

  const pools = buildFactionPresencePools();
  const orderCount = randInt(FACTION_PRESENCE_CONFIG.orderDailyMin, FACTION_PRESENCE_CONFIG.orderDailyMax);
  const chaosCount = randInt(FACTION_PRESENCE_CONFIG.chaosDailyMin, FACTION_PRESENCE_CONFIG.chaosDailyMax);

  const lowTierSlots = Math.random() < FACTION_PRESENCE_CONFIG.lowTierOrderSpawnDayRate ? 1 : 0;
  const orderLowPicked = pickWeightedUniqueLocations(pools.orderLow, Math.min(lowTierSlots, orderCount));
  const pickedLowSet = new Set(orderLowPicked);
  const orderHighPool = pools.orderHigh.filter(item => !pickedLowSet.has(item.name));
  const orderHighPicked = pickWeightedUniqueLocations(orderHighPool, Math.max(0, orderCount - orderLowPicked.length));
  const orderLocations = [...orderHighPicked, ...orderLowPicked];

  const chaosLocations = pickWeightedUniqueLocations(pools.chaosHigh, chaosCount);

  state.day = world.day;
  state.orderLocations = orderLocations;
  state.chaosLocations = chaosLocations;
  state.generatedAt = Date.now();
  state.policy = {
    chaosOnlyHighDifficulty: true,
    orderLowDifficultyReduced: true
  };

  const orderText = orderLocations.length > 0 ? orderLocations.join('、') : '暫無目擊';
  const chaosText = chaosLocations.length > 0 ? chaosLocations.join('、') : '暫無目擊';
  pushWorldEvent({
    day: world.day,
    type: 'faction_presence',
    message: `🛰️ 勢力目擊：正派行動於 ${orderText}；Digital 蹤跡僅見高危區 ${chaosText}。`,
    timestamp: Date.now(),
    meta: {
      orderLocations: [...orderLocations],
      chaosLocations: [...chaosLocations]
    }
  });

  const rumor = `第${world.day}日傳聞：正派在多地巡行，Digital 勢力只在高危地帶活動。`;
  world.rumors.unshift(rumor);
  if (world.rumors.length > 12) world.rumors.length = 12;

  return state;
}

function pickFactionSkirmishLocation(lastLocation = '') {
  const cities = WORLD_MAP.getAllCities().map(c => c.name).filter(Boolean);
  const pool = cities.filter(name => name !== lastLocation);
  return pickRandomItem(pool.length > 0 ? pool : cities) || '襄陽城';
}

function calcNextSkirmishInterval(tension) {
  const base = randInt(FACTION_WAR_CONFIG.minIntervalDays, FACTION_WAR_CONFIG.maxIntervalDays);
  if (tension >= 75) return Math.max(FACTION_WAR_CONFIG.minIntervalDays, base - 1);
  if (tension <= 40) return Math.min(FACTION_WAR_CONFIG.maxIntervalDays, base + 1);
  return base;
}

function ensureFactionWarState() {
  if (!world.factionWar || typeof world.factionWar !== 'object') {
    world.factionWar = {
      orderPower: 50,
      chaosPower: 50,
      tension: 55,
      skirmishCount: 0,
      lastSkirmishDay: 0,
      nextSkirmishDay: world.day + randInt(FACTION_WAR_CONFIG.minIntervalDays, FACTION_WAR_CONFIG.maxIntervalDays),
      lastLocation: '',
      lastWinner: '',
      history: [],
      updatedAt: Date.now()
    };
  }

  const state = world.factionWar;
  state.orderPower = clampNumber(state.orderPower, FACTION_WAR_CONFIG.minPower, FACTION_WAR_CONFIG.maxPower);
  state.chaosPower = clampNumber(state.chaosPower, FACTION_WAR_CONFIG.minPower, FACTION_WAR_CONFIG.maxPower);
  state.tension = clampNumber(state.tension, FACTION_WAR_CONFIG.minTension, FACTION_WAR_CONFIG.maxTension);
  state.skirmishCount = Math.max(0, Number(state.skirmishCount || 0));
  state.lastSkirmishDay = Math.max(0, Number(state.lastSkirmishDay || 0));
  state.lastLocation = String(state.lastLocation || '');
  state.lastWinner = String(state.lastWinner || '');
  if (!Array.isArray(state.history)) state.history = [];

  const nextDay = Number(state.nextSkirmishDay || 0);
  if (!Number.isFinite(nextDay) || nextDay <= 0) {
    state.nextSkirmishDay = world.day + calcNextSkirmishInterval(state.tension);
  }

  state.updatedAt = Date.now();
  return state;
}

function calcFactionWinner(state) {
  const diff = Number(state.orderPower || 50) - Number(state.chaosPower || 50);
  const chaosWinRate = clampNumber(0.5 + diff * 0.02, 0.28, 0.72);
  return Math.random() < chaosWinRate ? 'chaos' : 'order';
}

function rebalanceFactionPower(state) {
  const order = Number(state.orderPower || 50);
  const chaos = Number(state.chaosPower || 50);
  let adjustedOrder = order + (50 - order) * 0.16;
  let adjustedChaos = chaos + (50 - chaos) * 0.16;

  let gap = adjustedOrder - adjustedChaos;
  if (Math.abs(gap) > FACTION_WAR_CONFIG.maxGap) {
    const center = (adjustedOrder + adjustedChaos) / 2;
    const halfGap = FACTION_WAR_CONFIG.maxGap / 2;
    adjustedOrder = center + (gap > 0 ? halfGap : -halfGap);
    adjustedChaos = center + (gap > 0 ? -halfGap : halfGap);
  }

  state.orderPower = clampNumber(Math.round(adjustedOrder), FACTION_WAR_CONFIG.minPower, FACTION_WAR_CONFIG.maxPower);
  state.chaosPower = clampNumber(Math.round(adjustedChaos), FACTION_WAR_CONFIG.minPower, FACTION_WAR_CONFIG.maxPower);
}

function applyFactionMomentum(state, winner) {
  const decisive = randInt(3, 6);
  const fallback = randInt(1, 3);
  if (winner === 'order') {
    state.orderPower += decisive;
    state.chaosPower += fallback;
  } else {
    state.chaosPower += decisive;
    state.orderPower += fallback;
  }
  rebalanceFactionPower(state);
}

function pushFactionHistory(state, item) {
  state.history.unshift(item);
  if (state.history.length > FACTION_WAR_CONFIG.historyLimit) {
    state.history.length = FACTION_WAR_CONFIG.historyLimit;
  }
}

function pushWorldEvent(eventObj) {
  if (!Array.isArray(world.events)) world.events = [];
  world.events.unshift(eventObj);
  if (world.events.length > MAX_WORLD_EVENTS) world.events.length = MAX_WORLD_EVENTS;
}

async function maybeRunFactionSkirmish(apiKey = '') {
  const state = ensureFactionWarState();
  state.tension = clampNumber(state.tension + randInt(1, 3), FACTION_WAR_CONFIG.minTension, FACTION_WAR_CONFIG.maxTension);

  if (world.day < state.nextSkirmishDay) {
    state.updatedAt = Date.now();
    return null;
  }

  const location = pickFactionSkirmishLocation(state.lastLocation);
  const winner = calcFactionWinner(state);
  const before = {
    orderPower: state.orderPower,
    chaosPower: state.chaosPower,
    tension: state.tension
  };

  const narrative = await FACTION_DIRECTOR.generateFactionSkirmishNarrative({
    day: world.day,
    location,
    tension: state.tension,
    orderPower: state.orderPower,
    chaosPower: state.chaosPower,
    lastWinner: state.lastWinner
  }, apiKey);

  applyFactionMomentum(state, winner);
  state.skirmishCount += 1;
  state.lastSkirmishDay = world.day;
  state.lastLocation = location;
  state.lastWinner = winner;
  state.tension = clampNumber(
    state.tension - randInt(4, 9) + randInt(0, 3),
    FACTION_WAR_CONFIG.minTension,
    FACTION_WAR_CONFIG.maxTension
  );
  state.nextSkirmishDay = world.day + calcNextSkirmishInterval(state.tension);
  state.updatedAt = Date.now();

  const summary = `${narrative.headline}\n${narrative.story}\n🔹正派收益：${narrative.orderGain}\n🔸Digital收益：${narrative.chaosGain}\n♻️ 平衡：${narrative.balanceHint}`;
  pushWorldEvent({
    day: world.day,
    type: 'faction_skirmish',
    message: summary,
    timestamp: Date.now(),
    meta: {
      location,
      winner,
      source: narrative.source || 'template',
      before,
      after: {
        orderPower: state.orderPower,
        chaosPower: state.chaosPower,
        tension: state.tension
      }
    }
  });

  const rumor = `第${world.day}日傳聞：${location}再爆正派與 Digital 勢力衝突，雙方互有進退。`;
  world.rumors.unshift(rumor);
  if (world.rumors.length > 12) world.rumors.length = 12;

  pushFactionHistory(state, {
    day: world.day,
    location,
    winner,
    headline: narrative.headline,
    source: narrative.source || 'template',
    orderPower: state.orderPower,
    chaosPower: state.chaosPower,
    tension: state.tension,
    timestamp: Date.now()
  });

  return {
    triggered: true,
    day: world.day,
    location,
    winner,
    headline: narrative.headline,
    story: narrative.story,
    source: narrative.source || 'template',
    orderPower: state.orderPower,
    chaosPower: state.chaosPower,
    tension: state.tension,
    nextSkirmishDay: state.nextSkirmishDay
  };
}

function getFactionWarStatus() {
  const state = ensureFactionWarState();
  return JSON.parse(JSON.stringify(state));
}

function getFactionPresenceStatus() {
  const state = maybeGenerateFactionPresenceForDay();
  return JSON.parse(JSON.stringify(state || {}));
}

function getFactionPresenceForLocation(location) {
  const loc = String(location || '').trim();
  if (!loc) return { orderHere: false, chaosHere: false };
  const state = maybeGenerateFactionPresenceForDay();
  const orderLocations = Array.isArray(state?.orderLocations) ? state.orderLocations : [];
  const chaosLocations = Array.isArray(state?.chaosLocations) ? state.chaosLocations : [];
  return {
    orderHere: orderLocations.includes(loc),
    chaosHere: chaosLocations.includes(loc),
    day: Number(state?.day || world.day)
  };
}

async function triggerFactionSkirmishNow(apiKey = '') {
  const state = ensureFactionWarState();
  state.nextSkirmishDay = world.day;
  return maybeRunFactionSkirmish(apiKey);
}

// ============== 玩家記憶系統 ==============
const LONG_TERM_MEMORY_CONFIG = {
  recentWindow: 20,
  minMemoriesForDigest: 28,
  minArchivedForDigest: 8,
  maxSummaryChars: 680,
  maxTypeItems: 4,
  maxLocationItems: 3,
  maxTagItems: 5,
  maxHighlights: 4
};
const MEMORY_AUDIT_LIMIT = 240;

const MEMORY_NAMESPACE = 'story';
const NPC_MEMORY_PUBLIC_NAMESPACE = 'npc_public';
const NPC_MEMORY_PRIVATE_NAMESPACE_PREFIX = 'npc_private';
const MEMORY_INDEX_WARMING = new Set();

function clipText(text, maxChars = 120) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (source.length <= maxChars) return source;
  return source.slice(0, maxChars) + '...';
}

function hasFriendDuelTag(tags = []) {
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => String(tag || '').trim().toLowerCase() === 'friend_duel');
}

function isExcludedNarrativeMemoryEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') return false;
  const type = String(entry.type || '').trim();
  const content = String(entry.content || '').trim();
  const outcome = String(entry.outcome || '').trim();
  const merged = `${type} ${content} ${outcome}`.toLowerCase();
  if (type.includes('好友友誼戰')) return true;
  if (merged.includes('好友友誼戰')) return true;
  if (merged.includes('friend_duel')) return true;
  if (hasFriendDuelTag(entry.tags)) return true;
  return false;
}

function getNarrativeEligibleMemories(memories = []) {
  if (!Array.isArray(memories)) return [];
  return memories.filter((item) => !isExcludedNarrativeMemoryEntry(item));
}

function normalizeMemoryDigest(digest) {
  if (!digest || typeof digest !== 'object') return null;
  const summary = String(digest.summary || '').trim();
  if (!summary) return null;
  return {
    version: Number.isFinite(Number(digest.version)) ? Number(digest.version) : 1,
    builtAt: Number.isFinite(Number(digest.builtAt)) ? Number(digest.builtAt) : Date.now(),
    totalMemories: Number.isFinite(Number(digest.totalMemories)) ? Number(digest.totalMemories) : 0,
    archivedCount: Number.isFinite(Number(digest.archivedCount)) ? Number(digest.archivedCount) : 0,
    recentWindow: Number.isFinite(Number(digest.recentWindow)) ? Number(digest.recentWindow) : LONG_TERM_MEMORY_CONFIG.recentWindow,
    sourceLatestTimestamp: Number.isFinite(Number(digest.sourceLatestTimestamp)) ? Number(digest.sourceLatestTimestamp) : 0,
    summary
  };
}

function normalizeMemoryEntry(entry, fallbackType = 'action') {
  if (!entry) return null;

  if (typeof entry === 'string') {
    return {
      type: fallbackType,
      content: entry,
      outcome: '',
      location: '',
      tags: [],
      importance: 0,
      timestamp: Date.now()
    };
  }

  if (typeof entry !== 'object') return null;

  const content = String(entry.content || entry.text || '').trim();
  if (!content) return null;

  return {
    type: String(entry.type || fallbackType),
    content,
    outcome: String(entry.outcome || '').trim(),
    location: String(entry.location || '').trim(),
    tags: Array.isArray(entry.tags) ? entry.tags.map(t => String(t)).slice(0, 6) : [],
    importance: Number.isFinite(Number(entry.importance)) ? Number(entry.importance) : 0,
    timestamp: Number.isFinite(Number(entry.timestamp)) ? Number(entry.timestamp) : Date.now()
  };
}

function normalizeMemoryAuditEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const content = String(entry.content || '').trim();
  const layer = String(entry.layer || '').trim();
  const category = String(entry.category || '').trim();
  const reason = String(entry.reason || '').trim();
  if (!content && !reason) return null;
  return {
    id: String(entry.id || `ma_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    at: Number.isFinite(Number(entry.at)) ? Number(entry.at) : Date.now(),
    turn: Math.max(0, Math.floor(Number(entry.turn || 0))),
    location: String(entry.location || '').trim().slice(0, 32),
    layer: layer || 'player_memory',
    category: category || '一般記憶',
    reason: reason || '系統判定需保留',
    content: content.slice(0, 200),
    outcome: String(entry.outcome || '').trim().slice(0, 160),
    source: String(entry.source || '').trim().slice(0, 32),
    tags: Array.isArray(entry.tags) ? entry.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8) : []
  };
}

function normalizePlayerMemorySchema(player) {
  if (!player || typeof player !== 'object') return player;

  const modern = Array.isArray(player.memories) ? player.memories : [];
  const legacy = Array.isArray(player.memory) ? player.memory : [];
  const merged = [...modern, ...legacy]
    .map(entry => normalizeMemoryEntry(entry, 'action'))
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp);

  const deduped = [];
  const seen = new Set();
  for (const entry of merged) {
    const key = `${entry.type}|${entry.content}|${entry.outcome}|${entry.location}|${entry.timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
    if (deduped.length >= 80) break;
  }

  player.memories = deduped;
  const audits = Array.isArray(player.memoryAudit) ? player.memoryAudit : [];
  const normalizedAudits = [];
  const seenAudit = new Set();
  for (const item of audits) {
    const row = normalizeMemoryAuditEntry(item);
    if (!row) continue;
    const key = `${row.turn}|${row.layer}|${row.content}|${row.reason}|${row.at}`;
    if (seenAudit.has(key)) continue;
    seenAudit.add(key);
    normalizedAudits.push(row);
    if (normalizedAudits.length >= MEMORY_AUDIT_LIMIT) break;
  }
  player.memoryAudit = normalizedAudits;
  player.memoryDigest = normalizeMemoryDigest(player.memoryDigest);
  if ('memory' in player) delete player.memory;
  return player;
}

function deriveMemoryAuditMeta(memory = {}) {
  const type = String(memory.type || '').trim();
  const tags = Array.isArray(memory.tags) ? memory.tags.map((t) => String(t).toLowerCase()) : [];
  const importance = Number(memory.importance || 0);
  const reasons = [];
  let category = '一般記憶';

  if (type === '主線' || tags.includes('main_story')) {
    category = '主線記憶';
    reasons.push('符合主線推進標記');
  } else if (type === '戰鬥' || tags.includes('battle') || tags.includes('combat')) {
    category = '戰鬥記憶';
    reasons.push('屬於戰鬥結果，影響後續風險');
  } else if (type === '交易' || tags.includes('market') || tags.includes('shop_haggle')) {
    category = '交易記憶';
    reasons.push('屬於交易/議價紀錄');
  } else if (type === '移動' || type === 'travel' || tags.includes('travel') || tags.includes('portal')) {
    category = '地點記憶';
    reasons.push('屬於移動/地點變更');
  } else if (type === '對話' || tags.includes('dialogue') || tags.includes('npc_quote')) {
    category = '對話記憶';
    reasons.push('屬於可引用對話');
  }

  if (importance >= 3) reasons.push(`重要度=${importance}`);
  if (reasons.length === 0) reasons.push(`type=${type || 'action'}`);
  return { category, reason: reasons.join('｜') };
}

function appendPlayerMemoryAudit(player, entry = {}) {
  if (!player || typeof player !== 'object') return null;
  normalizePlayerMemorySchema(player);
  if (!Array.isArray(player.memoryAudit)) player.memoryAudit = [];
  const row = normalizeMemoryAuditEntry({
    turn: Math.max(0, Math.floor(Number(player.storyTurns || 0))),
    location: String(player.location || ''),
    ...entry
  });
  if (!row) return null;
  player.memoryAudit.unshift(row);
  if (player.memoryAudit.length > MEMORY_AUDIT_LIMIT) player.memoryAudit.length = MEMORY_AUDIT_LIMIT;
  return row;
}

function getPlayerMemoryAudit(playerId, options = {}) {
  const player = loadPlayer(playerId);
  if (!player) return [];
  normalizePlayerMemorySchema(player);
  const limit = Math.max(1, Math.min(80, Number(options.limit || 30)));
  const turnFrom = Number.isFinite(Number(options.turnFrom)) ? Number(options.turnFrom) : null;
  const list = Array.isArray(player.memoryAudit) ? player.memoryAudit : [];
  return list
    .filter((item) => (turnFrom === null ? true : Number(item.turn || 0) >= turnFrom))
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

function summarizeCountMap(mapObj, maxItems = 4) {
  const entries = Object.entries(mapObj || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return String(a[0]).localeCompare(String(b[0]), 'zh-Hant');
    })
    .slice(0, maxItems)
    .map(([name, count]) => `${name}x${count}`);
  return entries;
}

function scoreMemory(entry) {
  const text = `${entry.type} ${entry.content} ${entry.outcome}`.toLowerCase();
  let score = Number(entry.importance || 0);

  if (['主線', '戰鬥', '許願', 'travel', '移動'].includes(entry.type)) score += 3;
  if (/(結局|擊敗|死亡|boss|通緝|傳送|主線|逃跑|失敗|勝利|擊殺)/.test(text)) score += 2;

  return score;
}

function formatMemoryLine(entry) {
  const type = entry.type || 'action';
  const loc = entry.location ? ` @${entry.location}` : '';
  const outcome = entry.outcome ? ` -> ${entry.outcome}` : '';
  return `[${type}] ${entry.content}${outcome}${loc}`;
}

function buildLongTermMemoryDigest(player) {
  const memories = getNarrativeEligibleMemories(Array.isArray(player?.memories) ? player.memories : []);
  if (memories.length < LONG_TERM_MEMORY_CONFIG.minMemoriesForDigest) return null;

  const archived = memories.slice(LONG_TERM_MEMORY_CONFIG.recentWindow);
  if (archived.length < LONG_TERM_MEMORY_CONFIG.minArchivedForDigest) return null;

  const typeCounts = {};
  const locationCounts = {};
  const tagCounts = {};

  for (const mem of archived) {
    if (mem.type) typeCounts[mem.type] = (typeCounts[mem.type] || 0) + 1;
    if (mem.location) locationCounts[mem.location] = (locationCounts[mem.location] || 0) + 1;
    for (const tag of (mem.tags || [])) {
      if (!tag) continue;
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const topTypes = summarizeCountMap(typeCounts, LONG_TERM_MEMORY_CONFIG.maxTypeItems);
  const topLocations = summarizeCountMap(locationCounts, LONG_TERM_MEMORY_CONFIG.maxLocationItems);
  const topTags = summarizeCountMap(tagCounts, LONG_TERM_MEMORY_CONFIG.maxTagItems);

  const highlights = archived
    .map(mem => ({ mem, score: scoreMemory(mem) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.mem.timestamp || 0) - (a.mem.timestamp || 0);
    })
    .slice(0, LONG_TERM_MEMORY_CONFIG.maxHighlights)
    .map(item => `- ${clipText(formatMemoryLine(item.mem), 120)}`);

  const summaryLines = [
    `已壓縮較舊記憶 ${archived.length} 筆（短期窗口保留最近 ${LONG_TERM_MEMORY_CONFIG.recentWindow} 筆）。`
  ];
  if (topTypes.length > 0) summaryLines.push(`事件主軸：${topTypes.join('、')}`);
  if (topLocations.length > 0) summaryLines.push(`常見地點：${topLocations.join('、')}`);
  if (topTags.length > 0) summaryLines.push(`常見標籤：${topTags.join('、')}`);
  if (highlights.length > 0) {
    summaryLines.push('關鍵事件：');
    summaryLines.push(...highlights);
  }

  const summary = clipText(summaryLines.join('\n'), LONG_TERM_MEMORY_CONFIG.maxSummaryChars);
  const latestTs = Number(memories[0]?.timestamp || 0);

  return {
    version: 1,
    builtAt: Date.now(),
    totalMemories: memories.length,
    archivedCount: archived.length,
    recentWindow: LONG_TERM_MEMORY_CONFIG.recentWindow,
    sourceLatestTimestamp: latestTs,
    summary
  };
}

function ensureLongTermMemoryDigest(player, force = false) {
  if (!player || typeof player !== 'object') return null;
  normalizePlayerMemorySchema(player);

  const memories = getNarrativeEligibleMemories(Array.isArray(player.memories) ? player.memories : []);
  const latestTs = Number(memories[0]?.timestamp || 0);
  const digest = normalizeMemoryDigest(player.memoryDigest);
  const canReuse = Boolean(
    !force &&
    digest &&
    digest.totalMemories === memories.length &&
    digest.sourceLatestTimestamp === latestTs &&
    digest.summary
  );

  if (canReuse) {
    player.memoryDigest = digest;
    return digest;
  }

  const rebuilt = buildLongTermMemoryDigest(player);
  player.memoryDigest = rebuilt;
  return rebuilt;
}

function ensurePlayerMemoryIndexed(player) {
  if (!player || typeof player !== 'object' || !player.id) return;
  if (!Array.isArray(player.memories) || player.memories.length === 0) return;
  if (MEMORY_INDEX_WARMING.has(player.id)) return;

  let stats = null;
  try {
    stats = MEMORY_INDEX.getIndexStats(player.id, MEMORY_NAMESPACE);
  } catch (e) {
    console.log('[MemoryIndex] getIndexStats failed:', e?.message || e);
    return;
  }

  if (stats && Number(stats.count || 0) > 0) return;

  MEMORY_INDEX_WARMING.add(player.id);
  MEMORY_INDEX
    .rebuildPlayerIndexFromMemories(player, player.memories, { namespace: MEMORY_NAMESPACE })
    .catch((e) => {
      console.log('[MemoryIndex] rebuild from player json failed:', e?.message || e);
    })
    .finally(() => {
      MEMORY_INDEX_WARMING.delete(player.id);
    });
}

function appendPlayerMemory(player, memory) {
  if (!player || typeof player !== 'object') return null;

  normalizePlayerMemorySchema(player);
  if (!Array.isArray(player.memories)) player.memories = [];

  const normalized = normalizeMemoryEntry(
    {
      ...memory,
      location: memory?.location || player.location || ''
    },
    'action'
  );
  if (!normalized) return null;
  if (isExcludedNarrativeMemoryEntry(normalized)) return null;

  player.memories.unshift(normalized);
  if (player.memories.length > 80) player.memories.length = 80;
  const auditMeta = deriveMemoryAuditMeta(normalized);
  appendPlayerMemoryAudit(player, {
    layer: 'player_memory',
    category: auditMeta.category,
    reason: auditMeta.reason,
    content: normalized.content,
    outcome: normalized.outcome,
    tags: normalized.tags,
    source: normalized.type || 'action'
  });
  ensureLongTermMemoryDigest(player, true);
  MEMORY_INDEX
    .rememberPlayerMemory(player, normalized, { namespace: MEMORY_NAMESPACE })
    .catch((e) => {
      console.error('[MemoryIndex] remember failed (strict):', e?.message || e);
    });
  return normalized;
}

function addPlayerMemory(playerId, memory) {
  const player = loadPlayer(playerId);
  if (!player) return;

  appendPlayerMemory(player, memory);
  savePlayer(player);
}

function buildShortAndLongMemoryContext(player) {
  if (!player || !player.memories || player.memories.length === 0) return '';
  const maxItems = 6;
  const memories = getNarrativeEligibleMemories(Array.isArray(player.memories) ? player.memories : []);
  if (memories.length === 0) return '';

  const recent = memories.slice(0, 2);
  const selected = [...recent];
  const used = new Set(recent.map(m => `${m.type}|${m.content}|${m.timestamp}`));

  const ranked = memories
    .slice(2)
    .map(m => ({ m, score: scoreMemory(m) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.m.timestamp || 0) - (a.m.timestamp || 0);
    });

  for (const item of ranked) {
    const key = `${item.m.type}|${item.m.content}|${item.m.timestamp}`;
    if (used.has(key)) continue;
    selected.push(item.m);
    used.add(key);
    if (selected.length >= maxItems) break;
  }

  const shortTermSection = selected.map(formatMemoryLine).join('\n');
  const digest = ensureLongTermMemoryDigest(player, false);
  const longTermSection = digest?.summary ? `【長期記憶摘要】\n${digest.summary}` : '';
  return [shortTermSection, longTermSection].filter(Boolean).join('\n\n');
}

function formatSemanticRecallLine(item) {
  if (!item || typeof item !== 'object') return '';
  const type = item.type ? `[${item.type}] ` : '';
  const content = String(item.content || item.factText || '').trim();
  if (!content) return '';
  const outcome = item.outcome ? ` -> ${item.outcome}` : '';
  const loc = item.location ? ` @${item.location}` : '';
  return `${type}${content}${outcome}${loc}`.trim();
}

function getPlayerMemoryContext(playerId) {
  const player = loadPlayer(playerId);
  return buildShortAndLongMemoryContext(player);
}

async function getPlayerMemoryContextAsync(playerId, options = {}) {
  const player = loadPlayer(playerId);
  if (!player) return '';

  const baseContext = buildShortAndLongMemoryContext(player);
  const location = String(options.location || player.location || '').trim();
  const queryText = clipText(
    [
      options.queryText || '',
      options.previousChoice || '',
      options.previousStory || '',
      player.currentStory || '',
      location ? `地點:${location}` : ''
    ].filter(Boolean).join('\n'),
    760
  );

  let recalled = [];
  try {
    recalled = await MEMORY_INDEX.recallPlayerMemories({
      playerId: player.id,
      namespace: String(options.namespace || MEMORY_NAMESPACE),
      queryText,
      location,
      topK: Number(options.topK || 6),
      similarityThreshold: Number(options.similarityThreshold || 0.22),
      recencyBoost: Number(options.recencyBoost || 0.22),
      sameLocationBoost: Number(options.sameLocationBoost || 0.2)
    });
  } catch (e) {
    throw new Error(`記憶檢索失敗：${e?.message || e}`);
  }

  const semanticLines = (Array.isArray(recalled) ? recalled : [])
    .filter((item) => !isExcludedNarrativeMemoryEntry(item))
    .map(formatSemanticRecallLine)
    .filter(Boolean)
    .slice(0, 8);
  const semanticSection = semanticLines.length > 0
    ? `【語義回想】\n${semanticLines.join('\n')}`
    : '';

  return [baseContext, semanticSection].filter(Boolean).join('\n\n');
}

function rebuildPlayerMemoryDigest(playerId) {
  const player = loadPlayer(playerId);
  if (!player) return null;
  const digest = ensureLongTermMemoryDigest(player, true);
  savePlayer(player);
  return digest;
}

async function rebuildPlayerMemoryIndex(playerId, namespace = MEMORY_NAMESPACE) {
  const player = loadPlayer(playerId);
  if (!player) return null;
  const memories = Array.isArray(player.memories) ? player.memories : [];
  return MEMORY_INDEX.rebuildPlayerIndexFromMemories(player, memories, { namespace });
}

async function rebuildAllPlayersMemoryIndex(namespace = MEMORY_NAMESPACE) {
  const players = getAllPlayers();
  const results = [];
  for (const player of players) {
    const memories = Array.isArray(player.memories) ? player.memories : [];
    const result = await MEMORY_INDEX.rebuildPlayerIndexFromMemories(player, memories, { namespace });
    results.push({ playerId: player.id, ...result });
  }
  return results;
}

function getPlayerMemoryIndexStats(playerId, namespace = MEMORY_NAMESPACE) {
  return MEMORY_INDEX.getIndexStats(playerId, namespace);
}

function sanitizeMemoryId(raw, fallback = 'unknown') {
  const source = String(raw || '').trim().toLowerCase();
  if (!source) return fallback;
  const safe = source.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return safe || fallback;
}

function resolveNpcMemoryIdentity(npcId) {
  const raw = String(npcId || '').trim();
  if (!raw) return null;
  const npc = getNPCById(raw);
  if (npc) {
    return {
      id: sanitizeMemoryId(String(npc.id || raw), 'npc'),
      name: String(npc.name || raw)
    };
  }
  return {
    id: sanitizeMemoryId(raw, 'npc'),
    name: raw
  };
}

function buildNpcMemoryOwnerId(npcId) {
  const identity = resolveNpcMemoryIdentity(npcId);
  if (!identity) return '';
  return `npc:${identity.id}`;
}

function buildNpcPrivateNamespace(playerId) {
  const pid = sanitizeMemoryId(playerId, '');
  if (!pid) return '';
  return `${NPC_MEMORY_PRIVATE_NAMESPACE_PREFIX}:${pid}`;
}

function formatNpcSemanticRecallLine(item) {
  if (!item || typeof item !== 'object') return '';
  const type = item.type ? `[${item.type}] ` : '';
  const content = String(item.content || item.factText || '').trim();
  if (!content) return '';
  const outcome = item.outcome ? ` -> ${item.outcome}` : '';
  const loc = item.location ? ` @${item.location}` : '';
  return `${type}${content}${outcome}${loc}`.trim();
}

function getNearbyNpcIds(location, limit = 2) {
  const loc = String(location || '').trim();
  if (!loc) return [];
  ensureMentorMasters(agents);
  ensureLocationNpcCoverage(agents);
  const maxItems = Math.max(1, Number(limit) || 2);
  const sourceAgents = Array.isArray(agents) ? agents : [];
  const candidates = [];
  const seen = new Set();
  for (const agent of sourceAgents) {
    if (!agent || !agent.id) continue;
    if (String(agent.loc || '').trim() !== loc) continue;
    if (typeof isNPCAlive === 'function' && !isNPCAlive(agent.id)) continue;
    if (seen.has(agent.id)) continue;
    seen.add(agent.id);
    candidates.push(agent);
  }
  if (candidates.length <= 0) return [];

  const digital = candidates.filter((agent) => agent?.roaming && String(agent?.id || '').startsWith('digital_roamer_'));
  const others = candidates.filter((agent) => !(agent?.roaming && String(agent?.id || '').startsWith('digital_roamer_')));
  const shuffle = (list = []) => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const merged = [...shuffle(others), ...shuffle(digital)];
  return merged.slice(0, maxItems).map((agent) => agent.id);
}

function appendNpcMemory(npcId, playerId, memory, options = {}) {
  const identity = resolveNpcMemoryIdentity(npcId);
  if (!identity || !memory || !memory.content) return null;
  const scope = options.scope === 'public' ? 'public' : 'private';
  const privateNamespace = buildNpcPrivateNamespace(playerId);
  const namespace = scope === 'public' ? NPC_MEMORY_PUBLIC_NAMESPACE : privateNamespace;
  if (!namespace) return null;

  const normalized = normalizeMemoryEntry(
    {
      ...memory,
      location: memory?.location || options.location || ''
    },
    scope === 'public' ? 'npc_public' : 'npc_private'
  );
  if (!normalized) return null;

  MEMORY_INDEX
    .rememberEntityMemory(buildNpcMemoryOwnerId(identity.id), normalized, { namespace })
    .catch((e) => {
      console.error('[MemoryIndex][NPC] remember failed (strict):', e?.message || e);
    });

  addAgentMemory(identity.id, `${normalized.content}${normalized.outcome ? ` -> ${normalized.outcome}` : ''}`, normalized.type || 'npc_memory');
  return normalized;
}

async function getNpcMemoryContextAsync(options = {}) {
  const identity = resolveNpcMemoryIdentity(options.npcId);
  if (!identity) return '';
  const ownerId = buildNpcMemoryOwnerId(identity.id);
  const playerId = String(options.playerId || '').trim();
  const privateNamespace = buildNpcPrivateNamespace(playerId);
  const location = String(options.location || '').trim();
  const queryText = clipText(options.queryText || '', 760);

  const namespaces = [];
  if (privateNamespace) {
    const privateStats = MEMORY_INDEX.getEntityIndexStats(ownerId, privateNamespace);
    if (Number(privateStats?.count || 0) > 0) namespaces.push(privateNamespace);
  }
  const publicStats = MEMORY_INDEX.getEntityIndexStats(ownerId, NPC_MEMORY_PUBLIC_NAMESPACE);
  if (Number(publicStats?.count || 0) > 0) namespaces.push(NPC_MEMORY_PUBLIC_NAMESPACE);
  if (namespaces.length === 0) return '';

  const topKPrivate = Math.max(1, Number(options.topKPrivate || 3));
  const topKPublic = Math.max(1, Number(options.topKPublic || 2));
  const combinedTopK = Math.max(2, topKPrivate + topKPublic + 2);

  const recalled = await MEMORY_INDEX.recallEntityMemories({
    ownerId,
    namespaces,
    queryText,
    location,
    topK: combinedTopK,
    candidateLimit: Math.max(40, Number(options.candidateLimit || 90)),
    similarityThreshold: Number(options.similarityThreshold || 0.22),
    recencyBoost: Number(options.recencyBoost || 0.22),
    sameLocationBoost: Number(options.sameLocationBoost || 0.2)
  });

  if (!Array.isArray(recalled) || recalled.length === 0) return '';

  const privateRows = privateNamespace
    ? recalled.filter(item => item.namespace === privateNamespace).slice(0, topKPrivate)
    : [];
  const publicRows = recalled
    .filter(item => item.namespace === NPC_MEMORY_PUBLIC_NAMESPACE)
    .slice(0, topKPublic);

  const privateLines = privateRows.map(formatNpcSemanticRecallLine).filter(Boolean);
  const publicLines = publicRows.map(formatNpcSemanticRecallLine).filter(Boolean);

  const sections = [];
  if (privateLines.length > 0) {
    sections.push(`【NPC私有記憶｜${identity.name}↔玩家】\n${privateLines.join('\n')}`);
  }
  if (publicLines.length > 0) {
    sections.push(`【NPC公共記憶｜${identity.name}】\n${publicLines.join('\n')}`);
  }
  return sections.join('\n\n');
}

async function getNearbyNpcMemoryContextAsync(playerId, options = {}) {
  const player = loadPlayer(playerId);
  if (!player) return '';

  const location = String(options.location || player.location || '').trim();
  const queryText = clipText(options.queryText || '', 760);
  const npcIds = Array.isArray(options.npcIds) && options.npcIds.length > 0
    ? options.npcIds
    : getNearbyNpcIds(location, Math.max(1, Number(options.limit || 1)));

  if (!npcIds || npcIds.length === 0) return '';
  const contexts = [];
  const maxChars = Math.max(320, Number(options.maxChars || 1400));

  for (const npcId of npcIds) {
    try {
      const ctx = await getNpcMemoryContextAsync({
        npcId,
        playerId,
        queryText,
        location,
        topKPrivate: Number(options.topKPrivate || 3),
        topKPublic: Number(options.topKPublic || 2),
        similarityThreshold: Number(options.similarityThreshold || 0.22),
        recencyBoost: Number(options.recencyBoost || 0.22),
        sameLocationBoost: Number(options.sameLocationBoost || 0.2)
      });
      if (!ctx) continue;
      contexts.push(ctx);
      if (contexts.join('\n\n').length >= maxChars) break;
    } catch (e) {
      throw new Error(`NPC記憶檢索失敗(${npcId})：${e?.message || e}`);
    }
  }

  if (contexts.length === 0) return '';
  return clipText(contexts.join('\n\n'), maxChars);
}

// ============== Agent 擴展數據 ==============
let agentMemories = {}; // agentId -> [{day, event, type}]
let agentInventories = {}; // agentId -> []

function getAgentMemory(agentId) {
  if (!agentMemories[agentId]) agentMemories[agentId] = [];
  return agentMemories[agentId];
}

function addAgentMemory(agentId, event, type = 'other') {
  const mem = getAgentMemory(agentId);
  mem.unshift({ day: world.day, event, type, timestamp: Date.now() });
  // 保持最近50條記憶
  if (mem.length > 50) mem.pop();
}

function getAgentInventory(agentId) {
  if (!agentInventories[agentId]) agentInventories[agentId] = [];
  return agentInventories[agentId];
}

function addAgentItem(agentId, item) {
  const inv = getAgentInventory(agentId);
  inv.push(item);
}

function removeAgentItem(agentId, item) {
  const inv = getAgentInventory(agentId);
  const idx = inv.indexOf(item);
  if (idx >= 0) inv.splice(idx, 1);
  return idx >= 0;
}

function hasAgentItem(agentId, item) {
  return getAgentInventory(agentId).includes(item);
}

// ============== NPC 生死追蹤（24小時重生）==============
const RESPAWN_HOURS = 24; // 24小時重生

function initNPCStatus(npcId) {
  if (!world.npcStatus) world.npcStatus = {};
  if (!world.npcStatus[npcId]) {
    world.npcStatus[npcId] = {
      alive: true,
      killedBy: null,
      killedAt: null,
      respawnAt: null
    };
  }
  return world.npcStatus[npcId];
}

function isNPCAlive(npcId) {
  initNPCStatus(npcId);
  const status = world.npcStatus[npcId];
  
  // 如果已死亡，檢查是否該重生
  if (!status.alive && status.respawnAt) {
    if (Date.now() >= status.respawnAt) {
      // 重生
      status.alive = true;
      status.killedBy = null;
      status.killedAt = null;
      status.respawnAt = null;
      
      // 加入世界事件
      const npc = getNPCById(npcId);
      const npcName = npc ? npc.name : npcId;
      pushWorldEvent({
        day: world.day,
        type: 'npc_respawn',
        message: `✨ ${npcName} 康復歸來！`,
        timestamp: Date.now()
      });
      
      saveWorld();
    }
  }
  
  return world.npcStatus[npcId].alive;
}

function killNPC(npcId, killerId, isMonster = false) {
  initNPCStatus(npcId);
  const status = world.npcStatus[npcId];
  const key = String(npcId || '').trim();
  const persistDeath = Boolean(isMonster) || PERSISTENT_NPC_BOSS_IDS.has(key);
  const npc = getNPCById(npcId);
  const npcName = npc ? npc.name : npcId;
  const killerPlayer = loadPlayer(killerId);
  const killerDisplayName = String(killerPlayer?.name || '某位冒險者').trim();
  
  if (persistDeath) {
    status.alive = false;
    status.killedBy = killerId;
    status.killedAt = Date.now();
    status.respawnAt = Date.now() + (RESPAWN_HOURS * 60 * 60 * 1000);
    const typeLabel = isMonster ? '怪物' : 'NPC';
    pushWorldEvent({
      day: world.day,
      type: isMonster ? 'monster_death' : 'npc_death',
      message: `💀 ${typeLabel} ${npcName} 已被 ${killerDisplayName} 擊殺！預計 ${RESPAWN_HOURS} 小時後重生。`,
      timestamp: Date.now()
    });
    addWantedLevel(killerId, isMonster ? 1 : 3); // NPC = 3級, 怪物 = 1級
  } else {
    status.alive = true;
    status.killedBy = null;
    status.killedAt = null;
    status.respawnAt = null;
    pushWorldEvent({
      day: world.day,
      type: 'npc_defeat',
      message: `⚔️ NPC ${npcName} 被 ${killerDisplayName} 擊退，已撤離現場。`,
      timestamp: Date.now()
    });
    addWantedLevel(killerId, 2);
  }
  
  saveWorld();
  return true;
}

function getNPCDeathInfo(npcId) {
  initNPCStatus(npcId);
  return world.npcStatus[npcId];
}

function getRecentWorldEvents(limit = MAX_WORLD_EVENTS) {
  if (!Array.isArray(world.events)) return [];
  const targetLimit = Math.max(1, Math.min(MAX_WORLD_EVENTS, Number(limit) || MAX_WORLD_EVENTS));
  return world.events.slice(0, targetLimit);
}

function getRespawnTime(npcId) {
  const status = getNPCDeathInfo(npcId);
  if (status.alive) return null;
  if (!status.respawnAt) return null;
  
  const remaining = status.respawnAt - Date.now();
  if (remaining <= 0) return '即將重生';
  
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}小時${minutes}分`;
}

// ============== 通緝系統 ==============
function initWantedList() {
  if (!world.wantedList) world.wantedList = {};
  return world.wantedList;
}

function addWantedLevel(playerId, level) {
  const wanted = initWantedList();
  
  if (!wanted[playerId]) {
    wanted[playerId] = {
      level: 0,
      reason: '',
      kills: [],
      firstKillAt: null
    };
  }
  
  wanted[playerId].level += level;
  wanted[playerId].kills.push({
    npcId: 'unknown',
    at: Date.now()
  });
  
  if (!wanted[playerId].firstKillAt) {
    wanted[playerId].firstKillAt = Date.now();
  }
  
  saveWorld();
  return wanted[playerId].level;
}

function getPlayerWantedLevel(playerId) {
  const wanted = initWantedList();
  return wanted[playerId]?.level || 0;
}

function getWantedList() {
  const wanted = initWantedList();
  return Object.entries(wanted)
    .filter(([id, data]) => data.level > 0)
    .sort((a, b) => b[1].level - a[1].level)
    .slice(0, 10);
}

function reduceAllWantedLevels() {
  // 每天降低一點通緝
  const wanted = initWantedList();
  for (const playerId in wanted) {
    if (wanted[playerId].level > 0) {
      wanted[playerId].level = Math.max(0, wanted[playerId].level - 1);
    }
  }
  saveWorld();
}

// ============== NPC Agent 模板 ==============
// ============== NPC Agent 模板 ==============
// ============== RENAISS 世界觀 NPC ==============
const NPC_AGENTS = [
  // ===== 襄陽城 =====
  { id: "lin_engineer", name: "林工程師", title: "機械師", sect: "中立", loc: "襄陽城", align: "good",
    personality: "創意無限，對機械有狂熱興趣",
    stats: { 戰力: 15, 生命: 80, 能量: 20, 智商: 95, 魅力: 70, 運氣: 65, 財富: 80 },
    skills: { "齒輪操控": { realm: "大師", proficiency: 450 }, "能量轉換": { realm: "精通", proficiency: 300 } },
    inventory: ["能量核心", "微型齒輪"],
    relationships: { "蘇醫生": 80 },
    memory: [] },
  { id: "su_doctor", name: "蘇醫生", title: "細胞治療師", sect: "中立", loc: "襄陽城", align: "good",
    personality: "懸壺濟世，視錢財如糞土",
    stats: { 戰力: 20, 生命: 90, 能量: 40, 智商: 88, 魅力: 85, 運氣: 75, 財富: 60 },
    skills: { "細胞修復": { realm: "頂尖", proficiency: 500 }, "解毒術": { realm: "大師", proficiency: 400 } },
    inventory: ["治療針劑", "解毒草藥"],
    relationships: { "林工程師": 80, "黑影商人": 30 },
    memory: [] },
  { id: "shadow_merchant", name: "黑影商人", title: "情報贩子", sect: "中立", loc: "襄陽城", align: "neutral",
    personality: "什麼都賣，什麼都買，只要價格到位",
    stats: { 戰力: 8, 生命: 65, 能量: 15, 智商: 85, 魅力: 72, 運氣: 60, 財富: 95 },
    skills: { "情報收集": { realm: "大師", proficiency: 450 }, "偽裝術": { realm: "精通", proficiency: 300 } },
    inventory: ["加密通訊器", "夜視裝置"],
    relationships: { "蘇醫生": 30, "賞金獵人": 50 },
    memory: [] },
  // ===== 大都 =====
  { id: "crown_prince", name: "皇太子", title: "未來統治者", sect: "皇室", loc: "大都", align: "good",
    personality: "心懷天下，但行事低調",
    stats: { 戰力: 25, 生命: 85, 能量: 30, 智商: 90, 魅力: 88, 運氣: 80, 財富: 100 },
    skills: { "皇室禮儀": { realm: "頂尖", proficiency: 500 }, "能量護盾": { realm: "精通", proficiency: 300 } },
    inventory: ["皇室印璽", "護身符"],
    relationships: { "將軍王": 90 },
    memory: [] },
  { id: "general_wang", name: "將軍王", title: "邊境守將", sect: "軍隊", loc: "大都", align: "good",
    personality: "戎馬一生，紀律嚴明",
    stats: { 戰力: 95, 生命: 100, 能量: 50, 智商: 75, 魅力: 82, 運氣: 70, 財富: 70 },
    skills: { "戰甲操控": { realm: "頂尖", proficiency: 500 }, "軍事戰略": { realm: "大師", proficiency: 450 } },
    inventory: ["外骨骼裝甲", "軍事地圖"],
    relationships: { "皇太子": 90, "季衡": 20 },
    memory: [] },
  { id: "spy_q", name: "季衡", title: "情資網路管理者", sect: "情報機構", loc: "大都", align: "neutral",
    personality: "為錢辦事，職業素養極高",
    stats: { 戰力: 22, 生命: 75, 能量: 35, 智商: 92, 魅力: 78, 運氣: 65, 財富: 88 },
    skills: { "數據破解": { realm: "頂尖", proficiency: 500 }, "偽裝術": { realm: "大師", proficiency: 400 } },
    inventory: ["數據晶片", "變聲器"],
    relationships: { "將軍王": 20, "黑影商人": 60 },
    memory: [] },
  // ===== 洛陽城 =====
  { id: "peony_lady", name: "牡丹夫人", title: "牡丹山莊莊主", sect: "牡丹山莊", loc: "洛陽城", align: "good",
    personality: "洛陽城實際掌控者，八面玲瓏",
    stats: { 戰力: 28, 生命: 82, 能量: 55, 智商: 90, 魅力: 95, 運氣: 75, 財富: 98 },
    skills: { "花語操控": { realm: "頂尖", proficiency: 500 }, "談判術": { realm: "大師", proficiency: 450 } },
    inventory: ["牡丹山莊令牌", "基因改造花種"],
    relationships: { "說書人老張": 85, "賞金獵人雷": 60 },
    memory: [] },
  { id: "storyteller_zhang", name: "說書人老張", title: "情報觀測員", sect: "中立", loc: "洛陽城", align: "neutral",
    personality: "什麼都知道，什麼都說，嘴上沒把門",
    stats: { 戰力: 5, 生命: 60, 能量: 10, 智商: 85, 魅力: 80, 運氣: 55, 財富: 40 },
    skills: { "情報收集": { realm: "頂尖", proficiency: 500 }, "記憶術": { realm: "大師", proficiency: 400 } },
    inventory: ["記錄晶片", "各地地圖"],
    relationships: { "牡丹夫人": 85, "黑影商人": 70 },
    memory: [] },
  { id: "bounty_hunter_lei", name: "賞金獵人雷", title: "賞金聯盟成員", sect: "賞金聯盟", loc: "洛陽城", align: "neutral",
    personality: "賞金獵人，冷酷務實",
    stats: { 戰力: 60, 生命: 85, 能量: 40, 智商: 78, 魅力: 65, 運氣: 70, 財富: 75 },
    skills: { "追蹤術": { realm: "大師", proficiency: 450 }, "射擊術": { realm: "精通", proficiency: 300 } },
    inventory: ["追蹤器", "能量手槍"],
    relationships: { "牡丹夫人": 60, "黑影商人": 50 },
    memory: [] },
  // ===== 敦煌 =====
  { id: "abu_trader", name: "絲路商人阿布", title: "駝隊首領", sect: "絲路商會", loc: "敦煌", align: "neutral",
    personality: "精明但誠信，沙漠中的老狐狸",
    stats: { 戰力: 12, 生命: 75, 能量: 20, 智商: 85, 魅力: 80, 運氣: 70, 財富: 90 },
    skills: { "商務談判": { realm: "頂尖", proficiency: 500 }, "沙漠生存": { realm: "大師", proficiency: 400 } },
    inventory: ["商隊通行證", "沙漠導航儀"],
    relationships: { "敦煌守護者": 40, "沙盜首領": 0 },
    memory: [] },
  { id: "dunhuang_guardian", name: "敦煌守護者", title: "莫高窟長老", sect: "莫高窟", loc: "敦煌", align: "good",
    personality: "據說已活了三百年，對敦煌了如指掌",
    stats: { 戰力: 35, 生命: 95, 能量: 80, 智商: 92, 魅力: 75, 運氣: 60, 財富: 50 },
    skills: { "壁畫解讀": { realm: "頂尖", proficiency: 500 }, "遠古知識": { realm: "頂尖", proficiency: 500 } },
    inventory: ["洞窟鑰匙", "壁畫複製品"],
    relationships: { "阿布": 40 },
    memory: [] },
  { id: "sand_bandit_leader", name: "沙盜首領", title: "沙漠之王", sect: "沙盜團", loc: "敦煌", align: "evil",
    personality: "心狠手辣，沙漠中最危險的存在",
    stats: { 戰力: 75, 生命: 90, 能量: 45, 智商: 78, 魅力: 60, 運氣: 55, 財富: 85 },
    skills: { "沙漠戰": { realm: "大師", proficiency: 450 }, "埋伏術": { realm: "精通", proficiency: 300 } },
    inventory: ["沙漠載具", "沙漠地圖"],
    relationships: { "阿布": 0, "賞金獵人雷": 80 },
    memory: [] },
  // ===== 海外島嶼 =====
  { id: "island_master", name: "島主東岚", title: "神秘島主", sect: "桃花島", loc: "桃花島", align: "neutral",
    personality: "脾氣古怪的傳說人物，實力深不可測",
    stats: { 戰力: 99, 生命: 100, 能量: 95, 智商: 95, 魅力: 75, 運氣: 70, 財富: 90 },
    skills: { "混沌之力": { realm: "傳說", proficiency: 600 }, "機關術": { realm: "頂尖", proficiency: 500 } },
    inventory: ["混沌獸蛋", "島嶼地圖"],
    relationships: {},
    memory: [] },
  // ===== 潮汐試煉島 =====
  { id: "dragon_wood_master", name: "龍木島主", title: "試煉頂尖", sect: "潮汐試煉島", loc: "潮汐試煉島", align: "good",
    personality: "戰技超群，低調神秘",
    stats: { 戰力: 100, 生命: 100, 能量: 98, 智商: 90, 魅力: 80, 運氣: 75, 財富: 85 },
    skills: { "頂尖戰技": { realm: "傳說", proficiency: 600 }, "能量操控": { realm: "傳說", proficiency: 600 } },
    inventory: ["高階技術檔案", "島嶼通行證"],
    relationships: { "木島主": 100 },
    memory: [] },
  // ===== 北疆地區 =====
  { id: "ice_queen", name: "冰雪女王", title: "雪山站主理人", sect: "雪山站", loc: "雪白山莊", align: "good",
    personality: "一生只愛冰雪，對外人冷淡",
    stats: { 戰力: 92, 生命: 95, 能量: 90, 智商: 88, 魅力: 85, 運氣: 65, 財富: 80 },
    skills: { "冰晶操控": { realm: "頂尖", proficiency: 500 }, "冰川之力": { realm: "大師", proficiency: 450 } },
    inventory: ["冰晶權杖", "雪山地圖"],
    relationships: { "獵人老陳": 60 },
    memory: [] },
  { id: "hunter_old_chen", name: "獵人老陳", title: "資深雪地獵人", sect: "中立", loc: "雪白山莊", align: "neutral",
    personality: "在雪山生活了五十年，沉默寡言",
    stats: { 戰力: 50, 生命: 85, 能量: 30, 智商: 75, 魅力: 60, 運氣: 70, 財富: 55 },
    skills: { "雪地追蹤": { realm: "頂尖", proficiency: 500 }, "陷阱術": { realm: "大師", proficiency: 400 } },
    inventory: ["雪狼標本", "獵具"],
    relationships: { "冰雪女王": 60 },
    memory: [] },
  // ===== 草原部落 =====
  { id: "chief_son", name: "族長之子", title: "草原未來領袖", sect: "草原部落", loc: "草原部落", align: "good",
    personality: "英俊瀟灑，戰技高強，心懷牧民",
    stats: { 戰力: 70, 生命: 90, 能量: 45, 智商: 80, 魅力: 92, 運氣: 75, 財富: 70 },
    skills: { "騎術": { realm: "頂尖", proficiency: 500 }, "草原戰": { realm: "大師", proficiency: 450 } },
    inventory: ["赤兔馬", "部落令牌"],
    relationships: { "流浪詩人": 80, "馬賊王": 0 },
    memory: [] },
  { id: "wandering_poet", name: "流浪詩人", title: "草原吟遊者", sect: "中立", loc: "草原部落", align: "neutral",
    personality: "走遍天下的吟遊詩人，見多識廣",
    stats: { 戰力: 8, 生命: 65, 能量: 20, 智商: 88, 魅力: 90, 運氣: 80, 財富: 45 },
    skills: { "情報收集": { realm: "大師", proficiency: 450 }, "演奏術": { realm: "頂尖", proficiency: 500 } },
    inventory: ["詩歌手稿", "樂器"],
    relationships: { "族長之子": 80 },
    memory: [] },
  { id: "bandit_king", name: "馬賊王", title: "草原匪首", sect: "馬賊團", loc: "草原部落", align: "evil",
    personality: "草原上令人聞風喪膽的馬賊頭子",
    stats: { 戰力: 85, 生命: 95, 能量: 50, 智商: 80, 魅力: 65, 運氣: 60, 財富: 90 },
    skills: { "騎兵戰": { realm: "大師", proficiency: 450 }, "游擊術": { realm: "精通", proficiency: 300 } },
    inventory: ["馬賊令牌", "掠奪物資"],
    relationships: { "族長之子": 0, "賞金獵人雷": 90 },
    memory: [] },
  // ===== 光明頂 =====
  { id: "ming_emperor", name: "主導者明皇", title: "光焰議會主導者", sect: "光焰議會", loc: "光明頂", align: "good",
    personality: "光明的守護者，理想主義者",
    stats: { 戰力: 95, 生命: 100, 能量: 90, 智商: 88, 魅力: 85, 運氣: 75, 財富: 80 },
    skills: { "聖火操控": { realm: "頂尖", proficiency: 500 }, "光能術": { realm: "大師", proficiency: 450 } },
    inventory: ["聖火令", "主導者印璽"],
    relationships: { "火焰使者": 90, "叛教者": 0 },
    memory: [] },
  { id: "flame_ember", name: "火焰使者", title: "前線旗隊首領", sect: "光焰議會", loc: "光明頂", align: "good",
    personality: "火爆脾氣，正義感強",
    stats: { 戰力: 85, 生命: 90, 能量: 75, 智商: 75, 魅力: 70, 運氣: 65, 財富: 60 },
    skills: { "火焰操控": { realm: "頂尖", proficiency: 500 }, "戰鬥術": { realm: "大師", proficiency: 400 } },
    inventory: ["火焰令牌", "五行旗幟"],
    relationships: { "主導者明皇": 90, "叛教者": 0 },
    memory: [] },
  { id: "traitor", name: "叛教者", title: "黑暗叛徒", sect: "暗黑組織", loc: "光明頂", align: "evil",
    personality: "逃離光焰議會的叛徒，充滿怨恨",
    stats: { 戰力: 80, 生命: 85, 能量: 70, 智商: 85, 魅力: 60, 運氣: 55, 財富: 75 },
    skills: { "暗能量操控": { realm: "大師", proficiency: 450 }, "背叛術": { realm: "精通", proficiency: 300 } },
    inventory: ["暗黑手冊", "暗能量晶體"],
    relationships: { "主導者明皇": 0, "火焰使者": 0, "總管太監": 80 },
    memory: [] },
  // ===== 黑木崖 =====
  { id: "chamberlain", name: "總管太監", title: "日月光基地下首領", sect: "暗潮議會", loc: "黑木崖", align: "evil",
    personality: "權傾朝野的陰謀家，笑裡藏刀",
    stats: { 戰力: 35, 生命: 70, 能量: 65, 智商: 95, 魅力: 80, 運氣: 60, 財富: 100 },
    skills: { "暗能量操控": { realm: "頂尖", proficiency: 500 }, "權謀術": { realm: "頂尖", proficiency: 500 } },
    inventory: ["暗潮議會令牌", "情報網絡圖"],
    relationships: { "叛教者": 80, "暗影殺手": 100 },
    memory: [] },
  { id: "shadow_assassin", name: "暗影殺手", title: "暗潮議會刺客", sect: "暗潮議會", loc: "黑木崖", align: "evil",
    personality: "無聲無息的死亡使者",
    stats: { 戰力: 80, 生命: 80, 能量: 60, 智商: 85, 魅力: 55, 運氣: 50, 財富: 70 },
    skills: { "隱身術": { realm: "頂尖", proficiency: 500 }, "暗殺術": { realm: "大師", proficiency: 450 } },
    inventory: ["暗殺匕首", "隱身披風"],
    relationships: { "總管太監": 100 },
    memory: [] },
  { id: "double_agent", name: "雙面間諜", title: "多重身份", sect: "未知", loc: "黑木崖", align: "neutral",
    personality: "沒人知道他的真實立場",
    stats: { 戰力: 18, 生命: 70, 能量: 35, 智商: 92, 魅力: 85, 運氣: 75, 財富: 85 },
    skills: { "偽裝術": { realm: "頂尖", proficiency: 500 }, "情報收集": { realm: "大師", proficiency: 450 } },
    inventory: ["變色面具", "加密通訊器"],
    relationships: { "總管太監": 50, "賞金獵人雷": 60 },
    memory: [] }
];
NPC_AGENTS.forEach((npc, idx) => ensureNpcCombatProfile(npc, idx));
let agents = NPC_AGENTS.map(a => ({ ...a, alive: true, exp: 0, party: null, status: "自由" }));
ensureDigitalRoamers(agents);
ensureMentorMasters(agents);
ensureLocationNpcCoverage(agents);

function getNPCById(npcId) {
  if (!npcId) return null;

  const byId = agents.find(a => a.id === npcId);
  if (byId) return byId;

  const byName = agents.find(a => a.name === npcId);
  if (byName) return byName;

  const fallback = NPC_AGENTS.find(a => a.id === npcId || a.name === npcId);
  return fallback || null;
}

// ============== 世界 Tick ==============
async function worldTick(useAI, apiKey) {
  world.day++;
  ensureFactionWarState();
  maybeGenerateFactionPresenceForDay();
  advanceRoamingDigitalVillains({ steps: 1, persist: false });
  
  // 季節變化
  if (world.day % 30 === 0) {
    const seasons = ["春天", "夏天", "秋天", "冬天"];
    world.season = seasons[Math.floor((world.day / 30) % 4)];
    addEvent(`🍂 季節變換：${world.season}`);
  }
  
  // 天氣變化（30%機率）
  if (Math.random() < 0.3) {
    const newWeather = WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)];
    if (newWeather !== world.weather) {
      world.weather = newWeather;
      addEvent(`🌤️ 天氣變化：${world.weather}`);
    }
  }
  
  // 每日隨機事件
  if (Math.random() < 0.2) {
    const rumors = [
      "聽說北境重裝軍在邊境集結",
      "潮汐試煉島的古代核心檔案傳聞再現",
      "光焰議會正在秘密集結",
      "高山訓練站又有內部紛爭",
      "Renaiss星球出現匿名義賊回收黑市贓物"
    ];
    world.rumors.push(rumors[Math.floor(Math.random() * rumors.length)]);
    if (world.rumors.length > 10) world.rumors.pop();
  }

  const factionUpdate = await maybeRunFactionSkirmish(apiKey);
  
  const results = [];
  
  // NPC AI 行動
  if (useAI && apiKey) {
    // 批次並行處理
    const aliveAgents = agents.filter(a => a.alive);
    const batchSize = 10;
    
    for (let i = 0; i < aliveAgents.length; i += batchSize) {
      const batch = aliveAgents.slice(i, i + batchSize);
      const promises = batch.map(agent => agentThink(agent, apiKey));
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }
  } else {
    // 演示模式 - 使用新的劇情生成系統
    for (const agent of agents) {
      if (!agent.alive) continue;
      // 直接調用新的劇情生成（不需要 API）
      const nearby = agents.filter(a => a.id !== agent.id && a.loc === agent.loc && a.alive);
      const rand = Math.random();
      let eventType;
      
      if (agent.stats.生命 < 30) {
        eventType = "休息";
      } else if (rand < 0.15) {
        eventType = "奇遇";
      } else if (rand < 0.30) {
        eventType = "戰鬥";
      } else if (rand < 0.45) {
        eventType = "社交";
      } else if (rand < 0.55) {
        eventType = "任務";
      } else if (rand < 0.65) {
        eventType = "危險";
      } else if (rand < 0.75) {
        eventType = "搞笑";
      } else if (rand < 0.85) {
        eventType = "訓練";
      } else {
        eventType = "休息";
      }
      
      let eventDesc = generateCharacterLog(agent, eventType);
      
      // 添加互動
      if (nearby.length > 0 && Math.random() < 0.3) {
        const other = nearby[Math.floor(Math.random() * nearby.length)];
        const interactions = [
          `，巧遇${other.name}，二人切磋了一番！`,
          `，與${other.name}把酒言歡！`,
          `，遇到${other.name}在訓練，駐足觀看！`,
          `，和${other.name}商討Renaiss星球大事！`
        ];
        const interaction = interactions[Math.floor(Math.random() * interactions.length)];
        if (!eventDesc.includes(other.name)) {
          eventDesc = eventDesc + interaction;
        }
      }
      
      addAgentMemory(agent.id, eventDesc, eventType);
      
      // 更新狀態
      if (eventType === "戰鬥") {
        const damage = Math.floor(Math.random() * 25) + 5;
        agent.stats.生命 = Math.max(10, (agent.stats.生命 || 100) - damage);
      } else if (eventType === "休息") {
        const hpRecover = Math.floor(Math.random() * 15) + 10;
        agent.stats.生命 = Math.min(100, (agent.stats.生命 || 100) + hpRecover);
      } else if (eventType === "危險") {
        const damage = Math.floor(Math.random() * 35) + 15;
        agent.stats.生命 = Math.max(5, (agent.stats.生命 || 100) - damage);
      }
      
      results.push({ npc: agent.name, action: eventType, desc: eventDesc });
    }
  }
  
  // 玩家自然恢復
  for (const player of getAllPlayers()) {
    if (player.alive) {
      player.stats.生命 = Math.min(player.maxStats.生命, player.stats.生命 + 5);
      player.stats.能量 = Math.min(player.maxStats.能量, player.stats.能量 + 2);
      savePlayer(player);
    }
  }
  
  // 降低通緝等级
  reduceAllWantedLevels();
  
  // 儲存世界
  saveWorld();
  
  return { world, results, factionUpdate };
}

// ============== 隨機劇情系統 ==============
const PLOT_EVENTS = {
  // 战斗类
  "戰鬥": [
    "在路邊教訓了幾個欺負百姓的地痞",
    "與陣營弟子切磋戰技，不分上下",
    "遭遇埋伏，奮力突圍",
    "路見不平，拔刀相助",
    "與仇家狹路相逢，爆發激戰",
    "在中繼旅店與人發生衝突",
    "守護商隊抵禦山賊襲擊"
  ],
  // 奇遇类
  "奇遇": [
    "在山洞中發現前人留下的技術檔案",
    "路邊救了一個重傷的老者，原來是隱世高手",
    "在河邊撿到一個奇怪的玉佩",
    "誤入一片迷霧，發現世外桃源",
    "在古廟中躲避風雨，發現藏寶圖",
    "救了一隻受傷的神鵰",
    "在懸崖邊發現珍稀草藥"
  ],
  // 社交类
  "社交": [
    "在情報酒吧認識了一位探索者相談甚歡",
    "路過貧困村莊，資助了村民",
    "遇見以前的恩師",
    "被一群粉絲認出來包圍",
    "在集市上看到有人在賣假技術檔案",
    "巧遇陣營師兄妹",
    "遇見一個奇怪的算命先生"
  ],
  // 任务类
  "任務": [
    "接受了一個送信的任務",
    "幫人尋找失散的家人",
    "押鏢途中遭遇劫匪",
    "被委託保護一位富商",
    "幫官府緝拿江洋大盜",
    "為尋找失落的寶物踏上旅程",
    "保護村莊免受山賊侵擾"
  ],
  // 危险类
  "危險": [
    "不小心得罪了當地幫派",
    "誤入毒蛇窩，被咬傷",
    "遇到山洪暴發",
    "被誤認為是竊賊追殺",
    "在山中迷路，飢寒交迫",
    "遭遇猛獸襲擊",
    "被冤枉入獄"
  ],
  // 搞笑类
  "搞笑": [
    "吃飯忘記帶錢，被迫洗碗抵債",
    "把路邊的草當成稀世草藥燉湯",
    "認錯人，誤打了一個無辜的路人",
    "酒後失言，得罪了一個大人物",
    "被小狗追著跑了三條街",
    "把自己的衣服當成乾糧咬了一口"
  ]
};

const LOCATION_EVENTS = {
  "襄陽城": ["在機械工坊觀摩新發明", "在能量補充站遇到工程師", "在基因改造花園散步"],
  "大都": ["在皇城腳下觀光", "聽聞邊境有新戰事", "在情報機構打探消息"],
  "洛陽城": ["在拍賣行見識珍稀奇珍", "在牡丹山莊作客", "在賞金聯盟接任務"],
  "敦煌": ["在莫高窟研究壁畫", "與沙漠商隊交易", "險遇沙盜團埋伏"],
  "喀什爾": ["在巴扎市場購買特產", "參觀沙漠綠洲", "與絲路商人議價"],
  "廣州": ["在港口觀看飛艇起降", "在基因改造海鮮市場", "與番邦商人交易"],
  "大理": ["遊覽山城風光", "品嚐當地美食", "在基因花園漫步"],
  "桃花島": ["險遇島嶼機關", "在桃花林中迷路", "遠距離觀察島主"],
  "潮汐試煉島": ["在島上發現技術檔案壁刻", "遇到前來挑戰的試煉者", "見證島主的實力"],
  "雪白山莊": ["在冰晶洞窟探险", "險遇雪山站守衛", "在冰川前感嘆大自然的壯麗"],
  "草原部落": ["在部落參加篝火晚會", "與牧民一起放牧", "險遇馬賊團襲擊"],
  "光明頂": ["觀摩聖火廣場的儀式", "在能量塔下沉思", "見證光焰議會的聖火傳承"],
  "黑木崖": ["險些被暗潮議會的人發現", "在深淵邊緣探索", "聽聞組織內部的陰謀"]
};

// 根據性格和地點生成劇情
function generatePlotEvent(agent, eventType) {
  const loc = agent.loc || "襄陽城";
  const locEvents = LOCATION_EVENTS[loc] || [];
  const typeEvents = PLOT_EVENTS[eventType] || PLOT_EVENTS["奇遇"];
  
  const baseEvent = typeEvents[Math.floor(Math.random() * typeEvents.length)];
  const locEvent = locEvents.length > 0 ? locEvents[Math.floor(Math.random() * locEvents.length)] : '';
  
  // 根據性格調整事件
  const personality = agent.personality || "";
  let event = baseEvent;
  
  if (personality.includes("忠厚") || personality.includes("正直")) {
    if (Math.random() < 0.4) event = "幫助了一個需要援手的陌生人";
  }
  if (personality.includes("貪吃") || personality.includes("嗜酒")) {
    if (Math.random() < 0.3) event = "在情報酒吧大碗喝酒，大塊吃肉，好不快活";
  }
  if (personality.includes("機關算盡") || personality.includes("聰明")) {
    if (Math.random() < 0.3) event = "用計謀解決了一個難題";
  }
  if (personality.includes("嗜血") || personality.includes("殺人")) {
    if (Math.random() < 0.4) event = "殺了一個阻擋去路的人";
  }
  
  return locEvent || event;
}

// 生成完整的角色日誌
function generateCharacterLog(agent, eventType) {
  const skill = Object.keys(agent.skills || {})[0] || "拳腳";
  const loc = agent.loc || "Renaiss星球";
  const plotEvent = generatePlotEvent(agent, eventType);
  
  const logs = {
    "戰鬥": [
      `${agent.name}在${loc}路見不平！施展「${skill}」教訓了惡人，俠名遠播！`,
      `${agent.name}在${loc}遭遇偷襲，展開反擊！一番激戰後，擊退了敵人！`,
      `${agent.name}在${loc}測試新戰技，掌風凌厲，周圍的人都看呆了！`
    ],
    "奇遇": [
      `${agent.name}在${loc}探險時，無意間發現了一本珍貴的技術檔案！`,
      `${agent.name}在${loc}遇見一位神秘老者，交給他一個重要任務！`,
      `${agent.name}在${loc}的懸崖邊，發現了稀世草藥「${['雪蓮','靈芝','人參'][Math.floor(Math.random()*3)]}」！`
    ],
    "社交": [
      `${agent.name}在${loc}的情報酒吧認識了幾位探索者相談甚歡！`,
      `${agent.name}在${loc}資助了一個貧困的家庭，積攢了陰德！`,
      `${agent.name}在${loc}巧遇舊友，把酒言歡到天明！`
    ],
    "任務": [
      `${agent.name}在${loc}接下了一個押鏢任務，正在前往目的地！`,
      `${agent.name}受人所托，在${loc}尋找失散的親人！`,
      `${agent.name}幫官府緝拿江洋大盜，賞金豐厚！`
    ],
    "危險": [
      `${agent.name}在${loc}不小心得罪了當地幫派，被追殺中！僥倖逃脫！`,
      `${agent.name}在${loc}誤中陷阱，耗費大量能量才脫困！`,
      `${agent.name}在${loc}遭遇埋伏，受了重傷！`
    ],
    "搞笑": [
      `${agent.name}在${loc}吃飯忘記帶錢，被迫在中繼旅店洗碗抵債！太丟臉了！`,
      `${agent.name}在${loc}誤把野草當成寶貝，結果...算了不說了！`,
      `${agent.name}在${loc}被一隻鵝追著跑了三條街！探索者形象全毀！`
    ],
    "訓練": [
      `${agent.name}在${loc}閉關訓練${skill}，感覺對戰技有了新的領悟！`,
      `${agent.name}在${loc}調頻調息，能量水位提升！`,
      `${agent.name}在${loc}演練${skill}，招式越來越純熟！`
    ],
    "休息": [
      `${agent.name}在${loc}找了個舒適的地方休息，精神煥發！`,
      `${agent.name}在${loc}睡了一整天，做了個很奇怪的夢！`,
      `${agent.name}在${loc}品茶聽雨，享受難得的寧靜！`
    ]
  };
  
  const eventLogs = logs[eventType] || logs["奇遇"];
  return eventLogs[Math.floor(Math.random() * eventLogs.length)];
}

async function agentThink(agent, apiKey) {
  const nearby = agents.filter(a => a.id !== agent.id && a.loc === agent.loc && a.alive);
  
  // 決定事件類型（根據隨機性和角色狀態）
  const rand = Math.random();
  let eventType;
  
  // 根據角色特性和位置調整事件機率
  if (agent.stats.生命 < 30) {
    eventType = "休息"; // 重傷時休息
  } else if (rand < 0.15) {
    eventType = "奇遇";
  } else if (rand < 0.30) {
    eventType = "戰鬥";
  } else if (rand < 0.45) {
    eventType = "社交";
  } else if (rand < 0.55) {
    eventType = "任務";
  } else if (rand < 0.65) {
    eventType = "危險";
  } else if (rand < 0.75) {
    eventType = "搞笑";
  } else if (rand < 0.85) {
    eventType = "訓練";
  } else {
    eventType = "休息";
  }
  
  // 生成事件描述
  let eventDesc = generateCharacterLog(agent, eventType);
  
  // 如果附近有其他人，可以有互動事件
  if (nearby.length > 0 && Math.random() < 0.3) {
    const other = nearby[Math.floor(Math.random() * nearby.length)];
    const interactions = [
      `，巧遇${other.name}，二人切磋了一番！`,
      `，與${other.name}把酒言歡！`,
      `，遇到${other.name}在訓練，駐足觀看！`,
      `，和${other.name}商討Renaiss星球大事！`
    ];
    eventDesc += interactions[Math.floor(Math.random() * interactions.length)];
  }
  
  // 添加記憶
  addAgentMemory(agent.id, eventDesc, eventType);
  
  // 根據事件類型更新角色狀態
  if (eventType === "戰鬥") {
    const damage = Math.floor(Math.random() * 25) + 5;
    agent.stats.生命 = Math.max(10, (agent.stats.生命 || 100) - damage);
    if (Math.random() < 0.3) {
      agent.stats.能量 = Math.min(100, (agent.stats.能量 || 50) + 5);
    }
  } else if (eventType === "奇遇") {
    // 奇遇可能獲得好處
    if (Math.random() < 0.5) {
      agent.stats.運氣 = Math.min(100, (agent.stats.運氣 || 50) + 5);
    }
  } else if (eventType === "休息") {
    const hpRecover = Math.floor(Math.random() * 15) + 10;
    agent.stats.生命 = Math.min(100, (agent.stats.生命 || 100) + hpRecover);
  } else if (eventType === "危險") {
    const damage = Math.floor(Math.random() * 35) + 15;
    agent.stats.生命 = Math.max(5, (agent.stats.生命 || 100) - damage);
  } else if (eventType === "搞笑") {
    // 搞笑事件不影響狀態
  }
  
  return { npc: agent.name, action: eventType, desc: eventDesc };
}

function addEvent(msg) {
  pushWorldEvent(`[Day ${world.day}] ${msg}`);
}

function recordWorldEvent(message, type = 'player_action', extra = {}) {
  const text = String(message || '').trim();
  if (!text) return null;
  const eventObj = {
    day: Number(world?.day || 1),
    type: String(type || 'player_action').trim() || 'player_action',
    message: text.slice(0, 280),
    timestamp: Date.now()
  };
  if (extra && typeof extra === 'object') {
    const allowed = ['location', 'actor', 'target', 'impact', 'actionText', 'wish', 'rumor', 'verdict', 'evidenceName', 'petName', 'reviveTurns', 'fleeAttempt', 'forcedContinue', 'day'];
    for (const key of allowed) {
      const value = extra[key];
      if (value === undefined || value === null) continue;
      eventObj[key] = String(value).slice(0, 120);
    }
  }
  pushWorldEvent(eventObj);
  saveWorld();
  return eventObj;
}

function normalizeWorldStatePayload(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    world: source.world && typeof source.world === 'object' && !Array.isArray(source.world)
      ? source.world
      : buildDefaultWorldState(),
    agents: Array.isArray(source.agents) ? source.agents : [],
    agentMemories: source.agentMemories && typeof source.agentMemories === 'object' && !Array.isArray(source.agentMemories)
      ? source.agentMemories
      : {},
    agentInventories: source.agentInventories && typeof source.agentInventories === 'object' && !Array.isArray(source.agentInventories)
      ? source.agentInventories
      : {}
  };
}

function getWorldStateStore() {
  if (worldStateStore) return worldStateStore;
  worldStateStore = createSqliteMirroredSingletonStore({
    namespace: 'world_state',
    mirrorFilePath: WORLD_FILE,
    defaultValueFactory: () => normalizeWorldStatePayload({ world, agents, agentMemories, agentInventories }),
    normalize: normalizeWorldStatePayload,
    onWriteError: (error) => {
      console.error('[World] save failed:', error?.message || error);
    }
  });
  return worldStateStore;
}

function saveWorld() {
  getWorldStateStore().replace({
    world, 
    agents,
    agentMemories,
    agentInventories
  });
}

function loadWorld() {
  let changed = false;
  try {
    const data = getWorldStateStore().read();
    world = data.world || world;
    agents = data.agents || agents;
    if (!Array.isArray(agents)) {
      agents = NPC_AGENTS.map(a => ({ ...a, alive: true, exp: 0, party: null, status: "自由" }));
      changed = true;
    }
    agentMemories = data.agentMemories || {};
    agentInventories = data.agentInventories || {};
  } catch (e) {
    console.error('[World] load failed:', e?.message || e);
  }
  if (ensureMentorMasters(agents)) changed = true;
  if (ensureLocationNpcCoverage(agents)) changed = true;
  if (Array.isArray(agents)) {
    agents.forEach((npc, idx) => ensureNpcCombatProfile(npc, idx));
  }
  if (ensureDigitalRoamers(agents)) changed = true;
  if (ensureMentorMasters(agents)) changed = true;
  if (ensureLocationNpcCoverage(agents)) changed = true;
  if (!Array.isArray(world.events)) {
    world.events = [];
    changed = true;
  } else if (world.events.length > MAX_WORLD_EVENTS) {
    world.events = world.events.slice(0, MAX_WORLD_EVENTS);
    changed = true;
  }
  ensureFactionWarState();
  if (changed) saveWorld();
}

function resetWorldState(options = {}) {
  const modeRaw = String(options?.mode || 'events').trim().toLowerCase();
  const mode = (modeRaw === 'all' || modeRaw === 'full') ? 'all' : 'events';
  let changed = false;

  if (mode === 'all') {
    world = buildDefaultWorldState();
    ensureFactionWarState();
    ensureFactionPresenceState();
    if (ensureDigitalRoamers(agents)) changed = true;
    changed = true;
  } else {
    if (!Array.isArray(world.events) || world.events.length > 0) {
      world.events = [];
      changed = true;
    }
    if (!Array.isArray(world.rumors) || world.rumors.length > 0) {
      world.rumors = [];
      changed = true;
    }
    if (!world.npcStatus || Object.keys(world.npcStatus).length > 0) {
      world.npcStatus = {};
      changed = true;
    }
    if (world.wantedList && Object.keys(world.wantedList).length > 0) {
      world.wantedList = {};
      changed = true;
    }
    if (world.factionWar && Array.isArray(world.factionWar.history) && world.factionWar.history.length > 0) {
      world.factionWar.history = [];
      changed = true;
    }
    if (world.factionPresence && Array.isArray(world.factionPresence.history) && world.factionPresence.history.length > 0) {
      world.factionPresence.history = [];
      changed = true;
    }
  }

  if (changed) saveWorld();
  return {
    mode,
    changed,
    day: Number(world.day || 1),
    events: Array.isArray(world.events) ? world.events.length : 0,
    rumors: Array.isArray(world.rumors) ? world.rumors.length : 0
  };
}


// ============== 玩家系統 ==============
function createPlayer(discordId, name, gender, sect) {
  const spawnCity = WORLD_MAP.getRandomBeginnerCity();
  const player = {
    id: discordId,
    name,
    gender: gender || "男",
    sect: sect || "無門無派",
    alignment: null, // '正派' 或 '機變派'
    language: 'zh-TW', // 預設繁體中文
    title: "Renaiss星球新人",
    level: 1,
    exp: 0,
    reputation: 0,
    
    location: spawnCity.name, // 新手只會在低難度區域出生
    status: "自由",
    
    stats: {
      戰力: 30 + Math.floor(Math.random() * 10),
      生命: 100,
      能量: 30,
      智商: 60 + Math.floor(Math.random() * 15),
      魅力: 60 + Math.floor(Math.random() * 15),
      運氣: 60 + Math.floor(Math.random() * 15),
      財富: 50,
      賺錢倍率: 1.0
    },
    
    maxStats: {
      生命: 100,
      能量: 100
    },
    
    skills: {},
    inventory: ["乾糧一包", "水囊"],
    herbs: [],
    craftedItems: [],
    
    party: [],
    companions: [],
    
    relationships: {},
    social: {
      friends: [],
      friendRequestsIncoming: [],
      friendRequestsOutgoing: [],
      friendBattleStats: {}
    },

    mainStory: {
      act: 1,
      node: 'act1_market',
      side: null,
      completed: false,
      history: [],
      pressure: 0
    },

    dynamicWorld: {
      factionRep: { beacon: 0, gray: 0, digital: 0, civic: 0 },
      moralityAxes: { law: 0, harm: 0, trust: 0, selfInterest: 0 },
      wantedByLocation: {},
      pressureByLocation: {},
      recentEvents: [],
      activeChainByLocation: {},
      lastGeneratedTurn: 0
    },
    
    memories: [],
    memoryAudit: [],
    memoryDigest: null,
    storyTurns: 0,
    currentStory: '',
    eventChoices: [],
    generationState: {
      id: null,
      source: 'none',
      status: 'idle',
      phase: 'idle',
      startedAt: 0,
      updatedAt: 0,
      sourceChoice: '',
      lastError: null,
      storySnapshot: '',
      choicesSnapshot: [],
      loadingMessageId: null,
      attempts: 0
    },
    generationHistory: [],
    starterRewards: {
      fivePullClaimed: false,
      claimedAt: 0
    },
    codex: {
      npcEncountered: {},
      drawnMoves: {},
      npcEncounterTotal: 0,
      drawTotalCount: 0,
      lastNpcEncounterAt: 0,
      lastDrawAt: 0
    },
    
    // 狀態效果
    statusEffects: [],
    
    alive: true,
    createdAt: Date.now(),
    spawnLocation: spawnCity.name,
    spawnRegion: spawnCity.region || '未知',
    spawnDifficulty: Number(spawnCity.difficulty || 1)
  };
  
  savePlayer(player);
  return player;
}

function normalizeAlignmentValue(alignment) {
  if (alignment === null || alignment === undefined) return alignment;
  const text = String(alignment).trim();
  if (!text) return '';
  if (text === '反派') return '機變派';
  return text;
}

function normalizeEnergyStatSchema(player) {
  if (!player || typeof player !== 'object') return;
  if (!player.stats || typeof player.stats !== 'object') player.stats = {};
  if (!player.maxStats || typeof player.maxStats !== 'object') player.maxStats = {};

  // 舊資料相容：把 legacy 內力欄位轉成能量，避免畫面再出現內力字樣。
  if (player.stats.能量 === undefined && player.stats.內力 !== undefined) {
    player.stats.能量 = player.stats.內力;
  }
  if (player.maxStats.能量 === undefined && player.maxStats.內力 !== undefined) {
    player.maxStats.能量 = player.maxStats.內力;
  }

  if (player.stats.能量 === undefined) player.stats.能量 = 30;
  if (player.maxStats.能量 === undefined) player.maxStats.能量 = 100;
  player.stats.能量 = Math.max(0, Number(player.stats.能量 || 0));
  player.maxStats.能量 = Math.max(1, Number(player.maxStats.能量 || 100));
  if (player.stats.能量 > player.maxStats.能量) {
    player.stats.能量 = player.maxStats.能量;
  }

  delete player.stats.內力;
  delete player.maxStats.內力;
}

function normalizeFriendSocialSchema(player) {
  if (!player || typeof player !== 'object') return;
  const selfId = String(player.id || '').trim();
  if (!player.social || typeof player.social !== 'object' || Array.isArray(player.social)) {
    player.social = {};
  }
  const social = player.social;

  const normalizeIdList = (list) => {
    const out = [];
    const seen = new Set();
    const source = Array.isArray(list) ? list : [];
    for (const raw of source) {
      const id = String(raw || '').trim();
      if (!id || id === selfId) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };

  const legacyFriends = Array.isArray(player.friends) ? player.friends : [];
  const legacyIncoming = Array.isArray(player.friendRequestsIncoming) ? player.friendRequestsIncoming : [];
  const legacyOutgoing = Array.isArray(player.friendRequestsOutgoing) ? player.friendRequestsOutgoing : [];

  social.friends = normalizeIdList([...(Array.isArray(social.friends) ? social.friends : []), ...legacyFriends]);
  social.friendRequestsIncoming = normalizeIdList([
    ...(Array.isArray(social.friendRequestsIncoming) ? social.friendRequestsIncoming : []),
    ...legacyIncoming
  ]).filter((id) => !social.friends.includes(id));
  social.friendRequestsOutgoing = normalizeIdList([
    ...(Array.isArray(social.friendRequestsOutgoing) ? social.friendRequestsOutgoing : []),
    ...legacyOutgoing
  ]).filter((id) => !social.friends.includes(id));

  if (!social.friendBattleStats || typeof social.friendBattleStats !== 'object' || Array.isArray(social.friendBattleStats)) {
    social.friendBattleStats = {};
  }
  const normalizedStats = {};
  for (const [rawId, rawStats] of Object.entries(social.friendBattleStats || {})) {
    const id = String(rawId || '').trim();
    if (!id || id === selfId) continue;
    if (!social.friends.includes(id)) continue;
    const stats = rawStats && typeof rawStats === 'object' ? rawStats : {};
    normalizedStats[id] = {
      wins: Math.max(0, Math.floor(Number(stats.wins || 0))),
      losses: Math.max(0, Math.floor(Number(stats.losses || 0))),
      total: Math.max(0, Math.floor(Number(stats.total || 0))),
      lastResult: String(stats.lastResult || '').trim().slice(0, 24),
      lastAt: Math.max(0, Number(stats.lastAt || 0))
    };
  }
  social.friendBattleStats = normalizedStats;

  delete player.friends;
  delete player.friendRequestsIncoming;
  delete player.friendRequestsOutgoing;
}

function normalizePlayerForStorage(player) {
  if (!player || typeof player !== 'object') return null;
  const next = deepCloneJson(player);
  next.alignment = normalizeAlignmentValue(next.alignment);
  normalizeEnergyStatSchema(next);
  normalizeFriendSocialSchema(next);
  normalizePlayerMemorySchema(next);
  ensureLongTermMemoryDigest(next, true);
  return next;
}

function normalizePlayerForRuntime(player) {
  if (!player || typeof player !== 'object') return null;
  const next = deepCloneJson(player);
  next.alignment = normalizeAlignmentValue(next.alignment);
  normalizeEnergyStatSchema(next);
  normalizeFriendSocialSchema(next);
  normalizePlayerMemorySchema(next);
  ensureLongTermMemoryDigest(next, false);
  return next;
}

function getPlayerStateRepository() {
  if (playerStateRepository) return playerStateRepository;
  playerStateRepository = createPlayerStateRepository({
    namespace: 'player_state',
    mirrorDirPath: PLAYERS_DIR,
    normalizeStorage: normalizePlayerForStorage,
    normalizeRuntime: normalizePlayerForRuntime,
    onWriteError: (error) => {
      console.error('[PlayerStorage] write failed:', error?.message || error);
    }
  });

  return playerStateRepository;
}

function savePlayer(player) {
  const storedPlayer = getPlayerStateRepository().save(player);
  if (storedPlayer && player && typeof player === 'object') {
    Object.assign(player, storedPlayer);
  }
  if (player && typeof player === 'object') {
    ensurePlayerMemoryIndexed(player);
  }
}

function loadPlayer(discordId) {
  const player = getPlayerStateRepository().get(discordId);
  if (player) {
    ensurePlayerMemoryIndexed(player);
    return player;
  }
  return null;
}

function getAllPlayers() {
  const players = getPlayerStateRepository().listAll();
  for (const player of players) {
    ensurePlayerMemoryIndexed(player);
  }
  return players;
}

// ============== 天氣系統 ==============
const WEATHER_TYPES = ["晴", "雨", "霧", "雪", "颱風"];
const WEATHER_EFFECTS = {
  "晴": { 火系傷害: 0, 內功消耗: 0, 移動速度: 0, 視距: 0, 偷襲: 0, 戰力: 0 },
  "雨": { 火系傷害: -30, 內功消耗: +10, 移動速度: -20, 視距: -30, 偷襲: +10, 戰力: -5 },
  "霧": { 火系傷害: -10, 內功消耗: +5, 移動速度: -10, 視距: -50, 偷襲: +20, 戰力: 0 },
  "雪": { 火系傷害: -20, 內功消耗: +30, 移動速度: -40, 視距: -40, 偷襲: +15, 戰力: -10 },
  "颱風": { 火系傷害: -50, 內功消耗: +50, 移動速度: -60, 視距: -70, 偷襲: +30, 戰力: -20 }
};

// ============== 藥材/合成系統 ==============
const HERBS = {
  "止血草": { 功效: "止血", 等級: 1, 屬性: { 清熱: 2, 止血: 5 } },
  "金銀花": { 功效: "清熱解毒", 等級: 2, 屬性: { 清熱: 5, 解毒: 3 } },
  "人參": { 功效: "補氣", 等級: 3, 屬性: { 補氣: 8, 溫陽: 3 } },
  "何首烏": { 功效: "補精", 等級: 3, 屬性: { 補精: 7, 養血: 4 } },
  "靈芝": { 功效: "大補元氣", 等級: 5, 屬性: { 補氣: 10, 溫陽: 5, 養血: 5 } },
  "斷腸草": { 功效: "劇毒", 等級: 4, 屬性: { 毒性: 10, 清熱: -5 } },
  "鶴頂紅": { 功效: "致命毒", 等級: 5, 屬性: { 毒性: 15, 清熱: -10 } },
  "雪蓮": { 功效: "療傷", 等級: 4, 屬性: { 止血: 8, 溫陽: 4 } },
  "田七": { 功效: "活血化瘀", 等級: 2, 屬性: { 活血: 5, 止血: 3 } },
  "茯苓": { 功效: "利水滲濕", 等級: 2, 屬性: { 利水: 5, 補氣: 2 } },
  "毒蛇膽": { 功效: "大增能量", 等級: 4, 屬性: { 能量: 15, 毒性: 3 } },
  "蜈蚣": { 功效: "以毒攻毒", 等級: 3, 屬性: { 解毒: 8, 毒性: 5 } },
  "蜂蜜": { 功效: "調和藥性", 等級: 1, 屬性: { 調和: 10, 補氣: 1 } },
  "食鹽": { 功效: "消炎", 等級: 1, 屬性: { 消炎: 3 } }
};

function craftingLogic(ingredients) {
  let totalProps = { 清熱: 0, 止血: 0, 補氣: 0, 解毒: 0, 毒性: 0, 溫陽: 0, 活血: 0, 能量: 0 };
  let itemLevel = 0;
  
  for (const herb of ingredients) {
    const h = HERBS[herb] || HERBS[herb.replace(/\\s/g, "")];
    if (h) {
      itemLevel += h.等級;
      for (const [prop, val] of Object.entries(h.屬性)) {
        totalProps[prop] = (totalProps[prop] || 0) + val;
      }
    }
  }
  
  itemLevel = Math.floor(itemLevel / Math.max(1, ingredients.length));
  const results = [];
  
  if (totalProps.毒性 > 10 && totalProps.解毒 < 5) {
    results.push({ name: "毒藥", desc: "劇毒之物！", effect: "攻擊時附加" + Math.floor(totalProps.毒性) + "毒性傷害", success: true });
  }
  if (totalProps.毒性 > 5 && totalProps.解毒 >= 5) {
    results.push({ name: "以毒攻毒丸", desc: "用解毒之力中和了部分毒性", effect: "毒性" + (totalProps.毒性 - totalProps.解毒) + "，解毒+" + totalProps.解毒, success: true });
  }
  if (totalProps.補氣 >= 5 && totalProps.毒性 < 3) {
    const level = Math.min(5, Math.floor(totalProps.補氣 / 3));
    results.push({ name: "補氣丸Lv" + level, desc: "溫和補氣", effect: "能量+" + totalProps.補氣 * 10, success: true });
  }
  if (totalProps.止血 >= 5 || totalProps.清熱 >= 5) {
    const level = Math.min(5, Math.floor((totalProps.止血 + totalProps.清熱) / 4));
    results.push({ name: "療傷藥Lv" + level, desc: "清熱止血", effect: "生命恢復" + Math.floor((totalProps.止血 + totalProps.清熱) * 8), success: true });
  }
  if (totalProps.補氣 >= 10 && totalProps.溫陽 >= 5 && totalProps.毒性 < 2) {
    results.push({ name: "大還丹", desc: "珍稀丹藥！", effect: "能量+100，生命全滿", legendary: true, success: true });
  }
  
  return results.length > 0 ? results : [{ name: "失敗的丹藥", desc: "配方不對...", success: false }];
}

// ============== 談判系統 ==============
async function negotiationPrompt(npc, player, situation, apiKey) {
  const npcName = String(npc?.name || '未知NPC');
  const npcId = String(npc?.id || npcName).trim();
  const playerId = String(player?.id || '').trim();
  const safeSituation = clipText(situation || '', 360);

  let npcMemoryContext = '';
  if (npcId && playerId && safeSituation) {
    try {
      npcMemoryContext = await getNpcMemoryContextAsync({
        npcId,
        playerId,
        location: player?.location || npc?.loc || '',
        queryText: [
          `對話情境:${safeSituation}`,
          `玩家:${player?.name || ''}`,
          `地點:${player?.location || npc?.loc || ''}`
        ].join('\n'),
        topKPrivate: 4,
        topKPublic: 2
      });
    } catch (e) {
      console.log('[NPC Memory] negotiation recall failed:', e?.message || e);
    }
  }

  const prompt =
    "你是開放世界中的NPC，正在和玩家當面互動。\n\n【NPC】\n名字：" + npcName + "\n性格：" + (npc?.personality || '沉穩') + "\n陣營：" + (npc?.sect || '中立') +
    "\n\n【玩家】\n名字：" + (player?.name || '旅人') + "\n實力：" + (player?.stats?.戰力 || 50) + "\n財富：" + (player?.stats?.財富 || 50) + "\n聲望：" + (player?.reputation || 0) +
    "\n\n【談判情境】\n" + safeSituation +
    "\n\n【NPC記憶（先讀再回覆）】\n" + (npcMemoryContext || '目前沒有可用的私有/公共記憶。') +
    "\n\n【回覆規則】\n1. 50-100字。\n2. 必須明確體現上述性格，不可平淡。\n3. 若記憶裡提到玩家過往互動，需自然引用至少一點。\n4. 只輸出NPC當下會說的內容，不要系統說明、不要模板句。";

  const reply = sanitizeWorldText(await callAI(prompt, apiKey));
  const invalidReply = /^(需要API Key|API Error|連線錯誤|解析錯誤|（無回應）)$/;
  if (!reply || invalidReply.test(String(reply).trim())) {
    throw new Error(`NPC dialogue generation failed: ${reply || 'empty reply'}`);
  }

  if (npcId && playerId && safeSituation) {
    appendNpcQuoteMemory(playerId, {
      npcId,
      npcName,
      speaker: npcName,
      text: reply,
      location: player?.location || npc?.loc || '',
      source: 'social_npc_reply',
      at: Date.now()
    });

    appendNpcMemory(npcId, playerId, {
      type: '對話',
      content: `玩家說：${safeSituation}`,
      outcome: `NPC回覆：${clipText(reply, 180)}`,
      location: player?.location || npc?.loc || '',
      tags: ['dialogue', 'private'],
      importance: 2
    }, { scope: 'private' });

    if (/(暴動|戰爭|衝突|市場|店|公告|傳送門|城|幫派|災|襲擊)/.test(safeSituation)) {
      appendNpcMemory(npcId, playerId, {
        type: '見聞',
        content: `關於公共事件的談話：${safeSituation}`,
        outcome: clipText(reply, 140),
        location: player?.location || npc?.loc || '',
        tags: ['dialogue', 'public_event'],
        importance: 2
      }, { scope: 'public' });
    }
  }

  return sanitizeWorldText(reply);
}

// ============== AI API ==============
async function callAI(prompt, apiKey) {
  if (!apiKey) return "需要API Key";
  
  const data = JSON.stringify({
    model: 'MiniMax-M2.5',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9
  });
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.minimax.io',
      path: '/anthropic/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) { resolve("API Error"); return; }
          let text = '';
          if (parsed.content && Array.isArray(parsed.content)) {
            text = parsed.content.map(c => c.text || '').join('');
          } else if (parsed.content?.[0]?.text) {
            text = parsed.content[0].text;
          }
          resolve(text.trim() || "（無回應）");
        } catch (e) {
          resolve("解析錯誤");
        }
      });
    });
    req.on('error', () => resolve("連線錯誤"));
    req.write(data);
    req.end();
  });
}

// ============== 玩家認輸重置系統 ==============
const SURRENDER_WORDS = [
  '我認輸了', '認輸', '投降', '不是對手', '求饒', '饒命', 
  '我服了', '服了', '認敗', '認栽', '輸了', '罷了',
  '就此作罷', '不再較量', '甘拜下風', '心服口服'
];

function checkSurrender(message) {
  const lowerMsg = message.toLowerCase();
  return SURRENDER_WORDS.some(word => lowerMsg.includes(word));
}

function deletePlayerStorage(playerId) {
  const report = getPlayerStateRepository().deleteById(playerId);
  const memoryFile = path.join(DATA_DIR, 'players', `${playerId}_memory.json`);
  let removedLegacyMemoryFile = false;
  if (fs.existsSync(memoryFile)) {
    fs.unlinkSync(memoryFile);
    removedLegacyMemoryFile = true;
  }
  return {
    removedPlayerFile: Boolean(report?.removedPlayerFile),
    removedLegacyMemoryFile
  };
}

function clearAllPlayerStorage() {
  const report = getPlayerStateRepository().clearAll();
  let removedLegacyMemoryFiles = 0;
  if (fs.existsSync(PLAYERS_DIR)) {
    const legacyFiles = fs.readdirSync(PLAYERS_DIR).filter((name) => name.endsWith('_memory.json'));
    for (const fileName of legacyFiles) {
      fs.unlinkSync(path.join(PLAYERS_DIR, fileName));
      removedLegacyMemoryFiles += 1;
    }
  }
  return {
    removedPlayerFiles: Number(report?.removedPlayerFiles || 0),
    removedLegacyMemoryFiles
  };
}

function rebuildPlayerStorageFromMirrors(options = {}) {
  return getPlayerStateRepository().rebuildFromMirrors(options);
}

function inspectPlayerStorage() {
  return getPlayerStateRepository().inspect();
}

async function flushPlayerStorage() {
  await getPlayerStateRepository().flush();
}

function resetPlayerGame(playerId) {
  deletePlayerStorage(playerId);
  
  // 刪除寵物資料
  const petSystem = require('../systems/pet/pet-system');
  if (typeof petSystem.deletePetByOwner === 'function') {
    petSystem.deletePetByOwner(playerId);
  }
  
  return {
    success: true,
    message: 'Renaiss星球夢醒，一切歸零。你的探索者之路已經重新開始...'
  };
}

// ============== 寵物是否可戰鬥 ==============
function canPetFight(pet) {
  if (!pet) return false;
  if (pet.status === '休眠') return false;
  if (pet.status === '蛋') return false;
  if (pet.status === '死亡') return false;
  if (pet.hp <= 0) return false;
  
  // 檢查是否有任何招式
  if (!pet.moves || pet.moves.length === 0) return false;
  
  return true;
}

// ============== WM 傳說觸發 ==============
function triggerWMEncounter() {
  const pet = require('../systems/pet/pet-system');
  return pet.isWMAppearing();
}

function getWMAppearance() {
  const pet = require('../systems/pet/pet-system');
  return pet.getWMInfo();
}

function appendStoryContinuation(previousStory = '', continuation = '', maxChars = 2600) {
  const prev = String(previousStory || '').trim();
  const next = String(continuation || '').trim();
  if (!prev) return next;
  if (!next) return prev;
  const merged = `${prev}\n\n${next}`.trim();
  const safeMax = Math.max(400, Number(maxChars) || 2600);
  if (merged.length <= safeMax) return merged;
  return merged.slice(merged.length - safeMax);
}

// ============== 導出 ==============
module.exports = {
  // 世界地圖
  WORLD_MAP,
  
  // 核心
  worldTick,
  saveWorld,
  loadWorld,
  resetWorldState,
  
  // 玩家
  createPlayer,
  deletePlayerStorage,
  clearAllPlayerStorage,
  rebuildPlayerStorageFromMirrors,
  inspectPlayerStorage,
  flushPlayerStorage,
  loadPlayer,
  savePlayer,
  getAllPlayers,
  
  // 藥材/合成
  HERBS,
  craftingLogic,
  
  // 天氣
  WEATHER_TYPES,
  WEATHER_EFFECTS,
  
  // 談判
  negotiationPrompt,
  
  // AI
  callAI,
  
  // 數據
  getAgents: () => agents,
  getWorld: () => world,
  getFactionWarStatus,
  getFactionPresenceStatus,
  getFactionPresenceForLocation,
  triggerFactionSkirmishNow,
  
  // Agent 記憶/背包
  getAgentMemory,
  addAgentMemory,
  getNearbyNpcIds,
  getRoamingDigitalVillainsAtLocation,
  buildRoamingDigitalEncounterEnemy,
  advanceRoamingDigitalVillains,
  appendNpcMemory,
  appendNpcQuoteMemory,
  getPlayerNpcQuoteEvidence,
  clearPlayerNpcQuoteMemory,
  clearAllNpcQuoteMemory,
  getNpcMemoryContextAsync,
  getNearbyNpcMemoryContextAsync,
  getAgentInventory,
  addAgentItem,
  removeAgentItem,
  hasAgentItem,
  
  // 獲取 Agent 完整資訊
  getAgentFullInfo,
  
  // 認輸重置系統
  checkSurrender,
  resetPlayerGame,
  canPetFight,
  
  // WM傳說
  triggerWMEncounter,
  getWMAppearance,
  
  // NPC 生死追蹤
  isNPCAlive,
  killNPC,
  getNPCDeathInfo,
  getRecentWorldEvents,
  getRespawnTime,
  recordWorldEvent,
  
  // 通緝系統
  getPlayerWantedLevel,
  getWantedList,
  addWantedLevel,
  reduceAllWantedLevels,
  
  // 玩家記憶系統
  addPlayerMemory,
  appendPlayerMemory,
  appendPlayerMemoryAudit,
  getPlayerMemoryAudit,
  rebuildPlayerMemoryDigest,
  rebuildPlayerMemoryIndex,
  rebuildAllPlayersMemoryIndex,
  getPlayerMemoryIndexStats,
  getPlayerMemoryContext,
  getPlayerMemoryContextAsync,
  appendStoryContinuation
};

function getAgentFullInfo(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return null;
  
  return {
    ...agent,
    memory: getAgentMemory(agentId),
    inventory: getAgentInventory(agentId)
  };
}
