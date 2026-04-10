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
  const worldIntroBlock = worldIntro ? `🌍 **世界背景導讀**\n${worldIntro}\n\n` : '';
  const financeNotices = typeof ECON.consumeFinanceNotices === 'function'
    ? ECON.consumeFinanceNotices(player, 3)
    : [];
  if (financeNotices.length > 0) {
    stateMutated = true;
    CORE.savePlayer(player);
  }
  const financeNoticeBlock = financeNotices.length > 0
    ? `📬 **交易通知**\n${financeNotices.map((line) => `• ${line}`).join('\n')}\n\n`
    : '';
  const portalGuideBlock = player?.portalMenuOpen ? `\n\n${buildPortalUsageGuide(player)}` : '';
  let forceFreshStory = Boolean(getPendingStoryTrigger(player)?.forceFreshStory);
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
    const description = `${financeNoticeBlock}${worldIntroBlock}**${uiText.statusLabel}：【${statusBar}】**${mainlineLine ? `\n${mainlineLine}` : ''}\n\n${storyText}${portalGuideBlock}\n\n**${uiText.sectionChoices}：**${optionsText}\n\n_${uiText.chooseNumber(CHOICE_DISPLAY_COUNT)}_`;
    
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${player.name} - ${pet.name}`)
      .setColor(getAlignmentColor(player.alignment))
      .setDescription(description)
      .addFields(
        { name: '🐾 寵物', value: `${pet.name} (${getPetElementDisplayName(pet.type)})`, inline: true },
        { name: '⚔️ 氣血', value: formatPetHpWithRecovery(pet), inline: true },
        { name: '💰 Rns 代幣', value: String(player.stats.財富), inline: true }
      )
      .addFields(
        { name: '📍 位置', value: player.location, inline: true },
        { name: '🌟 幸運', value: String(player.stats.運氣), inline: true },
        { name: '📊 等級', value: String(player.level), inline: true }
      );
    
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
  const loadingHint = hasRecoverableStoryOnly
    ? 'AI 說書人正在補齊上次中斷的選項...'
    : (forceFreshStory ? 'AI 說書人正在承接戰鬥結果重塑新篇章...' : 'AI 說書人正在構思故事...');
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
  const stopLoadingAnimation = startLoadingAnimation(loadingMsg, loadingHint);
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
      if (!hasRecoverableStoryOnly) {
        updateGenerationState(player, { phase: 'generating_story' });
        CORE.savePlayer(player);
        storyText = await STORY.generateStory(null, player, pet, pendingStoryTrigger, memoryContext);
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
          ? '⏳ *已恢復上次故事，正在補齊選項...*'
          : '⏳ *故事已送達，正在生成選項...*');

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
