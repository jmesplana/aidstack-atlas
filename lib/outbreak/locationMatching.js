import config from './locationReferences.json' with { type: 'json' };
import { zoneName } from './data.js';

// Preserve word boundaries and province qualifiers; never use fuzzy matching.
export const locationKey = name => String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[-\u2010-\u2015\s]+/g, ' ').trim();
export function locationReference(dataset, references = config.references) {
  const matches = references.filter(({appliesTo}) => dataset.origin === appliesTo.origin && dataset.id?.startsWith(appliesTo.idPrefix) && appliesTo.levels.includes(dataset.level));
  // A dataset must have exactly one applicable reference; never mix countries' aliases.
  return matches.length === 1 ? matches[0] : null;
}

// Resolve against the actual loaded boundaries, including older shapefile names.
export function locationResolver(geometry, reference = null) {
  const exact = new Map(), normalized = new Map();
  const aliases = new Map(Object.entries(reference?.aliases || {}).map(([from,to]) => [locationKey(from),locationKey(to)]));
  const nonGeographic = new Set((reference?.nonGeographicNames || []).map(locationKey));
  const key = name => {
    const normalizedName = locationKey(name);
    return aliases.get(normalizedName) || normalizedName;
  };
  for (const feature of geometry?.features || []) {
    const name = zoneName(feature);
    for (const [index,k] of [[exact,name],[normalized,key(name)]]) {
      const values = index.get(k) || [];
      values.push(name); index.set(k,values);
    }
  }
  return name => {
    if (nonGeographic.has(locationKey(name))) return { location:null, status:'Non-geographic source total' };
    const matches = exact.get(name) || normalized.get(key(name)) || [];
    return matches.length === 1 ? {location:matches[0],status:matches[0] === name ? 'Exact match' : 'Matched name variant'}
      : {location:null,status:matches.length ? 'Ambiguous boundary name' : 'No matching boundary'};
  };
}

// Reconcile before charts, maps and calculations so spelling changes do not
// split histories. Keep source records for audit and re-matching saved drafts.
export function reconcileLocations(dataset, geometry, boundaryLevel, references = config.references) {
  const sourceRecords = dataset.sourceRecords || dataset.records;
  const base = {...dataset,records:sourceRecords};
  delete base.locationMatching;
  if (dataset.status !== 'ready' || !geometry || dataset.level !== boundaryLevel || ['national','site'].includes(dataset.level)) return base;
  const reference = locationReference(dataset,references);
  const resolve = locationResolver(geometry,reference);
  const locations = [...new Set(sourceRecords.map(r => r.location))].map(source => ({source,...resolve(source)}));
  const lookup = new Map(locations.map(match => [match.source,match.location || match.source]));
  const groups = new Map();
  for (const row of sourceRecords) {
    const location = lookup.get(row.location), key = JSON.stringify([location,row.date]);
    const group = groups.get(key) || [];
    group.push({...row,location}); groups.set(key,group);
  }
  const conflicts = [];
  let duplicates = 0;
  const records = [...groups.values()].map(group => {
    duplicates += group.length - 1;
    if (group.some(r => r.value !== group[0].value)) {
      conflicts.push({location:group[0].location,date:group[0].date});
      return {...group[0],value:null};
    }
    return group[0];
  });
  return {...base,sourceRecords,records,locationMatching:{locations,duplicates,conflicts,referenceId:reference?.id || null,referenceLabel:reference?.label || null,aliasSource:reference?.source || null}};
}
