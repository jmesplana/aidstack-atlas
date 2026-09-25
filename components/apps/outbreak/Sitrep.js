import { forwardRef, useMemo } from 'react';
import { epiWeek, formatValue, nationalEvidence, latestPerLocation } from '../../../lib/outbreak/data';
import { sitrepEpidemiology, sitrepContext, risingReports, SITREP_SECTIONS } from '../../../lib/outbreak/sitrep';
import { caseTrend } from '../../../lib/outbreak/caseTrend';
import { provinceCoverage, provinceHorizon, activityMessages } from '../../../lib/outbreak/areaHistory';
import { ProvinceCoverage, ProvinceHorizon, AreaHistoryTable } from './AreaHistory';
import { SITREP_CSS } from '../../../lib/outbreak/sitrepPrint';
import { recommendations, proposalSelected } from '../../../lib/outbreak/overview';
import { responseStatus } from '../../../lib/outbreak/response';
import { evidenceReadiness } from '../../../lib/outbreak/briefing';
import { AI_DOCUMENT_DISCLAIMER } from '../../../lib/outbreak/documentInsights';
import { OutbreakMap, NationalTrendChart, TrendChart, NATIONAL_SERIES } from './Visuals';
import Routes from './Routes';
import { BriefChanges, EvidenceReadiness } from './BriefWorkflow';
import { MobilityPanel } from './Integrated';

const number = value => Number.isFinite(value) ? formatValue(value) : 'Not available';
const signed = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${formatValue(value)}` : 'Not comparable';
const sourceOf = value => value?.url || value?.source || 'Source not supplied';
const noop = () => {};
function Source({ value, label }) { return <small>Source: {/^https?:\/\//.test(value || '') ? <a href={value}>{label || value}</a> : value || 'Not supplied'}</small>; }
function Unavailable({ children }) { return <p className="report-unavailable">{children}</p>; }

function WeeklyChart({ periods, dataset, location }) {
  const values = periods.map(p => p.value).filter(Number.isFinite);
  if (!values.length) return <Unavailable>Weekly chart unavailable: the required observations are missing for these reporting periods.</Unavailable>;
  const min = Math.min(0, ...values), max = Math.max(1, ...values), y = value => 165 - (value - min) / (max - min) * 125;
  return <figure className="report-weekly"><h3>{dataset.kind === 'daily' ? 'Seven-day reported cases' : 'Changes in reported totals'} — {location}</h3>
    <svg viewBox="0 0 640 225" role="img" aria-label={`Reported case ${dataset.kind === 'daily' ? 'totals' : 'changes'} for ${location}`}>
      <title>Actual reporting intervals are labelled; missing observations are not filled.</title>
      <line x1="40" x2="628" y1={y(0)} y2={y(0)} stroke="#9babb8"/>
      {periods.map((period,i) => { const x = 48 + i * 73; return <g key={period.end}>
        {period.value === null ? <text x={x+25} y="100" textAnchor="middle" fontSize="10" fill="#52616d">No data</text> : <>
          <rect x={x} y={Math.min(y(0),y(period.value))} width="48" height={Math.max(1,Math.abs(y(period.value)-y(0)))} fill={period.value < 0 ? '#86538a' : i === periods.length-1 ? '#bb202b' : '#214f70'}/>
          <text x={x+24} y={period.value < 0 ? y(period.value)+13 : y(period.value)-6} textAnchor="middle" fontSize="11" fill="#202932">{number(period.value)}</text>
        </>}
        <text x={x+24} y="202" textAnchor="middle" fontSize="10" fill="#52616d">{period.end.slice(5)}</text>
        <text x={x+24} y="218" textAnchor="middle" fontSize="9" fill="#52616d">{period.start.slice(5)} · {period.days}d</text>
      </g>; })}
    </svg>
    <figcaption>Periods ending on each date; {dataset.kind === 'daily' ? 'all seven daily reports are required.' : 'cumulative comparisons prefer seven days, then six, then eight. Each bar shows its actual start date and duration; unequal durations are not directly comparable. Negative bars are downward revisions, not negative incidence.'} Anchored to the latest case reporting date, not calendar epidemiological weeks.</figcaption>
    <Source value={sourceOf(dataset)} label={dataset.label}/>
  </figure>;
}

const Sitrep = forwardRef(function Sitrep({ name, asOf, reviewed, options, openingMessage, datasets, epi,
  geometry, boundaryLevel, boundarySource, selected, selectedLocation, mining, mines, eligibleMines,
  security, routeData, briefDirection, movementOverlays, actions, since, reports, findings, hazards,
  includeAppendix, includeEvidenceDates, facts, highlights, evidenceSource, mobilityLayers, selectedMobility, movementDirection }, ref) {
  const weekly = useMemo(() => sitrepEpidemiology(datasets, epi, geometry, boundaryLevel, asOf), [datasets,epi,geometry,boundaryLevel,asOf]);
  const coverage = useMemo(() => provinceCoverage(epi,geometry,boundaryLevel), [epi,geometry,boundaryLevel]);
  const horizon = useMemo(() => provinceHorizon(epi,coverage), [epi,coverage]);
  const national = nationalEvidence(datasets,asOf);
  const nationalSeries = NATIONAL_SERIES.filter(def => datasets.some(d => d.status === 'ready' && d.level === 'national' && def.match.test(d.metricId || d.id || ''))).length;
  const context = useMemo(() => sitrepContext(epi,mining,security,routeData,boundaryLevel,asOf,actions,hazards.events), [epi,mining,security,routeData,boundaryLevel,asOf,actions,hazards]);
  const suggestions = recommendations(epi,security?{...security,byZone:new Map(context.securityRows)}:null,mining?{...mining,byZone:new Map(context.miningRows)}:null,routeData,asOf).filter(s => !proposalSelected(actions,s));
  const burden = epi?.burden.filter(z=>z.value>0).slice(0,3) || [];
  const { securityRows, miningRows } = context;
  const caseAt = location => epi?.dataset.level === boundaryLevel ? epi?.zones.find(z=>z.location===location)?.value : null;
  const mapDataset = epi?.dataset || selected;
  const mapRows = epi?.zones || [];
  const mobilityAreas = options.mobilityAreas?.length ? options.mobilityAreas : [selectedLocation || routeData?.routes[0]?.origin].filter(Boolean);
  const comparisonRows = weekly.rows.filter(r => [r.previous,r.current,r.total].some(Number.isFinite));
  const unavailableRows = weekly.rows.filter(r => !comparisonRows.includes(r));
  const assessment = openingMessage.origin === 'Coordinator message' ? openingMessage.text : caseTrend({datasets,epi,asOf:weekly.end});
  const response = responseStatus(datasets,actions,asOf);
  const sectionTitle = id => `${SITREP_SECTIONS.findIndex(([key])=>key===id)+1}. ${SITREP_SECTIONS.find(([key])=>key===id)[1]}`;
  const note = id => options.notes?.[id]?.trim() ? <p className="report-text">{options.notes[id]}</p> : null;
  const map = (label,rows,unit,points=[],events=[]) => geometry ? <figure><OutbreakMap geometry={geometry} rows={rows} level={boundaryLevel} boundaryLevel={boundaryLevel} kind="snapshot" unit={unit} mines={points} events={events} selected="" onSelect={noop} label={label} asOf={asOf} source={label.includes('Mining')?sourceOf(mines):'Uploaded ACLED records'}/></figure> : <Unavailable>Map unavailable: matching administrative boundaries have not been supplied.</Unavailable>;
  return <article ref={ref} className="sitrep" data-week={epiWeek(asOf).label} aria-label="Sitrep print preview">
    <style>{SITREP_CSS}</style>
    <header>
      <div className="report-kicker"><span>SITUATION REPORT</span><span>{epiWeek(asOf).label} · Week {epiWeek(asOf).week} update</span></div>
      <h1>{name}</h1><p className="report-subtitle">Integrated Epidemiology, Mobility, Mining &amp; Security Briefing Note</p>
      <p className="report-meta">Published: {options.publishedOn || asOf} · Reporting cut-off: {asOf}<br/>
        Epidemiology: {epi || national.length ? weekly.end : 'not available'} · Mobility: {routeData ? `${routeData.start}–${routeData.end}` : 'not available'} · Security: {security ? `${security.start}–${security.end}` : 'not available'}</p>
      <p className="report-meta"><strong>{reviewed ? 'Reviewed by user' : 'DRAFT — requires coordinator review'}</strong>{options.preparedBy ? ` · Prepared by ${options.preparedBy}` : ''}</p>
    </header>
    <section className="report-summary" aria-label="Key message"><h2>Situation assessment</h2>
      {assessment.split(/\n\s*\n/).map((text,i)=><p key={i}>{text}</p>)}
      {openingMessage.origin !== 'Coordinator message' && activityMessages(epi?.activity).map(text=><p key={text}>{text}</p>)}
      {openingMessage.highlights?.length>0&&<div aria-label="Area monitoring summary"><h3>Area monitoring</h3>{openingMessage.highlights.map(h=><p key={h.view}>{h.text}</p>)}<small>Trend comparisons use changes in cumulative reports per day over actual 6–8 day reporting intervals. Missing values and revisions cannot establish improvement.</small></div>}
      <ul className="report-priorities">
        <li><strong>Burden:</strong> {burden.length ? burden.map(z=>`${z.location}${z.province?` (${z.province})`:''}: ${number(z.value)}`).join('; ') + ` cumulative cases (${epi.date}). Confirm current workload before allocating capacity.` : 'Area-level case evidence unavailable.'}</li>
        <li><strong>Rising reports:</strong> {risingReports(epi)}</li>
        <li><strong>Access:</strong> {securityRows.length ? `${securityRows.slice(0,3).map(([location])=>location).join(', ')}. Verify whether recorded insecurity affects alerts, sample transport and referrals.` : 'No access priority established from matched security and case evidence.'}</li>
      </ul>
      {openingMessage.origin==='Coordinator message' && <small>Coordinator assessment</small>}
    </section>
    {since && <BriefChanges since={since}/>}

    <section id="sitrep-epidemiology" className="report-section"><h2>{sectionTitle('epidemiology')}</h2>{note('epidemiology')}
      <div className="report-metrics" aria-label="Latest reported indicators">{national.map(f=><article key={f.id}><span>{f.label.replace(/^National\s+/i,'')}</span><strong>{number(f.value)}</strong><small>{f.date}</small></article>)}
        {!national.length && epi && <article><span>Reported area-level total</span><strong>{number(epi.total)}</strong><small>{epi.date} · national total unavailable</small></article>}
        {epi && <article><span>Areas reporting cases</span><strong>{epi.affected.length}</strong><small>{epi.date}</small></article>}
      </div>
      <small>National indicators are reported separately from area counts. Cumulative cases do not measure current caseload; areas reporting cumulative cases are not necessarily currently active.</small>
      {comparisonRows.length ? <table><caption>Reporting periods through {weekly.end}; reporting cut-off {asOf}. Cumulative comparisons prefer seven days, then six, then eight; actual dates and durations are shown. Daily sources require complete seven-day sums. Changes between periods are shown only for equal durations.</caption><thead><tr><th>Province / scope</th><th>Previous period</th><th>Latest period</th><th>Change between periods</th><th>Latest cumulative reported</th></tr></thead><tbody>{comparisonRows.map(r=><tr key={r.id}><td>{r.label}<small>{r.kind === 'daily' ? 'Daily reports' : 'Cumulative changes'}</small></td><td>{number(r.previous)}<small>{r.periods[0].start}–{r.periods[0].end} · {r.periods[0].days} days</small></td><td>{number(r.current)}<small>{r.periods[1].start}–{r.periods[1].end} · {r.periods[1].days} days</small></td><td>{signed(r.delta)}</td><td>{r.kind==='daily'?'Not applicable':number(r.total)}{Number.isFinite(r.total)&&<small>{r.totalDate}</small>}</td></tr>)}</tbody></table> : <Unavailable>Province and national period comparisons are unavailable for the latest case reporting date ({weekly.end}).</Unavailable>}
      {unavailableRows.length>0 && <small>No comparable periods or cumulative total at {weekly.end}: {unavailableRows.map(r=>r.label).join('; ')}.</small>}
      {weekly.rows.some(r=>r.grouped) && <small>Province groupings are partial sums of consistently mapped reporting areas, not official province totals. A missing constituent observation makes the period unavailable.</small>}
      {weekly.rows.length>0 && <small>Sources: case series in the source register.</small>}
      {weekly.periods.length>0 && <WeeklyChart periods={weekly.periods} dataset={weekly.chartDataset} location={weekly.chartLocation}/>}
      {nationalSeries >= 2 && <figure><NationalTrendChart datasets={datasets.filter(d=>d.status==='ready'&&d.level==='national')} asOf={asOf} source="See source register for each national indicator"/></figure>}
      {epi && <p className="report-note">{epi.growth.length}/{epi.zones.length} areas have paired observations for {epi.baseline}–{epi.date} ({epi.comparisonDays || 7} days); {epi.missing} values are missing and {epi.absent} previously reporting areas are absent on {epi.date}. Cumulative changes may include backlogs and revisions.</p>}
      {geometry && mapDataset ? <figure><OutbreakMap geometry={geometry} rows={epi ? mapRows : latestPerLocation(selected?.records || [],asOf)} level={mapDataset.level} boundaryLevel={boundaryLevel} kind={mapDataset.kind} unit={mapDataset.unit} selected="" onSelect={noop} label={mapDataset.label} asOf={asOf} source={sourceOf(mapDataset)} focusNames={burden.map(z=>z.location)}/><figcaption>{epi?'Reported case distribution.':`Available indicator: ${mapDataset.label}; case evidence unavailable.`} Missing observations remain separate from zero.</figcaption></figure> : <Unavailable>Geographic overview unavailable: a matched dataset and boundaries are required.</Unavailable>}
      {epi?.dataset.level === 'health_zone' && <><ProvinceCoverage coverage={coverage}/><AreaHistoryTable activity={epi.activity} date={epi.date}/><ProvinceHorizon model={horizon}/><Source value={sourceOf(epi.dataset)} label="Health-zone case series"/></>}
      {!epi && !national.length && facts.length>0 && (highlights.length?highlights:facts).slice(0,3).map(f=><p key={f.id}>{f.text}<Source value={evidenceSource(f)}/></p>)}
    </section>

    <section id="sitrep-mobility" className="report-section"><h2>{sectionTitle('mobility')}</h2>{note('mobility')}
      <p>Use historical connections to review surveillance in receiving areas. Confirm that these connections remain relevant before planning deployment; they do not establish current movement or infected travellers.</p>
      {context.links.length>0 && <><p><strong>Receiving-area priorities:</strong> {[...new Set(context.links.map(r=>r.destination))].join(', ')}. The following are the largest individual reported outbound links from areas reporting cumulative cases.</p>
        <table><caption>Recommendation evidence · {routeData.start}–{routeData.end} · {routeData.unit}</caption><thead><tr><th>Origin reporting cases</th><th>Receiving area</th><th>{routeData.unit}</th></tr></thead><tbody>{context.links.map(r=><tr key={JSON.stringify([r.origin,r.destination])}><td>{r.origin}</td><td>{r.destination}</td><td>{number(r.value)}</td></tr>)}</tbody></table></>}
      {routeData && routeData.end<=asOf && mobilityAreas.length ? mobilityAreas.map(area=><Routes key={area} data={routeData} epi={epi} security={security} geometry={geometry} boundaryLevel={boundaryLevel} asOf={asOf} selected={area} onSelect={noop} direction={briefDirection} showFocus={false} briefing overlays={movementOverlays}/>) : <Unavailable>{routeData?.end>asOf ? 'Mobility observations fall after the reporting cut-off and are excluded.' : 'Origin–destination mobility evidence unavailable.'}</Unavailable>}
    </section>

    <section id="sitrep-mining" className="report-section"><h2>{sectionTitle('mining')}</h2>{note('mining')}
      {mining ? <><p>{context.hasCaseGeography ? `${number(context.sites)} historical mining sites fall within ${miningRows.length} matched areas reporting cumulative cases, out of ${number(mining.matched)} sites mapped across the loaded geography.` : `${number(mining.matched)} historical mining sites are mapped. Case overlap cannot be assessed without matched case evidence.`} Verify active sites, trading connections and surveillance coverage before deployment.</p>
        {map('Mining sites by area',geometry?.features.map(f=>({location:f.properties.nom,value:mining.byZone.get(f.properties.nom)||0,date:asOf})) || [],'documented sites',eligibleMines)}
        {miningRows.length ? <table><caption>Largest mining concentrations within matched areas reporting cases · cases {epi.date}</caption><thead><tr><th>Health zone / area</th><th>Reported cumulative cases</th><th>Unique mapped sites</th></tr></thead><tbody>{miningRows.slice(0,8).map(([location,count])=><tr key={location}><td>{location}</td><td>{number(caseAt(location))}</td><td>{number(count)}</td></tr>)}</tbody></table> : <Unavailable>No overlap established with matched areas reporting cases. Check case coverage and boundary matching.</Unavailable>}
        <small>Historical visits do not confirm current activity. {mining.issues.length} sites could not be assigned uniquely.</small><Source value={sourceOf(mines)} label="Mining site records"/>
      </> : <Unavailable>Mining overlap unavailable: dated site records and matching boundaries are required.</Unavailable>}
    </section>

    <section id="sitrep-security" className="report-section"><h2>{sectionTitle('security')}</h2>{note('security')}
      {security ? <><p>During {security.start}–{security.end}, the loaded coverage contains {number(security.records.length)} events and {security.missingFatalities===security.records.length?'no available fatality estimates':`${number(security.reportedFatalities)} reported fatalities`}; it is not a complete national assessment. {context.hasCaseGeography ? `${number(context.events)} events overlap matched areas reporting cumulative cases, with ${context.events>0&&context.missingFatalities===context.events?'no available fatality estimates':`${number(context.fatalities)} reported fatalities`} (${context.missingFatalities} missing estimates).` : 'Case overlap cannot be assessed without matched case evidence.'}</p>
        {map('Security events by area',geometry?.features.map(f=>({location:f.properties.nom,value:security.byZone.get(f.properties.nom)?.events||0,date:security.end})) || [],'reported events',[],security.records)}
        {securityRows.length ? <><table><caption>Access review priorities in matched areas reporting cases · cases {epi.date}</caption><thead><tr><th>Health zone / area</th><th>Cumulative cases</th><th>Security events</th><th>Reported fatalities</th></tr></thead><tbody>{securityRows.slice(0,5).map(([location,s])=><tr key={location}><td>{location}</td><td>{number(caseAt(location))}</td><td>{s.events}</td><td>{s.missingFatalities===s.events?'Not reported':number(s.fatalities)}{s.missingFatalities>0 && <small>{s.missingFatalities} missing estimates</small>}</td></tr>)}</tbody></table>
        <p><strong>{securityRows[0][0]} merits priority access review:</strong> {number(caseAt(securityRows[0][0]))} reported cumulative cases{mining ? `, ${number(mining.byZone.get(securityRows[0][0]) || 0)} mapped historical mining sites` : ''}, and {securityRows[0][1].events} recorded security events. Verify surveillance continuity, sample transport and referral access with field teams. Overlap supports this review; it does not confirm disruption.</p></> : <Unavailable>No access priority established from matched security and case evidence.</Unavailable>}
        <small>{security.unmatched.length} events have no unique boundary match; {security.issues.length} validation issues. Spatial overlap identifies areas for access review, not a confirmed disruption or causal relationship.</small>
      </> : <Unavailable>Security assessment unavailable: no valid security window and spatial analysis are loaded.</Unavailable>}
    </section>

    <section id="sitrep-actions" className="report-section"><h2>{sectionTitle('actions')}</h2>{note('actions')}
      {actions.some(a=>['Blocked','Proposed'].includes(a.status)) && <><h3>Calls to action / decisions requested</h3><ul>{actions.filter(a=>['Blocked','Proposed'].includes(a.status)).map(a=><li key={a.id}>{a.status==='Blocked'?'Unblock':'Decision requested'}: {a.action || 'Action unspecified'}{a.location?` (${a.location})`:''}</li>)}</ul></>}
      {actions.length>0 && <><h3>Response plan</h3><table><thead><tr><th>Location / action</th><th>Owner / due</th><th>Resources / status</th></tr></thead><tbody>{actions.map(a=><tr key={a.id}><td><strong>{a.location || 'Location unspecified'}</strong><p>{a.action || 'Action unspecified'}</p></td><td>{a.owner || 'Unassigned'}<small>{a.due || 'No deadline'}</small></td><td>{a.resources || 'Not specified'}<small>{a.status}</small></td></tr>)}</tbody></table></>}
      {actions.filter(a=>a.basis).map(a=><small key={a.id}>Action evidence — {a.location}: {a.basis.why} Selected at cut-off {a.basis.asOf}. Sources: {a.basis.sources.join('; ')}</small>)}
      {suggestions.length>0 && <><h3>Recommended next steps</h3><small>For coordinator review; owners and deadlines have not been assigned to these suggestions.</small><ol>{suggestions.map(s=><li key={s.title}><strong>{s.title} — {s.areas.join(', ')}</strong><p>{s.action}</p><small>Basis: {s.why}</small></li>)}</ol></>}
      {response.loadedPillars ? <section aria-label="Response status"><h3>Response status</h3><table><thead><tr><th>Response pillar</th><th>Reported status</th><th>Evidence</th></tr></thead><tbody>{response.pillars.map(p=><tr key={p.id}><td>{p.label}</td><td>{p.loaded?p.level.replace('-',' '):'Data unavailable'}</td><td>{p.loaded?p.note:'No dated indicators loaded.'}</td></tr>)}</tbody></table></section> : <p className="report-note">{!actions.length && 'No coordinator actions recorded. '}No dated response indicators loaded. Confirm response presence and capacity with teams; case totals cannot establish unmet needs.</p>}
      {reports.length>0 && <section aria-label="RCCE qualitative reports"><h3>Community feedback / RCCE reports</h3>{reports.some(d=>d.analysis) && <small>{AI_DOCUMENT_DISCLAIMER}</small>}{reports.map(d=><div key={d.id}><h4>{d.title}</h4><p className="report-text">{d.summary}</p><small>{d.location} · {d.date} · Source: {d.source} · {d.file}</small></div>)}</section>}
      {context.hazards.length>0 && <><h3>Concurrent hazards in response areas</h3><p>{context.hazards.map(h=>`${h.location}: ${h.title} (${h.date})`).join('; ')}. Alert centres fall within areas reporting cases or with recorded actions; they are not affected-area footprints. Verify operational impact.</p></>}
    </section>

    <section className="report-sources"><h2>Data notes</h2><p>Missing observations are not zero. Reporting cut-offs and observation dates can differ. National series remain separate from sums of local reports. Changes in cumulative totals can include corrections and catch-up reporting; they are not onset-based incidence. No missing dates are carried forward. Historical mobility and mining observations do not establish current movement, activity or transmission. Security fatalities are reported estimates.</p></section>
    <section className="report-sources report-annex"><h2>Annex · source register and coverage</h2>
      {evidenceReadiness(datasets,asOf).map(d=><p key={d.id}><strong>{d.label}:</strong> series coverage {d.historyStart?`${d.historyStart}–${d.historyEnd}`:'unavailable at cut-off'} · {d.observations} non-missing observations.<br/>Latest observation per location: {d.start?`${d.start}–${d.end}`:'unavailable'} · {d.available} reported locations; {d.missing} missing values. {d.issues} validation issues{d.warning?` · ${d.warning}`:''}<Source value={d.source}/></p>)}
      <p>Boundaries: {boundarySource} · {boundaryLevel} · {epi?.unmatched || 0} unmatched case locations.</p>
      {mines && <p>Mining source: {sourceOf(mines)} · retrieved {mines.fetchedAt || 'date unavailable'}. The latest eligible visit per unique site is used at the cut-off.</p>}
      {routeData && <p>Mobility: {sourceOf(routeData)} · {routeData.start}–{routeData.end} · {routeData.unit}. {routeData.limitation}</p>}
      {security && <p>ACLED: uploaded records · {security.start}–{security.end} · {security.missingFatalities} events with missing fatality estimates. Source records are retained in the evidence snapshot.</p>}
      {findings.length>0 && <details open data-source-register="true"><summary>Document findings and source references</summary><p>{AI_DOCUMENT_DISCLAIMER}</p>{findings.map(f=><p key={f.id}>{f.kind}: {f.summary}{Number.isFinite(f.value)?` · ${f.metricLabel}: ${f.value} ${f.unit}; ${f.population}; ${f.purpose}`:''} · {f.location || 'Location unspecified'} · {f.startDate || '?'}–{f.endDate} · {f.source}; {f.file}, {f.reference}</p>)}</details>}
    </section>
    {includeEvidenceDates && <details open data-source-register="true"><summary>Evidence dates and gaps</summary><EvidenceReadiness datasets={datasets} asOf={asOf}/></details>}
    {includeAppendix && <section className="report-annex" aria-label="Evidence appendix"><h2>Evidence appendix</h2>{facts.map(f=><p key={f.id}>{f.text}<Source value={evidenceSource(f)}/></p>)}{hazards.events.length>0 && <><h3>All loaded hazard alerts</h3><p>{hazards.events.map(h=>`${h.location}: ${h.title} (${h.date})`).join('; ')}. Alert centres are not affected-area footprints.</p></>}{selected && selectedLocation && <TrendChart records={selected.records} location={selectedLocation} label={selected.label} unit={selected.unit} kind={selected.kind} asOf={asOf} source={sourceOf(selected)}/>}{selectedMobility&&<MobilityPanel layers={mobilityLayers} selected={selectedMobility} direction={movementDirection} geometry={geometry} boundaryLevel={boundaryLevel} asOf={asOf} overlays={movementOverlays} briefing/>}</section>}
    <footer className="report-footer">{options.preparedBy ? `Prepared by ${options.preparedBy}` : 'Outbreak response situation report'}{options.contact ? ` · ${options.contact}` : ''} · {epiWeek(asOf).label} · Cut-off {asOf}</footer>
  </article>;
});

export default Sitrep;
