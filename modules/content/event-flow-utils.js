const {
  getLocationLootFlavorModifier,
  applyLocationFlavorToTradeGood
} = require('./location-playstyle');

function createEventFlowUtils(deps = {}) {
  const {
    CORE,
    MAIN_STORY,
    EVENTS,
    PET,
    ECON,
    isImmediateBattleChoice = () => false,
    PET_PASSIVE_HEAL_PER_STORY_TURN = 10
  } = deps;

  function rememberPlayer(player, memory) {
    if (!player || !memory || !memory.content) return;
    const tags = Array.isArray(memory.tags) ? memory.tags.map((t) => String(t || '').trim().toLowerCase()) : [];
    const type = String(memory.type || '').trim();
    const content = String(memory.content || '').trim();
    const outcome = String(memory.outcome || '').trim();
    const merged = `${type} ${content} ${outcome}`.toLowerCase();
    if (tags.includes('friend_duel') || type.includes('好友友誼戰') || merged.includes('friend_duel') || merged.includes('好友友誼戰')) {
      return;
    }
    CORE.appendPlayerMemory(player, memory);
  }

  function applyMainStoryCombatProgress(player, enemyName, victory = false) {
    if (!player || typeof MAIN_STORY.recordCombatOutcome !== 'function') return '';
    const progress = MAIN_STORY.recordCombatOutcome(player, { enemyName, victory });
    if (!progress) return '';
    if (progress.announcement) {
      EVENTS.addWorldEvent(progress.announcement, 'main_story');
    }
    if (progress.memory) {
      rememberPlayer(player, {
        type: '主線',
        content: progress.memory,
        importance: 3,
        tags: ['main_story', 'combat_progress']
      });
    }
    return String(progress.appendText || '').trim();
  }

  async function notifyStoryBusy(interaction) {
    if (!interaction) return;
    const msg = '⏳ 正在生成故事中，請等這一輪完成再操作。';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }

  function shouldTriggerBattle(event, result) {
    if (!event) return false;
    if (result?.type === 'combat') return true;
    if (String(event?.action || '') === 'mentor_spar') return false;
    return isImmediateBattleChoice(event);
  }

  function applyPassivePetRecovery(pet, amount = PET_PASSIVE_HEAL_PER_STORY_TURN) {
    if (!pet || typeof pet !== 'object') return 0;
    const heal = Math.max(0, Math.floor(Number(amount) || 0));
    if (heal <= 0) return 0;
    const status = String(pet.status || '').trim();
    if (status === '蛋' || status === '死亡' || status === '休眠') return 0;
    const maxHp = Math.max(1, Number(pet.maxHp || 0));
    const currentHp = Math.max(0, Number(pet.hp || 0));
    if (maxHp <= 0 || currentHp <= 0 || currentHp >= maxHp) return 0;
    const nextHp = Math.min(maxHp, currentHp + heal);
    const gained = Math.max(0, nextHp - currentHp);
    if (gained > 0) pet.hp = nextHp;
    return gained;
  }

  function applyPetRecoveryTurnTick(pet, turns = 1) {
    if (!pet || typeof pet !== 'object') {
      return { revived: false, changed: false, remainingTurns: 0 };
    }
    if (typeof PET.advancePetRecoveryTurns === 'function') {
      const result = PET.advancePetRecoveryTurns(pet, turns) || {};
      return {
        revived: Boolean(result.revived),
        changed: Boolean(result.changed),
        remainingTurns: Math.max(0, Number(result.remainingTurns || 0))
      };
    }
    if (typeof PET.syncPetRecovery === 'function') {
      const synced = PET.syncPetRecovery(pet) || {};
      return {
        revived: Boolean(synced.revived),
        changed: Boolean(synced.changed),
        remainingTurns: 0
      };
    }
    return { revived: false, changed: false, remainingTurns: 0 };
  }

  function rollByChance(chance = 0) {
    const safeChance = Math.max(0, Math.min(0.99, Number(chance || 0)));
    return Math.random() < safeChance;
  }

  async function maybeGenerateTradeGoodFromChoice(event, player, result, selectedChoice) {
    if (!player || !event || !result || result.success === false || !ECON) return null;
    const text = [
      event.tag || '',
      event.name || '',
      selectedChoice || '',
      event.choice || '',
      event.desc || ''
    ].join(' ');
    const luck = Number(player?.stats?.運氣 || 50);
    const location = player.location || '未知地點';
    const action = String(event.action || '');

    const herbHint = /採|草藥|藥草|靈草|植物|香氣|花/.test(text);
    const huntHint = /狩獵|打獵|追獵|獵物|野獸|捕捉|河魚|野兔|野雞|野豬|鹿/.test(text);
    const treasureHint = /礦|晶|寶|遺跡|寶藏|洞窟|礦洞|遺物|尋寶|探勘/.test(text);
    const investigateHint = /追查|線索|來源|流向|訪談|口供|追蹤|觀察|比對|複核|鑑識|查驗/.test(text);
    const appraisalHint = /鑑價|鑑定|真偽|攤位|商人|低價|可疑貨|贗品|封存艙|鑑價品|貨樣/.test(text);
    const plunderHint = /搶|搶奪|強奪|奪取|打倒|擊敗|搜刮|劫走|逼問|先發制人/.test(text);
    const storageHeistHint = /(封存[艙舱倉藏函]).{0,16}(搶|奪|撬開|撬开|打開|打开|開艙|开舱|私吞|佔為己有|占为己有)|((搶|奪|撬開|撬开|打開|打开|開艙|开舱|私吞|佔為己有|占为己有).{0,16}封存[艙舱倉藏函])/u.test(text);
    const highRewardHint = /高回報|高回报|戰利品|战利品|寶物|宝物|私吞|佔為己有|占为己有|撬開|撬开|開艙|开舱/.test(text);
    const actionResultType = String(result?.type || '');
    const locationFlavor = getLocationLootFlavorModifier(location, {
      action,
      text,
      resultType: actionResultType
    });
    const locationDropMultiplier = Math.max(0.75, Math.min(1.35, Number(locationFlavor?.dropChanceMultiplier || 1)));
    const dropRateBoost = (highRewardHint ? 1.22 : 1.0) * locationDropMultiplier;
    const finalizeLoot = (loot) => applyLocationFlavorToTradeGood(
      loot,
      location,
      { action, text, resultType: actionResultType }
    );

    if (action === 'forage' || herbHint) {
      const chance = (action === 'forage' ? 0.96 : 0.82) * dropRateBoost;
      if (rollByChance(chance)) {
        return finalizeLoot(await ECON.createForageLoot(location, luck, { lang: player?.language || 'zh-TW' }));
      }
    }
    if (action === 'hunt' || huntHint) {
      const chance = (action === 'hunt' ? 0.95 : 0.82) * dropRateBoost;
      if (rollByChance(chance)) {
        const animalName = result?.item || event?.animal?.name || '獵物';
        return finalizeLoot(await ECON.createHuntLoot(animalName, location, luck, { lang: player?.language || 'zh-TW' }));
      }
    }
    if (action === 'treasure' || treasureHint) {
      const chance = (action === 'treasure' ? 0.88 : 0.62) * dropRateBoost;
      if (rollByChance(chance)) {
        return finalizeLoot(await ECON.createTreasureLoot(location, luck, { lang: player?.language || 'zh-TW' }));
      }
    }
    if ((action === 'fight' || action === 'location_story_battle' || plunderHint) && storageHeistHint) {
      // 封存艙強奪線：幾乎必掉「可交易戰利品」，讓高風險行動有明顯收益感。
      if (rollByChance(0.95)) {
        return finalizeLoot(await ECON.createTreasureLoot(location, luck, { lang: player?.language || 'zh-TW' }));
      }
    }
    if (action === 'fight' || action === 'location_story_battle' || plunderHint) {
      const chance = 0.82 * dropRateBoost;
      if (rollByChance(chance)) {
        if (Math.random() < 0.68) {
          return finalizeLoot(await ECON.createTreasureLoot(location, luck, { lang: player?.language || 'zh-TW' }));
        }
        return finalizeLoot(await ECON.createHuntLoot(
          result?.item || event?.name || '可疑貨樣',
          location,
          luck,
          { lang: player?.language || 'zh-TW' }
        ));
      }
    }
    if (action === 'main_story' || action === 'social' || action === 'trade' || investigateHint || appraisalHint) {
      const baseChance = appraisalHint ? 0.72 : 0.62;
      const chance = baseChance * dropRateBoost;
      if (rollByChance(chance)) {
        if (Math.random() < 0.62) {
          return finalizeLoot(await ECON.createTreasureLoot(location, luck, { lang: player?.language || 'zh-TW' }));
        }
        return finalizeLoot(await ECON.createForageLoot(location, luck, { lang: player?.language || 'zh-TW' }));
      }
    }
    if (action === 'explore') {
      const chance = 0.52 * dropRateBoost;
      if (rollByChance(chance)) {
        if (Math.random() < 0.72) {
          return finalizeLoot(await ECON.createTreasureLoot(location, luck, { lang: player?.language || 'zh-TW' }));
        }
        return finalizeLoot(await ECON.createForageLoot(location, luck, { lang: player?.language || 'zh-TW' }));
      }
    }
    return null;
  }

  return {
    rememberPlayer,
    applyMainStoryCombatProgress,
    notifyStoryBusy,
    shouldTriggerBattle,
    applyPassivePetRecovery,
    applyPetRecoveryTurnTick,
    maybeGenerateTradeGoodFromChoice
  };
}

module.exports = { createEventFlowUtils };
