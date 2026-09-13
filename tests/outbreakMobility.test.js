const {test}=require('node:test');
const assert=require('node:assert/strict');
const lib=import('../lib/outbreak/mobility.js');
test('OD direction, missingness, duplicates and period guards',async()=>{
 const {normalizeRoutes,matrixRoutes,districtRoutes}=await lib;
 const routes=matrixRoutes([{nom:'Alpha',Beta:'25',Alpha:'0'},{nom:'Beta',Beta:'0',Alpha:''}],['nom','Beta','Alpha']);
 const data={routes,end:'2026-04-30'};
 assert.equal(districtRoutes(data,'Alpha','outflow','2026-09-01')[0].value,25);
 assert.equal(districtRoutes(data,'Alpha','inflow','2026-09-01')[0].value,null);
 assert.deepEqual(districtRoutes(data,'Alpha','outflow','2026-04-01'),[]);
 assert.throws(()=>normalizeRoutes([{o:'A',d:'B',v:1},{o:'A',d:'B',v:2}],{origin:'o',destination:'d',value:'v'}),/Duplicate/);
});
test('mobility summary states exclusion explicitly and ranks only links from reporting areas',async()=>{
 const {mobilitySummary}=await lib;
 const epi={date:'2026-09-01',affected:[{location:'Alpha',value:10},{location:'Beta',value:4}]};
 const data={routes:[{origin:'Alpha',destination:'Gamma',value:20},{origin:'Alpha',destination:'Delta',value:5},
   {origin:'Zeta',destination:'Gamma',value:99},{origin:'Alpha',destination:'Alpha',value:50},{origin:'Beta',destination:'Eta',value:null}],
   start:'2026-03-01',end:'2026-04-30',unit:'estimated relocations',source:'https://example.org/od.csv'};

 assert.equal(mobilitySummary(null,epi,'2026-09-01').state,'none');

 // A period after the cut-off is excluded, and says so rather than reporting a date.
 const after=mobilitySummary({...data,end:'2026-12-01'},epi,'2026-09-01');
 assert.equal(after.state,'after-cutoff');
 assert.deepEqual(after.links,[]);
 assert.match(after.note,/after this reporting cut-off/);

 assert.equal(mobilitySummary({...data,end:'not-a-date'},epi,'2026-09-01').state,'undated');
 assert.equal(mobilitySummary(data,null,'2026-09-01').state,'no-cases');

 const summary=mobilitySummary(data,epi,'2026-09-01');
 assert.equal(summary.state,'links');
 // Only links originating in a reporting area; self-links, missing values and
 // non-reporting origins (Zeta, the largest value) are all excluded.
 assert.deepEqual(summary.links.map(r=>[r.origin,r.destination,r.value]),[['Alpha','Gamma',20],['Alpha','Delta',5]]);
 assert.match(summary.note,/does not identify infected travellers/);
 assert.equal(summary.basis.period,'2026-03-01–2026-04-30');
 assert.equal(summary.basis.url,'https://example.org/od.csv');

 // No positive link from a reporting area is distinct from having no data at all.
 const none=mobilitySummary({...data,routes:[{origin:'Zeta',destination:'Gamma',value:99}]},epi,'2026-09-01');
 assert.equal(none.state,'no-links');
 assert.deepEqual(none.links,[]);
});
test('focus reasons are derived from loaded evidence without inferring infection',async()=>{
 const {focusAreas}=await lib;
 const epi={date:'2026-09-01',burden:[{location:'Alpha',value:10}],growth:[{location:'Beta',delta:3}],affected:[{location:'Alpha'}]};
 const priorities=focusAreas(epi,null,{routes:[{origin:'Alpha',destination:'Gamma',value:20}],start:'2026-03-01',end:'2026-04-30',unit:'estimated relocations'},'2026-09-01');
 assert.deepEqual(priorities.map(p=>p.name),['Alpha','Beta','Gamma']);
 assert.match(priorities[2].reasons[0],/does not prove exposure/);
});

test('recommendations require observed evidence and preserve uncertainty',async()=>{
 const {recommendations}=await import('../lib/outbreak/overview.js');
 assert.deepEqual(recommendations(null,null,null),[]);
 const epi={date:'2026-09-10',baseline:'2026-09-03',growth:[{location:'Example district',delta:4}],burden:[{location:'Example district',value:20}],affected:[{location:'Example district'}]};
 const suggestions=recommendations(epi,null,null);
 assert.equal(suggestions.length,2);
 assert.match(suggestions[0].why,/\+4/);
 assert.match(suggestions[0].action,/backlogs and revisions/);
 assert.match(suggestions[1].action,/do not measure current workload/);
});

test('viewport zoom preserves pointer anchor and labels avoid collision',async()=>{
 const {zoomView,placeLabels}=await import('../lib/outbreak/mapInteraction.js');
 const view=[100,200,900,440],anchor=[100,80],next=zoomView(view,.5,anchor);
 assert.equal(next[0]+anchor[0]/900*next[2],view[0]+anchor[0]);
 assert.equal(next[1]+anchor[1]/440*next[3],view[1]+anchor[1]);
 const features=Array.from({length:20},(_,i)=>({name:`Area ${i}`,center:[450,220]}));
 const placed=placeLabels(features,[0,0,900,440],'Area 19',new Set(features.map(f=>f.name)));
 assert.equal(placed[0].name,'Area 19');
 assert.ok(placed.length<20);
 for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++)assert.ok(Math.abs(placed[i].labelY-placed[j].labelY)>=24);
});
test('GDACS context only includes dated unique alert centres in the chosen geography',async()=>{
 const {hazardContext}=await import('../lib/outbreak/context.js');
 const {spatialIndex}=await import('../lib/outbreak/insights.js');
 const index=spatialIndex({features:[{type:'Feature',properties:{nom:'Example'},geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}}]});
 const event={eventId:'1',eventType:'FL',latitude:1,longitude:1,pubDate:'2026-09-01',title:'Flood alert'};
 const result=hazardContext([event,event,{...event,eventId:'2',pubDate:'2026-10-01'},{...event,eventId:'3',longitude:10}],index,'2026-09-10');
 assert.equal(result.events.length,1);assert.equal(result.events[0].location,'Example');
});
