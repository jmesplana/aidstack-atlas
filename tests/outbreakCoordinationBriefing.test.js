import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { coordinationBriefing, COORDINATION_SECTIONS } from '../lib/outbreak/coordinationBriefing.js';
import { createCoordinationPowerPoint, powerPointSlideCount } from '../lib/outbreak/powerPoint.js';
import { areaMonitoring } from '../lib/outbreak/monitoring.js';
const dates=['2026-08-31','2026-09-07','2026-09-14','2026-09-21'];
const geometry={features:Array.from({length:12},(_,i)=>({properties:{nom:`Zone ${i}`,province:i<8?'East':'West'}}))};
const dataset={kind:'cumulative',status:'ready',metricId:'cumulative_confirmed_cases',level:'health_zone',url:'https://example.org/cases.csv',records:geometry.features.flatMap((f,i)=>dates.map((date,j)=>({location:f.properties.nom,date,value:(i+1)*j*j})))};
const epi={date:dates.at(-1),dataset};
const input={epi,geometry,boundaryLevel:'health_zone',asOf:'2026-09-29',operationTitle:'Ebola briefing',settings:{historyWeeks:6}};
input.model=areaMonitoring(epi,geometry,'health_zone',input.asOf,input.settings);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('full coordination deck includes every monitoring row and all sections with latest-source dates',()=>{
  const b=coordinationBriefing({...input,location:'Zone 1'},{includeAppendix:true});
  const appendix=b.chapters.filter(c=>c.appendix);
  assert.deepEqual(appendix.map(c=>c.id),COORDINATION_SECTIONS.map(([id])=>id));
  assert.equal(appendix.find(c=>c.id==='trends').deck.pages.filter(p=>p.kind==='trend-detail').flatMap(p=>p.rows).length,12);
  assert.equal(appendix.find(c=>c.id==='availability').deck.pages.length,1);
  assert.equal(appendix.find(c=>c.id==='availability').deck.provinces.reduce((n,p)=>n+p.total,0),12);
  assert.match(b.availability,/cases 2026-09-21/);
  assert.match(b.findings[0],/2026-09-14–2026-09-21/);
  assert.equal(b.sourceRegister[0].source,dataset.url);
  const west=coordinationBriefing(input,{province:'West',sections:['overview','trends']});
  assert.equal(west.trendRows.length,4);assert.equal(west.ringModel.rows.length,2);
  assert.equal(west.overview.glance.healthZones.total,4);
  const missing=coordinationBriefing({asOf:input.asOf});
  assert.ok(missing.chapters.filter(c=>c.type==='dashboard').every(c=>c.deck.pages[0].kind==='empty'));
  assert.match(missing.findings[0],/No eligible/);
});

test('PPTX includes widescreen images, editable findings, notes and full sources; cancellation returns no package',async()=>{
  const briefing=coordinationBriefing(input,{sections:['overview']}),seen=[];
  const blob=await createCoordinationPowerPoint({briefing,preparedBy:'Epi team',keyMessage:'Verification priorities',requests:'Confirm reporting gaps.',renderVisual:async args=>{seen.push(args);return {data:png,title:args.entry.kind,notes:'Full evidence transcript'};}});
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const slides=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));
  assert.equal(slides.length,11);
  assert.equal(seen.length,briefing.visualCount);assert.equal(seen[0].page,2);
  assert.match(await zip.file('ppt/presentation.xml').async('string'),/cx="12192000" cy="6858000"/);
  assert.match(await zip.file('ppt/slides/slide2.xml').async('string'),/Verification priorities/);
  assert.match(await zip.file('ppt/slides/slide2.xml').async('string'),/2026-09-14–2026-09-21/);
  assert.match(await zip.file('ppt/notesSlides/notesSlide4.xml').async('string'),/Full evidence transcript/);
  const all=await Promise.all(slides.map(p=>zip.file(p).async('string')));
  assert.ok(all.some(s=>s.includes('https://example.org/cases.csv')));
  assert.equal(Object.keys(zip.files).filter(p=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)).length,slides.length);
  const abort=new AbortController();abort.abort();
  await assert.rejects(createCoordinationPowerPoint({briefing,signal:abort.signal,renderVisual:()=>assert.fail('must not render')}),{name:'AbortError'});
});


test('default stays at ten slides for 519 zones while summary counts retain the full scope',()=>{
  const rows=Array.from({length:519},(_,i)=>({...input.model.rows[i%12],location:`Area ${i}`,province:`Province ${i%26}`}));
  const large={...input,model:{...input.model,rows},geometry:{features:rows.map(r=>({properties:{nom:r.location,province:r.province}}))},epi:{...epi,dataset:{...dataset,records:rows.flatMap(r=>dates.map((date,i)=>({location:r.location,date,value:i*i})))}}};
  const b=coordinationBriefing(large);
  assert.equal(powerPointSlideCount(b),10);assert.equal(powerPointSlideCount(b,'Request'),11);
  assert.equal(b.visualCount,7);assert.equal(b.surveillance.total,519);
  assert.equal(b.surveillance.provinces.reduce((sum,p)=>sum+p.total,0),519);
  assert.equal(b.trendRows.length,519);assert.equal(b.chapters.find(c=>c.id==='burden').deck.ranked.length,5);
  assert.equal(b.priorities.lost.length,rows.filter(r=>r.visibilityLost).length);
  assert.ok(b.chapters.every(c=>!c.appendix));
  const detailed=coordinationBriefing(large,{includeAppendix:true,sections:['availability']});
  assert.equal(detailed.chapters.filter(c=>c.appendix).length,1);
  assert.equal(detailed.chapters.at(-1).deck.pages.length,4);
  assert.ok(detailed.chapters.at(-1).deck.pages.every(p=>p.kind==='summary'));
  assert.equal(detailed.chapters.at(-1).deck.provinces.reduce((n,p)=>n+p.total,0),519);
  assert.equal(powerPointSlideCount(detailed),15);
  assert.deepEqual(detailed.findings,b.findings);
  const scoped=coordinationBriefing(large,{province:'Province 1'});
  assert.equal(scoped.surveillance.total,rows.filter(r=>r.province==='Province 1').length);
});

test('optional appendices follow sources with correct slide totals and numbering',async()=>{
  const briefing=coordinationBriefing(input,{includeAppendix:true,sections:['availability']}),seen=[];
  const blob=await createCoordinationPowerPoint({briefing,renderVisual:async args=>{seen.push(args);return {data:png,title:args.entry.kind};}});
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const slides=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));
  assert.equal(slides.length,powerPointSlideCount(briefing));
  assert.match(await zip.file('ppt/slides/slide10.xml').async('string'),/Sources and data availability/);
  assert.match(await zip.file('ppt/slides/slide11.xml').async('string'),/Appendix/);
  assert.equal(seen.find(r=>r.chapter.appendix).page,11);
  assert.match(await zip.file('ppt/notesSlides/notesSlide10.xml').async('string'),/Interpretation and methods/);
});

test('surveillance appendix retains missing-report counts without creating empty zone detail slides',()=>{
  const rows=Array.from({length:519},(_,i)=>({location:`Zone ${i}`,province:`Province ${i%26}`,matched:true,hasHistory:i<12,lastReport:i<12?'2026-09-21':null,age:i<6?0:i<12?20:null}));
  const b=coordinationBriefing({...input,model:{...input.model,rows}},{includeAppendix:true,sections:['availability']});
  const deck=b.chapters.at(-1).deck;
  assert.equal(deck.pages.length,4);
  assert.ok(deck.pages.every(p=>p.kind==='summary'));
  assert.equal(deck.provinces.reduce((n,p)=>n+p.recent,0),6);
  assert.equal(deck.provinces.reduce((n,p)=>n+p.older,0),6);
  assert.equal(deck.provinces.reduce((n,p)=>n+p.unavailable,0),507);
  assert.ok(deck.provinces.every(p=>p.recent+p.older+p.unavailable===p.total));
  const missing=coordinationBriefing({...input,model:{...input.model,rows:rows.map(r=>({...r,hasHistory:false,lastReport:null,age:null}))}},{includeAppendix:true,sections:['availability']});
  assert.equal(missing.chapters.at(-1).deck.pages.length,4);
  assert.equal(missing.chapters.at(-1).deck.provinces.reduce((n,p)=>n+p.unavailable,0),519);
});
