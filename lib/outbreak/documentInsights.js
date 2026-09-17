import {validDate} from './data.js';

export const AI_DOCUMENT_DISCLAIMER='AI-extracted findings may be incomplete or incorrect. Check the linked source before making decisions. Reported rumors are claims, not verified facts; report counts do not measure how widely a belief is held.';
export const FINDING_TYPES=['rumor','question','concern','request','reported_activity','vaccination','cases','other'];
export const CHUNK_SIZE=24000;
const normalize=text=>String(text||'').replace(/\s+/g,' ').trim();
const string={type:'string'};
const fields={kind:{type:'string',enum:FINDING_TYPES},themes:{type:'array',items:string},summary:string,quote:string,location:string,country:string,province:string,geographicLevel:string,startDate:string,endDate:string,metricLabel:string,value:{type:['number','null']},unit:string,population:string,purpose:string,limitations:string};
const {quote:unusedQuote,...extractedFields}=fields;
const aiFields={...extractedFields,passageStart:{type:'integer'},passageEnd:{type:'integer'}};
export const DOCUMENT_INSIGHTS_SCHEMA={type:'object',additionalProperties:false,properties:{title:string,source:string,reportDate:string,summary:string,hasMore:{type:'boolean'},findings:{type:'array',items:{type:'object',additionalProperties:false,properties:aiFields,required:Object.keys(aiFields)}}},required:['title','source','reportDate','summary','hasMore','findings']};

export function sourcePassages(text) {
  const passages=[];
  for(let start=0;start<text.length;){
    let end=Math.min(text.length,start+650);
    if(end<text.length){const newline=text.lastIndexOf('\n',end),space=text.lastIndexOf(' ',end);if(newline>start+200)end=newline;else if(space>start+200)end=space;}
    passages.push({id:passages.length,start,end,text:text.slice(start,end)});start=end;
  }
  return passages;
}

export function materializeEvidence(data,text) {
  if(!Array.isArray(data?.findings)||data.findings.length>30)throw new Error('AI returned an invalid findings package.');
  const passages=sourcePassages(text);
  return {...data,findings:data.findings.map(f=>{
    const start=passages[f?.passageStart],end=passages[f?.passageEnd];
    const quote=Number.isInteger(f?.passageStart)&&Number.isInteger(f?.passageEnd)&&start&&end&&f.passageEnd>=f.passageStart&&end.end-start.start<=4000?text.slice(start.start,end.end):'';
    return {...f,quote};
  })};
}

export function documentChunks(text) {
  const chunks=[];
  for(let offset=0;offset<text.length;) {
    const end=Math.min(text.length,offset+CHUNK_SIZE);
    const breakAt=text.lastIndexOf('\n',end);
    const stop=end<text.length&&breakAt>offset+CHUNK_SIZE/2?breakAt:end;
    chunks.push({text:text.slice(offset,stop),offset});
    if(stop===text.length)break;
    offset=Math.max(offset+1,stop-1200);
  }
  return chunks;
}

export function validateInsightResponse(data,sourceText) {
  if(!data||!Array.isArray(data.findings)||data.findings.length>30||typeof data.hasMore!=='boolean')throw new Error('AI returned an invalid findings package.');
  for(const [key,max] of [['title',200],['source',200],['reportDate',10],['summary',4000]])if(typeof data[key]!=='string'||data[key].length>max)throw new Error(`Invalid AI ${key}.`);
  if(data.reportDate&&!validDate(data.reportDate))throw new Error('Invalid AI report date.');
  const findings=data.findings.map(f=>{
    if(!f||!FINDING_TYPES.includes(f.kind)||!Array.isArray(f.themes)||f.themes.length>8||f.themes.some(t=>typeof t!=='string'||!t.trim()||t.length>80))throw new Error('Invalid AI finding type or themes.');
    for(const key of Object.keys(fields).filter(k=>!['themes','value'].includes(k)))if(typeof f[key]!=='string'||f[key].length>(key==='quote'?4000:['summary','limitations'].includes(key)?2000:200))throw new Error(`Invalid finding ${key}.`);
    if(!f.summary.trim()||normalize(f.quote).length<12||!normalize(sourceText).includes(normalize(f.quote)))throw new Error('A finding could not be traced to an exact source passage.');
    if((f.startDate&&!validDate(f.startDate))||(f.endDate&&!validDate(f.endDate))||(f.startDate&&f.endDate&&f.startDate>f.endDate))throw new Error('Invalid finding period.');
    if(f.value!==null&&(!Number.isFinite(f.value)||f.value<0||f.value>Number.MAX_SAFE_INTEGER||!f.metricLabel.trim()||!f.unit.trim()))throw new Error('A numeric finding needs a valid value, measure and unit.');
    return Object.fromEntries(Object.keys(fields).map(key=>[key,f[key]]));
  });
  return {...data,findings};
}

export function validatedInsightSubset(data,sourceText) {
  if(!Array.isArray(data?.findings)||data.findings.length>30)throw new Error('AI returned an invalid findings package.');
  const header=validateInsightResponse({...data,findings:[]},sourceText);
  const findings=[];
  for(const finding of data.findings){try{findings.push(...validateInsightResponse({...header,findings:[finding]},sourceText).findings);}catch{}}
  const omittedFindings=data.findings.length-findings.length;
  if(omittedFindings&&!findings.length)throw new Error('A finding could not be traced to an exact source passage.');
  return {...header,findings,omittedFindings,hasMore:header.hasMore||omittedFindings>0};
}

export function sourceReference(text,quote) {
  // Match across extracted whitespace while preserving the original character offset.
  const escaped=normalize(quote).split(' ').map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
  const offset=text.search(new RegExp(escaped));
  if(offset<0)return 'Source passage';
  const markers=[...text.slice(0,offset).matchAll(/^(Page \d+|Slide \d+|Worksheet: .+)$/gm)];
  return markers.at(-1)?.[1]||`Document text, character ${offset+1}`;
}

export function mergeInsightFindings(existing,incoming,text) {
  const result=[...existing],seen=new Set(existing.map(f=>JSON.stringify([normalize(f.quote),f.location,f.kind])));
  for(const f of incoming){const key=JSON.stringify([normalize(f.quote),f.location,f.kind]);if(seen.has(key))continue;seen.add(key);result.push({...f,id:crypto.randomUUID(),reference:sourceReference(text,f.quote),mapLocation:'',mapLevel:'',origin:'ai'});}
  return result;
}

export function documentFindings(documents) {
  return documents.flatMap(d=>(d.findings||[]).map(f=>({...f,documentId:d.id,file:d.file,source:d.source,reportTitle:d.title,documentDate:d.date,sha256:d.sha256})));
}
export function filterDocumentFindings(findings,{asOf,from='',kind='',theme=''}={}) {
  return findings.filter(f=>validDate(f.endDate)&&f.endDate<=asOf&&(!from||f.endDate>=from)&&(!kind||f.kind===kind)&&(!theme||f.themes.includes(theme)));
}
export function mappedDocumentFindings(findings,geometry,level) {
  const names=new Set(geometry?.features.map(f=>f.properties.nom)||[]);
  return findings.filter(f=>f.mapLevel===level&&names.has(f.mapLocation));
}
export function themeColor(theme) {
  const palette=['#8a357e','#176f89','#9c4f00','#385cad','#577119','#a3324d','#53616f'];
  let hash=0;for(const character of theme)hash=(hash*31+character.charCodeAt(0))>>>0;
  return palette[hash%palette.length];
}
