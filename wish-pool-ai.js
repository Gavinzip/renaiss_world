/**
 * 🪙 許願池 AI 判願模組
 * 規則：不白給，所有願望都會有代價或反轉
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const API_KEY = process.env.MINIMAX_API_KEY || '';
const MODEL = 'MiniMax-M2.5';
const TIMEOUT_MS = 14000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function containsAny(text, keywords) {
  const source = String(text || '').toLowerCase();
  return keywords.some(k => source.includes(k.toLowerCase()));
}

function requestAI(body, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.minimax.io',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.message?.content || '';
          if (!content) {
            reject(new Error('Empty AI content'));
            return;
          }
          resolve(content);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.setTimeout(timeoutMs, () => req.destroy(new Error('AI timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseJsonFromText(text) {
  const source = String(text || '').trim();
  const clean = source
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {}

  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeOutcome(raw, wishText) {
  const out = raw && typeof raw === 'object' ? raw : {};
  const statDelta = out.statDelta && typeof out.statDelta === 'object' ? out.statDelta : {};
  return {
    verdict: String(out.verdict || 'twist'),
    title: String(out.title || '許願池回音'),
    immediateText: String(out.immediateText || '池水泛起一圈圈漣漪，回應了你的願望。'),
    futureHook: String(out.futureHook || '這個願望會在後續劇情以意想不到的方式延續。'),
    worldRumor: String(out.worldRumor || `有人在茶館傳起你關於「${wishText}」的奇聞。`),
    itemReward: out.itemReward ? String(out.itemReward) : '',
    statDelta: {
      gold: clamp(Number(statDelta.gold || 0), -200, 200),
      hp: clamp(Number(statDelta.hp || 0), -40, 40),
      innerPower: clamp(Number(statDelta.innerPower || 0), -25, 25),
      luck: clamp(Number(statDelta.luck || 0), -15, 15)
    }
  };
}

function buildHeuristicOutcome(wishText) {
  const wish = String(wishText || '').trim();

  if (containsAny(wish, ['免費', 'free', '白嫖', '錢', '金幣', '發財', '富有'])) {
    return normalizeOutcome({
      verdict: 'twist',
      title: '金幣雨的甜香',
      immediateText: '池面翻起金光，落下滿地金幣。你撿起一枚咬下去，才發現是金幣巧克力。',
      futureHook: '幾天後，黑市糖匠願意用少量真金收購這批「金幣巧克力」。',
      worldRumor: '城裡都在傳你撿到黃金，結果是會融化的甜點。',
      itemReward: '金幣巧克力 x3',
      statDelta: { gold: 8, hp: 5, innerPower: 0, luck: -3 }
    }, wish);
  }

  if (containsAny(wish, ['武力', '戰力', '無敵', '免費招數', '神功', '絕學', '技能'])) {
    return normalizeOutcome({
      verdict: 'costly',
      title: '破頁秘笈',
      immediateText: '一名衣衫襤褸的乞丐從橋下探頭，丟給你一張殘破拳譜，笑說「這招夠你活命」。',
      futureHook: '若你願意繼續投資資源，這張殘頁未來或許能補全成真正武學。',
      worldRumor: '星域傳聞你在許願池邊遇到了一位行為古怪的導師。',
      itemReward: '破舊拳譜殘頁',
      statDelta: { gold: -20, hp: 0, innerPower: 5, luck: -1 }
    }, wish);
  }

  return normalizeOutcome({
    verdict: 'costly',
    title: '願望折現',
    immediateText: '池水沒有直接答應你，而是把願望拆成可兌現的碎片，先給你一小部分回報。',
    futureHook: '接下來幾段劇情裡，這個願望會以代價交換的方式逐步實現。',
    worldRumor: '茶館裡有人說你在許願池借了命運的債。',
    itemReward: '',
    statDelta: { gold: 12, hp: 0, innerPower: 3, luck: -2 }
  }, wish);
}

function buildCustomActionHeuristicOutcome(actionText) {
  const action = String(actionText || '').trim();
  if (!action) return buildHeuristicOutcome('希望有點好事發生');

  if (containsAny(action, ['殺死魔王', '直接殺死', '秒殺', '世界毀滅', '世界重置', '改寫歷史', '讓某某直接死掉'])) {
    return normalizeOutcome({
      verdict: 'twist',
      title: '命運的借位',
      immediateText: '你看見一個披著魔王斗篷的人影倒下，走近才發現只是戲班子的彩排替身。',
      futureHook: '這場誤會讓真正的高危勢力開始注意你，後續衝突會更真實地逼近。',
      worldRumor: '街坊盛傳你「差點斬了魔王」，結果其實是戲班意外。',
      itemReward: '破裂面具碎片',
      statDelta: { gold: 0, hp: 0, innerPower: 2, luck: -4 }
    }, action);
  }

  if (containsAny(action, ['超級多錢', '一億', '十億', '無限金幣', '直接發財', '拿滿金庫', '印鈔'])) {
    return normalizeOutcome({
      verdict: 'twist',
      title: '金庫的甜味',
      immediateText: '你搬開箱蓋，滿滿「金幣」在燈下閃亮，咬下去才發現是包了金箔的巧克力代幣。',
      futureHook: '這批代幣可換到小額真幣與人脈，但遠不到顛覆市場的程度。',
      worldRumor: '有人笑說你開了金庫，結果先開的是甜點鋪。',
      itemReward: '鍍金巧克力代幣 x3',
      statDelta: { gold: 12, hp: 4, innerPower: 0, luck: -3 }
    }, action);
  }

  if (containsAny(action, ['躲進樹叢', '躲避敵人', '潛行', '埋伏', '藏身', '觀察敵人', '偵查'])) {
    return normalizeOutcome({
      verdict: 'allow',
      title: '靜息潛行',
      immediateText: '你壓低呼吸，沿著陰影與草叢移動，成功避開正面衝突並掌握了敵人的巡邏節奏。',
      futureHook: '下一段遭遇中，你會先手取得位置優勢，能更主動選擇戰或退。',
      worldRumor: '附近獵戶說有人在林間行動得像一縷風。',
      itemReward: '',
      statDelta: { gold: 0, hp: 0, innerPower: 3, luck: 2 }
    }, action);
  }

  return normalizeOutcome({
    verdict: 'costly',
    title: '行動已受理',
    immediateText: '你的自訂行動被世界接住了，但不是毫無代價；進展有了，風險也一起跟上。',
    futureHook: '接下來劇情會把這次行動延展成新分支，結果將由後續抉擇放大。',
    worldRumor: '茶館裡開始有人討論你最近那步「不按常理」的行動。',
    itemReward: '',
    statDelta: { gold: 0, hp: -2, innerPower: 2, luck: 1 }
  }, action);
}

async function judgeWishWithAI({ wishText, player }) {
  const wish = String(wishText || '').trim().slice(0, 120);
  if (!wish) {
    return buildHeuristicOutcome('希望有點好事發生');
  }

  if (!API_KEY) {
    return buildHeuristicOutcome(wish);
  }

  const prompt = `你是Renaiss世界的「許願池裁決AI」。
請判斷玩家願望如何以「不白給」規則實現，禁止直接免費給超額好處。

玩家資訊：
- 名字：${player?.name || '冒險者'}
- 位置：${player?.location || '未知'}
- 財富：${player?.stats?.財富 || 0}
- 運氣：${player?.stats?.運氣 || 50}

玩家願望：${wish}

規則：
1. 不可直接免費給大量金錢、神級武學、無敵增益。
2. 必須是「反轉實現」或「有代價實現」。
3. 輸出要有戲劇性、可融入後續劇情。
4. 只輸出JSON，不要多餘文字。

JSON格式：
{
  "verdict": "twist|costly|deferred",
  "title": "短標題",
  "immediateText": "當下發生的事（40-90字）",
  "futureHook": "後續伏筆（25-60字）",
  "worldRumor": "世界流言（一句）",
  "itemReward": "道具名或空字串",
  "statDelta": {
    "gold": -200~200,
    "hp": -40~40,
    "innerPower": -25~25,
    "luck": -15~15
  }
}`;

  try {
    const body = JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.95,
      max_tokens: 520
    });
    const content = await requestAI(body, TIMEOUT_MS);
    const parsed = parseJsonFromText(content);
    if (!parsed) return buildHeuristicOutcome(wish);
    return normalizeOutcome(parsed, wish);
  } catch {
    return buildHeuristicOutcome(wish);
  }
}

async function judgeCustomActionWithAI({ actionText, player }) {
  const action = String(actionText || '').trim().slice(0, 120);
  if (!action) {
    return buildCustomActionHeuristicOutcome('先觀察周遭再行動');
  }

  if (!API_KEY) {
    return buildCustomActionHeuristicOutcome(action);
  }

  const prompt = `你是Renaiss世界的「自訂行動裁決AI」。
玩家輸入了下一步想做的事，你要判斷可否實現，且必須遵守世界一致性。

玩家資訊：
- 名字：${player?.name || '冒險者'}
- 位置：${player?.location || '未知'}
- 財富：${player?.stats?.財富 || 0}
- 運氣：${player?.stats?.運氣 || 50}

玩家輸入：${action}

規則：
1. 允許「局部、合理、可執行」行動（例如潛行、觀察、交涉、躲避、追蹤）。
2. 禁止直接改寫世界事實：例如直接殺死魔王、指定某人立刻死亡、無限金錢、立即無敵。
3. 若請求過度，請用「反轉實現」或「有代價的實現」呈現，不得直接說「不能」。
4. 敘事要自然、像世界自己回應，不要像系統拒絕訊息。
5. 只輸出JSON，不要多餘文字。

JSON格式：
{
  "verdict": "allow|twist|costly|deferred",
  "title": "短標題",
  "immediateText": "當下發生的事（40-100字）",
  "futureHook": "後續伏筆（25-70字）",
  "worldRumor": "世界流言（一句）",
  "itemReward": "道具名或空字串",
  "statDelta": {
    "gold": -200~200,
    "hp": -40~40,
    "innerPower": -25~25,
    "luck": -15~15
  }
}`;

  try {
    const body = JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 520
    });
    const content = await requestAI(body, TIMEOUT_MS);
    const parsed = parseJsonFromText(content);
    if (!parsed) return buildCustomActionHeuristicOutcome(action);
    return normalizeOutcome(parsed, action);
  } catch {
    return buildCustomActionHeuristicOutcome(action);
  }
}

function applyWishOutcome(player, outcome) {
  if (!player || !player.stats || !player.maxStats) {
    return { summaryLines: [], delta: { gold: 0, hp: 0, innerPower: 0, luck: 0 }, itemGranted: '' };
  }

  const delta = outcome?.statDelta || {};
  const goldDelta = Number(delta.gold || 0);
  const hpDelta = Number(delta.hp || 0);
  const innerDelta = Number(delta.innerPower || 0);
  const luckDelta = Number(delta.luck || 0);

  player.stats.財富 = Math.max(0, (player.stats.財富 || 0) + goldDelta);
  player.stats.生命 = clamp((player.stats.生命 || 0) + hpDelta, 0, player.maxStats.生命 || 100);
  player.stats.內力 = clamp((player.stats.內力 || 0) + innerDelta, 0, player.maxStats.內力 || 100);
  player.stats.運氣 = clamp((player.stats.運氣 || 50) + luckDelta, 1, 100);

  let itemGranted = '';
  if (outcome?.itemReward) {
    if (!Array.isArray(player.inventory)) player.inventory = [];
    player.inventory.push(outcome.itemReward);
    itemGranted = outcome.itemReward;
  }

  const summaryLines = [];
  if (goldDelta !== 0) summaryLines.push(`💰 Rns ${goldDelta > 0 ? '+' : ''}${goldDelta}`);
  if (hpDelta !== 0) summaryLines.push(`❤️ 生命 ${hpDelta > 0 ? '+' : ''}${hpDelta}`);
  if (innerDelta !== 0) summaryLines.push(`🌀 內力 ${innerDelta > 0 ? '+' : ''}${innerDelta}`);
  if (luckDelta !== 0) summaryLines.push(`🍀 幸運 ${luckDelta > 0 ? '+' : ''}${luckDelta}`);
  if (itemGranted) summaryLines.push(`🎁 獲得道具：${itemGranted}`);

  return {
    summaryLines,
    delta: { gold: goldDelta, hp: hpDelta, innerPower: innerDelta, luck: luckDelta },
    itemGranted
  };
}

module.exports = {
  judgeWishWithAI,
  judgeCustomActionWithAI,
  applyWishOutcome
};
