import test from 'node:test';
import assert from 'node:assert/strict';
import { accessHexagons } from '../lib/geo/accessHexagons.js';

test('hexagons preserve every population row and distinguish mixed and unknown access', () => {
  const rows = [
    { x: 0, y: 0, population: 10.5, status: 'covered', minutes: 5 },
    { x: 1, y: 1, population: 20.5, status: 'beyond-threshold', minutes: 80 },
    { x: -1, y: 0, population: 0, status: 'unknown', minutes: null },
    { x: 100, y: 100, population: 7, status: 'unknown', minutes: null },
  ];
  const original = structuredClone(rows);
  const bins = accessHexagons(rows, row => row);
  assert.equal(bins.length, 2);
  assert.equal(bins.reduce((sum, bin) => sum + bin.population, 0), 38);
  assert.equal(new Set(bins.flatMap(bin => bin.rows)).size, rows.length);
  assert.equal(bins[0].status, 'mixed');
  assert.deepEqual(bins[0].populations, { covered: 10.5, 'beyond-threshold': 20.5, unknown: 0 });
  assert.equal(bins[0].minMinutes, 5);
  assert.equal(bins[0].maxMinutes, 80);
  assert.equal(bins[1].minMinutes, null);
  assert.deepEqual(rows, original);
});

test('neighboring hexagons share an edge and grouping preserves totals at different zooms', () => {
  const rows = [0, 1].map(i => ({ x: i * Math.sqrt(3) * 12, y: 0, population: 10, status: 'covered', minutes: 1 }));
  const bins = accessHexagons(rows, row => row);
  assert.equal(bins.length, 2);
  const shared = bins[0].vertices.filter(a => bins[1].vertices.some(b => Math.hypot(a.x - b.x, a.y - b.y) < 1e-8));
  assert.equal(shared.length, 2);
  const zoomedOut = accessHexagons(rows, row => ({ x: row.x / 4, y: row.y / 4 }));
  assert.equal(zoomedOut.length, 1);
  assert.equal(zoomedOut[0].population, 20);
  assert.deepEqual(accessHexagons([], row => row), []);
});
