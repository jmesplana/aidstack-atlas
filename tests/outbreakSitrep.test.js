import test from 'node:test';
import assert from 'node:assert/strict';
import { reportingPeriods, sitrepEpidemiology, sitrepContext, sitrepFilename } from '../lib/outbreak/sitrep.js';
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
test('publication lag does not create empty weekly periods or fill missing observations',()=>{
  const n=source([row('DRC','2026-09-01',90),row('DRC','2026-09-08',110),row('DRC','2026-09-15',125),row('DRC','2026-09-18',150)],{level:'national'});
  const model=sitrepEpidemiology([n],null,null,'health_zone','2026-09-17');
  assert.equal(model.end,'2026-09-15');
  assert.deepEqual([model.rows[0].previous,model.rows[0].current,model.rows[0].delta,model.rows[0].total],[20,15,-5,125]);
  const missing=source(n.records.filter(r=>r.date!=='2026-09-08'),{level:'national'});
  const unavailable=sitrepEpidemiology([missing],null,null,'health_zone','2026-09-17');
  assert.equal(unavailable.rows[0].current,null);
  assert.equal(unavailable.rows[0].total,125);
});
test('older source totals retain their dates without filling a newer comparison endpoint',()=>{
  const n=source([row('DRC','2026-09-08',110)],{level:'national'});
  const local=source([row('A','2026-09-15',10)]);
  const model=sitrepEpidemiology([n,local],null,null,'health_zone','2026-09-17');
  assert.equal(model.end,'2026-09-15');
  assert.equal(model.rows[0].current,null);
  assert.equal(model.rows[0].total,110);
  assert.equal(model.rows[0].totalDate,'2026-09-08');
});
test('operational priorities require matched case areas and retain directed mobility evidence',()=>{
  const epi={dataset:{level:'health_zone'},affected:[{location:'A',matched:true},{location:'Unmatched',matched:false}]};
  const mining={byZone:new Map([['A',5],['Elsewhere',100],['Unmatched',50]])};
  const security={byZone:new Map([['A',{events:2,fatalities:3,missingFatalities:1}],['Elsewhere',{events:20,fatalities:30,missingFatalities:0}]])};
  const mobility={end:'2026-04-30',routes:[{origin:'Elsewhere',destination:'A',value:999},{origin:'A',destination:'B',value:12},{origin:'A',destination:'A',value:500}]};
  const hazards=[{location:'Elsewhere'},{location:'A'},{location:'Action area'}];
  const context=sitrepContext(epi,mining,security,mobility,'health_zone','2026-09-17',[{location:'Action area'}],hazards);
  assert.equal(context.sites,5);assert.equal(context.events,2);assert.equal(context.missingFatalities,1);
  assert.deepEqual(context.links,[{origin:'A',destination:'B',value:12}]);
  assert.deepEqual(context.hazards.map(h=>h.location),['A','Action area']);
  const mismatch=sitrepContext(epi,mining,security,{...mobility,end:'2026-10-01'},'province','2026-09-17');
  assert.equal(mismatch.securityRows.length,0);assert.equal(mismatch.miningRows.length,0);assert.equal(mismatch.links.length,0);
});
test('import suggestions leave ambiguous headers blank and preserve explicit mappings',()=>{
  const base={purpose:'cases',location:'',date:'',metric:'',kind:'daily'};
  assert.deepEqual(suggestIndicatorColumns(['health_zone','date','cumulative_confirmed_cases'],base),{...base,location:'health_zone',date:'date',metric:'cumulative_confirmed_cases',kind:'cumulative'});
  assert.equal(suggestIndicatorColumns(['zone','province','date','cases'],base).location,'');
  assert.equal(suggestIndicatorColumns(['zone','province','date','cases'],{...base,location:'province'}).location,'province');
});
