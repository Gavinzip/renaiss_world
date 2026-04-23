const {
  getSkillChipPrefix,
  stripSkillChipPrefix: stripLocalizedSkillChipPrefix
} = require('../runtime/utils/global-language-resources');

function createPetChipUtils(deps = {}) {
  const {
    SKILL_CHIP_PREFIX = getSkillChipPrefix('zh-TW'),
    PROTECTED_MOVE_IDS = new Set(),
    PET_MOVE_LOADOUT_LIMIT = 5,
    PET,
    getDraftItemName = (item) => String(item || '').trim(),
    getAllPetSkillMoves = () => [],
    getPetMovePool = () => [],
    getPetAttackMoves = () => []
  } = deps;
  const LEGACY_MOVE_NAME_ALIASES = new Map([
    ['火蓮碎', '日核裂解']
  ]);

  function normalizeMoveNameKey(name = '') {
    return String(name || '')
      .replace(/\u3000/g, ' ')
      .replace(/[「」『』"'`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildMoveLookup() {
    const byId = new Map();
    const byNameKey = new Map();
    const allMoves = Array.isArray(getAllPetSkillMoves()) ? getAllPetSkillMoves() : [];
    for (const move of allMoves) {
      const moveId = String(move?.id || '').trim();
      const moveName = String(move?.name || '').trim();
      if (!moveId || !moveName) continue;
      if (!byId.has(moveId)) byId.set(moveId, move);
      const key = normalizeMoveNameKey(moveName);
      if (key && !byNameKey.has(key)) byNameKey.set(key, move);
    }
    for (const [legacyName, targetName] of LEGACY_MOVE_NAME_ALIASES.entries()) {
      const target = byNameKey.get(normalizeMoveNameKey(targetName));
      const legacyKey = normalizeMoveNameKey(legacyName);
      if (!target || !legacyKey || byNameKey.has(legacyKey)) continue;
      byNameKey.set(legacyKey, target);
    }
    return { byId, byNameKey };
  }

  const MOVE_LOOKUP = buildMoveLookup();

  function resolveMoveTemplate(input = {}) {
    const moveId = String(input?.moveId || '').trim();
    if (moveId && MOVE_LOOKUP.byId.has(moveId)) {
      return MOVE_LOOKUP.byId.get(moveId);
    }
    const moveName = normalizeMoveNameKey(input?.moveName || '');
    if (!moveName) return null;
    return MOVE_LOOKUP.byNameKey.get(moveName) || null;
  }

  function canonicalizeMoveName(name = '') {
    const template = resolveMoveTemplate({ moveName: name });
    if (template?.name) return String(template.name || '').trim();
    return normalizeMoveNameKey(name);
  }

  function stripSkillChipPrefix(name = '') {
    return stripLocalizedSkillChipPrefix(name);
  }

  function extractSkillChipMoveName(rawItem = null) {
    const name = getDraftItemName(rawItem);
    const rawMoveName = stripSkillChipPrefix(name);
    if (!rawMoveName) return '';
    return canonicalizeMoveName(rawMoveName);
  }

  function addSkillChipToInventory(player, moveName = '') {
    const normalized = canonicalizeMoveName(moveName);
    if (!normalized) return false;
    if (!Array.isArray(player.inventory)) player.inventory = [];
    player.inventory.unshift(`${SKILL_CHIP_PREFIX}${normalized}`);
    return true;
  }

  function consumeSkillChipFromInventory(player, moveName = '', options = {}) {
    const normalized = canonicalizeMoveName(moveName);
    if (!normalized || !Array.isArray(player?.inventory)) return false;
    const targetMove = resolveMoveTemplate({ moveId: options?.moveId, moveName: normalized });
    const targetMoveId = String(targetMove?.id || '').trim();
    const targetMoveName = canonicalizeMoveName(targetMove?.name || normalized);

    for (let i = 0; i < player.inventory.length; i++) {
      const itemName = getDraftItemName(player.inventory[i]);
      const extracted = stripSkillChipPrefix(itemName);
      if (!extracted) continue;
      const currentMove = resolveMoveTemplate({ moveName: extracted });
      const currentMoveId = String(currentMove?.id || '').trim();
      const currentMoveName = canonicalizeMoveName(currentMove?.name || extracted);

      if (targetMoveId) {
        if (currentMoveId !== targetMoveId) continue;
      } else if (currentMoveName !== targetMoveName) {
        continue;
      }

      player.inventory.splice(i, 1);
      return true;
    }
    return false;
  }

  function getLearnableSkillChipEntries(player, pet) {
    const allPool = getAllPetSkillMoves();
    const byName = new Map();
    for (const move of allPool) {
      const nameKey = normalizeMoveNameKey(move?.name || '');
      if (!nameKey || byName.has(nameKey)) continue;
      byName.set(nameKey, move);
    }
    for (const [legacyName, targetName] of LEGACY_MOVE_NAME_ALIASES.entries()) {
      const legacyKey = normalizeMoveNameKey(legacyName);
      const target = byName.get(normalizeMoveNameKey(targetName));
      if (!legacyKey || !target || byName.has(legacyKey)) continue;
      byName.set(legacyKey, target);
    }
    const petPoolIds = new Set(getPetMovePool(pet?.type).map((m) => String(m?.id || '').trim()).filter(Boolean));
    const learnedIds = new Set((Array.isArray(pet?.moves) ? pet.moves : []).map((m) => String(m?.id || '').trim()));
    const stats = new Map();
    for (const raw of Array.isArray(player?.inventory) ? player.inventory : []) {
      const moveName = extractSkillChipMoveName(raw);
      if (!moveName) continue;
      const move = byName.get(normalizeMoveNameKey(moveName));
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

  function getConfigurableAttackMoves(pet) {
    return getPetAttackMoves(pet).filter((m) => {
      const moveId = String(m?.id || '').trim();
      return moveId && !PROTECTED_MOVE_IDS.has(moveId);
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
      return { success: false, reason: '這招已經學過了。' };
    }

    const currentAttackMoves = getConfigurableAttackMoves(pet);
    if (currentAttackMoves.length >= PET_MOVE_LOADOUT_LIMIT) {
      return { success: false, reason: `上陣招式已滿 ${PET_MOVE_LOADOUT_LIMIT} 招，請先取消學習舊招。` };
    }

    const learned = typeof PET.learnMove === 'function' ? PET.learnMove(pet, moveId) : null;
    if (!learned?.success) {
      return { success: false, reason: learned?.reason || '學習失敗' };
    }

    const attackMoves = getConfigurableAttackMoves(pet);
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

    pet.activeMoveIds = attackMoves
      .map((m) => String(m?.id || '').trim())
      .filter(Boolean)
      .slice(0, PET_MOVE_LOADOUT_LIMIT);
    return {
      success: true,
      move: learned.move || moveTemplate,
      equipped: true,
      newlyLearned: true,
      replacedMoveName: ''
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
