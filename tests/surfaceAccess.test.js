import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSurfaceAnalysis, surfaceResult, SURFACE_SOURCE } from '../lib/planning/surfaceAccess.js';
import { runSurfaceAccess } from '../lib/planning/loadSurfaceAccess.js';
import { loadPlatformAccessInputs } from '../lib/planning/loadAccessInputs.js';
import { accessScopeKey } from '../lib/planning/accessInputs.js';
import { validAccessEvidence } from '../lib/planning/accessGaps.js';
import { handler } from '../pages/api/access-surface.js';
const districts = [{id:'surface',name:'Area',geometry:{type:'Polygon',coordinates:[[[7,46],[8,46],[8,47],[7,47],[7,46]]]}}];
const inputs = {
 districts, settlements: [10,20.5,30].map((population,i)=>({settlement_id:String(i),settlement:`Cell ${i}`,latitude:46.1,longitude:7.1+i*.02,population,demandType:'worldpop-cell',area_id:'surface'})),
 sites: [{id:'service',name:'Clinic',latitude:46.1,longitude:7.1},{id:'a',name:'A',latitude:46.1,longitude:7.12},{id:'b',name:'B',latitude:46.1,longitude:7.14}],
 settings: {mode:'walking',thresholdMinutes:60,candidateIds:['a','b'],selectedCandidateIds:['a','b'],suggestCandidates:true},
 sources:{population:'WorldPop',populationDate:'2025-01-01',sites:'Healthsites snapshot'},populationCoverage:{missingCells:1},
};
test('surface scenarios do not double-count gains and keep unknown baseline separate',()=>{
 const result=surfaceResult(inputs,prepareSurfaceAnalysis(inputs),[0,80,null],{a:{times:[0,10,30],connected:true},b:{times:[5,20,null],connected:true}},[true]);
 assert.equal(result.method,'friction-surface-v1');
 assert.deepEqual(result.totals,{population:60.5,covered:10,unknown:30,beyondThreshold:20.5});
 assert.equal(result.scenario.additionalPopulation,20.5);assert.equal(result.scenario.reachableFromUnknown,30);assert.equal(result.scenario.coveredPopulation,60.5);
 assert.equal(result.sources.travelSurface.year,2019);assert.equal(result.settings.speedKph,null);
 const evidence={name:'Surface',publicationId:'p',attachedAt:'2026-01-01',source:{moduleId:'access-gaps',revision:1},result};
 assert.equal(validAccessEvidence(evidence),true);
 assert.equal(validAccessEvidence({...evidence,result:{...result,sources:{...result.sources,travelSurface:null}}}),false);
 assert.throws(()=>surfaceResult(inputs,prepareSurfaceAnalysis(inputs),[0,80],{},[true]),/Incomplete/);
});
test('surface calculations use the selected service points and reject missing or cancelled results',async()=>{
 const calls=[];
 const request=async body=>{calls.push(body);return {times:body.sites[0][0]===7.1?[0,80,null]:[0,10,30],connectedSites:[true]};};
 const result=await runSurfaceAccess(inputs,{request});
 assert.equal(calls.length,3);assert.ok(calls.every(c=>c.action==='travel'&&c.mode==='walking'&&c.districts===districts));
 assert.equal(result.scenario.coveredPopulation,60.5);
 await assert.rejects(runSurfaceAccess(inputs,{request:async()=>({times:[],connectedSites:[]})}),/incomplete/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(runSurfaceAccess(inputs,{signal:controller.signal,request}),/cancelled/);
});
test('surface inputs load WorldPop and automatic facilities without any OSM road request',async()=>{
 global.window={};const original=global.fetch;const calls=[];
 global.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body});
  if(url==='/api/access-surface') return {ok:true,json:async()=>({sites:[inputs.sites[0]],source:{name:'Snapshot'},metadata:{timestamp:new Date().toISOString()}})};
  assert.equal(body.kind,'population');
  return {ok:true,json:async()=>({points:inputs.settlements,year:2025,cellSize:body.cellSize,metadata:{timestamp:new Date().toISOString(),scopeKey:accessScopeKey(body.districts,body.cellSize,body.year)}})};
 };
 try{
  const result=await loadPlatformAccessInputs({districts,model:'surface'});
  assert.equal(result.model,'surface');assert.equal(result.network.sites.length,1);assert.equal(result.network.roads.features.length,0);
  assert.equal(calls.length,2);
  const count=calls.length;await loadPlatformAccessInputs({districts,model:'surface'});assert.equal(calls.length,count);
 }finally{global.fetch=original;delete global.window;}
});
test('surface endpoint rejects invalid scope, oversized point batches and out-of-area demand',async()=>{
 const response=()=>({status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
 for(const body of [ {}, {action:'travel',districts,mode:'walking',origins:[[9,46]],sites:[]}, {action:'travel',districts,mode:'walking',origins:Array.from({length:1001},()=>[7.1,46.1]),sites:[]}, {action:'travel',districts,mode:'walking',origins:[[7.1,46.1]],sites:[[7,-70]]}]) {
  const res=response();await handler({method:'POST',body},res);assert.equal(res.code,400);
 }
});
