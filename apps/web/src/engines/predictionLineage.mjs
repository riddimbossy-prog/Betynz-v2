const n = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function selectionView(selection) {
  if (!selection?.market) return null;
  return {
    market: String(selection.market),
    label: selection.label || null,
    odds: n(selection.odds),
    score: n(selection.score),
    grade: selection.grade || null,
    decision: selection.decision || null,
    routeId: selection.routeId || null,
    routeName: selection.routeName || null
  };
}

export function buildPredictionLineage({ rawEngine = {}, oddsGated = {}, dataChecked = {}, recovered = {} } = {}) {
  const original = selectionView(rawEngine?.selection);
  const afterOddsGate = selectionView(oddsGated?.selection);
  const proposedAfterData = selectionView(dataChecked?.proposedSelection || dataChecked?.selection);
  const final = selectionView(recovered?.selection);
  const oddsGate = oddsGated?.oddsGate || null;
  const validation = recovered?.dataValidation || dataChecked?.dataValidation || null;
  const recovery = recovered?.adaptiveRecovery || null;
  return {
    version: 1,
    original,
    oddsGate: oddsGate ? {
      action: oddsGate.action || null,
      accepted: oddsGate.accepted ?? Boolean(afterOddsGate),
      reason: oddsGate.reason || null,
      originalMarket: original?.market || null,
      marketAfterGate: afterOddsGate?.market || null,
      oddsAfterGate: afterOddsGate?.odds || null
    } : null,
    dataValidation: validation ? {
      status: validation.status || null,
      score: n(validation.score),
      market: validation.market || proposedAfterData?.market || null,
      evidenceCount: Number(validation.evidenceCount || 0),
      explanation: validation.explanation || null
    } : null,
    adaptiveRecovery: recovery ? {
      attempted: Boolean(recovery.attempted),
      recovered: Boolean(recovery.recovered),
      conflict: Boolean(recovery.conflict),
      originalMarket: recovery.originalMarket || original?.market || null,
      selectedMarket: recovery.selectedMarket || final?.market || null,
      candidatesChecked: Number(recovery.candidatesChecked || recovery.candidates?.length || 0),
      candidates: Array.isArray(recovery.candidates) ? recovery.candidates.slice(0, 8) : [],
      evaluatedCandidates: Array.isArray(recovery.evaluatedCandidates) ? recovery.evaluatedCandidates.slice(0, 20) : [],
      searchPenalty: n(recovery.searchPenalty),
      reason: recovery.reason || null
    } : { attempted: false, recovered: false },
    final,
    published: Boolean(final && validation?.status === 'BACKED_BY_DATA'),
    finalizedAt: new Date().toISOString()
  };
}
