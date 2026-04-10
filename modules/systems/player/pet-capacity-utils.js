function createPetCapacityUtils(deps = {}) {
  const {
    WALLET,
    getPlayerOwnedPets = () => []
  } = deps;

  function getPetCapacityForUser(playerId) {
    const ownerId = String(playerId || '').trim();
    if (!ownerId) {
      return { currentPets: 0, maxPets: 1, availableSlots: 1, cardFMV: 0, cardCount: 0 };
    }
    const walletData = WALLET?.getWalletData?.(ownerId) || {};
    const cardFMV = Math.max(0, Number(walletData.cardFMV || 0));
    const cardCount = Math.max(0, Number(walletData.cardCount || 0));
    const maxPets = Math.max(1, Number(WALLET?.getMaxPetsByFMV?.(cardFMV) || 1));
    const ownedPets = typeof getPlayerOwnedPets === 'function' ? getPlayerOwnedPets(ownerId) : [];
    const currentPets = Array.isArray(ownedPets) ? ownedPets.length : 0;
    return {
      currentPets,
      maxPets,
      availableSlots: Math.max(0, maxPets - currentPets),
      cardFMV,
      cardCount
    };
  }

  return {
    getPetCapacityForUser
  };
}

module.exports = {
  createPetCapacityUtils
};
