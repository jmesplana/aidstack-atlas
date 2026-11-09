import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAccessInputRequest, accessRoadBounds, buildAccessOverpassQuery, parseAccessOverpass, populationCellsToPoints, accessScopeKey } from '../lib/planning/accessInputs.js';
import { resolveListAreas, summarizeAreaContext, buildAreaAccessAssessment, validAreaAccessContext } from '../lib/planning/areaAccess.js';
import { analyzeAccessGaps } from '../lib/planning/accessGaps.js';
import { buildTravelNetwork, snapToNetwork, timesToDestinations } from '../lib/geo/travelTime.js';

const d = { id: 'A', name: 'North district', properties: { PCODE: 'A001', population: 1234, flows: 25 }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [.1, 0], [.1, .1], [0, .1], [0, 0]]] } };
const request = { districts: [d], kind: 'population', cellSize: 1000, year: 'latest' };
test('scopes extraction to valid non-overlapping administrative boundaries', () => {
  assert.equal(validateAccessInputRequest(request).cellSize, 1000);
  assert.throws(() => validateAccessInputRequest({ ...request, districts: [] }), /Select/);
  assert.throws(() => validateAccessInputRequest({ ...request, districts: [d, { ...d, id: 'B' }] }), /overlap/);
  assert.throws(() => validateAccessInputRequest({ ...request, cellSize: 1 }), /cellSize/);
  const b = accessRoadBounds([d]);
  assert.ok(b[0] < 0 && b[2] > .1);
  assert.match(buildAccessOverpassQuery(b), /way\["highway"\]/);
  assert.match(buildAccessOverpassQuery(b), /out body geom/);
  assert.notEqual(accessScopeKey([d], 500), accessScopeKey([d], 1000));
});
test('OSM preserves node topology and all road vertices, and supplies service points', () => {
  const data = parseAccessOverpass({ elements: [
    { type: 'way', id: 1, tags: { highway: 'residential', oneway: 'yes', foot: 'yes' }, nodes: [1, 2, 3], geometry: [{ lon: 0, lat: 0 }, { lon: .02, lat: 0 }, { lon: .04, lat: 0 }] },
    { type: 'node', id: 4, lat: 0, lon: 0, tags: { amenity: 'clinic', name: 'Clinic' } }
  ] });
  assert.deepEqual(data.roads.features[0].properties.nodeIds, [1, 2, 3]);
  assert.equal(data.roads.features[0].geometry.coordinates.length, 3);
  assert.equal(data.sites[0].name, 'Clinic');
  assert.throws(() => parseAccessOverpass({ elements: [], remark: 'timeout' }), /complete/);
  assert.throws(() => parseAccessOverpass({ elements: [{ type: 'way', id: 9, tags: { highway: 'residential' } }] }), /incomplete road/);
  const roads = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { nodeIds: [1, 2] }, geometry: { type: 'LineString', coordinates: [[0, 0], [.1, 0]] } },
    { type: 'Feature', properties: { nodeIds: [3, 4] }, geometry: { type: 'LineString', coordinates: [[.1, 0], [.1, .1]] } }
  ] };
  const graph = buildTravelNetwork(roads, { mode: 'driving', speedKph: 30 });
  assert.equal(timesToDestinations(graph, [snapToNetwork([0, 0], graph, .01)], [snapToNetwork([.1, .1], graph, .01)])[0], null);
});
test('WorldPop preserves fractional estimates, reports missing cells, and anchors boundary cells in the area', () => {
  const f = (sum, point, id) => ({ id, geometry: d.geometry, properties: { areaId: 'A', sum, point } });
  const data = populationCellsToPoints([f(10.25, [.02, .02], '1'), f(0, [.04, .02], '2'), f(null, [.05, .02], '3'), f(2.75, [1, 1], '4')], [d], 2025);
  assert.equal(data.totalPopulation, 13); assert.equal(data.points.length, 2);
  assert.equal(data.missingCells, 1); assert.equal(data.zeroCells, 1);
  assert.equal(data.points[1].longitude, 0);
  assert.equal(data.points[0].demandType, 'worldpop-cell');
});
test('platform model can suggest outreach locations from population cells without candidate uploads', () => {
  const cells = [0, .04, .08].map((longitude, i) => ({ settlement_id: String(i), settlement: `Cell ${i}`, latitude: .02, longitude, population: 100.25, demandType: 'worldpop-cell', area_id: 'A' }));
  const result = analyzeAccessGaps({ districts: [d], settlements: cells, sites: [{ id: 'service', name: 'Service', latitude: .02, longitude: 0 }], roads: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, .02], [.04, .02], [.08, .02]] } }] },
    settings: { platformInputs: true, suggestCandidates: true, mode: 'driving', speedKph: 60, maxSnapKm: 1, thresholdMinutes: 1 },
    sources: { population: 'WorldPop', populationDate: '2025-01-01', roads: 'OSM', roadsDate: '2026-01-01', sites: 'OSM' } });
  assert.equal(result.totals.population, 300.75); assert.equal(result.totals.beyondThreshold, 200.5);
  assert.equal(result.candidates.length, 2); assert.ok(result.candidates.every((c) => c.id.startsWith('suggested:')));
});
test('lists without coordinates match exact area codes and retain ambiguous or manually assigned places', () => {
  const districts = [d, { ...d, id: 'B', name: 'Other district', properties: { PCODE: 'B001' } }];
  const rows = [{ place: 'Unmapped village', district: 'A001', count: 20 }, { place: 'Village two', district: 'Not known', count: '' }, { place: 'Village three', district: 'A001', count: 'bad' }];
  const list = resolveListAreas(rows, { place: 'place', area: 'district', target: 'count' }, { '1': 'B' }, districts, ['A']);
  assert.equal(list[0].status, 'matched'); assert.equal(list[1].status, 'outside-scope'); assert.equal(list[2].target, null);
  assert.deepEqual(list[2].issues, ['Invalid target count']);
  const context = summarizeAreaContext([d], { A: { total: 1000 } }, { year: 2025 }, { features: [] });
  const result = buildAreaAccessAssessment({ districts: [d], context, targets: list, feedback: [], mobility: { field: 'flows', populationField: 'population', source: 'Flowminder', units: 'trips/day' }, sources: { targets: 'Government list' } });
  assert.equal(result.areaRows[0].listedTarget, 20); assert.equal(result.areaRows[0].population, 1000);
  assert.equal(result.areaRows[0].mobility.value, 25); assert.equal(result.areaRows[0].adminPopulation.value, 1234);
  assert.equal(result.totals.unassignedPlaces, 1);
  assert.equal(validAreaAccessContext(result), true);
  assert.equal(validAreaAccessContext({ ...result, areaRows: [{ ...result.areaRows[0], feedback: null }] }), false);
});
