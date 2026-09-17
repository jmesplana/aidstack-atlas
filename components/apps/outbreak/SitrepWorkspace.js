import { useState } from 'react';
import { SITREP_SECTIONS, sitrepFilename } from '../../../lib/outbreak/sitrep';
import { sitrepHTML, sitrepMarkdown } from '../../../lib/outbreak/sitrepPrint';
import { validDate } from '../../../lib/outbreak/data';
import { download, printBriefing } from './Visuals';
import BriefWorkflow from './BriefWorkflow';
import styles from './outbreak.module.css';

export default function SitrepWorkspace({ reportRef, children, name, asOf, datasets, actions, reviewed, onReviewed,
  onTab, options, onOptions, bottomLine, onBottomLine, includeAppendix, onAppendix, includeEvidenceDates,
  onEvidenceDates, routeData, selectedLocation, briefDirection, onDirection, snapshot, organize, canOrganize, movementOverlays }) {
  const [editorOpen,setEditorOpen] = useState(false);
  const [exportError,setExportError] = useState('');
  const areas = [...new Set(routeData?.routes.flatMap(r=>[r.origin,r.destination]) || [])].sort();
  const chosen = options.mobilityAreas?.length ? options.mobilityAreas : [selectedLocation || areas[0]].filter(Boolean);
  function exportReport(format) {
    setExportError('');
    try {
      if(format==='pdf')printBriefing(sitrepHTML(reportRef.current));
      else if(format==='json')download('outbreak-evidence.json',JSON.stringify(snapshot(),null,2),'application/json');
      else download(sitrepFilename(name,asOf,format),format==='html'?sitrepHTML(reportRef.current):sitrepMarkdown(reportRef.current),format==='html'?'text/html':'text/markdown');
    } catch(error) { setExportError(error.message); }
  }
  return <section className={styles.sitrepWorkspace} aria-label="Prepare Sitrep">
    <div className={styles.reportToolbar} data-print-hide="true">
      <div><h3>Situation report</h3><p>A4 preview · five integrated sections · {reviewed?'Reviewed':'Draft for review'}</p></div>
      <div className={styles.toolbar}>
        <button type="button" aria-expanded={editorOpen} onClick={()=>setEditorOpen(!editorOpen)}>Edit report</button>
        <details className={styles.exportMenu}><summary>Other formats</summary><div>
          <button onClick={()=>exportReport('html')}>Export briefing HTML with visuals</button>
          <button onClick={()=>exportReport('md')}>Export briefing Markdown</button>
          <button onClick={()=>exportReport('json')}>Export evidence JSON</button>
        </div></details>
        <button className={styles.primaryAction} onClick={()=>exportReport('pdf')}>Print / save PDF</button>
      </div>
    </div>
    {exportError && <p role="alert" className={styles.error}>{exportError}</p>}
    <BriefWorkflow datasets={datasets} actions={actions} asOf={asOf} reviewed={reviewed} onTab={onTab}/>
    <div className={`${styles.reportLayout} ${editorOpen?styles.reportEditing:''}`}>
      {editorOpen && <aside className={styles.reportEditor} aria-label="Report editor" data-print-hide="true">
        <h3>Report details</h3>
        <label>Publication date<input type="date" value={options.publishedOn || asOf} onChange={e=>{if(validDate(e.target.value))onOptions({...options,publishedOn:e.target.value});}}/></label>
        <label>Prepared by<input value={options.preparedBy || ''} maxLength={180} placeholder="Team or organization" onChange={e=>onOptions({...options,preparedBy:e.target.value})}/></label>
        <label>Contact<input value={options.contact || ''} maxLength={180} placeholder="Report contact" onChange={e=>onOptions({...options,contact:e.target.value})}/></label>
        <label>Bottom line for decision-makers (your judgement — not AI-generated)<textarea value={bottomLine} maxLength={800} placeholder="One or two sentences: the trajectory and what you need from leadership." onChange={e=>onBottomLine(e.target.value)}/></label>
        <small>Leave blank to use the data summary. Review your text after refreshing data.</small>
        <h3>Report sections</h3><p>Add your interpretation below each section. Figures come from the loaded evidence.</p>
        {SITREP_SECTIONS.map(([id,label],index)=><details key={id}><summary>{index+1}. {label}</summary>
          <label>{label} — coordinator note<textarea value={options.notes?.[id] || ''} maxLength={2000} onChange={e=>onOptions({...options,notes:{...options.notes,[id]:e.target.value}})}/></label>
          {id==='mobility' && areas.length>0 && <><label>Mobility view<select aria-label="Mobility view" value={briefDirection} onChange={e=>onDirection(e.target.value)}><option value="inflow">Inflow — origins arriving in the focus area</option><option value="outflow">Outflow — destinations from the focus area</option></select></label>
            <label className={styles.checkLabel}><input type="checkbox" checked={movementOverlays.showMines} disabled={!movementOverlays.mines.length} onChange={e=>movementOverlays.onMines(e.target.checked)}/>IPIS mining sites</label>
            <label className={styles.checkLabel}><input type="checkbox" checked={movementOverlays.showSecurity} disabled={!movementOverlays.events.length} onChange={e=>movementOverlays.onSecurity(e.target.checked)}/>ACLED security events</label>
            <label>Focus area for movement maps<select aria-label="Focus area for movement maps" value={chosen[0] || ''} onChange={e=>onOptions({...options,mobilityAreas:[e.target.value,...chosen.slice(1).filter(a=>a!==e.target.value)]})}>{areas.map(area=><option key={area}>{area}</option>)}</select></label>
            {chosen.slice(1).map(area=><p key={area}>{area} <button onClick={()=>onOptions({...options,mobilityAreas:chosen.filter(a=>a!==area)})}>Remove map: {area}</button></p>)}
            {chosen.length<3 && <label>Add another mobility map<select aria-label="Add another mobility map" value="" onChange={e=>{if(e.target.value)onOptions({...options,mobilityAreas:[...chosen,e.target.value]});}}><option value="">Choose area (up to 3 maps)</option>{areas.filter(area=>!chosen.includes(area)).map(area=><option key={area}>{area}</option>)}</select></label>}
          </>}
        </details>)}
        <details><summary>Evidence and export options</summary>
          <label className={styles.checkLabel}><input type="checkbox" checked={includeAppendix} onChange={e=>onAppendix(e.target.checked)}/>Include detailed evidence and extra maps in this briefing and exports</label>
          <label className={styles.checkLabel}><input type="checkbox" checked={includeEvidenceDates} onChange={e=>onEvidenceDates(e.target.checked)}/>Include evidence dates and gaps in the exported report</label>
          <button disabled={!canOrganize} onClick={organize}>Use AI to select leadership messages</button>
          <p>Optional: sends evidence sentences to AI to select emphasis. It cannot add facts or numbers.</p>
        </details>
      </aside>}
      <div className={styles.paperPreview}>{children}</div>
    </div>
    <div className={styles.reviewBar} data-print-hide="true"><label className={styles.checkLabel}><input type="checkbox" checked={reviewed} onChange={e=>onReviewed(e.target.checked)}/>I have reviewed this snapshot and its evidence for sharing.</label><button className={styles.primaryAction} onClick={()=>exportReport('pdf')}>Print report</button></div>
  </section>;
}
