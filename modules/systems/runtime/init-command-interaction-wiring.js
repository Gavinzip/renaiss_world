const { createStartCommandUtils } = require('../routing/start-command-utils');
const { createPetCommandUtils } = require('../pet/pet-command-utils');
const { createMovesSelectUtils } = require('../pet/moves-select-utils');
const { createClaimPetInteractionUtils } = require('../pet/claim-pet-interaction-utils');
const { createMapSelectUtils } = require('../map/map-select-utils');
const { createMarketSelectUtils } = require('../market/market-select-utils');
const { createWalletInteractionUtils } = require('../player/wallet-interaction-utils');
const { createFriendInteractionUtils } = require('../social/friend-interaction-utils');

function initCommandInteractionWiring(deps = {}) {
  const {
    CORE,
    PET,
    BATTLE,
    ECON,
    MAIN_STORY,
    WALLET,
    ISLAND_STORY,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PROTECTED_MOVE_IDS,
    PET_MOVE_LOADOUT_LIMIT,
    SKILL_CHIP_PREFIX,
    createNewThread,
    resolvePlayerMainPet,
    ensurePlayerGenerationSchema,
    sendMainMenuToThread,
    setPlayerThread,
    t,
    getPlayerUILang,
    getPetElementColor,
    formatPetHpWithRecovery,
    format1,
    getMoveSpeedValue,
    getPetElementDisplayName,
    getPetMovePool,
    getAllPetSkillMoves,
    consumeSkillChipFromInventory,
    addSkillChipToInventory,
    learnMoveFromChipForPet,
    getPetAttackMoves,
    normalizePetMoveLoadout,
    showMovesList,
    getPetCapacityForUser,
    showClaimPetElementPanel,
    showClaimPetNameModal,
    normalizePetElementCode,
    normalizePetName,
    getPlayerTempData,
    setPlayerTempData,
    createAdditionalPetForPlayer,
    getLocationProfile,
    canFreeRoamCurrentRegion,
    ensurePlayerIslandState,
    getMapText,
    showIslandMap,
    parseMarketTypeFromCustomId,
    showPlayerMarketMenu,
    showWorldShopBuyPanel,
    showWorldShopSellModal,
    showWorldShopHaggleOffer,
    showWorldShopHaggleAllOffer,
    showWalletBindModal,
    handleWalletSyncNow,
    handleWalletBind,
    normalizeFriendId,
    createFriendRequest,
    getPlayerDisplayNameById,
    ensurePlayerFriendState
  } = deps;

  const START_COMMAND_UTILS = createStartCommandUtils({
    CORE,
    PET,
    MAIN_STORY,
    WALLET,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    createNewThread,
    resolvePlayerMainPet,
    ensurePlayerGenerationSchema,
    sendMainMenuToThread,
    setPlayerThread,
    t
  });
  const { handleStart } = START_COMMAND_UTILS;

  const PET_COMMAND_UTILS = createPetCommandUtils({
    PET,
    CORE,
    BATTLE,
    EmbedBuilder,
    getPlayerUILang,
    t,
    getPetElementColor,
    formatPetHpWithRecovery,
    format1,
    getMoveSpeedValue,
    getPetElementDisplayName
  });
  const { handlePet } = PET_COMMAND_UTILS;

  const MOVES_SELECT_UTILS = createMovesSelectUtils({
    CORE,
    PET,
    PROTECTED_MOVE_IDS,
    PET_MOVE_LOADOUT_LIMIT,
    SKILL_CHIP_PREFIX,
    getPetMovePool,
    getAllPetSkillMoves,
    consumeSkillChipFromInventory,
    addSkillChipToInventory,
    learnMoveFromChipForPet,
    getPetAttackMoves,
    normalizePetMoveLoadout,
    showMovesList
  });
  const { handleMovesSelectMenu } = MOVES_SELECT_UTILS;

  const CLAIM_PET_INTERACTION_UTILS = createClaimPetInteractionUtils({
    getPetCapacityForUser,
    showClaimPetElementPanel,
    showClaimPetNameModal,
    normalizePetElementCode,
    normalizePetName,
    getPetElementDisplayName,
    getPlayerTempData,
    setPlayerTempData,
    createAdditionalPetForPlayer
  });
  const { handleClaimPetInteractions } = CLAIM_PET_INTERACTION_UTILS;

  const MAP_SELECT_UTILS = createMapSelectUtils({
    CORE,
    ISLAND_STORY,
    getLocationProfile,
    canFreeRoamCurrentRegion,
    ensurePlayerIslandState,
    getPlayerUILang,
    getMapText,
    showIslandMap
  });
  const { handleMapRegionMoveSelect } = MAP_SELECT_UTILS;

  const MARKET_SELECT_UTILS = createMarketSelectUtils({
    CORE,
    ECON,
    parseMarketTypeFromCustomId,
    showPlayerMarketMenu,
    showWorldShopBuyPanel,
    showWorldShopSellModal,
    showWorldShopHaggleOffer,
    showWorldShopHaggleAllOffer
  });
  const { handleMarketSelectMenu } = MARKET_SELECT_UTILS;

  const WALLET_INTERACTION_UTILS = createWalletInteractionUtils({
    showWalletBindModal,
    handleWalletSyncNow,
    handleWalletBind
  });
  const { handleWalletInteractions } = WALLET_INTERACTION_UTILS;

  const FRIEND_INTERACTION_UTILS = createFriendInteractionUtils({
    CORE,
    normalizeFriendId,
    createFriendRequest,
    getPlayerDisplayNameById,
    ensurePlayerFriendState
  });
  const { handleFriendInteractions } = FRIEND_INTERACTION_UTILS;

  return {
    handleStart,
    handlePet,
    handleMovesSelectMenu,
    handleClaimPetInteractions,
    handleMapRegionMoveSelect,
    handleMarketSelectMenu,
    handleWalletInteractions,
    handleFriendInteractions
  };
}

module.exports = { initCommandInteractionWiring };
