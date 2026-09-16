import test from 'node:test';
import assert from 'node:assert/strict';
import { responseStatus, sinceLast, deltaTrend } from '../lib/outbreak/response.js';
import { epiWeek } from '../lib/outbreak/data.js';

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

test('missing, future or mismatched response observations cannot produce a capacity rate', () => {
  assert.equal(responseStatus([ready('b','Beds available','response',[{location:'A',date:'2026-09-08',value:null}])],[],'2026-09-08').loadedPillars,0);
  assert.equal(responseStatus([ready('b','Beds available','response',[{location:'A',date:'2026-09-10',value:10}])],[],'2026-09-08').loadedPillars,0);
  const mismatched=responseStatus([ready('o','Patients in isolation','response',[{location:'A',date:'2026-09-08',value:10}]),ready('b','Beds available','response',[{location:'B',date:'2026-09-08',value:20}])],[],'2026-09-08');
  assert.equal(mismatched.pillars.find(p=>p.id==='response').rates.length,0);
  assert.match(mismatched.pillars.find(p=>p.id==='response').note,/not summed/);
});

test('sinceLast returns null without a prior snapshot and reports coverage change when comparable', () => {
  assert.equal(sinceLast({ national: [], epi: null, datasets: [] }, null, '2026-09-09'), null);
  const prior = {
    name: 'Brief 62', asOf: '2026-09-01', boundaryLevel: 'health_zone',
    datasets: [ready('c', 'Burials completed', 'sdb', [{ location: 'Z', date: '2026-09-01', value: 70 }])]
  };
  const current = { national: [], epi: null, datasets: [ready('c', 'Burials completed', 'sdb', [{ location: 'Z', date: '2026-09-08', value: 82 }])] };
  const diff = sinceLast(current, prior, '2026-09-09');
  const sdbLine = diff.lines.find(l => l.label === 'Burials completed — Z');
  assert.equal(sdbLine.delta, 12, 'coverage rose by 12 since the prior snapshot');
  assert.equal(diff.priorAsOf, '2026-09-01');
});

test('comparison does not mix national deaths with confirmed cases or unrelated response areas', () => {
  const cases = {...ready('cases','National cumulative confirmed cases','other',[{location:'Country',date:'2026-09-08',value:50}]),level:'national',kind:'cumulative'};
  const prior = {asOf:'2026-09-01',datasets:[{...cases,id:'deaths',label:'Deaths',records:[{location:'Country',date:'2026-09-01',value:3}]},ready('beds','Beds','response',[{location:'B',date:'2026-09-01',value:100}])]};
  const diff = sinceLast({national:[{sourceId:'cases',label:cases.label,value:50}],datasets:[cases,ready('beds','Beds','response',[{location:'A',date:'2026-09-08',value:5}])]},prior,'2026-09-08');
  assert.equal(diff.lines[0].delta,null);
  assert.equal(diff.lines[1].delta,null);
  assert.match(sinceLast({datasets:[],national:[]},{asOf:'2026-09-10'},'2026-09-08').warning,/after/);
});

test('comparison preserves missing observations and records action changes and removals', () => {
  const prior={asOf:'2026-09-01',datasets:[ready('beds','Beds','response',[{location:'A',date:'2026-09-01',value:null}])],actions:[{id:'a',action:'Verify capacity',status:'Proposed'},{id:'b',action:'Contact team',status:'Blocked'}]};
  const diff=sinceLast({national:[],datasets:[ready('beds','Beds','response',[{location:'A',date:'2026-09-08',value:5}])],actions:[{id:'a',action:'Verify capacity',status:'Approved',owner:'Coordinator',due:'2026-09-09'}]},prior,'2026-09-08');
  assert.equal(diff.lines[0].delta,null);
  assert.match(diff.lines[1].since,/Proposed → Approved/);
  assert.match(diff.lines[2].since,/does not mean completed/);
});
