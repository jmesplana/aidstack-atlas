import {nationalEvidence,formatValue} from '../../../lib/outbreak/data';
import {recommendations,proposalSelected} from '../../../lib/outbreak/overview';
import {caseTrend} from '../../../lib/outbreak/caseTrend';
import styles from './outbreak.module.css';
export default function BriefSummary({epi,datasets,security,mining,routeData,hazards,asOf,highlights,sourceFor,actions=[]}) {
  const totals=nationalEvidence(datasets,asOf);
  const suggestions=recommendations(epi,security,mining,routeData,asOf).filter(s=>!proposalSelected(actions,s)&&!actions.some(a=>a.action?.includes(s.action))).slice(0,3);
  const largest=epi?.burden.filter(z=>z.value>0).slice(0,3)||[],growing=epi?.growth.filter(z=>z.delta>0).slice(0,3)||[];
  const source=epi?.dataset.url||epi?.dataset.source;
  return <>
    <h3>Current situation</h3><div className={styles.cards}>{totals.map(f=><article key={f.id}><span>{f.label.replace(/^National /,'')}</span><strong>{formatValue(f.value)}</strong><small>{f.date}</small></article>)}{!totals.length&&epi&&<article><span>Reported area-level total</span><strong>{formatValue(epi.total)}</strong><small>{epi.date} · national total unavailable</small></article>}</div>
    <p><strong>Trend:</strong> {caseTrend({datasets,epi,asOf})}</p>
    {epi?<><p><strong>Recent area changes:</strong> {growing.length?<>{growing.map((z,i)=><span key={z.location}>{i?', ':''}{z.location} <span className={styles.trendAdverse}>▲ +{formatValue(z.delta)}</span></span>)} in reported cumulative totals between {epi.baseline} and {epi.date}.</>:epi.growth.length?<span>No increases among areas with paired observations; unchanged totals and downward revisions do not establish improvement.</span>:'Seven-day comparisons unavailable.'}</p><p><strong>Concentration:</strong> {largest.length?largest.map(z=>`${z.location} (${formatValue(z.value)})`).join(', '):'No positive values reported'} — cumulative cases as of {epi.date}.</p><small>{/^https?:\/\//.test(source||'')?<a href={source}>Case data source</a>:source} · {epi.growth.length}/{epi.zones.length} areas have paired observations; {epi.absent} previously observed areas are absent on the latest date.</small></>:highlights.slice(0,3).map(f=><p key={f.id}>{f.text}<small>{/^https?:\/\//.test(sourceFor(f)||'')?<a href={sourceFor(f)}>Source</a>:sourceFor(f)}</small></p>)}
    <h3>{actions.length?'Additional actions to consider':'Actions to consider'}</h3>{suggestions.length?<ol>{suggestions.map(s=><li key={s.title}><strong>{s.title} — {s.areas.join(', ')}</strong><p>{s.action}</p><small>Basis: {s.why}</small></li>)}</ol>:<p>{actions.length?'No additional suggestions beyond the response plan.':'No area-specific suggestions can be supported by the loaded evidence.'}</p>}
    <h3>Context and gaps</h3><ul>
      <li>{routeData?`Mobility observations end ${routeData.end}${routeData.end>asOf?' (after this cut-off; excluded)':''}. They describe connections, not imported infections.`:'Mobility routes are not loaded. Add an origin–destination dataset to assess receiving connections.'}</li>
      <li>{mining?`${mining.matched} historical mining sites matched to the boundaries; current activity needs verification.`:'Mining context is unavailable. Load mining-site data to assess community coverage.'}</li>
      <li>{security?.records.length?`${security.records.length} loaded security events during ${security.start}–${security.end}; access effects need field confirmation.`:'Security analysis is unavailable. Upload or enable ACLED in the main app.'}</li>
      <li>{hazards.events.length?`${hazards.events.length} recent GDACS alert centres fall inside the uploaded boundaries. Check concurrent hazards when planning access.`:'No recent GDACS alert centres matched to this geography. Check the main-app feed and geographic coverage; this does not establish absence of hazards.'}</li>
    </ul>
    <p className={styles.scope}>Reported changes may include revisions. Missing values are not zero. Cumulative counts do not measure active caseloads, and spatial overlap does not establish transmission.</p>
  </>;
}
