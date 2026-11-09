import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadInfrastructure } from '../lib/osm/loadInfrastructure.js';
const require = createRequire(import.meta.url);
const { createOverpassClient, failure } = require('../lib/osm/overpassClient.cjs');
const cache = require('../lib/osmCache.js');
const { generateCacheKey, buildRoutingQuery } = require('../lib/osmHelpers.js');
const boundary = { type: 'Polygon', coordinates: [[[7,46],[7.1,46],[7.1,46.1],[7,46.1],[7,46]]] };
const store = () => { const values = new Map(); return { getCachedOSM: async key => values.get(key), setCachedOSM: async (key, value) => values.set(key, value) }; };
const ok = data => ({ ok: true, status: 200, json: async () => data });

test('shared transport coalesces identical requests and caches only complete responses', async () => {
  let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const client = createOverpassClient({ storage: store(), fetchImpl: async (_url, options) => {
    calls++; assert.equal(options.headers['User-Agent'], 'gdacs-facilities-ai/0.1');
    await gate; return ok({ elements: [{ type: 'node', id: 1 }] });
  } });
  const first = client('query'), second = client('query');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); release();
  assert.deepEqual(await first, await second);
  await client('query'); assert.equal(calls, 1);
});

test('provider cooldown respects Retry-After and query errors are not retried', async () => {
  let clock = 1000, calls = [];
  const client = createOverpassClient({ storage: store(), now: () => clock, endpoints: ['primary', 'backup'], fetchImpl: async url => {
    calls.push(url);
    return url === 'primary' ? { ok: false, status: 429, text: async () => 'busy', headers: new Headers({ 'retry-after': '90' }) } : ok({ elements: [] });
  } });
  await client('query'); await client('other-query');
  assert.deepEqual(calls, ['primary', 'backup', 'backup']);
  assert.equal(failure(429, '', '90').retryAfter, 90);
  assert.equal(failure(400, 'parse error').retryable, false);
  let invalidCalls = 0;
  const invalid = createOverpassClient({ storage: store(), fetchImpl: async () => { invalidCalls++; return { ok: false, status: 400, text: async () => 'parse error', headers: new Headers() }; } });
  await assert.rejects(invalid('bad'), /rejected/); assert.equal(invalidCalls, 1);
});

test('runtime-error responses are not cached as complete data', async () => {
  let calls = 0;
  const client = createOverpassClient({ storage: store(), fetchImpl: async () => { calls++; return ok({ elements: [], remark: 'runtime error: Query timed out' }); } });
  for (let i = 0; i < 2; i++) await assert.rejects(client('partial'), e => e.code === 'OSM_QUERY_TIMEOUT');
  assert.equal(calls, 2);
});

test('a retry on a fresh server starts with the backup after a slow primary consumed the deadline', async () => {
  let clock = 0;
  const calls = [];
  const makeClient = () => createOverpassClient({ storage: store(), now: () => clock, endpoints: ['primary', 'backup'], fetchImpl: async url => {
    calls.push(url);
    if (url === 'primary') { clock += 40000; throw new DOMException('Timed out', 'AbortError'); }
    return ok({ elements: [{ type: 'way', id: 7 }] });
  } });
  await assert.rejects(makeClient()('slow-query'), e => e.code === 'OSM_PROVIDER_UNAVAILABLE');
  assert.deepEqual(calls, ['primary'], 'the first request has insufficient budget for another provider');
  const result = await makeClient()('slow-query', { providerAttempt: 1 });
  assert.equal(result.elements[0].id, 7);
  assert.deepEqual(calls, ['primary', 'backup']);
});

test('expired display cache remains available for a labelled fallback and keys include exact geometry', async () => {
  const originalNow = Date.now;
  let time = originalNow(); Date.now = () => time;
  try {
    await cache.setCachedOSM('stale-test', { metadata: { timestamp: new Date(time).toISOString() }, features: [1] }, 1);
    time += 2 * 3600000;
    assert.equal(await cache.getCachedOSM('stale-test'), null);
    assert.deepEqual((await cache.getCachedOSM('stale-test', true)).features, [1]);
    time += 6 * 3600000;
    assert.equal(await cache.getCachedOSM('stale-test', true), null);
  } finally { Date.now = originalNow; }
  const withHole = { ...boundary, coordinates: [...boundary.coordinates, [[7.01,46.01],[7.01,46.02],[7.02,46.02],[7.02,46.01],[7.01,46.01]]] };
  assert.notEqual(generateCacheKey(boundary, ['roads'], {}), generateCacheKey(withHole, ['roads'], {}));
  assert.equal(generateCacheKey(boundary, ['roads'], {}), generateCacheKey(boundary, ['roads'], { forceRefresh: true }));
  assert.match(buildRoutingQuery(boundary, 'major'), /motorway\|trunk\|primary\|secondary/);
  assert.match(buildRoutingQuery(boundary, 'local'), /highway"!~/);
  assert.match(buildRoutingQuery(boundary, 'paths'), /footway/);
  assert.match(buildRoutingQuery(boundary, 'major'), /out geom qt 1501/);
});

test('main app retries transient failures with backoff but never converts failures to empty success', async () => {
  const original = global.fetch, delays = [], progress = [], providerAttempts = [];
  let calls = 0;
  global.fetch = async (_url, options) => {
    providerAttempts.push(JSON.parse(options.body).options.providerAttempt);
    return ++calls < 3 ? { ok: false, status: 503, json: async () => ({ error: { message: 'busy', retryAfter: 30, retryable: true } }) } : ok({ success: true, data: { features: [{ id: 'road' }], metadata: {} } });
  };
  try {
    const result = await loadInfrastructure(boundary, ['roads'], {}, message => progress.push(message), async delay => delays.push(delay));
    assert.equal(result.data.features.length, 1); assert.deepEqual(delays, [30000, 60000]); assert.equal(calls, 3);
    assert.deepEqual(providerAttempts, [0, 1, 2]);
    global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'invalid query', retryable: false } }) });
    await assert.rejects(loadInfrastructure(boundary, ['roads'], {}, () => {}, async () => assert.fail('must not retry')), /invalid query/);
  } finally { global.fetch = original; }
});

test('main endpoint distinguishes valid empty data from a failed single-layer request', async () => {
  const transport = require('../lib/osm/overpassClient.cjs');
  const original = transport.requestOverpass;
  let fail = false, failHospital = false;
  transport.requestOverpass = async query => { if (fail || (failHospital && query.includes('hospital'))) throw failure(429, 'busy'); return { elements: [] }; };
  const handler = require('../pages/api/osm-infrastructure.js');
  transport.requestOverpass = original;
  const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
  const empty = response();
  await handler({ method: 'POST', body: { boundary, layers: ['roads'], options: { forceRefresh: true, disableBboxFallback: true } } }, empty);
  assert.equal(empty.code, 200); assert.equal(empty.body.data.metadata.partialFailures, 0);
  fail = true;
  const failed = response();
  const other = { ...boundary, coordinates: [[[8,46],[8.1,46],[8.1,46.1],[8,46.1],[8,46]]] };
  await handler({ method: 'POST', body: { boundary: other, layers: ['roads'], options: { forceRefresh: true, disableBboxFallback: true } } }, failed);
  assert.equal(failed.code, 503); assert.equal(failed.body.success, false); assert.equal(failed.body.error.code, 'OSM_PROVIDER_BUSY');
  fail = false; failHospital = true;
  const partial = response();
  await handler({ method: 'POST', body: { boundary: other, layers: ['roads', 'hospitals'], options: { disableBboxFallback: true } } }, partial);
  assert.equal(partial.body.data.metadata.partialFailures, 1);
  assert.equal(await cache.getCachedOSM(generateCacheKey(other, ['roads', 'hospitals'], {})), null, 'partial empty data must not suppress a later retry');
});

test('multi-category refresh uses separate requests and retains successful categories', async () => {
  const original = global.fetch, requested = [];
  global.fetch = async (_url, options) => {
    const { layers } = JSON.parse(options.body); requested.push(layers);
    return layers[0] === 'roads' ? ok({ success: true, data: { features: [{ id: 'road', properties: { category: 'road' } }], metadata: { timestamp: new Date().toISOString() } } })
      : { ok: false, status: 400, json: async () => ({ error: { message: 'Bad query', retryable: false } }) };
  };
  try {
    const result = await loadInfrastructure(boundary, ['roads', 'hospitals'], {}, () => {}, async () => assert.fail('not retryable'));
    assert.deepEqual(requested, [['roads'], ['hospitals']]);
    assert.equal(result.data.features.length, 1);
    assert.deepEqual(result.data.metadata.requestedLayers, ['roads']);
    assert.deepEqual(result.data.metadata.failedLayers, ['hospitals']);
  } finally { global.fetch = original; }
});
