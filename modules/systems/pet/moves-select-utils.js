function createMovesSelectUtils(deps = {}) {
  const {
    CORE,
    PET,
    PROTECTED_MOVE_IDS = new Set(),
    PET_MOVE_LOADOUT_LIMIT = 5,
    SKILL_CHIP_PREFIX = '技能晶片：',
    getPetMovePool = () => [],
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

      const moveTemplate = getPetMovePool(pet.type).find((m) => String(m?.id || '').trim() === moveId) || null;
      if (!moveTemplate?.name) {
        await interaction.reply({ content: '⚠️ 找不到該技能模板，可能與寵物類型不符。', ephemeral: true }).catch(() => {});
        return true;
      }

      const consumed = consumeSkillChipFromInventory(player, moveTemplate.name);
      if (!consumed) {
        await interaction.reply({ content: `⚠️ 背包內找不到「${SKILL_CHIP_PREFIX}${moveTemplate.name}」。`, ephemeral: true }).catch(() => {});
        return true;
      }

      const learned = learnMoveFromChipForPet(pet, moveTemplate);
      if (!learned?.success) {
        addSkillChipToInventory(player, moveTemplate.name);
        CORE.savePlayer(player);
        await interaction.reply({ content: `❌ ${learned?.reason || '學習失敗'}（已退回晶片）`, ephemeral: true }).catch(() => {});
        return true;
      }

      PET.savePet(pet);
      CORE.savePlayer(player);
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
      const values = Array.isArray(interaction.values) ? interaction.values : [];
      if (values.length === 0) {
        await interaction.reply({ content: '⚠️ 請至少選擇 1 個招式。', ephemeral: true }).catch(() => {});
        return true;
      }

      const parsed = values.map((v) => {
        const idx = v.indexOf('::');
        if (idx < 0) return { petId: '', moveId: '' };
        return { petId: v.slice(0, idx), moveId: v.slice(idx + 2) };
      });
      const petId = String(parsed[0]?.petId || '');
      const moveIds = parsed.map((x) => String(x.moveId || '').trim()).filter(Boolean);
      if (!petId || moveIds.length === 0 || parsed.some((x) => x.petId !== petId)) {
        await interaction.reply({ content: '⚠️ 招式配置資料錯誤，請重新選擇。', ephemeral: true }).catch(() => {});
        return true;
      }

      const pet = PET.getPetById(petId);
      if (!pet || pet.ownerId !== user.id) {
        await interaction.reply({ content: '⚠️ 找不到要設定的寵物。', ephemeral: true }).catch(() => {});
        return true;
      }

      const attackMoves = getPetAttackMoves(pet);
      const allowedIds = new Set(attackMoves.map((m) => String(m.id || '')));
      const selected = [];
      for (const id of moveIds) {
        if (!allowedIds.has(id) || selected.includes(id)) continue;
        selected.push(id);
        if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
      }
      if (selected.length === 0) {
        await interaction.reply({ content: '⚠️ 請至少選擇 1 個可用攻擊招式。', ephemeral: true }).catch(() => {});
        return true;
      }

      pet.activeMoveIds = selected;
      PET.savePet(pet);
      const selectedNames = selected
        .map((id) => attackMoves.find((m) => String(m.id || '') === id)?.name || id)
        .join('、');
      await showMovesList(interaction, user, pet.id, `已為 ${pet.name} 設定上陣招式：${selectedNames}`);
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
