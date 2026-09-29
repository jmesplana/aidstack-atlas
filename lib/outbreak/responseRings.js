import booleanIntersects from '@turf/boolean-intersects';
import { validDate } from './data.js';
import { observationIndex } from './comparison.js';
import { RESPONSE_RINGS, responseRingSettings } from './responseRingConfig.js';
import { responseProvinceGeography } from './provinceGeography.js';
export { RESPONSE_RINGS, responseRingSettings } from './responseRingConfig.js';
export { responseProvinceGeography } from './provinceGeography.js';

const age = (a,b) => (Date.parse(b)-Date.parse(a))/86400000;

const shapeCache=new WeakMap(),neighbourCache=new WeakMap();
const overlaps=(a,b)=>a[0]<=b[2]&&b[0]<=a[2]&&a[1]<=b[3]&&b[1]<=a[3];
function indexedShape(feature) {
  if(shapeCache.has(feature))return shapeCache.get(feature);
  const bbox=[Infinity,Infinity,-Infinity,-Infinity];
  const polygons=feature.geometry.coordinates.map(coordinates=>{
    const box=[Infinity,Infinity,-Infinity,-Infinity];
    for(const ring of coordinates)for(const [x,y] of ring){
      if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Invalid province coordinates');
      box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],y);box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],y);
    }
    bbox[0]=Math.min(bbox[0],box[0]);bbox[1]=Math.min(bbox[1],box[1]);bbox[2]=Math.max(bbox[2],box[2]);bbox[3]=Math.max(bbox[3],box[3]);
    return {type:'Feature',bbox:box,properties:{},geometry:{type:'Polygon',coordinates,bbox:box}};
  });
  const index={bbox,polygons};shapeCache.set(feature,index);return index;
}

// Eliminate disjoint extents before the exact polygon predicate. Keep holes and
// boundary touches intact, and reuse neighbours while the geometry is unchanged.
export function provinceIntersects(left,right) {
  const cached=neighbourCache.get(left);if(cached?.has(right))return cached.get(right);
  const a=indexedShape(left),b=indexedShape(right);
  const intersects=overlaps(a.bbox,b.bbox)&&a.polygons.some(p=>b.polygons.some(q=>overlaps(p.bbox,q.bbox)&&booleanIntersects(p,q)));
  for(const [from,to] of [[left,right],[right,left]]){
    if(!neighbourCache.has(from))neighbourCache.set(from,new WeakMap());
    neighbourCache.get(from).set(to,intersects);
  }
  return intersects;
}

export function responseRingModel({epi,geometry,boundaryLevel,asOf,settings={},provinceGeography}) {
  const config=responseRingSettings(settings),geo=provinceGeography||responseProvinceGeography(geometry,boundaryLevel);
  const start=validDate(asOf)?new Date(Date.parse(asOf)-config.windowDays*86400000).toISOString().slice(0,10):null;
  const eligible=!!start&&epi?.dataset?.kind==='cumulative'&&epi.dataset.level===boundaryLevel;
  const nonGeographic=new Set((epi?.dataset?.locationMatching?.locations||[]).filter(r=>r.status==='Non-geographic source total').map(r=>r.source));
  const records=eligible?(epi.dataset.records||[]).filter(r=>!nonGeographic.has(r.location)&&validDate(r.date)&&r.date>=start&&r.date<=asOf):[];
  const valueAt=observationIndex(records),histories=new Map();
  for(const r of records){if(!histories.has(r.location))histories.set(r.location,new Set());histories.get(r.location).add(r.date);}
  const evidence=new Map([...geo.members.keys()].map(name=>{
    const dates=[...(histories.get(name)||[])].sort(),values=dates.map(d=>valueAt(name,d));
    const valid=v=>Number.isFinite(v)&&v>=0;
    const known=values.filter(valid);
    const revision=known.some((v,i)=>i&&v<known[i-1]);
    const fresh=dates.length&&age(dates.at(-1),asOf)<=8&&valid(values.at(-1));
    const increase=!revision&&fresh&&values.some((v,i)=>i&&valid(v)&&valid(values[i-1])&&v>values[i-1]&&age(dates[i-1],dates[i])<=8);
    const complete=eligible&&dates[0]===start&&dates.at(-1)===asOf&&!revision&&values.every(valid)&&dates.every((d,i)=>!i||age(dates[i-1],d)<=8);
    return [name,{increase,complete}];
  }));
  const overrides=new Map();
  for(const r of config.overrides.filter(r=>r.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date)))overrides.set(r.province,r);
  const rows=geo.features.map(f=>{
    const province=f.properties.nom,locations=[...geo.members].filter(([,p])=>p===province).map(([n])=>n);
    const rising=locations.filter(n=>evidence.get(n).increase),complete=locations.every(n=>evidence.get(n).complete);
    const override=overrides.get(province),manual=override&&override.ring!=='auto';
    return {location:province,locations,rising,complete,override:manual?override:null,status:manual?override.ring:rising.length?'red':'unknown',
      reason:manual?`Coordinator assignment effective ${override.date}${override.note?`: ${override.note}`:''}`:rising.length?`Recent reported increases in ${rising.join(', ')}${complete?'':'; full-window reporting incomplete'}`:'Insufficient comparable reports across the full window'};
  }).sort((a,b)=>a.location.localeCompare(b.location));
  const shapes=new Map(geo.features.map(f=>[f.properties.nom,f]));
  const red=rows.filter(r=>r.status==='red');
  for(const row of rows) {
    if(row.override||row.status==='red')continue;
    const shape=shapes.get(row.location);
    const mapped=shape.geometry.coordinates.length>0&&red.every(r=>shapes.get(r.location).geometry.coordinates.length>0);
    let neighbours=[],topologyValid=mapped;
    if(mapped)try{neighbours=red.filter(r=>provinceIntersects(shape,shapes.get(r.location))).map(r=>r.location);}catch{topologyValid=false;}
    if(neighbours.length){row.status='orange';row.reason=`Borders / intersects red province: ${neighbours.join(', ')}${row.complete?'':'; case reporting incomplete'}`;}
    else if(row.complete&&topologyValid){row.status='yellow';row.reason='Complete unchanged reports across the window; no mapped border with a red province';}
  }
  return {rows,geometry:{type:'FeatureCollection',features:geo.features.filter(f=>f.geometry.coordinates.length)},start,asOf,windowDays:config.windowDays,
    excluded:geo.excluded,unmatched:[...histories.keys()].filter(n=>!geo.members.has(n)).length,
    counts:Object.fromEntries(Object.keys(RESPONSE_RINGS).map(ring=>[ring,rows.filter(r=>r.status===ring).length]))};
}
