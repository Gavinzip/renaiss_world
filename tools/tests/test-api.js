const https = require('https');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const API_KEY = process.env.MINIMAX_API_KEY || '';

// 測試 generateStory 的 prompt
const prompt = '你是Renaiss星球的說書人，講故事要有畫面感。\n\n【當前場景】\n位置：襄陽城\n玩家：測試玩家\n寵物：小白(正派)\n\n【上一個行動】\n開始探索\n\n【任務】\n請用中文講述玩家執行「開始探索」後發生了什麼，100字以內。\n直接開始講：';

const body = JSON.stringify({
  model: 'MiniMax-M2.7',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.95,
  max_tokens: 500
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

console.log('Testing MiniMax-M2.7...\n');

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) {
        let content = parsed.choices[0].message.content.trim();
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
        content = content.replace(/<[^>]+>/g, '');
        console.log('✅ 成功!');
        console.log('長度:', content.length);
        console.log('內容:', content.substring(0, 200));
      } else if (parsed.error) {
        console.log('❌ API Error:', JSON.stringify(parsed.error));
      } else {
        console.log('❌ 無效回應:', data.substring(0, 300));
      }
    } catch (e) {
      console.log('❌ Parse error:', e.message);
      console.log('Raw:', data.substring(0, 300));
    }
  });
});
req.on('error', e => console.log('❌ Network error:', e.message));
req.write(body);
req.end();