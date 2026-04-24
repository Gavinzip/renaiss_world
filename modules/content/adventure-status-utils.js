function createAdventureStatusUtils(deps = {}) {
  const {
    normalizeLangCode = (v) => v || 'zh-TW',
    formatPetHpWithRecovery = (pet) => `${Math.round(Number(pet?.hp || 0))}/${Math.round(Number(pet?.maxHp || 0))}`,
    getPetElementDisplayName = (v = '') => String(v || '未知屬性'),
    // Global language resource accessor (section-based).
    getLanguageSection = null,
    getLocationDisplayName = (v = '') => String(v || ''),
    getNpcDisplayName = (v = '') => String(v || ''),
    ISLAND_STORY = null,
    MAIN_STORY = null
  } = deps;

  function getAdventureText(lang = 'zh-TW') {
    const code = normalizeLangCode(lang);
    const fallbackMap = {
      'zh-TW': {
        statusLabel: '狀態',
        statusHp: '氣血',
        statusEnergy: '能量',
        statusCurrency: 'Rns 代幣',
        fieldPet: '🐾 寵物',
        fieldHp: '⚔️ 氣血',
        fieldCurrency: '💰 Rns 代幣',
        fieldLocation: '📍 位置',
        fieldLuck: '🌟 幸運',
        fieldWanted: '🚨 通緝級',
        mainlineDone: (location) => `📖 本區主線：已完成（${location}）`,
        mainlineProgress: (location) => `📖 本區主線：進行中（${location}）`,
        missionBoss: (done) => `｜關鍵任務：擊敗四巨頭全員（${done ? '已完成' : '未完成'}）`,
        missionNpc: (name, location, done) => `｜關鍵NPC：${name}@${location}（${done ? '已完成' : '未完成'}）`,
        sectionChoices: '🆕 選項',
        sectionNewChoices: '🆕 新選項',
        chooseNumber: (max) => `請選擇編號（1-${max}）`,
        sectionWorldEvents: '📢 世界事件',
        lastChoice: '📍 上個選擇',
        sectionPrevStory: '📜 前情提要',
        sectionUpcomingChoices: '🆕 即將更新選項',
        turnMoved: (from, to) => `🧭 本回合移動：${from} → ${to}`,
        rewardGoldDelta: (gold) => `💰 +${gold} Rns 代幣`,
        rewardWantedLevel: (level) => `⚠️ 通緝等級: ${level}`,
        rewardSoldCount: (count) => `🏪 已售出 ${count} 件`,
        rewardItemGain: (item) => `📦 取得 ${item}`,
        rewardPetRevived: (name) => `🐾 ${name} 復活完成（2回合制）`,
        rewardPassiveHealSingle: (name, heal) => `🩹 ${name} 行進恢復 +${heal} HP`,
        rewardPassiveHealSummary: (preview, total) => `🩹 行進恢復：${preview}｜合計 +${total} HP`
      },
      'zh-CN': {
        statusLabel: '状态',
        statusHp: '气血',
        statusEnergy: '能量',
        statusCurrency: 'Rns 代币',
        fieldPet: '🐾 宠物',
        fieldHp: '⚔️ 气血',
        fieldCurrency: '💰 Rns 代币',
        fieldLocation: '📍 位置',
        fieldLuck: '🌟 幸运',
        fieldWanted: '🚨 通缉级',
        mainlineDone: (location) => `📖 本区主线：已完成（${location}）`,
        mainlineProgress: (location) => `📖 本区主线：进行中（${location}）`,
        missionBoss: (done) => `｜关键任务：击败四巨头全员（${done ? '已完成' : '未完成'}）`,
        missionNpc: (name, location, done) => `｜关键NPC：${name}@${location}（${done ? '已完成' : '未完成'}）`,
        sectionChoices: '🆕 选项',
        sectionNewChoices: '🆕 新选项',
        chooseNumber: (max) => `请选择编号（1-${max}）`,
        sectionWorldEvents: '📢 世界事件',
        lastChoice: '📍 上个选择',
        sectionPrevStory: '📜 前情提要',
        sectionUpcomingChoices: '🆕 即将更新选项',
        turnMoved: (from, to) => `🧭 本回合移动：${from} → ${to}`,
        rewardGoldDelta: (gold) => `💰 +${gold} Rns 代币`,
        rewardWantedLevel: (level) => `⚠️ 通缉等级: ${level}`,
        rewardSoldCount: (count) => `🏪 已售出 ${count} 件`,
        rewardItemGain: (item) => `📦 取得 ${item}`,
        rewardPetRevived: (name) => `🐾 ${name} 复活完成（2回合制）`,
        rewardPassiveHealSingle: (name, heal) => `🩹 ${name} 行进恢复 +${heal} HP`,
        rewardPassiveHealSummary: (preview, total) => `🩹 行进恢复：${preview}｜合计 +${total} HP`
      },
      en: {
        statusLabel: 'Status',
        statusHp: 'HP',
        statusEnergy: 'Energy',
        statusCurrency: 'Rns Tokens',
        fieldPet: '🐾 Pet',
        fieldHp: '⚔️ HP',
        fieldCurrency: '💰 Rns',
        fieldLocation: '📍 Location',
        fieldLuck: '🌟 Luck',
        fieldWanted: '🚨 Wanted Lv',
        mainlineDone: (location) => `📖 Local Mainline: Completed (${location})`,
        mainlineProgress: (location) => `📖 Local Mainline: In Progress (${location})`,
        missionBoss: (done) => ` | Key Mission: Defeat all Four Commanders (${done ? 'Done' : 'Pending'})`,
        missionNpc: (name, location, done) => ` | Key NPC: ${name}@${location} (${done ? 'Done' : 'Pending'})`,
        sectionChoices: '🆕 Choices',
        sectionNewChoices: '🆕 New Choices',
        chooseNumber: (max) => `Choose a number (1-${max})`,
        sectionWorldEvents: '📢 World Events',
        lastChoice: '📍 Previous Choice',
        sectionPrevStory: '📜 Previous Context',
        sectionUpcomingChoices: '🆕 Incoming Choices',
        turnMoved: (from, to) => `🧭 Moved this turn: ${from} → ${to}`,
        rewardGoldDelta: (gold) => `💰 +${gold} Rns`,
        rewardWantedLevel: (level) => `⚠️ Wanted Lv: ${level}`,
        rewardSoldCount: (count) => `🏪 Sold ${count} item(s)`,
        rewardItemGain: (item) => `📦 Obtained ${item}`,
        rewardPetRevived: (name) => `🐾 ${name} has fully revived (2-turn system)`,
        rewardPassiveHealSingle: (name, heal) => `🩹 ${name} recovered +${heal} HP while moving`,
        rewardPassiveHealSummary: (preview, total) => `🩹 Travel recovery: ${preview} | Total +${total} HP`
      },
      ko: {
        statusLabel: '상태',
        statusHp: 'HP',
        statusEnergy: '에너지',
        statusCurrency: 'Rns 토큰',
        fieldPet: '🐾 펫',
        fieldHp: '⚔️ HP',
        fieldCurrency: '💰 Rns',
        fieldLocation: '📍 위치',
        fieldLuck: '🌟 행운',
        fieldWanted: '🚨 수배 레벨',
        mainlineDone: (location) => `📖 지역 메인라인: 완료 (${location})`,
        mainlineProgress: (location) => `📖 지역 메인라인: 진행 중 (${location})`,
        missionBoss: (done) => ` | 핵심 임무: 4대 지휘관 전원 격파 (${done ? '완료' : '진행 중'})`,
        missionNpc: (name, location, done) => ` | 핵심 NPC: ${name}@${location} (${done ? '완료' : '진행 중'})`,
        sectionChoices: '🆕 선택지',
        sectionNewChoices: '🆕 새 선택지',
        chooseNumber: (max) => `번호를 선택하세요 (1-${max})`,
        sectionWorldEvents: '📢 세계 이벤트',
        lastChoice: '📍 이전 선택',
        sectionPrevStory: '📜 이전 스토리',
        sectionUpcomingChoices: '🆕 곧 갱신될 선택지',
        turnMoved: (from, to) => `🧭 이번 턴 이동: ${from} → ${to}`,
        rewardGoldDelta: (gold) => `💰 +${gold} Rns 토큰`,
        rewardWantedLevel: (level) => `⚠️ 수배 레벨: ${level}`,
        rewardSoldCount: (count) => `🏪 ${count}개 판매 완료`,
        rewardItemGain: (item) => `📦 ${item} 획득`,
        rewardPetRevived: (name) => `🐾 ${name} 부활 완료 (2턴 시스템)`,
        rewardPassiveHealSingle: (name, heal) => `🩹 ${name} 이동 중 +${heal} HP 회복`,
        rewardPassiveHealSummary: (preview, total) => `🩹 이동 회복: ${preview}｜총 +${total} HP`
      }
    };
    if (typeof getLanguageSection === 'function') {
      const fromGlobal = getLanguageSection('adventureText', code);
      if (fromGlobal && typeof fromGlobal === 'object' && Object.keys(fromGlobal).length > 0) {
        return fromGlobal;
      }
    }
    return fallbackMap[code] || fallbackMap['zh-TW'];
  }

  function buildMainStatusBar(player, pet, lang = '') {
    const safeLang = lang || player?.language || 'zh-TW';
    const tx = getAdventureText(safeLang);
    const hpText = formatPetHpWithRecovery(pet);
    const locationText = getLocationDisplayName(player?.location || '', safeLang) || String(player?.location || '');
    return `${tx.statusHp} ${hpText} | ${tx.statusEnergy} ${player.stats.能量 || 10}/${player.maxStats.能量 || 10} | ${tx.statusCurrency} ${player.stats.財富} | ${locationText}`;
  }

  function buildMainStatusFields(player, pet, lang = '', options = {}) {
    const tx = getAdventureText(lang || player?.language || 'zh-TW');
    const safeLang = lang || player?.language || 'zh-TW';
    const wantedLevel = Math.max(0, Number(options?.wantedLevel || 0));
    return [
      {
        name: tx.fieldPet,
        value: `${pet?.name || 'Unknown'} (${getPetElementDisplayName(pet?.type || pet?.element || '', safeLang)})`,
        inline: true
      },
      { name: tx.fieldHp, value: formatPetHpWithRecovery(pet), inline: true },
      { name: tx.fieldCurrency, value: String(player?.stats?.財富 || 0), inline: true },
      { name: tx.fieldLocation, value: getLocationDisplayName(player?.location || '', safeLang) || String(player?.location || ''), inline: true },
      { name: tx.fieldLuck, value: String(player?.stats?.運氣 || 0), inline: true },
      { name: tx.fieldWanted, value: String(wantedLevel), inline: true }
    ];
  }

  function getIslandMainlineProgressMeta(player) {
    const location = String(player?.location || '').trim();
    if (!location) return null;
    const islandState = ISLAND_STORY && typeof ISLAND_STORY.getIslandStoryState === 'function'
      ? ISLAND_STORY.getIslandStoryState(player, location)
      : null;
    if (!islandState) return null;
    const stage = Math.max(1, Number(islandState?.stage || 1));
    const stageCount = Math.max(8, Number(islandState?.stageCount || 8));
    return {
      location,
      stage,
      stageCount,
      completed: Boolean(islandState?.completed),
      progressText: `地區進度 ${stage}/${stageCount}`
    };
  }

  function buildMainlineProgressLine(player, lang = '') {
    const tx = getAdventureText(lang || player?.language || 'zh-TW');
    const meta = getIslandMainlineProgressMeta(player);
    if (!meta) return '';
    const mission = (MAIN_STORY && typeof MAIN_STORY.getCurrentRegionMission === 'function')
      ? MAIN_STORY.getCurrentRegionMission(player, meta.location)
      : null;
    const missionLine = mission
      ? (mission.regionId === 'island_routes'
        ? tx.missionBoss(Boolean(mission.keyFound))
        : tx.missionNpc(
          getNpcDisplayName(String(mission.npcName || 'Unknown'), lang || player?.language || 'zh-TW') || String(mission.npcName || 'Unknown'),
          getLocationDisplayName(String(mission.npcLocation || 'Unknown'), lang || player?.language || 'zh-TW') || String(mission.npcLocation || 'Unknown'),
          Boolean(mission.keyFound)
        ))
      : '';
    const localizedLocation = getLocationDisplayName(meta.location, lang || player?.language || 'zh-TW') || meta.location;
    if (meta.completed) return `${tx.mainlineDone(localizedLocation)}${missionLine}`;
    return `${tx.mainlineProgress(localizedLocation)}${missionLine}`;
  }

  return {
    getAdventureText,
    buildMainStatusBar,
    buildMainStatusFields,
    getIslandMainlineProgressMeta,
    buildMainlineProgressLine
  };
}

module.exports = {
  createAdventureStatusUtils
};
