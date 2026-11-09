import { fetchSurfaceFacilities } from '../earthEngine/accessSurface.js';
import { fetchAccessNetwork } from '../osm/accessNetwork.js';
import { accessRoadBounds } from './accessInputs.js';

// Current OSM and Healthsites are related sources, not independent evidence of
// completeness. Keep provenance and prefer the current OSM record for an ID.
export async function discoverAccessFacilities(districts, { snapshot = fetchSurfaceFacilities, current = fetchAccessNetwork, force = false, timeoutMs = 48000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const bounded = promise => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Facility source timed out.')), timeoutMs);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
  async function loadCurrent(bounds = accessRoadBounds(districts), depth = 0) {
    if (Date.now() >= deadline) throw new Error('Facility source timed out.');
    try { return await current(districts, 'services', undefined, bounds, 0, force); }
    catch (error) {
      if (!error.subdivide || depth >= 2) throw error;
      const [w,s,e,n] = bounds;
      const halves = e-w >= n-s ? [[w,s,(w+e)/2,n],[(w+e)/2,s,e,n]] : [[w,s,e,(s+n)/2],[w,(s+n)/2,e,n]];
      const parts = [];
      for (const half of halves) parts.push(await loadCurrent(half, depth + 1));
      return { sites: [...new Map(parts.flatMap(part => part.sites).map(site => [site.id, site])).values()] };
    }
  }
  const [historical, live] = await Promise.allSettled([bounded(snapshot(districts)), bounded(loadCurrent())]);
  if (historical.status === 'rejected' && live.status === 'rejected') throw new Error('Neither Healthsites nor current OSM facilities could be loaded. Retry discovery or use a verified service roster.');
  const warnings = [], providers = [], byId = new Map();
  for (const [result, source] of [[historical, 'Healthsites snapshot (2025-06-07)'], [live, 'Current OpenStreetMap']]) {
    if (result.status === 'rejected') { warnings.push(`${source} could not be checked; facility discovery is incomplete.`); providers.push({ source, status: 'unavailable' }); continue; }
    providers.push({ source, status: 'loaded', count: result.value.sites.length });
    for (const site of result.value.sites) {
      const id = site.id.replace(/^osm:/, '');
      byId.set(id, { ...site, id: `osm:${id}`, source, vaccinationService: 'unverified' });
    }
  }
  if (byId.size > 2000) throw new Error('More than 2,000 facilities were found. Use regional groups for this assessment.');
  return { sites: [...byId.values()], source: { name: providers.filter(p => p.status === 'loaded').map(p => p.source).join(' + '), license: 'ODbL' },
    metadata: { timestamp: new Date().toISOString(), warnings, providers, discoveryVersion: 2 } };
}
