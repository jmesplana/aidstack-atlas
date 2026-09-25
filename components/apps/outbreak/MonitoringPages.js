import { useEffect, useRef, useState } from 'react';
import { MONITORING_CONFIG, highBurdenMovements, trendExplanation, trendComparisonCsv } from '../../../lib/outbreak/monitoring';
import { formatValue, validDate } from '../../../lib/outbreak/data';
import { OutbreakMap, download } from './Visuals';
import DashboardMobility from './DashboardMobility';
import FocusSection from './FocusSection';
import styles from './outbreak.module.css';

const number=value=>Number.isFinite(value)?formatValue(Math.round(value*100)/100):'Unknown';
// Most concerning assessments first when sorting the comparisons table.
const TREND_ORDER=['rising','mixed','falling','declining','unchanged','revision','stale','unknown'];
export const MONITORING_PAGES=[['overview','Overview'],['burden','High burden & movement'],['reporting','Reporting history'],['trends','Case trends']];
export function MonitoringNavigation({view,onView}) {
  return <nav className={styles.monitorNavigation} aria-label="Dashboard views">{MONITORING_PAGES.map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>onView(id)}>{label}</button>)}</nav>;
}

// Small explanation popup. While open it is marked as a section-focus area so Escape
// closes the popup, not the full-screen dashboard or focused section around it.
function InfoPopover({label,children}) {
  const [open,setOpen]=useState(false),ref=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const outside=e=>{if(!ref.current?.contains(e.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  return <span ref={ref} className={styles.infoPopover} data-section-focus={open?'true':undefined} onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);ref.current.querySelector('button')?.focus();}}}>
    <button type="button" aria-expanded={open} aria-controls="trend-guide" onClick={()=>setOpen(!open)}>ⓘ How to read</button>
    {open&&<div id="trend-guide" role="dialog" aria-label={label} className={styles.infoPopoverPanel}><strong>{label}</strong>{children}</div>}
  </span>;
}

function ThresholdControl({value,onChange}) {
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  return <label>Sustained decline threshold (%)<input aria-label="Sustained decline threshold (%)" type="number" min="1" max="100" step="1" value={draft} onChange={e=>{setDraft(e.target.value);const n=Number(e.target.value);if(e.target.value&&Number.isFinite(n)&&n>=1&&n<=100)onChange(n);}} onBlur={()=>setDraft(String(value))}/></label>;
}

const timelineStyles={
  increase:{label:'Reported increase',color:'#e6aaa4'},
  quiet:{label:'Unchanged reports',color:'#91becb'},
  reported:{label:'Report; comparison unavailable',color:'#cadce4'},
  revision:{label:'Downward revision',color:'#b29bc9'},
  missing:{label:'No valid report',color:'#f0ca83'}
};
function ReportingTimeline({rows,model,onSelect,location}) {
  return <div className={styles.monitorTimeline} role="region" aria-label="Horizontal reporting history" tabIndex={0}>
    <table><caption>{model.settings.historyWeeks}-week reporting history · weeks ending at the reporting cut-off</caption><thead><tr><th>Health zone</th>{model.windows.map(w=><th key={w.end}>{w.start}<br/>to {w.end}</th>)}<th>Last valid report</th></tr></thead><tbody>{rows.map(r=><tr key={r.location} aria-selected={location===r.location}><th><button onClick={()=>onSelect(r.location)}>{r.location}</button><small>{r.province||(!r.matched?'Unmapped':'No province supplied')}</small></th>{r.timeline.map(w=>{
      const style=timelineStyles[w.status],description=`${r.location}: ${style.label}, ${w.start}–${w.end}${w.delta!==null?`; change ${number(w.delta)}`:''}${w.date?`; latest report ${w.date}`:''}`;
      return <td key={w.end}><button className={styles.historyCell} onClick={()=>onSelect(r.location)} style={{background:style.color}} title={description} aria-label={description}>{style.label}{w.delta!==null&&<strong>{w.delta>0?'+':''}{number(w.delta)}</strong>}</button></td>;
    })}<td>{r.lastReport||'Never available'}{r.age!==null&&<small>{r.age} days before cut-off</small>}</td></tr>)}</tbody></table>
  </div>;
}

export default function MonitoringPages({settings,onSettings,model,epi,geometry,boundaryLevel,asOf,location,province,focus,onSelect,mobilityProps,presentation=false}) {
  const change=patch=>onSettings({...settings,...patch});
  const [showIncomparable,setShowIncomparable]=useState(false),[trendFilter,setTrendFilter]=useState('');
  if(!model)return <p role="status">These views need cumulative case history at the same geographic level as the selected boundaries.</p>;
  const observed=model.rows.filter(r=>(r.hasHistory||r.location===location)&&(!province||r.province===province));
  const selected=model.rows.find(r=>r.location===location);
  const source=epi.dataset.url||epi.dataset.source;
  const map=(label,rows,categories)=> <OutbreakMap fillContainer presentation={presentation} geometry={geometry} rows={rows} level={epi.dataset.level} boundaryLevel={boundaryLevel} kind="reporting status" unit="" selected={location} onSelect={onSelect} label={label} asOf={asOf} source={source} focusNames={focus} categoryStyles={categories} groupLabels/>;
  const mapRows=(field,categories)=>model.rows.map(r=>({...r,date:asOf,category:r[field],detail:`${categories[r[field]].label}; last valid report: ${r.lastReport||'unavailable'}${r.age!==null?` (${r.age} days before cut-off)`:''}`}));
  if(settings.view==='burden') {
    const ranked=highBurdenMovements({...epi,zones:epi.zones.filter(z=>!province||z.province===province)},mobilityProps.data,asOf,settings);
    const area=location||ranked[0]?.location||'';
    const movementEligible=validDate(mobilityProps.data?.end)&&mobilityProps.data.end<=asOf;
    const direction=mobilityProps.direction||'outflow';
    return <section aria-label="High burden and movement" className={styles.monitorPage}>
      <div className={styles.controls}><label>Rank zones by<select value={settings.burdenMetric} onChange={e=>change({burdenMetric:e.target.value})}><option value="cumulative">Cumulative confirmed cases</option><option value="recent">Recent reported increase</option></select></label><label>Number of priority zones<select value={settings.topZones} onChange={e=>change({topZones:Number(e.target.value)})}>{[5,10,20].map(n=><option key={n} value={n}>Top {n}</option>)}</select></label></div>
      <p>Case reports: {epi.date}. Recent increase: {epi.baseline}–{epi.date}. Cumulative burden is not current caseload. Select a zone to inspect its movement connections.</p>
      <div className={styles.dashboardMain}>
        <FocusSection className={styles.panel} label="High burden map" title="Priority case zones"><OutbreakMap fillContainer presentation={presentation} geometry={geometry} rows={epi.zones} level={epi.dataset.level} boundaryLevel={boundaryLevel} kind="cumulative" unit="confirmed cases" selected={area} onSelect={onSelect} label="High burden zones" asOf={asOf} source={source} focusNames={ranked.filter(z=>z.matched).map(z=>z.location)} highlightNames={ranked.map(z=>z.location)}/></FocusSection>
        <FocusSection className={`${styles.panel} ${styles.dashboardMobilityPanel}`} label="High burden mobility" title={`Movement for ${area||'a priority zone'}`}><DashboardMobility {...mobilityProps} location={area} defaultLocation={ranked[0]?.location}/></FocusSection>
      </div>
      <FocusSection className={styles.panel} label="High burden connections" title="Case burden and leading movement connections">
        <p>{movementEligible?`Movement period: ${mobilityProps.data.start}–${mobilityProps.data.end} · ${mobilityProps.data.unit}.`:'No dated movement observations are eligible at this cut-off.'} Connections show historical movement estimates, not current travel or transmission.</p>
        <div className={styles.tableWrap}><table><thead><tr><th>Health zone</th><th>Cumulative cases</th><th>Recent change</th><th>{direction==='inflow'?'Leading origins':'Leading destinations'}</th></tr></thead><tbody>{ranked.map(z=><tr key={z.location} aria-selected={area===z.location}><td><button onClick={()=>onSelect(z.location)}>{z.location}</button><small>{z.province||(!z.matched?'Unmapped':'')}</small></td><td>{number(z.value)}</td><td>{number(z.delta)}</td><td>{(direction==='inflow'?z.incoming:z.outgoing).length?(direction==='inflow'?z.incoming:z.outgoing).map(r=><div key={`${r.origin}:${r.destination}`}>{direction==='inflow'?r.origin:r.destination}: {number(r.value)} {mobilityProps.data.unit}</div>):'No eligible positive connection available'}</td></tr>)}</tbody></table></div>
        {!ranked.length&&<p>No positive case observations available for this ranking.</p>}
      </FocusSection>
    </section>;
  }
  if(settings.view==='reporting') {
    const quiet=settings.reportingMode==='quiet',categories=quiet?MONITORING_CONFIG.quietCategories:MONITORING_CONFIG.gapCategories;
    const field=quiet?'quietStatus':'gapStatus';
    const flagged=observed.filter(r=>quiet?r.quietDays>=settings.historyWeeks*7:r.age>=settings.historyWeeks*7);
    const visible=settings.onlyFlagged?flagged:observed;
    return <section aria-label="Reporting history view" className={styles.monitorPage}>
      <div className={styles.controls}><label>Reporting measure<select value={settings.reportingMode} onChange={e=>change({reportingMode:e.target.value})}><option value="gaps">Missing valid reports</option><option value="quiet">No reported increase</option></select></label><label>History window<select value={settings.historyWeeks} onChange={e=>change({historyWeeks:Number(e.target.value)})}>{MONITORING_CONFIG.historyWeeks.map(n=><option key={n} value={n}>{n} weeks</option>)}</select></label><label><input type="checkbox" checked={settings.onlyFlagged} onChange={e=>change({onlyFlagged:e.target.checked})}/>Only zones with at least {settings.historyWeeks} weeks</label></div>
      <p><strong>{flagged.length} zones</strong> {quiet?'with continued reporting and no cumulative increase':'without a valid case report'} for at least {settings.historyWeeks} weeks. Reporting gaps are measured to {asOf}; unchanged runs end at each zone’s last valid report.</p>
      <div className={styles.dashboardMain}>
        <FocusSection className={styles.panel} label="Reporting status map" title={quiet?'Where cumulative totals are unchanged':'Where reports are missing'}>{map(quiet?'No reported increase':'Reporting gaps',mapRows(field,categories),categories)}{selected&&<p aria-label="Selected reporting status"><strong>{selected.location}:</strong> {categories[selected[field]].label}. Last valid report: {selected.lastReport||'unavailable'}.{quiet&&selected.quietDays!==null?` Unchanged for ${selected.quietDays} days (${selected.quietStart}–${selected.lastReport}).`:''}</p>}</FocusSection>
        <FocusSection className={styles.panel} label="Reporting timeline" title={`${settings.historyWeeks}-week horizontal history`}>
          <ReportingTimeline rows={visible} model={model} onSelect={onSelect} location={location}/>
          {!visible.length&&<p>No zones meet the current filter. Uncheck the filter to inspect all available histories.</p>}
          <p className={styles.helperText}>Cells show received reports and changes from the preceding report, not onset-based incidence. Missing values remain unknown. Selecting a row or cell highlights its zone on the map.</p>
        </FocusSection>
      </div>
      <p className={styles.helperText}>“No reported increase” requires unchanged cumulative totals with no gaps longer than {MONITORING_CONFIG.maximumReportGapDays} days, no missing values and a recent valid report. It does not mean no infections or that an outbreak has ended. A revision breaks an unchanged run. {model.unmapped} source locations cannot be mapped.</p>
    </section>;
  }
  const categories={...MONITORING_CONFIG.trendCategories,declining:{...MONITORING_CONFIG.trendCategories.declining,label:`Sustained decline ≥${settings.threshold}% each week`}};
  // Zones with no reported change in any period (all zero or unavailable) are hidden by default;
  // the selected zone always stays visible.
  const comparable=r=>r.observations.some(o=>o.delta!==null&&o.delta!==0);
  const incomparable=observed.filter(r=>!comparable(r)&&r.location!==location).length;
  const latestRate=r=>r.observations.at(-1)?.rate??-Infinity;
  const compared=observed.filter(r=>r.location===location||(trendFilter?r.status===trendFilter:showIncomparable||comparable(r)))
    .sort((a,b)=>TREND_ORDER.indexOf(a.status)-TREND_ORDER.indexOf(b.status)||latestRate(b)-latestRate(a)||a.location.localeCompare(b.location));
  const counts=TREND_ORDER.filter(status=>categories[status]).map(status=>({status,count:observed.filter(r=>r.status===status).length}));
  return <section aria-label="Case trend view" className={styles.monitorPage}>
    <div className={styles.controls}><ThresholdControl value={settings.threshold} onChange={threshold=>change({threshold})}/><p>Updates the map and key message immediately. Saved with your snapshot.</p></div>
    <div className={styles.monitorCounts} role="group" aria-label="Filter comparisons by assessment">{counts.map(({status,count})=><button type="button" key={status} aria-pressed={trendFilter===status} disabled={!count} onClick={()=>setTrendFilter(trendFilter===status?'':status)} style={{borderColor:categories[status].color}}><strong>{count}</strong> {categories[status].label}</button>)}</div>
    <div className={styles.trendTop}>
      <FocusSection className={styles.panel} label="Case trend map" title="Where reported case rates are changing">{map('Reported case trends',mapRows('status',categories),categories)}<section className={styles.trendSelected} aria-label="Selected case trend">{selected?(({steps,reason,caveat})=><>
          <h3>{selected.location}<small>{selected.province||''}</small></h3>
          <p><span className={styles.statusDot} style={{background:categories[selected.status].color}}/><strong>{categories[selected.status].label}</strong></p>
          {selected.observations.length>0&&<p>New reported cases by week: {selected.observations.map(o=>o.delta===null?'missing':`${number(o.delta)} (${number(o.rate)}/day)`).join(' → ')}</p>}
          <ul>{steps.map(st=><li key={st.label}>{st.label}: <strong>{st.change}</strong></li>)}</ul>
          <p>{reason}</p>{caveat&&<p className={styles.trendCaveat}>⚠ {caveat}</p>}
        </>)(trendExplanation(selected,settings.threshold)):<p className={styles.helperText}>Select a health zone on the map or in the table to see how its assessment was reached.</p>}</section></FocusSection>

      <FocusSection className={styles.panel} label="Case trend comparisons" title="Two successive weekly comparisons" actions={<><InfoPopover label="How to read these trends"><ul>
        <li><strong>Weeks 1–3</strong> are the last three reporting periods (dates in the column headers). Each shows new reported cases (the increase in the cumulative total) and the <strong>daily rate</strong>: cases ÷ days in the period.</li>
        <li>Daily rates are compared because periods can be 6, 7 or 8 days long. <strong>Week 1 → 2</strong> compares week 2's daily rate with week 1's; <strong>Week 2 → 3</strong> compares week 3 with week 2. Example: 2.71/day → 3.17/day is +16.67%.</li>
        <li><strong>Rising</strong>: week 3's daily rate is higher than week 2's, by any amount. <strong>Sustained decline</strong>: the rate fell by at least {settings.threshold}% in both comparisons.</li>
        <li>A <span className={styles.trendCaveatText}>⚠ note</span> marks zones where the rate is up only because week 3 is a shorter period; reported cases did not increase.</li>
      </ul></InfoPopover>{compared.length>0&&model.periods.length>0&&<button type="button" onClick={()=>download(`case-trends_${asOf}${trendFilter?`_${trendFilter}`:''}.csv`,'\ufeff'+trendComparisonCsv(compared,model,categories),'text/csv;charset=utf-8')}>Export CSV ({compared.length})</button>}</>}>{trendFilter&&<p className={styles.helperText} role="status">Showing {categories[trendFilter].label.toLowerCase()} only. <button type="button" onClick={()=>setTrendFilter('')}>Show all assessments</button></p>}{!trendFilter&&incomparable>0&&<label className={styles.inlineCheck}><input type="checkbox" checked={showIncomparable} onChange={e=>setShowIncomparable(e.target.checked)}/>Show {incomparable} health zones with no reported change in these weeks</label>}<div className={styles.tableWrap}><table className={styles.trendTable}><thead><tr><th>Health zone</th>{model.periods.map((p,i)=><th key={p.end} className={styles.weekHead} title={`${p.start} to ${p.end}, ${p.days} days. New reported cases and daily rate.`}>Week {i+1}<small>{p.start.slice(5)} → {p.end.slice(5)}</small><small>{p.days} days</small></th>)}<th className={styles.changeHead}>Change in daily rate</th><th className={styles.assessmentHead}>Assessment</th></tr></thead><tbody>{compared.map(r=><tr key={r.location} aria-selected={location===r.location}><td><button onClick={()=>onSelect(r.location)}>{r.location}</button><small>{r.province||(!r.matched?'Unmapped':'')}</small></td>{r.observations.map(o=><td key={o.end}>{number(o.delta)}<small>{o.rate!==null?`${number(o.rate)} / day`:'Missing report'}</small></td>)}{(({steps,reason,caveat})=><><td>{steps.map(st=><span key={st.label} className={styles.rateStep}><small>{st.label.replace('Week ','Wk ')}</small><strong>{st.change}</strong></span>)}</td><td><span className={styles.statusDot} style={{background:categories[r.status].color}}/>{categories[r.status].label}<small className={styles.trendReason}>{reason}</small>{caveat&&<small className={styles.trendCaveat}>⚠ {caveat}</small>}</td></>)(trendExplanation(r,settings.threshold))}</tr>)}</tbody></table></div>{model.periods.length>0&&!compared.length&&<p>{trendFilter?`No health zones are assessed as ${categories[trendFilter].label.toLowerCase()}.`:'No health zones reported a change in these periods.'}</p>}{!model.periods.length&&<p>Three consecutive reporting intervals are unavailable. Four cumulative reports approximately one week apart are required.</p>}</FocusSection>
    </div>
    <p className={styles.helperText}>Comparisons use changes in cumulative counts over actual 6–8 day reporting intervals, divided by interval length so unequal periods are comparable. These are reported accumulation rates, not infection rates. A zero baseline has no percentage decline. Missing endpoints, explicit missing values, stale reports and downward revisions cannot establish improvement. Map colours describe reported evidence, not transmission risk. {model.unmapped} source locations cannot be mapped.</p>
  </section>;
}
