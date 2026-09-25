import styles from './outbreak.module.css';

export default function KeyMessage({message,asOf,reviewed,editor,onBriefing,compact=false,onView}) {
  const paragraphs=message.text.split(/\n\s*\n/);
  return <section className={`${styles.keyMessage} ${compact?styles.compactMessage:''}`} aria-label="Key message">
    <div className={styles.keyMessageHeading}><h3>Key message</h3><span>{reviewed?'Reviewed':'Draft for review'} · cut-off {asOf}</span></div>
    {(compact?paragraphs.slice(0,1):paragraphs).map((paragraph,index)=><p key={index}>{paragraph}</p>)}
    {compact&&message.highlights?.length>0&&<div className={styles.monitorHighlights}>{message.highlights.map(h=><div key={h.view}><p>{h.text}</p>{onView&&<button type="button" onClick={()=>onView(h.view)}>Open {h.view==='burden'?'burden & movement':h.view==='reporting'?'reporting history':'case trends'}</button>}</div>)}</div>}
    {compact&&paragraphs.length>1&&<details><summary>Priority areas and suggested actions</summary>{paragraphs.slice(1).filter(p=>!message.highlights?.some(h=>h.text===p)).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</details>}
    {!compact&&<small>{message.origin}</small>}
    {editor&&<div className={styles.noPrint}><details><summary>Edit key message</summary>{editor}</details></div>}
  </section>;
}
