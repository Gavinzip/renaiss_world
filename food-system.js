/**
 * 🍽️ Renaiss World - 食物系統
 * Renaiss星球 - 寵物與玩家食物
 */

// ============== 野外動物 ==============
const WILD_ANIMALS = [
  { name: '野兔', type: 'meat', effect: 'hp+10', poisonChance: 0 },
  { name: '野雞', type: 'meat', effect: 'hp+15', poisonChance: 0.05 },
  { name: '野豬', type: 'meat', effect: 'hp+25', poisonChance: 0.1 },
  { name: '梅花鹿', type: 'meat', effect: 'hp+30', poisonChance: 0 },
  { name: '眼鏡蛇', type: 'meat', effect: 'attack+2', poisonChance: 0.5 },
  { name: '毒蜘蛛', type: 'meat', effect: 'none', poisonChance: 0.6 },
  { name: '河魚', type: 'meat', effect: 'hp+12', poisonChance: 0.05 },
  { name: '山貓', type: 'meat', effect: 'speed+1', poisonChance: 0.15 },
  { name: '烏龜', type: 'meat', effect: 'defense+1', poisonChance: 0 },
  { name: '蝙蝠', type: 'meat', effect: 'luck+1', poisonChance: 0.3 }
];

// ============== 野外草藥（食物）==============
const WILD_HERBS = [
  { name: '野莓', type: 'herb', effect: 'hp+8', poisonChance: 0.1, desc: '酸甜可口' },
  { name: '止血草', type: 'herb', effect: 'hp+20', poisonChance: 0, desc: '清香撲鼻' },
  { name: '金銀花', type: 'herb', effect: 'mp+15', poisonChance: 0, desc: '花香淡雅' },
  { name: '人參', type: 'herb', effect: 'hp+50', poisonChance: 0, desc: '珍貴補品' },
  { name: '靈芝', type: 'herb', effect: 'exp+20', poisonChance: 0, desc: '稀有靈藥' },
  { name: '何首烏', type: 'herb', effect: 'defense+2', poisonChance: 0, desc: '烏髮黑髮' },
  { name: '川貝', type: 'herb', effect: 'mp+30', poisonChance: 0, desc: '止咳潤肺' },
  { name: '毒蘑菇', type: 'herb', effect: 'none', poisonChance: 0.7, desc: '色彩鮮艷' },
  { name: '斷腸草', type: 'herb', effect: 'poison', poisonChance: 1.0, desc: '千萬別吃！' },
  { name: '曼陀羅', type: 'herb', effect: 'confuse', poisonChance: 0.8, desc: '美麗但危險' },
  { name: '野芹菜', type: 'herb', effect: 'hp+5', poisonChance: 0.2, desc: '看起來像芹菜' },
  { name: '紅麴米', type: 'herb', effect: 'attack+1', poisonChance: 0, desc: '釀酒材料' }
];

// ============== 市場食物（可購買）==============
const MARKET_FOOD = [
  { name: '白米飯', price: 10, effect: 'hp+15', desc: '最基本的主食' },
  { name: '肉包子', price: 20, effect: 'hp+25', desc: '香噴噴的包子' },
  { name: '烤魚', price: 30, effect: 'hp+30', desc: '營養豐富' },
  { name: '藥膳湯', price: 80, effect: 'hp+60', desc: '滋補養生' },
  { name: '靈芝茶', price: 100, effect: 'mp+40,exp+10', desc: '提升修為' },
  { name: '解毒丸', price: 50, effect: 'cure_poison', desc: '清除毒素' },
  { name: '健脾丸', price: 40, effect: 'cure_stomach', desc: '治療腹瀉' },
  { name: '止嘔丸', price: 40, effect: 'cure_nausea', desc: '治療反胃' },
  { name: '燒酒', price: 25, effect: 'luck+2,hp-5', desc: '小酌一杯' },
  { name: '蛇膽酒', price: 120, effect: 'attack+3', desc: '大補之物' }
];

// ============== 負面狀態 ==============
const NEGATIVE_STATUS = {
  poison: {
    name: '中毒',
    duration: 3,
    damagePerTurn: 5,
    desc: '體內毒素發作，每回合損失生命'
  },
  stomach: {
    name: '腹瀉',
    duration: 2,
    damagePerTurn: 8,
    desc: '肚子不舒服，每回合損失生命'
  },
  nausea: {
    name: '反胃',
    duration: 2,
    damagePerTurn: 3,
    desc: '想吐，無法發揮實力'
  },
  confuse: {
    name: '迷亂',
    duration: 2,
    accuracyDown: 30,
    desc: '神志不清，命中率下降'
  }
};

// ============== 解析效果字串 ==============
function parseEffect(effectStr) {
  const effects = [];
  const parts = effectStr.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    if (trimmed.startsWith('hp+')) {
      effects.push({ type: 'heal', value: parseInt(trimmed.slice(3)) });
    } else if (trimmed.startsWith('hp-')) {
      effects.push({ type: 'damage', value: parseInt(trimmed.slice(3)) });
    } else if (trimmed.startsWith('mp+')) {
      effects.push({ type: 'mp', value: parseInt(trimmed.slice(3)) });
    } else if (trimmed.startsWith('mp-')) {
      effects.push({ type: 'mpDamage', value: parseInt(trimmed.slice(3)) });
    } else if (trimmed.startsWith('attack+')) {
      effects.push({ type: 'attackUp', value: parseInt(trimmed.slice(7)) });
    } else if (trimmed.startsWith('defense+')) {
      effects.push({ type: 'defenseUp', value: parseInt(trimmed.slice(9)) });
    } else if (trimmed.startsWith('speed+')) {
      effects.push({ type: 'speedUp', value: parseInt(trimmed.slice(7)) });
    } else if (trimmed.startsWith('luck+')) {
      effects.push({ type: 'luckUp', value: parseInt(trimmed.slice(6)) });
    } else if (trimmed.startsWith('exp+')) {
      effects.push({ type: 'exp', value: parseInt(trimmed.slice(4)) });
    } else if (trimmed === 'poison') {
      effects.push({ type: 'applyPoison', duration: 3 });
    } else if (trimmed === 'cure_poison') {
      effects.push({ type: 'cureStatus', status: 'poison' });
    } else if (trimmed === 'cure_stomach') {
      effects.push({ type: 'cureStatus', status: 'stomach' });
    } else if (trimmed === 'cure_nausea') {
      effects.push({ type: 'cureStatus', status: 'nausea' });
    } else if (trimmed === 'confuse') {
      effects.push({ type: 'applyConfuse', duration: 2 });
    }
  }
  
  return effects;
}

// ============== 獲取隨機動物 ==============
function getRandomAnimal() {
  return WILD_ANIMALS[Math.floor(Math.random() * WILD_ANIMALS.length)];
}

// ============== 獲取隨機草藥 ==============
function getRandomHerb() {
  return WILD_HERBS[Math.floor(Math.random() * WILD_HERBS.length)];
}

// ============== 獵捕動物 ==============
function huntAnimal(luck) {
  const animal = getRandomAnimal();
  const successChance = 0.7 + (luck - 50) / 100; // 幸運值影響成功率
  const caught = Math.random() < successChance;
  
  if (!caught) {
    return {
      success: false,
      desc: `你追了半天，${animal.name}跑掉了！`
    };
  }
  
  // 檢查是否有毒
  const isPoisoned = Math.random() < animal.poisonChance;
  
  if (isPoisoned) {
    return {
      success: true,
      item: animal,
      food: { name: `${animal.name}肉`, type: animal.type, effect: 'hp-10', poison: true },
      desc: `你成功抓到了一隻${animal.name}，但是...它好像有毒！`
    };
  }
  
  return {
    success: true,
    item: animal,
    food: { name: `${animal.name}肉`, type: animal.type, effect: animal.effect, poison: false },
    desc: `你成功捕獲了一隻${animal.name}！`
  };
}

// ============== 采集草藥 ==============
function forageHerb(luck) {
  const herb = getRandomHerb();
  const successChance = 0.8 + (luck - 50) / 100;
  const found = Math.random() < successChance;
  
  if (!found) {
    return {
      success: false,
      desc: '找了半天，什麼有用的草藥都沒找到...'
    };
  }
  
  const isPoisoned = Math.random() < herb.poisonChance;
  
  return {
    success: true,
    item: herb,
    food: { 
      name: herb.name, 
      type: herb.type, 
      effect: isPoisoned ? 'hp-10' : herb.effect, 
      poison: isPoisoned,
      desc: herb.desc
    },
    desc: `你發現了一株${herb.name}！${herb.desc}`
  };
}

// ============== 食用食物 ==============
function eatFood(entity, food) {
  // entity 可以是玩家或寵物
  const results = [];
  const effects = parseEffect(food.effect);
  
  for (const effect of effects) {
    switch (effect.type) {
      case 'heal':
        entity.stats.生命 = Math.min(entity.maxStats?.生命 || 100, entity.stats.生命 + effect.value);
        results.push(`生命 +${effect.value}`);
        break;
      case 'damage':
        entity.stats.生命 = Math.max(1, entity.stats.生命 - effect.value);
        results.push(`生命 -${effect.value}`);
        break;
      case 'mp':
        entity.stats.內力 = Math.min(entity.maxStats?.內力 || 100, entity.stats.內力 + effect.value);
        results.push(`內力 +${effect.value}`);
        break;
      case 'mpDamage':
        entity.stats.內力 = Math.max(0, entity.stats.內力 - effect.value);
        results.push(`內力 -${effect.value}`);
        break;
      case 'attackUp':
        entity.stats.戰力 = (entity.stats.戰力 || 30) + effect.value;
        results.push(`戰力 +${effect.value}`);
        break;
      case 'defenseUp':
        entity.stats.防禦 = (entity.stats.防禦 || 15) + effect.value;
        results.push(`防禦 +${effect.value}`);
        break;
      case 'speedUp':
        entity.stats.速度 = (entity.stats.速度 || 20) + effect.value;
        results.push(`速度 +${effect.value}`);
        break;
      case 'luckUp':
        entity.stats.幸運 = (entity.stats.幸運 || 50) + effect.value;
        results.push(`幸運 +${effect.value}`);
        break;
      case 'exp':
        if (entity.exp !== undefined) {
          entity.exp += effect.value;
          results.push(`經驗 +${effect.value}`);
        }
        break;
      case 'applyPoison':
        if (!entity.statusEffects) entity.statusEffects = [];
        const existingPoison = entity.statusEffects.find(e => e.type === 'poison');
        if (!existingPoison) {
          entity.statusEffects.push({
            type: 'poison',
            duration: effect.duration,
            desc: '中毒'
          });
          results.push('💀 觸發中毒狀態！');
        }
        break;
      case 'applyConfuse':
        if (!entity.statusEffects) entity.statusEffects = [];
        entity.statusEffects.push({
          type: 'confuse',
          duration: effect.duration,
          desc: '迷亂'
        });
        results.push('🌪️ 觸發迷亂狀態！');
        break;
      case 'cureStatus':
        if (!entity.statusEffects) entity.statusEffects = [];
        const idx = entity.statusEffects.findIndex(e => e.type === effect.status);
        if (idx !== -1) {
          entity.statusEffects.splice(idx, 1);
          results.push(`✅ 清除${NEGATIVE_STATUS[effect.status].name}狀態！`);
        }
        break;
    }
  }
  
  if (food.poison) {
    if (!entity.statusEffects) entity.statusEffects = [];
    entity.statusEffects.push({
      type: 'poison',
      duration: 3,
      desc: '中毒'
    });
    results.push('💀 食物有毒！中了毒！');
  }
  
  return {
    success: true,
    results: results,
    desc: `吃了${food.name}：${results.join(', ')}`
  };
}

// ============== 處理每日狀態 ==============
function processDailyStatus(entity) {
  const results = [];
  
  if (!entity.statusEffects || entity.statusEffects.length === 0) {
    return { desc: '沒有負面狀態', damage: 0 };
  }
  
  let totalDamage = 0;
  const remaining = [];
  
  for (const status of entity.statusEffects) {
    const statusInfo = NEGATIVE_STATUS[status.type];
    if (!statusInfo) continue;
    
    if (status.duration > 0) {
      status.duration--;
      totalDamage += statusInfo.damagePerTurn || 0;
      results.push(`${statusInfo.name}：-${statusInfo.damagePerTurn}生命`);
      
      if (status.duration > 0) {
        remaining.push(status);
      }
    }
  }
  
  entity.statusEffects = remaining;
  entity.stats.生命 = Math.max(1, entity.stats.生命 - totalDamage);
  
  return {
    desc: results.join(', ') || '無',
    damage: totalDamage,
    remaining: remaining.length
  };
}

module.exports = {
  WILD_ANIMALS,
  WILD_HERBS,
  MARKET_FOOD,
  NEGATIVE_STATUS,
  parseEffect,
  getRandomAnimal,
  getRandomHerb,
  huntAnimal,
  forageHerb,
  eatFood,
  processDailyStatus
};
