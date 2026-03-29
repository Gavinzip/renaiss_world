/**
 * 🐾 刀鋒 BLADE - 寵物系統 v3
 * 修正：複合招式 = 總傷害攤分到每回合
 */

const fs = require('fs');
const path = require('path');

const PET_FILE = path.join(__dirname, 'data', 'pets.json');

// ============== 正派招式（17招）- 平衡版 + 等級分類 ==============
const POSITIVE_MOVES = [
  // ===== 普通級 (Tier 1) - 初期孵化常見 =====
  // 金系
  { id: 'golden_needle', name: '金針刺穴', element: '金', type: 'positive', tier: 1, baseDamage: 12, effect: { stun: 1 }, desc: '以金針刺入敵人穴位' },
  { id: 'iron_palm', name: '鐵砂掌', element: '金', type: 'positive', tier: 1, baseDamage: 10, effect: {}, desc: '基礎掌法，扎實有力' },
  { id: 'shield_stance', name: '抱元守一', element: '金', type: 'positive', tier: 1, baseDamage: 5, effect: { shield: 1 }, desc: '防守姿態，固守元氣' },
  
  // 木系
  { id: 'spider_net', name: '羅網天蛛', element: '木', type: 'positive', tier: 1, baseDamage: 8, effect: { bind: 1 }, desc: '以蛛絲織成天羅地網' },
  { id: 'grass_cloak', name: '草藥披身', element: '木', type: 'positive', tier: 1, baseDamage: 0, effect: { heal: 10 }, desc: '利用草藥簡單療傷' },
  { id: 'root_trap', name: '藤蔓絆足', element: '木', type: 'positive', tier: 1, baseDamage: 9, effect: { slow: 1 }, desc: '操縱藤蔓阻擋敵人' },
  
  // 水系
  { id: 'willow_water', name: '楊枝淨水', element: '水', type: 'positive', tier: 1, baseDamage: 7, effect: { cleanse: true, heal: 10 }, desc: '觀音楊枝灑下淨水' },
  { id: 'water_splash', name: '水濺一擊', element: '水', type: 'positive', tier: 1, baseDamage: 11, effect: {}, desc: '以水氣凝聚攻擊' },
  { id: 'mist_step', name: '雲霧步', element: '水', type: 'positive', tier: 1, baseDamage: 0, effect: { dodge: 1 }, desc: '腳步如霧，難以捉摸' },
  
  // ===== 稀有級 (Tier 2) - 中期較強 =====
  { id: 'needle_rain', name: '暴雨梨花', element: '金', type: 'positive', tier: 2, baseDamage: 22, effect: { bleed: 1 }, desc: '暗器如暴雨般傾瀉' },
  { id: 'golden_bell', name: '金鐘罩', element: '金', type: 'positive', tier: 2, baseDamage: 15, effect: { shield: 2 }, desc: '體表形成金鐘護罩' },
  { id: 'heavenly_flowers', name: '天女散花', element: '木', type: 'positive', tier: 2, baseDamage: 20, effect: { poison: 1 }, desc: '花瓣如利刃般切割' },
  { id: 'ice_palm', name: '寒冰掌', element: '水', type: 'positive', tier: 2, baseDamage: 20, effect: { freeze: 1 }, desc: '寒冰內力凝聚於掌間' },
  { id: 'blaze_sky', name: '烈焰焚天', element: '火', type: 'positive', tier: 2, baseDamage: 25, effect: { burn: 1 }, desc: '體內真氣化為烈焰' },
  { id: 'flame_armor', name: '赤焰甲', element: '火', type: 'positive', tier: 2, baseDamage: 12, effect: { reflect: 1 }, desc: '赤焰纏身，攻擊者必受反噬' },
  { id: 'rejuvenation', name: '回春術', element: '木', type: 'positive', tier: 2, baseDamage: 0, effect: { heal: 30 }, desc: '以內力催動生機，恢復生命' },
  
  // ===== 史詩級 (Tier 3) - 極稀有，初期很難獲得 =====
  { id: 'flood_torrent', name: '洪水滔天', element: '水', type: 'positive', tier: 3, baseDamage: 35, effect: { splash: true }, desc: '洪水如千軍萬馬般奔騰' },
  { id: 'fire_lotus', name: '火蓮碎', element: '火', type: 'positive', tier: 3, baseDamage: 40, effect: { selfDamage: 10 }, desc: '凝聚全身功力於一招' },
  { id: 'arhat_kick', name: '羅漢金剛腿', element: '土', type: 'positive', tier: 3, baseDamage: 38, effect: { armorBreak: true }, desc: '少林金剛腿，降魔衛道' },
  { id: 'wind_fire_blade', name: '風火燎原', element: '複合', type: 'positive', tier: 3, baseDamage: 45, effect: { burn: 2, stun: 1 }, desc: '風助火勢，火借風威' },
  { id: 'thunder_crash', name: '雷霆萬鈞', element: '複合', type: 'positive', tier: 3, baseDamage: 48, effect: { stun: 1, armorBreak: true }, desc: '九天神雷降世' },
  { id: 'rock_trap', name: '落石陷阱', element: '土', type: 'positive', tier: 2, baseDamage: 22, effect: { missNext: 1 }, desc: '引動山石，從天而降' },
  { id: 'quicksand', name: '流沙陣', element: '土', type: 'positive', tier: 2, baseDamage: 18, effect: { slow: 2 }, desc: '以氣功引動流沙' }
];

// ============== 反派招式（17招）- 平衡版 + 等級分類 ==============
const NEGATIVE_MOVES = [
  // ===== 普通級 (Tier 1) - 初期孵化常見 =====
  // 暗系
  { id: 'shadow_slash', name: '暗影劈', element: '暗', type: 'negative', tier: 1, baseDamage: 10, effect: {}, desc: '黑暗中突襲' },
  { id: 'shadow_lock', name: '無形鎖脈', element: '暗', type: 'negative', tier: 1, baseDamage: 8, effect: { bind: 1 }, desc: '暗中偷襲，封住敵人穴道' },
  { id: 'fear_presence', name: '懼意籠罩', element: '暗', type: 'negative', tier: 1, baseDamage: 0, effect: { fear: 1 }, desc: '散發恐懼氣息' },
  
  // 毒系
  { id: 'spider_silk', name: '蛛絲縛魂', element: '毒', type: 'negative', tier: 1, baseDamage: 7, effect: { trap: 1 }, desc: '以毒蛛絲纏繞敵人' },
  { id: 'minor_poison', name: '小毒散', element: '毒', type: 'negative', tier: 1, baseDamage: 9, effect: { poison: 1 }, desc: '基礎毒藥' },
  { id: 'curse_word', name: '咒言術', element: '暗', type: 'negative', tier: 1, baseDamage: 6, effect: { confuse: 1 }, desc: '口中唸唸有詞詛咒敵人' },
  
  // ===== 稀有級 (Tier 2) - 中期較強 =====
  { id: 'soul_drain', name: '吸星大法', element: '暗', type: 'negative', tier: 2, baseDamage: 18, effect: { drain: 15 }, desc: '以詭異內功吸取敵人精華' },
  { id: 'soul_scatter', name: '離魂散', element: '暗', type: 'negative', tier: 2, baseDamage: 20, effect: { confuse: 2 }, desc: '以迷藥散播恐懼' },
  { id: 'seven_step_poison', name: '七步斷腸散', element: '毒', type: 'negative', tier: 2, baseDamage: 16, effect: { poison: 2 }, desc: '武林第一毒藥' },
  { id: 'bone_dissolver', name: '化骨水', element: '毒', type: 'negative', tier: 2, baseDamage: 25, effect: { defenseDown: 2 }, desc: '腐蝕一切，骨骼盡化' },
  { id: 'hot_sand_hell', name: '熱砂地獄', element: '火毒', type: 'negative', tier: 2, baseDamage: 22, effect: { slow: 2, burn: 1 }, desc: '滾燙沙粒如刀刃' },
  { id: 'plague_cloud', name: '瘟疫毒霧', element: '毒', type: 'negative', tier: 2, baseDamage: 18, effect: { spreadPoison: true }, desc: '釋放毒霧纏繞敵人' },
  
  // ===== 史詩級 (Tier 3) - 極稀有，初期很難獲得 =====
  { id: 'hell_fire', name: '地獄烈火', element: '火毒', type: 'negative', tier: 3, baseDamage: 32, effect: { burn: 2, poison: 1 }, desc: '地獄之火燃燒' },
  { id: 'explosive_pill', name: '爆炸信號彈', element: '火毒', type: 'negative', tier: 3, baseDamage: 38, effect: { selfDamage: 10 }, desc: '以毒火引爆' },
  { id: 'ghost_fire', name: '幽冥鬼火', element: '暗火', type: 'negative', tier: 3, baseDamage: 35, effect: { ignoreResistance: true }, desc: '鬼火纏身，無法熄滅' },
  { id: 'silver_snake', name: '金蛇纏絲', element: '暗金', type: 'negative', tier: 3, baseDamage: 28, effect: { bind: 2, dot: 3 }, desc: '金蛇飛舞，絲線纏繞' },
  { id: 'ice_toxin', name: '寒冰毒蛙', element: '水毒', type: 'negative', tier: 3, baseDamage: 26, effect: { freeze: 1, poison: 2 }, desc: '寒冰與毒液並存' },
  { id: 'mud_fire_lotus', name: '污泥火蓮', element: '水毒火', type: 'negative', tier: 3, baseDamage: 30, effect: { blind: 1, burn: 2 }, desc: '污泥覆蓋視線，火焰趁機焚身' },
  { id: 'ultimate_dark', name: '天魔解体大法', element: '暗', type: 'negative', tier: 3, baseDamage: 45, effect: { selfDamage: 20 }, desc: '燃燒生命換取毀滅力量' },
  { id: 'iron_thorn', name: '玄鐵荊棘', element: '金', type: 'negative', tier: 2, baseDamage: 22, effect: { thorns: 2 }, desc: '全身長出荊棘，傷敵一千自損八百' }
];

// ============== 初始技能 ==============
const INITIAL_MOVES = [
  { id: 'head_butt', name: '頭槌', element: '普通', type: 'normal', tier: 1, baseDamage: 8, effect: {}, desc: '寵物本能攻擊' },
  { id: 'flee', name: '逃跑', element: '普通', type: 'normal', tier: 1, baseDamage: 0, effect: { flee: true }, desc: '100%逃脫' }
];

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
    name: type === '正派' ? '俠寵蛋' : '魔寵蛋',
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
  
  const names = pet.type === '正派' 
    ? ['小白', '小青', '小俠', '俠仔', '阿正', '靈兒']
    : ['小黑', '小魔', '邪仔', '惡獸', '阿修', '夜影'];
  
  pet.name = names[Math.floor(Math.random() * names.length)];
  pet.appearance = `一隻剛孵化的${pet.type}寵物，模樣可愛，眼神${pet.type === '正派' ? '清澈' : '詭異'}`;
  
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
  pets[pet.id] = pet;
  fs.writeFileSync(PET_FILE, JSON.stringify(pets, null, 2));
}

function loadPet(playerId) {
  const pets = loadAllPets();
  return Object.values(pets).find(p => p.ownerId === playerId) || null;
}

function getPetById(petId) {
  const pets = loadAllPets();
  return pets[petId] || null;
}

function loadAllPets() {
  if (!fs.existsSync(PET_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PET_FILE, 'utf8'));
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
  savePet,
  loadPet,
  loadAllPets,
  getPetById
};
