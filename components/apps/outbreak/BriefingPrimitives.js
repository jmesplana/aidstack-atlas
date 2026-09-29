import { useId, useMemo } from 'react';
import { formatValue } from '../../../lib/outbreak/data';
import { placeLabels } from '../../../lib/outbreak/mapInteraction';
import { slideMapGeography } from '../../../lib/outbreak/slideMapGeography';
import countries from '../../../lib/outbreak/countries.json';
import admin1 from '../../../lib/outbreak/admin1.json';
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
export function SlideMap({geometry,rows,valueKey='value',categories=null,numberOffset=0,x=45,y=230,width=625,height=480,fitCountry=null}) {
  const id=useId().replace(/:/g,''),lookup=new Map(rows.map((r,i)=>[r.location,{...r,index:i+1+numberOffset}]));
  const mapHeight=height-24;
  const geography=useMemo(()=>slideMapGeography({geometry,rows,x,y,width,height:mapHeight,countries:countries.features,admin1:admin1.features,fitCountry}),[geometry,rows,x,y,width,mapHeight,fitCountry]);
  const {shapes,contextLabels}=geography;
  const max=Math.max(1,...rows.map(r=>Math.max(0,r[valueKey]??0)));
  const candidates=[...shapes.filter(f=>lookup.has(f.name)),...contextLabels];
  const labels=placeLabels(candidates,[x,y,width,mapHeight],'',new Set(candidates.map(f=>f.name)),1,[width,mapHeight]);
  return <g aria-label="Map linking numbered areas to evidence">
    <defs><clipPath id={id}><rect x={x} y={y} width={width} height={mapHeight} rx="8"/></clipPath></defs>
    <rect x={x} y={y} width={width} height={height} rx="8" fill="#c4d9e8"/>
    <g clipPath={`url(#${id})`}>
      <g aria-label="Country and neighbouring province basemap">
        {geography.countries.map(f=><path key={f.name} data-country={f.name} d={f.path} fill={f.focused?'#ffffff':fitCountry?'#e8ece9':'#f3f1e9'} fillRule="evenodd" stroke={f.focused?'#33483f':'#8c9991'} strokeWidth={f.focused?1.8:1}/>) }
        {geography.provinces.map(f=><path key={f.id} data-context-province={f.name} d={f.path} fill="none" stroke="#a5aaa1" strokeWidth=".65"/>)}
      </g>
      {shapes.map(f=>{const row=lookup.get(f.name);return <path key={f.name} d={f.path} fill={row?(categories?categories[row.status]?.color||'#e3e8ed':row[valueKey]===null?'#e3e8ed':`hsl(18 72% ${90-42*Math.sqrt(Math.max(0,row[valueKey]||0)/max)}%)`):'#e8eef1'} fillRule="evenodd" opacity={row?1:.45} stroke="#9aaeba"><title>{f.name}{row?`: ${categories?categories[row.status]?.label:number(row[valueKey])}`:''}</title></path>;})}
      {labels.filter(f=>!f.kind).map(f=><g key={f.name}><line x1={f.center[0]} y1={f.center[1]} y2={f.labelY-6} x2={f.labelX} stroke="#526b7b"/><text x={f.labelX} y={f.labelY} fontSize="19" textAnchor="middle" fontWeight="700" stroke="white" strokeWidth="4" paintOrder="stroke">{lookup.get(f.name).index}</text></g>)}
      {labels.filter(f=>f.kind).map(f=><text key={f.name} data-context-label={f.kind} x={f.labelX} y={f.labelY} fontSize={f.focused?17:f.kind==='country'&&!fitCountry?15:12} textAnchor="middle" fontWeight={f.kind==='country'?700:400} fill={f.kind==='country'?'#33483f':'#5b625b'} stroke="#fff" strokeWidth="3" paintOrder="stroke"><title>{f.fullName}</title>{f.text}</text>)}
    </g>
    {!!shapes.length&&<g aria-label="Basemap attribution"><rect x={x} y={y+mapHeight} width={width} height="24" fill="#f5f7f8"/><text x={x+8} y={y+height-8} fontSize="10" fill="#52616b">Context: Natural Earth · generalized country / admin-1 boundaries</text></g>}
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
