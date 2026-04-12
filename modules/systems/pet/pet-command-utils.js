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

  function getMoveBreakdown(move = {}, pet = {}) {
    const rawBase = Math.max(0, Number(move?.baseDamage ?? move?.damage ?? 0));
    const attackBonus = Math.max(0, Math.floor(Math.max(0, Number(pet?.attack || 0)) * 0.2));
    const damage = BATTLE.calculatePlayerMoveDamage(move, {}, pet);
    const instant = Math.max(0, Number(damage?.instant || 0));
    const total = Math.max(0, Number(damage?.total || 0));
    const effect = move?.effect && typeof move.effect === 'object' ? move.effect : {};
    let secondTick = 0;
    if (Number(effect.burn || 0) >= 2) secondTick += Math.max(1, Math.floor(instant * 0.22));
    if (Number(effect.poison || 0) >= 2) secondTick += Math.max(1, Math.floor(instant * 0.16));
    if (Number(effect.trap || 0) >= 2) secondTick += Math.max(1, Math.floor(instant * 0.18));
    if (Number(effect.bleed || 0) >= 2) secondTick += Math.max(1, Math.floor(instant * 0.24));
    if (effect.spreadPoison) secondTick += Math.max(1, Math.floor(instant * 0.12));
    if (Number(effect.dot || 0) > 0) secondTick += Math.max(1, Number(effect.dot || 0));
    return { rawBase, attackBonus, instant, total, secondTick };
  }

  async function handlePet(interaction, user) {
    const pet = PET.loadPet(user.id);
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);

    if (!pet) {
      await interaction.reply({ content: '❌ 你還沒有寵物！', ephemeral: true });
      return;
    }

    const dmgInfo = pet.moves.map((m, i) => {
      const d = getMoveBreakdown(m, pet);
      const speed = getMoveSpeedValue(m);
      return `${i + 1}. **${m.name}** (${m.element}): ${format1(d.rawBase)}+${format1(d.attackBonus)}｜直${format1(d.instant)}/總${format1(d.total)}｜第2跳${format1(d.secondTick)}｜🚀${format1(speed)}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🐾 ${pet.name || '寵物'}`)
      .setColor(getPetElementColor(pet.type))
      .setDescription(`${pet.appearance}\n\n傷害公式：基礎 + 攻擊加成（攻擊加成 = ⌊ATK×0.2⌋）\n本寵 ATK ${format1(pet.attack)} → +${format1(Math.floor(Math.max(0, Number(pet.attack || 0)) * 0.2))}\n持續傷害顯示：第2跳預估值`)
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
