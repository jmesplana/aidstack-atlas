import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardSnapshot, reportingCurve, reportedCfr, overviewSignals, overviewSlideDeck, burdenSlideDeck, caseTrendSlideDeck } from '../lib/outbreak/dashboardBriefing.js';

const dates=['2026-08-31','2026-09-07','2026-09-14','2026-09-21'];
const records=(location,values,when=dates)=>values.map((value,i)=>({location,date:when[i],value}));
const geometry={features:['A','B','C','D'].map(nom=>({properties:{nom,province:nom==='B'?'West':'East'}}))};
const source=[...records('A',[0,10,30,70]),...records('B',[0,5,15,35]),...records('C',[0,7],dates.slice(0,2)),{location:'Total',date:dates[3],value:9999},{location:'A',date:'2026-10-01',value:999}];
const input=(rows=source)=>({epi:{date:dates[3],baseline:dates[2],dataset:{kind:'cumulative',level:'health_zone',records:rows,locationMatching:{locations:[{source:'Total',status:'Non-geographic source total'}]}}},geometry,boundaryLevel:'health_zone',asOf:dates[3]});

test('overview uses a single source date, deduplicates locations and respects province and zone scope',()=>{
  const s=dashboardSnapshot(input());
  assert.equal(s.total,105);assert.equal(s.change,60);assert.equal(s.available,2);assert.equal(s.unavailable,2);assert.equal(s.rows.length,4);
  assert.equal(s.rows.find(r=>r.location==='C').lastReport,'2026-09-07');assert.equal(s.rows.find(r=>r.location==='C').value,null);
  const east=dashboardSnapshot({...input(),province:'East'});assert.equal(east.total,70);assert.equal(east.rows.length,3);
  assert.equal(dashboardSnapshot({...input(),province:'East',location:'A'}).rows.length,1);
  const unknown=dashboardSnapshot({...input(),location:'D'});assert.equal(unknown.total,null);assert.equal(unknown.change,null);
  const duplicate=dashboardSnapshot(input([...source,{location:'A',date:dates[3],value:70}]));assert.equal(duplicate.total,35);assert.equal(duplicate.available,1);
});
test('overview paired change excludes intermediate missing values and revisions',()=>{
  for(const value of [null,100]){
    const s=dashboardSnapshot(input([...source,{location:'A',date:'2026-09-17',value}]));
    assert.equal(s.total,105);assert.equal(s.change,20);assert.equal(s.paired,1);
    if(value===100)assert.equal(s.revisions,1);
  }
});
test('reporting curve keeps a fixed cohort and never fills gaps with zero',()=>{
  const curve=reportingCurve(dashboardSnapshot(input()),26);
  assert.deepEqual(curve.cohort,['A','B']);assert.deepEqual(curve.points.map(p=>p.delta),[15,30,60]);
  assert.deepEqual(curve.points.map(p=>p.days),[7,7,7]);assert.equal(curve.total,4);
  const revised=reportingCurve(dashboardSnapshot(input([...source,{location:'A',date:'2026-09-10',value:100}])),26);
  assert.deepEqual(revised.cohort,['B']);assert.deepEqual(revised.points.map(p=>p.delta),[5,10,20]);
  const gaps=reportingCurve(dashboardSnapshot(input(source.filter(r=>r.date!=='2026-09-14'))),6);
  assert.deepEqual(gaps.cohort,[]);assert.ok(gaps.points.every(p=>p.rate===null&&p.delta===null));
  const zero=reportingCurve(dashboardSnapshot(input(records('A',[0,0,0,0]))),3);assert.deepEqual(zero.cohort,['A']);assert.ok(zero.points.every(p=>p.rate===0));
});
test('overview first positives are scoped, dated and separate from assumed transmission onset',()=>{
  const extended=[...source,...records('D',[0,2],dates.slice(2))];
  const deck=overviewSlideDeck({...input(extended),province:'East',alertDays:7,horizonWeeks:3});
  const first=deck.pages.find(p=>p.kind==='first-reports');assert.equal(first.rows[0].location,'D');assert.equal(first.rows[0].date,dates[3]);assert.equal(first.rows[0].priorZero,true);
  assert.equal(deck.monitoringAvailable,false);
  assert.ok(!overviewSlideDeck({...input(extended),province:'West',alertDays:7}).pages.some(p=>p.kind==='first-reports'));
});
test('burden slides honor ranking settings and retain individual dated movement links',()=>{
  const movement={start:'2026-04-01',end:'2026-04-30',unit:'percent',routes:[{origin:'A',destination:'B',value:40},{origin:'A',destination:'Outside',value:30},{origin:'A',destination:'A',value:90},{origin:'A',destination:'C',value:null},{origin:'B',destination:'A',value:15}]};
  const deck=burdenSlideDeck({...input(),movement,direction:'outflow',settings:{burdenMetric:'recent',topZones:5}});
  assert.equal(deck.metric,'delta');assert.deepEqual(deck.ranked.map(r=>r.location),['A','B']);
  const page=deck.pages.find(p=>p.kind==='movement'&&p.row.location==='A');assert.deepEqual(page.routes.map(r=>r.value),[40,30]);
  const inbound=burdenSlideDeck({...input(),movement,direction:'inflow',settings:{topZones:5}});assert.equal(inbound.pages.find(p=>p.kind==='movement'&&p.row.location==='A').routes[0].origin,'B');
  for(const invalid of [{...movement,end:'2026-10-01'},{...movement,start:null},{...movement,start:'2026-05-01'}]){
    const excluded=burdenSlideDeck({...input(),movement:invalid,settings:{topZones:5}});assert.equal(excluded.movementEligible,false);assert.ok(excluded.pages.filter(p=>p.kind==='movement').every(p=>!p.routes.length));
  }
});
test('case trend slides paginate all displayed assessments, including missing and revised evidence',()=>{
  const rows=Array.from({length:8},(_,i)=>({location:`Zone ${i}`,province:i<5?'East':'West',status:['rising','declining','stale','revision'][i%4]}));
  const deck=caseTrendSlideDeck(rows);
  assert.equal(deck.pages[0].total,8);assert.equal(deck.pages[0].counts.find(c=>c.status==='revision').count,2);
  assert.deepEqual(deck.pages.slice(1).map(p=>p.rows.length),[3,2,3]);assert.ok(deck.pages.slice(1).every(p=>p.rows.every(r=>r.province===p.province)));
  assert.equal(caseTrendSlideDeck([]).pages.length,1);
  assert.deepEqual(caseTrendSlideDeck(rows,{grouped:false}).pages.slice(1).map(p=>p.rows.length),[3,3,2]);
});
test('burden ranking preserves ranks across pages and prioritizes selected movement context',()=>{
  const rows=Array.from({length:12},(_,i)=>records(`Zone ${i}`,[0,10,20,100-i])).flat();
  const deck=burdenSlideDeck({...input(rows),location:'Zone 8',settings:{topZones:10}});
  const ranks=deck.pages.filter(p=>p.kind==='burden-rank');
  assert.deepEqual(ranks.map(p=>[p.start,p.rows.length]),[[0,6],[6,4]]);
  assert.deepEqual(ranks.flatMap(p=>p.rows.map(r=>r.location)),deck.ranked.map(r=>r.location));
  assert.equal(deck.pages.find(p=>p.kind==='movement').row.location,'Zone 8');
});
test('overview shortlist includes a single new positive and loss of visibility, excluding routine histories',()=>{
  const rows=[...records('A',[0,10,30,70]),...records('B',[0,10,15,16]),...records('C',[0,1,3,7],['2026-08-17','2026-08-24','2026-08-31','2026-09-07']),...records('D',[0,1],dates.slice(2))];
  const signals=overviewSignals(input(rows));
  assert.deepEqual(signals.rows.map(r=>[r.location,r.signal]),[['D','new'],['A','rise'],['C','gap']]);
  assert.equal(signals.rows[0].first.value,1);assert.equal(signals.windows.length,6);
  assert.ok(signals.rows.find(r=>r.location==='C').timeline.slice(-2).every(w=>w.status==='missing'&&w.delta===null));
  assert.deepEqual(overviewSignals({...input(rows),province:'West'}).rows,[]);
  assert.deepEqual(overviewSignals({...input(rows),location:'B'}).rows,[]);
  assert.deepEqual(overviewSignals({...input(rows),asOf:'2026-11-02'}).rows,[]);
  assert.ok(!overviewSignals(input([...rows,{location:'A',date:'2026-09-17',value:100}])).rows.some(r=>r.location==='A'));
  assert.ok(!overviewSignals(input(rows.filter(r=>!(r.location==='D'&&r.value===0)))).rows.some(r=>r.location==='D'));
});
test('overview shortlist caps the whole slide at five and reserves space for each signal type',()=>{
  const rows=[...Array.from({length:8},(_,i)=>records(`Rise ${i}`,[0,10,30,70+i])).flat(),...records('New',[0,1],dates.slice(2)),...records('Lost',[0,1,3,7],['2026-08-17','2026-08-24','2026-08-31','2026-09-07'])];
  const signals=overviewSignals(input(rows));
  assert.equal(signals.eligible,10);assert.equal(signals.rows.length,5);
  assert.deepEqual([...new Set(signals.rows.map(r=>r.signal))],['new','rise','gap']);
  assert.equal(overviewSlideDeck(input(rows)).pages.filter(p=>p.kind==='zone-signals').length,1);
  assert.ok(signals.rows.some(r=>r.location==='Rise 7'));
});

const cfrInput=(deathRecords=[{location:'A',date:dates[3],value:14},{location:'B',date:dates[3],value:7}])=>{
  const base=input();
  return {...base,epi:{...base.epi,dataset:{...base.epi.dataset,metricId:'cumulative_confirmed_cases'}},datasets:[{id:'deaths',metricId:'cumulative_confirmed_deaths',status:'ready',kind:'cumulative',level:'health_zone',source:'Confirmed-death source',records:deathRecords}]};
};
test('reported CFR sums paired confirmed deaths and cases at the scoped source date',()=>{
  const data=cfrInput(),cfr=reportedCfr(data);
  assert.equal(cfr.percent,20);assert.equal(cfr.deaths,21);assert.equal(cfr.cases,105);assert.equal(cfr.paired,2);
  const east=reportedCfr({...data,province:'East'});assert.equal(east.deaths,14);assert.equal(east.cases,70);
  assert.equal(reportedCfr({...data,location:'B'}).deaths,7);
  assert.equal(overviewSlideDeck(data).cfr.percent,20);
});
test('reported CFR never mixes dates or geographic coverage and labels a partial paired subset',()=>{
  const data=cfrInput([{location:'A',date:dates[3],value:14},{location:'B',date:dates[2],value:30},{location:'B',date:'2026-10-01',value:31}]);
  const partial=reportedCfr(data);assert.equal(partial.percent,20);assert.equal(partial.cases,70);assert.equal(partial.paired,1);assert.equal(partial.available,2);
  const national={...data,datasets:data.datasets.map(d=>({...d,level:'national',metricId:'national_cumulative_confirmed_deaths'}))};
  assert.equal(reportedCfr(national).percent,null);
  const ambiguous=cfrInput([{location:'A',date:dates[3],value:14},{location:'A',date:dates[3],value:14}]);assert.equal(reportedCfr(ambiguous).percent,null);
  assert.equal(reportedCfr({...data,datasets:[...data.datasets,{...data.datasets[0],id:'other'}]}).percent,null);
  assert.equal(reportedCfr({...data,epi:{...data.epi,dataset:{...data.epi.dataset,metricId:'cumulative_suspected_cases'}}}).percent,null);
});
test('reported CFR distinguishes zero deaths from missing deaths and rejects impossible counts',()=>{
  assert.equal(reportedCfr(cfrInput([{location:'A',date:dates[3],value:0}])).percent,0);
  assert.equal(reportedCfr(cfrInput([{location:'A',date:dates[3],value:null}])).percent,null);
  for(const value of [-1,71,1.5])assert.equal(reportedCfr(cfrInput([{location:'A',date:dates[3],value}])).percent,null);
  const data=cfrInput([{location:'A',date:dates[3],value:0}]);
  data.epi.dataset.records=[{location:'A',date:dates[3],value:0}];
  assert.equal(reportedCfr(data).percent,null);
  assert.match(reportedCfr(data).reason,/denominator is zero/);
});
