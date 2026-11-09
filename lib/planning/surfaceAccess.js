import { buildAccessDecision } from './accessDecision.js';
import { normalizeAccessPoints } from './accessGaps.js';
import { distanceKm } from '../geo/travelTime.js';
import { fingerprint, geographyKey } from './geography.js';

export const SURFACE_METHOD = 'friction-surface-v1';
export const SURFACE_SOURCE = {
  name: 'Malaria Atlas Project Global Friction Surface 2019', year: 2019, resolutionM: 927.67, maxDistanceM: 100000,
  asset: 'projects/malariaatlasproject/assets/accessibility/friction_surface/2019_v5_1',
  walkingAsset: 'projects/malariaatlasproject/assets/accessibility/friction_surface/2019_v5_1_walking_only',
  license: 'CC BY 4.0',
};
export const HEALTHSITES_SOURCE = { name: 'Healthsites / OpenStreetMap via Earth Engine community catalog', snapshotDate: '2025-06-07', license: 'ODbL', assets: ['projects/sat-io/open-datasets/health-site-node', 'projects/sat-io/open-datasets/health-site-way'] };
export const SURFACE_LIMITATIONS = [
  'Travel estimates use the 2019 Malaria Atlas Project friction surface at approximately 1 km resolution. They do not represent current road conditions, traffic, safety, or navigation directions.',
  'Walking uses the walking-only surface. Motorized and walking estimates use the published combined transport assumptions, including modes beyond private driving; user-entered road speeds do not apply.',
  'Facilities and population points in the same travel-surface pixel can have zero modeled travel time. Nearby outreach locations may be indistinguishable at this resolution.',
  'The search is limited to 100 km of modeled path length. Missing surface data or paths beyond this limit remain unknown, not evidence of no access. Paths may cross administrative boundaries.',
  'Only the included facility locations count. A mapped facility does not establish service availability, readiness, opening hours or capacity. Healthsites is a dated community snapshot with varying underlying observation dates.',
  'Automatic facility discovery includes a 5 km buffer around the selected areas. More distant services are not included, even when a journey to them could fit the travel threshold.',
  'WorldPop demand cells represent the selected modeled population, not named settlements, household locations or confirmed service eligibility. Missing population cells are excluded and never treated as zero.',
  'Suggested outreach areas require local review. Population gains can overlap; use the combined scenario total. The suggestions are not a global placement optimum.',
];

export function prepareSurfaceAnalysis(inputs) {
  const { districts, settings, sources } = inputs;
  if (!districts?.length || !['walking', 'driving'].includes(settings?.mode) || !Number.isFinite(settings.thresholdMinutes) || settings.thresholdMinutes < 1 || settings.thresholdMinutes > 1440) throw new Error('Select areas, travel mode and a threshold of 1–1,440 minutes.');
  if (!sources?.population || !sources?.sites) throw new Error('Record the population and service sources.');
  const settlements = normalizeAccessPoints(inputs.settlements, districts, true);
  const sites = inputs.sites.length ? normalizeAccessPoints(inputs.sites, districts, false, true) : [];
  const ids = settings.candidateIds || [], selected = settings.selectedCandidateIds || [];
  if (ids.length > 10 || new Set(ids).size !== ids.length || ids.some(id => !sites.some(s => s.id === id)) || selected.some(id => !ids.includes(id))) throw new Error('Earth Engine estimates support up to ten candidate sites per assessment.');
  if (sites.length - ids.length > 2000) throw new Error('Earth Engine estimates support up to 2,000 existing service locations per assessment.');
  return { settlements, existing: sites.filter(s => !ids.includes(s.id)), candidates: sites.filter(s => ids.includes(s.id)) };
}
export function suggestSurfaceCandidates(settlements, baseline, threshold, limit = 10) {
  const candidates = [];
  for (const row of settlements.map((s, i) => ({ ...s, minutes: baseline[i] })).filter(s => s.population > 0 && (s.minutes == null || s.minutes > threshold)).sort((a,b) => b.population - a.population)) {
    if (candidates.some(c => distanceKm([row.longitude,row.latitude],[c.longitude,c.latitude]) < 2)) continue;
    candidates.push({ id: `suggested:${JSON.stringify([row.areaId,row.id])}`, name: `Suggested outreach near ${row.name}`, latitude: row.latitude, longitude: row.longitude, areaId: row.areaId, areaName: row.areaName, suggested: true });
    if (candidates.length === limit) break;
  }
  return candidates;
}
export function surfaceResult(inputs, prepared, baseline, candidateResults, connectedExisting) {
  const { settlements, existing, candidates } = prepared;
  const { settings } = inputs, selected = settings.selectedCandidateIds || [];
  const checkTimes = times => Array.isArray(times) && times.length === settlements.length && times.every(t => t === null || Number.isFinite(t) && t >= 0);
  if (!checkTimes(baseline) || candidates.some(c => !checkTimes(candidateResults[c.id]?.times))) throw new Error('Incomplete travel estimates cannot be used for modeling.');
  const rows = settlements.map((s,i) => ({ ...s, minutes: baseline[i], status: baseline[i] == null ? 'unknown' : baseline[i] <= settings.thresholdMinutes ? 'covered' : 'beyond-threshold', connectionKm: null }));
  const totals = rows.reduce((v,s) => { v.population += s.population; v[s.status === 'covered' ? 'covered' : s.status === 'unknown' ? 'unknown' : 'beyondThreshold'] += s.population; return v; }, { population: 0, covered: 0, unknown: 0, beyondThreshold: 0 });
  const gains = times => rows.reduce((v,s,i) => {
    if (times[i] != null && times[i] <= settings.thresholdMinutes && s.status !== 'covered') {
      v[s.status === 'unknown' ? 'reachableFromUnknown' : 'additionalPopulation'] += s.population;
      v.settlementIds.push(JSON.stringify([s.areaId,s.settlementId]));
    } return v;
  }, { additionalPopulation: 0, reachableFromUnknown: 0, settlementIds: [] });
  const scenario = baseline.map((t,i) => { const finite = [t, ...selected.map(id => candidateResults[id].times[i])].filter(v => v != null); return finite.length ? Math.min(...finite) : null; });
  const result = {
    schemaVersion: 1, kind: 'access-gaps', method: SURFACE_METHOD, computedAt: new Date().toISOString(),
    scope: { geographyKey: geographyKey(inputs.districts), areas: inputs.districts.map(d => ({ id: String(d.id), name: d.name, geometryVersion: fingerprint(d.geometry) })) },
    settings: { ...settings, speedKph: null, maxSnapKm: null, platformInputs: true, candidateIds: candidates.map(c => c.id), surfaceResolutionM: SURFACE_SOURCE.resolutionM, maxDistanceM: SURFACE_SOURCE.maxDistanceM },
    sources: { ...inputs.sources, roads: SURFACE_SOURCE.name, roadsDate: '2019-01-01', travelSurface: { ...SURFACE_SOURCE, asset: settings.mode === 'walking' ? SURFACE_SOURCE.walkingAsset : SURFACE_SOURCE.asset } },
    areaContext: inputs.areaContext, populationCoverage: inputs.populationCoverage,
    inputFingerprints: { population: fingerprint(inputs.settlements), roads: fingerprint(SURFACE_SOURCE), sites: fingerprint(inputs.sites) },
    totals, settlements: rows,
    candidates: candidates.map(c => ({ ...c, connected: candidateResults[c.id].connected, ...gains(candidateResults[c.id].times) })).sort((a,b) => b.additionalPopulation-a.additionalPopulation || b.reachableFromUnknown-a.reachableFromUnknown || a.id.localeCompare(b.id)),
    existingSites: existing.map((s,i) => ({ ...s, connected: connectedExisting[i] === true })),
    scenario: { ...gains(scenario), selectedCandidateIds: [...selected], coveredPopulation: rows.reduce((sum,s,i) => sum + (scenario[i] != null && scenario[i] <= settings.thresholdMinutes ? s.population : 0),0) },
    network: { nodes: 0, segments: 0, excludedFeatures: 0, unconnectedSites: [...existing.filter((s,i) => !connectedExisting[i]).map(s => s.id), ...candidates.filter(c => !candidateResults[c.id].connected).map(c => c.id)] },
    limitations: [...SURFACE_LIMITATIONS, ...(inputs.populationCoverage?.missingCells ? [`${inputs.populationCoverage.missingCells} population cells have no estimate; their population is unknown.`] : [])],
  };
  return { ...result, decision: buildAccessDecision(result) };
}
