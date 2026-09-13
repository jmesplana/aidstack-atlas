# Outbreak Response

Bundled workspace app for reported outbreak evidence, operational indicator imports,
optional maps, and reviewed leadership briefings. Install/open from Workspace apps.
No administrative layer is required. Boundaries uploaded in the main app are
available for explicit field/level matching; unmatched locations remain visible.

## Workflow

### Updating data

Data & uploads includes a dedicated IPIS Excel/CSV import. Map mine ID, visit date
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
5. Add coordinator actions, resources, owners and dates. Open Briefing and review.
6. Save snapshots to this browser workspace. Export standalone HTML with visuals, Markdown, evidence JSON,
   individual SVG maps/charts, or print the briefing to PDF.

The example SDB CSV is synthetic and must be replaced before operational use.
Only aggregate indicators are supported; this is not a patient/incident line-list
processor. Numeric imports require one observation per location/date. Duplicate
rows, invalid numbers and dates are rejected. Blank/ND/NA values remain missing.
Daily, cumulative and snapshot values are never silently interchanged. Uploaded
sources are separate series, so overlapping totals are not combined. JSON evidence
exports are audit artifacts, not an import/restore format; reopen saved snapshots
through the selector in the same browser/workspace.

## Evidence and AI

Briefing sentences and numbers are computed by the outbreak analysis modules. The
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
and ACLED event toggles, including Briefing and its appendix. Choices are shared
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
suggested actions, followed by movement connections and mobility indicators as a
top-level section. Indicator trends, observation tables and the indicator map live
in an expandable area explorer. Recommendations are deterministic evidence-based
review prompts with observation periods, and can be added to the response plan.

The snapshot's mobility cell names the largest reported connections originating in
areas reporting cases, with the observation period and units, rather than only a
date. Self-links, missing values and links from areas without reported cases are
excluded. One deterministic summary drives the snapshot cell, the freshness bar and
the panel, so a period after the reporting cut-off is reported as excluded in all
three rather than appearing as an available observation date in one. Loaded data
with no valid period, and data whose positive links do not originate in a reporting
area, are distinguished from having no data at all. Where only GeoJSON mobility
indicators are present, the connections panel says so and links to them; area values
are never presented as origin–destination routes.

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
Cumulative decreases use a neutral revision symbol (↺), including cards, snapshot
comparisons and exported SVG legends. They are never styled as improvement.
Which direction is favourable is resolved from the metric identifier where the
source supplies one, falling back to the dataset label for uploaded series.

## Response status and leadership briefing

Selecting a suggested action keeps the user in Situation and marks the proposal
as selected. It creates one Proposed response-plan entry, which can be edited or
removed later in Response & decisions. Selection persists after editing the entry
and saving/reopening snapshots; removing the entry makes the proposal selectable again.

A response-status rollup summarises the response pillars (safe & dignified
burial, community engagement/RCCE, logistics & supplies, response presence &
capacity) from dated indicators you upload and categorise in Data & uploads.
Pillars carry a plain status — On track / Watch / Attention / Reported — with a
coloured left border. Ratio indicators are only computed when both a numerator
and denominator source are present, so requests-minus-completed is never assumed
to be a backlog: safe-burial completion needs both a "requested"/"reported" and a
"completed" series; contact follow-up needs "followed"/"registered"; bed
occupancy needs "occupied"/"beds", and exceeding 100% is flagged as Attention.
Targets (e.g. 95% follow-up) are shown alongside the value. Missing values are
never zero and no status is asserted for a pillar without loaded indicators.

Rates require exactly one distinct numerator and denominator source, recognised
count units, matching geographic levels and measure types, and non-missing
observations for the same area on the latest reporting date. Only matched areas
enter a rate; the date and matched/available coverage are displayed. Ambiguous,
missing, zero-denominator or incompatible inputs show insufficient comparable
data. The existing label-based rules and thresholds remain in use.

Response indicators remain separate, including their units and observation dates.
Seven-day changes include only areas with both observations; new reporting areas
do not inflate the change. Snapshot comparisons match source ID, indicator
definition, units, measure type and geography. Response changes show matched
areas, newly reporting areas and missing baselines separately, with neutral
direction cues rather than interpreting every additional count as improvement.
Because each response indicator is compared separately, Since last brief collapses
the per-indicator lines behind a disclosure once there are more than six. No line
is ever dropped: print and HTML/PDF exports always list every indicator in full.

The Briefing opens with an optional coordinator-written Bottom line for
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
A single condensed line below the generated message names the source hosts and the
reporting period, so attribution is present without crowding out the message. Full
details — dataset label, complete URL, period and comparison coverage — open from
an "Evidence and coverage" disclosure beneath it. National trend and local priority
sources remain separate when different datasets supply them. The expanded details
are force-opened in HTML/PDF exports and written in full to Markdown exports, so
nothing is lost by collapsing them on screen. Coordinator-written messages are identified as
such and do not receive automatic source attribution. The mobility-indicator
evidence item carries the same attribution — source, date basis, reporting
coverage and units — because it is the claim most open to being read as a
transmission finding.
Coordinators can edit the message in place or in Briefing; their saved wording takes
precedence until cleared. The same message appears in the briefing and HTML/PDF and
Markdown exports. Missing evidence has an explicit setup message. Coordinator text
needs review after refreshes or scope changes; editing invalidates review status.

Maps use fixed viewport coordinates for drag, pointer-centred wheel/double-click
zoom, two-pointer pinch/pan, and keyboard arrows/+/-/Home. Labels use measured
text widths, avoid collisions and stay legible at different display sizes; dense
labels appear progressively as the user zooms. The selected area has priority.
Maps fit within the screen height and retain SVG export.

The default briefing contains a short situation summary, up to three suggested
actions, explicit context gaps, one geographic overview, the response plan and a
folded source register. Detailed evidence and extra charts/maps require opting
into the appendix; HTML/PDF exports follow that choice. Source links remain in
exports. No missing source is represented as a complete negative assessment.

Data coverage lists ACLED, GDACS, mining, facilities, mobility and operational
categories with load/upload actions. Existing uploads can be assigned a category
without reimporting. GDACS is exposed through read:disasters and is limited to
unique alerts published within the 28 days ending at the cut-off whose centre
matches one uploaded polygon. Centres are not affected-area footprints, and
concurrent hazards are not evidence of infection or transmission. Snapshot
exports preserve the loaded GDACS input for reproduction.
