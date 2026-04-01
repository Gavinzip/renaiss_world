/**
 * 🎭 Renaiss World - 動態事件系統
 * 50+ 事件 + AI 動態生成
 */

const fs = require('fs');
const path = require('path');
const { getLocationProfile, getNearbyPoints } = require('./world-map');

// ============== 50+ 事件庫（長敘事版）==============
const BASE_EVENTS = [
  // ===== 通用事件（1-20）=====
  {
    id: 'goblin',
    name: '🐾 遭遇哥布林',
    choice: '抽出武器，與哥布林決一死戰！',
    type: 'combat',
    desc: '你沿著Renaiss星球的森林小徑漫步，四周環繞著奇異的熒光植物。陽光透過巨大的葉片灑落，在地上投下斑駁的光影。走著走著，草叢突然劇烈晃動，幾道綠色的身影竄出來——是哥布林！它們拿著生鏽的短刀，眼中閃爍著貪婪的光芒，將你團團包圍！',
    action: 'fight',
    enemy: { name: '哥布林', hp: 50, attack: 15, moves: ['抓撓', '尖叫'], reward: { gold: [20, 40] } }
  },
  {
    id: 'wolf',
    name: '🐺 遭遇狼人',
    choice: '面對狼人的嚎叫，你選擇迎戰！',
    type: 'combat',
    desc: '夜幕降臨在Renaiss星球的荒野，你獨自行走在無人的道路上。月光冷冷地灑在草原上，突然——黑暗中傳來令人毛骨悚然的嚎叫聲！「嗷嗚——」是狼人的叫聲！聲音越來越近，綠色的眼睛在黑暗中閃爍，充滿了嗜血的渴望！',
    action: 'fight',
    enemy: { name: '狼人', hp: 80, attack: 25, moves: ['撕咬', '嚎叫'], reward: { gold: [40, 80] } }
  },
  {
    id: 'wizard',
    name: '🧙 遭遇巫師學徒',
    choice: '魔法師攔路，看來一場惡戰難免！',
    type: 'combat',
    desc: '穿過繁華的Renaiss星球城鎮街道時，一個穿著破舊黑袍的身影突然擋住了你的去路。那是一個巫師學徒，眼中閃爍著不穩定的魔力，手中的法杖微微發光。他冷笑道：「又一個願意奉獻生命的笨蛋...」紫色的電弧開始在法杖上跳動！',
    action: 'fight',
    enemy: { name: '巫師學徒', hp: 120, attack: 35, moves: ['火球', '冰霜'], reward: { gold: [60, 100] } }
  },
  {
    id: 'zombie',
    name: '🧟 遭遇殭屍',
    choice: '面對亡靈的來襲，你毫不畏懼！',
    type: 'combat',
    desc: '你路過一座荒廢的墓地，氣氛陰森得令人窒息。突然，一隻蒼白腐爛的手從坟墓中伸出，接著是第二隻、第三隻...殭屍！它們發出低沉的呻吟，緩緩地向你逼近。腐爛的氣息撲面而來，場面令人作嘔！',
    action: 'fight',
    enemy: { name: '殭屍', hp: 150, attack: 40, moves: ['抓傷', '瘟疫'], reward: { gold: [80, 120] } }
  },
  {
    id: 'herb_gather',
    name: '🌿 采集草藥',
    choice: '俯身細看，辨認那些珍貴的草藥',
    type: 'gather',
    desc: '深入Renaiss星球的山谷中，你發現了一片鬱鬱蔥蔥的草藥園。各種珍稀植物在這裡生長，散發出獨特的香氣。你小心翼翼地辨認著每一株植物，空氣中瀰漫著草本清香，讓人心曠神怡。',
    action: 'forage',
    items: ['止血草', '金銀花', '人參', '靈芝', '何首烏'],
    poisonItems: ['毒蘑菇', '斷腸草', '曼陀羅'],
    rewards: { herb: 1 }
  },
  {
    id: 'fish_catch',
    name: '🐟 捕捉河魚',
    choice: '脫下靴子，悄悄涉水接近魚群',
    type: 'hunt',
    desc: '清澈的河水在Renaiss星球的山間流淌，你蹲在河邊，看著水面下銀光閃閃的魚兒悠游自在。運氣好的話，或許能抓到幾條肥美的河魚來填飽肚子。',
    action: 'hunt',
    animal: { name: '河魚', hp: 0, poison: false, effect: 'hp+15' }
  },
  {
    id: 'rabbit_catch',
    name: '🐰 捕捉野兔',
    choice: '屏住呼吸，輕手輕腳地靠近野兔',
    type: 'hunt',
    desc: '草原上草浪起伏，一隻毛茸茸的野兔突然從草叢中蹦跳出來，牠的長耳朵機警地轉動著。你屏住呼吸，輕手輕腳地靠近...',
    action: 'hunt',
    animal: { name: '野兔', hp: 0, poison: false, effect: 'hp+10' }
  },
  {
    id: 'lost_elder',
    name: '🏠 遇到迷路老人',
    choice: '上前詢問，協助這位迷失方向的老人家',
    type: 'quest',
    desc: '在Renaiss星球的鄉間小路旁，你看到一位白髮蒼蒼的老奶奶正焦急地東張西望，手中緊緊握著一根木製拐杖。她的眼神迷茫而無助，似乎完全不知道自己在哪裡。',
    action: 'quest',
    quest: { type: 'help', target: '老人', reward: 30, reputation: 10 }
  },
  {
    id: 'escort_quest',
    name: '💼 商人請求護送',
    choice: '接受商人的請求，護送他安全抵達',
    type: 'quest',
    desc: '一位穿著華麗絲綢服飾的商人急匆匆地向你走來，他的馬車後面堆滿了沉重的貨物。「這位壯士！」他氣喘吁吁地說道，「護送我到下一個城鎮吧，這一路上盜賊猖獗，我願意付出豐厚的報酬！」',
    action: 'quest',
    quest: { type: 'escort', reward: [50, 150], risk: true }
  },
  {
    id: 'notice_board',
    name: '📢 查看告示板',
    choice: '走近告示板，細看上面的各類公告',
    type: 'quest_board',
    desc: '城鎮廣場中央豎立著一塊巨大的告示板，上面貼滿了各種羊皮紙公告。有的是官方緝拿罪犯的懸賞令，有的是商人的僱傭廣告，還有的是失蹤人口的尋人啟事...',
    action: 'quest_board'
  },
  {
    id: 'tavern_gossip',
    name: '🍺 酒樓聽傳聞',
    choice: '走進酒樓，找個角落坐下聆聽傳聞',
    type: 'social',
    desc: '走進Renaiss星球最熱鬧的酒樓，喧鬧的氣氛迎面而來。各色人等聚集在此——商人冒險者俠客盜賊...他們大聲談笑，分享著各自的經歷和傳聞。你找了個角落的位置坐下，豎起耳朵仔細聆聽...',
    action: 'gossip'
  },
  {
    id: 'market',
    name: '🛒 逛市場',
    type: 'shop',
    desc: 'Renaiss星球的市集廣場人山人海，各色攤位林立。有賣異國香料的商人、有展示神秘寶石的匠人、還有街邊小吃攤飄來的香味...你漫步其中，感受著這繁華的氛圍。',
    action: 'shop'
  },
  {
    id: 'explore',
    name: '🗺️ 探索附近',
    type: 'explore',
    desc: '你決定離開主道，去探索Renaiss星球那些不為人知的角落。穿過竹林、越過小溪，你發現了許多平常看不到的景色——古老的石碑、神秘的岩畫、或許還有些什麼驚喜在等著你...',
    action: 'explore'
  },
  {
    id: 'inn_rest',
    name: '😴 找客棧休息',
    type: 'rest',
    desc: '找了家看起來溫暖舒適的客棧。老闆娘笑臉相迎，帶你參觀了整潔的房間。窗外細雨綿綿，你在柔软的床铺上沉沉睡去，修復著一路走來的疲憊。',
    action: 'rest',
    cost: 10,
    heal: 20
  },
  {
    id: 'meditate',
    name: '🧘 打坐修煉',
    type: 'train',
    desc: '你找了Renaiss星球一處清幽的山洞，盤腿而坐，閉目凝神。感受著周圍濃郁的靈氣，你開始調整呼吸，讓內力在體內緩緩流轉...',
    action: 'meditate',
    mpGain: 5
  },
  {
    id: 'meet_hero',
    name: '👤 遇到其他俠客',
    type: 'social',
    desc: '在Renaiss星球的旅途中，你遇到了一位氣質不凡的俠客。他穿著素色長衫，腰間佩劍，見到你時微微一笑，點頭示意。短暫的交談中，你感受到他身上深厚的內力修為。',
    action: 'meet'
  },
  {
    id: 'treasure_box',
    name: '📦 發現路邊寶箱',
    type: 'random',
    desc: '沿著Renaiss星球的偏僻小徑前行時，你注意到路邊有個被草叢半遮半掩的木箱。箱子外表斑駁，看起來已被遺棄多年，但或許裡面還藏有些什麼寶藏？',
    action: 'treasure'
  },
  {
    id: 'street_perform',
    name: '🎭 街頭表演',
    type: 'perform',
    desc: '你選了Renaiss星球熱鬧的街角，開始街頭表演。或許是武術、或许是杂耍、又或许是音樂...你使出渾身解數，很快便吸引了路人圍觀。掌聲與喝采聲中，你獲得了來自四面八方的打賞！',
    action: 'perform'
  },
  {
    id: 'turtle_catch',
    name: '🐢 路邊有烏龜',
    type: 'hunt',
    desc: '正所謂「龜千年而長生」，你在路邊發現了一隻正在緩慢爬行的烏龜殼獸。牠的眼神中似乎蘊含著某種智慧，動作遲緩但姿態優雅。',
    action: 'hunt',
    animal: { name: '烏龜', hp: 0, poison: false, effect: 'defense+1' }
  },
  {
    id: 'rain_day',
    name: '🌧️ 下雨天氣',
    type: 'weather',
    desc: '天空突然烏雲密布，雨滴開始傾斜而下。不過雨天也有雨天的好處——空氣更加清新，某些草藥在雨後會更容易採集。',
    action: 'weather',
    effect: 'luck-10',
    bonus: '草藥量增加'
  },
  {
    id: 'sunny_day',
    name: '☀️ 晴天',
    type: 'weather',
    desc: 'Renaiss星球的陽光溫暖而明亮，萬里無雲。陽光灑在身上，讓人心情格外舒暢。這樣的好天氣，運氣似乎也會跟著變好呢！',
    action: 'weather',
    effect: 'luck+10'
  },

  // ===== 正派專屬事件（21-30）=====
  {
    id: 'help_justice',
    name: '⚔️ 幫人打抱不平',
    type: 'positive',
    desc: 'Renaiss星球的巷弄中，你聽到遠處傳來呼救聲與得意的笑聲。加快腳步趕到現場，只見幾個流氓正在欺負一個手無寸鐵的村民！',
    action: 'justice',
    reputation: 10,
    risk: true
  },
  {
    id: 'help_elder_cross',
    name: '👵 幫老奶奶過馬路',
    type: 'positive',
    desc: '在Renaiss星球繁忙的街道上，你看到一位白髮蒼蒼的老奶奶站在路邊遲疑著。來往的馬車與行人絡繹不絕，她顯然不敢獨自過馬路。',
    action: 'help',
    reputation: 5,
    reward: '小禮物'
  },
  {
    id: 'arrest_thief',
    name: '🏛️ 幫官府緝拿盜賊',
    type: 'positive',
    desc: '官府貼出告示，懸賞緝拿盜賊',
    action: 'quest',
    quest: { type: 'arrest', reward: [80, 150], reputation: 20 }
  },
  {
    id: 'free_clinic',
    name: '💊 免費義診',
    type: 'positive',
    desc: '你決定在城裡免費為百姓義診',
    action: 'clinic',
    reputation: 30
  },
  {
    id: 'temple_pray',
    name: '📿 寺廟祈福',
    type: 'positive',
    desc: '寺廟裡香火鼎盛',
    action: 'pray',
    reputation: 5,
    luck: 5
  },
  {
    id: 'treat_tea',
    name: '🍵 請路人喝茶',
    type: 'positive',
    desc: '你請旁邊的旅人喝了杯茶',
    action: 'treat',
    cost: 20,
    reputation: 10
  },
  {
    id: 'teach_newbie',
    name: '🗡️ 指點新手武藝',
    type: 'positive',
    desc: '遇到一個習武的新手',
    action: 'teach',
    reputation: 10
  },

  // ===== Digital 壓力事件（31-40）=====
  {
    id: 'rob_merchant',
    name: '🗡️ 襲擊商人',
    type: 'negative',
    desc: '看到一個有錢的商人獨自趕路...',
    action: 'rob',
    reward: [100, 200],
    wanted: 20
  },
  {
    id: 'assassinate',
    name: '💀 暗殺目標',
    type: 'negative',
    desc: '有人出高價僱你暗殺某人...',
    action: 'assassinate',
    reward: 300,
    wanted: 50
  },
  {
    id: 'collect_protection',
    name: '🏴‍☠️ 收取保護費',
    type: 'negative',
    desc: '店家在付保護費名單上...',
    action: 'protection',
    reward: [50, 100],
    wanted: 15
  },
  {
    id: 'poison_revenge',
    name: '☠️ 下毒報復',
    type: 'negative',
    desc: '有人得罪了你，你想要報復...',
    action: 'poison',
    reward: '對方重傷',
    wanted: 30
  },
  {
    id: 'extort',
    name: '🖤 恐嚇勒索',
    type: 'negative',
    desc: '發現了一個有把柄在手的人...',
    action: 'extort',
    reward: [80, 150],
    wanted: 25
  },
  {
    id: 'join_gang',
    name: '🌑 加入黑幫',
    type: 'negative',
    desc: '黑幫正在招募新人...',
    action: 'gang',
    reward: '情報',
    wanted: 10
  },
  {
    id: 'test_poison',
    name: '🩸 實驗毒藥',
    type: 'negative',
    desc: '你決定用路人測試新研發的毒藥...',
    action: 'experiment',
    reward: '習得毒招',
    wanted: 20
  },
  {
    id: 'bomb_building',
    name: '💣 炸毀建築物',
    type: 'negative',
    desc: '你決定炸掉某個建築物製造混亂...',
    action: 'sabotage',
    reward: '混亂中獲利',
    wanted: 60
  },

  // ===== 特殊隨機事件（41-50）=====
  {
    id: 'fortune_teller',
    name: '🔮 神秘占卜師',
    type: 'special',
    desc: '路邊有個神秘的占卜師...',
    action: 'fortune'
  },
  {
    id: 'dragon_lair',
    name: '🐉 發現龍穴',
    type: 'special',
    desc: '山壁上有一個巨大的洞穴...',
    action: 'dragon'
  },
  {
    id: 'shooting_star',
    name: '🌟 看到流星',
    type: 'special',
    desc: '一顆流星划過夜空...',
    action: 'wish',
    luck: 20
  },
  {
    id: 'secret_manual',
    name: '📚 發現武功秘籍',
    type: 'special',
    desc: '草叢中發現了一本泛黃的書籍...',
    action: 'manual'
  },
  {
    id: 'hidden_passage',
    name: '🗝️ 發現隱藏通道',
    type: 'special',
    desc: '牆壁上似乎有什麼機關...',
    action: 'passage'
  },
  {
    id: 'foreign_merchant',
    name: '🤝 結識外國商人',
    type: 'special',
    desc: '一個穿著奇特的商人向你走來...',
    action: 'foreign'
  },
  {
    id: 'martial_contest',
    name: '🏆 參加武術大賽',
    type: 'special',
    desc: '正好趕上武術大賽報名！',
    action: 'contest',
    cost: 100,
    reward: 500
  },
  {
    id: 'underground_arena',
    name: '🎰 地下競技場',
    type: 'special',
    desc: '有人向你介紹地下競技場...',
    action: 'arena',
    risk: 'reward*2'
  },
  {
    id: 'found_wallet',
    name: '💰 撿到錢包',
    type: 'special',
    desc: '地上有個精美的錢包...',
    action: 'wallet',
    content: 200,
    reputation: -10
  },
  {
    id: 'ghost_encounter',
    name: '👻 遇到幽靈',
    type: 'special',
    desc: '一陣寒意袭来...',
    action: 'ghost',
    hp: -10
  },
  {
    id: 'fox_guide',
    name: '🦊 狐狸引路',
    type: 'special',
    desc: '一隻白狐向你點頭後轉身離去...',
    action: 'guide'
  },
  {
    id: 'ancient_relic',
    name: '🏺 發現古人遺物',
    type: 'special',
    desc: '挖掘時發現了古人的遺物...',
    action: 'relic'
  },
  {
    id: 'con_artist',
    name: '🎭 Renaiss星球騙子',
    type: 'special',
    desc: '有人向你推銷「獨家秘方」...',
    action: 'con'
  },
  {
    id: 'caravan_attack',
    name: '🛤️ 商隊遇襲',
    type: 'special',
    desc: '看到商隊被匪徒攻擊！',
    action: 'caravan',
    choice: true
  },
  {
    id: 'rainbow',
    name: '🌈 彩虹出現',
    type: 'special',
    desc: '雨後天空中出現了一道彩虹！',
    action: 'rainbow',
    luck: 15,
    duration: 3
  }
];

// ============== 師父列表 ==============
const MASTERS = [
  // 通用師父
  { id: 'gold_master', name: '💰 金老闆', element: '金', teaches: ['金針刺穴', '暴雨梨花', '金鐘罩'], price: 500, region: '通用', desc: 'Renaiss星球上有名的兵器商，傳聞他的金針功夫出神入化' },
  { id: 'wood_master', name: '🌿 木道長', element: '木', teaches: ['天女散花', '羅網天蛛', '回春術'], price: 400, region: '通用', desc: '隱居山林的道士，擅長草藥與自然之力' },
  { id: 'water_master', name: '💧 水娘娘', element: '水', teaches: ['楊枝淨水', '寒冰掌', '洪水滔天'], price: 600, region: '通用', desc: '傳說中的俠女，輕功水上飄' },
  { id: 'earth_master', name: '🪨 土地公', element: '土', teaches: ['羅漢金剛腿', '落石陷阱', '流沙陣'], price: 450, region: '通用', desc: '當地的守護神，擅長防禦之術' },
  
  // 正派師父
  { id: 'fire_master_good', name: '🔥 烈火俠', element: '火', teaches: ['烈焰焚天', '赤焰甲'], price: 700, region: '正派', desc: '俠義為先的火系高手', requires: '正派' },
  { id: 'combo_master', name: '✨ 白蓮花仙', element: '複合', teaches: ['風火燎原', '雷霆萬鈞'], price: 1500, region: '正派', desc: '隱世高人，融合陰陽五行', requires: '正派' },
  
  // 機變派師父（同屬正義，但走捷徑/博弈手段）
  { id: 'dark_master', name: '🌑 黑影教主', element: '暗', teaches: ['吸星大法', '無形鎖脈', '離魂散'], price: 1000, region: '機變派', desc: '擅長情報與佈局，教你以最小代價換最大成果', requires: '機變派' },
  { id: 'poison_master', name: '☠️ 毒娘子', element: '毒', teaches: ['七步斷腸散', '化骨水', '蛛絲縛魂'], price: 700, region: '機變派', desc: '以奇襲與反制見長，不主張硬拼', requires: '機變派' },
  { id: 'evil_fire_master', name: '💀 火雲邪神', element: '火毒', teaches: ['地獄烈火', '爆炸信號彈', '熱砂地獄'], price: 800, region: '機變派', desc: '風險收益派，重視時機與賭注', requires: '機變派' },

  // Renaiss 核心（可拜師）
  { id: 'winchman', name: '🏛️ Winchman', element: '秩序', teaches: ['風火燎原', '雷霆萬鈞', '洪水滔天'], price: 2500, region: 'Renaiss', desc: 'Renaiss 統治者，主張秩序與市場公信' },
  { id: 'tom', name: '🧠 Tom', element: '策略', teaches: ['雷霆萬鈞', '羅漢金剛腿', '金鐘罩'], price: 1600, region: 'Renaiss', desc: '副手之一，擅長穩定局勢與戰場節奏' },
  { id: 'harry', name: '🛡️ Harry', element: '守御', teaches: ['金鐘罩', '赤焰甲', '回春術'], price: 1600, region: 'Renaiss', desc: '副手之一，擅長反制與續戰' },
  { id: 'kathy', name: '✨ Kathy', element: '複合', teaches: ['風火燎原', '火蓮碎', '天女散花'], price: 1400, region: 'Renaiss', desc: '核心幹部，精通爆發與連段' },
  { id: 'yuzu', name: '🌊 Yuzu', element: '水木', teaches: ['洪水滔天', '寒冰掌', '回春術'], price: 1400, region: 'Renaiss', desc: '核心幹部，擅長控場與回復' },
  { id: 'leslie', name: '⚡ Leslie', element: '雷火', teaches: ['雷霆萬鈞', '烈焰焚天', '暴雨梨花'], price: 1500, region: 'Renaiss', desc: '核心幹部，高壓進攻與破防專家' },

  // 注意：Digital 四大天王是敵對壓力來源，不可拜師。
];

// ============== 史詩魔王列表 ==============
const EPIC_BOSSES = [
  { id: 'gold_dragon', name: '🐉 黃金龍', hp: 300, attack: 55, moves: 4, reward: { gold: [500, 700], move: true }, region: '通用' },
  { id: 'abyss_demon', name: '👹 深淵魔', hp: 350, attack: 60, moves: 5, reward: { gold: [700, 900], move: true }, region: '通用' },
  { id: 'phoenix', name: '🦅 修羅鳳', hp: 280, attack: 65, moves: 4, reward: { gold: [600, 800], move: true }, region: '通用' },
  { id: 'skeleton_king', name: '💀 骸骨王', hp: 400, attack: 70, moves: 6, reward: { gold: [1000, 1600], move: true }, region: '通用' }
];

// ============== 根據玩家生成7個創意按鈕（每次都不同）==============
function generateEventChoices(player, worldState) {
  const choices = [];
  const alignment = player.alignment || '正派';
  const location = player.location || '襄陽城';
  
  // 根據地點和情境生成創意選項
  const locationContext = getLocationContext(location);
  
  // 收集所有可用事件
  const allEvents = [];
  
  // 1. 地點相關事件（隨機選2-3個）
  const locationEvents = getLocationBasedEvents(location, alignment);
  allEvents.push(...locationEvents);
  
  // 2. 通用互動事件
  const interactionEvents = getInteractionEvents(alignment);
  allEvents.push(...interactionEvents);
  
  // 3. 隨機事件
  const randomEvents = getRandomEvents(alignment);
  allEvents.push(...randomEvents);
  
  // 4. 特殊/意外選項
  const specialOptions = getSpecialOptions(player);
  allEvents.push(...specialOptions);
  
  // 5. 基礎事件庫
  if (BASE_EVENTS) {
    allEvents.push(...BASE_EVENTS);
  }
  
  // 打亂順序（Fisher-Yates）
  for (let i = allEvents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allEvents[i], allEvents[j]] = [allEvents[j], allEvents[i]];
  }
  
  // 確保7個（不夠就隨機生成）
  while (choices.length < 7 && allEvents.length > 0) {
    const idx = Math.floor(Math.random() * allEvents.length);
    const event = allEvents.splice(idx, 1)[0];
    
    // 避免重複ID
    if (!choices.find(c => c.id === event.id)) {
      choices.push(event);
    }
  }
  
  // 如果還不夠7個，生成隨機選項
  const extraChoices = [
    { id: 'random_1', name: '🎲 隨機冒險', choice: '閉上眼睛隨便選個方向，看看命運會帶來什麼' },
    { id: 'random_2', name: '👀 四處張望', choice: '站在原地觀察周圍環境，看看有什麼有趣的事物' },
    { id: 'random_3', name: '🗣️ 大聲呼喊', choice: '大聲喊出你的存在，看看誰會回應' },
    { id: 'random_4', name: '💤 原地休息', choice: '找個舒適的地方休息一下，恢復體力' },
    { id: 'random_5', name: '🔄 換個地點', choice: '離開這裡，前往其他區域探索' }
  ];
  
  while (choices.length < 7) {
    const idx = Math.floor(Math.random() * extraChoices.length);
    choices.push(extraChoices.splice(idx, 1)[0]);
  }
  
  return choices.slice(0, 7);
}

// 根據地點獲取情境描述
function getLocationContext(location) {
  const contexts = {
    '襄陽城': { desc: '繁華熱鬧的兵家必爭之地', mood: '緊張', special: '郭大俠' },
    '大都': { desc: '皇城腳下戒備森嚴', mood: '壓抑', special: '皇宮' },
    '洛陽城': { desc: '牡丹花城繁華似錦', mood: '悠閒', special: '武林高手' },
    '敦煌': { desc: '絲路重鎮風沙漫天', mood: '神秘', special: '商人' },
    '廣州': { desc: '南海港口繁華開放', mood: '活力', special: '番商' },
    '大理': { desc: '四季如春山清水秀', mood: '祥和', special: '少數民族' },
    '桃花島': { desc: '機關重重世外桃源', mood: '奇幻', special: '東邪' },
    '俠客島': { desc: '武學聖地壁上刻著秘籍', mood: '莊嚴', special: '秘籍' },
    '雪白山莊': { desc: '北疆寒門冰封千里', mood: '凜冽', special: '寒冰' },
    '草原部落': { desc: '天蒼蒼野茫茫風吹草低', mood: '開闊', special: '牧民' },
    '光明頂': { desc: '明教聖火熊熊燃燒', mood: '熱血', special: '教主' },
    '黑木崖': { desc: '日月神教陰森詭異', mood: '詭譎', special: '任我行' }
  };
  if (contexts[location]) return contexts[location];
  const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  if (!profile) return { desc: 'Renaiss星球某處', mood: '平靜', special: '陌生人' };
  const nearby = typeof getNearbyPoints === 'function' ? getNearbyPoints(location, 3) : [];
  return {
    desc: profile.desc || `${location}附近仍有許多未解謎團`,
    mood: Number(profile.difficulty || 3) >= 4 ? '詭譎' : Number(profile.difficulty || 3) <= 2 ? '活力' : '緊張',
    special: nearby[0] || (Array.isArray(profile.landmarks) ? profile.landmarks[0] : '') || '當地住民'
  };
}

// 根據地點獲取相關事件
function getLocationBasedEvents(location, alignment) {
  const profile = typeof getLocationProfile === 'function' ? getLocationProfile(location) : null;
  const nearby = typeof getNearbyPoints === 'function' ? getNearbyPoints(location, 3) : [];
  const nearbyHint = nearby.length > 0 ? nearby.join('、') : '周邊小巷';
  const difficulty = Number(profile?.difficulty || 3);
  const resourceLine = Array.isArray(profile?.resources) ? profile.resources.join('、') : '';
  const events = [];
  
  // 戰鬥相關
  events.push({
    id: 'local_threat',
    name: '🏯 發現可疑人物',
    choice: '悄悄跟蹤，看看他們有何企圖',
    desc: '在' + location + '的' + nearbyHint + '一帶，你注意到幾個鬼鬼祟祟的身影正在低聲商議...',
    action: 'fight',
    type: 'combat',
    enemy: { name: '可疑人物', hp: 60, attack: 18, moves: ['偷襲', '逃跑'], reward: { gold: [30, 60] } }
  });
  
  // 互動相關
  events.push({
    id: 'local_npc',
    name: '👤 遇到當地居民',
    choice: '上前友善地打招呼，詢問當地風土人情',
    desc: '一位當地居民正在' + (nearby[0] || '路邊') + '擺攤，見你走近便熱情地招呼...',
    action: 'social'
  });
  
  // 探索相關
  events.push({
    id: 'local_explore',
    name: '🔍 四處探查',
    choice: '遠離人群，去探索那些隱蔽的角落',
    desc: '你決定沿著' + (nearby[1] || location) + '一帶四處探查，看看有沒有什麼隱藏的機會或危險...',
    action: 'explore'
  });

  if (profile && Array.isArray(profile.resources) && profile.resources.length > 0) {
    events.push({
      id: 'local_resource',
      name: '📦 探查在地資源',
      choice: `沿著線索尋找${profile.resources[0]}相關補給`,
      desc: `${location}盛產${profile.resources.slice(0, 2).join('、')}，你聽說${nearby[2] || '一條側巷'}有一批新貨剛到。`,
      action: 'explore'
    });
  }

  const herbChance = difficulty <= 2 ? 0.34 : difficulty === 3 ? 0.48 : 0.56;
  if (Math.random() < herbChance) {
    const herbHotspot = nearby[0] || '濕地邊緣';
    events.push({
      id: `rare_herb_${location}`,
      name: '🌿 稀有草藥帶',
      choice: `沿著${herbHotspot}的香氣尋找稀有草藥`,
      desc: `${location}近期盛傳有珍稀藥材現身，${herbHotspot}一帶出現了不尋常的靈氣波動。`,
      action: 'forage'
    });
  }

  const oreChance = /礦|晶|遺物|藍圖|核心/.test(resourceLine)
    ? 0.62
    : (difficulty >= 4 ? 0.45 : 0.24);
  if (Math.random() < oreChance) {
    const oreSpot = nearby[1] || '崖壁裂口';
    events.push({
      id: `ore_cache_${location}`,
      name: '⛏️ 礦脈裂隙',
      choice: `前往${oreSpot}探勘礦脈與古代寶藏`,
      desc: `${location}傳出礦脈外露的消息，${oreSpot}附近可能挖到高價稀有礦與古代殘件。`,
      action: 'treasure'
    });
  }

  const greedyMonsters = ['貪財地精', '竊袋鼬獸', '銅牙鼠王', '黑市搬運怪'];
  const greedyName = greedyMonsters[Math.floor(Math.random() * greedyMonsters.length)];
  const greedyChance = difficulty >= 4 ? 0.58 : difficulty === 3 ? 0.33 : 0.16;
  if (Math.random() < greedyChance) {
    events.push({
      id: `greedy_raider_${location}`,
      name: '🦝 貪財怪物出沒',
      choice: `追擊偷走行商財物的${greedyName}`,
      desc: `${location}傳出失竊騷動，一隻${greedyName}正拖著贓物往${nearby[2] || '巷尾'}逃竄。`,
      action: 'fight',
      type: 'combat',
      enemy: {
        name: greedyName,
        hp: difficulty >= 5 ? 108 : difficulty >= 4 ? 90 : 72,
        attack: difficulty >= 5 ? 32 : difficulty >= 4 ? 25 : 20,
        moves: ['投擲贓物', '煙霧逃逸', '背刺'],
        reward: { gold: difficulty >= 4 ? [95, 185] : [55, 120] }
      }
    });
  }

  // 正派可在任意地區出現，但低難區降頻，避免新手過早拿到過強資源
  const orderMeetRate = difficulty <= 2 ? 0.18 : difficulty === 3 ? 0.42 : 0.58;
  if (Math.random() < orderMeetRate) {
    events.push({
      id: 'order_patrol',
      name: '🛡️ 遇到正派巡行者',
      choice: '上前交談，詢問是否有機會受指點',
      desc: `一支正派巡行隊在${location}巡查秩序，隊長停下腳步觀察你的身手。`,
      action: 'social',
      mentorOffer: difficulty >= 3
    });
  }

  // Digital 僅在高難度區域（D4-D5）出現
  if (difficulty >= 4) {
    events.push({
      id: 'chaos_raiders',
      name: '🩸 Digital 斥候現身',
      choice: '保持距離追蹤，找出他們的目的',
      desc: `${location}的高危區傳出騷動，Digital 斥候疑似正在踩點與滲透。`,
      action: 'fight',
      type: 'combat',
      enemy: {
        name: 'Digital 斥候',
        hp: difficulty >= 5 ? 95 : 78,
        attack: difficulty >= 5 ? 28 : 22,
        moves: ['偷襲', '煙霧彈', '撤離'],
        reward: { gold: [80, 160] }
      }
    });
  }
  
  return events;
}

// 通用互動事件
function getInteractionEvents(alignment) {
  return [
    {
      id: ' Tavern',
      name: '🍺 進入酒樓',
      choice: '找個位置坐下，點些酒菜，順便聽聽江湖傳聞',
      desc: '酒樓裡人聲鼎沸，三教九流匯聚於此，正是打探消息的好地方...',
      action: 'gossip'
    },
    {
      id: 'market',
      name: '🛒 逛集市',
      choice: '在熱鬧的集市裡閒逛，看看有什麼新奇玩意',
      desc: '集市上人山人海，各式各樣的商品琳瑯滿目，小贩的叫賣聲不絕於耳...',
      action: 'shop'
    },
    {
      id: 'rest',
      name: '🏠 找客棧休息',
      choice: '找一家看起來乾淨舒適的客棧，好好休息一下',
      desc: '折騰了半天，你感到有些疲憊，決定找個地方歇歇腳...',
      action: 'rest',
      cost: 10,
      heal: 30
    },
    {
      id: 'train',
      name: '🧘 找地方修煉',
      choice: '尋找一處清幽之地，打坐修煉提升內力',
      desc: '你聽說' + (alignment === '正派' ? '某處風景絕佳' : '某處靈氣充沛') + '，正是修煉的好地方...',
      action: 'meditate',
      mpGain: 15
    }
  ];
}

// 隨機事件
function getRandomEvents(alignment) {
  const positive = [
    {
      id: 'helper',
      name: '🤝 遇到需要幫助的人',
      choice: '主動上前詢問，看看能否幫上什麼忙',
      desc: '路邊坐著一位愁眉苦臉的旅人，似乎遇到了什麼困難...',
      action: 'quest',
      reputation: 10,
      reward: 30
    },
    {
      id: 'discovery',
      name: '✨ 意外發現',
      choice: '好奇地走近查看，說不定是什麼寶物',
      desc: '路邊的草叢中似乎閃爍著微弱的光芒，引起了你的注意...',
      action: 'treasure'
    }
  ];
  
  const negative = [
    {
      id: 'trick',
      name: '🎭 遇到騙局',
      choice: '冷靜觀察，看看他們在搞什麼鬼',
      desc: '街邊圍了一圈人，似乎有人在玩什麼把戲...',
      action: 'trick'
    },
    {
      id: 'ambush',
      name: '⚠️ 察覺埋伏',
      choice: '提高警覺，隨時準備戰鬥或逃跑',
      desc: '你隱約感覺到一股殺意，似乎有人在暗中窺視...',
      action: 'fight',
      enemy: { name: '伏擊者', hp: 50, attack: 20, moves: ['偷襲', '包圍'], reward: { gold: [40, 80] } }
    }
  ];
  
  return [...positive, ...negative].sort(() => Math.random() - 0.5);
}

// 特殊選項（創意/意外）
function getSpecialOptions(player) {
  const options = [
    {
      id: 'wm_sighting',
      name: '🌟 聽聞 WM 傳聞',
      choice: '豎起耳朵仔細聆聽，最近 WM 有沒有什麼動靜？',
      desc: '最近江湖上流傳著一個傳說，說 WM——那個傳奇中的神秘人物——似乎在附近出沒...',
      action: 'rumor',
      special: 'wm'
    },
    {
      id: 'destiny',
      name: '🔮 感應天命',
      choice: '閉眼感受天地靈氣的流動，讓直覺引導你',
      desc: '你突然感到一股奇妙的預感，似乎冥冥之中自有安排...',
      action: 'special'
    },
    {
      id: 'pet_intuition',
      name: '🐾 寵物預感',
      choice: '低頭詢問寵物，問問它嗅到了什麼',
      desc: '你的寵物突然變得躁動不安，似乎感應到了什麼特殊的氣息...',
      action: 'pet_sense'
    }
  ];
  
  // 返回隨機一個（作為陣列）
  return [options[Math.floor(Math.random() * options.length)]];
}

// ============== AI 動態生成按鈕 ==============
function generateAIOption(player, luck) {
  const alignment = player.alignment || '正派';
  
  // 50% AI正常想到的
  if (Math.random() < 0.5) {
    const normalOptions = [
      { id: 'ai_walk', name: '🚶 漫步探索', choice: '漫無目的地四處遊逛，看看會有什麼發現', desc: '漫無目的地在Renaiss星球漫步...' },
      { id: 'ai_eat', name: '🍜 尋找美食', choice: '肚子有點餓了，去找些好吃的填飽肚子', desc: '你的肚子開始咕咕叫了...' },
      { id: 'ai_exercise', name: '🏋️ 鍛煉身體', choice: '找個僻靜處修煉一番，增強實力', desc: '你找了一處空地，開始認真鍛煉...' },
      { id: 'ai_chat', name: '💬 找人聊天', choice: '隨機找個人閒聊幾句打發時間', desc: '你在人群中尋找可以聊天的人...' },
      { id: 'ai_rest', name: '🛏️ 回客棧休息', choice: '找家客棧好好休息一下恢復體力', desc: '你找了一家客棧，打算好好休息...' }
    ];
    return normalOptions[Math.floor(Math.random() * normalOptions.length)];
  }
  
  // 50% 根據幸運值生成
  const luckBonus = (luck - 50) / 10;
  const isGood = Math.random() + luckBonus * 0.1 > 0.4;
  
  if (isGood) {
    return {
      id: 'ai_lucky',
      name: '✨ 好運降臨',
      choice: '隱約感覺會有好事發生，順其自然地前行',
      desc: '你感到一股暖流湧上心頭，似乎有好事將至...'
    };
  } else {
    return {
      id: 'ai_bad',
      name: '😰 不妙預感',
      choice: '直覺告訴你要小心行事，處處提防',
      desc: '你感到一陣不安，總覺得會有什麼不好的事...'
    };
  }
}

// ============== 執行事件結果 ==============
function executeEvent(event, player) {
  const luck = player.stats?.運氣 || 50;
  const food = require('./food-system');
  
  switch (event.action) {
    case 'fight':
      // 戰鬥
      return {
        type: 'combat',
        message: `${event.desc}`,
        enemy: event.enemy,
        canFlee: true,
        fleeRate: 0.7,
        fleeAttempts: 2
      };
      
    case 'forage':
      // 采集
      const forageResult = food.forageHerb(luck);
      return {
        type: 'gather',
        message: `${event.desc || ''}`.trim(),
        item: forageResult.food,
        success: forageResult.success
      };
      
    case 'hunt':
      const huntResult = food.huntAnimal(luck);
      return {
        type: 'hunt',
        message: `${event.desc || ''}`.trim(),
        item: huntResult.food,
        success: huntResult.success
      };
      
    case 'quest':
      return {
        type: 'quest',
        message: `${event.desc || ''}`.trim(),
        quest: event.quest
      };
      
    case 'rest':
      const hpGain = event.heal || 20;
      return {
        type: 'rest',
        message: `${event.desc || ''}`.trim(),
        hpGain: hpGain,
        cost: event.cost
      };
      
    case 'meditate':
      const mpGain = event.mpGain || 5;
      return {
        type: 'meditate',
        message: `${event.desc || ''}`.trim(),
        mpGain: mpGain
      };
      
    case 'shop':
      return {
        type: 'shop',
        message: `${event.desc || ''}`.trim()
      };

    case 'market_renaiss':
      return {
        type: 'market_renaiss',
        message: `${event.desc || ''}`.trim()
      };

    case 'market_digital':
      return {
        type: 'market_digital',
        message: `${event.desc || ''}`.trim()
      };

    case 'social':
      return {
        type: 'social',
        message: `${event.desc || ''}`.trim(),
        reputation: event.mentorOffer ? 8 : 3
      };

    case 'teach':
      return {
        type: 'learn_move',
        message: `${event.desc || ''}`.trim(),
        canLearn: true
      };
      
    case 'justice':
    case 'help':
      return {
        type: 'good_deed',
        message: `${event.desc || ''}`.trim(),
        reputation: event.reputation || 5,
        risk: event.risk
      };
      
    case 'rob':
    case 'assassinate':
    case 'protection':
    case 'extort':
      return {
        type: 'evil_deed',
        message: `${event.desc || ''}`.trim(),
        gold: event.reward,
        wanted: event.wanted
      };
      
    case 'fortune':
      return {
        type: 'fortune',
        message: `${event.desc || ''}`.trim(),
        fortuneTier: Math.floor(Math.random() * 5) + 1
      };
      
    case 'dragon':
      return {
        type: 'epic_boss',
        message: `${event.desc || ''}`.trim(),
        boss: EPIC_BOSSES[Math.floor(Math.random() * EPIC_BOSSES.length)]
      };
      
    case 'wish':
      return {
        type: 'wish',
        message: `${event.desc || ''}`.trim(),
        luckBonus: event.luck
      };
      
    case 'manual':
      return {
        type: 'learn_move',
        message: `${event.desc || ''}`.trim()
      };
      
    case 'treasure':
      const treasures = Math.floor(Math.random() * 100) + 50;
      return {
        type: 'treasure',
        message: `${event.desc || ''}`.trim(),
        gold: treasures
      };
      
    case 'perform':
      const perfRoll = Math.random();
      if (perfRoll > 0.7) {
        return {
          type: 'perform_success',
          message: `${event.desc || ''}`.trim(),
          gold: 100,
          reputation: 20
        };
      } else if (perfRoll > 0.3) {
        return {
          type: 'perform_normal',
          message: `${event.desc || ''}`.trim(),
          gold: 10
        };
      } else {
        return {
          type: 'perform_fail',
          message: `${event.desc || ''}`.trim(),
          gold: 0,
          risk: '有人想找你打架'
        };
      }

    case 'explore':
      return {
        type: 'explore',
        message: `${event.desc || event.choice || ''}`.trim(),
        gold: Math.floor(Math.random() * 8) + 8 // 8~15
      };
      
    default:
      return {
        type: 'explore',
        message: `${event.desc || event.choice || ''}`.trim()
      };
  }
}

// ============== 世界公告系統 ==============
const WORLD_EVENTS_FILE = path.join(__dirname, 'data', 'world_events.json');

function getWorldEvents() {
  if (!fs.existsSync(WORLD_EVENTS_FILE)) {
    return { events: [], modifiedLocations: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(WORLD_EVENTS_FILE, 'utf8'));
  } catch (e) {
    return { events: [], modifiedLocations: {} };
  }
}

function addWorldEvent(message, type = 'normal') {
  const data = getWorldEvents();
  data.events.unshift({
    message,
    type,
    timestamp: Date.now()
  });
  // 只保留最近100條
  data.events = data.events.slice(0, 100);
  fs.writeFileSync(WORLD_EVENTS_FILE, JSON.stringify(data, null, 2));
}

function modifyLocation(location, change) {
  const data = getWorldEvents();
  if (!data.modifiedLocations[location]) {
    data.modifiedLocations[location] = [];
  }
  data.modifiedLocations[location].push({
    change,
    timestamp: Date.now()
  });
  fs.writeFileSync(WORLD_EVENTS_FILE, JSON.stringify(data, null, 2));
}

function getLocationChanges(location) {
  const data = getWorldEvents();
  return data.modifiedLocations[location] || [];
}

module.exports = {
  BASE_EVENTS,
  MASTERS,
  EPIC_BOSSES,
  generateEventChoices,
  generateAIOption,
  executeEvent,
  addWorldEvent,
  modifyLocation,
  getWorldEvents,
  getLocationChanges
};
