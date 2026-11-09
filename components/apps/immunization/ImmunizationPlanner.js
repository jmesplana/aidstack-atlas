import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Download, Upload, Save, Plus, Copy, Trash2, Printer, X, ArrowLeft, ArrowRight } from 'lucide-react';
import { OBSERVATION_FIELDS, REQUIRED_METADATA, calculatePlan, validateMetadata, validatePlan } from '../../../lib/planning/immunization';
import styles from '../../platform/Planning.module.css';
import AccessEvidence from './AccessEvidence';

const PlanningMap = dynamic(() => import('./PlanningMap'), { ssr: false });
const fieldLabels = { settlement_id: 'Settlement ID', settlement: 'Settlement name', area_code: 'Admin area code', target_population: 'Eligible children', children_vaccinated: 'Vaccinated children', latitude: 'Latitude (optional)', longitude: 'Longitude (optional)' };
const metadataLabels = { name: 'Plan name', vaccine: 'Vaccine / antigen', dose: 'Dose', cohort: 'Eligible age / cohort', period: 'Observation period', source: 'Data source / revision' };
const blankMetadata = Object.fromEntries(REQUIRED_METADATA.map((key) => [key, '']));
const initialAssumptions = { dailyCapacity: 50, wastagePercent: 0, bufferPercent: 0, stockDoses: 0, costPerTeamDay: 0, currency: '' };
const format = (value) => value == null ? 'Unknown' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
const label = (value) => String(value || '').replaceAll('_', ' ');

function downloadBlob(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ImmunizationPlanner({ storage, workspaceId, districts, facilities, leaveGuard, sharedResults }) {
  const [plan, setPlan] = useState(null);
  const [metadata, setMetadata] = useState(blankMetadata);
  const [savedPlans, setSavedPlans] = useState([]);
  const [source, setSource] = useState(null);
  const [mapping, setMapping] = useState({});
  const areaFields = useMemo(() => [...new Set(districts.flatMap((area) => Object.keys(area.properties || {})))].sort(), [districts]);
  const [areaField, setAreaField] = useState(() => [...areaFields].reverse().find((field) => /PCODE|GID_/i.test(field)) || 'id');
  const [validation, setValidation] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('Need');
  const [selectedArea, setSelectedArea] = useState('');
  const [page, setPage] = useState(0);
  const [session, setSession] = useState({ observationId: '', date: '', team: '', mode: 'Outreach', planned: '', actual: 0 });
  const worker = useRef(null);
  const rejectJob = useRef(null);
  const fileInput = useRef(null);
  const backupInput = useRef(null);
  const result = useMemo(() => plan ? calculatePlan(plan) : null, [plan]);
  const scopedRows = useMemo(() => (result?.rows || []).filter((row) => !selectedArea || row.areaId === selectedArea).sort((a, b) => b.remaining - a.remaining), [result, selectedArea]);

  useEffect(() => { storage.listPlans().then(setSavedPlans).catch((err) => setError(err.message)); }, [storage]);
  useEffect(() => {
    const guard = () => !dirty || window.confirm('Leave this draft without saving?');
    leaveGuard.current = guard;
    const unload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { leaveGuard.current = null; window.removeEventListener('beforeunload', unload); };
  }, [dirty, leaveGuard]);
  useEffect(() => () => { worker.current?.terminate(); rejectJob.current?.(new Error('Import cancelled')); }, []);
  useEffect(() => { setPage(0); }, [selectedArea, tab]);

  function runJob(payload, transfer = []) {
    worker.current?.terminate();
    return new Promise((resolve, reject) => {
      const current = new Worker(new URL('../../../workers/immunizationImport.worker.js', import.meta.url));
      worker.current = current;
      rejectJob.current = reject;
      const finish = () => { current.terminate(); worker.current = null; rejectJob.current = null; };
      current.onmessage = ({ data }) => { finish(); data.error ? reject(new Error(data.error)) : resolve(data); };
      current.onerror = () => { finish(); reject(new Error('Import worker failed. Check the file and try again.')); };
      current.postMessage(payload, transfer);
    });
  }
  function stageSource(data) {
    setSource(data); setValidation(null); setConfirmed(false);
    setMapping(Object.fromEntries(OBSERVATION_FIELDS.map((field) => [field, data.columns.includes(field) ? field : field === 'settlement' && data.columns.includes('name') ? 'name' : ''])));
    setDirty(true);
  }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy('Reading observations'); setError('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Maximum file size is 25 MB.');
      const buffer = await file.arrayBuffer();
      stageSource(await runJob({ type: 'parse', buffer }, [buffer]));
      setMetadata((current) => ({ ...current, source: current.source || file.name }));
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  async function validateImport() {
    setError('');
    const errors = validateMetadata(metadata);
    const required = ['settlement_id', 'settlement', 'target_population', 'children_vaccinated'];
    if (required.some((field) => !mapping[field])) errors.push('Map settlement ID, name, eligible children, and vaccinated children.');
    if (!mapping.area_code && !(mapping.latitude && mapping.longitude)) errors.push('Map an area code or both coordinate columns.');
    if (errors.length) { setError(errors.join('. ')); return; }
    setBusy('Validating and joining areas');
    try { setValidation(await runJob({ type: 'normalize', rows: source.rows, districts, mapping, areaField })); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  function acceptImport() {
    if (!confirmed || !validation?.observations.length) return;
    setPlan({ schemaVersion: 1, id: crypto.randomUUID(), workspaceId, revision: 0, metadata: { ...metadata },
      observations: validation.observations, sessions: [], assumptions: { ...initialAssumptions },
      importAudit: { accepted: validation.observations.length, excluded: validation.issues.length, importedAt: new Date().toISOString(), areaField } });
    setSource(null); setValidation(null); setDirty(true); setTab('Need'); setError('');
  }
  function updatePlan(update) { setPlan((current) => ({ ...current, ...update })); setDirty(true); }
  async function persist() {
    const errors = validatePlan(plan);
    if (errors.length) { setError(errors.join('. ')); return; }
    setBusy('Saving'); setError('');
    try {
      const next = await storage.savePlan(plan, plan.revision);
      setPlan(next); setDirty(false); setSavedPlans(await storage.listPlans());
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  async function openSaved(id) {
    if (!id || (dirty && !window.confirm('Discard unsaved changes and open this plan?'))) return;
    setBusy('Opening plan'); setError('');
    try { const next = await storage.loadPlan(id); if (!next) throw new Error('Plan not found.'); setPlan(next); setSource(null); setValidation(null); setDirty(false); setTab('Need'); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  async function restoreBackup(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || (dirty && !window.confirm('Replace the unsaved draft with this backup?'))) return;
    setError('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Backup exceeds 25 MB.');
      const next = JSON.parse(await file.text());
      const errors = validatePlan(next);
      if (next.workspaceId !== workspaceId) errors.push('Backup boundaries do not match this workspace');
      const areaIds = new Set(districts.map((area) => String(area.id)));
      if (next.observations?.some((row) => !areaIds.has(row.areaId))) errors.push('Backup contains unknown areas');
      if (errors.length) throw new Error(errors.join('. '));
      setPlan({ ...next, id: crypto.randomUUID(), revision: 0, savedAt: null }); setSource(null); setDirty(true); setTab('Need');
    } catch (err) { setError(`Backup not restored: ${err.message}`); }
  }
  async function exportWorkbook() {
    setBusy('Exporting'); setError('');
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const meta = Object.entries({ ...plan.metadata, ...plan.assumptions, revision: plan.revision, savedAt: plan.savedAt || 'Unsaved draft', status: 'Planning estimate; operational review required', ...plan.importAudit }).map(([field, value]) => ({ field, value }));
      const namedSessions = plan.sessions.map((row) => ({ ...row, settlement: plan.observations.find((observation) => observation.id === row.observationId)?.name }));
      for (const [name, rows] of [['Plan', meta], ['Districts', result.areas], ['Settlements', result.rows], ['Sessions', namedSessions], ['Resources', [result.resources || { status: 'Invalid assumptions or allocations' }]]]) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
      if (plan.accessEvidence) {
        const evidence = plan.accessEvidence;
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ publication: evidence.publicationId, name: evidence.name, sourceRevision: evidence.source.revision, computedAt: evidence.result.computedAt, attachedAt: evidence.attachedAt, settings: JSON.stringify(evidence.result.settings), sources: JSON.stringify(evidence.result.sources), limitations: evidence.result.limitations.join('\n') }]), 'Access evidence');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(evidence.result.settlements), 'Access settlements');
      }
      XLSX.writeFile(workbook, 'immunization-plan.xlsx');
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  function printPlan() {
    const popup = window.open('', '_blank');
    if (!popup) { setError('Allow popups to print the session plan.'); return; }
    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    popup.document.write(`<html><head><title>Immunization plan</title><style>body{font:13px Arial;padding:25px;color:#23332f}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:7px;text-align:left}h1{font-size:22px}</style></head><body><h1>${escape(plan.metadata.name)}</h1><p>${Object.entries(plan.metadata).map(([key, value]) => `${escape(label(key))}: ${escape(value)}`).join(' | ')}</p><p>Revision ${plan.revision}; ${dirty ? 'Unsaved draft' : escape(plan.savedAt)}. Operational review required.</p><p>Eligible: ${result.totals.target}; baseline missed: ${result.totals.missed}; planned: ${result.totals.planned}; remaining: ${result.totals.remaining}.</p><table><thead><tr><th>Settlement</th><th>Date</th><th>Team</th><th>Mode</th><th>Planned</th><th>Delivered</th></tr></thead><tbody>${plan.sessions.map((row) => `<tr>${[plan.observations.find((item) => item.id === row.observationId)?.name, row.date, row.team, row.mode, row.planned, row.actual].map((value) => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Assumptions: ${Object.entries(plan.assumptions).map(([key, value]) => `${escape(key)}: ${escape(value)}`).join('; ')}</p><p>Source rows accepted: ${plan.importAudit?.accepted || plan.observations.length}; excluded: ${plan.importAudit?.excluded || 0}. Target counts refer to non-overlapping eligible cohorts for the specified dose.</p></body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  }
  function addSession(event) {
    event.preventDefault();
    const next = [...plan.sessions, { ...session, id: crypto.randomUUID(), planned: Number(session.planned), actual: 0 }];
    const errors = validatePlan({ ...plan, sessions: next });
    if (errors.length) { setError(errors.join('. ')); return; }
    updatePlan({ sessions: next }); setSession({ ...session, planned: '' }); setError('');
  }
  const pageRows = scopedRows.slice(page * 100, (page + 1) * 100);
  return <div className={styles.workspace}>
    <div className={styles.toolbar}>
      <select aria-label="Saved plans" value="" disabled={!!busy} onChange={(event) => openSaved(event.target.value)}><option value="">Open saved plan...</option>{savedPlans.map((item) => <option key={item.id} value={item.id}>{item.name} (v{item.revision})</option>)}</select>
      <button disabled={!!busy} onClick={() => { if (!dirty || window.confirm('Discard this unsaved draft?')) { setPlan(null); setSource(null); setMetadata(blankMetadata); setDirty(false); setError(''); } }}><Plus size={16} />New plan</button>
      <button disabled={!!busy} onClick={() => backupInput.current.click()}><Upload size={16} />Restore backup</button>
      <input ref={backupInput} type="file" accept=".json" onChange={restoreBackup} hidden style={{ display: 'none' }} />
      {plan && <>
        <button disabled={!!busy || !dirty} className={styles.primary} onClick={persist}><Save size={16} />Save</button>
        <button disabled={!!busy} title="Create an independent scenario" onClick={() => updatePlan({ id: crypto.randomUUID(), revision: 0, savedAt: null, metadata: { ...plan.metadata, name: `${plan.metadata.name} - scenario` } })}><Copy size={16} />Scenario copy</button>
        <span className={styles.muted} role="status">{dirty ? 'Unsaved changes' : `Saved on this device · v${plan.revision}`}</span>
      </>}
      {busy && <span role="status">{busy}...</span>}
      {busy && worker.current && <button title="Cancel import" aria-label="Cancel import" onClick={() => { worker.current?.terminate(); rejectJob.current?.(new Error('Import cancelled')); worker.current = null; rejectJob.current = null; }}><X size={16} /></button>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {plan && <div className={styles.tabs} role="tablist" aria-label="Planning views">{['Need', 'Sessions', 'Resources', 'Access', 'Export'].map((name) => <button role="tab" aria-selected={tab === name} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>}
    <div className={styles.body}>
      {!plan ? <>
        <h2>New immunization plan</h2>
        <div className={styles.form}>{REQUIRED_METADATA.map((key) => <label key={key}>{metadataLabels[key]}<input value={metadata[key]} maxLength={200} onChange={(event) => { setMetadata({ ...metadata, [key]: event.target.value }); setDirty(true); setValidation(null); }} /></label>)}</div>
        <div className={styles.actions}>
          <button disabled={!!busy} className={styles.primary} onClick={() => fileInput.current.click()}><Upload size={16} />Import CSV / Excel</button>
          <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" hidden style={{ display: 'none' }} onChange={importFile} />
          <button disabled={!!busy || !facilities.length} onClick={() => stageSource({ rows: facilities, columns: [...new Set(facilities.flatMap(Object.keys))] })}>Use workspace sites ({facilities.length})</button>
          <button onClick={() => downloadBlob(`${OBSERVATION_FIELDS.join(',')}\n`, 'immunization-template.csv', 'text/csv')}><Download size={16} />Template</button>
        </div>
        {source && <>
          <h3>{format(source.rows.length)} observations</h3>
          <div className={styles.form}>
            <label>Boundary join field<select value={areaField} onChange={(event) => { setAreaField(event.target.value); setValidation(null); }}><option value="id">Platform area ID</option>{areaFields.map((field) => <option key={field}>{field}</option>)}</select></label>
            {OBSERVATION_FIELDS.map((field) => <label key={field}>{fieldLabels[field]}<select value={mapping[field] || ''} onChange={(event) => { setMapping({ ...mapping, [field]: event.target.value }); setValidation(null); }}><option value="">Select column...</option>{source.columns.map((column) => <option key={column}>{column}</option>)}</select></label>)}
          </div>
          <button disabled={!!busy} onClick={validateImport}>Validate observations</button>
        </>}
        {validation && <>
          <p>{validation.observations.length} valid rows; {validation.issues.length} excluded rows.</p>
          {validation.issues.length > 0 && <><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Source row</th><th>Settlement</th><th>Issue</th></tr></thead><tbody>{validation.issues.slice(0, 100).map((issue) => <tr key={issue.row}><td>{issue.row}</td><td>{issue.settlement}</td><td>{issue.errors}</td></tr>)}</tbody></table></div><button onClick={() => downloadBlob(JSON.stringify(validation.issues, null, 2), 'import-issues.json', 'application/json')}><Download size={16} />All import issues</button></>}
          <label className={styles.checkbox}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />The accepted rows represent non-overlapping eligible cohorts for this vaccine, dose, and observation period. Excluded rows will not contribute to totals.</label>
          <button disabled={!confirmed || !validation.observations.length || !!busy} className={styles.primary} onClick={acceptImport}>Create plan from {validation.observations.length} valid rows</button>
        </>}
      </> : <>
        <h2>{plan.metadata.name}</h2>
        <p className={styles.muted}>{plan.metadata.vaccine} · Dose {plan.metadata.dose} · {plan.metadata.cohort} · {plan.metadata.period}</p>
        {tab === 'Access' && <AccessEvidence plan={plan} districts={districts} sharedResults={sharedResults} onChange={(accessEvidence) => updatePlan({ accessEvidence })} />}
        {result.errors.length > 0 && <p className={styles.notice} role="alert">{result.errors.join('. ')}</p>}
        {plan.importAudit?.excluded > 0 && <p className={styles.notice}>{plan.importAudit.excluded} source rows were excluded. Totals cover accepted observations only.</p>}
        {tab === 'Need' && <>
          <div className={styles.stats}><div><span>Eligible children</span><strong>{format(result.totals.target)}</strong></div><div><span>Baseline coverage</span><strong>{result.totals.coverage == null ? 'Unknown' : `${format(result.totals.coverage)}%`}</strong></div><div><span>Estimated remaining gap</span><strong>{format(result.totals.remaining)}</strong></div><div><span>Not yet assigned</span><strong>{format(result.totals.unassigned)}</strong></div></div>
          <div className={styles.split}><div>
            <label>Administrative area<select value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)}><option value="">All uploaded areas</option>{districts.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
            <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Area</th><th>Eligible</th><th>Coverage</th><th>Remaining</th><th>Unassigned</th></tr></thead><tbody>{result.areas.map((area) => <tr key={area.id} data-selected={selectedArea === area.id}><td><button onClick={() => setSelectedArea(area.id)}>{area.name}</button></td><td>{format(area.target)}</td><td>{area.coverage == null ? 'Unknown' : `${format(area.coverage)}%`}</td><td>{format(area.remaining)}</td><td>{format(area.unassigned)}</td></tr>)}</tbody></table></div>
          </div><div><div className={styles.map}><PlanningMap districts={districts} areas={result.areas} selectedArea={selectedArea} onSelect={setSelectedArea} /></div><p className={styles.muted}>Amber: remaining gap · Green: no remaining gap · Gray: no observations</p></div></div>
          <h3>Settlements ({scopedRows.length})</h3>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Settlement</th><th>Eligible</th><th>Vaccinated</th><th>Remaining</th><th>Planned</th><th>Action</th></tr></thead><tbody>{pageRows.map((row) => <tr key={row.id}><td>{row.name}</td><td>{format(row.target)}</td><td>{format(row.vaccinated)}</td><td>{format(row.remaining)}</td><td>{format(row.planned)}</td><td><button disabled={row.unassigned <= 0} onClick={() => { setSession({ ...session, observationId: row.id, planned: row.unassigned }); setTab('Sessions'); }}>Plan session</button></td></tr>)}</tbody></table></div>
          <div className={styles.actions}><button aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ArrowLeft size={16} /></button><span>Page {page + 1} of {Math.max(1, Math.ceil(scopedRows.length / 100))}</span><button aria-label="Next page" disabled={(page + 1) * 100 >= scopedRows.length} onClick={() => setPage(page + 1)}><ArrowRight size={16} /></button></div>
          <p className={styles.footnote}>Gap = eligible children minus vaccinated children for the specified dose, less recorded catch-up delivery. These are aggregate planning estimates, not individual eligibility determinations. Source: {plan.metadata.source}.</p>
        </>}
        {tab === 'Sessions' && <>
          <form onSubmit={addSession}><div className={styles.form}>
            <label>Settlement<select required value={session.observationId} onChange={(event) => setSession({ ...session, observationId: event.target.value })}><option value="">Select settlement...</option>{result.rows.map((row) => <option key={row.id} value={row.id}>{row.areaName} / {row.name} ({row.unassigned} unassigned)</option>)}</select></label>
            <label>Date<input required type="date" value={session.date} onChange={(event) => setSession({ ...session, date: event.target.value })} /></label>
            <label>Team<input required maxLength={100} value={session.team} onChange={(event) => setSession({ ...session, team: event.target.value })} /></label>
            <label>Delivery mode<select value={session.mode} onChange={(event) => setSession({ ...session, mode: event.target.value })}>{['Fixed', 'Outreach', 'Mobile'].map((mode) => <option key={mode}>{mode}</option>)}</select></label>
            <label>Children assigned<input required type="number" min="1" step="1" value={session.planned} onChange={(event) => setSession({ ...session, planned: event.target.value })} /></label>
          </div><button type="submit" className={styles.primary}><Plus size={16} />Add session</button></form>
          <p className={styles.footnote}>Each session allocation must cover different children within the settlement. Delivered counts must be unique children receiving this planned dose.</p>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Settlement</th><th>Date</th><th>Team</th><th>Mode</th><th>Planned</th><th>Delivered</th><th></th></tr></thead><tbody>{plan.sessions.map((item) => <tr key={item.id}><td>{plan.observations.find((row) => row.id === item.observationId)?.name}</td><td>{item.date}</td><td>{item.team}</td><td>{item.mode}</td><td>{item.planned}</td><td><input aria-label={`Delivered at ${plan.observations.find((row) => row.id === item.observationId)?.name} on ${item.date}`} type="number" min="0" max={item.planned} step="1" value={item.actual} onChange={(event) => updatePlan({ sessions: plan.sessions.map((row) => row.id === item.id ? { ...row, actual: event.target.value } : row) })} /></td><td><button aria-label="Remove session" title="Remove session" onClick={() => { if (Number(item.actual) > 0 && !window.confirm('Remove this session and its recorded delivery?')) return; updatePlan({ sessions: plan.sessions.filter((row) => row.id !== item.id) }); }}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>
        </>}
        {tab === 'Resources' && <>
          <h3>Scenario assumptions</h3>
          <div className={styles.form}>{Object.entries({ dailyCapacity: 'Children per team-day', wastagePercent: 'Wastage (%)', bufferPercent: 'Supply buffer (%)', stockDoses: 'Available doses', costPerTeamDay: 'Cost per team-day' }).map(([key, title]) => <label key={key}>{title}<input type="number" min={key === 'dailyCapacity' ? 1 : 0} max={key === 'wastagePercent' ? 99 : undefined} step={key === 'dailyCapacity' || key === 'stockDoses' ? 1 : 'any'} value={plan.assumptions[key]} onChange={(event) => updatePlan({ assumptions: { ...plan.assumptions, [key]: event.target.value } })} /></label>)}<label>Budget currency<input value={plan.assumptions.currency || ''} maxLength={12} onChange={(event) => updatePlan({ assumptions: { ...plan.assumptions, currency: event.target.value } })} /></label></div>
          {result.resources && <><div className={styles.stats}><div><span>Doses including wastage/buffer</span><strong>{format(result.resources.doses)}</strong></div><div><span>Additional doses needed</span><strong>{format(result.resources.stockGap)}</strong></div><div><span>Required team-days</span><strong>{format(result.resources.teamDays)}</strong></div><div><span>Team-day budget ({plan.assumptions.currency || 'currency unset'})</span><strong>{format(result.resources.budget)}</strong></div></div>{result.resources.overloaded > 0 && <p className={styles.notice}>{result.resources.overloaded} team/date assignments exceed daily capacity. Add teams or reschedule before operational review.</p>}</>}
          <p className={styles.footnote}>Doses = ceiling(planned children / (1 - wastage) × (1 + buffer)). One planned dose per child. Team-days are rounded up for each team/date workload. Budget covers team-days only; transport, cold-chain equipment, vial presentation, supplies, and access still require operational review.</p>
        </>}
        {tab === 'Export' && <>
          <div className={styles.form}>{REQUIRED_METADATA.map((key) => <label key={key}>{metadataLabels[key]}<input value={plan.metadata[key]} maxLength={200} onChange={(event) => updatePlan({ metadata: { ...plan.metadata, [key]: event.target.value } })} /></label>)}</div>
          <div className={styles.actions}><button disabled={!!busy || !!result.errors.length || !!validateMetadata(plan.metadata).length} onClick={exportWorkbook}><Download size={16} />Planning workbook</button><button disabled={!!result.errors.length} onClick={printPlan}><Printer size={16} />Print session plan</button><button disabled={!!result.errors.length} onClick={() => downloadBlob(JSON.stringify(plan, null, 2), 'immunization-plan-backup.json', 'application/json')}><Download size={16} />Backup JSON</button></div>
          <p className={styles.footnote}>Workbook includes district totals, settlement gaps, session allocations, actual delivery, resources, source, assumptions, and revision. Plans are saved on this browser/device. A backup can be restored against the same uploaded boundaries.</p>
        </>}
      </>}
    </div>
  </div>;
}
