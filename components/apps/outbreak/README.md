# Outbreak Response

Bundled workspace app for reported outbreak evidence, operational indicator imports,
optional maps, and reviewed leadership briefings. Install/open from Workspace apps.
No administrative layer is required. Boundaries uploaded in the main app are
available for explicit field/level matching; unmatched locations remain visible.

## Sitrep and navigation

The persistent navigation is **Situation · Data · Actions · Sitrep**. Situation
opens with a compact key message and headline figures; supporting priorities,
source status and report settings expand on demand. The reporting cut-off remains
visible. **Save snapshot** creates a dated report version. Confirmed work also
saves automatically to a separate browser draft; **Resume draft** restores it on
reopening. Drafts use the same module/workspace scope and revision-conflict checks
as report versions. Pending uploads are not saved until confirmed, and unsaved
changes still trigger the leave guard. Draft storage is local to this browser.

**Sitrep → Edit report** opens publication details, coordinator wording and notes
for each section. The default A4 report follows
`docs/2026_W37_DRC_Ebola_BVD_Sitrep_11_09_2026.pdf`:

1. Epidemiological situation and weekly trend.
2. Population mobility (choose direction and up to three focus-area maps).
3. Mining and operational geography.
4. Security and access.
5. Operational implications and immediate actions, including response and RCCE.

A key-message panel and geographic priorities lead the report; source notes close
it. Missing sections explicitly state unavailable evidence. The preview and
standalone HTML/PDF share a dedicated print stylesheet with red section headings,
blue table headers, repeated page headers and page numbers in supporting browsers.
**Print / save PDF** is the primary export; Markdown, HTML and evidence JSON are
under **Other formats**. Markdown follows the same report content and order.
Source details and the optional evidence appendix are retained in report versions.

Seven-day charts and tables use periods anchored to the reporting cut-off.
Cumulative sources require exact endpoint observations and are labelled changes
in reported totals; negative changes are revisions. Daily sources require every
observation within each period. Missing dates are never carried forward. Province
groupings use stable matched-area membership and are labelled partial area sums;
missing constituent observations suppress the comparison. Separate national
sources are never combined or silently chosen for the weekly chart.

Numeric uploads offer **Update cases** and **Update response indicators**.
Recognizable, unambiguous headers are suggested; users review geographic level,
measure type, units, mapping and preview before confirmation. Existing mappings
remain editable and ambiguous headers require an explicit choice.

## Workflow

### Daily response brief

Movement connections are visible in Situation without opening the area explorer,
and appear in section 2 of the Sitrep. Use Inflow map / Outflow map in Situation;
use Edit report → Population mobility to choose direction and focus areas in the Sitrep. The selected
direction is retained in visual exports. Evidence dates and gaps appear collapsed
at the bottom of Sitrep. Check “Include evidence dates and gaps in the exported
report” to append them to Markdown and HTML/PDF; this option is saved with snapshots.
Evidence JSON always retains the underlying data for audit purposes.

Use the compact Sitrep checklist to check data, review actions, and review/export
the report. Choose the operational scope and
reporting cut-off first. Select **Compare with previous brief** explicitly, or
use **Use open snapshot as baseline** before updating the current data. Compare
snapshots from the same operation; a later reporting cut-off is rejected as a
baseline. Each Save snapshot creates a separate record, preserving earlier briefs.
The selected comparison inputs are saved with the new brief and restored with it.

Situation and Sitrep show the same changes and evidence-date register. Response
indicator changes require the same dataset, unit, measure type, level and location;
unmatched or missing observations do not produce a change. Action additions,
edits and removals are included. Older observations are flagged relative to the
cut-off, not assigned an arbitrary freshness threshold. Distinct response indicators
are not summed, and capacity ratios require matching locations and dates.

Selected suggestions retain their rationale, cut-off and contextual source references
when edited. Assign an owner and due date in Actions, then update the
status. The guide counts unassigned, undated, overdue and blocked actions. Review
the briefing before sharing; changes invalidate the reviewed flag. Markdown,
HTML/PDF and evidence JSON preserve the comparison and action evidence.

Pilot with one coordinator using representative DRC data: record preparation time,
factual corrections, unsupported claims, and actions receiving a decision. The
software supports the pilot; operational usefulness still requires this user review.

### Updating data

Data → Maps & context includes a dedicated IPIS Excel/CSV import. Map mine ID, visit date
and WGS84 latitude/longitude; name and province are optional. Preview the eligible
sites, unmatched boundaries and added/changed/removed counts, then replace the
active mining source. The workbook worksheet and mappings are stored with the
source. Full visit history and additional columns are retained in snapshots;
each cut-off selects the latest eligible visit per mine. Older snapshots without
visit history remain readable but cannot reconstruct visits they never stored.

For cases and operational indicators, select Add separate indicator or Replace
in Import mode. Replacement keeps the dataset ID, removes observations absent
from the new file and preserves the old version in already-saved snapshots.
Column mappings and worksheet are reused when present. A newly imported cumulative
local case series becomes the active epidemiological source. Explicit roles for
cases, deaths, recoveries and isolation populate the recognised national series.
Missing mapped columns block import instead of becoming silent missing values.

Connected refresh preserves uploaded mining data, uploaded OD data and explicitly
replaced public indicators. Imports invalidate pending connected refresh results.
Public connectors still use their registered source-specific URLs and schemas;
changing source formats can be handled by mapped uploads. The public Flowminder
adapter still assumes its documented product naming and two-month period; manual
OD imports require explicit observation dates and units. Analysis windows and
response-status thresholds remain the existing defaults.

1. Use the DRC preset to load seven INSP public CSV feeds, or start a New outbreak
   for another country/disease and import scoped data. Recognized INSP data connects
   its registered source profile automatically. A manually selected connection is
   remembered for the current administrative workspace.
2. Set the reporting cut-off. National figures remain separate from local figures.
3. Upload CSV, XLS/XLSX or a flat JSON array. Choose the worksheet, location, ISO
   reporting date and numeric value columns; specify level, measure type, label,
   unit and source. Preview and confirm. Import additional indicators separately.
4. Choose the boundary name field and matching level in Situation. No fuzzy joins,
   automatic province-to-zone propagation or cross-location sums are performed.
5. Add coordinator actions, resources, owners and dates. Open Sitrep and review.
6. Save snapshots to this browser workspace. Export standalone HTML with visuals, Markdown, evidence JSON,
   individual SVG maps/charts, or print the briefing to PDF.

The example SDB CSV is synthetic and must be replaced before operational use.
Numeric uploads support aggregate indicators; this is not a patient/incident line-list
processor. Numeric imports require one observation per location/date. Duplicate
rows, invalid numbers and dates are rejected. Blank/ND/NA values remain missing.
Daily, cumulative and snapshot values are never silently interchanged. Uploaded
sources are separate series, so overlapping totals are not combined. JSON evidence
exports are audit artifacts, not an import/restore format; reopen saved snapshots
through the selector in the same browser/workspace.

### Data workspace navigation

Data opens on **Reports**. Use **Numeric data** for aggregate indicators
and GeoJSON fields, **Connected sources** for public feeds and coverage, and
**Maps & context** for mining, mobility, security and hazard inputs. Source rows
and reference catalogues expand on demand. Coverage actions open the relevant
upload view.

Pending uploads remain available when switching data views or outbreak sections.
Opening a saved snapshot or starting a new outbreak resets pending intake. Only
confirmed reports are saved in snapshots.

Report review keeps required metadata together, marks missing fields and focuses
the first invalid field on confirmation. AI assistance is optional. Extracted
source text and findings are expandable; findings support search, missing-date /
location filters and five-item pages. Unknown report dates are explicitly flagged
as excluded from briefing summaries. Imported reports can be expanded and their
metadata edited with **Edit report details**. Report dates never substitute for
finding observation dates.

### Narrative RCCE reports

Choose **Data → Reports → Upload RCCE feedback and reports** for PDF, Word `.docx`,
PowerPoint `.pptx`, Excel `.xlsx` / `.xls`, and UTF-8 `.txt` files (maximum 20 MB
and 200,000 extracted characters). Extraction runs in the browser using existing
dependencies. It reads Word body paragraphs/tables, presentation slides in deck
order, and all Excel worksheets including headers. PDF text includes file page
numbers (up to 80 pages; scanned pages require transcription). Excel uses stored formula
results. Images, charts, speaker notes and embedded files are not extracted;
older `.doc` / `.ppt` files must first be saved in the modern format.

Select multiple weekly reports together (up to 20 pending reports, 20 MB each).
Each file has its own review form; switching reports or adding more files preserves
entered details. Failed files do not discard successful ones, and identical files
already imported or pending review are skipped. Confirm or cancel each report
separately. Only confirmed reports are saved in snapshots. Weekly reports remain
separate; overlapping or cumulative figures are not added together.

Review the extracted text, enter a title, reporting organization, location/scope
and reporting date, then write a summary and confirm. Reports remain separate
from numeric indicators and do not imply coverage rates or response status.
Summaries within the reporting cut-off appear in Actions and the
briefing, including Markdown and HTML/PDF exports. Save a snapshot to retain
reports, extracted text, filenames and SHA-256 provenance. Evidence JSON retains
all reports, including those after the cut-off. Older snapshots open with no
RCCE reports; New outbreak clears them. Reading a file is local. Clicking **Analyze
report with AI** sends its extracted text to the configured OpenAI service.

### AI findings and visualization

Document analysis infers findings from content rather than filenames, fixed report
layouts, predefined places or a fixed rumor taxonomy. It proposes editable theme
tags, finding type (rumor, question, concern, request, activity, vaccination, cases
or other), original-language source passages, geographic scope, observation
periods, explicit measures/units, population and activity purpose. Long text is
processed in overlapping parts; repeated passages are deduplicated within a report.
Failed parts retain completed findings. Publication dates are separate from
observation dates, and unknown values remain unresolved. Quotes must match the
supplied text. This checks provenance, not factual accuracy or representativeness.

The visible AI disclaimer accompanies analysis, maps and exported findings. Edit
findings and explicitly match supported locations to the loaded boundaries; no
fuzzy joins, inferred coordinates or province-to-zone propagation are performed.
Findings without observation dates stay in the source register. Use the reporting
cut-off, optional start date, finding type and content-derived theme filters to
explore dated findings. A community marker represents source findings, not the
number or proportion of people who hold a belief. Missing reports do not imply
absence of concerns. Findings are never automatically converted into clinical
case datasets, vaccination coverage percentages or response-status scores.

Situation includes a document evidence map: reported case shading (when a case
source is loaded), community theme circles and vaccination-report squares at
representative area centres. Clicking an area shows its findings and Flowminder
connections. Existing mining and security overlays are available. Each explicit
numeric document measure can be selected separately by report, population, unit
and purpose; conflicting same-area/date values appear missing. Reports, weekly
periods, vaccine doses/people and clinical-trial/preparedness activities are not
pooled. Incoming/outgoing movement keeps its own period and units. The same
finding overlays appear on existing geographic and mobility maps. Findings,
source quotes, map assignments and filters persist in snapshots and evidence JSON;
dated findings also appear in Markdown and HTML/PDF briefing exports.

`OPENAI_API_KEY` enables the extraction endpoint; `OUTBREAK_DOCUMENT_MODEL` can
select a model supporting Chat Completions structured outputs (default matches
the existing briefing endpoint: `gpt-4o-mini`). Without AI configuration, manual
report imports remain available. The intake does not perform OCR of scans or
screenshots and does not treat model output as verified epidemiological evidence.

## Evidence and AI

Sitrep sentences and numbers are computed by the outbreak analysis modules. The
optional /api/outbreak-briefing endpoint asks AI only to select evidence IDs; any
unsupported ID is rejected and no model-generated prose is rendered. Selection
sends the visible evidence sentences (possibly including uploaded aggregates) to
the existing configured AI provider, only after the user clicks the labelled
button. OPENAI_API_KEY is optional; no AI call is needed for the briefing.

Strict parsing of the current public feeds found malformed cells. The public
adapter quarantines those values as missing and records row number, original
value and reason; it never corrects them by guessing. Invalid geography/date rows
are excluded with an issue record. Conflicting duplicate values are missing.
Each downloaded source includes its URL, retrieval timestamp and SHA-256 hash.
Live feeds may disagree, revise older values, or stop updating. Reporting cut-off
does not imply all metrics were observed on that day. Period comparisons require
all 14 daily observations for a location. Differenced cumulative values are
labelled changes in reported totals, not new infections.

## Integrated priorities and mobility

Every district inflow/outflow map and GeoJSON mobility map includes IPIS mining-site
and ACLED event toggles, including Sitrep and its appendix. Choices are shared
with the geographic map and saved in snapshots. Mine visits after the reporting
cut-off are excluded; ACLED uses the selected security window. Unavailable layers
are disabled with an explanation. SVG and HTML/PDF visuals retain visible points,
legends and overlay date context while excluding the interactive controls.

Burden, exact seven-day cumulative changes, mining sites and security overlaps
are ranked automatically. Focus-area cards state each selection reason. These
are review prompts, not validated transmission forecasts. No place names,
outbreak numbers or sample briefing conclusions are embedded in the analysis.

Click an area to inspect incoming origins or outgoing destinations as curved,
directional arrows. Maps support pan/zoom, labels and SVG export. Exact values
remain in a table. The default shows ten positive connections, with 25/all options.
Arcs connect representative polygon centres, not actual travel paths. Names must
match exactly; unmatched endpoints remain in the table. Without boundaries,
priorities and route tables still work.

The optional Flowminder source loader discovers the latest dated outflow matrix
from the source manifest. Incoming flows are column lookups of that same matrix;
the separate transpose is never added to it. Observation dates remain separate
from outbreak dates. Redacted cells remain missing. GeoJSON cohort destination
percentages and subscriber presence days are separate products, never fabricated
into OD routes. Source definitions are loaded from the catalogue/documentation.
Other outbreaks can upload one-period OD CSVs with explicit field mappings,
period and units. Duplicate pairs are rejected. Route data is saved in snapshots
and included in evidence JSON and visual briefings. Movement does not establish
imported infection, infected travellers or probabilities of exporting infection.

IPIS overlays deduplicate the latest visit per site identifier, retain visit dates
and exclude future visits. Historical sites do not imply current activity. Main-app
ACLED data is available through the read:security permission; validated unique
points are joined to uploaded polygons over an explicit date window. Ambiguous
spatial matches are excluded. Fatalities remain reported estimates. Main-app
facility locations do not imply verified response capacity. Upload dated response
indicators; the sample provincial footprint is not a computed data source.

The Situation view opens with an overall snapshot, trends, areas to review and
suggested actions. Detail maps, mobility controls and observation tables live in
an expandable area explorer. Recommendations are deterministic evidence-based
review prompts with observation periods, and can be added to the response plan.

When two or more national series are loaded (confirmed cases, deaths, recoveries,
suspected-in-isolation), the Trends panel shows a single multi-series line chart
on one shared scale. Each series has a fixed colour and a distinct dash pattern
(so identity is never colour-alone; the palette is CVD-validated on the light
surface), a direct end-label, and an in-chart legend carrying the latest value and
a coloured trend arrow — red when the adverse direction is rising (cases, deaths,
isolation) and green when the favourable direction is rising (recoveries). The
line connects across reporting gaps and breaks only where a value is actually
missing, so weekly reporting stays continuous. An x-axis toggle switches between
calendar dates and ISO-8601 epidemiological weeks (Wnn), matching how ministries
and Africa CDC report; a hover crosshair reads all series at a chosen point. Below
two series it falls back to the single-series area/national trend chart.

Overall-snapshot cards and the briefing narrative carry the same direction cues:
a change is shown with an arrow and colour (adverse red, favourable green, no
comparable basis neutral) so the trend is legible at a glance.

## Response status and leadership briefing

Selecting a suggested action keeps the user in Situation and marks the proposal
as selected. It creates one Proposed response-plan entry, which can be edited or
removed later in Actions. Selection persists after editing the entry
and saving/reopening snapshots; removing the entry makes the proposal selectable again.

A response-status rollup summarises the response pillars (safe & dignified
burial, community engagement/RCCE, logistics & supplies, response presence &
capacity) from dated indicators you upload and categorise in Data.
Pillars carry a plain status — On track / Watch / Attention / Reported — with a
coloured left border. Ratio indicators are only computed when both a numerator
and denominator source are present, so requests-minus-completed is never assumed
to be a backlog: safe-burial completion needs both a "requested"/"reported" and a
"completed" series; contact follow-up needs "followed"/"registered"; bed
occupancy needs "occupied"/"beds", and exceeding 100% is flagged as Attention.
Targets (e.g. 95% follow-up) are shown alongside the value. Missing values are
never zero and no status is asserted for a pillar without loaded indicators.

The Sitrep opens with an optional coordinator-written Bottom line for
decision-makers (never AI-generated), a Since last brief block that diffs the
current situation against a saved snapshot (national confirmed change, newly
reporting areas, per-pillar coverage change), the response-status rollup, and a
Calls to action / decisions requested list built from Blocked and Proposed
response-plan actions. Change indicators use a direction arrow and colour: an
adverse move (rising cases, falling response coverage) is red, an improving move
green, and a change with no comparable basis is shown as such — never inferred.

Movement connections are shown for both directions. Outflow (teal arrows) marks
destinations from an area to assess for onward surveillance; inflow (orange
arrows) marks origins arriving in an area — the receiving-readiness view. The
briefing exposes a direction selector and defaults to inflow into the focus area.
Direction is saved in snapshots and reflected in Markdown, HTML and PDF exports.

Connected public sources refresh on app opening; Refresh data checks them again.
The registered DRC profile includes epidemiology, relocation matrices, mobility
definitions and mining. Uploaded mobility is retained. Failed refreshes keep
previous observations with a visible warning. Refresh timestamps and observation
dates are shown separately. Saved snapshots retain their recorded data until an
explicit refresh; pending live requests cannot overwrite a restored/new scope.
Main-app security and uploads have no remote connection and cannot be refreshed
by this module. Generic arbitrary-URL connectors are not implemented.

Forecasting, Word/PowerPoint exports, server sharing, scheduled background refresh
and bilingual translation are not implemented.

Public epidemiological data is preliminary; see the upstream repository guidance:
https://github.com/INRB-UMIE/BDBV2026-Data

## Validation

`npm run app:validate -- components/apps/outbreak`
`npm test`
`npm run build`
`npx playwright test tests/browser/outbreak.spec.js`

## Interaction and briefing design

The Situation view opens with a key message above the data controls. The same
message leads the briefing: overall reported trend, geographic priorities with
province context where mapped, then up to two supported operational actions.
Weekly direction requires all 14 daily observations in a single case source;
partial area coverage is stated, and separate sources are never pooled. Without
that basis, cumulative changes are labelled as changes in reported totals, with
downward revisions and missing comparisons distinguished from improvement.
Highest cumulative burden and largest recent increase are separate priorities.
Receiving-area, mining and access prompts describe reported evidence, not a
transmission forecast; further suggestions remain in the detailed briefing.
Coordinators can edit the message in place or in Sitrep; their saved wording takes
precedence until cleared. The same message appears in the briefing and HTML/PDF and
Markdown exports. Missing evidence has an explicit setup message. Coordinator text
needs review after refreshes or scope changes; editing invalidates review status.

Maps use fixed viewport coordinates for drag, pointer-centred wheel/double-click
zoom, two-pointer pinch/pan, and keyboard arrows/+/-/Home. Labels use measured
text widths, avoid collisions and stay legible at different display sizes; dense
labels appear progressively as the user zooms. The selected area has priority.
Maps fit within the screen height and retain SVG export.

The default Sitrep contains the five integrated sections described above. Extra
indicator charts and detailed evidence remain optional in the appendix; source
links and unavailable-evidence statements remain in every report.

Data coverage lists ACLED, GDACS, mining, facilities, mobility and operational
categories with load/upload actions. Existing uploads can be assigned a category
without reimporting. GDACS is exposed through read:disasters and is limited to
unique alerts published within the 28 days ending at the cut-off whose centre
matches one uploaded polygon. Centres are not affected-area footprints, and
concurrent hazards are not evidence of infection or transmission. Snapshot
exports preserve the loaded GDACS input for reproduction.

## Live dashboard

Dashboard is the default landing view. It shares the sitrep key message, province
coverage calculations and health-zone horizon strips. Province and health-zone
selections link the map, callout and trends; Deep analysis opens the sitrep with
the selected health zone and reporting cut-off. Province labels use boundary
attributes; district labels appear when zoomed in where district attributes exist.
Amber outlines identify first positive reports in the selected 7/14/30-day window
ending on the latest case reporting date. These are first reports in the available
history, not claims of first-ever infection. All zones with data also includes
zero-only and historical reporting zones; missing periods remain unavailable.

Automatic epidemiology checks default to 15 minutes (Off, 5, 15, 30 or 60).
Checks run only while Dashboard is visible, a DRC source is connected and Follow
latest reporting dates is enabled. Historical cut-offs, restored snapshots and
recovered drafts pause them. Re-enabling Follow latest opts into today's cut-off.
Overlapping requests are skipped. Failed checks retain dated observations and
show an error. Selection and map position survive indicator refreshes. Uploaded
replacements remain protected. Manual full refresh additionally checks connected
mobility and mining sources. This is an open-browser timer, not a background job.

Full-screen dashboard opens a decision briefing outside the workspace shell.
It requests browser fullscreen and falls back to a viewport-filling presentation
when fullscreen is unavailable. The view retains key messages, first-report
alerts, headline numbers, map callouts, province coverage and compact horizon
strips. It hides setup, editing, export and map configuration controls. Automatic
refresh continues under the same live/historical rules. Escape or Exit returns to
the workspace; Deep analysis exits presentation and opens the sitrep. The background
workspace is inert while presenting, and keyboard focus stays in the decision view.
