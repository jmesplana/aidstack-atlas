import {useEffect,useRef,useState} from 'react';
import { Sparkles, Search } from 'lucide-react';
import styles from './outbreak.module.css';
import {AI_DOCUMENT_DISCLAIMER,FINDING_TYPES,documentChunks,mergeInsightFindings,validateInsightResponse} from '../../../lib/outbreak/documentInsights';

export default function DocumentAnalysis({document,onUpdate,geometry,boundaryLevel,onBusy=()=>{},children}) {
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('');
  const controller=useRef(null);
  const [query,setQuery]=useState(''),[reviewFilter,setReviewFilter]=useState('all'),[page,setPage]=useState(0);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const names=(geometry?.features||[]).map(f=>f.properties.nom).sort();
  const findings=document.findings||[];
  async function analyze() {
    const abort=new AbortController();controller.current=abort;setBusy(true);onBusy(true);setError('');
    const chunks=documentChunks(document.text);let merged=[...findings],limited=false,omitted=0;
    try{
      for(const [index,chunk] of chunks.entries()){
        setProgress(`Analyzing part ${index+1} of ${chunks.length}…`);
        const response=await fetch('/api/outbreak-document-insights',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({text:chunk.text,context:document.text.slice(0,2500),filename:document.file})});
        const raw=await response.json();if(!response.ok)throw new Error(raw.error||'AI extraction unavailable.');
        const data=validateInsightResponse(raw,chunk.text);
        merged=mergeInsightFindings(merged,data.findings,document.text);limited=limited||data.hasMore;omitted+=data.omittedFindings||0;
        const metadata=index===0?{...(!document.source?{source:data.source}:{}),...(!document.date?{date:data.reportDate}:{}),...(!document.summary?{summary:data.summary}:{}),...(document.title===document.file&&data.title?{title:data.title}:{}),...(!document.location?{location:[...new Set(merged.map(f=>f.location).filter(Boolean))].join(', ').slice(0,200)}:{})}:{};
        onUpdate({...metadata,findings:merged,analysis:{completedParts:index+1,totalParts:chunks.length,limited,omittedFindings:omitted,analyzedAt:new Date().toISOString()}});
      }
    }catch(e){if(e.name==='AbortError')setError('Analysis stopped. Completed findings are retained.');else setError(e.message);}
    finally{setBusy(false);onBusy(false);setProgress('');}
  }
  const edit=(id,patch)=>onUpdate({findings:findings.map(f=>f.id===id?{...f,...patch,edited:true}:f)});
  const filtered=findings.map((f,index)=>({f,index})).filter(({f})=>
    (!query||[f.summary,f.location,...f.themes].join(' ').toLowerCase().includes(query.toLowerCase()))&&
    (reviewFilter==='all'||reviewFilter==='dates'&&!f.endDate||reviewFilter==='locations'&&!(f.mapLevel===boundaryLevel&&names.includes(f.mapLocation))));
  const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/5)-1));
  const visible=filtered.slice(currentPage*5,currentPage*5+5);
  const undated=findings.filter(f=>!f.endDate).length;
  return <section aria-label={`AI findings for ${document.file}`}>
    <div className={styles.aiAssist}>
      <div><span className={styles.assistTitle}><Sparkles size={18} aria-hidden="true"/> Let AI help with the first draft <span className={styles.countBadge}>Optional</span></span>
        <p>Extract a summary and findings, then check them against the report. Analysis sends the extracted text to OpenAI.</p></div>
      <button className={styles.secondaryAction} type="button" disabled={busy} onClick={analyze}>{busy?'Analyzing report…':'Analyze report with AI'}</button>
      {busy&&<div role="status"><p>{progress}</p><button type="button" onClick={()=>controller.current?.abort()}>Stop analysis</button></div>}
      {error&&<p className={styles.error} role="alert">{error}</p>}
      {document.analysis&&<p className={styles.analysisResult}>{findings.length} findings extracted · {document.analysis.completedParts} of {document.analysis.totalParts} text parts analyzed.{document.analysis.limited?' Some findings were omitted; check the source for omissions.':''}</p>}
    </div>
    {children}
    {findings.length>0&&<details className={styles.findingsReview}>
      <summary>Review extracted findings <span className={styles.countBadge}>{findings.length}</span>{undated>0&&<span className={styles.missingBadge}>{undated} need dates</span>}</summary>
      <p className={styles.helperText}>Review source passages and match supported locations to map boundaries. You can confirm the report now and return to these findings later.</p>
      {undated>0&&<p className={styles.reviewNotice}>Findings without observation dates are retained in the report, but do not appear on dated maps. The report date does not fill in observation dates.</p>}
      {!names.length&&<p className={styles.reviewNotice}>Load administrative boundaries in the main app to place findings on a map.</p>}
      <div className={styles.findingTools}>
        <label><span><Search size={14} aria-hidden="true"/> Search findings</span><input type="search" value={query} placeholder="Search a theme, place or phrase" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
        <label>Review filter<select value={reviewFilter} onChange={e=>{setReviewFilter(e.target.value);setPage(0);}}><option value="all">All findings</option><option value="dates">Needs observation date</option><option value="locations">Needs map location</option></select></label>
      </div>
      <fieldset disabled={busy} className={styles.fieldset}>
        {visible.map(({f,index})=><details key={f.id} className={styles.findingCard}>
          <summary><span className={styles.findingHeading}><span className={styles.findingNumber}>{index+1}</span><span className={styles.kindBadge}>{f.kind.replaceAll('_',' ')}</span><span className={styles.findingSummary}>{f.summary}</span></span><span className={styles.findingMeta}>{f.location||'Location unspecified'} · {f.endDate||'Date unknown'}</span></summary>
          <div className={styles.findingBody}>
            <div className={styles.themeTags}>{f.themes.map(theme=><span className={styles.countBadge} key={theme}>{theme}</span>)}</div>
            <p className={styles.helperText}>Reported location: {[f.location,f.province,f.country].filter(Boolean).join(' · ')||'Not specified'} · {f.reference}</p>
            <div className={styles.reviewFields}>
              <label className={styles.fullField}>Map location for finding {index+1}<select value={f.mapLevel===boundaryLevel&&names.includes(f.mapLocation)?f.mapLocation:''} onChange={e=>edit(f.id,{mapLocation:e.target.value,mapLevel:boundaryLevel})}><option value="">Unmapped / location needs checking</option>{names.map(name=><option key={name}>{name}</option>)}</select></label>
              {['startDate','endDate'].map(key=><label key={key}>{key==='startDate'?'Observation period start':'Observation period end'} {index+1}<input type="date" value={f[key]} onChange={e=>edit(f.id,{[key]:e.target.value})}/></label>)}
            </div>
            <details><summary>Source passage and editable finding</summary><blockquote className={styles.sourceQuote}>{f.quote}</blockquote><p>{f.limitations}</p>
              <div className={styles.reviewFields}>
                <label>Finding type {index+1}<select value={f.kind} onChange={e=>edit(f.id,{kind:e.target.value})}>{FINDING_TYPES.map(kind=><option key={kind} value={kind}>{kind.replaceAll('_',' ')}</option>)}</select></label>
                <label>Theme tags {index+1}<input value={f.themes.join(', ')} maxLength={600} onChange={e=>edit(f.id,{themes:e.target.value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,8).map(t=>t.slice(0,80))})}/></label>
                <label className={styles.fullField}>Finding summary {index+1}<textarea value={f.summary} maxLength={2000} onChange={e=>edit(f.id,{summary:e.target.value})}/></label>
                {['location','country','province','geographicLevel','metricLabel','unit','population','purpose','limitations'].map(key=><label key={key}>{({location:'Source location',country:'Country',province:'Province / region',geographicLevel:'Source geographic level',metricLabel:'Reported measure',unit:'Reported unit',population:'Target population',purpose:'Activity purpose',limitations:'Limitations'})[key]} {index+1}<input value={f[key]} maxLength={key==='limitations'?2000:200} onChange={e=>edit(f.id,{[key]:e.target.value})}/></label>)}
                <label>Reported value {index+1}<input type="number" min="0" step="any" value={f.value??''} onChange={e=>edit(f.id,{value:e.target.value===''?null:Number(e.target.value)})}/></label>
              </div>
              <p className={styles.helperText}>Keep people, doses, target groups, observation periods and trial/preparedness activities distinct. No coverage or cross-report totals are inferred.</p>
            </details>
            <button className={styles.quietAction} type="button" onClick={()=>onUpdate({findings:findings.filter(item=>item.id!==f.id)})}>Remove finding {index+1}</button>
          </div>
        </details>)}
        {!filtered.length&&<p>No findings match. Try another search or filter.</p>}
      </fieldset>
      {filtered.length>5&&<nav aria-label="Finding pages" className={styles.pagination}><button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous findings</button><span>{currentPage*5+1}–{Math.min(currentPage*5+5,filtered.length)} of {filtered.length}</span><button type="button" disabled={(currentPage+1)*5>=filtered.length} onClick={()=>setPage(currentPage+1)}>Next findings</button></nav>}
    </details>}
    <p className={styles.aiDisclaimer}>{AI_DOCUMENT_DISCLAIMER}</p>
  </section>;
}
