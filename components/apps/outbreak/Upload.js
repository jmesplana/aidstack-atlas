import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { LEVELS, KINDS, normalizeRows } from '../../../lib/outbreak/data';
import {replacementSummary,importedMetricId} from '../../../lib/outbreak/imports';
import { suggestIndicatorColumns } from '../../../lib/outbreak/importSuggestions';
import styles from './outbreak.module.css';

export default function Upload({ onImport, datasets=[] }) {
  const [replacementId,setReplacementId]=useState('');
  const target=datasets.find(d=>d.id===replacementId);
  function selectTarget(id){
    setReplacementId(id);const d=datasets.find(item=>item.id===id);
    if(d)setMapping(m=>({...m,...d.mapping,location:d.mapping?.location||'nom',date:d.mapping?.date||'date',metric:d.mapping?.metric||d.metricId||'',label:d.label,unit:d.unit,level:d.level,kind:d.kind,purpose:/confirmed_cases$/.test(d.metricId||'')?'cases':/confirmed_deaths$/.test(d.metricId||'')?'deaths':/recover/.test(d.metricId||'')?'recoveries':/isolation/.test(d.metricId||'')?'isolation':d.purpose||'operational',category:d.category||'other',source:file||''}));
  }
  const [file,setFile]=useState(null),[rows,setRows]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [workbook,setWorkbook]=useState(null),[sheet,setSheet]=useState('');
  const [excelTools,setExcelTools]=useState(null);
  const [mapping,setMapping]=useState({location:'',date:'',metric:'',level:'health_zone',kind:'daily',purpose:'operational',category:'other',label:'',unit:'',source:''});
  const columns=useMemo(()=>[...new Set(rows.flatMap(r=>Object.keys(r)))],[rows]);
  const [hash,setHash]=useState('');
  const preparedRows=useMemo(()=>{
    if(!workbook||!excelTools||!mapping.date)return rows;
    return rows.map(row=>{
      if(typeof row[mapping.date]!=='number')return row;
      const d=excelTools.SSF.parse_date_code(row[mapping.date],{date1904:!!workbook.Workbook?.WBProps?.date1904});
      const iso=d&&d.H===0&&d.M===0&&d.S===0?`${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:'Invalid Excel date';
      return {...row,[mapping.date]:iso};
    });
  },[rows,workbook,excelTools,mapping.date]);
  async function read(event) {
    const next=event.target.files?.[0]; event.target.value='';
    if(!next) return;
    setBusy(true);setError('');setRows([]);setWorkbook(null);setFile(null);
    try {
      if(next.size>10*1024*1024) throw new Error('Maximum upload size is 10 MB.');
      const bytes=await next.arrayBuffer();
      setHash(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join(''));
      let data;
      if(/\.xlsx?$/i.test(next.name)) {
        const XLSX=await import('xlsx');
        setExcelTools(XLSX);
        const book=XLSX.read(bytes,{type:'array',cellDates:false});
        const chosen=book.SheetNames.includes(target?.sheet)?target.sheet:book.SheetNames[0];
        setWorkbook(book); setSheet(chosen);
        data=XLSX.utils.sheet_to_json(book.Sheets[chosen],{raw:true,defval:''});
      } else if(/\.json$/i.test(next.name)) {
        data=JSON.parse(new TextDecoder().decode(bytes));
        if(!Array.isArray(data)||data.some(r=>!r||typeof r!=='object'||Array.isArray(r))) throw new Error('JSON must be an array of flat records.');
      } else if(/\.csv$/i.test(next.name)) {
        const parsed=Papa.parse(new TextDecoder().decode(bytes),{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.replace(/^\uFEFF/,'').trim()});
        if(parsed.errors.length) throw new Error(parsed.errors[0].message);
        data=parsed.data;
      } else throw new Error('Choose CSV, XLSX, XLS or JSON.');
      if(!data.length||data.length>50000) throw new Error('Upload between 1 and 50,000 rows.');
      setRows(data);setFile(next.name);setMapping(m=>({...(!target?suggestIndicatorColumns(Object.keys(data[0]),m):{...m,...Object.fromEntries(['location','date','metric'].map(key=>[key,Object.hasOwn(data[0],m[key])?m[key]:'']))}),source:next.name}));
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  async function chooseSheet(name) {
    setSheet(name);setError('');
    const XLSX=await import('xlsx');
    setRows(XLSX.utils.sheet_to_json(workbook.Sheets[name],{raw:true,defval:''}));
  }
  let preview=[],validation='';
  if(rows.length) {try{preview=normalizeRows(preparedRows,mapping,'preview');}catch(e){validation=e.message;}}
  function commit() {
    try {
      if(!mapping.source.trim())throw new Error('Source description is required.');
      if(replacementId&&!target)throw new Error('The selected dataset is no longer available. Choose a replacement target again.');
      const id=target?.id||`upload:${crypto.randomUUID()}`;
      const records=normalizeRows(preparedRows,mapping,id);
      onImport({id,metricId:importedMetricId(mapping),replacesId:target?.id,label:mapping.label.trim(),level:mapping.level,kind:mapping.kind,purpose:mapping.purpose,category:mapping.category,unit:mapping.unit.trim(),status:'ready',origin:'upload',source:mapping.source.trim(),file,sheet:workbook?sheet:null,sha256:hash,fetchedAt:new Date().toISOString(),records,mapping},target?.id);
      setError('');setFile(null);setRows([]);setWorkbook(null);
    } catch(e) {setError(e.message);}
  }
  const input=(key,label)=> <label>{label}<input value={mapping[key]} maxLength={200} onChange={e=>setMapping({...mapping,[key]:e.target.value})}/></label>;
  return <section>
    <h3>Update numeric data</h3>
    {!target&&<div className={styles.toolbar} role="group" aria-label="Indicator task">
      <button type="button" aria-pressed={mapping.purpose==='cases'} onClick={()=>setMapping(m=>suggestIndicatorColumns(columns,{...m,purpose:'cases',label:'Confirmed cases',unit:'people',metric:''}))}>Update cases</button>
      <button type="button" aria-pressed={mapping.purpose==='operational'} onClick={()=>setMapping(m=>({...m,purpose:'operational',label:'',unit:'',metric:''}))}>Update response indicators</button>
    </div>}
    <p>Choose your file, check the suggested columns, then confirm the preview. Each row should describe one location and reporting date.</p>
    <details><summary>File format guidance</summary><p>Use aggregate CSV, Excel or JSON records. Dates must be YYYY-MM-DD, numbers must use dot decimals without thousands separators. Blank / ND values remain missing. Do not upload individual patient or burial records. Narrative community feedback belongs in Reports.</p></details>
    <label>Import mode<select value={replacementId} onChange={e=>selectTarget(e.target.value)}><option value="">Add separate indicator</option>{datasets.map(d=><option key={d.id} value={d.id}>Replace: {d.label} — {d.file||d.source||d.id}</option>)}</select></label>
    {target&&<p>Replaces the complete series for {target.label}; rows absent from the new file will be removed from the current analysis. Saved snapshots stay unchanged. Public refresh will preserve this uploaded replacement.</p>}
    <label>Dataset file <input type="file" accept=".csv,.xlsx,.xls,.json" onChange={read} disabled={busy}/></label>
    {busy&&<p role="status">Reading file…</p>}{error&&<p role="alert">{error}</p>}
    {file&&<><p>{file}: {rows.length.toLocaleString()} rows</p>
      {workbook&&<><label>Worksheet<select value={sheet} onChange={e=>chooseSheet(e.target.value)}>{workbook.SheetNames.map(s=><option key={s}>{s}</option>)}</select></label><p>Numeric values in the mapped date column are interpreted as Excel dates using this workbook’s date system. Formula results use stored values; formulas are not recalculated.</p></>}
      <div className="outbreak-fields">{[['location','Location column'],['date','Reporting date column'],['metric','Value column']].map(([key,title])=><label key={key}>{title}<select value={mapping[key]} onChange={e=>setMapping({...mapping,[key]:e.target.value})}><option value="">Choose column</option>{columns.map(c=><option key={c}>{c}</option>)}</select></label>)}
        <label>Geographic level<select value={mapping.level} onChange={e=>setMapping({...mapping,level:e.target.value})}>{LEVELS.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Measure type<select value={mapping.kind} onChange={e=>setMapping({...mapping,kind:e.target.value})}>{KINDS.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Dataset category<select aria-label="Dataset category" value={mapping.category} onChange={e=>setMapping({...mapping,category:e.target.value})}>{[['other','Other / unclassified'],['sdb','Safe and dignified burial'],['rcce','Community engagement / RCCE'],['logistics','Logistics and supplies'],['response','Response presence and capacity']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <label>Analysis role<select aria-label="Analysis role" value={mapping.purpose} onChange={e=>setMapping({...mapping,purpose:e.target.value})}><option value="operational">Operational / other indicator</option><option value="cases">Confirmed cases</option><option value="deaths">Deaths</option><option value="recoveries">Recoveries</option><option value="isolation">Suspected cases in isolation</option></select></label>
        {input('label','Indicator label')}{input('unit','Unit (people, requests, teams…)')}{input('source','Source / reporting organization')}
      </div>
      <p>Daily = value for that date; cumulative = running total; snapshot = status on that date. No cross-location totals are inferred.</p>
      <div style={{overflowX:'auto',maxHeight:220}}><table><caption>File preview — first five rows</caption><thead><tr>{columns.slice(0,12).map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.slice(0,5).map((r,i)=><tr key={i}>{columns.slice(0,12).map(c=><td key={c}>{String(r[c]??'').slice(0,100)}</td>)}</tr>)}</tbody></table></div>
      {validation?<p role="status">{validation}</p>:<p>{preview.length} validated observations; {preview.filter(r=>r.value===null).length} missing values. No data has been imported yet.</p>}
      {!validation&&target&&(()=>{const values=records=>records.map(({location,date,value})=>({location,date,value}));const diff=replacementSummary(values(target.records||[]),values(preview),r=>JSON.stringify([r.location,r.date]));return <p>{diff.added} observations added, {diff.changed} changed, {diff.removed} removed. New period: {preview.map(r=>r.date).sort()[0]}–{preview.map(r=>r.date).sort().at(-1)}.</p>;})()}
      <div className={styles.confirmBar}><span>{validation?'Complete the mapping to continue.':`${preview.length} observations ready for review`}</span><button className={styles.primaryAction} type="button" disabled={!!validation||!mapping.source.trim()} onClick={commit}>Confirm mapped import</button></div>
    </>}
  </section>;
}
