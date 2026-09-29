import { useState } from 'react';
import { RESPONSE_RINGS } from '../../../lib/outbreak/responseRingConfig';
import { SlideMap, SvgText } from './BriefingPrimitives';
import styles from './outbreak.module.css';

export function ResponseRingSlide({model,entry}) {
  if(entry.kind==='response-ring-details')return <>
    <text x="45" y="155" fontSize="22">Province assignments · {model.start}–{model.asOf}</text>
    {entry.rows.map((r,i)=><g key={r.location} aria-label={`Ring evidence for ${r.location}`}>
      <rect x="45" y={185+i*72} width="1510" height="65" rx="6" fill="#f1f5f9"/>
      <rect x="45" y={185+i*72} width="9" height="65" fill={RESPONSE_RINGS[r.status].color}/>
      <SvgText x="70" y={211+i*72} text={`${entry.start+i+1}. ${r.location}`} width={33} maxLines={1} fontSize="19" fontWeight="700"/>
      <text x="445" y={211+i*72} fontSize="18">{RESPONSE_RINGS[r.status].label} · {r.override?'Coordinator':'Suggested'}</text>
      <SvgText x="70" y={237+i*72} text={r.reason} width={165} maxLines={1} fontSize="15"/>
    </g>)}
    <text x="45" y="777" fontSize="16">All loaded provinces. Province and health-zone dashboard filters do not change the national classification.</text>
  </>;
  return <>
    <text x="45" y="152" fontSize="22" fontWeight="700">National three-ring response · {model.rows.length} loaded provinces</text>
    {!model.rows.length&&<text x="45" y="745" fontSize="17">Load province boundaries or health-zone boundaries with province names to classify areas.</text>}
    <text x="45" y="184" fontSize="17">Suggested from reports: {model.start}–{model.asOf} · {model.rows.filter(r=>r.override).length} coordinator assignments</text>
    <SlideMap geometry={model.geometry} rows={model.rows} categories={RESPONSE_RINGS} fitCountry="Democratic Republic of the Congo" x={45} y={211} width={640} height={525}/>
    <SvgText x="45" y="758" text={`${model.counts.unknown} unclassified · ${model.unmatched} unmatched case locations · ${model.excluded} ambiguous / unassigned boundaries`} width={92} maxLines={1} fontSize="13"/>
    {['red','orange','yellow'].map((ring,i)=>{const r=RESPONSE_RINGS[ring],y=211+i*174;return <g key={ring} aria-label={r.label}>
      <rect x="715" y={y} width="840" height="162" rx="8" fill="#f1f5f9"/>
      <rect x="715" y={y} width="9" height="162" rx="3" fill={r.color}/>
      <text x="739" y={y+31} fontSize="24" fontWeight="700">{r.label}</text>
      <text x="1535" y={y+31} textAnchor="end" fontSize="21" fontWeight="700">{model.counts[ring]} provinces</text>
      <SvgText x="739" y={y+63} text={r.actions} width={83} maxLines={4} lineHeight={23} fontSize="18"/>
      <SvgText x="739" y={y+147} text={model.rows.filter(row=>row.status===ring).map(row=>`${model.rows.indexOf(row)+1}. ${row.location}`).join(' · ')||'No provinces assigned'} width={100} maxLines={1} fontSize="14"/>
    </g>;})}
    <text x="45" y="777" fontSize="16">Map numbers follow the alphabetical province register on the following slides. Grey = insufficient evidence or coordinator review.</text>
  </>;
}

export function ResponseRingControls({model,settings,onChange,asOf}) {
  const [province,setProvince]=useState(''),[ring,setRing]=useState('red'),[note,setNote]=useState('');
  const selected=model.rows.some(r=>r.location===province)?province:model.rows[0]?.location||'';
  const row=model.rows.find(r=>r.location===selected);
  function assign(e){e.preventDefault();if(!selected)return;onChange({...settings,overrides:[...(settings.overrides||[]).filter(r=>r.province!==selected||r.date!==asOf),{province:selected,date:asOf,ring,note:note.trim()}]});setNote('');}
  return <details className={styles.responseRingControls}>
    <summary>Ring criteria and coordinator assignments</summary>
    <p>Suggestions update with the reporting cut-off, case data and boundaries. Red: a reported cumulative increase between observations at most 8 days apart, within the selected window, with a latest report at most 8 days old. Orange: a mapped neighbour of a red province. Yellow: complete, unchanged reports across the window and no mapped border with red. Missing or revised evidence stays unclassified unless a red or orange signal is available.</p>
    <p>These are planning suggestions, not an official MoH classification or proof of active transmission. Confirm assignments using surveillance and operational assessments. The response package follows the supplied DRC framework; apply it to the outbreak context.</p>
    <label>Ring evidence window<select value={settings.windowDays} onChange={e=>onChange({...settings,windowDays:Number(e.target.value)})}>{[7,14,21,42].map(n=><option key={n} value={n}>{n} days</option>)}</select></label>
    <form onSubmit={assign} className={styles.reportingSlideFilters}>
      <label>Ring province<select value={selected} onChange={e=>setProvince(e.target.value)}>{model.rows.map(r=><option key={r.location}>{r.location}</option>)}</select></label>
      <label>Province ring<select value={ring} onChange={e=>setRing(e.target.value)}>{Object.entries(RESPONSE_RINGS).map(([key,r])=><option key={key} value={key}>{r.label}</option>)}<option value="auto">Use automatic suggestion</option></select></label>
      <label>Assignment source / rationale<input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. MoH response plan, dated assessment" maxLength={300}/></label>
      <button type="submit" disabled={!selected}>Apply from {asOf}</button>
    </form>
    {row&&<p role="status">{row.location}: {RESPONSE_RINGS[row.status].label}. {row.reason}</p>}
    <p>Assignments persist from their effective date until superseded or returned to automatic suggestions. Saved snapshots and browser drafts retain them. Earlier cut-offs exclude later assignments.</p>
  </details>;
}
