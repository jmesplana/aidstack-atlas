import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { zoneName, formatValue } from '../../../lib/outbreak/data';
import { MONITORING_CONFIG, REPORTING_TIMELINE_STYLES, reportingHeatBand, reportingWeekDescription, reportingSignalDescription } from '../../../lib/outbreak/monitoring';
import { download } from './Visuals';
import { placeLabels } from '../../../lib/outbreak/mapInteraction';
import { BRIEFING_MODES, briefingProvince, briefingCriteria, rateChangeLabel, reportingSlideDeck } from '../../../lib/outbreak/reportingBriefing';
import styles from './outbreak.module.css';
import SlideViewActions from './SlideViewActions';

const categories=MONITORING_CONFIG.gapCategories;
const short=(text,length)=>String(text).length>length?String(text).slice(0,length-1)+'…':String(text);
function TextLines({text,x,y,width=70,...props}) {
  const words=String(text).split(/\s+/),lines=[''];
  for(const word of words){
    // Wrap long source URLs too, so the exported citation stays inside the slide.
    for(let i=0;i<word.length;i+=width){
      const part=word.slice(i,i+width),last=lines.length-1;
      if(lines[last].length+part.length+1>width)lines.push(part);else lines[last]+=(lines[last]?' ':'')+part;
    }
  }
  return <text x={x} y={y} {...props}>{lines.map((line,i)=><tspan key={i} x={x} dy={i?20:0}>{line}</tspan>)}</text>;
}

// A self-contained SVG makes preview and PNG export identical without HTML capture,
// external tiles or fonts. Only the zones on this slide are emphasized on the map.
function Slide({svgRef,rows,total,model,geometry,source,scope,page,pages,mode='availability',start=0}) {
  const analytic=mode!=='availability';
  const id=useId().replace(/:/g,''),byName=new Map(rows.map((r,i)=>[r.location,{...r,index:i+1}]));
  const shapes=useMemo(()=>{
    const features=(geometry?.features||[]).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type));
    const coordinates=f=>f.geometry.type==='Polygon'?f.geometry.coordinates:f.geometry.coordinates.flat();
    const relevant=features.filter(f=>rows.some(r=>r.location===zoneName(f)));
    const points=(relevant.length?relevant:features).flatMap(f=>coordinates(f).flat());
    if(!points.length)return [];
    let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
    for(const [x,y] of points){west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);}
    const cos=Math.max(.1,Math.cos((south+north)/2*Math.PI/180));
    const scale=Math.min(560/Math.max(.01,(east-west)*cos),440/Math.max(.01,north-south));
    const project=([x,y])=>[355+(x-(west+east)/2)*cos*scale,460-(y-(south+north)/2)*scale];
    return features.map(f=>{
      const rings=coordinates(f),p=rings.flat().map(project);
      let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
      for(const [x,y] of p){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      return {name:zoneName(f),center:[(left+right)/2,(top+bottom)/2],path:rings.map(r=>r.map((c,i)=>`${i?'L':'M'}${project(c).join(',')}`).join(' ')+'Z').join(' ')};
    });
  },[geometry,rows]);
  const max=Math.max(0,...rows.map(r=>Math.max(0,r.lastSignal?.delta||0)));
  const labels=placeLabels(shapes.map(f=>({...f,labelWidth:28})),[45,225,625,475],'',new Set(rows.map(r=>r.location)),1,[625,475]);
  const cellWidth=310/model.windows.length;
  return <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" className={styles.reportingSlide} role="img" aria-label="Surveillance visibility briefing slide">
    <title>{BRIEFING_MODES[mode].title} — source availability as of {model.asOf}</title>
    <desc>Map and weekly source observations for {rows.length} of {total} filtered zones. Time since last available report does not establish missed submissions.</desc>
    <defs><clipPath id={`clip-${id}`}><rect x="45" y="225" width="625" height="475" rx="10"/></clipPath><pattern id={`unknown-${id}`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e3e8ed"/><path d="M0 8L8 0" stroke="#a6b4bf"/></pattern></defs>
    <rect width="1600" height="900" fill="white"/>
    <g fontFamily="Arial, sans-serif" fill="#18334b">
      <rect width="1600" height="10" fill="#17576b"/>
      <text x="45" y="65" fontSize="34" fontWeight="700">{BRIEFING_MODES[mode].title}</text>
      <text x="1555" y="62" textAnchor="end" fontSize="20">As of {model.asOf} · {page+1}/{pages}</text>
      <text x="45" y="100" fontSize="19">{analytic?'Province briefing':'Time since last available report'} · {short(scope,115)}</text>
      <rect x="45" y="124" width="1510" height="52" rx="8" fill="#edf4f6"/>
      <text x="65" y="157" fontSize="20">{total} zone{total===1?'':'s'} in scope · Showing {rows.length?start+1:0}–{start+rows.length} · {mode==='sustained'?'Largest last observed daily rate first':mode==='lost'?'Oldest available reports first':'Oldest reports first; selected zone first when present'}</text>
      <text x="45" y="210" fontSize="22" fontWeight="700">Source availability and last observed increase</text>
      <rect x="45" y="225" width="625" height="475" rx="10" fill="#f3f6f8"/>
      <g clipPath={`url(#clip-${id})`}>
        {shapes.map(f=>{const row=byName.get(f.name);return <path key={f.name} d={f.path} fill={row?(row.age===null?`url(#unknown-${id})`:categories[row.gapStatus].color):'#e9edef'} stroke="#9aaaba" strokeWidth="1" fillRule="evenodd" opacity={row?1:.35}/>;})}
        {shapes.map(f=>{const row=byName.get(f.name);if(!row)return null;return <g key={f.name}><title>{f.name}: {reportingSignalDescription(row)}</title>{row.lastSignal?.delta>0&&<circle cx={f.center[0]} cy={f.center[1]} r={24*Math.sqrt(row.lastSignal.delta/max)} fill="#17576b" fillOpacity=".55" stroke={row.lastSignal.rising?'#9e3150':'white'} strokeWidth={row.lastSignal.rising?3:1}/>}</g>;})}
        {labels.map(f=><g key={f.name}><line x1={f.center[0]} y1={f.center[1]} x2={f.labelX} y2={f.labelY-6} stroke="#526b7b"/><text x={f.labelX} y={f.labelY} textAnchor="middle" fontSize="19" fontWeight="700" stroke="white" strokeWidth="4" paintOrder="stroke">{byName.get(f.name).index}</text></g>)}
      </g>
      {!shapes.length&&<text x="355" y="450" textAnchor="middle" fontSize="20">No administrative boundaries available</text>}
      <text x="705" y="210" fontSize="22" fontWeight="700">{analytic?'Last three comparable intervals':'Zone / last observation'}</text>
      {!analytic&&model.windows.map((w,i)=><text key={w.end} x={1240+i*cellWidth+cellWidth/2} y="210" textAnchor="middle" fontSize="17">W{w.week}{w.partial?'*':''}</text>)}
      {!rows.length&&<text x="715" y="280" fontSize="22">No zones meet these criteria in the current scope.</text>}
      {rows.map((r,i)=>{
        if(analytic)return <IntervalRow key={r.location} row={r} index={i}/>;
        const y=230+i*80,signal=r.lastSignal;
        return <g key={r.location}>
          <rect x="700" y={y-5} width="855" height="75" rx="6" fill={i%2?'#f2f6f8':'#fafbfc'}/>
          <text x="715" y={y+17} fontSize="20" fontWeight="700"><title>{r.location}</title>{i+1}. {short(r.location,31)}</text>
          <text x="1220" y={y+17} textAnchor="end" fontSize="18" fontWeight="700">{r.age===null?'Unavailable':`${r.age} days`}</text>
          <text x="715" y={y+39} fontSize="16">{r.lastReport||'No report in loaded history'} · {short(r.province||'Province unavailable',25)}{r.matched?'':' · Unmapped'}</text>
          <text x="715" y={y+61} fontSize="16"><title>{reportingSignalDescription(r)}</title>{signal?`${signal.delta>0?'+':''}${formatValue(signal.delta)} · ${signal.start}–${signal.end}${signal.delta<0?' · revision':signal.rising?' · rate was rising':''}`:'No comparable 6–8 day pair'}</text>
          {r.timeline.map((w,j)=>{
            const band=w.status==='increase'?reportingHeatBand(w.delta):null;
            const text=w.status==='missing'?'×':w.status==='reported'?'•':w.status==='revision'?`↓${formatValue(w.delta)}`:w.delta===0?'0':`+${formatValue(w.delta)}`;
            return <g key={w.end}><title>{reportingWeekDescription(r,w)}</title><rect x={1240+j*cellWidth} y={y+2} width={cellWidth-5} height="55" rx="4" fill={band?.color||REPORTING_TIMELINE_STYLES[w.status].color}/><text x={1240+j*cellWidth+(cellWidth-5)/2} y={y+36} textAnchor="middle" fontSize={Math.min(18,(cellWidth-12)/(.6*text.length))} fill={band?.text||'#18334b'}>{text}</text></g>;
          })}
        </g>;
      })}
      {Object.entries(categories).map(([key,c],i)=><g key={key}><rect x={45+(i%2)*320} y={720+Math.floor(i/2)*30} width="17" height="17" fill={key==='unknown'?`url(#unknown-${id})`:c.color}/><text x={70+(i%2)*320} y={734+Math.floor(i/2)*30} fontSize="16">{c.label}</text></g>)}
      <text x="705" y="738" fontSize="16">{analytic?'Counts are changes in cumulative reports; rates use actual interval days.':'Weekly cells: + increase · 0 unchanged · ↓ revision · • no comparison · × unavailable'}</text>
      <text x="705" y="764" fontSize="16">{analytic?'Each zone uses its own dates. Percentages compare daily rates.':`${model.windows[0]?.start}–${model.asOf} · oldest → newest · * partial week`}</text>
      <text x="45" y="794" fontSize="16">{analytic?briefingCriteria(mode):`Circle area: historical increase; max +${formatValue(max)}. Berry outline: rate rising then. Numbers link map to rows.`}</text>
      <text x="45" y="824" fontSize="17" fontWeight="700">{analytic?'Reported increases are not proof of accelerating transmission. Check publication lag, catch-up reporting and detection changes.':'Availability is not completeness. No report ≠ zero cases. Historical increases are not current caseload.'}</text>
      <TextLines x="45" y="854" fontSize="15" width={180} text={`Source: ${source||'Loaded case dataset'} · ${analytic?`Circles: last interval increase (max +${formatValue(max)}); outline: rate was rising. No province case totals.`:'Verify publication lag and source coverage before following up.'}`}/>
    </g>
  </svg>;
}

function IntervalRow({row,index}) {
  const y=230+index*115,observations=row.lastTrend.observations;
  const number=value=>formatValue(Math.round(value*100)/100);
  return <g aria-label={`Interval evidence for ${row.location}`}>
    <rect x="700" y={y-5} width="855" height="110" rx="6" fill={index%2?'#edf3f6':'#f7f9fa'}/>
    <text x="715" y={y+17} fontSize="20" fontWeight="700"><title>{row.location}</title>{index+1}. {short(row.location,44)}</text>
    <text x="1540" y={y+17} textAnchor="end" fontSize="17" fontWeight="700">{row.age} days old · {row.lastReport}</text>
    {observations.map((o,j)=><g key={o.end}>
      <text x={715+j*278} y={y+40} fontSize="14">I{j+1}: {o.start} → {o.end}</text>
      <text x={715+j*278} y={y+64} fontSize="18" fontWeight="700">+{number(o.delta)} reported · {number(o.rate)}/day</text>
    </g>)}
    <text x="715" y={y+91} fontSize="16">Daily rate: I1 → I2 {rateChangeLabel(row.lastTrend.changes[0],observations[0].rate)} · I2 → I3 {rateChangeLabel(row.lastTrend.changes[1],observations[1].rate)}{row.matched?'':' · Unmapped'}</text>
  </g>;
}

function ProvinceSummary({svgRef,summaries,deck,mode,model,source,scope,page}) {
  return <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" className={styles.reportingSlide} role="img" aria-label="Province surveillance summary slide">
    <title>Province summary — {BRIEFING_MODES[mode].title} — {model.asOf}</title>
    <rect width="1600" height="900" fill="white"/>
    <g fontFamily="Arial, sans-serif" fill="#18334b">
      <rect width="1600" height="10" fill="#17576b"/>
      <text x="45" y="65" fontSize="34" fontWeight="700">Province surveillance summary</text>
      <text x="1555" y="62" textAnchor="end" fontSize="20">As of {model.asOf} · {page+1}/{deck.pages.length}</text>
      <text x="45" y="102" fontSize="21">{BRIEFING_MODES[mode].title} · {short(scope,90)}</text>
      <rect x="45" y="125" width="1510" height="52" rx="8" fill="#edf4f6"/>
      <text x="65" y="158" fontSize="20">{deck.matching} qualifying zone{deck.matching===1?'':'s'} / {deck.total} in scope · {deck.provinces.length} province group{deck.provinces.length===1?'':'s'} · Zone counts, not province-wide epidemic trends</text>
      <text x="65" y="219" fontSize="20" fontWeight="700">Province</text>
      <text x="860" y="219" textAnchor="end" fontSize="18">Zones in scope</text>
      <text x="1110" y="219" textAnchor="end" fontSize="18">Sustained increases</text>
      <text x="1310" y="219" textAnchor="end" fontSize="18">Visibility lost</text>
      <text x="1525" y="219" textAnchor="end" fontSize="18">No available report</text>
      {summaries.map((p,i)=><g key={p.province} aria-label={`Province summary for ${p.province}`}>
        <rect x="45" y={240+i*54} width="1510" height="48" rx="5" fill={i%2?'#f7f9fa':'#edf3f6'}/>
        <text x="65" y={271+i*54} fontSize="21"><title>{p.province}</title>{short(p.province,48)}</text>
        <text x="860" y={271+i*54} textAnchor="end" fontSize="21">{p.total}</text>
        <text x="1110" y={271+i*54} textAnchor="end" fontSize="23" fontWeight="700" fill="#17576b">{p.sustained}</text>
        <text x="1310" y={271+i*54} textAnchor="end" fontSize="23" fontWeight="700" fill="#975814">{p.lost}</text>
        <text x="1525" y={271+i*54} textAnchor="end" fontSize="21">{p.unavailable}</text>
      </g>)}
      <text x="45" y="710" fontSize="18">Sustained: {briefingCriteria('sustained')}</text>
      <text x="45" y="742" fontSize="18">Visibility lost: {briefingCriteria('lost')}</text>
      <text x="45" y="780" fontSize="18">The {MONITORING_CONFIG.maximumReportGapDays}-day threshold is a freshness rule, not an expected submission deadline. Zero qualifying zones does not mean no transmission.</text>
      <text x="45" y="817" fontSize="18" fontWeight="700">Reported signals require verification. Case totals are not combined across zones with different observation dates.</text>
      <TextLines x="45" y="853" fontSize="15" width={180} text={`Source: ${source||'Loaded case dataset'}. Detail slides follow for qualifying zones, one province per slide.`}/>
    </g>
  </svg>;
}

export function ReportingSlide({svgRef,entry,deck,mode,model,geometry,source,scope,page,total=deck.pages.length}) {
  const rows=(entry.rows||[]).map(r=>mode==='availability'?r:{...r,lastSignal:{...r.lastTrend.observations.at(-1),rising:true}});
  return entry.kind==='summary'?<ProvinceSummary svgRef={svgRef} summaries={entry.summaries} deck={{...deck,pages:{length:total}}} mode={mode} model={model} source={source} scope={scope} page={page}/>:<Slide svgRef={svgRef} rows={rows} total={entry.total} model={model} geometry={geometry} source={source} scope={entry.province||scope} page={page} pages={total} mode={mode} start={entry.start}/>;
}

export default function ReportingBriefing({rows,provinceRows=rows,provinceScope='All provinces',model,geometry,source,selected,scope}) {
  const [open,setOpen]=useState(false),[page,setPage]=useState(0),[exporting,setExporting]=useState(false),[error,setError]=useState('');
  const [mode,setMode]=useState('availability'),[grouped,setGrouped]=useState(false),[slideProvince,setSlideProvince]=useState('');
  const exportButtonRef=useRef(null),restoreExportFocus=useRef(false);
  const dialogRef=useRef(null),svgRef=useRef(null),triggerRef=useRef(null);
  const sourceRows=mode==='availability'?rows:provinceRows;
  const provinceOptions=[...new Set(sourceRows.map(briefingProvince))].sort((a,b)=>a.localeCompare(b));
  const activeProvince=provinceOptions.includes(slideProvince)?slideProvince:'';
  const deck=useMemo(()=>reportingSlideDeck(sourceRows,{mode,grouped,province:activeProvince,selected}),[sourceRows,mode,grouped,activeProvince,selected]);
  const pages=deck.pages.length,current=Math.min(page,pages-1),entry=deck.pages[current];
  const slideRows=useMemo(()=>(entry.rows||[]).map(r=>mode==='availability'?r:{...r,lastSignal:{...r.lastTrend.observations.at(-1),rising:true}}),[entry,mode]);
  const slideScope=entry.province||activeProvince||(mode==='availability'?scope:provinceScope);
  function changeMode(value){setMode(value);setGrouped(value!=='availability');setSlideProvince('');setPage(0);setError('');}
  useEffect(()=>{
    if(!open)return;
    const dialog=dialogRef.current,previous=document.activeElement;
    dialog.showModal();
    return()=>{dialog.close();if(previous?.isConnected)previous.focus();};
  },[open]);
  useEffect(()=>{if(!exporting&&restoreExportFocus.current){restoreExportFocus.current=false;if(open)exportButtonRef.current?.focus();}},[exporting,open]);
  async function exportPNG(){
    restoreExportFocus.current=true;setExporting(true);setError('');
    let url;
    try{
      const copy=svgRef.current.cloneNode(true);
      copy.removeAttribute('class');copy.setAttribute('width','1920');copy.setAttribute('height','1080');
      url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}));
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Unable to render the slide.'));img.src=url;});
      const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
      const context=canvas.getContext('2d');if(!context)throw new Error('Image export is unavailable in this browser.');
      context.drawImage(img,0,0,1920,1080);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('Unable to create the PNG.');
      download(`${mode==='availability'?'surveillance-visibility':mode==='sustained'?'sustained-increases':'visibility-lost'}_${model.asOf}_${current+1}.png`,blob,'image/png');
    }catch(e){setError(e.message||'Unable to export the slide.');}finally{if(url)URL.revokeObjectURL(url);setExporting(false);}
  }
  return <SlideViewActions>
    <button ref={triggerRef} type="button" title="Province briefings · map, dated evidence and source" disabled={!provinceRows.length} onClick={()=>{setPage(0);setError('');setOpen(true);}}>Slide view · 16:9</button>
    {open&&<dialog ref={dialogRef} className={styles.reportingSlideDialog} aria-label="Reporting slide view" data-section-focus="true" onCancel={e=>{e.preventDefault();e.stopPropagation();setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);}}}>
      <div className={styles.reportingSlideToolbar}><strong>Widescreen briefing</strong><button type="button" disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button><span>Slide {current+1} of {pages}</span><button type="button" disabled={current===pages-1} onClick={()=>setPage(current+1)}>Next</button><button ref={exportButtonRef} type="button" disabled={exporting} onClick={exportPNG}>{exporting?'Exporting…':'Download PNG · 1920 × 1080'}</button><button type="button" onClick={()=>setOpen(false)}>Close slide view</button></div>
      <div className={styles.reportingSlideFilters}>
        <div role="group" aria-label="Briefing view">{Object.entries(BRIEFING_MODES).map(([value,option])=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>changeMode(value)}>{option.label}</button>)}</div>
        <label>Slide province<select value={activeProvince} onChange={e=>{setSlideProvince(e.target.value);setPage(0);}}><option value="">All in dashboard scope</option>{provinceOptions.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        <label><input type="checkbox" checked={grouped} onChange={e=>{setGrouped(e.target.checked);setPage(0);}}/>Group slides by province</label>
        {grouped&&<button type="button" onClick={()=>setPage(0)}>Province summary</button>}
      </div>
      <p className={styles.reportingSlideExplanation}>{briefingCriteria(mode)} {mode!=='availability'&&'Uses the dashboard province scope and replaces its trend and reporting-status filters.'}</p>
      {error&&<p role="alert">{error}</p>}
      {entry.kind==='summary'?<ProvinceSummary svgRef={svgRef} summaries={entry.summaries} deck={deck} mode={mode} model={model} source={source} scope={slideScope} page={current}/>:<Slide svgRef={svgRef} rows={slideRows} total={entry.total} model={model} geometry={geometry} source={source} scope={slideScope} page={current} pages={pages} mode={mode} start={entry.start}/>}

    </dialog>}
  </SlideViewActions>;
}
