/*
 * Aidstack Atlas — Geospatial Operational Intelligence
 * Copyright (C) 2025-2026 John Mark Esplana
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file for the full text.
 */

import Link from 'next/link';
import { useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, FileText, Layers, MapPin, Check } from 'lucide-react';
import LandingWorkspaceApps from './LandingWorkspaceApps';
import LandingAssessmentPreview, { EXAMPLE_SITES, ExampleStatus } from './LandingAssessmentPreview';
import styles from './LandingPage.module.css';

const github = 'https://github.com/jmesplana/aidstack-atlas';
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
  const [selectedId, setSelectedId] = useState('A');
  const selected = EXAMPLE_SITES.find(site => site.id === selectedId);

  return <div className={styles.page}>
    <a className={styles.skip} href="#main">Skip to content</a>
    <header className={styles.header}>
      <div className={styles.navInner}>
        <Link href="/landing" className={styles.brand}><Activity size={27} aria-hidden="true" /><span>Aidstack <strong>Atlas</strong></span></Link>
        <nav aria-label="Main navigation">
          <a href="#platform">Platform</a><a href="#how-it-works">How It Works</a><a href="#use-cases">Use Cases</a><a href="#workspace-apps">Apps</a><a href="#data-evidence">Data & Evidence</a>
        </nav>
        <Explore>Explore Platform</Explore>
      </div>
    </header>
    <main id="main">
      <section className={styles.hero}>
        <div className={styles.container}>
          <div className={styles.heroTop}>
            <div><p className={styles.eyebrow}><span className={styles.orangeDot} />Geospatial operational intelligence</p>
              <h1>See what’s changing around the places that <em>matter to you.</em></h1>
            </div>
            <div className={styles.heroCopy}>
              <p>Combine global risk signals with your own locations and operational data. Understand exposure, changing conditions, and where attention may be needed next.</p>
              <div className={styles.actions}><Explore /><a className={styles.heroLink} href="#how-it-works">See How It Works <ArrowRight size={15} aria-hidden="true" /></a></div>
              <p className={styles.heroEvidence}>Your locations. The surrounding context.<br />A clearer basis for the next decision.</p>
            </div>
          </div>
          <LandingAssessmentPreview selectedId={selectedId} onSelect={setSelectedId} />
          <div className={styles.signalStrip}><span>Context, connected</span><p>Hazards <i>·</i> Conflict <i>·</i> Population <i>·</i> Weather <i>·</i> Outbreaks <i>·</i> Infrastructure <i>·</i> Earth observation</p></div>
        </div>
      </section>

      <section id="platform" className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>01 / Start with your world</p><span className={styles.marginNote}>Global signals + your operational data</span></div>
          <div className={styles.split}><h2>Your locations give<br />the signals meaning.</h2><div><p className={styles.lead}>Start with the places that matter to you.</p><p>Bring your sites, boundaries and operational attributes into one workspace. Connect the conditions around them to the work you need to do.</p></div></div>
          <div className={styles.locationTypes}>{['Facilities','Warehouses','Infrastructure','Project sites','Field locations','Communities'].map(x => <span key={x}><MapPin size={13} aria-hidden="true" />{x}</span>)}</div>
          <div id="how-it-works" className={styles.workflow}>
            <div className={styles.workflowTitle}><span>How it works</span><span>From a location to a decision <ArrowRight size={14} aria-hidden="true" /></span></div>
            <ol className={styles.steps}>
              <li><span className={styles.stepNumber}>01</span><h3>Bring your places</h3><p>Upload sites and administrative boundaries. Include the attributes that matter to your operation.</p><span className={styles.stepFoot}>CSV / Excel / GeoJSON / Shapefile</span></li>
              <li><span className={styles.stepNumber}>02</span><h3>Add the context</h3><p>Select an area, review connected feeds, and load optional population, security and infrastructure context.</p><span className={styles.stepFoot}>Connected feeds + uploaded evidence</span></li>
              <li><span className={styles.stepNumber}>03</span><h3>Assess and brief</h3><p>Review exposure and experimental decision views. Check the evidence and export a briefing for your team.</p><span className={styles.stepFoot}>Map / Assessment / Briefing</span></li>
            </ol>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.portfolioSection}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>02 / See the whole portfolio</p><span className={styles.marginNote}>One place, multiple risks</span></div>
          <div className={styles.split}><h2>Know where to<br />look next.</h2><div><p className={styles.lead}>Understand risk across an entire portfolio.</p><p>Compare detected impacts and batch viability recommendations. Investigate locations requiring attention, with hazards, security and infrastructure as context.</p></div></div>
          <LandingAssessmentPreview selectedId={selectedId} onSelect={setSelectedId} portfolio />
          <div className={styles.portfolioFoot}><p><strong>From a portfolio to a place.</strong> Select a location to see it in context. Export a system-level decision brief for review.</p><p><span className={styles.experimental}>Experimental</span> The Prioritization Board ranks facilities and actions within selected administrative areas. Uploaded boundaries and an area selection are required.</p></div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.viabilitySection}`}>
        <div className={`${styles.container} ${styles.viabilityGrid}`}>
          <div><p className={styles.eyebrow}>Operation Viability <span className={styles.experimental}>Experimental</span></p><h2>Can we<br /><em>operate here?</em></h2><p className={styles.lead}>Assess one location or an entire portfolio.</p><p>Review site recommendations using available disaster impacts, security and operational context. Batch assessment uses a more limited, impact-based view.</p><p className={styles.muted}>These are planning recommendations for human review. Confirm current field conditions before acting.</p></div>
          <div className={styles.statusList}>{[['GO','Review readiness','Confirm the conditions needed for your operation.'],['CAUTION','Investigate constraints','Understand the drivers and what needs follow-up.'],['DELAY','Review timing','Consider constraints, timing and alternatives.'],['NOGO','Reassess before proceeding','Review the recommendation with your operational team.']].map(([status,title,body]) => <div key={status}><span className={styles.statusCode}>{status}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div>
        </div>
      </section>

      <section id="evidence" className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>03 / Follow the evidence</p><span className={styles.marginNote}>Context behind the assessment</span></div>
          <div className={styles.evidenceLayout}>
            <div><h2>A score is a starting point.<br /><em>Ask what’s behind it.</em></h2><p>Hazard decision views show contributing drivers, sources and limitations. Outbreak Response retains observation dates and source provenance in briefings and evidence exports.</p><div className={styles.evidenceChecklist}>{[['Sources & dates','Distinguish a reporting date from retrieval time.'],['Drivers & missing signals','Review contributing evidence and coverage gaps.'],['Assumptions & limitations','Check what an assessment can and cannot establish.']].map(([title,body]) => <div key={title}><Check size={16} aria-hidden="true" /><p><strong>{title}</strong><span>{body}</span></p></div>)}</div><p className={styles.small}>Evidence detail varies by workflow. Mapped infrastructure does not confirm current access or operating capacity.</p></div>
            <div className={styles.evidenceSheet}>
              <div className={styles.sheetHeader}><Layers size={17} aria-hidden="true" /><span>Evidence review</span><small>Illustrative checklist</small></div>
              <div className={styles.sheetTitle}><span>{selected.name} / Review context</span><ExampleStatus status={selected.status} /></div>
              <p className={styles.sheetReason}>{selected.reason}</p>
              <details open><summary>Hazard context <span>Source check</span></summary><p>Review the source report, its reporting date and the location of detected impacts. No source observations are loaded in this illustration.</p></details>
              <details><summary>Security & infrastructure <span>Coverage check</span></summary><p>Review uploaded security-event dates and the coverage of optional infrastructure layers. A mapped road does not establish current access.</p></details>
              <details><summary>What needs follow-up <span>Field check</span></summary><p>{selected.action}. Confirm local conditions and missing evidence with your team before deciding.</p></details>
              <div className={styles.sheetFooter}>Evidence first. Judgment stays with your team.</div>
            </div>
          </div>
          <div className={styles.briefingRow}>
            <div className={styles.briefDocument}><div className={styles.documentHeader}><FileText size={17} aria-hidden="true" /><span>Operational briefing</span><span>Illustrative</span></div><h3>{selected.name}</h3><p>{selected.reason}</p><div className={styles.documentRule} /><span className={styles.documentLabel}>Review prompt</span><p>{selected.action}.</p><div className={styles.documentBottom}>Context · Drivers · Follow-up</div></div>
            <div><p className={styles.eyebrow}>From data to briefing</p><h2>Give your team<br />a shared starting point.</h2><p>Use AI-assisted analysis and situation reports to interpret workspace context. Export decision briefs, or use Outbreak Response for dated, source-linked briefings.</p><p className={styles.small}><span className={styles.experimental}>Experimental</span> Forecasts and Operational Outlook offer planning scenarios and drivers to review. They do not establish what will happen next.</p><Link href="/app" className={styles.textLink}>Explore the workspace <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
          </div>
        </div>
      </section>

      <section id="use-cases" className={`${styles.section} ${styles.useCaseSection}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>Built around the work</p><span className={styles.marginNote}>Example applications</span></div>
          <div className={styles.split}><h2>Different missions.<br />A shared need for context.</h2><p className={styles.lead}>For teams whose work depends on physical places, from field operations to distributed infrastructure.</p></div>
          <div className={styles.useCases}>{applications.map(([title,body],i) => <article key={title}><span>0{i+1}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
          <p className={styles.small}>Applications of existing platform tools, not separate industry products or customer claims.</p>
          <div className={styles.origin}><div><p className={styles.eyebrow}>Our starting point</p><h3>Built in complex operating environments.</h3><p>Aidstack originated from the need to bring fragmented disaster, health, population, security and operational data together for teams working in complex environments.</p></div><div><h3>Outbreak response in practice</h3><p>Connect reported case indicators with population denominators, uploaded movement connections, workspace security and facility context, and dated response indicators.</p><p className={styles.small}>Where are conditions changing? Where is response evidence missing? These are prompts for investigation; movement does not establish transmission.</p></div></div>
        </div>
      </section>

      <LandingWorkspaceApps />

      <section id="data-evidence" className={styles.section}>
        <div className={styles.container}>
          <div className={styles.split}><div><p className={styles.eyebrow}>Data & evidence</p><h2>Multiple sources.<br />One geographic context.</h2></div><p>Combine connected feeds with your own data and optional layers. Each source has its own coverage, dates and limitations.</p></div>
          <div className={styles.sources}>{sources.map(([name,type,body]) => <details key={name}><summary><span>{name}</span><small>{type}</small></summary><p>{body}</p></details>)}</div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.faqSection}`}>
        <div className={`${styles.container} ${styles.faqLayout}`}><div><p className={styles.eyebrow}>A few practical questions</p><h2>Before you explore.</h2><p>Start with your geography.<br />Build the context from there.</p></div><div className={styles.faq}>{faqs.map(([question,answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div>
      </section>

      <section className={styles.finalCta}><div className={styles.container}><p className={styles.eyebrow}>A clearer view starts here</p><h2>Your locations already exist.<br />The context around them<br /><em>keeps changing.</em></h2><p>Bring your sites and operational data into one workspace and understand the conditions developing around them.</p><div className={styles.actions}><Explore /><a className={styles.heroLink} href={github}>View on GitHub <ArrowUpRight size={16} aria-hidden="true" /></a></div></div></section>
    </main>
    <footer className={styles.footer}><div className={styles.container}><Link href="/landing" className={styles.brand}><Activity size={24} aria-hidden="true" />Aidstack <strong>Atlas</strong></Link><p>Geospatial operational intelligence</p><div className={styles.footerLinks}><span>AGPL-3.0 &middot; &copy; 2025-2026 John Mark Esplana</span><a href={`${github}/blob/main/LICENSE`}>License</a><a href={github}>Source <ArrowUpRight size={12} aria-hidden="true" /></a></div></div></footer>
  </div>;
}
