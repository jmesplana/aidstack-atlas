import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';
import { isPointInGeometry } from '../../../lib/geo/geometry';
import styles from '../../platform/Planning.module.css';
import ux from './AccessGaps.module.css';
import AreaMultiSelect from '../../platform/AreaMultiSelect';
import { loadPlatformAccessInputs } from '../../../lib/planning/loadAccessInputs';
import { accessScopeKey, ACCESS_CELL_SIZES } from '../../../lib/planning/accessInputs';
import { buildAreaAccessAssessment, resolveListAreas, summarizeAreaContext } from '../../../lib/planning/areaAccess';
import PlaceListInput, { emptyPlaceList } from './PlaceListInput';
import AreaReview from './AreaReview';
import { runSurfaceAccess, createSurfaceTravelCache } from '../../../lib/planning/loadSurfaceAccess';
import DecisionBrief from './DecisionBrief';
import { accessDecisionText, validateSitePolicy } from '../../../lib/planning/accessDecision';
import { ACCESS_AGE_GROUPS, accessCohort } from '../../../lib/worldpop/accessCohorts';
import DetailDrawer from './DetailDrawer';
import PopulationProfile, { PopulationPreview } from './PopulationProfile';
import useAreaPopulation from './useAreaPopulation';
import { loadCellDemographics } from '../../../lib/planning/loadDemographics';
import PopulationResults from './PopulationResults';
import { SURFACE_SOURCE, HEALTHSITES_SOURCE } from '../../../lib/planning/surfaceAccess';

const AreaPreview = dynamic(() => import('./AreaPreview'), { ssr: false });
const AccessMap = dynamic(() => import('./AccessMap'), { ssr: false });
const initialSettings = { serviceType: 'healthcare', serviceName: 'Health services', mode: 'walking', speedKph: 4, thresholdMinutes: 60, maxSnapKm: 0.25, selectedCandidateIds: [], siteBudget: 3, siteCountMode: 'limited', targetCoveragePercent: 90, facilitiesReviewed: false, decisionOwner: '', reviewDate: '', deliveryConstraints: '' };
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
  const [notice, setNotice] = useState('');
  const [step, setStep] = useState(1), [drawer, setDrawer] = useState(null), [evidenceTab, setEvidenceTab] = useState('decision');
  const [viewMode, setViewMode] = useState('recommended'), [focusedSiteId, setFocusedSiteId] = useState(null), [selectedCell, setSelectedCell] = useState('');
  const [recommendationsOpen, setRecommendationsOpen] = useState(true);
  const bodyRef = useRef(null), headingRef = useRef(null);
  const previousBusy = useRef('');
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
  const platformReady = (platformData?.serviceType || 'healthcare') === settings.serviceType && platformData?.scopeKey === scopeKey && (platformData.model || 'network') === (isSurface ? 'surface' : 'network') && (!isSurface || platformData.network.metadata?.discoveryVersion === 2);
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
    if (platformReady) osm.metadata = { ...osm.metadata, roadsAvailable: !isSurface, facilitiesAvailable: settings.serviceType === 'healthcare', facilitySource: platformData.network.source?.name || (isSurface ? HEALTHSITES_SOURCE.name : 'OpenStreetMap'), roadSource: isSurface ? null : 'OpenStreetMap' };
    return summarizeAreaContext(areas, pop, platformReady && cohort.dataType === 'total' ? { year: platformData.population.year } : accessContext.worldPopLastFetch, osm);
  }, [areas, accessContext.worldPopData, accessContext.worldPopLastFetch, accessContext.osmData, platformData, platformReady, isSurface, cohort, settings.serviceType]);
  const result = plan?.result;
  const profile = useAreaPopulation(areas, result?.populationCoverage?.year || populationYear, cohort.dataType, isAutomatic && (step === 2 || drawer === 'population'), plan?.inputs.populationProfile);
  useEffect(() => { storage.listPlans().then(setSavedPlans).catch((e) => setError(e.message)); }, [storage]);
  useEffect(() => {
    leaveGuard.current = () => (!dirty && !busy) || window.confirm('Leave this unsaved assessment? Any running calculation will be cancelled.');
    const unload = (e) => { if (dirty || busy) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { leaveGuard.current = null; window.removeEventListener('beforeunload', unload); };
  }, [dirty, busy, leaveGuard]);
  useEffect(() => () => { worker.current?.terminate(); loadingRequest.current?.abort(); }, []);
  useEffect(() => {
    if (busy) { previousBusy.current = busy; setNotice(''); }
    else if (previousBusy.current) { setNotice(`${previousBusy.current.replace(/…$/, '')} — finished.`); previousBusy.current = ''; }
  }, [busy]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
  function goTo(next) { setStep(next); setDrawer(null); }
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; headingRef.current?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => { if (result) { setStep(4); setViewMode('recommended'); setFocusedSiteId(null); } }, [result?.computedAt]);
  async function loadBreakdown() {
    const currentId = plan.id, controller = new AbortController(); loadingRequest.current = controller;
    setBusy('Loading demographic counts for the analysis cells'); setError('');
    try {
      const demographics = await loadCellDemographics(result, { signal: controller.signal, onProgress: setBusy });
      setPlan(current => current?.id === currentId ? { ...current, result: { ...current.result, demographics } } : current);
      setDirty(true); setPublication(null);
    } catch (error) { setError(controller.signal.aborted ? 'Demographic loading cancelled.' : error.message); }
    finally { loadingRequest.current = null; setBusy(''); }
  }
  function cancelAction() {
    if (loadingRequest.current) loadingRequest.current.abort();
    if (worker.current) { worker.current.terminate(); worker.current = null; setBusy(''); }
    setError('Operation cancelled.');
  }
  function editMetadata(key, value) {
    if (key === 'name') setName(value); else setSettings(s => ({ ...s, [key]: value }));
    setPlan(p => !p ? p : key === 'name' ? { ...p, metadata: { ...p.metadata, name: value } } : {
      ...p, inputs: { ...p.inputs, settings: { ...p.inputs.settings, [key]: value } },
      result: { ...p.result, settings: { ...p.result.settings, [key]: value } },
    });
    setPublication(null); setDirty(true); setError('');
  }
  function change(action) { action(); if (step === 4) setStep(3); setPlan(null); setPublication(null); setDirty(true); setError(''); setNotice(''); }
  async function loadPlatform() {
    setError(''); setBusy(isSurface ? 'Loading WorldPop and facility sources' : 'Loading WorldPop population cells and OSM roads'); setLoadingData(true);
    const controller = new AbortController(); loadingRequest.current = controller;
    try {
      const data = await loadPlatformAccessInputs({ districts: areas, cellSize, year: populationYear, cohort, force: platformReady, model: isSurface ? 'surface' : 'network', discoverFacilities: settings.serviceType === 'healthcare', signal: controller.signal, onProgress: setBusy });
      if (controller.signal.aborted) return;
      change(() => {
        setPlatformData({ ...data, serviceType: settings.serviceType }); setSettlements(data.population.points); setRoads(data.network.roads);
        setSites(data.network.sites); setSettings((s) => ({ ...s, maxSnapKm: 1, selectedCandidateIds: [], facilitiesReviewed: false }));
        setSources({ population: `WorldPop Global 2 (${data.population.year}${data.population.year > new Date().getFullYear() ? ' projection' : ''}); ${data.population.cellSize} m demand cells; ${cohort.label}`, populationDate: `${data.population.year}-01-01`, roads: isSurface ? SURFACE_SOURCE.name : 'OpenStreetMap (full road geometry, 5 km buffer)', roadsDate: isSurface ? '2019-01-01' : data.network.metadata.timestamp.slice(0, 10), sites: settings.serviceType === 'healthcare' ? data.network.source?.name || 'OpenStreetMap mapped health facilities' : 'Service roster supplied by the planning team' });
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
    if (!name.trim() || !settings.serviceName.trim() || !confirmed) { setError('Name the assessment and service, then confirm the input assumptions.'); return; }
    try { validateSitePolicy(runSettings); } catch (e) { setError(e.message); return; }
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
        result, inputs: { areaIds, settlements, sites: resultSites, roads, settings: runSettings, cohortSelection, sources, inputMode, platformData, cellSize, populationYear, targets, feedback, mobility, populationProfile: profile.data } });
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
    if (!name.trim()) { setError('Enter an assessment name before saving.'); return; }
    setBusy('Saving'); setError('');
    try { const next = await storage.savePlan({ ...plan, inputs: { ...plan.inputs, populationProfile: profile.data || plan.inputs.populationProfile } }, plan.revision); setPlan(next); setDirty(false); setSavedPlans(await storage.listPlans()); }
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
  const readyToCalculate = name.trim() && settings.serviceName.trim() && confirmed && areas.length && roads && settlements.length && (isAutomatic ? platformReady : sites.length);
  const decision = result?.decision;
  const percent = value => result?.totals.population > 0 ? `${(100 * value / result.totals.population).toFixed(1)}%` : 'Unknown';
  const showEvidence = tab => { setEvidenceTab(tab); setDrawer('evidence'); };
  const showPopulation = (cell = '') => { setSelectedCell(cell); setDrawer('population'); };
  const existing = sites.filter(site => site.role === 'existing');
  const existingInside = existing.filter(site => areas.some(area => isPointInGeometry([Number(site.longitude), Number(site.latitude)], area.geometry))).length;
  const steps = ['Choose area', 'Define assessment', 'Review data', 'Review recommendation'];
  return <div className={`${styles.workspace} ${ux.flowWorkspace}`}>
    <div className={`${styles.toolbar} ${ux.flowToolbar}`}>
      <select aria-label="Saved access assessments" value="" disabled={!!busy} onChange={event => open(event.target.value)}><option value="">Open saved assessment…</option>{savedPlans.map(item => <option key={item.id} value={item.id}>{item.name} (v{item.revision})</option>)}</select>
      <span className={styles.muted} role="status">{busy ? 'Action in progress…' : dirty ? 'Unsaved changes' : plan ? 'Saved on this device' : 'New assessment'}</span>
      <button disabled={!plan || !!busy} onClick={() => setDrawer('save')}>Save / Share</button>
    </div>
    <nav className={ux.stepper} aria-label="Assessment steps">{steps.map((label, index) => <button key={label} aria-current={step === index + 1 ? 'step' : undefined} disabled={!!busy || (index > 0 && !areas.length) || (index === 3 && !result)} onClick={() => goTo(index + 1)}><span>{index + 1}</span>{label}</button>)}</nav>
    {step > 1 && <div className={ux.selectionSummary}>{areas.length === 1 ? areas[0].name : `${areas.length} areas`} · {settings.serviceName} · {isAutomatic ? cohort.label : 'Uploaded population'} · {settings.thresholdMinutes} min {settings.mode === 'walking' ? 'walking' : 'motorized travel'}{result?.populationCoverage?.year && ` · WorldPop ${result.populationCoverage.year}`}</div>}
    <div className={`${styles.body} ${ux.flowBody} ${step === 4 ? ux.resultBody : ''}`} ref={bodyRef}>
      <h2 ref={headingRef} tabIndex={-1} className={step === 4 ? ux.screenReaderHeading : undefined}>{step === 4 && result ? `Modeled access within ${result.settings.thresholdMinutes} minutes` : steps[step - 1]}</h2>
      <fieldset disabled={!!busy} className={ux.flowFields}>
      {step === 1 && <section aria-label="Choose operational area">
        <p>Select the administrative areas for this assessment and check their boundaries on the map.</p>
        <AreaMultiSelect districts={districts} value={areaIds} disabled={!!busy} onChange={ids => change(() => setAreaIds(ids))} />
        <div className={ux.areaPreview}>{areas.length ? <AreaPreview areas={areas} /> : <p>Select an area to preview its boundary.</p>}</div>
      </section>}
      {step === 2 && <section aria-label="Define assessment">
        <div className={styles.form}>
          <label>Assessment name<input value={name} maxLength={200} onChange={event => editMetadata('name', event.target.value)} /></label>
          <label>Service locations<select aria-label="Service locations" value={settings.serviceType} onChange={event => change(() => { setSettings({ ...settings, serviceType: event.target.value, serviceName: event.target.value === 'healthcare' ? 'Health services' : '', facilitiesReviewed: false, selectedCandidateIds: [] }); setSites([]); setConfirmed(false); })}><option value="healthcare">Healthcare · discover mapped facilities</option><option value="other">Another service · supply my own locations</option></select></label>
          <label>Service being assessed<input value={settings.serviceName} maxLength={200} placeholder="e.g. drinking water, education, vaccination" onChange={event => change(() => setSettings({ ...settings, serviceName: event.target.value, facilitiesReviewed: false }))} /></label>
          {isAutomatic && <><label>Target age group<select aria-label="Target age group" value={cohortSelection.age} onChange={event => change(() => setCohortSelection({ ...cohortSelection, age: event.target.value }))}>{ACCESS_AGE_GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
          <label>Population sex<select aria-label="Population sex" value={cohortSelection.sex} onChange={event => change(() => setCohortSelection({ ...cohortSelection, sex: event.target.value }))}><option value="both">Female and male</option><option value="female">Female</option><option value="male">Male</option></select></label>
          <label>Population year<select aria-label="Population year" value={populationYear} onChange={event => change(() => setPopulationYear(['latest','current'].includes(event.target.value) ? event.target.value : Number(event.target.value)))}><option value="current">Latest at or before this year</option><option value="latest">Latest available (may be a projection)</option>{Array.from({ length: 16 }, (_, i) => 2015 + i).map(year => <option key={year} value={year}>{year}</option>)}</select></label></>}
          <label>Travel mode<select aria-label="Travel mode" value={settings.mode} onChange={event => change(() => setSettings({ ...settings, mode: event.target.value, speedKph: event.target.value === 'walking' ? 4 : 30 }))}><option value="walking">Walking</option><option value="driving">{isSurface ? 'Motorized and walking' : 'Driving with walking connections'}</option></select></label>
          <label>Maximum travel time (minutes)<input type="number" min="1" max="1440" value={settings.thresholdMinutes} onChange={event => change(() => setSettings({ ...settings, thresholdMinutes: Number(event.target.value) }))} /></label>
          <label>Number of new locations<select aria-label="Number of new locations" value={settings.siteCountMode} onChange={event => change(() => setSettings({ ...settings, siteCountMode: event.target.value }))}><option value="limited">Set a maximum</option><option value="automatic">Let the app decide</option></select></label>
          {settings.siteCountMode === 'automatic' ? <label>Target modeled coverage (%)<input type="number" min="1" max="100" value={settings.targetCoveragePercent} onChange={event => change(() => setSettings({ ...settings, targetCoveragePercent: Number(event.target.value) }))} /></label> : <label>Maximum new locations<input type="number" min="1" max="10" value={settings.siteBudget} onChange={event => change(() => setSettings({ ...settings, siteBudget: Number(event.target.value) }))} /></label>}
        </div>
        {isAutomatic && <PopulationPreview profile={profile} cohort={cohort} loadedPopulation={platformReady ? platformData.population.totalPopulation : null} onOpen={() => showPopulation()} />}
        <details className={ux.advanced}><summary>Advanced options</summary>
          <div className={styles.form}>
            <label>Analysis data<select aria-label="Analysis data" value={inputMode} onChange={event => change(() => { setInputMode(event.target.value); setPlatformData(null); setSettlements([]); setRoads(null); setSites([]); setConfirmed(false); })}><option value="earth-engine">Approximate travel estimates · Earth Engine</option><option value="platform">Road-network estimates · WorldPop and OSM</option><option value="upload">My own population points and roads</option></select></label>
            {isAutomatic && <label>Population cell size<select aria-label="Population cell size" value={cellSize} onChange={event => change(() => setCellSize(Number(event.target.value)))}>{ACCESS_CELL_SIZES.map(size => <option key={size} value={size}>{size < 1000 ? `${size} m` : `${size / 1000} km`}</option>)}</select></label>}
            {!isSurface && <><label>Assumed network speed (km/h)<input type="number" min="1" max="130" value={settings.speedKph} onChange={event => change(() => setSettings({ ...settings, speedKph: Number(event.target.value) }))} /></label><label>Maximum walking connection to road (km)<input type="number" min="0" max="2" step="0.05" value={settings.maxSnapKm} onChange={event => change(() => setSettings({ ...settings, maxSnapKm: Number(event.target.value) }))} /></label></>}
          </div>
          <p className={styles.muted}>{isSurface ? 'Earth Engine uses a 2019 travel surface at approximately 1 km resolution and a 100 km path-search limit. Close sites may be indistinguishable. Current OSM and the June 2025 Healthsites snapshot supply mapped healthcare locations when selected.' : 'Road-network estimates use mapped road geometry and assumed speeds. Missing connections produce unknown access.'}</p>
        </details>
      </section>}
      {step === 3 && <section aria-label="Review analysis data">
        <p>Load the selected population, check the existing services, then calculate the potential benefit of new locations.</p>
        {isAutomatic ? <>
          <button className={styles.primary} disabled={!areas.length} onClick={loadPlatform}>{loadingData ? 'Loading analysis data…' : platformReady ? 'Reload platform data' : settings.serviceType === 'other' ? 'Load population and travel data' : isSurface ? 'Load WorldPop and facilities for selected areas' : 'Load WorldPop and OSM for selected areas'}</button>
          {loadingData && <div className={styles.loadingPanel} role="status" aria-label="Loading analysis data"><span className={styles.loadingSpinner} aria-hidden="true" /><span>{busy}</span></div>}
          {platformReady && <p role="status">Ready: {settlements.length.toLocaleString()} population cells ({platformData.population.year}{platformData.population.year > new Date().getFullYear() ? ' projection' : ''}) · {cohort.label} · {existing.length} included services.</p>}
          {platformData && !platformReady && <p className={styles.notice}>The area, population selection or data settings changed. Reload the matching data before calculating.</p>}
        </> : <details open><summary>Upload population and road data</summary>        <p className={styles.muted}>Optional alternative for teams with their own georeferenced datasets.</p>
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
</details>}
        {(platformReady || !isAutomatic) && <>
          <div className={ux.reviewCards}><div><strong>{format(settlements.reduce((sum, row) => sum + Number(row.population || 0), 0))}</strong><span>{isAutomatic ? cohort.label : 'Uploaded population'}</span></div><div><strong>{existing.length}</strong><span>Existing services · {existingInside} inside the area</span></div><div><strong>{isSurface ? 'Approximate journeys' : 'Road-network journeys'}</strong><span>{settings.thresholdMinutes} minutes · {settings.mode}</span></div></div>
          {!existingInside && <p className={styles.notice}>No included service locations fall inside the selected areas. This does not mean there are no services. Review the list and add missing locations before relying on the access gap.</p>}
          {platformData?.network.metadata?.warnings?.length > 0 && <p className={styles.notice}>Some facility sources were incomplete. Review the source warnings before using the results.</p>}
          {platformData?.population.missingCells > 0 && <p className={styles.notice}>{platformData.population.missingCells} population cells have missing estimates and will be excluded.</p>}
          <div className={styles.actions}><button onClick={() => setDrawer('services')}>Review or change service locations</button><button onClick={() => setDrawer('context')}>Add local context (optional)</button>{isAutomatic && <button onClick={() => showPopulation()}>View age and sex breakdown</button>}</div>
          <label className={styles.checkbox}><input type="checkbox" checked={settings.facilitiesReviewed} onChange={event => change(() => setSettings({ ...settings, facilitiesReviewed: event.target.checked }))} />The planning team reviewed the service list and confirmed which locations provide {settings.serviceName || 'the intended service'}.</label>
          <label className={styles.checkbox}><input type="checkbox" checked={confirmed} onChange={event => change(() => setConfirmed(event.target.checked))} />{isAutomatic ? 'Use these mapped facilities and population cells for a planning estimate; service availability and new locations need local verification.' : 'The population rows do not overlap, and the road network preserves junction vertices and covers the relevant journeys.'}</label>
        </>}
      </section>}
      </fieldset>
      {step === 4 && result && <section aria-label="Access assessment results" className={ux.resultScreen}>
        <div className={ux.decisionHeadline}><strong>{decision?.steps.length ? `Consider ${decision.steps.length} additional ${decision.steps.length === 1 ? 'location' : 'locations'} to increase modeled access from ${percent(result.totals.covered)} to ${percent(decision.coveredPopulation)}.` : decision?.stoppingExplanation || 'Review current access and test additional locations.'}</strong></div>
        {decision?.issues.length > 0 && <div className={ux.evidenceWarning}><strong>Provisional recommendation</strong><span>Verify the included service list and travel assumptions before planning delivery.</span><button onClick={() => showEvidence('decision')}>Review {decision.issues.length} evidence checks</button></div>}
        <div className={`${styles.stats} ${ux.resultStats}`}>{[['Within threshold now', result.totals.covered], ['With recommended locations', decision?.coveredPopulation ?? result.totals.covered], ['Additional reach', decision?.additionalPopulation ?? 0], ['Still unknown', decision?.remainingUnknown ?? result.totals.unknown]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{format(value)}</strong></div>)}</div>
        <div className={ux.resultActions}><label>Map access view<select aria-label="Map access view" value={viewMode} onChange={event => setViewMode(event.target.value)}><option value="baseline">Current services</option><option value="recommended">Recommended locations added</option><option value="scenario">My selected scenario</option></select></label><button disabled={!result.populationCoverage} onClick={() => showPopulation()}>Population breakdown</button><button onClick={() => showEvidence('decision')}>View evidence</button></div>
        <div className={ux.resultsLayout}>
          <AccessMap result={result} districts={areas} viewMode={viewMode} focusedSiteId={focusedSiteId} onSiteSelect={setFocusedSiteId} onPopulationSelect={result.populationCoverage ? row => showPopulation(JSON.stringify([row.areaId, row.settlementId])) : undefined} />
          <details className={ux.recommendations} open={recommendationsOpen} onToggle={event => setRecommendationsOpen(event.currentTarget.open)}><summary>Recommended locations ({decision?.steps.length || 0})</summary>
            <p className={styles.muted}>Select a location to find it on the map.</p><ol>{decision?.steps.map(site => <li key={site.id}><button aria-pressed={focusedSiteId === site.id} onClick={() => setFocusedSiteId(site.id)}>{site.name}</button><p>{format(site.additionalPopulation)} additional people{site.reachableFromUnknown > 0 && `; ${format(site.reachableFromUnknown)} newly reachable with unknown baseline`}.</p></li>)}</ol>
            <p>{decision?.stoppingExplanation}</p><p>{decision?.nextAction}</p>
            {decision?.steps.length > 0 && <button disabled={!!busy} onClick={() => { const next = { ...settings, selectedCandidateIds: decision.selectedCandidateIds }; setSettings(next); run(next); }}>Use recommended sites in combined scenario</button>}
            <button onClick={() => setDrawer('services')}>Compare my own locations</button>
          </details>
        </div>
        {publication && <section className={styles.notice} aria-label="Published assessment"><p>Published “{publication.metadata.name}” from saved revision {publication.source.revision}.</p><button onClick={() => onShowResult?.(publication)}>Show on workspace map</button><button disabled={!!busy} onClick={withdraw}>Withdraw publication</button></section>}
      </section>}
    </div>
    <div className={ux.flowFooter}><button disabled={step === 1 || !!busy} onClick={() => goTo(step - 1)}>Back</button><span>Step {step} of 4</span>{step < 3 ? <button className={styles.primary} disabled={!!busy || !areas.length || (step === 2 && (!name.trim() || !settings.serviceName.trim()))} onClick={() => goTo(step + 1)}>Continue</button> : step === 3 ? <button className={styles.primary} disabled={!!busy || !readyToCalculate} onClick={() => run()}>{busy && !loadingData ? 'Calculating…' : 'Calculate access gaps'}</button> : <button className={styles.primary} disabled={!!busy} onClick={() => setDrawer('save')}>Save / Share</button>}</div>
    {(busy || error || notice) && <div className={`${ux.activity} ${!busy && !error ? ux.completedActivity : ''}`}>{!!busy && <span className={styles.loadingSpinner} aria-hidden="true" />}<div className={ux.activityText} role="status" aria-live="polite" aria-label="Action progress"><strong>{busy ? 'Working…' : error ? 'Action needs attention' : 'Action complete'}</strong><p role={error && !busy ? 'alert' : undefined}>{busy || error || notice}</p></div>{busy && (loadingData || worker.current || loadingRequest.current) && <button onClick={cancelAction}>{loadingData ? 'Cancel loading' : 'Cancel calculation'}</button>}{!busy && <button onClick={() => { setNotice(''); setError(''); }}>Dismiss status</button>}</div>}
    {drawer && <DetailDrawer title={{ population: 'Population breakdown', services: 'Service locations', context: 'Local context', evidence: 'Assessment evidence', save: 'Save and share' }[drawer]} onClose={() => setDrawer(null)}>
      {drawer === 'population' && <PopulationProfile key={selectedCell || 'area'} profile={profile} areas={areas} cohort={cohort} result={result} busy={!!busy} onLoadCells={loadBreakdown} cellId={selectedCell} option={viewMode} />}
      {drawer === 'services' && <fieldset className={ux.flowFields} disabled={!!busy}><p>Include only locations providing {settings.serviceName || 'your intended service'}. Existing locations define current access; candidates are evaluated as additions.</p>        <div className={styles.actions}><button disabled={!areas.length || !facilities.length} onClick={useWorkspaceSites}>Use workspace sites in selected areas</button><button onClick={() => downloadAccess('id,name,latitude,longitude,role\n', 'access-sites-template.csv', 'text/csv')}>Download sites template</button></div>
        <div className={styles.form}><label>Service sites CSV<input type="file" accept=".csv" onChange={(e) => importFile(e, 'sites')} /></label><label>Site source<input value={sources.sites} onChange={(e) => change(() => setSources({ ...sources, sites: e.target.value }))} /></label></div>
        <button disabled={!sites.some(site => site.suggested)} onClick={() => change(() => { setSites(sites.filter(site => !site.suggested)); setSettings({ ...settings, selectedCandidateIds: settings.selectedCandidateIds.filter(id => sites.some(site => site.id === id && !site.suggested)) }); })}>Regenerate outreach suggestions on next calculation</button><p className={styles.muted}>Coordinates and sources are shown to check location and duplicates. Existing sites must provide the service being assessed. Candidate sites are excluded from baseline coverage. Select candidates to compare a combined scenario.</p>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Site</th><th>Coordinates / source</th><th>Role</th><th>Include in scenario</th></tr></thead><tbody>{sites.map((site, i) => <tr key={`${site.id}:${i}`}><td>{site.name}</td><td>{Number(site.latitude).toFixed(5)}, {Number(site.longitude).toFixed(5)}<br />{site.source || sources.sites}</td><td><select aria-label={`Role for ${site.name}`} value={site.role} onChange={(e) => change(() => { setSites(sites.map((s, j) => i === j ? { ...s, role: e.target.value } : s)); setSettings({ ...settings, facilitiesReviewed: false, selectedCandidateIds: settings.selectedCandidateIds.filter((id) => id !== String(site.id)) }); })}><option value="existing">Existing service</option><option value="candidate">Candidate</option><option value="exclude">Exclude</option></select></td><td><input type="checkbox" aria-label={`Include ${site.name} in scenario`} disabled={site.role !== 'candidate'} checked={settings.selectedCandidateIds.includes(String(site.id))} onChange={(e) => change(() => setSettings({ ...settings, selectedCandidateIds: e.target.checked ? [...settings.selectedCandidateIds, String(site.id)] : settings.selectedCandidateIds.filter((id) => id !== String(site.id)) }))} /></td></tr>)}</tbody></table></div>
{platformData?.network.metadata?.warnings?.map(warning => <p key={warning} className={styles.notice}>{warning}</p>)}</fieldset>}
      {drawer === 'context' && <fieldset className={ux.flowFields} disabled={!!busy}>        <details><summary>Government catch-up lists and community feedback (optional, no coordinates needed)</summary>
          <p>Use place names and administrative area names or codes. Ambiguous places can be assigned manually. These records provide local context alongside the population-based journey model.</p>
          <h3>Catch-up list</h3><PlaceListInput kind="targets" value={targets} onChange={(v) => change(() => setTargets(v))} districts={districts} selectedIds={areaIds} facilities={facilities} disabled={!!busy} onBusyChange={(v) => setBusy(v ? 'Reading list' : '')} />
          <h3>Community feedback</h3><PlaceListInput kind="feedback" value={feedback} onChange={(v) => change(() => setFeedback(v))} districts={districts} selectedIds={areaIds} facilities={facilities} disabled={!!busy} onBusyChange={(v) => setBusy(v ? 'Reading feedback' : '')} />
        </details>
        <details><summary>Population and mobility attributes from uploaded boundaries (optional)</summary>
          <p>Choose existing attributes to include in the assessment. Values retain their source and units; mobility observations are not assumed to be road speeds.</p>
          <div className={styles.form}>{[['populationField', 'Boundary population field'], ['field', 'Mobility field']].map(([key, label]) => <label key={key}>{label}<select aria-label={label} value={mobility[key] || ''} onChange={(e) => change(() => setMobility({ ...mobility, [key]: e.target.value }))}><option value="">None selected</option>{boundaryFields.map((f) => <option key={f}>{f}</option>)}</select></label>)}{[['source', 'Mobility source'], ['period', 'Mobility period'], ['units', 'Mobility units']].map(([key, label]) => <label key={key}>{label}<input value={mobility[key] || ''} placeholder={key === 'source' ? 'e.g. Flowminder' : ''} onChange={(e) => change(() => setMobility({ ...mobility, [key]: e.target.value }))} /></label>)}</div>
        </details>
</fieldset>}
      {drawer === 'evidence' && result && <><div className={ux.evidenceTabs}>{[['decision','Decision brief'],['population','Population locations'],['candidates','Candidate comparison'],['sources','Sources and context']].map(([key, label]) => <button key={key} aria-pressed={evidenceTab === key} onClick={() => setEvidenceTab(key)}>{label}</button>)}</div>{evidenceTab === 'decision' && <DecisionBrief result={result} />}{evidenceTab === 'population' && <><h3>{result.settings.platformInputs ? 'Population cell results' : 'Settlement results'}</h3><PopulationResults result={result} /></>}{evidenceTab === 'candidates' && <>        <h3>Candidate comparison · individual alternatives</h3>
        <p className={styles.muted}>Each number below is the benefit of that site alone. Nearby alternatives can overlap; use the decision brief above for a complementary set. To compare your own combined scenario, select candidates under “Review or change service locations” and recalculate. Suggested areas need local confirmation of a suitable site.</p>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Candidate</th><th>Additional population within threshold</th><th>Reachable with unknown baseline</th><th>{result.method === 'friction-surface-v1' ? 'Travel surface' : 'Road connection'}</th></tr></thead><tbody>{result.candidates.map((c) => <tr key={c.id}><td>{c.name}</td><td>{format(c.additionalPopulation)}</td><td>{format(c.reachableFromUnknown)}</td><td>{c.connected ? (result.method === 'friction-surface-v1' ? 'Available' : 'Connected') : 'Unknown'}</td></tr>)}</tbody></table></div>
        <p>Combined scenario ({result.scenario.selectedCandidateIds.length} candidates): {format(result.scenario.additionalPopulation)} additional people within threshold; {format(result.scenario.reachableFromUnknown)} reachable people whose baseline was unknown. Total modeled coverage: {format(result.scenario.coveredPopulation)}.</p>
</>}{evidenceTab === 'sources' && <>        <details><summary>Sources, assumptions and limitations</summary><p>Computed {result.computedAt}. Population: {result.sources.population} ({result.sources.populationDate}). Travel data: {result.sources.roads} ({result.sources.roadsDate}). Sites: {result.sources.sites}.</p><p>{result.method === 'friction-surface-v1' ? `${result.settings.mode === 'walking' ? 'Walking-only' : 'Motorized and walking'} published travel assumptions; ${result.network.unconnectedSites.length} sites lack travel-surface data.` : `${result.settings.mode}, ${result.settings.speedKph} km/h; connection limit ${result.settings.maxSnapKm} km. ${result.network.unconnectedSites.length} sites could not be connected.`}</p><ul>{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>
        {result.areaContext && <AreaReview result={result.areaContext} compact />}
</>}</>}
      {drawer === 'save' && result && <><div className={styles.form}><label>Assessment name<input value={name} onChange={event => editMetadata('name', event.target.value)} /></label><label>Decision owner<input value={settings.decisionOwner} onChange={event => editMetadata('decisionOwner', event.target.value)} /></label><label>Review by<input type="date" value={settings.reviewDate} onChange={event => editMetadata('reviewDate', event.target.value)} /></label><label>Delivery constraints<textarea value={settings.deliveryConstraints} onChange={event => editMetadata('deliveryConstraints', event.target.value)} /></label></div><div className={styles.actions}><button disabled={!dirty || !!busy} onClick={save}>Save assessment</button><button disabled={dirty || !!busy || !sharedResults} onClick={publish}>Publish to workspace</button></div><p role="status">{dirty ? 'Unsaved changes' : 'Saved on this device'}</p><p className={styles.muted}>Save on this device before publishing a snapshot to the workspace. Exports include all calculated locations and full precision.</p>        <div className={styles.actions}>{result.decision && <button onClick={() => downloadAccess(accessDecisionText(result), 'outreach-decision-brief.txt', 'text/plain')}>Export decision brief</button>}<button onClick={() => downloadAccess(JSON.stringify(result, null, 2), 'access-assessment.json')}>Export assessment and evidence</button><button onClick={() => downloadAccess(Papa.unparse(result.settlements, { escapeFormulae: true }), 'access-settlements.csv', 'text/csv')}>Export settlements CSV</button></div>
</>}
      {(busy || error) && <div className={ux.drawerActivity} role={error && !busy ? 'alert' : 'status'}>{busy && <span className={styles.loadingSpinner} aria-hidden="true" />}<span>{busy || error}</span>{busy && loadingRequest.current && <button onClick={cancelAction}>Cancel loading</button>}</div>}
    </DetailDrawer>}
  </div>;
}
