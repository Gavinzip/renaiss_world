/**
 * 🌍 Renaiss 世界觀資料源
 */

const WORLD_LORE = {
  factions: {
    renaiss: {
      name: 'Renaiss',
      identity: '秩序市場',
      values: ['真品', '信任', '穩定'],
      leaders: ['Winchman', 'Tom', 'Harry', 'Kathy', 'Yuzu', 'Leslie']
    },
    digital: {
      name: 'Digital',
      identity: '混亂市場',
      methods: ['低價壓力', '虛假承諾', '假收藏品'],
      kings: ['Nemo', 'Wolf', 'Adaloc', 'Hom'],
      signature: '變異寵物與不確定性武器'
    }
  },
  threat: {
    maskedAssassin: 'Digital 蒙面殺手會突襲玩家、搶奪收藏品、測試強度'
  },
  theme: '在 Renaiss，你不只是與敵人戰鬥，而是在與「價值本身的不確定性」對抗。',
  doctrine: '玩家可走正派或機變派；機變派屬於灰階正義路線，真正敵對壓力主要來自 Digital。'
};

function getLorePromptSnippet() {
  const r = WORLD_LORE.factions.renaiss;
  const d = WORLD_LORE.factions.digital;
  return [
    `Renaiss（${r.identity}）：${r.values.join('、')}；核心：${r.leaders.join('、')}`,
    `Digital（${d.identity}）：${d.methods.join('、')}；四天王：${d.kings.join('、')}`,
    `威脅：${WORLD_LORE.threat.maskedAssassin}`,
    `主題：${WORLD_LORE.theme}`,
    `準則：${WORLD_LORE.doctrine}`
  ].join('\n');
}

module.exports = {
  WORLD_LORE,
  getLorePromptSnippet
};
