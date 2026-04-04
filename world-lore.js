/**
 * 🌍 Renaiss 世界觀資料源
 */

const WORLD_LORE = {
  factions: {
    renaiss: {
      name: 'Renaiss',
      identity: '星域維運方',
      values: ['秩序', '信任', '穩定'],
      leaders: ['Winchman', 'Tom', 'Harry', 'Kathy', 'Yuzu', 'Leslie'],
      appraisalNetwork: '主鑑價網絡（全球）',
      appraisalScope: '提供跨區鑑定、回收、寄售與再流通，任何鑑定品皆可進站處理'
    },
    digital: {
      name: 'Digital',
      hiddenName: '暗潮勢力',
      identity: '灰域供應鏈',
      hiddenIdentity: '未公開的流通網路',
      methods: ['低價誘惑', '話術誘導', '來源不明貨流', '未評級品混賣', '空單偽造（宣稱有貨）'],
      publicMaskMethods: ['新手補給', '快速鑑定', '低門檻合作'],
      badActs: [
        '把未評級物品混入正常貨流後高價轉售',
        '掛單時宣稱現貨，成交後才暴露其實無貨',
        '偽造「已鑑定」標章與來源欄位',
        '以過低開價回收玩家物件再二次包裝'
      ],
      kings: ['Nemo', 'Wolf', 'Adaloc', 'Hom'],
      signature: '變異寵物與不確定性武器'
    }
  },
  appraisalExamples: [
    '古董機械錶',
    '封存科技晶片',
    '能量核心碎片',
    '航海羅盤殘件',
    '修復液樣本',
    '星沙藤',
    '稀有獸骨',
    '異常紋印金屬片',
    '熱層鏡片',
    '舊式導航模組'
  ],
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
  const appraisalExampleText = WORLD_LORE.appraisalExamples.slice(0, 8).join('、');
  const appraisalNetworkLine =
    `${r.name}主鑑價網絡：${r.appraisalScope}（例：${appraisalExampleText}）`;
  const revealRule = revealRivalName
    ? '敘事限制：可揭露第二勢力正式名稱與高層。'
    : (newbieDeception
      ? '敘事限制：前期不得直接說出第二勢力正式名稱，且要先呈現為「看似友善、願意幫忙」的樣子。'
      : '敘事限制：前期不得直接說出第二勢力正式名稱，僅能稱為「暗潮勢力」或「另一股勢力」。');
  return [
    `Renaiss（${r.identity}）：${r.values.join('、')}；核心：${r.leaders.join('、')}`,
    appraisalNetworkLine,
    `${rivalName}（${rivalIdentity}）：${rivalMethods.join('、')}`,
    `${rivalName}常見惡行：${d.badActs.slice(0, 3).join('、')}`,
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
