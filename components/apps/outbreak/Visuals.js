import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {zoomView,placeLabels} from '../../../lib/outbreak/mapInteraction';
import { zoneName, formatValue, epiWeek } from '../../../lib/outbreak/data';
import styles from './outbreak.module.css';
import { deltaPresentation } from '../../../lib/outbreak/response';

export function download(name, content, type='text/plain') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function briefingHTML(element, hiddenClass) {
  const copy=element.cloneNode(true);
  copy.querySelectorAll('[data-source-register]').forEach(node=>node.setAttribute('open',''));
  copy.querySelectorAll(`button,.${hiddenClass},[data-print-hide]`).forEach(node=>node.remove());
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Outbreak operational briefing</title><style>body{font:14px/1.5 Arial,sans-serif;color:#18324b;max-width:1000px;margin:30px auto;padding:0 20px}h2{font-size:26px}h3{margin-top:24px}p,small{overflow-wrap:anywhere}small{display:block;color:#526b80;font-size:11px}svg{width:100%;max-height:380px;break-inside:avoid}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:10px;text-align:left;border-bottom:1px solid #ccd8e3}th{background:#eaf0f5}@page{size:A4;margin:15mm}@media print{body{margin:0;padding:0}h3{break-after:avoid}tr{break-inside:avoid}}</style></head><body>'+copy.innerHTML+'</body></html>';
}
export function printBriefing(html) {
  const frame=document.createElement('iframe');
  frame.title='Printable outbreak briefing';
  frame.style.cssText='position:fixed;width:0;height:0;border:0;';
  frame.onload=()=>{
    frame.contentWindow.onafterprint=()=>frame.remove();
    frame.contentWindow.focus();frame.contentWindow.print();
    setTimeout(()=>frame.remove(),60000);
  };
  frame.srcdoc=html;document.body.appendChild(frame);
}
function exportSVG(ref,name) {
  const copy=ref.current.cloneNode(true);
  copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
  download(name,new XMLSerializer().serializeToString(copy),'image/svg+xml');
}
export function OutbreakMap({ geometry, rows, level, kind, unit, boundaryLevel, mines=[], events=[], hazards=[], sites=[], selected, onSelect, label, asOf, source, focusNames=[], routes=[], routeDirection='outflow', overlayCaption='' }) {
  const routeColor=routeDirection==='inflow'?'#c96a37':'#176f89';
  const ref=useRef(null),mapRef=useRef(null),drag=useRef(null),pointers=useRef(new Map()),liveView=useRef(null);
  const arrowId=useId().replace(/:/g, "");
  const [viewport,setViewport]=useState(null),[labels,setLabels]=useState('priority'),[renderScale,setRenderScale]=useState(1);
  const shapes=useMemo(()=> {
    if(!geometry?.features.length) return null;
    const features=geometry.features;
    const measure=document.createElement('canvas').getContext('2d');if(measure)measure.font='600 12px sans-serif';
    const all=features.flatMap(f=>f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2));
    let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
    all.forEach(([x,y])=>{west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);});
    const cos=Math.max(.1,Math.cos((south+north)/2*Math.PI/180));
    const scale=Math.min(800/(Math.max(.01,east-west)*cos),390/Math.max(.01,north-south));
    const project=([x,y])=>[50+(x-west)*cos*scale,25+(north-y)*scale];
    const path=f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(p=>p.map(r=>r.map((c,i)=>`${i?'L':'M'}${project(c).map(n=>n.toFixed(3)).join(',')}`).join(' ')+'Z').join(' ')).join(' ');
    return {features:features.map(f=>{
      const rings=f.geometry.type==='Polygon'?f.geometry.coordinates:f.geometry.coordinates.flat();
      const coordinates=rings.flat().map(project);
      const xs=coordinates.map(c=>c[0]),ys=coordinates.map(c=>c[1]);
      const b=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
      return {name:zoneName(f),labelWidth:measure?measure.measureText(zoneName(f)).width+12:undefined,path:path(f),bounds:b,center:[(b[0]+b[2])/2,(b[1]+b[3])/2]};
    }),project,west,east,south,north};
  },[geometry]);
  const automatic=useMemo(()=>{
    const targets=shapes?.features.filter(f=>focusNames.includes(f.name))||[];
    if(!targets.length)return [0,0,900,440];
    const left=Math.min(...targets.map(f=>f.bounds[0])),top=Math.min(...targets.map(f=>f.bounds[1]));
    const right=Math.max(...targets.map(f=>f.bounds[2])),bottom=Math.max(...targets.map(f=>f.bounds[3]));
    const w=Math.max(right-left,(bottom-top)*900/440,15)*1.2,h=w*440/900;
    return [(left+right-w)/2,(top+bottom-h)/2,w,h];
  },[shapes,focusNames.join('|')]);
  useEffect(()=>setViewport(null),[geometry,label]);
  const view=viewport||automatic,zoom=900/view[2];
  const mapHeight=overlayCaption?615:590;
  liveView.current=view;
  function screenPoint(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(ref.current.getScreenCTM().inverse());return [p.x,p.y-66];}
  function zoomBy(factor){setViewport(zoomView(liveView.current,factor));}
  useEffect(()=>{
    const node=mapRef.current;if(!node)return;
    const wheel=e=>{e.preventDefault();e.stopPropagation();setViewport(zoomView(liveView.current,Math.exp(Math.max(-100,Math.min(100,e.deltaY))*.004),screenPoint(e)));};
    node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);
  },[!!shapes]);
  useEffect(()=>{const node=ref.current;if(!node)return;const observer=new ResizeObserver(()=>{const b=node.getBoundingClientRect();setRenderScale(Math.max(.1,Math.min(b.width/900,b.height/mapHeight)));});observer.observe(node);return()=>observer.disconnect();},[!!shapes,mapHeight]);
  function startDrag(e){
    if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();
    const point=screenPoint(e);pointers.current.set(e.pointerId,point);e.currentTarget.setPointerCapture(e.pointerId);
    const pair=[...pointers.current.values()];
    drag.current={point,view:[...liveView.current],name:e.target.getAttribute('data-admin'),moved:pair.length>1,
      distance:pair.length===2?Math.hypot(pair[1][0]-pair[0][0],pair[1][1]-pair[0][1]):null,
      middle:pair.length===2?[(pair[0][0]+pair[1][0])/2,(pair[0][1]+pair[1][1])/2]:null};
  }
  function moveDrag(e){
    if(!pointers.current.has(e.pointerId)||!drag.current)return;
    const point=screenPoint(e);pointers.current.set(e.pointerId,point);const d=drag.current,pair=[...pointers.current.values()];
    if(pair.length===2&&d.distance){
      const distance=Math.hypot(pair[1][0]-pair[0][0],pair[1][1]-pair[0][1]);
      const middle=[(pair[0][0]+pair[1][0])/2,(pair[0][1]+pair[1][1])/2];
      const next=zoomView(d.view,d.distance/Math.max(1,distance),d.middle);
      next[0]-=(middle[0]-d.middle[0])*next[2]/900;next[1]-=(middle[1]-d.middle[1])*next[3]/440;
      d.moved=true;setViewport(next);return;
    }
    const dx=point[0]-d.point[0],dy=point[1]-d.point[1];
    if(Math.abs(dx)+Math.abs(dy)>3)d.moved=true;
    if(d.moved)setViewport([d.view[0]-dx*d.view[2]/900,d.view[1]-dy*d.view[3]/440,d.view[2],d.view[3]]);
  }
  function endDrag(e){
    const d=drag.current;pointers.current.delete(e.pointerId);
    if(d&&!d.moved&&d.name&&e.type!=='pointercancel')onSelect?.(d.name);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    const point=[...pointers.current.values()][0];drag.current=point?{point,view:[...liveView.current],moved:true}:null;
  }
  if(!shapes)return <p>Upload administrative polygons in the main app to enable the map. Data analysis and briefing do not require boundaries.</p>;
  const values=new Map(level===boundaryLevel?rows.map(r=>[r.location,r]):[]),mappedNames=new Set(shapes.features.map(f=>f.name));
  const known=[...values.values()].filter(r=>r.value!==null&&mappedNames.has(r.location));
  const max=Math.max(0,...known.map(r=>Math.abs(r.value)));
  const fill=r=>!r||r.value===null?'#e3e8ed':r.value===0?'#fff':r.value<0?'#3283b4':`hsl(12 76% ${88-46*Math.sqrt(r.value/Math.max(.000001,max))}%)`;
  const priority=new Set([...known].sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,8).map(r=>r.location));
  if(selected)priority.add(selected);
  const allowed=labels==='none'?new Set():labels==='all'?new Set(shapes.features.map(f=>f.name)):priority;
  const visibleLabels=placeLabels(shapes.features,view,selected,allowed,renderScale);
  const point=(p)=>p.longitude!==''&&p.latitude!==''&&p.longitude!=null&&p.latitude!=null&&Number.isFinite(Number(p.longitude))&&Number.isFinite(Number(p.latitude))&&p.longitude>=shapes.west&&p.longitude<=shapes.east&&p.latitude>=shapes.south&&p.latitude<=shapes.north;
  return <div>
    <div data-print-hide="true" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',margin:'12px 0'}}>
      <button type="button" aria-label={`Zoom in ${label} map`} onClick={()=>zoomBy(.65)}>＋</button>
      <button type="button" aria-label={`Zoom out ${label} map`} onClick={()=>zoomBy(1.5)}>−</button>
      <button type="button" onClick={()=>setViewport(null)}>Focus relevant areas</button>
      <button type="button" onClick={()=>setViewport([0,0,900,440])}>All boundaries</button>
      <label>Admin labels<select aria-label={`Admin labels for ${label}`} value={labels} onChange={e=>setLabels(e.target.value)}><option value="priority">Leading areas</option><option value="all">All areas (avoid overlap)</option><option value="none">Hide labels</option></select></label>
      <span style={{fontSize:12,color:'#597086'}}>Drag to pan · scroll or pinch to zoom · arrows to pan when focused</span>
    </div>
    <svg ref={ref} viewBox={`0 0 900 ${mapHeight}`} role="img" aria-label={`${label} map`} style={{width:'100%',maxHeight:'65vh',userSelect:'none',background:'#f8fafc',border:'1px solid #dce5ed',borderRadius:8}}>
      <title>{label} — reporting cut-off {asOf}</title><rect width="900" height={mapHeight} fill="#fff"/>
      <text x="22" y="28" fontSize="19" fontWeight="bold" fontFamily="sans-serif" fill="#18334b">{label.slice(0,78)}</text>
      <text x="22" y="50" fontSize="12" fontFamily="sans-serif" fill="#536c81">{boundaryLevel} · {kind} · {unit} · cut-off {asOf}; observation dates may differ</text>
      <svg ref={mapRef} role="group" tabIndex="0" aria-label={`Pan and zoom ${label}`} x="0" y="66" width="900" height="440" viewBox={view.join(' ')} data-map-viewport="true" style={{touchAction:'none',cursor:'grab'}}
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        onDoubleClick={e=>{e.preventDefault();setViewport(zoomView(view,.65,screenPoint(e)));}}
        onKeyDown={e=>{const shift={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]}[e.key];if(shift){e.preventDefault();setViewport([view[0]+shift[0]*view[2],view[1]+shift[1]*view[3],view[2],view[3]]);}else if(['+','=','-','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')setViewport(null);else zoomBy(e.key==='-'?1.25:.8);}}}>
        <rect x="-10000" y="-10000" width="20000" height="20000" fill="#f3f6f9"/>
        {shapes.features.map(f=><path key={f.name} data-admin={f.name} d={f.path} fill={fill(values.get(f.name))} fillRule="evenodd" stroke={selected===f.name?'#113d64':'#9aaaba'} strokeWidth={selected===f.name?2:.65} vectorEffect="non-scaling-stroke"><title>{f.name}: {values.has(f.name)?`${values.get(f.name).value??'No data'} ${unit||''} (${values.get(f.name).date})`:'No matched observation'}</title></path>)}
        <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill={routeColor}/></marker></defs>
        {routes.map((r,i)=>{
          const a=shapes.features.find(f=>f.name===r.origin)?.center,b=shapes.features.find(f=>f.name===r.destination)?.center;
          if(!a||!b||r.value===null||r.value<=0)return null;
          const dx=b[0]-a[0],dy=b[1]-a[1],cx=(a[0]+b[0])/2-dy*.22,cy=(a[1]+b[1])/2+dx*.22;
          return <path key={i} data-mobility-route={`${r.origin} → ${r.destination}`} d={`M${a.join(',')} Q${cx},${cy} ${b.join(',')}`} fill="none" stroke={routeColor} strokeWidth={2/zoom} opacity=".8" markerEnd={`url(#${arrowId})`}><title>{r.origin} → {r.destination}: {formatValue(r.value)} {unit}. Schematic connection, not a travelled route.</title></path>;
        })}
        {mines.filter(point).map(m=>{const [cx,cy]=shapes.project([Number(m.longitude),Number(m.latitude)]);return <circle data-ipis-site={m.id} key={m.id} cx={cx} cy={cy} r={2.3/zoom} fill="#148998" stroke="white" strokeWidth={.4/zoom}><title>{m.name} — IPIS visit {m.date}; historical observation</title></circle>;})}
        {events.filter(point).map(e=>{const [cx,cy]=shapes.project([Number(e.longitude),Number(e.latitude)]);return <path data-acled-event={e.id} key={e.id} d={`M${cx},${cy-4/zoom}l${4/zoom},${4/zoom}l${-4/zoom},${4/zoom}l${-4/zoom},${-4/zoom}Z`} fill="#71317f" stroke="white" strokeWidth={.5/zoom}><title>ACLED: {e.date}, {e.type}; {e.fatalities??'unknown'} reported fatalities</title></path>;})}
        {hazards.filter(point).map(h=>{const [cx,cy]=shapes.project([h.longitude,h.latitude]);return <path key={h.id} d={`M${cx},${cy-5/zoom}l${5/zoom},${9/zoom}h${-10/zoom}Z`} fill="#d29100" stroke="white" strokeWidth={.6/zoom}><title>GDACS: {h.title}; published {h.date}. Alert centre, not affected footprint.</title></path>;})}
        {sites.filter(point).map((p,i)=>{const [x,y]=shapes.project([Number(p.longitude),Number(p.latitude)]);return <rect key={p.id||i} x={x-2/zoom} y={y-2/zoom} width={4/zoom} height={4/zoom} fill="#264b81"><title>{p.name||'Uploaded site'} — location only; capacity not verified</title></rect>;})}
        {visibleLabels.map(f=><g key={f.name}><line x1={f.center[0]} y1={f.center[1]} x2={f.labelX} y2={f.labelY} stroke="#718598" strokeWidth={.6/zoom} pointerEvents="none"/><text data-admin={f.name} x={f.labelX} y={f.labelY} fontFamily="sans-serif" fontSize={12/zoom/renderScale} fontWeight="600" fill="#153b55" stroke="white" strokeWidth={3/zoom/renderScale} paintOrder="stroke" textAnchor="middle">{f.name}</text></g>)}
      </svg>
      <rect x="22" y="520" width="12" height="12" fill="#e3e8ed"/><text x="40" y="531" fontFamily="sans-serif" fontSize="12">No data</text>
      <rect x="122" y="520" width="12" height="12" fill="white" stroke="#9aaaba"/><text x="140" y="531" fontFamily="sans-serif" fontSize="12">Zero</text>
      <rect x="191" y="520" width="12" height="12" fill="hsl(12 76% 42%)"/><text x="209" y="531" fontFamily="sans-serif" fontSize="12">Darker: larger values · max absolute value {known.length?formatValue(max):'not available'}</text>
      <text x="22" y="552" fontFamily="sans-serif" fontSize="11" fill="#536c81">{hazards.length?'Gold triangles: GDACS centres. ':''}{mines.length?'Teal dots: documented mines. ':''}{events.length?'Purple diamonds: ACLED events. ':''}{sites.length?'Blue squares: uploaded sites. ':''}Blue areas: negative changes, where present.</text>
      <text x="22" y="574" fontFamily="sans-serif" fontSize="10" fill="#536c81">Source: {String(source||'Uploaded administrative boundaries').slice(0,130)}</text>
      {overlayCaption&&<text x="22" y="596" fontFamily="sans-serif" fontSize="11" fill="#536c81">{overlayCaption}</text>}
    </svg>
    <p style={{fontSize:12,color:"#536c81"}}>Labels are spaced to avoid overlap. Zoom in to reveal more; select an area to keep its label visible.</p>
    {level!==boundaryLevel&&<p>Map values hidden: dataset level ({level||'none'}) differs from boundary level ({boundaryLevel}).</p>}
    <button type="button" onClick={()=>exportSVG(ref,'outbreak-map.svg')}>Export map SVG</button>
  </div>;
}
export function HorizontalBars({title,subtitle,rows,unit='people',color='#176f89',source,onSelect,valueLabel}) {
  const ref=useRef(null);
  const entries=rows.filter(r=>r.value!==null&&Number.isFinite(r.value)).slice(0,8);
  if(!entries.length)return <div style={{padding:20,border:'1px dashed #cbd8e4',borderRadius:8}}><h3>{title}</h3><p>No comparable observations available. {subtitle}</p></div>;
  const height=135+entries.length*43,max=Math.max(...entries.map(r=>Math.abs(r.value)),.000001);
  return <div className={styles.chartCard}>
    <div className={styles.chartViewport} tabIndex={0} role="region" aria-label="Scrollable chart"><svg ref={ref} viewBox={`0 0 760 ${height}`} role="img" aria-label={title} style={{width:'100%',display:'block'}}>
      <rect width="760" height={height} fill="white"/>
      <text x="14" y="28" fontSize="20" fontWeight="bold" fontFamily="sans-serif" fill="#18334b">{title}</text>
      <text x="14" y="51" fontSize="12" fontFamily="sans-serif" fill="#597086">{subtitle?.slice(0,108)}</text>
      {entries.map((r,i)=>{
        const y=76+i*43,w=Math.abs(r.value)/max*365;
        return <g key={r.location} onClick={()=>onSelect?.(r.location)} style={{cursor:onSelect?'pointer':'default'}}>
          <title>{r.location}: {formatValue(r.value)} {unit}{r.detail?` — ${r.detail}`:''}</title>
          <text x="14" y={y+18} fontSize="14" fontFamily="sans-serif" fontWeight="500" fill="#28435b">{r.location.length>23?r.location.slice(0,22)+'…':r.location}</text>
          <rect x="210" y={y} width="365" height="27" rx="4" fill="#f0f4f7"/>
          <rect x="210" y={y} width={w} height="27" rx="4" fill={r.value<0?'#487bb0':color}/>
          <text x="590" y={y+18} fontSize="14" fontWeight="bold" fontFamily="sans-serif" fill="#18334b">{valueLabel?valueLabel(r):formatValue(r.value)}</text>
        </g>;
      })}
      <text x="14" y={height-27} fontSize="11" fontFamily="sans-serif" fill="#597086">{unit} · descending by supplied ranking · exact values shown</text>
      <text x="14" y={height-9} fontSize="9" fontFamily="sans-serif" fill="#597086">Source: {String(source||'Loaded dataset').slice(0,130)}</text>
    </svg></div>
    <button type="button" onClick={()=>exportSVG(ref,'outbreak-comparison.svg')}>Export comparison SVG</button>
  </div>;
}
export function TrendChart({ records, location, label, unit, kind, asOf, source }) {
  const ref=useRef(null),[period,setPeriod]=useState('42');
  const all=records.filter(r=>r.location===location&&r.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date));
  const last=all.at(-1)?.date;
  const points=all.filter(r=>period==='all'||Date.parse(r.date)>=Date.parse(last)-(Number(period)-1)*86400000);
  if(!points.length)return <p>No observations for this location and reporting cut-off.</p>;
  const known=points.filter(r=>r.value!==null);
  if(!known.length)return <p>All observations for {location} are missing in this window.</p>;
  const minDate=Date.parse(points[0].date),maxDate=Date.parse(points.at(-1).date),span=Math.max(86400000,maxDate-minDate);
  const maximum=Math.max(...known.map(r=>r.value)),scaleMax=maximum||1;
  const magnitude=10**Math.floor(Math.log10(scaleMax)),max=Math.ceil(scaleMax/magnitude)*magnitude;
  const x=d=>85+(Date.parse(d)-minDate)/span*710,y=v=>260-v/max*170;
  const segments=[];let segment=[],previous;
  points.forEach(p=>{if(p.value===null||(previous&&Date.parse(p.date)-Date.parse(previous)>86400000)){if(segment.length)segments.push(segment);segment=[];}if(p.value!==null)segment.push(`${x(p.date)},${y(p.value)}`);previous=p.date;});
  if(segment.length)segments.push(segment);
  const ticks=[...new Set(Array.from({length:6},(_,i)=>Math.round((minDate+(maxDate-minDate)*i/5)/86400000)*86400000))];
  return <div className={`${styles.chartCard} ${styles.trendCard}`}>
    <div data-print-hide="true" style={{display:'flex',gap:8,justifyContent:'flex-end'}}><label>Trend window<select aria-label={`Trend window for ${label}`} value={period} onChange={e=>setPeriod(e.target.value)}><option value="14">Last 14 reporting days</option><option value="42">Last 42 reporting days</option><option value="all">Full available series</option></select></label></div>
    <div className={styles.chartViewport} tabIndex={0} role="region" aria-label="Scrollable chart"><svg ref={ref} viewBox="0 0 900 355" role="img" aria-label={`${label} trend for ${location}`} style={{width:'100%',background:'white'}}>
      <rect width="900" height="355" fill="white"/>
      <text x="20" y="29" fontFamily="sans-serif" fontSize="21" fontWeight="bold" fill="#18334b">{label.slice(0,55)} — {location.slice(0,27)}</text>
      <text x="20" y="53" fontFamily="sans-serif" fontSize="13" fill="#597086">{unit} · {kind} · observations through {last} · gaps remain missing</text>
      {[0,.25,.5,.75,1].map(n=><g key={n}><line x1="85" x2="795" y1={y(n*max)} y2={y(n*max)} stroke="#e5ebf0" strokeDasharray={n?'3 4':undefined}/><text x="72" y={y(n*max)+4} textAnchor="end" fontSize="12" fontFamily="sans-serif" fill="#597086">{formatValue(Number((n*max).toPrecision(5)))}</text></g>)}
      {kind==='daily'?known.map(p=><rect key={p.date} x={x(p.date)-Math.max(2,Math.min(14,710/(span/86400000+1)*.65))/2} y={y(p.value)} width={Math.max(2,Math.min(14,710/(span/86400000+1)*.65))} height={260-y(p.value)} rx="2" fill="#167b94"><title>{p.date}: {formatValue(p.value)} {unit}</title></rect>):segments.map((s,i)=><polyline key={i} points={s.join(' ')} fill="none" stroke="#157b94" strokeWidth="3" strokeLinejoin="round"/>)}
      {known.map(p=><circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={known.length<20?3:1.5} fill="#157b94"><title>{p.date}: {formatValue(p.value)} {unit}</title></circle>)}
      <text x={Math.min(810,x(known.at(-1).date)+10)} y={Math.max(85,y(known.at(-1).value)-10)} fontFamily="sans-serif" fontSize="15" fontWeight="bold" fill="#146e85">{formatValue(known.at(-1).value)}</text>
      {ticks.map(t=><text key={t} x={x(new Date(t).toISOString().slice(0,10))} y="286" textAnchor="middle" fontSize="12" fontFamily="sans-serif" fill="#597086">{new Date(t).toISOString().slice(5,10)}</text>)}
      <text x="20" y="316" fontSize="12" fontFamily="sans-serif" fill="#597086">{points[0].date} to {last} · reporting cut-off {asOf} · {known.length}/{points.length} non-missing records</text>
      <text x="20" y="341" fontSize="9" fontFamily="sans-serif" fill="#597086">Source: {String(source).slice(0,145)}</text>
    </svg></div>
    <button type="button" onClick={()=>exportSVG(ref,'outbreak-trend.svg')}>Export chart SVG</button>
  </div>;
}

// Validated categorical palette (light surface): confirmed / deaths / recoveries / in isolation.
// Adjacent green↔red sit in the 6–8 ΔE CVD floor band, so each series also carries a distinct
// dash pattern and a direct end-label — identity is never colour-alone.
export const NATIONAL_SERIES=[
  {match:/confirmed_cases$/,key:'cases',short:'Confirmed cases',color:'#2b6cb0',dash:''},
  {match:/confirmed_deaths$/,key:'deaths',short:'Deaths',color:'#d13b2f',dash:'2 5'},
  {match:/recover/,key:'recoveries',short:'Recoveries',color:'#1f8a5b',dash:'9 5'},
  {match:/isolation|suspected/,key:'isolation',short:'In isolation',color:'#c98a1e',dash:'1 4'}
];
export function NationalTrendChart({ datasets, asOf, source }) {
  const ref=useRef(null),[period,setPeriod]=useState('90'),[axis,setAxis]=useState('date'),[hoverDate,setHoverDate]=useState(null);
  // Match available national datasets to known series; keep the fixed order, skip absent ones.
  const series=useMemo(()=>NATIONAL_SERIES.map(def=>{
    const dataset=datasets.find(d=>d.level==='national'&&d.status==='ready'&&def.match.test(d.metricId||d.id||''));
    if(!dataset)return null;
    const location=dataset.records.find(r=>r.date<=asOf)?.location;
    const points=dataset.records.filter(r=>r.location===location&&r.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date));
    return points.length?{...def,label:dataset.label,kind:dataset.kind,points}:null;
  }).filter(Boolean),[datasets,asOf]);
  if(series.length<2)return null;
  const allDates=[...new Set(series.flatMap(s=>s.points.map(p=>p.date)))].sort();
  const last=allDates.at(-1),cutoff=period==='all'?allDates[0]:new Date(Date.parse(last)-(Number(period)-1)*86400000).toISOString().slice(0,10);
  const windowed=series.map(s=>({...s,points:s.points.filter(p=>p.date>=cutoff)})).filter(s=>s.points.some(p=>p.value!==null));
  if(!windowed.length)return null;
  const dates=[...new Set(windowed.flatMap(s=>s.points.map(p=>p.date)))].sort();
  const minDate=Date.parse(dates[0]),maxDate=Date.parse(dates.at(-1)),span=Math.max(86400000,maxDate-minDate);
  const maximum=Math.max(1,...windowed.flatMap(s=>s.points.filter(p=>p.value!==null).map(p=>p.value)));
  const magnitude=10**Math.floor(Math.log10(maximum)),max=Math.ceil(maximum/magnitude)*magnitude;
  // Plot area: y 96–286, x 92–782. Legend occupies the band above the plot (y 58–86).
  const PLOT_TOP=96,PLOT_BOTTOM=286;
  const x=d=>92+(Date.parse(d)-minDate)/span*690,y=v=>PLOT_BOTTOM-v/max*(PLOT_BOTTOM-PLOT_TOP);
  const ticks=[...new Set(Array.from({length:6},(_,i)=>Math.round((minDate+(maxDate-minDate)*i/5)/86400000)*86400000))];
  const tickLabel=t=>axis==='epiweek'?epiWeek(new Date(t).toISOString().slice(0,10)).label.replace(/^\d{4}-/,''):new Date(t).toISOString().slice(5,10);
  const hoverLabel=d=>axis==='epiweek'?epiWeek(d).label:d;
  // Trend of each series across the visible window: compare first and last non-missing values.
  // Rising is adverse for every series except recoveries, where more is better.
  const trendOf=s=>{const known=s.points.filter(p=>p.value!==null);const delta=known.length<2?null:known.at(-1).value-known[0].value;const presentation=deltaPresentation(delta,{kind:s.kind,rising:s.key!=='recoveries'});return {...presentation,delta,color:{neutral:'#5f7488',adverse:'#c43b30',good:'#1f8a5b'}[presentation.tone]};};
  // Connect the line across date gaps; break only where a value is actually missing (null).
  const segmentsFor=s=>{const segs=[];let seg=[];s.points.forEach(p=>{if(p.value===null){if(seg.length)segs.push(seg);seg=[];}else seg.push([x(p.date),y(p.value)]);});if(seg.length)segs.push(seg);return segs;};
  const nearest=frac=>{const t=minDate+frac*span;return dates.reduce((best,d)=>Math.abs(Date.parse(d)-t)<Math.abs(Date.parse(best)-t)?d:best,dates[0]);};
  const hover=e=>{const svg=ref.current;const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const loc=pt.matrixTransform(svg.getScreenCTM().inverse());if(loc.x<92||loc.x>782){setHoverDate(null);return;}setHoverDate(nearest((loc.x-92)/690));};
  const hx=hoverDate?x(hoverDate):0;
  // In-SVG legend: swatch (with the series' dash) + label + latest value + coloured trend arrow.
  const legend=windowed.map(s=>{const t=trendOf(s),latest=s.points.filter(p=>p.value!==null).at(-1);return {s,t,latest,text:`${s.short}  ${latest?formatValue(latest.value):'—'}  ${t.glyph}${t.delta!==null?` ${t.delta>0?'+':''}${formatValue(t.delta)}`:''}`};});
  let lx=20;const legendItems=legend.map(item=>{const width=item.text.length*6.0+34;const node={...item,x:lx,width};lx+=width;return node;});
  return <div className={`${styles.chartCard} ${styles.trendCard}`}>
    <div data-print-hide="true" style={{display:'flex',gap:10,justifyContent:'flex-end',alignItems:'flex-end',flexWrap:'wrap'}}>
      <label>X-axis<select aria-label="National trend x-axis" value={axis} onChange={e=>setAxis(e.target.value)}><option value="date">Calendar dates</option><option value="epiweek">Epi weeks</option></select></label>
      <label>Trend window<select aria-label="National trend window" value={period} onChange={e=>setPeriod(e.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">Full series</option></select></label>
    </div>
    <div className={styles.chartViewport} tabIndex={0} role="region" aria-label="Scrollable chart"><svg ref={ref} viewBox="0 0 820 340" role="img" aria-label="National cumulative indicators trend" style={{width:'100%',background:'white'}} onMouseMove={hover} onMouseLeave={()=>setHoverDate(null)}>
      <rect width="820" height="340" fill="white"/>
      <text x="20" y="26" fontFamily="sans-serif" fontSize="18" fontWeight="bold" fill="#18334b">National indicators over time</text>
      <text x="20" y="46" fontFamily="sans-serif" fontSize="12" fill="#597086">Reported indicators · through {axis==='epiweek'?epiWeek(last).label:last} · cut-off {asOf} · {axis==='epiweek'?'epi weeks (ISO-8601)':'calendar dates'} · ↺ revision, not improvement</text>
      <g aria-label="Legend">{legendItems.map(item=><g key={item.s.key}><line x1={item.x} y1="72" x2={item.x+24} y2="72" stroke={item.s.color} strokeWidth="3" strokeDasharray={item.s.dash} strokeLinecap="round"/><text x={item.x+30} y="76" fontFamily="sans-serif" fontSize="12" fill="#28435b"><tspan fontWeight="700">{item.s.short}</tspan><tspan fill="#4a6076" dx="5">{item.latest?formatValue(item.latest.value):'—'}</tspan><tspan fill={item.t.color} fontWeight="700" dx="5">{item.t.glyph}{item.t.delta!==null?` ${item.t.delta>0?'+':''}${formatValue(item.t.delta)}`:''}</tspan></text></g>)}</g>
      <line x1="20" y1="88" x2="800" y2="88" stroke="#eef2f6" strokeWidth="1"/>
      {[0,.25,.5,.75,1].map(n=><g key={n}><line x1="92" x2="782" y1={y(n*max)} y2={y(n*max)} stroke="#eef2f6" strokeWidth="1"/><text x="84" y={y(n*max)+4} textAnchor="end" fontSize="11" fontFamily="sans-serif" fill="#8195a6">{formatValue(Number((n*max).toPrecision(3)))}</text></g>)}
      {hoverDate&&<line x1={hx} x2={hx} y1={PLOT_TOP} y2={PLOT_BOTTOM} stroke="#b9c9d9" strokeWidth="1" strokeDasharray="3 3"/>}
      {windowed.map(s=>segmentsFor(s).map((seg,i)=><polyline key={`${s.key}-${i}`} points={seg.map(p=>p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round"/>))}
      {hoverDate&&windowed.map(s=>{const p=s.points.find(q=>q.date===hoverDate);return p&&p.value!==null?<circle key={s.key} cx={hx} cy={y(p.value)} r="4" fill={s.color} stroke="white" strokeWidth="1.5"/>:null;})}
      {(()=>{
        // Direct end-labels, de-collided vertically so converging lines stay readable.
        const labels=windowed.map(s=>{const latest=s.points.filter(p=>p.value!==null).at(-1);return latest?{key:s.key,color:s.color,x:Math.min(788,x(latest.date)+7),y:y(latest.value)+4,text:formatValue(latest.value)}:null;}).filter(Boolean).sort((a,b)=>a.y-b.y);
        for(let i=1;i<labels.length;i++)if(labels[i].y-labels[i-1].y<13)labels[i].y=labels[i-1].y+13;
        return labels.map(l=><text key={l.key} x={l.x} y={l.y} fontFamily="sans-serif" fontSize="12" fontWeight="700" fill={l.color}>{l.text}</text>);
      })()}
      {ticks.map(t=><text key={t} x={x(new Date(t).toISOString().slice(0,10))} y={PLOT_BOTTOM+22} textAnchor="middle" fontSize="11" fontFamily="sans-serif" fill="#8195a6">{tickLabel(t)}</text>)}
      {hoverDate&&(()=>{const rows=windowed.map(s=>({s,p:s.points.find(q=>q.date===hoverDate)})).filter(r=>r.p&&r.p.value!==null);const bw=155,bh=20+rows.length*17,bx=Math.min(650,Math.max(10,hx+10)),by=PLOT_TOP+2;return <g pointerEvents="none"><rect x={bx} y={by} width={bw} height={bh} rx="5" fill="white" stroke="#cddce7"/><text x={bx+10} y={by+15} fontSize="11" fontWeight="700" fontFamily="sans-serif" fill="#28435b">{hoverLabel(hoverDate)}</text>{rows.map((r,i)=><g key={r.s.key}><line x1={bx+10} y1={by+24+i*17-3} x2={bx+22} y2={by+24+i*17-3} stroke={r.s.color} strokeWidth="3" strokeDasharray={r.s.dash}/><text x={bx+28} y={by+24+i*17} fontSize="11" fontFamily="sans-serif" fill="#3f5468">{r.s.short}: {formatValue(r.p.value)}</text></g>)}</g>;})()}
      <text x="20" y="322" fontSize="9" fontFamily="sans-serif" fill="#8195a6">Source: {String(source||'National reported series').slice(0,150)} · Rising cumulative totals reflect additional reports, not onset timing.</text>
    </svg></div>
    <button type="button" onClick={()=>exportSVG(ref,'national-indicators.svg')}>Export chart SVG</button>
  </div>;
}
