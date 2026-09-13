// Deterministic response-side rollups. Missing observations are never zero and no
// pillar status is asserted without loaded, dated response indicators.
import { latestPerLocation, nationalEvidence, formatValue, validDate } from './data.js';
import { epidemiology, shiftDate } from './insights.js';

// Classify a numeric change for display. A null delta has no comparable basis (not a trend).
export function deltaTrend(delta) {
  if (!Number.isFinite(delta)) return 'none';
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

export function deltaPresentation(delta, { kind, rising = true, neutral = false } = {}) {
  const trend = deltaTrend(delta);
  const revision = kind === 'cumulative' && trend === 'down';
  const tone = neutral || revision || ['none', 'flat'].includes(trend) ? 'neutral'
    : trend === (rising ? 'up' : 'down') ? 'adverse' : 'good';
  return { trend, revision, tone, glyph: revision ? '↺' : { up: '▲', down: '▼', flat: '▬', none: '·' }[trend] };
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

const numericRow = row => Number.isFinite(row?.value) && row.value >= 0;
const normalize = value => String(value || '').trim().toLowerCase();
const rowsAt = (dataset, asOf) => latestPerLocation(dataset.records.filter(r => validDate(r.date)), asOf);
const sameDefinition = (a, b) => a.id === b.id && a.level === b.level && a.kind === b.kind
  && !!a.unit && normalize(a.unit) === normalize(b.unit)
  && (a.metricId || b.metricId ? a.metricId === b.metricId : normalize(a.label) === normalize(b.label));
const dateRange = rows => {
  const dates = [...new Set(rows.map(r => r.date))].sort();
  return dates.length ? dates.length === 1 ? dates[0] : `${dates[0]}–${dates.at(-1)}` : 'no observations';
};

// Keep indicators separate: people, sessions, beds and supplies must never form one total.
function indicatorSummary(dataset, asOf) {
  const latest = rowsAt(dataset, asOf), reported = latest.filter(numericRow);
  const history = new Map(dataset.records.map(r => [JSON.stringify([r.location, r.date]), r]));
  const pairs = reported.map(row => ({ row, prior: history.get(JSON.stringify([row.location, shiftDate(row.date, -7)])) }))
    .filter(pair => numericRow(pair.prior));
  return { id: dataset.id, label: dataset.label, unit: dataset.unit, kind: dataset.kind,
    value: reported.length ? reported.reduce((sum, row) => sum + row.value, 0) : null,
    reporting: reported.length, missing: latest.length - reported.length, dates: dateRange(reported),
    comparable: pairs.length, withoutBaseline: reported.length - pairs.length,
    delta: pairs.length ? pairs.reduce((sum, { row, prior }) => sum + row.value - prior.value, 0) : null };
}

function indicatorNote(summary) {
  if (summary.value === null) return `${summary.label}: no non-missing observations on or before this cut-off.`;
  const change = summary.delta === null ? 'No comparable seven-day baseline.'
    : `${summary.delta >= 0 ? '+' : ''}${formatValue(summary.delta)} over seven days across ${summary.comparable} matched areas only${summary.kind === 'cumulative' && summary.delta < 0 ? ' (downward revision)' : ''}.`;
  return `${summary.label}: ${formatValue(summary.value)} ${summary.unit || 'reported units'} across ${summary.reporting} areas (${summary.dates}). ${change}${summary.withoutBaseline ? ` ${summary.withoutBaseline} areas lack a comparable baseline.` : ''}${summary.missing ? ` ${summary.missing} latest values are missing.` : ''}`;
}

// Evaluate one rate rule: a numerator total over a denominator total, matched by dataset-label
// keywords within a category. The ratio is reported only when both totals are present and the
// denominator is positive, so a difference is never assumed without an explicit paired source.
function evaluateRate(datasets, category, rule, asOf) {
  const sets = datasets.filter(d => d.category === category && d.status === 'ready');
  const numerators = sets.filter(d => rule.numerator.test(d.label));
  const denominators = sets.filter(d => rule.denominator.test(d.label));
  const unavailable = reason => ({ label: rule.label, unavailable: reason });
  if (!numerators.length && !denominators.length) return null;
  if (numerators.length !== 1 || denominators.length !== 1) return unavailable('one unambiguous numerator and denominator source is required');
  const [num] = numerators, [den] = denominators;
  const countUnit = /^(count|counts|people|person|persons|case|cases|burial|burials|contact|contacts|request|requests|patient|patients|bed|beds)$/;
  if (num.id === den.id || num.level !== den.level || num.kind !== den.kind || !num.level || !num.kind
    || !countUnit.test(normalize(num.unit)) || !countUnit.test(normalize(den.unit))) {
    return unavailable('sources must be distinct counts with matching geographic levels and measure types');
  }
  const latestNum = rowsAt(num, asOf), latestDen = rowsAt(den, asOf);
  const date = [...latestNum, ...latestDen].map(r => r.date).sort().at(-1);
  const denominator = new Map(latestDen.map(r => [r.location, r]));
  const pairs = latestNum.map(row => ({ row, den: denominator.get(row.location) }))
    .filter(pair => pair.row.date === date && pair.den?.date === date && numericRow(pair.row) && numericRow(pair.den) && pair.den.value > 0);
  if (!pairs.length) return unavailable('no non-missing numerator and positive denominator match by area and latest reporting date');
  const numeratorValue = pairs.reduce((sum, pair) => sum + pair.row.value, 0);
  const denominatorValue = pairs.reduce((sum, pair) => sum + pair.den.value, 0);
  const rate = numeratorValue / denominatorValue;
  let level;
  if (rule.overloadAt !== undefined && rate >= rule.overloadAt) level = 'attention';
  else if (rate >= (rule.watch ?? 1)) level = 'on-track';
  else if (rule.attention !== undefined && rate < rule.attention) level = 'attention';
  else level = 'watch';
  return { label: rule.label, numerator: numeratorValue, denominator: denominatorValue, rate, level, target: rule.watch,
    date, matched: pairs.length, available: new Set([...latestNum, ...latestDen].map(r => r.location)).size,
    sourceIds: [num.id, den.id] };
}

function rateRulesFor(id) {
  const r = RATE_RULES[id];
  return Array.isArray(r) ? r : r ? [r] : [];
}

const RANK = { attention: 3, watch: 2, 'on-track': 1, reported: 0 };

export function responseStatus(datasets, actions = [], asOf) {
  const pillars = PILLARS.map(([id, label]) => {
    const sets = datasets.filter(d => d.category === id && d.status === 'ready');
    const indicators = sets.map(d => indicatorSummary(d, asOf));
    if (!indicators.some(s => s.reporting)) return { id, label, loaded: false, rates: [], indicators, delta: null,
      note: sets.length ? 'No non-missing observations on or before this cut-off. Missing values are not zero.' : 'No dated indicators loaded for this pillar.' };
    const evaluated = rateRulesFor(id).map(rule => evaluateRate(datasets, id, rule, asOf)).filter(Boolean);
    const rates = evaluated.filter(r => !r.unavailable);
    const unavailable = evaluated.filter(r => r.unavailable);
    let level = 'reported', note;
    if (rates.length) {
      level = rates.reduce((worst, r) => RANK[r.level] > RANK[worst] ? r.level : worst, 'on-track');
      note = rates.map(r => `${r.label}: ${(r.rate * 100).toFixed(0)}%${r.target ? ` (target ${(r.target * 100).toFixed(0)}%)` : ''} — ${formatValue(r.numerator)} of ${formatValue(r.denominator)} (${r.date}; ${r.matched}/${r.available} areas matched).`).join(' ');
    } else {
      note = indicators.map(indicatorNote).join(' ');
    }
    if (unavailable.length) note += ' ' + unavailable.map(r => `${r.label}: insufficient comparable data — ${r.unavailable}.`).join(' ');
    return { id, label, loaded: true, level, note, rates, indicators,
      missing: indicators.reduce((sum, s) => sum + s.missing, 0), delta: rates.length || indicators.length !== 1 ? null : indicators[0].delta };
  });
  const openActions = actions.filter(a => ['Proposed', 'In progress'].includes(a.status)).length;
  const blocked = actions.filter(a => a.status === 'Blocked').length;
  return { pillars, actions: { open: openActions, blocked, total: actions.length }, loadedPillars: pillars.filter(p => p.loaded).length };
}

// Difference the current situation against a previously saved snapshot for "since last brief".
// Only reports changes that both snapshots can support; absence of a metric is never a decline.
export function sinceLast(current, previousSnapshot, asOf) {
  if (!previousSnapshot) return null;
  const lines = [];
  const priorAsOf = previousSnapshot.asOf;
  if (!validDate(priorAsOf) || priorAsOf > asOf) {
    return { priorAsOf, priorName: previousSnapshot.name, lines: [{ label: 'Comparison unavailable', value: 'Choose a snapshot with a valid cut-off on or before the current cut-off.', delta: null }] };
  }
  const nowSets = (current.datasets || []).filter(d => d.status === 'ready');
  const oldSets = (previousSnapshot.datasets || []).filter(d => d.status === 'ready');
  const previousSource = dataset => {
    const matches = oldSets.filter(d => sameDefinition(dataset, d));
    return matches.length === 1 ? matches[0] : null;
  };
  // Match the source, indicator definition and country, never the first national row.
  const nationalCases = nowSets.filter(d => d.level === 'national' && d.kind === 'cumulative'
    && (/^(national_)?cumulative_confirmed_cases$/.test(d.metricId || '')
      || !d.metricId && (d.purpose === 'cases' || normalize(d.label) === 'national cumulative confirmed cases')));
  for (const dataset of nationalCases) {
    const prior = previousSource(dataset);
    const previousRows = new Map(prior ? rowsAt(prior, priorAsOf).map(r => [r.location, r]) : []);
    for (const fact of nationalEvidence([dataset], asOf)) {
      const row = previousRows.get(fact.location);
      const comparable = numericRow(row) && row.date <= fact.date;
      lines.push({ label: `${dataset.label} — ${fact.location}`, sourceId: dataset.id, location: fact.location,
        value: formatValue(fact.value), delta: comparable ? fact.value - row.value : null, kind: dataset.kind,
        since: comparable ? `${row.date}–${fact.date}; same indicator and country` : 'no comparable value for this source, indicator and country in the previous snapshot' });
    }
  }
  // New reporting areas: areas reporting positive cases now but absent from the prior snapshot's affected set.
  const priorEpi = epidemiology(previousSnapshot.datasets || [], previousSnapshot.geometry, priorAsOf, previousSnapshot.epiSource, previousSnapshot.boundaryLevel);
  if (current.epi) {
    const wasAffected = new Set(priorEpi?.affected.map(z => z.location) || []);
    const nowAreas = current.epi.affected.map(z => z.location);
    const added = nowAreas.filter(n => !wasAffected.has(n));
    if (priorEpi && sameDefinition(current.epi.dataset, priorEpi.dataset)) lines.push({ label: 'Reporting areas', neutral: true, delta: null, value: added.length ? `${added.length} areas now report positive cases that were not positive in the previous snapshot` : 'No additional areas reporting positive cases', since: added.length ? added.slice(0, 6).join(', ') + (added.length > 6 ? '…' : '') : `since ${priorAsOf}` });
  }
  // Compare each response indicator separately, using only the same reporting areas.
  for (const [id, label] of PILLARS) {
    for (const dataset of nowSets.filter(d => d.category === id)) {
      const prior = previousSource(dataset);
      const latest = rowsAt(dataset, asOf), previous = prior && prior.category === id ? rowsAt(prior, priorAsOf) : [];
      const old = new Map(previous.map(r => [r.location, r]));
      const pairs = latest.map(row => ({ row, was: old.get(row.location) }))
        .filter(pair => numericRow(pair.row) && numericRow(pair.was) && pair.row.date >= pair.was.date);
      const reported = latest.filter(numericRow);
      const newAreas = prior ? reported.filter(r => !old.has(r.location)).map(r => r.location) : [];
      const nowNames = new Set(latest.map(r => r.location));
      const absent = previous.filter(r => numericRow(r) && !nowNames.has(r.location)).length;
      const unpaired = reported.length - pairs.length;
      lines.push({ label: `${label} — ${dataset.label}`, sourceId: dataset.id, kind: dataset.kind, neutral: true, group: 'response',
        value: pairs.length ? `${formatValue(pairs.reduce((sum, pair) => sum + pair.row.value, 0))} ${dataset.unit} across ${pairs.length} matched areas`
          : 'Insufficient comparable data',
        delta: pairs.length ? pairs.reduce((sum, pair) => sum + pair.row.value - pair.was.value, 0) : null,
        matched: pairs.length, newlyReporting: newAreas, unpaired, absent,
        since: `since ${priorAsOf}; ${newAreas.length} newly reporting areas${newAreas.length ? ` (${newAreas.slice(0, 3).join(', ')}${newAreas.length > 3 ? ', …' : ''})` : ''}; ${unpaired} current areas lack a comparable baseline; ${absent} previously reporting areas absent` });
    }
  }
  return { priorAsOf, priorName: previousSnapshot.name, lines };
}
