import { useMemo, useState } from 'react';
import { provinceCoverage, provinceHorizon, areaActivity } from '../../../lib/outbreak/areaHistory';
import { shiftDate } from '../../../lib/outbreak/insights';
import { formatValue } from '../../../lib/outbreak/data';
import { OutbreakMap } from './Visuals';
import { ProvinceHorizon } from './AreaHistory';
import KeyMessage from './KeyMessage';
import styles from './outbreak.module.css';

const number = value => Number.isFinite(value) ? formatValue(value) : 'Unknown';
export default function Dashboard({ epi, geometry, boundaryLevel, message, asOf, location, onSelect, onAnalysis, onData, reviewed, province, setProvince }) {
  const [allZones,setAllZones]=useState(false),[alertDays,setAlertDays]=useState(7);
  const coverage=useMemo(()=>provinceCoverage(epi,geometry,boundaryLevel),[epi,geometry,boundaryLevel]);
  const alerts=useMemo(()=>epi?.dataset.level==='health_zone'?areaActivity(epi.dataset,epi.date,shiftDate(epi.date,-alertDays)).firstReports:[],[epi,alertDays]);
  const horizon=useMemo(()=>provinceHorizon(epi,coverage,26,allZones),[epi,coverage,allZones]);
  const activeProvince=coverage?.rows.some(r=>r.province===province)?province:'';
  const group=coverage?.rows.find(r=>r.province===activeProvince);
  const selected=epi?.zones.find(r=>r.location===location);
  const first=epi?.dataset.records.filter(r=>r.location===location&&r.date<=epi.date&&r.value>0).map(r=>r.date).sort()[0];
  const feature=geometry?.features.find(f=>f.properties.nom===location);
  const district=feature?.properties.district||feature?.properties.ADM2_EN||feature?.properties.NAME_2;
  const focus=group?.locations||[];
  const filteredHorizon=horizon?{...horizon,groups:horizon.groups.filter(g=>!activeProvince||g.province===activeProvince).map(g=>({...g,rows:g.rows.filter(r=>!location||r.location===location)})).filter(g=>g.rows.length)}:null;
  function chooseZone(name){onSelect(name);const p=coverage?.rows.find(r=>r.locations.includes(name));if(p)setProvince(p.province);}
  const callout=location?[
    location,
    [feature?.properties.province,district].filter(Boolean).join(' · ')||'Administrative grouping unavailable',
    `Cumulative cases: ${number(selected?.value)}`,
    `Reported change: ${number(selected?.delta)} (${epi?.comparisonDays||7} days)`,
    `First positive report: ${first||'Not established'}`,
    `Observation: ${selected?.date||'No report at cut-off'}`
  ]:null;
  return <div className={styles.dashboard}>
    <div className={styles.workspaceHeading}><div><span className={styles.eyebrow}>OUTBREAK MONITOR</span><h3>Situation dashboard</h3><p>Case reporting date: {epi?.date||'Unavailable'} · Cut-off: {asOf}</p></div><button className={styles.primaryAction} onClick={onAnalysis}>Deep analysis → Sitrep</button></div>
    <KeyMessage compact message={message} asOf={asOf} reviewed={reviewed} onBriefing={onAnalysis}/>
    {!epi&&<div className={styles.panel}><p>Connect the DRC feeds or import cumulative health-zone case data to populate the dashboard.</p><button onClick={onData}>Connect or import data</button></div>}
    {epi&&<>
      <div className={styles.dashboardCards} aria-label="Dashboard totals">
        {[['Reported cumulative cases',epi.zones.some(z=>z.value!==null)?number(epi.total):'Unknown'],['Health zones with cases',epi.dataset.level==='health_zone'?number(epi.affected.length):'Unavailable'],['First positive reports',epi.dataset.level==='health_zone'?number(alerts.length):'Unavailable'],['Health zones reporting',coverage?`${coverage.rows.reduce((n,r)=>n+r.reported,0)} / ${coverage.rows.reduce((n,r)=>n+r.total,0)}`:'Unavailable']].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <p className={styles.helperText}>Totals cover available reports on {epi.date}; they may be partial. Cumulative cases do not represent current caseload. {epi.missing+epi.absent} case-series locations have missing or absent reports.</p>
      <section className={styles.dashboardAlerts} aria-label="First positive reports"><div className={styles.sectionHeading}><h3>First positive reports in available history</h3><label>Alert window<select aria-label="Alert window" value={alertDays} onChange={e=>setAlertDays(Number(e.target.value))}><option value="7">Last 7 reporting days</option><option value="14">Last 14 reporting days</option><option value="30">Last 30 reporting days</option></select></label></div>
        {alerts.length?<div className={styles.dashboardAlertList}>{alerts.map(a=><button key={a.location} onClick={()=>chooseZone(a.location)}><strong>{a.location}</strong> · {a.date}<small>{a.priorZero?'Previously reported zero':'No earlier zero established'}</small></button>)}</div>:<p>No first positive reports identified in this window.</p>}
        <small>This describes the loaded history, not the first-ever infection. Amber map outlines mark these zones.</small>
      </section>
      <div className={styles.controls}><label>Province filter<select aria-label="Province filter" value={activeProvince} onChange={e=>{setProvince(e.target.value);onSelect('');}}><option value="">All provinces</option>{coverage?.rows.map(r=><option key={r.province}>{r.province}</option>)}</select></label><label>Health zone<select aria-label="Health zone" value={location} onChange={e=>chooseZone(e.target.value)}><option value="">All health zones</option>{[...new Set([...(group?.locations||coverage?.rows.flatMap(r=>r.locations)||epi.zones.map(r=>r.location)),...(location?[location]:[])])].sort().map(n=><option key={n}>{n}</option>)}</select></label>{(activeProvince||location)&&<button onClick={()=>{setProvince('');onSelect('');}}>Clear selection</button>}</div>
      <div className={styles.dashboardMain}>
        <section className={styles.panel} aria-label="Dashboard map"><h3>Geographic distribution</h3><OutbreakMap geometry={geometry} rows={epi.zones} level={epi.dataset.level} kind="cumulative" unit="confirmed cases" boundaryLevel={boundaryLevel} selected={location} onSelect={chooseZone} label="Reported cumulative cases" asOf={asOf} source={epi.dataset.source||epi.dataset.url} focusNames={focus} highlightNames={alerts.map(a=>a.location)} groupLabels callout={callout}/>{callout&&<div className={styles.dashboardDetail} aria-label="Selected health zone">{callout.map((line,i)=>i===0?<h4 key={i}>{line}</h4>:<p key={i}>{line}</p>)}<button onClick={onAnalysis}>Deep analysis for {location}</button></div>}</section>
        <section className={styles.panel} aria-label="Dashboard province coverage"><h3>Province coverage</h3>{coverage?.rows.length?<div className={styles.tableWrap}><table><thead><tr><th>Province</th><th>Cumulative cases</th><th>Affected / total HZ</th><th>Affected %</th><th>Reporting / total</th></tr></thead><tbody>{coverage.rows.map(r=><tr key={r.province} aria-selected={activeProvince===r.province}><td><button aria-pressed={activeProvince===r.province} onClick={()=>{setProvince(r.province);onSelect('');}}>{r.province}</button></td><td>{number(r.cases)}{r.missing>0&&r.reported>0&&<small>Partial sum</small>}</td><td>{r.reported?r.affected:'Unknown'} / {r.total}</td><td>{r.reported?`${r.percent.toFixed(1)}%`:'Unknown'}</td><td>{r.reported} / {r.total}</td></tr>)}</tbody></table></div>:<p>Province coverage requires health-zone boundaries with province names and matching case data.</p>}<p className={styles.helperText}>Affected means a positive cumulative total on {epi.date}. Denominators count unique loaded health zones; complete province coverage is not verified. Missing reports are unknown, not zero. Case totals are sums of matched reports.</p>{coverage&&(coverage.unmapped>0||coverage.excludedBoundaries>0)&&<p>{coverage.unmapped} case locations unmatched; {coverage.excludedBoundaries} boundary names have no unique province assignment.</p>}</section>
      </div>
      <section className={styles.panel} aria-label="Dashboard health-zone trends"><div className={styles.sectionHeading}><h3>Health-zone trends{activeProvince?` · ${activeProvince}`:''}</h3><label><input type="checkbox" checked={allZones} onChange={e=>setAllZones(e.target.checked)}/>All zones with data</label></div><ProvinceHorizon model={filteredHorizon}/><p className={styles.helperText}>Select a health zone above to isolate its trend. Mobility, access constraints and response analysis are available in the sitrep.</p></section>
    </>}
  </div>;
}
