import { zoneName } from './data.js';

const polygons=f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
const rings=f=>polygons(f).flat();
const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function bounds(points){
  const b=[Infinity,Infinity,-Infinity,-Infinity];
  for(const [x,y] of points){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}
  return b;
}
function inside(point,ring){
  const [x,y]=point;let hit=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [a,b]=ring[i],[c,d]=ring[j];
    if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;
  }
  return hit;
}
const contains=(point,feature)=>polygons(feature).some(([outer,...holes])=>inside(point,outer)&&!holes.some(r=>inside(point,r)));

// Clip before positioning country labels: the source's label point may be far
// outside a border-area map even though a substantial part of the country shows.
export function clipMapRing(ring,box){
  let points=ring;
  for(const [axis,edge,sign] of [[0,box[0],1],[0,box[2],-1],[1,box[1],1],[1,box[3],-1]]){
    const output=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      const aIn=(a[axis]-edge)*sign>=0,bIn=(b[axis]-edge)*sign>=0;
      if(aIn)output.push(a);
      if(aIn!==bIn){const t=(edge-a[axis])/(b[axis]-a[axis]);output.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
    }
    points=output;
  }
  return points;
}
function visibleAnchor(feature,view,project){
  let best=null;
  for(const [outer,...holes] of polygons(feature)){
    const clipped=clipMapRing(outer.map(project),view);if(clipped.length<3)continue;
    const b=bounds(clipped),area=(b[2]-b[0])*(b[3]-b[1]);
    // Pick an interior span rather than a bounding-box centre (which may be sea).
    for(const fraction of [.5,.35,.65]){
      const y=b[1]+(b[3]-b[1])*fraction,crossings=[];
      for(let i=0;i<clipped.length;i++){
        const a=clipped[i],c=clipped[(i+1)%clipped.length];
        if((a[1]>y)!==(c[1]>y))crossings.push(a[0]+(y-a[1])*(c[0]-a[0])/(c[1]-a[1]));
      }
      crossings.sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2){
        const width=crossings[i+1]-crossings[i],center=[(crossings[i]+crossings[i+1])/2,y];
        if(holes.some(r=>inside(center,r.map(project))))continue;
        const score=width*Math.sqrt(area);
        if(!best||score>best.score)best={center,area,width,score};
      }
    }
  }
  return best;
}

export function slideMapGeography({geometry,rows,x=45,y=230,width=625,height=480,countries=[],admin1=[],fitCountry=null}){
  const features=(geometry?.features||[]).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type));
  const selected=new Set(rows.map(r=>r.location)),relevant=features.filter(f=>selected.has(zoneName(f)));
  const country=fitCountry&&countries.find(f=>f.properties.name===fitCountry);
  const targets=country?[country]:relevant.length?relevant:features;
  const points=targets.flatMap(f=>rings(f).flat());
  if(!points.length)return {shapes:[],countries:[],provinces:[],contextLabels:[]};
  const [west,south,east,north]=bounds(points),cos=Math.max(.1,Math.cos((south+north)/2*Math.PI/180));
  const scale=Math.min((width-20)/(Math.max(.01,east-west)*cos*1.04),(height-20)/(Math.max(.01,north-south)*1.04));
  const project=([a,b])=>[x+width/2+(a-(west+east)/2)*cos*scale,y+height/2-(b-(south+north)/2)*scale];
  const unproject=([a,b])=>[(a-x-width/2)/cos/scale+(west+east)/2,(y+height/2-b)/scale+(south+north)/2];
  const view=[x,y,x+width,y+height],geoView=[...unproject([x,y+height]),...unproject([x+width,y])];
  const path=f=>rings(f).map(r=>r.map((p,i)=>`${i?'L':'M'}${project(p).map(n=>n.toFixed(2)).join(',')}`).join(' ')+'Z').join(' ');
  const shape=f=>{
    const b=bounds(rings(f).flat().map(project));
    return {name:zoneName(f),labelWidth:28,center:[(b[0]+b[2])/2,(b[1]+b[3])/2],path:path(f)};
  };
  const visible=f=>overlaps(f.bbox||bounds(rings(f).flat()),geoView);
  const countryShapes=countries.filter(visible).map(f=>({...f.properties,focused:f.properties.name===fitCountry,path:path(f),anchor:visibleAnchor(f,view,project)}));
  const provinces=admin1.filter(visible).map(f=>({...f.properties,path:path(f),anchor:visibleAnchor(f,view,project),feature:f}));
  const names={'Democratic Republic of the Congo':'DR Congo','Republic of the Congo':'Congo','Central African Republic':'Central African Rep.'};
  const countryLabels=countryShapes.filter(f=>f.anchor?.area>1800&&f.anchor.width>50).sort((a,b)=>Number(b.focused)-Number(a.focused)).map(f=>({name:`country:${f.name}`,text:names[f.name]||f.name,fullName:f.name,kind:'country',focused:f.focused,center:f.anchor.center,labelWidth:(names[f.name]||f.name).length*8+12}));
  const provinceLabels=provinces.filter(f=>f.name&&f.anchor?.area>800&&f.anchor.width>30&&!features.some(loaded=>contains(unproject(f.anchor.center),loaded)))
    .sort((a,b)=>b.anchor.area-a.anchor.area).slice(0,24)
    .map(f=>({name:`province:${f.id}`,text:f.name,fullName:`${f.name}, ${f.country}`,kind:'province',center:f.anchor.center,labelWidth:f.name.length*6.5+10}));
  return {shapes:features.filter(visible).map(shape),countries:countryShapes,provinces,contextLabels:[...countryLabels,...provinceLabels],geoView};
}
