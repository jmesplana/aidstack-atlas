import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccessDecision, accessDecisionText } from '../lib/planning/accessDecision.js';
import { runSurfaceAccess } from '../lib/planning/loadSurfaceAccess.js';
import { accessCohort } from '../lib/worldpop/accessCohorts.js';
import { accessScopeKey, validateAccessInputRequest } from '../lib/planning/accessInputs.js';
import { discoverAccessFacilities } from '../lib/planning/facilityDiscovery.js';
import { resolveWorldPopYear } from '../lib/worldpop/worldpopYears.js';

const districts = [{ id: 'A', name: 'Area', geometry: { type: 'Polygon', coordinates: [[[7,46],[8,46],[8,47],[7,47],[7,46]]] } }];
const key = id => JSON.stringify(['A',id]);
const result = {
  settings: { siteBudget: 2, facilitiesReviewed: true }, scope: { areas: [{ id:'A', name:'Area' }] },
  existingSites: [{ id: 'clinic', areaId: 'A' }],
  totals: { population: 180, covered: 20, beyondThreshold: 150, unknown: 10 },
  settlements: [['a',100,'beyond-threshold'],['b',10,'beyond-threshold'],['c',40,'beyond-threshold'],['d',10,'unknown']].map(([settlementId,population,status])=>({areaId:'A',settlementId,population,status})),
  candidates: [
    { id: 'a', name: 'Dense area', settlementIds: [key('a'),key('b')] },
    { id: 'b', name: 'Nearby alternative', settlementIds: [key('a'),key('d')] },
    { id: 'c', name: 'Other community', settlementIds: [key('c')] },
  ],
};
test('recommendations choose marginal reach over a nearby overlapping alternative and preserve unknowns', () => {
  const decision = buildAccessDecision(result);
  assert.deepEqual(decision.selectedCandidateIds,['a','c']);
  assert.equal(decision.additionalPopulation,150);
  assert.equal(decision.coveredPopulation,170);
  assert.equal(decision.remainingUnknown,10);
  assert.equal(decision.alternatives[0].overlap,100);
  assert.equal(decision.alternatives[0].unknown,10);
  const three = buildAccessDecision({...result,settings:{...result.settings,siteBudget:3}});
  assert.equal(three.steps[2].additionalPopulation,0);
  assert.equal(three.steps[2].reachableFromUnknown,10);
  assert.equal(three.steps[2].overlapPopulation,100);
  assert.equal(three.coveredPopulation,180);
  assert.equal(three.status,'provisional');
  assert.throws(()=>buildAccessDecision({...result,settings:{siteBudget:0}}),/between 1 and 10/);
});
test('zero-gain candidates are not recommended and missing facility lists are explicit', () => {
  const decision=buildAccessDecision({...result, existingSites:[], candidates:[result.candidates[0],{...result.candidates[1],settlementIds:result.candidates[0].settlementIds}]});
  assert.equal(decision.steps.length,1);
  assert.match(decision.issues.join(' '),/not proof that no facilities exist/);
  assert.equal(decision.status,'provisional');
});
test('automatic surface suggestions move to remaining unreached population using actual travel times', async () => {
  const calls=[];
  const inputs={districts,sites:[],settings:{mode:'walking',thresholdMinutes:60,suggestCandidates:true,siteBudget:2},sources:{population:'WorldPop',sites:'Roster'},
    settlements:[100,90,40].map((population,i)=>({settlement_id:String(i),settlement:`Cell ${i}`,population,latitude:46.1,longitude:7.1+i*.02,demandType:'worldpop-cell',area_id:'A'}))};
  const data=await runSurfaceAccess(inputs,{request:async body=>{calls.push(body.sites[0]);return {times:body.sites[0][0]===7.1?[0,15,90]:[90,90,0],connectedSites:[true]};}});
  assert.deepEqual(calls,[[7.1,46.1],[7.14,46.1]]);
  assert.equal(data.candidates.length,2);
  assert.equal(data.decision.coveredPopulation,230);
  assert.equal(data.decision.reachableFromUnknown,230);
});
test('population cohorts use exact source age bands and independent cache keys', () => {
  assert.deepEqual(accessCohort({age:'under5',sex:'female'}).bands,['f_00','f_01']);
  assert.deepEqual(accessCohort({age:'under1'}).bands,['f_00','m_00']);
  assert.equal(accessCohort().dataType,'total');
  assert.notEqual(accessScopeKey(districts,1000,'current'),accessScopeKey(districts,1000,'current',{age:'under5'}));
  assert.throws(()=>accessCohort({age:'6_59months'}),/supported/);
  assert.equal(validateAccessInputRequest({districts,kind:'population',year:'current',cohort:{age:'under5'}}).cohort.dataType,'agesex');
});
test('current-year selection never silently chooses a future population projection', async () => {
  const current=new Date().getFullYear();
  const ee={ImageCollection:()=>({aggregate_array:()=>({getInfo:cb=>cb([current-1,current+4].map(year=>Date.UTC(year,0,1)))})})};
  assert.equal(await resolveWorldPopYear(ee,'current','total'),current-1);
});
test('facility discovery combines sources, prefers current IDs, and retains source failures', async () => {
  const snapshot=async()=>({sites:[{id:'osm:node/1',name:'Old name'},{id:'osm:node/2',name:'Snapshot clinic'}]});
  const current=async()=>({sites:[{id:'osm:node/1',name:'Current name'},{id:'osm:way/3',name:'Health centre'}]});
  const combined=await discoverAccessFacilities(districts,{snapshot,current});
  assert.equal(combined.sites.length,3);
  assert.equal(combined.sites.find(s=>s.id==='osm:node/1').name,'Current name');
  assert.equal(combined.metadata.warnings.length,0);
  const partial=await discoverAccessFacilities(districts,{snapshot,current:async()=>{throw new Error('unavailable');}});
  assert.equal(partial.sites.length,2);
  assert.match(partial.metadata.warnings[0],/incomplete/);
  await assert.rejects(discoverAccessFacilities(districts,{snapshot:async()=>{throw new Error();},current:async()=>{throw new Error();}}),/Neither/);
});

test('slow facility provider returns an explicit partial result within the deadline', async () => {
  const partial=await discoverAccessFacilities(districts,{timeoutMs:10,snapshot:async()=>({sites:[]}),current:()=>new Promise(()=>{})});
  assert.match(partial.metadata.warnings[0],/Current OpenStreetMap.*incomplete/);
  let refresh;
  await discoverAccessFacilities(districts,{force:true,snapshot:async()=>({sites:[]}),current:async(...args)=>{refresh=args[5];return {sites:[]};}});
  assert.equal(refresh,true);
});
test('exported decision brief preserves actual gains, cohort, evidence issues and sources', () => {
  const full={...result,computedAt:'2026-11-09',sources:{population:'WorldPop',populationDate:'2026-01-01',roads:'Surface',roadsDate:'2019-01-01',sites:'Roster'},limitations:[],decision:buildAccessDecision(result)};
  const text=accessDecisionText(full);
  assert.match(text,/Other community: 40 additional people/);
  assert.match(text,/baseline access are unknown|baseline travel times are unknown/);
  assert.match(text,/Decision owner: Not assigned/);
  assert.match(text,/Services: Roster/);
});

test('automatic count stops at a coverage target with complementary gains, regardless of manual budget', () => {
  const auto = targetCoveragePercent => buildAccessDecision({ ...result, settings: { ...result.settings, siteCountMode: 'automatic', siteBudget: 1, targetCoveragePercent } });
  const first = auto(70);
  assert.deepEqual(first.selectedCandidateIds, ['a']);
  assert.equal(first.stoppingReason, 'target-met');
  const second = auto(90);
  assert.deepEqual(second.selectedCandidateIds, ['a', 'c']);
  assert.equal(second.targetMet, true);
  assert.equal(second.coveredPopulation, 170);
  assert.equal(second.remainingUnknown, 10);
  const all = auto(100);
  assert.deepEqual(all.selectedCandidateIds, ['a', 'c', 'b']);
  assert.equal(all.reachableFromUnknown, 10);
  const baseline = auto(10);
  assert.equal(baseline.steps.length, 0);
  assert.equal(baseline.targetMet, true);
});

test('automatic count explains unmet targets, redundant alternatives, empty population and the search cap', () => {
  const settings = { siteCountMode: 'automatic', targetCoveragePercent: 100 };
  const exhausted = buildAccessDecision({ ...result, settings, candidates: [result.candidates[0]] });
  assert.equal(exhausted.targetMet, false);
  assert.equal(exhausted.stoppingReason, 'candidates-exhausted');
  const redundant = buildAccessDecision({ ...result, settings, candidates: [result.candidates[0], { ...result.candidates[0], id: 'duplicate' }] });
  assert.equal(redundant.stoppingReason, 'no-additional-reach');
  const empty = buildAccessDecision({ ...result, settings, settlements: [], candidates: [], totals: { population: 0, covered: 0, beyondThreshold: 0, unknown: 0 } });
  assert.equal(empty.targetMet, false);
  assert.equal(empty.stoppingReason, 'no-population');
  const settlements = Array.from({ length: 11 }, (_, i) => ({ areaId: 'A', settlementId: String(i), population: 10, status: 'beyond-threshold' }));
  const capped = buildAccessDecision({ ...result, settings, settlements, candidates: settlements.map(row => ({ id: row.settlementId, settlementIds: [key(row.settlementId)] })), totals: { population: 110, covered: 0, beyondThreshold: 110, unknown: 0 } });
  assert.equal(capped.steps.length, 10);
  assert.equal(capped.stoppingReason, 'search-limit');
  assert.equal(capped.targetMet, false);
  for (const targetCoveragePercent of [0, -1, 101, NaN, Infinity]) assert.throws(() => buildAccessDecision({ ...result, settings: { ...settings, targetCoveragePercent } }), /coverage target/);
});

test('automatic export states whether the coverage target was reached', () => {
  const data = { ...result, settings: { ...result.settings, siteCountMode: 'automatic', targetCoveragePercent: 100 }, candidates: [result.candidates[0]], computedAt: '2026-11-09', sources: { population: 'WorldPop', populationDate: '2026-01-01', roads: 'Surface', roadsDate: '2019-01-01', sites: 'Roster' }, limitations: [] };
  const text = accessDecisionText({ ...data, decision: buildAccessDecision(data) });
  assert.match(text, /coverage target: 100%/);
  assert.match(text, /Coverage target reached: No/);
  assert.match(text, /All tested locations with additional reach have been used/);
});
