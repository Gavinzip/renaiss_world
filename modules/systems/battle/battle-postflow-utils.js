function createBattlePostflowUtils(deps = {}) {
  const CORE = deps.CORE;
  const PET = deps.PET;
  const EmbedBuilder = deps.EmbedBuilder;
  const ActionRowBuilder = deps.ActionRowBuilder;
  const ButtonBuilder = deps.ButtonBuilder;
  const ButtonStyle = deps.ButtonStyle;
  const sendBattleMessage = typeof deps.sendBattleMessage === 'function'
    ? deps.sendBattleMessage
    : (async () => {});
  const estimateBattleOutcome = typeof deps.estimateBattleOutcome === 'function'
    ? deps.estimateBattleOutcome
    : (() => ({ rank: '未知', winRate: 0 }));
  const rememberPlayer = typeof deps.rememberPlayer === 'function'
    ? deps.rememberPlayer
    : (() => {});
  const ensureBattleEnergyState = typeof deps.ensureBattleEnergyState === 'function'
    ? deps.ensureBattleEnergyState
    : (() => ({ energy: 2, turn: 1 }));
  const resolvePlayerMainPet = typeof deps.resolvePlayerMainPet === 'function'
    ? deps.resolvePlayerMainPet
    : ((_player, opts = {}) => ({ pet: opts.fallbackPet || null, changed: false }));
  const renderManualBattle = typeof deps.renderManualBattle === 'function'
    ? deps.renderManualBattle
    : (async () => {});
  const formatRecoveryTurnsShort = typeof deps.formatRecoveryTurnsShort === 'function'
    ? deps.formatRecoveryTurnsShort
    : ((v) => `${Number(v || 0)}回合`);
  const publishBattleWorldEvent = typeof deps.publishBattleWorldEvent === 'function'
    ? deps.publishBattleWorldEvent
    : (() => {});

  async function showTrueGameOver(interaction, user, detailText, mode = 'update') {
    const beforeReset = CORE.loadPlayer(user.id);
    const enemyName = String(beforeReset?.battleState?.enemy?.name || '敵人').trim();
    if (beforeReset) {
      publishBattleWorldEvent(
        beforeReset,
        enemyName,
        'player_down',
        String(detailText || '').replace(/\s+/g, ' ').slice(0, 120)
      );
    }
    CORE.resetPlayerGame(user.id);
    const embed = new EmbedBuilder()
      .setTitle('💀 你戰死了...')
      .setColor(0xff0000)
      .setDescription(`${detailText}\n\n🏁 勝者：${enemyName}\n你的旅程就此結束...`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('restart_onboarding').setLabel('📖 繼續（重新開始）').setStyle(ButtonStyle.Danger)
    );

    await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, mode);
  }

  async function showPetDefeatedTransition(interaction, player, pet, battleDetail = '', mode = 'update') {
    PET.markPetDefeated(pet, '戰鬥落敗');
    PET.savePet(pet);

    const remainTurns = typeof PET.getPetRecoveryRemainingTurns === 'function'
      ? Number(PET.getPetRecoveryRemainingTurns(pet) || 2)
      : 2;
    const enemyName = player?.battleState?.enemy?.name || '敵人';
    publishBattleWorldEvent(
      player,
      enemyName,
      'pet_down',
      `${pet?.name || '夥伴'}復活倒數 ${formatRecoveryTurnsShort(remainTurns)}`
    );
    player.battleState.fighter = 'player';
    player.battleState.mode = null;
    player.battleState.fleeAttempts = 0;
    rememberPlayer(player, {
      type: '戰鬥',
      content: `${pet.name} 被 ${enemyName} 擊倒`,
      outcome: '改由玩家親自接戰',
      importance: 3,
      tags: ['battle', 'pet_down']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('🐾 寵物陣亡')
      .setColor(0xff9900)
      .setDescription(
        `${pet.name} 在戰鬥中倒下了，將於 **${formatRecoveryTurnsShort(remainTurns)}** 後復活。\n\n` +
        `🏁 本局勝者：${enemyName}\n` +
        `你若還要硬戰，可以改由 **${player.name}** 親自上場（ATK 固定 10）。` +
        `${battleDetail ? `\n\n📜 戰況回放：\n${String(battleDetail).slice(0, 1200)}` : ''}`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_continue_human').setLabel('🧍 我親自上場').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('main_menu').setLabel('📖 繼續（先撤退）').setStyle(ButtonStyle.Secondary)
    );
    await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, mode);
  }

  async function continueBattleWithHuman(interaction, user) {
    const player = CORE.loadPlayer(user.id);
    const fallbackPet = PET.loadPet(user.id);
    const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
    const pet = petResolved?.pet || fallbackPet;
    const enemy = player?.battleState?.enemy;
    if (!player || !pet || !enemy) {
      await interaction.update({ content: '❌ 找不到可續戰的戰鬥。', components: [] });
      return;
    }
    if (petResolved?.changed) CORE.savePlayer(player);

    player.battleState.fighter = 'player';
    player.battleState.mode = 'manual';
    player.battleState.fleeAttempts = 0;
    ensureBattleEnergyState(player);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `改由 ${player.name} 親自上場`,
      outcome: `續戰 ${enemy.name}`,
      importance: 2,
      tags: ['battle', 'human_takeover']
    });
    CORE.savePlayer(player);

    const estimate = estimateBattleOutcome(player, pet, enemy, 'player');
    await renderManualBattle(
      interaction,
      player,
      pet,
      `⚠️ ${pet.name} 尚未復活，由你本人接戰。\n` +
        `勝率預估：${estimate.rank}（約 ${Number(estimate.winRate || 0).toFixed(1)}%）`
    );
  }

  return {
    showTrueGameOver,
    showPetDefeatedTransition,
    continueBattleWithHuman
  };
}

module.exports = { createBattlePostflowUtils };
