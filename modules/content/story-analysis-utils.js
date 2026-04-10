function createStoryAnalysisUtils() {
  function detectStitchedBattleStory(story = '') {
    const text = String(story || '').trim();
    if (!text) return false;
    const patterns = [
      /你先前的決定[:：]/u,
      /你剛做出的行動[:：]/u,
      /現場結果[:：]/u,
      /戰況摘要[:：]/u,
      /戰場餘波未散/u
    ];
    let hits = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) hits += 1;
    }
    return hits >= 3;
  }

  function extractBattleChoiceHintFromStory(story = '') {
    const text = String(story || '');
    const matched =
      text.match(/你先前的決定[:：]\s*([^\n]{2,160})/u) ||
      text.match(/你剛做出的行動[:：]\s*([^\n]{2,160})/u);
    const choice = String(matched?.[1] || '').trim();
    return choice.slice(0, 160);
  }

  return {
    detectStitchedBattleStory,
    extractBattleChoiceHintFromStory
  };
}

module.exports = {
  createStoryAnalysisUtils
};

