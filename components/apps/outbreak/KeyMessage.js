import styles from './outbreak.module.css';

// Condense a source to its host for the one-line attribution. The full URL, the reporting
// period and coverage stay verbatim in the expanded evidence below.
const shortSource=source=>{try{return new URL(source).hostname.replace(/^www\./,'');}catch{return source;}};

export default function KeyMessage({message,asOf,reviewed,editor,onBriefing}) {
  return <section className={styles.keyMessage} aria-label="Key message">
    <div className={styles.keyMessageHeading}><h3>Key message</h3><span>{reviewed?'Reviewed':'Draft for review'} · cut-off {asOf}</span></div>
    {message.text.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}
    {/* Attribution stays one line: the sources and the period the message describes. Full
        definitions and coverage open on demand, and always print in exports. */}
    <small>{message.origin}{!!message.basis?.length&&<> · {[...new Set(message.basis.map(item=>shortSource(item.source)))].join(', ')} · {[...new Set(message.basis.map(item=>item.period))].join('; ')}</>}</small>
    {!!message.basis?.length&&<details className={styles.messageEvidence} data-source-register="true"><summary>Evidence and coverage</summary>
      <div role="group" aria-label="Key message evidence">{message.basis.map(item=><small key={`${item.role}:${item.sourceId}`}><strong>{item.role}:</strong> {item.label} · Source: {item.url?<a href={item.url} target="_blank" rel="noreferrer">{item.source}</a>:item.source} · Period: {item.period} · Coverage: {item.coverage}</small>)}</div>
    </details>}
    {message.origin==='Coordinator message'&&<small>Coordinator wording; sources are not automatically attributed to this message.</small>}
    {editor&&<div className={styles.noPrint}><div className={styles.keyMessageActions}><button type="button" onClick={onBriefing}>Open briefing</button></div><details><summary>Edit key message</summary>{editor}</details></div>}
  </section>;
}
