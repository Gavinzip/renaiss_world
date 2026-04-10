function createOnboardingProfileUtils(deps = {}) {
  const {
    CORE,
    PET,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    getPetMovePool = () => []
  } = deps;

  function getLanguageText(lang) {
    const texts = {
      'zh-TW': {
        welcome: '歡迎來到 Renaiss 星球！',
        welcomeDesc: '在這個世界，你需要：\n• 選擇你的角色性別並先命名角色\n• 選擇夥伴寵物屬性（水/火/草）並命名寵物\n• 完成開局抽獎後開始探索事件、戰鬥與任務',
        chooseGenderHint: '請先選擇你的角色性別：',
        onboardingFooter: '選完性別先命名角色，再選寵物屬性與寵物名字即可開局',
        male: '男生角色',
        maleDesc: '主角為男性形象，劇情稱謂會對應調整',
        female: '女生角色',
        femaleDesc: '主角為女性形象，劇情稱謂會對應調整',
        chooseElementHint: '請選擇你的起始寵物屬性：',
        water: '水屬性',
        waterDesc: '控制 + 回復 + 持續干擾，節奏穩健',
        fire: '火屬性',
        fireDesc: '爆發 + 壓制 + 反制，節奏強攻',
        grass: '草屬性',
        grassDesc: '防禦 + 毒蝕 + 回復，續戰能力強',
        charNameModalTitle: '📛 為你的角色取個名字',
        charNameLabel: '角色名字',
        charNamePlaceholder: '輸入你在 Renaiss 星球的名字',
        petNameModalTitle: '🐾 為你的寵物取名',
        petNameLabel: '寵物名字',
        petNamePlaceholder: '輸入名字（1-6個字）',
        elementChoiceInvalid: '⚠️ 屬性選擇資料錯誤，請重新操作。'
      },
      'zh-CN': {
        welcome: '欢迎来到 Renaiss 星球！',
        welcomeDesc: '在这个世界，你需要：\n• 选择你的角色性别并先命名角色\n• 选择伙伴宠物属性（水/火/草）并命名宠物\n• 完成开局抽奖后开始探索事件、战斗与任务',
        chooseGenderHint: '请先选择你的角色性别：',
        onboardingFooter: '选完性别先命名角色，再选宠物属性与宠物名字即可开局',
        male: '男生角色',
        maleDesc: '主角为男性形象，剧情称谓会对应调整',
        female: '女生角色',
        femaleDesc: '主角为女性形象，剧情称谓会对应调整',
        chooseElementHint: '请选择你的起始宠物属性：',
        water: '水属性',
        waterDesc: '控制 + 回复 + 持续干扰，节奏稳健',
        fire: '火属性',
        fireDesc: '爆发 + 压制 + 反制，节奏强攻',
        grass: '草属性',
        grassDesc: '防御 + 毒蚀 + 回复，续战能力强',
        charNameModalTitle: '📛 为你的角色取个名字',
        charNameLabel: '角色名字',
        charNamePlaceholder: '输入你在 Renaiss 星球的名字',
        petNameModalTitle: '🐾 为你的宠物取名',
        petNameLabel: '宠物名字',
        petNamePlaceholder: '输入名字（1-6个字）',
        elementChoiceInvalid: '⚠️ 属性选择资料错误，请重新操作。'
      },
      en: {
        welcome: 'Welcome to Renaiss Planet!',
        welcomeDesc: 'In this world, you need to:\n• Choose character gender and name your character first\n• Choose starter pet element (Water / Fire / Grass) and name your pet\n• Finish the starter draw, then begin exploration, battles, and quests',
        chooseGenderHint: 'Choose your character gender first:',
        onboardingFooter: 'Choose gender, name your character, then pick pet element and pet name to start.',
        male: 'Male',
        maleDesc: 'Story pronouns and role narration follow male profile',
        female: 'Female',
        femaleDesc: 'Story pronouns and role narration follow female profile',
        chooseElementHint: 'Choose your starter pet element:',
        water: 'Water',
        waterDesc: 'Control + sustain + chip damage',
        fire: 'Fire',
        fireDesc: 'Burst + pressure + counterattack',
        grass: 'Grass',
        grassDesc: 'Defense + poison + recovery',
        charNameModalTitle: '📛 Name Your Character',
        charNameLabel: 'Character Name',
        charNamePlaceholder: 'Enter your name on Renaiss',
        petNameModalTitle: '🐾 Name Your Pet',
        petNameLabel: 'Pet Name',
        petNamePlaceholder: 'Enter a name (1-6 chars)',
        elementChoiceInvalid: '⚠️ Invalid element selection. Please try again.'
      }
    };
    return texts[lang] || texts['zh-TW'];
  }

  function getWorldIntroTemplate(lang = 'zh-TW') {
    const templates = {
      'zh-TW': [
        '你身在 Renaiss 海域。這片星域由 Renaiss 長年維運，是航道、交易與居住秩序的核心。',
        '但在明面秩序之外，另一股勢力正與既有體系長期角力，雙方在各區節點不斷拉鋸。',
        '主角群由你與你的夥伴寵物展開；你每一次探索、交易、戰鬥、撤退，都會改寫下一段劇情。',
        'Renaiss 的前線核心由 Winchman、Tom、Harry、Kathy、Ryan 協同維持，重點是守住航道與民生據點。',
        '這是開放世界，沒有固定主線按鈕；章節、流言、戰況與角色命運都由你的選擇被動推進。',
        '世界會記住你做過的事，並把後果擴散成所有玩家可見的長期傳聞。'
      ].join('\n'),
      'zh-CN': [
        '你身在 Renaiss 海域。这片星域长期由 Renaiss 维运，是航道、交易与居住秩序的核心。',
        '但在明面秩序之外，另一股势力正与既有体系长期角力，双方在各区节点持续拉锯。',
        '主角群由你与伙伴宠物展开；你每一次探索、交易、战斗、撤退，都会改写下一段剧情。',
        'Renaiss 前线核心由 Winchman、Tom、Harry、Kathy、Ryan 协同维持，重点是守住航道与民生据点。',
        '这是开放世界，没有固定主线按钮；章节、流言、战况与角色命运都由你的选择被动推进。',
        '世界会记住你做过的事，并把后果扩散成所有玩家可见的长期传闻。'
      ].join('\n'),
      en: [
        'You are in the Renaiss Sea, a star region long maintained by Renaiss as the backbone of routes, trade, and civil order.',
        'Beyond the visible order, a rival force keeps contesting that system across multiple regional nodes.',
        'The protagonists are you and your partner creature; each exploration, trade, battle, or retreat rewrites your next chapter.',
        'Renaiss frontline operations are coordinated by Winchman, Tom, Harry, Kathy, and Ryan to keep routes and civilian hubs stable.',
        'This is an open world with no fixed main-story button; chapters, rumors, and outcomes are passively triggered by your choices.',
        'The world remembers your actions and propagates the consequences as shared long-term rumors.'
      ].join('\n')
    };
    return templates[lang] || templates['zh-TW'];
  }

  function consumeWorldIntroOnce(player) {
    if (!player) return '';
    if (player.worldIntroShown) return '';
    player.worldIntroShown = true;
    CORE?.savePlayer?.(player);
    return getWorldIntroTemplate(player.language || 'zh-TW');
  }

  function normalizeCharacterGender(raw = '') {
    const text = String(raw || '').trim().toLowerCase();
    if (text === 'male' || text === 'm' || text === '男') return '男';
    if (text === 'female' || text === 'f' || text === '女') return '女';
    return '男';
  }

  function normalizePetElementCode(raw = '') {
    if (PET && typeof PET.normalizePetElement === 'function') {
      return PET.normalizePetElement(raw);
    }
    const text = String(raw || '').trim();
    if (text === '水' || text === 'water') return '水';
    if (text === '火' || text === 'fire') return '火';
    if (text === '草' || text === 'grass') return '草';
    return '水';
  }

  function getPetElementColor(element = '') {
    const normalized = normalizePetElementCode(element);
    if (normalized === '火') return 0xef4444;
    if (normalized === '草') return 0x22c55e;
    return 0x0ea5e9;
  }

  function getPetElementDisplayName(element = '') {
    const normalized = normalizePetElementCode(element);
    if (normalized === '火') return '火屬性';
    if (normalized === '草') return '草屬性';
    return '水屬性';
  }

  function normalizeKnownBattleElement(raw = '') {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (text === '水' || /^water$/i.test(text) || /水屬性/u.test(text)) return '水';
    if (text === '火' || /^fire$/i.test(text) || /火屬性/u.test(text)) return '火';
    if (text === '草' || /^grass$/i.test(text) || /草屬性/u.test(text)) return '草';
    return '';
  }

  function getBattleElementEmoji(raw = '') {
    const normalized = normalizeKnownBattleElement(raw);
    if (normalized === '水') return '💧';
    if (normalized === '火') return '🔥';
    if (normalized === '草') return '🌿';
    return '🧪';
  }

  function formatBattleElementDisplay(raw = '', fallback = '未知屬性') {
    const text = String(raw || '').trim();
    if (!text) return `❔ ${fallback}`;
    const normalized = normalizeKnownBattleElement(text);
    if (normalized) return `${getBattleElementEmoji(normalized)} ${getPetElementDisplayName(normalized)}`;
    const cleaned = text.replace(/屬性$/u, '').trim();
    const label = cleaned ? `${cleaned}屬性` : fallback;
    return `${getBattleElementEmoji(text)} ${label}`;
  }

  function resolveEnemyBattleElement(enemy = {}) {
    const candidates = [
      enemy?.type,
      enemy?.element,
      enemy?.petElement,
      enemy?.npcPet?.element,
      enemy?.companionPet?.element
    ];
    for (const raw of candidates) {
      const text = String(raw || '').trim();
      if (text) return text;
    }
    return '';
  }

  function getBattleElementRelation(allyRaw = '', enemyRaw = '') {
    const ally = normalizeKnownBattleElement(allyRaw);
    const enemy = normalizeKnownBattleElement(enemyRaw);
    const counter = { 水: '火', 火: '草', 草: '水' };
    if (!ally || !enemy) {
      return {
        state: 'unknown',
        text: '⚖️ 屬性克制：無明確克制（未知屬性）'
      };
    }
    if (counter[ally] === enemy) {
      return {
        state: 'ally_advantage',
        text: '🌟 屬性克制：我方克制敵方（傷害 +20%）'
      };
    }
    if (counter[enemy] === ally) {
      return {
        state: 'enemy_advantage',
        text: '⚠️ 屬性克制：敵方克制我方（對手傷害 +20%）'
      };
    }
    return {
      state: 'neutral',
      text: '⚖️ 屬性克制：互不克制'
    };
  }

  function pickDefaultPetNameByElement(element = '') {
    const normalized = normalizePetElementCode(element);
    const pools = {
      水: ['小潮', '霧霧', '波波', '阿泉', '海璃'],
      火: ['焰焰', '赤星', '小炎', '烬羽', '火仔'],
      草: ['芽芽', '藤藤', '青苔', '小森', '葉寶']
    };
    const list = pools[normalized] || pools['水'];
    return list[Math.floor(Math.random() * list.length)];
  }

  function normalizeCharacterName(raw = '', fallback = '旅人') {
    const text = String(raw || '').trim().slice(0, 20);
    return text || String(fallback || '旅人').slice(0, 20);
  }

  function normalizePetName(raw = '', element = '水') {
    const text = String(raw || '').trim().slice(0, 6);
    return text || pickDefaultPetNameByElement(element);
  }

  function getMoveTierMeta(tier = 1) {
    const safeTier = Math.max(1, Number(tier) || 1);
    if (safeTier >= 3) return { emoji: '🔮', name: '史詩', color: 0x9932cc, rate: '5%' };
    if (safeTier >= 2) return { emoji: '💠', name: '稀有', color: 0x1e90ff, rate: '15%' };
    return { emoji: '⚪', name: '普通', color: 0x808080, rate: '80%' };
  }

  function rollStarterMoveForElement(element = '水') {
    const allMoves = getPetMovePool(element);
    if (!Array.isArray(allMoves) || allMoves.length <= 0) return null;
    const shuffled = [...allMoves].sort(() => Math.random() - 0.5);
    const choices = shuffled.slice(0, 3);
    const roll = Math.random();
    const tierIndex = roll < 0.80 ? 0 : roll < 0.95 ? 1 : 2;
    const tierMoves = choices.filter((m) => Number(m?.tier || 1) === tierIndex + 1);
    const selected = tierMoves.length > 0 ? tierMoves[0] : choices.find((m) => Number(m?.tier || 1) === 1) || choices[0] || null;
    return selected || null;
  }

  function buildGenderSelectionPayload(lang = 'zh-TW', username = '') {
    const langText = getLanguageText(lang);
    const embed = new EmbedBuilder()
      .setTitle(`🌟 ${langText.welcome}`)
      .setColor(0x00ff00)
      .setDescription(`${langText.welcomeDesc}\n\n${langText.chooseGenderHint}`)
      .addFields(
        { name: `♂️ ${langText.male}`, value: langText.maleDesc, inline: true },
        { name: `♀️ ${langText.female}`, value: langText.femaleDesc, inline: true }
      );
    if (username) {
      embed.setFooter({ text: `${username}，${langText.onboardingFooter}` });
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choose_gender_male').setLabel(`♂️ ${langText.male}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('choose_gender_female').setLabel(`♀️ ${langText.female}`).setStyle(ButtonStyle.Secondary)
    );
    return { embed, row };
  }

  function buildElementSelectionPayload(lang = 'zh-TW', gender = '男') {
    const langText = getLanguageText(lang);
    const safeGender = normalizeCharacterGender(gender);
    const roleText = safeGender === '女' ? langText.female : langText.male;
    const embed = new EmbedBuilder()
      .setTitle(`🐾 ${langText.welcome}`)
      .setColor(0x38bdf8)
      .setDescription(`${roleText}\n\n${langText.chooseElementHint}`)
      .addFields(
        { name: `💧 ${langText.water}`, value: langText.waterDesc, inline: true },
        { name: `🔥 ${langText.fire}`, value: langText.fireDesc, inline: true },
        { name: `🌿 ${langText.grass}`, value: langText.grassDesc, inline: true }
      );
    const genderCode = safeGender === '女' ? 'female' : 'male';
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`choose_element_${genderCode}_water`).setLabel(`💧 ${langText.water}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`choose_element_${genderCode}_fire`).setLabel(`🔥 ${langText.fire}`).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`choose_element_${genderCode}_grass`).setLabel(`🌿 ${langText.grass}`).setStyle(ButtonStyle.Success)
    );
    return { embed, row };
  }

  async function showCharacterNameModal(interaction, gender = '男', lang = 'zh-TW') {
    const safeGender = normalizeCharacterGender(gender);
    const genderCode = safeGender === '女' ? 'female' : 'male';
    const langText = getLanguageText(lang);
    const modal = new ModalBuilder()
      .setCustomId(`char_name_submit_${genderCode}`)
      .setTitle(langText.charNameModalTitle);

    const nameInput = new TextInputBuilder()
      .setCustomId('player_name')
      .setLabel(langText.charNameLabel)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(langText.charNamePlaceholder)
      .setRequired(true)
      .setMaxLength(20);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    await interaction.showModal(modal);
  }

  async function showOnboardingPetNameModal(interaction, lang = 'zh-TW') {
    const langText = getLanguageText(lang);
    const modal = new ModalBuilder()
      .setCustomId('pet_onboard_name_submit')
      .setTitle(langText.petNameModalTitle);

    const nameInput = new TextInputBuilder()
      .setCustomId('pet_name')
      .setLabel(langText.petNameLabel)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(langText.petNamePlaceholder)
      .setMinLength(1)
      .setMaxLength(6)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    await interaction.showModal(modal);
  }

  function normalizePlayerAlignment(alignment) {
    const text = String(alignment || '').trim();
    if (!text) return '正派';
    if (text === '反派') return '機變派';
    if (text === '信標聯盟' || text === 'Beacon Union') return '正派';
    if (text === '灰域協定' || text === 'Gray Accord') return '機變派';
    if (text === '正派' || text === '機變派') return text;
    return text;
  }

  function parseNameSubmitProfileFromCustomId(customId = '') {
    const text = String(customId || '').trim();
    const match = text.match(/^name_submit_profile_(male|female)_(water|fire|grass)$/);
    if (match) {
      const gender = match[1] === 'female' ? '女' : '男';
      const element = match[2] === 'fire' ? '火' : match[2] === 'grass' ? '草' : '水';
      return { gender, element, alignment: '正派' };
    }

    const legacyAlignment = normalizePlayerAlignment(text.replace('name_submit_', ''));
    return {
      gender: '男',
      element: '水',
      alignment: legacyAlignment
    };
  }

  function formatAlignmentLabel(alignment) {
    const normalized = normalizePlayerAlignment(alignment);
    if (normalized === '正派') return '信標聯盟';
    if (normalized === '機變派') return '灰域協定';
    return normalized;
  }

  function getAlignmentColor(alignment) {
    return normalizePlayerAlignment(alignment) === '正派' ? 0x00ff00 : 0x3b82f6;
  }

  return {
    getLanguageText,
    getWorldIntroTemplate,
    consumeWorldIntroOnce,
    normalizeCharacterGender,
    normalizePetElementCode,
    getPetElementColor,
    getPetElementDisplayName,
    normalizeKnownBattleElement,
    getBattleElementEmoji,
    formatBattleElementDisplay,
    resolveEnemyBattleElement,
    getBattleElementRelation,
    pickDefaultPetNameByElement,
    normalizeCharacterName,
    normalizePetName,
    getMoveTierMeta,
    rollStarterMoveForElement,
    buildGenderSelectionPayload,
    buildElementSelectionPayload,
    showCharacterNameModal,
    showOnboardingPetNameModal,
    parseNameSubmitProfileFromCustomId,
    normalizePlayerAlignment,
    formatAlignmentLabel,
    getAlignmentColor
  };
}

module.exports = { createOnboardingProfileUtils };
