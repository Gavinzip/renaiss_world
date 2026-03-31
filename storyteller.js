/**
 * 📖 AI 故事生成器 v6 - 記憶+風險標籤+NPC狀態
 */

const fs = require('fs');
const path = require('path');
const { LOCATION_DESCRIPTIONS } = require('./world-map');

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
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.5-Lightning';

const RENAISS_LOCATIONS = { ...LOCATION_DESCRIPTIONS };

const RENAISS_NPCS = {
  '草原部落': [
    { name: '族長之子', title: '騎兵隊長', level: 15, pet: '赤兔馬', petType: '火系', align: '正派', desc: '英俊瀟灑，武藝高強' },
    { name: '老祭司', title: '長老', level: 20, pet: '雪狼', petType: '冰系', align: '正派', desc: '智慧長者，守護傳統' },
    { name: '沙漠商人', title: '商隊領袖', level: 8, pet: '駱駝獸', petType: '地系', align: '中立', desc: '見多識廣，消息靈通' }
  ],
  '襄陽城': [
    { name: '林工程師', title: '機械師', level: 15, pet: '齒輪獸', petType: '機甲', align: '正派', desc: '發明家，專門製作機械助手' },
    { name: '蘇醫生', title: '細胞治療師', level: 20, pet: '治愈水母', petType: '水系', align: '正派', desc: '懸壺濟世，救人無數' },
    { name: '黑影商人', title: '情報贩子', level: 8, pet: '隱幽鼠', petType: '暗系', align: '中立', desc: '什麼都賣，什麼都買' }
  ],
  '大都': [
    { name: '皇太子', title: '未來統治者', level: 25, pet: '金焰獅', petType: '火系', align: '正派', desc: '權力核心，但心懷天下' },
    { name: '間諜Q', title: '情報局長', level: 18, pet: '數據烏鴉', petType: '數據系', align: '中立', desc: '神出鬼沒，情報無雙' },
    { name: '牡丹夫人', title: '社交名媛', level: 12, pet: '花仙蝶', petType: '草系', align: '正派', desc: '交際花，八面玲瓏' }
  ],
  '蓬萊仙島': [
    { name: '白蓮花仙', title: '島主', level: 30, pet: '蓮花靈', petType: '靈系', align: '正派', desc: '守護仙境，神秘莫測' }
  ]
};

const https = require('https');

const AI_MAX_RETRIES = 3;
const AI_TIMEOUT_MS = 90000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeAIContent(content) {
  let source = '';
  if (typeof content === 'string') {
    source = content;
  } else if (Array.isArray(content)) {
    source = content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return item.text || item.content || '';
        }
        return '';
      })
      .join('\n');
  } else if (content && typeof content === 'object') {
    source = content.text || content.content || '';
  }

  if (!source || typeof source !== 'string') return '';
  let cleaned = source.trim();
  // 移除 <think>...</think> 思考標籤（多行）
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  return cleaned.trim();
}

function previewAIContent(content) {
  try {
    if (typeof content === 'string') return content.slice(0, 120);
    return JSON.stringify(content).slice(0, 120);
  } catch {
    return String(content).slice(0, 120);
  }
}

function buildFallbackStory(player, pet, location, locDesc, previousAction, playerLang = 'zh-TW') {
  const name = player?.name || '冒險者';
  const petName = pet?.name || '寵物';
  const scenes = [
    '遠處傳來金屬碰撞聲，像有人在夜色中交手。',
    '潮濕的風帶著鹹味掠過街角，霓虹在地面上碎成斑斕光點。',
    '地面細微震動，彷彿有巨物在暗處緩慢移動。'
  ];
  const hooks = [
    '你直覺這不只是巧合，下一步很可能改變局勢。',
    '四周目光開始聚集，所有人都在等你做出決定。',
    '你與寵物交換了一個眼神，真正的挑戰才剛開始。'
  ];
  const scene = scenes[Math.floor(Math.random() * scenes.length)];
  const hook = hooks[Math.floor(Math.random() * hooks.length)];

  if (playerLang === 'en') {
    return `${name} and ${petName} move through ${location} (${locDesc}). After choosing "${previousAction}", ${scene} ${hook}`;
  }
  if (playerLang === 'zh-CN') {
    return `${name}与${petName}行进在${location}（${locDesc}）。你刚刚选择了「${previousAction}」，${scene}${hook}`;
  }
  return `${name}與${petName}行進在${location}（${locDesc}）。你剛剛選擇了「${previousAction}」，${scene}${hook}`;
}

function buildFallbackChoices(player, location, playerLang = 'zh-TW') {
  if (playerLang === 'en') {
    return [
      { name: 'Push forward', choice: 'Close in and confront the suspicious figure', desc: 'Close in and confront the suspicious figure', tag: '[⚔️Battle]' },
      { name: 'Scout flank', choice: 'Ask your pet to scout from the side', desc: 'Ask your pet to scout from the side', tag: '[🔥Risky]' },
      { name: 'Gather clues', choice: 'Search nearby traces for hidden information', desc: 'Search nearby traces for hidden information', tag: '[🔍Explore]' },
      { name: 'Talk first', choice: 'Open with dialogue to test their intent', desc: 'Open with dialogue to test their intent', tag: '[🤝Social]' },
      { name: 'Take high ground', choice: 'Move to a better position before action', desc: 'Move to a better position before action', tag: '[🎁Reward]' },
      { name: 'Use resources', choice: 'Spend some coins on temporary support', desc: 'Spend some coins on temporary support', tag: '[💰Cost]' },
      { name: 'Follow instinct', choice: 'Trust your instinct and make an unexpected move', desc: 'Trust your instinct and make an unexpected move', tag: '[❓Surprise]' }
    ];
  }
  const shortLoc = location || '此地';
  return [
    { name: `正面逼近`, choice: `拔劍逼近${shortLoc}可疑身影`, desc: `拔劍逼近${shortLoc}可疑身影`, tag: '[⚔️會戰鬥]' },
    { name: '側翼偵查', choice: '命令寵物從側面偵查動靜', desc: '命令寵物從側面偵查動靜', tag: '[🔥高風險]' },
    { name: '搜尋線索', choice: '檢查地面痕跡與殘留氣味', desc: '檢查地面痕跡與殘留氣味', tag: '[🔍需探索]' },
    { name: '先談再動', choice: '先和對方交涉摸清來意', desc: '先和對方交涉摸清來意', tag: '[🤝需社交]' },
    { name: '搶占地形', choice: '移到高處準備反制與突襲', desc: '移到高處準備反制與突襲', tag: '[🎁高回報]' },
    { name: '臨時補給', choice: '花費銀兩購買一次性支援道具', desc: '花費銀兩購買一次性支援道具', tag: '[💰需花錢]' },
    { name: '隨機應變', choice: '交給直覺做出意外選擇', desc: '交給直覺做出意外選擇', tag: '[❓有驚喜]' }
  ];
}

function requestAI(body, timeoutMs = AI_TIMEOUT_MS) {
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

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log('[AI] HTTP 錯誤:', res.statusCode, data.substring(0, 300));
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'API Error'));
            return;
          }
          if (parsed.base_resp && parsed.base_resp.status_msg) {
            reject(new Error(parsed.base_resp.status_msg));
            return;
          }

          const choice = parsed.choices?.[0];
          const rawContent = choice?.message?.content || '';
          if (!rawContent) {
            reject(new Error('Empty AI content'));
            return;
          }

          resolve({
            content: rawContent,
            finishReason: choice?.finish_reason || ''
          });
        } catch (e) {
          console.log('[AI] Parse error, raw:', data.substring(0, 300));
          reject(e);
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('AI timeout'));
    });

    req.on('error', (e) => {
      console.log('[AI] Network error:', e.message);
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

function summarizeContext(rawText, maxChars = 240, maxLines = 3) {
  const text = String(rawText || '').trim();
  if (!text) return '';
  const lines = text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, maxLines);
  const merged = lines.join('\n');
  return merged.length > maxChars ? merged.slice(0, maxChars) + '...' : merged;
}

async function callAI(prompt, temperature = 0.9, options = {}) {
  if (!API_KEY) throw new Error('No API Key');

  const retries = Math.max(1, Number(options.retries || AI_MAX_RETRIES));
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || AI_TIMEOUT_MS));
  const maxTokens = Math.max(120, Number(options.maxTokens || 700));
  const label = String(options.label || 'callAI');
  const hardRule = '\n\n【硬性輸出規則】只輸出最終答案，禁止輸出任何思考過程、XML標籤或系統說明。';
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startAt = Date.now();
      const attemptPrompt =
        prompt +
        hardRule +
        (
          attempt > 1
            ? '\n上一輪你可能只輸出了<think>內容。這一輪禁止輸出<think>，直接輸出最終內容。'
            : ''
        );
      const attemptMaxTokens = attempt > 1 ? Math.min(2200, Math.floor(maxTokens * 2)) : maxTokens;
      const body = JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [{ role: 'user', content: attemptPrompt }],
        temperature: temperature,
        max_tokens: attemptMaxTokens
      });

      const { content, finishReason } = await requestAI(body, timeoutMs);
      const cleaned = sanitizeAIContent(content);

      if (!cleaned || cleaned.length < 30) {
        throw new Error(`Empty cleaned content raw=${previewAIContent(content)}`);
      }
      if (finishReason === 'length' && cleaned.length < 80) {
        throw new Error('Truncated content');
      }

      console.log(`[AI][${label}] model=${MINIMAX_MODEL} attempt ${attempt}/${retries} ok in ${Date.now() - startAt}ms`);
      return cleaned;
    } catch (e) {
      lastError = e;
      console.log(`[AI][${label}] model=${MINIMAX_MODEL} attempt ${attempt}/${retries} failed: ${e.message}`);
      if (attempt < retries) {
        await sleep(400 * attempt);
        continue;
      }
    }
  }

  throw lastError || new Error('AI request failed');
}

// ========== 生成故事（帶記憶）============
async function generateStory(event, player, pet, previousChoice, memoryContext = '') {
  const startedAt = Date.now();
  const location = player.location || '襄陽城';
  const playerName = player.name || '冒險者';
  const petName = pet?.name || '寵物';
  const petType = pet?.type || '正派';
  const alignment = player.alignment || '正派';
  
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座奇幻城市';
  const npcs = RENAISS_NPCS[location] || [];
  
  // 檢查 NPC 狀態
  let npcStatusText = '當地的人：';
  for (const npc of npcs) {
    const alive = player.isNPCAlive ? player.isNPCAlive(npc.name) : true;
    if (alive) {
      npcStatusText += `✅${npc.name}(${npc.title})、`;
    } else {
      npcStatusText += `❌${npc.name}(重傷休養中)、`;
    }
  }
  npcStatusText = npcStatusText.slice(0, -1); // 移除最後的頓號
  
  const previousAction = previousChoice?.choice || previousChoice?.name || '開始探索';
  
  // 確保玩家名字是中文（如果全是英文就用冒險者）
  let safePlayerName = playerName.trim();
  if (/^[a-zA-Z0-9]+$/.test(safePlayerName)) {
    safePlayerName = '冒險者';
  }
  
  // 根據玩家語言設定決定輸出語言
  const playerLang = player.language || 'zh-TW';
  const langInstruction = {
    'zh-TW': '請用繁體中文講述',
    'zh-CN': '請用簡體中文講述',
    'en': '請用英文講述'
  }[playerLang] || '請用繁體中文講述';
  
  // 記憶上下文
  const focusedMemory = summarizeContext(memoryContext, 220, 3);
  const memorySection = focusedMemory ? `\n【玩家之前的足跡（重點）】\n${focusedMemory}` : '';
  
  const prompt = `你是Renaiss星球的說書人，講故事要有畫面感、節奏感。

【當前場景】
位置：${location} - ${locDesc}
玩家：${safePlayerName}
寵物：${petName}(${petType})
陣營：${alignment}
語言設定：${playerLang}
${npcStatusText}
${memorySection}

【上一個行動】
${previousAction}

【任務】
${langInstruction}，講述玩家「${safePlayerName}」執行「${previousAction}」後發生了什麼，故事長度適中（120-220字）。要點：
1. 有具體的場景（光線、聲音、氣味、溫度、觸感）
2. 有NPC或環境的互動
3. 有Renaiss星球的科幻與奇幻元素
4. 故事要有懸念，讓人想繼續看
5. 嚴格使用對應語言，${langInstruction.replace('請用', '全部')}

直接開始講：`;

  try {
    const story = await callAI(prompt, 0.95, {
      label: 'generateStory',
      maxTokens: 1200,
      timeoutMs: 22000,
      retries: 2
    });
    if (story && story.length > 50) {
      if (story.length > 2000) {
        return story.substring(0, 2000) + '...[故事過長已截斷]';
      }
      console.log(`[AI][generateStory] total ${Date.now() - startedAt}ms`);
      return story;
    }
  } catch (e) {
    console.error('[Storyteller] AI失敗:', e.message);
  }
  
  const fallback = buildFallbackStory(player, pet, location, locDesc, previousAction, playerLang);
  console.log(`[AI][generateStory] total ${Date.now() - startedAt}ms (fallback)`);
  return fallback;
}

// ========== AI 生成選項（帶風險標籤+更具體）============
async function generateChoicesWithAI(player, pet, previousStory, memoryContext = '') {
  const startedAt = Date.now();
  const location = player.location || '襄陽城';
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座奇幻城市';
  const petName = pet?.name || '寵物';
  const playerName = player.name || '冒險者';
  const npcs = RENAISS_NPCS[location] || [];
  
  // 檢查 NPC 狀態
  let npcStatusText = '';
  for (const npc of npcs) {
    const alive = player.isNPCAlive ? player.isNPCAlive(npc.name) : true;
    if (alive) {
      npcStatusText += `${npc.name}、`;
    }
  }
  
  const playerLang = player?.language || 'zh-TW';
  const langInstruction = {
    'zh-TW': '請用繁體中文輸出',
    'zh-CN': '請用簡體中文輸出',
    'en': 'Please output in English'
  }[playerLang] || '請用繁體中文輸出';
  
  const focusedMemory = summarizeContext(memoryContext, 180, 2);
  const memorySection = focusedMemory ? `\n【玩家之前的足跡（重點）】\n${focusedMemory}` : '';
  
  const prompt = `你是Renaiss星球的冒險策劃師，設計的選項要有創意、刺激！

【當前情境】
位置：${location} - ${locDesc}
玩家：${playerName}
寵物：${petName}
當地NPC：${npcStatusText || '沒有人'}
語言設定：${playerLang}
${memorySection}

【前面的故事】
${String(previousStory || '').substring(0, 220)}...

【任務】
根據上面的故事，生成7個獨特的冒險選項。${langInstruction}。要求：
1. 每個選項要有創意！拒絕無聊！
2. 要符合故事的劇情發展
3. 每個選項格式：「[風險標籤] 具體動作：20字內描述」

風險標籤可選（根據劇情選擇適合的）：
- [🔥高風險] - 可能會受傷或失敗
- [💰需花錢] - 需要花費金錢
- [🤝需社交] - 需要與人交談
- [🔍需探索] - 需要探索或搜尋
- [⚔️會戰鬥] - 可能爆發戰鬥
- [🎁高回報] - 成功後收獲豐厚
- [❓有驚喜] - 結果未知

禁止出現：打坐修煉、隨便逛逛、原地休息這類選項！

${langInstruction}輸出7個選項，每行一個。例如：
[⚔️會戰鬥] 衝上去阻止：飛身撲向失控的飛行器
[🔥高風險] 追進暗巷：代價不明但可能有好處
[🤝需社交] 直接詢問：禮貌地向對方表明來意
[🔍需探索] 搜索周圍：檢查附近的線索
[🎁高回報] 接受交易：對方開出的條件很誘人
[💰需花錢] 購買物資：在商店補充必需品
[❓有驚喜] 嘗試呼喚：看寵物感應到了什麼`;

  try {
    const result = await callAI(prompt, 1.0, {
      label: 'generateChoicesWithAI',
      maxTokens: 700,
      timeoutMs: 14000,
      retries: 1
    });
    
    const choices = [];
    const lines = result.split('\n').filter(line => line.trim());
    
    for (const line of lines.slice(0, 7)) {
      // 解析格式：「[標籤] 動作：描述」
      const tagMatch = line.match(/\[([^\]]+)\]\s*(.+?)[：:]\s*(.+)/);
      
      if (tagMatch) {
        const tag = tagMatch[1];
        const action = tagMatch[2].trim();
        const desc = tagMatch[3].trim();
        
        // 過濾無聊選項
        const boring = ['打坐', '修煉', '隨便', '逛逛', '休息', '原地', '隨意'];
        if (boring.some(b => action.includes(b) || desc.includes(b))) {
          continue;
        }
        
        if (action && desc) {
          choices.push({ 
            name: action, 
            choice: desc, 
            desc: desc,
            tag: `[${tag}]`
          });
        }
      } else {
        // 如果解析失敗，用簡單格式
        const content = line.replace(/^\d+\.?\s*/, '').trim();
        if (content && content.length > 5 && !content.includes('打坐') && !content.includes('修煉')) {
          choices.push({ 
            name: content.substring(0, 15), 
            choice: content, 
            desc: content,
            tag: '[❓有驚喜]'
          });
        }
      }
    }
    
    if (choices.length >= 5) {
      console.log(`[AI][generateChoicesWithAI] total ${Date.now() - startedAt}ms`);
      return choices.slice(0, 7);
    }
  } catch (e) {
    console.error('[AI] 生成選項失敗:', e.message);
  }
  
  const fallback = buildFallbackChoices(player, location, playerLang);
  console.log(`[AI][generateChoicesWithAI] total ${Date.now() - startedAt}ms (fallback)`);
  return fallback;
}

// ========== 初始選項生成（開場用）============
async function generateInitialChoices(player, pet) {
  const startedAt = Date.now();
  const location = player.location || '襄陽城';
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座奇幻城市';
  const petName = pet?.name || '寵物';
  const playerName = player.name || '冒險者';
  const npcs = RENAISS_NPCS[location] || [];
  
  let npcStatusText = '';
  for (const npc of npcs) {
    npcStatusText += `${npc.name}、`;
  }
  
  const playerLang = player?.language || 'zh-TW';
  const langInstruction = {
    'zh-TW': '請用繁體中文輸出',
    'zh-CN': '請用簡體中文輸出',
    'en': 'Please output in English'
  }[playerLang] || '請用繁體中文輸出';
  
  const prompt = `你是Renaiss星球的冒險策劃師，設計的开場選項要有吸引力！

【開場情境】
位置：${location} - ${locDesc}
玩家：${playerName}
寵物：${petName}
當地NPC：${npcStatusText || '沒有重要NPC'}
語言設定：${playerLang}

【任務】
玩家剛來到${location}，請設計7個吸引人的冒險選項。${langInstruction}。要求：
1. 每個選項要有創意、有畫面感
2. 不要無聊選項
3. 每個選項格式：「[風險標籤] 具體動作：20字內描述」

風險標籤：
- [🔥高風險] - 可能危險
- [💰需花錢] - 需要金錢
- [🤝需社交] - 需要交談
- [🔍需探索] - 需要探索
- [⚔️會戰鬥] - 可能戰鬥
- [🎁高回報] - 回報豐厚
- [❓有驚喜] - 結果未知

${langInstruction}輸出7個選項，每行一個。例如：
[🔍需探索] 走進維修站：看看有沒有高科技道具
[🤝需社交] 參觀商店：和店主聊聊最近的傳聞
[⚔️會戰鬥] 參加比武：廣場有寵物對戰賽事
[🎁高回報] 打聽懸賞：找到能賺大錢的任務
[❓有驚喜] 找人問路：隨機找個路人攀談
[💰需花錢] 購買裝備：去裝備店武裝自己
[🔥高風險] 探索禁區：據說那裡有寶藏`;

  try {
    const result = await callAI(prompt, 1.0, {
      label: 'generateInitialChoices',
      maxTokens: 700,
      timeoutMs: 14000,
      retries: 1
    });
    
    const choices = [];
    const lines = result.split('\n').filter(line => line.trim());
    
    for (const line of lines.slice(0, 7)) {
      const tagMatch = line.match(/\[([^\]]+)\]\s*(.+?)[：:]\s*(.+)/);
      
      if (tagMatch) {
        const tag = tagMatch[1];
        const action = tagMatch[2].trim();
        const desc = tagMatch[3].trim();
        
        const boring = ['打坐', '修煉', '隨便', '逛逛', '休息', '原地', '隨意'];
        if (boring.some(b => action.includes(b) || desc.includes(b))) {
          continue;
        }
        
        if (action && desc) {
          choices.push({ name: action, choice: desc, desc: desc, tag: `[${tag}]` });
        }
      }
    }
    
    if (choices.length >= 5) {
      console.log(`[AI][generateInitialChoices] total ${Date.now() - startedAt}ms`);
      return choices.slice(0, 7);
    }
  } catch (e) {
    console.error('[AI] 生成開場選項失敗:', e.message);
  }
  
  const fallback = buildFallbackChoices(player, location, playerLang);
  console.log(`[AI][generateInitialChoices] total ${Date.now() - startedAt}ms (fallback)`);
  return fallback;
}

module.exports = {
  generateStory,
  generateChoicesWithAI,
  generateInitialChoices,
  RENAISS_NPCS,
  RENAISS_LOCATIONS
};
