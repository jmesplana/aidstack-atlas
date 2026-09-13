import { numeric, validDate } from './data.js';

export function normalizeRoutes(rows, mapping) {
  const seen=new Set();
  if(!rows.length||rows.length>300000)throw new Error('Supply 1–300,000 origin–destination observations.');
  return rows.map((r,i)=>{
    const origin=String(r[mapping.origin]??'').trim(),destination=String(r[mapping.destination]??'').trim();
    if(!origin||!destination)throw new Error(`Row ${i+2}: missing origin or destination.`);
    const key=JSON.stringify([origin,destination]);
    if(seen.has(key))throw new Error(`Duplicate route ${origin} → ${destination}. Select one period/product before importing.`);
    seen.add(key);
    return {origin,destination,value:numeric(r[mapping.value])};
  });
}
export function matrixRoutes(rows,headers) {
  if(!headers?.length||headers.length<2)throw new Error('Invalid matrix headers.');
  return normalizeRoutes(rows.flatMap(r=>headers.slice(1).map(destination=>({origin:r[headers[0]],destination,value:r[destination]}))),{origin:'origin',destination:'destination',value:'value'});
}
export function districtRoutes(data,area,direction,asOf) {
  if(!data||!validDate(data.end)||data.end>asOf)return [];
  return data.routes.filter(r=>r.origin!==r.destination&&(direction==='inflow'?r.destination===area:r.origin===area)).sort((a,b)=>(b.value??-1)-(a.value??-1));
}
// One deterministic mobility state for the snapshot, the freshness bar and the panel, so a
// period after the cut-off is never shown as an available observation date in one place and
// excluded in another. `links` are individual observed connections, never summed.
export function mobilitySummary(data,epi,asOf,limit=3) {
  if(!data)return {state:'none',date:null,note:'No origin–destination data loaded.',links:[],basis:null};
  const period=validDate(data.start)&&validDate(data.end)?`${data.start}–${data.end}`:'period not supplied';
  const basis={sourceId:'mobility',label:data.unit||'Reported movement',source:data.source||'Source not supplied',
    url:/^https?:\/\//.test(data.source||'')?data.source:null,period,coverage:`${data.routes.length} reported origin–destination pairs`};
  if(!validDate(data.end))return {state:'undated',date:null,period,basis,links:[],
    note:`Movement data is loaded without a valid observation period (source: ${data.source||'not supplied'}). It is excluded from analysis until a period is supplied.`};
  if(data.end>asOf)return {state:'after-cutoff',date:data.end,period,basis,links:[],
    note:`Movement observed ${period}, after this reporting cut-off (${asOf}). Excluded from analysis.`};
  const affected=new Set(epi?.affected.filter(z=>z.value>0).map(z=>z.location)||[]);
  const links=[...data.routes].filter(r=>r.origin!==r.destination&&r.value>0&&affected.has(r.origin))
    .sort((a,b)=>b.value-a.value||a.origin.localeCompare(b.origin)||a.destination.localeCompare(b.destination)).slice(0,limit);
  if(!epi)return {state:'no-cases',date:data.end,period,basis,links:[],
    note:`Movement observed ${period} · ${data.unit}. Area-level case data is needed to identify connections from areas reporting cases.`};
  if(!links.length)return {state:'no-links',date:data.end,period,basis,links:[],
    note:`Movement observed ${period} · ${data.unit}. No positive connections originate in an area reporting cases on ${epi.date}.`};
  return {state:'links',date:data.end,period,basis,links,
    note:`Largest reported connections from areas with cases (${period}). Historical movement does not identify infected travellers or establish imported cases.`};
}
export function focusAreas(epi,security,data,asOf) {
  const found=new Map();
  const add=(name,reason)=>{if(!found.has(name))found.set(name,{name,reasons:[]});found.get(name).reasons.push(reason);};
  epi?.burden.filter(z=>z.value>0).slice(0,3).forEach(z=>add(z.location,`High reported burden: ${z.value} cumulative cases (${epi.date}). Review response capacity.`));
  epi?.growth.filter(z=>z.delta>0).slice(0,3).forEach(z=>add(z.location,`Large seven-day reported increase: +${z.delta}. Review surveillance and investigation capacity.`));
  const affected=new Set(epi?.affected.map(z=>z.location)||[]);
  if(security)[...security.byZone].filter(([n,s])=>affected.has(n)&&s.events>0).sort((a,b)=>b[1].events-a[1].events).slice(0,3).forEach(([n,s])=>add(n,`${s.events} recorded security events in an area reporting cases. Review access and surveillance continuity.`));
  if(data&&validDate(data.end)&&data.end<=asOf){
    // Rank individual observed links; do not sum percentages or duplicated cohorts.
    [...data.routes].filter(r=>r.origin!==r.destination&&affected.has(r.origin)&&r.value>0).sort((a,b)=>b.value-a.value).slice(0,3).forEach(r=>add(r.destination,`Receiving connection from ${r.origin}: ${r.value} ${data.unit} (${data.start}–${data.end}). Assess surveillance readiness; historical mobility does not prove exposure.`));
  }
  return [...found.values()];
}
