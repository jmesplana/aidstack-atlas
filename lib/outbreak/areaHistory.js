import { epiWeek, validDate } from './data.js';
import { observationIndex } from './comparison.js';

const day = 86400000;
const shift = (date, n) => new Date(Date.parse(date) + n * day).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / day);
export const EBOLA_END_CRITERIA = 'https://www.who.int/docs/default-source/inaugural-who-partners-forum/who-recommended-criteria-for-declaring-the-end-of-the-ebola-virus-disease-outbreak.pdf';

// Denominators come from the loaded geography, never from the case line list.
export function provinceCoverage(epi, geometry, boundaryLevel) {
  if (!epi || epi.dataset.level !== 'health_zone' || boundaryLevel !== 'health_zone' || !geometry) return null;
  const names = new Map(), groups = new Map();
  for (const { properties: p } of geometry.features || []) {
    if (!p?.nom) continue;
    const provinces = names.get(p.nom) || new Set();
    provinces.add(p.province || null); names.set(p.nom, provinces);
  }
  const valueAt = observationIndex(epi.dataset.records);
  const assigned = new Set();
  for (const [location, provinces] of names) {
    if (provinces.size !== 1 || ![...provinces][0]) continue;
    const province = [...provinces][0];
    const group = groups.get(province) || { province, locations: [], total: 0, affected: 0, reported: 0, cases: 0 };
    const value = valueAt(location, epi.date);
    group.locations.push(location); group.total++;
    if (value !== null) { group.reported++; group.cases += value; if (value > 0) group.affected++; }
    groups.set(province, group); assigned.add(location);
  }
  return { date: epi.date, rows: [...groups.values()].sort((a,b) => a.province.localeCompare(b.province)).map(g => ({
    ...g, missing: g.total - g.reported, percent: g.affected / g.total * 100, cases: g.reported ? g.cases : null
  })), excludedBoundaries: names.size - assigned.size,
  unmapped: epi.zones.filter(z => !assigned.has(z.location)).length };
}

export function areaActivity(dataset, end, baseline) {
  if (dataset?.kind !== 'cumulative' || !validDate(end)) return { firstReports: [], quiet: [] };
  const valueAt = observationIndex(dataset.records);
  const locations = [...new Set(dataset.records.filter(r => r.date <= end).map(r => r.location))];
  const firstReports = [], quiet = [];
  for (const location of locations) {
    const dates = [...new Set(dataset.records.filter(r => r.location === location && r.date <= end).map(r => r.date))].sort();
    const first = dates.find(date => valueAt(location,date) > 0);
    if (!first) continue;
    if (first > baseline) firstReports.push({ location, date: first, value: valueAt(location,first),
      priorZero: dates.some(date => date < first && valueAt(location,date) === 0) });
    // Require a report on the common endpoint. Nulls, revisions and gaps longer
    // than eight days stop the unchanged run; publication lag adds no quiet time.
    if (dates.at(-1) !== end || !(valueAt(location,end) > 0)) continue;
    let start = end;
    for (let i = dates.length - 2; i >= 0; i--) {
      if (daysBetween(dates[i],start) > 8 || valueAt(location,dates[i]) !== valueAt(location,end)) break;
      start = dates[i];
    }
    const days = daysBetween(start,end);
    if (days >= 7) quiet.push({ location, start, end, days, weeks: Math.floor(days / 7), review42: days >= 42 });
  }
  return { firstReports: firstReports.sort((a,b) => b.date.localeCompare(a.date) || a.location.localeCompare(b.location)),
    quiet: quiet.sort((a,b) => b.days - a.days || a.location.localeCompare(b.location)) };
}

export function activityMessages(activity) {
  if (!activity) return [];
  const messages = [];
  if (activity.firstReports.length) {
    const rows = activity.firstReports.slice(0,3);
    messages.push(`First positive reports in the loaded history: ${rows.map(r => `${r.location} (${r.date}${r.priorZero ? '; previously reported zero' : '; earlier zero not established'})`).join('; ')}${activity.firstReports.length > 3 ? `; ${activity.firstReports.length - 3} more in the health-zone history table` : ''}. First reporting does not establish when transmission began.`);
  }
  if (activity.quiet.length) {
    const rows = activity.quiet.slice(0,3);
    messages.push(`Unchanged reported cumulative totals: ${rows.map(r => `${r.location}: ${r.weeks} complete weeks (${r.start}–${r.end})`).join('; ')}${activity.quiet.length > 3 ? `; ${activity.quiet.length - 3} more in the health-zone history table` : ''}. This does not confirm absence of new cases or Ebola-free status.`);
  }
  return messages;
}

// Use calendar ISO weeks, with one shared reporting date per week. Never
// distribute multi-day cumulative changes into invented daily incidence.
export function provinceHorizon(epi, coverage, maxWeeks = 26, includeAll = false) {
  if (!coverage?.rows.length) return null;
  const records = epi.dataset.records.filter(r => r.date <= epi.date);
  const dates = [...new Set(records.map(r => r.date))].sort();
  if (!dates.length) return null;
  const weekStart = date => shift(date, -((new Date(date).getUTCDay() + 6) % 7));
  const first = weekStart(dates[0]), last = weekStart(epi.date);
  const count = daysBetween(first,last) / 7 + 1;
  const start = shift(last, -7 * (Math.min(count,maxWeeks) - 1));
  const dateByWeek = new Map(dates.map(date => [weekStart(date),date]));
  const valueAt = observationIndex(records);
  const weeks = [];
  for (let monday = start; monday <= last; monday = shift(monday,7)) {
    const end = dateByWeek.get(monday) || null, previous = dateByWeek.get(shift(monday,-7)) || null;
    const partial = shift(monday,6) > epi.date;
    const duration = end && previous ? daysBetween(previous,end) : null;
    weeks.push({ ...epiWeek(monday), start: previous, end, partial, days: duration,
      valid: duration !== null && duration <= 8 && duration >= (partial ? 1 : 6) });
  }
  const mapped = new Set(coverage.rows.flatMap(g => g.locations));
  const withCases = new Set(records.filter(r => (includeAll ? r.value !== null : r.date === epi.date && valueAt(r.location,epi.date) > 0)).map(r => r.location));
  const groups = coverage.rows.map(g => ({ province: g.province, rows: g.locations.filter(location => withCases.has(location)).sort().map(location => ({
    location, values: weeks.map(week => {
      const current = week.end ? valueAt(location,week.end) : null;
      const prior = week.start ? valueAt(location,week.start) : null;
      return week.valid && current !== null && prior !== null ? current - prior : null;
    })
  })) })).filter(g => g.rows.length);
  const max = Math.max(1,...groups.flatMap(g => g.rows.flatMap(r => r.values.filter(Number.isFinite).map(Math.abs))));
  return { weeks, groups, includeAll, maxWeeks, band: Math.max(1,Math.ceil(max / 3)),
    excluded: [...withCases].filter(n => !mapped.has(n)).length, truncated: count > maxWeeks };
}
