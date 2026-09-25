import styles from './outbreak.module.css';

export default function LocationMatching({dataset}) {
  const matching = dataset?.locationMatching;
  if (!matching) return null;
  const changed = matching.locations.filter(r => r.location && r.location !== r.source);
  const unresolved = matching.locations.filter(r => !r.location);
  return <details className={styles.source}>
    <summary>Location matching: {changed.length} name variants resolved · {unresolved.length} unlocated</summary>
    <p>Matching covers the full loaded history. Unlocated observations remain in the data and location explorer, but cannot be placed on the map.</p>
    {matching.aliasSource && <p>{matching.referenceLabel}: spelling corrections use the <a href={matching.aliasSource} target="_blank" rel="noreferrer">source’s documented location aliases</a>.</p>}
    {(changed.length > 0 || unresolved.length > 0) && <div className={styles.tableWrap}><table><thead><tr><th>Source location</th><th>Map location</th><th>Result</th></tr></thead><tbody>{[...changed,...unresolved].map(r => <tr key={r.source}><td>{r.source}</td><td>{r.location || 'Unlocated'}</td><td>{r.status}</td></tr>)}</tbody></table></div>}
    {matching.duplicates > 0 && <p>{matching.duplicates} duplicate observations consolidated without adding their values. {matching.conflicts.length} conflicting location/date values are marked missing; original observations are preserved.</p>}
    {matching.conflicts.map(r => <p key={`${r.location}:${r.date}`}>Conflicting source values: {r.location} · {r.date}</p>)}
  </details>;
}
