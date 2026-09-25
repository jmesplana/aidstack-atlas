import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import DecisionView from './DecisionView';
import ActionRail from './ActionRail';
import { actionEvidence, fallbackActions } from '../../../lib/outbreak/actionPlan';
import { recommendations } from '../../../lib/outbreak/overview';
import { actionFollowUp } from '../../../lib/outbreak/briefing';
import DashboardMobility from './DashboardMobility';
import FocusSection from './FocusSection';
import { provinceCoverage, provinceHorizon, areaActivity } from '../../../lib/outbreak/areaHistory';
import { shiftDate } from '../../../lib/outbreak/insights';
import { formatValue } from '../../../lib/outbreak/data';
import { OutbreakMap } from './Visuals';
import { ProvinceHorizon } from './AreaHistory';
import KeyMessage from './KeyMessage';
import LocationMatching from './LocationMatching';
import MonitoringPages, { MonitoringNavigation } from './MonitoringPages';
import styles from './outbreak.module.css';

const number = value => Number.isFinite(value) ? formatValue(value) : 'Unknown';

export default function Dashboard({ monitoring, monitorOptions, onMonitorOptions, epi, geometry, boundaryLevel, message, asOf, location, onSelect, onAnalysis, onData, reviewed, province, setProvince, title, freshness, routeData, movementDirection, onMovementDirection, movementOverlays, defaultMovementLocation, onLoadMovement, movementLoading, movementError, security, mining, response, actions=[], onAddAction, isActionAdded, onOpenPlan }) {
  const [presenting,setPresenting]=useState(false);
  const screenRef=useRef(null);
  function present(){flushSync(()=>setPresenting(true));screenRef.current?.requestFullscreen?.().catch(()=>{});}
  function closePresentation(){if(document.fullscreenElement===screenRef.current)document.exitFullscreen?.().catch(()=>{});setPresenting(false);}
  const [allZones,setAllZones]=useState(true),[alertDays,setAlertDays]=useState(7);
  const coverage=useMemo(()=>provinceCoverage(epi,geometry,boundaryLevel),[epi,geometry,boundaryLevel]);
  const coverageRows=coverage?.rows.filter(r=>r.cases>0)||[];
  const alerts=useMemo(()=>epi?.dataset.level==='health_zone'?areaActivity(epi.dataset,epi.date,shiftDate(epi.date,-alertDays)).firstReports:[],[epi,alertDays]);
  const horizon=useMemo(()=>provinceHorizon(epi,coverage,monitorOptions.horizonWeeks,allZones),[epi,coverage,monitorOptions.horizonWeeks,allZones]);
  const activeProvince=coverage?.rows.some(r=>r.province===province)?province:'';
  const group=coverage?.rows.find(r=>r.province===activeProvince);
  const selected=epi?.zones.find(r=>r.location===location);
  const first=epi?.dataset.records.filter(r=>r.location===location&&r.date<=epi.date&&r.value>0).map(r=>r.date).sort()[0];
  const feature=geometry?.features.find(f=>f.properties.nom===location);
  const district=feature?.properties.district||feature?.properties.ADM2_EN||feature?.properties.NAME_2;
  const focus=group?.locations||[];
  const filteredHorizon=horizon?{...horizon,comparisonsOnly:true,groups:horizon.groups.filter(g=>!activeProvince||g.province===activeProvince).map(g=>({...g,rows:g.rows.filter(r=>(!location||r.location===location)&&r.values.some(Number.isFinite))})).filter(g=>g.rows.length)}:null;
  const mobilityProps={data:routeData,direction:movementDirection,onDirection:onMovementDirection,location,defaultLocation:defaultMovementLocation,focus,onSelect:chooseZone,geometry,boundaryLevel,asOf,overlays:movementOverlays,onLoad:onLoadMovement,loading:movementLoading,error:movementError};
  function chooseZone(name){onSelect(name);const p=coverage?.rows.find(r=>r.locations.includes(name));if(p)setProvince(p.province);}
  const callout=location?[
    location,
    [feature?.properties.province,district].filter(Boolean).join(' · ')||'Administrative grouping unavailable',
    `Cumulative cases: ${number(selected?.value)}`,
    `Reported change: ${number(selected?.delta)} (${epi?.comparisonDays||7} days)`,
    `First positive report: ${first||'Not established'}`,
    `Observation: ${selected?.date||'No report at cut-off'}`
  ]:null;
  const view=monitorOptions.view;
  const onView=view=>onMonitorOptions({...monitorOptions,view});
  const pageContent=presentation=><MonitoringPages settings={monitorOptions} onSettings={onMonitorOptions} model={monitoring} epi={epi} geometry={geometry} boundaryLevel={boundaryLevel} asOf={asOf} location={location} province={activeProvince} focus={focus} onSelect={chooseZone} mobilityProps={mobilityProps} presentation={presentation}/>;

  // Derived decision data
  const growthZones=useMemo(()=>epi?.growth?.filter(z=>z.delta>0).length||0,[epi]);
  const totalDelta=useMemo(()=>{
    if(!epi?.growth?.length)return null;
    const sum=epi.growth.reduce((s,z)=>s+(z.delta||0),0);
    return Number.isFinite(sum)?sum:null;
  },[epi]);

  const situationStatus=useMemo(()=>{
    if(!epi)return null;
    if(alerts.length>=3||(growthZones>0&&epi.affected?.length>0&&growthZones>=Math.max(3,Math.round(epi.affected.length*0.2))))return 'alert';
    if(alerts.length>=1||growthZones>0)return 'watch';
    return 'stable';
  },[alerts,growthZones,epi]);

  const decisionPoints=useMemo(()=>{
    if(!epi)return [];
    const points=[];
    if(alerts.length>0){
      const zoneNames=alerts.slice(0,3).map(a=>a.location).join(', ');
      const more=alerts.length>3?` and ${alerts.length-3} more`:'';
      points.push({
        kind:'spread',
        headline:`${alerts.length} zone${alerts.length>1?'s':''} with first-ever positive report`,
        detail:`${zoneNames}${more} — first cases in the last ${alertDays} days.`,
        action:'Deploy investigation and response teams. Verify ring vaccination coverage in adjacent zones.',
      });
    }
    const gaps=(epi.missing||0)+(epi.absent||0);
    if(gaps>0){
      points.push({
        kind:'gap',
        headline:`${gaps} location${gaps>1?'s':''} with missing or absent data`,
        detail:'Unreported areas may mask active cases and affect cumulative totals.',
        action:'Contact district supervisors to obtain overdue reports before the next briefing cut-off.',
      });
    }
    const topProv=[...coverageRows].sort((a,b)=>(b.cases||0)-(a.cases||0))[0];
    if(topProv&&Number.isFinite(epi.total)&&epi.total>0){
      const pct=Math.round((topProv.cases/epi.total)*100);
      if(pct>=40){
        points.push({
          kind:'burden',
          headline:`${topProv.province} holds ~${pct}% of reported cases`,
          detail:`${number(topProv.cases)} cases across ${topProv.affected} of ${topProv.total} health zones.`,
          action:'Review supply, staffing, and safe-burial capacity. Confirm ring vaccination completeness.',
        });
      }else if(growthZones>0&&points.length<3){
        points.push({
          kind:'growth',
          headline:`${growthZones} zone${growthZones>1?'s':''} with upward case trend`,
          detail:`Positive change in reported cumulative cases over the last ${epi.comparisonDays||7} days.`,
          action:'Review contact tracing and ring vaccination coverage in zones with recent increases.',
        });
      }
    }else if(growthZones>0&&points.length<3){
      points.push({
        kind:'growth',
        headline:`${growthZones} zone${growthZones>1?'s':''} with upward case trend`,
        detail:`Positive change in reported cumulative cases over the last ${epi.comparisonDays||7} days.`,
        action:'Review contact tracing and ring vaccination coverage in zones with recent increases.',
      });
    }
    return points.slice(0,3);
  },[epi,alerts,alertDays,coverageRows,growthZones]);

  const provincePriority=useMemo(()=>{
    if(!coverage)return new Map();
    const alertZones=new Set(alerts.map(a=>a.location));
    return new Map(coverage.rows.map(r=>{
      const hasAlerts=r.locations.some(l=>alertZones.has(l));
      const highAffected=r.reported>0&&r.percent>30;
      const priority=hasAlerts&&highAffected?'high':hasAlerts||highAffected?'watch':null;
      return [r.province,priority];
    }));
  },[coverage,alerts]);

  const situationLabels={alert:'Active spread',watch:'Active · watch',stable:'Stable · monitoring'};

  const evidence=useMemo(()=>presenting?actionEvidence({epi,alerts,monitoring,security,mining,mobility:routeData,response,actions,asOf}):[],[presenting,epi,alerts,monitoring,security,mining,routeData,response,actions,asOf]);
  const ruleActions=useMemo(()=>presenting&&epi?fallbackActions(recommendations(epi,security,mining,routeData,asOf)):[],[presenting,epi,security,mining,routeData,asOf]);
  const actionRail=onAddAction&&<ActionRail evidence={evidence} fallback={ruleActions} isAdded={isActionAdded} onAdd={onAddAction} onSelect={chooseZone} followUp={actionFollowUp(actions,asOf)} planCount={actions.length} onOpenPlan={()=>{closePresentation();onOpenPlan();}}/>;

  return <div className={styles.dashboard}>
    {presenting&&<DecisionView view={view} onView={onView} pageContent={view!=='overview'?pageContent(true):null} mobilityProps={mobilityProps} screenRef={screenRef} title={title} freshness={freshness} epi={epi} geometry={geometry} boundaryLevel={boundaryLevel} message={message} coverage={coverage} horizon={filteredHorizon} alerts={alerts} alertDays={alertDays} asOf={asOf} location={location} province={activeProvince} focus={focus} callout={callout} onSelect={chooseZone} onProvince={p=>{setProvince(p);onSelect('');}} onClear={()=>{setProvince('');onSelect('');}} onClose={closePresentation} onAnalysis={()=>{closePresentation();onAnalysis();}} actionRail={actionRail}/>}
    <div className={styles.workspaceHeading}><div><span className={styles.eyebrow}>OUTBREAK MONITOR</span><h3>Situation dashboard</h3><p>Case reporting date: {epi?.date||'Unavailable'} · Cut-off: {asOf}</p></div><div className={styles.toolbar}><button className={styles.primaryAction} onClick={present}>Full-screen dashboard</button><button onClick={onAnalysis}>Deep analysis → Sitrep</button></div></div>
    <KeyMessage compact onView={onView} message={message} asOf={asOf} reviewed={reviewed} onBriefing={onAnalysis}/>
    {!epi&&<div className={styles.panel}><p>Connect the DRC feeds or import cumulative health-zone case data to populate the dashboard.</p><button onClick={onData}>Connect or import data</button></div>}
    <MonitoringNavigation view={view} onView={onView}/>
    {epi&&<><div className={styles.controls}><label>Province filter<select aria-label="Province filter" value={activeProvince} onChange={e=>{setProvince(e.target.value);onSelect('');}}><option value="">All provinces</option>{coverage?.rows.map(r=><option key={r.province}>{r.province}</option>)}</select></label><label>Health zone<select aria-label="Health zone" value={location} onChange={e=>chooseZone(e.target.value)}><option value="">All health zones</option>{[...new Set([...(group?.locations||coverage?.rows.flatMap(r=>r.locations)||epi.zones.map(r=>r.location)),...(location?[location]:[])])].sort().map(n=><option key={n}>{n}</option>)}</select></label>{(activeProvince||location)&&<button onClick={()=>{setProvince('');onSelect('');}}>Clear selection</button>}</div></>}
    {epi&&view!=='overview'&&pageContent(false)}
    {epi&&view==='overview'&&<>

      {/* Situation status banner */}
      {situationStatus&&<div className={`${styles.situationBanner} ${styles[`situation_${situationStatus}`]}`} role="status" aria-label="Situation status">
        <div className={styles.situationBannerMain}>
          <strong className={styles.situationLabel}>{situationLabels[situationStatus]}</strong>
          <span>
            {epi.affected.length} zone{epi.affected.length!==1?'s':''} with cases
            {coverageRows.length>0?` across ${coverageRows.length} province${coverageRows.length!==1?'s':''}` :''}
            {growthZones>0?` · ${growthZones} showing upward change in last ${epi.comparisonDays||7} days`:' · no upward change detected'}
          </span>
        </div>
        <span className={styles.situationDate}>Reporting date {epi.date}</span>
      </div>}

      {/* Stat cards */}
      <div className={styles.dashboardCards} aria-label="Dashboard totals">
        <div className={totalDelta>0?styles.statCardWatch:undefined}>
          <span>Reported cumulative cases</span>
          <strong>{epi.zones.some(z=>z.value!==null)?number(epi.total):'Unknown'}</strong>
          {totalDelta!==null&&<small className={totalDelta>0?styles.statDeltaAdverse:styles.statDeltaNeutral}>{totalDelta>0?`+${formatValue(totalDelta)} in last ${epi.comparisonDays||7} days`:totalDelta===0?`No change in last ${epi.comparisonDays||7} days`:`${formatValue(totalDelta)} in last ${epi.comparisonDays||7} days`}</small>}
        </div>
        <div>
          <span>Health zones with cases</span>
          <strong>{epi.dataset.level==='health_zone'?number(epi.affected.length):'Unavailable'}</strong>
          {coverage&&epi.dataset.level==='health_zone'&&<small>of {coverage.rows.reduce((n,r)=>n+r.total,0)} total health zones</small>}
        </div>
        <div className={alerts.length>0?styles.statCardAlert:undefined}>
          <span>First positive reports ({alertDays}d window)</span>
          <strong>{epi.dataset.level==='health_zone'?number(alerts.length):'Unavailable'}</strong>
          {epi.dataset.level==='health_zone'&&<small className={alerts.length>0?styles.statDeltaAdverse:undefined}>{alerts.length>0?'New geographic spread detected':'No new zones in this window'}</small>}
        </div>
        <div>
          <span>Health zones reporting</span>
          <strong>{coverage?`${coverage.rows.reduce((n,r)=>n+r.reported,0)} / ${coverage.rows.reduce((n,r)=>n+r.total,0)}`:'Unavailable'}</strong>
          {coverage&&<small>{coverage.rows.reduce((n,r)=>n+(r.total-r.reported),0)} zones without a report at this date</small>}
        </div>
      </div>

      {/* Decision focus */}
      {decisionPoints.length>0&&<section className={styles.decisionFocus} aria-label="Decision focus">
        <h3 className={styles.decisionFocusTitle}>Decision focus</h3>
        <div className={styles.decisionFocusGrid}>
          {decisionPoints.map((pt,i)=><article key={i} className={`${styles.decisionFocusItem} ${styles[`focus_${pt.kind}`]}`}>
            <strong>{pt.headline}</strong>
            <p>{pt.detail}</p>
            <p className={styles.decisionFocusAction}>{pt.action}</p>
          </article>)}
        </div>
      </section>}

      {/* First positive reports — most urgent operational signal */}
      <section className={styles.dashboardAlerts} aria-label="First positive reports">
        <div className={styles.sectionHeading}>
          <h3>First positive reports in available history</h3>
          <label>Alert window<select aria-label="Alert window" value={alertDays} onChange={e=>setAlertDays(Number(e.target.value))}><option value="7">Last 7 reporting days</option><option value="14">Last 14 reporting days</option><option value="30">Last 30 reporting days</option></select></label>
        </div>
        {alerts.length?<div className={styles.dashboardAlertList}>{alerts.map(a=><button key={a.location} onClick={()=>chooseZone(a.location)}><strong>{a.location}</strong> · {a.date}<small>{a.priorZero?'Previously reported zero':'No earlier zero established'}</small></button>)}</div>:<p>No first positive reports identified in this window.</p>}
        <small>This describes the loaded history, not the first-ever infection. Amber map outlines mark these zones.</small>
      </section>

      {/* Map + mobility */}
      <div className={styles.dashboardMain}>
        <FocusSection className={styles.panel} label="Dashboard map" title="Geographic distribution"><OutbreakMap fillContainer geometry={geometry} rows={epi.zones} level={epi.dataset.level} kind="cumulative" unit="confirmed cases" boundaryLevel={boundaryLevel} selected={location} onSelect={chooseZone} label="Reported cumulative cases" asOf={asOf} source={epi.dataset.source||epi.dataset.url} focusNames={focus} highlightNames={alerts.map(a=>a.location)} groupLabels callout={callout}/>{callout&&<div className={styles.dashboardDetail} aria-label="Selected health zone">{callout.map((line,i)=>i===0?<h4 key={i}>{line}</h4>:<p key={i}>{line}</p>)}<button onClick={onAnalysis}>Deep analysis for {location}</button></div>}</FocusSection>
        <FocusSection className={`${styles.panel} ${styles.dashboardMobilityPanel}`} label="Dashboard mobility" title="Population mobility"><DashboardMobility {...mobilityProps}/></FocusSection>
      </div>

      {/* Province coverage + trends */}
      <div className={`${styles.dashboardMain} ${styles.dashboardLower}`}>
        <FocusSection className={styles.panel} label="Dashboard province coverage" title="Province coverage">
          {coverageRows.length?<div className={styles.tableWrap}><table><thead><tr><th>Province</th><th>Cumulative cases</th><th>Affected / total HZ</th><th>Affected %</th><th>Reporting / total</th></tr></thead>
            <tbody>{coverageRows.map(r=>{
              const priority=provincePriority.get(r.province);
              return <tr key={r.province} aria-selected={activeProvince===r.province}>
                <td>
                  <button aria-pressed={activeProvince===r.province} onClick={()=>{setProvince(r.province);onSelect('');}}>{r.province}</button>
                  {priority&&<span className={`${styles.priorityBadge} ${styles[`priority_${priority}`]}`}>{priority==='high'?'High priority':'Watch'}</span>}
                </td>
                <td>{number(r.cases)}{r.missing>0&&r.reported>0&&<small>Partial sum</small>}</td>
                <td>{r.reported?r.affected:'Unknown'} / {r.total}</td>
                <td>{r.reported?`${r.percent.toFixed(1)}%`:'Unknown'}</td>
                <td>{r.reported} / {r.total}</td>
              </tr>;
            })}</tbody>
          </table></div>:<p>{coverage?'No provinces have reported cases at this date.':'Province coverage requires health-zone boundaries with province names and matching case data.'}</p>}
          <p className={styles.helperText}>Only provinces with reported cases are shown. Affected means a positive cumulative total on {epi.date}. Priority badges reflect new-zone alerts and affected percentage. Case totals are sums of matched reports.</p>
          {coverage&&(coverage.unmapped>0||coverage.excludedBoundaries>0)&&<p className={styles.helperText}>{coverage.unmapped} case locations unmatched; {coverage.excludedBoundaries} boundary names have no unique province assignment.</p>}
        </FocusSection>
        <FocusSection className={`${styles.panel} ${styles.dashboardTrends}`} label="Dashboard health-zone trends" title={`Health-zone trends${activeProvince?` · ${activeProvince}`:''}`} actions={<><label>Trend history window<select value={monitorOptions.horizonWeeks} onChange={e=>onMonitorOptions({...monitorOptions,horizonWeeks:Number(e.target.value)})}>{[3,6,26].map(n=><option key={n} value={n}>{n} weeks</option>)}</select></label><label><input type="checkbox" checked={allZones} onChange={e=>setAllZones(e.target.checked)}/>All zones with data</label></>}><ProvinceHorizon model={filteredHorizon} onSelect={chooseZone} selected={location}/><p className={styles.helperText}>Only health zones with available weekly comparisons are shown. Select a health zone above to isolate its trend.</p></FocusSection>
      </div>

      {/* Data quality notes */}
      <p className={styles.helperText}>Totals cover available reports on {epi.date}; they may be partial. Cumulative cases do not represent current caseload. {epi.missing+epi.absent} case-series locations have missing or absent reports.</p>
      <LocationMatching dataset={epi.dataset}/>
    </>}
  </div>;
}
