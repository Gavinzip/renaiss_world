/**
 * 🌍 Renaiss 世界觀資料源
 */

const WORLD_LORE = {
  factions: {
    renaiss: {
      name: 'Renaiss',
      identity: '星域維運方',
      values: ['秩序', '信任', '穩定'],
      leaders: ['Winchman', 'Tom', 'Harry', 'Kathy', 'Yuzu', 'Leslie']
    },
    digital: {
      name: 'Digital',
      hiddenName: '暗潮勢力',
      identity: '灰域供應鏈',
      hiddenIdentity: '未公開的流通網路',
      methods: ['低價誘惑', '話術誘導', '來源不明貨流'],
      publicMaskMethods: ['新手補給', '快速鑑定', '低門檻合作'],
      kings: ['Nemo', 'Wolf', 'Adaloc', 'Hom'],
      signature: '變異寵物與不確定性武器'
    }
  },
  threat: {
    maskedAssassin: '覆面獵手會突襲玩家、奪取貨證並測試強度'
  },
  theme: '在 Renaiss，你不只是與敵人戰鬥，而是在與「真偽與來源的不確定性」對抗。',
  doctrine: '玩家可走正派或機變派；機變派屬於灰階正義路線。前期以調查、真偽比對與風險辨識推進。'
};

function getLorePromptSnippet(options = {}) {
  const revealRivalName = Boolean(options.revealRivalName);
  const newbieDeception = Boolean(options.newbieDeception);
  const r = WORLD_LORE.factions.renaiss;
  const d = WORLD_LORE.factions.digital;
  const rivalName = revealRivalName ? d.name : d.hiddenName;
  const rivalIdentity = revealRivalName ? d.identity : d.hiddenIdentity;
  const rivalMethods = (!revealRivalName && newbieDeception) ? d.publicMaskMethods : d.methods;
  const revealRule = revealRivalName
    ? '敘事限制：可揭露第二勢力正式名稱與高層。'
    : (newbieDeception
      ? '敘事限制：前期不得直接說出第二勢力正式名稱，且要先呈現為「看似友善、願意幫忙」的樣子。'
      : '敘事限制：前期不得直接說出第二勢力正式名稱，僅能稱為「暗潮勢力」或「另一股勢力」。');
  return [
    `Renaiss（${r.identity}）：${r.values.join('、')}；核心：${r.leaders.join('、')}`,
    `${rivalName}（${rivalIdentity}）：${rivalMethods.join('、')}`,
    revealRivalName ? `四巨頭：${d.kings.join('、')}` : '對手高層：尚未公開',
    `威脅：${WORLD_LORE.threat.maskedAssassin}`,
    `主題：${WORLD_LORE.theme}`,
    `準則：${WORLD_LORE.doctrine}`,
    revealRule
  ].join('\n');
}

module.exports = {
  WORLD_LORE,
  getLorePromptSnippet
};
