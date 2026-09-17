import {latestPerLocation,formatValue} from '../../../lib/outbreak/data';
import {AI_DOCUMENT_DISCLAIMER,FINDING_TYPES,themeColor} from '../../../lib/outbreak/documentInsights';
import {districtRoutes} from '../../../lib/outbreak/mobility';
import MobilityMap from './MobilityMap';
import styles from './outbreak.module.css';

export function FindingCards({findings}) {
  return <>{findings.map(f=><article key={`${f.documentId}:${f.id}`} style={{borderTop:'1px solid #dce5ed',padding:'10px 0'}}>
    <strong>{f.kind.replaceAll('_',' ')} · {f.themes.join(', ')||'Unclassified'}</strong><p>{f.summary}</p>
    {f.value!==null&&<p>{f.metricLabel}: {formatValue(f.value)} {f.unit} · {f.population||'Population unspecified'} · {f.purpose||'Purpose unspecified'}</p>}
    <p>{f.location||'Source location unspecified'}{f.mapLocation?` · Mapped to ${f.mapLocation}`:' · Unmapped'} · {f.startDate||'?'}–{f.endDate||'?'} · {f.source} · {f.file}, {f.reference}</p>
    {f.limitations&&<p>{f.limitations}</p>}<details><summary>Source passage</summary><blockquote style={{whiteSpace:'pre-wrap'}}>{f.quote}</blockquote></details>
  </article>)}</>;
}

const seriesKey=f=>JSON.stringify([f.documentId,f.metricLabel,f.unit,f.population,f.purpose]);
export default function DocumentEvidence({all,findings,mapped,filter,onFilter,geometry,boundaryLevel,asOf,cases,selected,onSelect,routeData,routeDirection,onDirection,overlays}) {
  if(!all.length)return null;
  const names=geometry?.features.map(f=>f.properties.nom)||[];
  const area=selected||mapped[0]?.mapLocation||names[0]||'';
  const themes=[...new Set(all.flatMap(f=>f.themes))].sort();
  const series=[...new Map(mapped.filter(f=>f.value!==null&&f.unit&&f.metricLabel).map(f=>[seriesKey(f),f])).entries()];
  const measure=series.find(([key])=>key===filter.measure)?.[1];
  // Each numeric layer belongs to one report/measure/population/purpose. Conflicting
  // observations remain missing instead of being silently pooled or overwritten.
  const groups=new Map();
  for(const f of measure?mapped.filter(f=>seriesKey(f)===seriesKey(measure)):[]){const key=JSON.stringify([f.mapLocation,f.endDate]);const group=groups.get(key)||[];group.push(f);groups.set(key,group);}
  const records=[...groups.values()].map(group=>({location:group[0].mapLocation,date:group[0].endDate,value:group.every(f=>f.value===group[0].value)?group[0].value:null}));
  const rows=latestPerLocation(measure?records:cases?.records||[],asOf);
  const routes=districtRoutes(routeData,area,routeDirection,asOf).filter(r=>r.value>0).slice(0,10);
  const label=measure?`${measure.metricLabel} — ${measure.reportTitle}`:cases?.label||'Reported cases';
  return <section className={styles.panel} aria-label="Document findings map">
    <h3>Community findings, cases and vaccination</h3><p>{AI_DOCUMENT_DISCLAIMER}</p>
    <div className={styles.controls}>
      <label>Finding type filter<select value={filter.kind||''} onChange={e=>onFilter({...filter,kind:e.target.value})}><option value="">All findings</option>{FINDING_TYPES.map(kind=><option key={kind} value={kind}>{kind.replaceAll('_',' ')}</option>)}</select></label>
      <label>Theme filter<select value={filter.theme||''} onChange={e=>onFilter({...filter,theme:e.target.value})}><option value="">All themes</option>{themes.map(theme=><option key={theme}>{theme}</option>)}</select></label>
      <label>Findings since<input type="date" max={asOf} value={filter.from||''} onChange={e=>onFilter({...filter,from:e.target.value})}/></label>
      <label>Evidence map measure<select value={measure?filter.measure:''} onChange={e=>onFilter({...filter,measure:e.target.value})}><option value="">{cases?.label||'Cases — no source loaded'}</option>{series.map(([key,f])=><option key={key} value={key}>{f.metricLabel} · {f.population||'Population unspecified'} · {f.purpose||'Purpose unspecified'} · {f.reportTitle}</option>)}</select></label>
      <label>Evidence area<select value={area} onChange={e=>onSelect(e.target.value)}><option value="">Choose area</option>{names.map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Evidence movement direction<select value={routeDirection} onChange={e=>onDirection(e.target.value)}><option value="outflow">Outgoing</option><option value="inflow">Incoming</option></select></label>
    </div>
    <p>{findings.length} findings in the selected period and filters; {mapped.length} matched to map boundaries. {all.filter(f=>!f.endDate).length} have unresolved observation dates. Missing reports do not mean absence of rumors or activity.</p>
    <p>Circles show reported community themes; outlined squares show vaccination reports. Markers sit at representative area centres, not exact collection or vaccination sites. Select a theme to inspect its geography. Vaccination populations and purposes are shown exactly as reported; deployment destinations do not inherit vaccination counts.</p>
    <MobilityMap overlays={overlays} geometry={geometry} rows={rows} level={measure?boundaryLevel:cases?.level} boundaryLevel={boundaryLevel} kind={measure?'reported observation':cases?.kind||'reported cases'} unit={measure?.unit||cases?.unit||'cases'} selected={area} onSelect={onSelect} label={label} asOf={asOf} source={measure?`${measure.source} · ${measure.file}`:cases?.source||cases?.url} routes={routes} routeDirection={routeDirection} routeUnit={routeData?.unit}/>
    <p>{routeData?`Movement: ${routeData.start}–${routeData.end}; ${routeData.unit}. Up to 10 positive connections. Source: ${routeData.source}.`:'Load movement data to show incoming/outgoing connections.'} Curves are schematic connections, not evidence of transmission.</p>
    <div aria-label="Document theme legend">{[...new Set(mapped.map(f=>f.themes[0]||f.kind))].map(theme=><span key={theme} style={{display:'inline-block',marginRight:16}}><span aria-hidden="true" style={{display:'inline-block',width:10,height:10,background:themeColor(theme),marginRight:5}}/>{theme}</span>)}</div>
    <section aria-label="Selected area findings"><h4>{area||'Select an area'}</h4>{cases&&<p>{cases.label}: {latestPerLocation(cases.records,asOf).find(r=>r.location===area)?.value??'Not reported'} {cases.unit} (source date {latestPerLocation(cases.records,asOf).find(r=>r.location===area)?.date||'unknown'}).</p>}<FindingCards findings={mapped.filter(f=>f.mapLocation===area)}/></section>
    <details><summary>All filtered findings, including unmapped locations</summary><FindingCards findings={findings}/></details>
    <details><summary>Findings with unresolved dates</summary><FindingCards findings={all.filter(f=>!f.endDate)}/></details>
  </section>;
}
