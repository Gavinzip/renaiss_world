/**
 * 收藏文明語彙：
 * - 所有城市都要有在地收藏口味，不落 default
 * - 供故事提示詞與選項生成共用
 */

const FLAVOR_LIBRARY = Object.freeze({
  river_trace: {
    title: '河運追蹤埠',
    style: '碼頭貨樣、舊倉流向與水運口供交叉比對',
    consequence: '+線索 / +社交 / 低中風險'
  },
  fastcheck_trace: {
    title: '快檢追查港',
    style: '封存艙流向追查與攤位壓力對線',
    consequence: '+線索 / +風險 / 可能戰鬥'
  },
  mountain_route: {
    title: '山道押運線',
    style: '護鏢路徑、路障盤查與伏擊反制',
    consequence: '+通行效率 / +伏擊風險'
  },
  ledger_city: {
    title: '灰帳核對城',
    style: '記錄簿、物流台帳與口供交叉驗證',
    consequence: '+證據完整度 / +社交博弈'
  },
  fog_track: {
    title: '霧林追跡帶',
    style: '失蹤痕跡、暗線尾隨與假線索篩除',
    consequence: '+隱線情報 / +追擊壓力'
  },
  trust_hub: {
    title: '公信中樞',
    style: '高壓審核、鑑定公信與勢力施壓同場',
    consequence: '+高價值進度 / +高對抗風險'
  },
  inner_audit: {
    title: '內廷封審區',
    style: '禁區稽核、密檔核驗與目標鎖定',
    consequence: '+核心情報 / +高暴露風險'
  },
  gate_inspection: {
    title: '關口驗貨線',
    style: '通關驗貨、封條核驗、補給線攔截',
    consequence: '+通行權 / +查扣衝突'
  },
  relic_crossroad: {
    title: '古遺物流城',
    style: '古件流向與壁畫圖騰的來源比對',
    consequence: '+稀有來源 / +盜掘衝突'
  },
  logistics_chain: {
    title: '轉運時鏈站',
    style: '批次與時間鏈比對，追查洗來源節點',
    consequence: '+供應鏈線索 / +中間人反制'
  },
  desert_frontline: {
    title: '沙域前線點',
    style: '邊哨盤查、補水線與突襲情報交換',
    consequence: '+邊境控制 / +對抗升溫'
  },
  salvage_station: {
    title: '遺站回收場',
    style: '舊站殘件回收、黑市翻修與序號追源',
    consequence: '+殘件價值 / +來源污染風險'
  },
  buried_ruin: {
    title: '埋沙廢都',
    style: '坍塌遺構、夜間幻影與禁件流通',
    consequence: '+高稀有掉落 / +高危事件'
  },
  delta_market: {
    title: '港埠快流市場',
    style: '高流速交易與貨樣開箱博弈',
    consequence: '+金流 / +被話術帶偏機率'
  },
  tidal_hub: {
    title: '潮差轉運碼頭',
    style: '潮汐窗口搶單、冷鏈貨櫃與夜間換手',
    consequence: '+交易速度 / +失誤代價'
  },
  sample_port: {
    title: '樣本比對口',
    style: '偽樣拆解與製程片段驗證',
    consequence: '+物證可信度 / +外圍幹部注意'
  },
  mountain_craft: {
    title: '山湖工藝城',
    style: '手作藏品與在地工坊的來源核驗',
    consequence: '+穩定收益 / +偽匠混入風險'
  },
  tea_ridge: {
    title: '茶嶺封樣線',
    style: '高山樣本封樣、轉手驗批與山線運輸',
    consequence: '+材料品質 / +運輸波動'
  },
  jungle_ritual: {
    title: '雨林祭線區',
    style: '毒材與祭器來源核對、部落交易規範',
    consequence: '+稀有素材 / +誤觸禁忌風險'
  },
  mist_altar: {
    title: '霧祭封印區',
    style: '古符封印、祭柱校驗與幻象辨識',
    consequence: '+古文明線索 / +認知干擾'
  },
  prairie_trade: {
    title: '游牧交換圈',
    style: '商隊互換、草原路網與部落信用議價',
    consequence: '+補給穩定 / +護送風險'
  },
  frost_sentry: {
    title: '寒原哨戒線',
    style: '邊境盤查、補給口令與雪線封條',
    consequence: '+安全通行 / +伏擊壓力'
  },
  snow_infiltration: {
    title: '滲透篩查點',
    style: '真假線人盤點與內部滲透排查',
    consequence: '+名單清晰度 / +伏擊壓力'
  },
  ice_rift: {
    title: '裂谷極限區',
    style: '寒晶礦封存、裂谷回收與生存式鑑識',
    consequence: '+高價礦物 / +高死亡風險'
  },
  island_hub: {
    title: '群島航運樞紐',
    style: '跳島貨單、港倉封樣與航圖核對',
    consequence: '+跨島效率 / +劫掠風險'
  },
  reef_salvage: {
    title: '環礁回收圈',
    style: '礁區遺構打撈與海晶來源驗證',
    consequence: '+海晶產出 / +潮流事故'
  },
  mechanism_maze: {
    title: '機關桃林帶',
    style: '機關庭試錯、陷阱路徑與藏品誤導',
    consequence: '+隱藏路線 / +迷航代價'
  },
  tidal_trial: {
    title: '潮汐試煉場',
    style: '高壓挑戰、實戰驗值與公開排名',
    consequence: '+高回報 / +高耗損'
  },
  observatory_signal: {
    title: '高維觀測點',
    style: '頻譜訊號、異常回波與遠端源頭鎖定',
    consequence: '+遠距情報 / +訊號污染'
  },
  peak_contest: {
    title: '高峰節點戰區',
    style: '能源節點爭奪與勢力示威對抗',
    consequence: '+戰線推進 / +全面衝突'
  },
  dark_mine: {
    title: '深礦封存帶',
    style: '礦脈標號、暗線運礦與陷阱路徑核查',
    consequence: '+稀有礦收穫 / +坍塌風險'
  },
  abyss_politics: {
    title: '暗市權力圈',
    style: '高層交易、暗殺委託與真假命令辨識',
    consequence: '+關鍵情報 / +背刺風險'
  },
  ancient_automation: {
    title: '遺都自律區',
    style: '古代機關授權、藍圖回收與中樞解鎖',
    consequence: '+核心藍圖 / +系統反噬'
  },
  forbidden_storm: {
    title: '禁域風暴海',
    style: '異常風暴、禁忌殘骸與極端條件取證',
    consequence: '+禁忌遺物 / +極端風險'
  }
});

const LOCATION_TO_FLAVOR = Object.freeze({
  '河港鎮': 'river_trace',
  '襄陽城': 'fastcheck_trace',
  '龍脊山道': 'mountain_route',
  '洛陽城': 'ledger_city',
  '墨林古道': 'fog_track',
  '大都': 'trust_hub',
  '皇城內廷': 'inner_audit',
  '青石關': 'gate_inspection',
  '敦煌': 'relic_crossroad',
  '喀什爾': 'logistics_chain',
  '赤沙前哨': 'desert_frontline',
  '砂輪遺站': 'salvage_station',
  '鳴沙廢城': 'buried_ruin',
  '廣州': 'delta_market',
  '海潮碼頭': 'tidal_hub',
  '鏡湖渡口': 'sample_port',
  '大理': 'mountain_craft',
  '雲棧茶嶺': 'tea_ridge',
  '南疆苗疆': 'jungle_ritual',
  '霧雨古祭壇': 'mist_altar',
  '草原部落': 'prairie_trade',
  '霜狼哨站': 'frost_sentry',
  '雪白山莊': 'snow_infiltration',
  '玄冰裂谷': 'ice_rift',
  '星潮港': 'island_hub',
  '珊瑚環礁': 'reef_salvage',
  '桃花島': 'mechanism_maze',
  '潮汐試煉島': 'tidal_trial',
  '蓬萊觀測島': 'observatory_signal',
  '光明頂': 'peak_contest',
  '無光礦坑': 'dark_mine',
  '黑木崖': 'abyss_politics',
  '天機遺都': 'ancient_automation',
  '死亡之海': 'forbidden_storm'
});

function buildLocationFlavorMap() {
  const out = {};
  for (const [location, flavorId] of Object.entries(LOCATION_TO_FLAVOR)) {
    out[location] = FLAVOR_LIBRARY[flavorId] || null;
  }
  return out;
}

const LOCATION_COLLECTIBLE_FLAVORS = Object.freeze(buildLocationFlavorMap());

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
  FLAVOR_LIBRARY,
  LOCATION_TO_FLAVOR,
  LOCATION_COLLECTIBLE_FLAVORS,
  getLocationCollectibleFlavor,
  getCollectibleCulturePrompt
};
