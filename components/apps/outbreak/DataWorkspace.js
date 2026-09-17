import { FileText, Table2, Database, Map } from 'lucide-react';
import styles from './outbreak.module.css';

const views=[
  ['reports','Reports','Community feedback & documents',FileText],
  ['indicators','Numeric data','Cases, burials & response indicators',Table2],
  ['sources','Connected sources','Public feeds & data coverage',Database],
  ['context','Maps & context','Mobility, mining & security',Map]
];

export default function DataWorkspace({active,onSelect,reports,indicators,sources,context,reportCount,sourceCount}) {
  const contents={reports,indicators,sources,context};
  return <section aria-label="Data workspace" className={styles.dataWorkspace}>
    <header className={styles.workspaceHeading}>
      <div><span className={styles.eyebrow}>BUILD YOUR EVIDENCE</span><h3>What would you like to add?</h3><p>Choose a data type. Review it here, then use Situation and Briefing to see the results.</p></div>
      <span className={styles.countBadge}>{reportCount} reports · {sourceCount} indicator sources</span>
    </header>
    <nav className={styles.dataChoices} aria-label="Data tasks">
      {views.map(([id,title,description,Icon])=><button type="button" key={id} aria-pressed={active===id} aria-controls={`outbreak-data-${id}`} onClick={()=>onSelect(id)}><Icon size={22} aria-hidden="true"/><span><strong>{title}</strong><small>{description}</small></span></button>)}
    </nav>
    {views.map(([id,title])=><div key={id} id={`outbreak-data-${id}`} role="region" aria-label={title} hidden={active!==id}>{contents[id]}</div>)}
  </section>;
}
