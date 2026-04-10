function createPlayerPanelUtils(deps = {}) {
  const {
    CORE,
    PET,
    BATTLE,
    ECON,
    STORY,
    GACHA,
    GACHA_CONFIG,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MOVES_DETAIL_PAGE_SIZE,
    PET_MOVE_LOADOUT_LIMIT,
    MARKET_LIST_PAGE_SIZE,
    SHOP_SELL_SELECT_LIMIT,
    SHOP_HAGGLE_SELECT_LIMIT,
    SHOP_HAGGLE_BULK_SELECT_LIMIT,
    t,
    getPlayerUILang,
    resolvePlayerMainPet,
    normalizePetMoveLoadout,
    getPlayerOwnedPets,
    getLearnableSkillChipEntries,
    getForgettablePetMoves,
    getPetAttackMoves = (pet) => (Array.isArray(pet?.moves) ? pet.moves.filter((m) => !(m?.effect && m.effect.flee)) : []),
    describeMoveEffects = () => '無效果',
    getPetElementDisplayName = (v) => String(v || '未知屬性'),
    getPetElementColor = () => 0x4FC3F7,
    getMoveSpeedValue,
    updateInteractionMessage,
    formatPetHpWithRecovery,
    format1,
    round1,
    getMarketTypeLabel,
    buildMarketListingLine,
    parseMarketTypeFromCustomId,
    parseMarketAndPageFromCustomId,
    paginateList,
    buildPagedFieldChunks,
    estimateStoryReferencePriceByName,
    normalizeListingRarity,
    buildShopSellDraftOptions,
    buildShopHaggleDraftOptions,
    buildHaggleShadowPlayer,
    buildHaggleBulkShadowPlayer,
    extractPitchFromHaggleMessage,
    getDraftItemName,
    consumeHaggleItemFromPlayer,
    consumeHaggleBulkItemsFromPlayer,
    openShopSession,
    leaveShopSession,
    buyShopCrystal,
    getQuickShopCooldownInfo,
    buildQuickShopNarrativeNotice,
    getTeleportDeviceStockInfo,
    formatTeleportDeviceRemaining,
    playScratchLottery,
    grantTeleportDevice,
    recordCashflow,
    appendNpcMemory,
    appendNpcQuoteMemory,
    buildFinanceLedgerText,
    buildMemoryAuditRows,
    buildMemoryAuditText,
    getMemoryRecapText,
    getPlayerMemoryContextAsync,
    generatePlayerMemoryRecap,
    ensurePlayerGenerationSchema,
    recordNearbyNpcEncounters,
    getAllPetSkillMoves,
    extractSkillChipMoveName,
    showMainMenu
  } = deps;

// ============== 招式列表 ==============
async function showMovesList(interaction, user, selectedPetId = '', notice = '', page = 0) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', embeds: [], components: [] });
    return;
  }

  const ownedPets = getPlayerOwnedPets(user.id);
  if (ownedPets.length === 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Primary)
    );
    await interaction.update({ content: '❌ 沒有寵物！', embeds: [], components: [row] });
    return;
  }

  let selectedPet = ownedPets.find((p) => p.id === selectedPetId) || null;
  if (!selectedPet) {
    const defaultPet = PET.loadPet(user.id);
    selectedPet = ownedPets.find((p) => p.id === defaultPet?.id) || ownedPets[0];
  }
  if (!Array.isArray(selectedPet.moves)) selectedPet.moves = [];

  for (const pet of ownedPets) {
    normalizePetMoveLoadout(pet, true);
  }
  const selectedLoadout = normalizePetMoveLoadout(selectedPet, false);
  const selectedSet = new Set(selectedLoadout.activeMoveIds);
  const activePetResolved = resolvePlayerMainPet(player, { fallbackPet: selectedPet });
  const activePetId = String(activePetResolved?.pet?.id || player?.activePetId || '').trim();
  if (activePetResolved?.changed) CORE.savePlayer(player);
  const allChipEntries = getLearnableSkillChipEntries(player, selectedPet);
  const learnableChips = allChipEntries.filter((entry) => Boolean(entry?.canLearn));
  const allChipTotal = allChipEntries.reduce((sum, item) => sum + Number(item?.count || 0), 0);
  const learnableChipTotal = learnableChips.reduce((sum, item) => sum + Number(item?.count || 0), 0);
  const forgettableMoves = getForgettablePetMoves(selectedPet);

  const currentPage = Math.max(0, Number(page || 0));

  const unlockedMoves = (selectedPet.moves || []).map((m, i) => {
    const isFlee = Boolean(m?.effect && m.effect.flee);
    const isSelected = selectedSet.has(String(m.id || ''));
    const statusMark = isFlee ? '🏃固定' : (isSelected ? '✅攜帶' : '▫️候補');
    const dmg = BATTLE.calculatePlayerMoveDamage(m, {}, selectedPet);
    const energyCost = isFlee ? '-' : BATTLE.getMoveEnergyCost(m);
    const moveSpeed = getMoveSpeedValue(m);
    const tierEmoji = m.tier === 3 ? '🔮' : m.tier === 2 ? '💠' : '⚪';
    const tierName = m.tier === 3 ? '史詩' : m.tier === 2 ? '稀有' : '普通';
    const effectStr = describeMoveEffects(m);
    return `${tierEmoji} ${i + 1}. **${m.name}** (${m.element}/${tierName})｜${statusMark}\n   💥 ${format1(dmg.total)}dmg | ⚡${energyCost} | 🚀速度${format1(moveSpeed)} | ${effectStr || '無效果'}`;
  });

  const petSummary = ownedPets.map((pet, i) => {
    const loadout = normalizePetMoveLoadout(pet, false);
    const activeNames = loadout.activeMoves.map((m) => m.name).join('、') || '（尚未設定）';
    return `${i + 1}. **${pet.name}**（${pet.type}）\n攜帶：${loadout.activeMoves.length}/${PET_MOVE_LOADOUT_LIMIT}｜${activeNames}`;
  }).join('\n\n');

  const chipOverview = allChipEntries.length > 0
    ? allChipEntries
      .map((entry, idx) => {
        const move = entry.move || {};
        const tierEmoji = move.tier === 3 ? '🔮' : move.tier === 2 ? '💠' : '⚪';
        const tierName = move.tier === 3 ? '史詩' : move.tier === 2 ? '稀有' : '普通';
        const mark = entry.canLearn ? '✅可學' : (entry.reason === '已學會' ? '📘已學' : '🚫不可學');
        const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, selectedPet);
        const energyCost = BATTLE.getMoveEnergyCost(move);
        const moveSpeed = getMoveSpeedValue(move);
        const effectStr = describeMoveEffects(move);
        return `${idx + 1}. ${tierEmoji} **${move.name}** x${entry.count}｜${mark}\n   ${move.element}/${tierName} | 💥 ${format1(dmg.total)}dmg | ⚡${energyCost} | 🚀速度${format1(moveSpeed)} | ${effectStr || '無效果'}`;
      })
    : ['（背包目前沒有技能晶片）'];

  const movePreviewPager = paginateList(unlockedMoves, 0, MOVES_DETAIL_PAGE_SIZE);
  const chipPreviewPager = paginateList(chipOverview, 0, MOVES_DETAIL_PAGE_SIZE);
  const totalPages = Math.max(
    1,
    Number(movePreviewPager?.totalPages || 1),
    Number(chipPreviewPager?.totalPages || 1)
  );
  const sharedPage = Math.max(0, Math.min(totalPages - 1, currentPage));
  const movePager = paginateList(unlockedMoves, sharedPage, MOVES_DETAIL_PAGE_SIZE);
  const moveDetailText = movePager.items.length > 0 ? movePager.items.join('\n\n') : '（無招式）';
  const chipPager = paginateList(chipOverview, sharedPage, MOVES_DETAIL_PAGE_SIZE);
  const chipDetailText = chipPager.items.length > 0 ? chipPager.items.join('\n\n') : '（背包目前沒有技能晶片）';

  const noticeLine = notice
    ? (String(notice).startsWith('✅') || String(notice).startsWith('⚠️') ? String(notice) : `✅ ${notice}`)
    : '';

  const description = [
    noticeLine,
    `**目前管理：${selectedPet.name}**（${getPetElementDisplayName(selectedPet.type)}）`,
    `學習入口：請用下拉選單「學習技能晶片」`,
    `取消學習：會退回技能晶片到背包，可拿去賣`,
    `可攜帶上陣招式：**${PET_MOVE_LOADOUT_LIMIT}**（逃跑技能固定，不占名額）`,
    `已解鎖招式：${selectedPet.moves.length}`,
    `背包晶片：${allChipTotal} 枚｜可學：${learnableChipTotal} 枚 / ${learnableChips.length} 種`,
    `升級點數：${Number(player?.upgradePoints || 0)} 點（每點 +${Number(GACHA?.GACHA_CONFIG?.hpPerPoint || 0.2)} HP，可批量）`,
    `主上場寵物：${activePetResolved?.pet?.name || selectedPet.name}`
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🐾 寵物管理`)
    .setColor(getPetElementColor(selectedPet.type))
    .setDescription(description)
    .addFields(
      { name: `🧭 ${selectedPet.name} 招式清單（第 ${movePager.page + 1}/${movePager.totalPages} 頁）`, value: moveDetailText.slice(0, 1024), inline: false },
      { name: `🎒 可學習技能晶片（第 ${chipPager.page + 1}/${chipPager.totalPages} 頁）`, value: chipDetailText.slice(0, 1024), inline: false },
      { name: '🐾 全寵物攜帶總覽', value: petSummary.slice(0, 1024), inline: false }
    );

  const petSelectOptions = ownedPets.slice(0, 25).map((pet) => {
    const loadout = normalizePetMoveLoadout(pet, false);
    return {
      label: `${pet.name}`.slice(0, 100),
      description: `攜帶 ${loadout.activeMoves.length}/${PET_MOVE_LOADOUT_LIMIT} 招`,
      value: pet.id,
      default: pet.id === selectedPet.id
    };
  });
  const petSelect = new StringSelectMenuBuilder()
    .setCustomId('moves_pet_select')
    .setPlaceholder('選擇要管理的寵物')
    .addOptions(petSelectOptions);
  const rowPetSelect = new ActionRowBuilder().addComponents(petSelect);

  let rowLearnChip = null;
  if (learnableChips.length > 0) {
    const learnOptions = learnableChips.slice(0, 25).map((entry) => {
      const move = entry.move || {};
      const tierText = move.tier === 3 ? '史詩' : move.tier === 2 ? '稀有' : '普通';
      const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, selectedPet);
      const energyCost = BATTLE.getMoveEnergyCost(move);
      const moveSpeed = getMoveSpeedValue(move);
      const effectShort = String(describeMoveEffects(move) || '無效果').replace(/；/g, '/').slice(0, 44);
      return {
        label: `${move.name}`.slice(0, 100),
        description: `${move.element || '未知'}/${tierText}｜${format1(dmg.total)}dmg⚡${energyCost}🚀${format1(moveSpeed)}｜${effectShort}`.slice(0, 100),
        value: `${selectedPet.id}::${move.id}`
      };
    });
    rowLearnChip = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('moves_learn_chip')
        .setPlaceholder(`學習技能晶片（${learnableChipTotal} 枚）`)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(learnOptions)
    );
  }

  let rowUnlearnChip = null;
  if (forgettableMoves.length > 0) {
    const unlearnOptions = forgettableMoves.slice(0, 25).map((move) => ({
      label: `${move.name}`.slice(0, 100),
      description: `取消後會退回技能晶片`.slice(0, 100),
      value: `${selectedPet.id}::${move.id}`
    }));
    rowUnlearnChip = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('moves_unlearn_chip')
        .setPlaceholder('取消學習（退回技能晶片）')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(unlearnOptions)
    );
  }

  const attackMoves = getPetAttackMoves(selectedPet);
  let rowMoveAssign = null;
  if (attackMoves.length > 0) {
    const moveOptions = attackMoves.slice(0, 25).map((m) => ({
      label: `${m.name}`.slice(0, 100),
      description: `${m.element}/${m.tier === 3 ? '史詩' : m.tier === 2 ? '稀有' : '普通'}｜${format1(BATTLE.calculatePlayerMoveDamage(m, {}, selectedPet).total)}dmg⚡${BATTLE.getMoveEnergyCost(m)}🚀${format1(getMoveSpeedValue(m))}｜${String(describeMoveEffects(m) || '無效果').replace(/；/g, '/').slice(0, 34)}`.slice(0, 100),
      value: `${selectedPet.id}::${m.id}`,
      default: selectedSet.has(String(m.id || ''))
    }));
    const moveSelect = new StringSelectMenuBuilder()
      .setCustomId('moves_assign')
      .setPlaceholder(`為 ${selectedPet.name} 選擇上陣招式（1~${PET_MOVE_LOADOUT_LIMIT}）`)
      .setMinValues(1)
      .setMaxValues(Math.min(PET_MOVE_LOADOUT_LIMIT, moveOptions.length))
      .addOptions(moveOptions);
    rowMoveAssign = new ActionRowBuilder().addComponents(moveSelect);
  }

  const remainPoints = Math.max(0, Number(player?.upgradePoints || 0));
  const hpPerPoint = Number(GACHA?.GACHA_CONFIG?.hpPerPoint || 0.2);
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`moves_page_prev_${selectedPet.id}_${movePager.page}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sharedPage <= 0),
    new ButtonBuilder()
      .setCustomId(`moves_page_next_${selectedPet.id}_${movePager.page}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sharedPage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`set_main_pet_${selectedPet.id}`)
      .setLabel(activePetId === String(selectedPet.id) ? '✅ 主上場' : '🎯 設主上場')
      .setStyle(activePetId === String(selectedPet.id) ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(activePetId === String(selectedPet.id)),
    new ButtonBuilder().setCustomId('open_profile').setLabel('💳 檔案').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );

  const rowAllocate = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`alloc_hp_${selectedPet.id}_1`)
      .setLabel(`❤️ +1（+${hpPerPoint}）`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(remainPoints <= 0),
    new ButtonBuilder()
      .setCustomId(`alloc_hp_${selectedPet.id}_5`)
      .setLabel(`❤️ +5`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(remainPoints <= 0),
    new ButtonBuilder()
      .setCustomId(`alloc_hp_${selectedPet.id}_10`)
      .setLabel(`❤️ +10`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(remainPoints <= 0),
    new ButtonBuilder()
      .setCustomId(`alloc_hp_${selectedPet.id}_max`)
      .setLabel(`❤️ 全加（剩${remainPoints}）`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(remainPoints <= 0)
  );

  // Discord 訊息元件最多 5 列；若超過會導致 update 失敗並看起來像「按鈕消失」。
  // 保留優先順序：寵物切換 > 上陣招式 > 學習晶片 > HP加點 > 取消學習 > 返回按鈕。
  const components = [rowPetSelect];
  const optionalRows = [rowMoveAssign, rowLearnChip, rowAllocate, rowUnlearnChip].filter(Boolean);
  for (const row of optionalRows) {
    if (components.length >= 4) break; // 保留最後一列 rowButtons（總列數 <= 5）
    components.push(row);
  }
  components.push(rowButtons);
  const payload = { embeds: [embed], content: null, components };
  try {
    await updateInteractionMessage(interaction, payload);
  } catch (err) {
    console.error('[Moves] show list update failed:', err?.message || err);
    if (interaction?.message?.edit) {
      const edited = await interaction.message.edit(payload).then(() => true).catch(() => false);
      if (edited) return;
    }
    if (interaction?.channel?.send) {
      await interaction.channel.send(payload).catch(() => {});
    }
  }
}

async function showFinanceLedger(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const ledgerText = buildFinanceLedgerText(player, 20);
  const notices = Array.isArray(player.financeNotices) ? player.financeNotices.slice(0, 5) : [];
  const noticeText = notices.length > 0 ? notices.map((n, i) => `${i + 1}. ${n}`).join('\n') : '（目前無未讀）';

  const embed = new EmbedBuilder()
    .setTitle('💸 資金流水')
    .setColor(0x1f9d55)
    .setDescription('以下為你最近的收入與支出紀錄。')
    .addFields(
      { name: '💰 目前 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: false },
      { name: '📬 未讀金流通知', value: noticeText.slice(0, 1024), inline: false },
      { name: '📒 最近 20 筆流水', value: ledgerText.slice(0, 1024), inline: false }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel('返回主選單').setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function showMemoryAudit(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  const uiLang = getPlayerUILang(player);
  const rows = buildMemoryAuditRows(player, 24);
  const auditText = buildMemoryAuditText(rows, uiLang);
  const categoryCount = {};
  for (const row of rows) {
    const key = String(row?.category || '一般記憶');
    categoryCount[key] = Number(categoryCount[key] || 0) + 1;
  }
  const categorySummary = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => `${name}x${count}`)
    .join('、') || (uiLang === 'en' ? 'No records' : (uiLang === 'zh-CN' ? '暂无记录' : '暫無記錄'));

  const title = uiLang === 'en' ? '🧠 Memory Audit' : (uiLang === 'zh-CN' ? '🧠 记忆检查' : '🧠 記憶檢查');
  const desc = uiLang === 'en'
    ? 'Detailed log of what was written into memory each turn and why.'
    : (uiLang === 'zh-CN'
      ? '查看每回合写入记忆的内容，以及为何被判定需要保留。'
      : '查看每回合寫入記憶的內容，以及為何被判定需要保留。');
  const streamTitle = uiLang === 'en' ? 'Recent 24 Records' : (uiLang === 'zh-CN' ? '最近24笔流水' : '最近24筆流水');
  const descBody =
    `${desc}\n\n` +
    `${uiLang === 'en' ? '📊 Category Summary' : (uiLang === 'zh-CN' ? '📊 類別分佈' : '📊 類別分佈')}：${categorySummary}\n\n` +
    `📒 ${streamTitle}\n${auditText}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2563eb)
    .setDescription(descBody.slice(0, 3950));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(uiLang === 'en' ? 'Back to Menu' : (uiLang === 'zh-CN' ? '返回主选单' : '返回主選單')).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function showMemoryRecap(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }

  const uiLang = getPlayerUILang(player);
  const tx = getMemoryRecapText(uiLang);

  // 先即時更新成 loading，避免按鈕互動逾時。
  const loadingEmbed = new EmbedBuilder()
    .setTitle(tx.title)
    .setColor(0x3b82f6)
    .setDescription(tx.loading);
  const loadingRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_profile').setLabel(tx.backProfile).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(tx.backMenu).setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [loadingEmbed], components: [loadingRow] }).catch(() => {});

  const currentStory = String(player?.currentStory || '').trim();
  const historyStories = Array.isArray(player?.generationHistory)
    ? player.generationHistory
      .slice(-10)
      .map((item) => String(item?.story || '').trim())
      .filter(Boolean)
      .slice(-5)
    : [];

  if (!currentStory && historyStories.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setTitle(tx.title)
      .setColor(0x3b82f6)
      .setDescription(tx.noStory);
    const emptyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_profile').setLabel(tx.backProfile).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('main_menu').setLabel(tx.backMenu).setStyle(ButtonStyle.Secondary)
    );
    await updateInteractionMessage(interaction, { embeds: [emptyEmbed], components: [emptyRow] });
    return;
  }

  let memoryContext = '';
  try {
    memoryContext = await CORE.getPlayerMemoryContextAsync(player.id, {
      location: player.location,
      queryText: [
        `玩家:${player.name || ''}`,
        `地點:${player.location || ''}`,
        `前情:${currentStory || ''}`
      ].join('\n'),
      topK: 8
    });
  } catch (e) {
    console.log('[MemoryRecap] context failed:', e?.message || e);
    memoryContext = '';
  }

  const recentAuditRows = buildMemoryAuditRows(player, 10);
  const recentActions = recentAuditRows
    .slice(0, 8)
    .map((row) => {
      const content = String(row?.content || '').trim();
      const outcome = String(row?.outcome || '').trim();
      if (!content) return '';
      return outcome ? `${content} -> ${outcome}` : content;
    })
    .filter(Boolean);

  let recapText = '';
  let usedFallback = false;
  try {
    recapText = await STORY.generatePlayerMemoryRecap(player, {
      currentStory,
      memoryContext,
      recentStories: historyStories,
      recentActions
    });
  } catch (e) {
    console.log('[MemoryRecap] AI failed:', e?.message || e);
    usedFallback = true;
    recapText = '';
  }

  if (!recapText) {
    usedFallback = true;
    const fallbackParts = [];
    if (currentStory) fallbackParts.push(`目前主軸：${currentStory.slice(0, 240)}${currentStory.length > 240 ? '...' : ''}`);
    if (memoryContext) fallbackParts.push(memoryContext.slice(0, 900));
    if (recentActions.length > 0) fallbackParts.push(`近期行動：${recentActions.slice(0, 5).join('；')}`);
    recapText = fallbackParts.join('\n\n').trim() || tx.noStory;
  }

  const embed = new EmbedBuilder()
    .setTitle(tx.title)
    .setColor(0x3b82f6)
    .setDescription(`${usedFallback ? `${tx.fallbackHint}\n\n` : ''}${String(recapText).slice(0, 3900)}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_profile').setLabel(tx.backProfile).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(tx.backMenu).setStyle(ButtonStyle.Secondary)
  );

  await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
}


async function showPlayerMarketMenu(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const marketLabel = getMarketTypeLabel(safeMarket);
  const openSell = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', limit: 40 }).length;
  const myOpen = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', ownerId: user.id, limit: 80 }).length;
  const desc = [
    notice ? `✅ ${notice}` : '',
    `你目前在 **${marketLabel}（背包視圖）**。`,
    '這裡可隨時查看市場、購買商品、撤下自己的掛單。',
    '若要新增掛賣，請在劇情中進入商店後操作。',
    `市集賣單：${openSell} 筆｜你目前掛單 ${myOpen} 筆`
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🏪 玩家鑑價站｜${marketLabel}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(desc)
    .addFields(
      { name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true },
      { name: '📍 位置', value: `${player.location}`, inline: true }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pmkt_view_sell_${safeMarket}`).setLabel('🛒 買商品').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pmkt_my_${safeMarket}`).setLabel('📌 我的掛單').setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_finance_ledger').setLabel('💸 資金流水').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function showPlayerMarketListings(interaction, user, marketType = 'renaiss', page = 0) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const stockInfo = getTeleportDeviceStockInfo(player);
  const allListings = ECON.getMarketListingsView({
    marketType: safeMarket,
    type: 'sell',
    excludeOwnerId: user.id,
    limit: 500
  });
  const pager = paginateList(allListings, page, MARKET_LIST_PAGE_SIZE);
  const listings = pager.items;
  const title = '🛒 可購買賣單';
  const listText = listings.length > 0
    ? listings.map((l, i) => buildMarketListingLine(l, pager.start + i)).join('\n')
    : '（目前沒有可成交掛單）';

  const embed = new EmbedBuilder()
    .setTitle(`${title}｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(`${listText}\n\n頁數：${pager.page + 1}/${pager.totalPages}｜總筆數：${pager.total}`);

  const rows = [];
  if (listings.length > 0) {
    const selectOptions = listings.slice(0, 25).map((listing, idx) => {
      const itemName = String(listing.itemName || '商品');
      const qty = Math.max(1, Number(listing.quantity || 1));
      const unitPrice = Math.max(1, Number(listing.unitPrice || 0));
      return {
        label: `${idx + 1}. ${itemName}`.slice(0, 100),
        description: `x${qty}｜單價 ${unitPrice} Rns｜下拉選購`.slice(0, 100),
        value: `pmktbuy_${String(listing.id || '').trim()}`
      };
    });
    const select = new StringSelectMenuBuilder()
      .setCustomId(`pmkt_buy_select_${safeMarket}`)
      .setPlaceholder('下拉選擇要購買的商品')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(selectOptions);
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pmkt_view_sell_${safeMarket}_${Math.max(0, pager.page - 1)}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page <= 0),
    new ButtonBuilder()
      .setCustomId(`pmkt_view_sell_${safeMarket}_${Math.min(pager.totalPages - 1, pager.page + 1)}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page >= pager.totalPages - 1)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pmkt_open_${safeMarket}`).setLabel('返回鑑價站').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Secondary)
  ));

  await interaction.update({ embeds: [embed], components: rows });
}

async function showMyMarketListings(interaction, user, marketType = 'renaiss', page = 0) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const allMine = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', ownerId: user.id, limit: 500 });
  const pager = paginateList(allMine, page, MARKET_LIST_PAGE_SIZE);
  const mine = pager.items;

  const text = mine.length > 0
    ? mine.map((l, i) => `${pager.start + i + 1}. ${l.itemName} x${l.quantity}｜單價 ${l.unitPrice}｜總價 ${l.totalPrice}`).join('\n')
    : '（你目前沒有掛單）';

  const embed = new EmbedBuilder()
    .setTitle(`📌 我的掛單｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(`${text}\n\n頁數：${pager.page + 1}/${pager.totalPages}｜總筆數：${pager.total}`);

  const cancelButtons = mine.slice(0, 3).map((listing) =>
    new ButtonBuilder()
      .setCustomId(`pmkt_cancel_${listing.id}`)
      .setLabel(`取消 ${String(listing.itemName || '掛單').slice(0, 12)}`)
      .setStyle(ButtonStyle.Danger)
  );

  const rows = [];
  if (cancelButtons.length > 0) rows.push(new ActionRowBuilder().addComponents(cancelButtons));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pmkt_my_${safeMarket}_${Math.max(0, pager.page - 1)}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page <= 0),
    new ButtonBuilder()
      .setCustomId(`pmkt_my_${safeMarket}_${Math.min(pager.totalPages - 1, pager.page + 1)}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page >= pager.totalPages - 1)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pmkt_open_${safeMarket}`).setLabel('返回鑑價站').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Secondary)
  ));
  await interaction.update({ embeds: [embed], components: rows });
}

async function showWorldShopHaggleAllOffer(interaction, user, marketType = 'renaiss', selectedSpecs = null) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
    return;
  }
  const picked = Array.isArray(selectedSpecs)
    ? selectedSpecs
    : Array.isArray(player.shopSession?.haggleBulkSelectedSpecs)
      ? player.shopSession.haggleBulkSelectedSpecs
      : [];
  if (picked.length <= 0) {
    await showWorldShopHaggleBulkPicker(interaction, user, safeMarket, '請先從清單勾選要批次賣出的商品。');
    return;
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const worldDay = Number(CORE.getWorld()?.day || 1);
  const built = buildHaggleBulkShadowPlayer(player, picked, worldDay);
  if (built.error || !built.shadow || !Array.isArray(built.specs) || built.specs.length <= 0) {
    await showWorldShopHaggleBulkPicker(interaction, user, safeMarket, built.error || '無法建立批次議價內容，請重新選擇。');
    return;
  }
  const offerResult = await ECON.sellPlayerAtMarket(built.shadow, safeMarket, { worldDay }).catch((err) => ({ error: err?.message || String(err) }));
  if (!offerResult || offerResult.error || Number(offerResult.soldCount || 0) <= 0) {
    await showWorldShopHaggleBulkPicker(interaction, user, safeMarket, `無法批次議價：${offerResult?.error || '目前沒有可售商品'}`);
    return;
  }

  const rawTotal = Math.max(0, Number(offerResult.totalGold || 0));
  const quotedTotal = Math.max(0, Math.floor(rawTotal * 0.7));
  const discountLoss = Math.max(0, rawTotal - quotedTotal);
  const pending = {
    id: `haggle_all_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    marketType: safeMarket,
    createdAt: Date.now(),
    scope: 'bulk',
    itemName: '已選商品（批次）',
    specs: built.specs.map((spec) => ({
      kind: 'item',
      itemName: String(spec?.itemName || '').trim(),
      quantityMax: Math.max(1, Number(spec?.quantityMax || 1)),
      itemRef: { kind: 'item', source: String(spec?.itemRef?.source || 'inventory') }
    })),
    quotedTotal,
    rawQuotedTotal: rawTotal,
    discountLoss,
    soldCount: Number(offerResult.soldCount || 0),
    npcName: String(offerResult.npcName || (safeMarket === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員')),
    message: String(offerResult.message || ''),
    historyRecall: String(offerResult.historyRecall || ''),
    digitalRiskScore: Number(offerResult.digitalRiskScore || 0),
    digitalRiskDelta: Number(offerResult.digitalRiskDelta || 0),
    marketStateAfter: JSON.parse(JSON.stringify(shadow.marketState || {}))
  };
  player.shopSession.pendingHaggleOffer = pending;
  CORE.savePlayer(player);

  const pitch = extractPitchFromHaggleMessage(offerResult.message);
  const detailLines = [];
  const itemSummary = built.specs
    .map((spec) => `${spec.itemName} x${Math.max(1, Number(spec.quantityMax || 1))}`)
    .slice(0, 6)
    .join('、');
  detailLines.push(`範圍：已選 ${built.specs.length} 項商品`);
  detailLines.push(`項目：${itemSummary}${built.specs.length > 6 ? '…' : ''}`);
  detailLines.push(`件數：${pending.soldCount} 件`);
  detailLines.push(`原始估價：${rawTotal} Rns 代幣`);
  detailLines.push(`批次賣出（七折）：**${quotedTotal} Rns 代幣**`);
  detailLines.push(`折讓差額：-${discountLoss} Rns 代幣`);
  detailLines.push(`鑑價員：${pending.npcName}`);
  if (pitch) detailLines.push(`\n💬 ${pitch}`);
  detailLines.push('\n請選擇是否同意本次批次賣出（七折）提案。');

  const embed = new EmbedBuilder()
    .setTitle(`🤝 批次議價提案｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(detailLines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_haggle_confirm_${safeMarket}`).setLabel('✅ 同意成交').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_haggle_cancel_${safeMarket}`).setLabel('↩️ 退出議價').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
}

async function showWorldShopHaggleBulkPicker(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
    return;
  }

  const draft = buildShopHaggleDraftOptions(player, user.id);
  player.shopSession.haggleDraftOptions = draft.options;
  player.shopSession.haggleBulkSelectedSpecs = [];
  player.shopSession.pendingHaggleOffer = null;
  CORE.savePlayer(player);

  const lines = [];
  if (notice) lines.push(`✅ ${notice}`);
  lines.push('請從下拉選單勾選要「批次賣出（七折）」的商品。');
  lines.push('勾選完成後會即時顯示本次批次報價，再由你決定是否成交。');
  lines.push(`可議價項目：${draft.options.length} 個`);

  const embed = new EmbedBuilder()
    .setTitle(`📦 批次賣出（七折）｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(lines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  if (draft.options.length <= 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
    );
    await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
    return;
  }

  const selectOptions = draft.options.slice(0, SHOP_HAGGLE_BULK_SELECT_LIMIT).map((option, idx) => ({
    label: String(option.label || option.itemName || `選項${idx + 1}`).slice(0, 100),
    description: String(option.description || '').slice(0, 100) || '選擇此商品加入批次賣出',
    value: `bulkidx_${idx}`
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`shop_haggle_bulk_select_${safeMarket}`)
    .setPlaceholder('可複選：勾選要批次賣出的商品')
    .setMinValues(1)
    .setMaxValues(Math.min(selectOptions.length, 10))
    .addOptions(selectOptions);

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row1, row2] });
}

async function showWorldShopHagglePicker(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
    return;
  }

  const draft = buildShopHaggleDraftOptions(player, user.id);
  player.shopSession.haggleDraftOptions = draft.options;
  player.shopSession.haggleBulkSelectedSpecs = [];
  player.shopSession.pendingHaggleOffer = null;
  CORE.savePlayer(player);

  const lines = [];
  if (notice) lines.push(`✅ ${notice}`);
  lines.push('請先選擇 1 件要交給老闆估價的商品。');
  lines.push('下一步會顯示 AI 鑑價員報價，你可選「同意成交」或「退出議價」。');
  lines.push(`可議價項目：${draft.options.length} 個（單次僅處理 1 件）`);

  const embed = new EmbedBuilder()
    .setTitle(`🤝 老闆議價｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(lines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  if (draft.options.length <= 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
    );
    await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
    return;
  }

  const selectOptions = draft.options.slice(0, SHOP_HAGGLE_SELECT_LIMIT).map((option, idx) => ({
    label: String(option.label || option.itemName || `選項${idx + 1}`).slice(0, 100),
    description: String(option.description || '').slice(0, 100) || '選擇此商品進行估價',
    value: `haggleidx_${idx}`
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`shop_haggle_select_${safeMarket}`)
    .setPlaceholder('選擇要交給老闆估價的商品')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(selectOptions);

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_haggle_all_${safeMarket}`).setLabel('📦 批次賣出(七折)').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row1, row2] });
}

async function showWorldShopHaggleOffer(interaction, user, marketType = 'renaiss', spec = null) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 請先在商店內操作議價。', ephemeral: true }).catch(() => {});
    return;
  }
  if (!spec || typeof spec !== 'object') {
    await showWorldShopHagglePicker(interaction, user, safeMarket, '議價選項已失效，請重新選擇。');
    return;
  }

  const worldDay = Number(CORE.getWorld()?.day || 1);
  const built = buildHaggleShadowPlayer(player, spec, worldDay);
  if (built.error || !built.shadow) {
    await showWorldShopHagglePicker(interaction, user, safeMarket, built.error || '目前沒有可議價的項目。');
    return;
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const offerResult = await ECON.sellPlayerAtMarket(built.shadow, safeMarket, { worldDay }).catch((err) => ({ error: err?.message || String(err) }));
  if (!offerResult || offerResult.error || Number(offerResult.soldCount || 0) <= 0) {
    await showWorldShopHagglePicker(interaction, user, safeMarket, `議價失敗：${offerResult?.error || '無可成交項目'}`);
    return;
  }

  const pending = {
    id: `haggle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    marketType: safeMarket,
    createdAt: Date.now(),
    itemName: String(built.candidate?.itemName || spec.itemName || '').trim(),
    spec: {
      kind: 'item',
      itemName: String(built.candidate?.itemName || spec.itemName || '').trim(),
      itemRef: {
        kind: 'item',
        source: String(built.candidate?.source || spec?.itemRef?.source || 'inventory'),
        tradeGoodId: String(built.candidate?.tradeGoodId || '')
      }
    },
    quotedTotal: Number(offerResult.totalGold || 0),
    soldCount: Number(offerResult.soldCount || 1),
    npcName: String(offerResult.npcName || (safeMarket === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員')),
    message: String(offerResult.message || ''),
    historyRecall: String(offerResult.historyRecall || ''),
    digitalRiskScore: Number(offerResult.digitalRiskScore || 0),
    digitalRiskDelta: Number(offerResult.digitalRiskDelta || 0),
    marketStateAfter: JSON.parse(JSON.stringify(built.shadow.marketState || {}))
  };
  player.shopSession.pendingHaggleOffer = pending;
  CORE.savePlayer(player);

  const pitch = extractPitchFromHaggleMessage(offerResult.message);
  const detailLines = [];
  detailLines.push(`商品：${pending.itemName}`);
  detailLines.push(`報價：**${pending.quotedTotal} Rns 代幣**`);
  detailLines.push(`鑑價員：${pending.npcName}`);
  if (pitch) detailLines.push(`\n💬 ${pitch}`);
  detailLines.push('\n請選擇是否同意本次 AI 議價。');

  const embed = new EmbedBuilder()
    .setTitle(`🤝 議價提案｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(detailLines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_haggle_confirm_${safeMarket}`).setLabel('✅ 同意成交').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_haggle_cancel_${safeMarket}`).setLabel('↩️ 退出議價').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
}

async function showWorldShopSellPicker(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 只能在商店場景掛賣。請先由劇情進入商店。', ephemeral: true }).catch(() => {});
    return;
  }

  const draft = buildShopSellDraftOptions(player, user.id);
  player.shopSession.sellDraftOptions = draft.options;
  player.shopSession.pendingSellSpec = null;
  CORE.savePlayer(player);

  const lines = [];
  if (notice) lines.push(`✅ ${notice}`);
  lines.push(`請從下拉選單直接選擇要掛賣的項目（避免打錯字）。`);
  lines.push(`每個項目都會顯示稀有度與參考價；你可自行掛更高價格。`);
  lines.push(`可選項目：${draft.options.length} 個`);
  if (draft.blockedActiveSkillCount > 0) {
    lines.push(`上陣中技能已自動排除：${draft.blockedActiveSkillCount} 招（需先到招式配置卸下）`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`📤 掛賣選單｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(lines.join('\n'))
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  if (draft.options.length <= 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('show_moves').setLabel('🐾 寵物管理').setStyle(ButtonStyle.Primary)
    );
    await interaction.update({ embeds: [embed], components: [row] });
    return;
  }

  const selectOptions = draft.options.slice(0, SHOP_SELL_SELECT_LIMIT).map((option, idx) => ({
    label: String(option.label || option.itemName || `選項${idx + 1}`).slice(0, 100),
    description: String(option.description || '').slice(0, 100) || `最多 ${Math.max(1, Number(option.quantityMax || 1))} 件`,
    value: `sellidx_${idx}`
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`shop_sell_select_${safeMarket}`)
    .setPlaceholder('選擇要掛賣的道具/技能')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(selectOptions);

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_moves').setLabel('🐾 寵物管理').setStyle(ButtonStyle.Primary)
  );
  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function showWorldShopSellModal(interaction, marketType = 'renaiss', spec = null) {
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const itemName = String(spec?.itemName || '商品').slice(0, 36);
  const rarity = normalizeListingRarity(spec?.rarity || '普通');
  const referencePrice = Math.max(1, Math.floor(Number(spec?.referencePrice || estimateStoryReferencePriceByName(itemName))));
  const modal = new ModalBuilder()
    .setCustomId(`shop_sell_modal_${safeMarket}`)
    .setTitle(`上架賣單｜${rarity}｜${itemName}`);

  const qtyInput = new TextInputBuilder()
    .setCustomId('shop_sell_qty')
    .setLabel(spec?.kind === 'pet_move' ? '數量（技能固定為 1）' : '數量')
    .setPlaceholder(spec?.kind === 'pet_move' ? '固定為 1' : `最多 ${Math.max(1, Number(spec?.quantityMax || 1))} 件`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4)
    .setValue(spec?.kind === 'pet_move' ? '1' : '1');

  const priceInput = new TextInputBuilder()
    .setCustomId('shop_sell_price')
    .setLabel(`單價（Rns｜參考 ${referencePrice}）`.slice(0, 45))
    .setPlaceholder(`例如：${referencePrice}（可掛更高）`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(8)
    .setValue(String(referencePrice));

  const noteInput = new TextInputBuilder()
    .setCustomId('shop_sell_note')
    .setLabel('備註（可留空）')
    .setPlaceholder('例如：可議價 / 急售')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80);

  modal.addComponents(
    new ActionRowBuilder().addComponents(qtyInput),
    new ActionRowBuilder().addComponents(priceInput),
    new ActionRowBuilder().addComponents(noteInput)
  );
  await interaction.showModal(modal);
}

async function handleWorldShopSellModal(interaction, user, marketType = 'renaiss') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== safeMarket) {
    await interaction.reply({ content: '⚠️ 你目前不在此商店場景。', ephemeral: true }).catch(() => {});
    return;
  }
  const spec = player.shopSession?.pendingSellSpec;
  if (!spec || typeof spec !== 'object') {
    await interaction.reply({ content: '⚠️ 掛賣項目已失效，請重新選擇。', ephemeral: true }).catch(() => {});
    return;
  }

  const rawQty = Number(interaction.fields.getTextInputValue('shop_sell_qty')?.trim() || 0);
  const unitPrice = Number(interaction.fields.getTextInputValue('shop_sell_price')?.trim() || 0);
  const note = interaction.fields.getTextInputValue('shop_sell_note')?.trim() || '';
  let quantity = Math.max(1, Math.floor(rawQty || 0));
  if (spec.kind === 'pet_move') {
    quantity = 1;
  } else {
    quantity = Math.min(Math.max(1, Number(spec.quantityMax || 1)), quantity);
  }

  const result = ECON.createSellListing(player, safeMarket, {
    itemName: spec.itemName,
    quantity,
    unitPrice,
    note,
    itemRef: spec.itemRef || { kind: spec.kind || 'item' }
  });

  if (!result?.success) {
    await interaction.reply({ content: `❌ 掛單失敗：${result?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
    return;
  }

  player.shopSession.pendingSellSpec = null;
  CORE.savePlayer(player);
  const listing = result.listing || {};
  const successText = `賣單已上架：${listing.itemName} x${listing.quantity}（單價 ${listing.unitPrice}）`;
  const updated = await interaction.deferUpdate()
    .then(async () => {
      await showWorldShopScene(interaction, user, safeMarket, successText);
      return true;
    })
    .catch(() => false);
  if (!updated) {
    await interaction.reply({ content: `✅ ${successText}`, ephemeral: true }).catch(() => {});
  }
}

async function showMarketPostModal(interaction, marketType = 'renaiss', listingType = 'sell') {
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const safeType = 'sell';
  const modal = new ModalBuilder()
    .setCustomId(`pmkt_modal_${safeType}_${safeMarket}`)
    .setTitle(`${getMarketTypeLabel(safeMarket)}｜上架賣單`);

  const itemInput = new TextInputBuilder()
    .setCustomId('pmkt_item_name')
    .setLabel('物品名稱（需與你持有名稱一致）')
    .setPlaceholder('例如：月影蘭')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);
  const qtyInput = new TextInputBuilder()
    .setCustomId('pmkt_qty')
    .setLabel('數量')
    .setPlaceholder('例如：2')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4);
  const priceInput = new TextInputBuilder()
    .setCustomId('pmkt_unit_price')
    .setLabel('單價（Rns）')
    .setPlaceholder('例如：120')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(8);
  const noteInput = new TextInputBuilder()
    .setCustomId('pmkt_note')
    .setLabel('備註（可留空）')
    .setPlaceholder('例如：可議價/急售')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80);

  modal.addComponents(
    new ActionRowBuilder().addComponents(itemInput),
    new ActionRowBuilder().addComponents(qtyInput),
    new ActionRowBuilder().addComponents(priceInput),
    new ActionRowBuilder().addComponents(noteInput)
  );
  await interaction.showModal(modal);
}

async function handleMarketPostModal(interaction, user, listingType = 'sell', marketType = 'renaiss') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
    return;
  }
  ECON.ensurePlayerEconomy(player);
  if (!player.shopSession?.open || String(player.shopSession.marketType || '') !== String(marketType || '')) {
    await interaction.reply({ content: '⚠️ 只能在商店內掛賣。請先從劇情進入商店。', ephemeral: true }).catch(() => {});
    return;
  }
  const itemName = interaction.fields.getTextInputValue('pmkt_item_name')?.trim() || '';
  const qty = Number(interaction.fields.getTextInputValue('pmkt_qty')?.trim() || 0);
  const unitPrice = Number(interaction.fields.getTextInputValue('pmkt_unit_price')?.trim() || 0);
  const note = interaction.fields.getTextInputValue('pmkt_note')?.trim() || '';

  const result = ECON.createSellListing(player, marketType, { itemName, quantity: qty, unitPrice, note });

  if (!result?.success) {
    await interaction.reply({ content: `❌ 掛單失敗：${result?.reason || '未知錯誤'}`, ephemeral: true }).catch(() => {});
    return;
  }

  CORE.savePlayer(player);
  const listing = result.listing || {};
  const successText = `賣單已上架：${listing.itemName} x${listing.quantity}（單價 ${listing.unitPrice}）`;
  const updated = await interaction.deferUpdate()
    .then(async () => {
      await showWorldShopScene(interaction, user, marketType, successText);
      return true;
    })
    .catch(() => false);
  if (!updated) {
    await interaction.reply({ content: `✅ ${successText}\n請回到「背包 → 鑑價站」查看。`, ephemeral: true }).catch(() => {});
  }
}

async function showWorldShopBuyPanel(interaction, user, marketType = 'renaiss', notice = '', page = 0) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const allListings = ECON.getMarketListingsView({
    marketType: safeMarket,
    type: 'sell',
    excludeOwnerId: user.id,
    limit: 500
  });
  const pager = paginateList(allListings, page, MARKET_LIST_PAGE_SIZE);
  const listingsRaw = Array.isArray(pager.items) ? pager.items : [];
  const listings = [];
  const seenListingIds = new Set();
  let droppedCorrupted = 0;
  for (const listing of listingsRaw) {
    const listingId = String(listing?.id || '').trim();
    if (!listingId || seenListingIds.has(listingId)) {
      droppedCorrupted += 1;
      continue;
    }
    seenListingIds.add(listingId);
    listings.push(listing);
  }
  const stockInfo = getTeleportDeviceStockInfo(player);
  const listText = listings.length > 0
    ? listings.map((l, i) => buildMarketListingLine(l, pager.start + i)).join('\n')
    : '（目前沒有可購買商品）';

  const embed = new EmbedBuilder()
    .setTitle(`🛒 商店可購買商品｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(
      `${notice ? `✅ ${notice}\n\n` : ''}` +
      `${listText}\n\n` +
      `${droppedCorrupted > 0 ? `⚠️ 已略過 ${droppedCorrupted} 筆異常賣單資料（請賣家重新掛單）。\n` : ''}` +
      `頁數：${pager.page + 1}/${pager.totalPages}｜總筆數：${pager.total}\n` +
      `回血水晶：${SHOP_HEAL_CRYSTAL_COST} Rns（恢復氣血）\n` +
      `回能水晶：${SHOP_ENERGY_CRYSTAL_COST} Rns（恢復能量）\n` +
      `加成點數：花費 200 Rns 可獲得 +1 點。\n` +
      `傳送裝置：${TELEPORT_DEVICE_COST} Rns（同島瞬移，單顆效期 ${TELEPORT_DEVICE_DURATION_HOURS}h，每次消耗 1 顆）\n` +
      `目前可用：${stockInfo.count} 顆${stockInfo.count > 0 ? `（最早到期：${formatTeleportDeviceRemaining(stockInfo.soonestRemainingMs)}）` : ''}`
    );

  const rows = [];
  if (listings.length > 0) {
    const selectOptions = listings.slice(0, 25).map((listing, idx) => {
      const itemName = String(listing.itemName || '商品');
      const qty = Math.max(1, Number(listing.quantity || 1));
      const unitPrice = Math.max(1, Number(listing.unitPrice || 0));
      return {
        label: `${idx + 1}. ${itemName}`.slice(0, 100),
        description: `x${qty}｜單價 ${unitPrice} Rns｜下拉選購`.slice(0, 100),
        value: `shopbuy_${String(listing.id || '').trim()}`
      };
    });
    const select = new StringSelectMenuBuilder()
      .setCustomId(`shop_buy_select_${safeMarket}`)
      .setPlaceholder('下拉選擇要購買的商品')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(selectOptions);
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_scratch_${safeMarket}`).setLabel('🎟️ 刮刮樂(100)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shop_buy_heal_crystal_${safeMarket}`).setLabel(`🩸 回血水晶(${SHOP_HEAL_CRYSTAL_COST})`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_buy_energy_crystal_${safeMarket}`).setLabel(`⚡ 回能水晶(${SHOP_ENERGY_CRYSTAL_COST})`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`shop_buy_point_${safeMarket}`).setLabel('🧩 買加成點數(200)').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`shop_buy_device_${safeMarket}`).setLabel(`🧭 傳送裝置(${TELEPORT_DEVICE_COST})`).setStyle(ButtonStyle.Success)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_buy_${safeMarket}_${Math.max(0, pager.page - 1)}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page <= 0),
    new ButtonBuilder()
      .setCustomId(`shop_buy_${safeMarket}_${Math.min(pager.totalPages - 1, pager.page + 1)}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page >= pager.totalPages - 1),
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
  ));
  await updateInteractionMessage(interaction, { embeds: [embed], components: rows });
}

async function showWorldShopScene(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const bossName = safeMarket === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員';
  const bossTone = safeMarket === 'digital'
    ? '老闆眼神很熱情，但每句話都像在試探你的底線。'
    : '老闆把估值表攤在你面前，強調透明與長期信任。';
  const listingCount = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', limit: 99 }).length;
  const myCount = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', ownerId: user.id, limit: 99 }).length;

  const embed = new EmbedBuilder()
    .setTitle(`🏪 進入商店｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(
      `${notice ? `${/^[🧭📖]/u.test(String(notice).trim()) ? notice : `✅ ${notice}`}\n\n` : ''}` +
      `你走進了${getMarketTypeLabel(safeMarket)}，櫃台後方的 **${bossName}** 正看著你。\n` +
      `${bossTone}\n\n` +
      `市面賣單：${listingCount} 筆｜你掛單：${myCount} 筆\n` +
      `請選擇：要掛賣、直接跟老闆議價、買商品、刮刮樂，或離開商店。\n` +
      `掛賣會先出現下拉選單；技能需先從上陣招式卸下才可掛賣。`
    )
    .addFields({ name: '💰 你的 Rns', value: `${Number(player?.stats?.財富 || 0)} Rns 代幣`, inline: true });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_post_sell_${safeMarket}`).setLabel('📤 掛賣商品').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_npc_haggle_${safeMarket}`).setLabel('🤝 跟老闆議價').setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_scratch_${safeMarket}`).setLabel('🎟️ 刮刮樂(100)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shop_buy_${safeMarket}`).setLabel('🛒 買商品').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop_leave').setLabel('🚪 離開商店').setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [row1, row2] });
}

// ============== 行囊/背包 ==============
async function showInventory(interaction, user, page = 0) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  
  // 顯示物品（分頁，不截斷）
  const items = Array.isArray(player.inventory) ? player.inventory : [];
  const herbs = Array.isArray(player.herbs) ? player.herbs : [];
  const tradeGoods = Array.isArray(player.tradeGoods) ? player.tradeGoods : [];

  const itemLines = items.map((item, i) => `${i + 1}. ${String(item || '')}`);
  const herbLines = herbs.map((h, i) => `${i + 1}. ${String(h || '')}`);
  const goodLines = tradeGoods.map((g, i) =>
    `${i + 1}. ${String(g?.name || '未命名素材')}（${String(g?.rarity || '普通')}｜${Number(g?.value || 0)} Rns 代幣）`
  );

  const itemPages = buildPagedFieldChunks(itemLines, 1000, '（空）');
  const herbPages = buildPagedFieldChunks(herbLines, 1000, '（空）');
  const goodsPages = buildPagedFieldChunks(goodLines, 1000, '（空）');
  const totalPages = Math.max(itemPages.length, herbPages.length, goodsPages.length, 1);
  const safePage = Math.max(0, Math.min(totalPages - 1, Number(page || 0)));
  const itemsList = itemPages[Math.min(safePage, itemPages.length - 1)] || '（空）';
  const herbsList = herbPages[Math.min(safePage, herbPages.length - 1)] || '（空）';
  const goodsList = goodsPages[Math.min(safePage, goodsPages.length - 1)] || '（空）';
  
  const embed = new EmbedBuilder()
    .setTitle(`🎒 ${player.name} 的行囊`)
    .setColor(0x8B4513)
    .setDescription('你身上攜帶的物品')
    .addFields(
      { name: '📦 物品', value: itemsList, inline: true },
      { name: '🌿 草藥', value: herbsList, inline: true }
    )
    .addFields({ name: `🧰 可售素材（第 ${safePage + 1}/${totalPages} 頁）`, value: goodsList, inline: false })
    .addFields({ name: t('gold', uiLang), value: `${player.stats.財富} Rns 代幣`, inline: false });

  const rowPage = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`inv_page_prev_${safePage}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`inv_page_next_${safePage}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );
  const rowMain = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Primary)
  );

  await interaction.update({ embeds: [embed], components: [rowPage, rowMain] });
}

function getCodexLabels(uiLang = 'zh-TW') {
  const map = {
    'zh-TW': {
      overviewTitle: '📚 圖鑑總覽',
      overviewDesc: '可分開查看 NPC 圖鑑與技能圖鑑。未收集項目只顯示數量，不顯示名稱。',
      npcProgress: '🤝 NPC 圖鑑進度',
      skillProgress: '🧬 技能圖鑑進度',
      unknownCount: '🕶️ 未收集（隱藏名稱）',
      npcButton: '🤝 NPC圖鑑',
      skillButton: '🧬 技能圖鑑',
      npcTitle: '🤝 NPC 圖鑑',
      npcCollected: '已收集 NPC',
      npcUnknown: '未收集 NPC',
      npcEmpty: '（尚未遇到 NPC）',
      skillTitle: '🧬 技能圖鑑',
      skillCollected: '已收集技能',
      skillUnknown: '未收集技能',
      skillEmpty: '（尚未抽到技能）',
      backCodex: '📚 回圖鑑',
      canFight: '可交鋒',
      canDraw: '可抽取'
    },
    'zh-CN': {
      overviewTitle: '📚 图鉴总览',
      overviewDesc: '可分开查看 NPC 图鉴与技能图鉴。未收集项目只显示数量，不显示名称。',
      npcProgress: '🤝 NPC 图鉴进度',
      skillProgress: '🧬 技能图鉴进度',
      unknownCount: '🕶️ 未收集（隐藏名称）',
      npcButton: '🤝 NPC图鉴',
      skillButton: '🧬 技能图鉴',
      npcTitle: '🤝 NPC 图鉴',
      npcCollected: '已收集 NPC',
      npcUnknown: '未收集 NPC',
      npcEmpty: '（尚未遇到 NPC）',
      skillTitle: '🧬 技能图鉴',
      skillCollected: '已收集技能',
      skillUnknown: '未收集技能',
      skillEmpty: '（尚未抽到技能）',
      backCodex: '📚 回图鉴',
      canFight: '可交锋',
      canDraw: '可抽取'
    },
    en: {
      overviewTitle: '📚 Codex Overview',
      overviewDesc: 'NPC Codex and Skill Codex are separated. Uncollected entries show counts only.',
      npcProgress: '🤝 NPC Progress',
      skillProgress: '🧬 Skill Progress',
      unknownCount: '🕶️ Uncollected (hidden names)',
      npcButton: '🤝 NPC Codex',
      skillButton: '🧬 Skill Codex',
      npcTitle: '🤝 NPC Codex',
      npcCollected: 'Collected NPCs',
      npcUnknown: 'Uncollected NPCs',
      npcEmpty: '(none yet)',
      skillTitle: '🧬 Skill Codex',
      skillCollected: 'Collected Skills',
      skillUnknown: 'Uncollected Skills',
      skillEmpty: '(none yet)',
      backCodex: '📚 Back Codex',
      canFight: 'Fightable',
      canDraw: 'Drawable'
    }
  };
  return map[uiLang] || map['zh-TW'];
}

function collectPlayerCodexData(player) {
  const codex = player?.codex && typeof player.codex === 'object' ? player.codex : {};
  const npcEntries = Object.values(codex.npcEncountered || {})
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));
  const drawEntries = Object.values(codex.drawnMoves || {})
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0));

  const allAgents = Array.isArray(CORE.getAgents?.()) ? CORE.getAgents() : [];
  const allNpcIds = new Set(allAgents.map((agent) => String(agent?.id || '').trim()).filter(Boolean));
  const encounteredNpcIds = new Set(npcEntries.map((entry) => String(entry.id || '').trim()).filter(Boolean));
  const totalNpc = allNpcIds.size;
  const encounteredNpc = Array.from(encounteredNpcIds).filter((id) => allNpcIds.has(id)).length;
  const remainingNpc = Math.max(0, totalNpc - encounteredNpc);

  const allMoves = getAllPetSkillMoves();
  const allMoveMap = new Map();
  const allMoveNameMap = new Map();
  for (const move of allMoves) {
    const id = String(move?.id || '').trim();
    if (!id || allMoveMap.has(id)) continue;
    allMoveMap.set(id, move);
    const moveName = String(move?.name || '').trim();
    if (moveName && !allMoveNameMap.has(moveName)) {
      allMoveNameMap.set(moveName, move);
    }
  }

  const totalSkills = allMoveMap.size;
  const drawnKnownEntries = drawEntries.filter((entry) => allMoveMap.has(String(entry?.id || '').trim()));
  const drawnIds = new Set(drawnKnownEntries.map((entry) => String(entry.id || '').trim()).filter(Boolean));

  const ownedPets = getPlayerOwnedPets(String(player?.id || '').trim());
  const learnedMoveIds = new Set();
  for (const pet of ownedPets) {
    const moves = Array.isArray(pet?.moves) ? pet.moves : [];
    for (const m of moves) {
      const id = String(m?.id || '').trim();
      if (id && allMoveMap.has(id)) learnedMoveIds.add(id);
    }
  }

  const chipMoveIds = new Map();
  const inventory = Array.isArray(player?.inventory) ? player.inventory : [];
  for (const raw of inventory) {
    const moveName = extractSkillChipMoveName(raw);
    if (!moveName) continue;
    const move = allMoveNameMap.get(String(moveName || '').trim());
    const moveId = String(move?.id || '').trim();
    if (!moveId || !allMoveMap.has(moveId)) continue;
    chipMoveIds.set(moveId, (chipMoveIds.get(moveId) || 0) + 1);
  }

  const collectedIds = new Set([...drawnIds, ...learnedMoveIds, ...chipMoveIds.keys()]);
  const collectedSkills = collectedIds.size;
  const remainingSkills = Math.max(0, totalSkills - collectedSkills);
  const totalDrawCount = Math.max(
    0,
    Number(codex.drawTotalCount || 0),
    drawEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.count || 0)), 0)
  );

  const drawCountById = new Map();
  for (const entry of drawnKnownEntries) {
    const id = String(entry?.id || '').trim();
    if (!id) continue;
    drawCountById.set(id, Math.max(0, Number(entry.count || 0)));
  }

  const collectedSkillEntries = Array.from(collectedIds).map((moveId) => {
    const move = allMoveMap.get(moveId) || {};
    const drawCount = drawCountById.get(moveId) || 0;
    const chipCount = chipMoveIds.get(moveId) || 0;
    const learned = learnedMoveIds.has(moveId);
    const drawEntry = drawnKnownEntries.find((entry) => String(entry?.id || '').trim() === moveId);
    const lastAt = Math.max(
      0,
      Number(drawEntry?.lastAt || 0),
      learned ? Date.now() : 0
    );
    return {
      id: moveId,
      name: String(move?.name || drawEntry?.name || moveId),
      tier: Math.max(1, Math.min(3, Number(move?.tier || drawEntry?.tier || 1))),
      drawCount,
      chipCount,
      learned,
      lastAt
    };
  }).sort((a, b) => {
    const byTime = Number(b.lastAt || 0) - Number(a.lastAt || 0);
    if (byTime !== 0) return byTime;
    const byTier = Number(b.tier || 1) - Number(a.tier || 1);
    if (byTier !== 0) return byTier;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
  });

  const uniqueTier = { 1: 0, 2: 0, 3: 0 };
  const pullTier = { 1: 0, 2: 0, 3: 0 };
  for (const entry of collectedSkillEntries) {
    const tier = Math.max(1, Math.min(3, Number(entry.tier || 1)));
    uniqueTier[tier] += 1;
    pullTier[tier] += Math.max(0, Number(entry.drawCount || 0));
  }

  const remainingTier = { 1: 0, 2: 0, 3: 0 };
  for (const [moveId, move] of allMoveMap.entries()) {
    if (collectedIds.has(moveId)) continue;
    const tier = Math.max(1, Math.min(3, Number(move?.tier || 1)));
    remainingTier[tier] += 1;
  }

  return {
    codex,
    npcEntries,
    drawEntries: drawnKnownEntries,
    skillEntries: collectedSkillEntries,
    totalNpc,
    encounteredNpc,
    remainingNpc,
    totalSkills,
    collectedSkills,
    remainingSkills,
    totalDrawCount,
    uniqueTier,
    pullTier,
    remainingTier
  };
}

async function showPlayerCodex(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }

  let mutated = ensurePlayerGenerationSchema(player);
  if (recordNearbyNpcEncounters(player, 8)) mutated = true;
  if (mutated) CORE.savePlayer(player);

  const uiLang = getPlayerUILang(player);
  const labels = getCodexLabels(uiLang);
  const data = collectPlayerCodexData(player);

  const embed = new EmbedBuilder()
    .setTitle(labels.overviewTitle)
    .setColor(0x3b82f6)
    .setDescription(labels.overviewDesc)
    .addFields(
      {
        name: labels.npcProgress,
        value:
          `已收集：**${data.encounteredNpc}/${data.totalNpc || 0}**\n` +
          `${labels.unknownCount}：**${data.remainingNpc}**（${labels.canFight}）\n` +
          `遭遇總次數：**${Math.max(0, Number(data.codex?.npcEncounterTotal || 0))}**`,
        inline: true
      },
      {
        name: labels.skillProgress,
        value:
          `已收集：**${data.collectedSkills}/${data.totalSkills || 0}**\n` +
          `${labels.unknownCount}：**${data.remainingSkills}**（${labels.canDraw}）\n` +
          `抽取總次數：**${data.totalDrawCount}**\n` +
          `（含：抽取 / 寵物已學 / 背包技能晶片）`,
        inline: true
      }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_codex_npc').setLabel(labels.npcButton).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('show_codex_skill').setLabel(labels.skillButton).setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function showNpcCodex(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }

  let mutated = ensurePlayerGenerationSchema(player);
  if (recordNearbyNpcEncounters(player, 8)) mutated = true;
  if (mutated) CORE.savePlayer(player);

  const uiLang = getPlayerUILang(player);
  const labels = getCodexLabels(uiLang);
  const data = collectPlayerCodexData(player);

  const npcLines = data.npcEntries.slice(0, 18).map((entry, idx) =>
    `${idx + 1}. ${entry.name}${entry.title ? `（${entry.title}）` : ''}｜${entry.lastLocation || '未知地點'}`
  );

  const embed = new EmbedBuilder()
    .setTitle(labels.npcTitle)
    .setColor(0x4f46e5)
    .setDescription(
      `已收集 **${data.encounteredNpc}/${data.totalNpc || 0}** ｜ ` +
      `未收集 **${data.remainingNpc}**（${labels.canFight}）`
    )
    .addFields(
      { name: labels.npcCollected, value: formatCodexLines(npcLines, 1020, labels.npcEmpty), inline: false },
      { name: labels.npcUnknown, value: `尚有 **${data.remainingNpc}** 位未收集（名稱隱藏）`, inline: false }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_codex').setLabel(labels.backCodex).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_codex_skill').setLabel(labels.skillButton).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function showSkillCodex(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.update({ content: '❌ 找不到角色！', components: [] });
    return;
  }

  let mutated = ensurePlayerGenerationSchema(player);
  if (recordNearbyNpcEncounters(player, 8)) mutated = true;
  if (mutated) CORE.savePlayer(player);

  const uiLang = getPlayerUILang(player);
  const labels = getCodexLabels(uiLang);
  const data = collectPlayerCodexData(player);

  const skillLines = data.skillEntries.slice(0, 30).map((entry, idx) => {
    const tier = Math.max(1, Math.min(3, Number(entry.tier || 1)));
    const tierEmoji = tier === 3 ? '🔮' : tier === 2 ? '💠' : '⚪';
    const tags = [];
    if (Number(entry.drawCount || 0) > 0) tags.push(`抽取x${Number(entry.drawCount || 0)}`);
    if (Number(entry.chipCount || 0) > 0) tags.push(`晶片x${Number(entry.chipCount || 0)}`);
    if (entry.learned) tags.push('寵物已學');
    const source = tags.length > 0 ? `｜${tags.join('・')}` : '';
    return `${idx + 1}. ${tierEmoji} ${entry.name}${source}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(labels.skillTitle)
    .setColor(0x0ea5e9)
    .setDescription(
      `已收集 **${data.collectedSkills}/${data.totalSkills || 0}** ｜ ` +
      `未收集 **${data.remainingSkills}**（${labels.canDraw}）`
    )
    .addFields(
      {
        name: labels.skillCollected,
        value: formatCodexLines(skillLines, 1020, labels.skillEmpty),
        inline: false
      },
      {
        name: labels.skillUnknown,
        value:
          `尚有 **${data.remainingSkills}** 招未收集（名稱隱藏）\n` +
          `T1/T2/T3 剩餘：${data.remainingTier[1]}/${data.remainingTier[2]}/${data.remainingTier[3]}`,
        inline: false
      }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_codex').setLabel(labels.backCodex).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_codex_npc').setLabel(labels.npcButton).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

  return {
    showMovesList,
    showFinanceLedger,
    showMemoryAudit,
    showMemoryRecap,
    showPlayerMarketMenu,
    showPlayerMarketListings,
    showMyMarketListings,
    showWorldShopHaggleAllOffer,
    showWorldShopHaggleBulkPicker,
    showWorldShopHagglePicker,
    showWorldShopHaggleOffer,
    showWorldShopSellPicker,
    showWorldShopSellModal,
    handleWorldShopSellModal,
    showMarketPostModal,
    handleMarketPostModal,
    showWorldShopBuyPanel,
    showWorldShopScene,
    showInventory,
    collectPlayerCodexData,
    showPlayerCodex,
    showNpcCodex,
    showSkillCodex
  };
}

module.exports = {
  createPlayerPanelUtils
};
