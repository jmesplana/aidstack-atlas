// Download the pinned source in lib/outbreak/admin1-source.txt, then run:
// node scripts/build-briefing-geography.mjs /path/to/ne_10m_admin_1_states_provinces.geojson
import fs from 'node:fs';
import simplify from '@turf/simplify';

const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const round=value=>Array.isArray(value)?value.map(round):Number(value.toFixed(4));
const features=source.features.map(feature=>{
  const p=feature.properties;
  const geometry=simplify(feature,{tolerance:.025,highQuality:true}).geometry;
  geometry.coordinates=round(geometry.coordinates);
  const points=geometry.type==='Polygon'?geometry.coordinates.flat():geometry.coordinates.flat(2);
  const bbox=[Infinity,Infinity,-Infinity,-Infinity];
  for(const [x,y] of points){bbox[0]=Math.min(bbox[0],x);bbox[1]=Math.min(bbox[1],y);bbox[2]=Math.max(bbox[2],x);bbox[3]=Math.max(bbox[3],y);}
  return {type:'Feature',bbox,properties:{id:p.adm1_code,name:p.name_en||p.name,country:p.admin,label:round([p.longitude,p.latitude])},geometry};
});
fs.writeFileSync(new URL('../lib/outbreak/admin1.json',import.meta.url),JSON.stringify({type:'FeatureCollection',features})+'\n');
