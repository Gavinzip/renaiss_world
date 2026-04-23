function createFinanceAuditUtils(deps = {}) {
  const { CORE, ECON } = deps;

  function recordCashflow(player, entry = {}) {
    if (!player || typeof player !== 'object') return;
    if (typeof ECON?.appendFinanceLedger !== 'function') return;
    ECON.appendFinanceLedger(player, entry);
  }

  function buildFinanceLedgerText(player, limit = 20) {
    const rows = Array.isArray(player?.financeLedger)
      ? player.financeLedger.slice(0, Math.max(1, Math.min(40, Number(limit) || 20)))
      : [];
    if (rows.length === 0) return '（尚無資金流水）';
    return rows.map((row, idx) => {
      const sign = Number(row?.amount || 0) > 0 ? '+' : '';
      const source = String(row?.source || row?.category || '資金異動').slice(0, 56);
      const bal = Number(row?.balanceAfter || 0);
      return `${idx + 1}. ${sign}${Number(row?.amount || 0)} Rns｜${source}｜餘額 ${bal}`;
    }).join('\n');
  }

  function buildMemoryAuditRows(player, limit = 24) {
    if (!player || typeof CORE?.getPlayerMemoryAudit !== 'function') return [];
    const rows = CORE.getPlayerMemoryAudit(player.id, { limit: Math.max(1, Math.min(60, Number(limit) || 24)) });
    return Array.isArray(rows) ? rows : [];
  }

  function buildMemoryAuditText(rows = [], lang = 'zh-TW') {
    if (!Array.isArray(rows) || rows.length === 0) {
      if (lang === 'ko') return '(메모리 기록이 아직 없습니다)';
      return lang === 'en'
        ? '(No memory records yet)'
        : lang === 'zh-CN'
          ? '（目前没有记忆流水）'
          : '（目前沒有記憶流水）';
    }
    return rows.map((row, idx) => {
      const turn = Math.max(0, Number(row?.turn || 0));
      const category = String(row?.category || '一般記憶');
      const reason = String(row?.reason || '系統判定需保留').slice(0, 44);
      const content = String(row?.content || '').slice(0, 56) || '（空白）';
      const outcome = String(row?.outcome || '').trim();
      const outcomeText = outcome ? ` -> ${outcome.slice(0, 36)}` : '';
      return `${idx + 1}. [T${turn}]【${category}】${content}${outcomeText}\n　└ 理由：${reason}`;
    }).join('\n');
  }

  return {
    recordCashflow,
    buildFinanceLedgerText,
    buildMemoryAuditRows,
    buildMemoryAuditText
  };
}

module.exports = { createFinanceAuditUtils };
