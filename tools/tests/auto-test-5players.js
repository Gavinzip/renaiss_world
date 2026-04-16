/**
 * 🚀 Renaiss World - 5玩家 x 20輪 自動化測試
 * 
 * 測試流程：
 * 1. 創建5個測試玩家（不同名稱和陣營）
 * 2. 為每個玩家創建寵物
 * 3. 模擬20輪遊戲互動
 * 4. 記錄所有錯誤和異常
 */

const path = require('path');
const fs = require('fs');
const { loadEnvFromCandidates } = require('../../modules/core/load-env');

loadEnvFromCandidates([
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '..', '.env')
]);

const CORE = require('../../modules/core/game-core');
const PET = require('../../modules/systems/pet/pet-system');
const EVENTS = require('../../modules/content/event-system');
const STORY = require('../../modules/content/storyteller');
const BATTLE = require('../../modules/systems/battle/battle-system');
const ECON = require('../../modules/systems/market/economy-system');

const TEST_CONFIG = {
  playerCount: 5,
  rounds: 20,
  playerNames: ['測試探索者小明', '測試暗域阿龍', '測試前鋒小風', '測試毒蝕紅袖', '測試新手小李'],
  factions: ['正派', '機變派', '正派', '機變派', '正派']
};
const WORLD_DATA_ROOT = process.env.WORLD_DATA_ROOT || path.join(__dirname, 'data');
const PLAYERS_DIR = path.join(WORLD_DATA_ROOT, 'players');
let warnedBattleApiUnavailable = false;

const testResults = {
  bugs: [],
  errors: [],
  warnings: [],
  stats: {
    totalActions: 0,
    successfulActions: 0,
    failedActions: 0,
    battlesWon: 0,
    battlesLost: 0,
    storyGenerated: 0,
    storyFailed: 0
  },
  playerSummaries: []
};

function log(message, type = 'info') {
  const prefix = {
    'info': '📌',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'bug': '🐛'
  }[type] || '📌';
  console.log(`${prefix} ${message}`);
}

function recordBug(description, context = {}) {
  const bug = {
    timestamp: new Date().toISOString(),
    description,
    context
  };
  testResults.bugs.push(bug);
  log(`BUG: ${description}`, 'bug');
}

function recordError(description, error, context = {}) {
  const err = {
    timestamp: new Date().toISOString(),
    description,
    error: error?.message || String(error),
    stack: error?.stack || '',
    context
  };
  testResults.errors.push(err);
  log(`ERROR: ${description}: ${error?.message || error}`, 'error');
}

function recordWarning(description, context = {}) {
  testResults.warnings.push({ timestamp: new Date().toISOString(), description, context });
  log(`WARNING: ${description}`, 'warning');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTestPlayer(index) {
  const userId = `test_player_${index}_${Date.now()}`;
  const name = TEST_CONFIG.playerNames[index];
  const faction = TEST_CONFIG.factions[index];
  
  try {
    const player = CORE.createPlayer(userId, name, '男', '無門無派');
    player.alignment = faction;
    CORE.savePlayer(player);
    log(`創建玩家 ${name} (${faction})`, 'success');
    
    const egg = PET.createPetEgg(userId, faction);
    const hatchedPet = PET.hatchEgg(egg);
    hatchedPet.name = `${name}的寵物`;
    PET.savePet(hatchedPet);
    log(`為 ${name} 孵化寵物: ${hatchedPet.name}`, 'success');
    
    return { userId, player, pet: hatchedPet };
  } catch (error) {
    recordError(`創建玩家 ${name} 失敗`, error);
    return null;
  }
}

async function simulateGameRound(playerData, roundNum) {
  const { userId, player, pet } = playerData;
  testResults.stats.totalActions++;
  
  try {
    const refreshedPlayer = CORE.loadPlayer(userId);
    const refreshedPet = PET.loadPet(userId);
    
    if (!refreshedPlayer || !refreshedPet) {
      recordBug(`玩家或寵物資料缺失: ${userId}`, { round: roundNum });
      return false;
    }
    
    if (!refreshedPet.hatched) {
      const hatchedPet = PET.hatchEgg(refreshedPet);
      PET.savePet(hatchedPet);
    }
    
    const choices = EVENTS.generateEventChoices(refreshedPlayer, {});
    if (!choices || choices.length === 0) {
      recordWarning(`玩家 ${refreshedPlayer.name} 沒有生成任何選項`, { round: roundNum });
      choices = [{ name: '四處探索', type: 'explore', tag: '探索' }];
    }
    
    refreshedPlayer.eventChoices = choices;
    
    const randomChoice = choices[Math.floor(Math.random() * choices.length)];
    
    const result = EVENTS.executeEvent(randomChoice, refreshedPlayer);
    
    refreshedPlayer.stats.飽腹度 = Math.max(0, (refreshedPlayer.stats.飽腹度 || 100) - 5);
    refreshedPlayer.stats.財富 = Math.max(0, (refreshedPlayer.stats.財富 || 50) + Math.floor(Math.random() * 20));
    
    refreshedPlayer.storyTurns++;
    
    CORE.appendPlayerMemory(refreshedPlayer, {
      type: 'action',
      content: `第${roundNum}輪：${randomChoice.name}`,
      outcome: result?.message || '執行成功',
      location: refreshedPlayer.location
    });
    
    CORE.savePlayer(refreshedPlayer);
    
    if (Math.random() < 0.3) {
      try {
        const story = await STORY.generateStory(
          randomChoice,
          refreshedPlayer,
          refreshedPet,
          randomChoice.name
        );
        if (story && story.length > 0) {
          testResults.stats.storyGenerated++;
        }
      } catch (storyError) {
        testResults.stats.storyFailed++;
      }
    }
    
    if (Math.random() < 0.25) {
      if (typeof BATTLE.simulateBattle !== 'function') {
        if (!warnedBattleApiUnavailable) {
          recordWarning('戰鬥模擬略過：BATTLE.simulateBattle API 不存在（測試腳本介面需更新）');
          warnedBattleApiUnavailable = true;
        }
        testResults.stats.successfulActions++;
        return true;
      }
      const enemyType = ['哥布林', '狼人', '巫師學徒'][Math.floor(Math.random() * 3)];
      try {
        const enemy = BATTLE.createEnemy(enemyType, refreshedPlayer.level || 1);
        const battleResult = BATTLE.simulateBattle(refreshedPet, enemy);
        
        if (battleResult.victory) {
          testResults.stats.battlesWon++;
        } else {
          testResults.stats.battlesLost++;
        }
        
        if (enemy.reward) {
          const goldReward = Math.floor(Math.random() * (enemy.reward.gold[1] - enemy.reward.gold[0])) + enemy.reward.gold[0];
          refreshedPlayer.stats.財富 = (refreshedPlayer.stats.財富 || 0) + goldReward;
        }
        
        CORE.savePlayer(refreshedPlayer);
      } catch (battleError) {
        recordWarning(`戰鬥模擬出錯: ${battleError.message}`, { player: refreshedPlayer.name, round: roundNum });
      }
    }
    
    testResults.stats.successfulActions++;
    return true;
    
  } catch (error) {
    testResults.stats.failedActions++;
    recordError(`執行回合 ${roundNum} 失敗`, error, { player: player.name });
    return false;
  }
}

async function runFullTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Renaiss World - 5玩家 x 20輪 自動化測試');
  console.log('='.repeat(60) + '\n');
  
  log(`初始化世界狀態...`);
  try {
    CORE.loadWorld();
  } catch (e) {
    log(`世界初始化: ${e.message}`, 'warning');
  }
  
  const players = [];
  
  log(`\n📝 階段1: 創建 ${TEST_CONFIG.playerCount} 個測試玩家\n`);
  for (let i = 0; i < TEST_CONFIG.playerCount; i++) {
    const playerData = await createTestPlayer(i);
    if (playerData) {
      players.push(playerData);
    }
    await sleep(100);
  }
  
  if (players.length === 0) {
    log('沒有成功創建任何玩家，測試終止', 'error');
    return testResults;
  }
  
  log(`\n\n🎮 階段2: 執行 ${TEST_CONFIG.rounds} 輪遊戲測試\n`);
  
  for (let round = 1; round <= TEST_CONFIG.rounds; round++) {
    console.log(`\n--- 第 ${round}/${TEST_CONFIG.rounds} 輪 ---`);
    
    for (const playerData of players) {
      await simulateGameRound(playerData, round);
      await sleep(50);
    }
    
    if (round % 5 === 0) {
      log(`已完成 ${round} 輪，累計動作: ${testResults.stats.totalActions}`);
    }
  }
  
  log(`\n\n📊 階段3: 收集測試結果\n`);
  
  for (const playerData of players) {
    const player = CORE.loadPlayer(playerData.userId);
    const pet = PET.loadPet(playerData.userId);
    
    testResults.playerSummaries.push({
      name: player?.name || 'Unknown',
      level: player?.level || 1,
      location: player?.location || 'Unknown',
      wealth: player?.stats?.財富 || 0,
      hunger: player?.stats?.飽腹度 || 0,
      petName: pet?.name || 'Unknown',
      petHp: pet?.hp || 0,
      petLevel: pet?.level || 1,
      storyTurns: player?.storyTurns || 0,
      memories: (player?.memories || []).length
    });
  }
  
  printTestReport();
  
  await cleanup();
  
  return testResults;
}

function printTestReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試報告');
  console.log('='.repeat(60));
  
  console.log('\n【統計數據】');
  console.log(`  總動作數: ${testResults.stats.totalActions}`);
  console.log(`  成功動作: ${testResults.stats.successfulActions}`);
  console.log(`  失敗動作: ${testResults.stats.failedActions}`);
  console.log(`  戰鬥勝利: ${testResults.stats.battlesWon}`);
  console.log(`  戰鬥失敗: ${testResults.stats.battlesLost}`);
  console.log(`  故事生成成功: ${testResults.stats.storyGenerated}`);
  console.log(`  故事生成失敗: ${testResults.stats.storyFailed}`);
  
  console.log('\n【玩家總結】');
  for (const summary of testResults.playerSummaries) {
    console.log(`\n  👤 ${summary.name}`);
    console.log(`     等級: ${summary.level} | 位置: ${summary.location}`);
    console.log(`     財富: ${summary.wealth} | 飽腹度: ${summary.hunger}%`);
    console.log(`     寵物: ${summary.petName} (HP: ${summary.petHp}, 等級: ${summary.petLevel})`);
    console.log(`     故事回合: ${summary.storyTurns} | 記憶數: ${summary.memories}`);
  }
  
  console.log('\n【發現的 Bug】');
  if (testResults.bugs.length === 0) {
    console.log('  ✅ 沒有發現 Bug');
  } else {
    for (const bug of testResults.bugs) {
      console.log(`\n  🐛 ${bug.description}`);
      console.log(`     時間: ${bug.timestamp}`);
      if (bug.context) {
        console.log(`     上下文: ${JSON.stringify(bug.context)}`);
      }
    }
  }
  
  console.log('\n【發生的錯誤】');
  if (testResults.errors.length === 0) {
    console.log('  ✅ 沒有發生錯誤');
  } else {
    for (const error of testResults.errors) {
      console.log(`\n  ❌ ${error.description}`);
      console.log(`     錯誤: ${error.error}`);
    }
  }
  
  console.log('\n【警告】');
  if (testResults.warnings.length === 0) {
    console.log('  ✅ 沒有警告');
  } else {
    for (const warning of testResults.warnings) {
      console.log(`\n  ⚠️ ${warning.description}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Bug 數量: ${testResults.bugs.length} | 錯誤數量: ${testResults.errors.length} | 警告數量: ${testResults.warnings.length}`);
  console.log('='.repeat(60) + '\n');
}

async function cleanup() {
  log('\n🧹 清理測試資料...');

  if (!fs.existsSync(PLAYERS_DIR)) {
    log('清理略過：測試 players 目錄不存在');
    return;
  }

  const files = fs.readdirSync(PLAYERS_DIR);
  const testFiles = files.filter(f => f.startsWith('test_player_'));
  for (const file of testFiles) {
    try {
      const userId = String(file || '').replace(/\.json$/, '').trim();
      if (typeof CORE.deletePlayerStorage === 'function') {
        CORE.deletePlayerStorage(userId);
      } else {
        fs.unlinkSync(path.join(PLAYERS_DIR, file));
      }
    } catch (e) {}
  }
  if (typeof CORE.flushPlayerStorage === 'function') {
    await CORE.flushPlayerStorage();
  }

  log(`清理完成（刪除 ${testFiles.length} 個測試玩家檔）`);
}

runFullTest()
  .then(results => {
    console.log('\n🎉 測試完成！');
    process.exit(results.errors.length > 0 || results.bugs.length > 10 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n💥 測試嚴重錯誤:', error);
    process.exit(1);
  });
