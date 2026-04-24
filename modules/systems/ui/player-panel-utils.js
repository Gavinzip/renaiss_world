const FUSION = require('../equipment/equipment-fusion-agent');
const {
  getLocalizedItemName,
  getLocalizedItemDesc,
  getMoveLocalization,
  localizeScriptOnly
} = require('../runtime/utils/global-language-resources');

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
    SHOP_HEAL_CRYSTAL_COST = 200,
    SHOP_ENERGY_CRYSTAL_COST = 2000,
    TELEPORT_DEVICE_COST = 200,
    TELEPORT_DEVICE_DURATION_HOURS = 6,
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
    getAllPetSkillMoves = () => [],
    extractSkillChipMoveName = () => '',
    getLanguageSection = null,
    showMainMenu
  } = deps;

  const PLAYER_PANEL_TEXT_FALLBACK = {
    skillChipPrefix: '技能晶片：',
    fusionBlockedItems: ['乾糧一包', '水囊'],
    fusionSlots: {
      helmet: '頭盔（攻擊）',
      armor: '盔甲（生命+防禦）',
      belt: '腰帶（生命）',
      shoes: '鞋子（速度）',
      unknown: '未知槽位'
    },
    finance: {},
    memoryAudit: {},
    codex: {},
    moves: {},
    inventory: {},
    equipment: {}
  };

  function getPlayerPanelText(lang = 'zh-TW') {
    const base = typeof getLanguageSection === 'function'
      ? (getLanguageSection('playerPanelText', 'zh-TW') || {})
      : {};
    const localized = typeof getLanguageSection === 'function'
      ? (getLanguageSection('playerPanelText', lang) || {})
      : {};
    return {
      ...PLAYER_PANEL_TEXT_FALLBACK,
      ...base,
      ...localized,
      fusionSlots: {
        ...(PLAYER_PANEL_TEXT_FALLBACK.fusionSlots || {}),
        ...(base?.fusionSlots || {}),
        ...(localized?.fusionSlots || {})
      },
      finance: { ...(base?.finance || {}), ...(localized?.finance || {}) },
      memoryAudit: { ...(base?.memoryAudit || {}), ...(localized?.memoryAudit || {}) },
      codex: { ...(base?.codex || {}), ...(localized?.codex || {}) },
      moves: { ...(base?.moves || {}), ...(localized?.moves || {}) },
      inventory: { ...(base?.inventory || {}), ...(localized?.inventory || {}) },
      equipment: { ...(base?.equipment || {}), ...(localized?.equipment || {}) }
    };
  }

const SKILL_CHIP_PREFIX = String(getPlayerPanelText('zh-TW').skillChipPrefix || '技能晶片：');
const PROTECTED_MOVE_IDS = new Set(['flee']);
const FUSION_BLOCKED_ITEMS = new Set(
  Array.isArray(getPlayerPanelText('zh-TW').fusionBlockedItems)
    ? getPlayerPanelText('zh-TW').fusionBlockedItems
    : ['乾糧一包', '水囊']
);

function getFusionSlotLabel(slot = '', uiLang = 'zh-TW') {
  const slots = getPlayerPanelText(uiLang)?.fusionSlots || {};
  const key = String(slot || '').trim();
  return slots[key] || slots.unknown || 'Unknown Slot';
}

function getFusionRarityLabel(rarity = '') {
  const safe = String(rarity || '').trim().toUpperCase();
  return ['N', 'R', 'SR', 'SSR', 'UR'].includes(safe) ? safe : 'N';
}

function getPanelMoveText(uiLang = 'zh-TW') {
  const base = getPlayerPanelText('zh-TW')?.moves || {};
  const localized = getPlayerPanelText(uiLang)?.moves || {};
  return { ...base, ...localized };
}

function getLocalizedMoveName(move = null, uiLang = 'zh-TW') {
  return getMoveLocalization(move?.id || '', move?.name || '', uiLang) || String(move?.name || '').trim();
}

function getFinanceText(uiLang = 'zh-TW') {
  const base = getPlayerPanelText('zh-TW')?.finance || {};
  const localized = getPlayerPanelText(uiLang)?.finance || {};
  return { ...base, ...localized };
}

function getMemoryAuditText(uiLang = 'zh-TW') {
  const base = getPlayerPanelText('zh-TW')?.memoryAudit || {};
  const localized = getPlayerPanelText(uiLang)?.memoryAudit || {};
  return { ...base, ...localized };
}

function localizeChipReason(reason = '', uiLang = 'zh-TW') {
  const text = String(reason || '').trim();
  const tx = getPanelMoveText(uiLang);
  if (!text) return tx.reasonNotLearnable;
  if (text === '未知技能') return tx.reasonUnknownSkill;
  if (text === '屬性不符') return tx.reasonElementMismatch;
  if (text === '已學會') return tx.reasonLearned;
  if (text === '不可學') return tx.reasonNotLearnable;
  return text;
}

function isSkillChipItemName(name = '') {
  const text = String(name || '').trim();
  return text.startsWith(SKILL_CHIP_PREFIX) || Boolean(extractSkillChipMoveName(text));
}

function isProtectedMoveId(moveId = '') {
  return PROTECTED_MOVE_IDS.has(String(moveId || '').trim());
}

function normalizeElementForDamageBalance(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text === '水' || /水|液|潮|霧|冰/.test(text)) return '水';
  if (text === '火' || /火|炎|焰|熱|熔/.test(text)) return '火';
  if (text === '草' || /草|木|藤|森|生質/.test(text)) return '草';
  return '';
}

function buildMoveDamageBreakdown(move = {}, pet = {}) {
  const rawBase = Math.max(0, Number(move?.baseDamage ?? move?.damage ?? 0));
  const attack = Math.max(0, Number(pet?.attack || 0));
  const attackBonus = Math.max(0, Math.floor(attack * 0.2));
  const summedBase = rawBase + attackBonus;
  const dmg = BATTLE.calculatePlayerMoveDamage(move, {}, pet);
  const instant = Math.max(0, Number(dmg?.instant || 0));
  const overTime = Math.max(0, Number(dmg?.overTime || 0));
  const total = Math.max(0, Number(dmg?.total || 0));
  const effect = move?.effect && typeof move.effect === 'object' ? move.effect : {};

  let secondTick = 0;
  const secondTickParts = [];
  const burnTick = Math.max(1, Math.floor(instant * 0.22));
  const poisonTick = Math.max(1, Math.floor(instant * 0.16));
  const trapTick = Math.max(1, Math.floor(instant * 0.18));
  const bleedTick = Math.max(1, Math.floor(instant * 0.24));
  const spreadPoisonTick = Math.max(1, Math.floor(instant * 0.12));
  const dotTick = Math.max(1, Number(effect.dot || 0));
  if (Number(effect.burn || 0) >= 2) {
    secondTick += burnTick;
    secondTickParts.push(`🔥${burnTick}`);
  }
  if (Number(effect.poison || 0) >= 2) {
    secondTick += poisonTick;
    secondTickParts.push(`☠️${poisonTick}`);
  }
  if (Number(effect.trap || 0) >= 2) {
    secondTick += trapTick;
    secondTickParts.push(`🪤${trapTick}`);
  }
  if (Number(effect.bleed || 0) >= 2) {
    secondTick += bleedTick;
    secondTickParts.push(`🩸${bleedTick}`);
  }
  if (effect.spreadPoison) {
    secondTick += spreadPoisonTick;
    secondTickParts.push(`🧪${spreadPoisonTick}`);
  }
  if (Number(effect.dot || 0) > 0) {
    secondTick += dotTick;
    secondTickParts.push(`⚡${dotTick}`);
  }

  return {
    rawBase,
    attack,
    attackBonus,
    summedBase,
    instant,
    overTime,
    total,
    secondTick,
    secondTickText: secondTickParts.length > 0 ? secondTickParts.join('+') : '無'
  };
}

function isComponentInteraction(interaction) {
  return Boolean(
    (interaction?.isButton && interaction.isButton()) ||
    (interaction?.isStringSelectMenu && interaction.isStringSelectMenu())
  );
}

async function deferPanelInteractionIfNeeded(interaction, context = 'panel_update') {
  if (!isComponentInteraction(interaction)) return;
  if (interaction.deferred || interaction.replied) return;
  try {
    await interaction.deferUpdate();
  } catch (err) {
    console.error(`[PanelUI] ${context} deferUpdate failed:`, err?.message || err);
  }
}

async function safeUpdatePanelInteraction(interaction, payload, context = 'panel_update') {
  try {
    await updateInteractionMessage(interaction, payload);
    return true;
  } catch (err) {
    console.error(`[PanelUI] ${context} update failed:`, err?.message || err);
  }
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
    return true;
  } catch (fallbackErr) {
    console.error(`[PanelUI] ${context} fallback send failed:`, fallbackErr?.message || fallbackErr);
    return false;
  }
}

// ============== 招式列表 ==============
async function showMovesList(interaction, user, selectedPetId = '', notice = '', page = 0) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const moveTx = getPanelMoveText(uiLang);
  if (!player) {
    await interaction.update({ content: moveTx.notFoundPlayer, embeds: [], components: [] });
    return;
  }

  const ownedPets = getPlayerOwnedPets(user.id);
  if (ownedPets.length === 0) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Primary)
    );
    await interaction.update({ content: moveTx.noPet, embeds: [], components: [row] });
    return;
  }

  let selectedPet = ownedPets.find((p) => p.id === selectedPetId) || null;
  if (!selectedPet) {
    const preferredId = String(player?.activePetId || player?.mainPetId || '').trim();
    if (preferredId) {
      selectedPet = ownedPets.find((p) => String(p?.id || '').trim() === preferredId) || null;
    }
  }
  if (!selectedPet) {
    const defaultPet = PET.loadPet(user.id);
    selectedPet = ownedPets.find((p) => p.id === defaultPet?.id) || ownedPets[0];
  }
  if (!Array.isArray(selectedPet.moves)) selectedPet.moves = [];

  let loadoutMutated = false;
  for (const pet of ownedPets) {
    const attackIds = getPetAttackMoves(pet)
      .filter((m) => !isProtectedMoveId(m?.id))
      .map((m) => String(m?.id || '').trim())
      .filter(Boolean)
      .slice(0, PET_MOVE_LOADOUT_LIMIT);
    const beforeIds = Array.isArray(pet?.activeMoveIds)
      ? pet.activeMoveIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (JSON.stringify(beforeIds) !== JSON.stringify(attackIds)) {
      pet.activeMoveIds = attackIds;
      PET.savePet(pet);
      loadoutMutated = true;
    }
    normalizePetMoveLoadout(pet, false);
  }
  const activePetResolved = resolvePlayerMainPet(player, { fallbackPet: selectedPet });
  const activePetId = String(activePetResolved?.pet?.id || player?.activePetId || '').trim();
  if (activePetResolved?.changed || loadoutMutated) CORE.savePlayer(player);
  const allChipEntries = getLearnableSkillChipEntries(player, selectedPet);
  const learnableChips = allChipEntries
    .filter((entry) => Boolean(entry?.canLearn))
    .sort((a, b) => {
      const tierDiff = Number(b?.move?.tier || 0) - Number(a?.move?.tier || 0);
      if (tierDiff !== 0) return tierDiff;
      const countDiff = Number(b?.count || 0) - Number(a?.count || 0);
      if (countDiff !== 0) return countDiff;
      return String(a?.move?.name || '').localeCompare(String(b?.move?.name || ''), 'zh-Hant');
    });
  const allChipTotal = allChipEntries.reduce((sum, item) => sum + Number(item?.count || 0), 0);
  const learnableChipTotal = learnableChips.reduce((sum, item) => sum + Number(item?.count || 0), 0);
  const blockedChipReasonSummary = allChipEntries
    .filter((entry) => !entry?.canLearn)
    .reduce((acc, entry) => {
      const reason = localizeChipReason(entry?.reason, uiLang);
      const count = Number(entry?.count || 0);
      acc[reason] = (acc[reason] || 0) + (count > 0 ? count : 1);
      return acc;
    }, {});
  const blockedChipReasonText = Object.entries(blockedChipReasonSummary)
    .sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0))
    .slice(0, 3)
    .map(([reason, count]) => `${reason} x${count}`)
    .join('｜');
  const forgettableMoves = getForgettablePetMoves(selectedPet);

  const currentPage = Math.max(0, Number(page || 0));
  const selectedAttack = Math.max(0, Number(selectedPet?.attack || 0));
  const selectedAtkBonus = Math.max(0, Math.floor(selectedAttack * 0.2));
  const selectedConfiguredAttackCount = getPetAttackMoves(selectedPet)
    .filter((m) => !isProtectedMoveId(m?.id))
    .length;
  const selectedSlotFull = selectedConfiguredAttackCount >= PET_MOVE_LOADOUT_LIMIT;
  const elementBalance = typeof BATTLE.getElementDamageBalance === 'function'
    ? BATTLE.getElementDamageBalance()
    : {};
  const normalizedPetElement = normalizeElementForDamageBalance(selectedPet?.type || selectedPet?.element || '');
  const elementScale = Number(elementBalance?.[normalizedPetElement] || 1);

  const unlockedMoves = (selectedPet.moves || []).map((m, i) => {
    const isFlee = Boolean(m?.effect && m.effect.flee);
    const isProtected = isProtectedMoveId(m?.id);
    const statusMark = isFlee ? moveTx.statusFixed : (isProtected ? moveTx.statusInnate : moveTx.statusCarried);
    const moveDisplayName = getLocalizedMoveName(m, uiLang);
    const dmg = buildMoveDamageBreakdown(m, selectedPet);
    const energyCost = isFlee ? '-' : BATTLE.getMoveEnergyCost(m);
    const moveSpeed = getMoveSpeedValue(m);
    const tierEmoji = m.tier === 3 ? '🔮' : m.tier === 2 ? '💠' : '⚪';
    const tierName = m.tier === 3 ? moveTx.tierEpic : m.tier === 2 ? moveTx.tierRare : moveTx.tierCommon;
    const effectStr = describeMoveEffects(m);
    const dotSecondLine = dmg.secondTick > 0
      ? moveTx.dotTick2(dmg.secondTick, dmg.secondTickText)
      : '';
    const instantLabel = moveTx.damageInstantLabel || 'Hit';
    const totalLabel = moveTx.damageTotalLabel || 'Total';
    const speedLabel = moveTx.speedLabel || 'Speed';
    return `${tierEmoji} ${i + 1}. **${moveDisplayName}** (${m.element}/${tierName})｜${statusMark}\n   💥 ${format1(dmg.rawBase)}+${format1(dmg.attackBonus)} | ${instantLabel}${format1(dmg.instant)} | ${totalLabel}${format1(dmg.total)} | ⚡${energyCost} | 🚀${speedLabel}${format1(moveSpeed)} | ${effectStr || moveTx.effectNone}${dotSecondLine}`;
  });

  const petSummary = ownedPets.map((pet, i) => {
    const carriedMoves = getPetAttackMoves(pet)
      .filter((m) => !isProtectedMoveId(m?.id))
      .slice(0, PET_MOVE_LOADOUT_LIMIT);
    const activeNames = carriedMoves.map((m) => m.name).join('、') || moveTx.noAttackLearned;
    return `${i + 1}. **${pet.name}**（${pet.type}）\n${moveTx.carriedSummary(carriedMoves.length, PET_MOVE_LOADOUT_LIMIT, activeNames)}`;
  }).join('\n\n');

  const chipOverview = allChipEntries.length > 0
    ? allChipEntries
      .map((entry, idx) => {
        const move = entry.move || {};
        const tierEmoji = move.tier === 3 ? '🔮' : move.tier === 2 ? '💠' : '⚪';
        const tierName = move.tier === 3 ? moveTx.tierEpic : move.tier === 2 ? moveTx.tierRare : moveTx.tierCommon;
        const localizedReason = localizeChipReason(entry.reason, uiLang);
        const mark = entry.canLearn ? moveTx.markLearnable : (localizedReason === moveTx.reasonLearned ? moveTx.markLearned : moveTx.markBlocked);
        const reasonText = entry.canLearn ? '' : `（${localizedReason || moveTx.notLearnable}）`;
        const moveDisplayName = getLocalizedMoveName(move, uiLang);
        const dmg = buildMoveDamageBreakdown(move, selectedPet);
        const energyCost = BATTLE.getMoveEnergyCost(move);
        const moveSpeed = getMoveSpeedValue(move);
        const effectStr = describeMoveEffects(move);
        const instantShort = moveTx.damageInstantShort || 'Hit';
        const totalShort = moveTx.damageTotalShort || 'Total';
        const unknownElement = moveTx.unknownElement || 'Unknown';
        return `${idx + 1}. ${tierEmoji} **${moveDisplayName}** x${entry.count}｜${mark}${reasonText}\n   ${move.element || unknownElement}/${tierName} | 💥 ${format1(dmg.rawBase)}+${format1(dmg.attackBonus)} | ${instantShort}${format1(dmg.instant)} / ${totalShort}${format1(dmg.total)} | ⚡${energyCost} | 🚀${format1(moveSpeed)} | ${effectStr || moveTx.effectNone}`;
      })
    : [moveTx.noSkillChips];

  const movePreviewPager = paginateList(unlockedMoves, 0, MOVES_DETAIL_PAGE_SIZE);
  const chipPreviewPager = paginateList(chipOverview, 0, MOVES_DETAIL_PAGE_SIZE);
  const totalPages = Math.max(
    1,
    Number(movePreviewPager?.totalPages || 1),
    Number(chipPreviewPager?.totalPages || 1)
  );
  const sharedPage = Math.max(0, Math.min(totalPages - 1, currentPage));
  const movePager = paginateList(unlockedMoves, sharedPage, MOVES_DETAIL_PAGE_SIZE);
  const moveDetailText = movePager.items.length > 0 ? movePager.items.join('\n\n') : moveTx.noAttackMoves;
  const chipPager = paginateList(chipOverview, sharedPage, MOVES_DETAIL_PAGE_SIZE);
  const chipDetailText = chipPager.items.length > 0 ? chipPager.items.join('\n\n') : moveTx.noSkillChips;

  const noticeLine = notice
    ? (String(notice).startsWith('✅') || String(notice).startsWith('⚠️') ? String(notice) : `✅ ${notice}`)
    : '';

  const description = [
    noticeLine,
    moveTx.manage(selectedPet.name, getPetElementDisplayName(selectedPet.type, uiLang)),
    moveTx.formula,
    moveTx.petAtk(
      selectedAttack,
      selectedAtkBonus,
      normalizedPetElement
        ? (typeof moveTx.elementBalanceSuffix === 'function'
          ? moveTx.elementBalanceSuffix(format1(elementScale))
          : `｜屬性平衡 x${format1(elementScale)}`)
        : ''
    ),
    moveTx.dotHint,
    moveTx.learnHint,
    moveTx.sortHint,
    moveTx.unlearnHint,
    moveTx.loadoutRule(PET_MOVE_LOADOUT_LIMIT),
    moveTx.loadoutNow(selectedConfiguredAttackCount, PET_MOVE_LOADOUT_LIMIT, selectedSlotFull),
    moveTx.unlocked(selectedPet.moves.length),
    moveTx.chips(allChipTotal, learnableChipTotal, learnableChips.length),
    (!learnableChipTotal && allChipTotal > 0 && blockedChipReasonText) ? moveTx.blockedReasons(blockedChipReasonText) : '',
    moveTx.upgradePoints(Number(player?.upgradePoints || 0), Number(GACHA?.GACHA_CONFIG?.hpPerPoint || 1)),
    moveTx.activePet(activePetResolved?.pet?.name || selectedPet.name)
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(moveTx.title)
    .setColor(getPetElementColor(selectedPet.type))
    .setDescription(description)
    .addFields(
      { name: moveTx.fieldMoves(selectedPet.name, movePager.page + 1, movePager.totalPages), value: moveDetailText.slice(0, 1024), inline: false },
      { name: moveTx.fieldChips(chipPager.page + 1, chipPager.totalPages), value: chipDetailText.slice(0, 1024), inline: false },
      { name: moveTx.fieldOverview, value: petSummary.slice(0, 1024), inline: false }
    );

  const petSelectOptions = ownedPets.slice(0, 25).map((pet) => {
    const carriedCount = Math.min(
      getPetAttackMoves(pet).filter((m) => !isProtectedMoveId(m?.id)).length,
      PET_MOVE_LOADOUT_LIMIT
    );
    return {
      label: `${pet.name}`.slice(0, 100),
      description: moveTx.petSelectDesc(carriedCount, PET_MOVE_LOADOUT_LIMIT),
      value: pet.id,
      default: pet.id === selectedPet.id
    };
  });
  const petSelect = new StringSelectMenuBuilder()
    .setCustomId('moves_pet_select')
    .setPlaceholder(moveTx.petSelectPlaceholder)
    .addOptions(petSelectOptions);
  const rowPetSelect = new ActionRowBuilder().addComponents(petSelect);

  let rowLearnChip = null;
  if (learnableChips.length > 0) {
    const learnOptions = learnableChips.slice(0, 25).map((entry) => {
      const move = entry.move || {};
      const tierText = move.tier === 3 ? moveTx.tierEpic : move.tier === 2 ? moveTx.tierRare : moveTx.tierCommon;
      const dmg = buildMoveDamageBreakdown(move, selectedPet);
      const energyCost = BATTLE.getMoveEnergyCost(move);
      const moveSpeed = getMoveSpeedValue(move);
      const effectShort = String(describeMoveEffects(move) || moveTx.effectNone).replace(/；/g, '/').slice(0, 44);
      return {
        label: `${move.tier === 3 ? `🔮${moveTx.tierEpic}` : move.tier === 2 ? `💠${moveTx.tierRare}` : `⚪${moveTx.tierCommon}`}｜${getLocalizedMoveName(move, uiLang)}`.slice(0, 100),
        description: `${move.element || (moveTx.unknownElement || 'Unknown')}/${tierText}｜${format1(dmg.rawBase)}+${format1(dmg.attackBonus)}⚡${energyCost}🚀${format1(moveSpeed)}｜${effectShort}`.slice(0, 100),
        value: `${selectedPet.id}::${move.id}`
      };
    });
    rowLearnChip = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('moves_learn_chip')
        .setPlaceholder(moveTx.learnPlaceholder(learnableChipTotal))
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(learnOptions)
    );
  }

  let rowUnlearnChip = null;
  if (forgettableMoves.length > 0) {
    const sortedForgettableMoves = [...forgettableMoves].sort((a, b) => {
      const tierDiff = Number(b?.tier || 0) - Number(a?.tier || 0);
      if (tierDiff !== 0) return tierDiff;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant');
    });
    const unlearnOptions = sortedForgettableMoves.slice(0, 25).map((move) => {
      const tierText = move.tier === 3 ? moveTx.tierEpic : move.tier === 2 ? moveTx.tierRare : moveTx.tierCommon;
      const dmg = buildMoveDamageBreakdown(move, selectedPet);
      const energyCost = BATTLE.getMoveEnergyCost(move);
      const moveSpeed = getMoveSpeedValue(move);
      const effectShort = String(describeMoveEffects(move) || moveTx.effectNone).replace(/；/g, '/').slice(0, 44);
      return {
        label: `${move.tier === 3 ? `🔮${moveTx.tierEpic}` : move.tier === 2 ? `💠${moveTx.tierRare}` : `⚪${moveTx.tierCommon}`}｜${getLocalizedMoveName(move, uiLang)}`.slice(0, 100),
        description: `${move.element || (moveTx.unknownElement || 'Unknown')}/${tierText}｜${format1(dmg.rawBase)}+${format1(dmg.attackBonus)}⚡${energyCost}🚀${format1(moveSpeed)}｜${effectShort}`.slice(0, 100),
        value: `${selectedPet.id}::${move.id}`
      };
    });
    rowUnlearnChip = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('moves_unlearn_chip')
        .setPlaceholder(moveTx.unlearnPlaceholder)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(unlearnOptions)
    );
  }

  const remainPoints = Math.max(0, Number(player?.upgradePoints || 0));
  const hpPerPoint = Number(GACHA?.GACHA_CONFIG?.hpPerPoint || 1);
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`moves_page_prev_${selectedPet.id}_${movePager.page}`)
      .setLabel(moveTx.prevPage)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sharedPage <= 0),
    new ButtonBuilder()
      .setCustomId(`moves_page_next_${selectedPet.id}_${movePager.page}`)
      .setLabel(moveTx.nextPage)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sharedPage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`set_main_pet_${selectedPet.id}`)
      .setLabel(activePetId === String(selectedPet.id) ? moveTx.activeMain : moveTx.setMain)
      .setStyle(activePetId === String(selectedPet.id) ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(activePetId === String(selectedPet.id)),
    new ButtonBuilder().setCustomId('open_profile').setLabel(moveTx.profile).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );

  const rowAllocate = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`alloc_hp_open_${selectedPet.id}`)
      .setLabel(moveTx.allocHp(remainPoints))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(remainPoints <= 0),
    new ButtonBuilder()
      .setCustomId(`moves_show_equipment_${selectedPet.id}`)
      .setLabel(moveTx.equipment)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false)
  );

  // 保留每點換算資訊，讓玩家在打開輸入框前可快速確認。
  if (rowAllocate.components[0]) {
    rowAllocate.components[0].setEmoji('➕');
  }

  const pointHintRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`alloc_hp_hint_${selectedPet.id}_${remainPoints}`)
      .setLabel(moveTx.pointHint(hpPerPoint, remainPoints))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  // Discord 訊息元件最多 5 列；若超過會導致 update 失敗並看起來像「按鈕消失」。
  // 保留優先順序：寵物切換 > 學習晶片 > HP加點 > 取消學習 > 返回按鈕。
  const components = [rowPetSelect];
  const optionalRows = [rowLearnChip, rowAllocate, rowUnlearnChip].filter(Boolean);
  for (const row of optionalRows) {
    if (components.length >= 4) break; // 保留最後一列 rowButtons（總列數 <= 5）
    components.push(row);
  }
  // 若還有空間，補一列只讀提示，避免「可分配點數」資訊被埋在長文字中。
  if (components.length < 4) components.push(pointHintRow);
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

function buildEquipmentSlotDetailLine(item = null, slot = 'helmet', uiLang = 'zh-TW') {
  const eqTx = getEquipmentText(uiLang);
  if (!item || typeof item !== 'object') return `• ${getFusionSlotLabel(slot, uiLang)}：${eqTx.notEquipped || '未裝備'}`;
  const rarity = getFusionRarityLabel(item.rarity);
  const name = getLocalizedItemName(item, uiLang) || String(item.name || eqTx.unnamedGear || '未命名裝備');
  const stats = item.stats && typeof item.stats === 'object' ? item.stats : {};
  const statText = formatEquipmentStatText(slot, stats);
  const value = Math.max(0, Number(item.value || 0));
  return `• ${getFusionSlotLabel(slot, uiLang)}：${rarity} ${name}｜${statText}｜${eqTx.estimateLabel || '估值'} ${value}`;
}

function formatEquipmentStatText(slot = '', stats = {}) {
  const safeSlot = String(slot || '').trim();
  const attack = Math.max(0, Number(stats?.attack || 0));
  const hp = Math.max(0, Number(stats?.hp || 0));
  const defense = Math.max(0, Number(stats?.defense || 0));
  const speed = Math.max(0, Number(stats?.speed || 0));
  if (safeSlot === 'helmet') return `ATK +${attack}`;
  if (safeSlot === 'armor') return `HP +${hp}｜DEF +${defense}`;
  if (safeSlot === 'belt') return `HP +${hp}`;
  return `SPD +${speed}`;
}

function parsePetIdFromEquipmentCustomId(customId = '', prefix = '') {
  const raw = String(customId || '').trim();
  if (!raw.startsWith(prefix)) return '';
  return String(raw.slice(prefix.length) || '').trim();
}

function buildPetEquipmentOwnershipLines(player = null, ownedPets = [], uiLang = 'zh-TW') {
  const eqTx = getEquipmentText(uiLang);
  const pets = Array.isArray(ownedPets) ? ownedPets : [];
  if (!player || pets.length <= 0) return [eqTx.noPetEquipmentData || '（尚未有寵物裝備資料）'];
  const lines = [];
  for (const pet of pets) {
    const petId = String(pet?.id || '').trim();
    if (!petId) continue;
    const slots = FUSION.getPetEquipmentSlots(player, petId, { ensure: false });
    const equippedSlots = FUSION.EQUIPMENT_SLOTS
      .filter((slot) => Boolean(slots?.[slot] && typeof slots[slot] === 'object'))
      .map((slot) => getFusionSlotLabel(slot, uiLang));
    if (equippedSlots.length <= 0) continue;
    lines.push(`• ${String(pet?.name || eqTx.petLabel || '寵物')}：${equippedSlots.join('、')}`);
  }
  return lines.length > 0 ? lines : [eqTx.noPetEquipped || '（目前尚未有任何寵物穿戴裝備）'];
}

async function showPetEquipmentView(interaction, user, selectedPetId = '', notice = '') {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const eqTx = getEquipmentText(uiLang);
  if (!player) {
    await updateInteractionMessage(interaction, { content: eqTx.notFoundPlayer || '❌ 找不到角色！', components: [] });
    return;
  }
  const changed = FUSION.ensurePlayerEquipmentState(player);
  if (changed) CORE.savePlayer(player);

  const ownedPets = getPlayerOwnedPets(user.id);
  let selectedPet = ownedPets.find((p) => String(p?.id || '') === String(selectedPetId || '')) || null;
  if (!selectedPet) {
    const defaultPet = PET.loadPet(user.id);
    selectedPet = ownedPets.find((p) => String(p?.id || '') === String(defaultPet?.id || '')) || ownedPets[0] || null;
  }

  const selectedPetIdSafe = String(selectedPet?.id || '').trim();
  const equipment = FUSION.getPetEquipmentSlots(player, selectedPetIdSafe, { ensure: true });
  const bonus = FUSION.getEquippedBonuses(player, selectedPetIdSafe);
  const slotLines = FUSION.EQUIPMENT_SLOTS.map((slot) => buildEquipmentSlotDetailLine(equipment?.[slot], slot, uiLang));
  const loreLines = FUSION.EQUIPMENT_SLOTS
    .map((slot) => {
      const item = equipment?.[slot];
      if (!item || typeof item !== 'object') return '';
      const lore = getLocalizedItemDesc(item, uiLang) || String(item.lore || '').trim();
      if (!lore) return '';
      return `【${getFusionSlotLabel(slot, uiLang)}】${lore}`;
    })
    .filter(Boolean);
  const ownershipLines = buildPetEquipmentOwnershipLines(player, ownedPets, uiLang);
  const equipCandidates = Array.isArray(player?.equipmentBag) ? player.equipmentBag : [];
  const equipOptions = equipCandidates
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const slot = String(item.slot || '').trim();
      if (!FUSION.EQUIPMENT_SLOTS.includes(slot)) return null;
      const rarity = getFusionRarityLabel(item.rarity);
      const name = String(getLocalizedItemName(item, uiLang) || item.name || eqTx.unnamedGear || '未命名裝備').slice(0, 46);
      const value = Math.max(0, Number(item.value || 0));
      return {
        label: `【${getFusionSlotLabel(slot, uiLang)}】${rarity} ${name}`.slice(0, 100),
        description: `${eqTx.estimateLabel || '估值'} ${value}｜${eqTx.bagNo || '背包編號'} #${idx + 1}`.slice(0, 100),
        value: String(idx)
      };
    })
    .filter(Boolean)
    .slice(0, 25);
  const unequipOptions = FUSION.EQUIPMENT_SLOTS
    .map((slot) => {
      const item = equipment?.[slot];
      if (!item || typeof item !== 'object') return null;
      return {
        label: `${getFusionSlotLabel(slot, uiLang)}｜${String(getLocalizedItemName(item, uiLang) || item.name || eqTx.unnamedGear || '未命名裝備')}`.slice(0, 100),
        description: `${eqTx.unequipHint || '拆下後會回到裝備背包'}`.slice(0, 100),
        value: slot
      };
    })
    .filter(Boolean);

  const embed = new EmbedBuilder()
    .setTitle(eqTx.title || '🛡️ 寵物裝備管理')
    .setColor(0x64748b)
    .setDescription(
      `${selectedPet ? `${eqTx.currentPet || '目前寵物'}：**${selectedPet.name}**（${getPetElementDisplayName(selectedPet.type, uiLang)}）\n` : ''}` +
      `${notice ? `${notice}\n` : ''}` +
      `${eqTx.intro || '每隻寵物可獨立穿戴頭盔/盔甲/腰帶/鞋子。'}\n` +
      `${eqTx.totalBonus || '總加成'}：ATK +${Math.floor(Number(bonus.attack || 0))}｜HP +${Math.floor(Number(bonus.hp || 0))}｜DEF +${Math.floor(Number(bonus.defense || 0))}｜SPD +${Math.floor(Number(bonus.speed || 0))}`
    )
    .addFields(
      { name: eqTx.slotsTitle || '🎯 裝備欄位', value: slotLines.join('\n').slice(0, 1024), inline: false },
      { name: eqTx.loreTitle || '📜 裝備敘述', value: loreLines.length > 0 ? loreLines.join('\n').slice(0, 1024) : (eqTx.loreEmpty || '（目前沒有裝備敘述）'), inline: false },
      { name: eqTx.ownershipTitle || '🐾 裝備歸屬', value: ownershipLines.join('\n').slice(0, 1024), inline: false }
    );

  const rows = [];
  if (equipOptions.length > 0) {
    const equipSelect = new StringSelectMenuBuilder()
      .setCustomId(`pet_eq_equip_${selectedPetIdSafe}`)
      .setPlaceholder(eqTx.equipPlaceholder || '從裝備背包裝上到目前寵物')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(equipOptions);
    rows.push(new ActionRowBuilder().addComponents(equipSelect));
  }
  if (unequipOptions.length > 0) {
    const unequipSelect = new StringSelectMenuBuilder()
      .setCustomId(`pet_eq_unequip_${selectedPetIdSafe}`)
      .setPlaceholder(eqTx.unequipPlaceholder || '拆下目前寵物的已裝備欄位')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(unequipOptions);
    rows.push(new ActionRowBuilder().addComponents(unequipSelect));
  }

  const backPetId = String(selectedPet?.id || '').trim();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(backPetId ? `moves_open_pet_${backPetId}` : 'show_moves')
      .setLabel(eqTx.backPetPanel || '🐾 返回寵物管理')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('open_profile').setLabel(eqTx.profile || '💳 檔案').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );
  rows.push(row);
  await updateInteractionMessage(interaction, { embeds: [embed], components: rows });
}

async function handlePetEquipmentEquipSelect(interaction, user, customId = '') {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const eqTx = getEquipmentText(uiLang);
  if (!player) {
    await interaction.reply({ content: eqTx.notFoundPlayer || '❌ Character not found!', ephemeral: true }).catch(() => {});
    return;
  }
  const petId = parsePetIdFromEquipmentCustomId(customId, 'pet_eq_equip_');
  const ownedPets = getPlayerOwnedPets(user.id);
  const selectedPet = ownedPets.find((p) => String(p?.id || '').trim() === petId) || null;
  if (!petId || !selectedPet) {
    await interaction.reply({ content: eqTx.petDataExpired || '⚠️ Pet data expired. Please reopen equipment.', ephemeral: true }).catch(() => {});
    return;
  }
  const bagIndex = Number(String(interaction?.values?.[0] || '').trim());
  const result = FUSION.equipBagItemToPet(player, petId, bagIndex);
  if (!result?.success) {
    await interaction.reply({ content: eqTx.equipFailed || '⚠️ Unable to equip. Please choose again.', ephemeral: true }).catch(() => {});
    return;
  }
  CORE.savePlayer(player);
  const gearWord = eqTx.gearWord || 'Gear';
  const equippedName = String(getLocalizedItemName(result?.equipped, uiLang) || result?.equipped?.name || gearWord).trim() || gearWord;
  const successText = typeof eqTx.equipSuccess === 'function'
    ? eqTx.equipSuccess(selectedPet.name, equippedName)
    : `✅ Equipped ${equippedName} on ${selectedPet.name}`;
  await showPetEquipmentView(interaction, user, petId, successText);
}

async function handlePetEquipmentUnequipSelect(interaction, user, customId = '') {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const eqTx = getEquipmentText(uiLang);
  if (!player) {
    await interaction.reply({ content: eqTx.notFoundPlayer || '❌ Character not found!', ephemeral: true }).catch(() => {});
    return;
  }
  const petId = parsePetIdFromEquipmentCustomId(customId, 'pet_eq_unequip_');
  const ownedPets = getPlayerOwnedPets(user.id);
  const selectedPet = ownedPets.find((p) => String(p?.id || '').trim() === petId) || null;
  if (!petId || !selectedPet) {
    await interaction.reply({ content: eqTx.petDataExpired || '⚠️ Pet data expired. Please reopen equipment.', ephemeral: true }).catch(() => {});
    return;
  }
  const slot = String(interaction?.values?.[0] || '').trim();
  const result = FUSION.unequipPetSlotToBag(player, petId, slot);
  if (!result?.success) {
    await interaction.reply({ content: eqTx.unequipFailed || '⚠️ Unequip failed. Please try again.', ephemeral: true }).catch(() => {});
    return;
  }
  CORE.savePlayer(player);
  const gearWord = eqTx.gearWord || 'Gear';
  const unequippedName = String(getLocalizedItemName(result?.unequipped, uiLang) || result?.unequipped?.name || gearWord).trim() || gearWord;
  const successText = typeof eqTx.unequipSuccess === 'function'
    ? eqTx.unequipSuccess(unequippedName)
    : `↩️ Unequipped: ${unequippedName}`;
  await showPetEquipmentView(interaction, user, petId, successText);
}

async function showFinanceLedger(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const tx = getFinanceText(uiLang);
  if (!player) {
    await interaction.update({ content: tx.notFound || '❌ Character not found!', components: [] });
    return;
  }
  ECON.ensurePlayerEconomy(player);
  const ledgerText = buildFinanceLedgerText(player, 20);
  const notices = Array.isArray(player.financeNotices) ? player.financeNotices.slice(0, 5) : [];
  const noticeText = notices.length > 0 ? notices.map((n, i) => `${i + 1}. ${n}`).join('\n') : (tx.noUnread || '(No unread)');
  const tokenUnit = tx.tokenUnit || 'Rns';

  const embed = new EmbedBuilder()
    .setTitle(tx.title || '💸 Cashflow')
    .setColor(0x1f9d55)
    .setDescription(tx.desc || 'Recent income and expense records.')
    .addFields(
      { name: tx.currentRns || '💰 Current Rns', value: `${Number(player?.stats?.財富 || 0)} ${tokenUnit}`, inline: false },
      { name: tx.unreadNotices || '📬 Unread Notices', value: noticeText.slice(0, 1024), inline: false },
      { name: tx.recentLedger || '📒 Recent Ledger', value: ledgerText.slice(0, 1024), inline: false }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_inventory').setLabel(tx.backInventory || '🎒 Back to Inventory').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(tx.backMenu || 'Back to Menu').setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [embed], components: [row] });
}

async function showMemoryAudit(interaction, user) {
  const player = CORE.loadPlayer(user.id);
  const uiLang = getPlayerUILang(player);
  const tx = getMemoryAuditText(uiLang);
  if (!player) {
    await interaction.update({ content: tx.notFound || '❌ Character not found!', components: [] });
    return;
  }
  const rows = buildMemoryAuditRows(player, 24);
  const auditText = buildMemoryAuditText(rows, uiLang);
  const categoryCount = {};
  for (const row of rows) {
    const key = String(row?.category || tx.categoryDefault || 'General');
    categoryCount[key] = Number(categoryCount[key] || 0) + 1;
  }
  const categorySummary = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => `${name}x${count}`)
    .join('、') || (tx.noRecords || 'No records');

  const title = tx.title || '🧠 Memory Audit';
  const desc = tx.desc || 'Shows what was written into memory each turn and why.';
  const streamTitle = tx.streamTitle || 'Recent 24 Records';
  const descBody =
    `${desc}\n\n` +
    `${tx.categorySummary || '📊 Category Summary'}：${categorySummary}\n\n` +
    `📒 ${streamTitle}\n${auditText}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2563eb)
    .setDescription(descBody.slice(0, 3950));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(tx.backMenu || 'Back to Menu').setStyle(ButtonStyle.Secondary)
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
  const uiLang = getPlayerUILang(player);
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
      { name: `📍 ${t('location', uiLang)}`, value: `${player.location}`, inline: true }
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
  const uiLang = getPlayerUILang(player);
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
    ? listings.map((l, i) => buildMarketListingLine(l, pager.start + i, uiLang)).join('\n')
    : '（目前沒有可成交掛單）';

  const embed = new EmbedBuilder()
    .setTitle(`${title}｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(`${listText}\n\n頁數：${pager.page + 1}/${pager.totalPages}｜總筆數：${pager.total}`);

  const rows = [];
  if (listings.length > 0) {
    const selectOptions = listings.slice(0, 25).map((listing, idx) => {
      const itemName = getLocalizedItemName(listing, uiLang) || String(listing.itemName || '商品');
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
  const uiLang = getPlayerUILang(player);
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const allMine = ECON.getMarketListingsView({ marketType: safeMarket, type: 'sell', ownerId: user.id, limit: 500 });
  const pager = paginateList(allMine, page, MARKET_LIST_PAGE_SIZE);
  const mine = pager.items;

  const text = mine.length > 0
    ? mine.map((l, i) => `${pager.start + i + 1}. ${getLocalizedItemName(l, uiLang) || l.itemName} x${l.quantity}｜單價 ${l.unitPrice}｜總價 ${l.totalPrice}`).join('\n')
    : '（你目前沒有掛單）';

  const embed = new EmbedBuilder()
    .setTitle(`📌 我的掛單｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(`${text}\n\n頁數：${pager.page + 1}/${pager.totalPages}｜總筆數：${pager.total}`);

  const cancelButtons = mine.slice(0, 3).map((listing) =>
    new ButtonBuilder()
      .setCustomId(`pmkt_cancel_${listing.id}`)
      .setLabel(`取消 ${String(getLocalizedItemName(listing, uiLang) || listing.itemName || '掛單').slice(0, 12)}`)
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
  const uiLang = getPlayerUILang(player);
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
      itemNames: spec?.itemNames || null,
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
    .map((spec) => `${getLocalizedItemName({ itemName: spec?.itemName, itemNames: spec?.itemNames || null }, uiLang) || spec.itemName} x${Math.max(1, Number(spec.quantityMax || 1))}`)
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
  const uiLang = getPlayerUILang(player);
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
    itemNames: built.candidate?.itemNames || spec?.itemNames || null,
    spec: {
      kind: 'item',
      itemName: String(built.candidate?.itemName || spec.itemName || '').trim(),
      itemNames: built.candidate?.itemNames || spec?.itemNames || null,
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
  detailLines.push(`商品：${getLocalizedItemName({ itemName: pending.itemName, itemNames: pending.itemNames || null }, uiLang) || pending.itemName}`);
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
      new ButtonBuilder().setCustomId('show_moves').setLabel(`🐾 ${t('petManagement', uiLang)}`).setStyle(ButtonStyle.Primary)
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
    new ButtonBuilder().setCustomId('show_moves').setLabel(`🐾 ${t('petManagement', uiLang)}`).setStyle(ButtonStyle.Primary)
  );
  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function showWorldShopSellModal(interaction, marketType = 'renaiss', spec = null) {
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const itemName = String(
    spec?.itemDisplayName ||
    getLocalizedItemName({ itemName: spec?.itemName, itemNames: spec?.itemNames || null }, 'zh-TW') ||
    spec?.itemName ||
    '商品'
  ).slice(0, 36);
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
    itemNames: spec.itemNames || null,
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
  const successText = `賣單已上架：${getLocalizedItemName(listing, getPlayerUILang(player)) || listing.itemName} x${listing.quantity}（單價 ${listing.unitPrice}）`;
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
  const successText = `賣單已上架：${getLocalizedItemName(listing, getPlayerUILang(player)) || listing.itemName} x${listing.quantity}（單價 ${listing.unitPrice}）`;
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

function buildShopBuySelectOptions(listings = [], lang = 'zh-TW') {
  const source = Array.isArray(listings) ? listings : [];
  const options = [];
  const seenValues = new Set();
  let droppedInvalid = 0;

  for (let idx = 0; idx < source.length; idx += 1) {
    const listing = source[idx];
    const listingId = String(listing?.id || '').trim();
    const itemName = getLocalizedItemName(listing, lang) || String(listing?.itemName || '商品').trim() || '商品';
    const qty = Math.max(1, Number(listing?.quantity || 1));
    const unitPrice = Math.max(1, Number(listing?.unitPrice || 0));
    const value = `shopbuy_${listingId}`;
    const label = `${idx + 1}. ${itemName}`.slice(0, 100).trim();
    const description = localizeScriptOnly(`x${qty}｜單價 ${unitPrice} Rns｜下拉選購`, lang).slice(0, 100).trim();

    if (!listingId || !label || !description || value.length > 100 || seenValues.has(value)) {
      droppedInvalid += 1;
      continue;
    }

    seenValues.add(value);
    options.push({ label, description, value });
  }

  return {
    options,
    droppedInvalid
  };
}

async function showWorldShopBuyPanel(interaction, user, marketType = 'renaiss', notice = '', page = 0) {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await safeUpdatePanelInteraction(interaction, { content: '❌ 找不到角色！', components: [] }, 'showWorldShopBuyPanel:not_found');
    return;
  }
  const uiLang = getPlayerUILang(player);
  await deferPanelInteractionIfNeeded(interaction, 'showWorldShopBuyPanel');
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
  const marketRuleLine = safeMarket === 'digital'
    ? '⚠️ 神秘鑑價站規則：賣出牌價可能顯示九折，但實際入帳可能僅六折；成交品也可能只收到延後配送承諾。'
    : '✅ 公道鑑價站規則：賣出固定八折，牌價與入帳一致，成交品即時交付。';
  const listText = listings.length > 0
    ? listings.map((l, i) => buildMarketListingLine(l, pager.start + i, uiLang)).join('\n')
    : '（目前沒有可購買商品）';
  const { options: selectOptions, droppedInvalid: droppedInvalidOptions } = buildShopBuySelectOptions(listings, uiLang);
  const totalDroppedCorrupted = droppedCorrupted + droppedInvalidOptions;

  const embed = new EmbedBuilder()
    .setTitle(`🛒 商店可購買商品｜${getMarketTypeLabel(safeMarket)}`)
    .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
    .setDescription(
      `${notice ? `✅ ${notice}\n\n` : ''}` +
      `${listText}\n\n` +
      `${totalDroppedCorrupted > 0 ? `⚠️ 已略過 ${totalDroppedCorrupted} 筆異常賣單資料（請賣家重新掛單）。\n` : ''}` +
      `頁數：${pager.page + 1}/${pager.totalPages}｜總筆數：${pager.total}\n` +
      `回血水晶：${SHOP_HEAL_CRYSTAL_COST} Rns（恢復氣血）\n` +
      `回能水晶：${SHOP_ENERGY_CRYSTAL_COST} Rns（恢復能量）\n` +
      `加成點數：花費 200 Rns 可獲得 +1 點。\n` +
      `傳送裝置：${TELEPORT_DEVICE_COST} Rns（同島瞬移，單顆效期 ${TELEPORT_DEVICE_DURATION_HOURS}h，每次消耗 1 顆）\n` +
      `目前可用：${stockInfo.count} 顆${stockInfo.count > 0 ? `（最早到期：${formatTeleportDeviceRemaining(stockInfo.soonestRemainingMs)}）` : ''}\n` +
      `${marketRuleLine}`
    );

  const rows = [];
  if (selectOptions.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`shop_buy_select_${safeMarket}`)
      .setPlaceholder('下拉選擇要購買的商品')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(selectOptions);
    rows.push(new ActionRowBuilder().addComponents(select));
  } else if (listings.length > 0 && droppedInvalidOptions > 0) {
    console.error(`[Shop] buy panel dropped ${droppedInvalidOptions} invalid select options in ${safeMarket} market`);
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
      .setCustomId(
        pager.page <= 0
          ? `shop_buy_prev_disabled_${safeMarket}_${pager.page}`
          : `shop_buy_${safeMarket}_${Math.max(0, pager.page - 1)}`
      )
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page <= 0),
    new ButtonBuilder()
      .setCustomId(
        pager.page >= pager.totalPages - 1
          ? `shop_buy_next_disabled_${safeMarket}_${pager.page}`
          : `shop_buy_${safeMarket}_${Math.min(pager.totalPages - 1, pager.page + 1)}`
      )
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pager.page >= pager.totalPages - 1),
    new ButtonBuilder().setCustomId(`shop_open_${safeMarket}`).setLabel('🏪 返回商店').setStyle(ButtonStyle.Secondary)
  ));
  const sentMain = await safeUpdatePanelInteraction(
    interaction,
    { embeds: [embed], components: rows },
    'showWorldShopBuyPanel:main'
  );
  if (!sentMain) {
    console.error('[Shop] show buy panel update failed: fallback mode');
    const fallbackRows = rows.filter((row, idx) => idx !== 0); // 下拉選單失敗時保留功能按鈕
    const fallbackEmbed = new EmbedBuilder()
      .setTitle(`🛒 商店可購買商品｜${getMarketTypeLabel(safeMarket)}`)
      .setColor(safeMarket === 'digital' ? 0x9333ea : 0x0ea5e9)
      .setDescription(
        `⚠️ 賣單清單載入失敗，請稍後再試。\n\n` +
        `${notice ? `提示：${notice}\n` : ''}` +
        `你仍可使用下方按鈕購買水晶、點數與傳送裝置。`
      );
    await safeUpdatePanelInteraction(interaction, { embeds: [fallbackEmbed], components: fallbackRows }, 'showWorldShopBuyPanel:fallback');
  }
}

async function showWorldShopScene(interaction, user, marketType = 'renaiss', notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await safeUpdatePanelInteraction(interaction, { content: '❌ 找不到角色！', components: [] }, 'showWorldShopScene:not_found');
    return;
  }
  await deferPanelInteractionIfNeeded(interaction, 'showWorldShopScene');
  ECON.ensurePlayerEconomy(player);
  const safeMarket = marketType === 'digital' ? 'digital' : 'renaiss';
  const bossName = safeMarket === 'digital' ? '摩爾・Digital鑑價員' : '艾洛・Renaiss鑑價員';
  const bossTone = safeMarket === 'digital'
    ? '老闆眼神很熱情，但每句話都像在試探你的底線。'
    : '老闆把估值表攤在你面前，強調透明與長期信任。';
  const pricingRule = safeMarket === 'digital'
    ? '⚠️ 神秘站對外牌價常寫九折，但實際結算可能僅六折；配送承諾也未必兌現。'
    : '✅ 公道站賣出固定八折，顯示與實收一致。';
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
      `${pricingRule}\n` +
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
  await safeUpdatePanelInteraction(interaction, { embeds: [embed], components: [row1, row2] }, 'showWorldShopScene:main');
}

// ============== 行囊/背包 ==============
function getPlayerEquipmentSummary(player = null, uiLang = 'zh-TW') {
  const eqTx = getEquipmentText(uiLang);
  const activePetId = String(player?.activePetId || '').trim();
  const equipment = FUSION.getPetEquipmentSlots(player, activePetId, { ensure: false });
  const bagCount = Array.isArray(player?.equipmentBag) ? player.equipmentBag.length : 0;
  const slotLines = FUSION.EQUIPMENT_SLOTS.map((slot) => {
    const item = equipment?.[slot];
    if (!item || typeof item !== 'object') {
      return `• ${getFusionSlotLabel(slot, uiLang)}：${eqTx.notEquipped || '未裝備'}`;
    }
    const stats = item.stats && typeof item.stats === 'object' ? item.stats : {};
    const statText = formatEquipmentStatText(slot, stats);
    const displayName = getLocalizedItemName(item, uiLang) || String(item.name || eqTx.unnamedGear || '未命名裝備');
    return `• ${getFusionSlotLabel(slot, uiLang)}：${getFusionRarityLabel(item.rarity)} ${displayName}｜${statText}`;
  });
  const bonus = FUSION.getEquippedBonuses(player, activePetId);
  return {
    slotText: slotLines.join('\n'),
    totalText: `${eqTx.totalBonus || '總加成'}：ATK +${Math.floor(Number(bonus.attack || 0))}｜HP +${Math.floor(Number(bonus.hp || 0))}｜DEF +${Math.floor(Number(bonus.defense || 0))}｜SPD +${Math.floor(Number(bonus.speed || 0))}`,
    bagCount
  };
}

function normalizeInventoryViewMode(raw = '') {
  const text = String(raw || '').trim().toLowerCase();
  if (text === 'goods' || text === 'trade' || text === 'tradegoods') return 'goods';
  if (text === 'equipment' || text === 'equip') return 'equipment';
  return 'items';
}

function getInventoryText(uiLang = 'zh-TW') {
  const base = getPlayerPanelText('zh-TW')?.inventory || {};
  const localized = getPlayerPanelText(uiLang)?.inventory || {};
  return { ...base, ...localized };
}

function getEquipmentText(uiLang = 'zh-TW') {
  const base = getPlayerPanelText('zh-TW')?.equipment || {};
  const localized = getPlayerPanelText(uiLang)?.equipment || {};
  return { ...base, ...localized };
}

function getInventoryViewLabel(view = 'items', uiLang = 'zh-TW') {
  const safeView = normalizeInventoryViewMode(view);
  const invTx = getInventoryText(uiLang);
  if (safeView === 'goods') return invTx.tabGoods;
  if (safeView === 'equipment') return invTx.tabEquipment;
  return invTx.tabItems;
}

function buildEquipmentBagLine(item = null, index = 0, uiLang = 'zh-TW') {
  const eqTx = getEquipmentText(uiLang);
  if (!item || typeof item !== 'object') return '';
  const slot = String(item?.slot || '').trim();
  if (!FUSION.EQUIPMENT_SLOTS.includes(slot)) return '';
  const rarity = getFusionRarityLabel(item.rarity);
  const name = String(getLocalizedItemName(item, uiLang) || item.name || eqTx.unnamedGear || '未命名裝備').trim() || (eqTx.unnamedGear || '未命名裝備');
  const stats = item.stats && typeof item.stats === 'object' ? item.stats : {};
  const statText = formatEquipmentStatText(slot, stats);
  const value = Math.max(0, Number(item.value || 0));
  return `${index + 1}. 【${getFusionSlotLabel(slot, uiLang)}】${rarity} ${name}｜${statText}｜${eqTx.estimateLabel || '估值'} ${value}`;
}

function getFusionCandidates(player = null, uiLang = 'zh-TW') {
  const invTx = getInventoryText(uiLang);
  const sourceLabelInventory = invTx.sourceLabelInventory || '背包';
  const sourceLabelGoods = invTx.sourceLabelGoods || '藏品';
  const out = [];
  const inventory = Array.isArray(player?.inventory) ? player.inventory : [];
  const tradeGoods = Array.isArray(player?.tradeGoods) ? player.tradeGoods : [];

  for (let i = 0; i < inventory.length; i += 1) {
    const name = String(inventory[i] || '').trim();
    if (!name) continue;
    if (FUSION_BLOCKED_ITEMS.has(name)) continue;
    if (isSkillChipItemName(name)) continue;
    const refValue = Math.max(20, Math.floor(Number(estimateStoryReferencePriceByName(name) || 20)));
    const displayName = getLocalizedItemName(name, uiLang) || name;
    out.push({
      token: `iv_${i}`,
      source: 'inventory',
      sourceLabel: sourceLabelInventory,
      name,
      displayName,
      value: refValue,
      inventoryIndex: i
    });
  }

  for (const good of tradeGoods) {
    const id = String(good?.id || '').trim();
    const name = String(good?.name || getLocalizedItemName(good, 'zh-TW') || '').trim();
    if (!id || !name) continue;
    const rarity = String(good?.rarity || '普通').trim();
    const value = Math.max(20, Math.floor(Number(good?.value || estimateStoryReferencePriceByName(name) || 20)));
    const displayName = getLocalizedItemName(good, uiLang) || getLocalizedItemName(name, uiLang) || name;
    out.push({
      token: `tg_${id}`,
      source: 'tradeGoods',
      sourceLabel: sourceLabelGoods,
      name,
      names: good?.names,
      descs: good?.descs,
      displayName,
      value,
      rarity,
      tradeGoodId: id
    });
  }

  out.sort((a, b) => {
    const byValue = Number(b.value || 0) - Number(a.value || 0);
    if (byValue !== 0) return byValue;
    return String(a.displayName || a.name || '').localeCompare(String(b.displayName || b.name || ''), 'zh-Hant');
  });
  return out;
}

function pruneEmptyTradeGoodsEntries(player = null) {
  if (!player || !Array.isArray(player.tradeGoods)) return false;
  const before = player.tradeGoods.length;
  player.tradeGoods = player.tradeGoods.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    return Object.keys(row).length > 0;
  });
  return player.tradeGoods.length !== before;
}

function getInventoryFusionDraftTokens(player = null) {
  if (!player || typeof player !== 'object') return [];
  const draft = player.pendingFusionDraft && typeof player.pendingFusionDraft === 'object'
    ? player.pendingFusionDraft
    : null;
  if (!draft || !Array.isArray(draft.tokens)) return [];
  return Array.from(new Set(draft.tokens.map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 3);
}

function setInventoryFusionDraftTokens(player = null, tokens = []) {
  if (!player || typeof player !== 'object') return false;
  const nextTokens = Array.from(new Set((Array.isArray(tokens) ? tokens : []).map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 3);
  if (nextTokens.length <= 0) {
    if (player.pendingFusionDraft) {
      delete player.pendingFusionDraft;
      return true;
    }
    return false;
  }
  const prev = getInventoryFusionDraftTokens(player);
  const same = prev.length === nextTokens.length && prev.every((v, idx) => v === nextTokens[idx]);
  if (same && player.pendingFusionDraft && typeof player.pendingFusionDraft === 'object') return false;
  player.pendingFusionDraft = {
    tokens: nextTokens,
    updatedAt: Date.now()
  };
  return true;
}

function clearInventoryFusionDraft(player = null) {
  if (!player || typeof player !== 'object') return false;
  if (!player.pendingFusionDraft) return false;
  delete player.pendingFusionDraft;
  return true;
}

function getValidatedFusionDraftTokens(player = null, candidates = []) {
  const draftTokens = getInventoryFusionDraftTokens(player);
  if (draftTokens.length <= 0) return [];
  const tokenSet = new Set((Array.isArray(candidates) ? candidates : []).map((row) => String(row?.token || '').trim()).filter(Boolean));
  return draftTokens.filter((token) => tokenSet.has(token)).slice(0, 3);
}

function buildFusionProgressBar(step = 1, total = 4) {
  const safeTotal = Math.max(1, Number(total || 4));
  const safeStep = Math.max(0, Math.min(safeTotal, Number(step || 0)));
  let out = '';
  for (let i = 1; i <= safeTotal; i += 1) {
    out += i <= safeStep ? '🟩' : '⬜';
  }
  return out;
}

function buildFusionProgressEmbed(names = [], step = 1, total = 4, title = '⚙️ 融合進行中', detail = '') {
  const selected = Array.isArray(names) && names.length > 0 ? names.join(' + ') : '（未選定）';
  const safeTotal = Math.max(1, Number(total || 4));
  const safeStep = Math.max(0, Math.min(safeTotal, Number(step || 0)));
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x7c3aed)
    .setDescription(
      `進度：${buildFusionProgressBar(safeStep, safeTotal)}（${safeStep}/${safeTotal}）\n` +
      `素材：${selected}\n` +
      `${detail || '鍛造核心正在運算中...'}`
    );
}

function waitMs(ms = 300) {
  const safe = Math.max(0, Number(ms || 0));
  return new Promise((resolve) => setTimeout(resolve, safe));
}

function consumeFusionMaterials(player, picks = []) {
  const removed = [];
  const tradeIds = new Set();
  const invIndexes = [];
  for (const pick of picks) {
    if (pick?.source === 'tradeGoods' && pick?.tradeGoodId) tradeIds.add(String(pick.tradeGoodId));
    if (pick?.source === 'inventory') invIndexes.push(Number(pick.inventoryIndex));
  }

  if (tradeIds.size > 0 && Array.isArray(player.tradeGoods)) {
    player.tradeGoods = player.tradeGoods.filter((good) => {
      const id = String(good?.id || '').trim();
      if (!id || !tradeIds.has(id)) return true;
      removed.push({
        name: String(good?.name || '未命名藏品'),
        names: good?.names && typeof good.names === 'object' ? good.names : null,
        descs: good?.descs && typeof good.descs === 'object' ? good.descs : null,
        value: Math.max(20, Math.floor(Number(good?.value || 20))),
        source: 'tradeGoods'
      });
      tradeIds.delete(id);
      return false;
    });
  }

  if (Array.isArray(player.inventory) && invIndexes.length > 0) {
    const sorted = Array.from(new Set(invIndexes))
      .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < player.inventory.length)
      .sort((a, b) => b - a);
    for (const idx of sorted) {
      const raw = player.inventory[idx];
      const name = String(raw || '').trim();
      if (!name || isSkillChipItemName(name) || FUSION_BLOCKED_ITEMS.has(name)) continue;
      player.inventory.splice(idx, 1);
      removed.push({
        name,
        names: null,
        descs: null,
        value: Math.max(20, Math.floor(Number(estimateStoryReferencePriceByName(name) || 20))),
        source: 'inventory'
      });
    }
  }

  return removed.slice(0, 3);
}

async function showInventoryFusionLab(interaction, user, page = 0, notice = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: '❌ 找不到角色！', components: [] });
    return;
  }
  const uiLang = getPlayerUILang(player);
  const economyChanged = ECON.ensurePlayerEconomy(player);

  const pruned = pruneEmptyTradeGoodsEntries(player);
  const changed = FUSION.ensurePlayerEquipmentState(player);
  const candidates = getFusionCandidates(player, uiLang);
  const validDraftTokens = getValidatedFusionDraftTokens(player, candidates);
  const draftChanged = setInventoryFusionDraftTokens(player, validDraftTokens);
  if (economyChanged || pruned || changed || draftChanged) CORE.savePlayer(player);

  if (candidates.length < 3) {
    const embed = new EmbedBuilder()
      .setTitle('🧪 寶物融合台')
      .setColor(0x7c3aed)
      .setDescription(
        `${notice ? `✅ ${notice}\n\n` : ''}` +
        `可融合藏品不足，目前可用 **${candidates.length}** 件（需要至少 3 件）。\n` +
        `規則：不可放入技能晶片。`
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
    );
    await updateInteractionMessage(interaction, { embeds: [embed], components: [row] });
    return;
  }

  const pager = paginateList(candidates, page, 20);
  const safePage = Math.max(0, Number(pager?.page || 0));
  const draftTokenSet = new Set(validDraftTokens);
  const byToken = new Map(candidates.map((row) => [String(row?.token || '').trim(), row]));
  const draftRows = validDraftTokens.map((token) => byToken.get(token)).filter(Boolean);
  const draftSummary = draftRows.length > 0
    ? draftRows.map((row) => `• ${String(row?.displayName || row?.name || '未命名藏品')}`).join('\n')
    : '（尚未選擇）';
  const options = (Array.isArray(pager?.items) ? pager.items : []).slice(0, 25).map((row, idx) => {
    const rarityMark = row?.rarity ? `｜${String(row.rarity)}` : '';
    const displayName = String(row?.displayName || row?.name || '未命名藏品');
    return {
      label: `${idx + 1}. ${displayName}`.slice(0, 100),
      description: `${row.sourceLabel}${rarityMark}｜估值 ${Math.max(1, Number(row.value || 1))} Rns`.slice(0, 100),
      value: String(row.token || '').slice(0, 100),
      default: draftTokenSet.has(String(row.token || '').trim())
    };
  });

  const embed = new EmbedBuilder()
    .setTitle(`🧪 寶物融合台（第 ${safePage + 1}/${Math.max(1, Number(pager?.totalPages || 1))} 頁）`)
    .setColor(0x7c3aed)
    .setDescription(
      `${notice ? `✅ ${notice}\n\n` : ''}` +
      `請一次選擇 **3 件藏品** 進行融合。\n` +
      `融合結果會生成裝備（頭盔/盔甲/腰帶/鞋子），並由 AI 決定名稱、稀有度與價值。\n` +
      `目前候選：${candidates.length} 件（技能晶片已自動排除）\n\n` +
      `已選擇：**${draftRows.length}/3**\n${draftSummary}`
    );

  const rowSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`inv_fusion_pick_${safePage}`)
      .setPlaceholder('選擇 3 件藏品融合')
      .setMinValues(1)
      .setMaxValues(3)
      .addOptions(options)
  );
  const rowPage = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`inv_fusion_page_prev_${safePage}`)
      .setLabel('⬅️ 上一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`inv_fusion_page_next_${safePage}`)
      .setLabel('➡️ 下一頁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= Math.max(1, Number(pager?.totalPages || 1)) - 1)
  );
  const rowAction = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`inv_fusion_confirm_${safePage}`)
      .setLabel('🧪 開始融合')
      .setStyle(ButtonStyle.Success)
      .setDisabled(draftRows.length !== 3),
    new ButtonBuilder()
      .setCustomId(`inv_fusion_clear_${safePage}`)
      .setLabel('🧹 清除選材')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(draftRows.length <= 0)
  );
  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('show_inventory').setLabel('🎒 返回背包').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Secondary)
  );
  await updateInteractionMessage(interaction, { embeds: [embed], components: [rowSelect, rowPage, rowAction, rowBack] });
}

async function handleInventoryFusionSelect(interaction, user, customId = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
    return;
  }
  const uiLang = getPlayerUILang(player);
  const economyChanged = ECON.ensurePlayerEconomy(player);
  const pruned = pruneEmptyTradeGoodsEntries(player);
  const changed = FUSION.ensurePlayerEquipmentState(player);
  if (economyChanged || pruned || changed) CORE.savePlayer(player);

  const currentPage = Math.max(0, Number(String(customId || '').split('_').pop() || 0));
  const selectedTokens = Array.isArray(interaction.values) ? interaction.values.map((v) => String(v || '').trim()).filter(Boolean) : [];
  const uniqueTokens = Array.from(new Set(selectedTokens));
  if (uniqueTokens.length < 1 || uniqueTokens.length > 3) {
    await interaction.reply({ content: '⚠️ 請選擇 1~3 件藏品，並湊滿 3 件後按「開始融合」。', ephemeral: true }).catch(() => {});
    return;
  }

  const candidates = getFusionCandidates(player, uiLang);
  const byToken = new Map(candidates.map((row) => [String(row.token || ''), row]));
  const picks = uniqueTokens.map((token) => byToken.get(token)).filter(Boolean);
  if (picks.length !== uniqueTokens.length) {
    await interaction.reply({ content: '⚠️ 有藏品已不存在，請重新選擇。', ephemeral: true }).catch(() => {});
    return;
  }
  if (picks.some((row) => isSkillChipItemName(row?.name || ''))) {
    await interaction.reply({ content: '⚠️ 技能晶片不可融合。', ephemeral: true }).catch(() => {});
    return;
  }

  setInventoryFusionDraftTokens(player, uniqueTokens);
  CORE.savePlayer(player);
  const pickedNames = picks.map((row) => String(row?.displayName || row?.name || '未命名藏品')).join(' + ');
  const notice = uniqueTokens.length === 3
    ? `已選定 3 件藏品：${pickedNames}\n請按「🧪 開始融合」。`
    : `目前已選 ${uniqueTokens.length}/3：${pickedNames}`;
  await showInventoryFusionLab(interaction, user, currentPage, notice);
}

async function handleInventoryFusionClear(interaction, user, customId = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
    return;
  }
  const currentPage = Math.max(0, Number(String(customId || '').split('_').pop() || 0));
  const pruned = pruneEmptyTradeGoodsEntries(player);
  const changed = clearInventoryFusionDraft(player);
  if (pruned || changed) CORE.savePlayer(player);
  await showInventoryFusionLab(interaction, user, currentPage, changed ? '已清除選材。' : '目前沒有已選藏品。');
}

async function handleInventoryFusionConfirm(interaction, user, customId = '') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await interaction.reply({ content: '❌ 找不到角色！', ephemeral: true }).catch(() => {});
    return;
  }
  const uiLang = getPlayerUILang(player);
  const economyChanged = ECON.ensurePlayerEconomy(player);
  const pruned = pruneEmptyTradeGoodsEntries(player);
  const changed = FUSION.ensurePlayerEquipmentState(player);
  if (economyChanged || pruned || changed) CORE.savePlayer(player);
  const currentPage = Math.max(0, Number(String(customId || '').split('_').pop() || 0));
  const candidates = getFusionCandidates(player, uiLang);
  const byToken = new Map(candidates.map((row) => [String(row?.token || '').trim(), row]));
  const draftTokens = getValidatedFusionDraftTokens(player, candidates);
  if (draftTokens.length !== 3) {
    await showInventoryFusionLab(interaction, user, currentPage, '請先選滿 3 件藏品，再按「開始融合」。');
    return;
  }
  const picks = draftTokens.map((token) => byToken.get(token)).filter(Boolean);
  if (picks.length !== 3) {
    await showInventoryFusionLab(interaction, user, currentPage, '有藏品已變動，請重新選擇。');
    return;
  }
  if (picks.some((row) => isSkillChipItemName(row?.name || ''))) {
    await interaction.reply({ content: '⚠️ 技能晶片不可融合。', ephemeral: true }).catch(() => {});
    return;
  }

  await interaction.deferUpdate().catch(() => {});
  const selectedNames = picks.map((row) => String(row?.displayName || row?.name || '未命名藏品'));
  await updateInteractionMessage(interaction, {
    embeds: [buildFusionProgressEmbed(selectedNames, 1, 4, '⚙️ 融合進行中', '正在校準封存艙與紋理資訊...')],
    components: []
  });
  await waitMs(380);
  await updateInteractionMessage(interaction, {
    embeds: [buildFusionProgressEmbed(selectedNames, 2, 4, '🧬 融合進行中', '正在重構材質結構與屬性映射...')],
    components: []
  });
  await waitMs(380);
  await updateInteractionMessage(interaction, {
    embeds: [buildFusionProgressEmbed(selectedNames, 3, 4, '🔥 融合進行中', '正在生成裝備名稱、稀有度與詞條...')],
    components: []
  });

  let fused = null;
  try {
    const fusionInput = picks.map((row) => ({
      name: String(row?.name || '未知藏品'),
      names: row?.names && typeof row.names === 'object' ? row.names : null,
      value: Math.max(1, Math.floor(Number(row?.value || 1))),
      source: String(row?.source || 'inventory')
    }));
    fused = await FUSION.fuseTreasuresToEquipment(fusionInput, {
      playerName: String(player?.name || user.username || '旅人'),
      location: String(player?.location || '未知地點'),
      lang: uiLang
    });
  } catch (err) {
    const reason = String(err?.message || err || 'fusion failed').slice(0, 180);
    await showInventoryFusionLab(interaction, user, currentPage, `融合失敗：${reason}`);
    return;
  }

  const consumed = consumeFusionMaterials(player, picks);
  if (consumed.length !== 3) {
    await showInventoryFusionLab(interaction, user, currentPage, '融合失敗：藏品狀態已變動，請重試。');
    return;
  }

  const equipment = fused?.equipment;
  if (!equipment || typeof equipment !== 'object') {
    await showInventoryFusionLab(interaction, user, currentPage, '融合失敗：鍛造核心沒有返回有效裝備。');
    return;
  }

  const equipResult = FUSION.addEquipmentToPlayer(player, equipment);
  clearInventoryFusionDraft(player);
  CORE.savePlayer(player);

  const stats = equipment.stats && typeof equipment.stats === 'object' ? equipment.stats : {};
  const statText = formatEquipmentStatText(equipment.slot, stats);
  const sourceText = consumed.map((row) => String(getLocalizedItemName(row, uiLang) || row?.name || '未知藏品')).join(' + ');
  const equipNotice = equipResult?.equipped
    ? `已自動裝備到 ${getFusionSlotLabel(equipment.slot)}`
    : `已放入裝備背包（${getFusionSlotLabel(equipment.slot)}）`;
  const replaceNotice = equipResult?.replaced
    ? `｜替換：${String(getLocalizedItemName(equipResult.replaced, uiLang) || equipResult.replaced?.name || '舊裝備')}`
    : '';
  const equipmentName = getLocalizedItemName(equipment, uiLang) || equipment.name || '未命名裝備';
  await showInventory(
    interaction,
    user,
    0,
    `鍛造完成：${getFusionRarityLabel(equipment.rarity)}「${equipmentName}」｜${statText}\n藏品：${sourceText}\n${equipNotice}${replaceNotice}`,
    'equipment'
  );
}

async function showInventory(interaction, user, page = 0, notice = '', viewMode = 'items') {
  const player = CORE.loadPlayer(user.id);
  if (!player) {
    await updateInteractionMessage(interaction, { content: getInventoryText('zh-TW').notFoundPlayer, components: [] });
    return;
  }
  const uiLang = getPlayerUILang(player);
  const invTx = getInventoryText(uiLang);
  const economyChanged = ECON.ensurePlayerEconomy(player);
  const pruned = pruneEmptyTradeGoodsEntries(player);
  const stateChanged = FUSION.ensurePlayerEquipmentState(player);
  if (economyChanged || pruned || stateChanged) CORE.savePlayer(player);

  const items = Array.isArray(player.inventory) ? player.inventory : [];
  const herbs = Array.isArray(player.herbs) ? player.herbs : [];
  const tradeGoods = Array.isArray(player.tradeGoods) ? player.tradeGoods : [];
  const equipmentBag = Array.isArray(player.equipmentBag) ? player.equipmentBag : [];
  const safeView = normalizeInventoryViewMode(viewMode);

  const itemLines = items.map((item, i) => `${i + 1}. ${getLocalizedItemName(item, uiLang) || String(item || '')}`);
  const herbLines = herbs.map((h, i) => `${i + 1}. ${getLocalizedItemName(h, uiLang) || String(h || '')}`);
  const goodLines = tradeGoods.map((g, i) =>
    `${i + 1}. ${getLocalizedItemName(g, uiLang) || String(g?.name || '未命名藏品')}` +
    `（${String(g?.rarity || '普通')}｜${Number(g?.value || 0)} Rns${getLocalizedItemDesc(g, uiLang) ? `｜${getLocalizedItemDesc(g, uiLang)}` : ''}）`
  );
  const equipmentBagLines = equipmentBag
    .map((row, i) => buildEquipmentBagLine(row, i, uiLang))
    .filter(Boolean);

  const itemPages = buildPagedFieldChunks(itemLines, 1000, invTx.empty);
  const herbPages = buildPagedFieldChunks(herbLines, 1000, invTx.empty);
  const goodsPages = buildPagedFieldChunks(goodLines, 1000, invTx.empty);
  const equipmentBagPages = buildPagedFieldChunks(equipmentBagLines, 1000, invTx.empty);

  let totalPages = 1;
  if (safeView === 'goods') {
    totalPages = Math.max(goodsPages.length, 1);
  } else if (safeView === 'equipment') {
    totalPages = Math.max(equipmentBagPages.length, 1);
  } else {
    totalPages = Math.max(itemPages.length, herbPages.length, 1);
  }
  const safePage = Math.max(0, Math.min(totalPages - 1, Number(page || 0)));
  const itemsList = itemPages[Math.min(safePage, itemPages.length - 1)] || invTx.empty;
  const herbsList = herbPages[Math.min(safePage, herbPages.length - 1)] || invTx.empty;
  const goodsList = goodsPages[Math.min(safePage, goodsPages.length - 1)] || invTx.empty;
  const equipmentBagList = equipmentBagPages[Math.min(safePage, equipmentBagPages.length - 1)] || invTx.empty;
  const equipmentInfo = getPlayerEquipmentSummary(player, uiLang);
  const fusionCandidates = getFusionCandidates(player, uiLang);

  const embed = new EmbedBuilder()
    .setTitle(invTx.bagTitle(player.name))
    .setColor(0x8B4513)
    .setDescription(
      `${notice ? `✅ ${notice}\n\n` : ''}` +
      `${invTx.pageLabel(getInventoryViewLabel(safeView, uiLang), safePage + 1, totalPages)}\n` +
      `${invTx.carrying}\n` +
      `${invTx.fusionReady(fusionCandidates.length)}`
    );

  if (safeView === 'goods') {
    embed
      .addFields({ name: invTx.goodsField(safePage + 1, totalPages), value: goodsList, inline: false })
      .addFields({ name: t('gold', uiLang), value: `${player.stats.財富} ${invTx.tokenUnit}`, inline: false });
  } else if (safeView === 'equipment') {
    embed
      .addFields({ name: invTx.equipWorn(equipmentInfo.bagCount), value: equipmentInfo.slotText, inline: false })
      .addFields({ name: invTx.equipBonus, value: equipmentInfo.totalText, inline: false })
      .addFields({ name: invTx.equipBag(safePage + 1, totalPages), value: equipmentBagList, inline: false })
      .addFields({ name: t('gold', uiLang), value: `${player.stats.財富} ${invTx.tokenUnit}`, inline: false });
  } else {
    embed
      .addFields(
        { name: invTx.itemField(safePage + 1, totalPages), value: itemsList, inline: true },
        { name: invTx.herbField(safePage + 1, totalPages), value: herbsList, inline: true }
      )
      .addFields({ name: t('gold', uiLang), value: `${player.stats.財富} ${invTx.tokenUnit}`, inline: false });
  }

  const rowTabs = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('inv_tab_items_0')
      .setLabel(invTx.tabItems)
      .setStyle(safeView === 'items' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(safeView === 'items'),
    new ButtonBuilder()
      .setCustomId('inv_tab_goods_0')
      .setLabel(invTx.tabGoods)
      .setStyle(safeView === 'goods' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(safeView === 'goods'),
    new ButtonBuilder()
      .setCustomId('inv_tab_equipment_0')
      .setLabel(invTx.tabEquipment)
      .setStyle(safeView === 'equipment' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(safeView === 'equipment')
  );

  const rowPage = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`inv_page_prev_${safeView}_${safePage}`)
      .setLabel(invTx.prevPage)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`inv_page_info_${safeView}_${safePage}`)
      .setLabel(`${safePage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`inv_page_next_${safeView}_${safePage}`)
      .setLabel(invTx.nextPage)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );
  const rowFusion = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('inv_fusion_open_0')
      .setLabel(invTx.fusionButton)
      .setStyle(ButtonStyle.Success)
      .setDisabled(fusionCandidates.length < 3)
  );
  const rowMain = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('main_menu').setLabel(t('back', uiLang)).setStyle(ButtonStyle.Primary)
  );

  await updateInteractionMessage(interaction, { embeds: [embed], components: [rowTabs, rowPage, rowFusion, rowMain] });
}

function getCodexLabels(uiLang = 'zh-TW') {
  const panelText = getPlayerPanelText(uiLang);
  const codex = panelText?.codex || {};
  if (codex && Object.keys(codex).length > 0) return codex;
  return getPlayerPanelText('zh-TW').codex || {};
}

function formatCodexLines(lines = [], maxLen = 1000, emptyText = '（尚無）') {
  const list = Array.isArray(lines)
    ? lines.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  if (list.length <= 0) return String(emptyText || '（尚無）');
  const limit = Math.max(80, Number(maxLen || 1000));
  let out = '';
  for (const line of list) {
    const next = out ? `${out}\n${line}` : line;
    if (next.length > limit) break;
    out = next;
  }
  return out || String(emptyText || '（尚無）');
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
    return `${idx + 1}. ${tierEmoji} ${getMoveLocalization(entry.id || '', entry.name || '', uiLang) || entry.name}${source}`;
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
    showInventoryFusionLab,
    handleInventoryFusionSelect,
    handleInventoryFusionConfirm,
    handleInventoryFusionClear,
    showPetEquipmentView,
    handlePetEquipmentEquipSelect,
    handlePetEquipmentUnequipSelect,
    collectPlayerCodexData,
    showPlayerCodex,
    showNpcCodex,
    showSkillCodex
  };
}

module.exports = {
  createPlayerPanelUtils
};
