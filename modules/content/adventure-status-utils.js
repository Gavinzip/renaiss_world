function createAdventureStatusUtils(deps = {}) {
  const {
    normalizeLangCode = (v) => v || 'zh-TW',
    formatPetHpWithRecovery = (pet) => `${Number(pet?.hp || 0)}/${Number(pet?.maxHp || 0)}`,
    ISLAND_STORY = null,
    MAIN_STORY = null
  } = deps;

  function getAdventureText(lang = 'zh-TW') {
    const code = normalizeLangCode(lang);
    const map = {
      'zh-TW': {
        statusLabel: '狀態',
        statusHp: '氣血',
        statusEnergy: '能量',
        statusCurrency: 'Rns 代幣',
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
        sectionUpcomingChoices: '🆕 即將更新選項'
      },
      'zh-CN': {
        statusLabel: '状态',
        statusHp: '气血',
        statusEnergy: '能量',
        statusCurrency: 'Rns 代币',
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
        sectionUpcomingChoices: '🆕 即将更新选项'
      },
      en: {
        statusLabel: 'Status',
        statusHp: 'HP',
        statusEnergy: 'Energy',
        statusCurrency: 'Rns Tokens',
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
        sectionUpcomingChoices: '🆕 Incoming Choices'
      }
    };
    return map[code] || map['zh-TW'];
  }

  function buildMainStatusBar(player, pet, lang = '') {
    const tx = getAdventureText(lang || player?.language || 'zh-TW');
    const hpText = formatPetHpWithRecovery(pet);
    return `${tx.statusHp} ${hpText} | ${tx.statusEnergy} ${player.stats.能量 || 10}/${player.maxStats.能量 || 10} | ${tx.statusCurrency} ${player.stats.財富} | ${player.location}`;
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
        : tx.missionNpc(String(mission.npcName || 'Unknown'), String(mission.npcLocation || 'Unknown'), Boolean(mission.keyFound)))
      : '';
    if (meta.completed) return `${tx.mainlineDone(meta.location)}${missionLine}`;
    return `${tx.mainlineProgress(meta.location)}${missionLine}`;
  }

  return {
    getAdventureText,
    buildMainStatusBar,
    getIslandMainlineProgressMeta,
    buildMainlineProgressLine
  };
}

module.exports = {
  createAdventureStatusUtils
};
