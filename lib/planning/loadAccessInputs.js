import { ROUTING_GROUPS } from '../osm/routingGroups.js';
import { accessScopeKey } from './accessInputs.js';
import { planAccessBatches, mergeAccessBatches, splitAccessRoadBatch } from './accessBatches.js';
import { loadAccessInput, saveAccessInput, loadAccessBatch, saveAccessBatch } from '../dataStore.js';
import { requestSurface } from './loadSurfaceAccess.js';

export async function loadPlatformAccessInputs({ districts, cellSize = 1000, year = 'latest', cohort = {}, force = false, model = 'network', discoverFacilities = true, signal, onProgress = () => {} }) {
  const plan = planAccessBatches(districts, cellSize, year);
  const baseScopeKey = accessScopeKey(districts, cellSize, year);
  const scopeKey = accessScopeKey(districts, cellSize, year, cohort);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const check = () => { if (controller.signal.aborted) throw new DOMException('Loading cancelled.', 'AbortError'); };
  const stages = {};
  const progress = (message, kind) => { check(); stages[kind] = message; onProgress(Object.values(stages).join(' · ')); };
  const pause = milliseconds => new Promise((resolve, reject) => {
    check();
    const cancelled = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', cancelled); reject(new DOMException('Loading cancelled.', 'AbortError')); };
    const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancelled); resolve(); }, milliseconds);
    controller.signal.addEventListener('abort', cancelled, { once: true });
  });
  let roadRequests = 0;
  async function requestBatch(kind, batch, depth = 0, group = null) {
    check();
    const cached = !force && await loadAccessBatch(kind, batch.scopeKey).catch(() => null);
    if (cached) return cached;
    if (kind === 'roads' && !group) {
      const parts = [];
      for (const name of ROUTING_GROUPS) {
        progress(`OSM ${name === 'services' ? 'health facilities' : name + ' roads'}: loading group ${parts.length + 1} of ${ROUTING_GROUPS.length}`, kind);
        parts.push(await requestBatch(kind, { ...batch, scopeKey: `${batch.scopeKey}:${name}` }, depth, name));
      }
      const merged = mergeAccessBatches(kind, parts, batch.scopeKey, plan.cellSize, cellSize, { allowEmpty: true });
      merged.routingGroups = [...ROUTING_GROUPS]; delete merged.routingGroup;
      check(); await saveAccessBatch(kind, merged).catch(() => {});
      return merged;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      check();
      if (kind === 'roads' && ++roadRequests > 640) throw new Error('Road loading reached the request limit while recovering from service failures. Retry loading to reuse completed downloads.');
      let response, data;
      try {
        response = await fetch('/api/access-inputs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ districts: batch.districts, kind, cellSize: plan.cellSize, year, cohort, ...(force ? { refresh: true } : {}), ...(kind === 'roads' ? { providerAttempt: attempt } : {}), ...(group ? { group } : {}), ...(batch.roadBounds ? { roadBounds: batch.roadBounds } : {}) }) });
        try { data = await response.json(); }
        catch { data = { error: 'The data download connection returned an unreadable response. Retry loading; completed downloads will be reused.', code: 'OSM_PROVIDER_UNAVAILABLE', retryAfter: 5 }; }
      } catch (error) {
        check();
        if (kind !== 'roads') throw error;
        data = { error: 'The road download connection was interrupted. Retry loading; completed downloads will be reused.', code: 'OSM_PROVIDER_UNAVAILABLE', retryAfter: 5 };
      }
      check();
      if (!response?.ok || data.error) {
        if (kind === 'roads' && data.subdivide && depth < 3) {
          const children = splitAccessRoadBatch(batch, plan.cellSize, year).map(child => ({ ...child, scopeKey: child.scopeKey + (group ? `:${group}` : '') }));
          if (children.length > 1) {
            progress('OSM request timed out or was incomplete — retrying smaller sections of the same administrative area', kind);
            const parts = [];
            for (const [index, child] of children.entries()) {
              progress(`Loading OSM recovery section ${index + 1} of ${children.length} (level ${depth + 1})`, kind);
              parts.push(await requestBatch(kind, child, depth + 1, group));
            }
            const merged = mergeAccessBatches(kind, parts, batch.scopeKey, plan.cellSize, cellSize, { allowEmpty: true });
            check(); await saveAccessBatch(kind, merged).catch(() => {});
            return merged;
          }
        }
        const delay = Math.max(.01, Number(data.retryAfter) || 5);
        if (kind === 'roads' && attempt === 0 && ['OSM_PROVIDER_BUSY', 'OSM_PROVIDER_UNAVAILABLE'].includes(data.code) && delay <= 30) {
          progress(`OSM service is unavailable or busy — retrying in ${delay} seconds; completed downloads are retained`, kind);
          await pause(delay * 1000);
          progress('Retrying the OSM road download for the same administrative area', kind);
          continue;
        }
        throw new Error(typeof data.error === 'string' ? data.error : 'Platform data could not be loaded. Retry loading; completed downloads will be reused.');
      }
      if (data.metadata?.scopeKey !== batch.scopeKey || (kind === 'population' ? !Array.isArray(data.points) : !data.routingReady || !Array.isArray(data.roads?.features) || !Array.isArray(data.sites))) throw new Error('The platform returned an incomplete area extract. Retry loading the data.');
      await saveAccessBatch(kind, data).catch(() => {});
      return data;
    }
  }
  async function load(kind) {
    try {
      check();
      const label = kind === 'population' ? 'WorldPop cells' : 'OSM network';
      const kindScope = kind === 'population' ? scopeKey : baseScopeKey;
      const cached = !force && await loadAccessInput(kind, kindScope).catch(() => null);
      if (cached) { progress(`${label} restored from workspace cache`, kind); return cached; }
      const parts = [];
      for (const [index, batch] of plan.batches.entries()) {
        progress(`${label}: batch ${index + 1} of ${plan.batches.length}${plan.cellSize > cellSize ? ` · ${plan.cellSize / 1000} km population grid` : ''}`, kind);
        const scopedBatch = kind === 'population' ? { ...batch, scopeKey: accessScopeKey(batch.districts, plan.cellSize, year, cohort) } : batch;
        const data = await requestBatch(kind, scopedBatch);
        check(); parts.push(data);
      }
      const merged = mergeAccessBatches(kind, parts, kindScope, plan.cellSize, cellSize);
      check();
      await saveAccessInput(kind, merged).catch(() => {});
      progress(`${label}: all ${parts.length} batches complete`, kind);
      return merged;
    } catch (error) { controller.abort(); throw error; }
  }
  async function loadFacilities() {
    try {
      const parts = [];
      for (const [index,batch] of plan.batches.entries()) {
        progress(`Healthsites facility snapshot: batch ${index+1} of ${plan.batches.length}`, 'services');
        const key = `${batch.scopeKey}:surface-services:v2`;
        let part = !force && await loadAccessBatch('roads',key).catch(() => null);
        if (!part) {
          part = await requestSurface({ action: 'facilities', districts: batch.districts, refresh: force },controller.signal);
          if (!Array.isArray(part.sites) || !part.metadata?.timestamp || !part.source?.name) throw new Error('The facility snapshot could not be loaded completely.');
          part.metadata.scopeKey = key;
          check(); if (!part.metadata.warnings?.length) await saveAccessBatch('roads',part).catch(() => {});
        }
        parts.push(part);
      }
      const sites = [...new Map(parts.flatMap(p => p.sites).map(s => [s.id,s])).values()];
      if (sites.length > 2000) throw new Error('More than 2,000 facilities were found. Use regional groups for this assessment.');
      progress(`Healthsites snapshot: ${sites.length} mapped facilities loaded`, 'services');
      return { roads: { type: 'FeatureCollection', features: [] }, sites, source: parts[0].source,
        metadata: { discoveryVersion: 2, timestamp: parts.map(p => p.metadata.timestamp).sort()[0], warnings: [...new Set(parts.flatMap(p => p.metadata.warnings || []))], providers: parts.flatMap(p => p.metadata.providers || []) } };
    } catch (error) { controller.abort(); throw error; }
  }
  try {
    const [population, network] = await Promise.all([load('population'), model === 'surface' ? discoverFacilities ? loadFacilities() : Promise.resolve({ roads: { type: 'FeatureCollection', features: [] }, sites: [], source: { name: 'User-supplied service locations' }, metadata: { discoveryVersion: 2, timestamp: new Date().toISOString() } }) : load('roads')]);
    return { population, network: discoverFacilities ? network : { ...network, sites: [], source: { name: 'User-supplied service locations' } }, scopeKey, model };
  } finally { signal?.removeEventListener('abort', abort); }
}
