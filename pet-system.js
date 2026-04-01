/**
 * 🐾 Renaiss World - 寵物系統 v4
 * 世界觀改版：原創「生態共鳴 + 數據進化」風格
 */

const fs = require('fs');
const path = require('path');

const PET_FILE = path.join(__dirname, 'data', 'pets.json');
const PET_RECOVER_MS = 48 * 60 * 60 * 1000; // 2天

// ============== 聯盟系招式池（原創） ==============
const POSITIVE_MOVES = [
  // ===== Tier 1 =====
  { id: 'golden_needle', name: '脈衝標定', element: '光譜', type: 'positive', tier: 1, baseDamage: 12, effect: { stun: 1 }, desc: '以高頻脈衝鎖定目標，短暫造成停滯' },
  { id: 'iron_palm', name: '合金撞擊', element: '合金', type: 'positive', tier: 1, baseDamage: 10, effect: {}, desc: '用強化外殼發動直接衝撞' },
  { id: 'shield_stance', name: '稜鏡護層', element: '光譜', type: 'positive', tier: 1, baseDamage: 5, effect: { shield: 1 }, desc: '張開短時護層，吸收部分衝擊' },

  { id: 'spider_net', name: '纖維束縛', element: '生質', type: 'positive', tier: 1, baseDamage: 8, effect: { bind: 1 }, desc: '釋放可收縮纖維纏住對手' },
  { id: 'grass_cloak', name: '生物修補', element: '生質', type: 'positive', tier: 1, baseDamage: 0, effect: { heal: 10 }, desc: '啟動自癒模組，快速縫補損傷' },
  { id: 'root_trap', name: '根網干擾', element: '生質', type: 'positive', tier: 1, baseDamage: 9, effect: { slow: 1 }, desc: '在地面展開根網降低移動效率' },

  { id: 'willow_water', name: '淨化波', element: '液態', type: 'positive', tier: 1, baseDamage: 7, effect: { cleanse: true, heal: 10 }, desc: '釋放淨化液波，同步去除負面狀態' },
  { id: 'water_splash', name: '水壓脈衝', element: '液態', type: 'positive', tier: 1, baseDamage: 11, effect: {}, desc: '壓縮液流形成瞬間衝擊' },
  { id: 'mist_step', name: '霧相位移', element: '液態', type: 'positive', tier: 1, baseDamage: 0, effect: { dodge: 1 }, desc: '將身形霧化，短暫提高閃避' },

  // ===== Tier 2 =====
  { id: 'needle_rain', name: '碎晶風暴', element: '合金', type: 'positive', tier: 2, baseDamage: 22, effect: { bleed: 1 }, desc: '多段碎晶彈幕造成連續割裂' },
  { id: 'golden_bell', name: '堡壘力場', element: '光譜', type: 'positive', tier: 2, baseDamage: 15, effect: { shield: 2 }, desc: '生成雙層防護力場穩住前線' },
  { id: 'heavenly_flowers', name: '孢子刃雨', element: '生質', type: 'positive', tier: 2, baseDamage: 20, effect: { poison: 1 }, desc: '灑出微型孢子刃，造成中毒與切割' },
  { id: 'ice_palm', name: '低溫衝擊', element: '液態', type: 'positive', tier: 2, baseDamage: 20, effect: { freeze: 1 }, desc: '瞬降溫度凍結目標關節' },
  { id: 'blaze_sky', name: '電漿盛放', element: '熱能', type: 'positive', tier: 2, baseDamage: 25, effect: { burn: 1 }, desc: '點燃電漿雲團，造成灼燒' },
  { id: 'flame_armor', name: '熱盾回路', element: '熱能', type: 'positive', tier: 2, baseDamage: 12, effect: { reflect: 1 }, desc: '外層熱盾回彈部分攻擊傷害' },
  { id: 'rejuvenation', name: '再生矩陣', element: '生質', type: 'positive', tier: 2, baseDamage: 0, effect: { heal: 30 }, desc: '啟動深層修復矩陣恢復大量生命' },
  { id: 'rock_trap', name: '隕塊墜落', element: '地脈', type: 'positive', tier: 2, baseDamage: 22, effect: { missNext: 1 }, desc: '牽引隕塊砸落，打亂敵方節奏' },
  { id: 'quicksand', name: '漂砂陷落', element: '地脈', type: 'positive', tier: 2, baseDamage: 18, effect: { slow: 2 }, desc: '製造局部陷落區域持續牽制' },

  // ===== Tier 3 =====
  { id: 'flood_torrent', name: '潮汐奇點', element: '液態', type: 'positive', tier: 3, baseDamage: 35, effect: { splash: true }, desc: '引爆潮汐奇點，形成範圍壓制' },
  { id: 'fire_lotus', name: '日核裂解', element: '熱能', type: 'positive', tier: 3, baseDamage: 40, effect: { selfDamage: 10 }, desc: '超載核心換取高爆發輸出' },
  { id: 'arhat_kick', name: '地脈衝撞', element: '地脈', type: 'positive', tier: 3, baseDamage: 38, effect: { armorBreak: true }, desc: '共振地脈形成重擊並破甲' },
  { id: 'wind_fire_blade', name: '風暴聚變', element: '混相', type: 'positive', tier: 3, baseDamage: 45, effect: { burn: 2, stun: 1 }, desc: '高壓氣流與熱能聚變，兼具灼燒與震盪' },
  { id: 'thunder_crash', name: '雷矢超載', element: '混相', type: 'positive', tier: 3, baseDamage: 48, effect: { stun: 1, armorBreak: true }, desc: '雷矢束流貫穿護甲並造成失衡' }
];

// ============== 協定系招式池（原創） ==============
const NEGATIVE_MOVES = [
  // ===== Tier 1 =====
  { id: 'shadow_slash', name: '影域切割', element: '暗域', type: 'negative', tier: 1, baseDamage: 10, effect: {}, desc: '利用暗域偏振完成斜向切割' },
  { id: 'shadow_lock', name: '故障鎖定', element: '暗域', type: 'negative', tier: 1, baseDamage: 8, effect: { bind: 1 }, desc: '注入干擾碼鎖住目標行動' },
  { id: 'fear_presence', name: '恐懼脈衝', element: '暗域', type: 'negative', tier: 1, baseDamage: 0, effect: { fear: 1 }, desc: '放大對手感測噪音產生遲疑' },

  { id: 'spider_silk', name: '黏網拘束', element: '毒蝕', type: 'negative', tier: 1, baseDamage: 7, effect: { trap: 1 }, desc: '噴射高黏性網膜限制移動' },
  { id: 'minor_poison', name: '毒霧火花', element: '毒蝕', type: 'negative', tier: 1, baseDamage: 9, effect: { poison: 1 }, desc: '微量毒霧穿透護層造成侵蝕' },
  { id: 'curse_word', name: '靜電咒訊', element: '暗域', type: 'negative', tier: 1, baseDamage: 6, effect: { confuse: 1 }, desc: '發送錯位訊號擾亂判讀' },

  // ===== Tier 2 =====
  { id: 'soul_drain', name: '核心抽離', element: '暗域', type: 'negative', tier: 2, baseDamage: 18, effect: { drain: 15 }, desc: '從目標能量核心抽取可用輸出' },
  { id: 'soul_scatter', name: '神經霧化', element: '暗域', type: 'negative', tier: 2, baseDamage: 20, effect: { confuse: 2 }, desc: '釋放神經霧化流造成判斷錯亂' },
  { id: 'seven_step_poison', name: '腐蝕鏈劑', element: '毒蝕', type: 'negative', tier: 2, baseDamage: 16, effect: { poison: 2 }, desc: '連鎖腐蝕劑持續侵蝕系統' },
  { id: 'bone_dissolver', name: '熔蝕酸流', element: '毒蝕', type: 'negative', tier: 2, baseDamage: 25, effect: { defenseDown: 2 }, desc: '高溫酸流削弱防禦層' },
  { id: 'hot_sand_hell', name: '炙砂域', element: '熱毒', type: 'negative', tier: 2, baseDamage: 22, effect: { slow: 2, burn: 1 }, desc: '熱砂雲域造成減速與灼燒' },
  { id: 'plague_cloud', name: '疫霧群', element: '毒蝕', type: 'negative', tier: 2, baseDamage: 18, effect: { spreadPoison: true }, desc: '擴散型毒霧可在接觸後傳染' },
  { id: 'iron_thorn', name: '棘甲反刺', element: '合金', type: 'negative', tier: 2, baseDamage: 22, effect: { thorns: 2 }, desc: '激活棘甲在受擊時反向回刺' },

  // ===== Tier 3 =====
  { id: 'hell_fire', name: '煉域協議', element: '熱毒', type: 'negative', tier: 3, baseDamage: 32, effect: { burn: 2, poison: 1 }, desc: '啟動高危協議，輸出灼燒與毒侵' },
  { id: 'explosive_pill', name: '連鎖爆訊', element: '熱毒', type: 'negative', tier: 3, baseDamage: 38, effect: { selfDamage: 10 }, desc: '以自損換取鏈式爆震' },
  { id: 'ghost_fire', name: '幽格炙流', element: '暗熱', type: 'negative', tier: 3, baseDamage: 35, effect: { ignoreResistance: true }, desc: '炙流穿透護甲與抗性直接灼傷' },
  { id: 'silver_snake', name: '銀鏈束陣', element: '暗金', type: 'negative', tier: 3, baseDamage: 28, effect: { bind: 2, dot: 3 }, desc: '展開銀鏈束陣並持續放電' },
  { id: 'ice_toxin', name: '冰毒脈衝', element: '凍毒', type: 'negative', tier: 3, baseDamage: 26, effect: { freeze: 1, poison: 2 }, desc: '低溫毒流同步凍結與侵蝕' },
  { id: 'mud_fire_lotus', name: '泥焰遮幕', element: '混毒熱', type: 'negative', tier: 3, baseDamage: 30, effect: { blind: 1, burn: 2 }, desc: '泥焰遮幕降低視野並持續焚灼' },
  { id: 'ultimate_dark', name: '零界崩解', element: '暗域', type: 'negative', tier: 3, baseDamage: 45, effect: { selfDamage: 20 }, desc: '引爆零界反應器，代價極高' }
];

function enforceControlMoveTier(pool = []) {
  const hardControlKeys = ['stun', 'freeze'];
  const controlKeys = ['bind', 'slow', 'fear', 'confuse', 'blind', 'missNext'];
  for (const move of pool) {
    if (!move || typeof move !== 'object') continue;
    const effect = move.effect || {};
    const hasHardControl = hardControlKeys.some((k) => Number(effect[k] || 0) > 0);
    const hasControl = controlKeys.some((k) => Number(effect[k] || 0) > 0);
    if (hasHardControl) {
      move.tier = Math.max(2, Number(move.tier || 1));
      continue;
    }
    if (hasControl) {
      move.tier = Math.max(2, Number(move.tier || 1));
    }
  }
}

// 控制型技能不應落在普通階，避免前期連控失衡
enforceControlMoveTier(POSITIVE_MOVES);
enforceControlMoveTier(NEGATIVE_MOVES);

// ============== 初始技能 ==============
const INITIAL_MOVES = [
  { id: 'head_butt', name: '頭槌', element: '普通', type: 'normal', tier: 1, baseDamage: 8, effect: {}, desc: '寵物本能攻擊' },
  { id: 'flee', name: '逃跑', element: '普通', type: 'normal', tier: 1, baseDamage: 0, effect: { flee: true }, desc: '100%逃脫' }
];

const ALL_MOVES = [...POSITIVE_MOVES, ...NEGATIVE_MOVES, ...INITIAL_MOVES];
const MOVE_BY_ID = new Map(ALL_MOVES.map((m) => [m.id, m]));
const LEGACY_MOVE_NAME_TO_ID = {
  '金針刺穴': 'golden_needle',
  '暴雨梨花': 'needle_rain',
  '金鐘罩': 'golden_bell',
  '天女散花': 'heavenly_flowers',
  '羅網天蛛': 'spider_net',
  '回春術': 'rejuvenation',
  '楊枝淨水': 'willow_water',
  '寒冰掌': 'ice_palm',
  '洪水滔天': 'flood_torrent',
  '羅漢金剛腿': 'arhat_kick',
  '落石陷阱': 'rock_trap',
  '流沙陣': 'quicksand',
  '烈焰焚天': 'blaze_sky',
  '赤焰甲': 'flame_armor',
  '風火燎原': 'wind_fire_blade',
  '雷霆萬鈞': 'thunder_crash',
  '吸星大法': 'soul_drain',
  '無形鎖脈': 'shadow_lock',
  '離魂散': 'soul_scatter',
  '七步斷腸散': 'seven_step_poison',
  '化骨水': 'bone_dissolver',
  '蛛絲縛魂': 'spider_silk',
  '地獄烈火': 'hell_fire',
  '爆炸信號彈': 'explosive_pill',
  '熱砂地獄': 'hot_sand_hell',
  '火蓮碎': 'fire_lotus'
};

function cloneMoveTemplate(template) {
  if (!template) return null;
  return {
    ...template,
    effect: { ...(template.effect || {}) }
  };
}

function normalizeLoadedMove(move) {
  if (!move || typeof move !== 'object') return { move, changed: false };

  const legacyId = LEGACY_MOVE_NAME_TO_ID[String(move.name || '').trim()];
  const targetId = move.id || legacyId;
  const template = targetId ? MOVE_BY_ID.get(targetId) : null;
  if (!template) return { move, changed: false };

  const normalized = cloneMoveTemplate(template);
  normalized.currentProficiency = Number(move.currentProficiency || 0);
  if (move.cooldown !== undefined) normalized.cooldown = move.cooldown;

  const changed =
    move.id !== normalized.id ||
    move.name !== normalized.name ||
    move.element !== normalized.element ||
    move.type !== normalized.type ||
    Number(move.baseDamage || 0) !== Number(normalized.baseDamage || 0) ||
    JSON.stringify(move.effect || {}) !== JSON.stringify(normalized.effect || {});

  return { move: normalized, changed };
}

function normalizePetMoves(pet) {
  if (!pet || !Array.isArray(pet.moves)) return false;
  let changed = false;
  pet.moves = pet.moves.map((m) => {
    const result = normalizeLoadedMove(m);
    if (result.changed) changed = true;
    return result.move;
  });
  return changed;
}

// ============== 計算招式總傷害（用於顯示）==============
function calculateMoveDamage(move, level, attack) {
  let damage = move.baseDamage || 0;
  
  // 等級加成
  damage += level * 2;
  
  // 攻擊加成
  damage += Math.floor(attack * 0.5);
  
  // 計算持續效果總傷
  let totalEffectDamage = 0;
  let totalTurns = 0;
  
  if (move.effect.burn) totalTurns += move.effect.burn;
  if (move.effect.poison) totalTurns += move.effect.poison;
  if (move.effect.trap) totalTurns += move.effect.trap;
  if (move.effect.dot) totalTurns += 2;
  
  if (totalTurns > 0) {
    // 持續傷害 = 基礎傷害 * 0.6 / 總回合數
    totalEffectDamage = Math.floor(damage * 0.6);
    damage = Math.floor(damage * 0.4); // 即時傷害只有40%
  }
  
  return { instant: damage, overTime: totalEffectDamage, totalTurns, total: damage + totalEffectDamage };
}

// ============== 創建寵物蛋 ==============
function createPetEgg(playerId, type) {
  return {
    id: `pet_${playerId}_${Date.now()}`,
    ownerId: playerId,
    name: type === '正派' ? '聯盟夥伴蛋' : '協定夥伴蛋',
    type: type,
    level: 1,
    exp: 0,
    expToLevel: 100,
    hp: 100,
    maxHp: 100,
    attack: 20,
    defense: 15,
    speed: 20,
    moves: [],
    maxMoves: 10,
    status: '蛋',
    hatched: false,
    appearance: '一顆充滿神秘氣息的寵物蛋',
    lastFed: null,
    createdAt: Date.now()
  };
}

// ============== 敲蛋孵化 ==============
function hatchEgg(pet) {
  pet.hatched = true;
  pet.status = '正常';
  pet.reviveAt = null;
  pet.lastDownAt = null;
  
  const names = pet.type === '正派'
    ? ['Nova', 'Luma', 'Aria', 'Pico', 'Melo', 'Kite']
    : ['Vex', 'Nyx', 'Rift', 'Echo', 'Gloom', 'Raze'];
  
  pet.name = names[Math.floor(Math.random() * names.length)];
  pet.appearance = `一隻剛孵化的${pet.type}夥伴，外殼仍帶著微光紋路，眼神${pet.type === '正派' ? '穩定專注' : '敏銳機警'}`;
  
  // 初始招式：頭槌 + 逃跑
  pet.moves = [
    { ...INITIAL_MOVES[0], currentProficiency: 0 },
    { ...INITIAL_MOVES[1], currentProficiency: 0 }
  ];
  
  // 根據等級權重隨機獲得初始技能
  // 60% Tier 1, 30% Tier 2, 10% Tier 3
  const starterPool = pet.type === '正派' ? POSITIVE_MOVES : NEGATIVE_MOVES;
  const tier1 = starterPool.filter(m => m.tier === 1);
  const tier2 = starterPool.filter(m => m.tier === 2);
  const tier3 = starterPool.filter(m => m.tier === 3);
  
  const roll = Math.random();
  let selectedPool;
  if (roll < 0.6) {
    selectedPool = tier1;
  } else if (roll < 0.9) {
    selectedPool = tier2;
  } else {
    selectedPool = tier3;
  }
  
  const starterMove = selectedPool[Math.floor(Math.random() * selectedPool.length)];
  pet.moves.push({ ...starterMove, currentProficiency: 0 });
  
  return pet;
}

function markPetDefeated(pet, reason = '戰鬥失敗') {
  if (!pet) return pet;
  pet.hp = 0;
  pet.status = '死亡';
  pet.lastDownReason = reason;
  pet.lastDownAt = Date.now();
  pet.reviveAt = Date.now() + PET_RECOVER_MS;
  return pet;
}

function syncPetRecovery(pet) {
  if (!pet) return { pet, revived: false, changed: false };

  let changed = false;
  let revived = false;

  if (pet.status === '死亡' && pet.reviveAt && Date.now() >= pet.reviveAt) {
    pet.status = '正常';
    pet.hp = pet.maxHp || 100;
    pet.lastRevivedAt = Date.now();
    pet.reviveAt = null;
    changed = true;
    revived = true;
  }

  return { pet, revived, changed };
}

function getPetRecoveryRemainingMs(pet) {
  if (!pet || pet.status !== '死亡' || !pet.reviveAt) return 0;
  return Math.max(0, pet.reviveAt - Date.now());
}

// ============== 學習招式 ==============
function learnMove(pet, moveId) {
  if (pet.moves.length >= pet.maxMoves) {
    return { success: false, reason: '招式已達上限！需要忘記一個招式才能學習新招' };
  }
  
  const allMoves = pet.type === '正派' ? POSITIVE_MOVES : NEGATIVE_MOVES;
  const move = allMoves.find(m => m.id === moveId);
  
  if (!move) return { success: false, reason: '找不到這個招式' };
  if (pet.moves.find(m => m.id === moveId)) return { success: false, reason: '已經學過了' };
  
  pet.moves.push({ ...move, currentProficiency: 0 });
  updateAppearance(pet);
  
  return { success: true, move };
}

// ============== 忘記招式 ==============
function forgetMove(pet, moveId) {
  const idx = pet.moves.findIndex(m => m.id === moveId);
  if (idx === -1) return { success: false, reason: '沒有這個招式' };
  
  const forgotten = pet.moves.splice(idx, 1)[0];
  return { success: true, move: forgotten };
}

// ============== 更新外觀 ==============
function updateAppearance(pet) {
  if (!pet.hatched) return;
  
  const elements = pet.moves.map(m => m.element);
  const count = pet.moves.length;
  
  let desc = '';
  if (count <= 2) desc = '模樣樸實可愛';
  else if (count <= 4) desc = '身上開始浮現元素氣息';
  else if (count <= 6) desc = '體型變化，氣勢漸增';
  else if (count <= 8) desc = '威風凜凜，元素之力流轉';
  else desc = '完全覺醒！散發攝人氣勢';
  
  pet.appearance = desc;
}

// ============== 存讀檔 ==============
function savePet(pet) {
  const pets = loadAllPets();
  normalizePetMoves(pet);
  pets[pet.id] = pet;
  fs.writeFileSync(PET_FILE, JSON.stringify(pets, null, 2));
}

function loadPet(playerId) {
  const pets = loadAllPets();
  const pet = Object.values(pets).find(p => p.ownerId === playerId) || null;
  if (!pet) return null;

  const normalizedChanged = normalizePetMoves(pet);
  const synced = syncPetRecovery(pet);
  if (synced.changed || normalizedChanged) {
    savePet(synced.pet);
  }

  return synced.pet;
}

function deletePetByOwner(playerId) {
  const pets = loadAllPets();
  let changed = false;
  for (const [petId, pet] of Object.entries(pets)) {
    if (pet?.ownerId === playerId) {
      delete pets[petId];
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(PET_FILE, JSON.stringify(pets, null, 2));
  }

  return changed;
}

function getPetById(petId) {
  const pets = loadAllPets();
  return pets[petId] || null;
}

function loadAllPets() {
  if (!fs.existsSync(PET_FILE)) return {};
  try {
    const pets = JSON.parse(fs.readFileSync(PET_FILE, 'utf8'));
    let changed = false;
    for (const pet of Object.values(pets)) {
      if (normalizePetMoves(pet)) changed = true;
    }
    if (changed) {
      fs.writeFileSync(PET_FILE, JSON.stringify(pets, null, 2));
    }
    return pets;
  } catch (e) {
    return {};
  }
}

module.exports = {
  POSITIVE_MOVES,
  NEGATIVE_MOVES,
  INITIAL_MOVES,
  createPetEgg,
  hatchEgg,
  learnMove,
  forgetMove,
  updateAppearance,
  calculateMoveDamage,
  markPetDefeated,
  syncPetRecovery,
  getPetRecoveryRemainingMs,
  savePet,
  loadPet,
  deletePetByOwner,
  loadAllPets,
  getPetById
};
