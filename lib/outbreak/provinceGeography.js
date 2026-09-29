import { zoneName } from './data.js';

// Group only explicit, unique administrative assignments. Reuse zone polygons
// as a province MultiPolygon; no inferred province names or fuzzy joins.
export function responseProvinceGeography(geometry, boundaryLevel) {
  const assignments=new Map(),groups=new Map();
  if (!['health_zone','province'].includes(boundaryLevel)) return {features:[],members:new Map(),excluded:0};
  for (const f of geometry?.features||[]) {
    const name=zoneName(f),province=boundaryLevel==='province'?name:f.properties?.province;
    if(!name)continue;
    const values=assignments.get(name)||new Set();values.add(province||'');assignments.set(name,values);
  }
  const members=new Map();let excluded=0;
  for(const [name,values] of assignments) {
    const province=[...values][0];if(values.size!==1||!province){excluded++;continue;}
    members.set(name,province);
    if(!groups.has(province))groups.set(province,{type:'Feature',properties:{nom:province},geometry:{type:'MultiPolygon',coordinates:[]}});
  }
  for(const f of geometry?.features||[]) {
    const group=groups.get(members.get(zoneName(f)));if(!group)continue;
    if(f.geometry?.type==='Polygon')group.geometry.coordinates.push(f.geometry.coordinates);
    if(f.geometry?.type==='MultiPolygon')group.geometry.coordinates.push(...f.geometry.coordinates);
  }
  return {type:'FeatureCollection',features:[...groups.values()],members,excluded};
}

