const { MAP_LOCATIONS } = require('./world-map');

function createEventHandlerUtils(deps = {}) {
  const {
    CORE,
    PET,
    EVENTS,
    ECON,
    STORY,
    WISH,
    MAIN_STORY,
    ISLAND_STORY,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    CUSTOM_INPUT_MAX_LENGTH,
    CHOICE_DISPLAY_COUNT,
    BATTLE_ESTIMATE_SIMULATIONS,
    MENTOR_SPAR_WIN_HP_RATIO,
    WANTED_AMBUSH_MIN_LEVEL,
    PET_PASSIVE_HEAL_PER_STORY_TURN,
    LOCATION_ENTRY_MIN_WINRATE,
    resolvePlayerMainPet,
    ensurePlayerGenerationSchema,
    recordNearbyNpcEncounters,
    ensurePlayerIslandState,
    recordNpcEncounter,
    tryAcquireStoryLock,
    notifyStoryBusy,
    rememberPlayer,
    trackActiveGameMessage,
    setMainlineBridgeLock,
    buildPortalUsageGuide,
    openShopSession = () => {},
    getMarketTypeLabel = () => '商店',
    buildQuickShopNarrativeNotice = () => '',
    showWorldShopScene = async () => {},
    canEnterLocation,
    syncLocationArcLocation,
    buildMentorSparResult,
    resolveLocationStoryBattleTarget,
    getPlayerWantedPressure,
    getNearbyNpcIds,
    appendNpcDialogueLog,
    appendNpcQuoteMemory,
    recordCashflow,
    appendUniqueItem,
    appendNpcMemory,
    maybeGenerateTradeGoodFromChoice,
    maybeApplyRoamMovement,
    getPlayerStoryTurns,
    recordActionEvidence,
    getLocationStoryMetadata,
    maybeTriggerMissionNpcLead,
    maybeTriggerPassiveStory,
    shouldTriggerBattle,
    clearPendingConflictFollowup,
    isAggressiveChoice,
    pickStoryConflictDisplayName,
    setPendingConflictFollowup,
    recordPlayerChoiceHistory,
    isDigitalMaskPhaseForPlayer,
    incrementPlayerStoryTurns,
    applyPetRecoveryTurnTick,
    incrementLocationArcTurns,
    syncCurrentIslandStoryProgress,
    getCurrentRegionMission,
    getStoryChapterTitle,
    getNextPrimaryLocation,
    getLocationPortalHub,
    unlockRegionFreeRoamByLocation,
    unlockLocation,
    advanceRoamingDigitalVillains,
    applyPassivePetRecovery,
    composeActionBridgeStory,
    buildEnemyForBattle,
    publishBattleWorldEvent,
    shouldCountCombatForLocationStory,
    markCurrentLocationStoryBattleDone,
    estimateBattleOutcome,
    formatBattleElementDisplay,
    resolveEnemyBattleElement,
    getBattleElementRelation,
    disableMessageComponents,
    startGenerationState,
    getPlayerMemoryContextAsync,
    getNearbyNpcMemoryContextAsync,
    finishGenerationState,
    getAdventureText,
    buildMainStatusBar,
    buildMainlineProgressLine,
    buildChoiceOptionsText,
    format1 = (v) => String(v ?? 0),
    formatBattleHpValue = (v) => String(Math.max(0, Number(v) || 0)),
    getFactionPresenceHintForPlayer = () => 'none',
    getPetElementDisplayName = (v = '') => String(v || '未知屬性'),
    normalizeEventChoices,
    getAlignmentColor,
    updateGenerationState,
    startLoadingAnimation,
    startTypingIndicator,
    stopLoadingAnimation,
    stopTypingIndicator,
    editOrSendFallback,
    buildRetryGenerationComponents,
    getMainlineBridgeLock,
    consumeMainlineBridgeLock,
    rememberStoryDialogues,
    getMergedWorldEvents,
    formatPetHpWithRecovery,
    generateChoicesWithAI,
    applyChoicePolicy,
    maybeInjectRareCustomInputChoice,
    buildEventChoiceButtons,
    appendMainMenuUtilityButtons,
    triggerMainlineForeshadowAIInBackground,
    releaseStoryLock,
    restoreStoryFromGenerationState,
    restoreChoicesFromGenerationState,
    queuePendingStoryTrigger,
    getPendingStoryTrigger,
    detectStitchedBattleStory,
    extractBattleChoiceHintFromStory,
    consumeWorldIntroOnce,
    consumeFinanceNotices,
    createGuaranteedLocationStoryBattleChoice,
    publishWorldEvent,
    getPortalDestinations,
    addWorldEvent,
    canPetFight,
    executeEvent,
    negotiationPrompt
  } = deps;

function isStorageLootContext(event = {}, result = {}, selectedChoice = '') {
  const text = [
    selectedChoice,
    event?.choice,
    event?.name,
    event?.desc,
    event?.tag,
    event?.action,
    result?.message,
    result?.type
  ]
    .filter(Boolean)
    .join(' ');
  const hasStorageCue = /(封存[艙舱倉藏函]|貨樣|货样|貨艙|货舱|臨時艙|临时舱|storage\s*pod|sealed\s*(pod|cache))/iu.test(text);
  const hasOpenCue = /(打開|打开|開艙|开舱|撬開|撬开|搶奪|抢夺|強奪|强夺|奪取|夺取|搜刮|私吞|佔為己有|占为己有)/u.test(text);
  return hasStorageCue && hasOpenCue;
}

function storyMentionsLoot(storyText = '', tradeGood = {}) {
  const marker = extractStoryTurnMarker(storyText);
  if (!marker) return false;
  return /🧰/.test(marker);
}

function extractStoryTurnMarker(storyText = '') {
  const story = String(storyText || '');
  if (!story) return '';
  const m = story.match(/^🧾\s*回合標記[:：]\s*(.+)$/m);
  return m ? String(m[1] || '').trim() : '';
}

function escapeRegex(text = '') {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDeclaredTravelDestination(context = {}) {
  const currentLocation = String(context?.currentLocation || '').trim();
  const eventAction = String(context?.eventAction || '').trim();
  const explicitMoveToRaw = String(context?.explicitMoveTo || '').trim();
  const text = [
    context?.selectedChoice,
    context?.eventChoice,
    context?.eventName,
    context?.eventDesc
  ]
    .filter(Boolean)
    .join(' ');

  const locations = Array.isArray(MAP_LOCATIONS)
    ? MAP_LOCATIONS
      .map((loc) => String(loc || '').trim())
      .filter((loc) => loc && loc !== currentLocation)
      .sort((a, b) => b.length - a.length)
    : [];
  if (locations.length <= 0) return '';
  const hasTravelVerb = /(前往|趕往|赶往|轉往|转往|去往|前去|朝.+走去|離開|离开|通過|通过|啟程|启程|移動到|移动到)/u.test(text);
  const actionTravelLike = eventAction === 'travel' || eventAction === 'teleport';
  const explicitMoveTo = explicitMoveToRaw && locations.includes(explicitMoveToRaw)
    ? explicitMoveToRaw
    : '';
  if (explicitMoveTo && (hasTravelVerb || actionTravelLike)) return explicitMoveTo;
  if (!text) return '';
  if (!hasTravelVerb) return '';

  const travelOrderedPatterns = [
    '前往',
    '趕往',
    '赶往',
    '轉往',
    '转往',
    '去往',
    '前去',
    '朝',
    '移動到',
    '移动到'
  ];
  for (const location of locations) {
    const safe = escapeRegex(location);
    for (const keyword of travelOrderedPatterns) {
      const re = new RegExp(`${escapeRegex(keyword)}[^，。；\\n]{0,24}?${safe}`, 'u');
      if (re.test(text)) return location;
    }
    const generic = new RegExp(`(?:通過|通过|離開|离开)[^，。；\\n]{0,24}?(?:前往|趕往|赶往|轉往|转往|去往|前去)[^，。；\\n]{0,24}?${safe}`, 'u');
    if (generic.test(text)) return location;
  }

  return '';
}

async function handleEvent(interaction, user, eventIndex, options = {}) {
  const player = CORE.loadPlayer(user.id);
  const respondError = async (content) => {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true }).catch(() => {});
      return;
    }
    if (interaction?.isButton && interaction.isButton()) {
      await interaction.reply({ content, ephemeral: true }).catch(() => {});
      return;
    }
    if (interaction?.isModalSubmit && interaction.isModalSubmit()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => {});
      }
      return;
    }
    await interaction.reply({ content, ephemeral: true }).catch(() => {});
  };

  if (!player) {
    await respondError('❌ 請重新開始！');
    return;
  }

  const choices = player.eventChoices || [];
  const event = choices[eventIndex];
  const wishTextFromModal = String(options?.wishText || '').trim();
  const customActionTextFromModal = String(options?.customActionText || '').trim();

  if (!event) {
    const staleHint =
      !Array.isArray(choices) || choices.length <= 0
        ? '⚠️ 這批選項已失效（上一輪可能失敗或已更新）。請按「🔄 重新生成」或「🏠 主選單」。'
        : '❌ 事件不存在！';
    await respondError(staleHint);
    return;
  }

  // Modal 類事件先快速回應，避免先做重操作導致 3 秒超時
  if (event.action === 'wish_pool' && !wishTextFromModal) {
    const modal = new ModalBuilder()
      .setCustomId(`wish_pool_submit_${eventIndex}`)
      .setTitle('🪙 許願池');
    const wishInput = new TextInputBuilder()
      .setCustomId('wish_text')
      .setLabel('你想許下什麼願望？')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('例如：希望賺很多錢、希望變強、希望遇到貴人...')
      .setRequired(true)
      .setMaxLength(120);
    modal.addComponents(new ActionRowBuilder().addComponents(wishInput));
    await interaction.showModal(modal).catch(async () => {
      await interaction.reply({ content: '⚠️ 無法開啟許願輸入框，請再點一次。', ephemeral: true }).catch(() => {});
    });
    return;
  }

  if (event.action === 'custom_input' && !customActionTextFromModal) {
    const modal = new ModalBuilder()
      .setCustomId(`custom_action_submit_${eventIndex}`)
      .setTitle('✍️ 自訂行動');
    const actionInput = new TextInputBuilder()
      .setCustomId('custom_action_text')
      .setLabel('你接下來想做什麼？')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('例如：我去跟茶師談判，要求先合作再分成')
      .setRequired(true)
      .setMaxLength(CUSTOM_INPUT_MAX_LENGTH);
    modal.addComponents(new ActionRowBuilder().addComponents(actionInput));
    await interaction.showModal(modal).catch(async () => {
      await interaction.reply({ content: '⚠️ 無法開啟自訂輸入框，請再點一次。', ephemeral: true }).catch(() => {});
    });
    return;
  }

  // 一般事件按鈕先 ACK，避免 Discord 顯示「此交互失敗」
  if (interaction?.isButton && interaction.isButton() && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const fallbackPet = PET.loadPet(user.id);
  const petResolved = resolvePlayerMainPet(player, { fallbackPet });
  const pet = petResolved?.pet || fallbackPet;
  if (!pet) {
    await respondError('❌ 請重新開始！');
    return;
  }

  if (petResolved?.changed) {
    CORE.savePlayer(player);
  }
  if (ensurePlayerGenerationSchema(player)) {
    CORE.savePlayer(player);
  }
  if (recordNearbyNpcEncounters(player, 8)) {
    CORE.savePlayer(player);
  }
  ECON.ensurePlayerEconomy(player);
  if (!Array.isArray(player.herbs)) player.herbs = [];
  if (!Array.isArray(player.inventory)) player.inventory = [];
  const worldDay = Number(CORE.getWorld()?.day || 1);

  MAIN_STORY.ensureMainStoryState(player);
  ensurePlayerIslandState(player);
  const islandLocationBefore = String(player.location || '').trim();
  const islandStateBefore = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
    ? ISLAND_STORY.getIslandStoryState(player, islandLocationBefore)
    : null;
  
  if (event?.enemy?.id) {
    const npc = typeof CORE.getAgentFullInfo === 'function'
      ? CORE.getAgentFullInfo(event.enemy.id)
      : null;
    if (npc && recordNpcEncounter(player, npc, player.location)) {
      CORE.savePlayer(player);
    }
  }

  const playerId = player?.id || user.id;
  if (!tryAcquireStoryLock(playerId, 'event')) {
    await notifyStoryBusy(interaction);
    return;
  }

  let releaseInScope = true;
  try {
  // 執行事件（傳送門為特殊流程，不走一般事件表）
  let result = null;
  let selectedChoice = event.choice || event.name || '未知選擇';
  let pendingStoryLoot = null;
  const eventMainlineGoal = String(event?.mainlineGoal || '').trim();
  const eventMainlineProgress = String(event?.mainlineProgress || '').trim();
  const eventMainlineStage = Math.max(1, Number(event?.mainlineStage || 1));
  const eventMainlineStageCount = Math.max(eventMainlineStage, Number(event?.mainlineStageCount || 8));
  let extraStoryGuide = '';
  const pendingMemories = [];
  const queueMemory = (memory) => {
    if (memory?.content) pendingMemories.push(memory);
  };
  const flushMemories = () => {
    for (const memory of pendingMemories) {
      rememberPlayer(player, memory);
    }
    pendingMemories.length = 0;
  };

  if (event.action === 'wish_pool' && wishTextFromModal && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  if (event.action === 'custom_input' && customActionTextFromModal && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  if (event.action === 'scratch_lottery') {
    const marketType = /digital|暗潮|黑市/u.test([event.name || '', event.choice || '', event.desc || ''].join(' '))
      ? 'digital'
      : 'renaiss';
    openShopSession(player, marketType, selectedChoice);
    queueMemory({
      type: '商店',
      content: `進入${getMarketTypeLabel(marketType)}`,
      outcome: '主選單刮刮樂入口已導向商店內櫃檯操作',
      importance: 1,
      tags: ['market', marketType, 'shop_enter', 'scratch_gate']
    });
    flushMemories();
    CORE.savePlayer(player);
    const baseNotice = String(buildQuickShopNarrativeNotice(player, marketType) || '').trim();
    const scratchHint = '🧭 刮刮樂已移至商店內操作，請點「🎟️ 刮刮樂(100)」。';
    const intro = [baseNotice, scratchHint].filter(Boolean).join('\n');
    try {
      await showWorldShopScene(
        interaction,
        user,
        marketType,
        intro
      );
    } catch (shopErr) {
      console.error('[商店] 刮刮樂入口開啟失敗:', shopErr?.message || shopErr);
      await respondError(`❌ 無法開啟${getMarketTypeLabel(marketType)}，請再試一次。`);
      return;
    }
    if (interaction.message?.id) {
      trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
    }
    return;
  } else if (event.action === 'market_renaiss' || event.action === 'market_digital') {
    const marketType = event.action === 'market_digital' ? 'digital' : 'renaiss';
    openShopSession(player, marketType, selectedChoice);
    queueMemory({
      type: '商店',
      content: `進入${getMarketTypeLabel(marketType)}`,
      outcome: '商店場景開啟',
      importance: 2,
      tags: ['market', marketType, 'shop_enter']
    });
    flushMemories();
    CORE.savePlayer(player);

    const baseNotice = String(buildQuickShopNarrativeNotice(player, marketType) || '').trim();
    const flavorLine = marketType === 'digital'
      ? '你推門進入店內，老闆笑著招手，語氣親切卻帶著一絲試探。'
      : '你走進店內，牆上掛著完整估值表，老闆示意你先看規則。';
    const intro = [baseNotice, flavorLine].filter(Boolean).join('\n');
    try {
      await showWorldShopScene(interaction, user, marketType, intro);
    } catch (shopErr) {
      console.error('[商店] 鑑價站開啟失敗:', shopErr?.message || shopErr);
      await respondError(`❌ 無法開啟${getMarketTypeLabel(marketType)}，請再點一次。`);
      return;
    }
    if (interaction.message?.id) {
      trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
    }
    return;
  } else if (event.action === 'main_story') {
    const mainlineNarrative = String(event.mainlineNarrative || '').trim();
    const mainlineGoal = eventMainlineGoal;
    const mainlineProgress = eventMainlineProgress;
    const fallbackMsg = String(event.desc || event.choice || '主線正在暗中推進。').trim();
    const message = mainlineNarrative || fallbackMsg;
    const messageWithProgress = mainlineProgress ? `${message}\n📌 ${mainlineProgress}` : message;
    result = {
      type: 'main_story',
      message: messageWithProgress
    };
    selectedChoice = String(event.choice || event.name || '主線推進');
    if (mainlineGoal) {
      setMainlineBridgeLock(player, {
        goal: mainlineGoal,
        location: String(player.location || '').trim(),
        stage: eventMainlineStage,
        stageCount: eventMainlineStageCount,
        progress: mainlineProgress || `本區主線進行中（${String(player.location || '').trim() || '當前地區'}）`,
        sourceChoice: selectedChoice
      });
    }
    queueMemory({
      type: '主線',
      content: mainlineGoal || selectedChoice || '主線改為被動觸發，不需固定按鈕',
      importance: 1,
      tags: ['main_story']
    });
  } else if (event.action === 'portal_intent') {
    const nearbyPortals = typeof getPortalDestinations === 'function'
      ? getPortalDestinations(player.location || '')
      : [];
    player.portalMenuOpen = Array.isArray(nearbyPortals) && nearbyPortals.length > 0;
    extraStoryGuide = player.portalMenuOpen
      ? buildPortalUsageGuide(player)
      : '🌀 你嘗試感應傳送門，但目前沒有可用的主節點。';
    result = {
      type: 'portal_ready',
      message: player.portalMenuOpen
        ? `你在${player.location}感應到穩定傳送門節點，門紋逐漸亮起。`
        : `你在${player.location}搜尋傳送門訊號，但尚無可用主節點。`
    };
    queueMemory({
      type: '傳送',
      content: player.portalMenuOpen ? `啟動${player.location}附近傳送門` : `嘗試啟動${player.location}傳送門`,
      outcome: player.portalMenuOpen ? '可在地圖選擇傳送目的地' : '未找到可用傳送門',
      importance: 2,
      tags: ['portal']
    });
  } else if (event.action === 'teleport' && event.targetLocation) {
    const fromLocation = player.location;
    const targetLocation = event.targetLocation;
    const entryGate = canEnterLocation(player, targetLocation);
    if (!entryGate.allowed) {
      result = {
        type: 'travel_blocked',
        message: `🛑 你嘗試前往 **${targetLocation}**，但目前勝率僅 **${format1(entryGate.winRate)}%**（門檻 > ${format1(LOCATION_ENTRY_MIN_WINRATE)}%）。請先提升實力再前往。`
      };
      queueMemory({
        type: '移動',
        content: `嘗試前往${targetLocation}`,
        outcome: `受阻｜勝率 ${format1(entryGate.winRate)}%`,
        importance: 2,
        tags: ['travel', 'blocked', 'entry_gate']
      });
    } else {
    player.location = targetLocation;
    syncLocationArcLocation(player);
    ensurePlayerIslandState(player);
    player.portalMenuOpen = false;
    player.navigationTarget = '';
    queueMemory({
      type: '移動',
      content: `經傳送門由${fromLocation}前往${targetLocation}`,
      outcome: '完成傳送',
      importance: 2,
      tags: ['travel', 'teleport']
    });
    result = {
      type: 'travel',
      message: `🌀 傳送門啟動，空間在你腳下折疊。眨眼間，你已抵達 **${targetLocation}**。`
    };
    }
  } else if (event.action === 'wish_pool') {
    const safeWishText = wishTextFromModal.slice(0, 120);
    selectedChoice = `在許願池許願：「${safeWishText}」`;

    const outcome = await WISH.judgeWishWithAI({
      wishText: safeWishText,
      player
    });
    const applied = WISH.applyWishOutcome(player, outcome);
    const summaryText = applied.summaryLines.length > 0
      ? '\n\n' + applied.summaryLines.join(' | ')
      : '';

    result = {
      type: 'wish_pool',
      message:
        `🪙 **${outcome.title}**\n` +
        `${outcome.immediateText}\n\n` +
        `${outcome.futureHook}${summaryText}`
    };
    if (applied.delta?.gold > 0) {
      result.gold = applied.delta.gold;
    }

    publishWorldEvent(
      `🪙 ${player.name}在${player.location}的許願池許願「${safeWishText}」，結果：${outcome.worldRumor}`,
      'wish_pool',
      {
        actor: player.name,
        location: player.location,
        wish: safeWishText,
        rumor: String(outcome.worldRumor || '').slice(0, 120)
      }
    );
    queueMemory({
      type: '許願',
      content: `${safeWishText} -> ${outcome.title}`,
      outcome: outcome.futureHook,
      importance: 3,
      tags: ['wish_pool']
    });
  } else if (event.action === 'custom_input') {
    const safeCustomAction = customActionTextFromModal.slice(0, CUSTOM_INPUT_MAX_LENGTH);
    selectedChoice = `自訂行動：「${safeCustomAction}」`;

    const outcome = await WISH.judgeCustomActionWithAI({
      actionText: safeCustomAction,
      player
    });
    const applied = WISH.applyWishOutcome(player, outcome);
    const summaryText = applied.summaryLines.length > 0
      ? '\n\n' + applied.summaryLines.join(' | ')
      : '';

    result = {
      type: 'custom_input',
      message:
        `✍️ **${outcome.title}**\n` +
        `${outcome.immediateText}\n\n` +
        `${outcome.futureHook}${summaryText}`,
      skipGoldApply: true,
      customVerdict: outcome.verdict
    };

    publishWorldEvent(
      `✍️ ${player.name}在${player.location}採取自訂行動「${safeCustomAction}」，後續傳聞：${outcome.worldRumor}`,
      'custom_input',
      {
        actor: player.name,
        location: player.location,
        actionText: safeCustomAction,
        verdict: String(outcome.verdict || 'costly'),
        rumor: String(outcome.worldRumor || '').slice(0, 120)
      }
    );

    queueMemory({
      type: '自訂行動',
      content: `${safeCustomAction} -> ${outcome.title}`,
      outcome: `${outcome.verdict || 'costly'}｜${outcome.futureHook || ''}`.slice(0, 180),
      importance: outcome.verdict === 'allow' ? 2 : 3,
      tags: ['custom_input', String(outcome.verdict || 'costly')]
    });
  } else if (event.action === 'location_story_battle') {
    const fallback = createGuaranteedLocationStoryBattleChoice(
      player,
      String(player?.currentStory || player?.generationState?.storySnapshot || '')
    );
    const enemyTemplate = (event?.enemy && typeof event.enemy === 'object')
      ? { ...event.enemy }
      : (fallback?.enemy ? { ...fallback.enemy } : null);
    const npcId = String(event?.npcId || fallback?.npcId || enemyTemplate?.id || '').trim();
    const npcName = String(event?.npcName || fallback?.npcName || enemyTemplate?.name || '在地敵對勢力').trim();
    selectedChoice = event.choice || fallback?.choice || `在${player.location}迎戰${npcName}`;
    result = {
      type: 'combat',
      message:
        String(event?.desc || '').trim() ||
        `你沿著${player.location}的暗線追上${npcName}，雙方話語未落便爆發正面衝突。`,
      enemy: enemyTemplate || {
        id: npcId || 'local_story_enemy',
        name: npcName || '在地敵對勢力',
        hp: 130,
        maxHp: 130,
        attack: 28,
        defense: 12,
        moves: ['突襲', '壓制'],
        reward: { gold: [60, 120] },
        isMonster: false,
        companionPet: false
      },
      npcId,
      npcName,
      locationStoryBattle: true
    };
    queueMemory({
      type: '地區篇章',
      content: `在${player.location}對上${npcName}`,
      outcome: '地區關鍵戰啟動',
      importance: 3,
      tags: ['location_story', 'combat']
    });
  } else if (event.action === 'mentor_spar') {
    result = buildMentorSparResult(event, player, pet);
    selectedChoice = event.choice || `向${result?.mentorSpar?.mentorName || event?.mentorName || '導師'}提出友誼賽`;
    if (result?.type === 'combat') {
      queueMemory({
        type: '友誼賽',
        content: selectedChoice,
        outcome: `對手 ${result?.mentorSpar?.mentorName || result?.enemy?.name || '導師'}｜門檻 ${Math.round(Number(result?.mentorSpar?.acceptHpRatio || MENTOR_SPAR_WIN_HP_RATIO) * 100)}%`,
        importance: 2,
        tags: ['mentor_spar', 'training']
      });
    } else {
      queueMemory({
        type: '友誼賽',
        content: `嘗試發起友誼賽：${selectedChoice}`,
        outcome: '附近暫無可切磋導師',
        importance: 1,
        tags: ['mentor_spar', 'unavailable']
      });
    }
  } else {
    result = EVENTS.executeEvent(event, player);
    queueMemory({
      type: event.tag ? '行動' : '選擇',
      content: selectedChoice,
      tags: [String(event.action || ''), String(result?.type || '')].filter(Boolean)
    });

    if (result?.type === 'combat') {
      const hasExplicitEnemy = Boolean(result?.enemy?.name || event?.enemy?.name);
      if (!hasExplicitEnemy) {
        const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
        const fallbackTarget = resolveLocationStoryBattleTarget(player, storyText, {
          allowLooseSelection: true,
          wantedLevel: getPlayerWantedPressure(player),
          preferVillain: getPlayerWantedPressure(player) >= WANTED_AMBUSH_MIN_LEVEL
        });
        if (fallbackTarget?.enemy) {
          result.enemy = fallbackTarget.enemy;
          result.npcId = fallbackTarget.npcId;
          result.npcName = fallbackTarget.npcName;
          const joinLine = `${result.message || event.desc || ''}`.trim();
          result.message = `${joinLine}\n\n你在${player.location}與${fallbackTarget.npcName}正面衝突，戰鬥無可避免。`.trim();
          queueMemory({
            type: '遭遇',
            content: `在${player.location}對上${fallbackTarget.npcName}`,
            outcome: '由當前場景人物直接引發衝突',
            importance: 2,
            tags: ['combat', 'story_bound']
          });
        }
      }
    }

    if (result?.type === 'social') {
      const nearbyNpcIds = typeof CORE.getNearbyNpcIds === 'function'
        ? CORE.getNearbyNpcIds(player.location, 1)
        : [];
      const targetNpcId = nearbyNpcIds[0];
      if (targetNpcId) {
        const npcInfo = typeof CORE.getAgentFullInfo === 'function'
          ? CORE.getAgentFullInfo(targetNpcId)
          : null;
        if (npcInfo && typeof CORE.negotiationPrompt === 'function') {
          try {
            const npcReply = await CORE.negotiationPrompt(
              npcInfo,
              player,
              selectedChoice,
              process.env.MINIMAX_API_KEY || ''
            );
            result.message = `${result.message || ''}\n\n💬 ${npcInfo.name}：${npcReply}`.trim();
            result.npcId = targetNpcId;
            result.npcName = npcInfo.name;
            result.npcDialogueGenerated = true;
            appendNpcDialogueLog(player, {
              speaker: npcInfo.name,
              text: npcReply,
              location: player.location,
              source: 'social_npc_reply'
            });
            if (typeof CORE.appendNpcQuoteMemory === 'function') {
              CORE.appendNpcQuoteMemory(user.id, {
                npcId: targetNpcId,
                npcName: npcInfo.name,
                speaker: npcInfo.name,
                text: npcReply,
                location: player.location,
                source: 'social_npc_reply'
              });
            }
          } catch (npcErr) {
            throw new Error(`NPC 對話生成失敗：${npcErr?.message || npcErr}`);
          }
        }
      }
    }
  }

  if (result) {
    const goldDelta = Number(result.gold || 0);
    if (!result.skipGoldApply && Number.isFinite(goldDelta) && goldDelta !== 0) {
      player.stats.財富 = Math.max(0, Number(player.stats.財富 || 0) + goldDelta);
      recordCashflow(player, {
        amount: goldDelta,
        category: `event_${String(result.type || event.action || 'action')}`.slice(0, 40),
        source: selectedChoice || event.name || event.action || '事件結算'
      });
    }
    const cost = Number(result.cost || 0);
    if (Number.isFinite(cost) && cost > 0) {
      player.stats.財富 = Math.max(0, Number(player.stats.財富 || 0) - cost);
      recordCashflow(player, {
        amount: -cost,
        category: `cost_${String(result.type || event.action || 'action')}`.slice(0, 40),
        source: selectedChoice || event.name || event.action || '事件花費'
      });
    }
    if (Number.isFinite(Number(result.reputation)) && Number(result.reputation) !== 0) {
      player.reputation = Number(player.reputation || 0) + Number(result.reputation);
    }
    if (result.item && result.success) {
      if (result.type === 'gather') appendUniqueItem(player.herbs, result.item, 80);
      if (result.type === 'hunt') appendUniqueItem(player.inventory, result.item, 120);
    }
    if (result.type === 'social') {
      if (result.npcDialogueGenerated) {
        // negotiationPrompt 內已寫入 NPC 私有/公共記憶，這裡避免重複寫入
      } else {
      const npcIds = typeof CORE.getNearbyNpcIds === 'function'
        ? CORE.getNearbyNpcIds(player.location, 1)
        : [];
      const targetNpcId = npcIds[0];
      if (targetNpcId) {
        CORE.appendNpcMemory(targetNpcId, user.id, {
          type: '互動',
          content: `${player.name} 與我互動：${selectedChoice}`,
          outcome: String(result.message || '交換了情報').slice(0, 160),
          location: player.location,
          tags: ['social', 'private'],
          importance: 2
        }, { scope: 'private' });
      }
      }
    }

    let tradeGood = await maybeGenerateTradeGoodFromChoice(event, player, result, selectedChoice);
    if (!tradeGood && result?.success !== false && String(result?.type || '') !== 'combat') {
      player.noLootStreak = Math.max(0, Number(player.noLootStreak || 0)) + 1;
      if (player.noLootStreak >= 4) {
        const luck = Number(player?.stats?.運氣 || 50);
        tradeGood = Math.random() < 0.6
          ? ECON.createTreasureLoot(player.location || '未知地點', luck, { lang: player?.language || 'zh-TW' })
          : ECON.createForageLoot(player.location || '未知地點', luck, { lang: player?.language || 'zh-TW' });
        player.noLootStreak = 0;
      }
    } else if (tradeGood) {
      player.noLootStreak = 0;
    }
    if (tradeGood) {
      pendingStoryLoot = tradeGood;
    }
  }

  if (!shouldTriggerBattle(event, result)) {
    const declaredDestination = extractDeclaredTravelDestination({
      currentLocation: String(player.location || '').trim(),
      eventAction: String(event?.action || '').trim(),
      explicitMoveTo: String(event?.move_to || event?.moveTo || '').trim(),
      selectedChoice,
      eventChoice: String(event?.choice || '').trim(),
      eventName: String(event?.name || '').trim(),
      eventDesc: String(event?.desc || '').trim()
    });
    const fromLocation = String(player.location || '').trim();
    if (declaredDestination && declaredDestination !== fromLocation) {
      const entryGate = canEnterLocation(player, declaredDestination);
      if (entryGate?.allowed) {
        player.location = declaredDestination;
        syncLocationArcLocation(player);
        player.navigationTarget = declaredDestination;
        const travelLine = `🧭 本回合移動：${fromLocation} → ${declaredDestination}`;
        result.message = `${String(result.message || '').trim()}\n\n${travelLine}`.trim();
        result.autoTravel = {
          fromLocation,
          targetLocation: declaredDestination,
          reason: 'declared_destination'
        };
        queueMemory({
          type: '移動',
          content: `依選項路線移動`,
          outcome: `${fromLocation} -> ${declaredDestination}`,
          importance: 2,
          tags: ['travel', 'choice_move', 'declared_destination']
        });
      } else {
        const blockedLine = `🛑 你嘗試前往 **${declaredDestination}**，但目前勝率僅 **${format1(entryGate?.winRate)}%**（門檻 > ${format1(LOCATION_ENTRY_MIN_WINRATE)}%）。`;
        result.message = `${String(result.message || '').trim()}\n\n${blockedLine}`.trim();
        queueMemory({
          type: '移動',
          content: `嘗試依選項前往${declaredDestination}`,
          outcome: `受阻｜勝率 ${format1(entryGate?.winRate)}%`,
          importance: 1,
          tags: ['travel', 'choice_move', 'blocked', 'entry_gate']
        });
      }
    }
  }

  const roamTravel = maybeApplyRoamMovement(player, event, result, queueMemory);
  if (roamTravel?.targetLocation) {
    const movedPortals = typeof getPortalDestinations === 'function'
      ? getPortalDestinations(player.location || '')
      : [];
    if (Array.isArray(movedPortals) && movedPortals.length > 0) {
      extraStoryGuide = buildPortalUsageGuide(player);
    }
  }

  const arcStateForMission = syncLocationArcLocation(player);
  const turnsInLocationForMission = Number(arcStateForMission?.turnsInLocation || 0);
  const storyTurnsForMission = getPlayerStoryTurns(player);

  const actionEvidence = (typeof MAIN_STORY.recordActionEvidence === 'function')
    ? MAIN_STORY.recordActionEvidence(player, {
      location: String(islandLocationBefore || player.location || '').trim(),
      regionId: String(getLocationStoryMetadata(islandLocationBefore || player.location || '')?.regionId || '').trim(),
      selectedChoice,
      eventAction: String(event?.action || '').trim(),
      resultType: String(result?.type || '').trim(),
      resultMessage: String(result?.message || '').trim(),
      npcName: String(result?.npcName || event?.npcName || '').trim(),
      storyTurns: storyTurnsForMission,
      turnsInLocation: turnsInLocationForMission
    })
    : null;
  if (actionEvidence?.appendText) {
    result.message = `${result.message || ''}\n\n${actionEvidence.appendText}`.trim();
  }
  if (actionEvidence?.announcement) {
    EVENTS.addWorldEvent(actionEvidence.announcement, 'main_story');
  }
  if (actionEvidence?.memory) {
    queueMemory({
      type: '主線',
      content: actionEvidence.memory,
      importance: 3,
      tags: ['main_story', 'key_mission']
    });
  }

  const missionLead = (typeof MAIN_STORY.maybeTriggerMissionNpcLead === 'function')
    ? MAIN_STORY.maybeTriggerMissionNpcLead(player, {
      location: String(player.location || '').trim(),
      regionId: String(getLocationStoryMetadata(player.location || '')?.regionId || '').trim(),
      storyTurns: storyTurnsForMission,
      turnsInLocation: turnsInLocationForMission
    })
    : null;
  if (missionLead?.appendText) {
    result.message = `${result.message || ''}\n\n${missionLead.appendText}`.trim();
  }
  if (missionLead?.memory) {
    queueMemory({
      type: '主線',
      content: missionLead.memory,
      importance: 2,
      tags: ['main_story', 'npc_lead']
    });
  }

  const passive = MAIN_STORY.maybeTriggerPassiveStory(player, { event, result });
  if (passive?.overrideResult) {
    result = passive.overrideResult;
    selectedChoice = `${selectedChoice}（主線觸發）`;
  }
  if (passive?.appendText) {
    result.message = `${result.message || ''}\n\n${passive.appendText}`.trim();
  }
  if (passive?.announcement) {
    EVENTS.addWorldEvent(passive.announcement, 'main_story');
  }
  if (passive?.memory) {
    queueMemory({
      type: '主線',
      content: passive.memory,
      importance: 3,
      tags: ['main_story']
    });
  }

  if (!shouldTriggerBattle(event, result) && typeof MAIN_STORY.suggestMissionAutoTravel === 'function') {
    const autoTravel = MAIN_STORY.suggestMissionAutoTravel(player, {
      location: String(player.location || '').trim(),
      storyTurns: storyTurnsForMission,
      turnsInLocation: turnsInLocationForMission
    });
    if (autoTravel?.targetLocation) {
      const fromLocation = String(player.location || '').trim();
      const targetLocation = String(autoTravel.targetLocation || '').trim();
      if (targetLocation && targetLocation !== fromLocation) {
        player.location = targetLocation;
        syncLocationArcLocation(player);
        player.navigationTarget = targetLocation;
        const travelLine = String(autoTravel.appendText || '').trim()
          || `🧭 你沿著在地線索由 ${fromLocation} 轉往 **${targetLocation}**。`;
        result.message = `${String(result.message || '').trim()}\n\n${travelLine}`.trim();
        queueMemory({
          type: '移動',
          content: `主線導引移動`,
          outcome: `${fromLocation} -> ${targetLocation}`,
          importance: 2,
          tags: ['travel', 'main_story', 'mission_auto']
        });
      }
      if (autoTravel?.memory) {
        queueMemory({
          type: '主線',
          content: String(autoTravel.memory || '').trim(),
          importance: 2,
          tags: ['main_story', 'mission_auto']
        });
      }
    }
  }

  const enteringBattleNow = shouldTriggerBattle(event, result);
  if (enteringBattleNow) {
    clearPendingConflictFollowup(player);
  } else if (isAggressiveChoice(event)) {
    const storySnapshotBeforeChoice = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    const displayName = pickStoryConflictDisplayName(player, storySnapshotBeforeChoice, selectedChoice);
    setPendingConflictFollowup(player, {
      displayName,
      sourceChoice: selectedChoice,
      location: player.location
    });
  }

  recordPlayerChoiceHistory(player, event, selectedChoice);

  const outcomeParts = [];
  if (result?.type) outcomeParts.push(`類型:${result.type}`);
  if (Number.isFinite(Number(result?.gold)) && Number(result.gold) !== 0) {
    outcomeParts.push(`Rns 代幣 ${Number(result.gold) > 0 ? '+' : ''}${Number(result.gold)}`);
  }
  if (result?.wantedLevel) outcomeParts.push(`通緝 ${result.wantedLevel}`);
  if (result?.loot?.name) outcomeParts.push(`掉落:${result.loot.name}`);
  if (Number.isFinite(Number(result?.digitalRiskScore))) {
    const score = Number(result.digitalRiskScore);
    const delta = Number(result.digitalRiskDelta || 0);
    const digitalMasked = Boolean(result?.digitalMasked || isDigitalMaskPhaseForPlayer(player));
    outcomeParts.push(
      digitalMasked
        ? `市場異常 ${score}/100${delta > 0 ? `(+${delta})` : ''}`
        : `Digital風險 ${score}/100${delta > 0 ? `(+${delta})` : ''}`
    );
  }
  if (result?.type === 'combat') {
    const enemyName = result?.enemy?.name || event?.enemy?.name || '未知敵人';
    outcomeParts.push(`遭遇:${enemyName}`);
  }
  if (result?.autoTravel?.targetLocation) {
    outcomeParts.push(`移動:${result.autoTravel.fromLocation}->${result.autoTravel.targetLocation}`);
  }
  queueMemory({
    type: '結果',
    content: selectedChoice,
    outcome: outcomeParts.join(' | ') || '事件推進',
    importance: result?.type === 'combat' ? 2 : 1,
    tags: [String(event.action || ''), String(result?.type || '')].filter(Boolean)
  });
  
  incrementPlayerStoryTurns(player, 1);
  const recoveryTick = applyPetRecoveryTurnTick(pet, 1);
  if (recoveryTick.changed) {
    PET.savePet(pet);
  }
  if (recoveryTick.revived) {
    result.petRevived = true;
    queueMemory({
      type: '恢復',
      content: `${pet.name} 完成復活`,
      outcome: '戰敗後經過 2 回合已回到可戰鬥狀態',
      importance: 2,
      tags: ['pet_revive', 'turn_based']
    });
  }
  incrementLocationArcTurns(player, 1);
  const islandProgressAfterTurn = syncCurrentIslandStoryProgress(player);
  const islandCompletedNow = Boolean(
    !Boolean(islandStateBefore?.completed) &&
    islandProgressAfterTurn?.completed
  );
  const completedLocation = String(player.location || '').trim();
  const regionMissionAtCompletion = (MAIN_STORY && typeof MAIN_STORY.getCurrentRegionMission === 'function')
    ? MAIN_STORY.getCurrentRegionMission(player, completedLocation)
    : null;
  const shouldHoldForRegionMission = Boolean(regionMissionAtCompletion && !regionMissionAtCompletion.keyFound);
  const completedChapterTitle = ISLAND_STORY && typeof ISLAND_STORY.getStoryChapterTitle === 'function'
    ? String(ISLAND_STORY.getStoryChapterTitle(completedLocation) || '島內篇章').trim()
    : '島內篇章';
  const nextIslandHint = islandCompletedNow && ISLAND_STORY && typeof ISLAND_STORY.getNextPrimaryLocation === 'function'
    ? ISLAND_STORY.getNextPrimaryLocation(completedLocation)
    : '';
  const nextPortalHubHint = nextIslandHint && typeof getLocationPortalHub === 'function'
    ? String(getLocationPortalHub(nextIslandHint) || '').trim()
    : '';
  if (islandCompletedNow && !shouldHoldForRegionMission) {
    // 這個地區已完成：開放同區自由遊走（可不傳送）
    unlockRegionFreeRoamByLocation(player, completedLocation);
    // 收尾點直接把玩家帶到該區主傳送門旁，讓轉場更自然
    const regionPortalHub = typeof getLocationPortalHub === 'function'
      ? String(getLocationPortalHub(completedLocation) || '').trim()
      : '';
    let movedToPortalHub = false;
    if (regionPortalHub && regionPortalHub !== completedLocation) {
      const fromLocation = completedLocation;
      player.location = regionPortalHub;
      syncLocationArcLocation(player);
      movedToPortalHub = true;
      const handoffLine = (getPlayerStoryTurns(player) % 2 === 0)
        ? `🧭 你把「${completedChapterTitle}」收束後，順勢走到 **${regionPortalHub}** 主傳送門節點。`
        : `🧭 ${completedLocation} 的關鍵段落告一段落，你跟著導引光帶抵達 **${regionPortalHub}** 主傳送門。`;
      result.message = `${String(result.message || '').trim()}\n\n${handoffLine}`.trim();
      queueMemory({
        type: '移動',
        content: `地區收尾後前往主傳送門`,
        outcome: `${fromLocation} -> ${regionPortalHub}`,
        importance: 2,
        tags: ['travel', 'portal_hub', 'island_story']
      });
    }

    const completedLine = nextPortalHubHint
      ? `📍 ${completedChapterTitle}已完成：你可直接前往 **${nextPortalHubHint}** 接下一段，也可先在本區自由探索。`
      : (nextIslandHint
        ? `📍 ${completedChapterTitle}已完成：下一步可朝 **${nextIslandHint}** 推進，或暫留本區整理線索。`
        : `📍 ${completedChapterTitle}已完成：你可留在本區擴展支線，或自行挑選下一個地區。`);
    result.message = `${String(result.message || '').trim()}\n\n${completedLine}`.trim();
    if (!movedToPortalHub && regionPortalHub) {
      result.message = `${String(result.message || '').trim()}\n\n🧭 你已靠近 **${regionPortalHub}** 主傳送門，可立刻跨區，也可先留在本區延伸支線。`.trim();
    }
    player.portalMenuOpen = true;
    player.forcePortalChoice = true;
    if (nextPortalHubHint && ISLAND_STORY && typeof ISLAND_STORY.unlockLocation === 'function') {
      ISLAND_STORY.unlockLocation(player, nextPortalHubHint);
    }
    queueMemory({
      type: '地區篇章',
      content: `${completedLocation} 劇情已完成`,
      outcome: nextPortalHubHint
        ? `主傳送門啟動｜建議前往 ${nextPortalHubHint}`
        : (nextIslandHint ? `建議前往 ${nextIslandHint}` : '可自由探索或跨區'),
      importance: 2,
      tags: ['island_story', 'completed']
    });
    if (!extraStoryGuide) extraStoryGuide = buildPortalUsageGuide(player);
  } else if (islandCompletedNow && shouldHoldForRegionMission) {
    const missionNpc = String(regionMissionAtCompletion?.npcName || '關鍵NPC').trim();
    const missionLocation = String(regionMissionAtCompletion?.npcLocation || completedLocation).trim();
    const missionEvidence = String(regionMissionAtCompletion?.evidenceName || '關鍵證據').trim();
    const shouldAutoMoveToMission = missionLocation && missionLocation !== completedLocation;
    if (shouldAutoMoveToMission) {
      player.location = missionLocation;
      syncLocationArcLocation(player);
      player.navigationTarget = missionLocation;
      result.message = `${String(result.message || '').trim()}\n\n` +
        `📍 ${completedChapterTitle}暫時收束，你沒有直接跨區，而是依線索先轉往 **${missionLocation}**。\n` +
        `🎯 目前主線目標：接觸 **${missionNpc}**，補齊「${missionEvidence}」。`;
      queueMemory({
        type: '移動',
        content: '地區收尾後回補關鍵任務',
        outcome: `${completedLocation} -> ${missionLocation}`,
        importance: 2,
        tags: ['travel', 'main_story', 'mission_hold']
      });
    } else {
      result.message = `${String(result.message || '').trim()}\n\n` +
        `📍 ${completedChapterTitle}可自由探索，但你尚未取得本區唯一來源關鍵證據「${missionEvidence}」。\n` +
        `🎯 請優先在 **${missionLocation}** 接觸 **${missionNpc}**，完成後再考慮跨區。`;
    }
    player.portalMenuOpen = false;
    player.forcePortalChoice = false;
    queueMemory({
      type: '主線',
      content: `本區收尾但關鍵證據未取得：${missionEvidence}`,
      outcome: `維持本區調查，優先接觸${missionNpc}@${missionLocation}`,
      importance: 2,
      tags: ['main_story', 'mission_hold']
    });
  }
  if (typeof CORE.advanceRoamingDigitalVillains === 'function') {
    CORE.advanceRoamingDigitalVillains({ steps: 1, persist: true });
  }
  if (event.action === 'market_renaiss' || event.action === 'market_digital') {
    player.lastMarketTurn = getPlayerStoryTurns(player);
  }
  
  // 清除舊選項（必須重新生成）
  player.eventChoices = [];
  await disableMessageComponents(interaction.channel, interaction.message?.id).catch(() => {});
  const enteringBattle = enteringBattleNow;
  if (!enteringBattle) {
    const passiveHeal = applyPassivePetRecovery(pet, PET_PASSIVE_HEAL_PER_STORY_TURN);
    if (passiveHeal > 0) {
      result.passivePetHeal = passiveHeal;
      queueMemory({
        type: '恢復',
        content: `${pet.name} 在行進中恢復`,
        outcome: `HP +${passiveHeal}`,
        importance: 1,
        tags: ['pet_heal', 'passive_regen']
      });
      PET.savePet(pet);
    }
  }
  
  if (enteringBattle) {
    const preBattleStory = composeActionBridgeStory(
      player,
      selectedChoice,
      String(result?.message || event?.desc || '').trim()
    );
    const enemy = buildEnemyForBattle(
      event,
      result,
      player,
      result?.isMentorSpar ? { skipBeginnerDanger: true } : undefined
    );
    publishBattleWorldEvent(player, enemy?.name || event?.npcName || '未知敵人', 'battle_start');
    if (shouldCountCombatForLocationStory(event, result, enemy)) {
      markCurrentLocationStoryBattleDone(player, {
        npcId: String(event?.npcId || result?.npcId || enemy?.id || '').trim(),
        npcName: String(event?.npcName || result?.npcName || enemy?.name || '').trim(),
        enemyId: String(enemy?.id || '').trim(),
        enemyName: String(enemy?.name || '').trim()
      });
      syncCurrentIslandStoryProgress(player);
    }
    const mentorSparState = result?.isMentorSpar ? { ...(result?.mentorSpar || {}) } : null;
    const fighterType = CORE.canPetFight(pet) ? 'pet' : 'player';
    const battleEstimate = estimateBattleOutcome(player, pet, enemy, fighterType);
    const fighterLabel = fighterType === 'pet'
      ? `🐾 ${pet.name}`
      : `🧍 ${player.name}(ATK 10)`;
    const enemyElementText = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
    const allyElementText = fighterType === 'pet'
      ? formatBattleElementDisplay(pet?.type || pet?.element || '')
      : '🧍 無屬性';
    const relationText = getBattleElementRelation(
      fighterType === 'pet' ? (pet?.type || pet?.element || '') : '',
      resolveEnemyBattleElement(enemy)
    ).text;
    const enemyPetLine = enemy?.npcPet
      ? `🐾 對手寵物：${enemy.npcPet.name}（${formatBattleElementDisplay(enemy.npcPet.element)}｜ATK ${enemy.npcPet.attack}${enemy.npcPet.newbieScaled ? '｜新手區調整' : ''}）\n`
      : '';
    const beginnerGuardText = enemy.beginnerBalanced
      ? '🛡️ 新手區保護：本場敵人能力已平衡調整\n'
      : '';
    const beginnerDangerText = enemy.beginnerDanger
      ? '⚠️ 危險提示：這是新手區中的偏強敵，建議先評估勝率再決定是否開戰。\n'
      : '';
    const mentorRuleText = mentorSparState
      ? `🤝 友誼賽規則：將導師壓到 ${Math.round(Number(mentorSparState.acceptHpRatio || MENTOR_SPAR_WIN_HP_RATIO) * 100)}% HP 以下即可通過試煉\n🩹 若你方寵物被打到 0，導師會立即治療回滿\n`
      : '';
    player.battleState = {
      enemy,
      fighter: fighterType,
      mode: null,
      fleeAttempts: 0,
      energy: 2,
      turn: 1,
      startedAt: Date.now(),
      sourceChoice: selectedChoice,
      preBattleStory,
      humanState: null,
      petState: null,
      activePetId: String(pet?.id || '').trim() || null,
      petStates: {},
      mentorSpar: mentorSparState
    };
    queueMemory({
      type: '戰鬥',
      content: `遭遇 ${enemy.name}`,
      outcome: '戰鬥開始',
      importance: 3,
      tags: ['battle_start']
    });
    player.currentStory = result?.message || event?.desc || `${selectedChoice}`;
    flushMemories();
    CORE.savePlayer(player);

    await interaction.deferUpdate().catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(0xff6600)
      .setDescription(
        `**戰鬥即將開始！**\n\n${player.currentStory}\n\n` +
        `👹 敵人：**${enemy.name}**\n` +
        `🏷️ 敵方屬性：${enemyElementText}\n` +
        `❤️ 敵方 HP：${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)}\n` +
        `⚔️ 敵方攻擊：${enemy.attack}\n` +
        `${enemyPetLine}` +
        `${fighterLabel} 出戰\n` +
        `🏷️ 我方屬性：${allyElementText}\n` +
        `${relationText}\n` +
        `⚡ 戰鬥能量規則：每回合 +2，可結轉到下一回合\n` +
        `${beginnerGuardText}\n` +
        `${beginnerDangerText}` +
        `${mentorRuleText}` +
        `📊 **勝率預估：${battleEstimate.rank}（約 ${format1(battleEstimate.winRate)}%）**（模擬 ${battleEstimate.simulations || BATTLE_ESTIMATE_SIMULATIONS} 場）\n` +
        `你方平均傷害 ${battleEstimate.avgPlayerDamage}/回合，預計 ${battleEstimate.turnsToWin} 回合擊倒敵人\n` +
        `敵方平均傷害 ${format1(battleEstimate.enemyDamage)}/回合，預計 ${format1(battleEstimate.turnsToLose)} 回合擊倒你方\n\n` +
        `請選擇戰鬥模式：`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_mode_manual').setLabel('⚔️ 手動戰鬥').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('battle_mode_ai').setLabel('🤖 AI戰鬥').setStyle(ButtonStyle.Primary)
    );

    const battlePromptMsg = await interaction.channel.send({ embeds: [embed], components: [row] });
    trackActiveGameMessage(player, interaction.channel?.id, battlePromptMsg.id);
    await disableMessageComponents(interaction.channel, interaction.message?.id);
    return;
  }
  
  const previousOutcomeText = String(result?.message || event?.desc || '').trim();
  player.currentStory = composeActionBridgeStory(player, selectedChoice, previousOutcomeText);
  flushMemories();
  startGenerationState(player, {
    source: 'event',
    phase: 'memory_context',
    sourceChoice: selectedChoice,
    storySnapshot: player.currentStory || '',
    choicesSnapshot: []
  });
  CORE.savePlayer(player);

  // 先立即 ACK 互動，避免使用者看到「此交互失敗」或長時間無回應。
  await interaction.deferUpdate().catch(() => {});
  
  // 取得記憶上下文
  let memoryContext = '';
  try {
    const memStartedAt = Date.now();
    const memoryQueryText = [
      `剛選擇:${selectedChoice}`,
      `當前地點:${player.location || ''}`,
      `勢力目擊:${getFactionPresenceHintForPlayer(player)}`,
      `前一段故事:${player.currentStory || ''}`
    ].join('\n');
    const [playerMemoryContext, npcMemoryContext] = await Promise.all([
      CORE.getPlayerMemoryContextAsync(user.id, {
        location: player.location,
        previousChoice: selectedChoice,
        previousStory: player.currentStory || '',
        queryText: memoryQueryText,
        topK: 8
      }),
      CORE.getNearbyNpcMemoryContextAsync(user.id, {
        location: player.location,
        queryText: memoryQueryText,
        limit: 1,
        topKPrivate: 3,
        topKPublic: 2,
        maxChars: 980
      })
    ]);
    memoryContext = String(playerMemoryContext || '');
    if (npcMemoryContext) {
      memoryContext = [memoryContext, npcMemoryContext].filter(Boolean).join('\n\n');
    }
    console.log(`[Perf][event] memory_context ${Date.now() - memStartedAt}ms`);
  } catch (memErr) {
    finishGenerationState(player, 'failed', {
      phase: 'memory_failed',
      error: memErr?.message || memErr,
      storySnapshot: player.currentStory,
      choicesSnapshot: player.eventChoices
    });
    CORE.savePlayer(player);
    const failMsg = await editOrSendFallback(interaction.channel, interaction.message, {
      content: `❌ 記憶系統錯誤：${memErr.message}\n請檢查 OpenAI Embedding 設定（此模式不會自動降級）。若剛更新 .env，請重啟機器人後再試。`,
      embeds: [],
      components: buildRetryGenerationComponents()
    }, 'event.memory_error');
    if (failMsg?.id) {
      trackActiveGameMessage(player, interaction.channel?.id, failMsg.id);
    }
    return;
  }
  
  const uiText = getAdventureText(player.language || 'zh-TW');
  const statusBar = buildMainStatusBar(player, pet, player.language || 'zh-TW');
  const eventMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
  
  // 發送一個「AI 正在思考」的訊息（帶上舊 story，讓 continuity 明顯）
  // choices 變數在 eventChoices 清除前就 capture 了，所以仍有效
  const prevStory = player.currentStory || '(故事載入中...)';
  const prevOptionsText = buildChoiceOptionsText(normalizeEventChoices(player, choices), { player, pet });

  const loadingMsg = await interaction.channel.send({
    content: null,
    embeds: [{
      title: `⚔️ ${player.name} - ${pet.name}`,
      color: getAlignmentColor(player.alignment),
      description: `**${uiText.statusLabel}：【${statusBar}】**${eventMainlineLine ? `\n${eventMainlineLine}` : ''}\n\n**${uiText.lastChoice}：** ${selectedChoice}\n\n⏳ *AI 說書人正在構思新故事...*\n\n**${uiText.sectionPrevStory}：**\n${prevStory}${prevOptionsText ? `\n\n**${uiText.sectionUpcomingChoices}：**${prevOptionsText}` : ''}`
    }]
  });

  trackActiveGameMessage(player, interaction.channel?.id, loadingMsg.id);
  updateGenerationState(player, {
    phase: 'loading',
    loadingMessageId: loadingMsg.id
  });
  CORE.savePlayer(player);
  const stopLoadingAnimation = startLoadingAnimation(loadingMsg, 'AI 說書人正在構思新故事');
  const stopTypingIndicator = startTypingIndicator(interaction.channel);
  
  // 背景 AI 生成：先出故事，再補按鈕
  (async () => {
    try {
      updateGenerationState(player, { phase: 'generating_story' });
      CORE.savePlayer(player);
      let storyText = await STORY.generateStory(
        event,
        player,
        pet,
        {
          name: event?.name || '',
          choice: selectedChoice,
          desc: previousOutcomeText || event?.desc || '',
          action: event?.action || '',
          outcome: previousOutcomeText || '',
          pendingLoot: pendingStoryLoot
            ? {
              name: String(pendingStoryLoot.name || '').trim(),
              rarity: String(pendingStoryLoot.rarity || '').trim(),
              value: Math.max(1, Math.floor(Number(pendingStoryLoot.value || 0))),
              category: String(pendingStoryLoot.category || '').trim()
            }
            : null,
          turnMoveSummary: result?.autoTravel?.fromLocation && result?.autoTravel?.targetLocation
            ? `${String(result.autoTravel.fromLocation).trim()} → ${String(result.autoTravel.targetLocation).trim()}`
            : '',
          mainlineGoal: eventMainlineGoal,
          mainlineProgress: eventMainlineProgress,
          mainlineStage: eventMainlineStage,
          mainlineStageCount: eventMainlineStageCount
        },
        memoryContext
      );
      if (!storyText) {
        stopLoadingAnimation();
        finishGenerationState(player, 'failed', {
          phase: 'story_empty',
          error: 'AI story generation failed (empty result)',
          storySnapshot: player.currentStory,
          choicesSnapshot: []
        });
        CORE.savePlayer(player);
        const failStoryMsg = await editOrSendFallback(interaction.channel, loadingMsg, {
          content: '❌ AI 生成失敗，請點「重新生成」再試。',
          embeds: [],
          components: buildRetryGenerationComponents()
        }, 'event.story_empty');
        if (failStoryMsg?.id) {
          trackActiveGameMessage(player, interaction.channel?.id, failStoryMsg.id);
        }
        return;
      }

      if (pendingStoryLoot && storyMentionsLoot(storyText, pendingStoryLoot)) {
        ECON.addTradeGood(player, pendingStoryLoot);
        result.loot = pendingStoryLoot;
        rememberPlayer(player, {
          type: '戰利品',
          content: pendingStoryLoot.name,
          outcome: `${pendingStoryLoot.rarity}｜估值 ${pendingStoryLoot.value} Rns 代幣`,
          importance: 2,
          tags: ['loot', String(pendingStoryLoot.category || 'goods')]
        });
      }

      player.currentStory = storyText;
      if (getMainlineBridgeLock(player, { autoClear: true })) {
        consumeMainlineBridgeLock(player);
      }
      player.eventChoices = [];
      const rememberStats = rememberStoryDialogues(player, storyText);
      if ((rememberStats?.quotes || 0) > 0 || (rememberStats?.mainline || 0) > 0) {
        console.log(
          `[StoryQuote] event quotes=${rememberStats?.quotes || 0} dialoguePins=${rememberStats?.dialoguePins || 0} mainlinePins=${rememberStats?.mainline || 0} player=${player.id}`
        );
      }
      updateGenerationState(player, {
        phase: 'story_ready',
        storySnapshot: storyText,
        choicesSnapshot: []
      });
      CORE.savePlayer(player);

      const rewardText = [];
      const movedFrom = String(result?.autoTravel?.fromLocation || '').trim();
      const movedTo = String(result?.autoTravel?.targetLocation || '').trim();
      const hasMovedThisTurn = movedFrom && movedTo && !Boolean(result?.autoTravel?.blocked);
      if (hasMovedThisTurn) {
        const moveLine = `🧭 本回合移動：${movedFrom} → ${movedTo}`;
        if (result?.loot?.name) {
          rewardText.push(`${moveLine} | 🧰 ${result.loot.name}（${result.loot.rarity || '普通'}）`);
        } else {
          rewardText.push(moveLine);
        }
      }
      if (result.gold) rewardText.push(`💰 +${result.gold} Rns 代幣`);
      if (result.wantedLevel) rewardText.push(`⚠️ 通緝等级: ${result.wantedLevel}`);
      if (result.soldCount > 0) rewardText.push(`🏪 已售出 ${result.soldCount} 件`);
      if (result.item && result.success) rewardText.push(`📦 取得 ${result.item}`);
      if (result.petRevived) rewardText.push(`🐾 ${pet.name} 復活完成（2回合制）`);
      if (Number(result?.passivePetHeal || 0) > 0) rewardText.push(`🩹 ${pet.name} 行進恢復 +${Number(result.passivePetHeal)} HP`);
      if (Number.isFinite(Number(result.digitalRiskScore))) {
        const score = Number(result.digitalRiskScore);
        const delta = Number(result.digitalRiskDelta || 0);
        const digitalMasked = Boolean(result?.digitalMasked || isDigitalMaskPhaseForPlayer(player));
        rewardText.push(
          digitalMasked
            ? `🧠 市場異常指標 ${score}/100${delta > 0 ? `（+${delta}）` : ''}`
            : `🧠 Digital 詐價風險提示累積值 ${score}/100${delta > 0 ? `（+${delta}）` : ''}`
        );
      }

      const worldEvents = getMergedWorldEvents(5);
      let worldEventsText = '';
      if (worldEvents.length > 0) {
        worldEventsText = `\n\n**${uiText.sectionWorldEvents}：**\n` + worldEvents.map(e => e.message || e).join('\n');
      }
      const portalGuideText = extraStoryGuide || (player.portalMenuOpen ? buildPortalUsageGuide(player) : '');
      const portalGuideBlock = portalGuideText ? `\n\n${portalGuideText}` : '';

      const storyOnlyMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
      const storyOnlyDesc =
        `**${uiText.statusLabel}：【${statusBar}】**${storyOnlyMainlineLine ? `\n${storyOnlyMainlineLine}` : ''}\n\n**${uiText.lastChoice}：** ${selectedChoice}\n\n${storyText}` +
        `${rewardText.length > 0 ? '\n\n' + rewardText.join(' | ') : ''}` +
        `${worldEventsText}${portalGuideBlock}\n\n⏳ *故事已送達，正在生成選項...*`;

      const storyOnlyEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(getAlignmentColor(player.alignment))
        .setDescription(storyOnlyDesc)
        .addFields(
          { name: '🐾 寵物', value: `${pet.name} (${getPetElementDisplayName(pet.type)})`, inline: true },
          { name: '⚔️ 氣血', value: formatPetHpWithRecovery(pet), inline: true },
          { name: '💰 Rns 代幣', value: String(player.stats.財富), inline: true }
        );

      stopLoadingAnimation();
      const storyOnlyMsg = await editOrSendFallback(
        interaction.channel,
        loadingMsg,
        { content: null, embeds: [storyOnlyEmbed], components: [] },
        'event.story_only'
      );
      if (storyOnlyMsg?.id) {
        trackActiveGameMessage(player, interaction.channel?.id, storyOnlyMsg.id);
      }

      updateGenerationState(player, {
        phase: 'generating_choices',
        loadingMessageId: storyOnlyMsg?.id || loadingMsg?.id || null
      });
      CORE.savePlayer(player);
      const aiChoices = await STORY.generateChoicesWithAI(player, pet, storyText, memoryContext);
      if (!aiChoices || aiChoices.length === 0) {
        finishGenerationState(player, 'failed', {
          phase: 'choice_empty',
          error: 'AI choice generation failed (empty result)',
          storySnapshot: storyText,
          choicesSnapshot: []
        });
        CORE.savePlayer(player);
        const failChoicesMsg = await editOrSendFallback(interaction.channel, storyOnlyMsg || loadingMsg, {
          content: '⚠️ 故事已生成，但選項生成失敗，請點「重新生成」。',
          embeds: [storyOnlyEmbed],
          components: buildRetryGenerationComponents()
        }, 'event.choice_empty');
        if (failChoicesMsg?.id) {
          trackActiveGameMessage(player, interaction.channel?.id, failChoicesMsg.id);
        }
        return;
      }

      player.eventChoices = applyChoicePolicy(
        player,
        maybeInjectRareCustomInputChoice(normalizeEventChoices(player, aiChoices))
      );
      updateGenerationState(player, {
        phase: 'choices_ready',
        storySnapshot: storyText,
        choicesSnapshot: player.eventChoices
      });
      finishGenerationState(player, 'done', {
        phase: 'completed',
        storySnapshot: storyText,
        choicesSnapshot: player.eventChoices
      });
      CORE.savePlayer(player);

      const newChoices = player.eventChoices;
      const optionsText = buildChoiceOptionsText(newChoices, { player, pet });

      const finalMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
      const description =
        `**${uiText.statusLabel}：【${statusBar}】**${finalMainlineLine ? `\n${finalMainlineLine}` : ''}\n\n**${uiText.lastChoice}：** ${selectedChoice}\n\n${storyText}` +
        `${rewardText.length > 0 ? '\n\n' + rewardText.join(' | ') : ''}` +
        `${worldEventsText}${portalGuideBlock}\n\n**${uiText.sectionNewChoices}：**${optionsText}\n\n_${uiText.chooseNumber(CHOICE_DISPLAY_COUNT)}_`;

      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(getAlignmentColor(player.alignment))
        .setDescription(description)
        .addFields(
          { name: '🐾 寵物', value: `${pet.name} (${getPetElementDisplayName(pet.type)})`, inline: true },
          { name: '⚔️ 氣血', value: formatPetHpWithRecovery(pet), inline: true },
          { name: '💰 Rns 代幣', value: String(player.stats.財富), inline: true }
        );

      const buttons = buildEventChoiceButtons(newChoices, player.id);
      appendMainMenuUtilityButtons(buttons, player);

      const components = [];
      for (let i = 0; i < buttons.length; i += 5) {
        components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      const finalStoryMsg = await editOrSendFallback(
        interaction.channel,
        storyOnlyMsg || loadingMsg,
        { content: null, embeds: [embed], components },
        'event.final_story'
      );
      if (finalStoryMsg?.id) {
        trackActiveGameMessage(player, interaction.channel?.id, finalStoryMsg.id);
      }
      triggerMainlineForeshadowAIInBackground(player, {
        phase: 'event',
        storyText,
        previousAction: selectedChoice,
        location: player.location,
        playerLang: player.language
      });
    } catch (err) {
      stopLoadingAnimation();
      console.error('[事件] 處理失敗:', err);
      finishGenerationState(player, 'failed', {
        phase: 'exception',
        error: err?.message || err,
        storySnapshot: player.currentStory,
        choicesSnapshot: player.eventChoices
      });
      CORE.savePlayer(player);
      const eventFailMsg = await editOrSendFallback(interaction.channel, loadingMsg, {
        content: `❌ 事件處理失敗：${err?.message || err}\n請點「重新生成」再試。`,
        embeds: [],
        components: buildRetryGenerationComponents()
      }, 'event.fail');
      if (eventFailMsg?.id) {
        trackActiveGameMessage(player, interaction.channel?.id, eventFailMsg.id);
      }
    } finally {
      stopTypingIndicator();
      releaseStoryLock(playerId);
    }
  })();

  releaseInScope = false;
  return;
  } finally {
    if (releaseInScope) {
      releaseStoryLock(playerId);
    }
  }
}

  return {
    handleEvent
  };
}

module.exports = {
  createEventHandlerUtils
};
