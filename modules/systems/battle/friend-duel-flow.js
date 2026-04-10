function createFriendDuelFlow(deps = {}) {
  const {
    CORE,
    PET,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    updateInteractionMessage,
    normalizeFriendId,
    ensurePlayerFriendState,
    showFriendsMenu,
    clearOnlineFriendDuelTimer,
    resolvePlayerMainPet,
    buildFriendDuelEnemyTeamFromPlayer,
    getPlayerOwnedPets,
    cloneStatusState,
    normalizeEventChoices,
    getChoiceDisplayCount,
    composeActionBridgeStory,
    estimateBattleOutcome,
    formatBattleElementDisplay,
    resolveEnemyBattleElement,
    getBattleElementRelation,
    formatBattleHpValue,
    getFriendDuelOnlineTurnMs,
    format1,
    getPlayerStoryTurns,
    rememberPlayer,
    applyFriendBattleResult,
    clearPendingStoryTrigger
  } = deps;

  const readChoiceDisplayCount = () => {
    if (typeof getChoiceDisplayCount === 'function') {
      return Math.max(1, Number(getChoiceDisplayCount() || 5));
    }
    return 5;
  };
  const readOnlineTurnMs = () => {
    if (typeof getFriendDuelOnlineTurnMs === 'function') {
      return Math.max(1000, Number(getFriendDuelOnlineTurnMs() || 20000));
    }
    return 20000;
  };

  async function startFriendDuel(interaction, user, friendId = '') {
    const replyEphemeral = async (content = '') => {
      if (interaction?.deferred || interaction?.replied) {
        await interaction.followUp({ content, ephemeral: true }).catch(() => {});
        return;
      }
      await interaction.reply({ content, ephemeral: true }).catch(() => {});
    };

    const challenger = CORE.loadPlayer(user.id);
    const targetId = normalizeFriendId(friendId);
    if (!challenger || !targetId) {
      await replyEphemeral('❌ 無法發起友誼戰。');
      return;
    }
    const social = ensurePlayerFriendState(challenger);
    if (!social.friends.includes(targetId)) {
      await showFriendsMenu(interaction, user, '你們尚未互加好友，無法發起友誼戰。');
      return;
    }
    if (challenger.battleState?.enemy) {
      const previousOnlineRoomId = String(challenger?.battleState?.friendDuel?.online?.roomId || '').trim();
      if (previousOnlineRoomId) {
        clearOnlineFriendDuelTimer(previousOnlineRoomId);
      }
      challenger.battleState = null;
      CORE.savePlayer(challenger);
    }

    const targetPlayer = CORE.loadPlayer(targetId);
    if (!targetPlayer) {
      await showFriendsMenu(interaction, user, '該好友資料不存在，無法發起對戰。');
      return;
    }
    const targetSocial = ensurePlayerFriendState(targetPlayer);
    if (!targetSocial.friends.includes(String(challenger.id || '').trim())) {
      await showFriendsMenu(interaction, user, '對方尚未與你互加成功，請重新確認。');
      return;
    }

    const myPetFallback = PET.loadPet(user.id);
    const myPetResolved = resolvePlayerMainPet(challenger, { fallbackPet: myPetFallback });
    const myPet = myPetResolved?.pet || myPetFallback;
    if (myPetResolved?.changed) CORE.savePlayer(challenger);
    const targetPetFallback = PET.loadPet(targetId);
    const targetPetResolved = resolvePlayerMainPet(targetPlayer, { fallbackPet: targetPetFallback });
    const targetPet = targetPetResolved?.pet || targetPetFallback;
    if (targetPetResolved?.changed) CORE.savePlayer(targetPlayer);
    if (!myPet || !myPet.hatched) {
      await replyEphemeral('⚠️ 你尚未完成寵物孵化，無法友誼戰。');
      return;
    }
    if (!targetPet || !targetPet.hatched) {
      await showFriendsMenu(interaction, user, `${targetPlayer.name} 尚未準備好寵物，暫時不能友誼戰。`);
      return;
    }

    const enemyTeam = buildFriendDuelEnemyTeamFromPlayer(targetPlayer, targetPet);
    if (!enemyTeam?.activePet) {
      await showFriendsMenu(interaction, user, `${targetPlayer.name} 目前沒有可出戰的寵物，稍後再試。`);
      return;
    }
    const enemy = enemyTeam.enemy;
    const fighterType = 'pet';
    const duelOwnedPets = getPlayerOwnedPets(String(challenger.id || '').trim()).filter((p) => Boolean(p?.hatched));
    const duelPetStates = {};
    for (const p of duelOwnedPets) {
      const id = String(p?.id || '').trim();
      if (!id) continue;
      const fullHp = Math.max(1, Number(p?.maxHp || p?.hp || 100));
      duelPetStates[id] = { hp: fullHp, status: {} };
    }
    const sourceChoice = `向好友 ${targetPlayer.name} 發起友誼戰`;
    const duelSnapshot = buildFriendDuelSnapshot(challenger);
    const preservedStory = String(challenger.currentStory || '').trim();
    const choiceDisplayCount = readChoiceDisplayCount();
    const preservedChoices = Array.isArray(challenger.eventChoices)
      ? normalizeEventChoices(challenger, challenger.eventChoices)
        .slice(0, choiceDisplayCount)
        .map((choice) => ({ ...choice }))
      : [];
    const preBattleStory = composeActionBridgeStory(challenger, sourceChoice, `你鎖定了 ${targetPlayer.name} 的夥伴 ${targetPet.name || '夥伴'}，準備切磋。`);
    const myDuelPetPreview = {
      ...myPet,
      hp: Math.max(1, Number(myPet?.maxHp || myPet?.hp || 100)),
      maxHp: Math.max(1, Number(myPet?.maxHp || myPet?.hp || 100)),
      status: {}
    };
    const estimate = estimateBattleOutcome(challenger, myDuelPetPreview, enemy, fighterType, { simulationCount: 24 });
    const fighterLabel = fighterType === 'pet'
      ? `🐾 ${myPet.name}`
      : `🧍 ${challenger.name}(ATK 10)`;
    const enemyElementText = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
    const allyElementText = fighterType === 'pet'
      ? formatBattleElementDisplay(myPet?.type || myPet?.element || '')
      : '🧍 無屬性';
    const relationText = getBattleElementRelation(
      fighterType === 'pet' ? (myPet?.type || myPet?.element || '') : '',
      resolveEnemyBattleElement(enemy)
    ).text;

    challenger.battleState = {
      enemy,
      fighter: fighterType,
      mode: null,
      fleeAttempts: 0,
      energy: 2,
      turn: 1,
      startedAt: Date.now(),
      sourceChoice,
      preBattleStory,
      humanState: null,
      petState: duelPetStates[String(myPet?.id || '').trim()] || { hp: Math.max(1, Number(myPet?.maxHp || myPet?.hp || 100)), status: {} },
      activePetId: String(myPet?.id || '').trim() || null,
      petStates: duelPetStates,
      friendDuel: {
        friendId: targetId,
        friendName: String(targetPlayer.name || '').trim() || `玩家(${targetId})`,
        friendPetName: String(targetPet?.name || '').trim() || '夥伴',
        currentEnemyPetId: String(enemyTeam?.activePet?.id || targetPet?.id || '').trim() || null,
        enemyReservePetIds: Array.isArray(enemyTeam?.reservePetIds) ? enemyTeam.reservePetIds.slice() : [],
        startedTurn: getPlayerStoryTurns(challenger),
        returnStory: preservedStory,
        returnChoices: preservedChoices,
        preState: duelSnapshot
      }
    };
    rememberPlayer(challenger, {
      type: '好友友誼戰',
      content: `向 ${targetPlayer.name} 發起友誼戰`,
      outcome: '等待開戰',
      importance: 2,
      tags: ['friend_duel', 'battle_start']
    });
    CORE.savePlayer(challenger);

    const embed = new EmbedBuilder()
      .setTitle(`🤝 好友友誼戰：${challenger.name} vs ${targetPlayer.name}`)
      .setColor(0x8b5cf6)
      .setDescription(
        `**友誼戰即將開始！**\n\n` +
        `對手：${enemy.name}\n` +
        `🏷️ 敵方屬性：${enemyElementText}\n` +
        `❤️ 對手 HP：${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)}\n` +
        `⚔️ 對手攻擊：${enemy.attack}\n` +
        `${fighterLabel} 出戰\n` +
        `🏷️ 我方屬性：${allyElementText}\n` +
        `${relationText}\n` +
        `⚡ 戰鬥能量規則：每回合 +2，可結轉\n` +
        `🌐 線上手動模式：雙方每回合 ${Math.floor(readOnlineTurnMs() / 1000)} 秒內同時提交行動\n` +
        `🤝 友誼戰規則：不影響生死、無通緝、無金幣掉落\n` +
        `📊 勝率預估：${estimate.rank}（約 ${format1(estimate.winRate)}%）\n\n` +
        `請選擇戰鬥模式：`
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_mode_manual').setLabel('⚔️ 手動模式').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('battle_mode_ai').setLabel('🤖 AI戰鬥').setStyle(ButtonStyle.Primary)
    );
    await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
  }

  async function showFriendManualModePicker(interaction, user) {
    const player = CORE.loadPlayer(user.id);
    const fallbackPet = PET.loadPet(user.id);
    const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
    const pet = petResolved?.pet || fallbackPet;
    const duel = player?.battleState?.friendDuel;
    const enemy = player?.battleState?.enemy;
    if (!player || !pet || !duel || !enemy) {
      await interaction.reply({ content: '❌ 找不到可用的好友對戰狀態，請重新發起。', ephemeral: true }).catch(() => {});
      return;
    }
    if (petResolved?.changed) CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle('⚔️ 手動模式選擇')
      .setColor(0x8b5cf6)
      .setDescription(
        `對手：${String(duel.friendName || '好友').trim() || '好友'}\n` +
        `請選擇手動模式：\n` +
        `1) 手動（對手AI）\n` +
        `2) 手動（真人即時，雙方每回合限時提交）`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_mode_manual_offline').setLabel('⚔️ 手動（對手AI）').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('battle_mode_manual_online').setLabel('🌐 手動（真人即時）').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('battle_mode_manual_back').setLabel('↩️ 返回').setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({ embeds: [embed], components: [row] });
  }

  function buildFriendDuelSnapshot(player) {
    if (!player || typeof player !== 'object') return null;
    const ownerId = String(player.id || '').trim();
    if (!ownerId) return null;
    const ownedPets = getPlayerOwnedPets(ownerId);
    const petStates = {};
    for (const p of ownedPets) {
      const id = String(p?.id || '').trim();
      if (!id) continue;
      petStates[id] = {
        hp: Math.max(0, Number(p?.hp || 0)),
        status: cloneStatusState(p?.status),
        reviveAt: p?.reviveAt || null,
        reviveTurnsRemaining: Math.max(0, Number(p?.reviveTurnsRemaining || 0))
      };
    }
    return {
      playerHp: Math.max(0, Number(player?.stats?.生命 || 0)),
      petStates
    };
  }

  function restoreFriendDuelSnapshot(player, snapshot, activePet = null) {
    if (!player || !snapshot || typeof snapshot !== 'object') return false;
    let restored = false;
    const maxPlayerHp = Math.max(1, Number(player?.maxStats?.生命 || 100));
    if (Number.isFinite(Number(snapshot?.playerHp)) && player?.stats) {
      player.stats.生命 = Math.max(0, Math.min(maxPlayerHp, Number(snapshot.playerHp)));
      restored = true;
    }

    const petStates = snapshot?.petStates && typeof snapshot.petStates === 'object'
      ? snapshot.petStates
      : {};
    for (const [petId, state] of Object.entries(petStates)) {
      const id = String(petId || '').trim();
      if (!id || !state || typeof state !== 'object') continue;
      const savedPet = (typeof PET.getPetById === 'function') ? PET.getPetById(id) : null;
      if (!savedPet || String(savedPet.ownerId || '').trim() !== String(player.id || '').trim()) continue;
      const maxHp = Math.max(1, Number(savedPet?.maxHp || savedPet?.hp || 100));
      savedPet.hp = Math.max(0, Math.min(maxHp, Number(state?.hp || 0)));
      savedPet.status = cloneStatusState(state?.status);
      savedPet.reviveAt = state?.reviveAt || null;
      savedPet.reviveTurnsRemaining = Math.max(0, Number(state?.reviveTurnsRemaining || 0));
      PET.savePet(savedPet);
      if (activePet && String(activePet?.id || '').trim() === id) {
        activePet.hp = savedPet.hp;
        activePet.status = cloneStatusState(savedPet.status);
        activePet.reviveAt = savedPet.reviveAt || null;
        activePet.reviveTurnsRemaining = savedPet.reviveTurnsRemaining;
      }
      restored = true;
    }
    return restored;
  }

  function finalizeFriendDuel(player, pet, combatant, detailText = '', didWin = false) {
    const battleState = player?.battleState || {};
    const duel = battleState?.friendDuel || {};
    const roomId = String(duel?.online?.roomId || '').trim();
    if (roomId) clearOnlineFriendDuelTimer(roomId);
    const rivalId = String(duel.friendId || '').trim();
    const rivalName = String(duel.friendName || '好友').trim() || '好友';
    const sourceChoice = String(battleState?.sourceChoice || '').trim();
    const preBattleStory = String(battleState?.preBattleStory || player?.currentStory || '').trim();
    const returnStory = String(duel.returnStory || preBattleStory || player?.currentStory || '').trim();
    const choiceDisplayCount = readChoiceDisplayCount();
    const returnChoices = Array.isArray(duel.returnChoices)
      ? duel.returnChoices
        .filter((choice) => choice && typeof choice === 'object')
        .slice(0, choiceDisplayCount)
        .map((choice) => ({ ...choice }))
      : [];
    const preState = (duel.preState && typeof duel.preState === 'object') ? duel.preState : null;

    const rivalPlayer = rivalId ? CORE.loadPlayer(rivalId) : null;
    if (rivalPlayer) {
      applyFriendBattleResult(rivalPlayer, String(player.id || '').trim(), !didWin);
      CORE.savePlayer(rivalPlayer);
    }
    const myRecord = applyFriendBattleResult(player, rivalId, didWin);

    const restoredBySnapshot = restoreFriendDuelSnapshot(player, preState, pet);
    if (!restoredBySnapshot) {
      if (pet && Number(pet.hp || 0) <= 0) {
        pet.hp = 1;
        pet.status = '正常';
        pet.reviveAt = null;
        pet.reviveTurnsRemaining = 0;
        PET.savePet(pet);
      }
      if (combatant?.isHuman && Number(player?.stats?.生命 || 0) <= 0) {
        player.stats.生命 = 1;
      }
    }

    rememberPlayer(player, {
      type: '好友友誼戰',
      content: `與 ${rivalName} 進行友誼戰`,
      outcome: didWin ? '勝利' : '落敗',
      importance: 2,
      tags: ['friend_duel', didWin ? 'win' : 'loss']
    });

    const summaryLine = `目前對 ${rivalName} 戰績：${myRecord?.wins || 0} 勝 / ${myRecord?.losses || 0} 敗`;
    player.currentStory = returnStory || player.currentStory || '';
    if (returnChoices.length > 0) {
      player.eventChoices = returnChoices;
    }
    if (player.pendingStoryTrigger) {
      clearPendingStoryTrigger(player);
    }
    player.pendingFriendDuelReturn = true;
    player.battleState = null;
    CORE.savePlayer(player);
    return {
      rivalName,
      record: myRecord,
      summaryLine,
      sourceChoice
    };
  }

  return {
    startFriendDuel,
    showFriendManualModePicker,
    buildFriendDuelSnapshot,
    restoreFriendDuelSnapshot,
    finalizeFriendDuel
  };
}

module.exports = { createFriendDuelFlow };
