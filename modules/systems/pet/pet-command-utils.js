function createPetCommandUtils(deps = {}) {
  const {
    PET,
    CORE,
    BATTLE,
    EmbedBuilder,
    getPlayerUILang = () => 'zh-TW',
    t = (key) => key,
    getPetElementColor = () => 0x999999,
    formatPetHpWithRecovery = () => '0/0',
    format1 = (n) => String(n),
    getMoveSpeedValue = () => 0,
    getPetElementDisplayName = (v) => String(v || '')
  } = deps;

  async function handlePet(interaction, user) {
    const pet = PET.loadPet(user.id);
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);

    if (!pet) {
      await interaction.reply({ content: '❌ 你還沒有寵物！', ephemeral: true });
      return;
    }

    const dmgInfo = pet.moves.map((m, i) => {
      const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
      const speed = getMoveSpeedValue(m);
      return `${i + 1}. **${m.name}** (${m.element}): ${format1(d.total)}dmg｜🚀速度${format1(speed)}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🐾 ${pet.name || '寵物'}`)
      .setColor(getPetElementColor(pet.type))
      .setDescription(pet.appearance)
      .addFields(
        { name: t('hp', uiLang), value: formatPetHpWithRecovery(pet), inline: true },
        { name: t('atk', uiLang), value: String(pet.attack), inline: true },
        { name: t('def', uiLang), value: String(pet.defense), inline: true },
        { name: '📊 等級', value: String(pet.level), inline: true },
        { name: '🏷️ 屬性', value: getPetElementDisplayName(pet.type), inline: true }
      )
      .addFields({ name: '📜 招式', value: dmgInfo, inline: false });

    if (player) {
      embed.addFields(
        { name: t('hp', uiLang), value: `${player.stats.生命}/${player.maxStats.生命}`, inline: true },
        { name: t('gold', uiLang), value: String(player.stats.財富), inline: true },
        { name: '📍 位置', value: player.location, inline: true }
      );
    }

    await interaction.reply({ embeds: [embed] });
  }

  return {
    handlePet
  };
}

module.exports = {
  createPetCommandUtils
};

