import { useId, useMemo } from 'react';
import { zoneName, formatValue } from '../../../lib/outbreak/data';
import { placeLabels } from '../../../lib/outbreak/mapInteraction';
import { download } from './Visuals';
import styles from './outbreak.module.css';

export const number=value=>Number.isFinite(value)?formatValue(Math.round(value*100)/100):'Unknown';
export const signed=value=>Number.isFinite(value)?`${value>0?'+':''}${number(value)}`:'Unknown';
export const short=(text,length=80)=>String(text||'').length>length?String(text).slice(0,length-1)+'…':String(text||'');
export function SvgText({text,x,y,width=85,lineHeight=24,maxLines=3,...props}) {
  const lines=[''];
  for(const word of String(text||'').split(/\s+/))for(let i=0;i<word.length;i+=width){
    const part=word.slice(i,i+width),last=lines.length-1;
    if(lines[last].length+part.length+1>width)lines.push(part);else lines[last]+=(lines[last]?' ':'')+part;
  }
  const visible=lines.slice(0,maxLines);if(lines.length>maxLines)visible[maxLines-1]=short(visible[maxLines-1],width-1)+'…';
  return <text x={x} y={y} {...props}><title>{text}</title>{visible.map((line,i)=><tspan key={i} x={x} dy={i?lineHeight:0}>{line}</tspan>)}</text>;
}
export function SlideFrame({svgRef,title,subtitle,asOf,page,total,source,note,children}) {
  return <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" className={styles.reportingSlide} role="img" aria-label={`${title} slide`}>
    <title>{title} — cut-off {asOf}</title><rect width="1600" height="900" fill="white"/>
    <g fontFamily="Arial, sans-serif" fill="#18334b">
      <rect width="1600" height="10" fill="#17576b"/>
      <SvgText x="45" y="65" fontSize="32" fontWeight="700" width={64} maxLines={1} text={title}/>
      <text x="1555" y="60" textAnchor="end" fontSize="19">Cut-off {asOf} · {page+1}/{total}</text>
      <SvgText x="45" y="103" fontSize="18" width={156} maxLines={1} text={subtitle}/>
      {children}
      <line x1="45" x2="1555" y1="793" y2="793" stroke="#cbd9e1"/>
      <SvgText x="45" y="821" fontSize="17" fontWeight="600" width={165} maxLines={1} text={note}/>
      <SvgText x="45" y="854" fontSize="14" lineHeight={18} width={190} maxLines={2} text={`Source: ${source||'Loaded case dataset'}`}/>
    </g>
  </svg>;
}
export function SlideMap({geometry,rows,valueKey='value',categories=null,numberOffset=0,x=45,y=230,width=625,height=480}) {
  const id=useId().replace(/:/g,''),lookup=new Map(rows.map((r,i)=>[r.location,{...r,index:i+1+numberOffset}]));
  const shapes=useMemo(()=>{
    const features=(geometry?.features||[]).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type));
    const rings=f=>f.geometry.type==='Polygon'?f.geometry.coordinates:f.geometry.coordinates.flat();
    const relevant=features.filter(f=>rows.some(r=>r.location===zoneName(f)));
    const points=(relevant.length?relevant:features).flatMap(f=>rings(f).flat());if(!points.length)return [];
    let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
    for(const [a,b] of points){west=Math.min(west,a);east=Math.max(east,a);south=Math.min(south,b);north=Math.max(north,b);}
    const cos=Math.max(.1,Math.cos((south+north)/2*Math.PI/180)),scale=Math.min((width-60)/Math.max(.01,(east-west)*cos),(height-60)/Math.max(.01,north-south));
    const project=([a,b])=>[x+width/2+(a-(west+east)/2)*cos*scale,y+height/2-(b-(south+north)/2)*scale];
    return features.map(f=>{
      const polygon=rings(f),points=polygon.flat().map(project);let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
      for(const [a,b] of points){left=Math.min(left,a);right=Math.max(right,a);top=Math.min(top,b);bottom=Math.max(bottom,b);}
      return {name:zoneName(f),labelWidth:28,center:[(left+right)/2,(top+bottom)/2],path:polygon.map(r=>r.map((p,i)=>`${i?'L':'M'}${project(p).join(',')}`).join(' ')+'Z').join(' ')};
    });
  },[geometry,rows,x,y,width,height]);
  const max=Math.max(1,...rows.map(r=>Math.max(0,r[valueKey]??0)));
  const labels=placeLabels(shapes,[x,y,width,height],'',new Set(rows.map(r=>r.location)),1,[width,height]);
  return <g aria-label="Map linking numbered areas to evidence">
    <defs><clipPath id={id}><rect x={x} y={y} width={width} height={height} rx="8"/></clipPath></defs>
    <rect x={x} y={y} width={width} height={height} rx="8" fill="#f1f5f7"/>
    <g clipPath={`url(#${id})`}>
      {shapes.map(f=>{const row=lookup.get(f.name);return <path key={f.name} d={f.path} fill={row?(categories?categories[row.status]?.color||'#e3e8ed':row[valueKey]===null?'#e3e8ed':`hsl(18 72% ${90-42*Math.sqrt(Math.max(0,row[valueKey]||0)/max)}%)`):'#e8eef1'} fillRule="evenodd" opacity={row?1:.45} stroke="#9aaeba"><title>{f.name}{row?`: ${categories?categories[row.status]?.label:number(row[valueKey])}`:''}</title></path>;})}
      {labels.map(f=><g key={f.name}><line x1={f.center[0]} y1={f.center[1]} y2={f.labelY-6} x2={f.labelX} stroke="#526b7b"/><text x={f.labelX} y={f.labelY} fontSize="19" textAnchor="middle" fontWeight="700" stroke="white" strokeWidth="4" paintOrder="stroke">{lookup.get(f.name).index}</text></g>)}
    </g>
    {!shapes.length&&<text x={x+width/2} y={y+height/2} textAnchor="middle" fontSize="19">Administrative boundaries unavailable</text>}
  </g>;
}
export async function downloadSlidePNG(element,name) {
  if(!element)throw new Error('The slide is not ready to export.');
  const copy=element.cloneNode(true);copy.removeAttribute('class');copy.setAttribute('width','1920');copy.setAttribute('height','1080');
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}));
  try {
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Unable to render the slide.'));img.src=url;});
    const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
    const context=canvas.getContext('2d');if(!context)throw new Error('Image export is unavailable in this browser.');
    context.drawImage(img,0,0,1920,1080);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Unable to create the PNG.');
    download(name,blob,'image/png');
  } finally {URL.revokeObjectURL(url);}
}
