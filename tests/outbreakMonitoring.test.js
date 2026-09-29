import test from 'node:test';
import assert from 'node:assert/strict';
import { areaMonitoring, monitoringSettings, monitoringHighlights, highBurdenMovements, reportingHeatBand, matchesReportingTrend, reportingMapDetail, reportingWeekDescription, reportingPriorities, reportingSignalDescription } from '../lib/outbreak/monitoring.js';
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

test('horizontal history orders epidemiological weeks from oldest to current and retains missing weeks',()=>{
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

test('reporting weeks use Monday boundaries, partial cut-offs and ISO year rollover',()=>{
  const m=model(stable,{historyWeeks:3},'2026-01-01');
  assert.deepEqual(m.windows.map(w=>w.label),['2025-W51','2025-W52','2026-W01']);
  assert.equal(m.windows.at(-1).start,'2025-12-29');
  assert.equal(m.windows.at(-1).end,'2026-01-01');
  assert.equal(m.windows.at(-1).partial,true);
  assert.equal(m.windows[1].end,'2025-12-28');
  assert.equal(m.windows[1].partial,false);
});
test('heatmap magnitude bands distinguish small and large increases without colouring unknowns as zero',()=>{
  assert.notEqual(reportingHeatBand(6).color,reportingHeatBand(100).color);
  assert.equal(reportingHeatBand(5).label,'+1–5');
  assert.equal(reportingHeatBand(101).label,'+101 or more');
  for(const value of [null,undefined,0,-6,NaN])assert.equal(reportingHeatBand(value),null);
});

test('reporting trend filters group declines and keep unknown evidence separate from steady',()=>{
  assert.equal(matchesReportingTrend({status:'falling'},'declining'),true);
  assert.equal(matchesReportingTrend({status:'declining'},'declining'),true);
  assert.equal(matchesReportingTrend({status:'unchanged'},'steady'),true);
  for(const status of ['unknown','stale','revision','mixed'])assert.equal(matchesReportingTrend({status},'steady'),false);
  assert.equal(matchesReportingTrend({status:'rising'},'rising'),true);
  assert.equal(monitoringSettings({reportingTrend:'invalid'}).reportingTrend,'all');
});

test('reporting map explains day-based runs and uses the exact visible weekly descriptions',()=>{
  const rows=records('Short run',[10,10,10,10],['2026-08-30','2026-08-31','2026-09-07','2026-09-14']);
  const m=model(rows,{historyWeeks:3,reportingMode:'quiet'},'2026-09-14');
  const row=m.rows[0];
  assert.equal(row.quietDays,15);
  assert.equal(row.quietStatus,'recent');
  assert.ok(row.timeline.every(w=>w.status==='quiet'));
  const detail=reportingMapDetail(row,m.settings);
  assert.match(detail,/Unchanged for 15 days/);
  assert.match(detail,/21 elapsed days/);
  for(const week of row.timeline)assert.ok(detail.includes(reportingWeekDescription(row,week)));
  const six=model(rows,{historyWeeks:6,reportingMode:'quiet'},'2026-09-14');
  assert.match(reportingMapDetail(six.rows[0],six.settings),/6 epi weeks/);
  assert.match(reportingMapDetail(six.rows[0],six.settings),/No report available/);
});


test('last observed signal survives publication lag and preserves its dated interval',()=>{
  const oldDates=['2026-07-20','2026-07-27','2026-08-03','2026-08-10'];
  const row=model(records('A',[0,10,30,70],oldDates)).rows[0];
  assert.equal(row.age,42);
  assert.equal(row.status,'stale');
  assert.deepEqual(row.lastSignal,{start:'2026-08-03',end:'2026-08-10',days:7,delta:40,rising:true});
  assert.ok(row.timeline.every(w=>w.status==='missing'));
  assert.match(reportingSignalDescription(row),/2026-08-03–2026-08-10/);
  assert.match(reportingSignalDescription(row),/at that time/);
});

test('last signal does not bridge missing observations, long gaps or future dates',()=>{
  assert.equal(model(records('A',[0,10,null,40])).rows[0].lastSignal,null);
  assert.equal(model(records('A',[0,40],['2026-08-31',end])).rows[0].lastSignal,null);
  const revision=model(records('A',[0,10,30,20])).rows[0];
  assert.equal(revision.lastSignal.delta,-10);
  assert.equal(revision.lastSignal.rising,false);
  assert.match(reportingSignalDescription(revision),/Downward revision/);
  const future=model([...records('A',[0,10,30,40]),{location:'A',date:'2026-09-28',value:1000}]).rows[0];
  assert.equal(future.lastSignal.end,end);assert.equal(future.lastSignal.delta,10);
  assert.match(reportingSignalDescription(model(records('A',[0,0,0,0])).rows[0]),/not confirmed zero/);
});

test('follow-up ordering keeps unavailable ages distinct and defaults to compact history',()=>{
  const rows=[{location:'Unknown',age:null},{location:'Recent',age:0},{location:'Older',age:42,lastSignal:{delta:10}},{location:'Older with increase',age:42,lastSignal:{delta:20}}];
  assert.deepEqual(reportingPriorities(rows).map(r=>r.location),['Older with increase','Older','Recent','Unknown']);
  assert.equal(rows[0].location,'Unknown');
  assert.equal(monitoringSettings().historyLayout,'heatmap');
  assert.equal(monitoringSettings({historyLayout:'cards'}).historyLayout,'cards');
});

test('sustained increases require two rises, three valid intervals and fresh observations',()=>{
  const rising=records('A',[0,10,30,70]);
  assert.equal(model(rising).rows[0].sustainedIncrease,true);
  assert.equal(model(records('A',[0,30,40,60])).rows[0].sustainedIncrease,false);
  assert.equal(model(rising,{},'2026-09-29').rows[0].sustainedIncrease,true);
  const old=model(rising,{},'2026-09-30').rows[0];
  assert.equal(old.sustainedIncrease,false);assert.equal(old.visibilityLost,true);
  assert.deepEqual(old.lastTrend.observations.map(o=>o.delta),[10,20,40]);
  for(const invalid of [
    records('A',[0,10,null,70]),
    records('A',[0,10,30,70],['2026-08-30','2026-09-06','2026-09-14','2026-09-23']),
    [...rising,{location:'A',date:'2026-09-10',value:40}],
    [...rising,{location:'A',date:'2026-09-10',value:null}],
    [...rising,{location:'A',date:'2026-09-22',value:null}]
  ])assert.equal(model(invalid,{},'2026-09-23').rows[0].sustainedIncrease,false);
  const unavailable=model([],{},end,['Unknown']).rows[0];
  assert.equal(unavailable.sustainedIncrease,false);assert.equal(unavailable.visibilityLost,false);
});

test('province evidence uses each zone’s actual dated rates, including daily records and zero baselines',()=>{
  const row=model(records('A',[0,8,22,46],['2026-08-31','2026-09-08','2026-09-15','2026-09-21'])).rows[0];
  assert.equal(row.sustainedIncrease,true);
  assert.deepEqual(row.lastTrend.observations.map(o=>o.days),[8,7,6]);
  assert.deepEqual(row.lastTrend.observations.map(o=>o.rate),[1,2,4]);
  assert.deepEqual(row.lastTrend.changes,[100,100]);
  const zero=model(records('A',[0,0,10,30])).rows[0];
  assert.equal(zero.sustainedIncrease,true);assert.equal(zero.lastTrend.changes[0],null);
  const daily=Array.from({length:22},(_,i)=>({location:'A',date:new Date(Date.parse('2026-08-31')+i*86400000).toISOString().slice(0,10),value:i*i}));
  const dailyRow=model(daily).rows[0];
  assert.equal(dailyRow.lastSignal,null);assert.equal(dailyRow.sustainedIncrease,true);
  assert.deepEqual(dailyRow.lastTrend.observations.map(o=>o.delta),[49,147,245]);
});

test('historical rising watch list is separate from fresh sustained increases and current global trend',()=>{
  const old=records('Old',[0,30,40,60],['2026-07-20','2026-07-27','2026-08-03','2026-08-10']);
  const rows=model([...old,...records('Fresh',[0,10,30,70])]).rows;
  assert.equal(rows[0].status,'stale');assert.equal(rows[0].visibilityLost,true);assert.equal(rows[0].sustainedIncrease,false);
  assert.equal(rows[1].visibilityLost,false);assert.equal(rows[1].sustainedIncrease,true);
  const refreshed=model([...old,...records('Old',[60,80,120,180])]).rows[0];
  assert.equal(refreshed.visibilityLost,false);assert.equal(refreshed.sustainedIncrease,true);
  assert.equal(model(records('Declining',[0,40,60,70]),{},'2026-10-01').rows[0].visibilityLost,false);
});
