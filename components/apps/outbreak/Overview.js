import {nationalEvidence,formatValue} from '../../../lib/outbreak/data';
import {recommendations,proposalSelected} from '../../../lib/outbreak/overview';
import {TrendChart,HorizontalBars,NationalTrendChart,NATIONAL_SERIES} from './Visuals';
import Delta from './Delta';
import styles from './outbreak.module.css';
export default function Overview({datasets,epi,security,mining,asOf,onSelect,onDecision,selectedArea,routeData,actions=[],onData}) {
  const national=datasets.filter(d=>d.level==='national'&&d.status==='ready');
  const facts=nationalEvidence(national,asOf);
  const nationalTrend=national.find(d=>/^(national_)?cumulative_confirmed_cases$/.test(d.metricId||''));
  const trend=nationalTrend||epi?.dataset;
  const trendArea=nationalTrend?nationalTrend.records.find(r=>r.date<=asOf)?.location:epi?.zones.some(z=>z.location===selectedArea)?selectedArea:epi?.burden[0]?.location;
  const suggestions=recommendations(epi,security,mining,routeData,asOf);
  const nationalCount=NATIONAL_SERIES.filter(def=>national.some(d=>def.match.test(d.metricId||d.id||''))).length;
  return <>
    <section className={styles.panel} aria-label="Overall snapshot"><h3>Overall snapshot</h3>
      <div className={styles.cards}>{facts.map(f=><article key={f.id}><span>{f.label}</span><strong>{formatValue(f.value)}</strong>{f.delta!==null&&f.delta!==undefined?<small><Delta delta={f.delta} rising={!/recover/i.test(f.label)}/> since {f.since}</small>:null}<small>Reported {f.date}</small></article>)}{!facts.length&&epi&&<article><span>Reported cases across loaded areas</span><strong>{formatValue(epi.total)}</strong><small>{epi.date} · area-level sum; national total unavailable</small></article>}{epi&&<article><span>Areas reporting cases</span><strong>{epi.affected.length}</strong><small>{epi.date} · cumulative reports, not currently active areas</small></article>}</div>
      {!facts.length&&!epi&&<div className={styles.emptyStart}><p>Start with your case data to see the situation and prepare a report.</p><button className={styles.primaryAction} onClick={onData}>Add case data</button></div>}
      {epi&&<p>{epi.growth.length?<>{epi.growth.filter(z=>z.delta>0).length>0?<span className={styles.trendAdverse}>▲ {epi.growth.filter(z=>z.delta>0).length} {epi.growth.filter(z=>z.delta>0).length===1?'area has':'areas have'} higher reported totals</span>:<span>No areas have higher reported cumulative totals</span>} than seven days earlier. A comparison is available for {epi.growth.length} of {epi.zones.length} reporting areas. Unchanged totals and downward revisions do not establish improvement.</>:'Seven-day change is unavailable: paired observations are missing.'}</p>}
      <details><summary>Mobility, security and mining context</summary><div className={styles.contextGrid}><article><strong>Mobility</strong><p>{routeData?`Connections observed ${routeData.start}–${routeData.end}. ${routeData.end>asOf?'After this reporting cut-off; excluded from analysis.':'Explore origins and destinations by area.'}`:'No origin–destination data loaded.'}</p></article><article><strong>Security</strong><p>{security?`${security.records.length} loaded events during ${security.start}–${security.end}. Access effects need field confirmation.`:'No security events loaded for analysis.'}</p></article><article><strong>Mining</strong><p>{mining?`${mining.matched} historical mine sites matched to the boundaries. Current activity is unverified.`:'No mining overlap available.'}</p></article></div>
      <p className={styles.scope}>Response capacity and unmet needs require dated operational data; they cannot be inferred from case counts.</p></details>
    </section>
    <section className={styles.panel} aria-label="Trends"><h3>Trends</h3><p>{nationalCount>=2?'Reported national indicators over time — cases, deaths, recoveries and isolation on one scale.':nationalTrend?'Reported national totals over time.':'Area trend: select an area below to change this chart.'} Rising cumulative totals show additional reports, not the timing of new infections.</p>
      {nationalCount>=2?<NationalTrendChart datasets={national} asOf={asOf} source={national[0]?.source||national[0]?.url}/>:trend&&trendArea?<TrendChart records={trend.records} location={trendArea} label={trend.label} unit={trend.unit} kind={trend.kind} asOf={asOf} source={trend.source||trend.url}/>:<p>A dated case series is needed to show a trend.</p>}
    </section>
    <section className={styles.panel} aria-label="Areas to review"><h3>Areas to review</h3><p>Compare total reported burden with the latest seven-day change. Select a bar to explore an area’s trend and movement connections.</p>
      {epi?<><div className={styles.chartGrid}><HorizontalBars title="Most reported cases" subtitle={`Cumulative totals · ${epi.date}`} rows={epi.burden} source={epi.dataset.source||epi.dataset.url} onSelect={onSelect}/><HorizontalBars title="Largest recent increases" subtitle={`${epi.baseline}–${epi.date} · changes in reported totals`} rows={epi.growth.filter(z=>z.delta>0).map(z=>({...z,value:z.delta}))} color="#c96a37" source={epi.dataset.source||epi.dataset.url} onSelect={onSelect}/></div><p className={styles.scope}>{epi.missing} missing values and {epi.absent} previously observed areas without a record on {epi.date}. Missing comparisons are excluded.</p></>:<p>Area-level case data is needed to identify these areas.</p>}
    </section>
    <section className={styles.panel} aria-label="Suggested actions"><h3>Suggested actions</h3><p>Select the proposals you want to take forward. Continue reviewing here, then edit or remove selections in Actions. Confirm conditions with the response teams before assigning resources.</p>
      {suggestions.map(s=>{const selected=proposalSelected(actions,s);return <article className={styles.source} key={s.title}><h4>{s.title}</h4><p><strong>Why:</strong> {s.why}</p><p>{s.action}</p><button type="button" aria-pressed={selected} disabled={selected} className={selected?styles.selectedProposal:undefined} onClick={()=>onDecision(s)}>{selected?'✓ Selected for response plan':'Add to response plan'}</button><span role="status" className={styles.proposalStatus}>{selected?'You can edit this action later in Actions.':''}</span></article>;})}{!suggestions.length&&<p>There is not enough evidence to suggest area-specific actions.</p>}
    </section>
  </>;
}
