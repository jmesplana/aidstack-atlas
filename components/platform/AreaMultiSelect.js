import { useEffect, useId, useRef, useState } from 'react';
import styles from './AreaMultiSelect.module.css';

export default function AreaMultiSelect({ districts, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const root = useRef(null), search = useRef(null), trigger = useRef(null), id = useId();
  const matches = districts.filter((d) => `${d.name} ${d.id}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => { if (open) search.current?.focus(); }, [open]);
  return <div ref={root} className={styles.root} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); } }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" disabled={disabled} className={styles.trigger} aria-label="Select operational areas" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{value.length ? `${value.length} area${value.length === 1 ? '' : 's'} selected` : 'Select operational areas'}<span aria-hidden="true">▾</span></button>
    {open && <div id={id} className={styles.menu} role="group" aria-label="Operational area choices">
      <input ref={search} aria-label="Search operational areas" placeholder="Search by name or code…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className={styles.actions}><button type="button" disabled={disabled || !matches.length} onClick={() => onChange([...new Set([...value, ...matches.map((d) => String(d.id))])])}>Select matching areas</button><button type="button" disabled={disabled || !value.length} onClick={() => onChange([])}>Clear selection</button></div>
      <div className={styles.options}>{matches.map((d) => <label key={d.id}><input type="checkbox" disabled={disabled} checked={value.includes(String(d.id))} onChange={(e) => onChange(e.target.checked ? [...value, String(d.id)] : value.filter((v) => v !== String(d.id)))} /><span>{d.name}</span></label>)}{!matches.length && <p>No matching areas.</p>}</div>
      <button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</button>
    </div>}
    <div className={styles.chips} aria-label="Selected operational areas">{districts.filter((d) => value.includes(String(d.id))).map((d) => <span key={d.id} className={styles.chip}><span>{d.name}</span><button type="button" disabled={disabled} aria-label={`Remove ${d.name}`} onClick={() => onChange(value.filter((v) => v !== String(d.id)))}>×</button></span>)}</div>
  </div>;
}
