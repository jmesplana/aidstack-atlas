import { useMemo, useState } from 'react';
import { accessCohort } from '../../../lib/worldpop/accessCohorts';
import { completeSum, summarizeDemographics, accessDemographicRows } from '../../../lib/worldpop/demographics';
import styles from '../../platform/Planning.module.css';
import ux from './AccessGaps.module.css';
const count = value => value == null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: 0 });
export function PopulationPreview({ profile, cohort, loadedPopulation, onOpen }) {
  const selected = profile.data ? (cohort.dataType === 'total' ? completeSum(profile.data.areas.map(row => row.totalPopulation)) : summarizeDemographics(profile.data.areas, cohort).total) : null;
  return <div className={ux.populationPreview} aria-label="Population preview">
    <div><strong>Population selected · {cohort.label}</strong><p>{loadedPopulation != null ? `${count(loadedPopulation)} people loaded for this assessment` : selected != null ? `Approximately ${count(selected)} people in the selected areas` : 'Choose the age group and sex before loading the analysis.'}</p>
    {profile.data && <small>WorldPop {profile.data.year}{profile.data.year > new Date().getFullYear() ? ' projection' : ''} · All residents: {count(completeSum(profile.data.areas.map(row => row.totalPopulation)))}</small>}
    {profile.status && <p role="status">{profile.status}</p>}{profile.error && <p role="status">Population preview unavailable. You can still load analysis data.</p>}</div>
    <button type="button" onClick={onOpen}>View age and sex breakdown</button>
  </div>;
}
export default function PopulationProfile({ profile, areas, cohort: selection, result, busy, onLoadCells, cellId = '', option = 'recommended' }) {
  const cohort = accessCohort(selection), [areaId, setAreaId] = useState(''), [context, setContext] = useState(false), [view, setView] = useState(cellId ? 'access' : 'population'), [accessSex, setAccessSex] = useState(cohort.sex);
  const shownSelection = context ? { age: 'all', sex: 'both' } : cohort;
  const records = profile.data?.areas.filter(row => !areaId || row.id === areaId) || [];
  const summary = useMemo(() => summarizeDemographics(records, shownSelection), [records, context, cohort.age, cohort.sex]);
  const max = Math.max(1, ...summary.rows.flatMap(row => [row.female || 0, row.male || 0]));
  const accessRows = result?.demographics ? accessDemographicRows(result, result.demographics.cells, areaId, cellId, option, { ...cohort, sex: accessSex }) : null;
  const selectedCell = cellId && result?.settlements.find(row => JSON.stringify([row.areaId, row.settlementId]) === cellId);
  return <section aria-label="Population breakdown">
    <p><strong>Assessment population: {cohort.label}</strong>. {result?.populationCoverage?.year || profile.data?.year || 'Selected year'}{(result?.populationCoverage?.year || profile.data?.year) > new Date().getFullYear() ? ' projection' : ''}. This selection controls the map and recommendations.</p>
    {result && <div className={styles.actions}><button aria-pressed={view === 'population'} onClick={() => setView('population')}>Area population</button><button aria-pressed={view === 'access'} onClick={() => setView('access')}>Who has access?</button></div>}
    {!cellId && <label>Population area<select aria-label="Population area" value={areaId} onChange={event => setAreaId(event.target.value)}><option value="">All selected areas</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>}
    {view === 'population' ? <>
      <label className={styles.checkbox}><input type="checkbox" checked={context} onChange={event => setContext(event.target.checked)} />Show all ages and both sexes for context</label>
      {context && <p className={styles.notice}>Context only. The map and assessment still use {cohort.label}.</p>}
      {profile.status && <p role="status">{profile.status}</p>}
      {profile.error && <div role="alert"><p>{profile.error}</p><button onClick={profile.retry}>Retry population summary</button></div>}
      {profile.data && <>
        <div className={styles.stats}>{[['All-residents estimate', completeSum(records.map(row => row.totalPopulation))], ['Female · displayed ages', !context && cohort.sex === 'male' ? 'Not selected' : summary.female], ['Male · displayed ages', !context && cohort.sex === 'female' ? 'Not selected' : summary.male], ['Age/sex subtotal', summary.total]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{count(value)}</strong></div>)}</div>
        <p className={styles.muted}>All-residents counts and age/sex counts come from separate WorldPop datasets; their totals can differ. These are modeled estimates, not confirmed service demand.</p>
        <div className={ux.ageChart} aria-label="Age and sex bar chart"><span>Age</span><span>Female</span><span>Male</span>{summary.rows.map(row => <div className={ux.ageChartRow} key={row.code}><span>{row.label}</span><span><i style={{ width: `${100 * (row.female || 0) / max}%`, background: '#007c91' }} />{cohort.sex === 'male' && !context ? 'Not selected' : count(row.female)}</span><span><i style={{ width: `${100 * (row.male || 0) / max}%`, background: '#8757b3' }} />{cohort.sex === 'female' && !context ? 'Not selected' : count(row.male)}</span></div>)}</div>
        <div className={styles.tableWrap}><table className={styles.table}><caption>Population by age and sex · {context ? 'All residents' : cohort.label}</caption><thead><tr><th>Age group</th><th>Female</th><th>Male</th><th>Total</th></tr></thead><tbody>{summary.rows.map(row => <tr key={row.code}><th>{row.label}</th><td>{cohort.sex === 'male' && !context ? 'Not selected' : count(row.female)}</td><td>{cohort.sex === 'female' && !context ? 'Not selected' : count(row.male)}</td><td>{count(row.total)}</td></tr>)}</tbody></table></div>
      </>}
    </> : <>
      {selectedCell && <h3>{selectedCell.name}</h3>}
      {cohort.sex === 'both' && <label>Access breakdown sex<select aria-label="Access breakdown sex" value={accessSex} onChange={event => setAccessSex(event.target.value)}><option value="both">Female and male</option><option value="female">Female</option><option value="male">Male</option></select></label>}
      <p>Geographic access for {cohort.label}, using {option === 'baseline' ? 'current services' : option === 'scenario' ? 'your selected scenario' : 'the recommended locations'}. Newly reachable people with unknown baseline access remain separate.</p>
      {!accessRows ? <><p>Load age/sex counts for the actual analysis cells to see who is reached. This does not change site placement.</p><button disabled={busy || !result.populationCoverage} onClick={onLoadCells}>Load access population breakdown</button>{!result.populationCoverage && <p>Uploaded population points do not include WorldPop cell boundaries for demographic analysis.</p>}</> : <>
        {cohort.dataType === 'total' && <p className={styles.notice}>This table uses the age/sex dataset. Its denominator can differ from the all-residents dataset used in the assessment.</p>}
        <div className={styles.tableWrap}><table className={styles.table} style={{ whiteSpace: 'normal', tableLayout: 'fixed', minWidth: 720 }}><caption>Access by age group · {accessCohort({ ...cohort, sex: accessSex }).label}</caption><thead><tr><th>Age group</th><th>Female</th><th>Male</th><th>Within threshold now</th><th>Additional reach</th><th>Newly reachable, baseline unknown</th><th>Still beyond threshold</th><th>Still unknown</th></tr></thead><tbody>{accessRows.map(row => <tr key={row.code}><th>{row.label}</th><td>{accessSex === 'male' ? 'Not selected' : count(row.female)}</td><td>{accessSex === 'female' ? 'Not selected' : count(row.male)}</td>{['current','additional','newlyKnown','beyond','unknown'].map(key => <td key={key}>{count(row[key])}</td>)}</tr>)}</tbody></table></div>
        <p className={styles.muted}>Unavailable means a required demographic count was missing. Population outside the loaded analysis cells is excluded; age bands remain those supplied by WorldPop.</p>
      </>}
    </>}
  </section>;
}
