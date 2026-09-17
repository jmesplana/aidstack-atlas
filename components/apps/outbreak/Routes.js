import {useMemo,useState} from 'react';
import Papa from 'papaparse';
import {districtRoutes,focusAreas,normalizeRoutes} from '../../../lib/outbreak/mobility';
import {validDate,formatValue} from '../../../lib/outbreak/data';
import {download} from './Visuals';
import MobilityMap from './MobilityMap';
import styles from './outbreak.module.css';

export function RouteUpload({onImport,current}) {
  const [raw,setRaw]=useState([]),[file,setFile]=useState(''),[error,setError]=useState('');
  const [mapping,setMapping]=useState(current?.mapping||{origin:'origin',destination:'destination',value:'value'});
  const [start,setStart]=useState(''),[end,setEnd]=useState(''),[unit,setUnit]=useState('');
  return <div className={styles.panel}><h3>Upload origin–destination mobility</h3><p>One period and one measure per file. Map origin, destination and value columns. Blank values remain missing. Use consistent area names matching your main-app boundaries.</p>
    {current&&<p>Active source: {current.source} · {current.start}–{current.end} · {current.unit}. Importing replaces the complete movement dataset; saved snapshots remain unchanged. Public refresh preserves uploaded movement data.</p>}
    <button onClick={()=>download('mobility-template.csv','origin,destination,value\nExample A,Example B,25\nExample B,Example A,10\n','text/csv')}>Download mobility template</button>
    <label>Mobility CSV<input type="file" accept=".csv" onChange={async e=>{setRaw([]);setError('');try{const f=e.target.files[0];if(!f)return;if(f.size>10000000)throw new Error('Maximum file size: 10 MB.');const p=Papa.parse(await f.text(),{header:true,skipEmptyLines:'greedy'});if(p.errors.length)throw new Error(p.errors[0].message);setRaw(p.data);setFile(f.name);}catch(err){setError(err.message);}}}/></label>
    {!!raw.length&&<><div className={styles.controls}>{Object.keys(mapping).map(key=><label key={key}>Mobility {key} column<select value={mapping[key]} onChange={e=>setMapping({...mapping,[key]:e.target.value})}><option value="">Choose column</option>{Object.keys(raw[0]).map(k=><option key={k}>{k}</option>)}</select></label>)}<label>Mobility period start<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Mobility period end<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>Mobility units<input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="e.g. estimated relocations"/></label></div><button onClick={()=>{try{if(!validDate(start)||!validDate(end)||start>end||!unit.trim())throw new Error('Supply a valid observation period and source units.');const routes=normalizeRoutes(raw,mapping);onImport({origin:'upload',mapping,routes,start,end,unit:unit.trim(),source:file,limitation:'User-supplied OD observations. Coverage and definitions require source review.'});setRaw([]);setError('');}catch(e){setError(e.message);}}}>Import mobility routes</button></>}{error&&<p role="alert">{error}</p>}
  </div>;
}
export default function Routes({data,onLoad,loading,error,epi,security,geometry,boundaryLevel,asOf,selected,onSelect,direction='outflow',onDirection=()=>{},limit='10',onLimit=()=>{},showFocus=true,briefing=false,overlays}) {
  const focus=useMemo(()=>focusAreas(epi,security,data,asOf),[epi,security,data,asOf]);
  const area=selected||focus[0]?.name||data?.routes[0]?.origin||'';
  const routes=useMemo(()=>districtRoutes(data,area,direction,asOf),[data,area,direction,asOf]);
  const positive=routes.filter(r=>r.value>0),shown=positive.slice(0,Number(limit));
  const names=new Set(geometry?.features.map(f=>f.properties.nom)||[]);
  const unmatched=shown.filter(r=>!names.has(r.origin)||!names.has(r.destination));
  const areas=[...new Set([...(epi?.zones.map(z=>z.location)||[]),...(data?.routes.flatMap(r=>[r.origin,r.destination])||[]),...names])].sort();
  return <section className={styles.panel} aria-label="District mobility and focus"><h3>Movement connections</h3>
    <div className={`${styles.toolbar} ${styles.noPrint}`} data-print-hide="true" role="group" aria-label="Movement map direction"><button aria-pressed={direction==='inflow'} onClick={()=>onDirection('inflow')}>Inflow map</button><button aria-pressed={direction==='outflow'} onClick={()=>onDirection('outflow')}>Outflow map</button></div>
    {briefing&&data&&<label className={styles.noPrint}>Focus area for movement maps<select value={area} onChange={e=>onSelect?.(e.target.value)}>{!areas.includes(area)&&<option>{area}</option>}{areas.map(n=><option key={n}>{n}</option>)}</select></label>}
    {showFocus&&<><p>Suggested review priorities, grouped by evidence; no transmission forecast or composite risk score. Click an area to inspect its connections.</p>
    <div className={styles.insightCards}>{focus.map(f=><article key={f.name}><button onClick={()=>onSelect?.(f.name)}>{f.name}</button><span className={styles.printOnly}>{f.name}</span>{f.reasons.map(r=><p key={r}>{r}</p>)}</article>)}</div>
    {!focus.length&&<p>Load area-level confirmed cases to generate burden and growth priorities. Mobility connections can still be explored independently.</p>}
    </>}
    {!briefing&&<button disabled={loading} onClick={onLoad}>{loading?'Loading relocation matrix…':data?'Refresh Flowminder relocation matrix':'Load Flowminder relocation matrix (DRC source)'}</button>}{error&&<p role="alert">{error}</p>}
    {!data?<p>Upload an origin–destination CSV in Data, or load the source matrix. GeoJSON cohort destination percentages alone cannot identify individual origin–destination routes.</p>:<>
      <p><strong>Mobility observation period: {data.start}–{data.end}</strong> · {data.unit}. <span>Source: {briefing ? 'mobility records in the source register' : data.source}</span></p>{!briefing&&<p>{data.limitation}</p>}
      {data.end>asOf?<p role="status">Mobility period is after the reporting cut-off; connections are hidden.</p>:<>
      {!briefing&&<p>These connections describe the mobility observation period, not necessarily current movement. Imported infections cannot be classified without case investigation or travel-history evidence. Outbound connections indicate places to assess for surveillance readiness, not infected travellers.</p>}
      {!briefing&&<div className={styles.controls} data-print-hide="true"><label>District connections<select value={area} onChange={e=>onSelect(e.target.value)}>{!areas.includes(area)&&<option>{area}</option>}{areas.map(n=><option key={n}>{n}</option>)}</select></label><label>Route direction<select value={direction} onChange={e=>onDirection(e.target.value)}><option value="outflow">Outflow — destinations from this area</option><option value="inflow">Inflow — origins arriving in this area</option></select></label><label>Connections shown<select value={limit} onChange={e=>onLimit(e.target.value)}><option value="10">Top 10</option><option value="25">Top 25</option><option value="1000000">All reported connections</option></select></label></div>}
      <h4>{direction==='inflow'?'Origins arriving in':'Destinations from'} {area}</h4>
      <p>{shown.length} of {positive.length} positive connections shown; {routes.filter(r=>r.value===null).length} missing/redacted and {routes.filter(r=>r.value===0).length} zero observations. Unlisted pairs have unknown coverage. {unmatched.length} shown connections cannot be mapped because an endpoint is unmatched.</p>
      {briefing&&!geometry?<p>Map unavailable: matching administrative boundaries have not been supplied.</p>:<MobilityMap overlays={overlays} geometry={geometry} rows={shown.map(r=>({location:direction==='inflow'?r.origin:r.destination,value:r.value,date:data.end}))} level={boundaryLevel} boundaryLevel={boundaryLevel} kind="directed mobility" unit={data.unit} selected={area} onSelect={onSelect} label={`${direction==='inflow'?'Inflow to':'Outflow from'} ${area}`} asOf={asOf} source={data.source} routes={shown} routeDirection={direction} focusNames={[area,...shown.flatMap(r=>[r.origin,r.destination])]}/>}
      <p className={styles.scope}>{direction==='inflow'?`Orange arrows show origins arriving in ${area}; receiving-area readiness refers to ${area}.`:'Teal arrows show destinations from this area — places to assess for onward surveillance.'}</p>
      <p>Arrowheads point from origin to destination. Curves connect representative area centres; they do not show actual travel paths. Internal movements are excluded.</p>
      <div className={styles.tableWrap}><table><thead><tr><th>Origin</th><th>Destination</th><th>{data.unit}</th><th>Outbreak context ({epi?.date||'not loaded'})</th></tr></thead><tbody>{shown.map(r=>{const counterpart=direction==='inflow'?r.origin:r.destination,z=epi?.zones.find(z=>z.location===counterpart);return <tr key={JSON.stringify([r.origin,r.destination])}><td>{r.origin}</td><td>{r.destination}</td><td>{formatValue(r.value)}</td><td>{z?.value!=null?`${formatValue(z.value)} cumulative cases${z.delta!==null?`; seven-day change ${z.delta}`:''}`:'Case data unavailable'}</td></tr>;})}</tbody></table></div>
      </>}
    </>}
  </section>;
}
