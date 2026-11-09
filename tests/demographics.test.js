import test from 'node:test';
import assert from 'node:assert/strict';
import { completeSum, demographicTable, summarizeDemographics, accessDemographicRows } from '../lib/worldpop/demographics.js';
import { accessMapView } from '../lib/planning/accessMapView.js';
import { loadCellDemographics } from '../lib/planning/loadDemographics.js';
const key = id => JSON.stringify(['A', id]);
const cells = ['a','b','c','d','e'].map((id, i) => ({ id: key(id), bands: { f_00: i + 1, f_01: (i + 1) * 2, m_00: 10, m_01: 20 } }));
const result = { settings: { populationCohort: { age: 'under5', sex: 'both' } }, populationCoverage: { year: 2025 }, settlements: ['covered','beyond-threshold','unknown','beyond-threshold','unknown'].map((status, i) => ({ areaId: 'A', settlementId: 'abcde'[i], status, population: 30 + (i + 1) * 3, minutes: i ? 80 : 10, populationGeometry: { type: 'Polygon', coordinates: [] } })), candidates: [{ id: 'site', settlementIds: [key('b'), key('c')] }], decision: { selectedCandidateIds: ['site'] }, scenario: { selectedCandidateIds: [] } };
test('demographic selection respects age and sex without treating missing counts as zero', () => {
  assert.equal(completeSum([1, null]), null);
  assert.equal(completeSum([0, 0]), 0);
  const female = summarizeDemographics(cells, { age: 'under5', sex: 'female' });
  assert.equal(female.total, 45); assert.equal(female.male, null); assert.equal(female.rows.length, 2);
  assert.equal(summarizeDemographics(cells, { age: 'under1', sex: 'both' }).total, 65);
  const missing = demographicTable([{ bands: { f_00: 1 } }], { age: 'under5', sex: 'female' });
  assert.equal(missing[1].total, null);
});
test('demographic access classes keep unknown baseline gains separate and exclude overlap', () => {
  const rows = accessDemographicRows(result, cells);
  assert.equal(rows[0].current, 11); assert.equal(rows[0].additional, 12); assert.equal(rows[0].newlyKnown, 13);
  assert.equal(rows[0].beyond, 14); assert.equal(rows[0].unknown, 15);
  const female = accessDemographicRows(result, cells, '', '', 'recommended', { age: 'under5', sex: 'female' });
  assert.equal(female[0].additional, 2); assert.equal(female[1].newlyKnown, 6);
  const one = accessDemographicRows(result, cells, '', key('c'));
  assert.equal(one[0].newlyKnown, 13); assert.equal(one[0].additional, 0);
  const scenario = accessDemographicRows(result, cells, '', '', 'scenario');
  assert.equal(scenario[0].additional, 0); assert.equal(scenario[0].beyond, 26);
  const missing = accessDemographicRows(result, cells.filter(cell => cell.id !== key('b')));
  assert.equal(missing[0].additional, null);
});
test('proposed map changes only newly reached cells and never invents exact journey times', () => {
  const proposed = accessMapView(result, 'recommended');
  assert.equal(proposed.settlements[1].status, 'covered'); assert.equal(proposed.settlements[1].minutes, null);
  assert.equal(proposed.settlements[2].scenarioReached, true);
  assert.equal(proposed.settlements[3].status, 'beyond-threshold');
  assert.equal(result.settlements[1].status, 'beyond-threshold');
  assert.equal(accessMapView(result, 'scenario').settlements[1].status, 'beyond-threshold');
});
test('cell breakdown rejects mismatched cohorts and supports cancellation and older results', async () => {
  const request = async (_, args) => { const body = JSON.parse(args.body); return { ok: true, json: async () => ({ year: body.year, cohort: body.cohort, cells }) }; };
  const data = await loadCellDemographics(result, { request });
  assert.equal(data.cells.length, 5);
  await assert.rejects(loadCellDemographics(result, { request: async () => ({ ok: true, json: async () => ({ year: 2025, cohort: result.settings.populationCohort, cells: cells.map(cell => ({ ...cell, bands: { ...cell.bands, f_00: 999 } })) }) }) }), /differ from the population/);
  await assert.rejects(loadCellDemographics(result, { request: async () => ({ ok: true, json: async () => ({ year: 2024, cells, cohort: result.settings.populationCohort }) }) }), /did not match/);
  await assert.rejects(loadCellDemographics({ ...result, settlements: [{ ...result.settlements[0], populationGeometry: null }] }, { request }), /Reload Atlas/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadCellDemographics(result, { request, signal: controller.signal }), /cancelled/);
});
