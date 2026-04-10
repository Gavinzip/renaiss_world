function createClaimPetUiUtils(deps = {}) {
  const {
    CORE,
    getPetCapacityForUser = () => ({ currentPets: 0, maxPets: 0, availableSlots: 0, cardFMV: 0, cardCount: 0 }),
    getPetElementDisplayName = (v) => String(v || ''),
    updateInteractionMessage = async () => {},
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
  } = deps;

  async function showClaimPetElementPanel(interaction, user, notice = '') {
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.update({ content: '❌ 找不到角色！', embeds: [], components: [] }).catch(() => {});
      return;
    }

    const capacity = getPetCapacityForUser(user.id);
    const embed = new EmbedBuilder()
      .setTitle('🐾 領取新寵物')
      .setColor(0x22c55e)
      .setDescription(
        `${notice ? `${notice}\n\n` : ''}` +
        `請先選擇要領取的寵物屬性。\n` +
        `目前欄位：${capacity.currentPets}/${capacity.maxPets}（可再領取 ${capacity.availableSlots} 隻）\n` +
        `卡片 FMV：$${capacity.cardFMV.toFixed(2)} USD（${capacity.cardCount} 張）`
      );

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('claim_new_pet_element_water').setLabel('💧 水屬性').setStyle(ButtonStyle.Primary).setDisabled(capacity.availableSlots <= 0),
      new ButtonBuilder().setCustomId('claim_new_pet_element_fire').setLabel('🔥 火屬性').setStyle(ButtonStyle.Danger).setDisabled(capacity.availableSlots <= 0),
      new ButtonBuilder().setCustomId('claim_new_pet_element_grass').setLabel('🌿 草屬性').setStyle(ButtonStyle.Success).setDisabled(capacity.availableSlots <= 0)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_profile').setLabel('💳 返回檔案').setStyle(ButtonStyle.Secondary)
    );
    const payload = { embeds: [embed], content: null, components: [row1, row2] };
    try {
      await updateInteractionMessage(interaction, payload);
    } catch (err) {
      console.error('[ClaimPet] show panel update failed:', err?.message || err);
      if (interaction?.message?.edit) {
        const edited = await interaction.message.edit(payload).then(() => true).catch(() => false);
        if (edited) return;
      }
      if (interaction?.channel?.send) {
        await interaction.channel.send(payload).catch(() => {});
      }
    }
  }

  async function showClaimPetNameModal(interaction, element = '水') {
    const modal = new ModalBuilder()
      .setCustomId('claim_new_pet_name_modal')
      .setTitle(`🐾 新寵物命名（${getPetElementDisplayName(element)}）`);

    const input = new TextInputBuilder()
      .setCustomId('claim_pet_name')
      .setLabel('寵物名字（可留空）')
      .setPlaceholder('例如：潮光、烈芯、森紋')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(20);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  return {
    showClaimPetElementPanel,
    showClaimPetNameModal
  };
}

module.exports = {
  createClaimPetUiUtils
};
