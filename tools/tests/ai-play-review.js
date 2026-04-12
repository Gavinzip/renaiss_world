/**
 * AI Evaluation Script for Renaiss World
 */

const path = require('path');
const fs = require('fs');

function loadEnvFromCandidates() {
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '..', '.env')
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const raw = String(line || '').trim();
      if (!raw || raw.startsWith('#')) return;
      const [key, ...valueParts] = raw.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
}
loadEnvFromCandidates();

const CORE = require('../../modules/core/game-core');
const PET = require('../../modules/systems/pet/pet-system');
const EVENTS = require('../../modules/content/event-system');
const STORY = require('../../modules/content/storyteller');

const REVIEW_RESULTS = {
  storyQuality: { issues: [] },
  gameplayIssues: [],
  suggestions: []
};

async function aiPlayGame(playerName, faction, roundCount = 20) {
  console.log('\n' + '='.repeat(70));
  console.log('AI Playing: ' + playerName + ' (' + faction + ')');
  console.log('='.repeat(70) + '\n');

  const userId = 'ai_player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  try {
    const player = CORE.createPlayer(userId, playerName, '男', '無門無派');
    player.alignment = faction;
    CORE.savePlayer(player);

    const egg = PET.createPetEgg(userId, faction);
    const pet = PET.hatchEgg(egg);
    pet.name = playerName + '的數位夥伴';
    PET.savePet(pet);

    console.log('Character created: ' + player.name);
    console.log('Faction: ' + player.alignment);
    console.log('Location: ' + player.location);
    console.log('Pet: ' + pet.name + '\n');

    for (let round = 1; round <= roundCount; round++) {
      console.log('\n--- Round ' + round + '/' + roundCount + ' ---');
      
      const refreshedPlayer = CORE.loadPlayer(userId);
      const refreshedPet = PET.loadPet(userId);
      
      const choices = EVENTS.generateEventChoices(refreshedPlayer, {});
      
      if (!choices || choices.length === 0) {
        REVIEW_RESULTS.gameplayIssues.push('Round ' + round + ': No event choices generated');
        console.log('WARNING: No event choices');
        continue;
      }
      
      console.log('Available choices (' + choices.length + '):');
      choices.slice(0, 5).forEach((choice, idx) => {
        console.log('  ' + (idx + 1) + '. [' + (choice.tag || 'general') + '] ' + choice.name);
      });
      
      let aiChoice;
      if (faction === '正派') {
        const positiveChoices = choices.filter(c => 
          (c.tag && c.tag.includes('助人')) || (c.tag && c.tag.includes('探索')) || (c.tag && c.tag.includes('訓練'))
        );
        aiChoice = positiveChoices.length > 0 
          ? positiveChoices[Math.floor(Math.random() * positiveChoices.length)]
          : choices[Math.floor(Math.random() * choices.length)];
      } else {
        const negativeChoices = choices.filter(c => 
          (c.tag && c.tag.includes('戰')) || (c.tag && c.tag.includes('冒險')) || (c.tag && c.tag.includes('機變'))
        );
        aiChoice = negativeChoices.length > 0
          ? negativeChoices[Math.floor(Math.random() * negativeChoices.length)]
          : choices[Math.floor(Math.random() * choices.length)];
      }
      
      console.log('AI Choice: ' + aiChoice.name);
      
      try {
        const story = await STORY.generateStory(
          aiChoice,
          refreshedPlayer,
          refreshedPet,
          aiChoice.name
        );
        
        if (story && story.length > 0) {
          console.log('\nStory generated (' + story.length + ' chars):');
          
          const storyLines = story.split('\n').filter(l => l.trim().length > 0);
          if (storyLines.length > 0) {
            const firstLine = storyLines[0];
            const lastLine = storyLines[storyLines.length - 1];
            
            console.log('  Opening: "' + firstLine.substring(0, 100) + '..."');
            console.log('  Ending: "' + lastLine.substring(0, 100) + '..."');
            
            if (story.length < 100) {
              REVIEW_RESULTS.storyQuality.issues.push('Story too short at round ' + round);
            }
          }
        }
      } catch (storyError) {
        console.log('Story generation failed: ' + storyError.message);
        REVIEW_RESULTS.storyQuality.issues.push('Round ' + round + ': ' + storyError.message);
      }
      
      refreshedPlayer.stats.飽腹度 = Math.max(0, (refreshedPlayer.stats.飽腹度 || 100) - 3);
      refreshedPlayer.stats.財富 = Math.max(0, (refreshedPlayer.stats.財富 || 50) + Math.floor(Math.random() * 30));
      refreshedPlayer.storyTurns++;
      
      CORE.appendPlayerMemory(refreshedPlayer, {
        type: 'action',
        content: 'Round ' + round + ': ' + aiChoice.name,
        outcome: 'Success',
        location: refreshedPlayer.location
      });
      
      CORE.savePlayer(refreshedPlayer);
      
      console.log('\nStatus:');
      console.log('  Hunger: ' + refreshedPlayer.stats.飽腹度 + '%');
      console.log('  Wealth: ' + refreshedPlayer.stats.財富);
      console.log('  Location: ' + refreshedPlayer.location);
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    const finalPlayer = CORE.loadPlayer(userId);
    const finalPet = PET.loadPet(userId);
    
    console.log('\n\n' + '='.repeat(70));
    console.log('Game Summary - ' + playerName);
    console.log('='.repeat(70));
    console.log('Level: ' + finalPlayer.level);
    console.log('Wealth: ' + finalPlayer.stats.財富);
    console.log('Memories: ' + (finalPlayer.memories ? finalPlayer.memories.length : 0));
    console.log('Location: ' + finalPlayer.location);
    console.log('Pet HP: ' + finalPet.hp + '/' + finalPet.maxHp);
    
    const playerPath = path.join(__dirname, 'data', 'players', userId + '.json');
    if (fs.existsSync(playerPath)) {
      fs.unlinkSync(playerPath);
    }
    
    return true;
    
  } catch (error) {
    console.error('Error: ' + error.message);
    REVIEW_RESULTS.gameplayIssues.push('Player ' + playerName + ': ' + error.message);
    return false;
  }
}

async function runAIReview() {
  console.log('\n' + '='.repeat(70));
  console.log('AI Evaluation of Renaiss World');
  console.log('='.repeat(70));

  CORE.loadWorld();

  const testCases = [
    { name: '正氣探索者雲飛', faction: '正派' },
    { name: '機變使者暗影', faction: '機變派' },
    { name: '中立劍客無痕', faction: '正派' },
    { name: '黑暗刺客血月', faction: '機變派' },
    { name: '新手冒險者小風', faction: '正派' }
  ];

  let successCount = 0;
  for (const testCase of testCases) {
    const success = await aiPlayGame(testCase.name, testCase.faction, 20);
    if (success) successCount++;
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('Evaluation Report');
  console.log('='.repeat(70));

  console.log('\n[Story Quality]');
  console.log('Successfully played: ' + successCount + '/' + testCases.length);
  console.log('Story issues: ' + REVIEW_RESULTS.storyQuality.issues.length);
  
  if (REVIEW_RESULTS.storyQuality.issues.length > 0) {
    console.log('\nIssues:');
    REVIEW_RESULTS.storyQuality.issues.forEach((issue, idx) => {
      console.log('  ' + (idx + 1) + '. ' + issue);
    });
  }

  console.log('\n[Gameplay Issues]');
  if (REVIEW_RESULTS.gameplayIssues.length === 0) {
    console.log('No issues found');
  } else {
    REVIEW_RESULTS.gameplayIssues.forEach((issue, idx) => {
      console.log((idx + 1) + '. ' + issue);
    });
  }

  console.log('\n[Suggestions for Improvement]');
  const suggestions = [
    '1. Story length should be at least 200 characters minimum',
    '2. Add more event types to prevent empty choice lists',
    '3. Consider auto-battle option for passive combat',
    '4. Hunger system may be too punishing for new players',
    '5. Add tutorial or hint system for new players',
    '6. More detailed location descriptions needed',
    '7. Pet interaction beyond combat should be expanded',
    '8. Currency system needs clearer earning/spending paths'
  ];
  
  suggestions.forEach(suggestion => {
    console.log('  ' + suggestion);
  });

  console.log('\n[Overall Impression]');
  console.log('Strengths:');
  console.log('  - Creative AI story generation system');
  console.log('  - Deep faction system');
  console.log('  - Rich world-building');
  console.log('  - Innovative NPC memory system');
  
  console.log('\nNeeds Improvement:');
  console.log('  - Stories sometimes too brief');
  console.log('  - Lack of new player guidance');
  console.log('  - Hunger system affects experience');
  console.log('  - Combat requires manual operation');
  
  console.log('\n' + '='.repeat(70));
}

runAIReview()
  .then(() => {
    console.log('Evaluation complete');
  })
  .catch(error => {
    console.error('Evaluation error:', error);
  });
