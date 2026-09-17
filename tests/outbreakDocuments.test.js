import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {extractRcceDocument,validateRcceDocument,rcceDocumentErrors,rcceAtCutoff} from '../lib/outbreak/documents.js';

test('RCCE text preserves narrative and Excel includes headers and every worksheet',async()=>{
  assert.equal(await extractRcceDocument('feedback.txt',new TextEncoder().encode('  Questions about vaccines\nFollow-up requested.  ')), 'Questions about vaccines\nFollow-up requested.');
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Location','Feedback'],['Area A','Need translated materials']]),'Interviews');
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Actions'],['Radio session planned']]),'Follow-up');
  for(const bookType of ['xlsx','xls']){
    const text=await extractRcceDocument(`report.${bookType}`,XLSX.write(book,{type:'buffer',bookType}));
    assert.match(text,/Worksheet: Interviews\nLocation\tFeedback\nArea A\tNeed translated materials/);
    assert.match(text,/Worksheet: Follow-up\nActions\nRadio session planned/);
  }
});
test('RCCE rejects empty, oversized and unsupported files',async()=>{
  for(const [name,bytes,pattern] of [['x.txt',new Uint8Array(),/No readable/],['x.txt',new Uint8Array(20*1024*1024+1),/20 MB/],['x.txt',new TextEncoder().encode('x'.repeat(200001)),/200,000/],['x.doc',new Uint8Array(),/DOCX/],['x.pptx',new Uint8Array(),/zip/i]])await assert.rejects(()=>extractRcceDocument(name,bytes),pattern);
});
test('RCCE requires review metadata and excludes future reports from the briefing',()=>{
  const report={text:'Raw community feedback',summary:'Follow-up needed',title:'Listening report',source:'RCCE team',date:'2026-09-10',location:'Area A'};
  assert.equal(validateRcceDocument(report),report);
  for(const key of ['text','summary','title','source','date','location'])assert.throws(()=>validateRcceDocument({...report,[key]:''}));
  assert.throws(()=>validateRcceDocument({...report,date:'2026-02-30'}));
  const saved=JSON.parse(JSON.stringify([report,{...report,date:'2026-09-17'}]));
  assert.deepEqual(rcceAtCutoff(saved,'2026-09-16'),[report]);
});
test('RCCE field errors identify missing metadata and allow unknown dates only with findings',()=>{
  const report={text:'Community feedback',title:'Weekly report',source:'',location:'Area A',summary:'Follow-up needed',date:''};
  assert.deepEqual(Object.keys(rcceDocumentErrors(report)),['date','source']);
  assert.match(rcceDocumentErrors(report).date,/reporting date/);
  assert.deepEqual(rcceDocumentErrors({...report,source:'RCCE team',date:'2026-09-15'}),{});
  assert.deepEqual(rcceDocumentErrors({...report,source:'RCCE team',findings:[{id:'finding'}]}),{});
  assert.ok(rcceDocumentErrors({...report,source:'RCCE team',date:'2026-02-30',findings:[{id:'finding'}]}).date);
});
