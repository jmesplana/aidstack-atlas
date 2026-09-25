import test from 'node:test';
import assert from 'node:assert/strict';
import { areaMonitoring, monitoringSettings, monitoringHighlights, highBurdenMovements } from '../lib/outbreak/monitoring.js';
import { keyMessage } from '../lib/outbreak/keyMessage.js';

const end='2026-09-21';
const dates=['2026-08-31','2026-09-07','2026-09-14',end];
const records=(location,values,days=dates)=>days.map((date,i)=>({location,date,value:values[i]}));
const geo=names=>({features:names.map(nom=>({properties:{nom,province:'Province'}}))});
const epi=rows=>({date:end,baseline:'2026-09-14',dataset:{kind:'cumulative',level:'health_zone',records:rows},zones:[],growth:[],burden:[],affected:[]});
const model=(rows,settings={},asOf=end,names=[...new Set(rows.map(r=>r.location))])=>areaMonitoring(epi(rows),geo(names),'health_zone',asOf,settings);

test('sustained decline requires both weekly reductions to meet the live threshold',()=>{
  const rows=records('Declining',[0,100,190,271]);
  const a=model(rows,{threshold:10}).rows[0],b=model(rows,{threshold:11}).rows[0];
  assert.equal(a.status,'declining');assert.equal(b.status,'falling');
  assert.ok(a.changes.every(p=>Math.abs(p+10)<1e-9));
  assert.equal(model(records('Mixed',[0,100,190,280])).rows[0].status,'mixed');
  assert.equal(model(records('Up',[0,10,20,40])).rows[0].status,'rising');
  assert.equal(model(records('Same',[0,10,20,30])).rows[0].status,'unchanged');
});

test('irregular reporting compares rates over actual intervals, not unequal counts',()=>{
  const m=model(records('A',[0,80,134,190],['2026-08-31','2026-09-08','2026-09-14',end]));
  assert.deepEqual(m.periods.map(p=>p.days),[8,6,7]);
  assert.deepEqual(m.rows[0].observations.map(o=>o.rate),[10,9,8]);
  assert.equal(m.rows[0].status,'declining');
});

test('revisions, missing endpoints and intermediate nulls never become sustained improvement',()=>{
  for(const rows of [records('A',[100,90,80,70]),[...records('A',[0,100,190,271]),{location:'A',date:'2026-09-10',value:200}]])assert.equal(model(rows).rows[0].status,'revision');
  for(const rows of [records('A',[0,null,190,271]),[...records('A',[0,100,190,271]),{location:'A',date:'2026-09-10',value:null}],records('A',[0,100,190,271]).slice(1)])assert.equal(model(rows).rows[0].status,'unknown');
  const duplicate=[...records('A',[0,100,190,271]),{location:'A',date:'2026-09-14',value:190}];
  assert.equal(model(duplicate).rows[0].status,'unknown');
  assert.deepEqual(model(records('A',[0,100,null,271])).rows[0].changes,[null,null]);
});

test('zero baselines have no percentage; late and future reports cannot create improvement',()=>{
  assert.equal(model(records('A',[0,100,100,100])).rows[0].status,'mixed');
  assert.deepEqual(model(records('A',[0,0,0,0])).rows[0].changes,[null,null]);
  assert.equal(model(records('A',[0,100,190,271]),{},'2026-10-01').rows[0].status,'stale');
  const m=model([...records('A',[0,100,190,271]).slice(0,3),{location:'A',date:'2026-09-22',value:271}]);
  assert.equal(m.rows[0].status,'unknown');assert.equal(m.rows[0].lastReport,'2026-09-14');
});

const stable=Array.from({length:7},(_,i)=>({location:'Quiet',date:new Date(Date.parse('2026-08-10')+i*7*86400000).toISOString().slice(0,10),value:10}));
test('3- and 6-week gaps are separate from continued unchanged reports and never-reported boundaries',()=>{
  const rows=[...stable,{location:'Gap3',date:'2026-08-31',value:10},{location:'Gap6',date:'2026-08-10',value:5}];
  const m=model(rows,{},end,['Quiet','Gap3','Gap6','Never']);
  const byName=new Map(m.rows.map(r=>[r.location,r]));
  assert.equal(byName.get('Quiet').quietDays,42);assert.equal(byName.get('Quiet').quietStatus,'quiet6');assert.equal(byName.get('Quiet').gapStatus,'recent');
  assert.equal(byName.get('Gap3').gapStatus,'gap3');assert.equal(byName.get('Gap3').quietStatus,'stale');
  assert.equal(byName.get('Gap6').gapStatus,'gap6');assert.equal(byName.get('Gap6').quietDays,null);
  assert.equal(byName.get('Never').gapStatus,'unknown');assert.equal(byName.get('Never').age,null);
  assert.equal(byName.get('Never').status,'unknown');
  assert.match(monitoringHighlights(m)[1].text,/2 areas have no valid case report.*including 1.*Separately, 1/);
});

test('unchanged runs break on gaps, nulls and revisions; they do not grow during publication lag',()=>{
  for(const rows of [stable.filter((r,i)=>i!==3),stable.map((r,i)=>i===3?{...r,value:null}:r),stable.map((r,i)=>i===3?{...r,value:11}:r)]) {
    assert.equal(model(rows).rows[0].quietDays,14);assert.equal(model(rows).rows[0].quietStatus,'recent');
  }
  assert.equal(model(stable,{},'2026-09-25').rows[0].quietDays,42);
  assert.equal(model([...stable,{location:'Quiet',date:'2026-09-22',value:null}],{},'2026-09-23').rows[0].quietStatus,'stale');
});

test('horizontal history uses cut-off anchored windows, retains missing weeks and links source dates',()=>{
  const m=model(stable,{historyWeeks:6});
  assert.equal(m.windows.length,6);assert.equal(m.windows.at(-1).end,end);
  assert.equal(m.rows[0].timeline.at(-1).status,'quiet');
  const gaps=model([{location:'Gap',date:'2026-08-10',value:10}],{historyWeeks:3});
  assert.equal(gaps.rows[0].timeline.length,3);assert.ok(gaps.rows[0].timeline.every(c=>c.status==='missing'));
});

test('monitoring respects level, config validation, source rollups and unrelated boundaries',()=>{
  assert.equal(areaMonitoring(epi(stable),geo(['Quiet']),'province',end),null);
  const e=epi([...stable,{location:'NA',date:end,value:100}]);
  e.dataset.locationMatching={locations:[{source:'NA',status:'Non-geographic source total'}]};
  assert.equal(areaMonitoring(e,geo(['Quiet']),'health_zone',end).rows.length,1);
  assert.equal(monitoringSettings({threshold:0,historyWeeks:12}).threshold,10);
  assert.equal(monitoringSettings({threshold:101}).threshold,10);
  assert.equal(monitoringSettings({threshold:5}).threshold,5);
  assert.equal(model(stable,{},end,['Other country']).rows.find(r=>r.location==='Other country').gapStatus,'unknown');
});

test('priority zones carry individual outbound and inbound links with cutoff and missing protections',()=>{
  const e={zones:[{location:'A',value:100,delta:5},{location:'B',value:50,delta:10}]};
  const mobility={start:'2026-04-01',end:'2026-04-30',routes:[{origin:'A',destination:'C',value:20},{origin:'D',destination:'A',value:30},{origin:'A',destination:'A',value:99},{origin:'A',destination:'E',value:null}]};
  const ranked=highBurdenMovements(e,mobility,end);
  assert.equal(ranked[0].location,'A');assert.equal(ranked[0].outgoing[0].destination,'C');assert.equal(ranked[0].incoming[0].origin,'D');
  assert.equal(highBurdenMovements(e,mobility,end,{burdenMetric:'recent'})[0].location,'B');
  assert.equal(highBurdenMovements(e,{...mobility,end:'2026-10-01'},end)[0].outgoing.length,0);
});

test('key message uses the configured threshold and respects coordinator overrides',()=>{
  const m=model(records('A',[0,100,190,271]),{threshold:11});
  const message=keyMessage({epi:epi(records('A',[0,100,190,271])),monitoring:m,asOf:end});
  assert.match(message.text,/at least 11%/);assert.equal(message.highlights[0].view,'trends');
  assert.deepEqual(keyMessage({monitoring:m,override:'Coordinator message'}),{text:'Coordinator message',origin:'Coordinator message'});
});

test('trend comparison CSV keeps missing values blank and labels zero-baseline changes', async () => {
  const { trendComparisonCsv } = await import('../lib/outbreak/monitoring.js');
  const model={asOf:'2026-09-21',settings:{threshold:10},periods:[{start:'2026-09-01',end:'2026-09-08'},{start:'2026-09-08',end:'2026-09-15'},{start:'2026-09-15',end:'2026-09-21'}]};
  const rows=[
    {location:'Rimba',province:'Ituri',matched:true,status:'rising',lastReport:'2026-09-21',changes:[null,null],observations:[{delta:0,rate:0},{delta:0,rate:0},{delta:1,rate:1/6}]},
    {location:'=Bad, "zone"',province:null,matched:false,status:'unknown',lastReport:null,changes:[-20,null],observations:[{delta:5,rate:5/7},{delta:4,rate:4/7},{delta:null,rate:null}]}
  ];
  const lines=trendComparisonCsv(rows,model,{rising:{label:'Rising reported rate'},unknown:{label:'Insufficient data'}}).trim().split('\n');
  assert.equal(lines[0],'health_zone,province,reported_change_2026-09-01_to_2026-09-08,rate_per_day_2026-09-01_to_2026-09-08,reported_change_2026-09-08_to_2026-09-15,rate_per_day_2026-09-08_to_2026-09-15,reported_change_2026-09-15_to_2026-09-21,rate_per_day_2026-09-15_to_2026-09-21,rate_change_1_pct,rate_change_2_pct,rate_change_summary,assessment,assessment_reason,caveat,last_valid_report,reporting_cutoff,decline_threshold_pct');
  assert.equal(lines[1],'Rimba,Ituri,0,0,0,0,1,0.1667,,,No change → New increase from zero,Rising reported rate,Week 3 daily rate (0.17/day) is higher than week 2 (0/day). Any increase counts as rising.,,2026-09-21,2026-09-21,10');
  assert.equal(lines[2],`"'=Bad, ""zone""",Unmapped,5,0.7143,4,0.5714,,,-20,,-20% → Not comparable,Insufficient data,Not enough reports to compare three weeks.,,,2026-09-21,10`);
});

test('trend explanation spells out each comparison and flags rises caused by a shorter period', async () => {
  const { trendExplanation } = await import('../lib/outbreak/monitoring.js');
  const nizi={status:'rising',changes:[-64.15,16.67],observations:[{delta:53,rate:53/7,days:7},{delta:19,rate:19/7,days:7},{delta:19,rate:19/6,days:6}]};
  const e=trendExplanation(nizi,10);
  assert.deepEqual(e.steps.map(s=>`${s.label}: ${s.change}`),['Week 1 → 2: -64.15%','Week 2 → 3: +16.67%']);
  assert.match(e.reason,/Week 3 daily rate \(3\.17\/day\) is higher than week 2 \(2\.71\/day\)/);
  assert.match(e.caveat,/did not increase \(19 then 19\).*week 3 is 6 days instead of 7/);
  const bambu={status:'rising',changes:[-72.73,561.11],observations:[{delta:11,rate:11/7,days:7},{delta:3,rate:3/7,days:7},{delta:17,rate:17/6,days:6}]};
  assert.equal(trendExplanation(bambu,10).caveat,'');
});
