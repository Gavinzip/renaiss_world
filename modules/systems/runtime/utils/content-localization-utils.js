// Internal helper module for dynamic localization logic.
// Public callers should import from global-language-resources.js instead.

let convertCNToTW = (text) => String(text || '');
let convertTWToCN = (text) => String(text || '');
try {
  const OpenCC = require('opencc-js');
  convertCNToTW = OpenCC.Converter({ from: 'cn', to: 'tw' });
  convertTWToCN = OpenCC.Converter({ from: 'tw', to: 'cn' });
} catch {
  // OpenCC is optional. Fallback keeps original text.
}
const { sanitizeWorldText } = require('../../../core/style-sanitizer');

const SKILL_CHIP_PREFIX = Object.freeze({
  'zh-TW': '技能晶片：',
  'zh-CN': '技能晶片：',
  ko: '스킬 칩: ',
  en: 'Skill Chip: '
});

const ITEM_LOCALIZATION_LANGS = Object.freeze(['zh-TW', 'zh-CN', 'ko', 'en']);

const COMMON_ITEM_TRANSLATIONS = Object.freeze({
  '乾糧一包': { 'zh-TW': '乾糧一包', 'zh-CN': '干粮一包', en: 'Ration Pack' },
  '水囊': { 'zh-TW': '水囊', 'zh-CN': '水囊', en: 'Water Flask' }
});

const ITEM_NAME_EN_TRANSLATIONS = Object.freeze({
  '天隕鐵原礦': 'Meteoric Iron Raw Ore',
  '天隕鐵晶核': 'Meteoric Iron Crystal Core',
  '天隕鐵殘片': 'Meteoric Iron Shard',
  '星沙藤花粉': 'Star-Sand Vine Pollen',
  '星沙銀光盔': 'Star-Sand Silverglow Helm',
  '星潮磁能戰盔': 'Star-Tide Magnetic Battle Helm',
  '月影蘭花粉': 'Moonshadow Orchid Pollen',
  '月影蘭葉': 'Moonshadow Orchid Leaf',
  '橋上設伏皮毛': 'Bridge Ambush Fur',
  '燃霜哥布林核心': 'Frostflame Goblin Core',
  '燃霜輕聲道徽章': 'Frostflame Whisperpath Emblem',
  '磁能霜焰護甲': 'Magnetized Frostflame Armor',
  '裂痕林工程師的提醒言猶在耳殘晶': 'Fracturewood Engineer Warning Echo Crystal Shard',
  '赤霞芝葉': 'Scarlet Reishi Leaf',
  '銀葬神秘男子碎片': 'Silverburial Mysterious Man Fragment',
  '霜焰花莖': 'Frostflame Flower Stem',
  '霜焰蒼銀盔': 'Frostflame Argent Helm',
  '靈脈銅原礦': 'Leyline Copper Raw Ore',
  '靈脈銅晶核': 'Leyline Copper Crystal Core',
  '靈脈銅殘片': 'Leyline Copper Shard',
  '靈脈銅紋印': 'Leyline Copper Sigil',
  '鳳鳴金曜冠': 'Phoenixsong Auric Crown',
  '黑曜月影織甲': 'Obsidian Moonshadow Weave Armor',
  '黑曜髓晶紋印': 'Obsidian Core Crystal Sigil',
  '黑曜髓晶護盔': 'Obsidian Core Crystal Helm',
  '星沙藤葉': 'Star-Sand Vine Leaf',
  '蒼銀礦原礦': 'Argent Ore Raw Ore',
  '蒼銀礦晶核': 'Argent Ore Crystal Core',
  '蒼銀礦殘片': 'Argent Ore Shard',
  '赤霞芝花粉': 'Scarlet Reishi Pollen',
  '霜焰花花粉': 'Frostflame Flower Pollen',
  '霜焰花葉': 'Frostflame Flower Leaf',
  '鳳鳴金晶核': 'Phoenixsong Gold Crystal Core',
  '鳳鳴金殘片': 'Phoenixsong Gold Shard',
  '鳳鳴金紋印': 'Phoenixsong Gold Sigil',
  '黑曜髓晶原礦': 'Obsidian Core Crystal Raw Ore',
  '黑曜髓晶晶核': 'Obsidian Core Crystal Core'
});

const ITEM_DESC_EN_TRANSLATIONS = Object.freeze({
  '以霜焰花花粉、靈脈銅紋印與赤霞芝花粉融合而成的科技護甲，散發著寒冷與熾熱交織的光芒，能在戰鬥中吸收大地靈氣，提升持有者的生命值。': 'A tech armor fused from Frostflame Flower Pollen, a Leyline Copper Sigil, and Scarlet Reishi Pollen. It radiates intertwined cold and heat, absorbs terrestrial spirit energy in battle, and increases the bearer\'s HP.',
  '以黑曜髓晶原礦、鳳鳴金晶核與蒼銀礦原礦融合打造的未來頭盔，鑲嵌星潮港磁能核心，賦予使用者強大攻擊力。': 'A futuristic helm forged from Obsidian Core Crystal Raw Ore, a Phoenixsong Gold Crystal Core, and Argent Ore Raw Ore, embedded with a Star-Tide Harbor magnetic core to grant strong attack power.',
  '來自 哥布林 的史詩戰鬥證物。': 'Epic battle trophy from Goblin.',
  '來自 林工程師的提醒言猶在耳 的普通戰鬥證物。': 'Common battle trophy from Engineer Lin\'s lingering warning.',
  '來自 神秘男子 的普通戰鬥證物。': 'Common battle trophy from the Mysterious Man.',
  '來自 輕聲道 的普通戰鬥證物。': 'Common battle trophy from Whisperpath.',
  '廣州 採集取得的普通草藥。': 'Common herb gathered in Guangzhou.',
  '廣州 探索發現的普通寶藏。': 'Common treasure discovered in Guangzhou.',
  '此冠以鳳鳴金晶核、鳳鳴金殘片、鳳鳴金紋印融合而成，表面刻有熾熱金紋，散發耀眼光芒，據說能召喚鳳凰之魂，大幅提升佩帶者的攻擊力。': 'This crown is fused from a Phoenixsong Gold Crystal Core, Phoenixsong Gold Shard, and Phoenixsong Gold Sigil. Blazing gold patterns are engraved on its surface, and its radiant glow is said to summon the spirit of the phoenix, greatly increasing the wearer\'s attack power.',
  '此盔以霜焰花葉與蒼銀礦晶核為核心，結合寒霜與熾焰的能量，外觀閃爍銀白光澤，兼具攻擊與防護之效。': 'This helm uses Frostflame Flower Leaf and an Argent Ore Crystal Core as its core, combining frost and blazing-flame energy. Its silver-white sheen offers both attack and protection.',
  '洛陽城 探索發現的稀有寶藏。': 'Rare treasure discovered in Luoyang City.',
  '由星沙藤葉與花粉萃取出的星沙精華，結合蒼銀礦殘片打造的金屬光盔，散發星辰與銀光的共振，能大幅提升佩帶者的攻擊力。': 'A metallic light helm forged from Star-Sand essence extracted from vine leaves and pollen, combined with Argent Ore shards. It resonates with starlight and silver light, greatly increasing the wearer\'s attack power.',
  '由黑曜髓晶晶核、月影蘭葉與赤霞芝葉融合而成的增幅装甲，擁有光與影的交錯防護，可為穿戴者提供強大的生命力。': 'An enhanced armor fused from Obsidian Core Crystal Core, Moonshadow Orchid Leaf, and Scarlet Reishi Leaf. Its interwoven light-and-shadow shielding provides strong vitality to the wearer.',
  '由黑曜髓晶晶核、月影蘭葉與赤霞芝葉融合而成的增幅裝甲，擁有光與影的交錯防護，可為穿戴者提供強大的生命力。': 'An enhanced armor fused from Obsidian Core Crystal Core, Moonshadow Orchid Leaf, and Scarlet Reishi Leaf. Its interwoven light-and-shadow shielding provides strong vitality to the wearer.',
  '由黑曜髓晶的核心能源與印記融合而成的防護頭盔，散發著冰冷的科技光芒，提升佩帶者的攻擊力。': 'A protective helm fused from Obsidian Core Crystal energy and sigils. It emits a cold technological glow and increases the wearer\'s attack power.',
  '草原部落 採集取得的普通草藥。': 'Common herb gathered in the Grassland Tribe.',
  '草原部落 探索發現的普通寶藏。': 'Common treasure discovered in the Grassland Tribe.',
  '襄陽城 探索發現的稀有寶藏。': 'Rare treasure discovered in Xiangyang City.',
  '雲棧茶嶺 探索發現的史詩寶藏。': 'Epic treasure discovered in Cloudridge Tea Range.',
  '雲棧茶嶺 探索發現的普通寶藏。': 'Common treasure discovered in Cloudridge Tea Range.',
  '雲棧茶嶺 狩獵取得的普通獵物。': 'Common prey hunted in Cloudridge Tea Range.'
});

const ITEM_NAME_KO_TRANSLATIONS = Object.freeze({
  '天隕鐵原礦': '운석철 원광',
  '天隕鐵晶核': '운석철 결정핵',
  '天隕鐵殘片': '운석철 파편',
  '星沙藤花粉': '성사등 화분',
  '星沙銀光盔': '성사 은광 투구',
  '星潮磁能戰盔': '성조 자기 전투 투구',
  '月影蘭花粉': '월영란 화분',
  '月影蘭葉': '월영란 잎',
  '橋上設伏皮毛': '다리 매복 모피',
  '燃霜哥布林核心': '서리화염 고블린 핵심',
  '燃霜輕聲道徽章': '서리화염 위스퍼패스 휘장',
  '磁能霜焰護甲': '자기화 서리화염 갑옷',
  '裂痕林工程師的提醒言猶在耳殘晶': '균열숲 엔지니어 경고 메아리 결정 파편',
  '赤霞芝葉': '적노을 영지 잎',
  '銀葬神秘男子碎片': '은장 신비한 남자 조각',
  '霜焰花莖': '서리화염 꽃줄기',
  '霜焰蒼銀盔': '서리화염 창은 투구',
  '靈脈銅原礦': '지맥 구리 원광',
  '靈脈銅晶核': '지맥 구리 결정핵',
  '靈脈銅殘片': '지맥 구리 파편',
  '靈脈銅紋印': '지맥 구리 인장',
  '鳳鳴金曜冠': '봉명 금요관',
  '黑曜月影織甲': '흑요 월영 직조 갑옷',
  '黑曜髓晶紋印': '흑요 수결정 인장',
  '黑曜髓晶護盔': '흑요 수결정 방호 투구',
  '星沙藤葉': '성사등 잎',
  '蒼銀礦原礦': '창은광 원광',
  '蒼銀礦晶核': '창은광 결정핵',
  '蒼銀礦殘片': '창은광 파편',
  '赤霞芝花粉': '적노을 영지 화분',
  '霜焰花花粉': '서리화염 꽃 화분',
  '霜焰花葉': '서리화염 꽃잎',
  '鳳鳴金晶核': '봉명 금 결정핵',
  '鳳鳴金殘片': '봉명 금 파편',
  '鳳鳴金紋印': '봉명 금 인장',
  '黑曜髓晶原礦': '흑요 수결정 원광',
  '黑曜髓晶晶核': '흑요 수결정 핵'
});

const ITEM_DESC_KO_TRANSLATIONS = Object.freeze({
  '以霜焰花花粉、靈脈銅紋印與赤霞芝花粉融合而成的科技護甲，散發著寒冷與熾熱交織的光芒，能在戰鬥中吸收大地靈氣，提升持有者的生命值。': '서리화염 꽃 화분, 지맥 구리 인장, 적노을 영지 화분을 융합한 기술 갑옷입니다. 냉기와 열기가 교차하는 빛을 내며 전투 중 대지의 기운을 흡수해 착용자의 HP를 높입니다.',
  '以黑曜髓晶原礦、鳳鳴金晶核與蒼銀礦原礦融合打造的未來頭盔，鑲嵌星潮港磁能核心，賦予使用者強大攻擊力。': '흑요 수결정 원광, 봉명 금 결정핵, 창은광 원광을 융합해 만든 미래형 투구입니다. 성조항 자기 핵이 박혀 있어 강한 공격력을 제공합니다.',
  '來自 哥布林 的史詩戰鬥證物。': '고블린에게서 획득한 에픽 전투 증표입니다.',
  '來自 林工程師的提醒言猶在耳 的普通戰鬥證物。': '엔지니어 린의 경고 메아리에서 획득한 일반 전투 증표입니다.',
  '來自 神秘男子 的普通戰鬥證物。': '신비한 남자에게서 획득한 일반 전투 증표입니다.',
  '來自 輕聲道 的普通戰鬥證物。': '위스퍼패스에게서 획득한 일반 전투 증표입니다.',
  '廣州 採集取得的普通草藥。': '광저우에서 채집한 일반 약초입니다.',
  '廣州 探索發現的普通寶藏。': '광저우 탐험에서 발견한 일반 보물입니다.',
  '此冠以鳳鳴金晶核、鳳鳴金殘片、鳳鳴金紋印融合而成，表面刻有熾熱金紋，散發耀眼光芒，據說能召喚鳳凰之魂，大幅提升佩帶者的攻擊力。': '이 관은 봉명 금 결정핵, 봉명 금 파편, 봉명 금 인장을 융합해 만들었습니다. 표면의 뜨거운 금빛 문양과 눈부신 광휘는 불사조의 혼을 부른다고 전해지며 착용자의 공격력을 크게 높입니다.',
  '此盔以霜焰花葉與蒼銀礦晶核為核心，結合寒霜與熾焰的能量，外觀閃爍銀白光澤，兼具攻擊與防護之效。': '이 투구는 서리화염 꽃잎과 창은광 결정핵을 핵심으로, 냉기와 화염의 에너지를 결합했습니다. 은백색 광택을 띠며 공격과 방어를 모두 강화합니다.',
  '洛陽城 探索發現的稀有寶藏。': '낙양성 탐험에서 발견한 희귀 보물입니다.',
  '由星沙藤葉與花粉萃取出的星沙精華，結合蒼銀礦殘片打造的金屬光盔，散發星辰與銀光的共振，能大幅提升佩帶者的攻擊力。': '성사등 잎과 화분에서 추출한 정수와 창은광 파편을 결합해 만든 금속 투구입니다. 별빛과 은빛 공명을 일으켜 착용자의 공격력을 크게 높입니다.',
  '由黑曜髓晶晶核、月影蘭葉與赤霞芝葉融合而成的增幅装甲，擁有光與影的交錯防護，可為穿戴者提供強大的生命力。': '흑요 수결정 핵, 월영란 잎, 적노을 영지 잎을 융합한 증폭 장갑입니다. 빛과 그림자가 교차하는 방호로 착용자에게 강한 생명력을 제공합니다.',
  '由黑曜髓晶晶核、月影蘭葉與赤霞芝葉融合而成的增幅裝甲，擁有光與影的交錯防護，可為穿戴者提供強大的生命力。': '흑요 수결정 핵, 월영란 잎, 적노을 영지 잎을 융합한 증폭 장갑입니다. 빛과 그림자가 교차하는 방호로 착용자에게 강한 생명력을 제공합니다.',
  '由黑曜髓晶的核心能源與印記融合而成的防護頭盔，散發著冰冷的科技光芒，提升佩帶者的攻擊力。': '흑요 수결정의 핵심 에너지와 인장을 융합한 방호 투구입니다. 차가운 기술 광채를 내며 착용자의 공격력을 높입니다.',
  '草原部落 採集取得的普通草藥。': '초원 부족에서 채집한 일반 약초입니다.',
  '草原部落 探索發現的普通寶藏。': '초원 부족 탐험에서 발견한 일반 보물입니다.',
  '襄陽城 探索發現的稀有寶藏。': '양양성 탐험에서 발견한 희귀 보물입니다.',
  '雲棧茶嶺 探索發現的史詩寶藏。': '운잔 차령 탐험에서 발견한 에픽 보물입니다.',
  '雲棧茶嶺 探索發現的普通寶藏。': '운잔 차령 탐험에서 발견한 일반 보물입니다.',
  '雲棧茶嶺 狩獵取得的普通獵物。': '운잔 차령 사냥에서 획득한 일반 사냥감입니다.'
});

const ITEM_RARITY_EN_TRANSLATIONS = Object.freeze({
  '普通': 'Common',
  '稀有': 'Rare',
  '史詩': 'Epic',
  '傳說': 'Legendary'
});

const ITEM_LOCATION_EN_TRANSLATIONS = Object.freeze({
  '廣州': 'Guangzhou',
  '草原部落': 'Grassland Tribe',
  '襄陽城': 'Xiangyang City',
  '洛陽城': 'Luoyang City',
  '雲棧茶嶺': 'Cloudridge Tea Range'
});

const ITEM_SOURCE_EN_TRANSLATIONS = Object.freeze({
  '哥布林': 'Goblin',
  '神秘男子': 'Mysterious Man',
  '輕聲道': 'Whisperpath',
  '林工程師的提醒言猶在耳': 'Engineer Lin lingering warning'
});

const ITEM_TOKEN_EN_TRANSLATIONS = Object.freeze([
  ['黑曜髓晶', 'Obsidian Core Crystal'],
  ['鳳鳴金', 'Phoenixsong Gold'],
  ['蒼銀礦', 'Argent Ore'],
  ['靈脈銅', 'Leyline Copper'],
  ['天隕鐵', 'Meteoric Iron'],
  ['星沙藤', 'Star-Sand Vine'],
  ['月影蘭', 'Moonshadow Orchid'],
  ['霜焰花', 'Frostflame Flower'],
  ['赤霞芝', 'Scarlet Reishi'],
  ['銀葬', 'Silverburial'],
  ['輕聲道', 'Whisperpath'],
  ['裂痕林', 'Fracturewood'],
  ['工程師', 'Engineer'],
  ['提醒言猶在耳', 'Warning Echo'],
  ['晶核', 'Crystal Core'],
  ['原礦', 'Raw Ore'],
  ['殘片', 'Shard'],
  ['紋印', 'Sigil'],
  ['徽章', 'Emblem'],
  ['護甲', 'Armor'],
  ['護盔', 'Helm'],
  ['戰盔', 'Battle Helm'],
  ['銀光盔', 'Silverglow Helm'],
  ['蒼銀盔', 'Argent Helm'],
  ['織甲', 'Weave Armor'],
  ['花粉', 'Pollen'],
  ['花葉', 'Leaf'],
  ['花莖', 'Stem'],
  ['葉', 'Leaf'],
  ['皮毛', 'Fur'],
  ['碎片', 'Fragment'],
  ['核心', 'Core'],
  ['冠', 'Crown']
]);

const KO_EXACT_TRANSLATIONS = Object.freeze({
  'Untranslated Item': '미번역 아이템',
  'Untranslated Description': '미번역 설명',
  'Unknown': '알 수 없음',
  'Unknown Element': '알 수 없는 속성',
  'Rns': 'Rns',
  'Bag': '가방',
  'Collectible': '수집품',
  'Gear': '장비',
  'Est.': '예상',
  'Total': '합계',
  'Hit': '타격'
});

const KO_EN_TOKEN_TRANSLATIONS = Object.freeze([
  ['Welcome back', '다시 오신 것을 환영합니다'],
  ['Welcome to', '환영합니다'],
  ['Settings', '설정'],
  ['Back', '뒤로'],
  ['Continue', '계속'],
  ['Character', '캐릭터'],
  ['Adventure', '모험'],
  ['Combat', '전투'],
  ['Victory', '승리'],
  ['Defeat', '패배'],
  ['Language', '언어'],
  ['Wallet', '지갑'],
  ['Bind Wallet', '지갑 연결'],
  ['Sync Assets', '자산 동기화'],
  ['World', '월드'],
  ['Profile', '프로필'],
  ['Inventory', '인벤토리'],
  ['Collectibles', '수집품'],
  ['Equipment', '장비'],
  ['Pet', '펫'],
  ['Pets', '펫'],
  ['Skill Chip', '스킬 칩'],
  ['Move', '기술'],
  ['Moves', '기술'],
  ['Not equipped', '장착 안 됨'],
  ['Flee', '도주'],
  ['Page', '페이지'],
  ['Current', '현재'],
  ['Locked', '잠김'],
  ['Unlocked', '해제됨'],
  ['Ready', '준비됨'],
  ['Appraisal', '감정'],
  ['Memory Audit', '기억 점검'],
  ['System', '시스템'],
  ['Portal', '포털'],
  ['Teleport', '전송'],
  ['Map', '지도'],
  ['Story', '스토리'],
  ['Battle', '전투'],
  ['Damage', '피해'],
  ['Speed', '속도'],
  ['Element', '속성'],
  ['HP', 'HP'],
  ['ATK', '공격력'],
  ['DEF', '방어력'],
  ['High Risk', '고위험'],
  ['Costs Money', '비용 필요'],
  ['Social', '소셜'],
  ['Explore', '탐험'],
  ['Combat Tension', '전투 긴장'],
  ['High Reward', '고보상'],
  ['Uncertain', '불확실'],
  ['Friendly Appraisal', '우호 감정'],
  ['Mystery Appraisal', '신비 감정'],
  ['Learn Rule', '학습 규칙'],
  ['Sell Rule', '판매 규칙'],
  ['Skill Chips Obtained', '획득한 스킬 칩'],
  ['Starter Gift', '스타터 선물'],
  ['No sellable items right now', '현재 판매 가능한 아이템이 없습니다'],
  ['No sellable items', '판매 가능한 아이템 없음'],
  ['treasure discovered in', '보물 발견:'],
  ['battle trophy from', '전투 전리품 출처:'],
  ['Common herb gathered in', '일반 약초 채집 지역:'],
  ['Common prey hunted in', '일반 사냥감 획득 지역:'],
  ['An enhanced armor fused from', '다음을 융합한 증폭 갑옷:'],
  ['A futuristic helm forged from', '다음을 융합한 미래형 투구:'],
  ['This crown is fused from', '이 왕관은 다음 재료를 융합해 제작됨:'],
  ['A tech armor fused from', '다음을 융합한 기술 갑옷:'],
  ['A metallic light helm forged from', '다음을 융합한 금속 광투구:'],
  ['A protective helm fused from', '다음을 융합한 방호 투구:'],
  ['wearer', '착용자'],
  ['attack power', '공격력'],
  ['health', '체력'],
  ['vitality', '생명력'],
  ['crystal', '결정'],
  ['core', '핵심'],
  ['shard', '파편'],
  ['ore', '광석'],
  ['armor', '갑옷'],
  ['helm', '투구'],
  ['crown', '왕관'],
  ['pollen', '화분'],
  ['leaf', '잎'],
  ['sigil', '인장'],
  ['Obsidian', '흑요'],
  ['Moonshadow', '월영'],
  ['Meteoric Iron', '운석철'],
  ['Phoenixsong', '봉명'],
  ['Leyline Copper', '지맥 구리'],
  ['Frostflame', '서리화염'],
  ['Whisperpath', '위스퍼패스'],
  ['Fracturewood', '균열숲'],
  ['Xiangyang City', '양양성'],
  ['Luoyang City', '낙양성'],
  ['Guangzhou', '광저우'],
  ['Cloudridge Tea Range', '운잔 차령'],
  ['Grassland Tribe', '초원 부족'],
  ['Legendary', '전설'],
  ['Epic', '에픽'],
  ['Rare', '레어'],
  ['Common', '일반']
]);

const KO_ZH_TOKEN_TRANSLATIONS = Object.freeze([
  ['語言', '언어'],
  ['语言', '언어'],
  ['設定', '설정'],
  ['设置', '설정'],
  ['返回', '뒤로'],
  ['錢包', '지갑'],
  ['钱包', '지갑'],
  ['綁定', '연결'],
  ['绑定', '연결'],
  ['同步', '동기화'],
  ['資產', '자산'],
  ['资产', '자산'],
  ['世界', '세계'],
  ['冒險', '모험'],
  ['冒险', '모험'],
  ['戰鬥', '전투'],
  ['战斗', '전투'],
  ['勝利', '승리'],
  ['胜利', '승리'],
  ['失敗', '실패'],
  ['失败', '실패'],
  ['速度', '속도'],
  ['屬性', '속성'],
  ['属性', '속성'],
  ['寵物', '펫'],
  ['宠物', '펫'],
  ['技能', '기술'],
  ['晶片', '칩'],
  ['芯片', '칩'],
  ['裝備', '장비'],
  ['装备', '장비'],
  ['收藏品', '수집품'],
  ['藏品', '수집품'],
  ['地圖', '지도'],
  ['地图', '지도'],
  ['傳送門', '포털'],
  ['传送门', '포털'],
  ['傳送裝置', '전송 장치'],
  ['传送装置', '전송 장치'],
  ['主線', '메인 스토리'],
  ['主线', '메인 스토리']
]);

const MOVE_WORD_TO_KO = Object.freeze([
  ['Pulse', '맥동'],
  ['Calibration', '보정'],
  ['Alloy', '합금'],
  ['Ram', '강타'],
  ['Prism', '프리즘'],
  ['Sheath', '장막'],
  ['Fiber', '섬유'],
  ['Bind', '결박'],
  ['Biorepair', '바이오 수복'],
  ['Root', '뿌리'],
  ['Net', '그물'],
  ['Interference', '교란'],
  ['Purge', '정화'],
  ['Wave', '파동'],
  ['Pressure', '압력'],
  ['Mist', '안개'],
  ['Phase', '위상'],
  ['Crystal', '수정'],
  ['Storm', '폭풍'],
  ['Bastion', '요새'],
  ['Field', '장'],
  ['Spore', '포자'],
  ['Blade', '칼날'],
  ['Rain', '비'],
  ['Cryo', '극저온'],
  ['Impact', '충격'],
  ['Plasma', '플라즈마'],
  ['Bloom', '개화'],
  ['Thermal', '열'],
  ['Shield', '보호막'],
  ['Circuit', '회로'],
  ['Regeneration', '재생'],
  ['Matrix', '매트릭스'],
  ['Meteor', '유성'],
  ['Drop', '낙하'],
  ['Drifting', '표류'],
  ['Quicksand', '유사'],
  ['Tidal', '조류'],
  ['Frost', '서리'],
  ['Lance', '창'],
  ['Steam', '증기'],
  ['Veil', '장막'],
  ['Wildfire', '들불'],
  ['Chain', '연쇄'],
  ['Cinder', '잿불'],
  ['Haze', '안개'],
  ['Flare', '섬광'],
  ['Snare', '올가미'],
  ['Thorn', '가시'],
  ['Forest', '숲'],
  ['Mend', '치유'],
  ['Vine', '덩굴'],
  ['Riptide', '역조'],
  ['Cut', '절단'],
  ['Bubble', '거품'],
  ['Guard', '방호'],
  ['Echo', '메아리'],
  ['Spring', '샘'],
  ['Foam', '거품'],
  ['Dart', '다트'],
  ['Stream', '흐름'],
  ['Mirror', '거울'],
  ['Abyssal', '심연'],
  ['Crush', '분쇄'],
  ['Clarity', '명료'],
  ['Current', '해류'],
  ['Lock', '잠금'],
  ['Ember', '불씨'],
  ['Ash', '재'],
  ['Jab', '찌르기'],
  ['Magma', '마그마'],
  ['Bite', '물어뜯기'],
  ['Sunforge', '태양 단련'],
  ['Spark', '불꽃'],
  ['Claw', '발톱'],
  ['Char', '그을음'],
  ['Lava', '용암'],
  ['Rush', '돌진'],
  ['Firebrand', '화염인장'],
  ['Strike', '강타'],
  ['Volcanic', '화산'],
  ['Surge', '격류'],
  ['Smoke', '연막'],
  ['Firewall', '화염 장벽'],
  ['Burning', '작열'],
  ['Edge', '칼날'],
  ['Seed', '씨앗'],
  ['Volley', '난사'],
  ['Leafstep', '잎걸음'],
  ['Leaf', '잎'],
  ['Barkskin', '수피 갑옷'],
  ['Bark', '수피'],
  ['Morning Dew', '아침 이슬'],
  ['Whip', '채찍'],
  ['Bud', '새싹'],
  ['Sap', '수액'],
  ['Petal', '꽃잎'],
  ['Dance', '춤'],
  ['Pollen', '꽃가루'],
  ['Shock', '충격'],
  ['Spike', '가시창'],
  ['Nature', '자연'],
  ['Cycle', '순환'],
  ['Ancient', '고대'],
  ['Canopy', '수관'],
  ['Singularity', '특이점'],
  ['Solar', '태양'],
  ['Fission', '분열'],
  ['Leyline', '지맥'],
  ['Crash', '충돌'],
  ['Fusion', '융합'],
  ['Thunderbolt', '천둥'],
  ['Overload', '과부하'],
  ['Maelstrom', '소용돌이'],
  ['Prison', '감옥'],
  ['Ocean', '바다'],
  ['Renewal', '재생'],
  ['Inferno', '지옥불'],
  ['Drive', '돌진'],
  ['Phoenix', '불사조'],
  ['Guardwheel', '방호륜'],
  ['Blooming', '만개'],
  ['Overgrowth', '과성장'],
  ['Shadow', '그림자'],
  ['Slash', '베기'],
  ['Glitch', '오류'],
  ['Fear', '공포'],
  ['Web', '거미줄'],
  ['Toxic', '맹독'],
  ['Static', '정전기'],
  ['Hex', '저주'],
  ['Core', '핵심'],
  ['Drain', '흡수'],
  ['Neural', '신경'],
  ['Corrosion', '부식'],
  ['Melting', '용해'],
  ['Acidflow', '산류'],
  ['Scorchsand', '작열모래'],
  ['Plague', '역병'],
  ['Iron', '철'],
  ['Infernal', '지옥'],
  ['Protocol', '프로토콜'],
  ['Detonation', '폭발'],
  ['Spectral', '유령'],
  ['Silver', '은'],
  ['Array', '진형'],
  ['Cryotoxin', '빙독'],
  ['Mudflame', '진흙화염'],
  ['Null', '무효'],
  ['Boundary', '경계'],
  ['Collapse', '붕괴'],
  ['Headbutt', '박치기'],
  ['Flee', '도주']
]);

const CHOICE_TAGS = Object.freeze({
  high_risk: {
    emoji: '🔥',
    labels: { 'zh-TW': '高風險', 'zh-CN': '高风险', en: 'High Risk' },
    desc: {
      'zh-TW': '可能會受傷或失敗',
      'zh-CN': '可能会受伤或失败',
      en: 'May cause injury or failure'
    }
  },
  spend: {
    emoji: '💰',
    labels: { 'zh-TW': '需花錢', 'zh-CN': '需花钱', en: 'Costs Money' },
    desc: {
      'zh-TW': '需要花費金錢',
      'zh-CN': '需要花费金钱',
      en: 'Requires spending currency'
    }
  },
  social: {
    emoji: '🤝',
    labels: { 'zh-TW': '需社交', 'zh-CN': '需社交', en: 'Social' },
    desc: {
      'zh-TW': '需要與人交談',
      'zh-CN': '需要与人交谈',
      en: 'Requires talking to people'
    }
  },
  explore: {
    emoji: '🔍',
    labels: { 'zh-TW': '需探索', 'zh-CN': '需探索', en: 'Explore' },
    desc: {
      'zh-TW': '需要探索或搜尋',
      'zh-CN': '需要探索或搜寻',
      en: 'Requires exploration or searching'
    }
  },
  combat: {
    emoji: '⚔️',
    labels: { 'zh-TW': '會戰鬥', 'zh-CN': '会战斗', en: 'Combat Tension' },
    desc: {
      'zh-TW': '戰鬥張力升高（不一定立刻開打）',
      'zh-CN': '战斗张力升高（不一定立刻开打）',
      en: 'Conflict rises, but not always an immediate fight'
    }
  },
  reward: {
    emoji: '🎁',
    labels: { 'zh-TW': '高回報', 'zh-CN': '高回报', en: 'High Reward' },
    desc: {
      'zh-TW': '成功後收獲豐厚',
      'zh-CN': '成功后收获丰厚',
      en: 'Strong rewards if successful'
    }
  },
  surprise: {
    emoji: '❓',
    labels: { 'zh-TW': '有驚喜', 'zh-CN': '有惊喜', en: 'Uncertain' },
    desc: {
      'zh-TW': '結果未知',
      'zh-CN': '结果未知',
      en: 'Outcome is uncertain'
    }
  },
  appraisal: {
    emoji: '🏪',
    labels: { 'zh-TW': '鑑價站', 'zh-CN': '鉴价站', en: 'Appraisal' },
    desc: {
      'zh-TW': '可進入公信鑑價站',
      'zh-CN': '可进入公信鉴价站',
      en: 'Leads to the appraisal station'
    }
  },
  mystery_appraisal: {
    emoji: '🕳️',
    labels: { 'zh-TW': '神秘鑑價', 'zh-CN': '神秘鉴价', en: 'Mystery Appraisal' },
    desc: {
      'zh-TW': '可進入神秘鑑價站',
      'zh-CN': '可进入神秘鉴价站',
      en: 'Leads to the mysterious appraisal station'
    }
  },
  friendly_appraisal: {
    emoji: '🧩',
    labels: { 'zh-TW': '友善鑑價', 'zh-CN': '友善鉴价', en: 'Friendly Appraisal' },
    desc: {
      'zh-TW': '表面條件看似更友善',
      'zh-CN': '表面条件看似更友善',
      en: 'Looks newcomer-friendly on the surface'
    }
  },
  friendly_spar: {
    emoji: '🤝',
    labels: { 'zh-TW': '友誼賽', 'zh-CN': '友谊赛', en: 'Friendly Spar' },
    desc: {
      'zh-TW': '可進入友好切磋',
      'zh-CN': '可进入友好切磋',
      en: 'Starts a friendly spar'
    }
  }
});

const GENERATION_STATUS_TEXT = Object.freeze({
  'zh-TW': {
    loading: 'AI 說書人正在構思故事...',
    memory_context: 'AI 說書人正在整理記憶脈絡...',
    generating_story: 'AI 說書人正在撰寫故事...',
    story_ready: '故事已送達，正在生成選項...',
    generating_choices: '故事已送達，正在生成選項...',
    choices_ready: '選項已完成，正在排版回傳...',
    recovered_snapshot: '已恢復上次快照，正在整理畫面...',
    resume_cached: '已恢復上次故事與選項，正在同步畫面...',
    thinking_new_story: 'AI 說書人正在構思新故事...',
    writing_new_story: 'AI 說書人正在撰寫新故事...',
    story_generating_choices: '故事已送達，正在生成選項...',
    recovering_choices: 'AI 說書人正在補齊上次中斷的選項...',
    battle_fresh_story: 'AI 說書人正在承接戰鬥結果重塑新篇章...'
  },
  'zh-CN': {
    loading: 'AI 说书人正在构思故事...',
    memory_context: 'AI 说书人正在整理记忆脉络...',
    generating_story: 'AI 说书人正在撰写故事...',
    story_ready: '故事已送达，正在生成选项...',
    generating_choices: '故事已送达，正在生成选项...',
    choices_ready: '选项已完成，正在排版回传...',
    recovered_snapshot: '已恢复上次快照，正在整理画面...',
    resume_cached: '已恢复上次故事与选项，正在同步画面...',
    thinking_new_story: 'AI 说书人正在构思新故事...',
    writing_new_story: 'AI 说书人正在撰写新故事...',
    story_generating_choices: '故事已送达，正在生成选项...',
    recovering_choices: 'AI 说书人正在补齐上次中断的选项...',
    battle_fresh_story: 'AI 说书人正在承接战斗结果重塑新篇章...'
  },
  ko: {
    loading: 'AI 스토리텔러가 이야기를 구상하는 중...',
    memory_context: 'AI 스토리텔러가 기억 맥락을 정리하는 중...',
    generating_story: 'AI 스토리텔러가 이야기를 작성하는 중...',
    story_ready: '스토리 전송 완료, 선택지를 생성하는 중...',
    generating_choices: '스토리 전송 완료, 선택지를 생성하는 중...',
    choices_ready: '선택지 생성 완료, 화면을 정리하는 중...',
    recovered_snapshot: '이전 스냅샷을 복구했고 화면을 갱신하는 중...',
    resume_cached: '이전 스토리와 선택지를 복구했고 화면을 동기화하는 중...',
    thinking_new_story: 'AI 스토리텔러가 새로운 장면을 구상하는 중...',
    writing_new_story: 'AI 스토리텔러가 새로운 장면을 작성하는 중...',
    story_generating_choices: '스토리 전송 완료, 선택지를 생성하는 중...',
    recovering_choices: 'AI 스토리텔러가 중단된 선택지를 복구하는 중...',
    battle_fresh_story: 'AI 스토리텔러가 전투 결과를 반영해 다음 장면을 재구성하는 중...'
  },
  en: {
    loading: 'The AI storyteller is outlining the story...',
    memory_context: 'The AI storyteller is organizing memory context...',
    generating_story: 'The AI storyteller is writing the story...',
    story_ready: 'Story delivered. Generating choices...',
    generating_choices: 'Story delivered. Generating choices...',
    choices_ready: 'Choices are ready. Formatting response...',
    recovered_snapshot: 'Recovered the previous snapshot. Refreshing the scene...',
    resume_cached: 'Recovered the last story and choices. Syncing the scene...',
    thinking_new_story: 'The AI storyteller is planning the next scene...',
    writing_new_story: 'The AI storyteller is writing the next scene...',
    story_generating_choices: 'Story delivered. Generating choices...',
    recovering_choices: 'The AI storyteller is restoring the interrupted choices...',
    battle_fresh_story: 'The AI storyteller is reshaping the next scene after battle...'
  }
});

const LOADING_ANIMATION_TEXT = Object.freeze({
  'zh-TW': {
    defaultLabel: 'AI 說書人正在構思故事',
    phases: ['鋪陳場景', '安排角色互動', '生成分支選項', '補完世界細節']
  },
  'zh-CN': {
    defaultLabel: 'AI 说书人正在构思故事',
    phases: ['铺陈场景', '安排角色互动', '生成分支选项', '补完世界细节']
  },
  ko: {
    defaultLabel: 'AI 스토리텔러가 이야기를 구상하는 중',
    phases: ['장면 구도 정리', '인물 상호작용 배치', '분기 선택지 생성', '세계 디테일 보강']
  },
  en: {
    defaultLabel: 'The AI storyteller is outlining the story',
    phases: ['Framing the scene', 'Placing character beats', 'Generating branches', 'Filling world detail']
  }
});

const SKILL_CHIP_UI_TEXT = Object.freeze({
  'zh-TW': {
    invalidChipData: '⚠️ 技能晶片資料錯誤，請重新選擇。',
    invalidUnlearnData: '⚠️ 取消學習資料錯誤，請重新選擇。',
    missingActor: '⚠️ 找不到要操作的寵物或角色。',
    missingMoveTemplate: '⚠️ 找不到該技能模板，可能與寵物類型不符。',
    wrongElement: '⚠️ 這個技能不適用於目前寵物屬性，請改選同屬性技能晶片。',
    alreadyLearned: (moveName) => `ℹ️ ${moveName} 已經學會，請直接在上陣欄配置。`,
    duplicateLearn: (moveName) => `ℹ️ ${moveName} 已經學會，無需重複學習。`,
    loadoutFull: (limit) => `⚠️ 上陣招式已滿 ${limit} 招，請先取消學習一招再學新技能。`,
    inventoryMissing: (chipName) => `⚠️ 背包內找不到「${chipName}」。`,
    learnFailed: (reason) => `⚠️ ${reason || '學習失敗'}（已退回晶片）`,
    replaceNote: (moveName) => `（上陣名額已滿，已替換「${moveName}」）`,
    learnSuccess: (moveName, note = '') => `已學習並上陣：${moveName}${note ? ` ${note}` : ''}`.trim(),
    moveMissing: '⚠️ 這招不存在或已被移除。',
    protectedMove: '⚠️ 基礎招式不能取消學習。',
    unlearnFailed: (reason) => `❌ ${reason || '取消學習失敗'}`,
    unlearnSuccess: (moveName) => `已取消學習：${moveName}（已退回技能晶片）`,
    missingPet: '⚠️ 找不到要設定的寵物。',
    autoAssignEnabled: 'ℹ️ 已改為自動上陣模式：已學會攻擊招式會自動攜帶；不想用請取消學習。',
    listingIncomplete: '技能晶片掛賣資料不完整。',
    listingSourceMissing: '找不到可掛賣的技能晶片來源。',
    listingMoveMissing: (moveName) => `技能「${moveName}」不存在或已被移除。`,
    cannotSellFlee: '逃跑技能不可掛賣。',
    unequipBeforeSell: (moveName) => `請先把「${moveName}」從上陣招式卸下，再掛賣。`,
    notEquippedYet: (price) => `參考價 ${price} Rns｜未上陣`,
    learnedSkill: (moveName) => `已學會技能：${moveName}`,
    gainedSkillChip: (moveName) => `獲得技能晶片：${moveName}`,
    starterGiftTitle: '🎁 開局贈禮：免費五連抽',
    starterGiftEmpty: '本次技能晶片發放失敗，請稍後重試。',
    starterGiftValue: (count, chipLine) => `已發放為技能晶片（已進背包，可販售；想學再到寵物招式頁學習）。\n本次新增：${count} 張\n${chipLine}`,
    gachaFieldChips: '📚 本次獲取技能晶片',
    gachaLearnRuleTitle: '📌 學習規則',
    gachaLearnRuleValue: '抽到的是技能晶片；請到「🐾 寵物」頁面用下拉選單學習/取消學習。',
    gachaSellRuleTitle: '📦 販賣規則',
    gachaSellRuleValue: '商店掛賣時，會以「技能晶片」名稱販賣。',
    gachaNoNew: '（本次無新增）'
  },
  'zh-CN': {
    invalidChipData: '⚠️ 技能晶片资料错误，请重新选择。',
    invalidUnlearnData: '⚠️ 取消学习资料错误，请重新选择。',
    missingActor: '⚠️ 找不到要操作的宠物或角色。',
    missingMoveTemplate: '⚠️ 找不到该技能模板，可能与宠物类型不符。',
    wrongElement: '⚠️ 这个技能不适用于当前宠物属性，请改选同属性技能晶片。',
    alreadyLearned: (moveName) => `ℹ️ ${moveName} 已经学会，请直接在上阵栏配置。`,
    duplicateLearn: (moveName) => `ℹ️ ${moveName} 已经学会，无需重复学习。`,
    loadoutFull: (limit) => `⚠️ 上阵招式已满 ${limit} 招，请先取消学习一招再学新技能。`,
    inventoryMissing: (chipName) => `⚠️ 背包内找不到「${chipName}」。`,
    learnFailed: (reason) => `⚠️ ${reason || '学习失败'}（已退回晶片）`,
    replaceNote: (moveName) => `（上阵名额已满，已替换「${moveName}」）`,
    learnSuccess: (moveName, note = '') => `已学习并上阵：${moveName}${note ? ` ${note}` : ''}`.trim(),
    moveMissing: '⚠️ 这招不存在或已被移除。',
    protectedMove: '⚠️ 基础招式不能取消学习。',
    unlearnFailed: (reason) => `❌ ${reason || '取消学习失败'}`,
    unlearnSuccess: (moveName) => `已取消学习：${moveName}（已退回技能晶片）`,
    missingPet: '⚠️ 找不到要设定的宠物。',
    autoAssignEnabled: 'ℹ️ 已改为自动上阵模式：已学会攻击招式会自动携带；不想用请取消学习。',
    listingIncomplete: '技能晶片挂卖资料不完整。',
    listingSourceMissing: '找不到可挂卖的技能晶片来源。',
    listingMoveMissing: (moveName) => `技能「${moveName}」不存在或已被移除。`,
    cannotSellFlee: '逃跑技能不可挂卖。',
    unequipBeforeSell: (moveName) => `请先把「${moveName}」从上阵招式卸下，再挂卖。`,
    notEquippedYet: (price) => `参考价 ${price} Rns｜未上阵`,
    learnedSkill: (moveName) => `已学会技能：${moveName}`,
    gainedSkillChip: (moveName) => `获得技能晶片：${moveName}`,
    starterGiftTitle: '🎁 开局赠礼：免费五连抽',
    starterGiftEmpty: '本次技能晶片发放失败，请稍后重试。',
    starterGiftValue: (count, chipLine) => `已发放为技能晶片（已进背包，可贩售；想学再到宠物招式页学习）。\n本次新增：${count} 张\n${chipLine}`,
    gachaFieldChips: '📚 本次获取技能晶片',
    gachaLearnRuleTitle: '📌 学习规则',
    gachaLearnRuleValue: '抽到的是技能晶片；请到「🐾 宠物」页面用下拉选单学习/取消学习。',
    gachaSellRuleTitle: '📦 贩卖规则',
    gachaSellRuleValue: '商店挂卖时，会以「技能晶片」名称贩卖。',
    gachaNoNew: '（本次无新增）'
  },
  en: {
    invalidChipData: '⚠️ Invalid skill chip data. Please choose again.',
    invalidUnlearnData: '⚠️ Invalid unlearn data. Please choose again.',
    missingActor: '⚠️ Could not find the target pet or character.',
    missingMoveTemplate: '⚠️ Move template not found. It may not match this pet type.',
    wrongElement: '⚠️ This move does not match the current pet element. Choose a compatible skill chip.',
    alreadyLearned: (moveName) => `ℹ️ ${moveName} is already learned. Adjust it from the loadout instead.`,
    duplicateLearn: (moveName) => `ℹ️ ${moveName} is already learned. No need to learn it again.`,
    loadoutFull: (limit) => `⚠️ Battle loadout is full at ${limit} moves. Unlearn one move first.`,
    inventoryMissing: (chipName) => `⚠️ ${chipName} was not found in your bag.`,
    learnFailed: (reason) => `⚠️ ${reason || 'Learning failed'} (chip returned)`,
    replaceNote: (moveName) => `(loadout was full, replaced "${moveName}")`,
    learnSuccess: (moveName, note = '') => `Learned and equipped: ${moveName}${note ? ` ${note}` : ''}`.trim(),
    moveMissing: '⚠️ This move no longer exists or was removed.',
    protectedMove: '⚠️ Base moves cannot be unlearned.',
    unlearnFailed: (reason) => `❌ ${reason || 'Unlearn failed'}`,
    unlearnSuccess: (moveName) => `Unlearned: ${moveName} (skill chip returned)`,
    missingPet: '⚠️ Could not find the pet to configure.',
    autoAssignEnabled: 'ℹ️ Auto-loadout enabled: learned attack moves will be carried automatically. Unlearn a move if you do not want it.',
    listingIncomplete: 'Skill chip listing data is incomplete.',
    listingSourceMissing: 'Could not find the source skill chip for listing.',
    listingMoveMissing: (moveName) => `Move "${moveName}" does not exist or was removed.`,
    cannotSellFlee: 'Flee-type moves cannot be listed for sale.',
    unequipBeforeSell: (moveName) => `Remove "${moveName}" from the active loadout before listing it.`,
    notEquippedYet: (price) => `Ref ${price} Rns | Not equipped`,
    learnedSkill: (moveName) => `Learned move: ${moveName}`,
    gainedSkillChip: (moveName) => `Received skill chip: ${moveName}`,
    starterGiftTitle: '🎁 Starter Gift: Free 5-Pack',
    starterGiftEmpty: 'Skill chip grant failed this time. Please try again later.',
    starterGiftValue: (count, chipLine) => `Granted as skill chips and placed in your bag. You can sell them now or learn them later from the pet move page.\nNew this time: ${count}\n${chipLine}`,
    gachaFieldChips: '📚 Skill Chips Obtained',
    gachaLearnRuleTitle: '📌 Learn Rule',
    gachaLearnRuleValue: 'Draw results become skill chips. Learn or unlearn them from the "🐾 Pet" page.',
    gachaSellRuleTitle: '📦 Sell Rule',
    gachaSellRuleValue: 'When listed in the shop, they are sold as skill chips.',
    gachaNoNew: '(No new chips this time)'
  }
});

const MOVE_LOCALIZATION = Object.freeze([
  ['golden_needle', '脈衝標定', 'Pulse Calibration'],
  ['iron_palm', '合金撞擊', 'Alloy Ram'],
  ['shield_stance', '稜鏡護層', 'Prism Sheath'],
  ['spider_net', '纖維束縛', 'Fiber Bind'],
  ['grass_cloak', '生物修補', 'Biorepair'],
  ['root_trap', '根網干擾', 'Root Net Interference'],
  ['willow_water', '淨化波', 'Purge Wave'],
  ['water_splash', '水壓脈衝', 'Pressure Pulse'],
  ['mist_step', '霧相位移', 'Mist Phase'],
  ['needle_rain', '碎晶風暴', 'Crystal Storm'],
  ['golden_bell', '堡壘力場', 'Bastion Field'],
  ['heavenly_flowers', '孢子刃雨', 'Spore Blade Rain'],
  ['ice_palm', '低溫衝擊', 'Cryo Impact'],
  ['blaze_sky', '電漿盛放', 'Plasma Bloom'],
  ['flame_armor', '熱盾回路', 'Thermal Shield Circuit'],
  ['rejuvenation', '再生矩陣', 'Regeneration Matrix'],
  ['rock_trap', '隕塊墜落', 'Meteor Drop'],
  ['quicksand', '漂砂陷落', 'Drifting Quicksand'],
  ['tide_barrier', '潮幕護壁', 'Tidal Barrier'],
  ['frost_lance', '霜稜突刺', 'Frost Lance'],
  ['steam_screen', '蒸汽迷障', 'Steam Veil'],
  ['wildfire_chain', '野火連鎖', 'Wildfire Chain'],
  ['cinder_smoke', '燼霧擾流', 'Cinder Haze'],
  ['flare_snare', '焰鎖牽制', 'Flare Snare'],
  ['thorn_bind', '棘藤封步', 'Thorn Bind'],
  ['spore_haze', '孢霧惑心', 'Spore Haze'],
  ['forest_mend', '森息回春', 'Forest Mend'],
  ['vine_bastion', '藤甲堡壘', 'Vine Bastion'],
  ['rip_current', '裂流切線', 'Riptide Cut'],
  ['bubble_guard', '泡沫護甲', 'Bubble Guard'],
  ['echo_wave', '回音水波', 'Echo Wave'],
  ['spring_pulse', '泉心脈衝', 'Spring Pulse'],
  ['foam_dart', '沫刃突刺', 'Foam Dart'],
  ['stream_guard', '流盾護持', 'Stream Guard'],
  ['rain_edge', '驟雨刃', 'Rain Edge'],
  ['mirror_tide', '鏡潮反域', 'Mirror Tide'],
  ['deep_pressure', '深海壓潰', 'Abyssal Crush'],
  ['clear_mind_tide', '清心潮息', 'Clarity Tide'],
  ['current_chain', '流鎖纏潮', 'Current Chain'],
  ['ember_step', '餘燼步', 'Ember Step'],
  ['ash_guard', '灰燼護幕', 'Ash Guard'],
  ['flare_jab', '炫光突刺', 'Flare Jab'],
  ['magma_bite', '熔牙咬擊', 'Magma Bite'],
  ['sunforge', '日鍛迴路', 'Sunforge Circuit'],
  ['spark_claw', '火花爪裂', 'Spark Claw'],
  ['char_pulse', '焦痕脈衝', 'Char Pulse'],
  ['lava_step', '熔步突進', 'Lava Rush'],
  ['firebrand_strike', '炎印重擊', 'Firebrand Strike'],
  ['volcanic_burst', '熔岩爆湧', 'Volcanic Surge'],
  ['smoke_screen', '煙幕火牆', 'Smoke Firewall'],
  ['burning_edge', '灼鋒連斬', 'Burning Edge'],
  ['heat_sink', '熾核護盾', 'Cinder Core Shield'],
  ['seed_shot', '種子速射', 'Seed Volley'],
  ['leaf_step', '葉影步', 'Leafstep'],
  ['bark_skin', '樹皮硬化', 'Barkskin'],
  ['dew_heal', '晨露療息', 'Morning Dew'],
  ['thorn_whip', '荊棘鞭擊', 'Thorn Whip'],
  ['bud_guard', '芽盾護生', 'Bud Guard'],
  ['sap_strike', '樹液擊', 'Sap Strike'],
  ['petal_dance', '花瓣舞步', 'Petal Dance'],
  ['pollen_shock', '花粉震盪', 'Pollen Shock'],
  ['root_spike', '根槍穿刺', 'Root Spike'],
  ['nature_cycle', '循環新生', 'Nature Cycle'],
  ['ancient_canopy', '遠古樹冠', 'Ancient Canopy'],
  ['flood_torrent', '潮汐奇點', 'Tidal Singularity'],
  ['fire_lotus', '日核裂解', 'Solar Fission'],
  ['arhat_kick', '地脈衝撞', 'Leyline Crash'],
  ['wind_fire_blade', '風暴聚變', 'Storm Fusion'],
  ['thunder_crash', '雷矢超載', 'Thunderbolt Overload'],
  ['maelstrom_prison', '渦牢封界', 'Maelstrom Prison'],
  ['ocean_renewal', '海核復甦', 'Ocean Core Renewal'],
  ['inferno_drive', '煉獄推進', 'Inferno Drive'],
  ['phoenix_guard', '鳳燼守輪', 'Phoenix Guardwheel'],
  ['bloom_overgrowth', '繁花覆域', 'Blooming Overgrowth'],
  ['shadow_slash', '影域切割', 'Shadow Slash'],
  ['shadow_lock', '故障鎖定', 'Glitch Lock'],
  ['fear_presence', '恐懼脈衝', 'Fear Pulse'],
  ['spider_silk', '黏網拘束', 'Web Snare'],
  ['minor_poison', '毒霧火花', 'Toxic Spark'],
  ['curse_word', '靜電咒訊', 'Static Hex'],
  ['soul_drain', '核心抽離', 'Core Drain'],
  ['soul_scatter', '神經霧化', 'Neural Mist'],
  ['seven_step_poison', '腐蝕鏈劑', 'Corrosion Chain'],
  ['bone_dissolver', '熔蝕酸流', 'Melting Acidflow'],
  ['hot_sand_hell', '炙砂域', 'Scorchsand Field'],
  ['plague_cloud', '疫霧群', 'Plague Cloud'],
  ['iron_thorn', '棘甲反刺', 'Iron Thorn'],
  ['hell_fire', '煉域協議', 'Infernal Protocol'],
  ['explosive_pill', '連鎖爆訊', 'Chain Detonation'],
  ['ghost_fire', '幽格炙流', 'Spectral Scorch'],
  ['silver_snake', '銀鏈束陣', 'Silver Chain Array'],
  ['ice_toxin', '冰毒脈衝', 'Cryotoxin Pulse'],
  ['mud_fire_lotus', '泥焰遮幕', 'Mudflame Veil'],
  ['ultimate_dark', '零界崩解', 'Null Boundary Collapse'],
  ['head_butt', '頭槌', 'Headbutt'],
  ['flee', '逃跑', 'Flee']
]);

function normalizeMoveNameLookupKey(name = '') {
  return String(name || '')
    .replace(/\u3000/g, ' ')
    .replace(/[「」『』"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectMoveNameVariants(moveName = '') {
  const seed = String(moveName || '').trim();
  if (!seed) return [];
  const out = [];
  const seen = new Set();
  function addVariant(value = '') {
    const safe = String(value || '').trim();
    if (!safe || seen.has(safe)) return;
    seen.add(safe);
    out.push(safe);
  }
  const directVariants = [
    seed,
    convertCNToTW(seed),
    localizeScriptOnly(seed, 'zh-TW'),
    localizeScriptOnly(seed, 'zh-CN')
  ];
  for (const value of directVariants) addVariant(value);
  const sanitized = String(sanitizeWorldText(seed) || '').trim();
  if (sanitized && sanitized !== seed) {
    const sanitizedVariants = [
      sanitized,
      convertCNToTW(sanitized),
      localizeScriptOnly(sanitized, 'zh-TW'),
      localizeScriptOnly(sanitized, 'zh-CN')
    ];
    for (const value of sanitizedVariants) addVariant(value);
  }
  return out;
}

const MOVE_META_BY_ID = new Map(MOVE_LOCALIZATION.map(([id, zh, en]) => [String(id), {
  id: String(id),
  zh: String(zh),
  en: String(en),
  ko: translateMoveNameToKo(String(en))
}]));
const MOVE_ID_BY_ZH_KEY = new Map();
for (const [id, zh] of MOVE_LOCALIZATION) {
  const raw = String(zh || '').trim();
  const variants = [
    raw,
    localizeScriptOnly(raw, 'zh-TW'),
    localizeScriptOnly(raw, 'zh-CN'),
    convertCNToTW(raw),
    convertTWToCN(raw)
  ];
  for (const variant of variants) {
    const key = normalizeMoveNameLookupKey(variant);
    if (!key || MOVE_ID_BY_ZH_KEY.has(key)) continue;
    MOVE_ID_BY_ZH_KEY.set(key, String(id));
  }
}
function resolveMoveMeta(moveId = '', moveName = '') {
  const safeMoveId = String(moveId || '').trim();
  if (safeMoveId && MOVE_META_BY_ID.has(safeMoveId)) {
    return MOVE_META_BY_ID.get(safeMoveId);
  }
  const name = String(moveName || '').trim();
  if (!name) return null;
  const variants = collectMoveNameVariants(name);
  for (const variant of variants) {
    const key = normalizeMoveNameLookupKey(variant);
    if (!key) continue;
    const resolvedId = MOVE_ID_BY_ZH_KEY.get(key);
    if (resolvedId && MOVE_META_BY_ID.has(resolvedId)) {
      return MOVE_META_BY_ID.get(resolvedId);
    }
  }
  return null;
}

function normalizeTextValue(value = '') {
  return String(value || '').trim();
}

function containsCJKText(value = '') {
  return /[\u3400-\u9fff]/u.test(String(value || ''));
}

function containsKoreanText(value = '') {
  return /[\uac00-\ud7a3]/u.test(String(value || ''));
}

function cleanEnglishText(text = '') {
  return String(text || '')
    .replace(/[，。！？；：、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanKoreanText(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyItemTokenEnglishTranslation(text = '') {
  let out = String(text || '');
  for (const [zhToken, enToken] of ITEM_TOKEN_EN_TRANSLATIONS) {
    if (!zhToken || !enToken) continue;
    out = out.split(zhToken).join(` ${enToken} `);
  }
  return cleanEnglishText(out);
}

function lookupExactTranslation(translationMap = {}, text = '') {
  if (!translationMap || typeof translationMap !== 'object') return '';
  const source = normalizeTextValue(text);
  if (!source) return '';
  const variants = [
    source,
    localizeScriptOnly(source, 'zh-TW'),
    localizeScriptOnly(source, 'zh-CN'),
    convertCNToTW(source),
    convertTWToCN(source)
  ];
  for (const variant of variants) {
    const key = normalizeTextValue(variant);
    if (!key) continue;
    const hit = normalizeTextValue(translationMap[key] || '');
    if (hit) return hit;
  }
  return '';
}

function applyTokenReplacement(text = '', tokenRows = []) {
  let out = String(text || '');
  for (const [source, target] of tokenRows) {
    if (!source || !target) continue;
    out = out.split(source).join(target);
  }
  return out;
}

function translateEnglishToKo(text = '') {
  const source = normalizeTextValue(text);
  if (!source) return '';
  if (containsKoreanText(source)) return source;
  const exact = normalizeTextValue(KO_EXACT_TRANSLATIONS[source] || '');
  if (exact) return exact;
  const replaced = applyTokenReplacement(source, KO_EN_TOKEN_TRANSLATIONS);
  return cleanKoreanText(replaced);
}

function translateChineseToKo(text = '') {
  const source = normalizeTextValue(text);
  if (!source) return '';
  if (containsKoreanText(source)) return source;
  const replaced = applyTokenReplacement(source, KO_ZH_TOKEN_TRANSLATIONS);
  return cleanKoreanText(replaced);
}

function translateMoveNameToKo(englishName = '') {
  const source = normalizeTextValue(englishName);
  if (!source) return '';
  if (containsKoreanText(source)) return source;
  let out = source;
  for (const [token, ko] of MOVE_WORD_TO_KO) {
    if (!token || !ko) continue;
    const pattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'gi');
    out = out.replace(pattern, ko);
  }
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out;
}

function translateTextToKo(text = '') {
  const source = normalizeTextValue(text);
  if (!source) return '';
  if (containsKoreanText(source)) return source;
  const byItemNameKo = translateItemNameToKo(source);
  if (byItemNameKo) return byItemNameKo;
  const byItemDescKo = translateItemDescToKo(source);
  if (byItemDescKo) return byItemDescKo;
  if (!containsCJKText(source)) {
    const en = translateEnglishToKo(source);
    return en || source;
  }
  const zh = translateChineseToKo(source);
  if (zh && zh !== source) return zh;
  return source;
}

function localizeObjectToKorean(value = null) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return translateTextToKo(value);
  if (typeof value === 'function') {
    return (...args) => translateTextToKo(String(value(...args) || ''));
  }
  if (Array.isArray(value)) return value.map((item) => localizeObjectToKorean(item));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, row] of Object.entries(value)) {
      out[key] = localizeObjectToKorean(row);
    }
    return out;
  }
  return value;
}

function translateItemNameToEn(name = '') {
  const source = normalizeTextValue(name);
  if (!source) return '';
  if (!containsCJKText(source)) return source;
  const exact = lookupExactTranslation(ITEM_NAME_EN_TRANSLATIONS, source);
  if (exact) return exact;
  const tokenized = applyItemTokenEnglishTranslation(source);
  if (tokenized && !containsCJKText(tokenized)) return tokenized;
  return '';
}

function translateItemNameToKo(name = '') {
  const source = normalizeTextValue(name);
  if (!source) return '';
  if (containsKoreanText(source)) return source;
  const exact = lookupExactTranslation(ITEM_NAME_KO_TRANSLATIONS, source);
  if (exact) return exact;
  const enBase = translateItemNameToEn(source);
  if (enBase) {
    const koByEn = translateEnglishToKo(enBase);
    if (koByEn && koByEn !== enBase) return koByEn;
  }
  const zhBase = translateChineseToKo(source);
  if (zhBase && zhBase !== source) return zhBase;
  return '';
}

function translateLocationToEn(location = '') {
  const source = normalizeTextValue(location);
  if (!source) return '';
  const exact = normalizeTextValue(ITEM_LOCATION_EN_TRANSLATIONS[source] || '');
  if (exact) return exact;
  return translateItemNameToEn(source);
}

function translateRarityToEn(rarity = '') {
  const source = normalizeTextValue(rarity);
  if (!source) return '';
  return normalizeTextValue(ITEM_RARITY_EN_TRANSLATIONS[source] || source);
}

function translateSourceToEn(sourceName = '') {
  const source = normalizeTextValue(sourceName);
  if (!source) return '';
  const exact = normalizeTextValue(ITEM_SOURCE_EN_TRANSLATIONS[source] || '');
  if (exact) return exact;
  const byName = translateItemNameToEn(source);
  return byName || source;
}

function translateItemDescToEn(desc = '') {
  const source = normalizeTextValue(desc);
  if (!source) return '';
  if (!containsCJKText(source)) return source;

  const exact = lookupExactTranslation(ITEM_DESC_EN_TRANSLATIONS, source);
  if (exact) return exact;

  const treasure = source.match(/^(.+?)\s+探索發現的(普通|稀有|史詩)寶藏。$/u);
  if (treasure) {
    const location = translateLocationToEn(treasure[1]) || normalizeTextValue(treasure[1]);
    const rarity = translateRarityToEn(treasure[2]) || normalizeTextValue(treasure[2]);
    return `${rarity} treasure discovered in ${location}.`;
  }

  const herb = source.match(/^(.+?)\s+採集取得的普通草藥。$/u);
  if (herb) {
    const location = translateLocationToEn(herb[1]) || normalizeTextValue(herb[1]);
    return `Common herb gathered in ${location}.`;
  }

  const prey = source.match(/^(.+?)\s+狩獵取得的普通獵物。$/u);
  if (prey) {
    const location = translateLocationToEn(prey[1]) || normalizeTextValue(prey[1]);
    return `Common prey hunted in ${location}.`;
  }

  const trophy = source.match(/^來自\s+(.+?)\s+的(普通|稀有|史詩)戰鬥證物。$/u);
  if (trophy) {
    const enemy = translateSourceToEn(trophy[1]) || normalizeTextValue(trophy[1]);
    const rarity = translateRarityToEn(trophy[2]) || normalizeTextValue(trophy[2]);
    return `${rarity} battle trophy from ${enemy}.`;
  }

  const tokenized = applyItemTokenEnglishTranslation(source);
  if (tokenized && !containsCJKText(tokenized)) return tokenized;
  return '';
}

function translateItemDescToKo(desc = '') {
  const source = normalizeTextValue(desc);
  if (!source) return '';
  if (containsKoreanText(source)) return source;

  const exact = lookupExactTranslation(ITEM_DESC_KO_TRANSLATIONS, source);
  if (exact) return exact;

  const enBase = translateItemDescToEn(source);
  if (enBase && enBase !== 'Untranslated Description') {
    const koByEn = translateEnglishToKo(enBase);
    if (koByEn && koByEn !== enBase) return koByEn;
  }

  const zhBase = translateChineseToKo(source);
  if (zhBase && zhBase !== source) return zhBase;
  return '';
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = normalizeTextValue(value);
    if (text) return text;
  }
  return '';
}

function resolveEnglishValue(zhTw = '', sourceMap = {}, fallbackMap = {}, options = {}) {
  const base = normalizeTextValue(zhTw);
  const explicit = pickFirstText(sourceMap.en, fallbackMap.en, options?.fallbackEn);
  const translator = typeof options?.translateEn === 'function' ? options.translateEn : null;
  const fallbackLabel = normalizeTextValue(options?.enFallback || 'Untranslated Item');

  if (explicit && !containsCJKText(explicit) && explicit !== base) return explicit;

  if (translator) {
    const generated = normalizeTextValue(translator(base));
    if (generated && !containsCJKText(generated)) return generated;
  }

  if (explicit && !containsCJKText(explicit)) return explicit;
  if (!containsCJKText(base)) return base;
  return fallbackLabel || 'Untranslated Item';
}

function resolveKoreanValue(zhTw = '', sourceMap = {}, fallbackMap = {}, options = {}) {
  const base = normalizeTextValue(zhTw);
  const explicit = pickFirstText(sourceMap.ko, fallbackMap.ko, options?.fallbackKo);
  const translator = typeof options?.translateKo === 'function' ? options.translateKo : translateTextToKo;
  const fallbackLabel = normalizeTextValue(options?.koFallback || '미번역');

  if (explicit && containsKoreanText(explicit) && explicit !== base) return explicit;

  if (typeof translator === 'function') {
    const generated = normalizeTextValue(translator(base));
    if (generated && containsKoreanText(generated)) return generated;
  }

  if (explicit && !containsCJKText(explicit)) return translateEnglishToKo(explicit) || explicit;
  if (!containsCJKText(base)) return translateEnglishToKo(base) || base;
  return fallbackLabel || '미번역';
}

function collectLocalizedLangKeys(...maps) {
  const keys = [...ITEM_LOCALIZATION_LANGS];
  const seen = new Set(keys);
  for (const map of maps) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    for (const key of Object.keys(map)) {
      const safe = normalizeTextValue(key);
      if (!safe || seen.has(safe)) continue;
      seen.add(safe);
      keys.push(safe);
    }
  }
  return keys;
}

function normalizeLocalizedTextMap(source = {}, fallback = {}, options = {}) {
  const sourceMap = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const fallbackMap = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {};
  const fallbackText = normalizeTextValue(options?.fallbackText || '');
  const zhTwSeed = pickFirstText(
    sourceMap['zh-TW'],
    fallbackMap['zh-TW'],
    sourceMap['zh-CN'] ? localizeScriptOnly(sourceMap['zh-CN'], 'zh-TW') : '',
    fallbackMap['zh-CN'] ? localizeScriptOnly(fallbackMap['zh-CN'], 'zh-TW') : '',
    sourceMap.en,
    fallbackMap.en,
    fallbackText
  );
  if (!zhTwSeed) return null;
  const zhTw = localizeScriptOnly(zhTwSeed, 'zh-TW');
  const keys = collectLocalizedLangKeys(sourceMap, fallbackMap);
  const out = {};
  for (const key of keys) {
    if (key === 'en') {
      out[key] = resolveEnglishValue(zhTw, sourceMap, fallbackMap, options);
      continue;
    }
    const explicit = pickFirstText(sourceMap[key], fallbackMap[key]);
    if (explicit) {
      out[key] = explicit;
      continue;
    }
    if (key === 'zh-TW') {
      out[key] = zhTw;
      continue;
    }
    if (key === 'zh-CN') {
      out[key] = localizeScriptOnly(zhTw, 'zh-CN');
      continue;
    }
    if (key === 'ko') {
      out[key] = resolveKoreanValue(zhTw, sourceMap, fallbackMap, options);
      continue;
    }
    out[key] = zhTw;
  }
  if (!out['zh-TW']) out['zh-TW'] = zhTw;
  if (!out['zh-CN']) out['zh-CN'] = localizeScriptOnly(out['zh-TW'], 'zh-CN');
  if (!out.ko) out.ko = resolveKoreanValue(out['zh-TW'], sourceMap, fallbackMap, options);
  if (!out.en) out.en = resolveEnglishValue(out['zh-TW'], sourceMap, fallbackMap, options);
  return out;
}

function normalizeLangCode(lang = 'zh-TW') {
  const raw = String(lang || '').trim();
  const lower = raw.toLowerCase();
  if (
    raw === 'zh-CN' ||
    lower === 'zh-cn' ||
    lower === 'zh_cn' ||
    lower === 'zh-hans' ||
    lower === 'cn' ||
    lower === 'sc' ||
    lower.includes('简体')
  ) return 'zh-CN';
  if (
    raw === 'en' ||
    lower === 'english' ||
    lower === 'en-us' ||
    lower.startsWith('en-')
  ) return 'en';
  if (
    raw === 'ko' ||
    raw === 'ko-KR' ||
    lower === 'ko' ||
    lower === 'ko-kr' ||
    lower === 'kr' ||
    lower === 'korean' ||
    lower.includes('한국') ||
    lower.includes('korean')
  ) return 'ko';
  return 'zh-TW';
}

function localizeScriptOnly(text = '', lang = 'zh-TW') {
  const source = String(text || '');
  const code = normalizeLangCode(lang);
  if (!source) return '';
  if (code === 'ko') return translateTextToKo(source);
  if (code === 'zh-CN') return convertTWToCN(source);
  if (code === 'zh-TW') return convertCNToTW(source);
  return source;
}

function getSkillChipPrefix(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  return SKILL_CHIP_PREFIX[code] || SKILL_CHIP_PREFIX['zh-TW'];
}

function buildSkillChipPrefixAliases() {
  return [
    '技能晶片：',
    '技能晶片:',
    '技能晶片-',
    '技能晶片－',
    '技能芯片：',
    '技能芯片:',
    '技能芯片-',
    '技能芯片－',
    'Skill Chip: ',
    'Skill Chip:',
    'Skill Chip -',
    'Skill Chip－',
    'SkillChip:',
    '스킬 칩:',
    '스킬 칩：',
    '스킬칩:',
    '스킬칩：'
  ];
}

const SKILL_CHIP_PREFIX_ALIASES = buildSkillChipPrefixAliases();

function stripSkillChipPrefix(name = '') {
  const text = String(name || '').trim();
  if (!text) return '';
  for (const prefix of SKILL_CHIP_PREFIX_ALIASES) {
    if (text.startsWith(prefix)) return text.slice(prefix.length).trim();
  }
  const regexMatch = text.match(/^(?:技能晶片|技能芯片|skill\s*chip|스킬\s*칩|스킬칩)\s*[:：\-－]?\s*(.+)$/iu);
  if (regexMatch?.[1]) return String(regexMatch[1] || '').trim();
  return '';
}

function getMoveLocalization(moveId = '', moveName = '', lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const fallbackName = String(moveName || '').trim();
  const moveMeta = resolveMoveMeta(moveId, fallbackName);
  if (code === 'ko') {
    const ko = normalizeTextValue(moveMeta?.ko || '');
    if (ko) return ko;
    if (moveMeta?.en) return translateMoveNameToKo(moveMeta.en) || moveMeta.en;
    return translateTextToKo(fallbackName);
  }
  if (code === 'en') {
    if (moveMeta?.en) return moveMeta.en;
    return fallbackName;
  }
  const zhBase = String(moveMeta?.zh || fallbackName);
  if (code === 'zh-CN') return localizeScriptOnly(zhBase, 'zh-CN');
  return localizeScriptOnly(zhBase, 'zh-TW');
}

function formatSkillChipDisplay(moveId = '', moveName = '', lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const localizedMoveName = getMoveLocalization(moveId, moveName, code) || String(moveName || '').trim();
  return `${getSkillChipPrefix(code)}${localizedMoveName}`.trim();
}

function buildItemNamePack(raw = null) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const names = raw.names && typeof raw.names === 'object'
      ? raw.names
      : (raw.itemNames && typeof raw.itemNames === 'object' ? raw.itemNames : null);
    if (names) {
      return normalizeLocalizedTextMap(
        names,
        {},
        {
          fallbackText: pickFirstText(raw.name, raw.itemName),
          translateKo: translateItemNameToKo,
          koFallback: '미번역 아이템',
          translateEn: translateItemNameToEn,
          enFallback: 'Untranslated Item'
        }
      );
    }
  }

  const baseName = typeof raw === 'string'
    ? String(raw).trim()
    : String(raw?.name || raw?.itemName || '').trim();
  if (!baseName) return null;

  const common = COMMON_ITEM_TRANSLATIONS[baseName];
  if (common) {
    return {
      'zh-TW': String(common['zh-TW'] || baseName),
      'zh-CN': String(common['zh-CN'] || localizeScriptOnly(baseName, 'zh-CN')),
      en: String(common.en || baseName)
    };
  }

  const chipMoveName = stripSkillChipPrefix(baseName);
  if (chipMoveName) {
    const zhTwMoveName = localizeScriptOnly(chipMoveName, 'zh-TW');
    return normalizeLocalizedTextMap({
      'zh-TW': `${getSkillChipPrefix('zh-TW')}${zhTwMoveName}`,
      'zh-CN': `${getSkillChipPrefix('zh-CN')}${localizeScriptOnly(zhTwMoveName, 'zh-CN')}`,
      ko: `${getSkillChipPrefix('ko')}${getMoveLocalization('', zhTwMoveName, 'ko')}`,
      en: `${getSkillChipPrefix('en')}${getMoveLocalization('', zhTwMoveName, 'en')}`
    });
  }

  return normalizeLocalizedTextMap({
    'zh-TW': localizeScriptOnly(baseName, 'zh-TW'),
    'zh-CN': localizeScriptOnly(baseName, 'zh-CN')
  }, {}, {
    fallbackText: localizeScriptOnly(baseName, 'zh-TW'),
    translateKo: translateItemNameToKo,
    koFallback: '미번역 아이템',
    translateEn: translateItemNameToEn,
    enFallback: 'Untranslated Item'
  });
}

function buildItemDescPack(raw = null) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const descs = raw.descs && typeof raw.descs === 'object'
      ? raw.descs
      : (raw.itemDescs && typeof raw.itemDescs === 'object' ? raw.itemDescs : null);
    const fallbackText = pickFirstText(raw.desc, raw.lore, raw.itemDesc);
    if (descs) {
      return normalizeLocalizedTextMap(descs, {}, {
        fallbackText,
        translateKo: translateItemDescToKo,
        koFallback: '미번역 설명',
        translateEn: translateItemDescToEn,
        enFallback: 'Untranslated Description'
      });
    }
    if (!fallbackText) return null;
    return normalizeLocalizedTextMap({ 'zh-TW': fallbackText }, {}, {
      fallbackText,
      translateKo: translateItemDescToKo,
      koFallback: '미번역 설명',
      translateEn: translateItemDescToEn,
      enFallback: 'Untranslated Description'
    });
  }
  const text = normalizeTextValue(raw);
  if (!text) return null;
  return normalizeLocalizedTextMap({ 'zh-TW': text }, {}, {
    fallbackText: text,
    translateKo: translateItemDescToKo,
    koFallback: '미번역 설명',
    translateEn: translateItemDescToEn,
    enFallback: 'Untranslated Description'
  });
}

function getLocalizedTextFromPack(pack = null, lang = 'zh-TW') {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return '';
  const code = normalizeLangCode(lang);
  if (code === 'ko') {
    const ko = normalizeTextValue(pack.ko || '');
    if (ko) return ko;
    const base = normalizeTextValue(pack.en || pack['zh-TW'] || pack['zh-CN'] || '');
    return translateTextToKo(base) || base;
  }
  return normalizeTextValue(pack[code] || pack['zh-TW'] || pack.en || '');
}

function getLocalizedItemName(raw = null, lang = 'zh-TW') {
  const pack = buildItemNamePack(raw);
  return getLocalizedTextFromPack(pack, lang);
}

function getLocalizedItemDesc(raw = null, lang = 'zh-TW') {
  const pack = buildItemDescPack(raw);
  return getLocalizedTextFromPack(pack, lang);
}

function resolveChoiceTagKey(tag = '') {
  const text = String(tag || '').replace(/[【】\[\]]/g, '').trim();
  if (!text) return '';
  if (/🔥|高風險|高风险|high\s*risk|고위험/iu.test(text)) return 'high_risk';
  if (/💰|需花錢|需花钱|costs?\s*money|spend|비용/iu.test(text)) return 'spend';
  if (/🤝|需社交|社交|social|友誼賽|友谊赛|friendly\s*spar|소셜|우호 대련/iu.test(text)) return text.includes('友') || /friendly\s*spar|우호 대련/iu.test(text) ? 'friendly_spar' : 'social';
  if (/🔍|需探索|探索|explore|탐험/iu.test(text)) return 'explore';
  if (/⚔️|會戰鬥|会战斗|combat|전투/iu.test(text)) return 'combat';
  if (/🎁|高回報|高回报|high\s*reward|고보상/iu.test(text)) return 'reward';
  if (/❓|有驚喜|有惊喜|uncertain|surprise|불확실/iu.test(text)) return 'surprise';
  if (/🏪|鑑價站|鉴价站|appraisal|감정/iu.test(text)) return 'appraisal';
  if (/🕳️|神秘鑑價|神秘鉴价|mystery\s*appraisal|신비 감정/iu.test(text)) return 'mystery_appraisal';
  if (/🧩|友善鑑價|友善鉴价|friendly\s*appraisal|우호 감정/iu.test(text)) return 'friendly_appraisal';
  return '';
}

function getChoiceTag(key = '', lang = 'zh-TW') {
  const row = CHOICE_TAGS[String(key || '').trim()];
  if (!row) return '';
  const code = normalizeLangCode(lang);
  if (code === 'ko') {
    const baseLabel = row.labels.en || row.labels['zh-TW'] || '';
    return `[${row.emoji}${translateTextToKo(baseLabel)}]`;
  }
  return `[${row.emoji}${row.labels[code] || row.labels['zh-TW']}]`;
}

function localizeChoiceTag(tag = '', lang = 'zh-TW') {
  const key = resolveChoiceTagKey(tag);
  return key ? getChoiceTag(key, lang) : localizeScriptOnly(tag, lang);
}

function getChoiceTagPromptLines(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const orderedKeys = ['high_risk', 'spend', 'social', 'explore', 'combat', 'reward', 'surprise'];
  return orderedKeys
    .map((key) => {
      const row = CHOICE_TAGS[key];
      const desc = code === 'ko'
        ? translateTextToKo(row.desc.en || row.desc['zh-TW'] || '')
        : (row.desc[code] || row.desc['zh-TW']);
      return `- ${getChoiceTag(key, code)} - ${desc}`;
    })
    .join('\n');
}

function isAggressiveChoiceTag(tag = '') {
  const key = resolveChoiceTagKey(tag);
  return key === 'high_risk' || key === 'combat';
}

function getGenerationStatusText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  if (code === 'ko') {
    if (GENERATION_STATUS_TEXT.ko && typeof GENERATION_STATUS_TEXT.ko === 'object') {
      return GENERATION_STATUS_TEXT.ko;
    }
    return localizeObjectToKorean(GENERATION_STATUS_TEXT.en || GENERATION_STATUS_TEXT['zh-TW'] || {});
  }
  return GENERATION_STATUS_TEXT[code] || GENERATION_STATUS_TEXT['zh-TW'];
}

function getLoadingAnimationText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  if (code === 'ko') {
    if (LOADING_ANIMATION_TEXT.ko && typeof LOADING_ANIMATION_TEXT.ko === 'object') {
      return LOADING_ANIMATION_TEXT.ko;
    }
    return localizeObjectToKorean(LOADING_ANIMATION_TEXT.en || LOADING_ANIMATION_TEXT['zh-TW'] || {});
  }
  return LOADING_ANIMATION_TEXT[code] || LOADING_ANIMATION_TEXT['zh-TW'];
}

function getSkillChipUiText(lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  if (code === 'ko') {
    return localizeObjectToKorean(SKILL_CHIP_UI_TEXT.en || SKILL_CHIP_UI_TEXT['zh-TW'] || {});
  }
  return SKILL_CHIP_UI_TEXT[code] || SKILL_CHIP_UI_TEXT['zh-TW'];
}

function joinLocalizedList(items = [], lang = 'zh-TW') {
  const code = normalizeLangCode(lang);
  const list = (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return list.join(code === 'en' || code === 'ko' ? ', ' : '、');
}

module.exports = {
  ITEM_LOCALIZATION_LANGS,
  MOVE_LOCALIZATION,
  COMMON_ITEM_TRANSLATIONS,
  normalizeLangCode,
  localizeScriptOnly,
  translateTextToKo,
  localizeObjectToKorean,
  normalizeLocalizedTextMap,
  getSkillChipPrefix,
  stripSkillChipPrefix,
  getMoveLocalization,
  formatSkillChipDisplay,
  buildItemNamePack,
  buildItemDescPack,
  getLocalizedTextFromPack,
  getLocalizedItemName,
  getLocalizedItemDesc,
  resolveChoiceTagKey,
  getChoiceTag,
  localizeChoiceTag,
  getChoiceTagPromptLines,
  isAggressiveChoiceTag,
  getGenerationStatusText,
  getLoadingAnimationText,
  getSkillChipUiText,
  joinLocalizedList
};
