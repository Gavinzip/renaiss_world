function createOnboardingRuntimeFlowUtils(deps = {}) {
  const {
    CORE,
    PET,
    BATTLE,
    ECON,
    WALLET,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    getLocationProfile = () => null,
    updateInteractionMessage,
    getPlayerTempData,
    setPlayerTempData,
    clearPlayerTempData,
    getPlayerUILang,
    buildGenderSelectionPayload,
    buildElementSelectionPayload,
    showCharacterNameModal,
    showOnboardingPetNameModal,
    normalizeCharacterName,
    normalizePetName,
    pickDefaultPetNameByElement,
    normalizeCharacterGender,
    normalizePetElementCode,
    normalizePlayerAlignment,
    getLanguageText,
    getPetMovePool,
    getMoveTierMeta,
    getPetElementDisplayName,
    getPetElementColor,
    resumeExistingOnboardingOrGame,
    t,
    format1,
    getMoveSpeedValue,
    formatPetHpWithRecovery,
    grantStarterFivePullIfNeeded,
    rollStarterMoveForElement,
    sendMainMenuToThread,
    getSettingsHubText
  } = deps;

  async function showWalletBindModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('wallet_bind_modal')
      .setTitle('💳 綁定錢包');

    const input = new TextInputBuilder()
      .setCustomId('wallet_address')
      .setLabel('BSC 錢包地址')
      .setPlaceholder('0x...')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  async function syncWalletAndApplyNow(discordUserId) {
    const assets = await WALLET.getPlayerWalletAssets(discordUserId);
    if (!assets?.success || !assets.assets) {
      throw new Error(assets?.reason || '無法讀取錢包資產');
    }

    const player = CORE.loadPlayer(discordUserId);
    const ledger = WALLET.applyWalletRnsDelta(discordUserId, assets.rns, {
      assumeClaimedIfMissing: Boolean(player)
    });
    if (!ledger?.success) {
      throw new Error(ledger?.reason || '錢包入帳同步失敗');
    }

    WALLET.updateWalletData(discordUserId, {
      cardFMV: assets.assets.cardFMV,
      cardCount: assets.assets.cardCount,
      packTxCount: assets.assets.packTxCount,
      packSpentUSDT: assets.assets.packSpentUSDT,
      tradeSpentUSDT: assets.assets.tradeSpentUSDT,
      totalSpentUSDT: assets.assets.totalSpentUSDT
    });

    if (player) {
      const currentGold = Math.max(0, Number(player?.stats?.財富 || 0));
      player.stats.財富 = currentGold + Math.max(0, Number(ledger.delta || 0));
      CORE.savePlayer(player);
    }

    return {
      ...assets,
      walletTotalRns: ledger.walletTotalRns,
      syncDeltaRns: ledger.delta,
      pendingRns: ledger.pendingAfter,
      claimedBefore: ledger.claimedBefore
    };
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  async function syncWalletAndApplyWithRetry(discordUserId, options = {}) {
    const maxAttempts = Math.max(1, Math.floor(Number(options.maxAttempts || 3)));
    const retryDelayMs = Math.max(0, Math.floor(Number(options.retryDelayMs || 800)));
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const assets = await syncWalletAndApplyNow(discordUserId);
        return { assets, attempt, maxAttempts };
      } catch (err) {
        lastErr = err;
        if (attempt >= maxAttempts) break;
        console.warn(`[錢包] 背景同步重試 ${attempt}/${maxAttempts} user=${discordUserId}:`, err?.message || err);
        await delay(retryDelayMs);
      }
    }

    throw (lastErr || new Error('錢包背景同步失敗'));
  }

  function syncWalletInBackground(interaction, user, bindAddress = '') {
    const userId = String(user?.id || '').trim();
    if (!userId) return;

    Promise.resolve()
      .then(async () => {
        const retryDelayMs = Math.max(0, Math.floor(Number(process.env.WALLET_BIND_SYNC_RETRY_DELAY_MS || 800)));
        const { assets, attempt } = await syncWalletAndApplyWithRetry(userId, {
          maxAttempts: 3,
          retryDelayMs
        });
        const maxPets = WALLET.getMaxPetsByFMV(assets.assets.cardFMV);
        const retryHint = attempt > 1 ? `（已重試 ${attempt - 1} 次）\n` : '';
        const notice =
          `✅ 錢包資料背景同步完成\n` +
          `錢包：\`${bindAddress || WALLET.getWalletAddress(userId) || 'unknown'}\`\n` +
          retryHint +
          `🎁 錢包可領總額：${assets.walletTotalRns}\n` +
          `➕ 本次新增入帳：${assets.syncDeltaRns}\n` +
          `🐾 可擁有寵物：${maxPets} 隻`;
        if (interaction && typeof interaction.followUp === 'function') {
          await interaction.followUp({ content: notice, ephemeral: true }).catch(() => {});
        }
      })
      .catch((e) => {
        console.error(`[錢包] 背景同步失敗 user=${userId}:`, e?.message || e);
        if (interaction && typeof interaction.followUp === 'function') {
          interaction.followUp({
            content: `⚠️ 錢包背景同步失敗：${e?.message || e}\n請到「檔案 > 🔄 同步資產」再試一次。`,
            ephemeral: true
          }).catch(() => {});
        }
      });
  }

  async function handleWalletBind(interaction, user) {
    const walletAddress = interaction.fields.getTextInputValue('wallet_address').trim();

    const result = WALLET.bindWallet(user.id, walletAddress);

    if (!result.success) {
      await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
      return;
    }

    const hasPlayer = Boolean(CORE.loadPlayer(user.id));
    const embed = new EmbedBuilder()
      .setTitle('✅ 已接收錢包綁定請求')
      .setColor(0x00ff00)
      .setDescription(
        `錢包地址：\`${result.address}\`\n\n` +
          `鏈上資料正在背景同步中，完成後會自動入帳到你的 Rns。\n` +
          `如果你正在遊玩，可先繼續流程，不用停在這裡等待。`
      );

    const buttons = hasPlayer
      ? new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 回到冒險').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('open_profile').setLabel('💳 查看檔案').setStyle(ButtonStyle.Secondary)
        )
      : new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('continue_with_wallet').setLabel('🚀 繼續新手流程').setStyle(ButtonStyle.Primary)
        );

    await interaction.update({ embeds: [embed], components: [buttons] });
    syncWalletInBackground(interaction, user, result.address);
  }

  async function handleWalletSyncNow(interaction, user) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    try {
      const assets = await syncWalletAndApplyNow(user.id);
      const maxPets = WALLET.getMaxPetsByFMV(assets.assets.cardFMV);
      const cardInfo = assets.assets.cardCount > 0
        ? `📦 卡片 FMV: $${assets.assets.cardFMV.toFixed(2)} USD (${assets.assets.cardCount} 張)\n`
        : '📦 卡片 FMV: $0.00 USD (0 張)\n';

      const embed = new EmbedBuilder()
        .setTitle('🔄 錢包資產已同步')
        .setColor(0x00c853)
        .setDescription(
          `${cardInfo}` +
            `📊 開包數量: ${assets.assets.packTxCount} 次\n` +
            `💸 總花費(開包+市場買入): $${Number(assets.assets.totalSpentUSDT || 0).toFixed(2)} USDT\n` +
            `🎁 錢包可領總額: ${assets.walletTotalRns}\n` +
            `➕ 本次新增入帳: ${assets.syncDeltaRns}\n` +
            `🐾 可擁有寵物: ${maxPets} 隻`
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_profile').setLabel('💳 返回檔案').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('open_settings').setLabel('⚙️ 設定').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 回到冒險').setStyle(ButtonStyle.Success)
      );

      await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
    } catch (e) {
      await updateInteractionMessage(interaction, {
        embeds: [
          new EmbedBuilder()
            .setTitle('⚠️ 同步失敗')
            .setColor(0xffa500)
            .setDescription(`錯誤：${e.message}\n請稍後再試。`)
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_profile').setLabel('💳 返回檔案').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('open_settings').setLabel('⚙️ 設定').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 回到冒險').setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    }
  }

  async function sendOnboardingLanguageSelection(interaction, user, options = {}) {
    const walletBound = WALLET.isWalletBound(user.id);
    const walletNote = walletBound
      ? '✅ 已綁定錢包：建立角色時會帶入目前錢包資產。'
      : 'ℹ️ 尚未綁定錢包：你可以先玩，之後到設定綁定並即時入帳。';

    const langEmbed = new EmbedBuilder()
      .setTitle('🌍 選擇你的語言 / Choose Your Language')
      .setColor(0xffd700)
      .setDescription(`**${user.username}**，歡迎來到 Renaiss 星球！\n\nPlease select your language first / 請先選擇語言：\n\n支援的語言：`)
      .addFields(
        { name: '🇹🇼 繁體中文', value: '繁體中文（台灣、香港）', inline: true },
        { name: '🇨🇳 簡體中文', value: '简体中文（中国）', inline: true },
        { name: '🇺🇸 English', value: 'English (US/EU)', inline: true },
        { name: '💳 錢包狀態', value: walletNote, inline: false }
      );
    const langRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('select_lang_zh-TW').setLabel('🇹🇼 繁體中文').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('select_lang_zh-CN').setLabel('🇨🇳 簡體中文').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('select_lang_en').setLabel('🇺🇸 English').setStyle(ButtonStyle.Secondary)
    );

    if (options.replaceCurrent) {
      await interaction.update({ embeds: [langEmbed], components: [langRow] }).catch(async () => {
        await interaction.reply({ embeds: [langEmbed], components: [langRow], ephemeral: true }).catch(() => {});
      });
      return;
    }
    await interaction.channel.send({ embeds: [langEmbed], components: [langRow] }).catch(() => {});
  }

  async function handleContinueWithWalletButton(interaction, user) {
    const threadChannel = interaction.channel;

    const player = CORE.loadPlayer(user.id);
    if (player) {
      await interaction.deferUpdate().catch(() => {});
      await showMainMenu(interaction, player, PET.loadPet(user.id));
      return;
    }

    await interaction.deferUpdate().catch(() => {});

    try {
      const initialRns = WALLET.getPendingRNS(user.id);
      const selectedLang = getPlayerTempData(user.id, 'language') || 'zh-TW';
      const payload = buildGenderSelectionPayload(selectedLang, user.username);
      payload.embed.addFields({ name: '💰 初始 Rns', value: String(initialRns), inline: true });

      await threadChannel.send({
        embeds: [payload.embed],
        components: [payload.row]
      });
    } catch (err) {
      console.error('[錯誤] 創建角色失敗:', err.message);
    }
  }

  async function handleLegacyAlignmentChoice(interaction, user, customId) {
    const forcedGender = customId === 'choose_positive' ? '男' : '女';
    const lang = getPlayerTempData(user.id, 'language') || 'zh-TW';
    const payload = buildElementSelectionPayload(lang, forcedGender);
    setPlayerTempData(user.id, 'gender', forcedGender);
    await interaction.update({ embeds: [payload.embed], components: [payload.row] }).catch(() => {});
  }

  async function handleChooseGender(interaction, user, customId) {
    const gender = customId === 'choose_gender_female' ? '女' : '男';

    const resumed = await resumeExistingOnboardingOrGame(interaction, user);
    if (resumed) {
      await interaction.message?.edit({ components: [] }).catch(() => {});
      return;
    }

    const lang = getPlayerTempData(user.id, 'language') || 'zh-TW';
    setPlayerTempData(user.id, 'gender', gender);
    try {
      await showCharacterNameModal(interaction, gender, lang);
    } catch (_) {
      const payload = buildElementSelectionPayload(lang, gender);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [payload.embed], components: [payload.row] }).catch(async () => {
          await interaction.channel?.send({ embeds: [payload.embed], components: [payload.row] }).catch(() => {});
        });
      } else {
        await interaction.reply({ embeds: [payload.embed], components: [payload.row] }).catch(async () => {
          await interaction.channel?.send({ embeds: [payload.embed], components: [payload.row] }).catch(() => {});
        });
      }
    }
  }

  async function handleChoosePetElement(interaction, user, customId) {
    const resumed = await resumeExistingOnboardingOrGame(interaction, user);
    if (resumed) {
      await interaction.message?.edit({ components: [] }).catch(() => {});
      return;
    }

    const match = String(customId || '').match(/^choose_element_(male|female)_(water|fire|grass)$/);
    const lang = getPlayerTempData(user.id, 'language') || 'zh-TW';
    const langText = getLanguageText(lang);
    if (!match) {
      await interaction.reply({ content: langText.elementChoiceInvalid, ephemeral: true }).catch(() => {});
      return;
    }
    const gender = match[1] === 'female' ? '女' : '男';
    const element = match[2] === 'fire' ? '火' : match[2] === 'grass' ? '草' : '水';
    setPlayerTempData(user.id, 'gender', gender);
    setPlayerTempData(user.id, 'petElement', element);
    await interaction.message?.edit({ components: [] }).catch(() => {});
    await showOnboardingPetNameModal(interaction, lang).catch(async () => {
      const charName = normalizeCharacterName(getPlayerTempData(user.id, 'charName') || user.username, user.username);
      await createCharacterWithName(interaction, user, { gender, element, alignment: '正派' }, charName, {
        petName: pickDefaultPetNameByElement(element)
      });
    });
  }

  async function createCharacterWithName(interaction, user, profile, charName, options = {}) {
    const existingPlayer = CORE.loadPlayer(user.id);
    const existingPet = PET.loadPet(user.id);
    if (existingPlayer && existingPet) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '✅ 你已建立角色，請繼續目前進度。', ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: '✅ 你已建立角色，請繼續目前進度。', ephemeral: true }).catch(() => {});
      }
      return;
    }

    const pendingRNS = WALLET.getPendingRNS(user.id);
    const selectedGender = normalizeCharacterGender(profile?.gender || getPlayerTempData(user.id, 'gender') || '男');
    const selectedElement = normalizePetElementCode(profile?.element || getPlayerTempData(user.id, 'petElement') || '水');
    const alignment = normalizePlayerAlignment(profile?.alignment || '正派');
    const finalCharacterName = normalizeCharacterName(charName, user.username);
    const finalPetName = normalizePetName(options?.petName || '', selectedElement);

    const player = CORE.createPlayer(user.id, finalCharacterName, selectedGender, '無門無派');
    const spawnProfile = typeof getLocationProfile === 'function'
      ? getLocationProfile(player.location)
      : null;
    player.alignment = alignment;
    player.petElement = selectedElement;
    player.wanted = 0;
    player.stats.財富 = pendingRNS;
    ECON.ensurePlayerEconomy(player);

    const selectedLang = getPlayerTempData(user.id, 'language') || 'zh-TW';
    player.language = selectedLang;
    const uiLang = getPlayerUILang(player);
    player.currentStory = '';
    player.eventChoices = [];
    CORE.savePlayer(player);
    WALLET.updatePendingRNS(user.id, 0);

    clearPlayerTempData(user.id);

    const selectedMove = rollStarterMoveForElement(selectedElement);
    if (!selectedMove) {
      const failEmbed = new EmbedBuilder()
        .setTitle('❌ 開局初始化失敗')
        .setColor(0xff4d4f)
        .setDescription('找不到可用招式池，請重新 /start。');
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [failEmbed], components: [] }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [failEmbed], components: [] }).catch(() => {});
      }
      return;
    }

    const pet = PET.createPetEgg(user.id, selectedElement);
    pet.hatched = true;
    pet.status = '正常';
    pet.waitingForName = false;
    pet.name = finalPetName;
    pet.reviveAt = null;
    pet.reviveTurnsRemaining = 0;
    pet.moves = [
      { ...PET.INITIAL_MOVES[0], currentProficiency: 0 },
      { ...PET.INITIAL_MOVES[1], currentProficiency: 0 },
      {
        id: selectedMove.id,
        name: selectedMove.name,
        element: selectedMove.element,
        tier: selectedMove.tier,
        type: 'elemental',
        baseDamage: selectedMove.baseDamage,
        effect: selectedMove.effect,
        desc: selectedMove.desc,
        currentProficiency: 0
      }
    ];
    PET.updateAppearance(pet);
    PET.savePet(pet);
    const starterPack = grantStarterFivePullIfNeeded(user.id);
    const tierMeta = getMoveTierMeta(selectedMove.tier);
    const dmgInfo = pet.moves.map((m) => {
      const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
      const speed = getMoveSpeedValue(m);
      return `• ${m.name} (${m.element}): ${format1(d.total)}dmg｜🚀速度${format1(speed)}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🎉 角色建立完成｜開局抽獎完成')
      .setColor(tierMeta.color)
      .setDescription(
        `**${player.name}**，你的 Renaiss 星球之旅開始了！\n\n` +
          `👤 角色已命名：**${player.name}**\n` +
          `🐾 寵物已命名：**${pet.name}**\n\n` +
          `🎰 開局抽獎結果：${tierMeta.emoji} **${selectedMove.name}**（${tierMeta.name}）`
      )
      .addFields(
        { name: '📍 位置', value: player.location, inline: true },
        { name: '🎚️ 出生難度', value: spawnProfile ? `D${spawnProfile.difficulty}` : 'D1', inline: true },
        { name: '👤 角色性別', value: selectedGender, inline: true },
        { name: '🐾 寵物', value: `${pet.name}（${getPetElementDisplayName(selectedElement)}）`, inline: true },
        { name: t('hp', uiLang), value: `${player.stats.生命}/${player.maxStats.生命}`, inline: true },
        { name: t('gold', uiLang), value: String(player.stats.財富), inline: true }
      )
      .addFields(
        { name: '✨ 開局天賦', value: `${tierMeta.emoji} ${selectedMove.name}｜${tierMeta.name}（機率 ${tierMeta.rate}）`, inline: false },
        { name: '📜 寵物招式', value: dmgInfo, inline: false }
      );

    if (starterPack) {
      const chips = Array.isArray(starterPack.grantedChips) ? starterPack.grantedChips : [];
      const chipLine = chips.length > 0
        ? chips
          .slice(0, 5)
          .map((m) => `${m.emoji} ${m.name}`)
          .join('、')
        : '本次技能晶片發放失敗，請稍後重試。';
      embed.addFields({
        name: '🎁 開局贈禮：免費五連抽',
        value: `已發放為技能晶片（已進背包，可販售；想學再到寵物招式頁學習）。\n本次新增：${chips.length} 張\n${chipLine}`,
        inline: false
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 開始冒險').setStyle(ButtonStyle.Success)
    );

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [embed], components: [row] }).catch(async () => {
        await interaction.channel.send({ embeds: [embed], components: [row] });
      });
    } else {
      await interaction.reply({ embeds: [embed], components: [row] }).catch(async () => {
        await interaction.channel.send({ embeds: [embed], components: [row] });
      });
    }
  }

  async function handleHatchEgg(interaction, user) {
    const egg = PET.loadPet(user.id);

    if (!egg || egg.hatched) {
      await interaction.update({ content: '❌ 寵物已孵化！', components: [] });
      return;
    }

    const stage1Embed = new EmbedBuilder()
      .setTitle('🔨 敲蛋中...')
      .setColor(0x8B4513)
      .setDescription(`💫 你举起手中的石块，对准那颗神秘的宠物蛋...
    
*「砰！砰砰！」*
    
蛋壳开始出现裂纹，一道光芒从裂缝中透出...
    
⏳ 寵物正在孵化中...`);

    const loadingRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hatch_loading').setLabel('⏳ 孵化中...').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );

    await interaction.update({ embeds: [stage1Embed], components: [loadingRow] });
    await new Promise(resolve => setTimeout(resolve, 1500));

    const stage2Embed = new EmbedBuilder()
      .setTitle('✨ 光芒萬丈！')
      .setColor(0xffd700)
      .setDescription(`一道璀璨的光芒冲天而起！
    
🌟 寵物的天賦正在覺醒...
    
*傳說中的招式即將現世...*`);

    await interaction.editReply({ embeds: [stage2Embed], components: [loadingRow] });
    await new Promise(resolve => setTimeout(resolve, 1000));

    const allMoves = getPetMovePool(egg.type);
    if (!Array.isArray(allMoves) || allMoves.length <= 0) {
      await interaction.editReply({ content: '❌ 找不到可用招式池，請重新孵化。', embeds: [], components: [] }).catch(() => {});
      return;
    }
    const shuffled = [...allMoves].sort(() => Math.random() - 0.5);
    const choices = shuffled.slice(0, 3);
    const roll = Math.random();
    const tierIndex = roll < 0.80 ? 0 : roll < 0.95 ? 1 : 2;
    const tierMoves = choices.filter(m => m.tier === tierIndex + 1);
    const selectedMove = tierMoves.length > 0 ? tierMoves[0] : choices.filter(m => m.tier === 1)[0] || choices[0];

    const tierEmoji = selectedMove.tier === 3 ? '🔮' : selectedMove.tier === 2 ? '💠' : '⚪';
    const tierName = selectedMove.tier === 3 ? '史詩' : selectedMove.tier === 2 ? '稀有' : '普通';
    const tierColor = selectedMove.tier === 3 ? 0x9932cc : selectedMove.tier === 2 ? 0x1e90ff : 0x808080;

    const resultEmbed = new EmbedBuilder()
      .setTitle(`${tierEmoji} 天賦覺醒：${selectedMove.name}`)
      .setColor(tierColor)
      .setDescription(`🎉 恭喜！你獲得了 **${tierEmoji} ${tierName}級招式**——**${selectedMove.name}**！
    
✨ *${selectedMove.desc}*

💫 寵物蛋殼完全碎裂，你的寵物終於誕生了！`);

    resultEmbed.addFields({ name: '稀有度', value: `${tierEmoji} ${tierName} (${selectedMove.tier === 3 ? '5%' : selectedMove.tier === 2 ? '15%' : '80%'} 機率)`, inline: true });

    egg.hatched = true;
    egg.status = '待命名';
    egg.moves = [
      { ...PET.INITIAL_MOVES[0], currentProficiency: 0 },
      { ...PET.INITIAL_MOVES[1], currentProficiency: 0 },
      {
        id: selectedMove.id,
        name: selectedMove.name,
        element: selectedMove.element,
        tier: selectedMove.tier,
        type: 'elemental',
        baseDamage: selectedMove.baseDamage,
        effect: selectedMove.effect,
        desc: selectedMove.desc,
        currentProficiency: 0
      }
    ];
    egg.waitingForName = true;
    PET.savePet(egg);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('enter_pet_name').setLabel('✏️ 為寵物取名').setStyle(ButtonStyle.Success)
    );

    await interaction.editReply({ embeds: [resultEmbed], components: [row] });
  }

  async function handleEnterPetNameButton(interaction, user) {
    const pet = PET.loadPet(user.id);
    if (!pet || !pet.waitingForName) {
      await interaction.update({ content: '❌ 錯誤！', components: [] });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`name_modal_${user.id}`)
      .setTitle('📝 為寵物取名');

    const nameInput = new TextInputBuilder()
      .setCustomId('pet_name')
      .setLabel('寵物名字')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('輸入名字（1-6個字）')
      .setMinLength(1)
      .setMaxLength(6)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    await interaction.showModal(modal);
  }

  async function handleNameSubmit(interaction, user) {
    const pet = PET.loadPet(user.id);
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);

    if (!pet || !pet.waitingForName) {
      await interaction.reply({ content: '❌ 錯誤！', components: [] });
      return;
    }

    let name = interaction.fields.getTextInputValue('pet_name').trim();
    if (!name || name.length < 1 || name.length > 6) {
      name = pickDefaultPetNameByElement(pet.type);
    }

    pet.name = name;
    pet.waitingForName = false;
    PET.savePet(pet);
    const starterPack = grantStarterFivePullIfNeeded(user.id);

    const dmgInfo = pet.moves.map(m => {
      const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
      const speed = getMoveSpeedValue(m);
      return `• ${m.name} (${m.element}): ${format1(d.total)}dmg｜🚀速度${format1(speed)}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🐾 ${pet.name} 命名成功！`)
      .setColor(getPetElementColor(pet.type))
      .setDescription(pet.appearance)
      .addFields(
        { name: '🐾 名字', value: pet.name, inline: true },
        { name: '🏷️ 屬性', value: getPetElementDisplayName(pet.type), inline: true },
        { name: t('hp', uiLang), value: formatPetHpWithRecovery(pet), inline: true },
        { name: t('atk', uiLang), value: String(pet.attack), inline: true },
        { name: t('def', uiLang), value: String(pet.defense), inline: true },
        { name: '⚡ 速度', value: String(pet.speed), inline: true }
      )
      .addFields({ name: '📜 招式', value: dmgInfo, inline: false });

    if (starterPack) {
      const chips = Array.isArray(starterPack.grantedChips) ? starterPack.grantedChips : [];
      const chipLine = chips.length > 0
        ? chips
          .slice(0, 5)
          .map(m => `${m.emoji} ${m.name}`)
          .join('、')
        : '本次技能晶片發放失敗，請稍後重試。';
      embed.addFields({
        name: '🎁 開局贈禮：免費五連抽',
        value: `已發放為技能晶片（已進背包，可販售；想學再到寵物招式頁學習）。\n本次新增：${chips.length} 張\n${chipLine}`,
        inline: false
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 開始探險！').setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], components: [row] });
  }

  async function handleSkipNameButton(interaction, user) {
    const userId = user.id;
    const pet = PET.loadPet(userId);
    const player = CORE.loadPlayer(userId);
    const uiLang = getPlayerUILang(player);

    if (!pet || !pet.waitingForName) return;

    const name = pickDefaultPetNameByElement(pet.type);

    pet.name = name;
    pet.waitingForName = false;
    PET.savePet(pet);
    const starterPack = grantStarterFivePullIfNeeded(userId);

    const dmgInfo = pet.moves.map(m => {
      const d = BATTLE.calculatePlayerMoveDamage(m, {}, pet);
      const speed = getMoveSpeedValue(m);
      return `• ${m.name} (${m.element}): ${format1(d.total)}dmg｜🚀速度${format1(speed)}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🐾 寵物命名：${pet.name}`)
      .setColor(getPetElementColor(pet.type))
      .setDescription(pet.appearance)
      .addFields(
        { name: '🐾 名字', value: pet.name, inline: true },
        { name: '🏷️ 屬性', value: getPetElementDisplayName(pet.type), inline: true },
        { name: t('hp', uiLang), value: formatPetHpWithRecovery(pet), inline: true },
        { name: '⚔️ 攻擊', value: String(pet.attack), inline: true },
        { name: '🛡️ 防禦', value: String(pet.defense), inline: true }
      )
      .addFields({ name: '📜 招式', value: dmgInfo, inline: false });

    if (starterPack) {
      const chips = Array.isArray(starterPack.grantedChips) ? starterPack.grantedChips : [];
      const chipLine = chips.length > 0
        ? chips
          .slice(0, 5)
          .map(m => `${m.emoji} ${m.name}`)
          .join('、')
        : '本次技能晶片發放失敗，請稍後重試。';
      embed.addFields({
        name: '🎁 開局贈禮：免費五連抽',
        value: `已發放為技能晶片（已進背包，可販售；想學再到寵物招式頁學習）。\n本次新增：${chips.length} 張\n${chipLine}`,
        inline: false
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel('🎮 開始探險！').setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], components: [row] });
  }

  async function showMainMenu(interaction, player, pet) {
    if (interaction.channel?.isThread()) {
      await sendMainMenuToThread(interaction.channel, player, pet, interaction);
      return;
    }

    const msg = '⚠️ 請使用 /start 開啟你的遊戲討論串，再繼續冒險。';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }

  async function showSettingsHub(interaction, user, notice = '') {
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getSettingsHubText(uiLang);
    const embed = new EmbedBuilder()
      .setTitle(tx.title)
      .setColor(0x64748b)
      .setDescription(`${notice ? `${notice}\n\n` : ''}${tx.desc}`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('show_memory_audit').setLabel(tx.btnMemory).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_settings_system').setLabel(tx.btnSystem).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('main_menu').setLabel(tx.btnBack).setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({ embeds: [embed], components: [row] });
  }

  return {
    showWalletBindModal,
    syncWalletAndApplyNow,
    syncWalletInBackground,
    handleWalletBind,
    handleWalletSyncNow,
    sendOnboardingLanguageSelection,
    handleContinueWithWalletButton,
    handleLegacyAlignmentChoice,
    handleChooseGender,
    handleChoosePetElement,
    createCharacterWithName,
    handleHatchEgg,
    handleEnterPetNameButton,
    handleNameSubmit,
    handleSkipNameButton,
    showMainMenu,
    showSettingsHub
  };
}

module.exports = {
  createOnboardingRuntimeFlowUtils
};
