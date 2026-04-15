function createMovesSelectUtils(deps = {}) {
  const {
    CORE,
    PET,
    PROTECTED_MOVE_IDS = new Set(),
    PET_MOVE_LOADOUT_LIMIT = 5,
    SKILL_CHIP_PREFIX = '技能晶片：',
    getPetMovePool = () => [],
    getAllPetSkillMoves = () => [],
    consumeSkillChipFromInventory = () => false,
    addSkillChipToInventory = () => {},
    learnMoveFromChipForPet = () => ({ success: false }),
    getPetAttackMoves = () => [],
    normalizePetMoveLoadout = () => {},
    showMovesList = async () => {}
  } = deps;

  async function handleMovesSelectMenu(interaction, user, customId) {
    if (customId === 'moves_pet_select') {
      const petId = String(interaction.values?.[0] || '');
      await showMovesList(interaction, user, petId);
      return true;
    }

    if (customId === 'moves_learn_chip') {
      const raw = String(interaction.values?.[0] || '').trim();
      const idx = raw.indexOf('::');
      const petId = idx >= 0 ? raw.slice(0, idx) : '';
      const moveId = idx >= 0 ? raw.slice(idx + 2) : '';
      if (!petId || !moveId) {
        await interaction.reply({ content: '⚠️ 技能晶片資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return true;
      }

      const player = CORE.loadPlayer(user.id);
      const pet = PET.getPetById(petId);
      if (!player || !pet || pet.ownerId !== user.id) {
        await interaction.reply({ content: '⚠️ 找不到要操作的寵物或角色。', ephemeral: true }).catch(() => {});
        return true;
      }

      const petMovePool = Array.isArray(getPetMovePool(pet.type)) ? getPetMovePool(pet.type) : [];
      let moveTemplate = petMovePool.find((m) => String(m?.id || '').trim() === moveId) || null;
      if (!moveTemplate) {
        const allMoves = Array.isArray(getAllPetSkillMoves()) ? getAllPetSkillMoves() : [];
        moveTemplate = allMoves.find((m) => String(m?.id || '').trim() === moveId) || null;
      }
      if (!moveTemplate?.name) {
        await interaction.reply({ content: '⚠️ 找不到該技能模板，可能與寵物類型不符。', ephemeral: true }).catch(() => {});
        return true;
      }
      if (!petMovePool.some((m) => String(m?.id || '').trim() === moveId)) {
        await interaction.reply({ content: '⚠️ 這個技能不適用於目前寵物屬性，請改選同屬性技能晶片。', ephemeral: true }).catch(() => {});
        return true;
      }
      if ((Array.isArray(pet.moves) ? pet.moves : []).some((m) => String(m?.id || '').trim() === moveId)) {
        await showMovesList(interaction, user, pet.id, `ℹ️ ${moveTemplate.name} 已經學會，請直接在上陣欄配置。`);
        return true;
      }
      const configurableAttackCount = getPetAttackMoves(pet)
        .filter((m) => {
          const id = String(m?.id || '').trim();
          return id && !PROTECTED_MOVE_IDS.has(id);
        })
        .length;
      if (configurableAttackCount >= PET_MOVE_LOADOUT_LIMIT) {
        await showMovesList(
          interaction,
          user,
          pet.id,
          `⚠️ 上陣招式已滿 ${PET_MOVE_LOADOUT_LIMIT} 招，請先取消學習一招再學新技能。`
        );
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
          await showMovesList(interaction, user, latestPet.id, `已學習並上陣：${moveTemplate.name}`);
          return true;
        }
        console.warn(`[Moves][learn_chip] consume_failed user=${user.id} pet=${pet.id} moveId=${moveId} move=${moveTemplate.name}`);
        await showMovesList(interaction, user, pet.id, `⚠️ 背包內找不到「${SKILL_CHIP_PREFIX}${moveTemplate.name}」，已為你刷新清單。`);
        return true;
      }

      const learned = learnMoveFromChipForPet(pet, moveTemplate);
      if (!learned?.success) {
        addSkillChipToInventory(player, moveTemplate.name);
        CORE.savePlayer(player);
        console.warn(`[Moves][learn_chip] learn_failed user=${user.id} pet=${pet.id} moveId=${moveId} move=${moveTemplate.name} reason=${learned?.reason || '學習失敗'}`);
        await showMovesList(interaction, user, pet.id, `⚠️ ${learned?.reason || '學習失敗'}（已退回晶片）`);
        return true;
      }

      PET.savePet(pet);
      CORE.savePlayer(player);
      console.info(`[Moves][learn_chip] learned user=${user.id} pet=${pet.id} moveId=${moveId} move=${moveTemplate.name}`);
      const note = learned.replacedMoveName
        ? `（上陣名額已滿，已替換「${learned.replacedMoveName}」）`
        : '';
      await showMovesList(interaction, user, pet.id, `已學習並上陣：${moveTemplate.name} ${note}`.trim());
      return true;
    }

    if (customId === 'moves_unlearn_chip') {
      const raw = String(interaction.values?.[0] || '').trim();
      const idx = raw.indexOf('::');
      const petId = idx >= 0 ? raw.slice(0, idx) : '';
      const moveId = idx >= 0 ? raw.slice(idx + 2) : '';
      if (!petId || !moveId) {
        await interaction.reply({ content: '⚠️ 取消學習資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return true;
      }

      const player = CORE.loadPlayer(user.id);
      const pet = PET.getPetById(petId);
      if (!player || !pet || pet.ownerId !== user.id) {
        await interaction.reply({ content: '⚠️ 找不到要操作的寵物或角色。', ephemeral: true }).catch(() => {});
        return true;
      }

      const move = (Array.isArray(pet.moves) ? pet.moves : []).find((m) => String(m?.id || '').trim() === moveId) || null;
      if (!move) {
        await interaction.reply({ content: '⚠️ 這招不存在或已被移除。', ephemeral: true }).catch(() => {});
        return true;
      }
      if (PROTECTED_MOVE_IDS.has(String(move.id || '').trim())) {
        await interaction.reply({ content: '⚠️ 基礎招式不能取消學習。', ephemeral: true }).catch(() => {});
        return true;
      }

      const forgotten = typeof PET.forgetMove === 'function' ? PET.forgetMove(pet, moveId) : null;
      if (!forgotten?.success) {
        await interaction.reply({ content: `❌ ${forgotten?.reason || '取消學習失敗'}`, ephemeral: true }).catch(() => {});
        return true;
      }

      pet.activeMoveIds = (Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : [])
        .map((id) => String(id || '').trim())
        .filter((id) => id && id !== moveId);
      normalizePetMoveLoadout(pet, false);
      PET.savePet(pet);
      addSkillChipToInventory(player, forgotten?.move?.name || move.name);
      CORE.savePlayer(player);
      await showMovesList(interaction, user, pet.id, `已取消學習：${forgotten?.move?.name || move.name}（已退回技能晶片）`);
      return true;
    }

    if (customId === 'moves_assign') {
      const raw = String(interaction.values?.[0] || '').trim();
      const idx = raw.indexOf('::');
      const petId = idx >= 0 ? raw.slice(0, idx) : '';
      const pet = PET.getPetById(petId);
      if (!pet || pet.ownerId !== user.id) {
        await interaction.reply({ content: '⚠️ 找不到要設定的寵物。', ephemeral: true }).catch(() => {});
        return true;
      }
      await showMovesList(interaction, user, pet.id, 'ℹ️ 已改為自動上陣模式：已學會攻擊招式會自動攜帶；不想用請取消學習。');
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
