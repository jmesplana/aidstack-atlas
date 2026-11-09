import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';
import { isPointInGeometry } from '../../../lib/geo/geometry';
import styles from '../../platform/Planning.module.css';
import AreaMultiSelect from '../../platform/AreaMultiSelect';
import { loadPlatformAccessInputs } from '../../../lib/planning/loadAccessInputs';
import { accessScopeKey, ACCESS_CELL_SIZES } from '../../../lib/planning/accessInputs';
import { buildAreaAccessAssessment, resolveListAreas, summarizeAreaContext } from '../../../lib/planning/areaAccess';
import PlaceListInput, { emptyPlaceList } from './PlaceListInput';
import AreaReview from './AreaReview';
import { runSurfaceAccess, createSurfaceTravelCache } from '../../../lib/planning/loadSurfaceAccess';
import DecisionBrief from './DecisionBrief';
import { accessDecisionText } from '../../../lib/planning/accessDecision';
import { ACCESS_AGE_GROUPS, accessCohort } from '../../../lib/worldpop/accessCohorts';
import PopulationResults from './PopulationResults';
import { SURFACE_SOURCE, HEALTHSITES_SOURCE } from '../../../lib/planning/surfaceAccess';

const AccessMap = dynamic(() => import('./AccessMap'), { ssr: false });
const initialSettings = { mode: 'walking', speedKph: 4, thresholdMinutes: 60, maxSnapKm: 0.25, selectedCandidateIds: [], siteBudget: 3, facilitiesReviewed: false, decisionOwner: '', reviewDate: '', deliveryConstraints: '' };
const initialSources = { population: '', populationDate: '', roads: '', roadsDate: '', sites: 'Workspace sites' };
const format = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
export function downloadAccess(content, filename, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AccessGaps({ districts, selectedDistricts = [], facilities, workspaceId, storage, sharedResults, onShowResult, leaveGuard, accessContext = {} }) {
  const [areaIds, setAreaIds] = useState(selectedDistricts.map((d) => String(d.id)));
  const [name, setName] = useState('Access assessment');
  const [settlements, setSettlements] = useState([]);
  const [roads, setRoads] = useState(null);
  const [sites, setSites] = useState([]);
  const [settings, setSettings] = useState(initialSettings);
  const [sources, setSources] = useState(initialSources);
  const [confirmed, setConfirmed] = useState(false);
  const [inputMode, setInputMode] = useState('earth-engine');
  const [cellSize, setCellSize] = useState(1000);
  const [populationYear, setPopulationYear] = useState('current');
  const [cohortSelection, setCohortSelection] = useState({ age: 'all', sex: 'both' });
  const cohort = useMemo(() => accessCohort(cohortSelection), [cohortSelection]);
  const [platformData, setPlatformData] = useState(null);
  const [targets, setTargets] = useState(emptyPlaceList);
  const [feedback, setFeedback] = useState(emptyPlaceList);
  const [mobility, setMobility] = useState({ field: '', source: '', period: '', units: '', populationField: '' });
  const [plan, setPlan] = useState(null);
  const [savedPlans, setSavedPlans] = useState([]);
  const [publication, setPublication] = useState(null);
  const [busy, setBusy] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const worker = useRef(null);
  const loadingRequest = useRef(null);
  const travelCache = useRef(null);
  if (!travelCache.current) travelCache.current = createSurfaceTravelCache();
  const areas = useMemo(() => districts.filter((d) => areaIds.includes(String(d.id))), [districts, areaIds]);
  const scopeKey = useMemo(() => accessScopeKey(areas, cellSize, populationYear, cohort), [areas, cellSize, populationYear, cohort]);
  const isSurface = inputMode === 'earth-engine';
  const isAutomatic = inputMode !== 'upload';
  const platformReady = platformData?.scopeKey === scopeKey && (platformData.model || 'network') === (isSurface ? 'surface' : 'network') && (!isSurface || platformData.network.metadata?.discoveryVersion === 2);
  const boundaryFields = [...new Set(areas.flatMap((d) => Object.keys(d.properties || {})))].sort();
  const context = useMemo(() => {
    const pop = { ...(accessContext.worldPopData || {}) };
    if (platformData?.population && platformReady && cohort.dataType === 'total') {
      for (const area of areas) {
        const cells = platformData.population.points.filter((p) => p.area_id === String(area.id));
        pop[String(area.id)] = { total: platformData.population.missingCells > 0 ? null : cells.reduce((sum, p) => sum + p.population, 0) };
      }
    }
    const osm = platformReady ? { ...platformData.network.roads, features: [...platformData.network.roads.features, ...platformData.network.sites.map((s) => ({ type: 'Feature', properties: { category: 'clinic' }, geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] } }))], metadata: platformData.network.metadata } : accessContext.osmData;
    if (platformReady) osm.metadata = { ...osm.metadata, roadsAvailable: !isSurface, facilitiesAvailable: true, facilitySource: platformData.network.source?.name || (isSurface ? HEALTHSITES_SOURCE.name : 'OpenStreetMap'), roadSource: isSurface ? null : 'OpenStreetMap' };
    return summarizeAreaContext(areas, pop, platformReady && cohort.dataType === 'total' ? { year: platformData.population.year } : accessContext.worldPopLastFetch, osm);
  }, [areas, accessContext.worldPopData, accessContext.worldPopLastFetch, accessContext.osmData, platformData, platformReady, isSurface, cohort]);
  const result = plan?.result;
  const servicesInsideArea = useMemo(() => result?.existingSites.filter(site => areas.some(area => isPointInGeometry([Number(site.longitude), Number(site.latitude)], area.geometry))).length || 0, [result, areas]);
  useEffect(() => { storage.listPlans().then(setSavedPlans).catch((e) => setError(e.message)); }, [storage]);
  useEffect(() => {
    leaveGuard.current = () => (!dirty && !busy) || window.confirm('Leave this unsaved assessment? Any running calculation will be cancelled.');
    const unload = (e) => { if (dirty || busy) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { leaveGuard.current = null; window.removeEventListener('beforeunload', unload); };
  }, [dirty, busy, leaveGuard]);
  useEffect(() => () => { worker.current?.terminate(); loadingRequest.current?.abort(); }, []);
  function change(action) { action(); setPlan(null); setPublication(null); setDirty(true); setError(''); }
  async function loadPlatform() {
    setError(''); setBusy(isSurface ? 'Loading WorldPop and the Healthsites snapshot' : 'Loading WorldPop population cells and OSM roads'); setLoadingData(true);
    const controller = new AbortController(); loadingRequest.current = controller;
    try {
      const data = await loadPlatformAccessInputs({ districts: areas, cellSize, year: populationYear, cohort, force: platformReady, model: isSurface ? 'surface' : 'network', signal: controller.signal, onProgress: setBusy });
      if (controller.signal.aborted) return;
      change(() => {
        setPlatformData(data); setSettlements(data.population.points); setRoads(data.network.roads);
        setSites(data.network.sites); setSettings((s) => ({ ...s, maxSnapKm: 1, selectedCandidateIds: [], facilitiesReviewed: false }));
        setSources({ population: `WorldPop Global 2 (${data.population.year}${data.population.year > new Date().getFullYear() ? ' projection' : ''}); ${data.population.cellSize} m demand cells; ${cohort.label}`, populationDate: `${data.population.year}-01-01`, roads: isSurface ? SURFACE_SOURCE.name : 'OpenStreetMap (full road geometry, 5 km buffer)', roadsDate: isSurface ? '2019-01-01' : data.network.metadata.timestamp.slice(0, 10), sites: data.network.source?.name || 'OpenStreetMap mapped health facilities' });
        setConfirmed(false);
      });
    } catch (e) { setError(controller.signal.aborted ? 'Loading cancelled.' : e.message); }
    finally { controller.abort(); loadingRequest.current = null; setBusy(''); setLoadingData(false); }
  }
  async function importFile(event, type) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy('Reading input'); setError('');
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Maximum input file size is 20 MB.');
      const text = await file.text();
      if (type === 'roads') {
        const next = JSON.parse(text);
        if (next.type !== 'FeatureCollection' || !Array.isArray(next.features)) throw new Error('Roads must be a GeoJSON FeatureCollection.');
        change(() => { setRoads(next); setSources((s) => ({ ...s, roads: file.name })); setConfirmed(false); });
      } else {
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: 'greedy' });
        if (parsed.errors.length || !parsed.data.length || parsed.data.length > 10000) throw new Error('CSV must contain 1–10,000 well-formed rows and a header.');
        change(() => {
          if (type === 'population') { setSettlements(parsed.data); setSources((s) => ({ ...s, population: file.name })); setConfirmed(false); }
          else { setSites(parsed.data.map((s) => ({ ...s, role: s.role === 'candidate' ? 'candidate' : 'existing' }))); setSources((s) => ({ ...s, sites: file.name })); setSettings((s) => ({ ...s, selectedCandidateIds: [], facilitiesReviewed: false })); }
        });
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  function useWorkspaceSites() {
    const next = facilities.filter((f) => f.latitude != null && f.longitude != null && areas.some((a) => isPointInGeometry([Number(f.longitude), Number(f.latitude)], a.geometry)))
      .map((f, i) => ({ id: String(f.id ?? `workspace-site-${i + 1}`), name: f.name, latitude: f.latitude, longitude: f.longitude, role: 'existing' }));
    change(() => { setSites([...new Map([...sites.filter(site => !site.suggested), ...next].map(site => [site.id, site])).values()]); setSources((s) => ({ ...s, sites: `${s.sites}; workspace sites` })); setSettings((s) => ({ ...s, selectedCandidateIds: [], facilitiesReviewed: false })); });
  }
  async function run(settingsOverride = null) {
    const runSettings = settingsOverride || settings;
    setError('');
    if (!name.trim() || !confirmed) { setError('Name the assessment and confirm the input assumptions.'); return; }
    if (!Number.isInteger(runSettings.siteBudget) || runSettings.siteBudget < 1 || runSettings.siteBudget > 10) { setError('Choose between 1 and 10 outreach sites.'); return; }
    if (isAutomatic && !platformReady) { setError('Load platform data for the current area and population grid.'); return; }
    for (const [list, label] of [[targets, 'Catch-up list'], [feedback, 'Community feedback']]) if (list.rows.length && (!list.mapping.place || (label === 'Community feedback' && !list.mapping.feedback))) { setError(`Map the required columns for ${label.toLowerCase()}.`); return; }
    let areaContext;
    try { areaContext = buildAreaAccessAssessment({ districts: areas, context, targets: resolveListAreas(targets.rows, targets.mapping, targets.overrides, districts, areaIds), feedback: resolveListAreas(feedback.rows, feedback.mapping, feedback.overrides, districts, areaIds, 'feedback'), mobility,
      sources: { targets: targets.source, targetsPeriod: targets.period, feedback: feedback.source, feedbackPeriod: feedback.period } }); }
    catch (e) { setError(e.message); return; }
    const inputs = { districts: areas, settlements, sites: sites.filter((s) => s.role !== 'exclude'), roads,
      settings: { ...runSettings, populationCohort: isAutomatic ? cohort : { label: 'Uploaded population' }, facilityDiscoveryWarnings: platformData?.network.metadata?.warnings || [], platformInputs: isAutomatic, suggestCandidates: isAutomatic, candidateIds: sites.filter((s) => s.role === 'candidate').map((s) => String(s.id)) }, sources, areaContext, populationCoverage: isAutomatic ? { missingCells: platformData.population.missingCells || 0, zeroCells: platformData.population.zeroCells || 0, cellSize: platformData.population.cellSize, year: platformData.population.year } : null };
    setBusy(isSurface ? 'Calculating Earth Engine access estimates' : 'Calculating network access'); setPlan(null); setPublication(null); setDirty(true);
    const acceptResult = (result) => {
      const resultSites = [...result.existingSites.map((s) => ({ ...s, role: 'existing' })), ...result.candidates.map((s) => ({ ...s, role: 'candidate' }))];
      setSites(resultSites);
      setPlan({ id: crypto.randomUUID(), metadata: { name: name.trim() }, schemaVersion: 1, workspaceId, revision: 0,
        result, inputs: { areaIds, settlements, sites: resultSites, roads, settings: runSettings, cohortSelection, sources, inputMode, platformData, cellSize, populationYear, targets, feedback, mobility } });
    };
    if (isSurface) {
      const controller = new AbortController(); loadingRequest.current = controller;
      try { acceptResult(await runSurfaceAccess(inputs, { signal: controller.signal, onProgress: setBusy, cache: travelCache.current })); }
      catch (e) { setError(e.message); }
      finally { loadingRequest.current = null; setBusy(''); }
      return;
    }
    const current = new Worker(new URL('../../../workers/accessGaps.worker.js', import.meta.url));
    worker.current = current;
    const finish = () => { current.terminate(); worker.current = null; setBusy(''); };
    current.onmessage = ({ data }) => {
      finish();
      if (data.error) setError(data.error);
      else acceptResult(data.result);
    };
    current.onerror = () => { finish(); setError('Calculation failed. Check the inputs or use a smaller area.'); };
    current.postMessage(inputs);
  }
  async function save() {
    setBusy('Saving'); setError('');
    try { const next = await storage.savePlan(plan, plan.revision); setPlan(next); setDirty(false); setSavedPlans(await storage.listPlans()); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  async function open(id) {
    if (!id || (dirty && !window.confirm('Discard this unsaved assessment?'))) return;
    setBusy('Opening'); setError('');
    try {
      const next = await storage.loadPlan(id);
      if (!next || next.schemaVersion !== 1 || !next.inputs || next.result?.schemaVersion !== 1) throw new Error('Unsupported or missing assessment.');
      const input = next.inputs;
      setAreaIds(input.areaIds); setSettlements(input.settlements); setSites(input.sites); setRoads(input.roads); setSettings({ ...initialSettings, ...input.settings }); setCohortSelection(input.cohortSelection || { age: 'all', sex: 'both' }); setSources(input.sources); setName(next.metadata.name);
      setInputMode(input.inputMode || 'upload'); setPlatformData(input.platformData || null); setCellSize(input.cellSize || 1000); setPopulationYear(input.populationYear || 'latest'); setTargets(input.targets || emptyPlaceList()); setFeedback(input.feedback || emptyPlaceList()); setMobility(input.mobility || { field: '', source: '', period: '', units: '', populationField: '' });
      setPlan(next); setConfirmed(true); setDirty(false); setPublication(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  async function publish() {
    setBusy('Publishing'); setError('');
    try { setPublication(await sharedResults.publish(plan)); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  async function withdraw() {
    setBusy('Withdrawing'); setError('');
    try { await sharedResults.withdraw(publication.id); setPublication(null); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  return <div className={styles.workspace}>
    <div className={styles.toolbar}>
      <select aria-label="Saved access assessments" value="" disabled={!!busy} onChange={(e) => open(e.target.value)}><option value="">Open saved assessment…</option>{savedPlans.map((p) => <option key={p.id} value={p.id}>{p.name} (v{p.revision})</option>)}</select>
      <button disabled={!plan || !!busy || !dirty} onClick={save}>Save assessment</button>
      <button disabled={!plan || dirty || !!busy || !sharedResults} onClick={publish}>Publish to workspace</button>
      <span role="status" aria-live={loadingData ? "off" : "polite"} className={styles.muted}>{busy || (dirty ? 'Unsaved changes' : plan ? 'Saved on this device' : 'Create an assessment')}</span>
      {!!busy && isSurface && !loadingData && loadingRequest.current && <button onClick={() => loadingRequest.current?.abort()}>Cancel calculation</button>}
      {loadingData && <button onClick={() => loadingRequest.current?.abort()}>Cancel loading</button>}
      {!!busy && worker.current && <button onClick={() => { worker.current?.terminate(); worker.current = null; setBusy(''); }}>Cancel calculation</button>}

    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.body}>
      {publication && <section className={styles.notice} aria-label="Published assessment">
        <p>Published “{publication.metadata.name}” from saved revision {publication.source.revision}. Immunization Planning can now attach this snapshot. Existing plans will not change automatically.</p>
        <div className={styles.actions}><button onClick={() => onShowResult?.(publication)}>Show on workspace map</button><button disabled={!!busy} onClick={withdraw}>Withdraw publication</button></div>
        <p className={styles.muted}>Withdrawal prevents new imports. Copies already attached to plans remain part of their evidence history.</p>
      </section>}
      <h2>Find gaps in access to services</h2>
      <p>Compare modeled journeys from populated areas to existing services, then assess where additional outreach sites could help. Atlas supplies population cells and mapped facilities. Choose approximate Earth Engine access estimates or detailed road-network modeling; no settlement file is required.</p>
      <fieldset disabled={!!busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <div className={styles.form}>
          <label>Assessment name<input value={name} maxLength={200} onChange={(e) => change(() => setName(e.target.value))} /></label>
          <label>Travel mode<select value={settings.mode} onChange={(e) => change(() => setSettings({ ...settings, mode: e.target.value, speedKph: e.target.value === 'walking' ? 4 : 30 }))}><option value="walking">Walking</option><option value="driving">{isSurface ? 'Motorized and walking' : 'Driving with walking connections'}</option></select></label>
          {!isSurface && <label>Assumed network speed (km/h)<input type="number" min="1" max="130" value={settings.speedKph} onChange={(e) => change(() => setSettings({ ...settings, speedKph: Number(e.target.value) }))} /></label>}
          <label>Maximum travel time (minutes)<input type="number" min="1" max="1440" value={settings.thresholdMinutes} onChange={(e) => change(() => setSettings({ ...settings, thresholdMinutes: Number(e.target.value) }))} /></label>
          {!isSurface && <label>Maximum walking connection to road (km)<input type="number" min="0" max="2" step="0.05" value={settings.maxSnapKm} onChange={(e) => change(() => setSettings({ ...settings, maxSnapKm: Number(e.target.value) }))} /></label>}
        </div>
        <h3>1. Select the operational area</h3>
        {!areaIds.length && <p className={styles.notice}>Select at least one area. The assessment does not default to all uploaded boundaries.</p>}
        <AreaMultiSelect districts={districts} value={areaIds} disabled={!!busy} onChange={(ids) => change(() => setAreaIds(ids))} />
        <h3>2. Population and travel data from Atlas</h3>
        <label>Analysis data<select aria-label="Analysis data" value={inputMode} onChange={(e) => change(() => { setInputMode(e.target.value); setPlatformData(null); setSettlements([]); setRoads(null); setSites([]); setConfirmed(false); })}><option value="earth-engine">Earth Engine access estimates (no road download)</option><option value="platform">WorldPop and OpenStreetMap (no uploads)</option><option value="upload">Use my own population points and roads</option></select></label>
        {isAutomatic ? <>
          <p>Your selected administrative boundaries define the analysis. Larger areas are downloaded in batches and combined automatically. Atlas adjusts the population grid if needed and reports the resolution used.</p>
          {isSurface ? <p className={styles.notice}>Earth Engine estimates use a 2019 travel surface at approximately 1 km resolution, with a 100 km path-search limit. They are approximate planning estimates. Facility discovery combines current OSM health facilities with the June 2025 Healthsites snapshot. These records do not confirm vaccination-service availability. No road download is required.</p> : <p>WorldPop provides the population grid. Atlas loads complete OSM road extracts, including nearby roads outside the admin boundary.</p>}
          <div className={styles.form}><label>Population year<select value={populationYear} onChange={(e) => change(() => setPopulationYear(['latest','current'].includes(e.target.value) ? e.target.value : Number(e.target.value)))}><option value="current">Latest at or before this year</option><option value="latest">Latest available (may be a future projection)</option>{Array.from({ length: 16 }, (_, i) => 2015 + i).map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>Target age group<select value={cohortSelection.age} onChange={e => change(() => setCohortSelection({ ...cohortSelection, age: e.target.value }))}>{ACCESS_AGE_GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label><label>Population sex<select value={cohortSelection.sex} onChange={e => change(() => setCohortSelection({ ...cohortSelection, sex: e.target.value }))}><option value="both">Female and male</option><option value="female">Female</option><option value="male">Male</option></select></label><label>Population cell size<select value={cellSize} onChange={(e) => change(() => setCellSize(Number(e.target.value)))}>{ACCESS_CELL_SIZES.map(size => <option key={size} value={size}>{size < 1000 ? `${size} m — finer detail` : `${size / 1000} km`}</option>)}</select></label></div>
          <p className={styles.muted}>Already in the workspace: WorldPop totals for {context.filter((a) => a.population != null).length} of {areas.length} selected areas; {accessContext.osmData?.features?.length || 0} OSM features. {isSurface ? 'The travel surface is combined with separately checked facility sources.' : 'The model reuses cached detailed extracts or requests the grid and complete road geometry needed for routing.'}</p>
          {loadingData && <div className={styles.loadingPanel} role="status" aria-label="Loading analysis data">
            <span className={styles.loadingSpinner} aria-hidden="true" />
            <div className={styles.loadingText}><strong>{isSurface ? 'Loading WorldPop and facility sources' : 'Loading WorldPop and OpenStreetMap'}</strong><p>{busy}</p><small>Your selected administrative area stays unchanged. Completed downloads are kept for retry.</small></div>
          </div>}
          <button className={styles.primary} disabled={!areas.length} onClick={loadPlatform}>{loadingData ? 'Loading analysis data…' : platformReady ? 'Reload platform data' : isSurface ? 'Load WorldPop and facilities for selected areas' : 'Load WorldPop and OSM for selected areas'}</button>
          {platformReady && !loadingData && <p role="status">Ready: {settlements.length.toLocaleString()} population cells ({platformData.population.year}{platformData.population.year > new Date().getFullYear() ? ' projection' : ''}), {!isSurface && `${roads.features.length.toLocaleString()} road features and `}{platformData.network.sites.length} mapped health facilities. {platformData.population.missingCells > 0 && `${platformData.population.missingCells} cells lack population data.`}</p>}
          {platformReady && <p className={styles.muted}>Population grid used: {platformData.population.cellSize / 1000} km. {platformData.population.cellSize > cellSize && `Adjusted from ${cellSize / 1000} km for this selection; coarser cells give less detailed journey estimates.`} {platformData.population.metadata.batches?.length || 1} download batches combined within your selected admin areas.</p>}
          {platformData && !platformReady && <p className={styles.notice}>The area, population group, year, grid or facility discovery version changed. Reload data before running the model.</p>}
        </> : <>
        <p className={styles.muted}>Optional alternative for teams with their own georeferenced datasets.</p>
        <div className={styles.form}>
          <label>Settlement population CSV<input type="file" accept=".csv" onChange={(e) => importFile(e, 'population')} /></label>
          <label>Population source<input value={sources.population} onChange={(e) => change(() => setSources({ ...sources, population: e.target.value }))} /></label>
          <label>Population observation date<input type="date" value={sources.populationDate} onChange={(e) => change(() => setSources({ ...sources, populationDate: e.target.value }))} /></label>
          <label>Road network GeoJSON<input type="file" accept=".geojson,.json" onChange={(e) => importFile(e, 'roads')} /></label>
          <label>Road source<input value={sources.roads} onChange={(e) => change(() => setSources({ ...sources, roads: e.target.value }))} /></label>
          <label>Road observation date<input type="date" value={sources.roadsDate} onChange={(e) => change(() => setSources({ ...sources, roadsDate: e.target.value }))} /></label>
        </div>
        <p>{settlements.length} population points · {roads?.features?.length || 0} road features loaded</p>
        <button onClick={() => downloadAccess('settlement_id,settlement,latitude,longitude,population\n', 'access-population-template.csv', 'text/csv')}>Download population template</button>
        </>}
        <h3>3. Existing services and outreach suggestions</h3>
        <div className={styles.form}><label>Maximum outreach sites<input type="number" min="1" max="10" value={settings.siteBudget ?? 3} onChange={e => change(() => setSettings({ ...settings, siteBudget: Number(e.target.value) }))} /></label><label>Decision owner<input value={settings.decisionOwner || ''} maxLength={200} onChange={e => change(() => setSettings({ ...settings, decisionOwner: e.target.value }))} /></label><label>Review by<input type="date" value={settings.reviewDate || ''} onChange={e => change(() => setSettings({ ...settings, reviewDate: e.target.value }))} /></label><label>Delivery constraints<textarea value={settings.deliveryConstraints || ''} maxLength={2000} placeholder="Teams, cold chain, transport, security, session capacity…" onChange={e => change(() => setSettings({ ...settings, deliveryConstraints: e.target.value }))} /></label></div>
        <p>The site limit is a planning constraint, not a team-capacity calculation. Confirm the available age bands match campaign eligibility; ranges such as 6–59 months cannot be extracted exactly from these age bands.</p>
        <label className={styles.checkbox}><input type="checkbox" checked={!!settings.facilitiesReviewed} onChange={e => change(() => setSettings({ ...settings, facilitiesReviewed: e.target.checked }))} />The planning team has reviewed the included facility list for completeness and confirmed which sites provide the vaccination service.</label>
        {platformReady && <div className={styles.notice}><strong>Facility discovery needs local review</strong><p>{sites.filter(site => site.role === 'existing' && areas.some(area => isPointInGeometry([Number(site.longitude), Number(site.latitude)], area.geometry))).length} included existing sites fall inside the selected areas. Zero means none in this included list; it does not mean the area has no health facilities.</p>{platformData.network.metadata.warnings?.map(warning => <p key={warning}>{warning}</p>)}<p>Review the list below, add workspace sites or a verified roster, and exclude sites that do not provide vaccination. Reload platform data to check the sources again.</p></div>}
        {isAutomatic && <p>{isSurface ? 'Current OSM and Healthsites facilities' : 'Mapped OSM health facilities'} are used as the starting service locations. The model tests up to ten outreach areas, looking for population still unreached after earlier tested sites. The decision brief proposes complementary sites within your site limit. Review these suggestions with local teams. No candidate-site upload is needed.</p>}
        <details><summary>Review or change service locations (optional)</summary>
        <div className={styles.actions}><button disabled={!areas.length || !facilities.length} onClick={useWorkspaceSites}>Use workspace sites in selected areas</button><button onClick={() => downloadAccess('id,name,latitude,longitude,role\n', 'access-sites-template.csv', 'text/csv')}>Download sites template</button></div>
        <div className={styles.form}><label>Service sites CSV<input type="file" accept=".csv" onChange={(e) => importFile(e, 'sites')} /></label><label>Site source<input value={sources.sites} onChange={(e) => change(() => setSources({ ...sources, sites: e.target.value }))} /></label></div>
        <button disabled={!sites.some(site => site.suggested)} onClick={() => change(() => { setSites(sites.filter(site => !site.suggested)); setSettings({ ...settings, selectedCandidateIds: settings.selectedCandidateIds.filter(id => sites.some(site => site.id === id && !site.suggested)) }); })}>Regenerate outreach suggestions on next calculation</button><p className={styles.muted}>Coordinates and sources are shown to check location and duplicates. Existing sites must provide the service being assessed. Candidate sites are excluded from baseline coverage. Select candidates to compare a combined scenario.</p>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Site</th><th>Coordinates / source</th><th>Role</th><th>Include in scenario</th></tr></thead><tbody>{sites.map((site, i) => <tr key={`${site.id}:${i}`}><td>{site.name}</td><td>{Number(site.latitude).toFixed(5)}, {Number(site.longitude).toFixed(5)}<br />{site.source || sources.sites}</td><td><select aria-label={`Role for ${site.name}`} value={site.role} onChange={(e) => change(() => { setSites(sites.map((s, j) => i === j ? { ...s, role: e.target.value } : s)); setSettings({ ...settings, facilitiesReviewed: false, selectedCandidateIds: settings.selectedCandidateIds.filter((id) => id !== String(site.id)) }); })}><option value="existing">Existing service</option><option value="candidate">Candidate</option><option value="exclude">Exclude</option></select></td><td><input type="checkbox" aria-label={`Include ${site.name} in scenario`} disabled={site.role !== 'candidate'} checked={settings.selectedCandidateIds.includes(String(site.id))} onChange={(e) => change(() => setSettings({ ...settings, selectedCandidateIds: e.target.checked ? [...settings.selectedCandidateIds, String(site.id)] : settings.selectedCandidateIds.filter((id) => id !== String(site.id)) }))} /></td></tr>)}</tbody></table></div>
        </details>
        <details><summary>Government catch-up lists and community feedback (optional, no coordinates needed)</summary>
          <p>Use place names and administrative area names or codes. Ambiguous places can be assigned manually. These records provide local context alongside the population-based journey model.</p>
          <h3>Catch-up list</h3><PlaceListInput kind="targets" value={targets} onChange={(v) => change(() => setTargets(v))} districts={districts} selectedIds={areaIds} facilities={facilities} disabled={!!busy} onBusyChange={(v) => setBusy(v ? 'Reading list' : '')} />
          <h3>Community feedback</h3><PlaceListInput kind="feedback" value={feedback} onChange={(v) => change(() => setFeedback(v))} districts={districts} selectedIds={areaIds} facilities={facilities} disabled={!!busy} onBusyChange={(v) => setBusy(v ? 'Reading feedback' : '')} />
        </details>
        <details><summary>Population and mobility attributes from uploaded boundaries (optional)</summary>
          <p>Choose existing attributes to include in the assessment. Values retain their source and units; mobility observations are not assumed to be road speeds.</p>
          <div className={styles.form}>{[['populationField', 'Boundary population field'], ['field', 'Mobility field']].map(([key, label]) => <label key={key}>{label}<select aria-label={label} value={mobility[key] || ''} onChange={(e) => change(() => setMobility({ ...mobility, [key]: e.target.value }))}><option value="">None selected</option>{boundaryFields.map((f) => <option key={f}>{f}</option>)}</select></label>)}{[['source', 'Mobility source'], ['period', 'Mobility period'], ['units', 'Mobility units']].map(([key, label]) => <label key={key}>{label}<input value={mobility[key] || ''} placeholder={key === 'source' ? 'e.g. Flowminder' : ''} onChange={(e) => change(() => setMobility({ ...mobility, [key]: e.target.value }))} /></label>)}</div>
        </details>
        <label className={styles.checkbox}><input type="checkbox" checked={confirmed} onChange={(e) => change(() => setConfirmed(e.target.checked))} />{isAutomatic ? 'Use these mapped facilities and population cells for a planning estimate; service availability and suggested outreach sites need local verification.' : 'The population rows do not overlap, and the road network preserves junction vertices and covers the relevant journeys, including routes outside the selected areas.'}</label>
        <button className={styles.primary} disabled={!confirmed || !areas.length || !roads || !settlements.length || (isAutomatic ? !platformReady : !sites.length)} onClick={() => run()}>Calculate access gaps</button>
      </fieldset>
      {result && <section aria-label="Access assessment results">
        <h2>Modeled access within {result.settings.thresholdMinutes} minutes</h2>
        <p>{result.existingSites.length} existing service locations included in the baseline: {servicesInsideArea} inside the selected areas and {result.existingSites.length - servicesInsideArea} outside. Outside services can provide access across administrative boundaries. Source: {result.sources.sites}.</p>
        {result.method === 'friction-surface-v1' && <p className={styles.notice}>Earth Engine access estimate · 2019 travel surface · approximately 1 km resolution · 100 km search limit. Close sites can be indistinguishable at this scale.</p>}
        <div className={styles.stats}>{[[result.settings.platformInputs ? `Modeled population · ${cohort.label}` : 'Uploaded population', result.totals.population], ['Within threshold', result.totals.covered], ['Beyond threshold', result.totals.beyondThreshold], ['Unknown access', result.totals.unknown]].map(([title, count]) => <div key={title}><span>{title}</span><strong>{format(count)}</strong></div>)}</div>
        <div className={styles.map}><AccessMap result={result} districts={areas} /></div>
        <p className={styles.muted}>Hexagons group population points: green within threshold, amber beyond threshold, gray unknown, dark slate mixed access. Zoom in or select a hexagon for detail. Blue circles: existing service · Purple circles: candidate.</p>
        <DecisionBrief result={result} onUseRecommendation={() => { const next = { ...settings, selectedCandidateIds: result.decision.selectedCandidateIds }; setSettings(next); run(next); }} />
        <h3>Candidate comparison · individual alternatives</h3>
        <p className={styles.muted}>Each number below is the benefit of that site alone. Nearby alternatives can overlap; use the decision brief above for a complementary set. To compare your own combined scenario, select candidates under “Review or change service locations” and recalculate. Suggested areas need local confirmation of a suitable site.</p>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Candidate</th><th>Additional population within threshold</th><th>Reachable with unknown baseline</th><th>{result.method === 'friction-surface-v1' ? 'Travel surface' : 'Road connection'}</th></tr></thead><tbody>{result.candidates.map((c) => <tr key={c.id}><td>{c.name}</td><td>{format(c.additionalPopulation)}</td><td>{format(c.reachableFromUnknown)}</td><td>{c.connected ? (result.method === 'friction-surface-v1' ? 'Available' : 'Connected') : 'Unknown'}</td></tr>)}</tbody></table></div>
        <p>Combined scenario ({result.scenario.selectedCandidateIds.length} candidates): {format(result.scenario.additionalPopulation)} additional people within threshold; {format(result.scenario.reachableFromUnknown)} reachable people whose baseline was unknown. Total modeled coverage: {format(result.scenario.coveredPopulation)}.</p>
        <h3>{result.settings.platformInputs ? 'Population cell results' : 'Settlement results'}</h3>
        <PopulationResults key={result.computedAt} result={result} />
        <details><summary>Sources, assumptions and limitations</summary><p>Computed {result.computedAt}. Population: {result.sources.population} ({result.sources.populationDate}). Travel data: {result.sources.roads} ({result.sources.roadsDate}). Sites: {result.sources.sites}.</p><p>{result.method === 'friction-surface-v1' ? `${result.settings.mode === 'walking' ? 'Walking-only' : 'Motorized and walking'} published travel assumptions; ${result.network.unconnectedSites.length} sites lack travel-surface data.` : `${result.settings.mode}, ${result.settings.speedKph} km/h; connection limit ${result.settings.maxSnapKm} km. ${result.network.unconnectedSites.length} sites could not be connected.`}</p><ul>{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>
        {result.areaContext && <AreaReview result={result.areaContext} compact />}
        <div className={styles.actions}>{result.decision && <button onClick={() => downloadAccess(accessDecisionText(result), 'outreach-decision-brief.txt', 'text/plain')}>Export decision brief</button>}<button onClick={() => downloadAccess(JSON.stringify(result, null, 2), 'access-assessment.json')}>Export assessment and evidence</button><button onClick={() => downloadAccess(Papa.unparse(result.settlements, { escapeFormulae: true }), 'access-settlements.csv', 'text/csv')}>Export settlements CSV</button></div>
      </section>}
    </div>
  </div>;
}
