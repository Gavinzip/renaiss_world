function createChoiceRenderUtils(deps = {}) {
  const {
    CORE,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    appendMainMenuUtilityButtons,
    CHOICE_DISPLAY_COUNT = 5,
    CUSTOM_INPUT_OPTION_RATE = 0.01,
    STORY_THREAT_SCORE_THRESHOLD = 38,
    buildEnemyForBattle,
    estimateBattleOutcome,
    format1
  } = deps;

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
    return /[（(]\s*會進入戰鬥\s*[)）]/u.test(text) || /(即時戰鬥|立刻開打|立即戰鬥)/u.test(text);
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
    return /[（(]\s*會進入戰鬥\s*[)）]/u.test(text) || /(即時戰鬥|立刻開打|立即戰鬥)/u.test(text);
  }

  function ensureBattleMarkerSuffix(text, choice) {
    const source = String(text || '').trim();
    if (!source) return source;
    if (!isImmediateBattleChoice(choice)) return source;
    if (/[（(]\s*會進入戰鬥\s*[)）]/u.test(source)) return source;
    return `${source}（會進入戰鬥）`;
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
    if (/(🔥|高風險)/u.test(tagText)) return 'high_risk';
    if (/(💰|需花錢|花費|購買|買入)/u.test(tagText)) return 'spend';
    if (/(🤝|需社交|社交|交談|談判)/u.test(tagText)) return 'social';
    if (/(🔍|需探索|探索|搜尋|調查)/u.test(tagText)) return 'explore';
    if (/(⚔️|會戰鬥|戰鬥|對戰|決鬥)/u.test(tagText)) return 'combat';
    if (/(🎁|高回報|豐厚回報|報酬高)/u.test(tagText)) return 'high_reward';
    if (/(❓|有驚喜|未知|奇遇|傳送|許願)/u.test(tagText)) return 'surprise';
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
      .replace(/^(探索|社交|戰鬥|購買|花錢|高風險|高回報|驚喜|傳送|許願)[：:]\s*/u, '');
    return clean.trim();
  }

  function stripImmediateBattleMarker(text) {
    let cleaned = String(text || '').trim();
    if (!cleaned) return cleaned;
    cleaned = cleaned
      .replace(/[（(]\s*會進入戰鬥(?:｜[^)）]+)?\s*[)）]/gu, '')
      .replace(/(?:，|、)?\s*(即時戰鬥|立刻開打|立即戰鬥)\s*/gu, ' ')
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
    const cleanedChoice = stripImmediateBattleMarker(rawChoice);
    next.choice = cleanedChoice || `${rawChoice}（先偵查局勢）`;
    next.desc = stripImmediateBattleMarker(String(next.desc || '').trim()) || '先觀察局勢並整備，必要時再戰。';
    if (String(next.action || '') === 'fight') {
      next.action = 'conflict';
    }
    if (/[⚔️]/u.test(String(next.tag || '')) || /會戰鬥/u.test(String(next.tag || ''))) {
      next.tag = '[🔥高風險]';
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
    const styleTag = String(choice?.styleTag || '').replace(/[【】\[\]]/g, '').trim().slice(0, 6);
    const base = ensureBattleMarkerSuffix(clean || raw, choice);
    if (!styleTag) return base;
    if (String(base || '').includes(`【${styleTag}】`)) return base;
    return `【${styleTag}】${base}`;
  }

  function createCustomInputChoice() {
    return {
      id: `custom_input_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: '✍️ 自訂行動',
      choice: '＿＿＿＿（自行輸入接下來要做的事）',
      desc: '你可自行輸入接下來想進行的行動',
      action: 'custom_input',
      type: 'custom'
    };
  }

  function maybeInjectRareCustomInputChoice(choices = []) {
    const base = Array.isArray(choices) ? choices.filter(Boolean).slice(0, CHOICE_DISPLAY_COUNT) : [];
    if (base.length === 0) return base;
    if (base.some(choice => String(choice?.action || '') === 'custom_input')) return base;
    if (Math.random() >= CUSTOM_INPUT_OPTION_RATE) return base;

    const injected = [...base];
    const replaceIndex = Math.max(0, injected.length - 1);
    injected[replaceIndex] = createCustomInputChoice();
    return injected;
  }

  function buildBattlePreviewHint(choice, context = {}) {
    if (!isImmediateBattleChoice(choice)) return '';
    if (String(choice?.action || '') === 'mentor_spar') {
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
    return `預估:${estimate.rank} ${typeof format1 === 'function' ? format1(estimate.winRate) : estimate.winRate}%`;
  }

  function appendBattlePreviewToChoice(text, choice, context = {}) {
    const source = String(text || '').trim();
    if (!source) return source;
    const hint = buildBattlePreviewHint(choice, context);
    if (!hint) return source;

    if (/[（(]\s*會進入戰鬥\s*[)）]/u.test(source)) {
      return source.replace(/[（(]\s*會進入戰鬥\s*[)）]/u, `（會進入戰鬥｜${hint}）`);
    }
    return `${source}（會進入戰鬥｜${hint}）`;
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
      const label = (formatChoiceText(choice) || `選項${i + 1}`).substring(0, 20).trim();
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
