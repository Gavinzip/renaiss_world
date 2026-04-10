function createClaimPetInteractionUtils(deps = {}) {
  const {
    getPetCapacityForUser = () => ({ availableSlots: 0, currentPets: 0, maxPets: 0 }),
    showClaimPetElementPanel = async () => {},
    showClaimPetNameModal = async () => {},
    normalizePetElementCode = (v) => String(v || '水'),
    normalizePetName = (v) => String(v || '').trim(),
    getPetElementDisplayName = (v) => String(v || ''),
    getPlayerTempData = () => null,
    setPlayerTempData = () => {},
    createAdditionalPetForPlayer = () => ({ success: false, reason: 'fail' })
  } = deps;

  async function handleClaimPetInteractions(interaction, user, customId) {
    if (customId === 'claim_new_pet_start') {
      await showClaimPetElementPanel(interaction, user);
      return true;
    }

    if (customId.startsWith('claim_new_pet_element_')) {
      const key = String(customId || '').replace('claim_new_pet_element_', '').trim();
      const element = key === 'fire' ? '火' : key === 'grass' ? '草' : '水';
      const capacity = getPetCapacityForUser(user.id);
      if (capacity.availableSlots <= 0) {
        await interaction.reply({
          content: `⚠️ 目前寵物欄位已滿（${capacity.currentPets}/${capacity.maxPets}）。`,
          ephemeral: true
        }).catch(() => {});
        return true;
      }
      setPlayerTempData(user.id, 'claimPetElement', element);
      await showClaimPetNameModal(interaction, element);
      return true;
    }

    if (customId === 'claim_new_pet_name_modal') {
      const element = normalizePetElementCode(getPlayerTempData(user.id, 'claimPetElement') || '水');
      const petName = normalizePetName(interaction.fields.getTextInputValue('claim_pet_name') || '', element);
      const outcome = createAdditionalPetForPlayer(user.id, element, petName);
      if (!outcome?.success) {
        await interaction.reply({ content: `❌ ${outcome?.reason || '領取失敗。'}`, ephemeral: true }).catch(() => {});
        return true;
      }
      setPlayerTempData(user.id, 'claimPetElement', null);
      const pet = outcome.pet;
      const move = outcome.selectedMove;
      const cap = outcome.capacity || getPetCapacityForUser(user.id);
      const msg =
        `✅ 已領取新寵物：**${pet.name}**（${getPetElementDisplayName(pet.type)}）\n` +
        `✨ 初始天賦：${move?.name || '未知'}\n` +
        `📦 目前寵物額度：${cap.currentPets}/${cap.maxPets}`;
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      return true;
    }

    return false;
  }

  return {
    handleClaimPetInteractions
  };
}

module.exports = {
  createClaimPetInteractionUtils
};
