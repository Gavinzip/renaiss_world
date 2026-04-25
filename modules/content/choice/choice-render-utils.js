function createChoiceRenderUtils(deps = {}) {
  const {
    CORE,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    normalizeLangCode = (v) => String(v || 'zh-TW'),
    getLanguageSection = null,
    appendMainMenuUtilityButtons,
    CHOICE_DISPLAY_COUNT = 5,
    CUSTOM_INPUT_OPTION_RATE = 0.01,
    STORY_THREAT_SCORE_THRESHOLD = 38,
    buildEnemyForBattle,
    estimateBattleOutcome,
    format1
  } = deps;

  const IMMEDIATE_BATTLE_MARKER_RE = /[（(]\s*(?:會進入戰鬥|会进入战斗|전투\s*진입|Immediate\s*battle)\s*(?:｜[^)）]+)?\s*[)）]/iu;
  const IMMEDIATE_BATTLE_KEYWORD_RE = /(即時戰鬥|即时战斗|立刻開打|立刻开打|立即戰鬥|立即战斗|즉시\s*전투|바로\s*전투|immediate\s*battle)/iu;
  const KOREAN_CHAR_RE = /[가-힣]/u;
  const CJK_CHAR_RE = /[\u3400-\u9FFF]/u;
  const STYLE_TAG_LABELS = Object.freeze({
    ko: Object.freeze({
      '穩健': '안정',
      '交涉': '협상',
      '灰線': '회색선',
      '強奪': '강탈',
      '追獵': '추적',
      '佈局': '포석'
    }),
    en: Object.freeze({
      '穩健': 'Steady',
      '交涉': 'Negotiate',
      '灰線': 'Grayline',
      '強奪': 'Raid',
      '追獵': 'Hunt',
      '佈局': 'Setup'
    })
  });

  const CHOICE_UI_FALLBACK = Object.freeze({
    'zh-TW': Object.freeze({
      customInputName: '✍️ 自訂行動',
      customInputChoice: '＿＿＿＿（自行輸入接下來要做的事）',
      customInputDesc: '你可自行輸入接下來想進行的行動',
      choiceFallbackLabel: (index) => `選項${index}`
    }),
    'zh-CN': Object.freeze({
      customInputName: '✍️ 自定义行动',
      customInputChoice: '＿＿＿＿（自行输入接下来要做的事）',
      customInputDesc: '你可以自行输入接下来想进行的行动',
      choiceFallbackLabel: (index) => `选项${index}`
    }),
    en: Object.freeze({
      customInputName: '✍️ Custom Action',
      customInputChoice: '＿＿＿＿(Enter your next action)',
      customInputDesc: 'Write the next action you want to take.',
      choiceFallbackLabel: (index) => `Option ${index}`
    }),
    ko: Object.freeze({
      customInputName: '✍️ 사용자 행동',
      customInputChoice: '＿＿＿＿(다음 행동을 직접 입력)',
      customInputDesc: '다음에 하고 싶은 행동을 직접 입력할 수 있습니다.',
      choiceFallbackLabel: (index) => `선택 ${index}`
    })
  });

  function getChoiceUiText(lang = 'zh-TW') {
    const code = normalizeLangCode(lang || 'zh-TW');
    if (typeof getLanguageSection === 'function') {
      const fromGlobal = getLanguageSection('uiText', code);
      if (fromGlobal && typeof fromGlobal === 'object' && Object.keys(fromGlobal).length > 0) {
        return fromGlobal;
      }
    }
    return CHOICE_UI_FALLBACK[code] || CHOICE_UI_FALLBACK['zh-TW'];
  }

  function detectTextLang(text = '') {
    const source = String(text || '');
    if (KOREAN_CHAR_RE.test(source)) return 'ko';
    if (!CJK_CHAR_RE.test(source) && /[A-Za-z]/.test(source)) return 'en';
    return 'zh-TW';
  }

  function localizeStyleTag(styleTag = '', text = '') {
    const source = String(styleTag || '').trim();
    if (!source) return '';
    const langCode = detectTextLang(text);
    const table = STYLE_TAG_LABELS[langCode];
    if (!table || typeof table !== 'object') return source;
    return table[source] || source;
  }

  function getImmediateBattleMarkerForText(text = '') {
    const source = String(text || '');
    if (KOREAN_CHAR_RE.test(source)) return '（전투 진입）';
    if (!CJK_CHAR_RE.test(source) && /[A-Za-z]/.test(source)) return '(Immediate battle)';
    return '（會進入戰鬥）';
  }

  function isCombatChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    if (String(choice.action || '') === 'fight' || String(choice.action || '') === 'mentor_spar') return true;
    const hintText = [
      choice.tag || '',
      choice.name || '',
      choice.choice || '',
      choice.desc || ''
    ].join(' ');
    return /(⚔️|會戰鬥|戰鬥|對戰|決鬥|迎戰|開打|討伐|搏鬥|fight|combat)/i.test(hintText);
  }

  function isBuyChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    const action = String(choice.action || '');
    if (['market_renaiss', 'market_digital', 'scratch_lottery', 'shop', 'buy', 'purchase'].includes(action)) return true;
    const hintText = [
      choice.tag || '',
      choice.name || '',
      choice.choice || '',
      choice.desc || ''
    ].join(' ');
    return /(💰|購買|買入|商店|賣場|市場|市集|鑑價|交易|shop|market|store|buy|purchase)/i.test(hintText);
  }

  function isImmediateBattleChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    if (
      String(choice.action || '') === 'fight' ||
      String(choice.action || '') === 'mentor_spar' ||
      String(choice.action || '') === 'location_story_battle'
    ) return true;
    const text = [
      choice.tag || '',
      choice.name || '',
      choice.choice || '',
      choice.desc || ''
    ].join(' ');
    return IMMEDIATE_BATTLE_MARKER_RE.test(text) || IMMEDIATE_BATTLE_KEYWORD_RE.test(text);
  }

  function isHostileImmediateBattleChoice(choice) {
    if (!choice || typeof choice !== 'object') return false;
    if (String(choice.action || '') === 'mentor_spar') return false;
    if (String(choice.action || '') === 'fight' || String(choice.action || '') === 'location_story_battle') return true;
    const text = [
      choice.tag || '',
      choice.name || '',
      choice.choice || '',
      choice.desc || ''
    ].join(' ');
    if (/(友誼賽|切磋|比試)/u.test(text)) return false;
    return IMMEDIATE_BATTLE_MARKER_RE.test(text) || IMMEDIATE_BATTLE_KEYWORD_RE.test(text);
  }

  function ensureBattleMarkerSuffix(text, choice) {
    const source = String(text || '').trim();
    if (!source) return source;
    if (!isImmediateBattleChoice(choice)) return source;
    if (IMMEDIATE_BATTLE_MARKER_RE.test(source)) return source;
    return `${source}${getImmediateBattleMarkerForText(source)}`;
  }

  function getChoiceRiskCategory(choice) {
    if (!choice || typeof choice !== 'object') return 'unknown';
    const action = String(choice.action || '');
    if (action === 'fight' || action === 'mentor_spar') return 'combat';
    if (['market_renaiss', 'market_digital', 'scratch_lottery', 'shop', 'buy', 'purchase'].includes(action)) return 'spend';
    if (action === 'wish_pool' || action === 'portal_intent') return 'surprise';

    const tagText = [
      choice.tag || '',
      choice.name || '',
      choice.choice || '',
      choice.desc || ''
    ].join(' ');
    if (/(🔥|高風險|高风险|high\s*risk)/iu.test(tagText)) return 'high_risk';
    if (/(💰|需花錢|需花钱|花費|花费|購買|购买|買入|costs?\s*money|spend)/iu.test(tagText)) return 'spend';
    if (/(🤝|需社交|社交|交談|交谈|談判|谈判|social|friendly\s*spar)/iu.test(tagText)) return 'social';
    if (/(🔍|需探索|探索|搜尋|搜寻|調查|调查|explore)/iu.test(tagText)) return 'explore';
    if (/(⚔️|會戰鬥|会战斗|戰鬥|战斗|對戰|对战|決鬥|决斗|combat)/iu.test(tagText)) return 'combat';
    if (/(🎁|高回報|高回报|豐厚回報|丰厚回报|報酬高|high\s*reward)/iu.test(tagText)) return 'high_reward';
    if (/(❓|有驚喜|有惊喜|未知|奇遇|傳送|传送|許願|许愿|uncertain|surprise)/iu.test(tagText)) return 'surprise';
    return 'unknown';
  }

  function stripChoicePrefix(text) {
    let clean = String(text || '').trim();
    if (!clean) return '';
    clean = clean
      .replace(/^\[[^\]]{1,16}\]\s*/u, '')
      .replace(/^【[^】]{1,16}】\s*/u, '')
      .replace(/^（[^）]{1,16}）\s*/u, '')
      .replace(/^[\p{Extended_Pictographic}]+\s*/u, '')
      .replace(/^(探索|社交|戰鬥|战斗|購買|购买|花錢|花钱|高風險|高风险|高回報|高回报|驚喜|惊喜|傳送|传送|許願|许愿|Explore|Social|Combat|Costs Money|High Risk|High Reward|Uncertain)[：:]\s*/iu, '');
    return clean.trim();
  }

  function stripImmediateBattleMarker(text) {
    let cleaned = String(text || '').trim();
    if (!cleaned) return cleaned;
    cleaned = cleaned
      .replace(/[（(]\s*(?:會進入戰鬥|会进入战斗|전투\s*진입|Immediate\s*battle)(?:｜[^)）]+)?\s*[)）]/giu, '')
      .replace(/(?:，|、)?\s*(即時戰鬥|即时战斗|立刻開打|立刻开打|立即戰鬥|立即战斗|즉시\s*전투|바로\s*전투|immediate\s*battle)\s*/giu, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return cleaned;
  }

  function extractStoryEndingFocus(story = '') {
    const text = String(story || '').trim();
    if (!text) return '';
    const chunks = text
      .split(/\n+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (chunks.length === 0) return text.slice(-220);
    const tail = chunks.slice(-3).join('\n');
    return tail || text.slice(-220);
  }

  function computeStoryThreatScore(story = '') {
    const text = extractStoryEndingFocus(story);
    if (!text) return 0;

    const heavyRules = [
      /殺機|追殺|伏擊|突襲|夜襲|追兵|圍攻|獵手|刺客/gu,
      /開戰|交戰|決戰|血戰|對峙|火拼|廝殺/gu,
      /敵人|敵方|仇家|威脅升級|失控|崩潰/gu
    ];
    const mediumRules = [
      /危險|危機|警示|衝突|對抗|埋伏|不妙/gu,
      /可疑|異常|緊張|壓迫感|不安|騷動/gu
    ];
    const calmRules = [
      /補給|休整|交談|閒聊|交易|觀察|談判|勘查|巡查/gu
    ];

    let score = 0;
    for (const pattern of heavyRules) {
      const count = (text.match(pattern) || []).length;
      score += Math.min(3, count) * 18;
    }
    for (const pattern of mediumRules) {
      const count = (text.match(pattern) || []).length;
      score += Math.min(4, count) * 8;
    }
    for (const pattern of calmRules) {
      const count = (text.match(pattern) || []).length;
      score -= Math.min(3, count) * 6;
    }

    return Math.max(0, Math.min(100, score));
  }

  function downgradeImmediateBattleChoice(choice) {
    if (!choice || typeof choice !== 'object') return choice;
    if (!isHostileImmediateBattleChoice(choice)) return choice;
    const next = { ...choice };
    const rawChoice = String(next.choice || next.name || '').trim();
    const langCode = detectTextLang([next.choice || '', next.name || '', next.desc || ''].join(' '));
    const cleanedChoice = stripImmediateBattleMarker(rawChoice);
    next.choice = cleanedChoice || (
      langCode === 'en'
        ? `${rawChoice}(Scout first)`
        : (langCode === 'ko' ? `${rawChoice}(먼저 정찰)` : `${rawChoice}（先偵查局勢）`)
    );
    next.desc = stripImmediateBattleMarker(String(next.desc || '').trim()) || (
      langCode === 'en'
        ? 'Observe and regroup first, then fight if needed.'
        : (langCode === 'ko' ? '먼저 상황을 관찰하고 정비한 뒤, 필요하면 교전한다.' : '先觀察局勢並整備，必要時再戰。')
    );
    if (String(next.action || '') === 'fight') {
      next.action = 'conflict';
    }
    if (/[⚔️]/u.test(String(next.tag || '')) || /會戰鬥/u.test(String(next.tag || ''))) {
      next.tag = langCode === 'en' || langCode === 'ko' ? '[🔥High Risk]' : '[🔥高風險]';
    }
    return next;
  }

  function applyStoryThreatGate(player, choices = []) {
    const list = Array.isArray(choices) ? choices.filter(Boolean) : [];
    if (list.length === 0) return list;
    const storyText = String(player?.currentStory || player?.generationState?.storySnapshot || '').trim();
    const threatScore = computeStoryThreatScore(storyText);
    const allowImmediateBattle = threatScore >= STORY_THREAT_SCORE_THRESHOLD;
    if (allowImmediateBattle) return list;
    return list.map((choice) => {
      if (choice?.forceImmediateBattle) return choice;
      return downgradeImmediateBattleChoice(choice);
    });
  }

  function formatChoiceText(choice) {
    const raw = String(choice?.choice || choice?.name || '').trim();
    if (!raw || raw === 'true' || raw === 'false') return '';
    const clean = stripChoicePrefix(raw);
    const styleTagRaw = String(choice?.styleTag || '').replace(/[【】\[\]]/g, '').trim().slice(0, 6);
    const base = ensureBattleMarkerSuffix(clean || raw, choice);
    const styleTag = localizeStyleTag(styleTagRaw, base || clean || raw);
    if (!styleTag) return base;
    if (String(base || '').includes(`【${styleTag}】`)) return base;
    return `【${styleTag}】${base}`;
  }

  function createCustomInputChoice(context = {}) {
    const uiText = getChoiceUiText(context?.player?.language || context?.lang || 'zh-TW');
    return {
      id: `custom_input_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: uiText.customInputName,
      choice: uiText.customInputChoice,
      desc: uiText.customInputDesc,
      action: 'custom_input',
      type: 'custom'
    };
  }

  function maybeInjectRareCustomInputChoice(choices = [], context = {}) {
    const base = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (base.length === 0) return base;
    if (base.some(choice => String(choice?.action || '') === 'custom_input')) return base;
    if (Math.random() >= CUSTOM_INPUT_OPTION_RATE) return base;

    const injected = [...base];
    const replaceIndex = Math.max(0, injected.length - 1);
    injected[replaceIndex] = createCustomInputChoice(context);
    return injected;
  }

  function buildBattlePreviewHint(choice, context = {}) {
    if (!isImmediateBattleChoice(choice)) return '';
    const langCode = detectTextLang([choice?.choice || '', choice?.name || '', choice?.desc || ''].join(' '));
    if (String(choice?.action || '') === 'mentor_spar') {
      if (langCode === 'en') return 'Friendly spar | lower mentor HP to pass';
      if (langCode === 'ko') return '우호 대련 | 멘토 HP를 낮추면 통과';
      return '友誼賽｜壓低導師血量即可通過';
    }
    const player = context?.player;
    const pet = context?.pet;
    if (!player || !pet) return '';

    const previewEnemy = typeof buildEnemyForBattle === 'function'
      ? buildEnemyForBattle(
          choice,
          { enemy: choice?.enemy || {} },
          player,
          { deterministicFallback: true }
        )
      : null;
    if (!previewEnemy || typeof estimateBattleOutcome !== 'function') return '';

    const fighterType = CORE?.canPetFight?.(pet) ? 'pet' : 'player';
    const estimate = estimateBattleOutcome(player, pet, previewEnemy, fighterType);
    const winRate = typeof format1 === 'function' ? format1(estimate.winRate) : estimate.winRate;
    if (langCode === 'en') return `Est:${estimate.rank} ${winRate}%`;
    if (langCode === 'ko') return `예측:${estimate.rank} ${winRate}%`;
    return `預估:${estimate.rank} ${winRate}%`;
  }

  function appendBattlePreviewToChoice(text, choice, context = {}) {
    const source = String(text || '').trim();
    if (!source) return source;
    const hint = buildBattlePreviewHint(choice, context);
    if (!hint) return source;

    if (IMMEDIATE_BATTLE_MARKER_RE.test(source)) {
      const marker = getImmediateBattleMarkerForText(source);
      return source.replace(IMMEDIATE_BATTLE_MARKER_RE, `${marker.slice(0, -1)}｜${hint}${marker.endsWith('）') ? '）' : ')'}`);
    }
    const marker = getImmediateBattleMarkerForText(source);
    return `${source}${marker.slice(0, -1)}｜${hint}${marker.endsWith('）') ? '）' : ')'}`;
  }

  function buildChoiceOptionsText(choices = [], context = {}) {
    let optionsText = '';
    choices.slice(0, CHOICE_DISPLAY_COUNT).forEach((choice, i) => {
      const text = appendBattlePreviewToChoice(formatChoiceText(choice), choice, context);
      if (!text) return;
      optionsText += `\n${i + 1}. ${text}`;
    });
    return optionsText;
  }

  function buildEventChoiceButtons(choices = [], ownerId = '') {
    const safeOwnerId = String(ownerId || '').trim();
    return choices.slice(0, CHOICE_DISPLAY_COUNT).map((choice, i) => {
      const lang = choice?.language || detectTextLang([choice?.choice || '', choice?.name || '', choice?.desc || ''].join(' '));
      const uiText = getChoiceUiText(lang);
      const label = (formatChoiceText(choice) || uiText.choiceFallbackLabel(i + 1)).substring(0, 20).trim();
      return new ButtonBuilder()
        .setCustomId(safeOwnerId ? `event_${i}_${safeOwnerId}` : `event_${i}`)
        .setLabel(label || `${i + 1}`)
        .setStyle(ButtonStyle.Primary);
    });
  }

  async function tryRecoverEventButtonsAfterFailure(interaction, userId, handlers = {}) {
    const channel = interaction?.channel;
    if (!channel || !userId) return false;
    const player = CORE?.loadPlayer?.(userId);
    if (!player) return false;

    const rawChoices = Array.isArray(player.eventChoices) ? player.eventChoices : [];
    if (rawChoices.length <= 0) return false;

    const normalizeEventChoices = handlers.normalizeEventChoices;
    const applyChoicePolicy = handlers.applyChoicePolicy;
    if (typeof normalizeEventChoices !== 'function' || typeof applyChoicePolicy !== 'function') return false;

    const normalizedChoices = applyChoicePolicy(player, normalizeEventChoices(player, rawChoices));
    if (!Array.isArray(normalizedChoices) || normalizedChoices.length <= 0) return false;

    const changed =
      normalizedChoices.length !== rawChoices.length ||
      normalizedChoices.some((choice, idx) => choice !== rawChoices[idx]);
    if (changed) {
      player.eventChoices = normalizedChoices;
      CORE?.savePlayer?.(player);
    }

    const buttons = buildEventChoiceButtons(normalizedChoices, player.id);
    if (typeof appendMainMenuUtilityButtons === 'function') {
      appendMainMenuUtilityButtons(buttons, player);
    }
    const components = [];
    for (let i = 0; i < buttons.length; i += 5) {
      components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    if (components.length <= 0) return false;

    await interaction.editReply({
      content: '⚠️ 互動處理失敗，已恢復可用按鈕，請再按一次。',
      components
    }).catch(() => {});
    return true;
  }

  return {
    isCombatChoice,
    isBuyChoice,
    isImmediateBattleChoice,
    isHostileImmediateBattleChoice,
    ensureBattleMarkerSuffix,
    getChoiceRiskCategory,
    stripChoicePrefix,
    stripImmediateBattleMarker,
    extractStoryEndingFocus,
    computeStoryThreatScore,
    downgradeImmediateBattleChoice,
    applyStoryThreatGate,
    formatChoiceText,
    createCustomInputChoice,
    maybeInjectRareCustomInputChoice,
    buildBattlePreviewHint,
    appendBattlePreviewToChoice,
    buildChoiceOptionsText,
    buildEventChoiceButtons,
    tryRecoverEventButtonsAfterFailure
  };
}

module.exports = { createChoiceRenderUtils };
