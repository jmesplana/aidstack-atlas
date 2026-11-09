import { buildAccessDecision } from './accessDecision.js';
import { buildTravelNetwork, snapToNetwork, timesToDestinations, distanceKm } from '../geo/travelTime.js';
import { isPointInGeometry } from '../geo/geometry.js';
import { validAreaAccessContext } from './areaAccess.js';
import { fingerprint, geographyKey } from './geography.js';

export const ACCESS_METHOD = 'road-network-v1';
export const ACCESS_LIMITATIONS = [
  'Coverage represents the supplied population points or selected modeled population; it does not establish service eligibility or use.',
  'Travel times are modeled using the supplied road network and assumed speeds. They do not verify road condition, safety, facility readiness, opening hours, or capacity.',
  'Only included service sites count. Missing services or services outside the selected areas can change the estimated gaps. Turn restrictions, conditional access, traffic and terrain are not modeled.',
  'Connections from points to the nearest road are modeled as walking at 4 km/h; barriers along these short connections are not modeled.',
  'Junctions require shared vertices. Geometric crossings are not automatically connected. Missing links and disconnected roads produce unknown access, not proof of no access.',
  'Individual candidate gains overlap. Use the combined scenario total when selecting multiple sites.'
];
function number(value) { return value == null || String(value).trim() === '' ? NaN : Number(value); }
export function normalizeAccessPoints(rows, districts, population = false, allowOutsideSites = false) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error('Provide between 1 and 10,000 point rows.');
  const seen = new Set();
  return rows.map((row, index) => {
    const latitude = number(row.latitude), longitude = number(row.longitude);
    const id = String((population ? row.settlement_id : row.id) ?? '').trim();
    const name = String((population ? (row.settlement || row.name) : row.name) || '').trim();
    if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error(`Row ${index + 2}: ID, name and valid latitude/longitude are required.`);
    let areas = districts.filter((area) => isPointInGeometry([longitude, latitude], area.geometry));
    if (population && row.demandType === 'worldpop-cell' && row.area_id != null) areas = areas.filter((a) => String(a.id) === String(row.area_id));
    if (areas.length !== 1 && !(allowOutsideSites && !population && areas.length === 0)) throw new Error(`Row ${index + 2}: point must fall in exactly one selected administrative area.`);
    const areaId = areas.length ? String(areas[0].id) : 'outside-scope', key = JSON.stringify([areaId, id]);
    // Site IDs are global within an analysis; settlement IDs are local to an admin area.
    const unique = population ? key : id;
    if (seen.has(unique)) throw new Error(`Row ${index + 2}: duplicate point ID.`);
    seen.add(unique);
    const result = { id, name, areaId, ...(row.suggested === true ? { suggested: true } : {}), ...(row.source ? { source: String(row.source) } : {}), areaName: areas[0]?.name || 'Nearby service', latitude, longitude };
    if (population) {
      const count = number(row.population);
      if (!(row.demandType === 'worldpop-cell' ? Number.isFinite(count) : Number.isSafeInteger(count)) || count < 0 || count > 1e9) throw new Error(`Row ${index + 2}: population must be a valid non-negative count up to 1 billion.`);
      result.population = count; result.settlementId = id;
      if (row.demandType === 'worldpop-cell') result.demandType = row.demandType;
    }
    return result;
  });
}

export function analyzeAccessGaps({ districts, settlements: rawSettlements, sites: rawSites, roads, settings, sources, areaContext = null, populationCoverage = null }) {
  if (!districts?.length) throw new Error('Select at least one administrative area.');
  const { thresholdMinutes, maxSnapKm, mode, speedKph, candidateIds = [], selectedCandidateIds = [] } = settings;
  if (!Number.isFinite(thresholdMinutes) || thresholdMinutes < 1 || thresholdMinutes > 1440 || !Number.isFinite(maxSnapKm) || maxSnapKm < 0 || maxSnapKm > 2) throw new Error('Use a threshold of 1–1,440 minutes and a road connection limit of 0–2 km.');
  for (const key of ['population', 'roads', 'sites', 'populationDate', 'roadsDate']) if (!String(sources?.[key] || '').trim()) throw new Error('Record population, site and road sources, plus population and road observation dates.');
  for (const key of ['populationDate', 'roadsDate']) if (!/^\d{4}-\d{2}-\d{2}$/.test(sources[key]) || !Number.isFinite(Date.parse(sources[key])) || new Date(sources[key]).toISOString().slice(0, 10) !== sources[key]) throw new Error('Use valid observation dates.');
  const settlements = normalizeAccessPoints(rawSettlements, districts, true), sites = rawSites.length ? normalizeAccessPoints(rawSites, districts, false, settings.platformInputs === true) : [];
  const ids = new Set(sites.map((site) => site.id));
  if (candidateIds.length > 50 || new Set(candidateIds).size !== candidateIds.length || candidateIds.some((id) => !ids.has(id)) || selectedCandidateIds.some((id) => !candidateIds.includes(id))) throw new Error('Choose up to 50 distinct candidate sites from this analysis.');
  const existing = sites.filter((site) => !candidateIds.includes(site.id)), candidates = sites.filter((site) => candidateIds.includes(site.id));
  if (!existing.length && !settings.platformInputs) throw new Error('Keep at least one site as an existing service location.');
  const network = buildTravelNetwork(roads, { mode, speedKph });
  const snap = (row) => snapToNetwork([row.longitude, row.latitude], network, maxSnapKm);
  const origins = settlements.map(snap), siteSnaps = new Map(sites.map((site) => [site.id, snap(site)]));
  const existingSnaps = existing.map((site) => siteSnaps.get(site.id));
  const baseline = timesToDestinations(network, origins, existingSnaps);
  if (settings.suggestCandidates && candidates.length === 0) {
    const potential = settlements.map((row, i) => ({ ...row, origin: origins[i], baseline: baseline[i] }))
      .filter((row) => row.origin && (row.baseline == null || row.baseline > thresholdMinutes)).sort((a, b) => b.population - a.population);
    const remaining = [...baseline];
    for (const row of potential) {
      const index = settlements.findIndex(s => s.id === row.id && s.areaId === row.areaId);
      if (row.population <= 0 || (remaining[index] != null && remaining[index] <= thresholdMinutes)) continue;
      const candidate = { id: `suggested:${JSON.stringify([row.areaId,row.id])}`, name: `Suggested outreach near ${row.name}`, latitude: row.latitude, longitude: row.longitude, areaId: row.areaId, areaName: row.areaName, suggested: true };
      candidates.push(candidate); siteSnaps.set(candidate.id, row.origin);
      timesToDestinations(network, origins, [row.origin]).forEach((time, i) => { if (time != null && (remaining[i] == null || time < remaining[i])) remaining[i] = time; });
      if (candidates.length >= 10) break;
    }
  }
  const status = (time) => time == null ? 'unknown' : time <= thresholdMinutes ? 'covered' : 'beyond-threshold';
  const rows = settlements.map((row, i) => ({ ...row, minutes: baseline[i], status: status(baseline[i]), connectionKm: origins[i]?.km ?? null }));
  const totals = rows.reduce((sum, row) => {
    sum.population += row.population;
    sum[row.status === 'covered' ? 'covered' : row.status === 'unknown' ? 'unknown' : 'beyondThreshold'] += row.population;
    return sum;
  }, { population: 0, covered: 0, beyondThreshold: 0, unknown: 0 });
  function gains(times) {
    return rows.reduce((sum, row, i) => {
      if (times[i] != null && times[i] <= thresholdMinutes && row.status !== 'covered') {
        sum[row.status === 'unknown' ? 'reachableFromUnknown' : 'additionalPopulation'] += row.population;
        sum.settlementIds.push(JSON.stringify([row.areaId, row.settlementId]));
      }
      return sum;
    }, { additionalPopulation: 0, reachableFromUnknown: 0, settlementIds: [] });
  }
  const ranked = candidates.map((site) => ({ ...site, connected: !!siteSnaps.get(site.id), ...gains(timesToDestinations(network, origins, [siteSnaps.get(site.id)])) }))
    .sort((a, b) => b.additionalPopulation - a.additionalPopulation || b.reachableFromUnknown - a.reachableFromUnknown || a.id.localeCompare(b.id));
  const scenarioTimes = timesToDestinations(network, origins, [...existingSnaps, ...selectedCandidateIds.map((id) => siteSnaps.get(id))]);
  const result = {
    schemaVersion: 1, kind: 'access-gaps', method: ACCESS_METHOD, computedAt: new Date().toISOString(),
    scope: { geographyKey: geographyKey(districts), areas: districts.map((d) => ({ id: String(d.id), name: d.name, geometryVersion: fingerprint(d.geometry) })) },
    settings: { ...settings, candidateIds: candidates.map((c) => c.id) }, sources: { ...sources }, areaContext, populationCoverage,
    inputFingerprints: { population: fingerprint(rawSettlements), roads: fingerprint(roads), sites: fingerprint(rawSites) },
    totals, settlements: rows, candidates: ranked,
    existingSites: existing.map((site) => ({ ...site, connected: !!siteSnaps.get(site.id) })),
    scenario: { ...gains(scenarioTimes), selectedCandidateIds: [...selectedCandidateIds], coveredPopulation: rows.reduce((sum, row, i) => sum + (scenarioTimes[i] != null && scenarioTimes[i] <= thresholdMinutes ? row.population : 0), 0) },
    network: { nodes: network.nodes.length, segments: network.segments.length, excludedFeatures: network.excluded, unconnectedSites: sites.filter((site) => !siteSnaps.get(site.id)).map((site) => site.id) },
    limitations: [...ACCESS_LIMITATIONS,
      ...(populationCoverage?.missingCells > 0 ? [`${populationCoverage.missingCells} grid cells have no WorldPop estimate. Population totals and coverage exclude these cells; their population is unknown, not zero.`] : []),
      ...(settlements.some((s) => s.demandType === 'worldpop-cell') ? ['WorldPop cells contain modeled population, including fractional estimates. Counts are summed from the source raster within clipped cells. Journeys represent cell points, not named settlements or household locations. Grid size affects the estimates.'] : []),
      ...(settings.platformInputs ? ['OSM roads include a 5 km buffer around the selected areas; journeys requiring roads beyond the extract remain unknown. Mapped health facilities may not provide the required service; verify locally.'] : []),
      ...(settings.suggestCandidates ? ['Suggested outreach locations are up to ten search areas seeded in population still unreached by earlier tested sites. They require local site selection, service and safety checks; they are not a globally optimal placement.'] : [])]
  };
  return { ...result, decision: buildAccessDecision(result) };
}

export function accessEvidenceForObservations(result, observations) {
  const byId = new Map(result.settlements.map((row) => [JSON.stringify([row.areaId, row.settlementId]), row]));
  return observations.map((observation) => {
    const row = byId.get(JSON.stringify([observation.areaId, observation.settlementId]));
    if (!row) return { ...observation, accessStatus: 'not-matched', accessMinutes: null };
    const hasCoordinates = observation.latitude != null && observation.longitude != null;
    const conflict = hasCoordinates && (Math.abs(Number(observation.latitude) - row.latitude) > 0.00001 || Math.abs(Number(observation.longitude) - row.longitude) > 0.00001);
    return { ...observation, accessStatus: conflict ? 'location-changed' : row.status, accessMinutes: conflict ? null : row.minutes };
  });
}

export function validAccessEvidence(evidence) {
  if (!evidence) return true;
  const r = evidence.result;
  if (r?.areaContext != null && !validAreaAccessContext(r.areaContext)) return false;
  return typeof evidence.name === 'string' && typeof evidence.publicationId === 'string' && typeof evidence.attachedAt === 'string' &&
    evidence.source?.moduleId === 'access-gaps' && Number.isInteger(evidence.source.revision) && evidence.source.revision > 0 &&
    r?.schemaVersion === 1 && r.kind === 'access-gaps' && [ACCESS_METHOD, 'friction-surface-v1'].includes(r.method) && typeof r.computedAt === 'string' &&
    (r.method !== 'friction-surface-v1' || r.sources?.travelSurface?.year === 2019 && r.settings?.surfaceResolutionM === 927.67 && r.settings?.maxDistanceM === 100000) &&
    !!r.sources && ['population', 'roads', 'sites', 'populationDate', 'roadsDate'].every((key) => typeof r.sources[key] === 'string') &&
    !!r.settings && ['walking', 'driving'].includes(r.settings.mode) && Number.isFinite(r.settings.thresholdMinutes) &&
    Array.isArray(r.scope?.areas) && r.scope.areas.every((a) => a && typeof a.id === 'string' && typeof a.geometryVersion === 'string') &&
    Array.isArray(r.limitations) && r.limitations.every((s) => typeof s === 'string') &&
    Array.isArray(r.settlements) && r.settlements.every((s) => s && typeof s.areaId === 'string' && typeof s.settlementId === 'string' && typeof s.name === 'string' && Number.isFinite(s.latitude) && Number.isFinite(s.longitude) &&
      ['covered', 'beyond-threshold', 'unknown'].includes(s.status) && (s.minutes === null || Number.isFinite(s.minutes) && s.minutes >= 0)) &&
    Array.isArray(r.candidates) && r.candidates.every((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && Number.isFinite(c.additionalPopulation) && Number.isFinite(c.reachableFromUnknown));
}
