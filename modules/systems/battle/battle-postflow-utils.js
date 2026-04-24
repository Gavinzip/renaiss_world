const EQUIP = require('../equipment/equipment-fusion-agent');

function createBattlePostflowUtils(deps = {}) {
  const CORE = deps.CORE;
  const PET = deps.PET;
  const EmbedBuilder = deps.EmbedBuilder;
  const ActionRowBuilder = deps.ActionRowBuilder;
  const ButtonBuilder = deps.ButtonBuilder;
  const ButtonStyle = deps.ButtonStyle;
  const sendBattleMessage = typeof deps.sendBattleMessage === 'function'
    ? deps.sendBattleMessage
    : (async () => {});
  const estimateBattleOutcome = typeof deps.estimateBattleOutcome === 'function'
    ? deps.estimateBattleOutcome
    : (() => ({ rank: '未知', winRate: 0 }));
  const rememberPlayer = typeof deps.rememberPlayer === 'function'
    ? deps.rememberPlayer
    : (() => {});
  const ensureBattleEnergyState = typeof deps.ensureBattleEnergyState === 'function'
    ? deps.ensureBattleEnergyState
    : (() => ({ energy: 2, turn: 1 }));
  const resolvePlayerMainPet = typeof deps.resolvePlayerMainPet === 'function'
    ? deps.resolvePlayerMainPet
    : ((_player, opts = {}) => ({ pet: opts.fallbackPet || null, changed: false }));
  const renderManualBattle = typeof deps.renderManualBattle === 'function'
    ? deps.renderManualBattle
    : (async () => {});
  const formatRecoveryTurnsShort = typeof deps.formatRecoveryTurnsShort === 'function'
    ? deps.formatRecoveryTurnsShort
    : ((v) => `${Number(v || 0)}回合`);
  const publishBattleWorldEvent = typeof deps.publishBattleWorldEvent === 'function'
    ? deps.publishBattleWorldEvent
    : (() => {});
  const getPlayerOwnedPets = typeof deps.getPlayerOwnedPets === 'function'
    ? deps.getPlayerOwnedPets
    : (() => []);
  const recordCashflow = typeof deps.recordCashflow === 'function'
    ? deps.recordCashflow
    : (() => {});
  const canPetFight = typeof deps.canPetFight === 'function'
    ? deps.canPetFight
    : (() => false);
  const getPlayerUILang = typeof deps.getPlayerUILang === 'function'
    ? deps.getPlayerUILang
    : ((player) => String(player?.language || 'zh-TW'));
  const getLanguageSection = typeof deps.getLanguageSection === 'function'
    ? deps.getLanguageSection
    : null;

  function getBattleText(lang = 'zh-TW') {
    let base = {};
    let localized = {};
    try {
      base = getLanguageSection ? (getLanguageSection('battleText', 'zh-TW') || {}) : {};
      localized = getLanguageSection ? (getLanguageSection('battleText', lang) || {}) : {};
    } catch {
      base = {};
      localized = {};
    }
    return { ...base, ...localized };
  }

  function pickRandomIndexes(total = 0, count = 0) {
    const max = Math.max(0, Math.floor(Number(total || 0)));
    const need = Math.max(0, Math.min(max, Math.floor(Number(count || 0))));
    const pool = Array.from({ length: max }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, need).sort((a, b) => b - a);
  }

  function isSkillChipItem(raw = '') {
    const text = String(raw || '').trim();
    if (!text) return false;
    return /^技能晶片[：:]/u.test(text) || /技能晶片/u.test(text);
  }

  function consumeBattleDefeatCompensation(player = null) {
    if (!player || typeof player !== 'object') {
      return { lines: ['⚠️ 無法套用戰敗懲罰（玩家資料不存在）'] };
    }
    const lines = [];
    const removed = { materials: [], chips: [], equipment: null };
    const targetFine = 1000;
    const currentGold = Math.max(0, Math.floor(Number(player?.stats?.財富 || 0)));
    const paid = Math.min(targetFine, currentGold);
    const remainingFine = Math.max(0, targetFine - paid);
    if (!player.stats || typeof player.stats !== 'object') player.stats = {};
    player.stats.財富 = Math.max(0, currentGold - paid);

    if (paid > 0) {
      lines.push(`💸 戰敗罰款：-${paid} Rns${remainingFine > 0 ? `（仍不足 ${remainingFine}）` : ''}`);
      recordCashflow(player, {
        amount: -paid,
        category: 'battle_total_defeat_penalty',
        source: '雙寵皆倒戰敗罰款'
      });
    } else {
      lines.push('💸 戰敗罰款：Rns 不足，改扣物資');
    }

    if (remainingFine <= 0) {
      return { lines, removed };
    }

    const herbs = Array.isArray(player.herbs) ? player.herbs : [];
    const inventory = Array.isArray(player.inventory) ? player.inventory : [];
    if (!Array.isArray(player.herbs)) player.herbs = herbs;
    if (!Array.isArray(player.inventory)) player.inventory = inventory;
    const materialRefs = [];
    for (let i = 0; i < herbs.length; i++) {
      materialRefs.push({ source: 'herbs', idx: i, name: String(herbs[i] || '').trim() || '未知素材' });
    }
    for (let i = 0; i < inventory.length; i++) {
      const itemName = String(inventory[i] || '').trim();
      if (!itemName || isSkillChipItem(itemName)) continue;
      materialRefs.push({ source: 'inventory', idx: i, name: itemName });
    }

    if (materialRefs.length > 0) {
      const picked = pickRandomIndexes(materialRefs.length, 3).map((idx) => materialRefs[idx]).filter(Boolean);
      const bySource = { herbs: [], inventory: [] };
      for (const ref of picked) bySource[ref.source].push(ref);
      bySource.herbs.sort((a, b) => b.idx - a.idx);
      bySource.inventory.sort((a, b) => b.idx - a.idx);
      for (const ref of bySource.herbs) {
        const [drop] = herbs.splice(ref.idx, 1);
        removed.materials.push(String(drop || ref.name || '未知素材'));
      }
      for (const ref of bySource.inventory) {
        const [drop] = inventory.splice(ref.idx, 1);
        removed.materials.push(String(drop || ref.name || '未知素材'));
      }
      lines.push(`🧰 物資損失：${removed.materials.slice(0, 3).join('、')}`);
      return { lines, removed };
    }

    const chipRefs = [];
    for (let i = 0; i < inventory.length; i++) {
      const itemName = String(inventory[i] || '').trim();
      if (!itemName || !isSkillChipItem(itemName)) continue;
      chipRefs.push({ idx: i, name: itemName });
    }
    if (chipRefs.length > 0) {
      const picked = pickRandomIndexes(chipRefs.length, 5).map((idx) => chipRefs[idx]).filter(Boolean);
      picked.sort((a, b) => b.idx - a.idx);
      for (const ref of picked) {
        const [drop] = inventory.splice(ref.idx, 1);
        removed.chips.push(String(drop || ref.name || '技能晶片'));
      }
      lines.push(`📉 技能晶片遺失：${removed.chips.length} 枚`);
      return { lines, removed };
    }

    EQUIP.ensurePlayerEquipmentState(player);
    const allPets = getPlayerOwnedPets(String(player?.id || '').trim());
    const equippedRefs = [];
    for (const pet of allPets) {
      const petId = String(pet?.id || '').trim();
      if (!petId) continue;
      const slots = EQUIP.getPetEquipmentSlots(player, petId, { ensure: false });
      for (const [slot, item] of Object.entries(slots || {})) {
        if (!item || typeof item !== 'object') continue;
        equippedRefs.push({
          petId,
          petName: String(pet?.name || '未知寵物'),
          slot: String(slot || ''),
          itemName: String(item?.name || '').trim() || '未知裝備'
        });
      }
    }
    if (equippedRefs.length > 0) {
      const picked = equippedRefs[Math.floor(Math.random() * equippedRefs.length)];
      const slots = EQUIP.getPetEquipmentSlots(player, picked.petId, { ensure: true });
      if (slots && Object.prototype.hasOwnProperty.call(slots, picked.slot)) {
        slots[picked.slot] = null;
      }
      player.petEquipment = player.petEquipment || {};
      if (typeof player.activePetId === 'string' && picked.petId === String(player.activePetId || '').trim()) {
        player.equipment = EQUIP.getPetEquipmentSlots(player, picked.petId, { ensure: false });
      }
      removed.equipment = picked;
      lines.push(`🛡️ 裝備遺失：${picked.petName} 的 ${picked.itemName}`);
      return { lines, removed };
    }

    lines.push('⚠️ 已無可扣罰資產');
    return { lines, removed };
  }

  function isPetDeadForDefeat(pet = null) {
    if (!pet || typeof pet !== 'object') return true;
    const status = String(pet.status || '').trim();
    const hp = Math.max(0, Number(pet.hp || 0));
    return status === '死亡' || hp <= 0;
  }

  function resolveOwnedPetsForDefeatCheck(player = null, userId = '') {
    const ownerId = String(userId || player?.id || '').trim();
    const owned = getPlayerOwnedPets(ownerId);
    const pets = Array.isArray(owned) ? owned.filter(Boolean) : [];
    if (pets.length > 0) return pets;
    const fallback = ownerId && PET && typeof PET.loadPet === 'function'
      ? PET.loadPet(ownerId)
      : null;
    return fallback ? [fallback] : [];
  }

  async function showTrueGameOver(interaction, user, detailText, mode = 'update') {
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getBattleText(uiLang);
    const enemyName = String(player?.battleState?.enemy?.name || '敵人').trim();
    const pets = resolveOwnedPetsForDefeatCheck(player, user?.id);
    const allPetsDead = pets.length > 0
      ? pets.every((pet) => isPetDeadForDefeat(pet))
      : true;
    const anyPetUsable = pets.some((pet) => canPetFight(pet));

    if (player && allPetsDead) {
      publishBattleWorldEvent(
        player,
        enemyName,
        'player_down',
        String(detailText || '').replace(/\s+/g, ' ').slice(0, 120)
      );
    }
    if (player && typeof player === 'object') {
      player.battleState = null;
      CORE.savePlayer(player);
    }

    if (!allPetsDead) {
      const embed = new EmbedBuilder()
        .setTitle(tx.titleRoundDefeat || '⚠️ 本場敗退')
        .setColor(0xff9900)
        .setDescription(
          `${detailText}\n\n🏁 本局勝者：${enemyName}\n\n` +
          `${anyPetUsable
            ? (tx.roundDefeatUsablePets || '你還有可用寵物，未觸發全滅懲罰。\n請回主選單改派寵物再戰。')
            : (tx.roundDefeatNoUsablePets || '目前沒有可上場寵物，但未達全寵死亡判定。')}`
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_menu').setLabel(tx.continueButton || '📖 繼續').setStyle(ButtonStyle.Secondary)
      );
      await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, mode);
      return;
    }

    const penalty = consumeBattleDefeatCompensation(player);
    const embed = new EmbedBuilder()
      .setTitle(tx.titleTotalDefeat || '💀 全隊覆滅')
      .setColor(0xff0000)
      .setDescription(
        `${detailText}\n\n🏁 勝者：${enemyName}\n\n` +
        `${Array.isArray(penalty?.lines) && penalty.lines.length > 0 ? penalty.lines.join('\n') : '⚠️ 戰敗懲罰套用失敗'}\n\n` +
        `${tx.totalDefeatHint || '你還活著，請重新整隊後繼續冒險。'}`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('main_menu').setLabel(tx.continueButton || '📖 繼續').setStyle(ButtonStyle.Danger)
    );

    await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, mode);
  }

  async function showPetDefeatedTransition(interaction, player, pet, battleDetail = '', mode = 'update') {
    const uiLang = getPlayerUILang(player);
    const tx = getBattleText(uiLang);
    PET.markPetDefeated(pet, '戰鬥落敗');
    PET.savePet(pet);

    const remainTurns = typeof PET.getPetRecoveryRemainingTurns === 'function'
      ? Number(PET.getPetRecoveryRemainingTurns(pet) || 2)
      : 2;
    const enemyName = player?.battleState?.enemy?.name || '敵人';
    publishBattleWorldEvent(
      player,
      enemyName,
      'pet_down',
      typeof tx.petDownEvent === 'function'
        ? tx.petDownEvent(pet?.name || '夥伴', remainTurns)
        : `${pet?.name || '夥伴'}復活倒數 ${formatRecoveryTurnsShort(remainTurns)}`
    );
    player.battleState.fighter = 'player';
    player.battleState.mode = null;
    player.battleState.fleeAttempts = 0;
    rememberPlayer(player, {
      type: '戰鬥',
      content: `${pet.name} 被 ${enemyName} 擊倒`,
      outcome: '改由玩家親自接戰',
      importance: 3,
      tags: ['battle', 'pet_down']
    });
    CORE.savePlayer(player);

    const embed = new EmbedBuilder()
      .setTitle(tx.titlePetDown || '🐾 寵物陣亡')
      .setColor(0xff9900)
      .setDescription(typeof tx.petDownDesc === 'function'
        ? tx.petDownDesc({
          petName: pet.name,
          remain: remainTurns,
          enemyName,
          playerName: player.name,
          battleDetail: battleDetail ? String(battleDetail).slice(0, 1200) : ''
        })
        : `${pet.name} 在戰鬥中倒下了，將於 **${formatRecoveryTurnsShort(remainTurns)}** 後復活。\n\n🏁 本局勝者：${enemyName}\n你若還要硬戰，可以改由 **${player.name}** 親自上場（ATK 固定 10）。${battleDetail ? `\n\n📜 戰況回放：\n${String(battleDetail).slice(0, 1200)}` : ''}`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_continue_human').setLabel(tx.humanTakeoverButton || '🧍 我親自上場').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('main_menu').setLabel(tx.continueRetreatButton || '📖 繼續（先撤退）').setStyle(ButtonStyle.Secondary)
    );
    await sendBattleMessage(interaction, { embeds: [embed], content: null, components: [row] }, mode);
  }

  async function continueBattleWithHuman(interaction, user) {
    const player = CORE.loadPlayer(user.id);
    const uiLang = getPlayerUILang(player);
    const tx = getBattleText(uiLang);
    const fallbackPet = PET.loadPet(user.id);
    const petResolved = resolvePlayerMainPet(player, { preferBattle: true, fallbackPet });
    const pet = petResolved?.pet || fallbackPet;
    const enemy = player?.battleState?.enemy;
    if (!player || !pet || !enemy) {
      await interaction.update({ content: tx.noContinuableBattle || '❌ 找不到可續戰的戰鬥。', components: [] });
      return;
    }
    if (petResolved?.changed) CORE.savePlayer(player);

    player.battleState.fighter = 'player';
    player.battleState.mode = 'manual';
    player.battleState.fleeAttempts = 0;
    ensureBattleEnergyState(player);
    rememberPlayer(player, {
      type: '戰鬥',
      content: `改由 ${player.name} 親自上場`,
      outcome: `續戰 ${enemy.name}`,
      importance: 2,
      tags: ['battle', 'human_takeover']
    });
    CORE.savePlayer(player);

    const estimate = estimateBattleOutcome(player, pet, enemy, 'player');
    await renderManualBattle(
      interaction,
      player,
      pet,
      typeof tx.humanTakeoverNotice === 'function'
        ? tx.humanTakeoverNotice(pet.name, estimate.rank, Number(estimate.winRate || 0).toFixed(1))
        : `⚠️ ${pet.name} 尚未復活，由你本人接戰。\n勝率預估：${estimate.rank}（約 ${Number(estimate.winRate || 0).toFixed(1)}%）`
    );
  }

  return {
    showTrueGameOver,
    showPetDefeatedTransition,
    continueBattleWithHuman
  };
}

module.exports = { createBattlePostflowUtils };
