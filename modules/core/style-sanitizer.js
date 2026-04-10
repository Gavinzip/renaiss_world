/**
 * Text style sanitizer for runtime output.
 * Keeps legacy data compatible while forcing non-wuxia, original wording.
 */

const REPLACEMENTS = [
  [/\bPokemon\b/gi, '晶獸'],
  [/\bDigimon\b/gi, '碼獸'],
  [/寶可夢|神奇寶貝/g, '晶獸'],
  [/數碼寶貝/g, '碼獸'],
  [/斗羅大陸|斗罗大陆/g, '星核紀元'],
  [/唐三|小舞/g, '舊紀元角色'],
  [/四大天王/g, '四巨頭'],
  [/蒙面殺手/g, '覆面獵手'],
  [/俠客島/g, '潮汐試煉島'],
  [/江湖/g, '星域'],
  [/俠客|俠士|大俠|俠義/g, '探索者'],
  [/武林/g, '戰圈'],
  [/門派/g, '陣營'],
  [/師父/g, '導師'],
  [/拜師/g, '拜訪導師'],
  [/武功|武藝/g, '戰技'],
  [/秘籍/g, '技術檔案'],
  [/掌門/g, '主理人'],
  [/宗師/g, '頂尖'],
  [/教主/g, '主導者'],
  [/打坐/g, '調頻'],
  [/修煉/g, '訓練'],
  [/酒樓/g, '情報酒吧'],
  [/客棧/g, '中繼旅店'],

  [/金針刺穴/g, '脈衝標定'],
  [/暴雨梨花/g, '碎晶風暴'],
  [/金鐘罩/g, '堡壘力場'],
  [/天女散花/g, '孢子刃雨'],
  [/羅網天蛛/g, '纖維束縛'],
  [/回春術/g, '再生矩陣'],
  [/楊枝淨水/g, '淨化波'],
  [/寒冰掌/g, '低溫衝擊'],
  [/洪水滔天/g, '潮汐奇點'],
  [/羅漢金剛腿/g, '地脈衝撞'],
  [/落石陷阱/g, '隕塊墜落'],
  [/流沙陣/g, '漂砂陷落'],
  [/烈焰焚天/g, '電漿盛放'],
  [/赤焰甲/g, '熱盾回路'],
  [/風火燎原/g, '風暴聚變'],
  [/雷霆萬鈞/g, '雷矢超載'],
  [/吸星大法/g, '核心抽離'],
  [/無形鎖脈/g, '故障鎖定'],
  [/離魂散/g, '神經霧化'],
  [/七步斷腸散/g, '腐蝕鏈劑'],
  [/化骨水/g, '熔蝕酸流'],
  [/蛛絲縛魂/g, '黏網拘束'],
  [/地獄烈火/g, '煉域協議'],
  [/爆炸信號彈/g, '連鎖爆訊'],
  [/熱砂地獄/g, '炙砂域'],
  [/火蓮碎/g, '日核裂解'],
  [/黃金龍/g, '日冕巨蜥'],
  [/深淵魔/g, '虛空裂體'],
  [/修羅鳳/g, '熾羽風凰'],
  [/骸骨王/g, '白噪君主']
];

function sanitizeWorldText(input) {
  if (input === null || input === undefined) return input;
  let text = String(input);
  for (const [pattern, replacement] of REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function sanitizeWorldObject(value) {
  if (typeof value === 'string') return sanitizeWorldText(value);
  if (Array.isArray(value)) return value.map(sanitizeWorldObject);
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = sanitizeWorldObject(v);
  }
  return out;
}

module.exports = {
  sanitizeWorldText,
  sanitizeWorldObject
};

