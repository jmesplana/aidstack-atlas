import test from 'node:test';
import assert from 'node:assert/strict';
import { provinceCoverage, areaActivity, activityMessages, provinceHorizon } from '../lib/outbreak/areaHistory.js';
import { keyMessage } from '../lib/outbreak/keyMessage.js';

const row=(location,date,value)=>({location,date,value});
const dataset=records=>({kind:'cumulative',level:'health_zone',records});
const epi=records=>({dataset:dataset(records),date:'2026-09-21',zones:records.filter(r=>r.date==='2026-09-21')});
const geometry=entries=>({features:entries.map(([nom,province])=>({properties:{nom,province}}))});

test('province denominator includes non-reporting zones and deduplicates boundary parts',()=>{
  const report=epi([row('A','2026-09-21',10),row('B','2026-09-21',0),row('C','2026-09-19',9),row('Unmatched','2026-09-21',80)]);
  const coverage=provinceCoverage(report,geometry([['A','P'],['A','P'],['B','P'],['C','P'],['D','Q']]),'health_zone');
  assert.deepEqual(coverage.rows.map(r=>[r.province,r.total,r.affected,r.reported,r.cases,r.missing]),[['P',3,1,2,10,1],['Q',1,0,0,null,1]]);
  assert.ok(Math.abs(coverage.rows[0].percent-100/3)<1e-9);
  assert.equal(coverage.unmapped,1);
  assert.equal(provinceCoverage(report,geometry([['A','P']]),'province'),null);
});

test('ambiguous province assignments and null case reports stay unknown',()=>{
  const coverage=provinceCoverage(epi([row('A','2026-09-21',50),row('B','2026-09-21',null)]),geometry([['A','P'],['A','Q'],['B','P'],['C',null]]),'health_zone');
  assert.equal(coverage.excludedBoundaries,2);assert.equal(coverage.unmapped,1);
  assert.equal(coverage.rows[0].total,1);assert.equal(coverage.rows[0].cases,null);
});

test('first-positive reports distinguish earlier zero from first appearance and respect cut-off',()=>{
  const records=[row('A','2026-09-13',0),row('A','2026-09-19',2),row('B','2026-09-19',3),row('Old','2026-07-01',10),row('Old','2026-09-21',11),row('Future','2026-09-22',5)];
  const activity=areaActivity(dataset(records),'2026-09-21','2026-09-15');
  assert.deepEqual(activity.firstReports.map(r=>[r.location,r.priorZero]),[['A',true],['B',false]]);
  assert.match(activityMessages(activity)[0],/earlier zero not established/);
  const text=keyMessage({epi:{activity,burden:[],growth:[],affected:[],date:'2026-09-21',baseline:'2026-09-15'},asOf:'2026-09-23'}).text;
  assert.match(text,/First positive reports.*A.*B/);
  assert.equal(keyMessage({epi:{activity},override:'Reviewed message',asOf:'2026-09-23'}).text,'Reviewed message');
});

const stable=()=>Array.from({length:7},(_,i)=>row('A',new Date(Date.parse('2026-08-10')+i*7*86400000).toISOString().slice(0,10),10));
test('42-day unchanged runs are labelled for review, never as Ebola-free',()=>{
  const activity=areaActivity(dataset(stable()),'2026-09-21','2026-09-15');
  assert.deepEqual(activity.quiet,[{location:'A',start:'2026-08-10',end:'2026-09-21',days:42,weeks:6,review42:true}]);
  assert.match(activityMessages(activity)[0],/does not confirm absence of new cases or Ebola-free status/);
  const changed=stable().map((r,i)=>({...r,value:i===2?9:10}));
  assert.equal(areaActivity(dataset(changed),'2026-09-21','2026-09-15').quiet[0].days,21);
});

test('nulls, reporting gaps, revisions and stale endpoints stop unchanged runs',()=>{
  for(const records of [stable().filter((r,i)=>i!==3),stable().map((r,i)=>i===3?{...r,value:null}:r),stable().map((r,i)=>i===3?{...r,value:11}:r)]) {
    const result=areaActivity(dataset(records),'2026-09-21','2026-09-15');
    assert.equal(result.quiet[0].days,14);assert.equal(result.quiet[0].review42,false);
  }
  assert.equal(areaActivity(dataset(stable().slice(0,-1)),'2026-09-21','2026-09-15').quiet.length,0);
  assert.equal(areaActivity(dataset(stable().map(r=>({...r,value:0}))),'2026-09-21','2026-09-15').quiet.length,0);
});

test('horizon weeks retain missing, zero, revisions and partial-week intervals on a common scale',()=>{
  const records=[row('A','2026-09-06',10),row('A','2026-09-13',10),row('A','2026-09-19',8),row('A','2026-09-21',12),row('B','2026-09-19',30),row('B','2026-09-21',null)];
  const report=epi(records),coverage=provinceCoverage(report,geometry([['A','P'],['B','P'],['Never','Q']]),'health_zone');
  const model=provinceHorizon(report,coverage);
  assert.deepEqual(model.weeks.map(w=>w.label),['2026-W36','2026-W37','2026-W38','2026-W39']);
  assert.deepEqual(model.groups[0].rows[0].values,[null,0,-2,4]);
  assert.deepEqual(model.groups[0].rows.map(r=>r.location),['A']); // No current positive report for B.
  assert.equal(model.weeks.at(-1).partial,true);assert.equal(model.weeks.at(-1).days,2);
  assert.equal(model.band,2);assert.equal(model.groups.length,1);
  assert.equal(provinceHorizon(report,coverage,2).truncated,true);
});

test('horizon does not bridge missing calendar weeks and handles ISO year rollover',()=>{
  const report={...epi([row('A','2026-12-27',10),row('A','2027-01-03',15),row('A','2027-01-17',25)]),date:'2027-01-17'};
  const model=provinceHorizon(report,{rows:[{province:'P',locations:['A']}]});
  assert.deepEqual(model.weeks.map(w=>w.label),['2026-W52','2026-W53','2027-W01','2027-W02']);
  assert.deepEqual(model.groups[0].rows[0].values,[null,5,null,null]);
});
