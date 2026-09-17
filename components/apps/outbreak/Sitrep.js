import { forwardRef, useMemo } from 'react';
import { epiWeek, formatValue, nationalEvidence, latestPerLocation } from '../../../lib/outbreak/data';
import { sitrepEpidemiology, SITREP_SECTIONS } from '../../../lib/outbreak/sitrep';
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
function Source({ value }) { return <small>Source: {/^https?:\/\//.test(value || '') ? <a href={value}>{value}</a> : value || 'Not supplied'}</small>; }
function Unavailable({ children }) { return <p className="report-unavailable">{children}</p>; }

function WeeklyChart({ periods, dataset, location }) {
  const values = periods.map(p => p.value).filter(Number.isFinite);
  if (!values.length) return <Unavailable>Weekly chart unavailable: the required observations are missing for these reporting periods.</Unavailable>;
  const min = Math.min(0, ...values), max = Math.max(1, ...values), y = value => 165 - (value - min) / (max - min) * 125;
  return <figure><h3>Seven-day {dataset.kind === 'daily' ? 'reported cases' : 'changes in reported totals'} — {location}</h3>
    <svg viewBox="0 0 640 225" role="img" aria-label={`Seven-day reported case ${dataset.kind === 'daily' ? 'totals' : 'changes'} for ${location}`}>
      <title>Reporting periods ending on the labelled dates; missing observations are not filled.</title>
      <line x1="40" x2="628" y1={y(0)} y2={y(0)} stroke="#9babb8"/>
      {periods.map((period,i) => { const x = 48 + i * 73; return <g key={period.end}>
        {period.value === null ? <text x={x+25} y="100" textAnchor="middle" fontSize="10" fill="#52616d">No data</text> : <>
          <rect x={x} y={Math.min(y(0),y(period.value))} width="48" height={Math.max(1,Math.abs(y(period.value)-y(0)))} fill={period.value < 0 ? '#86538a' : i === periods.length-1 ? '#bb202b' : '#214f70'}/>
          <text x={x+24} y={period.value < 0 ? y(period.value)+13 : y(period.value)-6} textAnchor="middle" fontSize="11" fill="#202932">{number(period.value)}</text>
        </>}
        <text x={x+24} y="202" textAnchor="middle" fontSize="10" fill="#52616d">{period.end.slice(5)}</text>
      </g>; })}
    </svg>
    <figcaption>Seven-day periods ending on each date; {dataset.kind === 'daily' ? 'all seven daily reports are required.' : 'exact cumulative observations seven days apart are required. Negative bars are downward revisions, not negative incidence.'} These periods are anchored to the reporting cut-off, not calendar epidemiological weeks.</figcaption>
    <Source value={sourceOf(dataset)}/>
  </figure>;
}

const Sitrep = forwardRef(function Sitrep({ name, asOf, reviewed, options, openingMessage, datasets, epi,
  geometry, boundaryLevel, boundarySource, selected, selectedLocation, mining, mines, eligibleMines,
  security, routeData, briefDirection, movementOverlays, actions, since, reports, findings, hazards,
  includeAppendix, includeEvidenceDates, facts, highlights, evidenceSource, mobilityLayers, selectedMobility, movementDirection }, ref) {
  const weekly = useMemo(() => sitrepEpidemiology(datasets, epi, geometry, boundaryLevel, asOf), [datasets,epi,geometry,boundaryLevel,asOf]);
  const national = nationalEvidence(datasets,asOf);
  const nationalSeries = NATIONAL_SERIES.filter(def => datasets.some(d => d.status === 'ready' && d.level === 'national' && def.match.test(d.metricId || d.id || ''))).length;
  const suggestions = recommendations(epi,security,mining,routeData,asOf).filter(s => !proposalSelected(actions,s)).slice(0,3);
  const burden = epi?.burden.filter(z=>z.value>0).slice(0,3) || [];
  const growth = epi?.growth.filter(z=>z.delta>0).slice(0,3) || [];
  const affected = new Set(epi?.affected.map(z=>z.location) || []);
  const securityRows = security ? [...security.byZone].filter(([,s])=>s.events>0).sort((a,b)=>b[1].events-a[1].events) : [];
  const miningRows = mining ? [...mining.byZone].filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]) : [];
  const caseAt = location => epi?.dataset.level === boundaryLevel ? epi?.zones.find(z=>z.location===location)?.value : null;
  const mapDataset = epi?.dataset || selected;
  const mapRows = epi?.zones || [];
  const mobilityAreas = options.mobilityAreas?.length ? options.mobilityAreas : [selectedLocation || routeData?.routes[0]?.origin].filter(Boolean);
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
        Epidemiology: {epi?.date || national.map(f=>f.date).sort().at(-1) || 'not available'} · Mobility: {routeData ? `${routeData.start}–${routeData.end}` : 'not available'} · Security: {security ? `${security.start}–${security.end}` : 'not available'}</p>
      <p className="report-meta"><strong>{reviewed ? 'Reviewed by user' : 'DRAFT — requires coordinator review'}</strong>{options.preparedBy ? ` · Prepared by ${options.preparedBy}` : ''}</p>
    </header>
    <section className="report-summary" aria-label="Key message"><h2>Key message</h2>
      {(openingMessage.origin==='Coordinator message' || epi || national.length ? openingMessage.text : 'Case evidence is unavailable at this reporting cut-off. No overall trend can be assessed.').split(/\n\s*\n/).map((text,i)=><p key={i}>{text}</p>)}<small>{openingMessage.origin}</small>
    </section>
    <h2>Key messages</h2><ul>
      <li><strong>Reported burden:</strong> {burden.length ? burden.map(z=>`${z.location}${z.province?` (${z.province})`:''}: ${number(z.value)}`).join('; ') + ` cumulative cases, ${epi.date}.` : 'Area-level case evidence unavailable.'}</li>
      <li><strong>Recent increases:</strong> {growth.length ? growth.map(z=>`${z.location}: +${number(z.delta)}`).join('; ') + ` in reported cumulative totals, ${epi.baseline}–${epi.date}.` : 'No positive increase established from comparable area reports.'}</li>
      <li><strong>Access review:</strong> {securityRows.filter(([location])=>affected.has(location)).slice(0,3).map(([location])=>location).join(', ') || 'No priority established from the loaded security and case evidence.'} {securityRows.some(([location])=>affected.has(location)) && 'Recent security events overlap areas reporting cases; access effects require field confirmation.'}</li>
    </ul>
    {since && <BriefChanges since={since}/>}

    <section id="sitrep-epidemiology" className="report-section"><h2>{sectionTitle('epidemiology')}</h2>{note('epidemiology')}
      <div className="report-metrics">{national.map(f=><article key={f.id}><span>{f.label}</span><strong>{number(f.value)}</strong><small>Reported {f.date}</small></article>)}
        {!national.length && epi && <article><span>Reported area-level total</span><strong>{number(epi.total)}</strong><small>{epi.date} · national total unavailable</small></article>}
        {epi && <article><span>Areas reporting cases</span><strong>{epi.affected.length}</strong><small>{epi.date} · not currently active areas</small></article>}
      </div>
      {weekly.rows.length ? <table><caption>Seven-day reports ending {weekly.previousEnd} and {asOf}. Cumulative sources show changes in reported totals; daily sources show complete seven-day sums.</caption><thead><tr><th>Province / scope</th><th>Previous period</th><th>Current period</th><th>Change</th><th>Cumulative at cut-off</th></tr></thead><tbody>{weekly.rows.map(r=><tr key={r.id}><td>{r.label}<small>{r.kind === 'daily' ? 'Daily reports' : 'Cumulative changes'}</small></td><td>{number(r.previous)}</td><td>{number(r.current)}</td><td>{signed(r.delta)}</td><td>{number(r.total)}</td></tr>)}</tbody></table> : <Unavailable>Province and national period comparisons are unavailable for the loaded scope.</Unavailable>}
      {weekly.rows.some(r=>r.grouped) && <small>Province groupings sum only the consistently mapped reporting areas. They are partial area totals, not official province totals; any missing constituent observation makes a period unavailable.</small>}
      {weekly.rows.length>0 && <Source value={[...new Set(weekly.rows.map(r=>r.source))].join('; ')}/>}
      {weekly.periods.length>0 && <WeeklyChart periods={weekly.periods} dataset={weekly.chartDataset} location={weekly.chartLocation}/>}
      {nationalSeries >= 2 && <figure><NationalTrendChart datasets={datasets.filter(d=>d.status==='ready'&&d.level==='national')} asOf={asOf} source="See source register for each national indicator"/></figure>}
      {epi && <p className="report-note">{epi.growth.length}/{epi.zones.length} areas have paired observations for {epi.baseline}–{epi.date}; {epi.missing} values are missing and {epi.absent} previously reporting areas are absent on {epi.date}. Cumulative changes may include backlogs and revisions.</p>}
      {geometry && mapDataset ? <figure><OutbreakMap geometry={geometry} rows={epi ? mapRows : latestPerLocation(selected?.records || [],asOf)} level={mapDataset.level} boundaryLevel={boundaryLevel} kind={mapDataset.kind} unit={mapDataset.unit} selected="" onSelect={noop} label={mapDataset.label} asOf={asOf} source={sourceOf(mapDataset)} focusNames={burden.map(z=>z.location)}/><figcaption>{epi?'Reported case distribution.':`Available indicator: ${mapDataset.label}; case evidence unavailable.`} Missing observations remain separate from zero.</figcaption></figure> : <Unavailable>Geographic overview unavailable: a matched dataset and boundaries are required.</Unavailable>}
      {!epi && !national.length && facts.length>0 && (highlights.length?highlights:facts).slice(0,3).map(f=><p key={f.id}>{f.text}<Source value={evidenceSource(f)}/></p>)}
    </section>

    <section id="sitrep-mobility" className="report-section"><h2>{sectionTitle('mobility')}</h2>{note('mobility')}
      <p>Population connections help identify locations for surveillance and receiving-area readiness. They do not establish transmission or infected travellers.</p>
      {routeData && routeData.end<=asOf && mobilityAreas.length ? mobilityAreas.map(area=><Routes key={area} data={routeData} epi={epi} security={security} geometry={geometry} boundaryLevel={boundaryLevel} asOf={asOf} selected={area} onSelect={noop} direction={briefDirection} showFocus={false} briefing overlays={movementOverlays}/>) : <Unavailable>{routeData?.end>asOf ? 'Mobility observations fall after the reporting cut-off and are excluded.' : 'Origin–destination mobility evidence unavailable.'}</Unavailable>}
    </section>

    <section id="sitrep-mining" className="report-section"><h2>{sectionTitle('mining')}</h2>{note('mining')}
      {mining ? <><p>{number(mining.matched)} historical mining sites matched uniquely to the loaded boundaries. {mining.issues.length} points could not be assigned uniquely. Site visits do not confirm current mining activity.</p>
        {map('Mining sites by area',geometry?.features.map(f=>({location:f.properties.nom,value:mining.byZone.get(f.properties.nom)||0,date:asOf})) || [],'documented sites',eligibleMines)}
        <table><caption>Up to ten areas with the most mapped sites. Case figures use {epi?.date || 'no available case date'}.</caption><thead><tr><th>Health zone / area</th><th>Reported cumulative cases</th><th>Unique mapped sites</th></tr></thead><tbody>{miningRows.slice(0,10).map(([location,count])=><tr key={location}><td>{location}</td><td>{number(caseAt(location))}</td><td>{number(count)}</td></tr>)}</tbody></table><Source value={sourceOf(mines)}/>
      </> : <Unavailable>Mining overlap unavailable: dated site records and matching boundaries are required.</Unavailable>}
    </section>

    <section id="sitrep-security" className="report-section"><h2>{sectionTitle('security')}</h2>{note('security')}
      {security ? <><p>During {security.start}–{security.end}, the loaded data contains {number(security.records.length)} valid events and {number(security.reportedFatalities)} reported fatalities; {security.missingFatalities} events have missing fatality estimates. This describes loaded coverage, not a complete national assessment.</p>
        {map('Security events by area',geometry?.features.map(f=>({location:f.properties.nom,value:security.byZone.get(f.properties.nom)?.events||0,date:security.end})) || [],'reported events',[],security.records)}
        <table><caption>Up to ten areas with the most matched events. Fatalities are reported estimates.</caption><thead><tr><th>Health zone / area</th><th>Cumulative cases</th><th>Security events</th><th>Reported fatalities</th></tr></thead><tbody>{securityRows.slice(0,10).map(([location,s])=><tr key={location}><td>{location}</td><td>{number(caseAt(location))}</td><td>{s.events}</td><td>{s.missingFatalities===s.events?'Not reported':number(s.fatalities)}{s.missingFatalities>0 && <small>{s.missingFatalities} missing estimates</small>}</td></tr>)}</tbody></table>
        <small>{security.unmatched.length} events have no unique boundary match; {security.issues.length} validation issues. Spatial overlap identifies areas for access review, not a confirmed disruption or causal relationship.</small>
      </> : <Unavailable>Security assessment unavailable: no valid security window and spatial analysis are loaded.</Unavailable>}
    </section>

    <section id="sitrep-actions" className="report-section"><h2>{sectionTitle('actions')}</h2>{note('actions')}
      {actions.some(a=>['Blocked','Proposed'].includes(a.status)) && <><h3>Calls to action / decisions requested</h3><ul>{actions.filter(a=>['Blocked','Proposed'].includes(a.status)).map(a=><li key={a.id}>{a.status==='Blocked'?'Unblock':'Decision requested'}: {a.action || 'Action unspecified'}{a.location?` (${a.location})`:''}</li>)}</ul></>}
      <h3>Response plan</h3>{actions.length ? <table><thead><tr><th>Location / action</th><th>Owner / due</th><th>Resources / status</th></tr></thead><tbody>{actions.map(a=><tr key={a.id}><td><strong>{a.location || 'Location unspecified'}</strong><p>{a.action || 'Action unspecified'}</p></td><td>{a.owner || 'Unassigned'}<small>{a.due || 'No deadline'}</small></td><td>{a.resources || 'Not specified'}<small>{a.status}</small></td></tr>)}</tbody></table> : <Unavailable>No coordinator actions recorded.</Unavailable>}
      {actions.filter(a=>a.basis).map(a=><small key={a.id}>Action evidence — {a.location}: {a.basis.why} Selected at cut-off {a.basis.asOf}. Sources: {a.basis.sources.join('; ')}</small>)}
      {suggestions.length>0 && <><h3>Additional actions to consider</h3><ol>{suggestions.map(s=><li key={s.title}><strong>{s.title} — {s.areas.join(', ')}</strong><p>{s.action}</p><small>Basis: {s.why}</small></li>)}</ol></>}
      <section aria-label="Response status"><h3>Response status</h3>{response.loadedPillars ? <table><thead><tr><th>Response pillar</th><th>Reported status</th><th>Evidence</th></tr></thead><tbody>{response.pillars.map(p=><tr key={p.id}><td>{p.label}</td><td>{p.loaded?p.level.replace('-',' '):'Data unavailable'}</td><td>{p.loaded?p.note:'No dated indicators loaded.'}</td></tr>)}</tbody></table> : <Unavailable>No dated response indicators loaded. Capacity and unmet needs cannot be inferred from case totals.</Unavailable>}</section>
      {reports.length>0 && <section aria-label="RCCE qualitative reports"><h3>Community feedback / RCCE reports</h3>{reports.some(d=>d.analysis) && <small>{AI_DOCUMENT_DISCLAIMER}</small>}{reports.map(d=><div key={d.id}><h4>{d.title}</h4><p className="report-text">{d.summary}</p><small>{d.location} · {d.date} · Source: {d.source} · {d.file}</small></div>)}</section>}
      {hazards.events.length>0 && <><h3>Concurrent hazards</h3><p>{hazards.events.map(h=>`${h.location}: ${h.title} (${h.date})`).join('; ')}. Alert centres are not affected-area footprints.</p></>}
    </section>

    <section className="report-sources"><h2>Data notes and sources</h2><p>Missing observations are not zero. Reporting cut-offs and observation dates can differ. National series remain separate from sums of local reports. Seven-day changes in cumulative totals can include corrections and catch-up reporting; they are not onset-based incidence. No missing dates are carried forward. Historical mobility and mining observations do not establish current movement, activity or transmission. Security fatalities are reported estimates.</p>
      {evidenceReadiness(datasets,asOf).map(d=><p key={d.id}><strong>{d.label}:</strong> {d.start?`${d.start}–${d.end}`:'No observations within cut-off'} · {d.available} reported; {d.missing} missing; {d.issues} validation issues{d.warning?` · ${d.warning}`:''}<Source value={d.source}/></p>)}
      <p>Boundaries: {boundarySource} · {boundaryLevel} · {epi?.unmatched || 0} unmatched case locations.</p>
      {mines && <p>Mining source: {sourceOf(mines)} · retrieved {mines.fetchedAt || 'date unavailable'}. The latest eligible visit per unique site is used at the cut-off.</p>}
      {routeData && <p>Mobility: {sourceOf(routeData)} · {routeData.start}–{routeData.end} · {routeData.unit}.</p>}
      {security && <p>ACLED: uploaded records · {security.start}–{security.end}. Source records are retained in the evidence snapshot.</p>}
      {findings.length>0 && <details open data-source-register="true"><summary>Document findings and source references</summary><p>{AI_DOCUMENT_DISCLAIMER}</p>{findings.map(f=><p key={f.id}>{f.kind}: {f.summary}{Number.isFinite(f.value)?` · ${f.metricLabel}: ${f.value} ${f.unit}; ${f.population}; ${f.purpose}`:''} · {f.location || 'Location unspecified'} · {f.startDate || '?'}–{f.endDate} · {f.source}; {f.file}, {f.reference}</p>)}</details>}
    </section>
    {includeEvidenceDates && <details open data-source-register="true"><summary>Evidence dates and gaps</summary><EvidenceReadiness datasets={datasets} asOf={asOf}/></details>}
    {includeAppendix && <section aria-label="Evidence appendix"><h2>Evidence appendix</h2>{facts.map(f=><p key={f.id}>{f.text}<Source value={evidenceSource(f)}/></p>)}{selected && selectedLocation && <TrendChart records={selected.records} location={selectedLocation} label={selected.label} unit={selected.unit} kind={selected.kind} asOf={asOf} source={sourceOf(selected)}/>}{selectedMobility&&<MobilityPanel layers={mobilityLayers} selected={selectedMobility} direction={movementDirection} geometry={geometry} boundaryLevel={boundaryLevel} asOf={asOf} overlays={movementOverlays} briefing/>}</section>}
    <footer className="report-footer">{options.preparedBy ? `Prepared by ${options.preparedBy}` : 'Outbreak response situation report'}{options.contact ? ` · ${options.contact}` : ''} · {epiWeek(asOf).label} · Cut-off {asOf}</footer>
  </article>;
});

export default Sitrep;
