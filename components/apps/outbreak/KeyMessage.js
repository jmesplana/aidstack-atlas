import styles from './outbreak.module.css';

export default function KeyMessage({message,asOf,reviewed,editor,onBriefing}) {
  return <section className={styles.keyMessage} aria-label="Key message">
    <div className={styles.keyMessageHeading}><h3>Key message</h3><span>{reviewed?'Reviewed':'Draft for review'} · cut-off {asOf}</span></div>
    {message.text.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}<small>{message.origin}</small>
    {editor&&<div className={styles.noPrint}><div className={styles.keyMessageActions}><button type="button" onClick={onBriefing}>Open briefing</button></div><details><summary>Edit key message</summary>{editor}</details></div>}
  </section>;
}
