function createPetChipUtils(deps = {}) {
  const {
    SKILL_CHIP_PREFIX = '技能晶片：',
    PROTECTED_MOVE_IDS = new Set(),
    PET_MOVE_LOADOUT_LIMIT = 5,
    PET,
    getDraftItemName = (item) => String(item || '').trim(),
    getAllPetSkillMoves = () => [],
    getPetMovePool = () => [],
    getPetAttackMoves = () => []
  } = deps;

  function extractSkillChipMoveName(rawItem = null) {
    const name = getDraftItemName(rawItem);
    if (!name.startsWith(SKILL_CHIP_PREFIX)) return '';
    return name.slice(SKILL_CHIP_PREFIX.length).trim();
  }

  function addSkillChipToInventory(player, moveName = '') {
    const normalized = String(moveName || '').trim();
    if (!normalized) return false;
    if (!Array.isArray(player.inventory)) player.inventory = [];
    player.inventory.unshift(`${SKILL_CHIP_PREFIX}${normalized}`);
    return true;
  }

  function consumeSkillChipFromInventory(player, moveName = '') {
    const normalized = String(moveName || '').trim();
    if (!normalized || !Array.isArray(player?.inventory)) return false;
    const target = `${SKILL_CHIP_PREFIX}${normalized}`;
    for (let i = 0; i < player.inventory.length; i++) {
      if (getDraftItemName(player.inventory[i]) !== target) continue;
      player.inventory.splice(i, 1);
      return true;
    }
    return false;
  }

  function getLearnableSkillChipEntries(player, pet) {
    const allPool = getAllPetSkillMoves();
    const byName = new Map(allPool.map((m) => [String(m?.name || '').trim(), m]));
    const petPoolIds = new Set(getPetMovePool(pet?.type).map((m) => String(m?.id || '').trim()).filter(Boolean));
    const learnedIds = new Set((Array.isArray(pet?.moves) ? pet.moves : []).map((m) => String(m?.id || '').trim()));
    const stats = new Map();
    for (const raw of Array.isArray(player?.inventory) ? player.inventory : []) {
      const moveName = extractSkillChipMoveName(raw);
      if (!moveName) continue;
      const move = byName.get(moveName);
      const key = move?.id ? String(move.id || '').trim() : `name::${moveName}`;
      const prev = stats.get(key) || {
        move: move || { id: '', name: moveName, element: '未知', tier: 0 },
        count: 0,
        canLearn: false,
        reason: '未知技能',
        learned: false
      };
      prev.count += 1;
      if (move?.id) {
        const moveId = String(move.id || '').trim();
        const learned = learnedIds.has(moveId);
        const sameFaction = petPoolIds.has(moveId);
        if (learned) {
          prev.canLearn = false;
          prev.reason = '已學會';
          prev.learned = true;
        } else if (!sameFaction) {
          prev.canLearn = false;
          prev.reason = '屬性不符';
          prev.learned = false;
        } else {
          prev.canLearn = true;
          prev.reason = '可學習';
          prev.learned = false;
        }
      }
      stats.set(key, prev);
    }
    return Array.from(stats.values()).sort((a, b) => {
      const canLearnDiff = Number(Boolean(b?.canLearn)) - Number(Boolean(a?.canLearn));
      if (canLearnDiff !== 0) return canLearnDiff;
      const tierDiff = Number(b?.move?.tier || 0) - Number(a?.move?.tier || 0);
      if (tierDiff !== 0) return tierDiff;
      return String(a?.move?.name || '').localeCompare(String(b?.move?.name || ''), 'zh-Hant');
    });
  }

  function getForgettablePetMoves(pet) {
    return (Array.isArray(pet?.moves) ? pet.moves : []).filter((m) => {
      const moveId = String(m?.id || '').trim();
      if (!moveId) return false;
      return !PROTECTED_MOVE_IDS.has(moveId);
    });
  }

  function learnMoveFromChipForPet(pet, moveTemplate) {
    if (!pet) return { success: false, reason: '找不到寵物資料。' };
    if (!moveTemplate || typeof moveTemplate !== 'object') {
      return { success: false, reason: '技能資料錯誤。' };
    }
    const moveId = String(moveTemplate.id || '').trim();
    if (!moveId) return { success: false, reason: '技能缺少 ID。' };
    if (!Array.isArray(pet.moves)) pet.moves = [];
    if (pet.moves.some((m) => String(m?.id || '').trim() === moveId)) {
      return { success: false, reason: '這招已經學過了，請直接到上陣欄勾選。' };
    }

    const learned = typeof PET.learnMove === 'function' ? PET.learnMove(pet, moveId) : null;
    if (!learned?.success) {
      return { success: false, reason: learned?.reason || '學習失敗' };
    }

    const attackMoves = getPetAttackMoves(pet);
    const attackIds = new Set(attackMoves.map((m) => String(m?.id || '').trim()).filter(Boolean));
    if (!attackIds.has(moveId)) {
      return {
        success: true,
        move: learned.move || moveTemplate,
        equipped: false,
        newlyLearned: true,
        replacedMoveName: ''
      };
    }

    const selected = [];
    for (const rawId of Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : []) {
      const id = String(rawId || '').trim();
      if (!id || selected.includes(id) || !attackIds.has(id)) continue;
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
        const replacedMove = attackMoves.find((m) => String(m?.id || '').trim() === replacedId);
        replacedMoveName = String(replacedMove?.name || '').trim();
      }
    }

    pet.activeMoveIds = selected.slice(0, PET_MOVE_LOADOUT_LIMIT);
    return {
      success: true,
      move: learned.move || moveTemplate,
      equipped: true,
      newlyLearned: true,
      replacedMoveName
    };
  }

  return {
    extractSkillChipMoveName,
    addSkillChipToInventory,
    consumeSkillChipFromInventory,
    getLearnableSkillChipEntries,
    getForgettablePetMoves,
    learnMoveFromChipForPet
  };
}

module.exports = {
  createPetChipUtils
};
