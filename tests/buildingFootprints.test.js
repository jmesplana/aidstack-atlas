import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleBuildingTiles, buildingTileBounds, childBuildingTiles, BUILDING_LIMIT } from '../lib/osm/buildingTiles.js';
import { createBuildingHandler } from '../pages/api/building-footprints.js';
import { loadBuildingTile } from '../lib/osm/loadBuildingTiles.js';
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });

test('building tiles cover the visible bounds and reject unrestricted extraction requests', () => {
  const tiles = visibleBuildingTiles([7.1,46.1,7.11,46.11]);
  assert.ok(tiles.length > 0 && tiles.length < 10);
  assert.throws(() => buildingTileBounds({ z: 1, x: 0, y: 0 }));
  const parent = buildingTileBounds(tiles[0]), children = childBuildingTiles(tiles[0]).map(buildingTileBounds);
  assert.equal(Math.min(...children.map(b => b[0])), parent[0]); assert.equal(Math.max(...children.map(b => b[2])), parent[2]);
});
test('building extraction supplies polygons and source dates, never silently accepts truncated data', async () => {
  const tile = visibleBuildingTiles([7.1,46.1,7.11,46.11])[0];
  const handler = createBuildingHandler(async query => {
    assert.match(query, /way\["building"\]/);
    return { osm3s: { timestamp_osm_base: '2026-11-09T00:00:00Z' }, elements: [{ type: 'way', id: 1, tags: { building: 'yes' }, geometry: [{ lon: 7.1, lat: 46.1 }, { lon: 7.11, lat: 46.1 }, { lon: 7.11, lat: 46.11 }, { lon: 7.1, lat: 46.1 }] }] };
  });
  const res = response(); await handler({ method: 'POST', body: tile }, res);
  assert.equal(res.code, 200); assert.equal(res.body.features[0].geometry.type, 'Polygon'); assert.equal(res.body.metadata.source, 'OpenStreetMap');
  const truncated = response(); await createBuildingHandler(async () => ({ elements: Array(BUILDING_LIMIT + 1).fill({}) }))({ method: 'POST', body: tile }, truncated);
  assert.equal(truncated.code, 413); assert.equal(truncated.body.subdivide, true);
});
test('building tile cache retries smaller tiles and reuses only complete results', async () => {
  const tile = { z: 13, x: 1, y: 1 }; let calls = 0;
  const request = async (_url, options) => {
    calls++; const t = JSON.parse(options.body);
    return { ok: t.z > 13, json: async () => t.z === 13 ? { subdivide: true } : { type: 'FeatureCollection', features: [{ id: `${t.x}/${t.y}`, geometry: { type: 'Polygon', coordinates: [] } }], metadata: { timestamp: '2026-11-09T00:00:00Z' } } };
  };
  const result = await loadBuildingTile(tile, undefined, request); assert.equal(result.features.length, 4); assert.equal(calls, 5);
  await loadBuildingTile(tile, undefined, request); assert.equal(calls, 5);
});
