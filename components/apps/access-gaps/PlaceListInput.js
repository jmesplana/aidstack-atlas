import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { resolveListAreas } from '../../../lib/planning/areaAccess';
import styles from '../../platform/Planning.module.css';

const aliases = { place: ['place', 'settlement', 'name', 'village', 'locality', 'community'], area: ['area_code', 'district', 'health_zone', 'admin_area', 'area', 'pcode'], target: ['catchup_target', 'target_population', 'target', 'missed', 'zero_dose'], feedback: ['feedback', 'community_feedback', 'comment', 'comments', 'concern', 'barrier'] };
export const emptyPlaceList = () => ({ rows: [], mapping: {}, overrides: {}, source: '', period: '' });

export default function PlaceListInput({ kind, value, onChange, districts, selectedIds, facilities, disabled, onBusyChange }) {
  const [error, setError] = useState(''), [page, setPage] = useState(0);
  const title = kind === 'targets' ? 'Catch-up list' : 'Community feedback';
  const columns = useMemo(() => [...new Set(value.rows.flatMap(Object.keys))], [value.rows]);
  const resolved = useMemo(() => resolveListAreas(value.rows, value.mapping, value.overrides, districts, selectedIds, kind), [value, districts, selectedIds, kind]);
  const update = (changes) => { setPage(0); onChange({ ...value, ...changes }); };
  function stage(rows, source) {
    const fields = [...new Set(rows.flatMap(Object.keys))];
    const mapping = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, fields.find((f) => names.includes(f.toLowerCase().replace(/\s+/g, '_'))) || '']));
    update({ rows, source, mapping, overrides: {} }); setError('');
  }
  async function read(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setError(''); onBusyChange(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Use a file smaller than 10 MB.');
      let rows;
      if (/\.csv$/i.test(file.name)) {
        const parsed = Papa.parse(await file.text(), { header: true, skipEmptyLines: 'greedy' });
        if (parsed.errors.length) throw new Error('The CSV has inconsistent columns. Check its header and rows.');
        rows = parsed.data;
      } else {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      }
      if (!rows.length || rows.length > 10000) throw new Error('Use a list with 1–10,000 rows. Excel imports the first worksheet.');
      stage(rows, file.name);
    } catch (e) { setError(e.message); }
    finally { onBusyChange(false); }
  }
  return <section>
    <div className={styles.form}>
      <label>{title} CSV or Excel<input type="file" disabled={disabled} accept=".csv,.xlsx,.xls" onChange={read} /></label>
      <label>{title} source<input disabled={disabled} value={value.source} onChange={(e) => update({ source: e.target.value })} /></label>
      <label>{title} period<input disabled={disabled} value={value.period} placeholder="e.g. October 2026" onChange={(e) => update({ period: e.target.value })} /></label>
    </div>
    <div className={styles.actions}><button disabled={disabled || !facilities.length} onClick={() => stage(facilities, 'Workspace uploaded rows')}>Use workspace rows for {kind === 'targets' ? 'catch-up list' : 'feedback'}</button>{!!value.rows.length && <button disabled={disabled} onClick={() => { onChange(emptyPlaceList()); setPage(0); }}>Remove {kind === 'targets' ? 'catch-up list' : 'feedback list'}</button>}</div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!!value.rows.length && <>
      <div className={styles.form}>{[['place', 'Place / community column'], ['area', 'Area name / code column (optional)'], ...(kind === 'targets' ? [['target', 'Catch-up target column (optional)']] : [['feedback', 'Feedback text column']])].map(([key, label]) => <label key={key}>{title}: {label}<select disabled={disabled} value={value.mapping[key] || ''} onChange={(e) => update({ mapping: { ...value.mapping, [key]: e.target.value }, overrides: {} })}><option value="">{key === 'area' ? 'Match using place name' : 'Choose column…'}</option>{columns.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>)}</div>
      <p>{resolved.filter((r) => r.status === 'matched').length} of {resolved.length} rows matched to selected areas. Review ambiguous or unmatched names below. Assigning an area does not create coordinates.</p>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Place / community</th><th>{kind === 'targets' ? 'Target' : 'Feedback'}</th><th>Match</th><th>Assign administrative area</th></tr></thead><tbody>{resolved.slice(page * 50, (page + 1) * 50).map((r) => <tr key={r.id}><td>{r.place}</td><td style={{ whiteSpace: 'normal', maxWidth: 320 }}>{kind === 'targets' ? r.target ?? 'Not supplied' : r.feedback}</td><td>{r.status}{r.issues.length ? ` · ${r.issues.join('; ')}` : ''}</td><td><select aria-label={`${title}: area for ${r.place}`} disabled={disabled} value={value.overrides[r.id] ?? '__auto'} onChange={(e) => { const overrides = { ...value.overrides }; if (e.target.value === '__auto') delete overrides[r.id]; else overrides[r.id] = e.target.value; onChange({ ...value, overrides }); }}><option value="__auto">{r.matchMethod === 'exact-name-or-code' ? `Matched: ${districts.find((d) => String(d.id) === r.areaId)?.name}` : 'Automatic matching'}</option><option value="">Exclude from this review</option>{districts.filter((d) => selectedIds.includes(String(d.id))).map((d) => <option value={String(d.id)} key={d.id}>{d.name}</option>)}</select></td></tr>)}</tbody></table></div>
      {resolved.length > 50 && <div className={styles.actions}><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(resolved.length / 50)}</span><button disabled={(page + 1) * 50 >= resolved.length} onClick={() => setPage(page + 1)}>Next</button></div>}
    </>}
  </section>;
}
