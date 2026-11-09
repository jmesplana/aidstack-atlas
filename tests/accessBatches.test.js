import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import area from '@turf/area';
import intersect from '@turf/intersect';
import { planAccessBatches, mergeAccessBatches } from '../lib/planning/accessBatches.js';
import { accessScopeKey, accessRoadScopeKey, accessRoadBounds, validateAccessInputRequest, parseAccessOverpass } from '../lib/planning/accessInputs.js';
import { loadPlatformAccessInputs } from '../lib/planning/loadAccessInputs.js';
import { buildTravelNetwork, snapToNetwork, timesToDestinations } from '../lib/geo/travelTime.js';

const district = { id: 'large-admin', name: 'Large administrative area', geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]], [[.1, .1], [.1, .2], [.2, .2], [.2, .1], [.1, .1]]] } };
const feature = geometry => ({ type: 'Feature', properties: {}, geometry });
const metadata = key => ({ scopeKey: key, timestamp: new Date().toISOString() });
const road = (id, from, to, nodes) => ({ type: 'Feature', id, properties: { nodeIds: nodes }, geometry: { type: 'LineString', coordinates: [from, to] } });

test('a selected admin larger than 10,000 km² is completely partitioned with original IDs and holes', () => {
  assert.ok(area(district.geometry) > 1e10);
  const plan = planAccessBatches([district]);
  assert.ok(plan.batches.length > 1);
  assert.equal(plan.cellSize, 5000);
  const fragments = plan.batches.flatMap(b => b.districts);
  assert.ok(fragments.every(d => d.id === district.id));
  assert.ok(Math.abs(fragments.reduce((sum, d) => sum + area(d.geometry), 0) - area(district.geometry)) < 1);
  for (const b of plan.batches) validateAccessInputRequest({ districts: b.districts, kind: 'population', cellSize: plan.cellSize });
  for (let i = 0; i < fragments.length; i++) for (let j = i + 1; j < fragments.length; j++) {
    const overlap = intersect({ type: 'FeatureCollection', features: [fragments[i], fragments[j]].map(d => feature(d.geometry)) });
    assert.ok(!overlap || area(overlap) < 1);
  }
  assert.throws(() => planAccessBatches([district, { ...district, id: 'overlap' }]), /overlap/);
});

test('merged road batches preserve journeys across tile boundaries and deduplicate buffered ways', () => {
  const a = road('way/1', [0, 0], [.01, 0], [1, 2]), b = road('way/2', [.01, 0], [.02, 0], [2, 3]);
  const part = (features, key) => ({ metadata: metadata(key), routingReady: true, sites: [], roads: { type: 'FeatureCollection', features } });
  const merged = mergeAccessBatches('roads', [part([a], 'a'), part([a, b], 'b'), part([], 'c')], 'full', 1000, 1000);
  assert.equal(merged.segments, 2); assert.equal(merged.roads.features.length, 2);
  const network = buildTravelNetwork(merged.roads, { mode: 'walking', speedKph: 4 });
  assert.ok(timesToDestinations(network, [snapToNetwork([0, 0], network, 1)], [snapToNetwork([.02, 0], network, 1)])[0] > 0);
  assert.throws(() => mergeAccessBatches('roads', [part([a], 'a'), part([{ ...a, properties: { nodeIds: [1, 99] } }], 'b')], 'full', 1000, 1000), /changed between batches/);
  assert.equal(parseAccessOverpass({ elements: [] }, { allowEmpty: true }).roads.features.length, 0);
  assert.throws(() => parseAccessOverpass({ elements: [], remark: 'timeout' }, { allowEmpty: true }), /complete/);
});

test('population merging preserves fractional counts, original area IDs and missing-cell diagnostics', () => {
  const part = key => ({ metadata: metadata(key), year: 2025, cellSize: 5000, points: [{ settlement_id: 'same-cell', area_id: 'large-admin', population: 12.5 }], missingCells: 1, zeroCells: 2 });
  const result = mergeAccessBatches('population', [part('a'), part('b')], 'full', 5000, 1000);
  assert.equal(result.totalPopulation, 25); assert.equal(result.missingCells, 2);
  assert.equal(new Set(result.points.map(p => p.settlement_id)).size, 2);
  assert.ok(result.points.every(p => p.area_id === 'large-admin'));
  assert.equal(result.requestedCellSize, 1000); assert.equal(result.cellSize, 5000);
});

test('large-area loading resumes completed batches after a failure and caches the complete selected admin', async () => {
  global.window = {};
  const originalFetch = global.fetch;
  let fail = true;
  const calls = new Map();
  const plan = planAccessBatches([district]);
  const sharedRoad = road('way/shared', [0, 0], [.01, 0], [1, 2]);
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body), key = accessRoadScopeKey(body.districts, body.cellSize, body.year, body.roadBounds, body.group), callKey = `${body.kind}:${key}`;
    calls.set(callKey, (calls.get(callKey) || 0) + 1);
    assert.ok(body.districts.every(d => d.id === district.id));
    if (body.kind === 'roads' && key === plan.batches[1].scopeKey + ":major" && fail) return { ok: false, json: async () => ({ error: 'Temporary road source failure' }) };
    return { ok: true, json: async () => body.kind === 'population' ? { metadata: metadata(key), year: 2025, cellSize: body.cellSize, points: [{ settlement_id: 'cell', area_id: district.id, population: 10.5 }], missingCells: 0, zeroCells: 0 } : { metadata: metadata(key), routingReady: true, roads: { type: 'FeatureCollection', features: [sharedRoad] }, sites: [] } };
  };
  try {
    await assert.rejects(loadPlatformAccessInputs({ districts: [district] }), /Temporary road source failure/);
    fail = false;
    const data = await loadPlatformAccessInputs({ districts: [district] });
    assert.equal(data.scopeKey, accessScopeKey([district]));
    assert.equal(data.population.totalPopulation, plan.batches.length * 10.5);
    assert.equal(data.network.roads.features.length, 1);
    assert.equal(calls.get(`roads:${plan.batches[0].scopeKey}:major`), 1);
    const count = [...calls.values()].reduce((a, b) => a + b, 0);
    await loadPlatformAccessInputs({ districts: [district] });
    assert.equal([...calls.values()].reduce((a, b) => a + b, 0), count);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(loadPlatformAccessInputs({ districts: [district], signal: controller.signal }), { name: 'AbortError' });
  } finally { global.fetch = originalFetch; delete global.window; }
});

test('timed-out road batch is subdivided and recombined under the original selected admin', async () => {
  global.window = {};
  const originalFetch = global.fetch;
  const selected = [{ ...district, id: 'timeout-recovery', geometry: { type: 'Polygon', coordinates: [[[7, 46], [7.1, 46], [7.1, 46.1], [7, 46.1], [7, 46]]] } }];
  const scopeKey = accessScopeKey(selected);
  const requested = [], messages = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body), key = accessRoadScopeKey(body.districts, body.cellSize, body.year, body.roadBounds, body.group);
    if (body.kind === 'population') return { ok: true, json: async () => ({ metadata: metadata(key), year: 2025, cellSize: body.cellSize, points: [{ settlement_id: '1', population: 50, area_id: 'timeout-recovery' }] }) };
    requested.push(body);
    if (key === scopeKey + ":major") return { ok: false, json: async () => ({ code: 'OSM_QUERY_TIMEOUT', error: 'Request timed out', subdivide: true }) };
    return { ok: true, json: async () => ({ metadata: metadata(key), routingReady: true, sites: [], roads: { type: 'FeatureCollection', features: [road('same-way', [7, 46], [7.1, 46], [1, 2])] } }) };
  };
  try {
    const data = await loadPlatformAccessInputs({ districts: selected, onProgress: message => messages.push(message) });
    assert.equal(requested.length, 6);
    assert.equal(data.scopeKey, scopeKey); assert.equal(data.network.roads.features.length, 1);
    assert.ok(requested.every(b => b.districts.every(d => d.id === selected[0].id)));
    assert.ok(messages.some(m => /smaller sections/.test(m)));
    const full = accessRoadBounds(selected), children = requested.slice(1, 3).map(b => b.roadBounds);
    assert.deepEqual(children[0].slice(0, 2), full.slice(0, 2));
    assert.deepEqual(children[1].slice(2), full.slice(2));
    assert.equal(children[0][2], children[1][0]);
    assert.ok(requested.every(b => JSON.stringify(b.districts) === JSON.stringify(selected)));
  } finally { global.fetch = originalFetch; delete global.window; }
});

test('busy provider retries the same area once and reuses population data', async () => {
  global.window = {};
  const originalFetch = global.fetch;
  const selected = [{ ...district, id: 'busy-recovery', geometry: { type: 'Polygon', coordinates: [[[7, 46], [7.01, 46], [7.01, 46.01], [7, 46.01], [7, 46]]] } }];
  let roadCalls = 0, populationCalls = 0;
  const providerAttempts = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body), key = accessRoadScopeKey(body.districts, body.cellSize, body.year, body.roadBounds, body.group);
    if (body.kind === 'population') { populationCalls++; return { ok: true, json: async () => ({ metadata: metadata(key), year: 2025, cellSize: body.cellSize, points: [] }) }; }
    roadCalls++;
    providerAttempts.push(body.providerAttempt);
    if (roadCalls === 1) return { ok: false, json: async () => ({ code: 'OSM_PROVIDER_BUSY', error: 'Service busy', retryAfter: .01 }) };
    return { ok: true, json: async () => ({ metadata: metadata(key), routingReady: true, sites: [], roads: { type: 'FeatureCollection', features: [road('way', [7, 46], [7.01, 46], [1, 2])] } }) };
  };
  try {
    await loadPlatformAccessInputs({ districts: selected });
    assert.equal(roadCalls, 5); assert.equal(populationCalls, 1);
    assert.deepEqual(providerAttempts, [0, 1, 0, 0, 0]);
  } finally { global.fetch = originalFetch; delete global.window; }
});
