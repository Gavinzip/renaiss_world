const { getLocalizedItemName } = require('../runtime/utils/global-language-resources');

function createBattleManualFlowUtils(deps = {}) {
  const {
    CORE,
    PET,
    BATTLE,
    ECON,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    WAIT_COMBAT_MOVE,
    MANUAL_ENEMY_RESPONSE_DELAY_MS,
    t,
    getPlayerUILang,
    formatBattleHpValue,
    resolvePlayerMainPet,
    getActiveCombatant,
    hasPetSwapBlockingStatus,
    getBattleSwitchCandidates,
    getCombatantMoves,
    persistCombatantState,
    ensureBattleEnergyState,
    advanceBattleTurnEnergy,
    pickBestMoveForAI,
    estimateBattleOutcome,
    rememberPlayer,
    publishBattleWorldEvent,
    applyMainStoryCombatProgress,
    composePostBattleStory,
    queuePendingStoryTrigger,
    recordCashflow,
    buildManualBattlePayload,
    buildBattleSwitchPayload,
    buildAIBattleStory,
    buildActionViewFromPhase,
    buildFriendDuelResultRow,
    sendBattleMessage,
    trackActiveGameMessage,
    maybeResolveMentorSparResult,
    trySwitchFriendDuelEnemy,
    trySwitchFriendDuelPlayerPet,
    finalizeFriendDuel,
    abortFriendDuel,
    finalizeMentorSparVictory,
    finalizeMentorSparDefeat,
    showTrueGameOver,
    showPetDefeatedTransition,
    clearOnlineFriendDuelTimer
  } = deps;

  function getBattleLootDisplayName(battleLoot = null, lang = 'zh-TW') {
    return getLocalizedItemName(battleLoot, lang) || String(battleLoot?.name || '戰利品');
  }

async function renderManualBattle(interaction, player, pet, roundMessage = '', options = {}) {
  const enemy = player?.battleState?.enemy;
  if (!enemy) {
    const mode = options?.mode === 'edit' ? 'edit' : 'update';
    await sendBattleMessage(interaction, { content: '❌ 找不到戰鬥狀態，請重新選擇戰鬥。', components: [] }, mode);
    return;
  }

  if (interaction.message?.id) {
    trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
  }

  const mode = options?.mode === 'edit' ? 'edit' : 'update';
  const payload = buildManualBattlePayload(player, pet, {
    disableActions: Boolean(options?.disableActions),
    actionView: options?.actionView || {},
    turnStartLines: options?.turnStartLines || [],
    extraLines: roundMessage ? [roundMessage] : [],
    notice: options?.notice || ''
  });
  await sendBattleMessage(interaction, payload, mode);
}

function appendWinnerLine(detailText = '', winnerName = '', loserName = '') {
  const body = String(detailText || '').trim();
  const winner = String(winnerName || '').trim() || '你';
  const loser = String(loserName || '').trim();
  const winnerLine = loser
    ? `🏁 勝者：${winner}（對手：${loser}）`
    : `🏁 勝者：${winner}`;
  return body ? `${body}\n\n${winnerLine}` : winnerLine;
}

async function resolveBattleInteractionMode(interaction) {
  if (!interaction?.deferred && !interaction?.replied && typeof interaction?.deferUpdate === 'function') {
    await interaction.deferUpdate().catch(() => {});
  }
  return interaction?.deferred || interaction?.replied ? 'edit' : 'update';
}

async function handleBattleSwitchOpen(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const currentPet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet }).pet;
  const combatant = getActiveCombatant(player, currentPet);
  const enemy = player?.battleState?.enemy;
  if (!player || !currentPet || !combatant || !enemy) {
    await interaction.reply({ content: '❌ 目前不在可換寵的戰鬥狀態。', ephemeral: true }).catch(() => {});
    return;
  }
  if (combatant.isHuman) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前是玩家本人上場，無法切換寵物。');
    return;
  }
  if (hasPetSwapBlockingStatus(combatant.status || {})) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前有持續效果（如中毒/灼燒/束縛），本回合不能換寵物。');
    return;
  }
  const candidates = getBattleSwitchCandidates(player, combatant.id);
  if (candidates.length <= 0) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 沒有可切換的寵物（其他寵物可能倒下或不存在）。');
    return;
  }
  const payload = buildBattleSwitchPayload(player, currentPet, '🔁 你可以在本回合改派其他寵物上場。');
  await interaction.update(payload);
}

async function handleBattleSwitchCancel(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const currentPet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet }).pet;
  if (!player || !currentPet || !player?.battleState?.enemy) {
    await interaction.reply({ content: '❌ 目前不在戰鬥狀態。', ephemeral: true }).catch(() => {});
    return;
  }
  await renderManualBattle(interaction, player, currentPet, '↩️ 已取消換寵，繼續由目前寵物作戰。');
}

async function handleBattleSwitchSelect(interaction, user, targetPetId = '') {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const currentPet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet }).pet;
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, currentPet);
  const targetRaw = String(targetPetId || '').trim();
  const ownedPets = typeof PET.getAllPetsByOwner === 'function'
    ? PET.getAllPetsByOwner(user.id)
    : [];
  let targetPet = targetRaw ? PET.getPetById(targetRaw) : null;
  if (!targetPet || String(targetPet.ownerId || '') !== String(user.id || '')) {
    targetPet = ownedPets.find((p) => String(p?.id || '').trim() === targetRaw)
      || ownedPets.find((p) => String(p?.name || '').trim() === targetRaw)
      || null;
  }
  if (!player || !currentPet || !combatant || !enemy || !targetPet || String(targetPet.ownerId || '') !== String(user.id || '')) {
    await interaction.reply({ content: '⚠️ 換寵資料失效，請重新操作。', ephemeral: true }).catch(() => {});
    return;
  }
  if (combatant.isHuman) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前是玩家本人上場，無法切換寵物。');
    return;
  }
  if (hasPetSwapBlockingStatus(combatant.status || {})) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前有持續效果（如中毒/灼燒/束縛），本回合不能換寵物。');
    return;
  }
  if (!CORE.canPetFight(targetPet)) {
    await renderManualBattle(interaction, player, currentPet, `⚠️ ${targetPet.name} 目前無法上場。`);
    return;
  }
  if (String(targetPet.id || '') === String(combatant.id || '')) {
    await renderManualBattle(interaction, player, currentPet, '⚠️ 目前已是這隻寵物上場。');
    return;
  }

  const savedPet = persistCombatantState(player, currentPet, combatant);
  if (savedPet) PET.savePet(savedPet);
  player.battleState.activePetId = targetPet.id;
  player.battleState.fighter = 'pet';
  player.activePetId = targetPet.id;
  CORE.savePlayer(player);

  // 先 ACK 選單互動，避免資料量變大時觸發 3 秒超時導致「選了但沒反應」。
  if (!interaction.deferred && !interaction.replied && typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate().catch(() => {});
  }
  const renderMode = interaction.deferred || interaction.replied ? 'edit' : 'update';
  await renderManualBattle(
    interaction,
    player,
    targetPet,
    `🔁 已切換上場寵物：${targetPet.name}`,
    { mode: renderMode }
  );
}

async function startManualBattle(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  if (!player || !pet) {
    await interaction.reply({ content: '❌ 沒有可用招式，無法開始戰鬥。', ephemeral: true }).catch(() => {});
    return;
  }
  const previousOnlineRoomId = String(player?.battleState?.friendDuel?.online?.roomId || '').trim();
  if (previousOnlineRoomId) {
    clearOnlineFriendDuelTimer(previousOnlineRoomId);
    if (player?.battleState?.friendDuel?.online) {
      delete player.battleState.friendDuel.online;
    }
  }

  let createdBattle = false;
  if (!player.battleState?.enemy) {
    player.battleState = {
      enemy: BATTLE.createEnemy('哥布林', Math.max(1, player.level || 1)),
      fighter: CORE.canPetFight(pet) ? 'pet' : 'player',
      mode: 'manual',
      fleeAttempts: 0,
      energy: 2,
      turn: 1,
      startedAt: Date.now(),
      sourceChoice: '突發戰鬥',
      preBattleStory: String(player?.currentStory || '').trim(),
      humanState: null,
      petState: null,
      activePetId: String(pet?.id || '').trim() || null,
      petStates: {}
    };
    createdBattle = true;
  } else {
    if (!player?.battleState?.friendDuel && player.battleState.fighter !== 'player' && !CORE.canPetFight(pet)) {
      player.battleState.fighter = 'player';
    }
    player.battleState.mode = 'manual';
  }

  if (createdBattle) {
    rememberPlayer(player, {
      type: '戰鬥',
      content: `突發戰鬥：遭遇 ${player.battleState.enemy.name}`,
      outcome: '手動模式',
      importance: 2,
      tags: ['battle', 'manual_start']
    });
    publishBattleWorldEvent(player, player.battleState.enemy.name, 'battle_start');
  }
  ensureBattleEnergyState(player);
  if (petResolved?.changed) CORE.savePlayer(player);
  CORE.savePlayer(player);
  await handleFight(interaction, user);
}

async function startAutoBattle(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  let pet = petResolved?.pet || fallbackPet;
  const uiLang = getPlayerUILang(player);
  if (!player || !pet) {
    await interaction.update({ content: '❌ 沒有可用招式，無法開始 AI 戰鬥。', components: [] });
    return;
  }
  const previousOnlineRoomId = String(player?.battleState?.friendDuel?.online?.roomId || '').trim();
  if (previousOnlineRoomId) {
    clearOnlineFriendDuelTimer(previousOnlineRoomId);
    if (player?.battleState?.friendDuel?.online) {
      delete player.battleState.friendDuel.online;
    }
  }
  ECON.ensurePlayerEconomy(player);

  let createdBattle = false;
  if (!player.battleState?.enemy) {
    player.battleState = {
      enemy: BATTLE.createEnemy('哥布林', Math.max(1, player.level || 1)),
      fighter: CORE.canPetFight(pet) ? 'pet' : 'player',
      mode: 'ai',
      fleeAttempts: 0,
      energy: 2,
      turn: 1,
      startedAt: Date.now(),
      sourceChoice: '突發戰鬥',
      preBattleStory: String(player?.currentStory || '').trim(),
      humanState: null,
      petState: null,
      activePetId: String(pet?.id || '').trim() || null,
      petStates: {}
    };
    createdBattle = true;
  } else {
    if (!player?.battleState?.friendDuel && player.battleState.fighter !== 'player' && !CORE.canPetFight(pet)) {
      player.battleState.fighter = 'player';
    }
    player.battleState.mode = 'ai';
  }

  if (createdBattle) {
    rememberPlayer(player, {
      type: '戰鬥',
      content: `突發戰鬥：遭遇 ${player.battleState.enemy.name}`,
      outcome: 'AI模式',
      importance: 2,
      tags: ['battle', 'ai_start']
    });
    publishBattleWorldEvent(player, player.battleState.enemy.name, 'battle_start');
  }
  ensureBattleEnergyState(player);
  if (petResolved?.changed) CORE.savePlayer(player);
  CORE.savePlayer(player);

  let enemy = player.battleState.enemy;
  let combatant = getActiveCombatant(player, pet);
  const candidateMoves = getCombatantMoves(combatant, pet);
  if (candidateMoves.length === 0) {
    await interaction.update({ content: '❌ 沒有可用招式，無法開始 AI 戰鬥。', components: [] });
    return;
  }

  const rounds = [];
  const duelSwitchNotes = [];
  let finalResult = null;
  const maxTurns = 12;
  ensureBattleEnergyState(player);

  for (let turn = 1; turn <= maxTurns; turn++) {
    const energyBefore = ensureBattleEnergyState(player).energy;
    const aiMove = pickBestMoveForAI(player, pet, enemy, combatant, energyBefore);
    const selectedMove = aiMove || WAIT_COMBAT_MOVE;
    const energyCost = aiMove ? BATTLE.getMoveEnergyCost(aiMove) : 0;
    const enemyMove = BATTLE.enemyChooseMove(enemy);
    const enemyHpBefore = enemy.hp;
    const petHpBefore = combatant.hp;
    const roundResultRaw = BATTLE.executeBattleRound(
      player,
      combatant,
      enemy,
      selectedMove,
      enemyMove,
      (player?.battleState?.mentorSpar || player?.battleState?.friendDuel) ? { nonLethal: true } : undefined
    );
    const roundResult = maybeResolveMentorSparResult(player, enemy, roundResultRaw);
    const nextEnergy = Math.max(0, energyBefore - energyCost) + 2;
    rounds.push({
      turn,
      playerMove: selectedMove.name || '普通攻擊',
      enemyMove: enemyMove?.name || '普通攻擊',
      playerDamage: Math.max(0, enemyHpBefore - enemy.hp),
      enemyDamage: Math.max(0, petHpBefore - combatant.hp),
      petHp: combatant.hp,
      petMaxHp: combatant.maxHp,
      enemyHp: enemy.hp,
      enemyMaxHp: enemy.maxHp,
      energyBefore,
      energyCost,
      energyAfter: nextEnergy
    });
    {
      const savedRoundPet = persistCombatantState(player, pet, combatant);
      if (savedRoundPet) PET.savePet(savedRoundPet);
    }
    advanceBattleTurnEnergy(player, energyCost);
    if (player?.battleState?.friendDuel && roundResult?.victory === true) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        duelSwitchNotes.push(switchedEnemy.message);
        enemy = player.battleState.enemy;
        CORE.savePlayer(player);
        continue;
      }
    }
    if (player?.battleState?.friendDuel && (roundResult?.victory === false || Number(combatant?.hp || 0) <= 0)) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        duelSwitchNotes.push(switchedPet.message);
        pet = switchedPet.nextPet;
        combatant = getActiveCombatant(player, pet);
        if (!combatant) {
          finalResult = { victory: false, gold: 0, message: switchedPet.message };
          break;
        }
        CORE.savePlayer(player);
        continue;
      }
    }
    if (roundResult.victory !== null) {
      finalResult = roundResult;
      break;
    }
  }

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }
  CORE.savePlayer(player);

  if (finalResult?.victory === true) {
    if (player?.battleState?.friendDuel) {
      const detail = [
        buildAIBattleStory(rounds, combatant, enemy, finalResult),
        duelSwitchNotes.length > 0 ? duelSwitchNotes.join('\n') : ''
      ].filter(Boolean).join('\n');
      const duel = finalizeFriendDuel(player, pet, combatant, detail, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`**AI 已完成好友友誼戰**\n\n${detail}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: '🩸 戰後 HP', value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await interaction.update({ embeds: [embed], content: null, components: [row] });
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const detail = buildAIBattleStory(rounds, combatant, enemy, finalResult);
      const mentorVictory = finalizeMentorSparVictory(player, pet, detail);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`**AI 已完成友誼賽**\n\n${detail}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: '🩸 戰後 HP', value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await interaction.update({ embeds: [embed], content: null, components: [row] });
      return;
    }
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    player.stats.財富 += finalResult.gold;
    recordCashflow(player, {
      amount: Number(finalResult.gold || 0),
      category: 'battle_victory_ai',
      source: `AI 戰鬥擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    const battleLootName = getBattleLootDisplayName(battleLoot, uiLang);
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `AI 自動戰鬥擊敗 ${enemy.name}`,
      outcome: `獲得 ${finalResult.gold} Rns 代幣，掉落 ${battleLootName}`,
      importance: 3,
      tags: ['battle', 'victory', 'ai']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `AI戰鬥勝利｜+${Number(finalResult.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你的 AI 戰鬥成功擊敗 **${enemy.name}**，獲得 ${finalResult.gold} Rns 代幣與「${battleLootName}」。`,
      buildAIBattleStory(rounds, combatant, enemy, finalResult),
      `你迅速整隊，準備把這場勝利帶來的連鎖影響推進到下一段冒險。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: 'AI戰鬥勝利',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在 ${enemy.name} 一戰中獲勝`,
      action: 'battle_result',
      outcome: `戰鬥勝利｜獲得 ${finalResult.gold} Rns｜戰利品 ${battleLootName}`
    });
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('🤖 AI戰鬥勝利！')
      .setColor(0x00cc66)
      .setDescription(
        appendWinnerLine(
          `**AI 已完成自動作戰**\n\n${buildAIBattleStory(rounds, combatant, enemy, finalResult)}`,
          player?.name || '你',
          enemy?.name || '敵人'
        )
      )
      .addFields(
        { name: '💰 獎勵', value: `${finalResult.gold} Rns 代幣`, inline: true },
        { name: '🩸 剩餘 HP', value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLootName}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], content: null, components: [row] });
    return;
  }

  if (finalResult?.victory === false || combatant.hp <= 0) {
    if (player?.battleState?.friendDuel) {
      const detail = [
        buildAIBattleStory(rounds, combatant, enemy, finalResult),
        duelSwitchNotes.length > 0 ? duelSwitchNotes.join('\n') : ''
      ].filter(Boolean).join('\n');
      const duel = finalizeFriendDuel(player, pet, combatant, detail, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${detail}\n\n${duel.summaryLine}`);
      const row = buildFriendDuelResultRow();
      await interaction.update({ embeds: [embed], content: null, components: [row] });
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const detail = buildAIBattleStory(rounds, combatant, enemy, finalResult);
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, detail);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${detail}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await interaction.update({ embeds: [embed], content: null, components: [row] });
      return;
    }
    if (combatant.isHuman) {
      await showTrueGameOver(interaction, user, `${buildAIBattleStory(rounds, combatant, enemy, finalResult)}`);
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, buildAIBattleStory(rounds, combatant, enemy, finalResult));
    return;
  }

  player.battleState.enemy = enemy;
  CORE.savePlayer(player);
  await renderManualBattle(
    interaction,
    player,
    pet,
    rounds.map(r => `第 ${r.turn} 回合：${combatant.name}「${r.playerMove}」｜${enemy.name}「${r.enemyMove}」`).join('\n')
  );
}

async function handleFight(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;

  if (!player || !pet) {
    await interaction.reply({ content: '❌ 沒有招式！', ephemeral: true }).catch(() => {});
    return;
  }

  let createdBattle = false;
  if (!player.battleState?.enemy) {
    player.battleState = {
      enemy: BATTLE.createEnemy('哥布林', Math.max(1, player.level || 1)),
      fighter: CORE.canPetFight(pet) ? 'pet' : 'player',
      mode: 'manual',
      fleeAttempts: 0,
      energy: 2,
      turn: 1,
      startedAt: Date.now(),
      sourceChoice: '突發戰鬥',
      preBattleStory: String(player?.currentStory || '').trim(),
      humanState: null,
      petState: null,
      activePetId: String(pet?.id || '').trim() || null,
      petStates: {}
    };
    createdBattle = true;
  } else if (!player?.battleState?.friendDuel && player.battleState.fighter !== 'player' && !CORE.canPetFight(pet)) {
    player.battleState.fighter = 'player';
    player.battleState.mode = 'manual';
    player.battleState.fleeAttempts = 0;
  }
  ensureBattleEnergyState(player);
  if (createdBattle) {
    publishBattleWorldEvent(player, player.battleState?.enemy?.name || '哥布林', 'battle_start');
  }

  if (petResolved?.changed) CORE.savePlayer(player);
  CORE.savePlayer(player);
  await renderManualBattle(interaction, player, pet);
}

// ============== 使用招式 ==============
async function handleUseMove(interaction, user, moveIndex) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  const uiLang = getPlayerUILang(player);
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);
  const availableMoves = getCombatantMoves(combatant, pet);
  const chosenMove = availableMoves[moveIndex];

  if (!player || !pet || !enemy || !chosenMove) {
    await interaction.update({ content: '❌ 招式不存在！', components: [] });
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(player);
  ECON.ensurePlayerEconomy(player);
  const state = ensureBattleEnergyState(player);
  const energyCost = BATTLE.getMoveEnergyCost(chosenMove);
  if (state.energy < energyCost) {
    await renderManualBattle(
      interaction,
      player,
      pet,
      `⚠️ 能量不足：${chosenMove.name} 需要 ⚡${energyCost}，目前只有 ⚡${state.energy}。`
    );
    return;
  }

  if (chosenMove?.effect?.flee) {
    await renderManualBattle(interaction, player, pet, '⚠️ 請使用下方「逃跑」按鈕，不是招式按鈕。');
    return;
  }

  const responseMode = await resolveBattleInteractionMode(interaction);

  const battleOptions = (player?.battleState?.mentorSpar || player?.battleState?.friendDuel) ? { nonLethal: true } : undefined;
  const enemyMove = BATTLE.enemyChooseMove(enemy);
  const playerPhaseRaw = BATTLE.executeBattlePlayerPhase(
    player,
    combatant,
    enemy,
    chosenMove,
    battleOptions
  );
  const playerPhase = maybeResolveMentorSparResult(player, enemy, playerPhaseRaw);

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }
  CORE.savePlayer(player);

  if (playerPhase.victory === true) {
    if (player?.battleState?.friendDuel) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        const activePet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet: pet }).pet || pet;
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          activePet,
          `${playerPhase.message}\n\n${switchedEnemy.message}`,
          { mode: responseMode }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, playerPhase.message, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`${playerPhase.message}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, playerPhase.message);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${playerPhase.message}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    player.stats.財富 += playerPhase.gold;
    recordCashflow(player, {
      amount: Number(playerPhase.gold || 0),
      category: 'battle_victory_manual',
      source: `手動戰鬥擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    const battleLootName = getBattleLootDisplayName(battleLoot, uiLang);
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `擊敗 ${enemy.name}`,
      outcome: `獲得 ${playerPhase.gold} Rns 代幣，掉落 ${battleLootName}`,
      importance: 3,
      tags: ['battle', 'victory']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `手動勝利｜+${Number(playerPhase.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你擊敗了 **${enemy.name}**，取得 ${playerPhase.gold} Rns 代幣與戰利品「${battleLootName}」。`,
      playerPhase.message,
      `戰場餘波未散，你準備依據這次勝負帶來的新線索繼續推進。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '戰鬥勝利',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在 ${enemy.name} 一戰中獲勝`,
      action: 'battle_result',
      outcome: `戰鬥勝利｜獲得 ${playerPhase.gold} Rns｜戰利品 ${battleLootName}`
    });
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory', uiLang))
      .setColor(0x00ff00)
      .setDescription(appendWinnerLine(playerPhase.message, player?.name || '你', enemy?.name || '敵人'))
      .addFields(
        { name: t('gold', uiLang), value: `${playerPhase.gold}`, inline: true },
        { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLootName}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );
    
    await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
    return;
  }

  if (playerPhase.victory === false) {
    if (player?.battleState?.friendDuel) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          switchedPet.nextPet,
          `${playerPhase.message}\n\n${switchedPet.message}`,
          { mode: responseMode }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, playerPhase.message, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${playerPhase.message}\n\n${duel.summaryLine}`);
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, playerPhase.message);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${playerPhase.message}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    if (combatant.isHuman) {
      await showTrueGameOver(interaction, user, playerPhase.message, responseMode);
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, playerPhase.message, responseMode);
    return;
  }

  await renderManualBattle(
    interaction,
    player,
    pet,
    '',
    {
      mode: responseMode,
      disableActions: true,
      actionView: buildActionViewFromPhase(playerPhase, null, { enemyPending: true }),
      turnStartLines: playerPhase.turnStartLines || [],
      notice: '⏳ 敵方即將行動，按鈕暫時鎖定...'
    }
  );

  await new Promise((resolve) => setTimeout(resolve, MANUAL_ENEMY_RESPONSE_DELAY_MS));

  const enemyPhaseRaw = BATTLE.executeBattleEnemyPhase(
    player,
    combatant,
    enemy,
    enemyMove,
    battleOptions
  );
  const enemyPhase = maybeResolveMentorSparResult(player, enemy, enemyPhaseRaw);
  const combinedLines = [...(playerPhase.lines || []), ...(enemyPhase.lines || [])].filter(Boolean);
  const combinedMessage = enemyPhase.outcomeText
    ? [...combinedLines, enemyPhase.outcomeText].join('\n')
    : combinedLines.join('\n');

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }
  CORE.savePlayer(player);

  if (enemyPhase.victory === true) {
    if (player?.battleState?.friendDuel) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        const activePet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet: pet }).pet || pet;
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          activePet,
          `${combinedMessage}\n\n${switchedEnemy.message}`,
          { mode: responseMode }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, combinedMessage, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`${combinedMessage}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, combinedMessage);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${combinedMessage}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    player.stats.財富 += enemyPhase.gold;
    recordCashflow(player, {
      amount: Number(enemyPhase.gold || 0),
      category: 'battle_victory_manual',
      source: `手動戰鬥擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    const battleLootName = getBattleLootDisplayName(battleLoot, uiLang);
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `擊敗 ${enemy.name}`,
      outcome: `獲得 ${enemyPhase.gold} Rns 代幣，掉落 ${battleLootName}`,
      importance: 3,
      tags: ['battle', 'victory']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `手動勝利｜+${Number(enemyPhase.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你擊敗了 **${enemy.name}**，取得 ${enemyPhase.gold} Rns 代幣與戰利品「${battleLootName}」。`,
      combinedMessage,
      `戰場餘波未散，你準備依據這次勝負帶來的新線索繼續推進。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '戰鬥勝利',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在 ${enemy.name} 一戰中獲勝`,
      action: 'battle_result',
      outcome: `戰鬥勝利｜獲得 ${enemyPhase.gold} Rns｜戰利品 ${battleLootName}`
    });
    player.battleState = null;
    player.eventChoices = [];
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory', uiLang))
      .setColor(0x00ff00)
      .setDescription(appendWinnerLine(combinedMessage, player?.name || '你', enemy?.name || '敵人'))
      .addFields(
        { name: t('gold', uiLang), value: `${enemyPhase.gold}`, inline: true },
        { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLootName}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );
    await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
    return;
  }

  if (enemyPhase.victory === false) {
    if (player?.battleState?.friendDuel) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          switchedPet.nextPet,
          `${combinedMessage}\n\n${switchedPet.message}`,
          { mode: responseMode }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, combinedMessage, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${combinedMessage}\n\n${duel.summaryLine}`);
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, combinedMessage);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${combinedMessage}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    if (combatant.isHuman) {
      await showTrueGameOver(interaction, user, combinedMessage, responseMode);
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, combinedMessage, responseMode);
    return;
  }

  player.battleState.enemy = enemy;
  player.battleState.mode = 'manual';
  const next = advanceBattleTurnEnergy(player, energyCost);
  CORE.savePlayer(player);
  await renderManualBattle(
    interaction,
    player,
    pet,
    `⚡ 消耗：${chosenMove.name} -${energyCost} 能量，下一回合能量 ${next.energy}`,
    {
      mode: responseMode,
      actionView: buildActionViewFromPhase(playerPhase, enemyPhase),
      notice: '✅ 敵方已行動，輪到你選擇下一步。'
    }
  );
}

async function handleBattleWait(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  const uiLang = getPlayerUILang(player);
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);

  if (!player || !pet || !enemy || !combatant) {
    await interaction.update({ content: '❌ 目前不在有效戰鬥狀態。', components: [] });
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(player);
  const responseMode = await resolveBattleInteractionMode(interaction);

  const state = ensureBattleEnergyState(player);
  const beforeEnergy = state.energy;
  const enemyMove = BATTLE.enemyChooseMove(enemy);
  const battleOptions = (player?.battleState?.mentorSpar || player?.battleState?.friendDuel) ? { nonLethal: true } : undefined;
  const playerPhaseRaw = BATTLE.executeBattlePlayerPhase(
    player,
    combatant,
    enemy,
    WAIT_COMBAT_MOVE,
    battleOptions
  );
  const playerPhase = maybeResolveMentorSparResult(player, enemy, playerPhaseRaw);

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }
  CORE.savePlayer(player);

  if (playerPhase.victory === true) {
    if (player?.battleState?.friendDuel) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        const activePet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet: pet }).pet || pet;
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          activePet,
          `${playerPhase.message}\n\n${switchedEnemy.message}`,
          { mode: responseMode }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, playerPhase.message, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`${playerPhase.message}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, playerPhase.message);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${playerPhase.message}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    player.stats.財富 += playerPhase.gold;
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    recordCashflow(player, {
      amount: Number(playerPhase.gold || 0),
      category: 'battle_victory_wait',
      source: `待機反擊擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    const battleLootName = getBattleLootDisplayName(battleLoot, uiLang);
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `蓄能待機後反殺 ${enemy.name}`,
      outcome: `獲得 ${playerPhase.gold} Rns 代幣，掉落 ${battleLootName}`,
      importance: 3,
      tags: ['battle', 'victory', 'wait_turn']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `待機逆轉勝｜+${Number(playerPhase.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你在蓄能待機後逆轉擊敗 **${enemy.name}**，取得 ${playerPhase.gold} Rns 代幣與戰利品「${battleLootName}」。`,
      playerPhase.message,
      `你把這段對戰節奏記下，準備把優勢延伸到下一段冒險。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '待機逆轉勝',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在蓄能後反殺 ${enemy.name}`,
      action: 'battle_result',
      outcome: `逆轉勝｜獲得 ${playerPhase.gold} Rns｜戰利品 ${battleLootName}`
    });
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory', uiLang))
      .setColor(0x00ff00)
      .setDescription(
        appendWinnerLine(
          `${playerPhase.message}${kingProgressLine ? `\n\n${kingProgressLine}` : ''}`,
          player?.name || '你',
          enemy?.name || '敵人'
        )
      )
      .addFields(
        { name: t('gold', uiLang), value: `${playerPhase.gold}`, inline: true },
        { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLootName}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );
    await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
    return;
  }

  if (playerPhase.victory === false || combatant.hp <= 0) {
    if (player?.battleState?.friendDuel) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          switchedPet.nextPet,
          `${playerPhase.message || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`}\n\n${switchedPet.message}`,
          { mode: responseMode }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, playerPhase.message || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${playerPhase.message || ''}\n\n${duel.summaryLine}`.trim());
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, playerPhase.message || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${playerPhase.message || ''}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`.trim());
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    CORE.savePlayer(player);
    if (combatant.isHuman) {
      await showTrueGameOver(interaction, user, playerPhase.message || `💀 你在蓄能時被 ${enemy.name} 擊倒...`, responseMode);
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, playerPhase.message || `⚡ 你在蓄能待機時被 ${enemy.name} 擊倒。`, responseMode);
    return;
  }

  await renderManualBattle(
    interaction,
    player,
    pet,
    '',
    {
      mode: responseMode,
      disableActions: true,
      actionView: buildActionViewFromPhase(playerPhase, null, { enemyPending: true }),
      turnStartLines: playerPhase.turnStartLines || [],
      notice: '⏳ 敵方即將行動，按鈕暫時鎖定...'
    }
  );

  await new Promise((resolve) => setTimeout(resolve, MANUAL_ENEMY_RESPONSE_DELAY_MS));

  const enemyPhaseRaw = BATTLE.executeBattleEnemyPhase(
    player,
    combatant,
    enemy,
    enemyMove,
    battleOptions
  );
  const enemyPhase = maybeResolveMentorSparResult(player, enemy, enemyPhaseRaw);
  const combinedLines = [...(playerPhase.lines || []), ...(enemyPhase.lines || [])].filter(Boolean);
  const combinedMessage = enemyPhase.outcomeText
    ? [...combinedLines, enemyPhase.outcomeText].join('\n')
    : combinedLines.join('\n');

  {
    const savedPet = persistCombatantState(player, pet, combatant);
    if (savedPet) PET.savePet(savedPet);
  }

  if (enemyPhase.victory === true) {
    if (player?.battleState?.friendDuel) {
      const switchedEnemy = trySwitchFriendDuelEnemy(player, enemy?.name || '');
      if (switchedEnemy?.switched) {
        const activePet = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet: pet }).pet || pet;
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          activePet,
          `${combinedMessage}\n\n${switchedEnemy.message}`,
          { mode: responseMode }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, combinedMessage, true);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰勝利')
        .setColor(0x8b5cf6)
        .setDescription(`${combinedMessage}\n\n${duel.summaryLine}`)
        .addFields(
          { name: '🤝 對手', value: duel.rivalName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, responseMode);
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorVictory = finalizeMentorSparVictory(player, pet, combinedMessage);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽通過')
        .setColor(0x3cb371)
        .setDescription(`${combinedMessage}\n\n${mentorVictory.learnLine}`)
        .addFields(
          { name: '🎖️ 導師', value: mentorVictory.mentorName, inline: true },
          { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true }
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, responseMode);
      return;
    }
    player.stats.財富 += enemyPhase.gold;
    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    recordCashflow(player, {
      amount: Number(enemyPhase.gold || 0),
      category: 'battle_victory_wait',
      source: `待機反擊擊敗 ${enemy.name}`,
      marketType: 'renaiss'
    });
    const battleLoot = await ECON.createCombatLoot(enemy, player.location, player.stats?.運氣 || 50, { lang: player?.language || 'zh-TW' });
    const battleLootName = getBattleLootDisplayName(battleLoot, uiLang);
    ECON.addTradeGood(player, battleLoot);
    const kingProgressLine = applyMainStoryCombatProgress(player, enemy.name, true);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `蓄能待機後反殺 ${enemy.name}`,
      outcome: `獲得 ${enemyPhase.gold} Rns 代幣，掉落 ${battleLootName}`,
      importance: 3,
      tags: ['battle', 'victory', 'wait_turn']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_win',
      `待機逆轉勝｜+${Number(enemyPhase.gold || 0)} Rns`
    );
    player.currentStory = composePostBattleStory(
      player,
      `🏆 你在蓄能待機後逆轉擊敗 **${enemy.name}**，取得 ${enemyPhase.gold} Rns 代幣與戰利品「${battleLootName}」。`,
      combinedMessage,
      `你把這段對戰節奏記下，準備把優勢延伸到下一段冒險。${kingProgressLine ? `\n${kingProgressLine}` : ''}`,
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '待機逆轉勝',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你在蓄能後反殺 ${enemy.name}`,
      action: 'battle_result',
      outcome: `逆轉勝｜獲得 ${enemyPhase.gold} Rns｜戰利品 ${battleLootName}`
    });
    player.battleState = null;
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(t('victory', uiLang))
      .setColor(0x00ff00)
      .setDescription(
        appendWinnerLine(
          `${combinedMessage}${kingProgressLine ? `\n\n${kingProgressLine}` : ''}`,
          player?.name || '你',
          enemy?.name || '敵人'
        )
      )
      .addFields(
        { name: t('gold', uiLang), value: `${enemyPhase.gold}`, inline: true },
        { name: t('hp', uiLang), value: `${formatBattleHpValue(combatant?.hp, 0)}/${formatBattleHpValue(combatant?.maxHp, 1)}`, inline: true },
        { name: '🧰 戰利品', value: `${battleLootName}（${battleLoot.rarity}｜${battleLoot.value} Rns 代幣）`, inline: false }
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );
    await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
    return;
  }

  if (enemyPhase.victory === false || combatant.hp <= 0) {
    if (player?.battleState?.friendDuel) {
      const switchedPet = trySwitchFriendDuelPlayerPet(player, pet, combatant);
      if (switchedPet?.switched && switchedPet?.nextPet) {
        CORE.savePlayer(player);
        await renderManualBattle(
          interaction,
          player,
          switchedPet.nextPet,
          `${combinedMessage || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`}\n\n${switchedPet.message}`,
          { mode: responseMode }
        );
        return;
      }
      const duel = finalizeFriendDuel(player, pet, combatant, combinedMessage || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 好友友誼戰落敗')
        .setColor(0x8b5cf6)
        .setDescription(`${combinedMessage || ''}\n\n${duel.summaryLine}`.trim());
      const row = buildFriendDuelResultRow();
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    if (player?.battleState?.mentorSpar) {
      const mentorDefeat = finalizeMentorSparDefeat(player, pet, combatant, combinedMessage || `⚡ 你在蓄能待機時敗給 ${enemy.name}。`);
      const embed = new EmbedBuilder()
        .setTitle('🤝 友誼賽落敗（已治療）')
        .setColor(0x4fa3ff)
        .setDescription(`${combinedMessage || ''}\n\n🩹 ${mentorDefeat.mentorName}當場替你的夥伴完成治療，已恢復滿血。`.trim());
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
      );
      await sendBattleMessage(interaction, { embeds: [embed], components: [row] }, responseMode);
      return;
    }
    CORE.savePlayer(player);
    if (combatant.isHuman) {
      await showTrueGameOver(interaction, user, combinedMessage || `💀 你在蓄能時被 ${enemy.name} 擊倒...`, responseMode);
      return;
    }
    await showPetDefeatedTransition(interaction, player, pet, combinedMessage || `⚡ 你在蓄能待機時被 ${enemy.name} 擊倒。`, responseMode);
    return;
  }

  player.battleState.enemy = enemy;
  player.battleState.mode = 'manual';
  const next = advanceBattleTurnEnergy(player, 0);
  CORE.savePlayer(player);

  await renderManualBattle(
    interaction,
    player,
    pet,
    `⚡ 能量 ${beforeEnergy} → ${next.energy}（+2）`,
    {
      mode: responseMode,
      actionView: buildActionViewFromPhase(playerPhase, enemyPhase),
      notice: '✅ 敵方已行動，輪到你選擇下一步。'
    }
  );
}

// ============== 逃跑 ==============
async function handleFlee(interaction, user, attemptNum) {
  const player = CORE.loadPlayer(user.id);
  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  const uiLang = getPlayerUILang(player);
  const enemy = player?.battleState?.enemy;
  const combatant = getActiveCombatant(player, pet);

  if (!player || !pet || !enemy) {
    await interaction.update({ content: '❌ 目前不在戰鬥狀態。', components: [] });
    return;
  }
  if (petResolved?.changed) CORE.savePlayer(player);

  const currentAttempt = (player.battleState.fleeAttempts || 0) + 1;
  const result = BATTLE.attemptFlee(player, pet, enemy, currentAttempt, combatant);

  if (result.blocked) {
    {
      const savedPet = persistCombatantState(player, pet, combatant);
      if (savedPet) PET.savePet(savedPet);
    }
    CORE.savePlayer(player);
    await renderManualBattle(interaction, player, pet, result.message);
    return;
  }

  if (result.success) {
    if (player?.battleState?.friendDuel) {
      const duel = typeof abortFriendDuel === 'function'
        ? abortFriendDuel(player, pet, { combatant, reason: result.message })
        : finalizeFriendDuel(player, pet, combatant, result.message, false);
      const embed = new EmbedBuilder()
        .setTitle('🤝 已退出好友友誼戰')
        .setColor(0x8b5cf6)
        .setDescription(`${String(result.message || '').trim()}\n\n${duel.summaryLine}`);
      const row = buildFriendDuelResultRow();
      await interaction.update({ embeds: [embed], components: [row] });
      return;
    }

    const battleStateSnapshot = player?.battleState || {};
    const sourceChoice = String(battleStateSnapshot?.sourceChoice || '').trim();
    const preBattleStory = String(battleStateSnapshot?.preBattleStory || player?.currentStory || '').trim();
    player.currentStory = composePostBattleStory(
      player,
      `🏃 你成功脫離與 **${enemy.name}** 的交戰，保住了隊伍狀態。`,
      result.message,
      '你拉開距離重整資源，準備以更穩定的節奏回到冒險。',
      sourceChoice,
      preBattleStory
    );
    queuePendingStoryTrigger(player, {
      name: '逃離戰鬥',
      choice: sourceChoice || `與${enemy.name}交戰`,
      desc: `你成功脫離 ${enemy.name} 的追擊`,
      action: 'battle_escape',
      outcome: String(result.message || '').trim()
    });
    player.battleState = null;
    rememberPlayer(player, {
      type: '戰鬥',
      content: `從 ${enemy.name} 戰鬥中撤退`,
      outcome: `第 ${currentAttempt} 次逃跑成功`,
      importance: 2,
      tags: ['battle', 'flee_success']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_flee',
      `第${currentAttempt}次逃跑成功`
    );
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('🏃 逃跑成功！')
      .setColor(0x00ff00)
      .setDescription(appendWinnerLine(result.message, `${player?.name || '你'}（成功脫戰）`, enemy?.name || '敵人'));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('continue', uiLang)).setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  if (!result.canRetry) {
    player.battleState.fleeAttempts = Math.max(
      Number(player.battleState.fleeAttempts || 0),
      currentAttempt
    );
    rememberPlayer(player, {
      type: '戰鬥',
      content: `嘗試從 ${enemy.name} 逃跑失敗`,
      outcome: `第 ${currentAttempt} 次失敗，已被迫續戰`,
      importance: 1,
      tags: ['battle', 'flee_fail', 'forced_continue']
    });
    publishBattleWorldEvent(
      player,
      enemy.name,
      'battle_flee_fail',
      {
        fleeAttempt: currentAttempt,
        forcedContinue: 1
      }
    );
    CORE.savePlayer(player);
    await renderManualBattle(interaction, player, pet, result.message);
    return;
  }

  if (result.death) {
    if (combatant?.isHuman) {
      await showTrueGameOver(interaction, user, result.message);
      return;
    }

    await showPetDefeatedTransition(interaction, player, pet, result.message);
    return;
  }

  player.battleState.fleeAttempts = currentAttempt;
  rememberPlayer(player, {
    type: '戰鬥',
    content: `嘗試從 ${enemy.name} 逃跑失敗`,
    outcome: `第 ${currentAttempt} 次失敗`,
    importance: 1,
    tags: ['battle', 'flee_fail']
  });
  publishBattleWorldEvent(
    player,
    enemy.name,
    'battle_flee_fail',
    {
      fleeAttempt: currentAttempt
    }
  );
  CORE.savePlayer(player);

  // 可以再試一次
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`flee_${currentAttempt}`).setLabel('🏃 再逃一次！').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('fight_retry').setLabel('⚔️ 不逃了！').setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ content: result.message, components: [row] });
}

  return {
    renderManualBattle,
    handleBattleSwitchOpen,
    handleBattleSwitchCancel,
    handleBattleSwitchSelect,
    startManualBattle,
    startAutoBattle,
    handleFight,
    handleUseMove,
    handleBattleWait,
    handleFlee
  };
}

module.exports = {
  createBattleManualFlowUtils
};
