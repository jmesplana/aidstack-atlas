import test from 'node:test';
import assert from 'node:assert/strict';
import {documentChunks,sourcePassages,materializeEvidence,validateInsightResponse,validatedInsightSubset,mergeInsightFindings,sourceReference,documentFindings,filterDocumentFindings,mappedDocumentFindings} from '../lib/outbreak/documentInsights.js';

const text='Slide 2\nIn North district, workers asked about deployment on 2026-09-01.';
const finding={kind:'question',themes:['Deployment readiness'],summary:'Workers asked about deployment.',quote:'In North district, workers asked about deployment on 2026-09-01.',location:'North',country:'',province:'',geographicLevel:'district',startDate:'2026-09-01',endDate:'2026-09-01',metricLabel:'',value:null,unit:'',population:'Workers',purpose:'',limitations:''};
const result={title:'Field update',source:'Team',reportDate:'2026-09-02',summary:'Deployment questions.',hasMore:false,findings:[finding]};

test('AI findings require source passages, bounded types, valid periods and explicit numeric units',()=>{
  assert.equal(validateInsightResponse(result,text).findings[0].value,null);
  for(const patch of [{quote:'This was never in the supplied document.'},{kind:'risk_score'},{startDate:'2026-09-03'},{endDate:'2026-02-30'},{value:12},{value:Infinity,metricLabel:'People',unit:'people'},{themes:['x'.repeat(81)]}])assert.throws(()=>validateInsightResponse({...result,findings:[{...finding,...patch}]},text));
  assert.throws(()=>validateInsightResponse({...result,reportDate:'2026-02-30'},text));
});
test('long documents are fully chunked with overlapping context and exact source references',()=>{
  const source=('A paragraph with punctuation (and [brackets]).\n').repeat(6000);
  const chunks=documentChunks(source);
  assert.ok(chunks.length>1);assert.equal(chunks[0].offset,0);
  for(let i=0;i<chunks.length;i++){const chunk=chunks[i];assert.ok(chunk.text.length<=24000);assert.equal(chunk.text,source.slice(chunk.offset,chunk.offset+chunk.text.length));if(i)assert.ok(chunk.offset<chunks[i-1].offset+chunks[i-1].text.length);}
  assert.equal(chunks.at(-1).offset+chunks.at(-1).text.length,source.length);
  assert.equal(sourceReference(text,finding.quote),'Slide 2');
  assert.equal(sourceReference('Page 3\nA statement (with [brackets]).','A statement (with [brackets]).'),'Page 3');
});
test('overlapping AI chunks preserve edits and deduplicate source passages without collapsing different locations',()=>{
  const first=mergeInsightFindings([], [finding],text);
  first[0].summary='Edited summary';first[0].mapLocation='North';first[0].mapLevel='district';
  const merged=mergeInsightFindings(first,[finding,{...finding,location:'South'}],text);
  assert.equal(merged.length,2);assert.equal(merged[0].summary,'Edited summary');assert.equal(merged[0].mapLocation,'North');assert.equal(merged[1].mapLocation,'');
});
test('mapping requires a dated finding and an explicit boundary assignment at the current level',()=>{
  const findings=documentFindings([{id:'source',file:'report.pdf',date:'2026-09-10',source:'Team',findings:[{...finding,id:'a',mapLocation:'North',mapLevel:'district'},{...finding,id:'b',endDate:''},{...finding,id:'c',endDate:'2026-09-20'},{...finding,id:'d',mapLocation:'Missing',mapLevel:'district'},{...finding,id:'e',mapLocation:'North',mapLevel:'province'}]}]);
  const dated=filterDocumentFindings(findings,{asOf:'2026-09-15',theme:'Deployment readiness'});
  assert.equal(dated.length,3);
  const mapped=mappedDocumentFindings(dated,{features:[{properties:{nom:'North'}}]},'district');
  assert.equal(mapped.length,1);assert.equal(mapped[0].id,'a');assert.equal(mapped[0].file,'report.pdf');
  assert.equal(filterDocumentFindings(findings,{asOf:'2026-09-15',from:'2026-09-02'}).length,0);
});

test('unsupported AI quotes are omitted without discarding valid source-linked findings',()=>{
  const clean=validatedInsightSubset({...result,findings:[finding,{...finding,quote:'A fabricated passage not present in this report.'}]},text);
  assert.equal(clean.findings.length,1);assert.equal(clean.omittedFindings,1);assert.equal(clean.hasMore,true);
  assert.throws(()=>validatedInsightSubset({...result,findings:[{...finding,quote:'A fabricated passage not present in this report.'}]},text));
});

test('AI selects bounded source passage IDs and the application supplies exact evidence',()=>{
  const source=('Source text with punctuation and quoted feedback.\n').repeat(80);
  const passages=sourcePassages(source);
  assert.equal(passages.map(p=>p.text).join(''),source);
  const grounded=materializeEvidence({...result,findings:[{...finding,quote:'Ignore generated quotes',passageStart:1,passageEnd:2}]},source);
  assert.equal(grounded.findings[0].quote,source.slice(passages[1].start,passages[2].end));
  const invalid=materializeEvidence({...result,findings:[{...finding,passageStart:9999,passageEnd:9999}]},source);
  assert.equal(invalid.findings[0].quote,'');
});
