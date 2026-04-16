/**
 * 城市天候主調設定：
 * - 每座城市固定一種「主天候」
 * - 用於故事提示詞與選項生成時的在地氛圍約束
 */

const WEATHER_PROFILES = Object.freeze({
  clear: Object.freeze({
    id: 'clear',
    name: '晴空',
    scene: '視野清楚、運輸穩定，NPC 較願意正面接觸。',
    pacing: '節奏偏快，適合正面交涉與公開查驗。',
    hint: '可強化正面接觸、明面核對、快速推進。'
  }),
  rainfall: Object.freeze({
    id: 'rainfall',
    name: '降雨',
    scene: '路面濕滑、視線受干擾，巷弄與港埠變數增加。',
    pacing: '節奏偏迂迴，適合潛行、繞線與撤離。',
    hint: '可強化掩護、尾隨、雨中交易與真偽混淆。'
  }),
  drought: Object.freeze({
    id: 'drought',
    name: '旱象',
    scene: '水位下降、補給緊縮，人心與市場都更躁動。',
    pacing: '節奏偏對抗，適合高風險搶點與快節奏決策。',
    hint: '可強化資源衝突、壓價欺詐、補給爭奪。'
  }),
  snowfall: Object.freeze({
    id: 'snowfall',
    name: '降雪',
    scene: '節奏放慢、能見壓縮，每一步都更有重量。',
    pacing: '節奏偏控場，適合設局、反滲透與耐心反制。',
    hint: '可強化控場、埋伏、慢速追蹤與長尾風險。'
  })
});

const LOCATION_WEATHER_MAP = Object.freeze({
  // 中原核心
  '河港鎮': 'clear',
  '襄陽城': 'clear',
  '龍脊山道': 'rainfall',
  '洛陽城': 'rainfall',
  '墨林古道': 'rainfall',
  '大都': 'clear',
  '皇城內廷': 'clear',
  '青石關': 'drought',

  // 西域沙海
  '敦煌': 'drought',
  '喀什爾': 'clear',
  '赤沙前哨': 'drought',
  '砂輪遺站': 'drought',
  '鳴沙廢城': 'drought',

  // 南疆水網
  '廣州': 'rainfall',
  '海潮碼頭': 'rainfall',
  '鏡湖渡口': 'rainfall',
  '大理': 'clear',
  '雲棧茶嶺': 'rainfall',
  '南疆苗疆': 'rainfall',
  '霧雨古祭壇': 'rainfall',

  // 北境高原
  '草原部落': 'clear',
  '霜狼哨站': 'snowfall',
  '雪白山莊': 'snowfall',
  '玄冰裂谷': 'snowfall',

  // 群島航線
  '星潮港': 'rainfall',
  '珊瑚環礁': 'clear',
  '桃花島': 'rainfall',
  '潮汐試煉島': 'clear',
  '蓬萊觀測島': 'clear',

  // 隱秘深域
  '光明頂': 'snowfall',
  '無光礦坑': 'drought',
  '黑木崖': 'snowfall',
  '天機遺都': 'snowfall',
  '死亡之海': 'snowfall'
});

const DEFAULT_WEATHER_PROFILE = WEATHER_PROFILES.clear;

function normalizeLocationName(location = '') {
  return String(location || '').trim();
}

function getLocationWeatherProfile(location = '') {
  const key = normalizeLocationName(location);
  const weatherId = String(LOCATION_WEATHER_MAP[key] || 'clear').trim();
  return WEATHER_PROFILES[weatherId] || DEFAULT_WEATHER_PROFILE;
}

function getLocationWeatherSummary(location = '', playerLang = 'zh-TW') {
  const profile = getLocationWeatherProfile(location);
  if (playerLang === 'en') return `${profile.name}: ${profile.scene}`;
  if (playerLang === 'zh-CN') return `${profile.name}：${profile.scene}`;
  return `${profile.name}：${profile.scene}`;
}

function getLocationWeatherPrompt(location = '', playerLang = 'zh-TW') {
  const profile = getLocationWeatherProfile(location);
  if (playerLang === 'en') {
    return [
      `Local climate: ${profile.name}`,
      `- Scene: ${profile.scene}`,
      `- Pace: ${profile.pacing}`,
      `- Direction: ${profile.hint}`
    ].join('\n');
  }
  if (playerLang === 'zh-CN') {
    return [
      `当地天候：${profile.name}`,
      `- 场景：${profile.scene}`,
      `- 节奏：${profile.pacing}`,
      `- 行动导向：${profile.hint}`
    ].join('\n');
  }
  return [
    `當地天候：${profile.name}`,
    `- 場景：${profile.scene}`,
    `- 節奏：${profile.pacing}`,
    `- 行動導向：${profile.hint}`
  ].join('\n');
}

module.exports = {
  WEATHER_PROFILES,
  LOCATION_WEATHER_MAP,
  getLocationWeatherProfile,
  getLocationWeatherSummary,
  getLocationWeatherPrompt
};

