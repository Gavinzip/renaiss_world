/**
 * 🐾 Renaiss World - 寵物系統 v4
 * 世界觀改版：原創「生態共鳴 + 數據進化」風格
 */

const fs = require('fs');
const path = require('path');
const { LEGACY_DATA_DIR } = require('../../core/storage-paths');

const PET_FILE = path.join(LEGACY_DATA_DIR, 'pets.json');
const PET_RECOVER_TURNS = 2; // 戰敗後 2 回合復活
const PET_MOVE_LOADOUT_LIMIT = 5;
const PET_ELEMENTS = Object.freeze(['水', '火', '草']);

// ============== 聯盟系招式池（原創） ==============
const POSITIVE_MOVES = [
  // ===== Tier 1 =====
  { id: 'golden_needle', name: '脈衝標定', element: '光譜', type: 'positive', tier: 1, baseDamage: 12, effect: { stun: 1 }, desc: '以高頻脈衝鎖定目標，短暫造成停滯' },
  { id: 'iron_palm', name: '合金撞擊', element: '合金', type: 'positive', tier: 1, baseDamage: 10, effect: {}, desc: '用強化外殼發動直接衝撞' },
  { id: 'shield_stance', name: '稜鏡護層', element: '光譜', type: 'positive', tier: 1, baseDamage: 5, effect: { shield: 1 }, desc: '張開短時護層，吸收部分衝擊' },

  { id: 'spider_net', name: '纖維束縛', element: '生質', type: 'positive', tier: 1, baseDamage: 8, effect: { bind: 1 }, desc: '釋放可收縮纖維纏住對手' },
  { id: 'grass_cloak', name: '生物修補', element: '生質', type: 'positive', tier: 1, baseDamage: 0, effect: { heal: 10 }, desc: '啟動自癒模組，快速縫補損傷' },
  { id: 'root_trap', name: '根網干擾', element: '生質', type: 'positive', tier: 1, baseDamage: 9, effect: { slow: 1 }, desc: '在地面展開根網降低移動效率' },

  { id: 'willow_water', name: '淨化波', element: '液態', type: 'positive', tier: 1, baseDamage: 7, effect: { cleanse: true, heal: 10 }, desc: '釋放淨化液波，同步去除負面狀態' },
  { id: 'water_splash', name: '水壓脈衝', element: '液態', type: 'positive', tier: 1, baseDamage: 11, effect: {}, desc: '壓縮液流形成瞬間衝擊' },
  { id: 'mist_step', name: '霧相位移', element: '液態', type: 'positive', tier: 1, baseDamage: 0, effect: { dodge: 1 }, desc: '將身形霧化，短暫提高閃避' },

  // ===== Tier 2 =====
  { id: 'needle_rain', name: '碎晶風暴', element: '合金', type: 'positive', tier: 2, baseDamage: 22, effect: { bleed: 1 }, desc: '多段碎晶彈幕造成連續割裂' },
  { id: 'golden_bell', name: '堡壘力場', element: '光譜', type: 'positive', tier: 2, baseDamage: 15, effect: { shield: 2 }, desc: '生成雙層防護力場穩住前線' },
  { id: 'heavenly_flowers', name: '孢子刃雨', element: '生質', type: 'positive', tier: 2, baseDamage: 20, effect: { poison: 1 }, desc: '灑出微型孢子刃，造成中毒與切割' },
  { id: 'ice_palm', name: '低溫衝擊', element: '液態', type: 'positive', tier: 2, baseDamage: 20, effect: { freeze: 1 }, desc: '瞬降溫度凍結目標關節' },
  { id: 'blaze_sky', name: '電漿盛放', element: '熱能', type: 'positive', tier: 1, baseDamage: 25, effect: { burn: 1 }, desc: '點燃電漿雲團，造成灼燒' },
  { id: 'flame_armor', name: '熱盾回路', element: '熱能', type: 'positive', tier: 2, baseDamage: 12, effect: { reflect: 1 }, desc: '外層熱盾回彈部分攻擊傷害' },
  { id: 'rejuvenation', name: '再生矩陣', element: '生質', type: 'positive', tier: 2, baseDamage: 0, effect: { heal: 30 }, desc: '啟動深層修復矩陣恢復大量生命' },
  { id: 'rock_trap', name: '隕塊墜落', element: '地脈', type: 'positive', tier: 2, baseDamage: 22, effect: { missNext: 1 }, desc: '牽引隕塊砸落，打亂敵方節奏' },
  { id: 'quicksand', name: '漂砂陷落', element: '地脈', type: 'positive', tier: 2, baseDamage: 18, effect: { slow: 2 }, desc: '製造局部陷落區域持續牽制' },
  { id: 'tide_barrier', name: '潮幕護壁', element: '液態', type: 'positive', tier: 1, baseDamage: 8, effect: { shield: 2, heal: 10 }, desc: '召喚潮幕吸收衝擊並修復受損結構' },
  { id: 'frost_lance', name: '霜稜突刺', element: '液態', type: 'positive', tier: 2, baseDamage: 24, effect: { freeze: 1 }, desc: '凝結霜稜長槍刺穿前線並凍結關節' },
  { id: 'steam_screen', name: '蒸汽迷障', element: '液態', type: 'positive', tier: 2, baseDamage: 12, effect: { blind: 1 }, desc: '高溫蒸汽瞬間擴散，遮蔽目標視野' },
  { id: 'wildfire_chain', name: '野火連鎖', element: '熱能', type: 'positive', tier: 2, baseDamage: 27, effect: { burn: 2 }, desc: '火線沿地表跳躍擴散，造成連續灼燒' },
  { id: 'cinder_smoke', name: '燼霧擾流', element: '熱能', type: 'positive', tier: 2, baseDamage: 18, effect: { blind: 1, burn: 1 }, desc: '灰燼與熱流纏繞，降低命中並附帶灼痕' },
  { id: 'flare_snare', name: '焰鎖牽制', element: '熱能', type: 'positive', tier: 2, baseDamage: 22, effect: { bind: 1, burn: 1 }, desc: '熾焰鎖鏈纏住目標，限制行動並灼燒' },
  { id: 'thorn_bind', name: '棘藤封步', element: '生質', type: 'positive', tier: 2, baseDamage: 18, effect: { bind: 2, thorns: 1 }, desc: '棘藤纏繞封鎖步伐，反制近身攻擊' },
  { id: 'spore_haze', name: '孢霧惑心', element: '生質', type: 'positive', tier: 2, baseDamage: 16, effect: { confuse: 1, poison: 1 }, desc: '致幻孢霧擾亂判讀並緩慢侵蝕核心' },
  { id: 'forest_mend', name: '森息回春', element: '生質', type: 'positive', tier: 1, baseDamage: 0, effect: { heal: 26 }, desc: '調動林息循環，快速回補生命值' },
  { id: 'vine_bastion', name: '藤甲堡壘', element: '生質', type: 'positive', tier: 2, baseDamage: 10, effect: { shield: 2 }, desc: '纏繞藤甲形成雙層防壁，穩住陣線' },
  { id: 'rip_current', name: '裂流切線', element: '液態', type: 'positive', tier: 1, baseDamage: 13, effect: {}, desc: '以高壓水流切開防線' },
  { id: 'bubble_guard', name: '泡沫護甲', element: '液態', type: 'positive', tier: 1, baseDamage: 6, effect: { shield: 1 }, desc: '展開彈性泡膜減輕衝擊' },
  { id: 'echo_wave', name: '回音水波', element: '液態', type: 'positive', tier: 1, baseDamage: 12, effect: {}, desc: '波紋共振造成連續打擊' },
  { id: 'spring_pulse', name: '泉心脈衝', element: '液態', type: 'positive', tier: 1, baseDamage: 0, effect: { heal: 14 }, desc: '引導泉流能量回補生命' },
  { id: 'foam_dart', name: '沫刃突刺', element: '液態', type: 'positive', tier: 1, baseDamage: 12, effect: {}, desc: '壓縮泡流形成高速突刺' },
  { id: 'stream_guard', name: '流盾護持', element: '液態', type: 'positive', tier: 1, baseDamage: 7, effect: { shield: 1 }, desc: '以循環水流削弱正面衝擊' },
  { id: 'rain_edge', name: '驟雨刃', element: '液態', type: 'positive', tier: 2, baseDamage: 23, effect: { bleed: 1 }, desc: '密雨凝刃，造成割裂出血' },
  { id: 'mirror_tide', name: '鏡潮反域', element: '液態', type: 'positive', tier: 2, baseDamage: 12, effect: { reflect: 1 }, desc: '反射潮面回彈部分傷害' },
  { id: 'deep_pressure', name: '深海壓潰', element: '液態', type: 'positive', tier: 2, baseDamage: 24, effect: { defenseDown: 1 }, desc: '深層水壓壓碎護甲結構' },
  { id: 'clear_mind_tide', name: '清心潮息', element: '液態', type: 'positive', tier: 2, baseDamage: 8, effect: { cleanse: true, heal: 16 }, desc: '潮息洗淨異常並穩定節奏' },
  { id: 'current_chain', name: '流鎖纏潮', element: '液態', type: 'positive', tier: 2, baseDamage: 20, effect: { bind: 1 }, desc: '潮流化鎖纏住目標關節' },
  { id: 'ember_step', name: '餘燼步', element: '熱能', type: 'positive', tier: 1, baseDamage: 11, effect: {}, desc: '以連踏爆點快速貼近目標' },
  { id: 'ash_guard', name: '灰燼護幕', element: '熱能', type: 'positive', tier: 1, baseDamage: 7, effect: { shield: 1 }, desc: '灰燼氣流形成薄型防護' },
  { id: 'flare_jab', name: '炫光突刺', element: '熱能', type: 'positive', tier: 1, baseDamage: 14, effect: {}, desc: '火花聚焦成短距離突刺' },
  { id: 'magma_bite', name: '熔牙咬擊', element: '熱能', type: 'positive', tier: 1, baseDamage: 13, effect: { burn: 1 }, desc: '灼熱撕咬附帶燃燒效果' },
  { id: 'sunforge', name: '日鍛迴路', element: '熱能', type: 'positive', tier: 1, baseDamage: 0, effect: { heal: 12 }, desc: '短暫升溫修補受損結構' },
  { id: 'spark_claw', name: '火花爪裂', element: '熱能', type: 'positive', tier: 1, baseDamage: 12, effect: {}, desc: '以高溫爪擊撕裂裝甲接縫' },
  { id: 'char_pulse', name: '焦痕脈衝', element: '熱能', type: 'positive', tier: 1, baseDamage: 11, effect: { burn: 1 }, desc: '脈衝熱浪留下延燒焦痕' },
  { id: 'lava_step', name: '熔步突進', element: '熱能', type: 'positive', tier: 1, baseDamage: 13, effect: {}, desc: '以熔岩步伐短距離爆發突進' },
  { id: 'firebrand_strike', name: '炎印重擊', element: '熱能', type: 'positive', tier: 1, baseDamage: 14, effect: {}, desc: '烙下炎印後重擊目標核心' },
  { id: 'volcanic_burst', name: '熔岩爆湧', element: '熱能', type: 'positive', tier: 2, baseDamage: 28, effect: { burn: 1 }, desc: '熔岩熱浪爆發造成壓制' },
  { id: 'smoke_screen', name: '煙幕火牆', element: '熱能', type: 'positive', tier: 2, baseDamage: 18, effect: { blind: 1 }, desc: '煙與火交織阻斷視線' },
  { id: 'burning_edge', name: '灼鋒連斬', element: '熱能', type: 'positive', tier: 2, baseDamage: 26, effect: { burn: 1 }, desc: '高溫刃壓連斬前線' },
  { id: 'heat_sink', name: '熾核護盾', element: '熱能', type: 'positive', tier: 2, baseDamage: 10, effect: { shield: 2 }, desc: '以熱核匯流吸收傷害' },
  { id: 'seed_shot', name: '種子速射', element: '生質', type: 'positive', tier: 1, baseDamage: 12, effect: {}, desc: '高速發射硬殼種子打擊目標' },
  { id: 'leaf_step', name: '葉影步', element: '生質', type: 'positive', tier: 1, baseDamage: 8, effect: { dodge: 1 }, desc: '借葉影移位提高閃避率' },
  { id: 'bark_skin', name: '樹皮硬化', element: '生質', type: 'positive', tier: 1, baseDamage: 6, effect: { shield: 1 }, desc: '樹皮纖維硬化形成護層' },
  { id: 'dew_heal', name: '晨露療息', element: '生質', type: 'positive', tier: 1, baseDamage: 0, effect: { heal: 12 }, desc: '晨露滲透修補微創傷口' },
  { id: 'thorn_whip', name: '荊棘鞭擊', element: '生質', type: 'positive', tier: 1, baseDamage: 14, effect: {}, desc: '以荊棘長鞭進行快速抽擊' },
  { id: 'bud_guard', name: '芽盾護生', element: '生質', type: 'positive', tier: 1, baseDamage: 6, effect: { shield: 1 }, desc: '芽盾張開形成柔性保護層' },
  { id: 'sap_strike', name: '樹液擊', element: '生質', type: 'positive', tier: 1, baseDamage: 12, effect: {}, desc: '黏稠樹液壓擊阻斷節奏' },
  { id: 'petal_dance', name: '花瓣舞步', element: '生質', type: 'positive', tier: 1, baseDamage: 10, effect: { dodge: 1 }, desc: '花瓣環繞提高閃避節奏' },
  { id: 'pollen_shock', name: '花粉震盪', element: '生質', type: 'positive', tier: 2, baseDamage: 18, effect: { blind: 1 }, desc: '高濃度花粉短暫擾亂感知' },
  { id: 'root_spike', name: '根槍穿刺', element: '生質', type: 'positive', tier: 2, baseDamage: 24, effect: { armorBreak: true }, desc: '根槍突刺削弱護甲結構' },
  { id: 'nature_cycle', name: '循環新生', element: '生質', type: 'positive', tier: 2, baseDamage: 8, effect: { heal: 18, shield: 1 }, desc: '引導自然循環同步回復與防禦' },
  { id: 'ancient_canopy', name: '遠古樹冠', element: '生質', type: 'positive', tier: 3, baseDamage: 22, effect: { shield: 3, heal: 20 }, desc: '召喚古樹冠幕，建立長效優勢' },

  // ===== Tier 3 =====
  { id: 'flood_torrent', name: '潮汐奇點', element: '液態', type: 'positive', tier: 3, baseDamage: 35, effect: { splash: true }, desc: '引爆潮汐奇點，形成範圍壓制' },
  { id: 'fire_lotus', name: '日核裂解', element: '熱能', type: 'positive', tier: 3, baseDamage: 40, effect: { selfDamage: 10 }, desc: '超載核心換取高爆發輸出' },
  { id: 'arhat_kick', name: '地脈衝撞', element: '地脈', type: 'positive', tier: 3, baseDamage: 38, effect: { armorBreak: true }, desc: '共振地脈形成重擊並破甲' },
  { id: 'wind_fire_blade', name: '風暴聚變', element: '混相', type: 'positive', tier: 3, baseDamage: 45, effect: { burn: 2, stun: 1 }, desc: '高壓氣流與熱能聚變，兼具灼燒與震盪' },
  { id: 'thunder_crash', name: '雷矢超載', element: '混相', type: 'positive', tier: 3, baseDamage: 48, effect: { stun: 1, armorBreak: true }, desc: '雷矢束流貫穿護甲並造成失衡' },
  { id: 'maelstrom_prison', name: '渦牢封界', element: '液態', type: 'positive', tier: 3, baseDamage: 30, effect: { bind: 2, slow: 2 }, desc: '高壓渦流形成封界，限制行動與節奏' },
  { id: 'ocean_renewal', name: '海核復甦', element: '液態', type: 'positive', tier: 3, baseDamage: 0, effect: { heal: 38, cleanse: true }, desc: '深海能量回灌，全域淨化並大幅恢復' },
  { id: 'inferno_drive', name: '煉獄推進', element: '熱能', type: 'positive', tier: 3, baseDamage: 46, effect: { burn: 2, selfDamage: 8 }, desc: '點燃推進核心，爆發輸出並承擔反噬' },
  { id: 'phoenix_guard', name: '鳳燼守輪', element: '熱能', type: 'positive', tier: 3, baseDamage: 16, effect: { reflect: 2, heal: 14 }, desc: '鳳燼護輪旋轉，反彈攻擊並回補能量' },
  { id: 'bloom_overgrowth', name: '繁花覆域', element: '生質', type: 'positive', tier: 3, baseDamage: 34, effect: { trap: 2, poison: 2 }, desc: '植生區域暴走蔓延，持續束縛與侵蝕' }
];

// ============== 協定系招式池（原創） ==============
const NEGATIVE_MOVES = [
  // ===== Tier 1 =====
  { id: 'shadow_slash', name: '影域切割', element: '暗域', type: 'negative', tier: 1, baseDamage: 10, effect: {}, desc: '利用暗域偏振完成斜向切割' },
  { id: 'shadow_lock', name: '故障鎖定', element: '暗域', type: 'negative', tier: 1, baseDamage: 8, effect: { bind: 1 }, desc: '注入干擾碼鎖住目標行動' },
  { id: 'fear_presence', name: '恐懼脈衝', element: '暗域', type: 'negative', tier: 1, baseDamage: 0, effect: { fear: 1 }, desc: '放大對手感測噪音產生遲疑' },

  { id: 'spider_silk', name: '黏網拘束', element: '毒蝕', type: 'negative', tier: 1, baseDamage: 7, effect: { trap: 1 }, desc: '噴射高黏性網膜限制移動' },
  { id: 'minor_poison', name: '毒霧火花', element: '毒蝕', type: 'negative', tier: 1, baseDamage: 9, effect: { poison: 1 }, desc: '微量毒霧穿透護層造成侵蝕' },
  { id: 'curse_word', name: '靜電咒訊', element: '暗域', type: 'negative', tier: 1, baseDamage: 6, effect: { confuse: 1 }, desc: '發送錯位訊號擾亂判讀' },

  // ===== Tier 2 =====
  { id: 'soul_drain', name: '核心抽離', element: '暗域', type: 'negative', tier: 2, baseDamage: 18, effect: { drain: 15 }, desc: '從目標能量核心抽取可用輸出' },
  { id: 'soul_scatter', name: '神經霧化', element: '暗域', type: 'negative', tier: 2, baseDamage: 20, effect: { confuse: 2 }, desc: '釋放神經霧化流造成判斷錯亂' },
  { id: 'seven_step_poison', name: '腐蝕鏈劑', element: '毒蝕', type: 'negative', tier: 2, baseDamage: 16, effect: { poison: 2 }, desc: '連鎖腐蝕劑持續侵蝕系統' },
  { id: 'bone_dissolver', name: '熔蝕酸流', element: '毒蝕', type: 'negative', tier: 2, baseDamage: 25, effect: { defenseDown: 2 }, desc: '高溫酸流削弱防禦層' },
  { id: 'hot_sand_hell', name: '炙砂域', element: '熱毒', type: 'negative', tier: 2, baseDamage: 22, effect: { slow: 2, burn: 1 }, desc: '熱砂雲域造成減速與灼燒' },
  { id: 'plague_cloud', name: '疫霧群', element: '毒蝕', type: 'negative', tier: 2, baseDamage: 18, effect: { spreadPoison: true }, desc: '擴散型毒霧可在接觸後傳染' },
  { id: 'iron_thorn', name: '棘甲反刺', element: '合金', type: 'negative', tier: 2, baseDamage: 22, effect: { thorns: 2 }, desc: '激活棘甲在受擊時反向回刺' },

  // ===== Tier 3 =====
  { id: 'hell_fire', name: '煉域協議', element: '熱毒', type: 'negative', tier: 3, baseDamage: 32, effect: { burn: 2, poison: 1 }, desc: '啟動高危協議，輸出灼燒與毒侵' },
  { id: 'explosive_pill', name: '連鎖爆訊', element: '熱毒', type: 'negative', tier: 3, baseDamage: 38, effect: { selfDamage: 10 }, desc: '以自損換取鏈式爆震' },
  { id: 'ghost_fire', name: '幽格炙流', element: '暗熱', type: 'negative', tier: 3, baseDamage: 35, effect: { ignoreResistance: true, heal: 12 }, desc: '炙流穿透護甲與抗性，並回收殘餘能量' },
  { id: 'silver_snake', name: '銀鏈束陣', element: '暗金', type: 'negative', tier: 3, baseDamage: 28, effect: { bind: 2, dot: 3 }, desc: '展開銀鏈束陣並持續放電' },
  { id: 'ice_toxin', name: '冰毒脈衝', element: '凍毒', type: 'negative', tier: 3, baseDamage: 26, effect: { freeze: 1, poison: 2 }, desc: '低溫毒流同步凍結與侵蝕' },
  { id: 'mud_fire_lotus', name: '泥焰遮幕', element: '混毒熱', type: 'negative', tier: 3, baseDamage: 30, effect: { blind: 1, burn: 2 }, desc: '泥焰遮幕降低視野並持續焚灼' },
  { id: 'ultimate_dark', name: '零界崩解', element: '暗域', type: 'negative', tier: 3, baseDamage: 45, effect: { selfDamage: 20 }, desc: '引爆零界反應器，代價極高' }
];

const MOVE_SPEED_MIN = 1;
const MOVE_SPEED_MAX = 20;
const MOVE_SPEED_DEFAULT = 10;
const LEGACY_SPEED_MAP = Object.freeze({
  '-1': 4,
  '0': 10,
  '1': 13,
  '2': 16,
  '3': 20
});
const TIER_POWER_PROFILE = Object.freeze({
  1: { target: 14, min: 4, max: 20, supportMax: 10, speedBase: 15, speedMin: 12, speedMax: 20 },
  2: { target: 24, min: 11, max: 33, supportMax: 16, speedBase: 11, speedMin: 8, speedMax: 16 },
  3: { target: 35, min: 20, max: 49, supportMax: 22, speedBase: 8, speedMin: 3, speedMax: 13 }
});

function clampInt(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function normalizeMoveElementForBalance(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text === '水' || /水|液|潮|霧|冰/.test(text)) return '水';
  if (text === '火' || /火|炎|焰|熱|熔/.test(text)) return '火';
  if (text === '草' || /草|木|藤|森|生質/.test(text)) return '草';
  return '';
}

function normalizeMoveSpeedValue(speed = undefined, priority = undefined) {
  const raw = Number(speed);
  if (Number.isFinite(raw)) {
    if (raw >= MOVE_SPEED_MIN && raw <= MOVE_SPEED_MAX) {
      return clampInt(raw, MOVE_SPEED_MIN, MOVE_SPEED_MAX, MOVE_SPEED_DEFAULT);
    }
    const legacy = LEGACY_SPEED_MAP[String(Math.floor(raw))];
    if (Number.isFinite(Number(legacy))) {
      return Number(legacy);
    }
  }
  const legacyPriority = LEGACY_SPEED_MAP[String(Math.floor(Number(priority)))];
  if (Number.isFinite(Number(legacyPriority))) {
    return Number(legacyPriority);
  }
  return MOVE_SPEED_DEFAULT;
}

function getTierPowerProfile(tier = 1) {
  const safeTier = clampInt(tier, 1, 3, 1);
  return TIER_POWER_PROFILE[safeTier] || TIER_POWER_PROFILE[1];
}

function getMoveEffectStats(move = {}) {
  const effect = (move && typeof move.effect === 'object') ? move.effect : {};
  const stats = {
    effect,
    heal: Number(effect.heal || 0),
    cleanse: Boolean(effect.cleanse),
    shield: Number(effect.shield || 0),
    reflect: Number(effect.reflect || 0),
    dodge: Number(effect.dodge || 0),
    thorns: Number(effect.thorns || 0),
    drain: Number(effect.drain || 0),
    burn: Number(effect.burn || 0),
    poison: Number(effect.poison || 0),
    trap: Number(effect.trap || 0),
    bleed: Number(effect.bleed || 0),
    dot: Number(effect.dot || 0),
    spreadPoison: Boolean(effect.spreadPoison),
    stun: Number(effect.stun || 0),
    freeze: Number(effect.freeze || 0),
    bind: Number(effect.bind || 0),
    slow: Number(effect.slow || 0),
    fear: Number(effect.fear || 0),
    confuse: Number(effect.confuse || 0),
    blind: Number(effect.blind || 0),
    missNext: Number(effect.missNext || 0),
    armorBreak: Boolean(effect.armorBreak),
    defenseDown: Number(effect.defenseDown || effect.defDown || 0),
    ignoreResistance: Boolean(effect.ignoreResistance),
    splash: Boolean(effect.splash),
    summon: Number(effect.summon || 0),
    debuffAll: effect.debuff === 'all',
    selfDamage: Number(effect.selfDamage || 0)
  };
  const hardCcTurns = stats.stun + stats.freeze;
  const softCcTurns = stats.bind + stats.slow + stats.fear + stats.confuse + stats.blind + stats.missNext;
  const supportValue =
    stats.heal * 0.3 +
    (stats.cleanse ? 5 : 0) +
    stats.shield * 3.2 +
    stats.reflect * 3.6 +
    stats.dodge * 3.0 +
    stats.thorns * 2.8;
  const offenseValue =
    stats.burn * 2.4 +
    stats.poison * 2.0 +
    stats.trap * 2.1 +
    stats.bleed * 2.4 +
    stats.dot * 1.8 +
    (stats.spreadPoison ? 3.2 : 0) +
    hardCcTurns * 6.2 +
    softCcTurns * 3.8 +
    // 未來裝備防禦（約 1~10）預留權重：保留破甲/降防/無視防禦價值。
    (stats.armorBreak ? 2.4 : 0) +
    stats.defenseDown * 1.6 +
    (stats.ignoreResistance ? 2.8 : 0) +
    (stats.splash ? 3.6 : 0) +
    stats.summon * 3.0 +
    (stats.debuffAll ? 6.0 : 0) +
    stats.drain * 0.18;
  const utility = supportValue + offenseValue - stats.selfDamage * 0.25;
  return {
    ...stats,
    hardCcTurns,
    softCcTurns,
    utility
  };
}

function getMoveCoreElement(move = {}) {
  return normalizeMoveElementForBalance(move?.element || '');
}

function isSupportOnlyMove(move = {}) {
  const baseDamage = Math.max(0, Number(move?.baseDamage || 0));
  const stats = getMoveEffectStats(move);
  const hasSupport = stats.heal > 0 || stats.cleanse || stats.shield > 0 || stats.reflect > 0 || stats.dodge > 0 || stats.thorns > 0;
  const hasOffenseUtility =
    stats.hardCcTurns > 0 ||
    stats.softCcTurns > 0 ||
    stats.burn > 0 ||
    stats.poison > 0 ||
    stats.trap > 0 ||
    stats.bleed > 0 ||
    stats.dot > 0 ||
    stats.armorBreak ||
    stats.defenseDown > 0 ||
    stats.splash ||
    stats.spreadPoison;
  return hasSupport && !hasOffenseUtility && baseDamage <= 10;
}

function calculateMoveCombatPower(move = {}) {
  const tier = clampInt(move?.tier || 1, 1, 3, 1);
  const profile = getTierPowerProfile(tier);
  const stats = getMoveEffectStats(move);
  const supportOnly = isSupportOnlyMove(move);
  const damage = Math.max(0, Number(move?.baseDamage || 0));
  const speed = normalizeMoveSpeedValue(move?.speed, move?.priority);
  const tempo = (speed - profile.speedBase) * 0.8;
  const utility = Number(stats.utility || 0);
  const supportPenalty = supportOnly ? 1.5 : 0;
  return damage + utility + tempo - supportPenalty;
}

function rebalanceMoveDamage(pool = []) {
  for (const move of pool) {
    if (!move || typeof move !== 'object') continue;
    const tier = clampInt(move.tier || 1, 1, 3, 1);
    const profile = getTierPowerProfile(tier);
    const stats = getMoveEffectStats(move);
    const supportOnly = isSupportOnlyMove(move);
    const currentDamage = Math.max(0, Number(move.baseDamage || 0));
    const typeBias = String(move.type || '').trim() === 'negative' ? 0.8 : 0;
    const targetPower = profile.target + typeBias;
    const desiredDamageRaw = targetPower - stats.utility;
    const minDamage = supportOnly ? 0 : profile.min;
    const maxDamage = supportOnly ? profile.supportMax : profile.max;
    const desiredDamage = clampInt(Math.round(desiredDamageRaw), minDamage, maxDamage, currentDamage);
    const blended = Math.round(currentDamage * 0.45 + desiredDamage * 0.55);
    move.baseDamage = clampInt(blended, minDamage, maxDamage, desiredDamage);
  }
}

function rebalanceMoveDamageByElement(pool = []) {
  const offensiveMoves = pool.filter((move) => {
    if (!move || typeof move !== 'object') return false;
    if (isSupportOnlyMove(move)) return false;
    return Number(move.baseDamage || 0) > 0;
  });
  if (offensiveMoves.length <= 0) return;

  for (const tier of [1, 2, 3]) {
    const tierMoves = offensiveMoves.filter((move) => clampInt(move.tier || 1, 1, 3, 1) === tier);
    if (tierMoves.length <= 0) continue;
    const globalAvg = tierMoves.reduce((sum, move) => sum + Number(move.baseDamage || 0), 0) / tierMoves.length;
    const groups = new Map();
    for (const move of tierMoves) {
      const key = normalizeMoveElementForBalance(move.element);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(move);
    }
    for (const [key, list] of groups.entries()) {
      if (!['水', '火', '草'].includes(key) || list.length <= 0) continue;
      const elementAvg = list.reduce((sum, move) => sum + Number(move.baseDamage || 0), 0) / list.length;
      const delta = globalAvg - elementAvg;
      if (Math.abs(delta) < 0.6) continue;
      const profile = getTierPowerProfile(tier);
      for (const move of list) {
        const next = Number(move.baseDamage || 0) + delta * 0.35;
        move.baseDamage = clampInt(Math.round(next), profile.min, profile.max, move.baseDamage);
      }
    }
  }
}

function rebalanceCoreElementParity(pool = []) {
  const rows = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (rows.length <= 0) return;

  for (let pass = 0; pass < 4; pass++) {
    for (const tier of [1, 2, 3]) {
      const tierRows = rows.filter((move) => clampInt(move?.tier || 1, 1, 3, 1) === tier);
      const groups = {
        水: tierRows.filter((move) => getMoveCoreElement(move) === '水'),
        火: tierRows.filter((move) => getMoveCoreElement(move) === '火'),
        草: tierRows.filter((move) => getMoveCoreElement(move) === '草')
      };
      const avgs = Object.entries(groups)
        .filter(([, list]) => list.length > 0)
        .map(([key, list]) => ({
          key,
          avg: list.reduce((sum, move) => sum + calculateMoveCombatPower(move), 0) / list.length
        }));
      if (avgs.length <= 1) continue;
      const target = avgs.reduce((sum, row) => sum + row.avg, 0) / avgs.length;
      const profile = getTierPowerProfile(tier);

      for (const { key, avg } of avgs) {
        const delta = target - avg;
        if (Math.abs(delta) < 0.35) continue;
        for (const move of groups[key]) {
          if (!move || typeof move !== 'object') continue;
          const supportOnly = isSupportOnlyMove(move);
          const nextSpeed = Number(move.speed || profile.speedBase) + delta * (supportOnly ? 0.30 : 0.18);
          const speedClamped = clampInt(Math.round(nextSpeed), profile.speedMin, profile.speedMax, profile.speedBase);
          move.speed = clampInt(speedClamped, MOVE_SPEED_MIN, MOVE_SPEED_MAX, profile.speedBase);

          if (supportOnly) continue;
          const nextDamage = Number(move.baseDamage || profile.target) + delta * 0.52;
          move.baseDamage = clampInt(
            Math.round(nextDamage),
            profile.min,
            profile.max,
            Math.max(profile.min, Number(move.baseDamage || profile.target))
          );
        }
      }
    }
  }
}

function rebalanceCoreElementTierScale(pool = []) {
  const rows = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (rows.length <= 0) return;
  for (let pass = 0; pass < 4; pass++) {
    for (const tier of [1, 2, 3]) {
      const tierRows = rows.filter((move) => clampInt(move?.tier || 1, 1, 3, 1) === tier);
      const groups = {
        水: tierRows.filter((move) => getMoveCoreElement(move) === '水'),
        火: tierRows.filter((move) => getMoveCoreElement(move) === '火'),
        草: tierRows.filter((move) => getMoveCoreElement(move) === '草')
      };
      const means = Object.entries(groups)
        .filter(([, list]) => list.length > 0)
        .map(([key, list]) => ({
          key,
          mean: list.reduce((sum, move) => sum + calculateMoveCombatPower(move), 0) / list.length
        }));
      if (means.length <= 1) continue;
      const target = means.reduce((sum, row) => sum + row.mean, 0) / means.length;
      const profile = getTierPowerProfile(tier);

      for (const { key, mean } of means) {
        if (!Number.isFinite(mean) || mean <= 0) continue;
        const minScale = tier >= 3 ? 0.72 : 0.80;
        const maxScale = tier >= 3 ? 1.22 : 1.18;
        const scale = Math.max(minScale, Math.min(maxScale, target / mean));
        const speedNudge = (scale - 1) * (tier >= 3 ? 6.8 : 5.5);
        for (const move of groups[key]) {
          if (!move || typeof move !== 'object') continue;
          const supportOnly = isSupportOnlyMove(move);
          if (!supportOnly) {
            const nextDamage = Number(move.baseDamage || profile.target) * scale;
            move.baseDamage = clampInt(
              Math.round(nextDamage),
              profile.min,
              profile.max,
              Math.max(profile.min, Number(move.baseDamage || profile.target))
            );
          }
          const baseSpeed = Number(move.speed || profile.speedBase);
          const nextSpeed = clampInt(Math.round(baseSpeed + speedNudge), profile.speedMin, profile.speedMax, profile.speedBase);
          move.speed = clampInt(nextSpeed, MOVE_SPEED_MIN, MOVE_SPEED_MAX, profile.speedBase);
        }
      }
    }
  }
}

function deriveMovePriority(move = {}) {
  const effect = (move && typeof move.effect === 'object') ? move.effect : {};
  if (effect.flee) return 3;
  if (effect.wait) return -1;

  const hasSupport = Boolean(effect.heal || effect.cleanse || effect.shield || effect.dodge || effect.reflect || effect.thorns);
  const hasHardControl = Boolean(effect.stun || effect.freeze || effect.missNext);
  const hasSoftControl = Boolean(effect.bind || effect.slow || effect.fear || effect.confuse || effect.blind);
  const isHeavyBurst = Number(move.baseDamage || 0) >= 40 || Number(move.tier || 1) >= 3;

  let priority = 0;
  if (hasSupport) priority += 1;
  if (hasHardControl) priority += 1;
  if (!hasSupport && !hasHardControl && !hasSoftControl && isHeavyBurst) priority -= 1;
  return Math.max(-1, Math.min(2, priority));
}

function deriveMoveSpeed(move = {}) {
  const effect = (move && typeof move.effect === 'object') ? move.effect : {};
  if (effect.flee) return MOVE_SPEED_MAX;
  if (effect.wait) return MOVE_SPEED_MIN;

  const tier = clampInt(move.tier || 1, 1, 3, 1);
  const profile = getTierPowerProfile(tier);
  const stats = getMoveEffectStats(move);
  const supportOnly = isSupportOnlyMove(move);
  const damage = Math.max(0, Number(move.baseDamage || 0));
  const hasHardControl = stats.hardCcTurns > 0;
  const hasSoftControl = stats.softCcTurns > 0;

  let speed = profile.speedBase;
  if (supportOnly) speed += 3;
  if (hasHardControl) speed += 2;
  else if (hasSoftControl) speed += 1;
  if (stats.heal > 0 && damage <= 0) speed += 2;
  if (stats.splash) speed -= 1;
  if (stats.selfDamage > 0) speed -= 1;

  const damageOver = damage - profile.target;
  if (damageOver > 0) speed -= damageOver * 0.35;
  if (damageOver > 8) speed -= 1;
  if (stats.utility > 12 && damage <= profile.target + 2) speed += 1;
  const clampedByTier = clampInt(Math.round(speed), profile.speedMin, profile.speedMax, profile.speedBase);
  return clampInt(clampedByTier, MOVE_SPEED_MIN, MOVE_SPEED_MAX, MOVE_SPEED_DEFAULT);
}

function enforceMovePriority(pool = []) {
  for (const move of pool) {
    if (!move || typeof move !== 'object') continue;
    const fixed = Number(move.priority);
    if (Number.isFinite(fixed)) {
      move.priority = Math.max(-1, Math.min(3, Math.floor(fixed)));
      continue;
    }
    move.priority = deriveMovePriority(move);
  }
}

function enforceMoveSpeed(pool = []) {
  for (const move of pool) {
    if (!move || typeof move !== 'object') continue;
    if (Number.isFinite(Number(move.speed))) {
      move.speed = normalizeMoveSpeedValue(move.speed, move.priority);
    } else {
      move.speed = deriveMoveSpeed(move);
    }
    if (!(move?.effect && (move.effect.flee || move.effect.wait))) {
      const profile = getTierPowerProfile(move?.tier || 1);
      move.speed = clampInt(Number(move.speed || profile.speedBase), profile.speedMin, profile.speedMax, profile.speedBase);
    }
  }
}

function enforceControlMoveTier(pool = []) {
  const hardControlKeys = ['stun', 'freeze'];
  const controlKeys = ['bind', 'slow', 'fear', 'confuse', 'blind', 'missNext'];
  for (const move of pool) {
    if (!move || typeof move !== 'object') continue;
    const effect = move.effect || {};
    const hasHardControl = hardControlKeys.some((k) => Number(effect[k] || 0) > 0);
    const hasControl = controlKeys.some((k) => Number(effect[k] || 0) > 0);
    if (hasHardControl) {
      move.tier = Math.max(2, Number(move.tier || 1));
      continue;
    }
    if (hasControl) {
      move.tier = Math.max(2, Number(move.tier || 1));
    }
  }
}

function enforceBurstMoveTier(pool = []) {
  for (const move of pool) {
    if (!move || typeof move !== 'object') continue;
    const tier = clampInt(move.tier || 1, 1, 3, 1);
    const baseDamage = Math.max(0, Number(move.baseDamage || 0));
    const stats = getMoveEffectStats(move);
    const hasOffenseUtility =
      stats.burn > 0 ||
      stats.poison > 0 ||
      stats.trap > 0 ||
      stats.bleed > 0 ||
      stats.dot > 0 ||
      stats.hardCcTurns > 0 ||
      stats.softCcTurns > 0 ||
      stats.armorBreak ||
      stats.ignoreResistance ||
      stats.defenseDown > 0;
    if (tier === 1 && hasOffenseUtility && baseDamage >= 16) {
      move.tier = 2;
    }
  }
}

function enforceCompositeTierBand(pool = []) {
  for (const move of pool) {
    if (!move || typeof move !== 'object') continue;
    const tier = clampInt(move.tier || 1, 1, 3, 1);
    const stats = getMoveEffectStats(move);
    const supportOnly = isSupportOnlyMove(move);
    const score = calculateMoveCombatPower(move);

    // 以綜合戰力（傷害+控制+持續傷+防禦交互+生存）做階級邊界，避免 T1 實戰效益倒掛。
    if (tier === 1) {
      const promoteByPower = score >= 23;
      const promoteBySupportUtility = supportOnly && Number(stats.utility || 0) >= 11;
      if (promoteByPower || promoteBySupportUtility) {
        move.tier = 2;
        continue;
      }
    }

    if (tier === 2) {
      if (score >= 37) {
        move.tier = 3;
        continue;
      }
      // T2 若極度弱效且無關鍵控場，允許回落 T1，避免稀有但實戰不如普通。
      const hasKeyControl = stats.hardCcTurns > 0 || stats.softCcTurns >= 2;
      if (score < 18 && !hasKeyControl) {
        move.tier = 1;
      }
    }
  }
}

// 控制型技能不應落在普通階，避免前期連控失衡
enforceControlMoveTier(POSITIVE_MOVES);
enforceControlMoveTier(NEGATIVE_MOVES);
enforceBurstMoveTier(POSITIVE_MOVES);
enforceBurstMoveTier(NEGATIVE_MOVES);
rebalanceMoveDamage(POSITIVE_MOVES);
rebalanceMoveDamage(NEGATIVE_MOVES);
rebalanceMoveDamageByElement([...POSITIVE_MOVES, ...NEGATIVE_MOVES]);
enforceMovePriority(POSITIVE_MOVES);
enforceMovePriority(NEGATIVE_MOVES);
enforceMoveSpeed(POSITIVE_MOVES);
enforceMoveSpeed(NEGATIVE_MOVES);
rebalanceCoreElementParity(POSITIVE_MOVES);
rebalanceCoreElementTierScale(POSITIVE_MOVES);
enforceCompositeTierBand(POSITIVE_MOVES);
enforceCompositeTierBand(NEGATIVE_MOVES);
rebalanceMoveDamage(POSITIVE_MOVES);
rebalanceMoveDamage(NEGATIVE_MOVES);
rebalanceMoveDamageByElement([...POSITIVE_MOVES, ...NEGATIVE_MOVES]);
enforceMoveSpeed(POSITIVE_MOVES);
enforceMoveSpeed(NEGATIVE_MOVES);

// ============== 初始技能 ==============
const INITIAL_MOVES = [
  { id: 'head_butt', name: '頭槌', element: '普通', type: 'normal', tier: 1, priority: 0, speed: 10, baseDamage: 8, effect: {}, desc: '寵物本能攻擊' },
  { id: 'flee', name: '逃跑', element: '普通', type: 'normal', tier: 1, priority: 3, speed: 20, baseDamage: 0, effect: { flee: true }, desc: '100%逃脫' }
];

const ALL_MOVES = [...POSITIVE_MOVES, ...NEGATIVE_MOVES, ...INITIAL_MOVES];
const MOVE_BY_ID = new Map(ALL_MOVES.map((m) => [m.id, m]));

const PET_ELEMENT_ALIAS = Object.freeze({
  water: '水',
  fire: '火',
  grass: '草',
  水: '水',
  水屬性: '水',
  火: '火',
  火屬性: '火',
  草: '草',
  草屬性: '草',
  positive: '水',
  negative: '火',
  正派: '水',
  機變派: '火'
});

const ELEMENT_MOVE_IDS = Object.freeze({
  水: [
    'willow_water', 'water_splash', 'mist_step', 'tide_barrier',
    'rip_current', 'bubble_guard', 'echo_wave', 'spring_pulse',
    'foam_dart', 'stream_guard',
    'ice_palm', 'frost_lance', 'steam_screen', 'rain_edge',
    'mirror_tide', 'deep_pressure', 'clear_mind_tide', 'current_chain',
    'flood_torrent', 'ocean_renewal'
  ],
  火: [
    'blaze_sky', 'ember_step', 'ash_guard', 'flare_jab',
    'magma_bite', 'sunforge', 'spark_claw', 'char_pulse',
    'lava_step', 'firebrand_strike',
    'flame_armor', 'wildfire_chain', 'cinder_smoke', 'flare_snare',
    'volcanic_burst', 'smoke_screen', 'burning_edge', 'heat_sink',
    'inferno_drive', 'fire_lotus'
  ],
  草: [
    'grass_cloak', 'forest_mend', 'seed_shot', 'leaf_step',
    'bark_skin', 'dew_heal', 'thorn_whip', 'bud_guard',
    'sap_strike', 'petal_dance',
    'spider_net', 'root_trap', 'heavenly_flowers', 'thorn_bind',
    'spore_haze', 'vine_bastion', 'pollen_shock', 'root_spike',
    'bloom_overgrowth', 'ancient_canopy'
  ]
});

function normalizePetElement(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return '水';
  if (PET_ELEMENT_ALIAS[text]) return PET_ELEMENT_ALIAS[text];
  return PET_ELEMENTS.includes(text) ? text : '水';
}

function getMovesByElement(element = '') {
  const normalized = normalizePetElement(element);
  const ids = Array.isArray(ELEMENT_MOVE_IDS[normalized]) ? ELEMENT_MOVE_IDS[normalized] : [];
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    const move = MOVE_BY_ID.get(String(id || '').trim());
    if (!move || seen.has(move.id)) continue;
    seen.add(move.id);
    out.push(move);
  }
  return out;
}

function getMoveRarityByTier(tier = 1) {
  const safeTier = Math.max(1, Math.min(3, Number(tier || 1)));
  if (safeTier >= 3) return '史詩';
  if (safeTier === 2) return '稀有';
  return '普通';
}

const ELEMENT_MOVE_POOLS = Object.freeze({
  水: getMovesByElement('水'),
  火: getMovesByElement('火'),
  草: getMovesByElement('草')
});
const LEGACY_MOVE_NAME_TO_ID = {
  '金針刺穴': 'golden_needle',
  '暴雨梨花': 'needle_rain',
  '金鐘罩': 'golden_bell',
  '天女散花': 'heavenly_flowers',
  '羅網天蛛': 'spider_net',
  '回春術': 'rejuvenation',
  '楊枝淨水': 'willow_water',
  '寒冰掌': 'ice_palm',
  '洪水滔天': 'flood_torrent',
  '羅漢金剛腿': 'arhat_kick',
  '落石陷阱': 'rock_trap',
  '流沙陣': 'quicksand',
  '烈焰焚天': 'blaze_sky',
  '赤焰甲': 'flame_armor',
  '風火燎原': 'wind_fire_blade',
  '雷霆萬鈞': 'thunder_crash',
  '吸星大法': 'soul_drain',
  '無形鎖脈': 'shadow_lock',
  '離魂散': 'soul_scatter',
  '七步斷腸散': 'seven_step_poison',
  '化骨水': 'bone_dissolver',
  '蛛絲縛魂': 'spider_silk',
  '地獄烈火': 'hell_fire',
  '爆炸信號彈': 'explosive_pill',
  '熱砂地獄': 'hot_sand_hell',
  '火蓮碎': 'fire_lotus'
};

function cloneMoveTemplate(template) {
  if (!template) return null;
  return {
    ...template,
    effect: { ...(template.effect || {}) }
  };
}

function normalizeLoadedMove(move) {
  if (!move || typeof move !== 'object') return { move, changed: false };

  const legacyId = LEGACY_MOVE_NAME_TO_ID[String(move.name || '').trim()];
  const targetId = move.id || legacyId;
  const template = targetId ? MOVE_BY_ID.get(targetId) : null;
  if (!template) return { move, changed: false };

  const normalized = cloneMoveTemplate(template);
  normalized.currentProficiency = Number(move.currentProficiency || 0);
  if (!Number.isFinite(Number(normalized.priority))) {
    normalized.priority = deriveMovePriority(normalized);
  }
  if (!Number.isFinite(Number(normalized.speed))) {
    normalized.speed = deriveMoveSpeed(normalized);
  }
  if (move.cooldown !== undefined) normalized.cooldown = move.cooldown;

  const changed =
    move.id !== normalized.id ||
    move.name !== normalized.name ||
    move.element !== normalized.element ||
    move.type !== normalized.type ||
    Number(move.priority || 0) !== Number(normalized.priority || 0) ||
    Number(move.speed || 0) !== Number(normalized.speed || 0) ||
    Number(move.baseDamage || 0) !== Number(normalized.baseDamage || 0) ||
    JSON.stringify(move.effect || {}) !== JSON.stringify(normalized.effect || {});

  return { move: normalized, changed };
}

function normalizePetMoves(pet) {
  if (!pet || !Array.isArray(pet.moves)) return false;
  let changed = false;
  const normalizedElement = normalizePetElement(pet.type || pet.element);
  pet.type = normalizedElement;
  pet.element = normalizedElement;
  const normalizedDefense = 0;
  if (Number(pet.defense || 0) !== normalizedDefense) {
    pet.defense = normalizedDefense;
    changed = true;
  }
  const allowedIds = new Set([
    ...getMovesByElement(normalizedElement).map((m) => String(m?.id || '').trim()).filter(Boolean),
    ...INITIAL_MOVES.map((m) => String(m?.id || '').trim()).filter(Boolean)
  ]);

  pet.moves = pet.moves.map((m) => {
    const result = normalizeLoadedMove(m);
    if (result.changed) changed = true;
    return result.move;
  }).filter((m) => {
    const id = String(m?.id || '').trim();
    if (!id || !allowedIds.has(id)) {
      changed = true;
      return false;
    }
    return true;
  });

  if (pet.moves.length === 0) {
    const starter = cloneMoveTemplate(getMovesByElement(normalizedElement)[0] || INITIAL_MOVES[0]);
    if (starter) {
      pet.moves.push({ ...starter, currentProficiency: 0 });
      changed = true;
    }
  }
  return changed;
}

function ensureAutoEquipOnLearn(pet, learnedMoveId) {
  if (!pet || !learnedMoveId) return false;
  const attackIds = (Array.isArray(pet.moves) ? pet.moves : [])
    .filter((m) => !(m?.effect && m.effect.flee))
    .map((m) => String(m?.id || '').trim())
    .filter(Boolean);
  if (!attackIds.includes(String(learnedMoveId))) return false;

  const existed = Array.isArray(pet.activeMoveIds) ? pet.activeMoveIds : [];
  const selected = [];
  for (const rawId of existed) {
    const id = String(rawId || '').trim();
    if (!id || selected.includes(id) || !attackIds.includes(id)) continue;
    selected.push(id);
    if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
  }

  if (selected.length === 0) {
    for (const id of attackIds) {
      if (id === String(learnedMoveId)) continue;
      selected.push(id);
      if (selected.length >= PET_MOVE_LOADOUT_LIMIT) break;
    }
  }

  if (selected.length >= PET_MOVE_LOADOUT_LIMIT) return false;
  if (!selected.includes(String(learnedMoveId))) {
    selected.push(String(learnedMoveId));
  }
  pet.activeMoveIds = selected.slice(0, PET_MOVE_LOADOUT_LIMIT);
  return true;
}

// ============== 計算招式總傷害（用於顯示）==============
function calculateMoveDamage(move, _level, attack) {
  let damage = move.baseDamage || 0;

  // 攻擊加成
  damage += Math.floor(attack * 0.2);
  
  // 計算持續效果總傷
  let totalEffectDamage = 0;
  let totalTurns = 0;
  
  if (move.effect.burn) totalTurns += move.effect.burn;
  if (move.effect.poison) totalTurns += move.effect.poison;
  if (move.effect.trap) totalTurns += move.effect.trap;
  if (move.effect.dot) totalTurns += 2;
  
  if (totalTurns > 0) {
    // 持續傷害 = 基礎傷害 * 0.6 / 總回合數
    totalEffectDamage = Math.floor(damage * 0.6);
    damage = Math.floor(damage * 0.4); // 即時傷害只有40%
  }
  
  return { instant: damage, overTime: totalEffectDamage, totalTurns, total: damage + totalEffectDamage };
}

// ============== 創建寵物蛋 ==============
function createPetEgg(playerId, type) {
  const element = normalizePetElement(type);
  const eggNameMap = {
    水: '潮汐夥伴蛋',
    火: '熾焰夥伴蛋',
    草: '森語夥伴蛋'
  };
  return {
    id: `pet_${playerId}_${Date.now()}`,
    ownerId: playerId,
    name: eggNameMap[element] || '潮汐夥伴蛋',
    type: element,
    element,
    level: 1,
    exp: 0,
    expToLevel: 100,
    hp: 100,
    maxHp: 100,
    attack: 20,
    defense: 0,
    speed: 20,
    moves: [],
    maxMoves: 10,
    status: '蛋',
    hatched: false,
    appearance: '一顆充滿神秘氣息的寵物蛋',
    lastFed: null,
    createdAt: Date.now()
  };
}

// ============== 敲蛋孵化 ==============
function hatchEgg(pet) {
  pet.hatched = true;
  pet.status = '正常';
  pet.reviveAt = null;
  pet.reviveTurnsRemaining = 0;
  pet.lastDownAt = null;

  const element = normalizePetElement(pet.type || pet.element);
  pet.type = element;
  pet.element = element;
  const namesByElement = {
    水: ['Aqua', 'Mist', 'Ripple', 'Nami', 'Tide', 'Nero'],
    火: ['Blaze', 'Ember', 'Pyro', 'Ignis', 'Flare', 'Nova'],
    草: ['Moss', 'Leaf', 'Bram', 'Fern', 'Verd', 'Sprout']
  };
  const traitByElement = {
    水: '沉穩冷靜',
    火: '熾熱果決',
    草: '靈巧機敏'
  };
  const names = namesByElement[element] || namesByElement['水'];

  pet.name = names[Math.floor(Math.random() * names.length)];
  pet.appearance = `一隻剛孵化的${element}屬性夥伴，外殼仍帶著微光紋路，眼神${traitByElement[element] || '沉穩冷靜'}`;
  
  // 初始招式：頭槌 + 逃跑
  pet.moves = [
    { ...INITIAL_MOVES[0], currentProficiency: 0 },
    { ...INITIAL_MOVES[1], currentProficiency: 0 }
  ];
  
  // 根據等級權重隨機獲得初始技能
  // 60% Tier 1, 30% Tier 2, 10% Tier 3
  const starterPool = getMovesByElement(element);
  const tier1 = starterPool.filter(m => m.tier === 1);
  const tier2 = starterPool.filter(m => m.tier === 2);
  const tier3 = starterPool.filter(m => m.tier === 3);
  
  const roll = Math.random();
  let selectedPool;
  if (roll < 0.6) {
    selectedPool = tier1;
  } else if (roll < 0.9) {
    selectedPool = tier2;
  } else {
    selectedPool = tier3;
  }
  
  const starterMove = selectedPool[Math.floor(Math.random() * selectedPool.length)];
  pet.moves.push({ ...starterMove, currentProficiency: 0 });
  
  return pet;
}

function ensureRecoveryTurnCounter(pet) {
  if (!pet || typeof pet !== 'object') return 0;
  if (String(pet.status || '').trim() !== '死亡') {
    pet.reviveTurnsRemaining = 0;
    pet.reviveAt = null;
    return 0;
  }

  let turns = Number(pet.reviveTurnsRemaining || 0);
  if (!Number.isFinite(turns) || turns <= 0) {
    // 舊版本相容：若還有 reviveAt（舊時間制），轉成回合制倒數
    if (pet.reviveAt) {
      const remainMs = Math.max(0, Number(pet.reviveAt || 0) - Date.now());
      const mapped = remainMs > 0
        ? Math.max(1, Math.ceil(remainMs / (24 * 60 * 60 * 1000)))
        : 0;
      turns = mapped;
    }
    if (!Number.isFinite(turns) || turns <= 0) turns = PET_RECOVER_TURNS;
  }
  pet.reviveTurnsRemaining = Math.max(0, Math.floor(turns));
  pet.reviveAt = null;
  return pet.reviveTurnsRemaining;
}

function markPetDefeated(pet, reason = '戰鬥失敗') {
  if (!pet) return pet;
  pet.hp = 0;
  pet.status = '死亡';
  pet.lastDownReason = reason;
  pet.lastDownAt = Date.now();
  pet.reviveAt = null;
  pet.reviveTurnsRemaining = PET_RECOVER_TURNS;
  return pet;
}

function syncPetRecovery(pet) {
  if (!pet) return { pet, revived: false, changed: false };

  let changed = false;
  let revived = false;

  if (String(pet.status || '').trim() === '死亡') {
    const before = Number(pet.reviveTurnsRemaining || 0);
    const now = ensureRecoveryTurnCounter(pet);
    if (before !== now) changed = true;
  } else if (pet.reviveAt || Number(pet.reviveTurnsRemaining || 0) > 0) {
    pet.reviveAt = null;
    pet.reviveTurnsRemaining = 0;
    changed = true;
  }

  return { pet, revived, changed };
}

function advancePetRecoveryTurns(pet, turns = 1) {
  if (!pet) return { pet, revived: false, changed: false, remainingTurns: 0 };
  const tick = Math.max(0, Math.floor(Number(turns || 0)));
  if (tick <= 0) {
    return {
      pet,
      revived: false,
      changed: false,
      remainingTurns: getPetRecoveryRemainingTurns(pet)
    };
  }
  if (String(pet.status || '').trim() !== '死亡') {
    if (pet.reviveAt || Number(pet.reviveTurnsRemaining || 0) > 0) {
      pet.reviveAt = null;
      pet.reviveTurnsRemaining = 0;
      return { pet, revived: false, changed: true, remainingTurns: 0 };
    }
    return { pet, revived: false, changed: false, remainingTurns: 0 };
  }

  const before = ensureRecoveryTurnCounter(pet);
  const next = Math.max(0, before - tick);
  let revived = false;
  pet.reviveTurnsRemaining = next;
  pet.reviveAt = null;
  if (next <= 0) {
    pet.status = '正常';
    pet.hp = pet.maxHp || 100;
    pet.lastRevivedAt = Date.now();
    pet.reviveTurnsRemaining = 0;
    revived = true;
  }
  return {
    pet,
    revived,
    changed: revived || next !== before,
    remainingTurns: Math.max(0, Number(pet.reviveTurnsRemaining || 0))
  };
}

function getPetRecoveryRemainingTurns(pet) {
  if (!pet || String(pet.status || '').trim() !== '死亡') return 0;
  const turns = Number(pet.reviveTurnsRemaining || 0);
  if (Number.isFinite(turns) && turns > 0) return Math.max(0, Math.floor(turns));
  if (pet.reviveAt) {
    const remainMs = Math.max(0, Number(pet.reviveAt || 0) - Date.now());
    if (remainMs <= 0) return 0;
    return Math.max(1, Math.ceil(remainMs / (24 * 60 * 60 * 1000)));
  }
  return PET_RECOVER_TURNS;
}

function getPetRecoveryRemainingMs(pet) {
  // 保留舊函式介面供相容使用；新版本以「回合」為主
  return getPetRecoveryRemainingTurns(pet) * 60 * 1000;
}

// ============== 學習招式 ==============
function learnMove(pet, moveId) {
  if (pet.moves.length >= pet.maxMoves) {
    return { success: false, reason: '招式已達上限！需要忘記一個招式才能學習新招' };
  }

  const allowIds = new Set([
    ...getMovesByElement(pet?.type || pet?.element).map((m) => String(m?.id || '').trim()),
    'head_butt'
  ]);
  if (!allowIds.has(String(moveId || '').trim())) {
    return { success: false, reason: '找不到這個招式' };
  }
  const move = ALL_MOVES.find((m) => String(m?.id || '').trim() === String(moveId || '').trim());
  
  if (!move) return { success: false, reason: '找不到這個招式' };
  if (pet.moves.find(m => m.id === moveId)) return { success: false, reason: '已經學過了' };
  
  pet.moves.push({ ...move, currentProficiency: 0 });
  ensureAutoEquipOnLearn(pet, moveId);
  updateAppearance(pet);
  
  return { success: true, move };
}

// ============== 忘記招式 ==============
function forgetMove(pet, moveId) {
  const idx = pet.moves.findIndex(m => m.id === moveId);
  if (idx === -1) return { success: false, reason: '沒有這個招式' };
  
  const forgotten = pet.moves.splice(idx, 1)[0];
  return { success: true, move: forgotten };
}

// ============== 更新外觀 ==============
function updateAppearance(pet) {
  if (!pet.hatched) return;
  
  const elements = pet.moves.map(m => m.element);
  const count = pet.moves.length;
  
  let desc = '';
  if (count <= 2) desc = '模樣樸實可愛';
  else if (count <= 4) desc = '身上開始浮現元素氣息';
  else if (count <= 6) desc = '體型變化，氣勢漸增';
  else if (count <= 8) desc = '威風凜凜，元素之力流轉';
  else desc = '完全覺醒！散發攝人氣勢';
  
  pet.appearance = desc;
}

function normalizePetVitalsForStorage(pet) {
  if (!pet || typeof pet !== 'object') return;
  const maxHp = Math.max(1, Math.round(Number(pet.maxHp || pet.hp || 100)));
  const hp = Math.max(0, Math.min(maxHp, Math.round(Number(pet.hp || maxHp))));
  pet.maxHp = maxHp;
  pet.hp = hp;
}

// ============== 存讀檔 ==============
function savePet(pet) {
  const pets = loadAllPets();
  normalizePetMoves(pet);
  normalizePetVitalsForStorage(pet);
  pets[pet.id] = pet;
  fs.writeFileSync(PET_FILE, JSON.stringify(pets, null, 2));
}

function loadPet(playerId) {
  const pets = loadAllPets();
  const pet = Object.values(pets).find(p => p.ownerId === playerId) || null;
  if (!pet) return null;

  const normalizedChanged = normalizePetMoves(pet);
  const synced = syncPetRecovery(pet);
  if (synced.changed || normalizedChanged) {
    savePet(synced.pet);
  }

  return synced.pet;
}

function deletePetByOwner(playerId) {
  const pets = loadAllPets();
  let changed = false;
  for (const [petId, pet] of Object.entries(pets)) {
    if (pet?.ownerId === playerId) {
      delete pets[petId];
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(PET_FILE, JSON.stringify(pets, null, 2));
  }

  return changed;
}

function getPetById(petId) {
  const pets = loadAllPets();
  return pets[petId] || null;
}

function getAllPetsByOwner(playerId) {
  const ownerId = String(playerId || '').trim();
  if (!ownerId) return [];
  const pets = loadAllPets();
  const owned = Object.values(pets).filter((pet) => String(pet?.ownerId || '').trim() === ownerId);
  let changed = false;
  for (const pet of owned) {
    if (normalizePetMoves(pet)) changed = true;
    const synced = syncPetRecovery(pet);
    if (synced.changed) {
      changed = true;
      Object.assign(pet, synced.pet);
    }
  }
  if (changed) {
    fs.writeFileSync(PET_FILE, JSON.stringify(pets, null, 2));
  }
  return owned;
}

function loadAllPets() {
  if (!fs.existsSync(PET_FILE)) return {};
  try {
    const pets = JSON.parse(fs.readFileSync(PET_FILE, 'utf8'));
    let changed = false;
    for (const pet of Object.values(pets)) {
      if (normalizePetMoves(pet)) changed = true;
    }
    if (changed) {
      fs.writeFileSync(PET_FILE, JSON.stringify(pets, null, 2));
    }
    return pets;
  } catch (e) {
    return {};
  }
}

module.exports = {
  PET_ELEMENTS,
  ELEMENT_MOVE_POOLS,
  POSITIVE_MOVES,
  NEGATIVE_MOVES,
  INITIAL_MOVES,
  normalizePetElement,
  getMovesByElement,
  getMoveRarityByTier,
  getMoveById: (id) => MOVE_BY_ID.get(String(id || '').trim()) || null,
  createPetEgg,
  hatchEgg,
  learnMove,
  forgetMove,
  updateAppearance,
  calculateMoveDamage,
  markPetDefeated,
  syncPetRecovery,
  advancePetRecoveryTurns,
  getPetRecoveryRemainingTurns,
  getPetRecoveryRemainingMs,
  savePet,
  loadPet,
  getAllPetsByOwner,
  deletePetByOwner,
  loadAllPets,
  getPetById
};
