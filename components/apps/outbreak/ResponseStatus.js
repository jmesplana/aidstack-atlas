import { responseStatus } from '../../../lib/outbreak/response';
import Delta from './Delta';
import styles from './outbreak.module.css';

const LEVEL_LABEL = { 'on-track': 'On track', watch: 'Watch', attention: 'Attention', reported: 'Reported' };

export default function ResponseStatus({ datasets, actions = [], asOf, onData, briefing = false }) {
  const status = responseStatus(datasets, actions, asOf);
  return <section className={styles.panel} aria-label="Response status">
    <h3>Response status</h3>
    <p className={styles.scope}>Derived from dated response indicators you upload (categorised in Data &amp; uploads) and the response plan. Coverage is what was reported, not verified capacity; missing values are not zero.</p>
    <div className={styles.pillarGrid}>
      {status.pillars.map(p => <article key={p.id} className={p.loaded ? styles[`pillar_${p.level}`] : styles.pillar_none}>
        <strong>{p.label}</strong>
        <span className={styles.pillarBadge}>{p.loaded ? LEVEL_LABEL[p.level] : 'No data'}{p.loaded && p.delta !== null && p.delta !== undefined ? <> · <Delta delta={p.delta} kind={p.indicators[0]?.kind} neutral /></> : null}</span>
        <p>{p.note}</p>
      </article>)}
    </div>
    <p className={styles.scope}>Response plan: {status.actions.total} actions — {status.actions.open} open, {status.actions.blocked} blocked.{status.loadedPillars < 4 && !briefing ? ' Upload indicators for the remaining pillars to complete this rollup.' : ''}</p>
    {status.loadedPillars === 0 && !briefing && onData && <button onClick={onData}>Add response indicators</button>}
  </section>;
}
