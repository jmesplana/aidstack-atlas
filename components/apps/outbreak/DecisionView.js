import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import DashboardMobility from './DashboardMobility';
import FocusSection from './FocusSection';
import { OutbreakMap } from './Visuals';
import { ProvinceHorizon } from './AreaHistory';
import { formatValue } from '../../../lib/outbreak/data';
import styles from './outbreak.module.css';
import { MONITORING_PAGES } from './MonitoringPages';

const number=value=>Number.isFinite(value)?formatValue(value):'Unknown';

export default function DecisionView({ screenRef, title, epi, geometry, boundaryLevel, message, coverage, horizon, alerts, alertDays, asOf, location, province, focus, callout, onSelect, onProvince, onClear, onClose, onAnalysis, freshness, mobilityProps, view='overview',onView,pageContent,actionRail }) {
  const dialogRef=useRef(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow,dialog=dialogRef.current;
    dialog.showModal();
    const background=[...document.body.children].filter(el=>el!==dialog).map(el=>({el,inert:el.inert,hidden:el.getAttribute('aria-hidden')}));
    screenRef.current?.querySelector('button')?.focus();
    background.forEach(({el})=>{el.inert=true;el.setAttribute('aria-hidden','true');});
    document.body.style.overflow='hidden';
    let entered=!!document.fullscreenElement;
    const fullscreen=()=>{if(document.fullscreenElement===screenRef.current)entered=true;else if(entered)closeRef.current();};
    const keyboard=e=>{
      if(e.target.closest?.('[data-section-focus="true"]'))return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeRef.current();return;}
      if(e.key!=='Tab')return;
      const nodes=[...screenRef.current.querySelectorAll('button, input, select, a[href], [tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    };
    document.addEventListener('fullscreenchange',fullscreen);
    document.addEventListener('keydown',keyboard,true);
    return()=>{background.forEach(({el,inert,hidden})=>{el.inert=inert;if(hidden===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',hidden);});document.body.style.overflow=overflow;dialog.close();document.removeEventListener('fullscreenchange',fullscreen);document.removeEventListener('keydown',keyboard,true);previous?.focus?.();};
  },[screenRef]);

  const paragraphs=message.text.split(/\n\s*\n/);
  const trendHighlight=message.highlights?.find(h=>h.view==='trends');
  // Two sentences per block keeps the panel readable without scrolling
  function twoSentences(text,max=230){
    if(!text)return '';
    const m=text.match(/^(?:[^.!?]*[.!?]+\s*){1,2}/);
    const s=m?m[0].trim():text;
    return s.length>max?s.slice(0,max).replace(/\s\S+$/,'')+'…':s;
  }
  const messages=[twoSentences(paragraphs[0],230),twoSentences(trendHighlight?.text||paragraphs[1],180)].filter(Boolean);
  const coverageRows=coverage?.rows.filter(r=>r.cases>0)||[];
  const missing=coverage?.rows.reduce((sum,r)=>sum+r.missing,0);

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
  const situationColors={alert:'#c43b30',watch:'#b0770f',stable:'#23785d'};

  const cards=[
    ['Reported cumulative cases',epi?.zones.some(z=>z.value!==null)?number(epi.total):'Unknown',totalDelta!==null&&totalDelta>0?`+${formatValue(totalDelta)} in ${epi?.comparisonDays||7}d`:null],
    ['Health zones with cases',epi?.dataset.level==='health_zone'?number(epi.affected.length):'Unknown',null],
    [`First reports · ${alertDays}d`,epi?.dataset.level==='health_zone'?number(alerts.length):'Unknown',alerts.length>0?'New spread detected':null],
    ['Health zones reporting',coverage?`${coverage.rows.reduce((n,r)=>n+r.reported,0)} / ${coverage.rows.reduce((n,r)=>n+r.total,0)}`:'Unknown',null],
  ];

  return createPortal(<dialog ref={dialogRef} aria-label="Decision dashboard" className={styles.decisionDialog} onCancel={e=>{e.preventDefault();closeRef.current();}}><div ref={screenRef} className={`${styles.app} ${styles.decisionScreen} ${pageContent?styles.decisionPages:actionRail?styles.decisionWithRail:''}`}>
    <header className={styles.decisionHeader}>
      <div>
        <h1>{title==='Outbreak operation'?'Outbreak situation':title}</h1>
        <p>
          Reports through {epi?.date||'date unavailable'} · {freshness}
          {situationStatus&&<> · <strong style={{color:situationColors[situationStatus]}}>{situationLabels[situationStatus]}</strong></>}
        </p>
      </div>
      <div className={styles.decisionHeaderRight}>
        {onView&&<nav className={styles.decisionViewTabs} aria-label="Dashboard views">
          {MONITORING_PAGES.map(([id,label])=><button key={id} type="button" aria-pressed={view===id} onClick={()=>onView(id)}>{label}</button>)}
        </nav>}
        <div className={styles.decisionHeaderActions}>
          <button onClick={onAnalysis}>Deep analysis</button>
          <button onClick={onClose} aria-label="Exit full-screen dashboard">Exit</button>
        </div>
      </div>
    </header>
    {pageContent?<div className={styles.decisionPageContent}>{pageContent}</div>:<>
    <section className={styles.decisionMessages} aria-label="Decision key messages">
      <div><h2>What matters now</h2>{messages.map((text,i)=><p key={i}>{text}</p>)}</div>
      <div className={styles.decisionNew}>
        <h2>Newly reporting zones</h2>
        {alerts.length?<p>{alerts.map((a,i)=><span key={a.location}>{i>0?' · ':''}<button onClick={()=>onSelect(a.location)}>{a.location}</button> <small>{a.date}</small></span>)}</p>:<p>{epi?'No first positive reports identified.':'Case history unavailable.'}</p>}
        <small>First positive in available history · last {alertDays} reporting days</small>
      </div>
    </section>

    <div className={styles.decisionCards} aria-label="Decision headline numbers">
      {cards.map(([label,value,sub])=><div key={label} style={label.includes('First reports')&&alerts.length>0?{borderTop:'3px solid #c43b30'}:undefined}><strong>{value}</strong><span>{label}</span>{sub&&<small style={{display:'block',fontSize:'11px',color:label.includes('First reports')?'#c43b30':'#7a9aaa',marginTop:'4px'}}>{sub}</small>}</div>)}
    </div>

    {actionRail}

    <div className={styles.decisionMain}>
      <FocusSection headingLevel={2} className={`${styles.decisionPanel} ${styles.decisionMap}`} label="Decision map" title="Where cases are reported" actions={(province||location)?<button onClick={onClear}>Show all areas</button>:null}><OutbreakMap presentation geometry={geometry} rows={epi?.zones||[]} level={epi?.dataset.level} kind="cumulative" unit="confirmed cases" boundaryLevel={boundaryLevel} selected={location} onSelect={onSelect} label="Reported cumulative cases" asOf={asOf} source={epi?.dataset.source||epi?.dataset.url} focusNames={focus} highlightNames={alerts.map(a=>a.location)} groupLabels callout={callout}/></FocusSection>
      <FocusSection headingLevel={2} className={styles.decisionPanel} label="Decision mobility" title="Population mobility"><div className={styles.decisionScroll}><DashboardMobility {...mobilityProps}/></div></FocusSection>
    </div>
    <div className={styles.decisionMain}>
      <FocusSection headingLevel={2} className={styles.decisionPanel} label="Decision province coverage" title="Province coverage">
        <div className={styles.decisionScroll}>
          {coverageRows.length?<table><thead><tr><th>Province</th><th>Cases</th><th>Affected / total HZ</th><th>Affected</th></tr></thead>
            <tbody>{coverageRows.map(r=>{
              const priority=provincePriority.get(r.province);
              return <tr key={r.province} aria-selected={province===r.province}>
                <td>
                  <button onClick={()=>onProvince(r.province)}>{r.province}</button>
                  {priority&&<span className={`${styles.priorityBadge} ${styles[`priority_${priority}`]}`}>{priority==='high'?'High':'Watch'}</span>}
                </td>
                <td>{number(r.cases)}{r.missing>0&&r.reported>0&&<small>Partial</small>}</td>
                <td>{r.reported?r.affected:'?'} / {r.total}</td>
                <td>{r.reported?`${r.percent.toFixed(1)}%`:'Unknown'}</td>
              </tr>;
            })}</tbody>
          </table>:<p>{coverage?'No provinces have reported cases at this date.':'Province coverage unavailable.'}</p>}
        </div>
        <p className={styles.decisionNote}>Only provinces with reported cases shown. Affected = positive cumulative total. {missing>0?`${missing} health zones have no report at this date.`:'Missing data remains unknown.'}</p>
      </FocusSection>
      <FocusSection headingLevel={2} className={`${styles.decisionPanel} ${styles.decisionTrends}`} label="Decision health-zone trends" title={`Health-zone trends${province?` · ${province}`:''}${location?` / ${location}`:''}`}><p className={styles.decisionNote}>Weekly reported changes · darker = larger · purple = revisions · × = missing · * = partial week</p><div className={styles.decisionScroll}><ProvinceHorizon model={horizon} compact onSelect={onSelect} selected={location}/></div><p className={styles.decisionNote}>Only health zones with available weekly comparisons are shown.</p></FocusSection>
    </div>
    </>}
    <footer className={styles.decisionFooter}>Reported totals may be partial; cumulative cases are not current caseload. {epi?.dataset.label||'Case data unavailable'} · Cut-off {asOf}{coverage?.unmapped>0?` · ${coverage.unmapped} case locations unmatched`:''}</footer>
  </div></dialog>,document.body);
}
