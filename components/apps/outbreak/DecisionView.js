import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import DashboardMobility from './DashboardMobility';
import FocusSection from './FocusSection';
import { OutbreakMap } from './Visuals';
import { ProvinceHorizon } from './AreaHistory';
import { formatValue } from '../../../lib/outbreak/data';
import styles from './outbreak.module.css';

const number=value=>Number.isFinite(value)?formatValue(value):'Unknown';

export default function DecisionView({ screenRef, title, epi, geometry, boundaryLevel, message, coverage, horizon, alerts, alertDays, asOf, location, province, focus, callout, onSelect, onProvince, onClear, onClose, onAnalysis, freshness, mobilityProps }) {
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
      const nodes=[...screenRef.current.querySelectorAll('button, select, a[href], [tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    };
    document.addEventListener('fullscreenchange',fullscreen);
    document.addEventListener('keydown',keyboard,true);
    return()=>{background.forEach(({el,inert,hidden})=>{el.inert=inert;if(hidden===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',hidden);});document.body.style.overflow=overflow;dialog.close();document.removeEventListener('fullscreenchange',fullscreen);document.removeEventListener('keydown',keyboard,true);previous?.focus?.();};
  },[screenRef]);
  const messages=message.text.split(/\n\s*\n/).slice(0,2);
  const coverageRows=coverage?.rows.filter(r=>r.cases>0)||[];
  const missing=coverage?.rows.reduce((sum,r)=>sum+r.missing,0);
  const cards=[['Reported cumulative cases',epi?.zones.some(z=>z.value!==null)?number(epi.total):'Unknown'],['Health zones with cases',epi?.dataset.level==='health_zone'?number(epi.affected.length):'Unknown'],[`First reports · ${alertDays} days`,epi?.dataset.level==='health_zone'?number(alerts.length):'Unknown'],['Health zones reporting',coverage?`${coverage.rows.reduce((n,r)=>n+r.reported,0)} / ${coverage.rows.reduce((n,r)=>n+r.total,0)}`:'Unknown']];
  return createPortal(<dialog ref={dialogRef} aria-label="Decision dashboard" className={styles.decisionDialog} onCancel={e=>{e.preventDefault();closeRef.current();}}><div ref={screenRef} className={`${styles.app} ${styles.decisionScreen}`}>
    <header className={styles.decisionHeader}><div><h1>{title==='Outbreak operation'?'Outbreak situation':title}</h1><p>Reports through {epi?.date||'date unavailable'} · {freshness}</p></div><div><button onClick={onAnalysis}>Deep analysis</button><button onClick={onClose} aria-label="Exit full-screen dashboard">Exit full screen</button></div></header>
    <section className={styles.decisionMessages} aria-label="Decision key messages"><div><h2>What matters now</h2>{messages.map((text,i)=><p key={i}>{text}</p>)}</div><div className={styles.decisionNew}><h2>Newly reporting zones</h2>{alerts.length?<p>{alerts.map((a,i)=><span key={a.location}>{i>0?' · ':''}<button onClick={()=>onSelect(a.location)}>{a.location}</button> <small>{a.date}</small></span>)}</p>:<p>{epi?'No first positive reports identified.':'Case history unavailable.'}</p>}<small>First positive in available history · last {alertDays} reporting days</small></div></section>
    <div className={styles.decisionCards} aria-label="Decision headline numbers">{cards.map(([label,value])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <div className={styles.decisionMain}>
      <FocusSection headingLevel={2} className={`${styles.decisionPanel} ${styles.decisionMap}`} label="Decision map" title="Where cases are reported" actions={(province||location)?<button onClick={onClear}>Show all areas</button>:null}><OutbreakMap presentation geometry={geometry} rows={epi?.zones||[]} level={epi?.dataset.level} kind="cumulative" unit="confirmed cases" boundaryLevel={boundaryLevel} selected={location} onSelect={onSelect} label="Reported cumulative cases" asOf={asOf} source={epi?.dataset.source||epi?.dataset.url} focusNames={focus} highlightNames={alerts.map(a=>a.location)} groupLabels callout={callout}/></FocusSection>
      <FocusSection headingLevel={2} className={styles.decisionPanel} label="Decision mobility" title="Population mobility"><div className={styles.decisionScroll}><DashboardMobility {...mobilityProps}/></div></FocusSection>
    </div>
    <div className={styles.decisionMain}>
      <FocusSection headingLevel={2} className={styles.decisionPanel} label="Decision province coverage" title="Province coverage"><div className={styles.decisionScroll}>{coverageRows.length?<table><thead><tr><th>Province</th><th>Cases</th><th>Affected / total HZ</th><th>Affected</th></tr></thead><tbody>{coverageRows.map(r=><tr key={r.province} aria-selected={province===r.province}><td><button onClick={()=>onProvince(r.province)}>{r.province}</button></td><td>{number(r.cases)}{r.missing>0&&r.reported>0&&<small>Partial</small>}</td><td>{r.reported?r.affected:'?'} / {r.total}</td><td>{r.reported?`${r.percent.toFixed(1)}%`:'Unknown'}</td></tr>)}</tbody></table>:<p>{coverage?'No provinces have reported cases at this date.':'Province coverage unavailable.'}</p>}</div><p className={styles.decisionNote}>Only provinces with reported cases are shown. Affected = reported cumulative cases. Totals use loaded boundaries; province completeness is unverified. {missing>0?`${missing} health zones have no report at this date.`:'Missing data remains unknown.'}</p></FocusSection>
    <FocusSection headingLevel={2} className={`${styles.decisionPanel} ${styles.decisionTrends}`} label="Decision health-zone trends" title={`Health-zone trends${province?` · ${province}`:''}${location?` / ${location}`:''}`}><p className={styles.decisionNote}>Weekly reported changes · darker = larger · purple = revisions · × = missing · * = partial week</p><div className={styles.decisionScroll}><ProvinceHorizon model={horizon} compact/></div><p className={styles.decisionNote}>Only health zones with available weekly comparisons are shown.</p></FocusSection>
    </div>
    <footer className={styles.decisionFooter}>Reported totals may be partial; cumulative cases are not current caseload. {epi?.dataset.label||'Case data unavailable'} · Cut-off {asOf}{coverage?.unmapped>0?` · ${coverage.unmapped} case locations unmatched`:''}</footer>
  </div></dialog>,document.body);
}
