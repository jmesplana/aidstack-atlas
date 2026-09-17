import { useRef, useState } from 'react';
import { rcceDocumentErrors } from '../../../lib/outbreak/documents';
import styles from './outbreak.module.css';

export default function ReportMetadataEditor({document,onUpdate}) {
  const [draft,setDraft]=useState(null),[checked,setChecked]=useState(false);
  const refs=useRef({});
  const fields=[['title','Report title'],['source','Reporting organization'],['location','Location / scope'],['date','Report date'],['summary','Briefing summary']];
  const errors=draft&&checked?rcceDocumentErrors({...document,...draft}):{};
  function save() {
    const errors=rcceDocumentErrors({...document,...draft});
    setChecked(true);
    const first=fields.find(([key])=>errors[key]);
    if(first){refs.current[first[0]]?.focus();return;}
    onUpdate(Object.fromEntries(fields.map(([key])=>[key,draft[key].trim()])));
    setDraft(null);setChecked(false);
  }
  if(!draft)return <button type="button" onClick={()=>setDraft(Object.fromEntries(fields.map(([key])=>[key,document[key]||''])))}>Edit report details</button>;
  return <section className={styles.reportDetails} aria-label={`Edit details for ${document.file}`}>
    <h4>Edit report details</h4>
    <div className={styles.reviewFields}>{fields.map(([key,label])=>{
      const id=`report-${document.id}-${key}`;
      const props={id,ref:node=>{refs.current[key]=node;},value:draft[key],required:key!=='date'||!document.findings?.length,maxLength:key==='summary'?4000:200,'aria-invalid':!!errors[key],'aria-describedby':errors[key]?`${id}-error`:undefined,onChange:e=>setDraft({...draft,[key]:e.target.value})};
      return <div key={key} className={key==='summary'||key==='title'?styles.fullField:undefined}>
        <label htmlFor={id}><span>{label} <span className={styles.requiredLabel}>({props.required?'required':'optional'})</span></span>{key==='summary'?<textarea {...props} rows={4}/>:<input {...props} type={key==='date'?'date':'text'}/>}</label>
        {errors[key]&&<p id={`${id}-error`} className={styles.fieldError}>{errors[key]}</p>}
      </div>;
    })}</div>
    <p className={styles.helperText}>The report date controls whether the summary is included in the briefing. Finding observation dates stay separate.</p>
    <div className={styles.toolbar}><button type="button" className={styles.primaryAction} onClick={save}>Save report details</button><button type="button" onClick={()=>{setDraft(null);setChecked(false);}}>Cancel edits</button></div>
  </section>;
}
