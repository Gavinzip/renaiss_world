/**
 * AI 故事生成測試腳本
 * 模擬：按第一個選項 → 檢查是否產生新故事
 */

const path = require('path');
const fs = require('fs');

// 載入 .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const STORY = require('./storyteller.js');
const EVENTS = require('./event-system.js');
const CORE = require('./game-core.js');

// 測試用玩家資料
const TEST_USER_ID = 'test_user_' + Date.now();

async function runTest() {
  console.log('=== AI 故事生成測試 ===\n');
  console.log('流程：按第一個選項 → 檢查是否產生新故事\n');

  // 創建測試玩家
  const player = CORE.createPlayer(TEST_USER_ID, '測試玩家', '男', '無門無派');
  player.alignment = '正派';
  player.location = '襄陽城';
  CORE.savePlayer(player);
  console.log('✅ 測試玩家創建成功');

  // 創建測試寵物
  const PET = require('./pet-system.js');
  const egg = PET.createPetEgg(TEST_USER_ID, '正派');
  egg.hatched = true;
  egg.name = '測試寵物';
  PET.savePet(egg);
  console.log('✅ 測試寵物創建成功\n');

  const pet = PET.loadPet(TEST_USER_ID);
  const choices = EVENTS.generateEventChoices(player, {});
  player.eventChoices = choices;
  CORE.savePlayer(player);

  console.log('--- 測試 1: 初始故事生成 ---');
  const story1 = await STORY.generateStory(null, player, pet, null);
  if (!story1) {
    throw new Error('初始故事生成失敗（空內容）');
  }
  console.log('故事1:', story1.substring(0, 100) + '...');
  console.log('長度:', story1.length, '字\n');

  console.log('--- 測試 2: 選擇第一個選項後的故事 ---');
  const selectedChoice = choices[0].choice || choices[0].name;
  console.log('選擇:', selectedChoice);
  
  // 執行事件（模擬選擇）
  const result = EVENTS.executeEvent(choices[0], player);
  player.stats.飽腹度 = Math.max(0, (player.stats.飽腹度 || 100) - 5);
  CORE.savePlayer(player);

  const story2 = await STORY.generateStory(choices[0], player, pet, selectedChoice);
  if (!story2) {
    throw new Error('第二段故事生成失敗（空內容）');
  }
  console.log('故事2:', story2.substring(0, 100) + '...');
  console.log('長度:', story2.length, '字\n');

  console.log('--- 測試 3: 比較 ---');
  if (story1 === story2) {
    console.log('❌ 失敗：故事1 和故事2 完全相同！');
  } else {
    console.log('✅ 成功：故事有變化！');
  }

  // 測試生成選項
  console.log('\n--- 測試 4: AI 生成選項 ---');
  const newChoices = await STORY.generateChoicesWithAI(player, pet, story2, '');
  if (newChoices && newChoices.length > 0) {
    console.log('✅ 成功：生成', newChoices.length, '個選項');
    newChoices.slice(0, 3).forEach((c, i) => {
      console.log(`  ${i+1}. ${c.name} ${c.tag || ''}`);
    });
  } else {
    console.log('❌ 失敗：沒有生成選項');
  }

  // 清理
  fs.unlinkSync(path.join(__dirname, 'data/players', TEST_USER_ID + '.json'));
  const petFile = path.join(__dirname, 'data/pets.json');
  if (fs.existsSync(petFile)) {
    const pets = JSON.parse(fs.readFileSync(petFile, 'utf-8'));
    delete pets['pet_' + TEST_USER_ID + '_' + egg.createdAt];
    fs.writeFileSync(petFile, JSON.stringify(pets, null, 2));
  }

  console.log('\n=== 測試完成 ===');
}

runTest().catch(err => {
  console.error('❌ 測試失敗:', err.message);
  console.error(err.stack);
  process.exit(1);
});
