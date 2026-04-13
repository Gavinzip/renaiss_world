function registerInteractionDispatcher(CLIENT, deps = {}) {
  const {
    CORE,
    PET,
    ECON,
    SHOP_HAGGLE_OFFER_TTL_MS,
    FRIEND_DUEL_ONLINE_TURN_MS,
    TELEPORT_DEVICE_COST,
    TELEPORT_DEVICE_DURATION_HOURS,
    TELEPORT_DEVICE_STOCK_LIMIT,
    rejectIfNotThreadOwner,
    rejectIfNotLatestThread,
    saveMapReturnSnapshot,
    createButtonInteractionTemplateContext,
    attachButtonTemplateReplyAutoRestore,
    lockPressedButtonImmediately,
    handleBattleSwitchSelect,
    handleMapRegionMoveSelect,
    handleMovesSelectMenu,
    handleMarketSelectMenu,
    handleWalletInteractions,
    handleClaimPetInteractions,
    handleFriendInteractions,
    parseMarketTypeFromCustomId,
    getMarketTypeLabel,
    handleMarketPostModal,
    handleWorldShopSellModal,
    normalizeCharacterName,
    getPlayerTempData,
    setPlayerTempData,
    buildElementSelectionPayload,
    normalizeCharacterGender,
    normalizePetElementCode,
    normalizePetName,
    createCharacterWithName,
    parseNameSubmitProfileFromCustomId,
    handleEvent,
    handleChooseGender,
    handleChoosePetElement,
    handleLegacyAlignmentChoice,
    sendOnboardingLanguageSelection,
    handleHatchEgg,
    handleDrawMove,
    showFriendsMenu,
    composePostBattleStory,
    queuePendingStoryTrigger,
    rememberPlayer,
    publishBattleWorldEvent,
    sendMainMenuToThread,
    showMainMenu,
    disableMessageComponents,
    showSettingsHub,
    showSettings,
    showRenaissWorldGuide,
    resumeExistingOnboardingOrGame,
    buildGenderSelectionPayload,
    showCharacter,
    showFriendAddModal,
    acceptFriendRequest,
    getPlayerDisplayNameById,
    cancelOutgoingFriendRequest,
    showFriendCharacter,
    startFriendDuel,
    abortFriendDuel,
    clearOnlineFriendDuelTimer,
    showIslandMap,
    getRegionLocationsByLocation,
    normalizeMapViewMode,
    getPlayerUILang,
    getMapText,
    showPortalSelection,
    showTeleportDeviceSelection,
    ensurePlayerIslandState,
    getPortalAccessContext,
    extractStoryTailLine,
    composeActionBridgeStory,
    syncLocationArcLocation,
    portalTeleportStory,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    consumeTeleportDevice,
    consumeMapReturnSnapshot,
    snapshotHasUsableComponents,
    trackActiveGameMessage,
    showFriendManualModePicker,
    startManualBattle,
    resolvePlayerMainPet,
    estimateBattleOutcome,
    formatBattleHpValue = (v) => String(Math.max(0, Number(v) || 0)),
    format1 = (v) => String(v ?? 0),
    formatBattleElementDisplay,
    resolveEnemyBattleElement,
    getBattleElementRelation,
    startManualBattleOnline,
    startAutoBattle,
    continueBattleWithHuman,
    handleFight,
    handleUseMove,
    handleOnlineFriendDuelChoice,
    toggleBattleLayoutMode,
    renderManualBattle,
    handleBattleWait,
    handleBattleSwitchOpen,
    handleBattleSwitchCancel,
    handleFlee,
    showMovesList,
    showPetEquipmentView,
    showInventory,
    showInventoryFusionLab,
    handleInventoryFusionSelect,
    handleInventoryFusionConfirm = async () => {},
    handleInventoryFusionClear = async () => {},
    showPlayerCodex,
    showNpcCodex,
    showSkillCodex,
    handlePetEquipmentEquipSelect = async () => {},
    handlePetEquipmentUnequipSelect = async () => {},
    showFinanceLedger,
    showMemoryAudit,
    showMemoryRecap,
    getQuickShopCooldownInfo,
    getTeleportDeviceStockInfo,
    openShopSession = () => {},
    showWorldShopScene,
    buildQuickShopNarrativeNotice,
    showPlayerMarketMenu,
    parseMarketAndPageFromCustomId,
    showPlayerMarketListings,
    showMyMarketListings,
    showWorldShopSellPicker,
    showWorldShopHagglePicker,
    showWorldShopHaggleBulkPicker,
    consumeHaggleBulkItemsFromPlayer,
    recordCashflow,
    consumeHaggleItemFromPlayer,
    extractPitchFromHaggleMessage,
    showWorldShopBuyPanel,
    playScratchLottery,
    grantTeleportDevice,
    formatTeleportDeviceRemaining = () => 'N/A',
    buyShopCrystal,
    leaveShopSession,
    showProfile,
    showGacha,
    handleGachaResult,
    handleAllocateHP,
    handleContinueWithWalletButton,
    handleEnterPetNameButton,
    handleSkipNameButton,
    handleNameSubmit,
    restoreButtonTemplateSnapshot,
    tryRecoverEventButtonsAfterFailure,
    tryRecoverMainMenuAfterFailure,
    normalizeEventChoices,
    applyChoicePolicy
  } = deps;

CLIENT.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;
  
  const { customId, user } = interaction;
  const perfStartedAt = Date.now();
  let perfFailed = false;
  let buttonTemplateContext = null;
  try {
    if (String(customId || '').startsWith('event_')) {
      console.log(
        `[Interaction] event button received cid=${customId} user=${String(user?.id || '')} ` +
        `channel=${String(interaction.channelId || '')} msg=${String(interaction.message?.id || '')}`
      );
    }

  if (await rejectIfNotThreadOwner(interaction, user.id)) {
    return;
  }

  if (await rejectIfNotLatestThread(interaction, user.id)) {
    return;
  }

  // 地圖返回需要保留原故事按鈕快照：進地圖前先保存
  if (interaction.isButton() && customId === 'open_map') {
    const player = CORE.loadPlayer(user.id);
    if (player && interaction.message) {
      saveMapReturnSnapshot(player, interaction.message);
    }
  }

  // 全域按鈕模板：按下先隱藏；若失敗由 catch 自動回補原按鈕。
  if (interaction.isButton()) {
    buttonTemplateContext = createButtonInteractionTemplateContext(interaction, customId);
    attachButtonTemplateReplyAutoRestore(interaction, buttonTemplateContext);
    if (buttonTemplateContext?.enabled && typeof lockPressedButtonImmediately === 'function') {
      await lockPressedButtonImmediately(interaction).catch(() => {});
    }
  }

  // ===== 招式配置下拉 =====
  if (interaction.isStringSelectMenu()) {
    if (customId === 'battle_switch_select') {
      const targetPetId = String(interaction.values?.[0] || '').trim();
      await handleBattleSwitchSelect(interaction, user, targetPetId);
      return;
    }

    if (customId.startsWith('pet_eq_equip_')) {
      await handlePetEquipmentEquipSelect(interaction, user, customId);
      return;
    }

    if (customId.startsWith('pet_eq_unequip_')) {
      await handlePetEquipmentUnequipSelect(interaction, user, customId);
      return;
    }

    if (await handleMapRegionMoveSelect(interaction, user, customId)) {
      return;
    }

    if (await handleMovesSelectMenu(interaction, user, customId)) {
      return;
    }

    if (customId.startsWith('inv_fusion_pick_')) {
      await handleInventoryFusionSelect(interaction, user, customId);
      return;
    }

    if (await handleMarketSelectMenu(interaction, user, customId)) {
      return;
    }
  }
  
  if (await handleWalletInteractions(interaction, user, customId)) {
    return;
  }

  if (await handleClaimPetInteractions(interaction, user, customId)) {
    return;
  }
  
  if (await handleFriendInteractions(interaction, user, customId)) {
    return;
  }

  if (customId.startsWith('pmkt_modal_sell_') || customId.startsWith('pmkt_modal_buy_')) {
    const listingType = customId.startsWith('pmkt_modal_buy_') ? 'buy' : 'sell';
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await handleMarketPostModal(interaction, user, listingType, marketType);
    return;
  }

  if (customId.startsWith('shop_sell_modal_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await handleWorldShopSellModal(interaction, user, marketType);
    return;
  }
  
  // ===== 新手：角色命名 Modal（性別後）=====
  if (customId.startsWith('char_name_submit_')) {
    const selectedGender = customId.endsWith('_female') ? '女' : '男';
    const playerNameInput = interaction.fields.getTextInputValue('player_name');
    const finalName = normalizeCharacterName(playerNameInput, user.username);
    const lang = getPlayerTempData(user.id, 'language') || 'zh-TW';
    setPlayerTempData(user.id, 'gender', selectedGender);
    setPlayerTempData(user.id, 'charName', finalName);
    const payload = buildElementSelectionPayload(lang, selectedGender);
    await interaction.reply({ embeds: [payload.embed], components: [payload.row] }).catch(async () => {
      await interaction.channel.send({ embeds: [payload.embed], components: [payload.row] }).catch(() => {});
    });
    return;
  }

  // ===== 新手：寵物命名 Modal（屬性後）=====
  if (customId === 'pet_onboard_name_submit') {
    const gender = normalizeCharacterGender(getPlayerTempData(user.id, 'gender') || '男');
    const element = normalizePetElementCode(getPlayerTempData(user.id, 'petElement') || '水');
    const charName = normalizeCharacterName(getPlayerTempData(user.id, 'charName') || user.username, user.username);
    const petName = normalizePetName(interaction.fields.getTextInputValue('pet_name'), element);
    await createCharacterWithName(interaction, user, { gender, element, alignment: '正派' }, charName, { petName });
    return;
  }

  // ===== 舊版相容：名字輸入 Modal =====
  if (customId.startsWith('name_submit_')) {
    const profile = parseNameSubmitProfileFromCustomId(customId);
    const charName = interaction.fields.getTextInputValue('player_name').trim();
    const finalName = charName || user.username;
    await createCharacterWithName(interaction, user, profile, finalName, {});
    return;
  }

  // ===== 許願池 Modal =====
  if (customId.startsWith('wish_pool_submit_')) {
    const idx = parseInt(customId.replace('wish_pool_submit_', ''), 10);
    const wishText = interaction.fields.getTextInputValue('wish_text')?.trim() || '';
    if (!wishText) {
      await interaction.reply({ content: '⚠️ 請輸入願望內容。', ephemeral: true }).catch(() => {});
      return;
    }
    await handleEvent(interaction, user, Number.isNaN(idx) ? 0 : idx, { wishText });
    return;
  }

  if (customId.startsWith('custom_action_submit_')) {
    const idx = parseInt(customId.replace('custom_action_submit_', ''), 10);
    const customActionText = interaction.fields.getTextInputValue('custom_action_text')?.trim() || '';
    if (!customActionText) {
      await interaction.reply({ content: '⚠️ 請輸入你想做的行動。', ephemeral: true }).catch(() => {});
      return;
    }
    await handleEvent(interaction, user, Number.isNaN(idx) ? 0 : idx, { customActionText });
    return;
  }
  
  // ===== 新手建立：性別 =====
  if (customId === 'choose_gender_male' || customId === 'choose_gender_female') {
    await handleChooseGender(interaction, user, customId);
    return;
  }

  // ===== 新手建立：寵物屬性 =====
  if (customId.startsWith('choose_element_')) {
    await handleChoosePetElement(interaction, user, customId);
    return;
  }

  // ===== 舊版相容：正派/機變派按鈕 =====
  if (customId === 'choose_positive' || customId === 'choose_negative') {
    await handleLegacyAlignmentChoice(interaction, user, customId);
    return;
  }

  if (customId === 'restart_onboarding') {
    await sendOnboardingLanguageSelection(interaction, user, { replaceCurrent: true });
    return;
  }
  
  // ===== 敲蛋孵化 =====
  if (customId === 'hatch_egg') {
    await handleHatchEgg(interaction, user);
    return;
  }
  
  // ===== 抽招式（真正的隨機）=====
  if (customId.startsWith('draw_move_')) {
    await handleDrawMove(interaction, user);
    return;
  }
  
  // ===== 主選單 =====
  if (customId === 'main_menu') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (player && pet) {
      if (player.pendingFriendDuelReturn) {
        player.pendingFriendDuelReturn = false;
        CORE.savePlayer(player);
        await showFriendsMenu(interaction, user, '已結束友誼戰，先返回好友頁。');
        return;
      }
      if (player.battleState) {
        if (player?.battleState?.friendDuel) {
          const fallbackPet = PET.loadPet(user.id);
          const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
          const activePet = petResolved?.pet || fallbackPet;
          if (typeof abortFriendDuel === 'function') {
            abortFriendDuel(player, activePet, { reason: '主動結束好友友誼戰（返回主選單）' });
          } else {
            player.battleState = null;
            CORE.savePlayer(player);
          }
          await showFriendsMenu(interaction, user, '已退出友誼戰，主線劇情不受影響。');
          return;
        }
        const enemyName = player.battleState?.enemy?.name || '敵人';
        const sourceChoice = String(player.battleState?.sourceChoice || '').trim();
        const preBattleStory = String(player.battleState?.preBattleStory || player.currentStory || '').trim();
        player.currentStory = composePostBattleStory(
          player,
          `⚠️ 你暫時脫離與 **${enemyName}** 的交戰，先拉開距離重整節奏。`,
          '',
          '你決定先觀察局勢，再選擇下一步行動。',
          sourceChoice,
          preBattleStory
        );
        queuePendingStoryTrigger(player, {
          name: '撤離交戰',
          choice: sourceChoice || `與${enemyName}交戰`,
          desc: `你從 ${enemyName} 戰線暫退`,
          action: 'battle_retreat',
          outcome: '你先觀察局勢，再決定下一步。'
        });
        player.eventChoices = [];
        rememberPlayer(player, {
          type: '戰鬥',
          content: `從 ${enemyName} 戰線撤離`,
          outcome: '回到冒險流程',
          importance: 2,
          tags: ['battle', 'retreat']
        });
        publishBattleWorldEvent(player, enemyName, 'battle_flee', '主動脫離當前戰線');
        player.battleState = null;
        CORE.savePlayer(player);
      }
      // 在 thread 裡用 sendMainMenuToThread，在外面用 showMainMenu
      if (interaction.channel?.isThread()) {
        await interaction.deferUpdate().catch(() => {});
        await sendMainMenuToThread(interaction.channel, player, pet, interaction);
      } else {
        await showMainMenu(interaction, player, pet);
      }
    }
    return;
  }

  if (customId === 'retry_story_generation') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player || !pet || !interaction.channel?.isThread()) {
      await interaction.reply({ content: '⚠️ 請在遊戲討論串中使用此按鈕。', ephemeral: true }).catch(() => {});
      return;
    }

    await interaction.deferUpdate().catch(() => {});
    await sendMainMenuToThread(interaction.channel, player, pet, interaction);
    return;
  }
  
  // ===== 設置 =====
  if (customId === 'open_settings') {
    const player = CORE.loadPlayer(user.id);
    if (player?.activeMessageId) {
      await disableMessageComponents(interaction.channel, player.activeMessageId);
    }
    await showSettingsHub(interaction, user);
    return;
  }

  if (customId === 'open_settings_system') {
    await showSettings(interaction, user);
    return;
  }

  if (customId === 'open_renaiss_world') {
    await showRenaissWorldGuide(interaction, user);
    return;
  }

  if (customId === 'world_back_settings') {
    await showSettings(interaction, user);
    return;
  }
  
  // ===== 選擇語言（首次）=====
  if (customId.startsWith('select_lang_')) {
    if (CORE.loadPlayer(user.id) && PET.loadPet(user.id)) {
      await interaction.message?.edit({ components: [] }).catch(() => {});
      await resumeExistingOnboardingOrGame(interaction, user);
      return;
    }

    const lang = customId.replace('select_lang_', '');
    // 儲存語言到內存，等創建角色後寫入
    setPlayerTempData(user.id, 'language', lang);
    
    // 立即鎖住本則語言按鈕，避免重複觸發
    await interaction.update({ components: [] }).catch(async () => {
      await interaction.deferUpdate().catch(() => {});
    });
    
    const payload = buildGenderSelectionPayload(lang, user.username);
    await interaction.channel.send({ embeds: [payload.embed], components: [payload.row] });
    return;
  }
  
  // ===== 設置頁面切換語言 =====
  if (customId === 'lang_zh' || customId === 'lang_en' || customId === 'lang_zh-CN' || customId === 'lang_zh-TW') {
    const player = CORE.loadPlayer(user.id);
    if (player) {
      const langMap = { 'lang_zh': 'zh-TW', 'lang_en': 'en', 'lang_zh-CN': 'zh-CN', 'lang_zh-TW': 'zh-TW' };
      player.language = langMap[customId] || 'zh-TW';
      CORE.savePlayer(player);
    }
    await showSettings(interaction, user);
    return;
  }

  // ===== Bug 2 Fix: Settings back button - restore game message =====
  if (customId === 'settings_back') {
    await showSettingsHub(interaction, user);
    return;
  }
  
  // ===== 角色資訊 =====
  if (customId === 'open_character') {
    await showCharacter(interaction, user);
    return;
  }

  if (customId === 'open_friends') {
    const player = CORE.loadPlayer(user.id);
    if (player?.pendingFriendDuelReturn) {
      player.pendingFriendDuelReturn = false;
      CORE.savePlayer(player);
    }
    await showFriendsMenu(interaction, user);
    return;
  }

  if (customId === 'friend_refresh') {
    await showFriendsMenu(interaction, user);
    return;
  }

  if (customId === 'open_friend_add_modal') {
    await showFriendAddModal(interaction);
    return;
  }

  if (customId.startsWith('friend_accept_')) {
    const requesterId = customId.replace('friend_accept_', '').trim();
    const result = acceptFriendRequest(user.id, requesterId);
    const name = getPlayerDisplayNameById(requesterId);
    const notice = result.ok ? `你已與 ${name} 成為好友。` : `無法同意申請：${name}`;
    await showFriendsMenu(interaction, user, notice);
    return;
  }

  if (customId.startsWith('friend_cancel_')) {
    const targetId = customId.replace('friend_cancel_', '').trim();
    const result = cancelOutgoingFriendRequest(user.id, targetId);
    const name = getPlayerDisplayNameById(targetId);
    const notice = result.ok ? `已撤回給 ${name} 的好友申請。` : `沒有可撤回的申請：${name}`;
    await showFriendsMenu(interaction, user, notice);
    return;
  }

  if (customId.startsWith('friend_view_')) {
    const targetId = customId.replace('friend_view_', '').trim();
    await showFriendCharacter(interaction, user, targetId);
    return;
  }

  if (customId.startsWith('friend_duel_')) {
    const targetId = customId.replace('friend_duel_', '').trim();
    await interaction.deferUpdate().catch(() => {});
    try {
      await startFriendDuel(interaction, user, targetId);
    } catch (err) {
      console.error('[FriendDuel] start failed:', err?.message || err);
      const player = CORE.loadPlayer(user.id);
      if (player?.battleState) {
        const previousOnlineRoomId = String(player?.battleState?.friendDuel?.online?.roomId || '').trim();
        if (previousOnlineRoomId) clearOnlineFriendDuelTimer(previousOnlineRoomId);
        player.battleState = null;
        CORE.savePlayer(player);
      }
      await interaction.followUp({
        content: '⚠️ 友誼戰啟動失敗，已重置舊對戰狀態。請再按一次「發起友誼戰」。',
        ephemeral: true
      }).catch(() => {});
    }
    return;
  }

  if (customId === 'open_map') {
    await showIslandMap(interaction, user, 0);
    return;
  }

  if (customId.startsWith('map_view_')) {
    const match = String(customId).match(/^map_view_(text|ascii)(?:_(\d+))?$/);
    const mode = normalizeMapViewMode(match?.[1] || 'text');
    const page = Number.parseInt(match?.[2] || '0', 10);
    const safePage = Number.isNaN(page) ? 0 : page;
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    if (player) {
      player.mapViewMode = mode;
      CORE.savePlayer(player);
    }
    await showIslandMap(
      interaction,
      user,
      safePage,
      (mode === 'ascii' ? tx.mapModeSwitchAscii : tx.mapModeSwitchText)
    );
    return;
  }

  if (customId.startsWith('map_page_')) {
    const page = parseInt(customId.split('_')[2]);
    await showIslandMap(interaction, user, Number.isNaN(page) ? 0 : page);
    return;
  }

  if (customId === 'map_open_portal') {
    await showPortalSelection(interaction, user);
    return;
  }

  if (customId === 'map_open_device') {
    await showTeleportDeviceSelection(interaction, user);
    return;
  }

  if (customId.startsWith('portal_jump_')) {
    const idx = parseInt(customId.replace('portal_jump_', ''), 10);
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    if (!player) {
      await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
      return;
    }
    ensurePlayerIslandState(player);

    const access = getPortalAccessContext(player);
    if (!access.atPortalHub) {
      await interaction.reply({ content: tx.portalNotReady, ephemeral: true }).catch(() => {});
      return;
    }
    if (!access.crossRegionUnlocked) {
      await interaction.reply({ content: tx.portalStoryLocked, ephemeral: true }).catch(() => {});
      return;
    }
    const destinations = Array.isArray(access.destinations) ? access.destinations : [];
    const targetLocation = destinations[Number.isNaN(idx) ? -1 : idx];
    if (!targetLocation) {
      await interaction.reply({ content: tx.portalInvalidDestination, ephemeral: true }).catch(() => {});
      return;
    }

    const fromLocation = player.location;
    const preTeleportStory = String(player.currentStory || '').trim();
    const carryTail = extractStoryTailLine(preTeleportStory, 140);
    player.location = targetLocation;
    syncLocationArcLocation(player);
    ensurePlayerIslandState(player);
    player.portalMenuOpen = false;
    player.navigationTarget = '';
    const transferLine = tx.portalTeleportStory(fromLocation, targetLocation, carryTail);
    player.currentStory = composeActionBridgeStory(
      { currentStory: preTeleportStory },
      `啟動主傳送門由${fromLocation}前往${targetLocation}`,
      transferLine
    );
    queuePendingStoryTrigger(player, {
      name: '跨區傳送後承接',
      choice: `由${fromLocation}傳送至${targetLocation}，並延續上一段線索`,
      desc: `本回合必須先承接 ${fromLocation} 的當前情勢，再寫傳送過程，最後在 ${targetLocation} 落地接續`,
      action: 'portal_jump_followup',
      outcome: `跨區傳送完成：${fromLocation} -> ${targetLocation}｜傳送前最後情境：${carryTail || '（無）'}`
    });
    player.eventChoices = [];
    if (player.mapReturnSnapshot) delete player.mapReturnSnapshot;
    rememberPlayer(player, {
      type: '移動',
      content: `啟動傳送門由${fromLocation}前往${targetLocation}`,
      outcome: '完成傳送',
      importance: 2,
      tags: ['travel', 'portal', 'teleport']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(tx.portalDoneTitle)
      .setColor(0x7b68ee)
      .setDescription(tx.portalDoneDesc(fromLocation, targetLocation));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.portalBackStory).setStyle(ButtonStyle.Success)
    );
    await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    return;
  }

  if (customId.startsWith('device_jump_')) {
    const idx = parseInt(customId.replace('device_jump_', ''), 10);
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    if (!player) {
      await interaction.reply({ content: tx.mapNotFoundPlayer, ephemeral: true }).catch(() => {});
      return;
    }
    const stockInfo = getTeleportDeviceStockInfo(player);
    if (stockInfo.count <= 0) {
      await interaction.reply({ content: tx.deviceNotOwned, ephemeral: true }).catch(() => {});
      return;
    }
    const destinations = typeof getRegionLocationsByLocation === 'function'
      ? getRegionLocationsByLocation(player.location || '')
      : [];
    const targetLocation = Array.isArray(destinations) ? destinations[Number.isNaN(idx) ? -1 : idx] : null;
    if (!targetLocation) {
      await interaction.reply({ content: tx.deviceInvalidDestination, ephemeral: true }).catch(() => {});
      return;
    }
    if (String(targetLocation || '').trim() === String(player.location || '').trim()) {
      await interaction.reply({ content: tx.deviceAlreadyHere(targetLocation), ephemeral: true }).catch(() => {});
      return;
    }

    const fromLocation = String(player.location || '').trim();
    const preTeleportStory = String(player.currentStory || '').trim();
    const carryTail = extractStoryTailLine(preTeleportStory, 140);
    const consumed = consumeTeleportDevice(player);
    if (!consumed) {
      await interaction.reply({ content: tx.deviceNotOwned, ephemeral: true }).catch(() => {});
      return;
    }
    player.location = targetLocation;
    syncLocationArcLocation(player);
    ensurePlayerIslandState(player);
    player.navigationTarget = '';
    const transferLine = tx.deviceTeleportStory(fromLocation, targetLocation, carryTail);
    player.currentStory = composeActionBridgeStory(
      { currentStory: preTeleportStory },
      `啟動傳送裝置由${fromLocation}前往${targetLocation}`,
      transferLine
    );
    queuePendingStoryTrigger(player, {
      name: '同島傳送後承接',
      choice: `由${fromLocation}傳送裝置移動至${targetLocation}，並延續上一段線索`,
      desc: `本回合必須先承接 ${fromLocation} 的當前情勢，再寫傳送過程，最後在 ${targetLocation} 落地接續`,
      action: 'device_jump_followup',
      outcome: `同島傳送完成：${fromLocation} -> ${targetLocation}｜傳送前最後情境：${carryTail || '（無）'}`
    });
    player.eventChoices = [];
    if (player.mapReturnSnapshot) delete player.mapReturnSnapshot;
    rememberPlayer(player, {
      type: '移動',
      content: `啟動傳送裝置由${fromLocation}前往${targetLocation}`,
      outcome: `同島瞬間位移完成（剩餘 ${consumed.remainingCount}）`,
      importance: 2,
      tags: ['travel', 'teleport_device', 'intra_region']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(tx.deviceDoneTitle)
      .setColor(0x22c55e)
      .setDescription(tx.deviceDoneDesc(fromLocation, targetLocation, consumed.remainingCount));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('map_back_main').setLabel(tx.deviceBackStory).setStyle(ButtonStyle.Success)
    );
    await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    return;
  }

  if (customId.startsWith('map_goto_')) {
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    await interaction.reply({
      content: tx.mapGotoHint,
      ephemeral: true
    }).catch(() => {});
    return;
  }

  if (customId === 'map_back_main') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getMapText(uiLang);
    if (!player || !pet || !interaction.channel?.isThread()) {
      await interaction.reply({ content: tx.mapUseInThread, ephemeral: true }).catch(() => {});
      return;
    }

    const snapshot = consumeMapReturnSnapshot(player, interaction.message?.id);
    if (snapshot && snapshotHasUsableComponents(snapshot)) {
      const restored = await interaction
        .update({
          content: snapshot.content,
          embeds: snapshot.embeds,
          components: snapshot.components
        })
        .then(() => true)
        .catch(() => false);
      if (restored && interaction.message?.id) {
        trackActiveGameMessage(player, interaction.channel?.id, interaction.message.id);
        return;
      }
    }

    await interaction.deferUpdate().catch(() => {});
    await sendMainMenuToThread(interaction.channel, player, pet, interaction);
    await interaction.message.delete().catch(() => {});
    return;
  }
  
  // ===== 事件按鈕 =====
  if (customId.startsWith('event_')) {
    const match = String(customId || '').match(/^event_(\d+)(?:_(\d+))?$/);
    if (!match) {
      await interaction.reply({ content: '⚠️ 選項格式錯誤，請點最新選項。', ephemeral: true }).catch(() => {});
      return;
    }
    const idx = Number.parseInt(match[1], 10);
    if (Number.isNaN(idx)) {
      await interaction.reply({ content: '⚠️ 選項索引錯誤，請重試。', ephemeral: true }).catch(() => {});
      return;
    }
    const ownerIdFromButton = String(match[2] || '').trim();
    if (ownerIdFromButton && ownerIdFromButton !== String(user.id || '')) {
      await interaction.reply({ content: '⚠️ 這不是你的選項按鈕。', ephemeral: true }).catch(() => {});
      return;
    }

    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '⚠️ 找不到角色資料，請使用 /start 重新開始', ephemeral: true });
      return;
    }

    if (player.activeThreadId && interaction.channelId !== player.activeThreadId) {
      await interaction.reply({ content: '⚠️ 這是舊討論串，請到最新討論串操作。', ephemeral: true });
      return;
    }

    if (
      player.activeMessageId &&
      !player.activeMessageId.startsWith('instant_') &&
      interaction.message?.id !== player.activeMessageId
    ) {
      await interaction.reply({ content: '⚠️ 這個選項已過期，請點擊最新訊息中的選項。', ephemeral: true });
      return;
    }
    await handleEvent(interaction, user, idx);
    return;
  }

  if (customId === 'battle_mode_manual') {
    const player = CORE.loadPlayer(user.id);
    if (player?.battleState?.friendDuel) {
      await showFriendManualModePicker(interaction, user);
    } else {
      await startManualBattle(interaction, user);
    }
    return;
  }

  if (customId === 'battle_mode_manual_back') {
    const player = CORE.loadPlayer(user.id);
    if (player?.battleState?.friendDuel) {
      const fallbackPet = PET.loadPet(user.id);
      const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
      const pet = petResolved?.pet || fallbackPet;
      const duel = player?.battleState?.friendDuel || {};
      const enemy = player?.battleState?.enemy;
      if (!pet || !enemy) {
        await interaction.reply({ content: '❌ 找不到好友對戰狀態，請重新發起。', ephemeral: true }).catch(() => {});
        return;
      }
      if (petResolved?.changed) CORE.savePlayer(player);
      const estimate = estimateBattleOutcome(player, pet, enemy, player?.battleState?.fighter || 'pet', { simulationCount: 24 });
      const enemyElementText = formatBattleElementDisplay(resolveEnemyBattleElement(enemy));
      const allyElementText = formatBattleElementDisplay(pet?.type || pet?.element || '');
      const relationText = getBattleElementRelation(
        pet?.type || pet?.element || '',
        resolveEnemyBattleElement(enemy)
      ).text;
      const embed = new EmbedBuilder()
        .setTitle(`🤝 好友友誼戰：${player.name} vs ${String(duel.friendName || '好友').trim() || '好友'}`)
        .setColor(0x8b5cf6)
        .setDescription(
          `**友誼戰即將開始！**\n\n` +
          `對手：${enemy.name}\n` +
          `🏷️ 敵方屬性：${enemyElementText}\n` +
          `❤️ 對手 HP：${formatBattleHpValue(enemy?.hp, 0)}/${formatBattleHpValue(enemy?.maxHp, 1)}\n` +
          `⚔️ 對手攻擊：${enemy.attack}\n` +
          `🐾 ${pet.name} 出戰\n` +
          `🏷️ 我方屬性：${allyElementText}\n` +
          `${relationText}\n` +
          `⚡ 戰鬥能量規則：每回合 +2，可結轉\n` +
          `🌐 線上手動模式：雙方每回合 ${Math.floor(FRIEND_DUEL_ONLINE_TURN_MS / 1000)} 秒內同時提交行動\n` +
          `🤝 友誼戰規則：不影響生死、無通緝、無金幣掉落\n` +
          `📊 勝率預估：${estimate.rank}（約 ${format1(estimate.winRate)}%）\n\n` +
          `請選擇戰鬥模式：`
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('battle_mode_manual').setLabel('⚔️ 手動模式').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('battle_mode_ai').setLabel('🤖 AI戰鬥').setStyle(ButtonStyle.Primary)
      );
      await interaction.update({ embeds: [embed], components: [row] });
    } else {
      await interaction.reply({ content: 'ℹ️ 目前不是好友對戰模式。', ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (customId === 'battle_mode_manual_offline') {
    await startManualBattle(interaction, user);
    return;
  }

  if (customId === 'battle_mode_manual_online') {
    await startManualBattleOnline(interaction, user);
    return;
  }

  if (customId === 'battle_mode_ai') {
    await startAutoBattle(interaction, user);
    return;
  }

  if (customId === 'battle_continue_human') {
    await continueBattleWithHuman(interaction, user);
    return;
  }
  
  // ===== 戰鬥 =====
  if (customId.startsWith('fight_') || customId === 'fight_retry') {
    await handleFight(interaction, user);
    return;
  }
  
  // ===== 使用招式 =====
  if (customId.startsWith('use_move_')) {
    const idx = parseInt(customId.split('_')[2]);
    await handleUseMove(interaction, user, idx);
    return;
  }

  if (customId.startsWith('fdonline_')) {
    await handleOnlineFriendDuelChoice(interaction, user, customId);
    return;
  }

  if (customId === 'battle_toggle_layout') {
    const player = CORE.loadPlayer(user.id);
    const fallbackPet = PET.loadPet(user.id);
    const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
    const pet = petResolved?.pet || fallbackPet;
    if (!player?.battleState?.enemy || !pet) {
      await interaction.reply({ content: '⚠️ 目前沒有可切換的戰鬥畫面。', ephemeral: true }).catch(() => {});
      return;
    }
    const mode = toggleBattleLayoutMode(player);
    if (petResolved?.changed) CORE.savePlayer(player);
    CORE.savePlayer(player);
    await renderManualBattle(
      interaction,
      player,
      pet,
      mode === 'mobile' ? '📱 已切換為手機版戰鬥排版。' : '🖥️ 已切換為電腦版戰鬥排版。'
    );
    return;
  }

  if (customId === 'battle_wait') {
    await handleBattleWait(interaction, user);
    return;
  }

  if (customId === 'battle_switch_pet') {
    await handleBattleSwitchOpen(interaction, user);
    return;
  }

  if (customId === 'battle_switch_cancel') {
    await handleBattleSwitchCancel(interaction, user);
    return;
  }
  
  // ===== 逃跑 =====
  if (customId.startsWith('flee_')) {
    const attempt = parseInt(customId.split('_')[1]);
    await handleFlee(interaction, user, attempt);
    return;
  }
  
  // ===== 顯示招式列表 =====
  if (customId === 'show_moves') {
    await showMovesList(interaction, user);
    return;
  }

  if (customId.startsWith('moves_show_equipment_')) {
    const petId = String(customId || '').replace('moves_show_equipment_', '').trim();
    await showPetEquipmentView(interaction, user, petId);
    return;
  }

  if (customId.startsWith('moves_open_pet_')) {
    const petId = String(customId || '').replace('moves_open_pet_', '').trim();
    await showMovesList(interaction, user, petId);
    return;
  }

  if (customId.startsWith('moves_page_prev_') || customId.startsWith('moves_page_next_')) {
    const matched = String(customId).match(/^moves_page_(prev|next)_(.+)_(\d+)$/);
    const direction = String(matched?.[1] || '').trim();
    const petId = String(matched?.[2] || '').trim();
    const currentPage = Math.max(0, Number(matched?.[3] || 0));
    const nextPage = direction === 'prev' ? currentPage - 1 : currentPage + 1;
    await showMovesList(interaction, user, petId, '', nextPage);
    return;
  }

  if (customId.startsWith('set_main_pet_')) {
    const petId = String(customId || '').replace('set_main_pet_', '').trim();
    const player = CORE.loadPlayer(user.id);
    const pet = petId ? PET.getPetById(petId) : null;
    if (!player || !pet || String(pet.ownerId || '') !== String(user.id || '')) {
      await interaction.reply({ content: '⚠️ 找不到可設定的寵物。', ephemeral: true }).catch(() => {});
      return;
    }
    player.activePetId = pet.id;
    CORE.savePlayer(player);
    await showMovesList(interaction, user, pet.id, `已設定主上場寵物：${pet.name}`);
    return;
  }
  
  // ===== 顯示行囊 =====
  if (customId === 'show_inventory') {
    await showInventory(interaction, user, 0);
    return;
  }

  if (customId.startsWith('inv_fusion_open_')) {
    const page = Math.max(0, Number(String(customId).split('_').pop() || 0));
    await showInventoryFusionLab(interaction, user, page);
    return;
  }

  if (customId.startsWith('inv_fusion_page_prev_') || customId.startsWith('inv_fusion_page_next_')) {
    const currentPage = Math.max(0, Number(String(customId).split('_').pop() || 0));
    const nextPage = customId.startsWith('inv_fusion_page_prev_') ? currentPage - 1 : currentPage + 1;
    await showInventoryFusionLab(interaction, user, nextPage);
    return;
  }

  if (customId.startsWith('inv_fusion_confirm_')) {
    await handleInventoryFusionConfirm(interaction, user, customId);
    return;
  }

  if (customId.startsWith('inv_fusion_clear_')) {
    await handleInventoryFusionClear(interaction, user, customId);
    return;
  }

  if (customId.startsWith('inv_page_prev_') || customId.startsWith('inv_page_next_')) {
    const currentPage = Math.max(0, Number(String(customId).split('_').pop() || 0));
    const nextPage = customId.startsWith('inv_page_prev_') ? currentPage - 1 : currentPage + 1;
    await showInventory(interaction, user, nextPage);
    return;
  }

  if (customId === 'show_codex') {
    await showPlayerCodex(interaction, user);
    return;
  }
  if (customId === 'show_codex_npc') {
    await showNpcCodex(interaction, user);
    return;
  }
  if (customId === 'show_codex_skill') {
    await showSkillCodex(interaction, user);
    return;
  }

  if (customId === 'show_finance_ledger') {
    await showFinanceLedger(interaction, user);
    return;
  }

  if (customId === 'show_memory_audit') {
    await showMemoryAudit(interaction, user);
    return;
  }

  if (customId === 'show_memory_recap') {
    await showMemoryRecap(interaction, user);
    return;
  }

  if (customId === 'quick_shop_entry' || customId.startsWith('quick_shop_')) {
    const explicitMarket = customId.includes('_renaiss') || customId.includes('_digital')
      ? parseMarketTypeFromCustomId(customId, 'renaiss')
      : null;
    const marketType = explicitMarket || (Math.random() < 0.5 ? 'renaiss' : 'digital');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }

    const cd = getQuickShopCooldownInfo(player);
    if (!cd.ready) {
      const replyContent = `⏳ 快速鑑價站冷卻中，還要 **${cd.remaining} 回合** 才能再次使用。`;
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: replyContent, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: replyContent, ephemeral: true }).catch(() => {});
      }
      return;
    }

    openShopSession(player, marketType, '快速進入鑑價站');
    player.lastQuickShopTurn = cd.currentTurn;
    player.lastMarketTurn = cd.currentTurn;
    rememberPlayer(player, {
      type: '商店',
      content: `快速進入${getMarketTypeLabel(marketType)}`,
      outcome: `第${cd.currentTurn}回合觸發`,
      importance: 1,
      tags: ['market', marketType, 'quick_shop']
    });
    CORE.savePlayer(player);

    await showWorldShopScene(interaction, user, marketType, buildQuickShopNarrativeNotice(player, marketType));
    return;
  }

  if (customId === 'pmkt_open_renaiss' || customId === 'pmkt_open_digital') {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    await showPlayerMarketMenu(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('pmkt_view_sell_')) {
    const parsed = parseMarketAndPageFromCustomId(customId, 'pmkt_view_sell_', 'renaiss');
    await showPlayerMarketListings(interaction, user, parsed.marketType, parsed.page);
    return;
  }

  if (customId.startsWith('pmkt_my_')) {
    const parsed = parseMarketAndPageFromCustomId(customId, 'pmkt_my_', 'renaiss');
    await showMyMarketListings(interaction, user, parsed.marketType, parsed.page);
    return;
  }

  if (customId.startsWith('pmkt_post_sell_')) {
    await interaction.reply({ content: '⚠️ 背包視圖不能直接掛賣，請先在劇情中進入商店。', ephemeral: true }).catch(() => {});
    return;
  }

  if (customId.startsWith('pmkt_post_buy_')) {
    await interaction.reply({ content: '⚠️ 已停用買單功能，現在只保留賣單市場。', ephemeral: true }).catch(() => {});
    return;
  }

  if (customId.startsWith('pmkt_buy_')) {
    const listingId = customId.replace('pmkt_buy_', '').trim();
    const buyer = CORE.loadPlayer(user.id);
    if (!buyer) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(buyer);
    const outcome = ECON.buyFromSellListing(buyer, listingId, {
      loadPlayerById: (id) => CORE.loadPlayer(id),
      savePlayerById: (p) => CORE.savePlayer(p)
    });
    if (!outcome?.success) {
      await interaction.reply({ content: `❌ 成交失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
      return;
    }
    CORE.savePlayer(buyer);
    const deliveryText = Array.isArray(outcome.deliveryNotes) && outcome.deliveryNotes.length > 0
      ? `｜${outcome.deliveryNotes.join('；')}`
      : '';
    const deferredHint = outcome.deliveryDeferred ? '｜櫃檯表示將於下一回合配送' : '';
    await showPlayerMarketMenu(
      interaction,
      user,
      outcome.marketType || 'renaiss',
      `成交成功：買入 ${outcome.itemName} x${outcome.quantity}，支出 ${outcome.totalPrice} Rns${deliveryText}${deferredHint}`
    );
    return;
  }

  if (customId.startsWith('pmkt_fill_')) {
    await interaction.reply({ content: '⚠️ 已停用買單功能，現在只保留賣單市場。', ephemeral: true }).catch(() => {});
    return;
  }

  if (customId.startsWith('pmkt_cancel_')) {
    const listingId = customId.replace('pmkt_cancel_', '').trim();
    const owner = CORE.loadPlayer(user.id);
    if (!owner) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(owner);
    const outcome = ECON.cancelMyListing(owner, listingId);
    if (!outcome?.success) {
      await interaction.reply({ content: `❌ 取消失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
      return;
    }
    CORE.savePlayer(owner);
    await showPlayerMarketMenu(
      interaction,
      user,
      outcome.marketType || 'renaiss',
      `已取消掛單：${outcome.itemName} x${outcome.quantity}`
    );
    return;
  }

  if (customId.startsWith('shop_open_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (player) {
      const needsReopen = !player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss');
      if (needsReopen) {
        openShopSession(player, marketType, '商店內操作續接');
        CORE.savePlayer(player);
      }
    }
    await showWorldShopScene(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('shop_post_sell_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (player && (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss'))) {
      openShopSession(player, marketType, '掛賣續接');
      CORE.savePlayer(player);
    }
    await showWorldShopSellPicker(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('shop_npc_haggle_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (player && (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss'))) {
      openShopSession(player, marketType, '議價續接');
      CORE.savePlayer(player);
    }
    await showWorldShopHagglePicker(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('shop_haggle_all_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (player && (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss'))) {
      openShopSession(player, marketType, '批次議價續接');
      CORE.savePlayer(player);
    }
    await showWorldShopHaggleBulkPicker(interaction, user, marketType);
    return;
  }

  if (customId.startsWith('shop_haggle_cancel_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    if (player.shopSession?.pendingHaggleOffer) {
      player.shopSession.pendingHaggleOffer = null;
      CORE.savePlayer(player);
    }
    await showWorldShopScene(interaction, user, marketType, '你退出本次議價，未發生交易。');
    return;
  }

  if (customId.startsWith('shop_haggle_confirm_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || 'renaiss')) {
      await interaction.reply({ content: '⚠️ 你目前不在此商店場景。', ephemeral: true }).catch(() => {});
      return;
    }
    const pending = player.shopSession?.pendingHaggleOffer;
    if (!pending || typeof pending !== 'object') {
      await showWorldShopHagglePicker(interaction, user, marketType, '議價提案已失效，請重新選擇商品。');
      return;
    }
    if (Date.now() - Number(pending.createdAt || 0) > SHOP_HAGGLE_OFFER_TTL_MS) {
      player.shopSession.pendingHaggleOffer = null;
      CORE.savePlayer(player);
      await showWorldShopHagglePicker(interaction, user, marketType, '議價提案已逾時，請重新估價。');
      return;
    }

    const npcName = String(pending.npcName || (marketType === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員'));
    let quoted = 0;
    let soldLabel = String(pending.itemName || '商品');
    let soldCount = 1;

    if (String(pending.scope || '') === 'bulk' || String(pending.scope || '') === 'all' || String(pending.spec?.kind || '') === 'all') {
      const bulkSpecs = Array.isArray(pending.specs) ? pending.specs : [];
      if (bulkSpecs.length <= 0) {
        player.shopSession.pendingHaggleOffer = null;
        CORE.savePlayer(player);
        await showWorldShopHaggleBulkPicker(interaction, user, marketType, '批次議價資料已失效，請重新選擇商品。');
        return;
      }
      const consume = consumeHaggleBulkItemsFromPlayer(player, bulkSpecs);
      if (!consume.success) {
        player.shopSession.pendingHaggleOffer = null;
        CORE.savePlayer(player);
        await showWorldShopHaggleBulkPicker(interaction, user, marketType, consume.reason || '商品已變動，請重新議價。');
        return;
      }
      quoted = Math.max(0, Number(pending.quotedTotal || 0));
      const rawTotal = Math.max(0, Number(pending.rawQuotedTotal || 0));
      const discountLoss = Math.max(0, rawTotal - quoted);
      soldCount = Math.max(1, Number(consume.totalRemoved || pending.soldCount || 1));
      soldLabel = `批次商品（${soldCount} 件）`;

      player.stats.財富 = Math.max(0, Number(player?.stats?.財富 || 0)) + quoted;
      if (pending.marketStateAfter && typeof pending.marketStateAfter === 'object') {
        player.marketState = JSON.parse(JSON.stringify(pending.marketStateAfter));
      }
      if (quoted > 0) {
        recordCashflow(player, {
          amount: quoted,
          category: marketType === 'digital' ? 'market_digital_sell' : 'market_renaiss_sell',
          source: `${getMarketTypeLabel(marketType)} 批次議價賣出（七折）`,
          marketType
        });
      }
      if (discountLoss > 0) {
        recordCashflow(player, {
          amount: -discountLoss,
          category: 'shop_haggle_bulk_discount',
          source: `${getMarketTypeLabel(marketType)} 批次七折折讓`,
          marketType
        });
      }
    } else {
      const consume = consumeHaggleItemFromPlayer(player, pending.spec || {});
      if (!consume.success) {
        player.shopSession.pendingHaggleOffer = null;
        CORE.savePlayer(player);
        await showWorldShopHagglePicker(interaction, user, marketType, consume.reason || '商品已變動，請重新議價。');
        return;
      }
      quoted = Math.max(0, Number(pending.quotedTotal || 0));
      player.stats.財富 = Math.max(0, Number(player?.stats?.財富 || 0)) + quoted;
      if (pending.marketStateAfter && typeof pending.marketStateAfter === 'object') {
        player.marketState = JSON.parse(JSON.stringify(pending.marketStateAfter));
      }
      if (quoted > 0) {
        recordCashflow(player, {
          amount: quoted,
          category: marketType === 'digital' ? 'market_digital_sell' : 'market_renaiss_sell',
          source: `${getMarketTypeLabel(marketType)} 商店議價售出 1 件`,
          marketType
        });
      }
    }
    ECON.ensurePlayerEconomy(player);
    player.shopSession.pendingHaggleOffer = null;

    rememberPlayer(player, {
      type: '交易',
      content: `商店內與${npcName}議價`,
      outcome: `售出 ${soldLabel}，結算 ${quoted} Rns`,
      importance: 2,
      tags: ['market', marketType, 'shop_haggle']
    });
    CORE.appendNpcMemory(npcName, user.id, {
      type: '交易',
      content: `${player.name} 在商店櫃台議價並售出 ${soldLabel}`,
      outcome: `結算 ${quoted} Rns`,
      location: player.location,
      tags: ['market', marketType, 'private'],
      importance: marketType === 'digital' ? 3 : 2
    }, { scope: 'private' });
    if (typeof CORE.appendNpcQuoteMemory === 'function') {
      const pitchText = extractPitchFromHaggleMessage(pending.message || '');
      if (pitchText) {
        CORE.appendNpcQuoteMemory(user.id, {
          npcId: npcName,
          npcName,
          speaker: npcName,
          text: pitchText,
          location: player.location,
          source: marketType === 'digital' ? 'shop_haggle_digital' : 'shop_haggle_renaiss'
        });
      }
    }

    CORE.savePlayer(player);
    await showWorldShopScene(
      interaction,
      user,
      marketType,
      `${npcName} 完成議價：${soldLabel} 成交 +${quoted} Rns`
    );
    return;
  }

  if (customId.startsWith('shop_buy_item_')) {
    const listingId = customId.replace('shop_buy_item_', '').trim();
    const buyer = CORE.loadPlayer(user.id);
    if (!buyer) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(buyer);
    const outcome = ECON.buyFromSellListing(buyer, listingId, {
      loadPlayerById: (id) => CORE.loadPlayer(id),
      savePlayerById: (p) => CORE.savePlayer(p)
    });
    if (!outcome?.success) {
      await interaction.reply({ content: `❌ 購買失敗：${outcome?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
      return;
    }
    CORE.savePlayer(buyer);
    const deliveryText = Array.isArray(outcome.deliveryNotes) && outcome.deliveryNotes.length > 0
      ? `｜${outcome.deliveryNotes.join('；')}`
      : '';
    const deferredHint = outcome.deliveryDeferred ? '｜櫃檯表示將於下一回合配送' : '';
    await showWorldShopBuyPanel(
      interaction,
      user,
      outcome.marketType || 'renaiss',
      `成交成功：${outcome.itemName} x${outcome.quantity}（-${outcome.totalPrice} Rns）${deliveryText}${deferredHint}`
    );
    return;
  }

  if (customId.startsWith('shop_scratch_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const scratch = ECON.playScratchLottery(player, { marketType });
    const scratchPlace = marketType === 'digital' ? '神秘鑑價站' : '鑑價站';
    rememberPlayer(player, {
      type: '經濟',
      content: `${scratchPlace}刮刮樂（投入 ${scratch.cost || 100} Rns 代幣）`,
      outcome: scratch.win
        ? `中獎 ${scratch.reward || 0} Rns 代幣｜淨 ${scratch.net >= 0 ? '+' : ''}${scratch.net}`
        : `未中獎｜獎池 ${scratch.jackpotPool || 0} Rns 代幣`,
      importance: scratch.win ? 2 : 1,
      tags: ['scratch_lottery', scratch.win ? 'win' : 'lose']
    });
    if (scratch.success) {
      recordCashflow(player, {
        amount: -Number(scratch.cost || 0),
        category: 'scratch_cost',
        source: marketType === 'digital' ? '神秘鑑價站刮刮樂投入' : '鑑價站刮刮樂投入',
        marketType
      });
      if (Number(scratch.reward || 0) > 0) {
        recordCashflow(player, {
          amount: Number(scratch.reward || 0),
          category: 'scratch_reward',
          source: marketType === 'digital' ? '神秘鑑價站刮刮樂中獎' : '鑑價站刮刮樂中獎',
          marketType
        });
      }
    }
    CORE.savePlayer(player);
    await showWorldShopScene(
      interaction,
      user,
      marketType,
      `${scratch.message}\n💰 目前獎池：${Number(scratch.jackpotPool || 0)} Rns 代幣`
    );
    return;
  }

  if (customId.startsWith('shop_buy_point_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const cost = 200;
    const currentGold = Number(player?.stats?.財富 || 0);
    if (currentGold < cost) {
      await interaction.reply({ content: `❌ Rns 不足，購買 1 點加成需要 ${cost} Rns。`, ephemeral: true }).catch(() => {});
      return;
    }
    player.stats.財富 = Math.max(0, currentGold - cost);
    player.upgradePoints = Number(player.upgradePoints || 0) + 1;
    recordCashflow(player, {
      amount: -cost,
      category: 'shop_upgrade_point',
      source: `${getMarketTypeLabel(marketType)} 購買加成點數 +1`,
      marketType
    });
    CORE.savePlayer(player);
    await showWorldShopBuyPanel(
      interaction,
      user,
      marketType,
      `已購買加成點數 +1（花費 ${cost} Rns）。目前點數：${Number(player.upgradePoints || 0)}`
    );
    return;
  }

  if (customId.startsWith('shop_buy_device_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const beforeStock = getTeleportDeviceStockInfo(player);
    if (beforeStock.count >= TELEPORT_DEVICE_STOCK_LIMIT) {
      await interaction.reply({ content: '❌ 傳送裝置庫存已達上限，請先使用後再購買。', ephemeral: true }).catch(() => {});
      return;
    }
    const currentGold = Number(player?.stats?.財富 || 0);
    if (currentGold < TELEPORT_DEVICE_COST) {
      await interaction.reply({ content: `❌ Rns 不足，購買傳送裝置需要 ${TELEPORT_DEVICE_COST} Rns。`, ephemeral: true }).catch(() => {});
      return;
    }
    player.stats.財富 = Math.max(0, currentGold - TELEPORT_DEVICE_COST);
    grantTeleportDevice(player, 1);
    const stockInfo = getTeleportDeviceStockInfo(player);
    recordCashflow(player, {
      amount: -TELEPORT_DEVICE_COST,
      category: 'shop_teleport_device',
      source: `${getMarketTypeLabel(marketType)} 購買傳送裝置`,
      marketType
    });
    rememberPlayer(player, {
      type: '商店',
      content: `在${getMarketTypeLabel(marketType)}購買傳送裝置`,
      outcome: `新增 1 顆（效期 ${TELEPORT_DEVICE_DURATION_HOURS}h）｜現有 ${stockInfo.count} 顆`,
      importance: 2,
      tags: ['shop', marketType, 'teleport_device']
    });
    CORE.savePlayer(player);
    await showWorldShopBuyPanel(
      interaction,
      user,
      marketType,
      `已購買傳送裝置 x1（花費 ${TELEPORT_DEVICE_COST} Rns，效期 ${TELEPORT_DEVICE_DURATION_HOURS}h）。目前可用 ${stockInfo.count} 顆（最早到期：${formatTeleportDeviceRemaining(stockInfo.soonestRemainingMs)}）。`
    );
    return;
  }

  if (customId.startsWith('shop_buy_heal_crystal_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const result = buyShopCrystal(player, pet, marketType, 'heal');
    if (!result.success) {
      await interaction.reply({ content: result.reason || '❌ 購買失敗。', ephemeral: true }).catch(() => {});
      return;
    }
    if (pet) PET.savePet(pet);
    CORE.savePlayer(player);
    await showWorldShopBuyPanel(
      interaction,
      user,
      marketType,
      `${result.message}（花費 ${result.cost} Rns）`
    );
    return;
  }

  if (customId.startsWith('shop_buy_energy_crystal_')) {
    const marketType = parseMarketTypeFromCustomId(customId, 'renaiss');
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player) {
      await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
      return;
    }
    ECON.ensurePlayerEconomy(player);
    const result = buyShopCrystal(player, pet, marketType, 'energy');
    if (!result.success) {
      await interaction.reply({ content: result.reason || '❌ 購買失敗。', ephemeral: true }).catch(() => {});
      return;
    }
    if (pet) PET.savePet(pet);
    CORE.savePlayer(player);
    await showWorldShopBuyPanel(
      interaction,
      user,
      marketType,
      `${result.message}（花費 ${result.cost} Rns）`
    );
    return;
  }

  if (customId.startsWith('shop_buy_')) {
    const parsed = parseMarketAndPageFromCustomId(customId, 'shop_buy_', 'renaiss');
    const player = CORE.loadPlayer(user.id);
    if (player && (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(parsed.marketType || 'renaiss'))) {
      openShopSession(player, parsed.marketType, '商店購買續接');
      CORE.savePlayer(player);
    }
    await showWorldShopBuyPanel(interaction, user, parsed.marketType, '', parsed.page);
    return;
  }

  if (customId === 'shop_leave') {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    if (!player || !pet || !interaction.channel?.isThread()) {
      await interaction.reply({ content: '⚠️ 請回到遊戲討論串使用。', ephemeral: true }).catch(() => {});
      return;
    }
    const session = player?.shopSession && typeof player.shopSession === 'object'
      ? JSON.parse(JSON.stringify(player.shopSession))
      : null;
    const marketType = String(session?.marketType || 'renaiss').trim() === 'digital' ? 'digital' : 'renaiss';
    const marketLabel = getMarketTypeLabel(marketType);
    const sourceChoice = String(session?.sourceChoice || '').trim();
    const preShopStory = String(session?.preStory || player.currentStory || '').trim();
    leaveShopSession(player);
    const restoredStory = String(player.currentStory || preShopStory || '').trim();
    const carryTail = extractStoryTailLine(preShopStory || restoredStory, 140);
    const exitSummary =
      `🧭 你離開${marketLabel}，把剛才的報價與櫃檯觀察帶回${player.location || '當前區域'}，準備接回原本主線。` +
      (carryTail ? `\n📖 承接前情：${carryTail}` : '');
    player.currentStory = [restoredStory, exitSummary].filter(Boolean).join('\n\n');
    queuePendingStoryTrigger(player, {
      name: `離開${marketLabel}`,
      choice: sourceChoice || `從${marketLabel}返回冒險現場`,
      desc: `你剛結束${marketLabel}互動，需承接入店前線索並自然銜接下一段劇情`,
      action: 'market_exit_followup',
      outcome: `已離開${marketLabel}｜入店前最後情境：${carryTail || '（無）'}`
    });
    player.eventChoices = [];
    rememberPlayer(player, {
      type: '商店',
      content: `離開${marketLabel}返回主線`,
      outcome: sourceChoice ? `承接先前行動：${sourceChoice}` : '返回冒險流程',
      importance: 2,
      tags: ['market', marketType, 'shop_exit']
    });
    CORE.savePlayer(player);
    await interaction.deferUpdate().catch(() => {});
    await sendMainMenuToThread(interaction.channel, player, pet, interaction);
    await interaction.message.delete().catch(() => {});
    return;
  }
  
  // ===== 顯示檔案 =====
  if (customId === 'open_profile') {
    await showProfile(interaction, user);
    return;
  }
  
  // ===== 顯示扭蛋 =====
  if (customId === 'open_gacha') {
    await showGacha(interaction, user);
    return;
  }
  
  // ===== 扭蛋按鈕 =====
  if (customId === 'gacha_single') {
    await handleGachaResult(interaction, user, 1);
    return;
  }
  
  if (customId === 'gacha_ten') {
    await handleGachaResult(interaction, user, 10);
    return;
  }
  
  // ===== 分配 HP =====
  if (customId.startsWith('alloc_hp_')) {
    const raw = String(customId || '').replace('alloc_hp_', '').trim();
    let petId = raw;
    let amountInput = 1;
    const amountMatch = raw.match(/^(.*)_(\d+|max)$/i);
    if (amountMatch) {
      petId = String(amountMatch[1] || '').trim();
      amountInput = String(amountMatch[2] || '').trim().toLowerCase();
    }
    await handleAllocateHP(interaction, user, petId, amountInput);
    return;
  }

  if (customId === 'continue_with_wallet') {
    await handleContinueWithWalletButton(interaction, user);
    return;
  }

  if (customId === 'enter_pet_name') {
    await handleEnterPetNameButton(interaction, user);
    return;
  }

  if (customId === 'skip_name') {
    await handleSkipNameButton(interaction, user);
    return;
  }
  
  // ===== Modal 提交（名字）=====
  if (customId.startsWith('name_modal_')) {
    await handleNameSubmit(interaction, user);
    return;
  }
  } catch (err) {
    perfFailed = true;
    console.error(
      `[Interaction] handler failed cid=${String(customId || '')} user=${String(user?.id || '')}:`,
      err?.stack || err?.message || err
    );
    const failMsg = '❌ 互動處理失敗，請再按一次；若持續發生請回報你按的按鈕。';
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: failMsg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: failMsg, ephemeral: true }).catch(() => {});
      }
    } catch (_) {}

    try {
      let recovered = false;
      if (interaction?.isButton?.()) {
        recovered = await restoreButtonTemplateSnapshot(interaction, buttonTemplateContext);
      }
      if (!recovered && String(customId || '').startsWith('event_')) {
        await tryRecoverEventButtonsAfterFailure(interaction, user?.id, {
          normalizeEventChoices,
          applyChoicePolicy
        });
      } else if (!recovered && interaction?.isButton?.()) {
        await tryRecoverMainMenuAfterFailure(interaction, user?.id);
      }
    } catch (_) {}
  } finally {
    const elapsedMs = Date.now() - perfStartedAt;
    if (elapsedMs >= 1200) {
      const kind = interaction?.isButton?.()
        ? 'button'
        : (interaction?.isStringSelectMenu?.() ? 'select' : 'modal');
      console.log(
        `[Perf][interaction] type=${kind} cid=${String(customId || '')} ` +
        `user=${String(user?.id || '')} status=${perfFailed ? 'failed' : 'ok'} ${elapsedMs}ms`
      );
    }
  }
});
}

module.exports = {
  registerInteractionDispatcher
};
