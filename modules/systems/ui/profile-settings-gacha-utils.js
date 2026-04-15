function createProfileSettingsGachaUtils(deps = {}) {
  const {
    CORE,
    PET,
    GACHA,
    WALLET,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    getPlayerUILang,
    getSettingsText,
    getWorldIntroTemplate,
    disableMessageComponents,
    getPetCapacityForUser,
    showMovesList,
    getPetElementColor,
    getPetElementDisplayName,
    ensureMentorSparRecord,
    formatPetHpWithRecovery,
    t,
    recordCashflow,
    buildSlotReels,
    buildGachaReelLines
  } = deps;

  async function showSettings(interaction, user) {
    const player = CORE.loadPlayer(user.id);
    const currentLang = getPlayerUILang(player);
    const tx = getSettingsText(currentLang);
    const introFull = getWorldIntroTemplate(currentLang);
    const introPreview = introFull.length > 900 ? `${introFull.slice(0, 900)}...` : introFull;
    const langName =
      currentLang === 'zh-TW'
        ? tx.langNameZhTw
        : currentLang === 'zh-CN'
          ? tx.langNameZhCn
          : currentLang === 'en'
            ? tx.langNameEn
            : tx.langNameZhTw;
    const walletBound = WALLET.isWalletBound(user.id);
    const walletData = WALLET.getWalletData(user.id);
    const walletStatus = walletBound
      ? tx.walletBound(walletData?.walletAddress || 'unknown')
      : tx.walletUnbound;

    if (player?.activeMessageId) {
      await disableMessageComponents(interaction.channel, player.activeMessageId);
    }

    const embed = new EmbedBuilder()
      .setTitle(tx.title)
      .setColor(0x0099ff)
      .setDescription(tx.desc)
      .addFields(
        { name: tx.fieldLanguage, value: `${tx.currentPrefix}${langName}`, inline: false },
        { name: tx.fieldWallet, value: walletStatus, inline: false },
        { name: tx.fieldWorldIntro, value: introPreview, inline: false }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lang_zh-TW').setLabel('🇹🇼 繁體中文').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('lang_zh-CN').setLabel('🇨🇳 簡體中文').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('lang_en').setLabel('🇺🇸 English').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(walletBound ? 'sync_wallet_now' : 'open_wallet_modal')
        .setLabel(walletBound ? tx.btnSyncWallet : tx.btnBindWallet)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('settings_back').setLabel(tx.btnBack).setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_renaiss_world').setLabel(tx.btnWorld).setStyle(ButtonStyle.Success)
    );

    await interaction.update({ embeds: [embed], components: [row, row2] });
  }

  async function showRenaissWorldGuide(interaction, user) {
    const player = CORE.loadPlayer(user.id);
    const lang = getPlayerUILang(player);
    const tx = getSettingsText(lang);
    const intro = getWorldIntroTemplate(lang);

    const title = tx.worldTitle;
    const desc = `${intro}\n\n${tx.worldDescSuffix}`;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(0x2f855a)
      .setDescription(desc);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('world_back_settings').setLabel(tx.btnBackSettings).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('settings_back').setLabel(tx.btnBackAdventure).setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({ embeds: [embed], components: [row] });
  }

  async function showProfile(interaction, user) {
    const player = CORE.loadPlayer(user.id);

    if (!player) {
      await interaction.update({ content: '❌ 找不到角色！', components: [] });
      return;
    }

    const profile = GACHA.getPlayerProfile(player);
    const uiLang = getPlayerUILang(player);
    const gachaConfig = GACHA.GACHA_CONFIG;
    const petCapacity = getPetCapacityForUser(user.id);
    const walletBound = WALLET.isWalletBound(user.id);
    const walletData = WALLET.getWalletData(user.id);
    const walletStatus = walletBound
      ? `已綁定：\`${walletData?.walletAddress || 'unknown'}\``
      : '未綁定（可立即補綁並同步資產）';

    const petsList = profile.pets.map(p =>
      `**${p.name}** (${p.type})\n` +
        `  HP: ${Math.round(Number(p.hp || 0))}/${Math.round(Number(p.maxHp || 0))} (+0)| ATK: ${p.attack}\n` +
        `  招式: ${p.moves.join(', ')}`
    ).join('\n\n') || '無寵物';

    const embed = new EmbedBuilder()
      .setTitle(`💳 ${player.name} 的檔案`)
      .setColor(0x0099ff)
      .setDescription('Renaiss星球冒險者檔案')
      .addFields(
        { name: '💰 現金 Rns 代幣', value: String(profile.rns), inline: true },
        { name: '📊 總資產', value: String(profile.totalAssets), inline: true },
        { name: '⭐ 升級點數', value: `${profile.upgradePoints} 點 (每點+${gachaConfig.hpPerPoint}HP)`, inline: true }
      )
      .addFields(
        { name: '📦 已開包數', value: `${profile.totalDraws} 包`, inline: true },
        { name: '🐾 寵物', value: String(profile.currentPets), inline: true },
        { name: '📍 位置', value: player.location, inline: true }
      )
      .addFields(
        { name: '📦 卡片 FMV', value: `$${petCapacity.cardFMV.toFixed(2)} USD（${petCapacity.cardCount} 張）`, inline: true },
        { name: '🐾 寵物額度', value: `${petCapacity.currentPets}/${petCapacity.maxPets}`, inline: true },
        { name: '🆕 可領取', value: `${petCapacity.availableSlots} 隻`, inline: true }
      )
      .addFields({ name: '📏 額度規則', value: '>100U 可 2 隻｜>1000U 可 3 隻', inline: false })
      .addFields({ name: '💳 錢包', value: walletStatus, inline: false })
      .addFields({ name: '🐾 寵物列表', value: petsList, inline: false });

    const rows = [];
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(walletBound ? 'sync_wallet_now' : 'open_wallet_modal')
        .setLabel(walletBound ? '🔄 同步資產' : '💳 綁定錢包')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('open_friends').setLabel('🤝 好友').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('show_moves').setLabel('🐾 寵物').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('open_gacha').setLabel('🎰 去開包').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('main_menu').setLabel('返回').setStyle(ButtonStyle.Secondary)
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_new_pet_start')
        .setLabel(`🆕 領取新寵物（剩${petCapacity.availableSlots}）`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(petCapacity.availableSlots <= 0),
      new ButtonBuilder()
        .setCustomId('show_memory_recap')
        .setLabel(uiLang === 'en' ? '🧠 Memory Recap' : (uiLang === 'zh-CN' ? '🧠 记忆回顾' : '🧠 記憶回顧'))
        .setStyle(ButtonStyle.Secondary)
    ));

    await interaction.update({ embeds: [embed], components: rows });
  }

  async function showGacha(interaction, user, notice = '') {
    const player = CORE.loadPlayer(user.id);

    if (!player) {
      await interaction.update({ content: '❌ 找不到角色！', components: [] });
      return;
    }

    const config = GACHA.GACHA_CONFIG;
    const profile = GACHA.getPlayerProfile(player);
    const currentRns = Math.max(0, Number(profile?.rns || player?.stats?.財富 || 0));

    const embed = new EmbedBuilder()
      .setTitle('🎰 招式扭蛋機')
      .setColor(0xffd700)
      .setDescription(`${notice ? `⚠️ ${notice}\n\n` : ''}花費 Rns 代幣 抽招式！\n目前持有：**${currentRns} Rns**`)
      .addFields(
        { name: '💰 單抽', value: `${config.singleCost} Rns 代幣 (1包)`, inline: true },
        { name: '💰 十連', value: `${config.tenPullCost} Rns 代幣 (10包)`, inline: true },
        { name: '💳 目前持有', value: `${currentRns} Rns`, inline: true }
      )
      .addFields(
        { name: '⭐ 升級點數', value: `${profile.upgradePoints} 點`, inline: true },
        { name: '📊 已開包數', value: `${profile.totalDraws} 包`, inline: true },
        { name: '💡 每點可換', value: `${config.hpPerPoint} HP`, inline: true }
      )
      .addFields({ name: '💡 說明', value: '每開1包 = 1升級點數\n每點 = 1 HP（可分配給不同寵物）\n可分配給任何寵物，用完就沒了', inline: false });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gacha_single').setLabel(`單抽 ${config.singleCost}｜餘額 ${currentRns}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('gacha_ten').setLabel(`十連 ${config.tenPullCost}｜餘額 ${currentRns}`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('main_menu').setLabel('返回').setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({ embeds: [embed], components: [row] });
  }

  async function handleGachaResult(interaction, user, count) {
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);

    if (!player) {
      await interaction.update({ content: '❌ 找不到角色！', components: [] });
      return;
    }

    const result = GACHA.drawMove(player, count);

    if (!result.success) {
      await showGacha(interaction, user, result.reason || '抽獎失敗');
      return;
    }

    if (Number(result.cost || 0) > 0) {
      recordCashflow(player, {
        amount: -Number(result.cost || 0),
        category: 'gacha_draw',
        source: `扭蛋 ${count === 10 ? '十連' : '單抽'}`,
        marketType: 'renaiss'
      });
    }

    const slotRows = result.draws.map((draw) => ({
      draw,
      reels: buildSlotReels(draw.tier === 3)
    }));
    const resultsText = buildGachaReelLines(slotRows, 3, true, uiLang);

    const gainedChips = [];
    for (const draw of result.draws) {
      if (!draw?.move?.name) continue;
      if (!Array.isArray(player.inventory)) player.inventory = [];
      const chipName = `技能晶片：${draw.move.name}`;
      player.inventory.unshift(chipName);
      gainedChips.push(chipName);
    }

    const makeSpinEmbed = (revealCount, showSkill, phaseText) => new EmbedBuilder()
      .setTitle(`🎰 開包中 x${count}`)
      .setColor(0xffd700)
      .setDescription(
          `💰 花費 ${result.cost} Rns 代幣\n` +
          `💡 拉霸規則：三格相同 = 5% 大獎（不改原本機率）\n\n` +
          `**${phaseText}**\n` +
          `${buildGachaReelLines(slotRows, revealCount, showSkill, uiLang)}`
      );

    const chipSummary = gainedChips.length > 0
      ? gainedChips.join('、')
      : '（本次無新增）';

    const finalEmbed = new EmbedBuilder()
      .setTitle(`🎰 開包結果 x${count}`)
      .setColor(0xffd700)
      .setDescription(`💰 花費 ${result.cost} Rns 代幣\n💡 拉霸規則：三格相同 = 5% 大獎（不改原本機率）\n\n**開到以下招式：**\n${resultsText}\n\n**總價值：${result.totalValue} Rns 代幣**\n**⭐ 獲得升級點數：+${result.earnedPoints} 點**\n**📊 已開包數：${result.totalDraws} 包**`)
      .addFields(
        { name: '📚 本次獲取技能晶片', value: `${gainedChips.length} 枚\n${String(chipSummary).slice(0, 1000)}`, inline: false },
        { name: '📌 學習規則', value: '抽到的是技能晶片；請到「🐾 寵物」頁面用下拉選單學習/取消學習。', inline: false },
        { name: '📦 販賣規則', value: '商店掛賣時，會以「技能晶片」名稱販賣。', inline: false }
      );

    CORE.savePlayer(player);

    await interaction.update({ embeds: [makeSpinEmbed(0, false, '機台啟動中...')], components: [] });
    const spinMsg = interaction.message;
    const spinFrames = [
      { reveal: 1, wait: 280, text: '第一格揭曉...' },
      { reveal: 2, wait: 280, text: '第二格揭曉...' },
      { reveal: 3, wait: 280, text: '第三格揭曉...' }
    ];
    for (const frame of spinFrames) {
      await new Promise((resolve) => setTimeout(resolve, frame.wait));
      if (spinMsg?.edit) {
        await spinMsg.edit({ embeds: [makeSpinEmbed(frame.reveal, false, frame.text)], components: [] }).catch(() => {});
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const rowAction = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_gacha').setLabel('繼續抽').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('show_moves').setLabel('🐾 前往寵物').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('main_menu').setLabel('返回主選單').setStyle(ButtonStyle.Primary)
    );
    const finalRows = [rowAction];

    if (spinMsg?.edit) {
      await spinMsg.edit({ embeds: [finalEmbed], components: finalRows }).catch(async () => {
        await interaction.followUp({ embeds: [finalEmbed], components: finalRows }).catch(() => {});
      });
      return;
    }
    await interaction.followUp({ embeds: [finalEmbed], components: finalRows }).catch(() => {});
  }

  async function handleAllocateHP(interaction, user, petId, amountInput = 1) {
    const player = CORE.loadPlayer(user.id);

    if (!player) {
      await interaction.update({ content: '❌ 找不到角色！', components: [] });
      return;
    }

    const pet = PET.getPetById(petId);
    if (!pet || String(pet.ownerId || '') !== String(user.id || '')) {
      await showMovesList(interaction, user, petId, '⚠️ 找不到可加點的寵物。');
      return;
    }

    const remain = Math.max(0, Number(player?.upgradePoints || 0));
    let amount = 1;
    if (String(amountInput || '').toLowerCase() === 'max') {
      amount = remain;
    } else {
      const parsed = Math.floor(Number(amountInput || 1));
      amount = Number.isFinite(parsed) ? parsed : 1;
    }
    amount = Math.max(1, amount);
    if (remain <= 0) {
      await showMovesList(interaction, user, petId, '⚠️ 升級點數不足。');
      return;
    }
    amount = Math.min(amount, remain);

    const result = GACHA.allocateUpgradePoint(user.id, petId, amount);

    if (!result.success) {
      await showMovesList(interaction, user, petId, `⚠️ 升級失敗：${result.reason}`);
      return;
    }

    await showMovesList(
      interaction,
      user,
      petId,
      `✅ ${result.petName} HP +${result.hpGain}（已用 ${result.pointsUsed} 點，剩餘 ${result.remaining} 點）`
    );
  }

  async function showCharacter(interaction, user) {
    const player = CORE.loadPlayer(user.id);
    const pet = PET.loadPet(user.id);
    const uiLang = getPlayerUILang(player);

    if (!player) {
      await interaction.update({ content: '❌ 找不到角色！', components: [] });
      return;
    }

    const mentorRecord = ensureMentorSparRecord(player);
    const mentorCompleted = Object.values(mentorRecord?.completedByMentor || {});
    const mentorCount = mentorCompleted.length;
    const mentorPreview = mentorCompleted
      .slice(-3)
      .map((row) => String(row?.mentorName || row?.mentorId || '未知導師'))
      .filter(Boolean)
      .join('、') || '尚未完成';
    const wantedLevel = Math.max(
      0,
      Number(typeof CORE.getPlayerWantedLevel === 'function' ? CORE.getPlayerWantedLevel(user.id) : 0),
      Number(player?.wanted || 0)
    );

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${player.name}`)
      .setColor(getPetElementColor(player.petElement || pet?.type || '水'))
      .setDescription(`**${player.title}**`)
      .addFields(
        { name: '👤 性別', value: String(player.gender || '男'), inline: true },
        { name: '🐾 夥伴屬性', value: getPetElementDisplayName(player.petElement || pet?.type || '水'), inline: true },
        { name: '📍 位置', value: player.location, inline: true }
      )
      .addFields(
        { name: '🚨 通緝級', value: String(wantedLevel), inline: true },
        { name: '🍀 幸運值', value: String(player.stats.運氣), inline: true },
        { name: t('hp', uiLang), value: `${player.stats.生命}/${player.maxStats.生命}`, inline: true },
        { name: t('gold', uiLang), value: String(player.stats.財富), inline: true },
        { name: '🎖️ 友誼賽成就', value: `${mentorCount} 位`, inline: true },
        { name: '🧾 已完成導師', value: mentorPreview, inline: false }
      );

    if (pet) {
      embed.addFields(
        { name: '---寵物---', value: `**${pet.name}** (${getPetElementDisplayName(pet.type)})`, inline: false },
        { name: t('hp', uiLang), value: formatPetHpWithRecovery(pet), inline: true },
        { name: '⚔️ 攻擊', value: String(pet.attack), inline: true },
        { name: '🛡️ 防禦', value: String(pet.defense), inline: true }
      );
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_profile').setLabel('💳 檔案').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('open_friends').setLabel('🤝 好友').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('show_finance_ledger').setLabel('💸 資金流水').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({ embeds: [embed], components: [row] });
  }

  return {
    showSettings,
    showRenaissWorldGuide,
    showProfile,
    showGacha,
    handleGachaResult,
    handleAllocateHP,
    showCharacter
  };
}

module.exports = {
  createProfileSettingsGachaUtils
};
