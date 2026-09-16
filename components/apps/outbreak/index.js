import { useEffect, useMemo, useRef, useState } from 'react';
import { latestPerLocation, nationalEvidence, revisionCount, dailyComparison, validateBoundaries, selectFacts, LEVELS, validDate, formatValue } from '../../../lib/outbreak/data';
import Upload from './Upload';
import MineUpload from './MineUpload';
import {minesAtCutoff,mergePublicDatasets} from '../../../lib/outbreak/imports';
import GeoImport from './GeoImport';
import Overview from './Overview';
import BriefSummary from './BriefSummary';
import DataAvailability from './DataAvailability';
import {recommendations,proposalKey,proposalSelected} from '../../../lib/outbreak/overview';
import {hazardContext} from '../../../lib/outbreak/context';
import Routes, { RouteUpload } from './Routes';
import { IntegratedCharts, MobilityPanel } from './Integrated';
import { embeddedEpidemiology, detectGeoIndicators, detectMobility, describeMobility, spatialIndex, miningOverlap, securityRecords, securityOverlap, epidemiology, integratedEvidence, shiftDate } from '../../../lib/outbreak/insights';
import { OutbreakMap, TrendChart, download, briefingHTML, printBriefing } from './Visuals';
import ResponseStatus from './ResponseStatus';
import BriefWorkflow, { BriefChanges, EvidenceReadiness } from './BriefWorkflow';
import { comparisonRecord, evidenceReadiness, actionFollowUp } from '../../../lib/outbreak/briefing';
import KeyMessage from './KeyMessage';
import { keyMessage } from '../../../lib/outbreak/keyMessage';
import { sinceLast, responseStatus } from '../../../lib/outbreak/response';
import styles from './outbreak.module.css';

const today=()=>new Date().toISOString().slice(0,10);
const INITIAL_NAME='Outbreak operation';
const sourceLabel=d=>d?.url||d?.source||'Unknown';

export default function Outbreak({ storage, districts=[], facilities=[], acledData=[], disasters=[], onOpenWorkspace, leaveGuard }) {
  const briefElement=useRef(null),explorerElement=useRef(null),refreshGeneration=useRef(0),autoConnection=useRef('');
  const [includeEvidenceDates,setIncludeEvidenceDates]=useState(false);
  const [includeAppendix,setIncludeAppendix]=useState(false),[restoredDisasters,setRestoredDisasters]=useState(null),[showHazards,setShowHazards]=useState(true);
  const [explorerOpen,setExplorerOpen]=useState(false),[refreshing,setRefreshing]=useState(false),[refreshStatus,setRefreshStatus]=useState(''),[lastChecked,setLastChecked]=useState('');
  const [name,setName]=useState(INITIAL_NAME),[preset,setPreset]=useState('custom'),[bottomLine,setBottomLine]=useState('');
  const [datasets,setDatasets]=useState([]),[selectedId,setSelectedId]=useState(''),[location,setLocation]=useState('');
  const [asOf,setAsOf]=useState(today()),[tab,setTab]=useState('Situation'),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [boundaryField,setBoundaryField]=useState('auto'),[boundaryLevel,setBoundaryLevel]=useState('health_zone');
  const [mines,setMines]=useState(null),[showMines,setShowMines]=useState(false);
  const [actions,setActions]=useState([]),[factIds,setFactIds]=useState([]),[reviewed,setReviewed]=useState(false);
  const [saved,setSaved]=useState([]),[record,setRecord]=useState(null),[dirty,setDirty]=useState(false);
  const [compareId,setCompareId]=useState(''),[compareSnapshot,setCompareSnapshot]=useState(null),[briefDirection,setBriefDirection]=useState('inflow');
  const [boundarySource,setBoundarySource]=useState('Main app uploaded boundaries');
  const [restoredGeometry,setRestoredGeometry]=useState(null);
  const [routeDirection,setRouteDirection]=useState('outflow'),[routeLimit,setRouteLimit]=useState('10');
  const [routeData,setRouteData]=useState(null),[routeLoading,setRouteLoading]=useState(false),[routeError,setRouteError]=useState('');
  const [flowCatalogue,setFlowCatalogue]=useState(null),[flowCatalogueError,setFlowCatalogueError]=useState('');
  const [useWorkspaceContext,setUseWorkspaceContext]=useState(true);
  const [provinceField,setProvinceField]=useState('auto'),[epiSource,setEpiSource]=useState('');
  const [movementDirection,setMovementDirection]=useState('outflow'),[movementField,setMovementField]=useState('');
  const [securityFrom,setSecurityFrom]=useState(''),[securityTo,setSecurityTo]=useState(''),[restoredSecurity,setRestoredSecurity]=useState(null);
  const [showSecurity,setShowSecurity]=useState(true),[showSites,setShowSites]=useState(false),[mapMode,setMapMode]=useState('indicator');
  useEffect(()=>{let live=true;storage.listPlans().then(v=>{if(live)setSaved(v);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[storage]);
  const compareGeneration=useRef(0);
  const [compareLoading,setCompareLoading]=useState(false);
  async function selectComparison(id) {
    const generation=++compareGeneration.current;
    change();setCompareId(id);setCompareSnapshot(null);setCompareLoading(!!id);
    if(!id)return;
    try{const value=await storage.loadPlan(id);if(!value)throw new Error('Comparison snapshot unavailable.');if(generation===compareGeneration.current)setCompareSnapshot(comparisonRecord(value));}
    catch(e){if(generation===compareGeneration.current){setCompareId('');setError(e.message);}}
    finally{if(generation===compareGeneration.current)setCompareLoading(false);}
  }
  useEffect(()=>{
    const guard=()=>!dirty||window.confirm('Leave outbreak response without saving the current snapshot?');
    if(leaveGuard)leaveGuard.current=guard;
    const before=e=>{if(dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',before);
    return()=>{window.removeEventListener('beforeunload',before);if(leaveGuard?.current===guard)leaveGuard.current=null;};
  },[dirty,leaveGuard]);
  const change=()=>{setDirty(true);setReviewed(false);setFactIds([]);setNotice('');};
  const boundaryFields=useMemo(()=>[...new Set(districts.flatMap(d=>Object.keys(d.properties||{})))].filter(k=>districts.every(d=>typeof d.properties?.[k]==='string'||typeof d.properties?.[k]==='number')),[districts]);
  const effectiveBoundaryField=boundaryField==='auto'?['nom','Nom','name','NAME','ADM2_EN','NAME_2','ADM1_EN','NAME_1'].find(k=>boundaryFields.includes(k))||'@name':boundaryField;
  const effectiveProvinceField=provinceField==='auto'?['province','PROVINCE','Province','ADM1_EN','NAME_1'].find(k=>boundaryFields.includes(k))||'':provinceField;
  const geography=useMemo(()=>{
    if(restoredGeometry)return {data:restoredGeometry,error:''};
    if(!districts.length)return {data:null,error:''};
    try {
      return {data:validateBoundaries({type:'FeatureCollection',features:districts.map(d=>({type:'Feature',geometry:d.geometry||d.renderGeometry,properties:{...d.properties,nom:effectiveBoundaryField==='@name'?d.name:d.properties?.[effectiveBoundaryField],province:d.properties?.[effectiveProvinceField]||''}}))}),error:''};
    }catch(e){return {data:null,error:e.message};}
  },[districts,effectiveBoundaryField,effectiveProvinceField,restoredGeometry]);
  const embedded=useMemo(()=>useWorkspaceContext?embeddedEpidemiology(geography.data,boundaryLevel):[],[geography,boundaryLevel,useWorkspaceContext]);
  const availableDatasets=useMemo(()=>[...datasets,...embedded.filter(d=>!datasets.some(source=>(source.id===d.id||source.metricId&&source.metricId===d.metricId)&&source.status==='ready'))],[datasets,embedded]);
  const selected=availableDatasets.find(d=>d.id===selectedId)||availableDatasets.find(d=>d.purpose==='cases')||availableDatasets.find(d=>d.status==='ready');
  const rows=useMemo(()=>latestPerLocation(selected?.records||[],asOf),[selected,asOf]);
  const selectedLocation=location||[...rows].sort((a,b)=>(b.value??-1)-(a.value??-1))[0]?.location||'';
  const names=useMemo(()=>new Set(geography.data?.features.map(f=>f.properties.nom)||[]),[geography]);
  const unmatched=selected?.level===boundaryLevel&&geography.data?rows.filter(r=>!names.has(r.location)):[];
  const comparisons=useMemo(()=>selected?.kind==='daily'?dailyComparison(selected.records,asOf):[],[selected,asOf]);
  const epi=useMemo(()=>epidemiology(availableDatasets,geography.data,asOf,epiSource,boundaryLevel),[availableDatasets,geography,asOf,epiSource,boundaryLevel]);
  const briefDataset=epi?.dataset||selected,briefRows=epi?.zones||rows;
  const index=useMemo(()=>spatialIndex(geography.data),[geography]);
  const disasterInput=restoredDisasters??(useWorkspaceContext?disasters:[]);
  const hazards=useMemo(()=>hazardContext(disasterInput,index,asOf),[disasterInput,index,asOf]);
  const eligibleMines=useMemo(()=>minesAtCutoff(mines,asOf),[mines,asOf]);
  const mining=useMemo(()=>geography.data?miningOverlap(mines?eligibleMines:undefined,index,asOf):null,[mines,eligibleMines,index,geography,asOf]);
  const mobilityLayers=useMemo(()=>useWorkspaceContext?describeMobility(detectMobility(geography.data,asOf),flowCatalogue):[],[geography,asOf,flowCatalogue,useWorkspaceContext]);
  const geoLayers=useMemo(()=>detectGeoIndicators(geography.data,asOf),[geography,asOf]);
  const availableDirections=[...new Set(mobilityLayers.map(l=>l.direction))];
  const direction=availableDirections.includes(movementDirection)?movementDirection:availableDirections[0]||'outflow';
  const selectedMobility=mobilityLayers.find(l=>l.id===movementField&&l.direction===direction)||mobilityLayers.find(l=>l.direction===direction);
  const securityInput=useMemo(()=>restoredSecurity??(useWorkspaceContext?acledData:[]),[restoredSecurity,useWorkspaceContext,acledData]);
  const latestSecurityDate=useMemo(()=>securityRecords(securityInput).records.filter(e=>e.date<=asOf).map(e=>e.date).sort().at(-1),[securityInput,asOf]);
  const securityEnd=securityTo||latestSecurityDate||asOf,securityStart=securityFrom||shiftDate(securityEnd,-27);
  const securityRangeError=securityStart>securityEnd||securityEnd>asOf;
  const security=useMemo(()=>securityInput.length&&!securityRangeError?securityOverlap(securityInput,index,securityStart,securityEnd):null,[securityInput,index,securityStart,securityEnd,securityRangeError]);
  const openingMessage=keyMessage({datasets:availableDatasets,epi,mining,security,mobility:routeData,asOf,override:bottomLine});
  const integrated=useMemo(()=>integratedEvidence(epi,mining,security,selectedMobility,!!geography.data&&epi?.dataset.level===boundaryLevel),[epi,mining,security,selectedMobility,geography,boundaryLevel]);
  const evidenceSource=f=>f.source||sourceLabel(availableDatasets.find(d=>d.id===f.sourceId));
  const chooseArea=n=>{change();setLocation(n);setExplorerOpen(true);};
  const mapRows=mapMode==='growth'&&epi?epi.growth.map(z=>({location:z.location,value:z.delta,date:epi.date})):mapMode==='mining'&&mining?geography.data.features.map(f=>({location:f.properties.nom,value:mining.byZone.get(f.properties.nom)||0,date:`Analysis cut-off ${asOf}`})):mapMode==='security'&&security?geography.data?.features.map(f=>({location:f.properties.nom,value:security.byZone.get(f.properties.nom)?.events||0,date:`${securityStart}–${securityEnd}`}))||[]:rows;
  const mapLabel=mapMode==='growth'&&epi?'Seven-day change in reported cumulative cases':mapMode==='mining'&&mining?'Documented mining sites':mapMode==='security'&&security?'ACLED events in loaded data':selected?.label||'Administrative boundaries';
  const mapLevel=mapMode==='growth'&&epi?epi.dataset.level:mapMode==='mining'||mapMode==='security'?boundaryLevel:selected?.level;
  const mapUnit=mapMode==='mining'?'documented sites':mapMode==='security'?'reported events':selected?.unit;
  const mapSource=mapMode==='mining'?sourceLabel(mines):mapMode==='security'?'Main-app ACLED records; uploaded boundaries':mapMode==='growth'?sourceLabel(epi?.dataset):sourceLabel(selected);
  const facts=useMemo(()=>{
    const base=[...integrated,...nationalEvidence(availableDatasets.filter(d=>d.level==='national'),asOf)];
    if(selected&&selected.origin==='upload') rows.filter(r=>r.value!==null).slice(0,10).forEach(r=>base.push({id:`${selected.id}:${r.location}:${r.date}`,sourceId:selected.id,date:r.date,value:r.value,label:selected.label,text:`${selected.label}: ${formatValue(r.value)} ${selected.unit} reported for ${r.location} (${selected.level}) on ${r.date}.`}));
    if(selected?.kind==='daily') comparisons.filter(c=>c.reported===14).slice(0,5).forEach(c=>base.push({id:`${selected.id}:comparison:${c.location}:${asOf}`,sourceId:selected.id,text:`${selected.label} for ${c.location}: ${formatValue(c.current)} ${selected.unit} in the seven days ending ${asOf}, compared with ${formatValue(c.previous)} in the preceding seven days. All 14 daily values were reported.`}));
    return base;
  },[availableDatasets,integrated,selected,rows,asOf,comparisons]);
  const highlights=factIds.length?facts.filter(f=>factIds.includes(f.id)).sort((a,b)=>factIds.indexOf(a.id)-factIds.indexOf(b.id)):(integrated.length?integrated.filter(f=>['integrated:hotspots','integrated:growth','integrated:security-overlap','integrated:mobility'].includes(f.id)).slice(0,3):facts.slice(0,3));
  const since=useMemo(()=>sinceLast({national:nationalEvidence(availableDatasets,asOf),epi,datasets:availableDatasets,actions},compareSnapshot,asOf),[availableDatasets,epi,compareSnapshot,asOf,actions]);
  const activeMines=showMines?eligibleMines:[];
  const movementOverlays={mines:eligibleMines,events:security?.records||[],showMines,showSecurity,securityPeriod:`${securityStart}–${securityEnd}`,onMines:value=>{change();setShowMines(value);},onSecurity:value=>{change();setShowSecurity(value);}};
  const hasRegisteredMobility=mobilityLayers.some(layer=>layer.id.startsWith('flowminder_short_trips.'));
  useEffect(()=>{
    if(!hasRegisteredMobility||flowCatalogue||flowCatalogueError)return;
    const controller=new AbortController();
    fetch('/api/outbreak-data?kind=mobility',{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok||!Array.isArray(data.products))throw new Error(data.error||'Source definitions unavailable.');return data;}).then(data=>{setFlowCatalogue(data);setReviewed(false);setFactIds([]);setDirty(true);}).catch(e=>{if(e.name!=='AbortError')setFlowCatalogueError(e.message);});
    return()=>controller.abort();
  },[hasRegisteredMobility,flowCatalogue,flowCatalogueError]);
  async function fetchRoutes() {
    setRouteLoading(true);setRouteError('');
    try{const response=await fetch('/api/outbreak-data?kind=relocations');const data=await response.json();if(!response.ok||!Array.isArray(data.routes))throw new Error(data.error||'Invalid mobility response');change();setRouteData(data);}catch(e){setRouteError(e.message);}finally{setRouteLoading(false);}
  }
  async function refreshConnected(connection=preset) {
    if(connection!=='drc'){setRefreshStatus('No live source connected. Choose a source in Data & uploads. Uploaded and main-app records cannot be refreshed without a source connection.');return;}
    const generation=++refreshGeneration.current;
    setRefreshing(true);setRefreshStatus('Checking connected sources…');
    const uploadedMobility=routeData&&(routeData.origin==='upload'||routeData.origin!=='public'&&!routeData.source?.startsWith('https://raw.githubusercontent.com/INRB-UMIE/'));
    const kinds=['indicators',...(!uploadedMobility?['relocations']:[]),'mobility',...(mines?.origin==='upload'?[]:['mines'])];
    const results=await Promise.allSettled(kinds.map(async kind=>{
      const response=await fetch(`/api/outbreak-data?kind=${kind}`,{signal:AbortSignal.timeout(90000)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
      if(kind==='indicators'&&(!Array.isArray(data.datasets)||!data.datasets.length)||kind==='relocations'&&!Array.isArray(data.routes)||kind==='mobility'&&!Array.isArray(data.products)||kind==='mines'&&!Array.isArray(data.data))throw new Error('Source returned an unexpected format.');
      return data;
    }));
    if(generation!==refreshGeneration.current)return;
    const failures=[];
    results.forEach((result,i)=>{
      const kind=kinds[i];
      if(result.status==='rejected'){failures.push(`${kind}: ${result.reason.message}`);return;}
      const data=result.value;
      if(kind==='indicators'){
        const failed=data.datasets.filter(d=>d.status!=='ready');
        failed.forEach(d=>failures.push(`${d.label}: ${d.error||'unavailable'}`));
        // Keep previously loaded values on failure and visibly identify them as unrefreshed.
        setDatasets(old=>mergePublicDatasets(old,data.datasets));
      }
      if(kind==='relocations')setRouteData(data);
      if(kind==='mobility')setFlowCatalogue(data);
      if(kind==='mines')setMines(old=>old?.origin==='upload'?old:data);
    });
    setLastChecked(new Date().toISOString());setRefreshing(false);change();
    setRefreshStatus(failures.length?`Some sources could not refresh. Previously loaded observations remain dated as before. ${failures.join(' · ')}`:'Connected sources checked. Latest available observations loaded; reporting dates may still be older than today.');
  }
  async function refresh(){await refreshConnected('drc');}
  const connectionKey='aidstack.outbreak.connection:'+JSON.stringify(districts.map(d=>d.id||d.name).sort());
  const registeredEpi=geoLayers.some(l=>l.id.startsWith('insp_sitrep.'));
  useEffect(()=>{
    if(autoConnection.current)return;
    let remembered='';try{remembered=localStorage.getItem(connectionKey)||'';}catch{}
    if(!registeredEpi&&remembered!=='drc')return;
    autoConnection.current='drc';setPreset('drc');refreshConnected('drc');
  },[registeredEpi,connectionKey]);
  function connectSource(value){
    refreshGeneration.current++;setRefreshing(false);autoConnection.current='manual';change();setPreset(value);
    try{localStorage.setItem(connectionKey,value);}catch{}
    if(value==='drc')refreshConnected(value);else setRefreshStatus('Using uploaded and main-app data. No live source connected.');
  }
  async function fetchMines() {
    if(mines?.origin==='upload'){setTab('Data & uploads');setNotice('Uploaded mining data is active. Upload a replacement below; public refresh does not overwrite it.');return;}
    setBusy('Loading IPIS');setError('');
    try{const r=await fetch('/api/outbreak-data?kind=mines');const d=await r.json();if(!r.ok)throw new Error(d.error);change();setMines(d);setShowMines(true);}catch(e){setError(e.message);}finally{setBusy('');}
  }
  async function organize() {
    setBusy('Selecting briefing evidence');setError('');
    try {
      const r=await fetch('/api/outbreak-briefing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({facts:facts.map(({id,text})=>({id,text}))})});
      const data=await r.json();if(!r.ok)throw new Error(data.error);selectFacts(facts,data.ids);
      setFactIds(data.ids);setDirty(true);setReviewed(false);setNotice('AI selected existing evidence sentences. No AI-written claims were added.');
    }catch(e){setError(e.message);}finally{setBusy('');}
  }
  function snapshot() {return {schemaVersion:2,includeEvidenceDates,comparison:comparisonRecord(compareSnapshot),disasters:disasterInput,includeAppendix,bottomLine,briefDirection,routeData,routeDirection,routeLimit,name,preset,asOf,datasets:availableDatasets,selectedId:selected?.id||selectedId,location:selectedLocation,boundaryField,boundaryLevel,boundarySource,geometry:geography.data,mines,showMines,actions,factIds,reviewed,flowCatalogue,useWorkspaceContext,provinceField,epiSource,movementDirection,movementField,securityFrom,securityTo,showSecurity,showSites,mapMode,securityEvents:securityInput.map(e=>({event_id:e.event_id_cnty||e.event_id||e.id,event_date:e.event_date,latitude:e.latitude,longitude:e.longitude,fatalities:e.fatalities,actor1:e.actor1,event_type:e.event_type,location:e.location,country:e.country}))};}
  async function save() {
    setBusy('Saving snapshot');setError('');
    try{const value=await storage.savePlan({id:crypto.randomUUID(),metadata:{name:`${name} — ${asOf} — ${new Date().toISOString()}`},...snapshot()},0);setRecord(value);setDirty(false);setSaved(await storage.listPlans());setNotice('Snapshot saved in this browser workspace.');}catch(e){setError(e.message);}finally{setBusy('');}
  }
  async function restore(id) {
    if(!id||dirty&&!window.confirm('Replace unsaved work with this snapshot?'))return;
    refreshGeneration.current++;autoConnection.current='snapshot';setRefreshing(false);setRefreshStatus('Saved snapshot — showing the recorded data. Refresh data to update it.');setLastChecked('');
    setBusy('Opening snapshot');setError('');
    try{const s=await storage.loadPlan(id);if(![1,2].includes(s?.schemaVersion))throw new Error('Unsupported snapshot version');
      compareGeneration.current++;setCompareLoading(false);setCompareSnapshot(s.comparison||null);setCompareId(s.comparison?.id||'');
      setIncludeEvidenceDates(s.includeEvidenceDates??false);
      setRestoredDisasters(s.disasters||[]);setIncludeAppendix(s.includeAppendix||false);setBottomLine(s.bottomLine||'');setBriefDirection(s.briefDirection||'inflow');setRouteDirection(s.routeDirection||'outflow');setRouteLimit(s.routeLimit||'10');setRouteData(s.routeData||null);setName(s.name);setPreset(s.preset);setAsOf(s.asOf);setDatasets(s.datasets);setSelectedId(s.selectedId);setLocation(s.location);setBoundaryField(s.boundaryField);setBoundaryLevel(s.boundaryLevel);setBoundarySource(s.boundarySource);setRestoredGeometry(s.geometry);setMines(s.mines);setShowMines(s.showMines);setActions(s.actions);setFactIds(s.factIds);setReviewed(s.schemaVersion===2&&s.reviewed);setFlowCatalogue(s.flowCatalogue||null);setUseWorkspaceContext(s.useWorkspaceContext??true);setProvinceField(s.provinceField||'province');setEpiSource(s.epiSource||'');setMovementDirection(s.movementDirection||'outflow');setMovementField(s.movementField||'');setSecurityFrom(s.securityFrom||'');setSecurityTo(s.securityTo||'');setRestoredSecurity(s.securityEvents||[]);setShowSecurity(s.showSecurity??true);setShowSites(s.showSites??false);setMapMode(s.mapMode||'indicator');setRecord(s);setDirty(false);setNotice('Saved snapshot opened. Sources were not refreshed.');
    }catch(e){setError(e.message);}finally{setBusy('');}
  }
  function newOutbreak() {
    if(dirty&&!window.confirm('Start another outbreak without saving current changes?'))return;
    compareGeneration.current++;setCompareLoading(false);setCompareId('');setCompareSnapshot(null);
    refreshGeneration.current++;autoConnection.current='manual';setRefreshing(false);setRefreshStatus('No live source connected.');setLastChecked('');try{localStorage.removeItem(connectionKey);}catch{}
    setIncludeEvidenceDates(false);
    setRestoredDisasters(null);setIncludeAppendix(false);setBottomLine('');setBriefDirection('inflow');setRouteData(null);setName('New outbreak');setPreset('custom');setDatasets([]);setSelectedId('');setLocation('');setAsOf(today());setActions([]);setFactIds([]);setMines(null);setShowMines(false);setRecord(null);setRestoredGeometry(null);setRestoredSecurity(null);setUseWorkspaceContext(false);setSecurityFrom('');setSecurityTo('');setEpiSource('');setMovementField('');setMapMode('indicator');change();
  }
  function briefingText() {
    const calls=[...actions.filter(a=>a.status==='Blocked').map(a=>`Unblock: ${a.action||'action'}${a.location?` (${a.location})`:''}`),...actions.filter(a=>a.status==='Proposed').map(a=>`Decision requested: ${a.action||'action'}${a.owner?` — owner ${a.owner}`:''}`)];
    return [`# ${name}`,`Status: ${reviewed?'Reviewed by user':'DRAFT — requires coordinator review'}`,`Reporting cut-off: ${asOf}. Generated: ${new Date().toISOString()}.`,
      '## Key message',openingMessage.text,openingMessage.origin,
      ...(since?.warning?['## Comparison unavailable',since.warning]:[]),
      ...(since&&since.lines.length?[`## Since last brief${since.priorAsOf?` (${since.priorName||'snapshot'}, ${since.priorAsOf})`:''}`,...since.lines.map(l=>`- ${l.label}: ${l.value}${typeof l.delta==='number'?` (${l.delta>=0?'+':''}${formatValue(l.delta)})`:''}${l.since?` — ${l.since}`:''}`)]:[]),
      '## Summary',...nationalEvidence(availableDatasets,asOf).map(f=>`${f.label}: ${formatValue(f.value)} (${f.date})`),...(epi?integrated.filter(f=>['integrated:hotspots','integrated:growth'].includes(f.id)):highlights).map(f=>`- ${f.text} [${evidenceSource(f)}]`),
      '## Response status',...responseStatus(availableDatasets,actions,asOf).pillars.map(p=>`- ${p.label}: ${p.loaded?`${p.level.toUpperCase()} — ${p.note}`:'No dated indicators loaded.'}`),
      ...(calls.length?['## Calls to action / decisions requested',...calls.map(c=>`- ${c}`)]:[]),
      '## Suggested actions',...recommendations(epi,security,mining,routeData,asOf).slice(0,3).map(s=>`- ${s.title}: ${s.action} Basis: ${s.why}`),
      ...(includeAppendix?['## Evidence appendix',...facts.map(f=>`- ${f.text} [${evidenceSource(f)}]`)]:[]),
      '## Response plan — reviewed by coordinator',...(actions.length?actions.map(a=>`- ${a.location||'Location unspecified'}: ${a.action||'Action unspecified'} | Owner: ${a.owner||'Unassigned'} | Due: ${a.due||'Unspecified'} | Resources: ${a.resources||'Unspecified'} | Status: ${a.status}${a.basis?` | Evidence at selection (${a.basis.asOf}): ${a.basis.why} | Sources: ${a.basis.sources.join('; ')}`:''}`):['No actions entered.']),
      '## Data limits','National figures remain separate from sums of reported area-level values. Reporting dates may differ. Cumulative changes may include revisions. Missing data is not zero. Geographic proximity and mining sites do not establish transmission. No spread forecast is produced.',
      '## Sources',...availableDatasets.map(d=>`- ${d.label}: ${sourceLabel(d)} | ${d.status} | retrieved ${d.fetchedAt||'not available'} | SHA-256 ${d.sha256||'not available'}${d.error?` | ${d.error}`:''} | ${d.issues?.length||0} source validation issues`),
      `- Boundaries: ${boundarySource}; join field ${effectiveBoundaryField}; level ${boundaryLevel}.`, ...(security?[`- ACLED: ${securityStart}–${securityEnd}; ${security.issues.length} validation issues; source records preserved in the evidence snapshot.`]:[]),...(mines?[`- IPIS: ${sourceLabel(mines)}; retrieved ${mines.fetchedAt}; SHA-256 ${mines.sha256}`]:[]),
      ...(includeEvidenceDates?['## Evidence dates and gaps',...evidenceReadiness(availableDatasets,asOf).map(s=>`- ${s.label}: ${s.start?`${s.start}–${s.end}`:'No observations within cut-off'} | ${s.available} reported; ${s.missing} missing; ${s.older} older than cut-off; ${s.issues} validation issues | ${s.source}${s.warning?` | ${s.warning}`:''}`)]:[])].join('\n\n');
  }
  const updateAction=(i,key,value)=>{change();setActions(actions.map((a,n)=>i===n?{...a,[key]:value}:a));};
  function selectProposal(suggestion) {
    if(proposalSelected(actions,suggestion))return;
    change();
    const sources=[...new Set([epi?.dataset&&sourceLabel(epi.dataset),security&&`Uploaded ACLED, ${security.start}–${security.end}`,mining&&mines&&sourceLabel(mines),routeData&&sourceLabel(routeData)].filter(Boolean))];
    setActions(old=>proposalSelected(old,suggestion)?old:[...old,{id:crypto.randomUUID(),proposalKey:proposalKey(suggestion),location:suggestion.areas.join(', '),owner:'',resources:'',due:'',status:'Proposed',action:`${suggestion.title}. ${suggestion.why} ${suggestion.action}`,basis:{asOf,why:suggestion.why,sources}}]);
  }
  return <section className={styles.app} aria-label="Outbreak response"><fieldset disabled={!!busy||compareLoading} className={styles.fieldset}>
    <header className={styles.header}><div><span className={styles.eyebrow}>AIDSTACK ATLAS / OPERATIONAL INTELLIGENCE</span><h2>Outbreak Response</h2><p>Snapshot, trends and response planning.</p></div><div className={styles.toolbar}><button onClick={()=>refreshConnected()} disabled={refreshing||!!busy}>{refreshing?'Refreshing data…':'Refresh data'}</button><button onClick={newOutbreak} disabled={!!busy}>New outbreak</button><button onClick={save} disabled={!!busy||refreshing||!name.trim()}>Save snapshot{dirty?' *':''}</button></div></header>
    {tab==='Situation'&&<KeyMessage message={openingMessage} asOf={asOf} reviewed={reviewed} onBriefing={()=>setTab('Briefing')} editor={<><label>Coordinator key message<textarea value={bottomLine} maxLength={800} placeholder="Leave blank to use the summary from loaded data." onChange={e=>{change();setBottomLine(e.target.value);}}/></label><p>Appears on opening and in the briefing. Review your wording after changing the reporting cut-off or refreshing data.</p>{bottomLine.trim()&&<button type="button" onClick={()=>{change();setBottomLine('');}}>Use data summary</button>}</>}/>}
    <div className={`${styles.controls} ${styles.noPrint}`}>
      <label>Outbreak / operational scope<input value={name} maxLength={180} onChange={e=>{change();setName(e.target.value);}}/></label>
      <label>Reporting cut-off<input type="date" value={asOf} onChange={e=>{if(validDate(e.target.value)){change();setAsOf(e.target.value);}}}/></label>
      <label>Saved snapshots<select value="" onChange={e=>restore(e.target.value)} disabled={!!busy}><option value="">Open saved snapshot</option>{saved.map(s=><option key={s.id} value={s.id}>{s.name||s.metadata?.name}</option>)}</select></label>
      <label>Compare with previous brief<select value={compareId} onChange={e=>selectComparison(e.target.value)}><option value="">No comparison selected</option>{saved.map(s=><option key={s.id} value={s.id}>{s.name||s.metadata?.name}</option>)}</select></label>
      {record&&<button onClick={()=>selectComparison(record.id)}>Use open snapshot as baseline</button>}
    </div>
    <BriefWorkflow datasets={availableDatasets} actions={actions} asOf={asOf} reviewed={reviewed} onTab={setTab}/>
    {compareLoading&&<p role="status">Loading comparison snapshot…</p>}
    <div className={styles.freshness} role="status"><strong>{refreshing?'Updating connected data':record&&!lastChecked?'Saved snapshot':lastChecked?'Sources checked '+new Date(lastChecked).toLocaleString():'Data freshness'}</strong><p>{refreshStatus||'Known connected sources refresh on opening. Other sources can be connected in Data & uploads.'}</p><div className={styles.freshnessDates}><span>Area cases: {epi?.date||'not available'}</span><span>Mobility: {routeData?.end||selectedMobility?.date||'not available'}</span><span>Security: {latestSecurityDate||'not available'}</span></div><small>These are observation dates, not refresh times. Main-app uploads and security records retain their original dates.</small></div>
    {asOf<today()&&<p className={styles.scope}>Historical view: observations after {asOf} are excluded. <button onClick={()=>{change();setAsOf(today());}}>Show latest reporting cut-off</button></p>}
    {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}{busy&&<p role="status">{busy}…</p>}
    <nav className={`${styles.tabs} ${styles.noPrint}`} aria-label="Outbreak sections">{['Situation','Data & uploads','Response & decisions','Briefing'].map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</nav>
    {tab==='Situation'&&<>
      <BriefChanges since={since}/>
      <Overview datasets={availableDatasets} epi={epi} security={security} mining={mining} asOf={asOf} routeData={routeData} actions={actions} selectedArea={selectedLocation} onSelect={n=>{chooseArea(n);requestAnimationFrame(()=>explorerElement.current?.scrollIntoView({behavior:'smooth',block:'start'}));}} onDecision={selectProposal}/>
      <Routes overlays={movementOverlays} showFocus={false} direction={routeDirection} onDirection={d=>{change();setRouteDirection(d);}} limit={routeLimit} onLimit={v=>{change();setRouteLimit(v);}} data={routeData} onLoad={fetchRoutes} loading={routeLoading} error={routeError} epi={epi} security={security} geometry={geography.data} boundaryLevel={boundaryLevel} asOf={asOf} selected={selectedLocation} onSelect={chooseArea}/>
      <EvidenceReadiness datasets={availableDatasets} asOf={asOf}/>
      <ResponseStatus datasets={availableDatasets} actions={actions} asOf={asOf} onData={()=>{setTab('Data & uploads');requestAnimationFrame(()=>document.getElementById('outbreak-uploads')?.scrollIntoView({behavior:'smooth'}));}}/>
      <details className={styles.panel}><summary>Data coverage — loaded sources and missing inputs</summary><DataAvailability datasets={availableDatasets} geometry={geography.data} mines={mines} securityCount={securityInput.length} disasterCount={disasterInput.length} routeData={routeData} facilities={facilities} onData={()=>{setTab('Data & uploads');requestAnimationFrame(()=>document.getElementById('outbreak-uploads')?.scrollIntoView({behavior:'smooth'}));}} onWorkspace={onOpenWorkspace} onMines={fetchMines} loading={!!busy||refreshing}/></details>
      <details ref={explorerElement} open={explorerOpen||!epi} onToggle={e=>{if(epi)setExplorerOpen(e.currentTarget.open);}} className={styles.panel}><summary>Explore an area{location?` — ${location}`:''}</summary>
      <p>Choose an area to inspect its trend, movement connections and map.</p>
      <div className={styles.controls}><label>Explore an indicator<select value={selected?.id||''} onChange={e=>{change();setSelectedId(e.target.value);setLocation('');}}><option value="">Choose dataset</option>{availableDatasets.filter(d=>d.status==='ready').map(d=><option key={d.id} value={d.id}>{d.label} · {d.level} · {d.origin==='upload'?d.file:d.origin==='boundary'?'GeoJSON':'Source preset'}</option>)}</select></label><label>Explore a location<select value={selectedLocation} onChange={e=>{change();setLocation(e.target.value);}}>{location&&!rows.some(r=>r.location===location)&&<option value={location}>{location} — no observations</option>}{rows.map(r=><option key={r.location}>{r.location}</option>)}</select></label></div>
      {selected&&<><p>{selected.issues?.length?`${selected.issues.length} source validation issues; affected numeric cells are missing. See Data & uploads. `:''}{selected.kind} · {selected.unit} · <a href={selected.url||undefined} target="_blank" rel="noreferrer">{sourceLabel(selected)}</a></p><TrendChart records={selected.records} location={selectedLocation} label={selected.label} unit={selected.unit} kind={selected.kind} asOf={asOf} source={sourceLabel(selected)}/></>}
      <div className={styles.panel}><h3>Geographic evidence</h3>
        <details><summary>Map settings</summary><div className={styles.controls}><label>Main-app boundary name field<select value={boundaryField} onChange={e=>{change();setRestoredGeometry(null);setBoundarySource('Main app uploaded boundaries');setBoundaryField(e.target.value);}}><option value="auto">Auto-detected: {effectiveBoundaryField}</option><option value="@name">Main-app area name</option><option value="nom">nom</option>{boundaryFields.filter(k=>k!=='nom').map(k=><option key={k}>{k}</option>)}</select></label><label>Grouping / province field<select aria-label="Grouping / province field" value={provinceField} onChange={e=>{change();setProvinceField(e.target.value);setRestoredGeometry(null);}}><option value="auto">Auto-detected: {effectiveProvinceField||'none'}</option><option value="">No grouping</option><option value="province">province</option>{boundaryFields.filter(k=>k!=='province').map(k=><option key={k}>{k}</option>)}</select></label><label>Boundary geographic level<select value={boundaryLevel} onChange={e=>{change();setBoundaryLevel(e.target.value);}}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select></label></div></details>
        {restoredGeometry&&<p>Using the boundary snapshot saved with this briefing. <button onClick={()=>{change();setRestoredGeometry(null);setBoundarySource('Main app uploaded boundaries');}}>Use current main-app boundaries</button></p>}
        {geography.error&&<p role="alert">Map unavailable: {geography.error}. Choose the field containing unique dataset location names. Analysis remains available.</p>}
        {unmatched.length>0&&<p role="status">{unmatched.length} unmatched locations (not mapped): {unmatched.slice(0,20).map(r=>r.location).join(', ')}{unmatched.length>20?'…':''}</p>}
        <div className={styles.controls}>{hazards.events.length>0&&<label><input type="checkbox" checked={showHazards} onChange={e=>setShowHazards(e.target.checked)}/>Show recent GDACS alert centres</label>}<label>Map measure<select aria-label="Map measure" value={mapMode} onChange={e=>{change();setMapMode(e.target.value);}}><option value="indicator">Selected reported indicator</option><option value="growth" disabled={!epi}>Seven-day cumulative change</option><option value="mining" disabled={!mining}>Documented mining sites</option><option value="security" disabled={!security}>Security events</option></select></label>{security&&<label><input type="checkbox" checked={showSecurity} onChange={e=>{change();setShowSecurity(e.target.checked);}}/>Show security event locations</label>}{facilities.length>0&&<label><input type="checkbox" checked={showSites} onChange={e=>{change();setShowSites(e.target.checked);}}/>Show uploaded site locations (capacity unverified)</label>}</div>
        <OutbreakMap geometry={geography.data} rows={mapRows} level={mapLevel} kind={mapMode==='indicator'?selected?.kind:'derived indicator'} unit={mapUnit} boundaryLevel={boundaryLevel} mines={activeMines} selected={selectedLocation} onSelect={n=>{change();setLocation(n);}} label={mapLabel} asOf={asOf} source={mapSource} hazards={showHazards?hazards.events:[]} events={showSecurity?security?.records||[]:[]} sites={showSites?facilities:[]} focusNames={mapRows.filter(r=>r.value>0).sort((a,b)=>b.value-a.value).slice(0,12).map(r=>r.location)}/>
        {<p><button disabled={!!busy} onClick={fetchMines}>{mines?.origin==='upload'?'Manage uploaded':mines?'Refresh':'Load'} IPIS mining sites</button>{mines&&<label><input type="checkbox" checked={showMines} onChange={e=>{change();setShowMines(e.target.checked);}}/>Show {eligibleMines.length.toLocaleString()} documented mines (within map extent)</label>}</p>}
        {mines&&<p>IPIS points use the latest visit per mine code; historical site observations do not establish present activity or infection. {mines.url?<a href={mines.url} target="_blank" rel="noreferrer">Source CSV</a>:<span>Source: {mines.file||mines.source} · worksheet {mines.sheet||'CSV'}</span>}</p>}
      </div>
      {selected&&<div className={styles.tableWrap}><table><caption>Latest observations on or before {asOf}; no cross-location totals</caption><thead><tr><th>Location</th><th>Reported date</th><th>{selected.label} ({selected.unit})</th></tr></thead><tbody>{rows.map(r=><tr key={r.location}><td>{r.location}</td><td>{r.date}</td><td>{r.value===null?'Not reported':formatValue(r.value)}</td></tr>)}</tbody></table></div>}
      {comparisons.length>0&&<div className={styles.tableWrap}><table><caption>Comparable seven-day periods ending {asOf}. Both totals shown only when all 14 dates are reported.</caption><thead><tr><th>Location</th><th>Days reported / 14</th><th>Recent 7 days</th><th>Previous 7 days</th></tr></thead><tbody>{comparisons.map(c=><tr key={c.location}><td>{c.location}</td><td>{c.reported}/14</td><td>{c.current??'Incomplete'}</td><td>{c.previous??'Incomplete'}</td></tr>)}</tbody></table></div>}
      <details><summary>Additional comparisons and mobility indicators</summary>
      <IntegratedCharts epi={epi} mining={mining} security={security} geometry={geography.data} boundaryLevel={boundaryLevel} asOf={asOf} onSelect={chooseArea}/>
      <MobilityPanel overlays={movementOverlays} layers={mobilityLayers} selected={selectedMobility} direction={direction} onDirection={d=>{change();setMovementDirection(d);setMovementField('');}} onLayer={id=>{change();setMovementField(id);}} geometry={geography.data} boundaryLevel={boundaryLevel} asOf={asOf} onSelect={chooseArea}/>
      </details></details>
    </>}
    {tab==='Data & uploads'&&<>
      <DataAvailability datasets={availableDatasets} geometry={geography.data} mines={mines} securityCount={securityInput.length} disasterCount={disasterInput.length} routeData={routeData} facilities={facilities} onData={()=>{setTab('Data & uploads');requestAnimationFrame(()=>document.getElementById('outbreak-uploads')?.scrollIntoView({behavior:'smooth'}));}} onWorkspace={onOpenWorkspace} onMines={fetchMines} loading={!!busy||refreshing}/>
      <div className={styles.panel}><h3>Sources and freshness</h3><label><input type="checkbox" checked={useWorkspaceContext} onChange={e=>{change();setUseWorkspaceContext(e.target.checked);setRestoredSecurity(null);setRestoredDisasters(null);}}/>Use current main-app contextual indicators and security data for this outbreak</label><label>Optional public source preset<select aria-label="Optional public source preset" value={preset} onChange={e=>connectSource(e.target.value)}><option value="custom">Uploaded / workspace data</option><option value="drc">DRC BDBV2026 — INSP public feeds</option></select></label><p>Connected sources refresh automatically when this app opens. Refresh data checks them again. Saved snapshots open at their recorded dates until you refresh. Uploads have no live connection and keep their original observations.</p>{preset==='drc'&&<button disabled={!!busy} onClick={refresh}>Refresh DRC daily feeds</button>}
        <p>{districts.length} administrative records and {facilities.length} site records are available from the main app. Boundary names are mapped in Situation. Site records are not automatically treated as response capacity.</p>
        {availableDatasets.map(d=><article className={styles.source} key={d.id}>{d.refreshError&&<p role="alert">Refresh failed: {d.refreshError}. Showing previously loaded observations.</p>}{d.origin==='upload'&&<label>Dataset category for {d.label}<select value={d.category||'other'} onChange={e=>{change();setDatasets(old=>old.map(item=>item.id===d.id?{...item,category:e.target.value}:item));}}>{[['other','Other / unclassified'],['sdb','Safe and dignified burial'],['rcce','Community engagement / RCCE'],['logistics','Logistics and supplies'],['response','Response presence and capacity']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}<h4>{d.label} <small>{d.level} / {d.kind}</small></h4><p>{d.status==='ready'?`${d.records.length} observations · ${d.records.filter(r=>r.value===null).length} missing · ${revisionCount(d.records)} downward cumulative revisions · ${d.issues?.length||0} source validation issues`:d.error}</p><p>{d.url?<a href={d.url} target="_blank" rel="noreferrer">Source CSV</a>:d.source} · Retrieved {d.fetchedAt||'not available'}</p>{d.status==='ready'&&<p>Reporting dates: {[...d.records].map(r=>r.date).sort()[0]} to {[...d.records].map(r=>r.date).sort().at(-1)}</p>}<details><summary>Provenance and validation log</summary>{d.issues?.length>0&&<div className={styles.tableWrap}><table><thead><tr><th>Source row</th><th>Location / date</th><th>Original value</th><th>Issue</th></tr></thead><tbody>{d.issues.map((issue,i)=><tr key={i}><td>{issue.row}</td><td>{issue.location} / {issue.date}</td><td>{issue.raw}</td><td>{issue.message}</td></tr>)}</tbody></table></div>}<p>SHA-256: {d.sha256||'unavailable'}</p>{d.mapping&&<pre>{JSON.stringify(d.mapping,null,2)}</pre>}</details><button disabled={d.origin==='boundary'} onClick={()=>{change();setDatasets(datasets.filter(v=>v.id!==d.id));if(selectedId===d.id)setSelectedId('');}}>Remove dataset</button></article>)}
      </div>
      <div className={styles.panel}><h3>Concurrent hazards (GDACS)</h3><p>Recent means alerts published in the 28 days ending {asOf}. A centre inside a boundary does not describe the full affected footprint. {hazards.excluded} records excluded by date, identifier or spatial match.</p>{hazards.events.map(h=><p key={h.id}><strong>{h.location}</strong> · {h.title} · published {h.date} {h.source&&<a href={h.source}>GDACS report</a>}</p>)}</div>
      <div className={styles.panel}><h3>Security analysis from the main app</h3><p>{securityInput.length} ACLED records available. The default window ends at the latest valid event on or before the briefing cut-off and spans 28 days. This does not establish reporting completeness.</p><div className={styles.controls}><label>Security window start<input type="date" value={securityStart} onChange={e=>{if(validDate(e.target.value)){change();setSecurityFrom(e.target.value);}}}/></label><label>Security window end<input type="date" value={securityEnd} onChange={e=>{if(validDate(e.target.value)){change();setSecurityTo(e.target.value);}}}/></label><button onClick={()=>{change();setSecurityFrom('');setSecurityTo('');}}>Use latest recorded event window</button></div>{securityRangeError&&<p role="alert">Security dates must be ordered and must not extend beyond the briefing cut-off.</p>}{restoredSecurity&&<button onClick={()=>{change();setRestoredSecurity(null);}}>Use current main-app security records</button>}{security?.issues.length>0&&<details><summary>{security.issues.length} security validation issues</summary><ul>{security.issues.map((e,i)=><li key={i}>{e.id||`Row ${e.row}`}: {e.message}</li>)}</ul></details>}</div>
      {mobilityLayers.length>0&&<div className={styles.panel}><h3>Available Flowminder products</h3>{flowCatalogueError&&<p role="status">{flowCatalogueError} Values retain source units until definitions can be verified. <button onClick={()=>setFlowCatalogueError('')}>Retry source definitions</button></p>}{!flowCatalogue&&!flowCatalogueError&&<p>Loading source definitions…</p>}{flowCatalogue&&<><p>Definitions retrieved {flowCatalogue.fetchedAt}. GeoJSON destination indicators are separate from relocation matrices.</p><table><thead><tr><th>Available product</th><th>Format</th><th>Units</th><th>Source</th></tr></thead><tbody>{flowCatalogue.products.filter(p=>p.type==='vector'||p.product==='relocations').map(p=><tr key={p.id}><td>{p.metric}</td><td>{p.inGeoJSON?'Embedded vector':'Separate matrix — load in district connections'}</td><td>{p.unit}</td><td>{p.url&&<a href={p.url} target="_blank" rel="noreferrer">Data file</a>} · <a href={p.documentation} target="_blank" rel="noreferrer">Definitions</a></td></tr>)}</tbody></table></>}</div>}
      <div className={styles.panel}><GeoImport layers={geoLayers} level={boundaryLevel} onImport={d=>{change();setDatasets(old=>[...old,d]);setSelectedId(d.id);if(d.purpose==='cases')setEpiSource(d.id);setNotice('GeoJSON indicator mapped. Insights are available in Situation.');}}/></div>
      <MineUpload current={mines} asOf={asOf} index={index} onImport={d=>{refreshGeneration.current++;setRefreshing(false);setRefreshStatus('Uploaded data selected. Public refresh preserves uploaded sources.');change();setMines(d);setShowMines(true);setNotice('Uploaded mining data is active across maps and briefing. Public refresh will preserve it.');}}/>
      <RouteUpload current={routeData} onImport={d=>{refreshGeneration.current++;setRefreshing(false);setRefreshStatus('Uploaded data selected. Public refresh preserves uploaded sources.');change();setRouteData(d);setNotice("Mobility routes imported. Open Situation to explore district connections.");}}/>
      <div id="outbreak-uploads" className={styles.panel}><Upload datasets={availableDatasets} onImport={(d,replacedId)=>{refreshGeneration.current++;setRefreshing(false);setRefreshStatus('Uploaded data selected. Public refresh preserves uploaded sources.');change();setDatasets(old=>[d,...old.filter(item=>item.id!==d.id)]);setSelectedId(d.id);if(d.purpose==='cases'&&d.kind==='cumulative'&&d.level!=='national')setEpiSource(d.id);else if(epiSource===replacedId)setEpiSource('');setLocation('');setNotice(replacedId?'Dataset replaced. Maps, summaries and briefing now use the replacement.':'Dataset imported. Open Situation to review its chart and observations.');}}/><button onClick={()=>download('sdb-template.csv','health_zone,date,requests,completed\nExample zone,2026-09-01,12,10\nExample zone,2026-09-02,8,8\n','text/csv')}>Download example SDB template</button><p>Template rows are illustrative. Replace them before importing. Requests and completions are separate indicators; their difference is not automatically a backlog.</p></div>
    </>}
    {tab==='Response & decisions'&&<>
      <div className={styles.panel}><h3>Response presence and capacity</h3><p>Import dated presence, capacity and delivery indicators in Data & uploads. Response categories and locations come from those datasets; no province or service footprint is pre-populated.</p></div>
      <div className={styles.panel}><h3>Response plan</h3><p>Coordinator-entered proposals, separate from reported evidence. Include the evidence or operational reason in each action.</p>
        <p>{actionFollowUp(actions,asOf).overdue} actions overdue at the reporting cut-off. Assign owners and dates before approving actions.</p>
        {actions.filter(a=>a.basis).map(a=><details key={a.id}><summary>Evidence at selection — {a.location}</summary><p>{a.basis.why}</p><p>Cut-off {a.basis.asOf}. Sources: {a.basis.sources.join('; ')}. This evidence is preserved when the action is edited; recheck it after refreshing data.</p></details>)}
        {actions.map((a,i)=><div className={styles.action} key={a.id}><div className={styles.controls}>{[['location','Location'],['owner','Owner'],['resources','Resources / funding']].map(([k,l])=><label key={k}>{l}<input value={a[k]} maxLength={200} onChange={e=>updateAction(i,k,e.target.value)}/></label>)}<label>Due date<input type="date" value={a.due} onChange={e=>updateAction(i,'due',e.target.value)}/></label><label>Status<select value={a.status} onChange={e=>updateAction(i,'status',e.target.value)}>{['Proposed','Approved','In progress','Completed','Blocked'].map(v=><option key={v}>{v}</option>)}</select></label></div><label>Action, rationale and decision requested<textarea value={a.action} maxLength={2000} onChange={e=>updateAction(i,'action',e.target.value)}/></label><button onClick={()=>{change();setActions(actions.filter((_,n)=>n!==i));}}>Remove action</button></div>)}
        <button onClick={()=>{change();setActions([...actions,{id:crypto.randomUUID(),location:'',owner:'',resources:'',due:'',status:'Proposed',action:''}]);}}>Add decision / action</button>
      </div>
    </>}
    {tab==='Briefing'&&<div className={styles.brief} ref={briefElement}>
      <div className={`${styles.toolbar} ${styles.noPrint}`}><button disabled={!!busy||!facts.length||facts.length>40} onClick={organize}>Use AI to select leadership messages</button><button onClick={()=>download('outbreak-briefing.md',briefingText(),'text/markdown')}>Export briefing Markdown</button><button onClick={()=>download('outbreak-evidence.json',JSON.stringify(snapshot(),null,2),'application/json')}>Export evidence JSON</button><button onClick={()=>download('outbreak-briefing.html',briefingHTML(briefElement.current,styles.noPrint),'text/html')}>Export briefing HTML with visuals</button><button onClick={()=>printBriefing(briefingHTML(briefElement.current,styles.noPrint))}>Print / save PDF</button></div>
      <p className={styles.noPrint}>AI receives only the evidence sentences below, including any selected uploaded indicator. It selects up to three sentences; it cannot add prose or numbers. Review emphasis and source suitability before sharing.</p>
      <h2>{name}</h2><p><strong>{reviewed?'Reviewed by user':'DRAFT — requires coordinator review'}</strong> · Reporting cut-off {asOf}</p>
      <label className={styles.noPrint}>Bottom line for decision-makers (your judgement — not AI-generated)<textarea value={bottomLine} maxLength={800} placeholder="One or two sentences: the trajectory and what you need from leadership." onChange={e=>{change();setBottomLine(e.target.value);}}/></label>
      <KeyMessage message={openingMessage} asOf={asOf} reviewed={reviewed}/>
      {routeData&&<><h3>Movement connections</h3><div className={`${styles.controls} ${styles.noPrint}`}><label>Mobility view<select value={briefDirection} onChange={e=>{change();setBriefDirection(e.target.value);}}><option value="inflow">Inflow — origins arriving in the focus area (receiving readiness)</option><option value="outflow">Outflow — destinations from the focus area</option></select></label></div><Routes overlays={movementOverlays} showFocus={false} direction={briefDirection} data={routeData} epi={epi} security={security} geometry={geography.data} boundaryLevel={boundaryLevel} asOf={asOf} selected={selectedLocation} onSelect={chooseArea} onDirection={d=>{change();setBriefDirection(d);}} briefing/></>}
      <BriefChanges since={since}/>
      <BriefSummary actions={actions} epi={epi} datasets={availableDatasets} security={security} mining={mining} routeData={routeData} hazards={hazards} asOf={asOf} highlights={highlights} sourceFor={evidenceSource}/>
      <ResponseStatus datasets={availableDatasets} actions={actions} asOf={asOf} briefing/>
      {(() => {const calls=[...actions.filter(a=>a.status==='Blocked').map(a=>`Unblock: ${a.action||'action'}${a.location?` (${a.location})`:''}`),...actions.filter(a=>a.status==='Proposed').map(a=>`Decision requested: ${a.action||'action'}${a.owner?` — owner ${a.owner}`:''}`)];return calls.length?<div className={styles.panel}><h3>Calls to action / decisions requested</h3><ol className={styles.callsList}>{calls.map((c,i)=><li key={i}>{c}</li>)}</ol></div>:null;})()}
      <h3>Response plan</h3>{!actions.length?<p>No actions entered.</p>:<table><thead><tr><th>Location / action</th><th>Owner / due</th><th>Resources / status</th></tr></thead><tbody>{actions.map(a=><tr key={a.id}><td>{a.location||'Unspecified'}<p>{a.action||'Unspecified'}</p></td><td>{a.owner||'Unassigned'}<p>{a.due||'No deadline'}</p></td><td>{a.resources||'Unspecified'}<p>{a.status}</p></td></tr>)}</tbody></table>}
      {actions.filter(a=>a.basis).map(a=><p key={a.id}><strong>Action evidence — {a.location}:</strong> {a.basis.why}<small>Selected at cut-off {a.basis.asOf} · {a.basis.sources.join('; ')}</small></p>)}
      <h3>Geographic overview</h3>
      {briefDataset?<OutbreakMap geometry={geography.data} rows={briefRows} level={briefDataset.level} kind={briefDataset.kind} unit={briefDataset.unit} boundaryLevel={boundaryLevel} mines={activeMines} events={security?.records||[]} hazards={hazards.events} selected={selectedLocation} onSelect={chooseArea} label={briefDataset.label} asOf={asOf} source={sourceLabel(briefDataset)} focusNames={epi?.burden.slice(0,8).map(z=>z.location)||[]}/>:!routeData?<p>Load area-level data and boundaries to show a map.</p>:null}
      <label className={styles.noPrint}><input type="checkbox" checked={includeAppendix} onChange={e=>{setIncludeAppendix(e.target.checked);change();}}/>Include detailed evidence and extra maps in this briefing and exports</label>
      {includeAppendix&&<section aria-label="Evidence appendix"><h3>Evidence appendix</h3>
      {[['Epidemiological situation',f=>f.sourceId!=='acled'&&f.sourceId!=='ipis'&&f.sourceId!=='flowminder'],['Population mobility',f=>f.sourceId==='flowminder'],['Mining and operational geography',f=>f.sourceId==='ipis'],['Security and access considerations',f=>f.sourceId==='acled']].map(([title,predicate])=><section key={title}><h3>{title}</h3>{facts.filter(predicate).length?facts.filter(predicate).map(f=><p key={f.id}>{f.text}<small>Source: {evidenceSource(f)}</small></p>):<p>No validated evidence available for this section in the loaded scope.</p>}</section>)}
      <Routes overlays={movementOverlays} showFocus={false} direction={routeDirection} onDirection={d=>{change();setRouteDirection(d);}} limit={routeLimit} onLimit={v=>{change();setRouteLimit(v);}} data={routeData} onLoad={fetchRoutes} loading={routeLoading} error={routeError} epi={epi} security={security} geometry={geography.data} boundaryLevel={boundaryLevel} asOf={asOf} selected={selectedLocation} onSelect={chooseArea} briefing/>
      <IntegratedCharts epi={epi} mining={mining} security={security} geometry={geography.data} boundaryLevel={boundaryLevel} asOf={asOf} briefing/>
      <MobilityPanel overlays={movementOverlays} layers={mobilityLayers} selected={selectedMobility} direction={direction} geometry={geography.data} boundaryLevel={boundaryLevel} asOf={asOf} briefing/>
      {selected&&<><TrendChart records={selected.records} location={selectedLocation} label={selected.label} unit={selected.unit} kind={selected.kind} asOf={asOf} source={sourceLabel(selected)}/><OutbreakMap geometry={geography.data} rows={rows} level={selected.level} kind={selected.kind} unit={selected.unit} boundaryLevel={boundaryLevel} mines={activeMines} selected={selectedLocation} onSelect={()=>{}} label={selected.label} asOf={asOf} source={sourceLabel(selected)}/></>}
      </section>}

      {includeAppendix&&<><h3>Evidence limits</h3><p>National figures remain separate from sums of reported area-level values. Reporting dates can differ. Cumulative changes may include revisions; missing data is not zero. Mining sites and movement connections do not establish transmission. No spread forecast or inferred response capacity is produced.</p></>}
      <details data-source-register="true"><summary>Sources and data quality</summary>{security&&<p>ACLED: main-app uploaded records · window {securityStart}–{securityEnd} · {security.issues.length} validation issues · reported fatality estimates are not independently verified.</p>}{availableDatasets.map(d=><p key={d.id}>{d.label}: {d.url?<a href={d.url}>Source</a>:d.source} · {d.status} · retrieved {d.fetchedAt||'unavailable'}{d.error?` · ${d.error}`:''} · {d.issues?.length||0} source validation issues</p>)}<p>Boundaries: {boundarySource} · join field {effectiveBoundaryField} · {boundaryLevel}{geography.error?` · unavailable: ${geography.error}`:''}. {epi?epi.unmatched:unmatched.length} unmatched indicator locations.</p>{mines&&<p>IPIS: {sourceLabel(mines)} · retrieved {mines.fetchedAt}. Visit dates are retained per point.</p>}</details>
      <label className={styles.noPrint}><input type="checkbox" checked={includeEvidenceDates} onChange={e=>{change();setIncludeEvidenceDates(e.target.checked);}}/>Include evidence dates and gaps in the exported report</label>
      <details className={includeEvidenceDates?styles.panel:`${styles.panel} ${styles.noPrint}`} data-source-register={includeEvidenceDates||undefined}><summary>Evidence dates and gaps</summary><EvidenceReadiness datasets={availableDatasets} asOf={asOf}/></details>
      <label className={styles.noPrint}><input type="checkbox" checked={reviewed} onChange={e=>{setReviewed(e.target.checked);setDirty(true);}}/>I have reviewed this snapshot and its evidence for sharing.</label>
    </div>}
  </fieldset></section>;
}
