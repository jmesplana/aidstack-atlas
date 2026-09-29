import { useEffect, useMemo, useRef, useState } from 'react';
import { coordinationBriefing, COORDINATION_SECTIONS } from '../../../lib/outbreak/coordinationBriefing';
import { createCoordinationPowerPoint, powerPointSlideCount, POWERPOINT_MIME } from '../../../lib/outbreak/powerPoint';
import { renderPowerPointVisual } from './PowerPointVisual';
import { download } from './Visuals';
import styles from './outbreak.module.css';

export default function PowerPointExportDialog({input,onClose}) {
  const dialog=useRef(null),controller=useRef(null);
  const [province,setProvince]=useState(''),[sections,setSections]=useState(COORDINATION_SECTIONS.map(([id])=>id)),[curveWeeks,setCurveWeeks]=useState(3);
  const [includeAppendix,setIncludeAppendix]=useState(false);
  const [preparedBy,setPreparedBy]=useState(''),[keyMessage,setKeyMessage]=useState(''),[requests,setRequests]=useState('');
  const [progress,setProgress]=useState(null),[error,setError]=useState(''),[done,setDone]=useState(false);
  const briefing=useMemo(()=>coordinationBriefing(input,{province,sections,curveWeeks,includeAppendix}),[input,province,sections,curveWeeks,includeAppendix]);
  const provinces=useMemo(()=>[...new Set([...(input.geometry?.features||[]).map(f=>f.properties?.province),...(input.model?.rows||[]).map(r=>r.province)].filter(Boolean))].sort(),[input]);
  useEffect(()=>{dialog.current.showModal();return()=>controller.current?.abort();},[]);
  function close(){controller.current?.abort();dialog.current?.close();onClose();}
  async function generate(){
    const abort=new AbortController();controller.current=abort;setError('');setDone(false);setProgress({completed:0,total:briefing.visualCount,label:'Preparing slides'});
    try {
      const blob=await createCoordinationPowerPoint({briefing,preparedBy,keyMessage,requests,signal:abort.signal,onProgress:setProgress,renderVisual:args=>renderPowerPointVisual({...args,input,briefing})});
      download(`outbreak-coordination_${input.asOf}.pptx`,blob,POWERPOINT_MIME);setDone(true);
    } catch(e){if(e.name!=='AbortError')setError(e.message||'Unable to export the briefing. Please try again.');}
    finally{setProgress(null);controller.current=null;}
  }
  return <dialog ref={dialog} className={`${styles.reportingSlideDialog} ${styles.powerPointDialog}`} aria-label="Export coordination PowerPoint" data-section-focus="true" onCancel={e=>{e.preventDefault();e.stopPropagation();close();}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}}}>
    <h3>Coordination briefing · PowerPoint</h3>
    <p>A concise briefing for the coordination meeting: key findings, situation, reported changes, response rings, burden, surveillance gaps and verification priorities. Sources and methods are retained in the deck and speaker notes.</p>
    <p><strong>{powerPointSlideCount(briefing,requests)} slides total{includeAppendix?' · includes appendix':' · concise briefing'}</strong></p><p>{briefing.availability}</p>
    <fieldset disabled={!!progress}>
      <label>Briefing province<select value={province} onChange={e=>setProvince(e.target.value)}><option value="">All loaded provinces</option>{provinces.map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Overview trend window<select value={curveWeeks} onChange={e=>setCurveWeeks(Number(e.target.value))}>{[3,6].map(n=><option value={n} key={n}>{n} reporting weeks</option>)}</select></label>
      <p>Summary counts use all areas in the chosen province scope. National response rings cover all loaded provinces. The main briefing shows five burden areas and a short verification shortlist.</p>
      <div className={styles.powerPointSections}><label><input type="checkbox" checked={includeAppendix} onChange={e=>setIncludeAppendix(e.target.checked)}/>Add detailed appendix (optional)</label></div>
      {includeAppendix&&<div className={styles.powerPointSections} role="group" aria-label="Appendix sections"><p>Surveillance visibility uses province summaries, including zones without reports. Other sections include detailed health-zone pages; select only those needed.</p>{COORDINATION_SECTIONS.map(([id,label])=>{const count=briefing.appendixChapters.find(c=>c.id===id)?.deck.pages.length||0;return <label key={id}><input type="checkbox" checked={sections.includes(id)} onChange={e=>setSections(current=>e.target.checked?[...current,id]:current.filter(s=>s!==id))}/>{label}{sections.includes(id)&&` · ${count} evidence ${count===1?'slide':'slides'}${count?' + divider':''}`}</label>;})}</div>}
      <label>Prepared by (optional)<input value={preparedBy} maxLength={160} onChange={e=>setPreparedBy(e.target.value)}/></label>
      <label>Key message (optional)<textarea value={keyMessage} maxLength={400} rows={2} onChange={e=>setKeyMessage(e.target.value)}/></label>
      <label>Coordination requests (optional)<textarea value={requests} maxLength={1600} rows={3} onChange={e=>setRequests(e.target.value)}/></label>
    </fieldset>
    <p>Charts and maps are high-resolution images; briefing text and speaker notes are editable. Uses the data captured when this export opened.</p>
    {progress&&<div role="status"><p>{progress.label} · {progress.completed} / {progress.total} evidence slides</p><progress value={progress.completed} max={Math.max(1,progress.total)}/></div>}
    {error&&<p role="alert">{error}</p>}{done&&<p role="status">PowerPoint downloaded. Review the briefing before circulating it to the team.</p>}
    <div className={styles.toolbar}><button type="button" disabled={!!progress} onClick={generate}>Download PowerPoint</button>{progress&&<button type="button" onClick={()=>controller.current?.abort()}>Cancel export</button>}<button type="button" onClick={close}>Close</button></div>
  </dialog>;
}
