import test from 'node:test';
import assert from 'node:assert/strict';
import { responseStatus, sinceLast, deltaTrend, deltaPresentation } from '../lib/outbreak/response.js';
import { epiWeek, nationalEvidence } from '../lib/outbreak/data.js';

test('epiWeek follows ISO-8601 including year boundaries (matches Africa CDC reporting)', () => {
  assert.equal(epiWeek('2026-07-19').label, '2026-W29');   // SITREP No. 63 reporting date
  assert.equal(epiWeek('2026-01-01').label, '2026-W01');
  assert.equal(epiWeek('2025-12-29').label, '2026-W01');   // Monday belongs to next ISO year
  assert.equal(epiWeek('2027-01-03').label, '2026-W53');   // Sunday belongs to previous ISO year
});

const ready = (id, label, category, records) => ({ id, label, category, level: 'health_zone', kind: 'snapshot', unit: 'count', status: 'ready', records });

test('deltaTrend classifies direction and treats null as no comparable basis', () => {
  assert.equal(deltaTrend(5), 'up');
  assert.equal(deltaTrend(-2), 'down');
  assert.equal(deltaTrend(0), 'flat');
  assert.equal(deltaTrend(null), 'none');
});

test('SDB rate is only computed when both numerator and denominator sources are present', () => {
  const requestsOnly = responseStatus([ready('r', 'Burials requested', 'sdb', [{ location: 'Z', date: '2026-09-08', value: 100 }])], [], '2026-09-09');
  const sdb = requestsOnly.pillars.find(p => p.id === 'sdb');
  assert.equal(sdb.loaded, true);
  assert.equal(sdb.rates.length, 0, 'no rate without a completed source');

  const paired = responseStatus([
    ready('r', 'Burials requested', 'sdb', [{ location: 'Z', date: '2026-09-08', value: 100 }]),
    ready('c', 'Burials completed', 'sdb', [{ location: 'Z', date: '2026-09-08', value: 82 }])
  ], [], '2026-09-09');
  const paidRate = paired.pillars.find(p => p.id === 'sdb').rates[0];
  assert.equal(paidRate.rate, 0.82);
  assert.equal(paired.pillars.find(p => p.id === 'sdb').level, 'watch', '82% is below the 90% watch threshold');
});

test('bed occupancy over 100% is flagged as attention regardless of coverage rules', () => {
  const status = responseStatus([
    ready('o', 'Patients in isolation', 'response', [{ location: 'NK', date: '2026-09-08', value: 128 }]),
    ready('b', 'Beds available', 'response', [{ location: 'NK', date: '2026-09-08', value: 100 }])
  ], [], '2026-09-09');
  const occ = status.pillars.find(p => p.id === 'response').rates.find(r => r.label === 'Bed occupancy');
  assert.equal(occ.rate, 1.28);
  assert.equal(status.pillars.find(p => p.id === 'response').level, 'attention');
});

test('action counts distinguish open and blocked', () => {
  const status = responseStatus([], [{ status: 'Proposed' }, { status: 'Blocked' }, { status: 'Completed' }], '2026-09-09');
  assert.equal(status.actions.open, 1);
  assert.equal(status.actions.blocked, 1);
  assert.equal(status.actions.total, 3);
});

test('sinceLast returns null without a prior snapshot and reports coverage change when comparable', () => {
  assert.equal(sinceLast({ national: [], epi: null, datasets: [] }, null, '2026-09-09'), null);
  const prior = {
    name: 'Brief 62', asOf: '2026-09-01', boundaryLevel: 'health_zone',
    datasets: [ready('c', 'Burials completed', 'sdb', [{ location: 'Z', date: '2026-09-01', value: 70 }])]
  };
  const current = { national: [], epi: null, datasets: [ready('c', 'Burials completed', 'sdb', [{ location: 'Z', date: '2026-09-08', value: 82 }])] };
  const diff = sinceLast(current, prior, '2026-09-09');
  const sdbLine = diff.lines.find(l => l.sourceId === 'c');
  assert.equal(sdbLine.delta, 12, 'coverage rose by 12 since the prior snapshot');
  assert.equal(diff.priorAsOf, '2026-09-01');
});

const oldDate='2026-09-01',newDate='2026-09-08';
const row=(location,date,value)=>({location,date,value});
const response=(datasets,id='sdb')=>responseStatus(datasets,[],newDate).pillars.find(p=>p.id===id);
const compare=(datasets,previous)=>sinceLast({datasets,national:nationalEvidence(datasets,newDate),epi:null},{asOf:oldDate,datasets:previous},newDate);
const national=(id,metricId,value,date=newDate,location='Country')=>({...ready(id,'Renamed display label','other',[row(location,date,value)]),metricId,level:'national',kind:'cumulative',unit:'people'});

test('snapshot case comparison matches metric and country instead of taking the first national row',()=>{
  const current=national('cases','national_cumulative_confirmed_cases',110);
  const prior=[national('deaths','national_cumulative_confirmed_deaths',2,oldDate),national('cases','national_cumulative_confirmed_cases',100,oldDate)];
  const line=compare([current],prior).lines[0];
  assert.equal(line.delta,10);
  assert.equal(line.location,'Country');
  assert.match(line.since,/same indicator and country/);
  for(const changed of [{metricId:'national_cumulative_confirmed_deaths'},{unit:'percent'},{kind:'snapshot'},{id:'other-source'},{records:[row('Different country',oldDate,100)]}]) {
    const result=compare([current],[{...prior[1],...changed}]).lines[0];
    assert.equal(result.delta,null,JSON.stringify(changed));
    assert.match(result.since,/no comparable value/);
  }
});

test('missing historical values, ambiguous sources and backwards observation dates cannot form snapshot changes',()=>{
  const current=national('cases','national_cumulative_confirmed_cases',90);
  const previous=national('cases','national_cumulative_confirmed_cases',100,oldDate);
  assert.equal(compare([current],[{...previous,records:[row('Country',oldDate,null)]}]).lines[0].delta,null);
  assert.equal(compare([current],[previous,previous]).lines[0].delta,null);
  assert.equal(compare([{...current,records:[row('Country','2026-08-01',90)]}],[previous]).lines[0].delta,null);
  const revision=compare([current],[previous]).lines[0];
  assert.equal(revision.delta,-10);assert.equal(revision.kind,'cumulative');
});

test('response rates require matching areas, reporting dates, levels and types',()=>{
  const numerator=ready('completed','Burials completed','sdb',[row('A',newDate,20)]);
  const denominator=ready('requested','Burials requested','sdb',[row('A',newDate,100)]);
  for(const changed of [{records:[row('B',newDate,100)]},{records:[row('A',oldDate,100)]},{level:'province'},{kind:'cumulative'},{unit:'litres'}]) {
    const status=response([numerator,{...denominator,...changed}]);
    assert.equal(status.rates.length,0);
    assert.equal(status.level,'reported');
    assert.match(status.note,/insufficient comparable data/);
  }
});

test('missing numerator is unavailable while a reported zero is a real zero rate',()=>{
  const numerator=ready('completed','Burials completed','sdb',[row('A',newDate,null)]);
  const denominator=ready('requested','Burials requested','sdb',[row('A',newDate,100)]);
  const missing=response([numerator,denominator]);
  assert.equal(missing.rates.length,0);assert.ok(!missing.note.includes('0%'));
  const zero=response([{...numerator,records:[row('A',newDate,0)]},denominator]);
  assert.equal(zero.rates[0].rate,0);
  assert.equal(response([numerator]).loaded,false);
  assert.equal(response([{...numerator,records:[row('A','2026-09-09',10)]}]).loaded,false);
  assert.equal(response([{...numerator,records:[row('A',newDate,10)]},{...denominator,records:[row('A',newDate,0)]}]).rates.length,0);
});

test('partial response rate coverage uses only contemporaneous matched areas and reports exclusions',()=>{
  const numerator=ready('completed','Burials completed','sdb',[row('A',newDate,80),row('B',newDate,999),row('C',oldDate,9)]);
  const denominator=ready('requested','Burials requested','sdb',[row('A',newDate,100),row('B',newDate,null),row('C',oldDate,10)]);
  const status=response([numerator,denominator]);
  assert.equal(status.rates[0].rate,0.8);
  assert.equal(status.rates[0].matched,1);assert.equal(status.rates[0].available,3);
  assert.match(status.note,/2026-09-08; 1\/3 areas matched/);
});

test('duplicate or self-matching rate sources cannot create a spurious percentage',()=>{
  const numerator=ready('completed','Burials completed','sdb',[row('A',newDate,20)]);
  const denominator=ready('requested','Burials requested','sdb',[row('A',newDate,100)]);
  assert.equal(response([numerator,{...numerator,id:'overlapping'},denominator]).rates.length,0);
  assert.equal(response([{...numerator,label:'Reported burials completed'}]).rates.length,0);
});

test('weekly response changes exclude new reporting areas and keep different indicators separate',()=>{
  const sessions=ready('sessions','Engagement sessions','rcce',[row('A',oldDate,10),row('A',newDate,10),row('B',newDate,100)]);
  const single=response([sessions],'rcce');
  assert.equal(single.delta,0);assert.equal(single.indicators[0].withoutBaseline,1);
  assert.match(single.note,/1 matched areas only/);
  const people={...ready('people','People reached','rcce',[row('A',newDate,50)]),unit:'people'};
  const both=response([sessions,people],'rcce');
  assert.equal(both.delta,null);assert.equal(both.indicators.length,2);
  assert.match(both.note,/Engagement sessions: 110 count/);assert.match(both.note,/People reached: 50 people/);
  assert.ok(!both.note.includes('160'));
});

test('snapshot response changes use the same areas and separate newly reporting areas and missing baselines',()=>{
  const prior=ready('sessions','Sessions','rcce',[row('A',oldDate,10),row('C',oldDate,20),row('D',oldDate,null)]);
  const current={...prior,records:[row('A',newDate,10),row('B',newDate,100),row('D',newDate,30)]};
  const line=compare([current],[prior]).lines[0];
  assert.equal(line.delta,0);assert.equal(line.matched,1);assert.equal(line.absent,1);
  assert.deepEqual(line.newlyReporting,['B']);assert.equal(line.unpaired,2);assert.equal(line.neutral,true);
  assert.match(line.value,/10 count across 1 matched areas/);
  assert.equal(compare([{...current,unit:'people'}],[prior]).lines[0].delta,null);
});

test('cumulative revisions use neutral presentation in either favourable direction',()=>{
  for(const rising of [true,false]) {
    const presentation=deltaPresentation(-10,{kind:'cumulative',rising});
    assert.equal(presentation.revision,true);assert.equal(presentation.tone,'neutral');assert.equal(presentation.glyph,'↺');
  }
  assert.equal(deltaPresentation(-2,{kind:'daily'}).tone,'good');
  assert.equal(deltaPresentation(5,{neutral:true}).tone,'neutral');
  assert.equal(deltaPresentation(NaN).tone,'neutral');
});
