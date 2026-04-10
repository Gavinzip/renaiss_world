function createNumberFormatUtils() {
  function getMarketTypeLabel(marketType = 'renaiss') {
    return String(marketType || '').trim().toLowerCase() === 'digital'
      ? '神秘鑑價站'
      : '鑑價站';
  }

  function formatFinanceAmount(amount = 0) {
    const num = Math.floor(Number(amount || 0));
    if (!Number.isFinite(num)) return '0';
    return `${num > 0 ? '+' : ''}${num}`;
  }

  function round1(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return Number(fallback) || 0;
    return Math.round(num * 10) / 10;
  }

  function format1(value, fallback = 0) {
    return String(Math.round(round1(value, fallback)));
  }

  function getMoveSpeedValue(move = {}) {
    const raw = Number(move?.speed);
    if (Number.isFinite(raw)) {
      if (raw >= 1 && raw <= 20) return Math.max(1, Math.min(20, Math.floor(raw)));
      const legacyMap = { '-1': 4, '0': 10, '1': 13, '2': 16, '3': 20 };
      const mapped = Number(legacyMap[String(Math.floor(raw))] || 0);
      if (mapped > 0) return mapped;
    }
    const legacyPriorityMap = { '-1': 4, '0': 10, '1': 13, '2': 16, '3': 20 };
    const mappedPriority = Number(legacyPriorityMap[String(Math.floor(Number(move?.priority || 0)))] || 0);
    if (mappedPriority > 0) return mappedPriority;
    return 10;
  }

  return {
    getMarketTypeLabel,
    formatFinanceAmount,
    round1,
    format1,
    getMoveSpeedValue
  };
}

module.exports = {
  createNumberFormatUtils
};
