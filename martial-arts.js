/**
 * 🌟 Renaiss World - 武學系統
 * 
 * 完整武學：品質分級、境界六重、內功屬性、修煉方式
 */

// ============== 武學典籍 ==============
const MARTIAL_ARTS = {
  // ===== 基礎武學 (係數 1.0-1.5) =====
  "基本拳腳": {
    type: "外功", attribute: "無", coefficient: 1.0, rank: "basic",
    description: "最基礎的拳腳功夫",
    effects: ["基本攻擊"], damage: 10,
    manual: "羅漢拳", speed: 10, mpCost: 0
  },
  "基礎劍法": {
    type: "外功", attribute: "無", coefficient: 1.0, rank: "basic",
    description: "劍術入門",
    effects: ["基本刺擊"], damage: 12, manual: "越女劍法", speed: 12, mpCost: 0
  },
  "羅漢拳": {
    type: "外功", attribute: "陽剛", coefficient: 1.3, rank: "basic",
    description: "少林入門拳法",
    effects: ["剛猛"], damage: 15, manual: "羅漢拳譜", speed: 10, mpCost: 2
  },
  
  // ===== 進階武學 (係數 1.6-2.5) =====
  "黑風刀法": {
    type: "外功", attribute: "陽剛", coefficient: 1.8, rank: "intermediate",
    description: "刀勢迅猛，如黑風席捲",
    effects: ["連擊"], damage: 25, manual: "黑風刀譜", speed: 14, mpCost: 5
  },
  "丐幫長拳": {
    type: "外功", attribute: "陽剛", coefficient: 1.7, rank: "intermediate",
    description: "丐幫基礎拳法",
    effects: ["破綻少"], damage: 22, manual: "丐幫拳經", speed: 13, mpCost: 4
  },
  "華山劍法（基礎篇）": {
    type: "外功", attribute: "調和", coefficient: 1.9, rank: "intermediate",
    description: "華山派入門劍法",
    effects: ["招式靈活"], damage: 24, manual: "華山劍譜", speed: 16, mpCost: 5
  },
  "玉女劍法": {
    type: "外功", attribute: "陰柔", coefficient: 2.0, rank: "intermediate",
    description: "輕柔靈動，以柔克剛",
    effects: ["閃避加成", "破防"], damage: 22, manual: "玉女心經", speed: 18, mpCost: 6
  },
  "金剛拳": {
    type: "外功", attribute: "陽剛", coefficient: 2.1, rank: "intermediate",
    description: "少林剛猛拳法",
    effects: ["破甲"], damage: 28, manual: "金剛經", speed: 10, mpCost: 6
  },
  
  // ===== 上乘武學 (係數 2.6-3.5) =====
  "華山劍法（精髓）": {
    type: "外功", attribute: "調和", coefficient: 2.8, rank: "advanced",
    description: "華山派精髓劍法",
    effects: ["無招勝有招"], damage: 35, manual: "華山劍譜精髓", speed: 18, mpCost: 10
  },
  "少林羅漢拳（真傳）": {
    type: "外功", attribute: "陽剛", coefficient: 2.9, rank: "advanced",
    description: "少林羅漢拳真傳",
    effects: ["金剛之力"], damage: 38, manual: "羅漢拳譜", speed: 12, mpCost: 12
  },
  "彈指神通": {
    type: "外功", attribute: "調和", coefficient: 2.7, rank: "advanced",
    description: "以指力發出強勁彈丸",
    effects: ["遠程攻擊", "破防"], damage: 32, manual: "桃花島秘典", speed: 20, mpCost: 8
  },
  "一陽指": {
    type: "外功", attribute: "調和", coefficient: 2.8, rank: "advanced",
    description: "大理段氏絕學，可點穴",
    effects: ["點穴", "內傷"], damage: 30, manual: "一陽指譜", speed: 15, mpCost: 15
  },
  "龍爪手": {
    type: "外功", attribute: "陽剛", coefficient: 2.6, rank: "advanced",
    description: "少林龍爪手，剛猛無匹",
    effects: ["擒拿", "破防"], damage: 34, manual: "龍爪手譜", speed: 12, mpCost: 10
  },
  "太極拳": {
    type: "外功", attribute: "調和", coefficient: 3.0, rank: "advanced",
    description: "以柔克剛，四兩撥千斤",
    effects: ["反震", "連消帶打"], damage: 28, manual: "太極拳經", speed: 8, mpCost: 12
  },
  "太極劍": {
    type: "外功", attribute: "調和", coefficient: 3.0, rank: "advanced",
    description: "太極劍法，劍勢圓轉",
    effects: ["劍網", "消耗內力"], damage: 32, manual: "太極劍譜", speed: 7, mpCost: 14
  },
  
  // ===== 絕學 (係數 3.6-4.5) =====
  "降龍十八掌": {
    type: "外功", attribute: "陽剛", coefficient: 4.2, rank: "ultimate",
    description: "丐幫鎮幫之寶，掌風如狂龍出淵",
    effects: ["擊退", "破防", "亢龍有悔"], damage: 55, manual: "打狗棒法心法", speed: 10, mpCost: 25,
    special: ["融會貫通後解鎖「亢龍有悔」：攻擊後吸血30%"],
    restriction: null
  },
  "獨孤九劍": {
    type: "外功", attribute: "調和", coefficient: 4.3, rank: "ultimate",
    description: "獨孤求敗所創，破盡天下武功",
    effects: ["無招式", "破招", "破氣式"], damage: 52, manual: "獨孤九劍譜", speed: 20, mpCost: 30,
    special: ["登峰造極後可能領悟「破氣式」"],
    restriction: null
  },
  "九陰真經（武功篇）": {
    type: "外功", attribute: "陰柔", coefficient: 3.8, rank: "ultimate",
    description: "黃裳所創武學總綱，包羅萬象",
    effects: ["多種招式", "加速"], damage: 45, manual: "九陰真經", speed: 15, mpCost: 20,
    special: ["融會貫通後輕功大增"],
    restriction: null
  },
  "打狗棒法": {
    type: "外功", attribute: "陽剛", coefficient: 3.7, rank: "ultimate",
    description: "丐幫絕學，棒法精妙",
    effects: ["纏繞", "絆倒"], damage: 42, manual: "打狗棒法心法", speed: 18, mpCost: 22,
    restriction: null
  },
  "乾坤大挪移": {
    type: "外功", attribute: "調和", coefficient: 4.0, rank: "ultimate",
    description: "明教鎮教神功，挪移乾坤",
    effects: ["轉移攻擊", "借力打力"], damage: 40, manual: "乾坤心法", speed: 12, mpCost: 28,
    restriction: null
  },
  "黯然銷魂掌": {
    type: "外功", attribute: "陰柔", coefficient: 4.1, rank: "ultimate",
    description: "楊過所創，傷心至極時威力無匹",
    effects: ["黯然", "爆發"], damage: 50, manual: null, speed: 14, mpCost: 24,
    special: ["心情低落的殺傷力+50%"],
    restriction: null
  },
  "天山六陽掌": {
    type: "外功", attribute: "調和", coefficient: 3.9, rank: "ultimate",
    description: "天山童姥所傳，陰陽並濟",
    effects: ["陰陽並濟", "生死符"], damage: 46, manual: "天山六陽掌譜", speed: 16, mpCost: 22,
    restriction: null
  },
  "吸星大法": {
    type: "內功", attribute: "吸納", coefficient: 3.8, rank: "ultimate",
    description: "可吸取敵人內力",
    effects: ["吸取內力", "異種真氣"], damage: 35, manual: "吸星大法秘籍", speed: 10, mpCost: 20,
    special: ["可吸收敵人內力為己用，但積累異種真氣"],
    restriction: null
  },
  "化功大法": {
    type: "內功", attribute: "毒異", coefficient: 3.6, rank: "ultimate",
    description: "化去敵人內力",
    effects: ["化去內力", "中毒"], damage: 38, manual: "化功大法秘籍", speed: 12, mpCost: 22,
    restriction: null
  },
  
  // ===== 傳說武學 (係數 4.6-5.0) =====
  "六脈神劍": {
    type: "外功", attribute: "陽剛", coefficient: 4.8, rank: "legendary",
    description: "大理段氏至高絕學，以內力化作劍氣",
    effects: ["遠程劍氣", "破體"], damage: 65, manual: "六脈神劍譜", speed: 25, mpCost: 35,
    restriction: "需強大內力支持（內力<50無法發揮全部威力）"
  },
  "葵花寶典": {
    type: "內功", attribute: "陰柔", coefficient: 4.9, rank: "legendary",
    description: "欲練此功，必先自宮。天下無敵的速度",
    effects: ["極速", "詭異"], damage: 60, manual: "葵花寶典", speed: 30, mpCost: 30,
    restriction: "需「揮劍自宮」——不可逆"
  },
  "辟邪劍法": {
    type: "外功", attribute: "陰柔", coefficient: 4.7, rank: "legendary",
    description: "葵花寶典分支，劍法詭異迅速",
    effects: ["極速", "破防"], damage: 58, manual: "辟邪劍譜", speed: 28, mpCost: 28,
    restriction: "需「揮劍自宮」——不可逆"
  },
  "太玄經": {
    type: "內功", attribute: "調和", coefficient: 4.9, rank: "legendary",
    description: "俠客島至高武學，內力化為本能",
    effects: ["內力本能化", "無招式"], damage: 70, manual: "太玄經", speed: 20, mpCost: 40,
    restriction: "需在俠客島領悟"
  },
  "龍象般若功": {
    type: "內功", attribute: "陽剛", coefficient: 4.6, rank: "legendary",
    description: "密宗至高功法，力大無窮",
    effects: ["力量倍增", "金剛不壞"], damage: 55, manual: "龍象般若功譜", speed: 5, mpCost: 35,
    restriction: "需「天生神力」（戰力≥90）"
  },
  "易筋經": {
    type: "內功", attribute: "調和", coefficient: 4.5, rank: "legendary",
    description: "少林至高內功，洗髓伐筋",
    effects: ["內力回復", "走火入魔風險降低"], damage: 20, manual: "易筋經", speed: 3, mpCost: 0,
    special: ["內力回覆+50%，修煉其他武學走火入魔風險-50%"],
    restriction: null
  },
  "九陽神功": {
    type: "內功", attribute: "陽剛", coefficient: 4.4, rank: "legendary",
    description: "九陰真經對應之學，陽剛至極",
    effects: ["陽剛內力", "抗毒", "內力深厚"], damage: 25, manual: "九陽神功秘籍", speed: 5, mpCost: 0,
    special: ["陽剛屬性攻擊+30%，防禦+20%，解毒"],
    restriction: null
  },
  "九陰真經": {
    type: "內功", attribute: "陰柔", coefficient: 4.5, rank: "legendary",
    description: "黃裳所創武學總綱，陰柔極致",
    effects: ["陰柔內力", "療傷", "多種招式"], damage: 22, manual: "九陰真經", speed: 5, mpCost: 0,
    special: ["陰柔屬性攻擊+30%，療傷速度+50%"],
    restriction: null
  },
  "北冥神功": {
    type: "內功", attribute: "調和", coefficient: 4.3, rank: "legendary",
    description: "逍遙派至高內功，容納百川",
    effects: ["吸取內力", "陰陽調和"], damage: 30, manual: "北冥神功秘籍", speed: 8, mpCost: 15,
    special: ["吸取內力無副作用（相較吸星大法）"],
    restriction: null
  },
  "玉女心經": {
    type: "內功", attribute: "陰柔", coefficient: 4.0, rank: "legendary",
    description: "古墓派至高心法，清冷如玉",
    effects: ["玉女內力", "清心", "加速"], damage: 18, manual: "玉女心經", speed: 10, mpCost: 0,
    special: ["與九陰真經合璧威力倍增"],
    restriction: "女性修煉效果更佳"
  },
  "五毒神功": {
    type: "內功", attribute: "毒異", coefficient: 3.8, rank: "ultimate",
    description: "以毒攻毒，毒功至高",
    effects: ["毒攻擊", "抗毒"], damage: 40, manual: "五毒秘籍", speed: 12, mpCost: 20,
    restriction: null
  },
  "蛤蟆功": {
    type: "內功", attribute: "陽剛", coefficient: 3.7, rank: "ultimate",
    description: "歐陽鋒絕學，如蛤蟆蓄力",
    effects: ["蓄力攻擊", "爆發"], damage: 50, manual: "蛤蟆功秘籍", speed: 6, mpCost: 25,
    restriction: null
  },
  "左右互搏術": {
    type: "技巧", attribute: "調和", coefficient: 3.5, rank: "advanced",
    description: "周伯通所創，一心二用之術",
    effects: ["雙倍攻擊"], damage: 0, manual: null, speed: 0, mpCost: 0,
    special: ["攻擊次數x2，但威力-30%"],
    restriction: null
  },
  "凌波微步": {
    type: "輕功", attribute: "陰柔", coefficient: 3.2, rank: "advanced",
    description: "逍遙派輕功，步伐精妙",
    effects: ["閃避大增", "移動"], damage: 0, manual: "凌波微步秘籍", speed: 30, mpCost: 10,
    special: ["戰鬥中閃避率+40%"],
    restriction: null
  },
  "金剛不壞神功": {
    type: "內功", attribute: "陽剛", coefficient: 4.2, rank: "legendary",
    description: "少林至高防禦功法",
    effects: ["防禦大增", "反震"], damage: 0, manual: "金剛不壞秘籍", speed: 2, mpCost: 15,
    special: ["受到傷害-50%，反震30%給敵人"],
    restriction: null
  }
};

// ============== 境界系統 ==============
const REALMS = {
  "初窺門徑": { multiplier: 0.6, name: "初窺門徑", desc: "基本能用，破綻百出", unlock: null },
  "略有小成": { multiplier: 0.75, name: "略有小成", desc: "招式連貫，不再生澀", unlock: null },
  "駕輕就熟": { multiplier: 0.9, name: "駕輕就熟", desc: "收發自如，內力消耗降低", unlock: "mpCost-20%" },
  "融會貫通": { multiplier: 1.0, name: "融會貫通", desc: "解鎖特殊效果", unlock: "special" },
  "爐火純青": { multiplier: 1.2, name: "爐火純青", desc: "可傳授他人", unlock: "canTeach" },
  "登峰造極": { multiplier: 1.5, name: "登峰造極", desc: "可能領悟新招", unlock: "mayLearnNew" }
};

const REALM_ORDER = ["初窺門徑", "略有小成", "駕輕就熟", "融會貫通", "爐火純青", "登峰造極"];

// ============== 內功屬性系統 ==============
const ATTRIBUTES = {
  "陽剛": {
    name: "陽剛",克制: "陰柔",被克: "調和",
    effect: "外功傷害+20%，防禦+10%",
    examples: ["九陽神功", "降龍十八掌", "龍象般若功", "蛤蟆功"]
  },
  "陰柔": {
    name: "陰柔",克制: "調和",被克: "陽剛",
    effect: "內功傷害+20%，閃避+10%",
    examples: ["九陰真經", "玉女心經", "葵花寶典", "辟邪劍法"]
  },
  "調和": {
    name: "調和",克制: "陽剛",被克: "陰柔",
    effect: "內力回覆+30%，走火入魔風險-50%",
    examples: ["易筋經", "北冥神功", "獨孤九劍", "太極拳"]
  },
  "吸納": {
    name: "吸納",克制: null,被克: null,
    effect: "可化用敵人內力，但積累異種真氣",
    examples: ["吸星大法", "化功大法", "北冥神功"]
  },
  "毒異": {
    name: "毒異",克制: null,被克: "純陽",
    effect: "攻擊帶毒，但修煉風險高",
    examples: ["五毒神功", "化功大法"]
  }
};

// ============== 特殊限制 ==============
const SPECIAL_RESTRICTIONS = {
  "葵花寶典": { type: "self-harm", requirement: "揮劍自宮（不可逆）", description: "欲練此功，必先自宮" },
  "辟邪劍法": { type: "self-harm", requirement: "揮劍自宮（不可逆）", description: "欲練神功，必先自宮" },
  "龍象般若功": { type: "stat", stat: "戰力", min: 90, requirement: "天生神力（戰力≥90）", description: "需天生神力" },
  "六脈神劍": { type: "stat", stat: "內力", min: 50, requirement: "內力深厚", description: "內力<50無法發揮全部威力" }
};

// ============== 武器類型 ==============
const WEAPONS = {
  "徒手": { damage: 1.0, speed: 10, range: "近戰", special: null },
  "長劍": { damage: 1.2, speed: 12, range: "近戰", special: "刺擊" },
  "重劍": { damage: 1.5, speed: 8, range: "近戰", special: "重擊" },
  "刀": { damage: 1.3, speed: 14, range: "近戰", special: "橫掃" },
  "棍": { damage: 1.1, speed: 15, range: "近戰", special: "絆倒" },
  "鞭": { damage: 1.0, speed: 18, range: "遠程", special: "纏繞" },
  "暗器": { damage: 0.8, speed: 20, range: "遠程", special: "穿刺" },
  "針": { damage: 0.6, speed: 25, range: "遠程", special: "破防" }
};

// ============== 戰鬥計算 ==============
function calculateDamage(attacker, skillName, target, realmMultiplier, weather) {
  const skill = MARTIAL_ARTS[skillName];
  if (!skill) return 0;
  
  // 基礎傷害 = 攻擊力 × 武學係數
  let damage = (attacker.stats?.戰力 || 50) * skill.coefficient;
  
  // 境界係數
  damage *= realmMultiplier;
  
  // 武器加成
  const weapon = attacker.武器 || "徒手";
  const weaponData = WEAPONS[weapon] || WEAPONS["徒手"];
  damage *= weaponData.damage;
  
  // 屬性克制
  if (skill.attribute && skill.attribute !== "無") {
    const attrData = ATTRIBUTES[skill.attribute];
    if (attrData && attrData.克制 === target.內功屬性) {
      damage *= 1.3; // 克制加成
    } else if (attrData && attrData.被克 === target.內功屬性) {
      damage *= 0.7; // 被克減益
    }
  }
  
  // 天氣影響
  if (weather === "雨" && (skill.attribute === "陽剛" || skill.description?.includes("火"))) {
    damage *= 0.7;
  }
  
  // 防禦
  const defense = (target.stats?.戰力 || 50) * 0.4;
  damage = Math.max(5, damage - defense);
  
  // 運氣暴擊
  const luck = (attacker.stats?.運氣 || 50) / 100;
  if (Math.random() < luck * 0.3) {
    damage *= 1.5;
  }
  
  return Math.floor(damage);
}

// ============== 境界突破判定 ==============
function checkRealmBreakthrough(player, skillName) {
  const skill = player.skills?.[skillName];
  if (!skill) return { success: false, reason: "未學會此武功" };
  
  const currentRealmIndex = REALM_ORDER.indexOf(skill.realm);
  if (currentRealmIndex >= REALM_ORDER.length - 1) {
    return { success: false, reason: "已達最高境界" };
  }
  
  // 突破條件檢查
  // 1. 熟練度
  if (skill.proficiency < (currentRealmIndex + 1) * 100) {
    return { success: false, reason: `熟練度不足（${skill.proficiency}/${(currentRealmIndex + 1) * 100}）` };
  }
  
  // 2. 內功支援
  if (skill.coefficient >= 3.0) {
    const internalKungfu = findLearnedInternal(player, skill.attribute);
    if (!internalKungfu) {
      return { success: false, reason: "需要對應內功心法支援" };
    }
  }
  
  // 3. 福緣判定
  const fortune = player.stats?.運氣 || 50;
  const breakthroughChance = fortune * 0.5 + player.stats?.智商 * 0.2;
  
  if (Math.random() * 100 > breakthroughChance) {
    return { success: false, reason: "突破失敗，需要更多福緣" };
  }
  
  // 突破成功
  const newRealm = REALM_ORDER[currentRealmIndex + 1];
  return {
    success: true,
    newRealm,
    desc: REALMS[newRealm].desc,
    unlock: REALMS[newRealm].unlock
  };
}

// ============== 內功衝突檢查 ==============
function checkInternalConflict(player, newSkillName) {
  const newSkill = MARTIAL_ARTS[newSkillName];
  if (!newSkill || newSkill.type !== "內功") return null;
  
  const playerGender = player.gender || "男";
  const baseAttribute = playerGender === "男" ? "陽剛" : "陰柔";
  
  // 檢查是否冲突
  for (const [skillName, skillData] of Object.entries(player.skills || {})) {
    if (skillData.type !== "內功") continue;
    const existingAttr = skillData.attribute;
    
    // 陽剛+陰柔冲突
    if ((newSkill.attribute === "陽剛" && existingAttr === "陰柔") ||
        (newSkill.attribute === "陰柔" && existingAttr === "陽剛")) {
      return {
        conflict: true,
        risk: "走火入魔",
        chance: 10,
        effect: "內息紊亂：氣血-10%"
      };
    }
    
    // 吸納+其他（除調和）冲突
    if (newSkill.attribute === "吸納" && (existingAttr === "陽剛" || existingAttr === "陰柔")) {
      return {
        conflict: true,
        risk: "異種真氣衝突",
        chance: 15,
        effect: "內傷：內力上限永久-5%"
      };
    }
  }
  
  // 性別基礎屬性冲突
  if (newSkill.attribute !== "無" && newSkill.attribute !== "調和" && newSkill.attribute !== baseAttribute) {
    const oppositeAttr = baseAttribute === "陽剛" ? "陰柔" : "陽剛";
    if (newSkill.attribute === oppositeAttr) {
      return {
        conflict: true,
        risk: "強行修煉",
        chance: 20,
        effect: "成功率-20%，每次修煉需(智商×4%)判定，失敗觸發內功衝突",
        genderPenalty: true
      };
    }
  }
  
  return null;
}

// ============== 內力比拼 ==============
function innerForceContest(attacker, defender, attackerMP, defenderMP) {
  const result = {
    rounds: 0,
    winner: null,
    loser: null,
    effects: []
  };
  
  let attMP = attackerMP;
  let defMP = defenderMP;
  const maxRounds = 10;
  
  // 陽剛克陰柔
  const attAttr = attacker.內功屬性 || "調和";
  const defAttr = defender.內功屬性 || "調和";
  const attAdvantage = (attAttr === "陽剛" && defAttr === "陰柔") ? 1.2 : (attAttr === "陰柔" && defAttr === "陽剛") ? 0.8 : 1.0;
  
  while (attMP > 0 && defMP > 0 && result.rounds < maxRounds) {
    result.rounds++;
    
    // 每回合消耗20%最大內力
    const attConsume = Math.floor(attMP * 0.2);
    const defConsume = Math.floor(defMP * 0.2);
    
    attMP -= attConsume;
    defMP -= defConsume;
    
    // 屬性加成
    const attRoll = Math.random() * attAttr === attAttr ? attAdvantage : 1.0;
    const defRoll = Math.random();
    
    if (attRoll > defRoll) {
      defMP -= Math.floor(defConsume * 0.3);
    } else {
      attMP -= Math.floor(attConsume * 0.3);
    }
  }
  
  if (attMP <= 0 && defMP <= 0) {
    result.winner = "平手";
    result.effects.push("雙方內力耗盡，進入虛弱狀態");
  } else if (defMP <= 0) {
    result.winner = attacker.name;
    result.loser = defender.name;
    result.effects.push("勝者：封鎖對手經脈3回合，內力回覆+50%");
    result.effects.push("敗者：經脈受損，內力上限-20%（可治療）");
  } else {
    result.winner = defender.name;
    result.loser = attacker.name;
    result.effects.push("勝者：封鎖對手經脈3回合，內力回覆+50%");
    result.effects.push("敗者：經力上限-20%（可治療）");
  }
  
  return result;
}

// ============== 修煉系統 ==============
function practiceSkill(player, skillName, method = "實戰") {
  const skill = player.skills?.[skillName];
  if (!skill) return { success: false, reason: "未學會此武功" };
  
  const martialArt = MARTIAL_ARTS[skillName];
  if (!martialArt) return { success: false, reason: "無效武功" };
  
  let expGain = 0;
  let risk = null;
  
  switch (method) {
    case "實戰":
      expGain = 10 + Math.floor(Math.random() * 10);
      break;
    case "練習":
      expGain = 5 + Math.floor(Math.random() * 5);
      break;
    case "閱讀典籍":
      if (player.秘籍?.[skillName]) {
        expGain = 20 + Math.floor(Math.random() * 20);
      } else {
        return { success: false, reason: "沒有對應秘籍" };
      }
      break;
    case "閉關":
      expGain = 15 + Math.floor(Math.random() * 15);
      // 閉關有概率觸發頓悟
      if (Math.random() < (player.stats?.運氣 || 50) / 200) {
        expGain *= 2;
        return { success: true, exp: expGain, epiphany: true, desc: "閉關中突發靈感，武功精進！" };
      }
      break;
    case "師父傳授":
      if (player.師父) {
        expGain = 30;
      } else {
        return { success: false, reason: "沒有師父指導" };
      }
      break;
  }
  
  // 內功衝突檢查（強行修煉）
  const conflict = checkInternalConflict(player, skillName);
  if (conflict?.genderPenalty) {
    if (Math.random() < (player.stats?.智商 || 50) * 0.04) {
      risk = conflict.effect;
    }
  }
  
  skill.proficiency = (skill.proficiency || 0) + expGain;
  
  // 境界突破檢查
  const breakthrough = checkRealmBreakthrough(player, skillName);
  
  return {
    success: true,
    exp: expGain,
    risk,
    breakthrough
  };
}

// ============== 輔助函數 ==============
function findLearnedInternal(player, attribute) {
  for (const [skillName, skillData] of Object.entries(player.skills || {})) {
    if (skillData.type === "內功" && skillData.attribute === attribute) {
      return skillName;
    }
  }
  return null;
}

function getQualityRank(coefficient) {
  if (coefficient <= 1.5) return { rank: "基礎", tier: 1, stars: "★" };
  if (coefficient <= 2.5) return { rank: "進階", tier: 2, stars: "★★" };
  if (coefficient <= 3.5) return { rank: "上乘", tier: 3, stars: "★★★" };
  if (coefficient <= 4.5) return { rank: "絕學", tier: 4, stars: "★★★★" };
  return { rank: "傳說", tier: 5, stars: "★★★★★" };
}

function getRealmProgress(proficiency) {
  const perRealm = 100;
  const realmIndex = Math.min(Math.floor(proficiency / perRealm), REALM_ORDER.length - 1);
  const currentProficiency = proficiency % perRealm;
  return {
    realm: REALM_ORDER[realmIndex],
    nextRealm: REALM_ORDER[realmIndex + 1] || null,
    progress: currentProficiency,
    progressMax: perRealm,
    percent: Math.floor((currentProficiency || 0) / perRealm * 100)
  };
}

function learnSkill(player, skillName) {
  const martialArt = MARTIAL_ARTS[skillName];
  if (!martialArt) return { success: false, reason: "此武功不存在" };
  
  // 檢查是否已學
  if (player.skills?.[skillName]) {
    return { success: false, reason: "已學會此武功" };
  }
  
  // 檢查特殊限制
  const restriction = SPECIAL_RESTRICTIONS[skillName];
  if (restriction) {
    if (restriction.type === "self-harm") {
      if (!player.已自宮) {
        return {
          success: false,
          reason: restriction.description,
          option: true,
          optionText: `輸入「自宮」確認（不可逆）`,
          restriction
        };
      }
    } else if (restriction.type === "stat") {
      const statValue = player.stats?.[restriction.stat] || 0;
      if (statValue < restriction.min) {
        return { success: false, reason: `需要${restriction.requirement}` };
      }
    }
  }
  
  // 檢查內功衝突
  const conflict = checkInternalConflict(player, skillName);
  if (conflict?.chance > 15) {
    return {
      success: false,
      reason: `修煉此武功有風險：${conflict.risk}`,
      option: true,
      optionText: `輸入「堅持」強行修煉（${conflict.chance}%走火入魔風險）`,
      conflict
    };
  }
  
  // 學習成功
  player.skills = player.skills || {};
  player.skills[skillName] = {
    ...martialArt,
    realm: "初窺門徑",
    proficiency: 0,
    learnedAt: Date.now()
  };
  
  return { success: true, skill: martialArt };
}

// ============== 導出 ==============
module.exports = {
  MARTIAL_ARTS,
  MARTIAL_ARTS_LIST: Object.keys(MARTIAL_ARTS),
  REALMS,
  REALM_ORDER,
  ATTRIBUTES,
  SPECIAL_RESTRICTIONS,
  WEAPONS,
  
  // 函數
  calculateDamage,
  checkRealmBreakthrough,
  checkInternalConflict,
  innerForceContest,
  practiceSkill,
  learnSkill,
  getQualityRank,
  getRealmProgress,
  findLearnedInternal
};
