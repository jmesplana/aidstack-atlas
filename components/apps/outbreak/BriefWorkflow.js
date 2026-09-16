import { evidenceReadiness, actionFollowUp } from '../../../lib/outbreak/briefing';
import styles from './outbreak.module.css';

export function BriefChanges({ since }) {
  return <section className={styles.panel} aria-label="Changes since comparison brief"><h3>Since last brief{since ? ` — ${since.priorName || 'snapshot'}, ${since.priorAsOf}` : ''}</h3>
    {!since ? <p>Choose a saved snapshot above to compare reported observations and response actions.</p> : since.warning ? <p role="alert">{since.warning}</p> : <>
      {since.lines.length ? <ul>{since.lines.map((line, i) => <li key={i}><strong>{line.label}:</strong> {line.value}{typeof line.delta === 'number' ? ` (${line.delta > 0 ? '+' : ''}${line.delta.toLocaleString()})` : ''}<small>{line.since}</small></li>)}</ul> : <p>No comparable changes can be established from these snapshots.</p>}
      <p>Changes are in reported observations and may reflect revisions or reporting coverage. They do not establish new infections or improved services.</p>
    </>}
  </section>;
}

export function EvidenceReadiness({ datasets, asOf }) {
  const sources = evidenceReadiness(datasets, asOf);
  return <section className={styles.panel} aria-label="Briefing evidence readiness"><h3>Evidence dates and gaps</h3><p>Observations older than the cut-off are flagged for review; an older date does not by itself mean a source is overdue. Missing observations are never zero.</p>
    {!sources.length ? <p>No indicator datasets loaded. Upload data or connect the DRC preset in Data & uploads.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Indicator / source</th><th>Observation dates</th><th>Review needed</th></tr></thead><tbody>{sources.map(source => <tr key={source.id}><td>{source.label}<small>{source.source}</small></td><td>{source.start ? `${source.start} – ${source.end}` : 'No observations within cut-off'}</td><td>{source.available} reported; {source.missing} missing; {source.older} older than cut-off; {source.issues} validation issues{source.warning && <p>{source.warning}</p>}</td></tr>)}</tbody></table></div>}
  </section>;
}

export default function BriefWorkflow({ datasets, actions, asOf, reviewed, onTab }) {
  const follow = actionFollowUp(actions, asOf);
  return <section className={`${styles.panel} ${styles.noPrint}`} aria-label="Prepare daily response brief"><h3>Prepare daily response brief</h3><p>Confirm the scope and reporting cut-off above, then work through the evidence, decisions and briefing. Each saved snapshot keeps the earlier brief intact.</p><div className={styles.toolbar}>
    <button onClick={() => onTab('Data & uploads')}>1. Check data and dates</button>
    <button onClick={() => onTab('Situation')}>2. Review changes and priorities</button>
    <button onClick={() => onTab('Response & decisions')}>3. Assign response actions</button>
    <button onClick={() => onTab('Briefing')}>4. Review and export brief</button>
  </div><p>{datasets.length} indicator sources · {actions.length} actions · {follow.unassigned} unassigned · {follow.undated} without deadlines · {follow.overdue} overdue at cut-off · {follow.blocked} blocked · {reviewed ? 'Reviewed' : 'Draft'}</p></section>;
}
