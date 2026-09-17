import { useEffect, useId, useRef, useState } from 'react';
import DocumentAnalysis from './DocumentAnalysis';
import {AI_DOCUMENT_DISCLAIMER} from '../../../lib/outbreak/documentInsights';
import { extractRcceDocument, validateRcceDocument, rcceDocumentErrors, MAX_DOCUMENT_BYTES } from '../../../lib/outbreak/documents';
import styles from './outbreak.module.css';
import { UploadCloud, FileText, CheckCircle2 } from 'lucide-react';

export default function RcceUpload({onImport,documents=[],geometry,boundaryLevel,asOf}) {
  const [drafts,setDrafts]=useState([]),[selectedId,setSelectedId]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[fileErrors,setFileErrors]=useState([]),[progress,setProgress]=useState('');
  const [aiBusy,setAiBusy]=useState(false);
  const [confirmation,setConfirmation]=useState(null);
  const [validatedId,setValidatedId]=useState('');
  const fieldRefs=useRef({}),fieldId=useId();
  const confirmationRef=useRef(null);
  useEffect(()=>{
    if(confirmation){const target=fieldRefs.current[confirmation.field]||confirmationRef.current;target?.focus({preventScroll:true});target?.scrollIntoView({block:'center'});}
  },[confirmation]);
  const draft=drafts.find(d=>d.id===selectedId)||drafts[0];
  const fieldErrors=draft&&validatedId===draft.id?rcceDocumentErrors(draft):{};
  const updateDraft=(key,value)=>{setDrafts(old=>old.map(d=>d.id===draft.id?{...d,[key]:value}:d));setConfirmation(null);};
  function removeDraft() {
    setDrafts(old=>old.filter(d=>d.id!==draft.id));setSelectedId('');setError('');setConfirmation(null);setValidatedId('');
  }
  async function read(event) {
    const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length)return;
    setError('');setFileErrors([]);setConfirmation(null);
    if(drafts.length+files.length>20){setError('Review up to 20 files at a time. Confirm or cancel pending reports before adding more.');return;}
    setBusy(true);
    const added=[],failures=[],seen=new Set([...documents,...drafts].map(d=>d.sha256));
    try {
      for(const [index,file] of files.entries()) {
        setProgress(`Reading ${index+1} of ${files.length}: ${file.name}`);
        try {
          if(file.size>MAX_DOCUMENT_BYTES)throw new Error('Maximum upload size is 20 MB per file.');
          const bytes=await file.arrayBuffer();
          const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
          if(seen.has(sha256))throw new Error('This file is already imported or waiting for review.');
          const text=await extractRcceDocument(file.name,bytes);
          added.push({id:crypto.randomUUID(),file:file.name,title:file.name,source:'',location:'',date:'',summary:'',text,sha256});
          seen.add(sha256);
        }catch(e){failures.push(`${file.name}: ${e.message}`);}
      }
      setDrafts(old=>[...old,...added]);setFileErrors(failures);
    }finally{setBusy(false);setProgress('');}
  }
  function commit() {
    setValidatedId(draft.id);
    const errors=rcceDocumentErrors(draft);
    const firstInvalid=['text','title','source','location','date','summary'].find(key=>errors[key]);
    if(firstInvalid){setConfirmation({success:false,message:Object.values(errors).join(' '),field:firstInvalid});return;}
    try {
      validateRcceDocument(draft);
      onImport({...draft,...Object.fromEntries(['title','source','location','summary'].map(k=>[k,draft[k].trim()])),category:'rcce',origin:'upload',fetchedAt:new Date().toISOString()});
      removeDraft();
      setConfirmation({success:true,message:`“${draft.title.trim()}” imported. ${!draft.date?'Add a report date to include its summary in the briefing.':draft.date>asOf?'The report is after the current cut-off, so its summary is excluded from this briefing.':'Its summary is ready in Response & decisions and Briefing.'} Save a snapshot to retain it.`});
    }catch(e){setConfirmation({success:false,message:e.message});}
  }
  const missing=draft?Object.keys(rcceDocumentErrors(draft)).filter(key=>key!=='text').length:0;
  return <section aria-label="RCCE document upload" className={styles.reportIntake}>
    <div className={styles.sectionHeading}><div><h3>Upload RCCE feedback and reports</h3><p>Turn community reports into evidence for your response brief.</p></div><span className={styles.countBadge}>PDF · Word · PowerPoint · Excel · Text</span></div>
    <ol className={styles.intakeSteps} aria-label="Report import steps"><li className={!draft?styles.currentStep:undefined}><span>1</span>Add files</li><li className={draft?styles.currentStep:undefined}><span>2</span>Review report</li><li><span>3</span>Confirm & save</li></ol>
    <details className={styles.uploadBox} open={!draft}>
      <summary><UploadCloud size={21} aria-hidden="true"/> {draft?'Add more files':'1. Choose your reports'} <small>Up to 20 files · 20 MB each</small></summary>
      <label>RCCE document file<input type="file" multiple accept=".pdf,.docx,.pptx,.xlsx,.xls,.txt" disabled={busy||aiBusy} onChange={read}/></label>
      <p className={styles.helperText}>Text is read in your browser. Scanned documents need transcription.</p>
      <details><summary>Supported formats and limits</summary><p>PDF (up to 80 pages), Word (.docx), PowerPoint (.pptx), Excel (.xlsx / .xls), or plain text (.txt). Body text, tables, slide text and worksheets are included. Images, charts, speaker notes and embedded files are not read. Excel uses stored formula results. Save older .doc / .ppt files in the modern format first.</p></details>
    </details>
    {busy&&<p role="status">{progress||'Reading documents…'}</p>}{error&&<p className={styles.error} role="alert">{error}</p>}
    {fileErrors.length>0&&<div className={styles.error} role="alert"><p>Some files could not be added. You can still review the others.</p><ul>{fileErrors.map((message,i)=><li key={i}>{message}</li>)}</ul></div>}
    {draft&&<fieldset disabled={busy} className={styles.fieldset}>
      <div className={styles.reviewHeader}><div><FileText size={22} aria-hidden="true"/><h4>2. Review report</h4><span className={styles.countBadge}>{drafts.length} waiting for review</span></div><label>Report to review<select disabled={aiBusy} value={draft.id} onChange={e=>{setSelectedId(e.target.value);setError('');setConfirmation(null);setValidatedId('');}}>{drafts.map(d=><option key={d.id} value={d.id}>{d.file}</option>)}</select></label></div>
      <DocumentAnalysis key={draft.id} document={draft} geometry={geometry} boundaryLevel={boundaryLevel} onBusy={setAiBusy} onUpdate={patch=>setDrafts(old=>old.map(d=>d.id===draft.id?{...d,...patch}:d))}>
        <div className={styles.reportDetails}>
          <div className={styles.sectionHeading}><h4>Report details</h4><span className={missing?styles.missingBadge:styles.loadedBadge}>{missing?`${missing} required fields to complete`:'Required details complete'}</span></div>
          <p className={styles.helperText}>Check the details below. The summary will appear in your briefing.</p>
          <div className={styles.reviewFields}>
      {['title','source','location','date','summary'].map(key=>{
        const required=key!=='date'||!draft.findings?.length;
        const props={id:`${fieldId}-${key}`,ref:node=>{fieldRefs.current[key]=node;},required,'aria-invalid':!!fieldErrors[key],'aria-describedby':fieldErrors[key]?`${fieldId}-${key}-error`:undefined,disabled:aiBusy,maxLength:key==='summary'?4000:200,value:draft[key],onChange:e=>updateDraft(key,e.target.value)};
        return <div key={key} className={key==='summary'||key==='title'?styles.fullField:undefined}>
          <label htmlFor={props.id}><span>{({title:'RCCE report title',source:'RCCE source / reporting organization',location:'RCCE location / scope',date:'RCCE reporting date',summary:'RCCE summary for briefing'})[key]} <span className={styles.requiredLabel} aria-hidden="true">({required?'required':'optional'})</span></span>
            {key==='summary'?<textarea {...props} rows={5}/>:<input {...props} type={key==='date'?'date':'text'}/>}
          </label>
          {fieldErrors[key]&&<p id={`${fieldId}-${key}-error`} className={styles.fieldError}>{fieldErrors[key]}</p>}
        </div>;
      })}
          </div>
          {!draft.date&&draft.findings?.length>0&&<p className={styles.reviewNotice}>Date unknown? You can import this report, but its summary will stay out of the dated briefing until you add a report date.</p>}
          {draft.date>asOf&&<p className={styles.reviewNotice}>This report is after the {asOf} cut-off. It will be saved, but excluded from the current briefing.</p>}
        </div>
      </DocumentAnalysis>
      <details className={styles.sourcePreview}><summary>Read extracted source text <span className={styles.countBadge}>{draft.text.length.toLocaleString()} characters</span></summary><label>Extracted RCCE text<textarea readOnly rows={12} value={draft.text}/></label></details>
      <div className={styles.confirmBar}><div><strong>3. Add this report to your evidence</strong><small>Confirm each report, then save a snapshot to keep your work.</small></div><div className={styles.toolbar}><button type="button" aria-label="Cancel RCCE import" disabled={aiBusy} className={styles.quietAction} onClick={removeDraft}>Cancel</button><button type="button" disabled={aiBusy} className={styles.primaryAction} onClick={commit}><CheckCircle2 size={17} aria-hidden="true"/> Confirm RCCE report</button></div></div>
    </fieldset>}
    {confirmation&&<p ref={confirmationRef} tabIndex={-1} role={confirmation.success?'status':'alert'} className={confirmation.success?styles.notice:styles.error}>{confirmation.message}</p>}
  </section>;
}

export function RcceReports({documents}) {
  if(!documents.length)return null;
  return <section aria-label="RCCE qualitative reports"><h3>Community feedback / RCCE reports</h3><p>Imported qualitative summaries; reporting dates may precede the cut-off.</p>{documents.some(d=>d.analysis)&&<p>{AI_DOCUMENT_DISCLAIMER}</p>}{documents.map(d=><article key={d.id}><h4>{d.title}</h4><p style={{whiteSpace:'pre-wrap'}}>{d.summary}</p><p>{d.location} · {d.date} · Source: {d.source} · File: {d.file}</p></article>)}</section>;
}
