/**
 * 收藏文明語彙：用於故事與選項提示詞，強化 Renaiss 收藏品世界觀。
 */

const LOCATION_COLLECTIBLE_FLAVORS = Object.freeze({
  '襄陽城': {
    title: '快檢追查港',
    style: '封存艙流向追查與攤位壓力對線',
    consequence: '+線索 / +風險 / 可能戰鬥'
  },
  '洛陽城': {
    title: '灰帳核對城',
    style: '以記錄簿、物流台帳與口供交叉驗證',
    consequence: '+證據完整度 / +社交博弈'
  },
  '廣州': {
    title: '港埠快流市場',
    style: '高流速交易與貨樣開箱博弈',
    consequence: '+金流 / +被話術帶偏機率'
  },
  '大都': {
    title: '公信中樞',
    style: '高壓審核、鑑定公信與勢力施壓同場',
    consequence: '+高價值進度 / +高對抗風險'
  },
  '青石關': {
    title: '關口驗貨線',
    style: '通關驗貨、封條核驗、補給線攔截',
    consequence: '+通行權 / +查扣衝突'
  },
  '喀什爾': {
    title: '轉運時鏈站',
    style: '批次與時間鏈比對，追查洗來源節點',
    consequence: '+供應鏈線索 / +中間人反制'
  },
  '鏡湖渡口': {
    title: '樣本比對口',
    style: '偽樣拆解與製程片段驗證',
    consequence: '+物證可信度 / +外圍幹部注意'
  },
  '雪白山莊': {
    title: '滲透篩查點',
    style: '真假線人盤點與內部滲透排查',
    consequence: '+名單清晰度 / +伏擊壓力'
  }
});

const DEFAULT_COLLECTIBLE_FLAVOR = Object.freeze({
  title: '收藏圈前線',
  style: '在地探索與真偽鑑識並進',
  consequence: '+穩定推進 / +未知風險'
});

function getLocationCollectibleFlavor(location = '') {
  const key = String(location || '').trim();
  return LOCATION_COLLECTIBLE_FLAVORS[key] || DEFAULT_COLLECTIBLE_FLAVOR;
}

function getCollectibleCulturePrompt(location = '', playerLang = 'zh-TW') {
  const flavor = getLocationCollectibleFlavor(location);
  if (playerLang === 'en') {
    return [
      'Collectible-civilization baseline:',
      '- Cities treat appraisal trust as public infrastructure, not optional flavor text.',
      '- Rewards should usually appear as verified collectible objects, not abstract numbers.',
      `- Local flavor (${location || 'current area'}): ${flavor.title} / ${flavor.style}.`,
      `- Visible consequence hint: ${flavor.consequence}.`
    ].join('\n');
  }
  if (playerLang === 'zh-CN') {
    return [
      '【收藏文明基线】',
      '1. 城市把“鉴定公信”当作基础秩序，不是背景装饰。',
      '2. 奖励应优先写成可持有、可交易、可核验的收藏物件。',
      `3. 本地口味（${location || '当前区域'}）：${flavor.title}｜${flavor.style}。`,
      `4. 选项可见后果建议：${flavor.consequence}。`
    ].join('\n');
  }
  return [
    '【收藏文明基線】',
    '1. 城市把「鑑定公信」視為基礎秩序，不是背景裝飾。',
    '2. 獎勵優先寫成可持有、可交易、可核驗的收藏物件。',
    `3. 本地口味（${location || '當前區域'}）：${flavor.title}｜${flavor.style}。`,
    `4. 選項可見後果建議：${flavor.consequence}。`
  ].join('\n');
}

module.exports = {
  LOCATION_COLLECTIBLE_FLAVORS,
  getLocationCollectibleFlavor,
  getCollectibleCulturePrompt
};
