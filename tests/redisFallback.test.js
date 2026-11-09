import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { withRateLimit } from '../lib/rateLimit.js';
const require = createRequire(import.meta.url);
const shared = require('../lib/redisFallback.cjs');
const { createRedisFallback } = shared;
const { createOSMCache } = require('../lib/osmCache.js');
const { createOverpassClient } = require('../lib/osm/overpassClient.cjs');
const never = () => new Promise(() => {});
const client = extra => ({ status: 'ready', on() {}, disconnect() {}, ...extra });

test('a stalled shared connection has one deadline and cooldown, then can recover', async () => {
  let clock = 0, creations = 0, connections = 0, disconnects = 0, operations = 0, release;
  const warnings = [];
  const fallback = createRedisFallback({ url: 'redis://test', now: () => clock, timeoutMs: 20, warn: message => warnings.push(message), createClient: () => {
    creations++;
    return creations === 1 ? client({ status: 'wait', connect() { connections++; return new Promise(resolve => { release = resolve; }); }, disconnect() { disconnects++; } }) : client();
  } });
  const operation = () => { operations++; return 'ok'; };
  assert.deepEqual(await Promise.all([fallback.run(operation), fallback.run(operation)]), [{ ok: false }, { ok: false }]);
  assert.equal(connections, 1); assert.equal(disconnects, 1); assert.equal(warnings.length, 1);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(operations, 0, 'a late connection must not execute timed-out work');
  await fallback.run(operation);
  assert.equal(creations, 1, 'cooldown skips Redis entirely');
  clock = 60001;
  assert.deepEqual(await fallback.run(operation), { ok: true, value: 'ok' });
  assert.equal(creations, 2);
});

test('downloads remain reusable when Redis SET stalls and subsequent cache misses bypass Redis', async () => {
  let fetches = 0, reads = 0, writes = 0;
  const redis = createRedisFallback({ url: 'redis://test', timeoutMs: 20, warn() {}, createClient: () => client({
    get: async () => { reads++; return null; }, set: () => { writes++; return never(); },
  }) });
  const cache = createOSMCache({ redis });
  const transport = createOverpassClient({ storage: cache, fetchImpl: async () => {
    fetches++; return { ok: true, json: async () => ({ elements: [{ type: 'way', id: 42 }] }) };
  } });
  const first = await transport('query');
  assert.deepEqual(await transport('query'), first);
  assert.equal(fetches, 1); assert.equal(writes, 1); assert.equal(reads, 1);
  assert.equal(await cache.getCachedOSM('uncached'), null);
  assert.equal(reads, 1, 'an unrelated cache miss must respect the same cooldown');
});

test('memory is populated before Redis persistence finishes and remote hits keep their original age', async () => {
  let clock = Date.now(), remoteReads = 0, finishWrite;
  const old = { features: [7], metadata: { timestamp: new Date(clock - 30 * 60000).toISOString(), ttl: 3600000 } };
  const remote = client({ get: async () => { remoteReads++; return JSON.stringify(old); }, set: () => new Promise(resolve => { finishWrite = resolve; }) });
  const redis = { run: async operation => ({ ok: true, value: await operation(remote) }) };
  const cache = createOSMCache({ redis, now: () => clock });
  const save = cache.setCachedOSM('new', { features: [1] });
  assert.deepEqual((await cache.getCachedOSM('new')).features, [1]);
  assert.equal(remoteReads, 0);
  finishWrite(); await save;
  await cache.getCachedOSM('old');
  await cache.getCachedOSM('old');
  assert.equal(remoteReads, 1, 'Redis hits also warm the local cache');
  clock += 40 * 60000;
  assert.equal(await cache.getCachedOSM('old'), null, 'hydration must not restart freshness');
  assert.deepEqual((await cache.getCachedOSM('old', true)).features, [7]);
  clock += 7 * 3600000;
  assert.equal(await cache.getCachedOSM('old', true), null);
});

test('rate limiting still rejects excess requests locally during a Redis outage and uses shared quotas when healthy', async () => {
  const original = shared.run;
  let attempts = 0, handled = 0;
  const fallback = createRedisFallback({ url: 'redis://test', timeoutMs: 20, warn() {}, createClient: () => {
    attempts++; return client({ incr: never });
  } });
  const response = () => ({ status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; }, setHeader() {} });
  const req = { headers: {}, socket: { remoteAddress: 'test' } };
  try {
    shared.run = fallback.run;
    const handler = withRateLimit(async (_req, res) => { handled++; res.status(200); }, { keyPrefix: 'redis-outage-test', limit: 2 });
    for (const status of [200, 200, 429]) {
      const res = response(); await handler(req, res); assert.equal(res.code, status);
    }
    assert.equal(handled, 2); assert.equal(attempts, 1);
    shared.run = async operation => ({ ok: true, value: await operation(client({ incr: async () => 3 })) });
    const healthy = withRateLimit(async () => assert.fail('shared quota must be enforced'), { keyPrefix: 'redis-healthy-test', limit: 2 });
    const res = response(); await healthy(req, res); assert.equal(res.code, 429);
  } finally { shared.run = original; }
});
