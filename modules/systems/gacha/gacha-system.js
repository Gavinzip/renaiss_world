/**
 * 🎰 招式扭蛋系統 v2
 * - 移除保底
 * - 升級點數 = 開包次數（每包1點）
 * - 每點 = 1 HP，可分配給不同寵物
 */

const PET = require('../pet/pet-system');
const CORE = require('../../core/game-core');
const PET_MOVE_LOADOUT_LIMIT = 5;

function ensureAutoEquipOnLearn(pet, learnedMoveId) {
  if (!pet || !learnedMoveId) return false;
  const attackIds = (Array.isArray(pet.moves) ? pet.moves : [])
    .filter((m) => !(m?.effect && m.effect.flee))
    .map((m) => String(m?.id || '').trim())
    .filter(Boolean);
  if (!attackIds.includes(String(learnedMoveId))) return false;

  const existed = Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : [];
  const selected = [];
  for (const rawId of existed) {
    const id = String(rawId || '').trim();
    if (!id || selected.includes(id) || !attackIds.includes(id)) continue;
    selected.push(id);
    if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
  }

  if (selected.length === 0) {
    for (const id of attackIds) {
      if (id === String(learnedMoveId)) continue;
      selected.push(id);
      if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
    }
  }

  if (selected.length >= PET_MOVE_LOADOUT_LIMIT) return false;
  if (!selected.includes(String(learnedMoveId))) {
    selected.push(String(learnedMoveId));
  }
  pet.activeMoveIds = selected.slice(0, PET_MOVE_LOADOUT_LIMIT);
  return true;
}

// ============== 扭蛋配置 ==============
const GACHA_CONFIG = {
  singleCost: 100,      // 單抽 100 Rns = 1包
  tenPullCost: 900,     // 十連抽 900 Rns = 10包 (9折)
  
  // 每包 = 1 升級點數
  pointsPerPack: 1,
  hpPerPoint: 1   // 每點 = 1 HP
};

function ensurePlayerCodexSchema(player) {
  if (!player || typeof player !== 'object') return;
  if (!player.codex || typeof player.codex !== 'object') player.codex = {};
  if (!player.codex.drawnMoves || typeof player.codex.drawnMoves !== 'object') {
    player.codex.drawnMoves = {};
  }
  if (!Number.isFinite(Number(player.codex.drawTotalCount))) {
    player.codex.drawTotalCount = 0;
  }
  if (!Number.isFinite(Number(player.codex.lastDrawAt))) {
    player.codex.lastDrawAt = 0;
  }
}

function recordDrawMovesToCodex(player, draws = []) {
  ensurePlayerCodexSchema(player);
  if (!Array.isArray(draws) || draws.length === 0) return;
  const now = Date.now();
  const bucket = player.codex.drawnMoves;
  let addedCount = 0;
  for (const item of draws) {
    const move = item?.move;
    const moveId = String(move?.id || '').trim();
    if (!moveId) continue;
    const existing = bucket[moveId] && typeof bucket[moveId] === 'object' ? bucket[moveId] : {};
    const prevCount = Math.max(0, Number(existing.count || 0));
    bucket[moveId] = {
      id: moveId,
      name: String(move?.name || existing.name || moveId),
      tier: Math.max(1, Math.min(3, Number(move?.tier || item?.tier || existing.tier || 1))),
      element: String(move?.element || existing.element || '未知'),
      count: prevCount + 1,
      firstAt: prevCount > 0 ? Number(existing.firstAt || now) : now,
      lastAt: now
    };
    addedCount += 1;
  }
  if (addedCount > 0) {
    player.codex.drawTotalCount = Math.max(0, Number(player.codex.drawTotalCount || 0)) + addedCount;
    player.codex.lastDrawAt = now;
  }
}

// ============== 扭蛋抽招 ==============
function drawMovesCore(player, count = 1, options = {}) {
  const cost = Number(options.cost || 0);
  const grantPoints = options.grantPoints !== false;

  if (cost > 0) {
    if (player.stats.財富 < cost) {
      return { success: false, reason: `Rns不足！需要 ${cost} Rns，你只有 ${player.stats.財富} Rns` };
    }
    player.stats.財富 -= cost;
  }

  player.totalDraws = (player.totalDraws || 0) + count;
  const earnedPoints = grantPoints ? count * GACHA_CONFIG.pointsPerPack : 0;
  if (earnedPoints > 0) {
    player.upgradePoints = (player.upgradePoints || 0) + earnedPoints;
  }

  // 抽卡結果
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(drawSingleMove(player));
  }

  recordDrawMovesToCodex(player, results);
  
  // 計算總價值
  const totalValue = results.reduce((sum, r) => sum + getMoveValue(r.move), 0);
  
  CORE.savePlayer(player);
  
  return {
    success: true,
    draws: results,
    cost,
    totalValue,
    earnedPoints,
    currentPoints: player.upgradePoints || 0,
    totalDraws: player.totalDraws
  };
}

function drawMove(player, count = 1) {
  const cost = count === 10 ? GACHA_CONFIG.tenPullCost : GACHA_CONFIG.singleCost;
  return drawMovesCore(player, count, { cost, grantPoints: true });
}

function drawMoveFree(player, count = 1, options = {}) {
  return drawMovesCore(player, count, {
    cost: 0,
    grantPoints: options.grantPoints === true
  });
}

// 單抽（無保底）
function drawSingleMove(player) {
  const allMoves = [...PET.POSITIVE_MOVES, ...PET.NEGATIVE_MOVES];
  
  const roll = Math.random();
  
  let tier;
  if (roll < 0.05) {
    tier = 3; // 史詩 5%
  } else if (roll < 0.20) {
    tier = 2; // 稀有 15%
  } else {
    tier = 1; // 普通 80%
  }
  
  // 從對應 tier 選擇招式
  const tierMoves = allMoves.filter(m => m.tier === tier);
  const move = tierMoves[Math.floor(Math.random() * tierMoves.length)];
  
  return {
    move: {
      id: move.id,
      name: move.name,
      element: move.element,
      tier: move.tier,
      priority: Number(move.priority || 0),
      speed: Number(move.speed || 10),
      baseDamage: move.baseDamage,
      effect: move.effect,
      desc: move.desc
    },
    tier,
    tierName: tier === 3 ? '史詩' : tier === 2 ? '稀有' : '普通',
    tierEmoji: tier === 3 ? '🔮' : tier === 2 ? '💠' : '⚪'
  };
}

// 取得招式價值
function getMoveValue(move) {
  if (move.tier === 3) return 500;
  if (move.tier === 2) return 100;
  return 10;
}

// ============== 分配升級點數 ==============
// playerId: 玩家ID
// petId: 寵物ID（用於多寵物）
// amount: 點數（預設1點 = 1 HP）
function allocateUpgradePoint(playerId, petId, amount = 1) {
  const player = CORE.loadPlayer(playerId);
  if (!player) return { success: false, reason: '找不到玩家！' };
  const spend = Math.max(1, Math.floor(Number(amount || 1)));
  
  if (!player.upgradePoints || player.upgradePoints < spend) {
    return { success: false, reason: `升級點數不足！需要 ${spend} 點，你只有 ${player.upgradePoints || 0} 點` };
  }
  
  // 讀取寵物
  const pet = PET.getPetById(petId);
  if (!pet) {
    return { success: false, reason: '找不到寵物！' };
  }
  
  // 扣點
  player.upgradePoints -= spend;
  CORE.savePlayer(player);
  
  // 給 HP（每點 1 HP）；寫回時一律整數化，避免小數血量殘留。
  const hpGain = spend * GACHA_CONFIG.hpPerPoint;
  const baseMaxHp = Math.max(1, Math.round(Number(pet.maxHp || pet.hp || 100)));
  pet.maxHp = baseMaxHp + hpGain;
  pet.hp = pet.maxHp; // 滿血
  PET.savePet(pet);
  
  return { 
    success: true, 
    petName: pet.name,
    hpGain, 
    pointsUsed: spend,
    remaining: player.upgradePoints 
  };
}

// ============== 查看所有寵物（用於分配）=============
function getPlayerPetsWithAllocation(playerId) {
  const player = CORE.loadPlayer(playerId);
  const pets = PET.loadAllPets();
  const playerPets = Object.values(pets).filter(p => p.ownerId === playerId);
  
  return {
    pets: playerPets.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      level: p.level,
      hp: p.hp,
      maxHp: p.maxHp,
      attack: p.attack,
      moves: p.moves.map(m => `${m.name}${m.tier === 3 ? '🔮' : m.tier === 2 ? '💠' : '⚪'}`)
    })),
    upgradePoints: player?.upgradePoints || 0
  };
}

// ============== 計算玩家資產總值 ==============
function calculateTotalAssets(player) {
  let total = player.stats.財富 || 0;
  
  // 加上背包物品價值
  if (player.inventory) {
    total += player.inventory.length * 5;
  }
  
  // 加上寵物價值
  const pets = PET.loadAllPets();
  const playerPets = Object.values(pets).filter(p => p.ownerId === player.id);
  total += playerPets.length * 100;
  
  return total;
}

// ============== 顯示玩家檔案 ==============
function getPlayerProfile(player) {
  const assets = calculateTotalAssets(player);
  const pets = PET.loadAllPets();
  const playerPets = Object.values(pets).filter(p => p.ownerId === player.id);
  
  return {
    name: player.name,
    level: player.level,
    rns: player.stats.財富,
    totalAssets: assets,
    upgradePoints: player.upgradePoints || 0,
    totalDraws: player.totalDraws || 0,
    pets: playerPets.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      level: p.level,
      hp: p.hp,
      maxHp: p.maxHp,
      attack: p.attack,
      moves: p.moves.map(m => `${m.name}${m.tier === 3 ? '🔮' : m.tier === 2 ? '💠' : '⚪'}`)
    })),
    currentPets: playerPets.length
  };
}

// ============== 學習招式 ==============
function learnDrawnMove(playerId, moveData) {
  const pet = PET.loadPet(playerId);
  if (!pet) {
    return { success: false, reason: '沒有寵物！' };
  }
  
  if (pet.moves.find(m => m.id === moveData.id)) {
    return { success: false, reason: '已經學過這個招式了！' };
  }
  
  pet.moves.push({
    ...moveData,
    currentProficiency: 0
  });
  
  PET.savePet(pet);
  
  return { success: true, move: moveData };
}

// ============== 學習技能（並上陣）=============
function learnMoveForBattle(playerId, moveData) {
  const pet = PET.loadPet(playerId);
  if (!pet) {
    return { success: false, reason: '沒有寵物！' };
  }
  if (!moveData || typeof moveData !== 'object') {
    return { success: false, reason: '技能晶片資料錯誤！' };
  }

  const moveId = String(moveData.id || '').trim();
  if (!moveId) return { success: false, reason: '技能晶片缺少技能 ID。' };
  if (!Array.isArray(pet.moves)) pet.moves = [];

  let knownMove = pet.moves.find((m) => String(m?.id || '').trim() === moveId) || null;
  let newlyLearned = false;
  if (!knownMove) {
    knownMove = {
      ...moveData,
      currentProficiency: 0
    };
    pet.moves.push(knownMove);
    newlyLearned = true;
  }

  const attackIds = pet.moves
    .filter((m) => !(m?.effect && m.effect.flee))
    .map((m) => String(m?.id || '').trim())
    .filter(Boolean);
  const attackIdSet = new Set(attackIds);
  if (!attackIdSet.has(moveId)) {
    PET.savePet(pet);
    return {
      success: true,
      move: knownMove,
      newlyLearned,
      equipped: false,
      reason: '此技能無法上陣（可能為特殊技能）。'
    };
  }

  const current = Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : [];
  const selected = [];
  for (const rawId of current) {
    const id = String(rawId || '').trim();
    if (!id || selected.includes(id) || !attackIdSet.has(id)) continue;
    selected.push(id);
    if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
  }

  let replacedMoveName = '';
  if (!selected.includes(moveId)) {
    if (selected.length < PET_MOVE_LOADOUT_LIMIT) {
      selected.push(moveId);
    } else {
      const replacedId = String(selected[0] || '').trim();
      selected[0] = moveId;
      const replacedMove = pet.moves.find((m) => String(m?.id || '').trim() === replacedId);
      replacedMoveName = String(replacedMove?.name || '').trim();
    }
  }

  pet.activeMoveIds = selected.slice(0, PET_MOVE_LOADOUT_LIMIT);
  PET.savePet(pet);
  return {
    success: true,
    move: knownMove,
    newlyLearned,
    equipped: true,
    replacedMoveName
  };
}

// ============== 忘記招式 ==============
function forgetMove(playerId, moveId) {
  const pet = PET.loadPet(playerId);
  if (!pet) {
    return { success: false, reason: '沒有寵物！' };
  }
  
  const idx = pet.moves.findIndex(m => m.id === moveId);
  if (idx === -1) {
    return { success: false, reason: '沒有這個招式！' };
  }
  
  if (idx < 2) {
    return { success: false, reason: '不能忘記初始招式！' };
  }
  
  pet.moves.splice(idx, 1);
  PET.savePet(pet);
  
  return { success: true };
}

// ============== 初始化玩家美金轉換 ==============
// USD -> RNS (假設 1 USD = 100 RNS)
function convertUSDToRNS(player, usdAmount) {
  const rate = 100; // 1 USD = 100 RNS
  const gained = Math.floor(usdAmount * rate);
  
  player.stats.財富 = (player.stats.財富 || 0) + gained;
  player.usdConverted = true; // 只轉換一次
  CORE.savePlayer(player);
  
  return {
    usdAmount,
    rate,
    gained,
    newBalance: player.stats.財富
  };
}

module.exports = {
  GACHA_CONFIG,
  drawMove,
  drawMoveFree,
  allocateUpgradePoint,
  getPlayerPetsWithAllocation,
  calculateTotalAssets,
  getPlayerProfile,
  learnDrawnMove,
  learnMoveForBattle,
  forgetMove,
  convertUSDToRNS
};
