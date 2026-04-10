const https = require('https');

const BANNED_WORDS_PATTERN = /(死亡|死掉|殺死|擊殺|屠殺|殲滅|滅門|滅派|滅亡|終局|世界終結|全滅|同歸於盡)/;

const TEMPLATE_SCENES = [
  '補給線爭奪',
  '情報節點滲透',
  '街區制高點拉扯',
  '港口貨運封鎖',
  '夜間巡邏衝突',
  '市場控制權試探',
  '能源塔週邊對峙'
];

const TEMPLATE_WEATHER = ['薄霧', '陣雨', '強風', '晴朗', '潮濕悶熱', '夜色低垂'];

function clipText(text, maxChars = 420) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (source.length <= maxChars) return source;
  return source.slice(0, maxChars) + '...';
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

function hasBannedContent(text) {
  return BANNED_WORDS_PATTERN.test(String(text || ''));
}

function safeNarrative(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;

  const headline = clipText(payload.headline || '', 80);
  const story = clipText(payload.story || '', 480);
  const orderGain = clipText(payload.orderGain || '', 80);
  const chaosGain = clipText(payload.chaosGain || '', 80);
  const balanceHint = clipText(payload.balanceHint || '', 80);

  if (!headline || !story) return fallback;
  const merged = `${headline} ${story} ${orderGain} ${chaosGain} ${balanceHint}`;
  if (hasBannedContent(merged)) return fallback;

  return {
    headline,
    story,
    orderGain,
    chaosGain,
    balanceHint,
    source: payload.source || 'ai'
  };
}

function buildFallbackNarrative(context = {}) {
  const location = context.location || '襄陽城';
  const day = Number(context.day || 0);
  const scene = pickRandom(TEMPLATE_SCENES);
  const weather = pickRandom(TEMPLATE_WEATHER);

  const headline = `⚔️ 第${day}日：${location}${scene}爆發拉鋸`;
  const story = [
    `在${weather}下，正派與 Digital 勢力於${location}的${scene}區域短兵相接。`,
    '正派以陣形穩住街區秩序，Digital 勢力則以快襲切斷側翼補給。',
    '雙方各有推進也各有回撤，局勢在一輪交火後重新回到僵持。'
  ].join('');

  const orderGain = '正派鞏固了前線節點協同';
  const chaosGain = 'Digital 勢力掌握了更靈活的突襲窗口';
  const balanceHint = '雙方均未形成決定性優勢，下一輪仍具變數';

  return { headline, story, orderGain, chaosGain, balanceHint, source: 'template' };
}

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const chunk = text.slice(start, end + 1);
      try {
        return JSON.parse(chunk);
      } catch {
        return null;
      }
    }
  }

  return null;
}

function requestMiniMaxCompletion(apiKey, prompt, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: process.env.MINIMAX_MODEL || 'MiniMax-M2.5',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.95,
      max_tokens: 480
    });

    const req = https.request({
      hostname: 'api.minimax.io',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`MiniMax HTTP ${res.statusCode}`));
            return;
          }

          const parsed = JSON.parse(data);
          const baseResp = parsed.base_resp || {};
          const statusCode = Number(baseResp.status_code || 0);
          if (!Number.isNaN(statusCode) && statusCode !== 0) {
            reject(new Error(baseResp.status_msg || `MiniMax status ${statusCode}`));
            return;
          }

          const content = parsed?.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error('MiniMax empty content'));
            return;
          }
          resolve(String(content));
        } catch (e) {
          reject(new Error(`MiniMax parse failed: ${e?.message || e}`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('MiniMax timeout'));
    });

    req.on('error', (e) => reject(new Error(`MiniMax network error: ${e?.message || e}`)));
    req.write(body);
    req.end();
  });
}

async function generateFactionSkirmishNarrative(context = {}, apiKey = '') {
  const fallback = buildFallbackNarrative(context);
  const key = String(apiKey || process.env.MINIMAX_API_KEY || '').trim();
  if (!key) return fallback;

  const location = context.location || '襄陽城';
  const day = Number(context.day || 0);
  const tension = Number(context.tension || 50);
  const orderPower = Number(context.orderPower || 50);
  const chaosPower = Number(context.chaosPower || 50);
  const scene = pickRandom(TEMPLATE_SCENES) || '街區對峙';

  const prompt = [
    '你是「Renaiss 派系衝突導演 AI」。',
    `今天是第${day}日，地點：${location}，場景：${scene}。`,
    `當前勢力值：正派 ${orderPower}，Digital ${chaosPower}，緊張度 ${tension}。`,
    '請輸出一段有戲劇張力但「永續」的衝突敘事，並嚴格遵守：',
    '1) 不能有人死亡、不能滅派、不能終局、不能世界結束。',
    '2) 雙方都要有收穫與代價，不能一面倒。',
    '3) 內容要有畫面感但篇幅精簡。',
    '4) 用繁體中文。',
    '僅輸出 JSON，不要任何額外說明，格式如下：',
    '{"headline":"...","story":"...","orderGain":"...","chaosGain":"...","balanceHint":"..."}'
  ].join('\n');

  try {
    const raw = await requestMiniMaxCompletion(key, prompt);
    const parsed = extractJsonObject(raw);
    if (!parsed) return fallback;

    const narrative = safeNarrative({
      headline: normalizeText(parsed.headline),
      story: normalizeText(parsed.story),
      orderGain: normalizeText(parsed.orderGain),
      chaosGain: normalizeText(parsed.chaosGain),
      balanceHint: normalizeText(parsed.balanceHint),
      source: 'ai'
    }, fallback);

    return narrative;
  } catch (e) {
    console.log('[FactionDirector] AI fallback:', e?.message || e);
    return fallback;
  }
}

module.exports = {
  generateFactionSkirmishNarrative,
  buildFallbackNarrative
};
