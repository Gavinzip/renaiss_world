function createAdditionalPetUtils(deps = {}) {
  const {
    CORE,
    PET,
    getPetCapacityForUser = () => ({ availableSlots: 0, currentPets: 0, maxPets: 0 }),
    normalizePetElementCode = (v) => String(v || '水'),
    normalizePetName = (v) => String(v || '').trim(),
    rollStarterMoveForElement = () => null
  } = deps;

  function createAdditionalPetForPlayer(userId = '', element = '水', petName = '') {
    const playerId = String(userId || '').trim();
    const player = CORE.loadPlayer(playerId);
    if (!player) return { success: false, reason: '找不到角色。' };

    const capacity = getPetCapacityForUser(playerId);
    if (capacity.availableSlots <= 0) {
      return {
        success: false,
        reason: `寵物欄位已滿（${capacity.currentPets}/${capacity.maxPets}）。請先提升卡片 FMV。`
      };
    }

    const normalizedElement = normalizePetElementCode(element || '水');
    const finalPetName = normalizePetName(petName || '', normalizedElement);
    const selectedMove = rollStarterMoveForElement(normalizedElement);
    if (!selectedMove) {
      return { success: false, reason: '目前找不到可用招式池，請稍後再試。' };
    }

    const pet = PET.createPetEgg(playerId, normalizedElement);
    pet.hatched = true;
    pet.status = '正常';
    pet.waitingForName = false;
    pet.name = finalPetName;
    pet.reviveAt = null;
    pet.reviveTurnsRemaining = 0;
    pet.moves = [
      { ...PET.INITIAL_MOVES[0], currentProficiency: 0 },
      { ...PET.INITIAL_MOVES[1], currentProficiency: 0 },
      {
        id: selectedMove.id,
        name: selectedMove.name,
        element: selectedMove.element,
        tier: selectedMove.tier,
        type: 'elemental',
        baseDamage: selectedMove.baseDamage,
        effect: selectedMove.effect,
        desc: selectedMove.desc,
        currentProficiency: 0
      }
    ];
    PET.updateAppearance(pet);
    PET.savePet(pet);

    player.petElement = player.petElement || normalizedElement;
    CORE.savePlayer(player);

    const latest = getPetCapacityForUser(playerId);
    return {
      success: true,
      pet,
      selectedMove,
      capacity: latest
    };
  }

  return {
    createAdditionalPetForPlayer
  };
}

module.exports = {
  createAdditionalPetUtils
};

