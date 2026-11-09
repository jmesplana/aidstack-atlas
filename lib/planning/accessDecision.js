// Recommend complementary sites from the evaluated candidates. Every demand
// location is counted once, and unknown baseline access stays explicit.
export function buildAccessDecision(result) {
  const budget = result.settings.siteBudget ?? 3;
  if (!Number.isInteger(budget) || budget < 1 || budget > 10) throw new Error('Choose between 1 and 10 outreach sites.');
  const rows = new Map(result.settlements.map(row => [JSON.stringify([row.areaId, row.settlementId]), row]));
  const reached = new Set(), remaining = [...result.candidates], steps = [];
  let covered = result.totals.covered, knownGain = 0, unknownGain = 0;
  const measure = candidate => {
    let additional = 0, unknown = 0, overlap = 0;
    for (const key of new Set(candidate.settlementIds)) {
      const row = rows.get(key);
      if (!row || row.status === 'covered') continue;
      if (reached.has(key)) overlap += row.population;
      else if (row.status === 'unknown') unknown += row.population;
      else additional += row.population;
    }
    return { additional, unknown, overlap, gain: additional + unknown };
  };
  while (steps.length < budget && remaining.length) {
    const ranked = remaining.map(candidate => ({ candidate, ...measure(candidate) }))
      .sort((a, b) => b.gain - a.gain || b.additional - a.additional || a.candidate.id.localeCompare(b.candidate.id));
    const best = ranked[0];
    if (!(best.gain > 0)) break;
    const { candidate, additional, unknown, overlap, gain } = best;
    candidate.settlementIds.forEach(key => reached.add(key));
    knownGain += additional; unknownGain += unknown; covered += gain;
    steps.push({ id: candidate.id, name: candidate.name, order: steps.length + 1, additionalPopulation: additional,
      reachableFromUnknown: unknown, overlapPopulation: overlap, cumulativeCoverage: covered,
      remainingBeyondThreshold: Math.max(0, result.totals.beyondThreshold - knownGain), remainingUnknown: Math.max(0, result.totals.unknown - unknownGain) });
    remaining.splice(remaining.indexOf(candidate), 1);
  }
  const missingServiceAreas = result.scope.areas.filter(area => !result.existingSites.some(site => site.areaId === area.id)).map(area => area.name);
  const issues = [];
  if (missingServiceAreas.length) issues.push(`No included existing service in: ${missingServiceAreas.join(', ')}. This is a gap in the included facility list, not proof that no facilities exist.`);
  if (!result.settings.facilitiesReviewed) issues.push('The included facility list and vaccination-service availability have not been confirmed by the planning team.');
  if (result.totals.population > 0 && result.totals.covered === 0 && result.existingSites.length) issues.push('None of the modeled population is within the threshold of the included services. Verify facility coordinates, completeness, travel mode and threshold before interpreting this as an access gap.');
  if (result.populationCoverage?.year > new Date().getFullYear()) issues.push(`The population denominator is a ${result.populationCoverage.year} future projection.`);
  if (result.totals.unknown > 0) issues.push('Some baseline travel times are unknown; newly reachable population is reported separately from confirmed access gains.');
  if (result.populationCoverage?.missingCells > 0) issues.push(`${result.populationCoverage.missingCells} cells lack population estimates and are excluded from the denominator.`);
  if (result.settings.facilityDiscoveryWarnings?.length) issues.push(...result.settings.facilityDiscoveryWarnings);
  const cohort = result.settings.populationCohort?.label || 'All residents';
  return { method: 'greedy-additional-reach-v1', budget, cohort, status: issues.length ? 'provisional' : 'ready-for-local-review', issues,
    objective: 'Maximize additional modeled population within the travel threshold among the evaluated candidates.',
    selectedCandidateIds: steps.map(s => s.id), steps, additionalPopulation: knownGain, reachableFromUnknown: unknownGain,
    coveredPopulation: covered, coveragePercent: result.totals.population > 0 ? 100 * covered / result.totals.population : null,
    remainingBeyondThreshold: Math.max(0, result.totals.beyondThreshold - knownGain), remainingUnknown: Math.max(0, result.totals.unknown - unknownGain),
    alternatives: remaining.map(c => ({ id: c.id, name: c.name, ...measure(c) })),
    interpretation: 'Geographic reach is not vaccination uptake, a count of unvaccinated people, or service capacity. Confirm eligibility, missed doses, venues, safety, teams, supplies and cold chain before deployment.',
    nextAction: issues.length ? 'Validate the facility list and flagged evidence, then recalculate before approving deployment.' : steps.length ? 'Field-check the proposed venues and prepare session resources and schedules for local approval.' : 'No additional modeled reach was found among these candidates. Review remaining gaps and test other locations or delivery approaches.',
  };
}

export function accessDecisionText(result) {
  const d = result.decision;
  if (!d) throw new Error('Recalculate this assessment to create a decision brief.');
  const n = value => value.toLocaleString('en', { maximumFractionDigits: 0 });
  return [
    'OUTREACH DECISION BRIEF', `Computed: ${result.computedAt}`, `Areas: ${result.scope.areas.map(a => a.name).join(', ')}`,
    `Status: ${d.status}`, `Population: ${d.cohort}; reference date ${result.sources.populationDate}`,
    `Travel: ${result.settings.mode}; ${result.settings.thresholdMinutes} minutes`, `Site limit: ${d.budget}`,
    `Existing services included: ${result.existingSites.length}; baseline coverage ${n(result.totals.covered)} of ${n(result.totals.population)}`,
    '', 'PROPOSED COMPLEMENTARY SITES',
    ...d.steps.map(s => `${s.order}. ${s.name}: ${n(s.additionalPopulation)} additional people; ${n(s.reachableFromUnknown)} newly reachable with unknown baseline; ${n(s.overlapPopulation)} overlap with earlier sites; ${n(s.cumulativeCoverage)} cumulative coverage.`),
    `Remaining: ${n(d.remainingBeyondThreshold)} beyond threshold; ${n(d.remainingUnknown)} unknown access.`,
    '', 'EVIDENCE TO RESOLVE', ...(d.issues.length ? d.issues : ['Field review and operational readiness checks remain required.']),
    '', `NEXT ACTION: ${d.nextAction}`, `Decision owner: ${result.settings.decisionOwner || 'Not assigned'}`, `Review by: ${result.settings.reviewDate || 'Not set'}`,
    `Delivery constraints: ${result.settings.deliveryConstraints || 'Not recorded'}`, d.interpretation,
    'Confirm eligible unvaccinated people, venues, community acceptance, teams, dates, vaccine supplies, cold chain, transport and security.',
    '', 'SOURCES', `Population: ${result.sources.population}`, `Travel: ${result.sources.roads} (${result.sources.roadsDate})`, `Services: ${result.sources.sites}`,
    '', 'METHOD AND LIMITATIONS', d.objective, 'Greedy comparison among tested sites; not a global placement optimum. No session-capacity or vaccine-uptake prediction.', ...result.limitations,
  ].join('\n');
}
