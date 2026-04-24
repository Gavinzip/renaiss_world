function createMainMenuFlowUtils(deps = {}) {
  const {
    CORE,
    PET,
    ECON,
    STORY,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CHOICE_DISPLAY_COUNT,
    resolvePlayerMainPet,
    ensurePlayerGenerationSchema,
    recordNearbyNpcEncounters,
    syncLocationArcLocation,
    restoreStoryFromGenerationState,
    restoreChoicesFromGenerationState,
    consumeWorldIntroOnce,
    consumeFinanceNotices,
    getPendingStoryTrigger,
    detectStitchedBattleStory,
    extractBattleChoiceHintFromStory,
    queuePendingStoryTrigger,
    applyChoicePolicy,
    normalizeEventChoices,
    updateGenerationState,
    finishGenerationState = () => {},
    getAdventureText,
    buildMainStatusBar,
    buildMainStatusFields = null,
    buildChoiceOptionsText,
    buildMainlineProgressLine,
    getPetElementDisplayName = (v) => String(v || '未知屬性'),
    getFactionPresenceHintForPlayer = () => 'none',
    buildPortalUsageGuide = () => '',
    getAlignmentColor,
    formatPetHpWithRecovery,
    buildEventChoiceButtons,
    appendMainMenuUtilityButtons,
    disableMessageComponents,
    trackActiveGameMessage,
    tryAcquireStoryLock,
    notifyStoryBusy,
    startGenerationState,
    startLoadingAnimation,
    startTypingIndicator,
    getPlayerMemoryContextAsync,
    getNearbyNpcMemoryContextAsync,
    editOrSendFallback,
    buildRetryGenerationComponents,
    getMainlineBridgeLock,
    consumeMainlineBridgeLock,
    clearPendingStoryTrigger,
    rememberStoryDialogues,
    generateChoicesWithAI,
    maybeInjectRareCustomInputChoice,
    triggerMainlineForeshadowAIInBackground,
    releaseStoryLock
  } = deps;
  const {
    getGenerationStatusText,
    normalizeLangCode
  } = require('../runtime/utils/global-language-resources');
  const { capWantedLevel } = require('../../content/wanted-utils');
  const buildStatusFields = typeof buildMainStatusFields === 'function'
    ? buildMainStatusFields
    : (player, pet, lang = '', options = {}) => [
      {
        name: '🐾 寵物',
        value: `${pet?.name || 'Unknown'} (${getPetElementDisplayName(pet?.type || pet?.element || '', lang || player?.language || 'zh-TW')})`,
        inline: true
      },
      { name: '⚔️ 氣血', value: formatPetHpWithRecovery(pet, lang || player?.language || 'zh-TW'), inline: true },
      { name: '💰 Rns 代幣', value: String(player?.stats?.財富 || 0), inline: true },
      { name: '📍 位置', value: String(player?.location || ''), inline: true },
      { name: '🌟 幸運', value: String(player?.stats?.運氣 || 0), inline: true },
      { name: '🚨 通緝級', value: String(Math.max(0, Number(options?.wantedLevel || 0))), inline: true }
    ];

function sanitizeStoryTurnMarkerLine(storyText = '') {
  const source = String(storyText || '');
  if (!source) return '';
  return source.replace(/^(\s*🧾\s*回合標記[:：]\s*)(.+)$/m, (full, prefix, markerBody) => {
    let marker = String(markerBody || '').trim();
    if (!marker) return '';
    marker = marker.replace(
      /\s*🧰\s*(?:無|无|none|null|n\/a|沒有|没有|暂无|無掉落|无掉落|空)\s*(?:\([^)]*\)|（[^）]*）)?/giu,
      ''
    );
    marker = marker
      .replace(/\s*\|\s*/g, ' | ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*\|\s*/u, '')
      .replace(/\s*\|\s*$/u, '')
      .trim();
    if (!marker) return '';
    return `${prefix}${marker}`;
  });
}

function getWantedLevelForPlayer(CORE, player) {
  if (!player) return 0;
  const byCore = typeof CORE?.getPlayerWantedLevel === 'function'
    ? Number(CORE.getPlayerWantedLevel(player.id) || 0)
    : 0;
  const byPlayer = Number(player?.wanted || 0);
  return capWantedLevel(Math.max(0, byCore, byPlayer));
}

function hasCorruptedStoryText(story = '') {
  const source = String(story || '');
  if (!source) return false;
  if (/#\d{4,7};/u.test(source)) return true;
  if (/(?:[)\-]\s*){18,}/u.test(source)) return true;
  if (/[)\-_.#]{36,}/u.test(source)) return true;
  return false;
}

function getMainMenuStaticText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang || 'zh-TW');
  if (code === 'en') {
    return {
      worldIntroTitle: '🌍 **World Briefing**',
      financeNoticeTitle: '📬 **Trade Notices**'
    };
  }
  if (code === 'ko') {
    return {
      worldIntroTitle: '🌍 **세계 배경 안내**',
      financeNoticeTitle: '📬 **거래 알림**'
    };
  }
  if (code === 'zh-CN') {
    return {
      worldIntroTitle: '🌍 **世界背景导读**',
      financeNoticeTitle: '📬 **交易通知**'
    };
  }
  return {
    worldIntroTitle: '🌍 **世界背景導讀**',
    financeNoticeTitle: '📬 **交易通知**'
  };
}

const MENU_RENDER_GUARD = new Set();

async function sendMainMenuToThread(thread, player, pet, interaction = null) {
  const guardKey = `${String(player?.id || 'unknown')}::${String(thread?.id || 'unknown')}`;
  if (MENU_RENDER_GUARD.has(guardKey)) {
    console.warn(`[MainMenu] recursive render blocked key=${guardKey}`);
    return;
  }
  MENU_RENDER_GUARD.add(guardKey);
  try {
  if (interaction && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const fallbackPet = pet || PET.loadPet(player?.id);
  const mainPetResolved = resolvePlayerMainPet(player, { fallbackPet });
  pet = mainPetResolved?.pet || fallbackPet;
  if (!pet) {
    if (interaction && !interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: '❌ 找不到可用寵物，請重新 /start。', ephemeral: true }).catch(() => {});
    } else {
      await thread.send({ content: '❌ 找不到可用寵物，請重新 /start。' }).catch(() => {});
    }
    return;
  }

  let stateMutated = ensurePlayerGenerationSchema(player);
  if (mainPetResolved?.changed) stateMutated = true;
  if (recordNearbyNpcEncounters(player, 8)) stateMutated = true;
  syncLocationArcLocation(player);
  if (restoreStoryFromGenerationState(player)) stateMutated = true;
  if (restoreChoicesFromGenerationState(player)) stateMutated = true;
  const sanitizedPersistedStory = sanitizeStoryTurnMarkerLine(player.currentStory);
  if (sanitizedPersistedStory !== String(player.currentStory || '')) {
    player.currentStory = sanitizedPersistedStory;
    stateMutated = true;
  }
  if (
    (player.generationState?.status === 'pending' || player.generationState?.status === 'failed') &&
    String(player.currentStory || '').trim() &&
    Array.isArray(player.eventChoices) &&
    player.eventChoices.length > 0
  ) {
    finishGenerationState(player, 'done', {
      phase: 'recovered_snapshot',
      storySnapshot: player.currentStory,
      choicesSnapshot: player.eventChoices
    });
    stateMutated = true;
  }
  if (stateMutated) {
    CORE.savePlayer(player);
  }

  const worldIntro = consumeWorldIntroOnce(player);
  const staticText = getMainMenuStaticText(player?.language || 'zh-TW');
  const worldIntroBlock = worldIntro ? `${staticText.worldIntroTitle}\n${worldIntro}\n\n` : '';
  const financeNotices = typeof ECON.consumeFinanceNotices === 'function'
    ? ECON.consumeFinanceNotices(player, 3)
    : [];
  if (financeNotices.length > 0) {
    stateMutated = true;
    CORE.savePlayer(player);
  }
  const financeNoticeBlock = financeNotices.length > 0
    ? `${staticText.financeNoticeTitle}\n${financeNotices.map((line) => `• ${line}`).join('\n')}\n\n`
    : '';
  const portalGuideBlock = player?.portalMenuOpen ? `\n\n${buildPortalUsageGuide(player)}` : '';
  let forceFreshStory = Boolean(getPendingStoryTrigger(player)?.forceFreshStory);
  const corruptedCachedStory = hasCorruptedStoryText(player?.currentStory || '');
  if (!forceFreshStory && corruptedCachedStory) {
    queuePendingStoryTrigger(player, {
      name: '文本污染自動重生',
      choice: '重建當前回合敘事',
      desc: '系統偵測到故事文本含亂碼，改為強制重生新篇章',
      action: 'story_corruption_autofix',
      outcome: '請基於上一回合有效上下文重建故事正文與新選項，排除亂碼符號污染'
    });
    player.eventChoices = [];
    CORE.savePlayer(player);
    forceFreshStory = true;
  }
  const stitchedBattleStoryDetected =
    !forceFreshStory &&
    detectStitchedBattleStory(player.currentStory) &&
    Array.isArray(player.eventChoices) &&
    player.eventChoices.length > 0;
  if (stitchedBattleStoryDetected) {
    const choiceHint = extractBattleChoiceHintFromStory(player.currentStory);
    queuePendingStoryTrigger(player, {
      name: '戰後自動續寫',
      choice: choiceHint || '承接上一場戰鬥結果',
      desc: '系統偵測到舊拼接戰後文，改為強制重生新篇章',
      action: 'battle_result_autofix',
      outcome: '請根據上一場戰鬥勝負與現場線索，延伸新的劇情正文與新選項'
    });
    player.eventChoices = [];
    CORE.savePlayer(player);
    forceFreshStory = true;
  }

  // 如果沒有暂存的事件選項，才生成新的（防止刷選項）
  // ============================================================
  //  continuity 維護：有 story+choices 就直接顯示，不重新生成
  // ============================================================
  if (!forceFreshStory && player.currentStory && player.eventChoices && player.eventChoices.length > 0) {
    // 直接顯示上次的故事 + 選項（不做任何 AI 呼叫）
    let persisted = false;
    const choices = applyChoicePolicy(player, normalizeEventChoices(player, player.eventChoices));
    if (
      choices.length !== player.eventChoices.length ||
      choices.some((choice, idx) => choice !== player.eventChoices[idx])
    ) {
      player.eventChoices = choices;
      persisted = true;
    }
    if (player.generationState?.status === 'pending' || player.generationState?.status === 'failed') {
      updateGenerationState(player, {
        phase: 'resume_cached',
        storySnapshot: player.currentStory,
        choicesSnapshot: choices
      });
      finishGenerationState(player, 'done', {
        phase: 'resume_cached',
        storySnapshot: player.currentStory,
        choicesSnapshot: choices
      });
      persisted = true;
    }
    if (persisted) {
      CORE.savePlayer(player);
    }
    const storyText = player.currentStory;
    
    const uiText = getAdventureText(player.language || 'zh-TW');
    const statusBar = buildMainStatusBar(player, pet, player.language || 'zh-TW');
    
    const optionsText = buildChoiceOptionsText(choices, { player, pet });
    
    const mainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
    const wantedLevel = getWantedLevelForPlayer(CORE, player);
    const description = `${financeNoticeBlock}${worldIntroBlock}**${uiText.statusLabel}：【${statusBar}】**${mainlineLine ? `\n${mainlineLine}` : ''}\n\n${storyText}${portalGuideBlock}\n\n**${uiText.sectionChoices}：**${optionsText}\n\n_${uiText.chooseNumber(CHOICE_DISPLAY_COUNT)}_`;
    
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(getAlignmentColor(player.alignment))
      .setDescription(description)
      .addFields(...buildStatusFields(player, pet, player.language || 'zh-TW', { wantedLevel }));
    
    const buttons = buildEventChoiceButtons(choices, player.id);
    appendMainMenuUtilityButtons(buttons, player);
    const components = [];
    for (let i = 0; i < buttons.length; i += 5) {
      components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    
    const oldActiveId = player.activeMessageId;
    if (oldActiveId) {
      await disableMessageComponents(thread, oldActiveId);
    }

    const sentMsg = await thread.send({ embeds: [embed], components }).catch(() => null);
    if (sentMsg) {
      trackActiveGameMessage(player, thread.id, sentMsg.id);
    }
    return;
  }
  
  // ============================================================
  //  沒有存 story/choices → 生成初始故事 + 選項
  // ============================================================
  const playerId = player?.id;
  if (!tryAcquireStoryLock(playerId, 'main_menu')) {
    const generationPhase = String(player?.generationState?.phase || '').trim();
    const isPendingGeneration = String(player?.generationState?.status || '').trim() === 'pending';
    if (isPendingGeneration && interaction) {
      const busyUiText = getAdventureText(player.language || 'zh-TW');
      const busyStatusBar = buildMainStatusBar(player, pet, player.language || 'zh-TW');
      const generationText = getGenerationStatusText(player.language || 'zh-TW');
      const busyHint = generationText[generationPhase] || generationText.loading;
      const busyMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
      const busyDesc = `${financeNoticeBlock}${worldIntroBlock}**${busyUiText.statusLabel}：【${busyStatusBar}】**${busyMainlineLine ? `\n${busyMainlineLine}` : ''}\n\n⏳ *${busyHint}*${portalGuideBlock}`;
      const busyEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(0x00ff00)
        .setDescription(busyDesc);

      const busyButtons = [];
      appendMainMenuUtilityButtons(busyButtons, player);
      const busyComponents = [];
      for (let i = 0; i < busyButtons.length; i += 5) {
        busyComponents.push(new ActionRowBuilder().addComponents(busyButtons.slice(i, i + 5)));
      }

      const payload = { content: null, embeds: [busyEmbed], components: busyComponents };
      let recovered = false;
      if (interaction.deferred || interaction.replied) {
        recovered = await interaction.editReply(payload).then(() => true).catch(() => false);
      } else {
        recovered = await interaction.update(payload).then(() => true).catch(() => false);
      }
      if (recovered && interaction?.message?.id) {
        trackActiveGameMessage(player, thread.id, interaction.message.id);
      }
      if (!recovered && thread && typeof thread.send === 'function') {
        const busyMsg = await thread.send(payload).catch(() => null);
        if (busyMsg?.id) {
          trackActiveGameMessage(player, thread.id, busyMsg.id);
        }
      }
      return;
    }
    await notifyStoryBusy(interaction);
    return;
  }

  let releaseInScope = true;
  try {
  // story-first：沒有 currentStory 時不應先產選項，避免出現「先有選項、後有故事」的錯亂
  if (!player.currentStory && Array.isArray(player.eventChoices) && player.eventChoices.length > 0) {
    player.eventChoices = [];
    CORE.savePlayer(player);
  }
  if (forceFreshStory && Array.isArray(player.eventChoices) && player.eventChoices.length > 0) {
    player.eventChoices = [];
    CORE.savePlayer(player);
  }

  const hasRecoverableStoryOnly =
    !forceFreshStory &&
    String(player.currentStory || '').trim().length > 0 &&
    (!Array.isArray(player.eventChoices) || player.eventChoices.length === 0);
  startGenerationState(player, {
    source: hasRecoverableStoryOnly
      ? 'main_menu_recover_choices'
      : (forceFreshStory ? 'main_menu_force_fresh_story' : 'main_menu'),
    phase: 'loading',
    sourceChoice: hasRecoverableStoryOnly
      ? '補齊上次中斷選項'
      : (forceFreshStory ? '承接戰鬥結果生成新劇情' : '主選單生成'),
    storySnapshot: hasRecoverableStoryOnly ? player.currentStory : '',
    choicesSnapshot: []
  });
  CORE.savePlayer(player);
  
  // ===== 狀態列 =====
  const uiText = getAdventureText(player.language || 'zh-TW');
  const statusBar = buildMainStatusBar(player, pet, player.language || 'zh-TW');
  const eventMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');

  // 先用 Loading 訊息回覆（先故事、後選項）
  const generationText = getGenerationStatusText(player.language || 'zh-TW');
  const loadingHint = hasRecoverableStoryOnly
    ? (generationText.recovering_choices || generationText.loading)
    : (forceFreshStory
      ? (generationText.battle_fresh_story || generationText.loading)
      : generationText.loading);
  const loadingMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
  const loadingDesc = `${financeNoticeBlock}${worldIntroBlock}**${uiText.statusLabel}：【${statusBar}】**${loadingMainlineLine ? `\n${loadingMainlineLine}` : ''}\n\n⏳ *${loadingHint}*${portalGuideBlock}`;
  
  const loadingEmbed = new EmbedBuilder()
    .setTitle(`⚔️ ${player.name} - ${pet.name}`)
    .setColor(0x00ff00)
    .setDescription(loadingDesc);
  
  // 構建按鈕
  const buttons = [];
  appendMainMenuUtilityButtons(buttons, player);
  
  const components = [];
  for (let i = 0; i < buttons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  
  // 發送 Loading 訊息到 thread
  const loadingMsg = await thread.send({ embeds: [loadingEmbed], components });
  trackActiveGameMessage(player, thread.id, loadingMsg.id);
  updateGenerationState(player, { loadingMessageId: loadingMsg.id });
  CORE.savePlayer(player);
  const stopLoadingAnimation = startLoadingAnimation(loadingMsg, loadingHint, player.language || 'zh-TW');
  const stopTypingIndicator = startTypingIndicator(thread);

  // 如果有 interaction（按鈕觸發），立即確認避免超時
  if (interaction) {
    await interaction.deferUpdate().catch(() => {});
  }
  
  // 背景 AI 生成：先出故事，再補按鈕
  (async () => {
    try {
      updateGenerationState(player, { phase: 'memory_context' });
      CORE.savePlayer(player);
      let memoryContext = '';
      try {
        const memStartedAt = Date.now();
        const memoryQueryText = [
          `玩家:${player.name || ''}`,
          `地點:${player.location || ''}`,
          `勢力目擊:${getFactionPresenceHintForPlayer(player)}`,
          `前情:${player.currentStory || ''}`
        ].join('\n');
        const [playerMemoryContext, npcMemoryContext] = await Promise.all([
          CORE.getPlayerMemoryContextAsync(player.id, {
            location: player.location,
            queryText: memoryQueryText,
            topK: 6
          }),
          CORE.getNearbyNpcMemoryContextAsync(player.id, {
            location: player.location,
            queryText: memoryQueryText,
            limit: 1,
            topKPrivate: 3,
            topKPublic: 2,
            maxChars: 900
          })
        ]);
        memoryContext = String(playerMemoryContext || '');
        if (npcMemoryContext) {
          memoryContext = [memoryContext, npcMemoryContext].filter(Boolean).join('\n\n');
        }
        console.log(`[Perf][main_menu] memory_context ${Date.now() - memStartedAt}ms`);
      } catch (memErr) {
        stopLoadingAnimation();
        finishGenerationState(player, 'failed', {
          phase: 'memory_failed',
          error: memErr?.message || memErr,
          storySnapshot: player.currentStory,
          choicesSnapshot: player.eventChoices
        });
        CORE.savePlayer(player);
        const memoryErrMsg = await editOrSendFallback(thread, loadingMsg, {
          content: `❌ 記憶系統錯誤：${memErr.message}\n請檢查 OpenAI Embedding 設定（此模式不會自動降級）。若剛更新 .env，請重啟機器人後再試。`,
          embeds: [],
          components: buildRetryGenerationComponents()
        }, 'main_menu.memory_error');
        if (memoryErrMsg?.id) {
          trackActiveGameMessage(player, thread.id, memoryErrMsg.id);
        }
        return;
      }
      const pendingStoryTrigger = forceFreshStory ? getPendingStoryTrigger(player) : null;
      let storyText = hasRecoverableStoryOnly ? String(player.currentStory || '').trim() : '';
      storyText = sanitizeStoryTurnMarkerLine(storyText);
      if (!hasRecoverableStoryOnly) {
        updateGenerationState(player, { phase: 'generating_story' });
        CORE.savePlayer(player);
        storyText = await STORY.generateStory(null, player, pet, pendingStoryTrigger, memoryContext);
        storyText = sanitizeStoryTurnMarkerLine(storyText);
        if (!storyText) {
          stopLoadingAnimation();
          finishGenerationState(player, 'failed', {
            phase: 'story_empty',
            error: 'AI story generation failed (empty result)',
            storySnapshot: player.currentStory,
            choicesSnapshot: []
          });
          CORE.savePlayer(player);
          const failStoryMsg = await editOrSendFallback(thread, loadingMsg, {
            content: '❌ AI 故事生成失敗，請點「重新生成」再試。',
            embeds: [],
            components: buildRetryGenerationComponents()
          }, 'main_menu.story_empty');
          if (failStoryMsg?.id) {
            trackActiveGameMessage(player, thread.id, failStoryMsg.id);
          }
          return;
        }

        player.currentStory = storyText;
        if (getMainlineBridgeLock(player, { autoClear: true })) {
          consumeMainlineBridgeLock(player);
        }
        player.eventChoices = [];
        if (pendingStoryTrigger) {
          clearPendingStoryTrigger(player);
        }
        const rememberStats = rememberStoryDialogues(player, storyText);
        if ((rememberStats?.quotes || 0) > 0 || (rememberStats?.mainline || 0) > 0) {
          console.log(
            `[StoryQuote] main_menu quotes=${rememberStats?.quotes || 0} dialoguePins=${rememberStats?.dialoguePins || 0} mainlinePins=${rememberStats?.mainline || 0} player=${player.id}`
          );
        }
        updateGenerationState(player, {
          phase: 'story_ready',
          storySnapshot: storyText,
          choicesSnapshot: []
        });
        CORE.savePlayer(player);
      }

      const storyFirstMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
      const storyFirstDesc =
        `${financeNoticeBlock}${worldIntroBlock}**${uiText.statusLabel}：【${statusBar}】**${storyFirstMainlineLine ? `\n${storyFirstMainlineLine}` : ''}\n\n${storyText}${portalGuideBlock}\n\n` +
        (hasRecoverableStoryOnly
          ? `⏳ *${generationText.recovering_choices || generationText.loading}*`
          : `⏳ *${generationText.story_generating_choices || generationText.generating_choices}*`);

      const storyFirstEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(0x00ff00)
        .setDescription(storyFirstDesc);

      stopLoadingAnimation();
      const storyOnlyMsg = await editOrSendFallback(
        thread,
        loadingMsg,
        { content: null, embeds: [storyFirstEmbed], components: [] },
        'main_menu.story_only'
      );
      if (storyOnlyMsg?.id) {
        trackActiveGameMessage(player, thread.id, storyOnlyMsg.id);
      }

      updateGenerationState(player, {
        phase: 'generating_choices',
        loadingMessageId: storyOnlyMsg?.id || loadingMsg?.id || null
      });
      CORE.savePlayer(player);
      const newChoices = await STORY.generateChoicesWithAI(player, pet, storyText, memoryContext);
      if (!newChoices || newChoices.length === 0) {
        finishGenerationState(player, 'failed', {
          phase: 'choice_empty',
          error: 'AI choice generation failed (empty result)',
          storySnapshot: storyText,
          choicesSnapshot: []
        });
        CORE.savePlayer(player);
        const failChoicesMsg = await editOrSendFallback(thread, storyOnlyMsg || loadingMsg, {
          content: '⚠️ 故事已生成，但選項生成失敗，請點「重新生成」。',
          embeds: [storyFirstEmbed],
          components: buildRetryGenerationComponents()
        }, 'main_menu.choice_empty');
        if (failChoicesMsg?.id) {
          trackActiveGameMessage(player, thread.id, failChoicesMsg.id);
        }
        return;
      }

      const normalizedNewChoices = applyChoicePolicy(
        player,
        maybeInjectRareCustomInputChoice(normalizeEventChoices(player, newChoices))
      );
      player.eventChoices = normalizedNewChoices;
      updateGenerationState(player, {
        phase: 'choices_ready',
        storySnapshot: storyText,
        choicesSnapshot: normalizedNewChoices
      });
      finishGenerationState(player, 'done', {
        phase: 'completed',
        storySnapshot: storyText,
        choicesSnapshot: normalizedNewChoices
      });
      CORE.savePlayer(player);

      const newOptionsText = buildChoiceOptionsText(normalizedNewChoices, { player, pet });

      const newButtons = buildEventChoiceButtons(normalizedNewChoices, player.id);
      appendMainMenuUtilityButtons(newButtons, player);

      const newComponents = [];
      for (let i = 0; i < newButtons.length; i += 5) {
        newComponents.push(new ActionRowBuilder().addComponents(newButtons.slice(i, i + 5)));
      }

      const aiMainlineLine = buildMainlineProgressLine(player, player.language || 'zh-TW');
      const aiDesc = `${financeNoticeBlock}${worldIntroBlock}**${uiText.statusLabel}：【${statusBar}】**${aiMainlineLine ? `\n${aiMainlineLine}` : ''}\n\n${storyText}${portalGuideBlock}\n\n**${uiText.sectionNewChoices}：**${newOptionsText}\n\n_${uiText.chooseNumber(CHOICE_DISPLAY_COUNT)}_`;

      const aiEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} - ${pet.name}`)
        .setColor(0x00ff00)
        .setDescription(aiDesc);

      const finalMenuMsg = await editOrSendFallback(
        thread,
        storyOnlyMsg || loadingMsg,
        { content: null, embeds: [aiEmbed], components: newComponents },
        'main_menu.final_menu'
      );
      if (finalMenuMsg?.id) {
        trackActiveGameMessage(player, thread.id, finalMenuMsg.id);
      }
      triggerMainlineForeshadowAIInBackground(player, {
        phase: 'main_menu',
        storyText,
        location: player.location,
        playerLang: player.language
      });
    } catch (err) {
      stopLoadingAnimation();
      console.log('[AI] 故事生成失敗:', err.message);
      finishGenerationState(player, 'failed', {
        phase: 'exception',
        error: err?.message || err,
        storySnapshot: player.currentStory,
        choicesSnapshot: player.eventChoices
      });
      CORE.savePlayer(player);
      const aiFailMsg = await editOrSendFallback(thread, loadingMsg, {
        content: `❌ AI 失敗：${err.message}\n請點「重新生成」再試。`,
        embeds: [],
        components: buildRetryGenerationComponents()
      }, 'main_menu.ai_fail');
      if (aiFailMsg?.id) {
        trackActiveGameMessage(player, thread.id, aiFailMsg.id);
      }
    } finally {
      stopTypingIndicator();
      releaseStoryLock(playerId);
    }
  })();
  
  releaseInScope = false;
  return;
  } catch (err) {
    console.log('[主選單] 生成失敗:', err?.message || err);
    finishGenerationState(player, 'failed', {
      phase: 'outer_exception',
      error: err?.message || err,
      storySnapshot: player.currentStory,
      choicesSnapshot: player.eventChoices
    });
    CORE.savePlayer(player);
    const failMsg = await thread.send({
      content: `❌ 主選單生成失敗：${err?.message || err}\n請點「重新生成」再試。`,
      components: buildRetryGenerationComponents()
    }).catch(() => null);
    if (failMsg) {
      trackActiveGameMessage(player, thread.id, failMsg.id);
    }
    if (interaction) {
      const notice = '⚠️ 本輪生成失敗，已在討論串送出「重新生成」按鈕。';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: notice, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: notice, ephemeral: true }).catch(() => {});
      }
    }
    return;
  } finally {
    if (releaseInScope) {
      releaseStoryLock(playerId);
    }
  }
  } finally {
    MENU_RENDER_GUARD.delete(guardKey);
  }
}

// ============== 主選單 ===============

  return {
    sendMainMenuToThread
  };
}

module.exports = {
  createMainMenuFlowUtils
};
