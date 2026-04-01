/**
 * 🌊 Renaiss 統一地圖資料源
 * Bot UI、出生邏輯與 AI 說書共用
 */

const ISLAND_MAP_TEXT = `                     ~ ~ ~ 雲海航道 ~ ~ ~
                   ╭─────〔 蓬萊海域 〕─────╮

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~                               RENAISS 星域                            ~
~                                                                      ~
~  【北境高原 D2-5】            【中原核心 D1-3】                         ~
~   雪白山莊─霜狼哨站            河港鎮─襄陽城─洛陽城─大都─青石關          ~
~      │      │                    │        │       │                  ~
~   玄冰裂谷  草原部落            龍脊山道  墨林古道  皇城內廷              ~
~                                                                      ~
~  【西域沙海 D2-4】             【南疆水網 D1-3】                         ~
~   敦煌─喀什爾─赤沙前哨          廣州─鏡湖渡口─大理─雲棧茶嶺─南疆苗疆      ~
~      │         │                   │                 │               ~
~   鳴沙廢城   砂輪遺站             海潮碼頭           霧雨古祭壇            ~
~                                                                      ~
~  【群島航線 D2-4】             【隱秘深域 D4-5】                         ~
~   星潮港─珊瑚環礁─桃花島─潮汐試煉島    光明頂─無光礦坑─黑木崖─天機遺都          ~
~          \        \      /             \                 /           ~
~            ~~~ 蓬萊仙島 ~~~               ~~~ 死亡之海 ~~~             ~
~                                                                      ~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`;

const REGION_CATALOG = [
  {
    id: 'central_core',
    name: '中原核心',
    difficultyRange: 'D1-D3',
    theme: '城邦與商道網絡，秩序與利益交錯',
    locations: ['河港鎮', '襄陽城', '龍脊山道', '洛陽城', '墨林古道', '大都', '皇城內廷', '青石關']
  },
  {
    id: 'west_desert',
    name: '西域沙海',
    difficultyRange: 'D2-D4',
    theme: '綠洲據點與古遺跡，風沙掩埋祕密',
    locations: ['敦煌', '喀什爾', '赤沙前哨', '砂輪遺站', '鳴沙廢城']
  },
  {
    id: 'southern_delta',
    name: '南疆水網',
    difficultyRange: 'D1-D3',
    theme: '港埠、山城與雨林祭壇並存的多生態帶',
    locations: ['廣州', '海潮碼頭', '鏡湖渡口', '大理', '雲棧茶嶺', '南疆苗疆', '霧雨古祭壇']
  },
  {
    id: 'northern_highland',
    name: '北境高原',
    difficultyRange: 'D2-D5',
    theme: '寒原、部落與冰封裂谷，生存壓力極高',
    locations: ['草原部落', '霜狼哨站', '雪白山莊', '玄冰裂谷']
  },
  {
    id: 'island_routes',
    name: '群島航線',
    difficultyRange: 'D2-D4',
    theme: '海路跳島、機關島鏈與靈氣島嶼',
    locations: ['星潮港', '珊瑚環礁', '桃花島', '潮汐試煉島', '蓬萊仙島']
  },
  {
    id: 'hidden_deeps',
    name: '隱秘深域',
    difficultyRange: 'D4-D5',
    theme: '高風險權力核心與古代禁區',
    locations: ['光明頂', '無光礦坑', '黑木崖', '天機遺都', '死亡之海']
  }
];

const LOCATION_PROFILES = {
  '河港鎮': {
    region: '中原核心',
    difficulty: 1,
    desc: '河運樞紐小鎮，碼頭與市集相連，情報流動快。',
    nearby: ['東河碼頭', '舊倉街', '渡船埠口'],
    landmarks: ['水運公會', '晨霧魚市'],
    resources: ['淡水魚', '木材', '運輸委託'],
    starterEligible: true
  },
  '襄陽城': {
    region: '中原核心',
    difficulty: 1,
    desc: '繁華熱鬧的科技城，商隊與探索者在此交會。',
    nearby: ['機械工坊街', '城南市集', '北門巡邏線'],
    landmarks: ['能量補充站', '城防塔'],
    resources: ['鐵礦', '藥草', '低階裝備'],
    starterEligible: true
  },
  '龍脊山道': {
    region: '中原核心',
    difficulty: 2,
    desc: '連接中原與西境的山脊古道，伏擊與護鏢並存。',
    nearby: ['山腰驛亭', '落石坡', '古棧道'],
    landmarks: ['龍脊觀景台'],
    resources: ['山藥', '護送任務'],
    starterEligible: true
  },
  '洛陽城': {
    region: '中原核心',
    difficulty: 1,
    desc: '花城與拍賣行並存，社交與情報活動頻繁。',
    nearby: ['牡丹廣場', '拍賣行後巷', '文庫街'],
    landmarks: ['牡丹山莊', '賞金公告牆'],
    resources: ['古籍', '珠寶', '情報'],
    starterEligible: true
  },
  '墨林古道': {
    region: '中原核心',
    difficulty: 2,
    desc: '濃霧林道，適合追蹤與伏擊，也常出現失蹤傳聞。',
    nearby: ['黑松林帶', '古井遺址', '獵人小屋'],
    landmarks: ['迷霧石碑'],
    resources: ['木材', '陷阱材料'],
    starterEligible: true
  },
  '大都': {
    region: '中原核心',
    difficulty: 2,
    desc: '皇城核心都市，權力節點密集，秩序森嚴。',
    nearby: ['皇城外環', '軍備庫區', '情報機構巷'],
    landmarks: ['天樞塔', '皇室議政廳'],
    resources: ['高級商貨', '政治任務'],
    starterEligible: true
  },
  '皇城內廷': {
    region: '中原核心',
    difficulty: 3,
    desc: '內廷禁區，任何行動都會被監察，收益高風險也高。',
    nearby: ['金鑾回廊', '禁軍訓場', '密詔庫'],
    landmarks: ['王座穹頂'],
    resources: ['高價情報'],
    starterEligible: false
  },
  '青石關': {
    region: '中原核心',
    difficulty: 3,
    desc: '戰略關口，常有兩派前哨對峙與補給爭奪。',
    nearby: ['關門甬道', '箭樓群', '舊戰壕'],
    landmarks: ['青石主關'],
    resources: ['軍需品', '護關任務'],
    starterEligible: false
  },
  '敦煌': {
    region: '西域沙海',
    difficulty: 2,
    desc: '絲路古城與洞窟文明交匯，奇遇與危機並行。',
    nearby: ['莫高窟外壁', '駝鈴街', '沙舟驛站'],
    landmarks: ['星砂壁畫廳'],
    resources: ['香料', '古代零件'],
    starterEligible: true
  },
  '喀什爾': {
    region: '西域沙海',
    difficulty: 2,
    desc: '綠洲商埠，議價與情報交換活躍。',
    nearby: ['巴扎主巷', '綠洲水道', '駝隊營地'],
    landmarks: ['絲路交易廳'],
    resources: ['棉花', '乾果', '走私線索'],
    starterEligible: true
  },
  '赤沙前哨': {
    region: '西域沙海',
    difficulty: 3,
    desc: '沙暴邊緣哨站，巡邏與突襲事件頻繁。',
    nearby: ['風蝕峽口', '警戒塔', '補水井'],
    landmarks: ['前哨雷達柱'],
    resources: ['火藥', '邊防任務'],
    starterEligible: false
  },
  '砂輪遺站': {
    region: '西域沙海',
    difficulty: 3,
    desc: '半埋於黃沙的舊能源站，仍有殘存機關運作。',
    nearby: ['斷電廠房', '沙下管道', '維修坑道'],
    landmarks: ['巨型砂輪引擎'],
    resources: ['廢料零件', '能源芯片'],
    starterEligible: false
  },
  '鳴沙廢城': {
    region: '西域沙海',
    difficulty: 4,
    desc: '被流沙吞噬的古城，夜間會出現迴音幻影。',
    nearby: ['坍塌城門', '風琴街', '地宮裂口'],
    landmarks: ['鳴沙鐘樓'],
    resources: ['古代機密', '稀有礦'],
    starterEligible: false
  },
  '廣州': {
    region: '南疆水網',
    difficulty: 1,
    desc: '海港商都，船運與飛艇物流最發達。',
    nearby: ['南碼頭', '燈塔街', '貨櫃區'],
    landmarks: ['雙層港務塔'],
    resources: ['海產', '交易任務'],
    starterEligible: true
  },
  '海潮碼頭': {
    region: '南疆水網',
    difficulty: 2,
    desc: '潮汐落差極大的轉運碼頭，夜間走私活動多。',
    nearby: ['潮汐棧橋', '吊臂區', '冷藏倉'],
    landmarks: ['潮鐘塔'],
    resources: ['漁獲', '走私情報'],
    starterEligible: true
  },
  '鏡湖渡口': {
    region: '南疆水網',
    difficulty: 2,
    desc: '湖面平靜如鏡，水路四通八達。',
    nearby: ['湖心浮台', '渡船棧道', '蘆葦灣'],
    landmarks: ['鏡湖石碑'],
    resources: ['藥材', '渡運任務'],
    starterEligible: true
  },
  '大理': {
    region: '南疆水網',
    difficulty: 1,
    desc: '山湖相映的城邦，茶路與手工業繁盛。',
    nearby: ['白牆巷', '蒼山步道', '古寺外苑'],
    landmarks: ['洱湖觀景台'],
    resources: ['茶葉', '藥材'],
    starterEligible: true
  },
  '雲棧茶嶺': {
    region: '南疆水網',
    difficulty: 2,
    desc: '梯田茶嶺與雲棧道相連，視野遼闊但路線複雜。',
    nearby: ['茶梯田', '雲棧橋', '風口石坪'],
    landmarks: ['茶師工坊'],
    resources: ['高山茶', '靈草'],
    starterEligible: true
  },
  '南疆苗疆': {
    region: '南疆水網',
    difficulty: 3,
    desc: '毒霧與古祭並存的雨林地帶，需謹慎探索。',
    nearby: ['蛇藤密林', '祭壇斷壁', '沼澤小徑'],
    landmarks: ['古巫祭台'],
    resources: ['毒材', '稀有藥引'],
    starterEligible: false
  },
  '霧雨古祭壇': {
    region: '南疆水網',
    difficulty: 4,
    desc: '終年霧雨覆蓋的古祭區，機關與幻象交疊。',
    nearby: ['祭紋石階', '雨瀑洞窟', '骨木環道'],
    landmarks: ['三環祭柱'],
    resources: ['祭器碎片', '古符文'],
    starterEligible: false
  },
  '草原部落': {
    region: '北境高原',
    difficulty: 2,
    desc: '游牧部落據點，騎兵訓練與交易市集並存。',
    nearby: ['放牧圈', '風帳集市', '馴馬場'],
    landmarks: ['篝火議事圈'],
    resources: ['馬匹', '皮革'],
    starterEligible: true
  },
  '霜狼哨站': {
    region: '北境高原',
    difficulty: 3,
    desc: '邊境哨站，常與雪原掠奪者短兵相接。',
    nearby: ['哨塔步道', '補給棚', '風雪坡'],
    landmarks: ['霜狼旗台'],
    resources: ['軍糧', '哨戒任務'],
    starterEligible: false
  },
  '雪白山莊': {
    region: '北境高原',
    difficulty: 3,
    desc: '積雪山莊，適合閉關訓練也常遇強敵試探。',
    nearby: ['冰橋', '雪松林', '山莊內院'],
    landmarks: ['寒玉演武台'],
    resources: ['冰蓮', '雪參'],
    starterEligible: false
  },
  '玄冰裂谷': {
    region: '北境高原',
    difficulty: 5,
    desc: '裂谷深處寒流亂竄，稍有不慎便會失足。',
    nearby: ['冰脊窄橋', '裂谷深井', '寒流洞口'],
    landmarks: ['玄冰核心'],
    resources: ['寒晶礦'],
    starterEligible: false
  },
  '星潮港': {
    region: '群島航線',
    difficulty: 2,
    desc: '外海航線主港，接駁各島傳送與船運。',
    nearby: ['外港泊位', '星潮倉庫', '航圖館'],
    landmarks: ['潮汐燈塔'],
    resources: ['航運任務', '海圖'],
    starterEligible: true
  },
  '珊瑚環礁': {
    region: '群島航線',
    difficulty: 3,
    desc: '潮汐變化劇烈的礁環地帶，水下遺構密集。',
    nearby: ['礁環外圈', '潛流洞', '淺灘裂口'],
    landmarks: ['珊瑚弧門'],
    resources: ['珍珠', '海晶'],
    starterEligible: false
  },
  '桃花島': {
    region: '群島航線',
    difficulty: 3,
    desc: '機關密布的桃林島，迷路是常態。',
    nearby: ['桃林石橋', '機關庭', '海霧坡'],
    landmarks: ['落英主殿'],
    resources: ['靈芝', '奇花'],
    starterEligible: false
  },
  '潮汐試煉島': {
    region: '群島航線',
    difficulty: 4,
    desc: '碑刻武學聖地，高手雲集，試煉殘酷。',
    nearby: ['碑林洞', '海崖步道', '挑戰台'],
    landmarks: ['太玄石壁'],
    resources: ['秘笈線索', '高階挑戰'],
    starterEligible: false
  },
  '蓬萊仙島': {
    region: '群島航線',
    difficulty: 4,
    desc: '雲海中的靈域島，天地靈氣濃郁。',
    nearby: ['雲橋', '仙草園', '靈泉階'],
    landmarks: ['蓬萊主峰'],
    resources: ['仙草', '靈石'],
    starterEligible: false
  },
  '光明頂': {
    region: '隱秘深域',
    difficulty: 4,
    desc: '高峰聖地，兩派常在周邊爭奪能源節點。',
    nearby: ['聖火廣場', '能量塔', '峽谷索道'],
    landmarks: ['光明主壇'],
    resources: ['高階情報', '能源結晶'],
    starterEligible: false
  },
  '無光礦坑': {
    region: '隱秘深域',
    difficulty: 4,
    desc: '深層礦坑終日無光，礦脈與陷阱並存。',
    nearby: ['舊礦井', '運礦軌道', '塌陷區'],
    landmarks: ['黑曜礦心'],
    resources: ['稀有礦', '機械殘件'],
    starterEligible: false
  },
  '黑木崖': {
    region: '隱秘深域',
    difficulty: 5,
    desc: '暗能量浮空都市，權力鬥爭與暗殺高發。',
    nearby: ['深淵棧道', '暗市中庭', '神教內環'],
    landmarks: ['黑木主崖'],
    resources: ['暗能量', '高風險委託'],
    starterEligible: false
  },
  '天機遺都': {
    region: '隱秘深域',
    difficulty: 5,
    desc: '古代文明遺都，仍有自律防衛系統運作。',
    nearby: ['崩塌穹頂', '遺都主軸', '封鎖中樞'],
    landmarks: ['天機核心塔'],
    resources: ['古代藍圖', '核心晶片'],
    starterEligible: false
  },
  '死亡之海': {
    region: '隱秘深域',
    difficulty: 5,
    desc: '荒漠海域與異常風暴交纏的禁區。',
    nearby: ['黑潮地平線', '沉沙裂隙', '風暴眼'],
    landmarks: ['沉沒巨塔殘骸'],
    resources: ['禁忌遺物'],
    starterEligible: false
  }
};

const MAP_LOCATIONS = REGION_CATALOG.flatMap(region => region.locations);

const LOCATION_DESCRIPTIONS = Object.fromEntries(
  Object.entries(LOCATION_PROFILES).map(([name, profile]) => [name, profile.desc])
);

const LEGACY_LOCATION_ALIASES = {
  '\u4fe0\u5ba2\u5cf6': '潮汐試煉島'
};

const REGION_PORTAL_HUBS = {
  central_core: '襄陽城',
  west_desert: '敦煌',
  southern_delta: '廣州',
  northern_highland: '草原部落',
  island_routes: '星潮港',
  hidden_deeps: '光明頂'
};

function createPortalConnections() {
  const graph = new Map();

  const addNode = (name) => {
    if (!name) return;
    if (!graph.has(name)) graph.set(name, new Set());
  };

  const addEdge = (a, b) => {
    if (!a || !b || a === b) return;
    addNode(a);
    addNode(b);
    graph.get(a).add(b);
    graph.get(b).add(a);
  };

  for (const loc of MAP_LOCATIONS) addNode(loc);

  for (const region of REGION_CATALOG) {
    if (!Array.isArray(region.locations) || region.locations.length === 0) continue;
    const regionHub = REGION_PORTAL_HUBS[region.id] || region.locations[0];

    for (const loc of region.locations) {
      if (loc !== regionHub) addEdge(loc, regionHub);
    }

    for (let i = 0; i < region.locations.length - 1; i++) {
      addEdge(region.locations[i], region.locations[i + 1]);
    }
  }

  const interRegionLinks = [
    ['襄陽城', '敦煌'],
    ['襄陽城', '廣州'],
    ['襄陽城', '草原部落'],
    ['襄陽城', '星潮港'],
    ['襄陽城', '光明頂'],
    ['敦煌', '廣州'],
    ['敦煌', '草原部落'],
    ['廣州', '星潮港'],
    ['星潮港', '光明頂'],
    ['草原部落', '光明頂']
  ];
  for (const [a, b] of interRegionLinks) addEdge(a, b);

  const fallbackHub = MAP_LOCATIONS[0] || '襄陽城';
  for (const loc of MAP_LOCATIONS) {
    const set = graph.get(loc);
    if (!set || set.size > 0 || loc === fallbackHub) continue;
    addEdge(loc, fallbackHub);
  }

  return Object.fromEntries(
    Array.from(graph.entries()).map(([name, set]) => [name, Array.from(set)])
  );
}

const PORTAL_CONNECTIONS = createPortalConnections();

const ANSI = {
  reset: '\u001b[0m',
  brightYellow: '\u001b[1;33m',
  brightCyan: '\u001b[1;36m',
  currentLocation: '\u001b[1;30;43m'
};

function colorizeAll(text, token, colorCode, replacement = token) {
  return text.split(token).join(`${colorCode}${replacement}${ANSI.reset}`);
}

function buildIslandMapAnsi(currentLocation = '') {
  let colored = ISLAND_MAP_TEXT;
  const normalized = LEGACY_LOCATION_ALIASES[currentLocation] || currentLocation;

  if (normalized && MAP_LOCATIONS.includes(normalized)) {
    const marked = `◉${normalized}◉`;
    colored = colorizeAll(colored, normalized, ANSI.currentLocation, marked);
  }

  return colored;
}

function getPortalDestinations(location) {
  if (!location) return [];
  const normalized = LEGACY_LOCATION_ALIASES[location] || location;
  return Array.isArray(PORTAL_CONNECTIONS[normalized]) ? [...PORTAL_CONNECTIONS[normalized]] : [];
}

function getLocationProfile(location) {
  if (!location) return null;
  const normalized = LEGACY_LOCATION_ALIASES[location] || location;
  const profile = LOCATION_PROFILES[normalized];
  if (!profile) return null;
  return {
    name: normalized,
    ...profile,
    nearby: Array.isArray(profile.nearby) ? [...profile.nearby] : [],
    landmarks: Array.isArray(profile.landmarks) ? [...profile.landmarks] : [],
    resources: Array.isArray(profile.resources) ? [...profile.resources] : []
  };
}

function getLocationDifficulty(location) {
  const profile = getLocationProfile(location);
  return profile ? Number(profile.difficulty || 3) : 3;
}

function getNearbyPoints(location, limit = 6) {
  const profile = getLocationProfile(location);
  if (!profile) return [];
  const merged = [...profile.nearby, ...profile.landmarks].filter(Boolean);
  const uniq = [];
  const seen = new Set();
  for (const item of merged) {
    if (seen.has(item)) continue;
    seen.add(item);
    uniq.push(item);
    if (uniq.length >= limit) break;
  }
  return uniq;
}

function getLocationStoryContext(location) {
  const profile = getLocationProfile(location);
  if (!profile) return '附近資訊不足';
  const nearby = getNearbyPoints(location, 5);
  const resourceLine = profile.resources.slice(0, 4).join('、') || '未知';
  const portals = getPortalDestinations(location).slice(0, 3).join('、') || '附近無穩定門';
  return `區域：${profile.region}｜難度：D${profile.difficulty}｜附近：${nearby.join('、') || '未知'}｜特產：${resourceLine}｜傳送門可往：${portals}`;
}

function getBeginnerSpawnLocations() {
  return MAP_LOCATIONS.filter((loc) => {
    const profile = LOCATION_PROFILES[loc];
    if (!profile) return false;
    if (profile.starterEligible === false) return false;
    return Number(profile.difficulty || 3) <= 2;
  });
}

function getRegionOverview() {
  return REGION_CATALOG.map(region => ({ ...region, locations: [...region.locations] }));
}

module.exports = {
  ISLAND_MAP_TEXT,
  buildIslandMapAnsi,
  getPortalDestinations,
  MAP_LOCATIONS,
  LOCATION_DESCRIPTIONS,
  LOCATION_PROFILES,
  REGION_CATALOG,
  getLocationProfile,
  getLocationDifficulty,
  getNearbyPoints,
  getLocationStoryContext,
  getBeginnerSpawnLocations,
  getRegionOverview
};
