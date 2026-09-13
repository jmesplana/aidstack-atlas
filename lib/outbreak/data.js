// Shared, deterministic outbreak calculations. Missing observations are never zero.
export const LEVELS = ['national', 'province', 'district', 'admin_area', 'health_zone', 'site'];
export const KINDS = ['cumulative', 'daily', 'snapshot'];
export const METRICS = [
  ['cumulative_confirmed_cases', 'Cumulative confirmed cases', 'health_zone', 'cumulative'],
  ['cumulative_confirmed_deaths', 'Cumulative confirmed deaths', 'health_zone', 'cumulative'],
  ['new_confirmed_cases', 'New reported confirmed cases', 'health_zone', 'daily'],
  ['national_cumulative_confirmed_cases', 'National cumulative confirmed cases', 'national', 'cumulative'],
  ['national_cumulative_confirmed_deaths', 'National cumulative confirmed deaths', 'national', 'cumulative'],
  ['national_cumulative_recovered_cases', 'National cumulative recoveries', 'national', 'cumulative'],
  ['national_suspected_cases_in_isolation', 'National suspected cases in isolation', 'national', 'snapshot']
];
export const formatValue=value=>value.toLocaleString('en-US',{maximumFractionDigits:20});
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
// ISO-8601 epidemiological week (Monday start; week 1 holds the year's first Thursday).
// Returns {year, week, label} where label is e.g. "2026-W29". Matches WHO/Africa CDC reporting.
export function epiWeek(dateStr) {
  const d = new Date(Date.parse(dateStr));
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const week1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday - week1) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
  return { year: thursday.getUTCFullYear(), week, label: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}` };
}
export function numeric(value) {
  if (value === null || value === undefined || /^(|ND|NA|N\/A|null)$/i.test(String(value).trim())) return null;
  const s = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(s) || !Number.isFinite(Number(s))) throw new Error(`Invalid non-negative number: ${s.slice(0, 60)}. Use a dot decimal and no thousands separators.`);
  if(Number(s)>Number.MAX_SAFE_INTEGER || s.replace(/^0+|\./g,'').replace(/^0+/,'').length>15) throw new Error('Number exceeds supported precision (15 significant digits).');
  return Number(s);
}
export function normalizeRows(rows, mapping, sourceId) {
  const { location, date, metric, level, kind, label, unit } = mapping;
  if (!location || !date || !metric || !label?.trim() || !unit?.trim() || !LEVELS.includes(level) || !KINDS.includes(kind)) throw new Error('Choose location, date, value, geographic level, measure type, label and unit.');
  if (!rows.length || rows.length > 50000) throw new Error('Import between 1 and 50,000 rows.');
  if([location,date,metric].some(column=>!Object.hasOwn(rows[0],column)))throw new Error('A mapped column is missing from this file. Check the location, date and value mappings.');
  const seen = new Set();
  return rows.map((row, i) => {
    const place = String(row[location] ?? '').trim();
    const day = String(row[date] ?? '').trim();
    if (!place || place.length > 200 || !validDate(day)) throw new Error(`Row ${i + 2}: location required and date must be a real YYYY-MM-DD date.`);
    const key = JSON.stringify([place, day]);
    if (seen.has(key)) throw new Error(`Row ${i + 2}: duplicate location/date (${place}, ${day}). Aggregate or distinguish records before importing.`);
    seen.add(key);
    let value;
    try { value = numeric(row[metric]); if(mapping.integerOnly && value!==null && !Number.isSafeInteger(value)) throw new Error('Expected a whole-number count.'); } catch (e) { throw new Error(`Row ${i + 2}: ${e.message}`); }
    return { location: place, date: day, metric: label.trim(), unit: unit.trim(), level, kind, value, sourceId };
  });
}
export function latestPerLocation(records, asOf) {
  const result = new Map();
  for (const row of records) {
    if (row.date > asOf) continue;
    const old = result.get(row.location);
    if (!old || row.date > old.date) result.set(row.location, row);
  }
  return [...result.values()].sort((a, b) => a.location.localeCompare(b.location));
}
export function nationalEvidence(datasets, asOf) {
  const facts = [];
  for (const dataset of datasets) {
    if (dataset.level !== 'national' || dataset.status !== 'ready') continue;
    for (const row of latestPerLocation(dataset.records, asOf)) {
      if (row.value === null) continue;
      const previous = dataset.records.filter(r => r.location === row.location && r.date < row.date && r.value !== null).sort((a,b) => b.date.localeCompare(a.date))[0];
      const delta = previous ? row.value - previous.value : null;
      facts.push({ id: `${dataset.id}:${row.location}:${row.date}`, sourceId: dataset.id,
        text: `${dataset.label}: ${formatValue(row.value)} ${dataset.unit} reported for ${row.location} on ${row.date}.${previous ? ` Change in reported ${dataset.kind === 'cumulative' ? 'cumulative total' : 'value'} since ${previous.date}: ${delta > 0 ? '+' : ''}${formatValue(delta)}${delta < 0 && dataset.kind === 'cumulative' ? ' (downward revision)' : ''}.` : ''}`,
        value: row.value, date: row.date, label: dataset.label, delta, since: previous?.date || null,
        location: row.location, metricId: dataset.metricId, kind: dataset.kind, unit: dataset.unit, level: dataset.level });
    }
  }
  return facts;
}
export function revisionCount(records) {
  const previous = new Map(); let count = 0;
  for (const row of [...records].sort((a,b) => a.date.localeCompare(b.date))) {
    if (row.value === null) continue;
    const old = previous.get(row.location);
    if (old !== undefined && row.kind === 'cumulative' && row.value < old) count++;
    previous.set(row.location, row.value);
  }
  return count;
}
export function dailyComparison(records, asOf) {
  const day = 86400000, end = Date.parse(asOf);
  const locations = [...new Set(records.filter(r => r.date <= asOf).map(r => r.location))];
  const index = new Map(records.map(r => [JSON.stringify([r.location,r.date]),r.value]));
  return locations.map(location => {
    let current = 0, previous = 0, reported = 0;
    for (let i=0;i<14;i++) {
      const date = new Date(end-i*day).toISOString().slice(0,10);
      const value = index.get(JSON.stringify([location,date]));
      if (value === undefined || value === null) continue;
      reported++; if (i<7) current+=value; else previous+=value;
    }
    return { location, reported, current: reported === 14 ? current : null, previous: reported === 14 ? previous : null };
  });
}
export function zoneName(feature) { return String(feature.properties?.nom ?? feature.properties?.Nom ?? feature.properties?.name ?? feature.properties?.NAME ?? feature.name ?? '').trim(); }
export function validateBoundaries(data) {
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length || data.features.length > 10000) throw new Error('Expected a GeoJSON FeatureCollection with 1–10,000 polygons.');
  const names = new Set();
  const coordinate = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const ring = (r) => Array.isArray(r) && r.length >= 4 && r.every(coordinate) && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1];
  const polygon = (p) => Array.isArray(p) && p.length > 0 && p.every(ring);
  const features = data.features.map(f => {
    const name = zoneName(f), g = f.geometry;
    if (!name || names.has(name)) throw new Error(`Each boundary needs a unique nom, Nom, name or NAME. Duplicate/missing: ${name || '(missing)'}`);
    names.add(name);
    if (!g || !(g.type === 'Polygon' ? polygon(g.coordinates) : g.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates.length && g.coordinates.every(polygon))) throw new Error(`Invalid WGS84 polygon: ${name}`);
    return { type: 'Feature', properties: { ...f.properties, nom: name, province: String(f.properties?.province || ''), zscode: String(f.properties?.zscode || '') }, geometry:g };
  });
  return { type:'FeatureCollection', features };
}
export function latestMines(rows, asOf='9999-12-31') {
  const latest = new Map();
  for (const r of rows) {
    if (!r.pcode || !validDate(r.visit_date)) throw new Error('IPIS row missing mine code or valid visit date.');
    if(r.visit_date>asOf)continue;
    const old = latest.get(r.pcode);
    // Same-date records are not arbitrarily selected for capacity/security claims.
    if (!old || r.visit_date > old.visit_date) latest.set(r.pcode,{ ...r, ambiguous:false });
    else if (r.visit_date === old.visit_date) old.ambiguous = true;
  }
  return [...latest.values()].map(r => ({ id:r.pcode, name:r.name, date:r.visit_date, latitude:String(r.latitude??'').trim()?Number(r.latitude):NaN, longitude:String(r.longitude??'').trim()?Number(r.longitude):NaN, province:r.province, ambiguous:r.ambiguous }))
    .filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && Math.abs(r.latitude)<=90 && Math.abs(r.longitude)<=180);
}
export function selectFacts(facts, ids) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !facts.some(f => f.id === id)) || new Set(ids).size !== ids.length) throw new Error('AI returned unsupported evidence references.');
  return ids.map(id => facts.find(f => f.id === id));
}
