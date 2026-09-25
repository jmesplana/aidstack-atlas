import { useState } from 'react';
import { ACTION_PLAYBOOK, evidenceKey, toSuggestion } from '../../../lib/outbreak/actionPlan';
import styles from './outbreak.module.css';

// Last draft survives closing and reopening the full-screen view in this session.
let lastDraft=null;
const pillarLabel=Object.fromEntries(ACTION_PLAYBOOK.pillars.map(p=>[p.id,p.label]));
const urgencyLabel=Object.fromEntries(ACTION_PLAYBOOK.urgency.map(u=>[u.id,u.label]));

function ActionCard({item,evidence,isAdded,onAdd,onSelect}) {
  const suggestion=toSuggestion(item,evidence),added=isAdded(suggestion);
  const cited=evidence.filter(e=>item.evidence.includes(e.id));
  return <li className={`${styles.actionCard} ${item.urgency?styles[`urgency_${item.urgency}`]:''}`}>
    <div className={styles.actionCardTags}>{item.urgency&&<span className={styles.urgencyTag}>{urgencyLabel[item.urgency]}</span>}{item.pillar&&<span>{pillarLabel[item.pillar]}</span>}{item.confidence&&<span>{item.confidence} confidence</span>}</div>
    <h3>{item.title}</h3>
    {item.areas.length>0&&<p className={styles.actionAreas}>{item.areas.map(a=><button key={a} type="button" onClick={()=>onSelect(a)} aria-label={`Show ${a} on map`}>{a}</button>)}</p>}
    <p>{item.action}</p>
    <details><summary>Why{cited.length?` · ${cited.length} evidence item${cited.length>1?'s':''}`:''}</summary>
      <p>{item.rationale}</p>
      {cited.length>0&&<ul>{cited.map(e=><li key={e.id}>{e.text}</li>)}</ul>}
      {item.dataNeeded&&<p><strong>Data needed:</strong> {item.dataNeeded}</p>}
    </details>
    <button type="button" className={styles.addToPlan} disabled={added} onClick={()=>onAdd(suggestion)}>{added?'In response plan ✓':'Add to response plan'}</button>
  </li>;
}

export default function ActionRail({evidence,fallback,isAdded,onAdd,onSelect,followUp,planCount,onOpenPlan}) {
  const [draft,setDraft]=useState(lastDraft),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const key=evidenceKey(evidence);
  async function generate() {
    setLoading(true);setError('');
    try {
      const r=await fetch('/api/outbreak-actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({evidence})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!Array.isArray(data.actions))throw new Error(data.error);
      lastDraft={key,evidence,actions:data.actions,dataGaps:data.dataGaps||[],at:new Date().toISOString()};setDraft(lastDraft);
    }catch(e){setError(e.message||'AI actions unavailable. Showing rule-based suggestions.');}finally{setLoading(false);}
  }
  const items=draft?draft.actions:fallback;
  return <aside className={styles.actionRail} aria-label="Recommended actions">
    <div className={styles.actionRailHead}><h2>Recommended actions</h2><button type="button" onClick={generate} disabled={loading||!evidence.length}>{loading?'Drafting…':draft?'Regenerate':'Draft with AI'}</button></div>
    <p className={styles.actionRailMeta}>{draft?`AI-drafted ${new Date(draft.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} from ${draft.evidence.length} evidence items`:'Rule-based suggestions from reported data. Draft with AI for prioritised, pillar-specific actions.'}</p>
    {draft&&draft.key!==key&&<p role="status" className={styles.actionRailStale}>Data has changed since this draft. Regenerate before sharing.</p>}
    {error&&<p role="alert" className={styles.actionRailStale}>{error}</p>}
    <div className={styles.actionRailScroll}>
      {items.length?<ol className={styles.actionList}>{items.map(item=><ActionCard key={item.id} item={item} evidence={draft?.evidence||[]} isAdded={isAdded} onAdd={onAdd} onSelect={onSelect}/>)}</ol>:<p>No suggestions can be derived from the available data.</p>}
      {draft?.dataGaps.length>0&&<section className={styles.actionGaps} aria-label="Data gaps"><h3>Data that would change these decisions</h3><ul>{draft.dataGaps.map(g=><li key={g}>{g}</li>)}</ul></section>}
    </div>
    <div className={styles.actionPlanStatus} aria-label="Response plan status"><span><strong>Response plan</strong> · {planCount} action{planCount===1?'':'s'}{followUp.overdue>0&&<> · <b>{followUp.overdue} overdue</b></>}{followUp.blocked>0&&<> · <b>{followUp.blocked} blocked</b></>}{followUp.unassigned>0&&<> · {followUp.unassigned} unassigned</>}</span><button type="button" onClick={onOpenPlan}>Open plan</button></div>
    <small className={styles.actionRailNote}>{draft?'AI drafts are limited to the cited evidence and can still be wrong. A coordinator reviews each action before approval.':'Suggestions are prompts for review, not assessments of need.'}</small>
  </aside>;
}
