import booleanIntersects from '@turf/boolean-intersects';
import test from 'node:test';
import assert from 'node:assert/strict';
import { responseRingModel, responseRingSettings, provinceIntersects } from '../lib/outbreak/responseRings.js';
import { overviewSlideDeck } from '../lib/outbreak/dashboardBriefing.js';

const dates=['2026-08-31','2026-09-07','2026-09-14','2026-09-21'];
const history=(location,values)=>values.map((value,i)=>({location,date:dates[i],value}));
const feature=(name,province,x)=>({type:'Feature',properties:{nom:name,province},geometry:{type:'Polygon',coordinates:[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]]}});
const geometry={type:'FeatureCollection',features:[feature('A','Active',0),feature('B','Neighbour',1),feature('C','Prevention',4),feature('D','Missing',7)]};
const records=[...history('A',[0,1,2,3]),...history('B',[0,0,0,0]),...history('C',[12,12,12,12]),...history('D',[null,null,null,null])];
const input=(rows=records)=>({epi:{date:dates[3],baseline:dates[2],dataset:{kind:'cumulative',level:'health_zone',records:rows}},geometry,boundaryLevel:'health_zone',asOf:dates[3]});
const statuses=model=>Object.fromEntries(model.rows.map(r=>[r.location,r.status]));

test('national rings distinguish increases, neighbouring risk, complete unchanged reports and missing evidence',()=>{
  const model=responseRingModel(input());
  assert.deepEqual(statuses(model),{Active:'red',Missing:'unknown',Neighbour:'orange',Prevention:'yellow'});
  assert.deepEqual(model.counts,{red:1,orange:1,yellow:1,unknown:1});
  assert.equal(model.start,dates[0]);
  assert.deepEqual(statuses(responseRingModel({...input(),province:'Active',location:'A'})),statuses(model));
});
test('cut-offs and window changes recalculate rings without using future observations or stale positives',()=>{
  const early=responseRingModel({...input(),asOf:dates[0]});
  assert.ok(early.rows.every(r=>r.status==='unknown'));
  const late=responseRingModel({...input(),asOf:'2026-10-12'});
  assert.ok(late.rows.every(r=>r.status==='unknown'));
  const sparse=records.filter(r=>r.date!==dates[0]);
  assert.equal(statuses(responseRingModel(input(sparse))).Prevention,'unknown');
  assert.equal(statuses(responseRingModel({...input(sparse),settings:{windowDays:7}})).Prevention,'yellow');
});
test('missing, duplicate, revised, first-positive-only and gapped histories cannot silently become prevention',()=>{
  for(const replacement of [history('A',[0,null,null,3]),history('A',[0,5,2,3]),history('A',[null,null,null,3]),[...history('A',[0,0,0,0]),{location:'A',date:dates[1],value:0}],history('A',[0,0,0,0]).filter(r=>r.date!==dates[1])]) {
    assert.equal(statuses(responseRingModel(input([...records.filter(r=>r.location!=='A'),...replacement]))).Active,'unknown');
  }
  const withMissing=records.filter(r=>r.location!=='B');
  assert.equal(statuses(responseRingModel(input(withMissing))).Neighbour,'orange');
});
test('dated overrides take precedence, drive neighbouring risk and can return to automatic classification',()=>{
  const overrides=[{province:'Prevention',ring:'red',date:'2026-09-14',note:'MoH assessment'},{province:'Active',ring:'yellow',date:'2026-09-22'}];
  const model=responseRingModel({...input(),settings:{overrides}});
  assert.equal(statuses(model).Prevention,'red');assert.equal(statuses(model).Active,'red');
  assert.match(model.rows.find(r=>r.location==='Prevention').reason,/MoH assessment/);
  const restored=responseRingSettings(JSON.parse(JSON.stringify({windowDays:7,overrides})));
  assert.equal(restored.overrides.length,2);assert.equal(restored.windowDays,7);
  const reset=responseRingModel({...input(),settings:{overrides:[...overrides,{province:'Prevention',ring:'auto',date:'2026-09-21'}]}});
  assert.equal(statuses(reset).Prevention,'yellow');
  const forced=responseRingModel({...input(),settings:{overrides:[{province:'Active',ring:'unknown',date:dates[3]}]}});
  assert.equal(statuses(forced).Active,'unknown');assert.equal(statuses(forced).Neighbour,'yellow');
});
test('geographic ambiguity, absent geometry and incompatible levels remain explicit gaps',()=>{
  const ambiguous={features:[...geometry.features,feature('A','Other',10)]};
  const model=responseRingModel({...input(),geometry:ambiguous});
  assert.equal(model.excluded,1);assert.equal(model.unmatched,1);assert.ok(!model.rows.some(r=>r.location==='Active'));
  const noShapes={features:geometry.features.map(f=>({...f,geometry:null}))};
  assert.equal(statuses(responseRingModel({...input(),geometry:noShapes})).Prevention,'unknown');
  assert.ok(responseRingModel({...input(),boundaryLevel:'province'}).rows.every(r=>r.status==='unknown'));
  assert.equal(responseRingModel({...input(),geometry:null}).rows.length,0);
});
test('province sources classify directly and the slide register paginates every province',()=>{
  const direct={...input(),geometry:{features:geometry.features.map(f=>({...f,properties:{nom:f.properties.province}}))},boundaryLevel:'province'};
  direct.epi={...direct.epi,dataset:{...direct.epi.dataset,level:'province',records:records.map(r=>({...r,location:geometry.features.find(f=>f.properties.nom===r.location).properties.province}))}};
  assert.equal(statuses(responseRingModel(direct)).Active,'red');
  const ringModel={...responseRingModel(input()),rows:Array.from({length:26},(_,i)=>({location:`Province ${i}`,status:'unknown'}))};
  const deck=overviewSlideDeck({...input(),ringModel});
  assert.equal(deck.pages.filter(p=>p.kind==='response-rings').length,1);
  assert.deepEqual(deck.pages.filter(p=>p.kind==='response-ring-details').map(p=>p.rows.length),[8,8,8,2]);
});


test('indexed province comparisons preserve exact touching, overlap, containment and hole behaviour',()=>{
  const multi=coordinates=>({type:'Feature',properties:{},geometry:{type:'MultiPolygon',coordinates}});
  const square=(x,y,size=1)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
  const a=multi([[square(0,0,4),square(1,1,2)],[square(10,0)]]);
  for(const b of [multi([[square(20,0)]]),multi([[square(4,0)]]),multi([[square(3.5,0)]]),multi([[square(1.3,1.3,.5)]]),multi([[square(.2,.2,.4)]]),multi([[square(10.5,.5)]])]){
    const expected=booleanIntersects(a,b);
    assert.equal(provinceIntersects(a,b),expected);
    assert.equal(provinceIntersects(b,a),expected);
  }
});
test('province neighbour cache is reused but a replacement geometry gets a fresh comparison',()=>{
  const multi=x=>({type:'Feature',properties:{},geometry:{type:'MultiPolygon',coordinates:[feature('A','Province',x).geometry.coordinates]}});
  const a=multi(0),b=multi(1);assert.equal(provinceIntersects(a,b),true);
  Object.defineProperty(b,'geometry',{get(){throw new Error('Cached pair should not read geometry again');}});
  assert.equal(provinceIntersects(a,b),true);assert.equal(provinceIntersects(b,a),true);
  assert.equal(provinceIntersects(a,multi(5)),false);
});
