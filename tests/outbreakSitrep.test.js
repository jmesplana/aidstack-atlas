import test from 'node:test';
import assert from 'node:assert/strict';
import { reportingPeriods, sitrepEpidemiology, sitrepFilename } from '../lib/outbreak/sitrep.js';
import { suggestIndicatorColumns } from '../lib/outbreak/importSuggestions.js';

const source = (records,extra={}) => ({id:'cases',label:'Cases',purpose:'cases',status:'ready',kind:'cumulative',level:'health_zone',records,...extra});
const row = (location,date,value) => ({location,date,value});

test('report periods preserve missing endpoints, zero and downward revisions',()=>{
  const d=source([row('A','2026-08-25',10),row('A','2026-09-01',10),row('A','2026-09-08',8)]);
  assert.deepEqual(reportingPeriods(d,['A'],'2026-09-08',2).map(p=>p.value),[0,-2]);
  assert.equal(reportingPeriods(d,['A'],'2026-09-09',1)[0].value,null);
  assert.equal(reportingPeriods(d,['A','B'],'2026-09-08',1)[0].value,null);
  assert.equal(reportingPeriods(source([...d.records,row('A','2026-09-08',8)]),['A'],'2026-09-08',1)[0].value,null);
});
test('daily reporting periods require every date and do not fill reporting gaps',()=>{
  const rows=Array.from({length:7},(_,i)=>row('Country',`2026-09-0${i+2}`,i));
  assert.equal(reportingPeriods(source(rows,{kind:'daily'}),['Country'],'2026-09-08',1)[0].value,21);
  assert.equal(reportingPeriods(source(rows.slice(1),{kind:'daily'}),['Country'],'2026-09-08',1)[0].value,null);
});
test('province sums use stable membership and national sources remain separate',()=>{
  const records=[row('A','2026-08-25',1),row('A','2026-09-01',2),row('A','2026-09-08',3),row('B','2026-08-25',10),row('B','2026-09-01',12)];
  const d=source(records),epi={dataset:d,burden:[{location:'A'}]};
  const geometry={features:['A','B'].map(n=>({properties:{nom:n,province:'Province'}}))};
  const n=source([row('Country','2026-08-25',100),row('Country','2026-09-01',110),row('Country','2026-09-08',125)],{id:'national',level:'national'});
  const model=sitrepEpidemiology([d,n],epi,geometry,'health_zone','2026-09-08');
  assert.equal(model.rows.find(r=>r.grouped).current,null);
  assert.equal(model.rows.find(r=>r.grouped).previous,3);
  assert.equal(model.rows.find(r=>!r.grouped).current,15);
  const ambiguous=sitrepEpidemiology([d,n,{...n,id:'alternative'}],epi,geometry,'health_zone','2026-09-08');
  assert.equal(ambiguous.rows.filter(r=>!r.grouped).length,2);
  assert.equal(ambiguous.periods.length,0);
});
test('filenames use ISO week-year and exclude unsafe path characters',()=>{
  assert.equal(sitrepFilename('DRC / Ebola','2027-01-01','pdf'),'2026_W53_DRC_Ebola_Sitrep_2027-01-01.pdf');
});
test('import suggestions leave ambiguous headers blank and preserve explicit mappings',()=>{
  const base={purpose:'cases',location:'',date:'',metric:'',kind:'daily'};
  assert.deepEqual(suggestIndicatorColumns(['health_zone','date','cumulative_confirmed_cases'],base),{...base,location:'health_zone',date:'date',metric:'cumulative_confirmed_cases',kind:'cumulative'});
  assert.equal(suggestIndicatorColumns(['zone','province','date','cases'],base).location,'');
  assert.equal(suggestIndicatorColumns(['zone','province','date','cases'],{...base,location:'province'}).location,'province');
});
