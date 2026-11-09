// Recommend complementary sites from the evaluated candidates. Every demand
// location is counted once, and unknown baseline access stays explicit.
export function validateSitePolicy(settings) {
  const automatic = settings.siteCountMode === 'automatic';
  const budget = settings.siteBudget ?? 3;
  const target = settings.targetCoveragePercent ?? 90;
  if (settings.siteCountMode && !['automatic', 'limited'].includes(settings.siteCountMode)) throw new Error('Choose how to decide the number of new locations.');
  if (automatic && (!Number.isFinite(target) || target <= 0 || target > 100)) throw new Error('Choose a coverage target greater than 0 and no more than 100 percent.');
  if (!automatic && (!Number.isInteger(budget) || budget < 1 || budget > 10)) throw new Error('Choose between 1 and 10 new locations.');
  return { automatic, budget: automatic ? 10 : budget, target: automatic ? target : null };
}

export function buildAccessDecision(result) {
  const { automatic, budget, target } = validateSitePolicy(result.settings);
  const targetPopulation = automatic ? result.totals.population * target / 100 : null;
  const meetsTarget = covered => automatic && result.totals.population > 0 && covered + 1e-9 >= targetPopulation;
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
  while (steps.length < budget && remaining.length && !meetsTarget(covered)) {
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
  const targetMet = meetsTarget(covered);
  const stoppingReason = targetMet ? 'target-met' : !result.totals.population ? 'no-population' : remaining.every(c => measure(c).gain <= 0) && remaining.length ? 'no-additional-reach' : steps.length >= budget ? (automatic ? 'search-limit' : 'site-limit') : 'candidates-exhausted';
  const stoppingExplanation = {
    'target-met': `The ${target}% modeled coverage target is already met${steps.length ? ' by the proposed set' : ' by existing services'}; no further locations are needed for this target.`,
    'no-population': 'No modeled population is available to assess a coverage target.',
    'no-additional-reach': 'The remaining tested locations add no further modeled reach.',
    'search-limit': 'The recommendation reached the limit of 10 new locations before meeting the target.',
    'site-limit': `The recommendation reached your limit of ${budget} new locations.`,
    'candidates-exhausted': 'All tested locations with additional reach have been used.',
  }[stoppingReason];
  const missingServiceAreas = result.scope.areas.filter(area => !result.existingSites.some(site => site.areaId === area.id)).map(area => area.name);
  const issues = [];
  if (missingServiceAreas.length) issues.push(`No included existing service in: ${missingServiceAreas.join(', ')}. This is a gap in the included facility list, not proof that no facilities exist.`);
  if (!result.settings.facilitiesReviewed) issues.push('The included facility list and availability of the service being assessed have not been confirmed by the planning team.');
  if (result.totals.population > 0 && result.totals.covered === 0 && result.existingSites.length) issues.push('None of the modeled population is within the threshold of the included services. Verify facility coordinates, completeness, travel mode and threshold before interpreting this as an access gap.');
  if (result.populationCoverage?.year > new Date().getFullYear()) issues.push(`The population denominator is a ${result.populationCoverage.year} future projection.`);
  if (result.totals.unknown > 0) issues.push('Some baseline travel times are unknown; newly reachable population is reported separately from confirmed access gains.');
  if (result.populationCoverage?.missingCells > 0) issues.push(`${result.populationCoverage.missingCells} cells lack population estimates and are excluded from the denominator.`);
  if (result.settings.facilityDiscoveryWarnings?.length) issues.push(...result.settings.facilityDiscoveryWarnings);
  const cohort = result.settings.populationCohort?.label || 'All residents';
  return { method: 'greedy-additional-reach-v1', budget, siteCountMode: automatic ? 'automatic' : 'limited', targetCoveragePercent: target, targetMet, stoppingReason, stoppingExplanation, evaluatedCandidates: result.candidates.length, cohort, status: issues.length ? 'provisional' : 'ready-for-local-review', issues,
    objective: automatic ? `Add the location with the largest remaining modeled reach until ${target}% coverage is reached, no further gain is available, or 10 locations have been selected.` : 'Maximize additional modeled population within the travel threshold among the evaluated candidates.',
    selectedCandidateIds: steps.map(s => s.id), steps, additionalPopulation: knownGain, reachableFromUnknown: unknownGain,
    coveredPopulation: covered, coveragePercent: result.totals.population > 0 ? 100 * covered / result.totals.population : null,
    remainingBeyondThreshold: Math.max(0, result.totals.beyondThreshold - knownGain), remainingUnknown: Math.max(0, result.totals.unknown - unknownGain),
    alternatives: remaining.map(c => ({ id: c.id, name: c.name, ...measure(c) })),
    interpretation: 'Modeled geographic reach does not measure service use, unmet demand or delivery capacity. Confirm the intended population, service availability, venues, safety, staffing and supplies before implementation.',
    nextAction: issues.length ? 'Validate the service list and flagged evidence, then recalculate before approving implementation.' : targetMet && !steps.length ? 'Existing services meet the modeled coverage target. Verify service capacity and review the population still beyond the threshold.' : steps.length ? 'Field-check the proposed venues and prepare session resources and schedules for local approval.' : 'No additional modeled reach was found among these candidates. Review remaining gaps and test other locations or delivery approaches.',
  };
}

export function accessDecisionText(result) {
  const d = result.decision;
  if (!d) throw new Error('Recalculate this assessment to create a decision brief.');
  const n = value => value.toLocaleString('en', { maximumFractionDigits: 0 });
  return [
    'SERVICE ACCESS DECISION BRIEF', `Computed: ${result.computedAt}`, `Areas: ${result.scope.areas.map(a => a.name).join(', ')}`,
    `Status: ${d.status}`, `Population: ${d.cohort}; reference date ${result.sources.populationDate}`,
    `Travel: ${result.settings.mode}; ${result.settings.thresholdMinutes} minutes`, d.siteCountMode === 'automatic' ? `Automatic location count; coverage target: ${d.targetCoveragePercent}%; recommendation limit: ${d.budget}` : `Site limit: ${d.budget}`,
    `Existing services included: ${result.existingSites.length}; baseline coverage ${n(result.totals.covered)} of ${n(result.totals.population)}`,
    d.stoppingExplanation || '', ...(d.siteCountMode === 'automatic' ? [`Coverage target reached: ${d.targetMet ? 'Yes' : 'No'}`] : []), `Evaluated candidates: ${d.evaluatedCandidates ?? result.candidates.length}`, '', 'PROPOSED COMPLEMENTARY SITES',
    ...d.steps.map(s => `${s.order}. ${s.name}: ${n(s.additionalPopulation)} additional people; ${n(s.reachableFromUnknown)} newly reachable with unknown baseline; ${n(s.overlapPopulation)} overlap with earlier sites; ${n(s.cumulativeCoverage)} cumulative coverage.`),
    `Remaining: ${n(d.remainingBeyondThreshold)} beyond threshold; ${n(d.remainingUnknown)} unknown access.`,
    '', 'EVIDENCE TO RESOLVE', ...(d.issues.length ? d.issues : ['Field review and operational readiness checks remain required.']),
    '', `NEXT ACTION: ${d.nextAction}`, `Decision owner: ${result.settings.decisionOwner || 'Not assigned'}`, `Review by: ${result.settings.reviewDate || 'Not set'}`,
    `Delivery constraints: ${result.settings.deliveryConstraints || 'Not recorded'}`, d.interpretation,
    'Confirm intended users, venues, community acceptance, staffing, schedules, supplies, transport and security.',
    '', 'SOURCES', `Population: ${result.sources.population}`, `Travel: ${result.sources.roads} (${result.sources.roadsDate})`, `Services: ${result.sources.sites}`,
    '', 'METHOD AND LIMITATIONS', d.objective, 'Greedy comparison among tested sites; not a global placement optimum. No prediction of service use or delivery capacity.', ...result.limitations,
  ].join('\n');
}
