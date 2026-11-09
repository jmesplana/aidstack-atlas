import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTravelNetwork, snapToNetwork, timesToDestinations } from '../lib/geo/travelTime.js';
import { analyzeAccessGaps, normalizeAccessPoints, accessEvidenceForObservations, validAccessEvidence } from '../lib/planning/accessGaps.js';
import { resultMatchesDistricts, summarizeAccessPublication, formatAccessChatContext } from '../lib/platform/resultContext.js';

const line = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
const collection = (...features) => ({ type: 'FeatureCollection', features });
const district = { id: 'A', name: 'District A', geometry: { type: 'Polygon', coordinates: [[[-1, -1], [2, -1], [2, 2], [-1, 2], [-1, -1]]] } };
const settings = { mode: 'driving', speedKph: 60, thresholdMinutes: 2, maxSnapKm: .05, candidateIds: ['c1', 'c2', 'c3'], selectedCandidateIds: ['c1', 'c2', 'c3'] };
const sources = { population: 'Synthetic settlements', populationDate: '2026-01-01', roads: 'Synthetic network', roadsDate: '2026-01-02', sites: 'Synthetic services' };
const site = (id, longitude, latitude = 0) => ({ id, name: id, longitude, latitude });
const settlement = (id, longitude, population, latitude = 0) => ({ settlement_id: id, settlement: id, longitude, latitude, population });
const input = () => ({ districts: [district], settings, sources,
  sites: [site('existing', 0), site('c1', .03), site('c2', .04), site('c3', .5, .5)],
  settlements: [settlement('covered', 0, 10), settlement('gap1', .03, 100), settlement('gap2', .04, 200), settlement('island', .5, 50, .5), settlement('off-road', .9, 25, .9)],
  roads: collection(line([[0, 0], [.01, 0], [.02, 0], [.03, 0], [.04, 0]]), line([[.5, .5], [.51, .5]])) });

test('uses road lengths rather than straight-line detours, and snaps to segment interiors', () => {
  const network = buildTravelNetwork(collection(line([[0, 0], [0, .01], [.01, .01], [.01, 0]])), settings);
  const origins = [[0, 0], [0, .005]].map((p) => snapToNetwork(p, network, .01));
  const times = timesToDestinations(network, origins, [snapToNetwork([.01, 0], network, .01)]);
  assert.ok(times[0] > 3.3 && times[0] < 3.4);
  assert.ok(times[1] > 2.7 && times[1] < 2.9);
});
test('one-way travel is from settlements to services, with same-segment and endpoint handling', () => {
  const roads = collection(line([[0, 0], [.1, 0]], { oneway: 'yes' }));
  const network = buildTravelNetwork(roads, settings), snap = (x) => snapToNetwork([x, 0], network, .01);
  assert.ok(timesToDestinations(network, [snap(.02)], [snap(.08)])[0] > 6);
  assert.equal(timesToDestinations(network, [snap(.08)], [snap(.02)])[0], null);
  assert.equal(timesToDestinations(network, [snap(0)], [snap(0)])[0], 0);
  const foot = buildTravelNetwork(roads, { mode: 'walking', speedKph: 4 });
  assert.ok(timesToDestinations(foot, [snap(.08)], [snap(.02)])[0] > 90);
  const reverse = buildTravelNetwork(collection(line([[0, 0], [.1, 0]], { oneway: '-1' })), settings);
  assert.ok(timesToDestinations(reverse, [snap(.08)], [snap(.02)])[0] > 6);
});
test('does not invent junctions or connections across disconnected components', () => {
  const network = buildTravelNetwork(collection(line([[0, 0], [.1, 0]]), line([[.05, -.05], [.05, .05]])), settings);
  assert.equal(timesToDestinations(network, [snapToNetwork([0, 0], network, .01)], [snapToNetwork([.05, .05], network, .01)])[0], null);
  assert.equal(snapToNetwork([1, 1], network, .25), null);
});
test('mode restrictions, closures and numeric speed limits affect the traversable network', () => {
  assert.throws(() => buildTravelNetwork(collection(line([[0, 0], [.1, 0]], { access: 'private' })), settings), /No traversable/);
  assert.throws(() => buildTravelNetwork(collection(line([[0, 0], [.1, 0]], { highway: 'footway' })), settings), /No traversable/);
  assert.throws(() => buildTravelNetwork(collection(line([[0, 0], [.1, 0]], { closed: true })), settings), /No traversable/);
  const road = collection(line([[0, 0], [.01, 0]], { maxspeed: '30' }));
  const n = buildTravelNetwork(road, settings);
  assert.ok(timesToDestinations(n, [snapToNetwork([0, 0], n, 0)], [snapToNetwork([.01, 0], n, 0)])[0] > 2.2);
});
test('separates unknown access, counts baseline population and deduplicates scenario gains', () => {
  const result = analyzeAccessGaps(input());
  assert.deepEqual(result.totals, { population: 385, covered: 10, beyondThreshold: 300, unknown: 75 });
  assert.equal(result.candidates.find((c) => c.id === 'c1').additionalPopulation, 300);
  assert.equal(result.candidates.find((c) => c.id === 'c2').additionalPopulation, 300);
  assert.equal(result.candidates.find((c) => c.id === 'c3').reachableFromUnknown, 50);
  assert.equal(result.scenario.additionalPopulation, 300);
  assert.equal(result.scenario.reachableFromUnknown, 50);
  assert.equal(result.scenario.coveredPopulation, 360);
  assert.equal(result.settlements.find((s) => s.id === 'covered').minutes, 0);
});
test('rejects incomplete, duplicate, out-of-scope, ambiguous and invalid inputs', () => {
  assert.throws(() => normalizeAccessPoints([settlement('a', 0, '')], [district], true), /population/);
  assert.throws(() => normalizeAccessPoints([settlement('a', 0, 2), settlement('a', .1, 3)], [district], true), /duplicate/);
  assert.throws(() => normalizeAccessPoints([site('a', 10)], [district]), /selected administrative/);
  assert.throws(() => normalizeAccessPoints([site('a', 0)], [district, district]), /exactly one/);
  assert.throws(() => normalizeAccessPoints([{ ...site('a', 0), latitude: '' }], [district]), /valid latitude/);
  assert.throws(() => analyzeAccessGaps({ ...input(), districts: [] }), /Select/);
  assert.throws(() => analyzeAccessGaps({ ...input(), sources: { ...sources, roadsDate: '2026-02-30' } }), /observation dates/);
  assert.throws(() => analyzeAccessGaps({ ...input(), settings: { ...settings, candidateIds: ['absent'] } }), /candidate/);
});
test('handoff joins exact settlement IDs and areas, flags location changes and never substitutes populations', () => {
  const result = analyzeAccessGaps(input());
  const observations = [
    { id: 'o1', areaId: 'A', settlementId: 'gap1', target: 20, vaccinated: 5 },
    { id: 'o2', areaId: 'A', settlementId: 'gap2', target: 30, latitude: 1, longitude: 1 },
    { id: 'o3', areaId: 'B', settlementId: 'gap1', target: 50 }
  ];
  const joined = accessEvidenceForObservations(result, observations);
  assert.equal(joined[0].target, 20); assert.equal(joined[0].vaccinated, 5); assert.equal(joined[0].accessStatus, 'beyond-threshold');
  assert.equal(joined[1].accessStatus, 'location-changed'); assert.equal(joined[1].accessMinutes, null);
  assert.equal(joined[2].accessStatus, 'not-matched');
});
test('map results require matching boundary geometry and chat carries bounded evidence', () => {
  const record = { metadata: { name: 'Test' }, result: analyzeAccessGaps(input()), source: { revision: 1 } };
  assert.equal(resultMatchesDistricts(record, [district]), true);
  assert.equal(resultMatchesDistricts(record, [{ ...district, geometry: null }]), false);
  assert.equal(resultMatchesDistricts(record, []), false);
  const summary = summarizeAccessPublication(record);
  assert.equal(summary.totals.unknown, 75);
  assert.match(formatAccessChatContext(summary), /Unknown access is not proof/);
});
test('backup evidence requires a versioned snapshot with valid result rows', () => {
  const evidence = { name: 'Test', publicationId: 'pub', attachedAt: '2026-01-01', source: { moduleId: 'access-gaps', revision: 1 }, result: analyzeAccessGaps(input()) };
  assert.equal(validAccessEvidence(evidence), true);
  assert.equal(validAccessEvidence(null), true);
  assert.equal(validAccessEvidence({ ...evidence, result: { ...evidence.result, settlements: [{ minutes: 'unknown' }] } }), false);
  assert.equal(validAccessEvidence({ ...evidence, source: { moduleId: 'untrusted', revision: 1 } }), false);
});
