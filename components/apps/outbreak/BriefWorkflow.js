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
    {!sources.length ? <p>No indicator datasets loaded. Upload data or connect the DRC preset in Data.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Indicator / source</th><th>Observation dates</th><th>Review needed</th></tr></thead><tbody>{sources.map(source => <tr key={source.id}><td>{source.label}<small>{source.source}</small></td><td>{source.start ? `${source.start} – ${source.end}` : 'No observations within cut-off'}</td><td>{source.available} reported; {source.missing} missing; {source.older} older than cut-off; {source.issues} validation issues{source.warning && <p>{source.warning}</p>}</td></tr>)}</tbody></table></div>}
  </section>;
}

export default function BriefWorkflow({ datasets, actions, asOf, reviewed, onTab }) {
  const follow = actionFollowUp(actions, asOf);
  return <section className={`${styles.briefChecklist} ${styles.noPrint}`} aria-label="Sitrep preparation checklist">
    <button onClick={() => onTab('Data')}><strong>1. Check data</strong><small>{datasets.length} indicator sources</small></button>
    <button onClick={() => onTab('Actions')}><strong>2. Review actions</strong><small>{actions.length} actions · {follow.unassigned} unassigned · {follow.undated} without deadlines{follow.overdue?` · ${follow.overdue} overdue`:''}{follow.blocked?` · ${follow.blocked} blocked`:''}</small></button>
    <span><strong>3. Review and export</strong><small>{reviewed?'Reviewed':'Read the preview and confirm your review below'}</small></span>
  </section>;
}
