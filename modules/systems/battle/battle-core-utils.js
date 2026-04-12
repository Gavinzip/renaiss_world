const EQUIP = require('../equipment/equipment-fusion-agent');

function createBattleCoreUtils(deps = {}) {
  const {
    CORE,
    PET,
    BATTLE,
    getHumanCombatMove,
    getWaitCombatMove,
    PET_MOVE_LOADOUT_LIMIT = 5,
    BATTLE_ESTIMATE_MAX_TURNS = 16,
    BATTLE_ESTIMATE_SIMULATIONS = 100,
    getBattleFighterType,
    getMoveSpeedValue,
    getLocationProfile = () => null,
    normalizePetElementCode = (element) => String(element || '水')
  } = deps;

  function cloneStatusState(status) {
    if (!status || typeof status !== 'object') return {};
    const clone = { ...status };
    const keys = [
      'poison', 'burn', 'bleed', 'slow', 'fear', 'freeze', 'stun', 'bind',
      'shield', 'evade', 'blind', 'nextAttackMiss', 'entangle', 'rooted'
    ];
    for (const key of keys) {
      if (clone[key] == null || typeof clone[key] !== 'object') continue;
      clone[key] = { ...clone[key] };
    }
    return clone;
  }

  function clampInt(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(num)));
  }

  function buildHumanCombatant(player) {
    if (!player) return null;
    const equipBonus = EQUIP.getEquippedBonuses(player);
    const maxHpBase = Math.max(1, Number(player?.maxStats?.生命 || player?.stats?.生命 || 100));
    const maxHp = Math.max(1, maxHpBase + Math.max(0, Number(equipBonus.hp || 0)));
    const battleState = player?.battleState && typeof player.battleState === 'object'
      ? player.battleState
      : null;
    const humanState = battleState?.humanState && typeof battleState.humanState === 'object'
      ? battleState.humanState
      : null;
    const hpFromState = Number(humanState?.hp);
    const hpBase = Number.isFinite(hpFromState)
      ? Math.max(0, hpFromState)
      : Math.max(0, Number(player?.stats?.生命 || maxHpBase));
    const hp = hpBase <= 0
      ? 0
      : Math.max(0, Math.min(maxHp, hpBase + Math.max(0, Number(equipBonus.hp || 0))));
    return {
      id: `human_${String(player.id || '')}`,
      name: String(player.name || '冒險者'),
      hp,
      maxHp,
      attack: Math.max(1, 10 + Math.floor(Number(equipBonus.attack || 0))),
      defense: Math.max(0, Number(player?.stats?.防禦 || player?.maxStats?.防禦 || 0)),
      speed: Math.max(1, 20 + Math.floor(Number(equipBonus.speed || 0))),
      isHuman: true,
      status: cloneStatusState(humanState?.status)
    };
  }

  function resolvePlayerMainPet(player, options = {}) {
    const ownerId = String(player?.id || '').trim();
    const preferredId = String(options?.preferredPetId || '').trim();
    const preferBattle = Boolean(options?.preferBattle);
    const inBattleAllowDown = Boolean(options?.allowDownInBattle);
    const fallbackPet = options?.fallbackPet || null;

    if (!ownerId || typeof PET?.loadPet !== 'function') {
      return { pet: fallbackPet, changed: false };
    }

    const pool = typeof PET.getAllPetsByOwner === 'function'
      ? PET.getAllPetsByOwner(ownerId)
      : [PET.loadPet(ownerId)].filter(Boolean);

    if (!Array.isArray(pool) || pool.length === 0) {
      const pet = fallbackPet || PET.loadPet(ownerId) || null;
      return { pet, changed: false };
    }

    const canUse = (pet) => {
      if (!pet) return false;
      if (inBattleAllowDown) return true;
      const hp = Number(pet?.hp || 0);
      return hp > 0;
    };

    const byId = new Map();
    for (const pet of pool) {
      const id = String(pet?.id || '').trim();
      if (!id) continue;
      byId.set(id, pet);
    }

    const battleActiveId = preferBattle
      ? String(player?.battleState?.activePetId || '').trim()
      : '';
    const activeId = String(player?.activePetId || '').trim();
    const mainId = String(player?.mainPetId || '').trim();
    const fallbackId = String(fallbackPet?.id || '').trim();
    const candidates = [preferredId, battleActiveId, activeId, mainId, fallbackId]
      .filter((id, idx, arr) => id && arr.indexOf(id) === idx);

    let selected = null;
    for (const id of candidates) {
      const pet = byId.get(id);
      if (canUse(pet)) {
        selected = pet;
        break;
      }
    }

    if (!selected) {
      selected = pool.find((p) => Number(p?.hp || 0) > 0) || null;
    }
    if (!selected && inBattleAllowDown) {
      selected = candidates.map((id) => byId.get(id)).find(Boolean) || pool[0] || null;
    }
    if (!selected) {
      selected = fallbackPet && String(fallbackPet?.ownerId || '').trim() === ownerId
        ? fallbackPet
        : null;
    }

    let changed = false;
    const selectedId = String(selected?.id || '').trim();
    if (selectedId && player && typeof player === 'object') {
      if (String(player.activePetId || '').trim() !== selectedId) {
        player.activePetId = selectedId;
        changed = true;
      }
      if (String(player.mainPetId || '').trim() !== selectedId) {
        player.mainPetId = selectedId;
        changed = true;
      }
      if (preferBattle && player.battleState && typeof player.battleState === 'object') {
        if (String(player.battleState.activePetId || '').trim() !== selectedId) {
          player.battleState.activePetId = selectedId;
          changed = true;
        }
      }
    }

    return {
      pet: selected,
      changed
    };
  }

  function getBattlePetStateSnapshot(player, petId = '') {
    const key = String(petId || '').trim();
    const state = player?.battleState;
    if (!key || !state || typeof state !== 'object') return null;
    const petStates = state.petStates && typeof state.petStates === 'object' ? state.petStates : null;
    if (!petStates) return null;
    const raw = petStates[key];
    if (!raw || typeof raw !== 'object') return null;
    return {
      hp: Number(raw.hp || 0),
      status: cloneStatusState(raw.status)
    };
  }

  function setBattlePetStateSnapshot(player, petId = '', snapshot = {}) {
    const key = String(petId || '').trim();
    if (!player || !key || !snapshot || typeof snapshot !== 'object') return;
    if (!player.battleState || typeof player.battleState !== 'object') player.battleState = {};
    if (!player.battleState.petStates || typeof player.battleState.petStates !== 'object') {
      player.battleState.petStates = {};
    }
    player.battleState.petStates[key] = {
      hp: Number(snapshot.hp || 0),
      status: cloneStatusState(snapshot.status)
    };
  }

  function hasPetSwapBlockingStatus(status = {}) {
    const bindTurns = Number(status?.bind?.turns || 0);
    const rootedTurns = Number(status?.rooted?.turns || 0);
    const entangleTurns = Number(status?.entangle?.turns || 0);
    return bindTurns > 0 || rootedTurns > 0 || entangleTurns > 0;
  }

  function getBattleSwitchCandidates(player, currentPetId = '') {
    const ownerId = String(player?.id || '').trim();
    if (!ownerId || typeof PET?.getAllPetsByOwner !== 'function') return [];
    const currentId = String(currentPetId || '').trim();
    return PET.getAllPetsByOwner(ownerId)
      .filter((pet) => {
        const id = String(pet?.id || '').trim();
        if (!id || id === currentId) return false;
        return Number(pet?.hp || 0) > 0;
      })
      .map((pet) => ({
        id: String(pet.id || ''),
        name: String(pet.name || '寵物'),
        type: String(pet.type || ''),
        hp: Number(pet.hp || 0),
        maxHp: Number(pet.maxHp || 100)
      }));
  }

  function getActiveCombatant(player, pet) {
    const fighterType = typeof getBattleFighterType === 'function'
      ? getBattleFighterType(player, pet)
      : (CORE?.canPetFight?.(pet) ? 'pet' : 'player');
    if (fighterType === 'player') {
      return buildHumanCombatant(player);
    }
    if (!pet) return null;
    const equipBonus = EQUIP.getEquippedBonuses(player);
    const snapshot = getBattlePetStateSnapshot(player, pet.id);
    const hpBonus = Math.max(0, Math.floor(Number(equipBonus.hp || 0)));
    const maxHp = Math.max(1, Number(pet.maxHp || 100) + hpBonus);
    const hpRaw = snapshot ? Number(snapshot.hp || 0) : Number(pet.hp || 0);
    const hpWithBonus = hpRaw <= 0 ? 0 : (hpRaw + hpBonus);
    return {
      ...pet,
      hp: Math.max(0, Math.min(maxHp, hpWithBonus)),
      maxHp,
      attack: Math.max(1, Number(pet.attack || 0) + Math.floor(Number(equipBonus.attack || 0))),
      defense: Math.max(0, Number(pet.defense || 0)),
      speed: Math.max(1, Number(pet.speed || 20) + Math.floor(Number(equipBonus.speed || 0))),
      status: snapshot ? cloneStatusState(snapshot.status) : cloneStatusState(pet.status)
    };
  }

  function getPlayerOwnedPets(ownerId) {
    const id = String(ownerId || '').trim();
    if (!id || typeof PET?.getAllPetsByOwner !== 'function') return [];
    return PET.getAllPetsByOwner(id);
  }

  function isFleeLikeMove(move = null) {
    if (!move || typeof move !== 'object') return false;
    if (move?.effect && move.effect.flee) return true;
    const id = String(move?.id || '').trim().toLowerCase();
    const name = String(move?.name || '').trim().toLowerCase();
    const desc = String(move?.desc || '').trim().toLowerCase();
    if (id === 'flee' || id.includes('flee') || id.includes('escape')) return true;
    if (name === '逃跑' || name.includes('逃跑') || name.includes('flee') || name.includes('escape')) return true;
    if (desc.includes('逃脫') || desc.includes('逃跑') || desc.includes('flee') || desc.includes('escape')) return true;
    return false;
  }

  function getPetAttackMoves(pet) {
    return (pet?.moves || []).filter((m) => !isFleeLikeMove(m));
  }

  function getAllPetSkillMoves() {
    const merged = [];
    const seen = new Set();
    const pools = PET?.ELEMENT_MOVE_POOLS && typeof PET.ELEMENT_MOVE_POOLS === 'object'
      ? Object.values(PET.ELEMENT_MOVE_POOLS)
      : [];
    for (const pool of pools) {
      for (const move of Array.isArray(pool) ? pool : []) {
        const id = String(move?.id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(move);
      }
    }
    if (merged.length > 0) return merged;

    return [
      ...(Array.isArray(PET?.POSITIVE_MOVES) ? PET.POSITIVE_MOVES : []),
      ...(Array.isArray(PET?.NEGATIVE_MOVES) ? PET.NEGATIVE_MOVES : [])
    ];
  }

  function getPetMovePool(petType = '') {
    if (PET && typeof PET.getMovesByElement === 'function') {
      const pool = PET.getMovesByElement(petType);
      if (Array.isArray(pool) && pool.length > 0) return pool;
    }
    const normalized = CORE?.normalizePetElementCode ? CORE.normalizePetElementCode(petType) : String(petType || '');
    if (normalized === '火') return getAllPetSkillMoves().filter((m) => /火|焰|雷|熱|爆|熾|灼|炎/.test(String(m?.name || '')));
    if (normalized === '草') return getAllPetSkillMoves().filter((m) => /草|藤|孢|毒|根|棘|網|森/.test(String(m?.name || '')));
    return getAllPetSkillMoves().filter((m) => /水|潮|霧|冰|淨|流|凍|波/.test(String(m?.name || '')));
  }

  function normalizePetMoveLoadout(pet, persist = false) {
    if (!pet || !Array.isArray(pet.moves)) {
      return { activeMoveIds: [], activeMoves: [], changed: false };
    }

    let moveIdMutated = false;
    for (let i = 0; i < pet.moves.length; i++) {
      const move = pet.moves[i];
      if (!move || typeof move !== 'object') continue;
      const id = String(move.id || '').trim();
      if (id) continue;
      const seed = `${move.name || 'move'}_${i}`.replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fff-]/g, '');
      move.id = `legacy_${seed}_${i}`;
      moveIdMutated = true;
    }

    const attackMoves = getPetAttackMoves(pet);
    const attackIds = new Set(attackMoves.map((m) => String(m.id || '')));
    const rawSelected = Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : [];
    const selected = [];
    for (const rawId of rawSelected) {
      const id = String(rawId || '').trim();
      if (!id || selected.includes(id) || !attackIds.has(id)) continue;
      selected.push(id);
      if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
    }

    if (selected.length === 0) {
      for (const move of attackMoves) {
        const id = String(move.id || '').trim();
        if (!id || selected.includes(id)) continue;
        selected.push(id);
        if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
      }
    }

    const before = JSON.stringify(Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : []);
    const after = JSON.stringify(selected);
    const changed = before !== after || moveIdMutated;
    if (changed) {
      pet.activeMoveIds = selected;
      if (persist && typeof PET?.savePet === 'function') PET.savePet(pet);
    }

    const lookup = new Map(attackMoves.map((m) => [String(m.id || ''), m]));
    const activeMoves = selected.map((id) => lookup.get(id)).filter(Boolean);
    return { activeMoveIds: selected, activeMoves, changed };
  }

  function getCombatantMoves(combatant, pet) {
    if (!combatant) return [];
    if (combatant.isHuman) return [typeof getHumanCombatMove === 'function' ? getHumanCombatMove() : null].filter(Boolean);
    const normalized = normalizePetMoveLoadout(pet, false);
    if (normalized.activeMoves.length > 0) return normalized.activeMoves;
    return getPetAttackMoves(pet);
  }

  function persistCombatantState(player, pet, combatant) {
    if (!player || !combatant) return;
    const equipBonus = EQUIP.getEquippedBonuses(player);
    const hpBonus = Math.max(0, Math.floor(Number(equipBonus.hp || 0)));
    const statusSnapshot = cloneStatusState(combatant.status);
    if (combatant.isHuman) {
      const maxHp = Math.max(1, player?.maxStats?.生命 || 100);
      const baseHp = Math.max(0, Math.min(maxHp, Number(combatant.hp || 0) - hpBonus));
      player.stats.生命 = baseHp;
      if (player.battleState) {
        player.battleState.humanState = {
          hp: baseHp,
          status: statusSnapshot
        };
      }
      return;
    }
    const combatantPetId = String(combatant?.id || '').trim();
    let targetPet = null;
    if (combatantPetId && typeof PET?.getPetById === 'function') {
      const found = PET.getPetById(combatantPetId);
      if (found && String(found.ownerId || '') === String(player.id || '')) targetPet = found;
    }
    if (!targetPet && pet && String(pet?.ownerId || '') === String(player.id || '')) {
      targetPet = pet;
    }
    if (!targetPet) return;

    targetPet.hp = Math.max(0, Math.min(Number(targetPet.maxHp || 100), Number(combatant.hp || 0) - hpBonus));
    if (player.battleState) {
      setBattlePetStateSnapshot(player, targetPet.id, {
        hp: targetPet.hp,
        status: statusSnapshot
      });
    }
    return targetPet;
  }

  function cloneCombatantForEstimate(combatant) {
    if (!combatant) return null;
    return {
      ...combatant,
      hp: Number(combatant.hp || 1),
      maxHp: Number(combatant.maxHp || combatant.hp || 1),
      defense: Math.max(0, Number(combatant.defense || 0)),
      attack: Number(combatant.attack || 0),
      status: cloneStatusState(combatant.status)
    };
  }

  function cloneEnemyForEstimate(enemy) {
    if (!enemy) return null;
    return {
      ...enemy,
      hp: Number(enemy.hp || 1),
      maxHp: Number(enemy.maxHp || enemy.hp || 1),
      defense: Math.max(0, Number(enemy.defense || 0)),
      attack: Number(enemy.attack || 10),
      moves: Array.isArray(enemy.moves) ? [...enemy.moves] : [],
      status: cloneStatusState(enemy.status)
    };
  }

  function estimateDefenseForMoveScoring(target = {}, move = null) {
    const effect = move?.effect && typeof move.effect === 'object' ? move.effect : {};
    const ignoreDefense = Boolean(effect.ignoreResistance);
    if (ignoreDefense) return 0;

    let defense = Math.max(0, Math.floor(Number(target?.defense || 0)));
    const defenseDownTurns = Math.max(0, Number(target?.status?.defenseDown || 0));
    if (defenseDownTurns > 0) {
      const reductionRate = Math.min(0.55, defenseDownTurns * 0.18);
      defense = Math.max(0, Math.floor(defense * (1 - reductionRate)));
    }
    if (effect.armorBreak) defense = Math.max(0, Math.floor(defense * 0.35));
    return defense;
  }

  function estimateNetDamageForMoveScoring(move = null, player = null, attacker = null, target = null) {
    const dmg = BATTLE.calculatePlayerMoveDamage(move, player, attacker);
    const instant = Math.max(0, Number(dmg?.instant || 0));
    const overTime = Math.max(0, Number(dmg?.overTime || 0));
    const defense = estimateDefenseForMoveScoring(target, move);
    const instantNet = instant > 0 ? Math.max(1, instant - defense) : 0;
    return instantNet + overTime * 0.72;
  }

  function simulateBattleOnceForEstimate(player, pet, enemy, fighterType = null) {
    const resolvedType = fighterType || (typeof getBattleFighterType === 'function' ? getBattleFighterType(player, pet) : 'pet');
    const baseCombatant = resolvedType === 'player' ? buildHumanCombatant(player) : getActiveCombatant(player, pet);
    const combatant = cloneCombatantForEstimate(baseCombatant);
    const targetEnemy = cloneEnemyForEstimate(enemy);
    if (!combatant || !targetEnemy) {
      return { win: false, rounds: 0, totalPlayerDamage: 0, totalEnemyDamage: 0 };
    }

    const simulationPlayer = {
      ...player,
      id: `sim_${player?.id || 'player'}`,
      stats: { ...(player?.stats || {}) }
    };

    let rounds = 0;
    let totalPlayerDamage = 0;
    let totalEnemyDamage = 0;
    let energy = 2;

    for (let turn = 1; turn <= BATTLE_ESTIMATE_MAX_TURNS; turn++) {
      rounds = turn;
      const bestMove = pickBestMoveForAI(player, pet, targetEnemy, combatant, energy);
      const selectedMove = bestMove || (typeof getWaitCombatMove === 'function' ? getWaitCombatMove() : null);
      if (!selectedMove) break;
      const moveCost = bestMove ? BATTLE.getMoveEnergyCost(bestMove) : 0;
      const enemyMove = BATTLE.enemyChooseMove(targetEnemy);
      const enemyHpBefore = targetEnemy.hp;
      const playerHpBefore = combatant.hp;

      const roundResult = BATTLE.executeBattleRound(
        simulationPlayer,
        combatant,
        targetEnemy,
        selectedMove,
        enemyMove,
        { dryRun: true }
      );

      totalPlayerDamage += Math.max(0, enemyHpBefore - targetEnemy.hp);
      totalEnemyDamage += Math.max(0, playerHpBefore - combatant.hp);
      energy = Math.max(0, energy - moveCost) + 2;

      if (roundResult.victory === true || targetEnemy.hp <= 0) {
        return { win: true, rounds, totalPlayerDamage, totalEnemyDamage };
      }
      if (roundResult.victory === false || combatant.hp <= 0) {
        return { win: false, rounds, totalPlayerDamage, totalEnemyDamage };
      }
    }

    return {
      win: combatant.hp >= targetEnemy.hp,
      rounds,
      totalPlayerDamage,
      totalEnemyDamage
    };
  }

  function estimateBattleOutcome(player, pet, enemy, fighterType = null, options = {}) {
    const resolvedType = fighterType || (typeof getBattleFighterType === 'function' ? getBattleFighterType(player, pet) : 'pet');
    const combatant = resolvedType === 'player' ? buildHumanCombatant(player) : getActiveCombatant(player, pet);
    const moves = getCombatantMoves(combatant, pet);
    if (moves.length === 0) {
      return {
        fighterName: combatant?.name || '冒險者',
        fighterType: resolvedType,
        avgPlayerDamage: 0,
        enemyDamage: Math.max(1, Number(enemy?.attack || 10)),
        turnsToWin: BATTLE_ESTIMATE_MAX_TURNS,
        turnsToLose: 2,
        winRate: 0,
        rank: '高風險',
        simulations: 0
      };
    }

    const requestedSimulationCount = Number(options?.simulationCount);
    const simulationCount = Number.isFinite(requestedSimulationCount)
      ? Math.max(12, Math.min(BATTLE_ESTIMATE_SIMULATIONS, Math.floor(requestedSimulationCount)))
      : BATTLE_ESTIMATE_SIMULATIONS;
    let wins = 0;
    let totalPlayerDamage = 0;
    let totalEnemyDamage = 0;
    let totalRounds = 0;
    let winTurnsTotal = 0;
    let loseTurnsTotal = 0;
    let lossCount = 0;

    for (let i = 0; i < simulationCount; i++) {
      const sim = simulateBattleOnceForEstimate(player, pet, enemy, resolvedType);
      totalPlayerDamage += sim.totalPlayerDamage;
      totalEnemyDamage += sim.totalEnemyDamage;
      totalRounds += Math.max(1, sim.rounds || 1);
      if (sim.win) {
        wins += 1;
        winTurnsTotal += Math.max(1, sim.rounds || 1);
      } else {
        lossCount += 1;
        loseTurnsTotal += Math.max(1, sim.rounds || 1);
      }
    }

    const winRate = Math.max(0, Math.min(100, Math.round((wins / simulationCount) * 100)));
    const avgPlayerDamage = Math.max(1, Math.floor(totalPlayerDamage / Math.max(1, totalRounds)));
    const enemyDamage = Math.max(1, Math.floor(totalEnemyDamage / Math.max(1, totalRounds)));
    const turnsToWin = wins > 0
      ? Math.max(1, Math.round(winTurnsTotal / wins))
      : BATTLE_ESTIMATE_MAX_TURNS;
    const turnsToLose = lossCount > 0
      ? Math.max(1, Math.round(loseTurnsTotal / lossCount))
      : BATTLE_ESTIMATE_MAX_TURNS + 1;

    let rank = '高風險';
    if (winRate >= 75) rank = '高機率獲勝';
    else if (winRate >= 55) rank = '五五開';

    return {
      fighterName: combatant.name,
      fighterType: resolvedType,
      avgPlayerDamage,
      enemyDamage,
      turnsToWin,
      turnsToLose,
      winRate,
      rank,
      simulations: simulationCount
    };
  }

  function pickBestMoveForAI(player, pet, enemy, combatant = null, availableEnergy = Number.POSITIVE_INFINITY) {
    const activeCombatant = combatant || getActiveCombatant(player, pet);
    const candidateMoves = getCombatantMoves(activeCombatant, pet).filter((move) => !isFleeLikeMove(move));
    if (candidateMoves.length === 0) return null;

    const affordableMoves = candidateMoves.filter((move) => BATTLE.getMoveEnergyCost(move) <= availableEnergy);
    if (affordableMoves.length === 0) return null;

    let best = affordableMoves[0];
    let bestScore = -1;
    for (const move of affordableMoves) {
      const cost = BATTLE.getMoveEnergyCost(move);
      const moveSpeed = typeof getMoveSpeedValue === 'function' ? getMoveSpeedValue(move) : 10;
      const netDamage = Math.max(1, estimateNetDamageForMoveScoring(move, player, activeCombatant, enemy));
      const killBonus = (enemy?.hp || 0) <= netDamage ? 120 : 0;
      const efficiencyBonus = Math.max(0, 4 - cost) * 2;
      const speedBonus = (moveSpeed - 10) * 0.4;
      const score = netDamage + killBonus + efficiencyBonus + speedBonus;
      if (score > bestScore) {
        best = move;
        bestScore = score;
      }
    }
    return best;
  }

  function getLocationDifficultyForPlayer(player) {
    const profile = typeof getLocationProfile === 'function'
      ? getLocationProfile(player?.location)
      : null;
    const difficulty = Number(profile?.difficulty || 3);
    return Number.isFinite(difficulty) ? difficulty : 3;
  }

  function isLikelyHumanoidEnemyName(name = '') {
    const n = String(name || '').trim();
    if (!n) return false;
    const explicitMonster = /(哥布林|狼人|殭屍|飛龍|地精|鼠王|怪|獸|骸骨|魔|鬼|龍|鳳)/u;
    if (explicitMonster.test(n)) return false;
    const humanoid = /(人物|斥候|刺客|巡行|商人|學徒|伏擊者|旅人|隊長|試煉者|護衛|士兵|盜匪|殺手)/u;
    return humanoid.test(n);
  }

  function resolveEnemyIsMonster(sourceEnemy, fallbackName = '') {
    if (typeof sourceEnemy?.isMonster === 'boolean') return sourceEnemy.isMonster;
    const inferredHuman = isLikelyHumanoidEnemyName(sourceEnemy?.name || fallbackName);
    return !inferredHuman;
  }

  function buildNpcCompanionPet(enemy, player) {
    const existing = enemy?.companionPet;
    const difficulty = getLocationDifficultyForPlayer(player);
    const newbieZone = difficulty <= 2;
    const petNamePool = newbieZone
      ? ['街貓', '灰羽雀', '小山犬', '竹影狸']
      : ['影牙獵犬', '鐵羽鷹', '霧爪豹', '赤瞳狼'];
    const fallbackName = petNamePool[Math.floor(Math.random() * petNamePool.length)];

    const baseAttack = Number(existing?.attack || enemy?.attack || 10);
    const baseHp = Number(existing?.hp || existing?.maxHp || enemy?.maxHp || enemy?.hp || 50);

    const petAttack = newbieZone
      ? Math.max(7, Math.floor(baseAttack * 0.45))
      : Math.max(10, Math.floor(baseAttack * 0.52));
    const petHp = newbieZone
      ? Math.max(26, Math.floor(baseHp * 0.42))
      : Math.max(36, Math.floor(baseHp * 0.52));

    return {
      name: String(existing?.name || fallbackName),
      element: normalizePetElementCode(existing?.element || '水'),
      attack: petAttack,
      hp: petHp,
      maxHp: petHp,
      newbieScaled: newbieZone
    };
  }

  function applyNpcCompanionPet(enemy, player) {
    if (!enemy || enemy.isMonster) return enemy;
    if (enemy.companionPet === false) return enemy;
    if (enemy.name === '哥布林' || enemy.name === '狼人') return enemy;

    const npcPet = buildNpcCompanionPet(enemy, player);
    const newbieZone = getLocationDifficultyForPlayer(player) <= 2;
    const atkGain = Math.max(1, Math.floor(npcPet.attack * (newbieZone ? 0.6 : 0.68)));
    const hpGain = Math.max(1, Math.floor(npcPet.maxHp * (newbieZone ? 0.45 : 0.5)));

    enemy.npcPet = npcPet;
    enemy.attack = Math.max(1, Number(enemy.attack || 0) + atkGain);
    enemy.defense = Math.max(0, Number(enemy.defense || 0)) + Math.max(0, Math.floor(atkGain * 0.08));
    enemy.hp = Math.max(1, Number(enemy.hp || 1) + hpGain);
    enemy.maxHp = Math.max(enemy.hp, Number(enemy.maxHp || enemy.hp || 1) + hpGain);

    const petMoveName = `${npcPet.name} 協同攻擊`;
    const petMoveDamage = Math.max(1, Math.floor(npcPet.attack * 0.8));
    const hasPetMove = Array.isArray(enemy.moves) && enemy.moves.some((m) => {
      const name = typeof m === 'string' ? m : m?.name;
      return name === petMoveName;
    });
    if (!Array.isArray(enemy.moves)) enemy.moves = [];
    if (!hasPetMove) {
      enemy.moves.push({ name: petMoveName, damage: petMoveDamage, effect: {} });
    }

    return enemy;
  }

  function pickFallbackEnemyNamesByDifficulty(player) {
    const difficulty = getLocationDifficultyForPlayer(player);
    if (difficulty <= 1) return ['哥布林', '哥布林', '哥布林', '狼人'];
    if (difficulty === 2) return ['哥布林', '哥布林', '狼人', '狼人', '巫師學徒'];
    if (difficulty === 3) return ['狼人', '巫師學徒'];
    if (difficulty === 4) return ['巫師學徒', '殭屍'];
    return ['殭屍'];
  }

  function sanitizeInferredEnemyName(raw = '') {
    let name = String(raw || '').trim();
    if (!name) return '';
    name = name
      .replace(/[「」『』《》【】\[\]()（）]/g, '')
      .replace(/^(?:一名|一位|一個|一群|兩名|三名|四名|數名|多名|那名|這名|該名|那些|這些)/u, '')
      .replace(/(?:們|等人|之人|角色)$/u, '')
      .trim();
    if (!name) return '';
    if (name.length > 12) name = name.slice(0, 12);
    return name;
  }

  function inferEnemyNameFromText(text = '') {
    const source = String(text || '');
    if (!source) return '';

    const directPriority = [
      '覆面獵手',
      '蒙面殺手',
      '低價刺客',
      'Digital 斥候',
      '伏擊者',
      '可疑人物',
      '巫師學徒',
      '狼人',
      '哥布林',
      '殭屍'
    ];
    for (const keyword of directPriority) {
      if (source.includes(keyword)) return keyword;
    }

    const rolePattern = /([^\s，。；、（）()「」『』《》]{1,8}(?:殺手|獵手|斥候|伏擊者|可疑人物|刺客|盜匪|護衛|隊長|頭目|學徒|狼人|哥布林|殭屍))/gu;
    const roleMatches = Array.from(source.matchAll(rolePattern));
    if (roleMatches.length > 0) {
      const picked = roleMatches[roleMatches.length - 1]?.[1] || roleMatches[0]?.[1];
      const clean = sanitizeInferredEnemyName(picked);
      if (clean) return clean;
    }

    const actionPattern = /(?:對上|迎戰|衝向|攻擊|挑戰|攔下|追擊|阻止|擊退|對決|與)\s*([^\s，。；、（）()「」『』《》]{2,10})/gu;
    const actionMatches = Array.from(source.matchAll(actionPattern));
    if (actionMatches.length > 0) {
      const picked = actionMatches[actionMatches.length - 1]?.[1] || actionMatches[0]?.[1];
      const clean = sanitizeInferredEnemyName(picked);
      if (clean) return clean;
    }

    return '';
  }

  function inferEnemyNameFromContext(event, result) {
    const parts = [
      event?.name,
      event?.choice,
      event?.desc,
      result?.message
    ];
    for (const text of parts) {
      const inferred = inferEnemyNameFromText(text);
      if (inferred) return inferred;
    }
    return '';
  }

  function getBattleEnemyName(event, result, player = null, options = {}) {
    const explicit = result?.enemy?.name || event?.enemy?.name;
    if (explicit) return explicit;
    const inferred = inferEnemyNameFromContext(event, result);
    if (inferred) return inferred;
    const fallback = pickFallbackEnemyNamesByDifficulty(player);
    if (options?.deterministicFallback) return fallback[0];
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  function applyBeginnerZoneEnemyBalance(enemy, player) {
    if (!enemy || !player) return enemy;
    const difficulty = getLocationDifficultyForPlayer(player);
    const playerLevel = Math.max(1, Number(player?.level || 1));
    if (difficulty > 2 || playerLevel > 6) return enemy;

    const hpScale = difficulty <= 1 ? 1.08 : 1.12;
    const atkScale = difficulty <= 1 ? 1.10 : 1.14;
    const minHp = Math.max(56, 66 + playerLevel * 12 + difficulty * 7);
    const minAtk = Math.max(18, 22 + playerLevel * 2 + (difficulty - 1) * 3);
    const maxHp = difficulty <= 1
      ? Math.max(108, 126 + playerLevel * 14)
      : Math.max(146, 156 + playerLevel * 17);
    const maxAtk = difficulty <= 1
      ? Math.max(30, 36 + playerLevel * 3)
      : Math.max(36, 40 + playerLevel * 3);

    const scaledHp = Math.max(minHp, Math.floor((enemy.hp || 1) * hpScale));
    enemy.hp = Math.min(maxHp, scaledHp);
    enemy.maxHp = Math.min(maxHp, Math.max(enemy.hp, Math.floor((enemy.maxHp || scaledHp) * hpScale)));
    enemy.attack = Math.min(maxAtk, Math.max(minAtk, Math.floor((enemy.attack || 1) * atkScale)));
    enemy.defense = Math.max(0, Math.min(4, Math.floor(Number(enemy.defense || 0) + (difficulty <= 1 ? 1 : 2))));
    enemy.beginnerBalanced = true;
    return enemy;
  }

  function applyBeginnerZoneDangerVariant(enemy, player) {
    if (!enemy || !player) return enemy;
    const difficulty = getLocationDifficultyForPlayer(player);
    const playerLevel = Math.max(1, Number(player?.level || 1));
    if (difficulty > 2 || playerLevel > 8) return enemy;
    if (Math.random() > 0.26) return enemy;

    const powerScale = difficulty <= 1 ? 1.14 : 1.18;
    enemy.hp = Math.max(1, Math.floor((enemy.hp || 1) * powerScale));
    enemy.maxHp = Math.max(enemy.hp, Math.floor((enemy.maxHp || enemy.hp || 1) * powerScale));
    enemy.attack = Math.max(1, Math.floor((enemy.attack || 1) * (powerScale + 0.03)));
    enemy.defense = Math.max(0, Math.floor(Number(enemy.defense || 0) + (difficulty <= 1 ? 0 : 1)));
    enemy.beginnerDanger = true;
    return enemy;
  }

  function rollScale(min = 1, max = 1) {
    const lo = Number(min);
    const hi = Number(max);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 1;
    if (hi <= lo) return lo;
    return lo + Math.random() * (hi - lo);
  }

  function isApexEnemyName(name = '') {
    const text = String(name || '').trim();
    if (!text) return false;
    return /^(Nemo|Wolf|Adaloc|Hom)$/i.test(text) || /(四大天王|君主|裂體|風凰|巨蜥)/u.test(text);
  }

  function applyApexEnemyEscalation(enemy = null) {
    if (!enemy) return enemy;
    if (!isApexEnemyName(enemy?.name || enemy?.id)) return enemy;
    enemy.hp = Math.max(1, Math.floor(Number(enemy.hp || 1) * 1.22));
    enemy.maxHp = Math.max(enemy.hp, Math.floor(Number(enemy.maxHp || enemy.hp || 1) * 1.22));
    enemy.attack = Math.max(1, Math.floor(Number(enemy.attack || 1) * 1.18));
    enemy.defense = Math.max(0, Math.floor(Number(enemy.defense || 0) + 4));
    enemy.speed = Math.max(1, Math.floor(Number(enemy.speed || 10) + 1));
    enemy.apexScaled = true;
    return enemy;
  }

  function applyRegionalEnemyVariance(enemy, player) {
    if (!enemy || !player) return enemy;
    const difficulty = clampInt(getLocationDifficultyForPlayer(player), 1, 8, 3);
    const profile = {
      1: { hpMin: 1.03, hpMax: 1.10, atkMin: 1.05, atkMax: 1.12, defMin: 0, defMax: 1, speedShift: 1 },
      2: { hpMin: 1.05, hpMax: 1.12, atkMin: 1.07, atkMax: 1.14, defMin: 1, defMax: 2, speedShift: 1 },
      3: { hpMin: 1.04, hpMax: 1.12, atkMin: 1.06, atkMax: 1.14, defMin: 1, defMax: 3, speedShift: 1 },
      4: { hpMin: 1.05, hpMax: 1.14, atkMin: 1.08, atkMax: 1.16, defMin: 2, defMax: 4, speedShift: 2 },
      5: { hpMin: 1.07, hpMax: 1.16, atkMin: 1.10, atkMax: 1.18, defMin: 2, defMax: 5, speedShift: 2 },
      6: { hpMin: 1.08, hpMax: 1.17, atkMin: 1.11, atkMax: 1.20, defMin: 3, defMax: 6, speedShift: 2 },
      7: { hpMin: 1.10, hpMax: 1.20, atkMin: 1.12, atkMax: 1.22, defMin: 4, defMax: 7, speedShift: 3 },
      8: { hpMin: 1.12, hpMax: 1.22, atkMin: 1.14, atkMax: 1.24, defMin: 5, defMax: 8, speedShift: 3 }
    }[difficulty] || { hpMin: 1.05, hpMax: 1.12, atkMin: 1.07, atkMax: 1.14, defMin: 1, defMax: 3, speedShift: 1 };

    const hpScale = rollScale(profile.hpMin, profile.hpMax);
    const atkScale = rollScale(profile.atkMin, profile.atkMax);
    const defenseGain = clampInt(
      profile.defMin + Math.random() * (profile.defMax - profile.defMin + 1),
      0,
      profile.defMax,
      profile.defMin
    );
    const speedShift = clampInt(
      Math.round((Math.random() * 2 - 1) * profile.speedShift),
      -profile.speedShift,
      profile.speedShift,
      0
    );

    enemy.hp = Math.max(1, Math.floor(Number(enemy.hp || 1) * hpScale));
    enemy.maxHp = Math.max(enemy.hp, Math.floor(Number(enemy.maxHp || enemy.hp || 1) * hpScale));
    enemy.attack = Math.max(1, Math.floor(Number(enemy.attack || 1) * atkScale));
    enemy.defense = Math.max(0, Math.floor(Number(enemy.defense || 0) + defenseGain));
    enemy.speed = Math.max(1, Math.floor(Number(enemy.speed || 10) + speedShift));
    enemy.regionVariance = true;
    return enemy;
  }

  function buildEnemyForBattle(event, result, player, options = {}) {
    const level = Math.max(1, player?.level || 1);
    const requestedEnemyName = getBattleEnemyName(event, result, player, options);
    const base = BATTLE.createEnemy(requestedEnemyName, level);
    const sourceEnemy = result?.enemy || event?.enemy || {};
    const factionText = String(sourceEnemy?.faction || sourceEnemy?.side || '').toLowerCase();
    const explicitVillain = Boolean(
      sourceEnemy?.villain === true ||
      sourceEnemy?.isVillain === true ||
      /digital|chaos|dark|暗潮|反派|機變/u.test(factionText)
    );
    const enemyName = sourceEnemy.name || requestedEnemyName || base.name;
    const resolvedIsMonster = resolveEnemyIsMonster(sourceEnemy, enemyName);
    const hp = sourceEnemy.hp || sourceEnemy.maxHp || base.hp;
    const reward = sourceEnemy.reward || base.reward || { gold: [20, 40] };
    const rewardGold = Array.isArray(reward.gold) ? reward.gold : [20, 40];
    const enemy = {
      ...base,
      ...sourceEnemy,
      id: sourceEnemy.id || enemyName || base.name,
      name: enemyName,
      hp,
      maxHp: sourceEnemy.maxHp || hp,
      attack: sourceEnemy.attack || base.attack,
      defense: Math.max(0, Number(sourceEnemy.defense ?? base.defense ?? 0)),
      moves: BATTLE.buildEnemyMoveLoadout(
        enemyName,
        level,
        sourceEnemy.moves || base.moves || [],
        {
          villain: explicitVillain,
          attack: sourceEnemy.attack || base.attack || 12
        }
      ),
      reward: { ...reward, gold: rewardGold },
      isMonster: resolvedIsMonster,
      companionPet: sourceEnemy.companionPet,
      ignoreBeginnerBalance: Boolean(sourceEnemy.ignoreBeginnerBalance || base.ignoreBeginnerBalance),
      ignoreBeginnerDanger: Boolean(sourceEnemy.ignoreBeginnerDanger || base.ignoreBeginnerDanger)
    };
    applyNpcCompanionPet(enemy, player);
    const skipBalance = options?.skipBeginnerBalance || enemy.ignoreBeginnerBalance;
    const skipDanger = options?.skipBeginnerDanger || enemy.ignoreBeginnerDanger;
    if (!skipBalance) applyBeginnerZoneEnemyBalance(enemy, player);
    if (!skipDanger) applyBeginnerZoneDangerVariant(enemy, player);
    applyApexEnemyEscalation(enemy);
    applyRegionalEnemyVariance(enemy, player);
    return enemy;
  }

  return {
    cloneStatusState,
    buildHumanCombatant,
    resolvePlayerMainPet,
    getBattlePetStateSnapshot,
    setBattlePetStateSnapshot,
    hasPetSwapBlockingStatus,
    getBattleSwitchCandidates,
    getActiveCombatant,
    getPlayerOwnedPets,
    isFleeLikeMove,
    getPetAttackMoves,
    getAllPetSkillMoves,
    getPetMovePool,
    normalizePetMoveLoadout,
    getCombatantMoves,
    persistCombatantState,
    cloneCombatantForEstimate,
    cloneEnemyForEstimate,
    simulateBattleOnceForEstimate,
    estimateBattleOutcome,
    pickBestMoveForAI,
    getLocationDifficultyForPlayer,
    isLikelyHumanoidEnemyName,
    resolveEnemyIsMonster,
    buildNpcCompanionPet,
    applyNpcCompanionPet,
    pickFallbackEnemyNamesByDifficulty,
    sanitizeInferredEnemyName,
    inferEnemyNameFromText,
    inferEnemyNameFromContext,
    getBattleEnemyName,
    applyBeginnerZoneEnemyBalance,
    applyBeginnerZoneDangerVariant,
    buildEnemyForBattle
  };
}

module.exports = { createBattleCoreUtils };
