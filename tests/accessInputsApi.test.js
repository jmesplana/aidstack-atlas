import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../pages/api/access-inputs.js';

const district = { id: 'api-test', name: 'Test', geometry: { type: 'Polygon', coordinates: [[[7, 46], [7.01, 46], [7.01, 46.01], [7, 46.01], [7, 46]]] } };
function response() { return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
test('access input API rejects invalid scope and methods before upstream requests', async () => {
  for (const [req, code] of [[{ method: 'GET' }, 405], [{ method: 'POST', body: {} }, 400], [{ method: 'POST', body: { districts: [], kind: 'roads' } }, 400]]) {
    const res = response(); await handler(req, res); assert.equal(res.code, code);
  }
});
test('access API preserves road topology, caches complete extracts, and rejects partial upstream data', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; if (calls === 1) return { ok: false, status: 503, text: async () => '', headers: new Headers() }; return { ok: true, json: async () => ({ elements: [{ type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'residential' }, geometry: [{ lon: 7, lat: 46 }, { lon: 7.01, lat: 46 }] }] }) }; };
  try {
    const req = { method: 'POST', body: { districts: [district], kind: 'roads' } };
    const res = response(); await handler(req, res);
    assert.equal(res.code, 200); assert.equal(res.body.routingReady, true);
    assert.deepEqual(res.body.roads.features[0].properties.nodeIds, [1, 2]);
    const cached = response(); await handler(req, cached);
    assert.equal(cached.body.cached, true); assert.equal(calls, 2);
    global.fetch = async () => ({ ok: true, json: async () => ({ elements: [], remark: 'timeout' }) });
    const failed = response(); await handler({ ...req, body: { ...req.body, cellSize: 500, districts: [{ ...district, geometry: { type: 'Polygon', coordinates: [[[8,46],[8.01,46],[8.01,46.01],[8,46.01],[8,46]]] } }] } }, failed);
    assert.equal(failed.code, 504); assert.equal(failed.body.code, 'OSM_QUERY_TIMEOUT'); assert.equal(failed.body.subdivide, true); assert.doesNotMatch(failed.body.error, /fewer nearby/);
  } finally { global.fetch = original; }
});

test('busy OSM providers report capacity instead of blaming one selected area', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 502, text: async () => 'This server is at capacity. The request queue is full.', headers: new Headers({ 'retry-after': '12' }) });
  try {
    const res = response();
    await handler({ method: 'POST', body: { districts: [{ ...district, id: 'busy-test', geometry: { type: 'Polygon', coordinates: [[[9,46],[9.01,46],[9.01,46.01],[9,46.01],[9,46]]] } }], kind: 'roads' } }, res);
    assert.equal(res.code, 503); assert.equal(res.body.code, 'OSM_PROVIDER_BUSY');
    assert.equal(res.body.retryAfter, 30); assert.equal(res.body.subdivide, false);
    assert.match(res.body.error, /OSM service is busy/);
    assert.doesNotMatch(res.body.error, /smaller|fewer/);
  } finally { global.fetch = original; }
});
