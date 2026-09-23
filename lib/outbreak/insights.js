import { observationIndex, comparisonBaseline } from './comparison.js';
import { areaActivity } from './areaHistory.js';
import booleanIntersects from '@turf/boolean-intersects';
import { METRICS, validDate, numeric, formatValue } from './data.js';

export const shiftDate=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
export function embeddedEpidemiology(geometry,level='health_zone') {
  if(!geometry||['national','site'].includes(level))return [];
  return detectGeoIndicators(geometry,'9999-12-31').filter(layer=>{
    const key=layer.id.split('.').at(-1);
    return ['cumulative_confirmed_cases','cumulative_confirmed_deaths','new_confirmed_cases'].includes(key)&&!/national|provincial/i.test(layer.id);
  }).map(layer=>{
    const metric=layer.id.split('.').at(-1),definition=METRICS.find(m=>m[0]===metric);
    const id=`geo:${layer.id}`,label=definition[1],kind=definition[3],issues=[];
    const records=layer.records.filter(r=>{if(!validDate(r.date)){issues.push({location:r.location,message:'Reporting date absent. Map this field with an explicit date in Data & uploads.'});return false;}return true;}).map(r=>({...r,value:r.value!==null&&Number.isSafeInteger(r.value)?r.value:null,sourceId:id,metric:label,kind,level,unit:'people'}));
    return {id,metricId:metric,purpose:metric==='cumulative_confirmed_cases'?'cases':'other',label,kind,level,unit:'people',status:'ready',origin:'boundary',source:`Main-app GeoJSON: ${layer.id}`,records,issues};
  }).filter(d=>d.records.length);
}
function fieldDate(path,parent) {
  const supplied=[parent?._date,parent?.date,parent?.report_date].find(validDate);
  if(supplied)return {date:supplied,dateBasis:'source metadata'};
  const match=path.match(/(?:^|_)(20\d{6})(?:\.|$)/);
  if(match) {const d=match[1];const date=`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;if(validDate(date))return {date,dateBasis:'field-name date'};}
  return {date:null,dateBasis:'date not supplied'};
}
export function detectGeoIndicators(geometry,asOf) {
  const found=new Map();
  function visit(value,path,feature,depth=0,parent=null) {
    if(depth>6)return;
    if(value&&typeof value==='object'&&!Array.isArray(value)) {
      Object.entries(value).forEach(([key,v])=>{if(!key.startsWith('_'))visit(v,path?`${path}.${key}`:key,feature,depth+1,value);});return;
    }
    if(/^(latitude|longitude|date|report_date|source|unit)$/i.test(path.split('.').at(-1)))return;
    let number;try{number=numeric(value);}catch{return;}
    if(number===null && !/case|death|flow|subscriber|count|population/i.test(path))return;
    const timing=fieldDate(path,parent);if(timing.date&&timing.date>asOf)return;
    const direction=/outflow/i.test(path)?'outflow':/inflow/i.test(path)?'inflow':'other';
    if(!found.has(path))found.set(path,{id:path,label:path.split('.').filter((part,i,arr)=>i===0||part!==arr[i-1]).join(' / '),direction,...timing,unit:String(parent?._unit||'source indicator units'),records:[]});
    found.get(path).records.push({location:feature.properties.nom,value:number,date:timing.date||'Undated'});
  }
  geometry?.features.forEach(f=>visit(f.properties,'',f));
  return [...found.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.label.localeCompare(b.label));
}
export function detectMobility(geometry,asOf) { return detectGeoIndicators(geometry,asOf).filter(layer=>/flowminder|inflow|outflow/i.test(layer.id)); }
export function describeMobility(layers,catalogue) {
  return layers.map(layer=>{
    const definition=catalogue?.products?.find(p=>p.type==='vector'&&layer.id.startsWith(`${p.namespace}.`)&&layer.id.split('.').at(-1)===p.metric);
    return definition?{...layer,definition,unit:definition.unit,label:`${definition.product==='cohort_presence'?'Average cohort presence':'Cohort destination share'} — ${definition.metric.replace(/_/g,' ')}`} : layer;
  });
}
function bounds(geometry) {
  const points=geometry.type==='Polygon'?geometry.coordinates.flat():geometry.coordinates.flat(2);
  const b=[Infinity,Infinity,-Infinity,-Infinity];
  points.forEach(([x,y])=>{b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);});return b;
}
export function spatialIndex(geometry) {
  return (geometry?.features||[]).map(f=>({feature:f,bounds:bounds(f.geometry)}));
}
export function locatePoint(index,longitude,latitude) {
  if(longitude===null||latitude===null||longitude===''||latitude===''||longitude===undefined||latitude===undefined)return {location:null,status:'invalid coordinates'};
  const x=Number(longitude),y=Number(latitude);
  if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>180||Math.abs(y)>90)return {location:null,status:'invalid coordinates'};
  const point={type:'Point',coordinates:[x,y]};
  const matches=index.filter(({bounds:b,feature})=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]&&booleanIntersects(point,feature));
  return matches.length===1?{location:matches[0].feature.properties.nom,status:'matched'}:{location:null,status:matches.length?'ambiguous boundary':'outside boundaries'};
}
export function miningOverlap(mines,index,asOf) {
  if(!mines)return null;
  const byZone=new Map(),issues=[];
  const eligible=mines.filter(m=>m.date<=asOf);
  for(const mine of eligible) {
    const join=locatePoint(index,mine.longitude,mine.latitude);
    if(!join.location){issues.push({id:mine.id,status:join.status});continue;}
    byZone.set(join.location,(byZone.get(join.location)||0)+1);
  }
  return {byZone,issues,eligible:eligible.length,matched:[...byZone.values()].reduce((a,b)=>a+b,0)};
}
export function securityRecords(events) {
  const byId=new Map(),issues=[];
  events.forEach((event,i)=>{
    const id=String(event.event_id_cnty||event.event_id||event.id||'');
    const rawDate=String(event.event_date||'');
    const date=/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(rawDate)?rawDate.slice(0,10):'';
    if(!id||!validDate(date)){issues.push({row:i+1,message:'Event ID or unambiguous ISO event date missing.'});return;}
    let fatalities=null;try{fatalities=numeric(event.fatalities);if(fatalities!==null&&!Number.isSafeInteger(fatalities))throw new Error();}catch{issues.push({id,message:'Invalid fatality estimate; retained as missing.'});fatalities=null;}
    const value={id,date,latitude:event.latitude,longitude:event.longitude,fatalities,actor1:String(event.actor1||''),type:String(event.event_type||''),location:String(event.location||''),country:String(event.country||'')};
    if(byId.has(id)) {if(JSON.stringify(byId.get(id))!==JSON.stringify(value)){byId.set(id,null);issues.push({id,message:'Conflicting duplicate event ID excluded.'});}}
    else byId.set(id,value);
  });
  return {records:[...byId.values()].filter(Boolean),issues};
}
export function securityOverlap(events,index,start,end) {
  const cleaned=securityRecords(events),records=cleaned.records.filter(e=>e.date>=start&&e.date<=end),byZone=new Map(),unmatched=[];
  for(const e of records) {
    const join=locatePoint(index,e.longitude,e.latitude);
    if(!join.location){unmatched.push({id:e.id,status:join.status});continue;}
    const z=byZone.get(join.location)||{events:0,fatalities:0,missingFatalities:0,actors:new Map()};
    z.events++;if(e.fatalities===null)z.missingFatalities++;else z.fatalities+=e.fatalities;
    if(e.actor1)z.actors.set(e.actor1,(z.actors.get(e.actor1)||0)+1);
    byZone.set(join.location,z);
  }
  return {records,byZone,unmatched,issues:cleaned.issues,start,end,reportedFatalities:records.reduce((sum,r)=>sum+(r.fatalities??0),0),missingFatalities:records.filter(r=>r.fatalities===null).length};
}
export function epidemiology(datasets,geometry,asOf,preferredId,boundaryLevel) {
  const eligible=datasets.filter(d=>d.status==='ready'&&d.purpose==='cases'&&d.kind==='cumulative'&&!['national','site'].includes(d.level));
  const dataset=eligible.find(d=>d.id===preferredId)||eligible[0]||datasets.find(d=>d.metricId==='cumulative_confirmed_cases');
  if(!dataset)return null;
  const dates=[...new Set(dataset.records.filter(r=>r.date<=asOf).map(r=>r.date))].sort();
  const date=dates.at(-1);if(!date)return null;
  const valueAt=observationIndex(dataset.records);
  const {start:baseline,days:comparisonDays}=comparisonBaseline(valueAt,dataset.records.filter(r=>r.date===date).map(r=>r.location),date);
  const features=new Map((!boundaryLevel||dataset.level===boundaryLevel?geometry?.features||[]:[]).map(f=>[f.properties.nom,f]));
  const zones=dataset.records.filter(r=>r.date===date).map(r=>{
    const prior=valueAt(r.location,baseline),feature=features.get(r.location);
    const delta=r.value!==null&&prior!==null&&prior!==undefined?r.value-prior:null;
    return {location:r.location,value:r.value,previous:prior??null,delta,percent:delta!==null&&prior>0?delta/prior*100:null,province:feature?.properties.province||null,matched:!!feature,date,baseline};
  });
  const provinces=new Map();
  for(const z of zones) {
    if(!z.province)continue;
    const p=provinces.get(z.province)||{location:z.province,value:0,previous:0,missing:0,missingBaseline:0,count:0};
    p.count++;if(z.value===null)p.missing++;else p.value+=z.value;
    if(z.previous===null)p.missingBaseline++;else p.previous+=z.previous;
    provinces.set(z.province,p);
  }
  const currentNames=new Set(zones.map(z=>z.location));
  const absent=new Set(dataset.records.filter(r=>r.date<=asOf&&!currentNames.has(r.location)).map(r=>r.location)).size;
  const total=zones.reduce((sum,z)=>sum+(z.value??0),0);
  return {dataset,date,baseline,comparisonDays,activity:dataset.level==='health_zone'?areaActivity(dataset,date,baseline):null,zones,total,absent,affected:zones.filter(z=>z.value>0),missing:zones.filter(z=>z.value===null).length,
    unmatched:zones.filter(z=>!features.has(z.location)).length,
    provinces:[...provinces.values()].map(p=>({...p,delta:!p.missing&&!p.missingBaseline?p.value-p.previous:null,percent:!p.missing&&!p.missingBaseline&&p.previous>0?(p.value-p.previous)/p.previous*100:null})).sort((a,b)=>b.value-a.value),
    burden:zones.filter(z=>z.value!==null).sort((a,b)=>b.value-a.value||a.location.localeCompare(b.location)),
    growth:zones.filter(z=>z.delta!==null).sort((a,b)=>b.delta-a.delta||a.location.localeCompare(b.location))};
}
export function integratedEvidence(epi,mining,security,mobility,hasGeometry) {
  const facts=[];
  if(epi) {
    const source=epi.dataset.source||epi.dataset.url;
    facts.push({id:'integrated:burden',sourceId:epi.dataset.id,source,text:`On ${epi.date}, ${epi.affected.length} administrative areas in the loaded series reported positive cumulative confirmed case totals. The sum of reported area-level values was ${formatValue(epi.total)}; ${epi.missing} zones on that date had missing values. ${epi.absent} previously observed areas have no record on that date. This is an area-level sum, not a replacement for the national total.`});
    if(epi.burden.length)facts.push({id:'integrated:hotspots',sourceId:epi.dataset.id,source,text:`The largest reported cumulative burdens on ${epi.date} were ${epi.burden.filter(z=>z.value>0).slice(0,4).map(z=>`${z.location} (${formatValue(z.value)})`).join(', ')||'none with positive values'}.`});
    const rising=epi.growth.filter(z=>z.delta>0);
    if(rising.length)facts.push({id:'integrated:growth',sourceId:epi.dataset.id,source,text:`Between ${epi.baseline} and ${epi.date}, the largest increases in reported cumulative totals were ${rising.slice(0,4).map(z=>`${z.location} (+${formatValue(z.delta)})`).join(', ')}. These are changes in reported totals and may include revisions; they are not an onset-based incidence measure.`});
    else facts.push({id:'integrated:growth-gap',sourceId:epi.dataset.id,source,text:epi.growth.length?`No positive change was observed among ${epi.growth.length} administrative areas with comparable values on ${epi.baseline} and ${epi.date}.`:`A seven-day comparison is unavailable: no administrative areas have valid paired observations on ${epi.baseline} and ${epi.date}. Load the daily case series to evaluate change.`});
    if(epi.provinces.length) {
      const p=epi.provinces[0];
      facts.push({id:'integrated:province',sourceId:epi.dataset.id,source:`${source}; uploaded province attributes`,text:`${p.location} has the largest sum among mapped provinces: ${formatValue(p.value)} reported cumulative cases across ${p.count} area-level records on ${epi.date}${p.delta!==null?`, a change of ${p.delta>=0?'+':''}${formatValue(p.delta)} since ${epi.baseline}`:''}. ${epi.unmatched} area-level records did not match the uploaded boundaries.`});
    }
  }
  if(mobility) {
    const top=mobility.records.filter(r=>r.value!==null).sort((a,b)=>b.value-a.value).slice(0,4);
    facts.push({id:'integrated:mobility',sourceId:'flowminder',source:`Uploaded GeoJSON: ${mobility.id}`,text:`The selected Flowminder ${mobility.direction==='other'?'mobility':mobility.direction} indicator (${mobility.label}; ${mobility.date||'date not supplied'}) is largest in ${top.map(r=>`${r.location} (${formatValue(r.value)})`).join(', ')}. Values remain in source units; they are not interpreted as traveller counts or evidence of transmission.`});
  }
  if(epi&&mining&&hasGeometry) {
    const affected=epi.affected.filter(z=>z.matched).map(z=>({...z,mines:mining.byZone.get(z.location)||0})).sort((a,b)=>b.mines-a.mines);
    facts.push({id:'integrated:mining',sourceId:'ipis',source:'IPIS latest documented visits, spatially joined to uploaded boundaries',text:`${affected.reduce((s,z)=>s+z.mines,0)} unique documented IPIS mining sites fall within ${affected.length} matched administrative areas reporting positive cumulative totals on ${epi.date}; ${epi.affected.length-affected.length} affected area names did not match. The largest overlaps are ${affected.filter(z=>z.mines>0).slice(0,4).map(z=>`${z.location} (${z.mines} sites)`).join(', ')||'none in the loaded geography'}. Historical visits do not confirm current mining activity or transmission.`});
  }
  if(security) {
    facts.push({id:'integrated:security',sourceId:'acled',source:'Main-app ACLED records',text:`The loaded ACLED data contains ${security.records.length} deduplicated, valid events dated ${security.start}–${security.end}, with ${security.reportedFatalities} reported fatalities in records containing an estimate; ${security.missingFatalities} events have missing estimates. This is the loaded data scope, not a claim of complete national coverage.`});
    if(epi&&hasGeometry) {
      const overlap=epi.affected.map(z=>({...z,security:security.byZone.get(z.location)})).filter(z=>z.security?.events).sort((a,b)=>b.security.events-a.security.events);
      facts.push({id:'integrated:security-overlap',sourceId:'acled',source:`Main-app ACLED; ${epi.dataset.source||epi.dataset.url}; uploaded boundaries`,text:`${overlap.reduce((s,z)=>s+z.security.events,0)} security events fall inside administrative areas reporting positive cumulative case totals on ${epi.date}. The largest event overlaps are ${overlap.slice(0,3).map(z=>`${z.location} (${z.security.events} events; ${z.security.fatalities} reported fatalities${z.security.missingFatalities?`, ${z.security.missingFatalities} estimates missing`:''})`).join(', ')||'none in the loaded geography'}. Review access and surveillance continuity in these locations; spatial overlap does not establish a causal relationship.`});
    }
  }
  return facts;
}
