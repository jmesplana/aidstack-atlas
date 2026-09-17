import { epiWeek, validDate } from './data.js';
import { shiftDate } from './insights.js';

export const SITREP_SECTIONS = [
  ['epidemiology', 'Epidemiological situation & weekly trend'],
  ['mobility', 'Population mobility'],
  ['mining', 'Mining and operational geography'],
  ['security', 'Security and access'],
  ['actions', 'Operational implications & immediate actions']
];

export const isCaseSeries = d => d.status === 'ready' &&
  (d.purpose === 'cases' || /^(national_)?(new|cumulative)_confirmed_cases$/.test(d.metricId || ''));

// Exact dates and a stable set of locations are required. Never carry observations
// forward, combine overlapping sources, or interpret cumulative revisions as incidence.
export function reportingPeriods(dataset, locations, asOf, count = 8) {
  if (!dataset || !validDate(asOf) || !locations.length || !['daily', 'cumulative'].includes(dataset.kind)) return [];
  const index = new Map();
  for (const row of dataset.records || []) {
    const key = JSON.stringify([row.location, row.date]);
    index.set(key, index.has(key) ? null : row.value);
  }
  const valueAt = (location, date) => {
    const value = index.get(JSON.stringify([location, date]));
    return Number.isFinite(value) ? value : null;
  };
  return Array.from({ length: count }, (_, i) => {
    const end = shiftDate(asOf, -7 * (count - 1 - i));
    let value = 0, missing = false;
    for (const location of locations) {
      if (dataset.kind === 'cumulative') {
        const current = valueAt(location, end), previous = valueAt(location, shiftDate(end, -7));
        if (current === null || previous === null) missing = true;
        else value += current - previous;
      } else {
        for (let day = 0; day < 7; day++) {
          const observation = valueAt(location, shiftDate(end, -day));
          if (observation === null) missing = true;
          else value += observation;
        }
      }
    }
    return { start: shiftDate(end, -6), end, value: missing ? null : value };
  });
}

function comparisonRow(dataset, locations, label, asOf, grouped = false) {
  const periods = reportingPeriods(dataset, locations, asOf, 2);
  const [previous, current] = periods.map(p => p.value);
  const totalDate = dataset.records.filter(r => locations.includes(r.location) && r.date <= asOf).map(r => r.date).sort().at(-1);
  const atCutoff = locations.map(location => (dataset.records || []).filter(r => r.location === location && r.date === totalDate));
  const total = dataset.kind === 'cumulative' && atCutoff.every(rows => rows.length === 1 && Number.isFinite(rows[0].value))
    ? atCutoff.reduce((sum, rows) => sum + rows[0].value, 0) : null;
  return { id: `${dataset.id}:${label}`, label, previous: previous ?? null, current: current ?? null,
    delta: Number.isFinite(previous) && Number.isFinite(current) ? current - previous : null,
    total, totalDate, grouped, kind: dataset.kind, source: dataset.url || dataset.source || dataset.label };
}

export function sitrepEpidemiology(datasets, epi, geometry, boundaryLevel, asOf) {
  const cases = datasets.filter(isCaseSeries).filter(d => ['daily', 'cumulative'].includes(d.kind));
  // Publication can be later than the latest case report. Keep one explicit
  // comparison endpoint without filling missing observations in other series.
  const end = cases.flatMap(d => d.records.filter(r => r.date <= asOf).map(r => r.date)).sort().at(-1) || asOf;
  const national = cases.filter(d => d.level === 'national');
  const local = cases.filter(d => d.level === 'province');
  const rows = [];
  // Multiple sources remain individually labelled; no silent national-source choice.
  for (const dataset of [...local, ...national]) {
    const locations = [...new Set(dataset.records.filter(r => r.date <= asOf).map(r => r.location))].sort();
    for (const location of locations) rows.push(comparisonRow(dataset, [location],
      `${location}${dataset.level === 'national' ? ' (national)' : ''}${(dataset.level === 'national' ? national : local).length > 1 ? ` — ${dataset.label}` : ''}`, end));
  }
  if (!local.length && epi && epi.dataset.level === boundaryLevel && geometry) {
    const reported = new Set(epi.dataset.records.filter(r => r.date <= asOf).map(r => r.location));
    const groups = new Map();
    for (const feature of geometry.features) {
      if (!feature.properties.province || !reported.has(feature.properties.nom)) continue;
      const names = groups.get(feature.properties.province) || [];
      names.push(feature.properties.nom); groups.set(feature.properties.province, names);
    }
    for (const [province, locations] of groups) rows.push(comparisonRow(epi.dataset, locations, `${province} (matched areas)`, end, true));
  }
  const nationalChart = national.length === 1 ? national[0] : null;
  const chartDataset = nationalChart || (!national.length ? epi?.dataset : null);
  const chartLocations = chartDataset ? [...new Set(chartDataset.records.filter(r => r.date <= asOf).map(r => r.location))] : [];
  const location = nationalChart && chartLocations.length === 1 ? chartLocations[0] : !national.length ? epi?.burden[0]?.location : null;
  return { rows, chartDataset, chartLocation: location,
    periods: location ? reportingPeriods(chartDataset, [location], end) : [],
    previousEnd: shiftDate(end, -7), end };
}

// Only join cases to context at the same boundary level and a unique mapped name.
export function sitrepContext(epi, mining, security, mobility, boundaryLevel, asOf, actions = [], hazards = []) {
  const hasCaseGeography = epi?.dataset.level === boundaryLevel && (epi.zones || epi.affected).some(z => z.matched);
  const affected = new Set(epi?.dataset.level === boundaryLevel ? epi.affected.filter(z => z.matched).map(z => z.location) : []);
  const securityRows = security ? [...security.byZone].filter(([name, s]) => affected.has(name) && s.events > 0).sort((a,b) => b[1].events-a[1].events || a[0].localeCompare(b[0])) : [];
  const miningRows = mining ? [...mining.byZone].filter(([name, n]) => affected.has(name) && n > 0).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])) : [];
  const reported = new Set(epi?.affected.map(z => z.location) || []);
  const links = mobility && validDate(mobility.end) && mobility.end <= asOf
    ? mobility.routes.filter(r => reported.has(r.origin) && r.origin !== r.destination && r.value > 0).sort((a,b) => b.value-a.value).slice(0,3) : [];
  const responseAreas = new Set([...affected, ...actions.map(a => a.location).filter(Boolean)]);
  return { hasCaseGeography, securityRows, miningRows, links,
    sites: miningRows.reduce((sum, [,n]) => sum+n, 0),
    events: securityRows.reduce((sum, [,s]) => sum+s.events, 0),
    fatalities: securityRows.reduce((sum, [,s]) => sum+s.fatalities, 0),
    missingFatalities: securityRows.reduce((sum, [,s]) => sum+s.missingFatalities, 0),
    hazards: hazards.filter(h => responseAreas.has(h.location)) };
}

export function sitrepFilename(name, asOf, extension) {
  const scope = (name || 'outbreak').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0,70) || 'outbreak';
  return `${epiWeek(asOf).label.replace('-', '_')}_${scope}_Sitrep_${asOf}.${extension}`;
}
