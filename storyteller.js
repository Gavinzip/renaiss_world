/**
 * 📖 AI 故事生成器 v6 - 記憶+風險標籤+NPC狀態
 */

const fs = require('fs');
const path = require('path');

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

const RENAISS_LOCATIONS = {
  '草原部落': '無垠草原上的移動式巨型蒙古包林立，基因改造牧馬在遠處奔馳',
  '襄陽城': '繁華熱鬧的街道上人來人往，全息廣告牌投射著絢麗的光影',
  '大都': '皇城腳下戒備森嚴，高聳的塔樓直插雲霄',
  '洛陽城': '牡丹花城繁華似錦，大大小小的花園遍布各處',
  '黑木崖': '黑暗深淵中的巨型浮空城市，暗能量反重力系統支撐',
  '蓬萊仙島': '雲端之上的仙境島嶼，靈氣充沛，奇花異草遍佈',
  '極北冰原': '永夜與暴風雪籠罩的冰凍荒原',
  '南疆苗疆': '毒蟲猛獸橫行的神秘叢林',
  '西域沙漠': '烈日風沙下的絲路商隊之地',
  '俠客島': '神秘莫測的海外孤島，據說藏有絕世秘籍',
  '死亡之海': '生機斷絕的荒漠，傳聞有古文明遺蹟'
};

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

function callAI(prompt, temperature = 0.9) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) {
      reject(new Error('No API Key'));
      return;
    }

    const body = JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [{ role: 'user', content: prompt }],
      temperature: temperature,
      max_tokens: 1500
    });

    const options = {
      hostname: 'api.minimax.io',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 檢查 HTTP 狀態碼
        if (res.statusCode !== 200) {
          console.log('[AI] HTTP 錯誤:', res.statusCode, data.substring(0, 300));
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) {
            let content = parsed.choices[0].message.content.trim();
            // 移除 <think>...</think> 思考標籤（多行）
            content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
            content = content.replace(/<[^>]+>/g, '');
            
            // 限制故事長度在 2000 字以內
            if (content.length > 2000) {
              content = content.substring(0, 2000) + '...[故事過長已截斷]';
            }
            
            resolve(content);
          } else if (parsed.error) {
            reject(new Error(parsed.error.message || 'API Error'));
          } else if (parsed.base_resp && parsed.base_resp.status_msg) {
            reject(new Error(parsed.base_resp.status_msg));
          } else {
            console.log('[AI] Raw response:', data.substring(0, 300));
            reject(new Error('Invalid response'));
          }
        } catch (e) {
          console.log('[AI] Parse error, raw:', data.substring(0, 300));
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.log('[AI] Network error:', e.message);
      reject(e);
    });
    req.write(body);
    req.end();
  });
}

// ========== 生成故事（帶記憶）============
async function generateStory(event, player, pet, previousChoice, memoryContext = '') {
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
  
  // 記憶上下文
  const memorySection = memoryContext ? `\n【玩家之前的足跡】\n${memoryContext}` : '';
  
  const prompt = `你是Renaiss星球的說書人，講故事要有畫面感、節奏感。

【當前場景】
位置：${location} - ${locDesc}
玩家：${safePlayerName}
寵物：${petName}(${petType})
陣營：${alignment}
${npcStatusText}
${memorySection}

【上一個行動】
${previousAction}

【任務】
請用中文講述玩家「${safePlayerName}」執行「${previousAction}」後發生了什麼，故事長度適中（150-300字）。要點：
1. 有具體的場景（光線、聲音、氣味、溫度、觸感）
2. 有NPC或環境的互動
3. 有Renaiss星球的科幻與奇幻元素
4. 故事要有懸念，讓人想繼續看
5. 全部用中文，不要摻雜英文！

直接開始講：`;

  try {
    const story = await callAI(prompt, 0.95);
    if (story && story.length > 50) {
      return story;
    }
  } catch (e) {
    console.error('[Storyteller] AI失敗:', e.message);
  }
  
  // 不使用模板！失敗就返回 null
  return null;
}

// ========== AI 生成選項（帶風險標籤+更具體）============
async function generateChoicesWithAI(player, pet, previousStory, memoryContext = '') {
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
  
  const memorySection = memoryContext ? `\n【玩家之前的足跡】\n${memoryContext}` : '';
  
  const prompt = `你是Renaiss星球的冒險策劃師，設計的選項要有創意、刺激！

【當前情境】
位置：${location} - ${locDesc}
玩家：${playerName}
寵物：${petName}
當地NPC：${npcStatusText || '沒有人'}
${memorySection}

【前面的故事】
${previousStory.substring(0, 400)}...

【任務】
根據上面的故事，生成7個獨特的冒險選項。要求：
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

用中文輸出7個選項，每行一個。例如：
[⚔️會戰鬥] 衝上去阻止：飛身撲向失控的飛行器
[🔥高風險] 追進暗巷：代價不明但可能有好處
[🤝需社交] 直接詢問：禮貌地向對方表明來意
[🔍需探索] 搜索周圍：檢查附近的線索
[🎁高回報] 接受交易：對方開出的條件很誘人
[💰需花錢] 購買物資：在商店補充必需品
[❓有驚喜] 嘗試呼喚：看寵物感應到了什麼`;

  try {
    const result = await callAI(prompt, 1.0);
    
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
      return choices.slice(0, 7);
    }
  } catch (e) {
    console.error('[AI] 生成選項失敗:', e.message);
  }
  
  // 不使用模板！失敗就返回空，讓調用方處理
  return null;
}

// ========== 初始選項生成（開場用）============
async function generateInitialChoices(player, pet) {
  const location = player.location || '襄陽城';
  const locDesc = RENAISS_LOCATIONS[location] || 'Renaiss星球的一座奇幻城市';
  const petName = pet?.name || '寵物';
  const playerName = player.name || '冒險者';
  const npcs = RENAISS_NPCS[location] || [];
  
  let npcStatusText = '';
  for (const npc of npcs) {
    npcStatusText += `${npc.name}、`;
  }
  
  const prompt = `你是Renaiss星球的冒險策劃師，設計的开場選項要有吸引力！

【開場情境】
位置：${location} - ${locDesc}
玩家：${playerName}
寵物：${petName}
當地NPC：${npcStatusText || '沒有重要NPC'}

【任務】
玩家剛來到${location}，請設計7個吸引人的冒險選項。要求：
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

用中文輸出7個選項，每行一個。例如：
[🔍需探索] 走進維修站：看看有沒有高科技道具
[🤝需社交] 參觀商店：和店主聊聊最近的傳聞
[⚔️會戰鬥] 參加比武：廣場有寵物對戰賽事
[🎁高回報] 打聽懸賞：找到能賺大錢的任務
[❓有驚喜] 找人問路：隨機找個路人攀談
[💰需花錢] 購買裝備：去裝備店武裝自己
[🔥高風險] 探索禁區：據說那裡有寶藏`;

  try {
    const result = await callAI(prompt, 1.0);
    
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
      return choices.slice(0, 7);
    }
  } catch (e) {
    console.error('[AI] 生成開場選項失敗:', e.message);
  }
  
  // 不使用模板！失敗就返回 null
  return null;
}

module.exports = {
  generateStory,
  generateChoicesWithAI,
  generateInitialChoices,
  RENAISS_NPCS,
  RENAISS_LOCATIONS
};
