/**
 * 📖 AI 故事生成器 v4 - Renaiss 世界觀
 * 全新設計，沒有武俠元素
 */

const fs = require('fs');
const path = require('path');

// 讀取 .env 檔案
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

// ========== RENAISS 世界觀 NPC ==========
const RENAISS_NPCS = {
  // ===== 中原地區 =====
  '襄陽城': [
    { name: '林工程師', title: '機械師', level: 15, pet: '齒輪獸', petType: '機甲', align: '正派', desc: '發明家，專門製作機械助手' },
    { name: '蘇醫生', title: '細胞治療師', level: 20, pet: '治愈水母', petType: '水系', align: '正派', desc: '懸壺濟世，救人無數' },
    { name: '黑影商人', title: '情報贩子', level: 8, pet: '隱幽鼠', petType: '暗系', align: '中立', desc: '什麼都賣，什麼都買' }
  ],
  '大都': [
    { name: '皇太子', title: '未來統治者', level: 25, pet: '金焰獅', petType: '火系', align: '正派', desc: '權力核心，但心懷天下' },
    { name: '將軍王', title: '邊境守將', level: 30, pet: '戰甲熊', petType: '土系', align: '正派', desc: '戎馬一生，功勳卓著' },
    { name: '間諜Q', title: '情報頭子', level: 22, pet: '數據鴿', petType: '電系', align: '中立', desc: '為錢辦事，職業素養極高' }
  ],
  '洛陽城': [
    { name: '牡丹夫人', title: '牡丹山莊莊主', level: 28, pet: '花仙蝶', petType: '草系', align: '正派', desc: '洛陽城實際掌控者' },
    { name: '說書人老張', title: '江湖百曉生', level: 5, pet: '聆聽蛙', petType: '普通', align: '中立', desc: '什麼都知道，什麼都說' },
    { name: '賞金獵人雷', title: '賞金聯盟成員', level: 18, pet: '追蹤狐', petType: '火系', align: '中立', desc: '以獵殺通緝犯為生' }
  ],
  // ===== 西域地區 =====
  '敦煌': [
    { name: '絲路商人阿布', title: '駝隊首領', level: 12, pet: '沙蟲駱駝', petType: '土系', align: '中立', desc: '絲路最大商隊首領' },
    { name: '敦煌守護者', title: '莫高窟長老', level: 35, pet: '壁畫精靈', petType: '電系', align: '正派', desc: '據說已活了三百年' },
    { name: '沙盜首領', title: '沙漠之王', level: 24, pet: '蠍尾獅', petType: '毒系', align: '反派', desc: '沙漠中最危險的存在' }
  ],
  '喀什爾': [
    { name: '巴扎老闆', title: '最大巴扎主', level: 10, pet: '寶石蜥', petType: '火系', align: '中立', desc: '沒有他買不到的東西' },
    { name: '沙漠行者', title: '探險家', level: 14, pet: '仙人掌貓', petType: '草系', align: '中立', desc: '足迹遍佈西域' }
  ],
  // ===== 海外島嶼 =====
  '桃花島': [
    { name: '島主東邪', title: '神秘島主', level: 40, pet: '混沌鳳', petType: '複合', align: '中立', desc: '脾氣古怪的傳說人物' },
    { name: '桃花弟子', title: '島嶼守衛', level: 16, pet: '機關蜂', petType: '電系', align: '正派', desc: '守護桃花島的自動化兵團' },
    { name: '迷霧幽靈', title: '島嶼幻象', level: 20, pet: '霧影豹', petType: '暗系', align: '反派', desc: '徘徊在島嶼邊緣的詭異存在' }
  ],
  '俠客島': [
    { name: '龍木島主', title: '武學宗師', level: 50, pet: '雷獸', petType: '電系', align: '正派', desc: '傳說中武功蓋世' },
    { name: '木島主', title: '島嶼建造者', level: 45, pet: '木靈龜', petType: '木系', align: '正派', desc: '擅長機關機甲' },
    { name: '試煉者', title: '挑戰者', level: 30, pet: '各不相同', petType: '多變', align: '中立', desc: '前來挑戰俠客島的各路高手' }
  ],
  // ===== 北疆地區 =====
  '雪白山莊': [
    { name: '冰雪女王', title: '雪山派掌門', level: 38, pet: '冰晶鳳', petType: '水系', align: '正派', desc: '一生只愛冰雪' },
    { name: '獵人老陳', title: '資深雪地獵人', level: 15, pet: '雪狼王', petType: '冰系', align: '中立', desc: '在雪山生活了五十年' },
    { name: '冰盜首領', title: '冰雪盜賊團首領', level: 22, pet: '冰甲熊', petType: '冰系', align: '反派', desc: '專門盜取珍貴冰晶' }
  ],
  '草原部落': [
    { name: '族長之子', title: '草原未來領袖', level: 20, pet: '赤兔馬', petType: '火系', align: '正派', desc: '英俊瀟灑，武藝高強' },
    { name: '流浪詩人', title: '草原吟遊者', level: 8, pet: '旋律鳥', petType: '風系', align: '中立', desc: '走遍天下的吟遊詩人' },
    { name: '馬賊王', title: '草原匪首', level: 26, pet: '烈焰馬', petType: '火系', align: '反派', desc: '草原上令人聞風喪膽' }
  ],
  // ===== 隱秘地區 =====
  '光明頂': [
    { name: '教主明皇', title: '明教教主', level: 42, pet: '聖火鳳凰', petType: '火系', align: '正派', desc: '光明的守護者' },
    { name: '火焰使者', title: '五行旗首領', level: 28, pet: '烈焰虎', petType: '火系', align: '正派', desc: '擅長火焰攻擊' },
    { name: '叛教者', title: '黑暗叛徒', level: 30, pet: '深淵犬', petType: '暗系', align: '反派', desc: '逃離明教的叛徒' }
  ],
  '黑木崖': [
    { name: '總管太監', title: '日月光基地下首領', level: 35, pet: '幽冥貓', petType: '暗系', align: '反派', desc: '權傾朝野的陰謀家' },
    { name: '暗影殺手', title: '日月神教刺客', level: 25, pet: '影蝠', petType: '暗系', align: '反派', desc: '無聲無息的死亡使者' },
    { name: '雙面間諜', title: '多重身份', level: 18, pet: '變色龍', petType: '暗系', align: '中立', desc: '沒人知道他的真實立場' }
  ]
};

// ========== RENAISS 世界觀地點詳情 ==========
const RENAISS_LOCATIONS = {
  '襄陽城': 'Renaiss星球中部最大城市，機械與生物科技結合的前哨城市。街道上飛行器穿梭，巨型LED廣告牌閃爍，霓虹燈與古建築交織成奇特的景觀。人口百萬，是星球上最繁華的交易港。',
  '大都': 'Renaiss星球的政治中心，皇城氣勢恢宏。能量護盾保護著宮殿免受外敵侵擾，宮殿屋頂裝備了反重力裝置。禁軍穿著外骨骼裝甲在城門站崗，威嚴肅穆。',
  '洛陽城': '文化與藝術之城，到處是全息投影的藝術裝置。牡丹花卉用基因改造技術培育，四季常開。拍賣行裡經常有來自各星系的珍稀物品出現。',
  '敦煌': '絲路重鎮基因飛船場與古老壁畫洞窟相鄰。沙漠中建立起巨大的圓頂綠洲城市，商人們在基因改造駱駝商隊中交易著各種奇珍。',
  '喀什爾': '沙漠綠洲上的自由貿易港，各種文明在此交匯。巨大的水循環系統支撐著城市運作，巴扎市場是整個星球最大最便宜的集市。',
  '廣州': '南海最大港口城市，蒸汽朋克風格的飛艇碼頭。基因改造海產聞名星系，十三行商會控制著大部分海上貿易。',
  '大理': '四季如春的山地城市，基因改造花卉遍布全城。白族文化與科技完美融合，空氣清新，被稱為最適合居住的城市。',
  '桃花島': '被迷霧包圍的神秘島嶼，島上機關重重。先進的力場護盾保護著島嶼，據說島主掌握著某種遠古力量。',
  '俠客島': '懸浮在雲端的傳說島嶼，只有被邀請的人才能找到入口。島上刻著頂尖科技與武學秘籍，是所有研究者嚮往的聖地。',
  '雪白山莊': '建在雪山山脈中的龐大堡壘，冰川能源為城市提供動力。居民體內植入耐寒基因，穿著納米材料製成的保溫服。',
  '草原部落': '無垠草原上的遊牧城市，巨型蒙古包是可移動的生態系統。基因改造牧馬是主要交通工具，烤肉香氣飄散在清新空氣中。',
  '光明頂': '高原上的巨型能量塔，明教總舵所在地。聖火廣場是教徒聚集之地，五行旗弟子守護著這座象徵光明的堡壘。',
  '黑木崖': '黑暗深淵中的巨型浮空城市，日月神教根據地。據說主宰著星球的地下勢力，城市由暗能量反重力系統支撐。'
};

const https = require('https');

// 生成故事（主函數）
async function generateStory(event, player, pet, choiceMade) {
  const location = player.location || '襄陽城';
  const playerName = player.name || '俠客';
  const petName = pet?.name || '寵物';
  const petType = pet?.type || '正派';
  const alignment = player.alignment || '正派';
  
  // 取得地點詳情
  const locationDetail = RENAISS_LOCATIONS[location] || 'Renaiss星球上的一座城市';
  
  // 取得該地點的NPC
  const npcs = RENAISS_NPCS[location] || [];
  const npcNames = npcs.map(n => n.name + '(' + n.title + ')').join('、') || '當地居民';
  
  let storyType = '開場';
  let context = '';
  
  if (choiceMade) {
    const choiceText = choiceMade.choice || choiceMade.name || '某種行動';
    context = '玩家選擇了：' + choiceText;
    storyType = '行動結果';
  }
  
  // 構建 AI Prompt
  const userPrompt = '用Renaiss星球說書人的口吻，根據以下資料生成一段100字以上的獨特故事：資料-俠客' + playerName + '-寵物' + petName + '(' + petType + ')-位置' + location + '-' + locationDetail + '-附近NPC' + npcNames + '-玩家陣營' + alignment + '-類型' + storyType + '-背景' + context + '。要求：100字以上、具體場景（光線聲音氣味溫度觸感）、NPC互動細節、每句要有Renaiss星球的科幻與奇幻元素、不要用突然開頭、每次故事必須不同！';
  
  try {
    const story = await callAI(userPrompt, 0.9);
    if (story && story.length > 50) {
      return story;
    }
  } catch (e) {
    console.error('[Storyteller] AI失敗:', e.message);
  }
  
  return generateFallback(location, petName, npcs, choiceMade);
}

// Fallback 故事（全新設計）
function generateFallback(location, petName, npcs, choiceMade) {
  const locDetail = RENAISS_LOCATIONS[location] || 'Renaiss星球上的一座城市';
  const choiceText = choiceMade?.choice || '';
  
  // 根據不同行動生成不同故事
  if (choiceText.includes('跟蹤') || choiceText.includes('悄悄')) {
    const templates = [
      locDetail + '你放慢腳步，讓' + petName + '在前方探路。霓虹燈的光芒在潮濕的地面上投下五彩斑斕的倒影，空氣中帶有臭氧和烤肉的混合氣息。' + petName + '的感知器輕微閃爍，似乎捕捉到了什麼異常的能量波動。前方幾個鬼祟的身影拐進了暗巷，你悄無聲息地跟上...',
      '光影交錯的街道上，你壓低身形躲在巨型全息廣告牌的陰影裡。' + petName + '的視覺系統切換到夜視模式，耳朵豎得高高的。你注意到其中一人腰間閃爍著某種加密通訊器的藍光。他們拐進了一條狹窄的後巷，你悄悄跟在後面...'
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  
  if (choiceText.includes('打招呼') || choiceText.includes('詢問') || choiceText.includes('友善')) {
    if (npcs.length > 0) {
      const npc = npcs[Math.floor(Math.random() * npcs.length)];
      return locDetail + '你在街角遇到了' + npc.name + '，' + npc.desc + '。對方穿著帶有微微發光能量紋路的服裝，見你走近便禮貌地點了點頭。' + petName + '好奇地繞著對方的寵物打轉，對方的' + npc.pet + '發出了友善的叫聲。「這位旅人，」' + npc.name + '開口道，「有什麼我能幫你的嗎？」';
    }
    return locDetail + '你找了個路人詢問當地的情況。這位穿著前衛的路人停下腳步，興致勃勃地跟你講起了這座城市的故事。' + petName + '在一旁聽得津津有味，不時發出理解的叫聲。';
  }
  
  if (choiceText.includes('探索') || choiceText.includes('遠離') || choiceText.includes('角落')) {
    const templates = [
      locDetail + '你帶著' + petName + '拐進了一條偏僻的小巷，這裡與繁華的主街截然不同。牆上覆蓋著創意十足的街頭藝術，全息塗鴉在暗處閃爍。空氣中有股潮濕的金屬氣息，混合著發電廠特有的臭氧味。' + petName + '突然停下，鼻子使勁嗅著空氣，似乎發現了什麼不尋常的東西...',
      locDetail + '你決定偏離主道，去探索那些不為人知的角落。穿過幾條曲折的地下通道，你來到了一片廢棄的工廠區。巨大的齒輪和杠桿靜靜地躺在地上，被藤蔓和發光苔蘚覆蓋。' + petName + '警惕地觀察著四周，感應器在黑暗中閃爍著微光...'
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  
  if (choiceText.includes('酒樓') || choiceText.includes('傳聞') || choiceText.includes('集市')) {
    const templates = [
      locDetail + '你走進了當地最大的交易所大廳，巨大的穹頂上投射著星圖，各星系的代表正在洽談生意。' + petName + '對大廳中央的噴泉很感興趣，噴泉的水是用淨化過的奈米液體，能在水中看到微縮的星系運轉。你找了個位置坐下，豎起耳朵聆聽著周圍的談話...',
      locDetail + '夜市的霓虹燈閃爍著五彩光芒，各種基因改造小吃的香氣飄散在空氣中。你找了個路邊攤位坐下，點了一份當地特產。' + petName + '在桌下等待，不時抬頭看向天上來往的飛行器。隔壁桌的幾個冒險家正在壓低聲音討論什麼，似乎提到了最近在附近出現的傳說中的WM...'
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  
  if (choiceText.includes('幫助') || choiceText.includes('主動')) {
    if (npcs.length > 0) {
      const npc = npcs[Math.floor(Math.random() * npcs.length)];
      return locDetail + '路邊遇到了' + npc.name + '，' + npc.desc + '。對方正一籌莫展地看著手中的損壞裝置，見你走近便露出了求助的眼神。「這位好心人，」' + npc.name + '說道，「我的翻譯器壞了，沒辦法跟外星商人溝通...」' + petName + '搖著尾巴，似乎也想要幫忙。';
    }
    return locDetail + '廣場的一角傳來了求助聲。你走近一看，是個穿著破舊奈米防護服的流浪者，似乎是遇到了什麼困難。' + petName + '發出同情的叫聲，湊上前去聞了聞。';
  }
  
  if (choiceText.includes('寵物') || choiceText.includes('嗅到')) {
    const templates = [
      locDetail + '你低下頭，看著' + petName + '異常專注的樣子，它的感知器使勁掃描著周圍的環境。「怎麼了？」你輕聲問道。' + petName + '回頭看了你一眼，然後徑直向一條小巷走去，步伐輕盈而堅定。你跟隨在後，空氣中漸漸飄來一股奇異的能量波動...',
      locDetail + '你蹲下身摸了摸' + petName + '的頭：「嗅到了什麼？」寵物的耳朵轉動了幾下，然後朝西邊的方向叫了兩聲。遠處的屋簷上有幾道黑影一閃而過，速度快得不像是普通的飛行器。' + petName + '變得躁動不安，似乎感應到了危險的氣息...'
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  
  // 預設開場
  const defaults = [
    locDetail + '清晨的能量霧氣繚繞在街道上，你帶著' + petName + '漫步在合金與玻璃構成的城市叢林中。巨型機械臂在遠處作業，噴出白色的蒸汽。全息廣告牌投射著各种廣告，光影變幻莫測。' + petName + '對路邊的能量補充站很感興趣，湊上去聞了聞。Renaiss星球的早晨，處處充滿了生機與未知...',
    locDetail + '夜幕降臨，霓虹燈開始閃耀。你帶著' + petName + '站在一座天橋上，俯瞰著下方川流不息的飛行器車隊。空氣中帶有臭氧和食物的混合香氣，從基因改造餐廳飄出。' + petName + '的夜視模式開啟，在黑暗中搜尋感興趣的目標。在這Renaiss星球上，每天都有新的故事在發生...',
    locDetail + '你站在Renaiss星球的街道上，能量防護罩在頭頂微微閃爍，過濾著輕微的太空輻射。' + petName + '乖巧地蹲在你腳邊，不時抬頭看著穿梭而過的飛行器。作為俠客的你，在這個科技與奇幻交融的世界裡，正在寫下屬於自己的故事...'
  ];
  
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// 調用 MiniMax AI
function callAI(userPrompt, temperature) {
  return new Promise((resolve, reject) => {
    const systemPrompt = '你是Renaiss星球的說書人，用生動的語言描述科幻與奇幻交融的世界。文字要有畫面感、節奏感，每段100字以上，每次輸出必須不同，禁止重複！';
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    
    const data = JSON.stringify({
      model: 'MiniMax-M2.5',
      messages: messages,
      max_tokens: 800,
      temperature: temperature || 0.9
    });
    
    const options = {
      hostname: 'api.minimax.io',
      path: '/anthropic/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
            return;
          }
          const text = parsed.content?.[0]?.text || '';
          resolve(text.trim());
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// AI 生成事件選項
async function generateEventChoicesWithAI(player, pet) {
  const location = player.location || '襄陽城';
  const locData = RENAISS_LOCATIONS[location] || RENAISS_LOCATIONS['襄陽城'];
  const petName = pet?.name || '寵物';
  const playerName = player.name || '俠客';
  
  const prompt = `你是Renaiss星球的冒險策劃者。

玩家：${playerName}
寵物：${petName}
陣營：${player.alignment || '正派'}
位置：${location}（${locData.desc}）

請生成7個獨特的冒險選項，每個選項要：
1. 符合當前地點和情境
2. 有創意，不是模板
3. 格式：「事件名稱：簡短描述」

用中文輸出，7個選項用換行分隔。

例如：
探索未知巷道：聽說這裡藏著一台廢棄的維修機械體
拜訪工程師：請求林工程師幫忙升級${petName}的晶片
接受賞金任務：在懸賞板找一個合適的目標
來一場美食冒險：聽說附近有家不錯的能量餐廳
調查神秘信號：你的通訊器收到了奇怪的加密頻率
挑戰競技場：聽說今晚有寵物對戰比賽
尋找傳說中的WM：傳聞他總在隨機地點出現`;

  try {
    const result = await callAI(prompt, 1.0); // 高溫度產生創意結果
    
    // 解析結果
    const choices = result.split('\n')
      .filter(line => line.trim())
      .slice(0, 7)
      .map((line, index) => {
        // 嘗試解析「名稱：描述」格式
        const parts = line.split('：');
        if (parts.length >= 2) {
          return {
            name: parts[0].replace(/^\d+\.?\s*/, '').trim(),
            choice: parts.slice(1).join('：').trim()
          };
        }
        return {
          name: line.replace(/^\d+\.?\s*/, '').trim(),
          choice: line.replace(/^\d+\.?\s*/, '').trim()
        };
      });
    
    // 如果解析失敗，使用預設
    if (choices.length < 7) {
      const defaults = [
        { name: '探索街道', choice: '在${location}的街道上隨意漫步，看看有什麼新鮮事' },
        { name: '與寵物互動', choice: '和${petName}交流感情，增進默契' },
        { name: '尋找工作', choice: '打聽哪裡有適合的工作機會' },
        { name: '購買物資', choice: '去商店補充一些必備物資' },
        { name: '打聽消息', choice: '向當地人打聽最近發生的事情' },
        { name: '隨機突發事件', choice: '感覺會有什麼有趣的事情發生...' },
        { name: '休息恢復', choice: '找個地方休息一下，恢復體力' }
      ];
      return defaults;
    }
    
    return choices;
  } catch (e) {
    console.error('[AI] 生成事件選項失敗:', e.message);
    // 失敗時返回空陣列，讓系統用預設
    return [];
  }
}

// AI 根據故事生成新選項
async function generateChoicesWithAI(player, pet, previousStory) {
  const location = player.location || '襄陽城';
  const locData = RENAISS_LOCATIONS[location] || RENAISS_LOCATIONS['襄陽城'];
  const petName = pet?.name || '寵物';
  const playerName = player.name || '俠客';
  
  const prompt = `你是Renaiss星球的冒險策劃者。

玩家：${playerName}
寵物：${petName}
陣營：${player.alignment || '正派'}
位置：${location}（${locData.desc}）

之前的劇情：
${previousStory}

請根據上面的劇情，生成7個符合劇情發展的冒險選項。每個選項要：
1. 延續上面的故事，不是隨機的
2. 符合當前情境和玩家的選擇
3. 格式：「事件名稱：簡短描述」

用中文輸出，7個選項用換行分隔。

例如：
探索新區域：跟隨蹤跡繼續前進
挑戰強敵：追擊敵人決一死戰
結交盟友：尋求幫助或合作
資源收集：搜索附近的物資
休息恢復：找個安全的地方歇腳
命運抉擇：麵前出現了分岔路口
神秘預感：感覺有什麼在召喚你`;

  try {
    const result = await callAI(prompt, 1.0); // 高溫度產生創意結果
    
    // 解析結果
    const choices = result.split('\n')
      .filter(line => line.trim() && line.trim() !== 'true' && line.trim() !== 'false')
      .slice(0, 7)
      .map((line, index) => {
        // 嘗試解析「名稱：描述」格式
        const parts = line.split('：');
        if (parts.length >= 2) {
          return {
            name: parts[0].replace(/^\d+\.?\s*/, '').trim(),
            choice: parts.slice(1).join('：').trim(),
            desc: parts.slice(1).join('：').trim()
          };
        }
        return {
          name: line.replace(/^\d+\.?\s*/, '').trim(),
          choice: line.replace(/^\d+\.?\s*/, '').trim(),
          desc: line.replace(/^\d+\.?\s*/, '').trim()
        };
      });
    
    if (choices.length >= 7) {
      return choices;
    }
    
    // 解析失敗返回空
    return [];
  } catch (e) {
    console.error('[AI] 生成新選項失敗:', e.message);
    return [];
  }
}

module.exports = {
  generateStory,
  generateEventChoicesWithAI,
  generateChoicesWithAI,
  RENAISS_NPCS,
  RENAISS_LOCATIONS
};
