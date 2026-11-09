import test from 'node:test';
import assert from 'node:assert/strict';
import { populationTileSelection, populationTileImage } from '../lib/worldpop/populationTiles.js';

const districts = [{ id: 'A', geometry: { type: 'Polygon', coordinates: [[[7,46],[8,46],[8,47],[7,47],[7,46]]] } }];
test('population tiles select the exact cohort and preserve legacy total and age-sex requests', () => {
  assert.deepEqual(populationTileSelection({}).bands, ['population']);
  assert.equal(populationTileSelection({ dataType: 'agesex' }).bands.length, 40);
  const selection = populationTileSelection({ cohort: { age: 'under5', sex: 'female' }, districts });
  assert.deepEqual(selection.bands, ['f_00', 'f_01']);
  assert.equal(selection.dataType, 'agesex');
  assert.throws(() => populationTileSelection({ cohort: { age: 'unrecognized' } }), /supported population/);
  assert.throws(() => populationTileSelection({ districts: [] }), /Select an area/);
  assert.throws(() => populationTileSelection({ districts: [{ id: 'A', geometry: { type: 'Point', coordinates: [7,46] } }] }), /polygons/);
});
test('population tiles use the assessment year, mask incomplete cohorts and clip to polygons', () => {
  const calls = [];
  const image = new Proxy({}, { get: (_, method) => (...args) => { calls.push([method, ...args]); return image; } });
  const Geometry = geometry => { calls.push(['geometry', geometry]); return geometry; };
  Geometry.Rectangle = bounds => { calls.push(['rectangle', bounds]); return bounds; };
  const ee = { ImageCollection: id => { calls.push(['collection', id]); return image; }, Reducer: { sum: () => 'sum', min: () => 'min' }, Geometry, Feature: x => x, FeatureCollection: x => x };
  const selection = populationTileSelection({ cohort: { age: 'under5', sex: 'female' } });
  populationTileImage(ee, 2025, selection, { districts, bounds: { west: 7, south: 46, east: 8, north: 47 } });
  assert.deepEqual(calls.find(x => x[0] === 'filterDate'), ['filterDate', '2025-01-01', '2026-01-01']);
  assert.deepEqual(calls.find(x => x[0] === 'select'), ['select', ['f_00', 'f_01']]);
  assert.ok(calls.some(x => x[0] === 'reduce' && x[1] === 'min'));
  assert.ok(calls.some(x => x[0] === 'updateMask'));
  assert.deepEqual(calls.find(x => x[0] === 'clipToCollection')[1], [districts[0].geometry]);
  assert.ok(!calls.some(x => x[0] === 'rectangle'));
});
