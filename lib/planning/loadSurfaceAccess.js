import { prepareSurfaceAnalysis, suggestSurfaceCandidates, surfaceResult, SURFACE_SOURCE } from './surfaceAccess.js';

// Private to one mounted assessment editor. Never shared with other users.
export const createSurfaceTravelCache = () => ({ context: null, entries: new Map() });
export async function requestSurface(body, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 60000);
  try {
    const response = await fetch('/api/access-surface', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Earth Engine data could not be loaded.');
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Calculation or loading cancelled.' : 'Earth Engine request timed out. Retry loading or calculating.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function runSurfaceAccess(inputs, { signal, onProgress = () => {}, request = requestSurface, cache = createSurfaceTravelCache() } = {}) {
  const prepared = prepareSurfaceAnalysis(inputs), coords = p => [p.longitude,p.latitude];
  const context = JSON.stringify({ origins: prepared.settlements.map(coords), mode: inputs.settings.mode, source: SURFACE_SOURCE });
  if (cache.context !== context) { cache.entries.clear(); cache.context = context; }
  const travel = async (sites, label) => {
    if (signal?.aborted) throw new Error('Calculation cancelled.');
    const key = JSON.stringify(sites.map(coords));
    if (cache.entries.has(key)) {
      onProgress(`${label}: using saved travel times`);
      return cache.entries.get(key);
    }
    const times = [], connected = [];
    for (let offset = 0; offset < prepared.settlements.length; offset += 1000) {
      if (signal?.aborted) throw new Error('Calculation cancelled.');
      onProgress(`${label}: population batch ${1 + offset / 1000} of ${Math.ceil(prepared.settlements.length / 1000)}`);
      const origins = prepared.settlements.slice(offset,offset+1000).map(coords);
      const result = sites.length ? await request({ action: 'travel', districts: inputs.districts, origins, sites: sites.map(coords), mode: inputs.settings.mode },signal) : { times: origins.map(() => null), connectedSites: [] };
      if (!Array.isArray(result.times) || result.times.length !== origins.length || result.times.some(t => t !== null && (!Number.isFinite(t) || t < 0)) || !Array.isArray(result.connectedSites) || result.connectedSites.length !== sites.length) throw new Error('Earth Engine returned an incomplete travel estimate.');
      times.push(...result.times);
      result.connectedSites.forEach((v,i) => { connected[i] = connected[i] === false ? false : v === true; });
    }
    if (signal?.aborted) throw new Error('Calculation cancelled.');
    const value = { times, connectedSites: connected };
    if (cache.entries.size >= 32) cache.entries.delete(cache.entries.keys().next().value);
    cache.entries.set(key, value);
    return value;
  };
  const baseline = await travel(prepared.existing,'Estimating access to existing services');
  const candidateResults = Object.create(null);
  if (inputs.settings.suggestCandidates && !prepared.candidates.length) {
    // Seed each next search in population still unreached after earlier tested
    // sites. Actual surface times, rather than straight-line spacing, remove
    // overlap from the next search area.
    const remaining = [...baseline.times], attempted = new Set();
    for (let i = 0; i < 10; i++) {
      const potential = prepared.settlements.map((row, index) => attempted.has(index) ? { ...row, population: 0 } : row);
      const [candidate] = suggestSurfaceCandidates(potential, remaining, inputs.settings.thresholdMinutes, 1);
      if (!candidate) break;
      const origin = prepared.settlements.findIndex(row => row.latitude === candidate.latitude && row.longitude === candidate.longitude);
      attempted.add(origin);
      const result = await travel([candidate], `Testing complementary outreach area ${i + 1}`);
      prepared.candidates.push(candidate);
      candidateResults[candidate.id] = { times: result.times, connected: result.connectedSites[0] };
      result.times.forEach((time, index) => { if (time != null && (remaining[index] == null || time < remaining[index])) remaining[index] = time; });
    }
  }
  for (const [i,candidate] of prepared.candidates.entries()) {
    if (candidateResults[candidate.id]) continue;
    const result = await travel([candidate],`Comparing outreach area ${i+1} of ${prepared.candidates.length}`);
    candidateResults[candidate.id] = { times: result.times, connected: result.connectedSites[0] };
  }
  if (signal?.aborted) throw new Error('Calculation cancelled.');
  return surfaceResult(inputs,prepared,baseline.times,candidateResults,baseline.connectedSites);
}
