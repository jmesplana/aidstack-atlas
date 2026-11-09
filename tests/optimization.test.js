import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDB } from 'idb';
import { createLatestTaskRunner } from '../lib/latestTask.js';
import { createAIResultCache } from '../lib/ai/aiCache.js';
import { createSurfaceTravelCache, runSurfaceAccess } from '../lib/planning/loadSurfaceAccess.js';
import { summarizeAreaContext } from '../lib/planning/areaAccess.js';
import { saveWorkspace, loadWorkspace, clearWorkspace } from '../lib/storage/workspaceStore.js';
import { infrastructurePopup } from '../lib/osm/popup.js';
import { basemapFiles } from '../lib/outbreak/regionalBasemap.js';

test('latest task coalesces pending changes and prevents an older result from applying', async () => {
  const runner = createLatestTaskRunner(), applied = [], ran = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = runner.run(async current => { ran.push(1); await gate; if (current()) applied.push(1); });
  const second = runner.run(async current => { ran.push(2); if (current()) applied.push(2); });
  const third = runner.run(async current => { ran.push(3); if (current()) applied.push(3); });
  release(); await Promise.all([first, second, third]);
  assert.deepEqual(ran, [1, 3]); assert.deepEqual(applied, [3]);
});

test('surface cache reuses travel for selections and thresholds but invalidates coordinates and mode', async () => {
  const districts = [{ id: 'a', name: 'Area', geometry: { type: 'Polygon', coordinates: [[[7,46],[8,46],[8,47],[7,47],[7,46]]] } }];
  const inputs = { districts, settlements: Array.from({ length: 2756 }, (_, i) => ({ settlement_id: String(i), settlement: `Cell ${i}`, area_id: 'a', latitude: 46.1, longitude: 7.1, population: 1 })), sites: [{ id: 'service', name: 'Clinic', latitude: 46.1, longitude: 7.1 }, ...Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `Candidate ${i}`, latitude: 46.1, longitude: 7.12 + i * .001 }))], settings: { mode: 'walking', thresholdMinutes: 60, candidateIds: Array.from({ length: 10 }, (_, i) => `c${i}`), selectedCandidateIds: [] }, sources: { population: 'Fixture', sites: 'Fixture' } };
  const cache = createSurfaceTravelCache(); let calls = 0;
  const request = async body => { calls++; return { times: body.origins.map(() => body.sites[0][0] === 7.1 ? 80 : 10), connectedSites: [true] }; };
  await runSurfaceAccess(inputs, { request, cache }); assert.equal(calls, 33);
  const scenario = await runSurfaceAccess({ ...inputs, settings: { ...inputs.settings, selectedCandidateIds: ['c0'], thresholdMinutes: 30 } }, { request, cache });
  assert.equal(calls, 33); assert.equal(scenario.scenario.additionalPopulation, 2756);
  await runSurfaceAccess({ ...inputs, sites: inputs.sites.map(site => site.id === 'c0' ? { ...site, longitude: 7.2 } : site) }, { request, cache }); assert.equal(calls, 36);
  await runSurfaceAccess({ ...inputs, settings: { ...inputs.settings, mode: 'driving' } }, { request, cache }); assert.equal(calls, 69);
});

test('AI cache retains bounded local results during outages without extending their lifetime', async () => {
  let now = 0;
  const cache = createAIResultCache({ redis: { run: async () => ({ ok: false }) }, now: () => now, maxEntries: 1 });
  await cache.setCachedAIResult('a', { value: 1 }, 10);
  assert.deepEqual(await cache.getCachedAIResult('a'), { value: 1 });
  await cache.setCachedAIResult('b', { value: 2 }, 10);
  assert.equal(await cache.getCachedAIResult('a'), null);
  now = 10001; assert.equal(await cache.getCachedAIResult('b'), null);
});

test('surface area context marks roads unavailable while counting local facilities separately', () => {
  const rows = summarizeAreaContext([{ id: 'a', name: 'Area', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] } }], {}, null, { features: [{ properties: { category: 'clinic' }, geometry: { type: 'Point', coordinates: [.5,.5] } }], metadata: { roadsAvailable: false, facilitiesAvailable: true, facilitySource: 'Healthsites snapshot' } });
  assert.equal(rows[0].infrastructure.roadsAvailable, false); assert.equal(rows[0].infrastructure.healthFacilities, 1); assert.equal(rows[0].infrastructure.facilitySource, 'Healthsites snapshot');
});

test('workspace storage restores old snapshots and reuses unchanged data in atomic new snapshots', async () => {
  global.window = {};
  try {
    const db = await openDB('aidstack_workspace', 1, { upgrade(db) { db.createObjectStore('workspace'); } });
    await db.put('workspace', { schemaVersion: 1, facilities: [{ id: 'old' }] }, 'current');
    assert.equal((await loadWorkspace()).facilities[0].id, 'old');
    const workspace = { facilities: [{ id: 'new' }], districts: [], acledData: [] };
    await saveWorkspace(workspace);
    const first = await db.get('workspace', 'current');
    await saveWorkspace({ ...workspace, operationType: 'immunization' });
    const second = await db.get('workspace', 'current');
    assert.equal(first._dataRefs.facilities, second._dataRefs.facilities);
    assert.equal((await loadWorkspace()).operationType, 'immunization');
    await saveWorkspace({ ...workspace, facilities: [{ id: 'changed' }] });
    assert.equal((await loadWorkspace()).facilities[0].id, 'changed');
    assert.equal(await db.get('workspace', second._dataRefs.facilities), undefined);
    await clearWorkspace(); assert.equal(await loadWorkspace(), null); assert.equal((await db.getAllKeys('workspace')).length, 0);
    db.close();
  } finally { delete global.window; }
});

test('OSM labels are treated as text and malformed source identifiers cannot create links', () => {
  const created = [];
  const document = { createElement(tag) { const element = { tag, style: {}, children: [], appendChild(child) { this.children.push(child); }, set innerHTML(_) { throw new Error('HTML injection'); } }; created.push(element); return element; } };
  const name = '<img src=x onerror=alert(1)>';
  infrastructurePopup({ properties: { name, tags: { operator: name }, osmType: 'way', osmId: '1" onclick="x' } }, document);
  assert.equal(created.find(el => el.tag === 'strong').textContent, name);
  assert.equal(created.some(el => el.tag === 'a'), false);
});

test('briefing region selection avoids fetching the entire global basemap', () => {
  const files = basemapFiles([6,45,8,47]);
  assert.ok(files.length > 0 && files.length < 20); assert.deepEqual(basemapFiles(null), []);
});
