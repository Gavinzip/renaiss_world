const {
  getSkillChipPrefix,
  getSkillChipUiText,
  getMoveLocalization,
  formatSkillChipDisplay
} = require('../runtime/utils/global-language-resources');

function createMovesSelectUtils(deps = {}) {
  const {
    CORE,
    PET,
    PROTECTED_MOVE_IDS = new Set(),
    PET_MOVE_LOADOUT_LIMIT = 5,
    SKILL_CHIP_PREFIX = getSkillChipPrefix('zh-TW'),
    getPetMovePool = () => [],
    getAllPetSkillMoves = () => [],
    consumeSkillChipFromInventory = () => false,
    addSkillChipToInventory = () => {},
    learnMoveFromChipForPet = () => ({ success: false }),
    getPetAttackMoves = () => [],
    normalizePetMoveLoadout = () => {},
    showMovesList = async () => {}
  } = deps;

  async function replyEphemeral(interaction, content) {
    const payload = { content: String(content || ''), ephemeral: true };
    if (interaction?.deferred || interaction?.replied) {
      await interaction.followUp(payload).catch(() => {});
      return;
    }
    await interaction.reply(payload).catch(() => {});
  }

  async function handleMovesSelectMenu(interaction, user, customId) {
    if (customId === 'moves_pet_select') {
      const petId = String(interaction.values?.[0] || '');
      await showMovesList(interaction, user, petId);
      return true;
    }

    if (customId === 'moves_learn_chip') {
      const player = CORE.loadPlayer(user.id);
      const uiLang = player?.language || 'zh-TW';
      const chipText = getSkillChipUiText(uiLang);
      const raw = String(interaction.values?.[0] || '').trim();
      const idx = raw.indexOf('::');
      const petId = idx >= 0 ? raw.slice(0, idx) : '';
      const moveId = idx >= 0 ? raw.slice(idx + 2) : '';
      if (!petId || !moveId) {
        await replyEphemeral(interaction, chipText.invalidChipData);
        return true;
      }

      const pet = PET.getPetById(petId);
      if (!player || !pet || pet.ownerId !== user.id) {
        await replyEphemeral(interaction, chipText.missingActor);
        return true;
      }

      const petMovePool = Array.isArray(getPetMovePool(pet.type)) ? getPetMovePool(pet.type) : [];
      let moveTemplate = petMovePool.find((m) => String(m?.id || '').trim() === moveId) || null;
      if (!moveTemplate) {
        const allMoves = Array.isArray(getAllPetSkillMoves()) ? getAllPetSkillMoves() : [];
        moveTemplate = allMoves.find((m) => String(m?.id || '').trim() === moveId) || null;
      }
      if (!moveTemplate?.name) {
        await replyEphemeral(interaction, chipText.missingMoveTemplate);
        return true;
      }
      const moveLabel = getMoveLocalization(moveTemplate.id, moveTemplate.name, uiLang) || moveTemplate.name;
      if (!petMovePool.some((m) => String(m?.id || '').trim() === moveId)) {
        await replyEphemeral(interaction, chipText.wrongElement);
        return true;
      }
      if ((Array.isArray(pet.moves) ? pet.moves : []).some((m) => String(m?.id || '').trim() === moveId)) {
        await showMovesList(interaction, user, pet.id, chipText.alreadyLearned(moveLabel));
        return true;
      }
      const configurableAttackCount = getPetAttackMoves(pet)
        .filter((m) => {
          const id = String(m?.id || '').trim();
          return id && !PROTECTED_MOVE_IDS.has(id);
        })
        .length;
      if (configurableAttackCount >= PET_MOVE_LOADOUT_LIMIT) {
        await replyEphemeral(interaction, chipText.loadoutFull(PET_MOVE_LOADOUT_LIMIT));
        return true;
      }

      const consumed = consumeSkillChipFromInventory(player, moveTemplate.name, { moveId });
      const consumedByName = consumed || consumeSkillChipFromInventory(player, moveTemplate.name);
      if (!consumedByName) {
        const latestPet = PET.getPetById(pet.id);
        const alreadyLearned = latestPet
          && latestPet.ownerId === user.id
          && (Array.isArray(latestPet.moves) ? latestPet.moves : []).some((m) => String(m?.id || '').trim() === moveId);
        if (alreadyLearned) {
          console.warn(`[Moves][learn_chip] consume_miss_but_already_learned user=${user.id} pet=${pet.id} moveId=${moveId} move=${moveTemplate.name}`);
          await replyEphemeral(interaction, chipText.duplicateLearn(moveLabel));
          return true;
        }
        console.warn(`[Moves][learn_chip] consume_failed user=${user.id} pet=${pet.id} moveId=${moveId} move=${moveTemplate.name}`);
        await replyEphemeral(interaction, chipText.inventoryMissing(
          formatSkillChipDisplay(moveTemplate.id, moveTemplate.name, uiLang) || `${SKILL_CHIP_PREFIX}${moveTemplate.name}`
        ));
        return true;
      }

      const learned = learnMoveFromChipForPet(pet, moveTemplate);
      if (!learned?.success) {
        addSkillChipToInventory(player, moveTemplate.name);
        CORE.savePlayer(player);
        console.warn(`[Moves][learn_chip] learn_failed user=${user.id} pet=${pet.id} moveId=${moveId} move=${moveTemplate.name} reason=${learned?.reason || '學習失敗'}`);
        await replyEphemeral(interaction, chipText.learnFailed(learned?.reason || '學習失敗'));
        return true;
      }

      PET.savePet(pet);
      CORE.savePlayer(player);
      console.info(`[Moves][learn_chip] learned user=${user.id} pet=${pet.id} moveId=${moveId} move=${moveTemplate.name}`);
      const note = learned.replacedMoveName
        ? chipText.replaceNote(getMoveLocalization('', learned.replacedMoveName, uiLang) || learned.replacedMoveName)
        : '';
      await showMovesList(interaction, user, pet.id, chipText.learnSuccess(moveLabel, note));
      return true;
    }

    if (customId === 'moves_unlearn_chip') {
      const player = CORE.loadPlayer(user.id);
      const uiLang = player?.language || 'zh-TW';
      const chipText = getSkillChipUiText(uiLang);
      const raw = String(interaction.values?.[0] || '').trim();
      const idx = raw.indexOf('::');
      const petId = idx >= 0 ? raw.slice(0, idx) : '';
      const moveId = idx >= 0 ? raw.slice(idx + 2) : '';
      if (!petId || !moveId) {
        await replyEphemeral(interaction, chipText.invalidUnlearnData);
        return true;
      }

      const pet = PET.getPetById(petId);
      if (!player || !pet || pet.ownerId !== user.id) {
        await replyEphemeral(interaction, chipText.missingActor);
        return true;
      }

      const move = (Array.isArray(pet.moves) ? pet.moves : []).find((m) => String(m?.id || '').trim() === moveId) || null;
      if (!move) {
        await replyEphemeral(interaction, chipText.moveMissing);
        return true;
      }
      if (PROTECTED_MOVE_IDS.has(String(move.id || '').trim())) {
        await replyEphemeral(interaction, chipText.protectedMove);
        return true;
      }

      const forgotten = typeof PET.forgetMove === 'function' ? PET.forgetMove(pet, moveId) : null;
      if (!forgotten?.success) {
        await replyEphemeral(interaction, chipText.unlearnFailed(forgotten?.reason || '取消學習失敗'));
        return true;
      }

      pet.activeMoveIds = (Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : [])
        .map((id) => String(id || '').trim())
        .filter((id) => id && id !== moveId);
      normalizePetMoveLoadout(pet, false);
      PET.savePet(pet);
      addSkillChipToInventory(player, forgotten?.move?.name || move.name);
      CORE.savePlayer(player);
      await showMovesList(
        interaction,
        user,
        pet.id,
        chipText.unlearnSuccess(
          getMoveLocalization(forgotten?.move?.id || move.id, forgotten?.move?.name || move.name, uiLang) || forgotten?.move?.name || move.name
        )
      );
      return true;
    }

    if (customId === 'moves_assign') {
      const player = CORE.loadPlayer(user.id);
      const uiLang = player?.language || 'zh-TW';
      const chipText = getSkillChipUiText(uiLang);
      const raw = String(interaction.values?.[0] || '').trim();
      const idx = raw.indexOf('::');
      const petId = idx >= 0 ? raw.slice(0, idx) : '';
      const pet = PET.getPetById(petId);
      if (!pet || pet.ownerId !== user.id) {
        await replyEphemeral(interaction, chipText.missingPet);
        return true;
      }
      await showMovesList(interaction, user, pet.id, chipText.autoAssignEnabled);
      return true;
    }

    return false;
  }

  return {
    handleMovesSelectMenu
  };
}

module.exports = {
  createMovesSelectUtils
};
