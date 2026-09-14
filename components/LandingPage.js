import Link from 'next/link';
import { Activity, ArrowRight } from 'lucide-react';
import LandingWorkspaceApps from './LandingWorkspaceApps';
import LandingAssessmentPreview from './LandingAssessmentPreview';
import styles from './LandingPage.module.css';

const github = 'https://github.com/jmesplana/gdacs_ai';
const applications = [
  ['Humanitarian & Global Health', 'Bring disaster response, outbreak response, immunization, WASH and field operations into a shared geographic context.'],
  ['Government & Civil Protection', 'Review hazards, exposed locations and infrastructure across selected operational areas.'],
  ['Infrastructure & Field Operations', 'Assess conditions around physical sites, projects and field locations.'],
  ['Logistics & Distributed Operations', 'Review location exposure and available road, bridge, fuel and airport context to investigate access constraints.'],
  ['Enterprise Risk', 'Compare location-based exposure across an uploaded portfolio and identify sites for further review.']
];
const sources = [
  ['GDACS', 'API feed', 'Disaster alerts and impact geometry. Availability and update timing depend on the source.'],
  ['WHO Disease Outbreak News', 'API feed', 'Published outbreak reports mapped where reported locations can be resolved; not a case surveillance feed.'],
  ['ACLED', 'Uploaded data', 'Upload conflict-event exports. Coverage and recency depend on the file you provide.'],
  ['Your locations & boundaries', 'Uploaded data', 'CSV or Excel sites, shapefile ZIP or GeoJSON boundaries, and relevant operational attributes.'],
  ['OpenStreetMap', 'Optional API layer', 'Load infrastructure categories for selected administrative areas. Mapped features do not confirm current access or capacity.'],
  ['WorldPop', 'Optional · Earth Engine', 'Population and age-sex context for uploaded administrative areas; requires a configured Earth Engine service.'],
  ['Google Earth Engine', 'Optional context layers', 'Flood, drought, accessibility, nighttime lights and Sentinel imagery/radar context. Change comparisons and hazard decision views remain experimental.'],
  ['Open-Meteo', 'Forecast API', 'Weather forecast context where requested. Forecasts and cached responses have their own time windows.']
];
const faqs = [
  ['What should I upload first?', 'Start with a CSV or Excel file containing name, latitude and longitude. Add operational attributes as extra columns. Upload administrative boundaries as a shapefile ZIP or GeoJSON to use area-scoped enrichment and prioritization.'],
  ['Is Aidstack only for humanitarian teams?', 'No. Its origins are in humanitarian and global-health workflows, but the core platform works with user-provided locations. The broader applications above use those same mapping and assessment tools; they are not separate industry products.'],
  ['Can I assess many sites together?', 'Yes. Batch Operation Viability returns per-site recommendations and a combined readiness view based on available impact data. It is more limited than a detailed individual assessment. Large uploads depend on browser, service and model limits; no tested capacity guarantee is offered here.'],
  ['Does AI predict what will happen or decide for me?', 'No. AI helps interpret workspace context and draft analysis. Forecast, Operational Outlook, Operation Viability and prioritization views are experimental planning aids. Review missing evidence, assumptions and current field information before acting.'],
  ['Are all data layers live?', 'No. GDACS and WHO reports are retrieved through APIs; ACLED and your own files are uploads. Population, infrastructure and earth-observation layers are optional. Source dates, coverage and refresh behavior vary.'],
  ['What can I share with my team?', 'Export individual or system-level decision briefs as HTML and use browser printing for PDF. Outbreak Response also exports source-linked HTML and Markdown briefings, evidence JSON and SVG visuals. Immunization planning exports a workbook. Evidence detail varies by workflow.']
];
function Explore({ children = 'Explore the Platform' }) {
  return <Link href="/app" className={styles.primary}>{children}<ArrowRight size={17} aria-hidden="true" /></Link>;
}
export default function LandingPage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#main">Skip to content</a>
    <header className={styles.header}><div className={styles.navInner}>
      <Link href="/landing" className={styles.brand}><Activity size={30} aria-hidden="true" /><span>Aidstack <strong>Disasters</strong></span></Link>
      <nav aria-label="Main navigation"><a href="#platform">Platform</a><a href="#how-it-works">How It Works</a><a href="#use-cases">Use Cases</a><a href="#workspace-apps">Apps</a><a href="#data-evidence">Data & Evidence</a><a href={github}>GitHub</a></nav>
      <Explore>Explore Platform</Explore>
    </div></header>
    <main id="main">
      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div><p className={styles.eyebrow}>Geospatial operational intelligence</p>
            <h1>See what’s changing around the places that matter to you.</h1>
            <p className={styles.lead}>Combine global risk signals with your own locations and operational data to understand exposure, emerging conditions, and where attention may be needed next.</p>
            <p className={styles.signals}>Hazards · Conflict · Population · Weather · Outbreaks · Infrastructure · Earth observation</p>
            <div className={styles.actions}><Explore /><a className={styles.secondary} href="#how-it-works">See How It Works <span aria-hidden="true">↓</span></a></div>
            <p className={styles.heroEvidence}>Review available sources, drivers, dates and limitations. Evidence detail varies by assessment.</p>
          </div><LandingAssessmentPreview />
        </div>
      </section>
      <section id="platform" className={styles.section}><div className={styles.container}>
        <p className={styles.eyebrow}>Global signals + your operational data</p>
        <div className={styles.split}><h2>Start with the places that matter to you.</h2><div><p className={styles.lead}>Your locations give the signals meaning.</p><p>Bring sites, boundaries and operational attributes into one map workspace. Select an area, add the context you need, and assess what external conditions could mean for your work.</p></div></div>
        <div className={styles.locationTypes}>{['Facilities','Warehouses','Infrastructure','Project sites','Field locations','Communities'].map(x => <span key={x}>{x}</span>)}</div>
        <div className={styles.pipeline} aria-label="From your data to operational decisions">
          <div><span>01 / Inputs</span><h3>Your locations + context</h3><p>Sites, operational areas and uploaded attributes, alongside hazards, conflict, population, weather, outbreaks, roads and earth observation.</p></div>
          <div><span>02 / Aidstack intelligence</span><h3>Understand the conditions</h3><p>Geospatial exposure analysis, risk drivers and available evidence. Experimental outlooks and prioritization support further review.</p></div>
          <div><span>03 / Decision workflows</span><h3>Put the context to work</h3><p>Explore the map, assess a portfolio, review viability, use workspace apps and export briefs. Investigate, prioritize, adjust and brief your team.</p></div>
        </div>
      </div></section>
      <section className={`${styles.section} ${styles.light}`}><div className={`${styles.container} ${styles.split}`}>
        <div><p className={styles.eyebrow}>One place, multiple risks</p><h2>Risk rarely happens one layer at a time.</h2></div>
        <div><p className={styles.lead}>A nearby hazard is only part of the picture.</p><p>Security events, population exposure, outbreak reports and mapped infrastructure can add context around the same location. Review them together to understand what needs investigation.</p><p>Infrastructure coverage does not establish that a road is passable or a facility is operating. Missing or older evidence remains a reason to check conditions locally.</p></div>
      </div></section>
      <section className={`${styles.section} ${styles.dark}`}><div className={styles.container}>
        <div className={styles.split}><div><p className={styles.eyebrow}>Operation Viability <span className={styles.experimental}>Experimental</span></p><h2>Can we operate here?</h2><p className={styles.lead}>Assess one location or an entire portfolio.</p></div><div><p>Review site-level recommendations using available disaster impacts, security and operational context. Batch assessment provides a combined readiness view based on site impacts.</p><p>These statuses support operational decisions. They are planning recommendations for people to review, with detail and inputs varying between individual and batch assessments.</p></div></div>
        <div className={styles.statusGrid}>{[['GO','Review readiness'],['CAUTION','Investigate constraints'],['DELAY','Review timing'],['NOGO','Reassess before proceeding']].map(([status,detail]) => <div key={status}><strong>{status}</strong><span>{detail}</span></div>)}</div>
      </div></section>
      <section className={styles.section}><div className={`${styles.container} ${styles.split}`}>
        <div><p className={styles.eyebrow}>Portfolio intelligence</p><h2>Understand risk across an entire portfolio.</h2><p>Upload many locations, compare detected impacts and batch viability recommendations, and identify sites requiring attention. Export a system-level decision brief for review.</p><p>The experimental Prioritization Board ranks facilities and actions within selected administrative areas, with confidence and missing-signal context. Uploaded boundaries and an area selection are required.</p></div>
        <div className={styles.portfolio}><div className={styles.tableHeading}><strong>Locations for review</strong><span>Illustrative batch view</span></div>
          <table><caption className={styles.srOnly}>Illustrative locations and assessment reasons, not real results</caption><thead><tr><th>Location</th><th>Status</th><th>Assessment reason</th></tr></thead><tbody>{[['Site A','CAUTION','Hazard impact detected'],['Site B','GO','No current impacts detected'],['Site C','DELAY','Multiple hazard impacts'],['Site D','CAUTION','Hazard impact detected']].map(row => <tr key={row[0]}>{row.map((cell,i) => <td key={i} data-label={['Location','Status','Reason'][i]}>{i === 1 ? <span className={cell === 'GO' ? styles.go : styles.caution}>{cell}</span> : cell}</td>)}</tr>)}</tbody></table>
          <p className={styles.small}>No detected impact does not establish that a location is safe. Follow up on missing context.</p>
        </div>
      </div></section>
      <section id="evidence" className={`${styles.section} ${styles.light}`}><div className={styles.container}>
        <p className={styles.eyebrow}>Evidence & explainability</p><div className={styles.split}><h2>See the evidence behind the assessment.</h2><div><p className={styles.lead}>A score needs context.</p><p>Hazard decision views show contributing drivers, sources and limitations. Outbreak Response retains observation dates and source provenance in briefings and evidence exports. Coverage differs by workflow; not every score has the same evidence detail.</p></div></div>
        <div className={styles.evidenceGrid}>{[['Sources & dates','Distinguish a reporting date from a retrieval date, and an uploaded file from a connected feed.'],['Drivers & gaps','Review contributing signals and missing layers in supported assessment views.'],['Assumptions & limits','Check coverage and planning assumptions before sharing or acting on an output.']].map(([title,body]) => <div key={title}><h3>{title}</h3><p>{body}</p></div>)}</div>
        <div className={styles.brief}><div><p className={styles.eyebrow}>From data to briefing</p><h2>From data to a briefing your team can use.</h2></div><div><p>Use AI-assisted narrative analysis and situation reports to interpret workspace context. Export decision briefs, or use Outbreak Response for a dated, source-linked briefing.</p><p><span className={styles.experimental}>Experimental</span> Forecasts and Operational Outlook offer planning scenarios and drivers to review. They do not establish what will happen next.</p></div></div>
      </div></section>
      <section id="use-cases" className={styles.section}><div className={styles.container}>
        <p className={styles.eyebrow}>Example applications</p><h2>For work that depends on place.</h2><p className={styles.intro}>Different operational questions, the same location-based intelligence platform. These are applications of existing tools, not dedicated industry products or customer claims.</p>
        <div className={styles.useCases}>{applications.map(([title,body],i) => <article key={title}><span>0{i+1}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
        <div className={styles.origin}><div><p className={styles.eyebrow}>Humanitarian & global-health origins</p><h2>Built in complex operating environments</h2><p>Aidstack originated from the need to bring fragmented disaster, health, population, security, infrastructure and operational data together for teams working in complex environments.</p></div><div><h3>Outbreak response: the platform in practice</h3><p>Combine reported case indicators with population denominators, uploaded movement connections, workspace security and facility context, and dated response indicators in the Outbreak Response app.</p><ul><li>Where are reported conditions changing?</li><li>Where do movement links or security events warrant investigation?</li><li>Where are response gaps documented, or evidence missing?</li></ul><p className={styles.small}>Workflow example, not outbreak findings. Movement does not establish transmission; facility locations do not establish response capacity.</p></div></div>
      </div></section>
      <LandingWorkspaceApps />
      <section id="data-evidence" className={styles.section}><div className={styles.container}><p className={styles.eyebrow}>Data & evidence</p><h2>Built on multiple sources of evidence</h2><p className={styles.intro}>Combine connected feeds with your own data and optional context layers. Each source has its own coverage, dates and limitations.</p><div className={styles.sources}>{sources.map(([name,type,body]) => <article key={name}><div><h3>{name}</h3><span>{type}</span></div><p>{body}</p></article>)}</div></div></section>
      <section id="how-it-works" className={`${styles.section} ${styles.light}`}><div className={styles.container}><p className={styles.eyebrow}>How it works</p><h2>Bring the places. Build the context. Review the evidence.</h2><ol className={styles.steps}><li><h3>Add your geography</h3><p>Upload sites and administrative boundaries. Include the attributes that matter to your operation.</p></li><li><h3>Choose the context</h3><p>Select an area. Review hazard and outbreak reports, upload conflict data, and load optional population or infrastructure layers.</p></li><li><h3>Assess and brief</h3><p>Review exposure, experimental viability and prioritization. Check assumptions, use a specialized app, and export the relevant output.</p></li></ol></div></section>
      <section className={styles.section}><div className={`${styles.container} ${styles.faq}`}><p className={styles.eyebrow}>FAQ</p><h2>Before you explore</h2>{faqs.map(([question,answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
      <section className={styles.finalCta}><div className={styles.container}><p className={styles.eyebrow}>Your next operational picture</p><h2>Your locations already exist.<br />The context around them keeps changing.</h2><p>Bring your sites and operational data into one workspace and understand the conditions developing around them.</p><div className={styles.actions}><Explore /><a className={styles.secondary} href={github}>View on GitHub <span aria-hidden="true">↗</span></a></div></div></section>
    </main>
    <footer className={styles.footer}><div className={styles.container}><Link href="/landing">Aidstack Disasters</Link><p>Geospatial operational intelligence</p><a href={github}>GitHub</a></div></footer>
  </div>;
}
