export function accessMapView(result, mode = 'baseline') {
  if (mode === 'baseline') return { ...result, viewLabel: 'Current access' };
  const ids = mode === 'scenario' ? result.scenario.selectedCandidateIds : result.decision?.selectedCandidateIds || [];
  const reached = new Set(result.candidates.filter(site => ids.includes(site.id)).flatMap(site => site.settlementIds));
  return { ...result, viewLabel: mode === 'scenario' ? 'Selected scenario access' : 'Recommended option access',
    settlements: result.settlements.map(row => row.status !== 'covered' && reached.has(JSON.stringify([row.areaId, row.settlementId])) ? { ...row, status: 'covered', minutes: null, scenarioReached: true } : row) };
}
