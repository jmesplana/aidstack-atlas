// Deterministic response-side rollups. Missing observations are never zero and no
// pillar status is asserted without loaded, dated response indicators.
import { latestPerLocation, formatValue } from './data.js';
import { epidemiology, shiftDate } from './insights.js';

// Classify a numeric change for display. A null delta has no comparable basis (not a trend).
export function deltaTrend(delta) {
  if (delta === null || delta === undefined) return 'none';
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

export const PILLARS = [
  ['sdb', 'Safe & dignified burial'],
  ['rcce', 'Community engagement / RCCE'],
  ['logistics', 'Logistics & supplies'],
  ['response', 'Response presence & capacity']
];

// Optional rate rules per pillar: a coverage ratio of a "completed" numerator over a
// "denominator", scored against operational thresholds. Higher is better unless overloadAt
// is set (e.g. bed occupancy, where exceeding 100% is the concern). Rules are matched by
// dataset-label keywords so uploads drive them; nothing is assumed when a pair is absent.
export const RATE_RULES = {
  sdb: { label: 'Safe burials completed', numerator: /complet|conduct|done|performed/i, denominator: /request|expected|reported|alert/i, watch: 0.9, attention: 0.7 },
  response: [
    { label: 'Contact follow-up rate', numerator: /followed|follow.?up|seen|visited/i, denominator: /registered|listed|under follow|contacts?$/i, watch: 0.95, attention: 0.8 },
    { label: 'Bed occupancy', numerator: /occup|patients?|admitted|isolation/i, denominator: /bed|capacity|available/i, overloadAt: 1, watch: 0.85 }
  ]
};

// Sum reported (non-missing) latest observations across areas for a category's datasets,
// with the matching seven-day-earlier total for areas reporting on both dates.
function categoryTotals(datasets, category, asOf) {
  const sets = datasets.filter(d => d.category === category && d.status === 'ready');
  if (!sets.length) return null;
  let value = 0, previous = 0, reporting = 0, comparable = 0, missing = 0;
  for (const d of sets) {
    const latest = latestPerLocation(d.records, asOf);
    for (const row of latest) {
      if (row.value === null) { missing++; continue; }
      reporting++; value += row.value;
      const baselineDate = shiftDate(row.date, -7);
      const prior = d.records.find(r => r.location === row.location && r.date === baselineDate && r.value !== null);
      if (prior) { comparable++; previous += prior.value; }
    }
  }
  if (!reporting) return null;
  return { value, previous: comparable === reporting ? previous : null, reporting, comparable, missing, delta: comparable === reporting ? value - previous : null };
}

// Evaluate one rate rule: a numerator total over a denominator total, matched by dataset-label
// keywords within a category. The ratio is reported only when both totals are present and the
// denominator is positive, so a difference is never assumed without an explicit paired source.
function evaluateRate(datasets, category, rule, asOf) {
  const candidates = datasets.filter(d => d.category === category && d.status === 'ready');
  const numerators = candidates.filter(d => rule.numerator.test(d.label));
  const denominators = candidates.filter(d => rule.denominator.test(d.label));
  if (numerators.length !== 1 || denominators.length !== 1 || numerators[0].id === denominators[0].id) return null;
  const numerator = numerators[0], denominator = denominators[0];
  if (numerator.level !== denominator.level || numerator.kind !== denominator.kind) return null;
  const nRows = latestPerLocation(numerator.records, asOf), dRows = latestPerLocation(denominator.records, asOf);
  if (!nRows.length || nRows.length !== dRows.length || nRows.some(n => n.value === null || !dRows.some(d => d.location === n.location && d.date === n.date && d.value !== null))) return null;
  const num = categoryTotals(numerators, category, asOf);
  const den = categoryTotals(denominators, category, asOf);
  if (!num || !den || !den.value) return null;
  const rate = num.value / den.value;
  let level;
  if (rule.overloadAt !== undefined && rate >= rule.overloadAt) level = 'attention';
  else if (rule.overloadAt !== undefined) level = rate >= rule.watch ? 'watch' : 'on-track';
  else if (rate >= (rule.watch ?? 1)) level = 'on-track';
  else if (rule.attention !== undefined && rate < rule.attention) level = 'attention';
  else level = 'watch';
  return { label: rule.label, numerator: num.value, denominator: den.value, rate, level, target: rule.watch };
}

function rateRulesFor(id) {
  const r = RATE_RULES[id];
  return Array.isArray(r) ? r : r ? [r] : [];
}

const RANK = { attention: 3, watch: 2, 'on-track': 1, reported: 0 };

export function responseStatus(datasets, actions = [], asOf) {
  const pillars = PILLARS.map(([id, label]) => {
    const totals = categoryTotals(datasets, id, asOf);
    if (!totals) return { id, label, loaded: false, note: 'No dated indicators loaded for this pillar.' };
    const rates = rateRulesFor(id).map(rule => evaluateRate(datasets, id, rule, asOf)).filter(Boolean);
    let level = 'reported', note;
    if (rates.length) {
      level = rates.reduce((worst, r) => RANK[r.level] > RANK[worst] ? r.level : worst, 'on-track');
      note = rates.map(r => `${r.label}: ${(r.rate * 100).toFixed(0)}%${r.target ? ` (target ${(r.target * 100).toFixed(0)}%)` : ''} — ${formatValue(r.numerator)} of ${formatValue(r.denominator)}.`).join(' ');
    } else {
      note = datasets.filter(d => d.category === id && d.status === 'ready').map(d => {
        const rows = latestPerLocation(d.records, asOf).filter(r => r.value !== null);
        return `${d.label}: ${rows.length} reported area observations${rows.length ? ` (${rows.map(r => r.date).sort()[0]}–${rows.map(r => r.date).sort().at(-1)})` : ''}`;
      }).join('; ') + '. Distinct indicators are not summed. Missing values are not zero.';
    }
    return { id, label, loaded: true, level, note, rates, missing: totals.missing, delta: null };
  });
  const openActions = actions.filter(a => ['Proposed', 'Approved', 'In progress'].includes(a.status)).length;
  const blocked = actions.filter(a => a.status === 'Blocked').length;
  return { pillars, actions: { open: openActions, blocked, total: actions.length }, loadedPillars: pillars.filter(p => p.loaded).length };
}

// Difference the current situation against a previously saved snapshot for "since last brief".
// Only reports changes that both snapshots can support; absence of a metric is never a decline.
export function sinceLast(current, previousSnapshot, asOf) {
  if (!previousSnapshot) return null;
  const lines = [];
  const priorAsOf = previousSnapshot.asOf;
  if (priorAsOf > asOf) return { priorAsOf, priorName: previousSnapshot.name, lines, warning: 'The comparison snapshot is after this reporting cut-off. Choose an earlier snapshot.' };
  // New reporting areas: areas reporting positive cases now but absent from the prior snapshot's affected set.
  const priorEpi = epidemiology(previousSnapshot.datasets || [], previousSnapshot.geometry, priorAsOf, previousSnapshot.epiSource, previousSnapshot.boundaryLevel);
  if (current.epi) {
    const wasAffected = new Set(priorEpi?.affected.map(z => z.location) || []);
    const nowAreas = current.epi.affected.map(z => z.location);
    const added = nowAreas.filter(n => !wasAffected.has(n));
    if (priorEpi && priorEpi.dataset.id === current.epi.dataset.id && priorEpi.dataset.level === current.epi.dataset.level) lines.push({ label: 'Reporting areas', delta: added.length || null, value: added.length ? `${added.length} additional areas reporting positive cumulative totals` : 'No additional areas reporting positive totals', since: added.length ? added.join(', ') + ' — may reflect reporting coverage, not spread' : `since ${priorAsOf}` });
  }
  // Compare each indicator and location separately, retaining observation dates.
  for (const dataset of current.datasets.filter(d => d.status === 'ready' && (d.level === 'national' || d.purpose === 'cases' || d.id === current.epi?.dataset.id || PILLARS.some(([id]) => id === d.category)))) {
    const prior = (previousSnapshot.datasets || []).find(d => d.id === dataset.id && d.status === 'ready' && d.kind === dataset.kind && d.unit === dataset.unit && d.level === dataset.level && d.label === dataset.label);
    const oldRows = new Map((prior ? latestPerLocation(prior.records, priorAsOf) : []).map(r => [r.location, r]));
    for (const row of latestPerLocation(dataset.records, asOf)) {
      const old = oldRows.get(row.location);
      if (row.value === null) continue;
      const comparable = old && old.value !== null;
      lines.push({ label: `${dataset.label} — ${row.location}`, value: `${formatValue(row.value)} ${dataset.unit}`, delta: comparable ? row.value - old.value : null,
        since: `${comparable ? `${old.date} → ${row.date}` : 'no comparable prior observation'} · ${dataset.url || dataset.source || dataset.id}` });
    }
  }
  for (const action of current.actions || []) {
    const prior = (previousSnapshot.actions || []).find(a => a.id === action.id);
    if (!prior || ['status', 'owner', 'due', 'action', 'resources', 'location'].some(key => prior[key] !== action[key])) lines.push({ label: 'Response action', value: action.action || 'Untitled action', since: `${prior ? `${prior.status} → ${action.status}` : `Added: ${action.status}`} · ${action.owner || 'Unassigned'} · due ${action.due || 'unspecified'}` });
  }
  for (const action of previousSnapshot.actions || []) if (current.actions && !current.actions.some(a => a.id === action.id)) lines.push({ label: 'Removed action', value: action.action || 'Untitled action', since: 'Removed from the current plan; this does not mean completed.' });
  return { priorAsOf, priorName: previousSnapshot.name, lines };
}
