# Access Gaps

Bundled module for modeled journeys to services and outreach-site comparison. Install it through Workspace apps after loading administrative boundaries.

## Workflow

1. Choose operational areas in the searchable multi-select. Remove selected areas using their capsules.
2. Choose **Earth Engine access estimates (no road download)** for approximate surface estimates, or **WorldPop and OpenStreetMap (no uploads)** for the detailed road model. Select a population year and grid size, then load the selected areas. Atlas supplies population cells and mapped facilities automatically. The road option additionally loads full OSM geometry.
3. Choose a travel mode and threshold, confirm the planning assumptions, and calculate. The road model also exposes speed and road-connection assumptions. Review up to ten suggested outreach areas; include candidates under the optional service review and recalculate to compare a combined scenario.
4. Optionally replace service locations with workspace sites or a CSV. Government catch-up and community feedback CSV/Excel lists can contain place names and area codes without coordinates. Review unmatched names or assign areas manually. Uploaded boundary population and mobility fields can be retained with their source, units and period.
5. Save privately. **Publish to workspace** creates an immutable snapshot of a saved revision. Compatible bundled modules can attach that snapshot. Withdrawal prevents new imports while preserving attached copies.
6. In Immunization Planning, open a plan, choose **Access**, select the published assessment and **Attach snapshot to plan**. Save the plan to retain the evidence. Eligible/vaccinated counts and session allocations stay independent of WorldPop totals. Named places without coordinates remain area context and are not silently matched to population cells.

Teams with their own georeferenced data can choose **Use my own population points and roads**. Population CSV columns: `settlement_id,settlement,latitude,longitude,population`; site CSV columns: `id,name,latitude,longitude,role`. Roads must be WGS84 LineString/MultiLineString GeoJSON, preserving shared junction vertices and relevant roads beyond admin boundaries. Manual counts must be non-overlapping integers; WorldPop estimates retain fractional counts.

## Method and limits

`lib/geo/travelTime.js` supplies client-side graph construction, indexed nearest-segment connections and reverse multi-source Dijkstra. It honors standard access/mode restrictions, one-way tags, roundabouts, closures, construction and numeric maxspeed. Preserved OSM node IDs distinguish grade-separated junctions. Connectors use 4 km/h walking.

WorldPop extraction uses the platform's existing Google Earth Engine service account (`GEE_SERVICE_ACCOUNT_KEY`). Raster sums use the source pixel projection within clipped local UTM grid cells. Cells are demand approximations, not named settlements or household locations. Missing raster cells are recorded in result provenance and excluded from totals, never treated as zero population. Area totals are left unavailable when the extract has missing cells. Optional boundary totals do not replace raster demand counts.

OSM roads include a 5 km buffer. Turn restrictions, conditional access, traffic, slope, safety, live closures, service readiness and capacity are not modeled. Mapped facility coordinates may represent geometry vertices rather than verified entrances. No mapped service produces unknown baseline access. Unconnected or disconnected population points remain unknown; finite journeys beyond the threshold are reported separately. Candidate gains from unknown baselines stay separate from improvements to known journeys. Combined scenarios avoid counting covered cells twice.

Suggested outreach locations are up to ten populated search areas, separated by at least 1 km, selected from cells with poor or unknown access. They require field review and are not a global placement optimum. Government lists and mobility/feedback attributes provide context; they do not create coordinates or modify travel speeds.

The selected administrative boundaries define the full analysis scope. Large selections are clipped into non-overlapping internal download batches, retaining the original admin IDs and holes. Each batch stays below 10,000 km²; this is not a limit on the selected administrative area. Buffered OSM ways are deduplicated by ID and joined by node ID before routing, so journeys can cross batch boundaries. Complete batches are cached for retry, and partial downloads never enable modeling.

Automatic extraction supports up to 30 non-overlapping areas and 128 download batches. Atlas chooses a coarser population grid when needed, reports the resolution used, and retains it in the assessment sources. Clipped cell fragments are summed without counting population twice. The browser worker supports 10,000 population points and a combined network of 100,000 segments; larger networks still need regional groups. No road features are silently removed to meet this limit. Manual inputs support 10,000 point rows, 50 candidates and 20 MB files. Calculations run in a cancellable worker. A visible loading spinner and per-source progress stay beside the data-loading button while requests, retries and recovery sections run. Cancel loading stops the client request and retry waits. OSM capacity/rate-limit errors receive one delayed retry respecting Retry-After (up to 30 seconds automatically); longer waits are reported to the user. Timed-out or incomplete road batches can split into smaller internal sections, up to three levels, keeping the selected admin boundary unchanged. Remaining source failures show a provider-specific error and never enable modeling with partial data.

## Platform integration

This is a bundled source module. Uploaded contributor ZIPs use the separate sandbox runtime described in `templates/installable-app/README.md`.

Private inputs and plans stay in browser IndexedDB. Published snapshots include computed rows, settings, sources, fingerprints, coverage diagnostics, optional area context and limitations. Only Access Gaps publishes through the trusted host API; Immunization and Atlas read. The reserved `@workspace-results` namespace cannot be claimed by an uploaded manifest. Uploaded apps have no access to this shared-result API or other modules' private plans.

Published results appear in Workspace apps and can be shown on the main map. Chat receives a bounded summary of the visible publication. Publications and attached evidence survive refresh; reopen a publication to restore its map overlay. Workspace and boundaries must match.

Validate with `npm run app:validate -- components/apps/access-gaps`, `npm test`, `npm run build`, and `npx playwright test tests/browser/accessGaps.spec.js` against a running local server.

## Earth Engine access estimates

New assessments default to **Earth Engine access estimates (no road download)**. The alternative **WorldPop and OpenStreetMap** still runs the detailed road graph. Existing saved assessments retain their original mode.

The surface mode loads WorldPop as before, plus hospitals, clinics and health posts from the Earth Engine community Healthsites node/way assets (`projects/sat-io/open-datasets/health-site-node` and `health-site-way`). The catalog snapshot is June 7, 2025; individual OSM observation dates vary. Facility geometries are represented by their centroids and remain subject to local service verification. The source is attributed to Healthsites/OpenStreetMap under ODbL. It requires no live Overpass query or facility upload. Workspace sites and CSV overrides remain optional.

Travel calculations use the publisher assets `projects/malariaatlasproject/assets/accessibility/friction_surface/2019_v5_1` and its `_walking_only` variant, licensed CC BY 4.0. Earth Engine cumulative cost combines minutes per meter with geodetic path distance at the source projection (nominal 927.67 m pixels). Motorized/walking mode uses the published mixed transport assumptions, not the road model's driving speed. Sources in the same pixel may have zero estimated travel time. The UI displays the 2019 reference year, approximate 1 km resolution, and 100 km maximum path-search distance. Pixels without data or without a path within that search remain unknown.

The model recomputes travel costs to the included facility locations; it does not use the precomputed 2019 nearest-hospital map as a current facility inventory. It compares up to ten outreach sites and calculates the combined scenario using the minimum of baseline and selected candidate travel costs, avoiding overlapping population gains. Suggested areas are separated by at least 2 km. Requests contain up to 1,000 population points and 2,000 service locations, run sequentially with progress and cancellation. Population batches keep original admin boundaries and IDs. Travel paths may cross admin borders.

The result method is `friction-surface-v1`, distinct from `road-network-v1`. Source metadata and limitations accompany private saves, exports, shared snapshots, map views, chat context and Immunization attachments. Switching the data/model option invalidates the current result. No iframe permissions were added.

References: [MAP travel surface](https://developers.google.com/earth-engine/datasets/catalog/projects_malariaatlasproject_assets_accessibility_friction_surface_2019_v5_1), [cumulative cost](https://developers.google.com/earth-engine/guides/image_cumulative_cost), [Healthsites community snapshot](https://gee-community-catalog.org/projects/health_sites/).
