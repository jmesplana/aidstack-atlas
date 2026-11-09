import { useEffect, useState } from 'react';
import { accessEvidenceForObservations } from '../../../lib/planning/accessGaps';
import { fingerprint } from '../../../lib/planning/geography';
import styles from '../../platform/Planning.module.css';
import DecisionBrief from '../access-gaps/DecisionBrief';
import AreaReview from '../access-gaps/AreaReview';

export default function AccessEvidence({ plan, districts, sharedResults, onChange }) {
  const [publications, setPublications] = useState([]), [selection, setSelection] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    sharedResults?.list().then((rows) => { if (mounted) setPublications(rows); }).catch(() => { if (mounted) setError('Published assessments could not be loaded.'); });
    return () => { mounted = false; };
  }, [sharedResults]);
  const attached = plan.accessEvidence;
  const compatible = (scope) => scope?.areas?.every((a) => districts.some((d) => String(d.id) === a.id && fingerprint(d.geometry) === a.geometryVersion));
  async function attach() {
    setBusy(true); setError('');
    try {
      const record = await sharedResults.load(selection);
      if (!record || record.result?.schemaVersion !== 1 || !compatible(record.result.scope)) throw new Error('This assessment is unavailable or its boundaries do not match.');
      onChange({ publicationId: record.id, name: record.metadata.name, publishedAt: record.savedAt, source: record.source, result: record.result, attachedAt: new Date().toISOString() });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const rows = attached ? accessEvidenceForObservations(attached.result, plan.observations) : [];
  return <section aria-label="Shared access evidence">
    <h2>Use a published Access Gaps assessment</h2>
    <p>Attach a saved snapshot to this plan. Matching uses settlement ID and administrative area; changed coordinates are flagged. Population counts in Access Gaps do not replace eligible children or vaccination coverage.</p>
    <div className={styles.actions}><select aria-label="Published access assessment" value={selection} onChange={(e) => setSelection(e.target.value)}><option value="">Choose a published assessment…</option>{publications.filter((p) => compatible(p.scope)).map((p) => <option key={p.id} value={p.id}>{p.name} · source v{p.source.revision} · {p.computedAt.slice(0, 10)}</option>)}</select><button disabled={!selection || busy} onClick={attach}>Attach snapshot to plan</button></div>
    {!publications.length && <p className={styles.notice}>No published assessments. Save and publish an assessment in Access Gaps, then return here.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {attached && <>
      <h3>{attached.name}</h3>
      <p>Source: {attached.source.moduleId}, saved revision {attached.source.revision}. Computed {attached.result.computedAt}. Attached {attached.attachedAt}.</p>
      <p>{attached.result.method === 'friction-surface-v1' ? 'Earth Engine estimate (2019, approximately 1 km)' : 'Road-network estimate'} · {attached.result.settings.mode} · {attached.result.settings.thresholdMinutes}-minute threshold · Population reference date {attached.result.sources.populationDate} · Travel-data reference date {attached.result.sources.roadsDate}.</p>
      <p className={styles.notice}>This is a fixed evidence snapshot. Later publications do not update this plan. {rows.filter((r) => r.accessStatus === 'not-matched').length} settlements are unmatched; {rows.filter((r) => r.accessStatus === 'location-changed').length} have changed coordinates. {attached.result.settings.platformInputs && 'Population cells do not identify named settlements. Review their area coverage alongside the catch-up list.'}</p>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Settlement</th><th>Eligible children</th><th>Vaccinated</th><th>Modeled minutes</th><th>Access evidence</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.target}</td><td>{r.vaccinated}</td><td>{r.accessMinutes == null ? 'Unknown' : r.accessMinutes.toFixed(1)}</td><td>{r.accessStatus.replaceAll('-', ' ')}</td></tr>)}</tbody></table></div>
      <DecisionBrief result={attached.result} /><h3>Individual candidate alternatives</h3>
      <p className={styles.muted}>Ranked using the population modeled in Access Gaps; these are not estimates of eligible children.</p>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Site</th><th>Additional people within threshold</th><th>Reachable with unknown baseline</th></tr></thead><tbody>{attached.result.candidates.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.additionalPopulation}</td><td>{c.reachableFromUnknown}</td></tr>)}</tbody></table></div>
      <details><summary>Sources and limitations</summary><p>{attached.result.sources.population} · {attached.result.sources.roads} · {attached.result.sources.sites}</p><ul>{attached.result.limitations.map((text) => <li key={text}>{text}</li>)}</ul></details>
      {attached.result.areaContext && <AreaReview result={attached.result.areaContext} compact />}
      <button onClick={() => onChange(null)}>Detach access evidence</button>
    </>}
  </section>;
}
