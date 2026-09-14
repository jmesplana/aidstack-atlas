import Link from 'next/link';
import { Boxes, Syringe, Activity, ArrowRight } from 'lucide-react';
import styles from './LandingWorkspaceApps.module.css';

export default function LandingWorkspaceApps() {
  return <section id="workspace-apps" aria-labelledby="workspace-apps-title" className={styles.section}>
    <div className={styles.inner}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}><Boxes size={18} aria-hidden="true" /> Workspace apps</span>
          <h2 id="workspace-apps-title">One workspace. Apps for the work ahead.</h2>
          <p>Build on the core intelligence platform with focused workflows. The App Hub brings specialized tools into your map workspace, using the boundaries and context each app needs.</p>
        </div>
        <Link href="/app" className={styles.cta}>Open workspace <ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHeading}><Syringe size={24} aria-hidden="true" /><h3>Immunization planning</h3></div>
          <p>Turn settlement data into a session plan with explicit coverage gaps and resource assumptions.</p>
          <ul>
            <li>Import CSV or Excel, or use workspace sites.</li>
            <li>Assign session dates, teams and delivery modes; record delivered counts.</li>
            <li>Estimate doses, stock gaps, team-days and team budgets.</li>
            <li>Save scenarios, export a planning workbook and restore JSON backups.</li>
          </ul>
          <p className={styles.note}>Requires uploaded administrative boundaries.</p>
        </article>
        <article className={styles.card}>
          <div className={styles.cardHeading}><Activity size={24} aria-hidden="true" /><h3>Outbreak Response</h3></div>
          <p>Bring reported indicators, geographic context and response decisions into a dated, source-linked briefing.</p>
          <ul>
            <li>Upload aggregate CSV, Excel or JSON data, or connect the DRC public-source preset.</li>
            <li>Compare trends and explore areas, mobility connections, mining and security context.</li>
            <li>Track response indicators and actions with owners, resources and due dates.</li>
            <li>Save snapshots; export HTML, Markdown, evidence JSON and SVG visuals, or print to PDF.</li>
          </ul>
          <p className={styles.note}>Start with tables and trends; add boundaries for maps.</p>
        </article>
      </div>
      <div className={styles.extension}>
        <div><h3>Add tools as your workflow grows</h3><p>Open <strong>Apps</strong> on the map to install and launch an included app. Use <strong>Add app</strong> to upload a compatible app ZIP and review its requested access before installation. An example app is available in the hub.</p></div>
        <p className={styles.storage}>Apps, saved plans and snapshots stay in this browser and workspace. Disabling an app retains its saved plans.</p>
      </div>
    </div>
  </section>;
}
