# Aidstack Atlas — Geospatial Operational Intelligence

**Live Demo:** [https://disasters.aidstack.ai](https://disasters.aidstack.ai)

Aidstack Atlas is an open geospatial operational intelligence platform that combines hazards, conflict, population, infrastructure, health, and user-provided operational data to assess exposure and support location-based decisions.

---

## Overview

This application is built for response teams, public health programs, and field operations groups that need to answer a practical question quickly:

**What is happening in the area we care about, who is exposed, what access still works, and what should we do next?**

The app is designed around an area-based workflow:

1. Load a shapefile or GeoJSON boundary for the operational geography.
2. Upload sites or facilities and optional ACLED data.
3. Filter to the district or admin area that matters for the operation.
4. Enrich that area with WorldPop, OSM infrastructure, and Earth Engine context layers.
5. Run analysis tools on the scoped area rather than on all global events.

This keeps global disaster and outbreak signals useful for awareness while letting operations stay focused on a specific admin-area geography.

---

## Core Capabilities

### Mapping and data layers
- GDACS disaster alerts with polygons and impact zones
- WHO outbreak reports with mapped locations and background backfill
- Uploaded ACLED conflict event overlays with filtering by event type, recency, country, and region
- Uploaded administrative boundaries from shapefiles or GeoJSON
- Uploaded facilities or sites from CSV or Excel
- Heatmap and timeline playback for disaster and conflict activity
- Drawing and annotation tools for routes, zones, and operational notes
- Street, satellite, and terrain base maps

### Operational analysis
- Facility impact assessment against GDACS disasters and optional ACLED events
- District-level risk scoring from disaster and conflict context
- Facility-level AI analysis and recommendations
- Operation-specific viability scoring for immunization, malaria, WASH, nutrition, medical supply, shelter, and general field operations
- Security assessment with ACLED-aware movement considerations
- Logistics assessment using OSM roads, bridges, airports, fuel, and other infrastructure
- Forward-looking operational outlooks and predictive dashboards
- Situation report generation and exportable decision briefs
- Scoped prioritization board for ranking actions inside selected admin areas

### Enrichment layers
- WorldPop population statistics and age-sex breakdowns through Google Earth Engine
- OSM selective infrastructure loading for chosen admin areas and categories
- Earth Engine context layers for flood, drought, accessibility, nighttime lights, Sentinel imagery, and radar change context
- Weather-aware analysis and forecast context
- AI chat with current workspace context, including districts, facilities, disasters, WHO outbreaks, uploaded ACLED, WorldPop, weather, and OSM when available

---

## What Has Been Added

Compared with the earlier GDACS-focused tool, the current app includes:

- ACLED upload, filtering, and map visualization
- WHO outbreak report mapping and sitrep context
- District/admin boundary upload and district-level risk analysis
- WorldPop integration via Google Earth Engine
- Selective OSM infrastructure loading by admin area and category
- Logistics assessment with confidence and infrastructure coverage indicators
- Operation-specific viability APIs and dashboards
- Prediction dashboard for disaster, outbreak, and supply-chain risk
- Operational Outlook for scenario-based forward planning
- SitRep generation and decision-brief export APIs
- Prioritization Board for ranked next actions in a scoped response area
- Shared area-based workflow so WorldPop, OSM, and prioritization all depend on the same selected operational geography
- Evidence-gated flood, drought, accessibility, and nighttime-lights context so hazard scores show drivers, sources, and limitations

---

## Prioritization Board

The Prioritization Board is a modular feature with its own endpoint:

- UI component: `components/PrioritizationBoard.js`
- API endpoint: `pages/api/prioritization-board.js`
- Scoring logic: `lib/prioritizationBoard.js`

### How it works

The board is intentionally **not global**. It does not rank all facilities against all worldwide GDACS events.

It requires:
- uploaded administrative boundaries
- a selected admin area / analysis area

It then ranks only the data inside that selected geography:
- facilities in the selected area
- disasters in the selected area
- ACLED events in the selected area, if available
- WorldPop context for the selected area, if available
- OSM context for the selected area, if available

### Confidence model

The board still runs when some enrichment layers are missing:

- ACLED is optional
- WorldPop is optional
- OSM is optional

When those layers are missing, the board shows lower-confidence / missing-signal context rather than blocking execution.

---

## Supported Workflows

### 1. Immunization campaign planning
- Upload vaccination sites or campaign locations as facilities
- Upload admin boundaries to define the operational geography
- Optionally upload ACLED to understand security constraints
- Load WorldPop to estimate exposed and underserved populations
- Use operation viability, outlook, and prioritization to decide where to go now, where to delay, and where to pre-position

### 2. Humanitarian access and logistics
- Upload offices, warehouses, or distribution points
- Select target admin areas
- Load OSM infrastructure only for those admin areas
- Run logistics assessment to review roads, bridges, fuel, airports, and security context
- Use the prioritization board to rank where teams should assess or move first

### 3. Outbreak and WASH response
- Upload case or intervention sites as facilities
- Use district boundaries to define the analysis area
- Review WHO outbreak reports near the selected geography
- Load WorldPop for population exposure and demographic context
- Combine flood/disaster context with WASH and health datasets
- Use the outlook and forecast tools for forward planning

### 4. Public health and field operations planning
- Combine sites from health, WASH, education, shelter, logistics, surveillance, or campaign datasets
- Filter to the actual operational geography
- Use WHO, ACLED, GDACS, WorldPop, OSM, and Earth Engine layers as operational context
- Generate SitReps, decision briefs, and ranked operational actions

---

## Data Inputs

### GDACS
- Automatically loaded disaster alerts
- Used for map visualization, facility impact assessment, forecasting context, and district risk scoring

### WHO Disease Outbreak News
- Automatically loaded outbreak reports
- Expanded into map features where reported locations can be resolved
- Used for outbreak visibility, sitrep context, and selected-area review

### ACLED
- Upload CSV exports from ACLED
- Used for security overlays, district risk scoring, viability logic, logistics context, and prioritization when present
- Uploaded ACLED events are included in local browser workspace restore through IndexedDB

### Administrative boundaries
- Upload shapefiles (`.zip`) or GeoJSON
- Used to scope analysis to actual response geographies
- Required for WorldPop, OSM area loading, district-level analysis, and the Prioritization Board

### Facilities
- Upload any CSV or Excel file with at least:
  - `name`
  - `latitude`
  - `longitude`
- Additional columns can be used by AI analysis and operational logic

### WorldPop
- Pulled through Google Earth Engine after districts are loaded
- Supports total population and age-sex analysis
- Intended to be used on uploaded district geometries, not on arbitrary global map extents

### OSM infrastructure
- Loaded only for selected admin areas
- Categories include hospitals, schools, roads, bridges, water, power, fuel, pharmacies, and airports
- Used in logistics assessment and other operational context layers

### Earth Engine context layers
- Includes nighttime lights, Sentinel imagery, radar change context, flood context, drought context, and accessibility context
- Used as visual evidence and readiness gates for admin-level hazard scoring

---

## Typical User Flow

### Step 1: Load the operational geography
1. Upload a shapefile or GeoJSON admin boundary
2. Confirm districts render on the map

### Step 2: Add operational context
1. Upload sites or facilities
2. Optionally upload ACLED
3. Set the operation type

### Step 3: Select the area you actually care about
1. Use the admin-area selector in the OSM / map layers workflow
2. Select the district or set of districts relevant to the operation
3. Load WorldPop or OSM for that scoped area if needed

### Step 4: Run analysis
- Click facilities for AI analysis and operation viability
- Run logistics assessment for the selected operational area
- Open the prediction dashboard for forward-looking risk
- Open Operational Outlook for scenario analysis
- Open the Prioritization Board to rank next actions for the selected area

### Step 5: Report and share
- Generate SitReps
- Export decision briefs
- Use map annotations and playback for operational review

---

## Key Features by Module

### Facility impact assessment
- Calculates which facilities are impacted by nearby GDACS and optional ACLED events
- Preserves uploaded facility attributes for downstream AI analysis
- Produces impact statistics, overlap summaries, and district-level affected population summaries

### Operation viability
- Uses operation-specific rules for:
  - immunization
  - malaria control
  - WASH
  - nutrition
  - medical supply
  - shelter
  - general operations
- Produces GO / CAUTION / DELAY / NO-GO style outputs with mitigation guidance

### Logistics assessment
- Uses OSM infrastructure layers plus disasters and optional ACLED events
- Reviews road access, bridges, fuel, airports, and route alternatives
- Returns access score, rating, recommendations, and confidence

### Prediction dashboard
- Disaster forecast
- Outbreak prediction
- Supply-chain forecast
- Weather-aware forward indicators

### Operational Outlook
- Most likely, escalation, and stabilization scenarios
- Operational drivers
- Early warning indicators
- Operational implications for the selected area

### Prioritization Board
- Area-scoped facility and district ranking
- Recommended next action for each row
- Optional workflow fields such as owner and status
- Confidence and missing-signal awareness when ACLED, WorldPop, or OSM are not loaded

---

## Installation

### Prerequisites
- Node.js 18+ recommended
- npm
- OpenAI API key for AI features
- Google Earth Engine service account key for WorldPop features

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/jmesplana/aidstack-atlas.git
   cd aidstack-atlas
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local`:
   ```bash
   OPENAI_API_KEY=your_openai_api_key
   GEE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
   ```

4. Optional environment variables:
   ```bash
   REDIS_URL=your_redis_url
   APP_BASE_URL=http://localhost:3000
   OPENAI_WEB_SEARCH_MODEL=gpt-4.1-mini
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open:
   [http://localhost:3000](http://localhost:3000)

---

## Deployment Notes

The app is designed to run well on **Vercel** using Next.js API routes.

Important considerations:
- OpenAI-backed APIs run server-side through Vercel functions
- WorldPop requires `GEE_SERVICE_ACCOUNT_KEY` to be configured in Vercel environment variables
- OSM infrastructure loading is area-scoped to reduce request size and keep responses practical for serverless deployment
- Uploaded ACLED events are restored from the local IndexedDB workspace with the rest of the saved context
- The Prioritization Board endpoint is lightweight because it scores already-scoped client state rather than querying global datasets directly

---

## Example Facility CSV

```csv
name,latitude,longitude,population,coverage_rate,cases,facility_type,partner
District A Clinic,1.234,32.567,50000,90,3,clinic,UNICEF
District B Warehouse,2.345,33.678,30000,60,12,warehouse,MoH
```

---

## Technology Stack

### Frontend
- Next.js
- React
- Leaflet / React Leaflet
- Marker clustering
- Leaflet Draw

### Backend
- Next.js API routes
- OpenAI API
- Google Earth Engine (`@google/earthengine`)
- PapaParse
- Shapefile.js
- Geolib
- Turf

### Data sources
- GDACS
- WHO Disease Outbreak News
- ACLED
- WorldPop
- OpenStreetMap
- User-provided facility and boundary datasets

---

## Related Documentation

- [OPERATIONAL_OUTLOOK.md](OPERATIONAL_OUTLOOK.md)
- [WORLDPOP_INTEGRATION_PLAN.md](WORLDPOP_INTEGRATION_PLAN.md)
- [OSM_SELECTIVE_LOADING_IMPLEMENTATION.md](OSM_SELECTIVE_LOADING_IMPLEMENTATION.md)
- [APP_HUB_ARCHITECTURE.md](APP_HUB_ARCHITECTURE.md)

---

## Links

- Live Platform: [https://disasters.aidstack.ai](https://disasters.aidstack.ai)
- GitHub: [https://github.com/jmesplana/aidstack-atlas](https://github.com/jmesplana/aidstack-atlas)

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request — it covers the development setup and the architectural
constraints that are easy to violate accidentally (no TypeScript, Leaflet cannot
be server-rendered, heavy processing stays client-side, and the app bridge is a
security boundary).

All contributors must agree to the
[Contributor License Agreement](CLA.md) before their work can be merged. You
keep ownership of your contribution; you grant the project owner a licence to
it, including the right to relicense.

---

## License

Aidstack Atlas is licensed under the
**[GNU Affero General Public License v3.0 or later](LICENSE)**.

Copyright (C) 2025-2026 John Mark Esplana.

**What this means in practice:**

| You may | You must |
| --- | --- |
| Use Atlas for any purpose, including commercially | Keep it licensed under AGPL-3.0-or-later |
| Self-host it for your organization | Preserve copyright and licence notices |
| Study, modify, and extend the source | State the changes you made |
| Redistribute it, modified or not | Publish your modifications' source |

The key clause is **AGPL section 13: network use is distribution.** If you run a
modified version of Atlas as a hosted service, you must offer your users the
complete corresponding source of your modified version. You cannot fork Atlas,
improve it privately, and operate it as a closed SaaS.

This is deliberate. Atlas is built for humanitarian and public-health response,
and improvements to that tooling should flow back to the community that depends
on it.

See [NOTICE](NOTICE) for third-party data-source terms — GDACS, WHO, ACLED,
WorldPop, OpenStreetMap, and Earth Engine datasets each carry their own
conditions and are **not** covered by this project's licence.

### Commercial licensing

If your organization needs to build on Atlas without AGPL obligations — for
example to embed it in a proprietary product — a commercial licence is
available. Email **johnm.esplana@gmail.com**.

---

## Security

Please do not report security vulnerabilities through public issues. See
[SECURITY.md](SECURITY.md) for the disclosure process.

---

## Support

For issues or feature requests:
- open a GitHub issue
- review the architecture and integration notes in the repo docs before changing core workflows

---

Built for crisis response, public health, humanitarian access, logistics, and field operations workflows where geographic scope, operational context, and next-action prioritization matter more than raw alert volume.
