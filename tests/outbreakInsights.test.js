import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMobility, detectGeoIndicators, embeddedEpidemiology, epidemiology, spatialIndex, locatePoint, miningOverlap, securityRecords, securityOverlap, integratedEvidence } from '../lib/outbreak/insights.js';

const polygon=(name,x,props={})=>({type:'Feature',properties:{nom:name,province:'Region Q',...props},geometry:{type:'Polygon',coordinates:[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]]}});
const geometry={type:'FeatureCollection',features:[polygon('Area X',0),polygon('Area Y',1)]};
const dataset={id:'external-provider',purpose:'cases',label:'Confirmed cases',unit:'people',kind:'cumulative',level:'district',status:'ready',source:'Synthetic provider',records:[
  {location:'Area X',date:'2026-09-01',value:100},{location:'Area Y',date:'2026-09-01',value:10},
  {location:'Area X',date:'2026-09-08',value:105},{location:'Area Y',date:'2026-09-08',value:30}
]};
test('automatic rankings and grouping use arbitrary place names and provider data',()=>{
  const epi=epidemiology([dataset],geometry,'2026-09-09',null,'district');
  assert.equal(epi.burden[0].location,'Area X');assert.equal(epi.growth[0].location,'Area Y');
  assert.equal(epi.total,135);assert.equal(epi.provinces[0].delta,25);
  assert.equal(epi.growth[0].percent,200);
  assert.equal(epidemiology([dataset],geometry,'2026-09-09',null,'province').provinces.length,0);
});
test('paired comparisons use one shared date and never infer a missing baseline as zero',()=>{
  const copy={...dataset,records:dataset.records.filter(r=>!(r.location==='Area Y'&&r.date==='2026-09-01'))};
  const epi=epidemiology([copy],geometry,'2026-09-08');
  assert.equal(epi.growth.length,1);assert.equal(epi.provinces[0].delta,null);
});
test('area rankings use six or eight days when seven is unavailable and disclose duration',()=>{
  const current=[{location:'Area X',date:'2026-09-21',value:105},{location:'Area Y',date:'2026-09-21',value:30}];
  const six=[{location:'Area X',date:'2026-09-15',value:100}];
  const eight=[{location:'Area X',date:'2026-09-13',value:90},{location:'Area Y',date:'2026-09-13',value:10}];
  const get=records=>epidemiology([{...dataset,records}],geometry,'2026-09-21');
  const near=get([...current,...six,...eight]);
  assert.equal(near.comparisonDays,6);assert.equal(near.baseline,'2026-09-15');
  assert.equal(near.growth.length,1);assert.equal(near.growth[0].delta,5);
  const older=get([...current,...eight]);
  assert.equal(older.comparisonDays,8);assert.equal(older.growth.length,2);
  const exact=get([...current,...six,...eight,{location:'Area X',date:'2026-09-14',value:102}]);
  assert.equal(exact.comparisonDays,7);assert.equal(exact.growth[0].delta,3);
});
test('Flowminder inflow, outflow and other cohorts remain distinct, including dates and zero',()=>{
  const geo={type:'FeatureCollection',features:[polygon('Area X',0,{flowminder:{inflow_20260901:{inflow_20260901:0},outflow_20260901:{outflow_20260901:.2},subscriber_days:{subscriber_days:.3},outflow_20260920:{outflow_20260920:.8}}})]};
  const layers=detectMobility(geo,'2026-09-08');
  assert.equal(layers.length,3);assert.equal(layers.find(l=>l.direction==='inflow').records[0].value,0);
  assert.equal(layers.find(l=>l.direction==='outflow').date,'2026-09-01');
  assert.equal(layers.find(l=>l.direction==='other').date,null);
  const noInflow={type:'FeatureCollection',features:[polygon('A',0,{Flowminder:{outflow:.5}})]};
  assert.deepEqual(detectMobility(noInflow,'2026-09-08').map(l=>l.direction),['outflow']);
});
test('embedded canonical indicators work with another provider and exclude replicated national totals',()=>{
  const geo={type:'FeatureCollection',features:[polygon('Area X',0,{another_provider:{cumulative_confirmed_cases:{cumulative_confirmed_cases:10,_date:'2026-09-08'},national_cumulative_confirmed_cases:{national_cumulative_confirmed_cases:100,_date:'2026-09-08'}},custom:{bed_capacity:45}})]};
  const embedded=embeddedEpidemiology(geo,'district');
  assert.equal(embedded.length,1);assert.equal(embedded[0].records[0].value,10);
  assert.equal(embedded[0].level,'district');
  assert.ok(detectGeoIndicators(geo,'2026-09-08').some(l=>l.id==='custom.bed_capacity'));
});
test('spatial overlaps do not double count boundary points or place missing coordinates at zero',()=>{
  const index=spatialIndex(geometry);
  assert.equal(locatePoint(index,.5,.5).location,'Area X');
  assert.equal(locatePoint(index,1,.5).status,'ambiguous boundary');
  assert.equal(locatePoint(index,'',.5).status,'invalid coordinates');
  const result=miningOverlap([{id:'a',date:'2020-01-01',longitude:.5,latitude:.5},{id:'b',date:'2020-01-01',longitude:1,latitude:.5},{id:'future',date:'2030-01-01',longitude:.5,latitude:.5}],index,'2026-09-08');
  assert.equal(result.matched,1);assert.equal(result.issues.length,1);assert.equal(result.eligible,2);
});
test('security deduplicates IDs, preserves unknown fatalities and applies explicit time window',()=>{
  const event={event_id:'e1',event_date:'2026-09-08',latitude:.5,longitude:.5,fatalities:2,actor1:'Actor Q'};
  const events=[event,{...event},{...event,event_id:'e2',fatalities:'ND'},{...event,event_id:'e3',event_date:'2026-08-01'}];
  const result=securityOverlap(events,spatialIndex(geometry),'2026-09-01','2026-09-08');
  assert.equal(result.records.length,2);assert.equal(result.reportedFatalities,2);
  assert.equal(result.byZone.get('Area X').missingFatalities,1);
  assert.equal(securityRecords([event,{...event,fatalities:8}]).records.length,0);
});
test('integrated narrative is derived from input, never the sample briefing locations or totals',()=>{
  const epi=epidemiology([dataset],geometry,'2026-09-08');
  const facts=integratedEvidence(epi,null,null,null,true);
  const text=facts.map(f=>f.text).join(' ');
  assert.match(text,/Area X \(105\)/);assert.match(text,/Area Y \(\+20\)/);
  assert.doesNotMatch(text,/Ituri|Mandima|6,757|transmission is occurring/);
});
