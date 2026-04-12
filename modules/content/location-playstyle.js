const LOCATION_PLAYSTYLE_PROFILES = Object.freeze({
  '襄陽城': {
    id: 'xiangyang_trace',
    name: '追查壓力場',
    focus: '來源追查、線索比對、監視反制',
    keywords: ['追查', '線索', '比對', '口供', '封存艙', '檢測', '尾隨'],
    minKeywordHits: 2,
    dropChanceMultiplier: 1.08,
    valueMultiplier: 1.03,
    byCluster: { investigate: 1.28, social: 1.12, combat: 1.08, trade: 0.90, explore: 1.00 }
  },
  '洛陽城': {
    id: 'luoyang_intel',
    name: '情報交涉網',
    focus: '情報交換、灰帳核對、交叉驗證',
    keywords: ['灰帳', '交涉', '交換', '核對', '紀錄', '物流', '驗證'],
    minKeywordHits: 2,
    dropChanceMultiplier: 1.10,
    valueMultiplier: 1.05,
    byCluster: { investigate: 1.18, social: 1.24, combat: 0.90, trade: 1.02, explore: 1.04 }
  },
  '廣州': {
    id: 'guangzhou_market',
    name: '市場博弈場',
    focus: '快節奏交易、高報酬高話術風險',
    keywords: ['開價', '議價', '成交', '貨源', '港務', '檢單', '套利'],
    minKeywordHits: 2,
    dropChanceMultiplier: 1.12,
    valueMultiplier: 1.15,
    byCluster: { investigate: 1.08, social: 1.00, combat: 1.02, trade: 1.25, explore: 1.06 }
  },
  '大都': {
    id: 'dadu_pressure',
    name: '高壓權力場',
    focus: '高風險對抗、壓力測試、重報酬',
    keywords: ['封鎖', '施壓', '攔截', '強攻', '中樞', '審核', '反制'],
    minKeywordHits: 2,
    dropChanceMultiplier: 1.14,
    valueMultiplier: 1.18,
    byCluster: { investigate: 1.08, social: 0.96, combat: 1.26, trade: 1.10, explore: 1.00 }
  },
  '青石關': {
    id: 'qingshiguan_route',
    name: '關卡路線戰',
    focus: '路線選擇、通行驗證、風險繞行',
    keywords: ['關卡', '巡防', '路線', '繞行', '盤查', '通行', '封道'],
    minKeywordHits: 2,
    dropChanceMultiplier: 1.06,
    valueMultiplier: 1.06,
    byCluster: { investigate: 1.12, social: 1.00, combat: 1.06, trade: 0.92, explore: 1.20 }
  },
  '喀什爾': {
    id: 'kashgar_logistics',
    name: '物流追蹤場',
    focus: '轉運時間鏈、貨流斷點、供應路徑追查',
    keywords: ['轉運', '調度', '時間鏈', '貨流', '碼頭', '批次', '路徑'],
    minKeywordHits: 2,
    dropChanceMultiplier: 1.11,
    valueMultiplier: 1.14,
    byCluster: { investigate: 1.20, social: 0.98, combat: 1.00, trade: 1.20, explore: 1.05 }
  },
  '鏡湖渡口': {
    id: 'jinghu_samples',
    name: '樣本驗證場',
    focus: '樣本比對、工坊來源驗證、物證拆解',
    keywords: ['樣本', '製程', '工坊', '刻印', '比對', '殘留', '檢材'],
    minKeywordHits: 2,
    dropChanceMultiplier: 1.10,
    valueMultiplier: 1.12,
    byCluster: { investigate: 1.16, social: 1.00, combat: 1.08, trade: 1.06, explore: 1.14 }
  },
  '雪白山莊': {
    id: 'snow_infiltration',
    name: '滲透反滲透',
    focus: '試探對話、真假線人、反滲透追蹤',
    keywords: ['滲透', '反查', '線人', '偽裝', '試探', '暗哨', '排查'],
    minKeywordHits: 2,
    dropChanceMultiplier: 1.09,
    valueMultiplier: 1.10,
    byCluster: { investigate: 1.14, social: 0.95, combat: 1.18, trade: 0.90, explore: 1.08 }
  }
});

const DEFAULT_LOCATION_PLAYSTYLE = Object.freeze({
  id: 'default',
  name: '在地探索',
  focus: '探索、互動、基礎追查',
  keywords: [],
  minKeywordHits: 0,
  dropChanceMultiplier: 1.0,
  valueMultiplier: 1.0,
  byCluster: { investigate: 1.0, social: 1.0, combat: 1.0, trade: 1.0, explore: 1.0 }
});

function normalizeLocationName(location = '') {
  return String(location || '').trim();
}

function getLocationPlaystyleProfile(location = '') {
  const normalized = normalizeLocationName(location);
  return LOCATION_PLAYSTYLE_PROFILES[normalized] || DEFAULT_LOCATION_PLAYSTYLE;
}

function getLocationPlaystylePromptBlock(location = '', playerLang = 'zh-TW') {
  const profile = getLocationPlaystyleProfile(location);
  if (profile.id === 'default') {
    if (playerLang === 'en') return 'Local playstyle: balanced exploration and interaction.';
    if (playerLang === 'zh-CN') return '地区玩法：均衡探索与互动。';
    return '地區玩法：均衡探索與互動。';
  }
  const keywordText = Array.isArray(profile.keywords) && profile.keywords.length > 0
    ? profile.keywords.slice(0, 6).join('、')
    : '（無）';
  if (playerLang === 'en') {
    return `Regional playstyle [${profile.name}]: ${profile.focus}. At least ${Math.max(1, Number(profile.minKeywordHits || 0))} options should reflect these cues: ${keywordText}.`;
  }
  if (playerLang === 'zh-CN') {
    return `地区玩法【${profile.name}】：${profile.focus}。本轮至少 ${Math.max(1, Number(profile.minKeywordHits || 0))} 个选项体现以下线索词：${keywordText}。`;
  }
  return `地區玩法【${profile.name}】：${profile.focus}。本輪至少 ${Math.max(1, Number(profile.minKeywordHits || 0))} 個選項體現以下線索詞：${keywordText}。`;
}

function classifyChoiceCluster(action = '', text = '', resultType = '') {
  const merged = [action, resultType, text].filter(Boolean).join(' ');
  if (/(fight|combat|location_story_battle|mentor_spar|攔截|強攻|迎戰|戰鬥|會進入戰鬥)/iu.test(merged)) return 'combat';
  if (/(market|shop|trade|buy|purchase|議價|開價|成交|交易|鑑價|鑑定)/iu.test(merged)) return 'trade';
  if (/(social|quest|help|gossip|談判|交涉|口供|詢問|社交)/iu.test(merged)) return 'social';
  if (/(investigate|trace|verify|追查|線索|比對|查驗|調取|驗證|紀錄)/iu.test(merged)) return 'investigate';
  return 'explore';
}

function getLocationLootFlavorModifier(location = '', context = {}) {
  const profile = getLocationPlaystyleProfile(location);
  const text = String(context.text || '').trim();
  const action = String(context.action || '').trim();
  const resultType = String(context.resultType || '').trim();
  const cluster = classifyChoiceCluster(action, text, resultType);
  const clusterMultiplier = Number(profile.byCluster?.[cluster] || 1.0);
  const dropChanceMultiplier = Math.max(0.75, Math.min(1.35, Number(profile.dropChanceMultiplier || 1.0) * clusterMultiplier));
  const valueMultiplier = Math.max(0.85, Math.min(1.35, Number(profile.valueMultiplier || 1.0) * (cluster === 'trade' ? 1.06 : 1.0)));
  return {
    profile,
    cluster,
    dropChanceMultiplier,
    valueMultiplier
  };
}

function applyLocationFlavorToTradeGood(tradeGood = null, location = '', context = {}) {
  if (!tradeGood || typeof tradeGood !== 'object') return tradeGood;
  const modifier = getLocationLootFlavorModifier(location, context);
  const next = { ...tradeGood };
  const baseValue = Math.max(1, Number(next.value || 1));
  next.value = Math.max(1, Math.round(baseValue * modifier.valueMultiplier));
  return next;
}

function countChoiceKeywordHits(choices = [], keywords = []) {
  const list = Array.isArray(choices) ? choices : [];
  const cueWords = Array.isArray(keywords) ? keywords.map((item) => String(item || '').trim()).filter(Boolean) : [];
  if (cueWords.length <= 0) return 0;
  let hit = 0;
  for (const choice of list) {
    const text = [choice?.name || '', choice?.choice || '', choice?.desc || '', choice?.tag || ''].join(' ');
    if (cueWords.some((word) => text.includes(word))) hit += 1;
  }
  return hit;
}

module.exports = {
  LOCATION_PLAYSTYLE_PROFILES,
  getLocationPlaystyleProfile,
  getLocationPlaystylePromptBlock,
  getLocationLootFlavorModifier,
  applyLocationFlavorToTradeGood,
  countChoiceKeywordHits
};
