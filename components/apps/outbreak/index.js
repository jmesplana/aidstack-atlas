import { useEffect, useMemo, useRef, useState } from 'react';
import { latestPerLocation, nationalEvidence, revisionCount, dailyComparison, validateBoundaries, selectFacts, LEVELS, validDate, formatValue } from '../../../lib/outbreak/data';
import Upload from './Upload';
import DataWorkspace from './DataWorkspace';
import ReportMetadataEditor from './ReportMetadataEditor';
import RcceUpload, { RcceReports } from './RcceUpload';
import DocumentAnalysis from './DocumentAnalysis';
import DocumentEvidence, { FindingCards } from './DocumentEvidence';
import { AI_DOCUMENT_DISCLAIMER, documentFindings, filterDocumentFindings, mappedDocumentFindings } from '../../../lib/outbreak/documentInsights';
import { rcceAtCutoff } from '../../../lib/outbreak/documents';
import MineUpload from './MineUpload';
import {minesAtCutoff,mergePublicDatasets} from '../../../lib/outbreak/imports';
import GeoImport from './GeoImport';
import Overview from './Overview';
import Dashboard from './Dashboard';
import Sitrep from './Sitrep';
import SitrepWorkspace from './SitrepWorkspace';
import useOutbreakDraft, { DRAFT_ID } from './useOutbreakDraft';
import DataAvailability from './DataAvailability';
import {recommendations,proposalKey,proposalSelected} from '../../../lib/outbreak/overview';
import {hazardContext} from '../../../lib/outbreak/context';
import Routes, { RouteUpload } from './Routes';
import { IntegratedCharts, MobilityPanel } from './Integrated';
import { embeddedEpidemiology, detectGeoIndicators, detectMobility, describeMobility, spatialIndex, miningOverlap, securityRecords, securityOverlap, epidemiology, integratedEvidence, shiftDate } from '../../../lib/outbreak/insights';
import { OutbreakMap, TrendChart, download } from './Visuals';
import ResponseStatus from './ResponseStatus';
import { BriefChanges, EvidenceReadiness } from './BriefWorkflow';
import { comparisonRecord, actionFollowUp } from '../../../lib/outbreak/briefing';
import KeyMessage from './KeyMessage';
import { keyMessage } from '../../../lib/outbreak/keyMessage';
import { sinceLast } from '../../../lib/outbreak/response';
import styles from './outbreak.module.css';

const today=()=>new Date().toISOString().slice(0,10);
const INITIAL_NAME='Outbreak operation';
const sourceLabel=d=>d?.url||d?.source||'Unknown';

export default function Outbreak({ storage, districts=[], facilities=[], acledData=[], disasters=[], onOpenWorkspace, leaveGuard }) {
  const briefElement=useRef(null),explorerElement=useRef(null),refreshGeneration=useRef(0),autoConnection=useRef('');
  const [dashboardProvince,setDashboardProvince]=useState('');
  const [lastSuccessfulCheck,setLastSuccessfulCheck]=useState('');
  const [refreshMinutes,setRefreshMinutes]=useState(15),[liveDashboard,setLiveDashboard]=useState(true);
  const refreshLock=useRef(false),refreshLatest=useRef(null);
  const [includeEvidenceDates,setIncludeEvidenceDates]=useState(false);
  const [reportOptions,setReportOptions]=useState({notes:{},mobilityAreas:[]});
  const appElement=useRef(null), draftSaved=useRef(false);
  function goTab(value){setTab(value);requestAnimationFrame(()=>appElement.current?.scrollTo({top:0}));}
  const [includeAppendix,setIncludeAppendix]=useState(false),[restoredDisasters,setRestoredDisasters]=useState(null),[showHazards,setShowHazards]=useState(true);
  const [explorerOpen,setExplorerOpen]=useState(false),[refreshing,setRefreshing]=useState(false),[refreshStatus,setRefreshStatus]=useState(''),[lastChecked,setLastChecked]=useState('');
  const [name,setName]=useState(INITIAL_NAME),[preset,setPreset]=useState('custom'),[bottomLine,setBottomLine]=useState('');
  const [rcceDocuments,setRcceDocuments]=useState([]);
  const [dataView,setDataView]=useState('reports');
  const [intakeVersion,setIntakeVersion]=useState(0);
  function openData(view='reports'){setDataView(view);goTab('Data');}
  const [documentFilter,setDocumentFilter]=useState({kind:'',theme:'',from:'',measure:''});
  const [datasets,setDatasets]=useState([]),[selectedId,setSelectedId]=useState(''),[location,setLocation]=useState('');
  const [asOf,setAsOf]=useState(today()),[tab,setTab]=useState('Dashboard'),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const eligibleRcce=useMemo(()=>rcceAtCutoff(rcceDocuments,asOf),[rcceDocuments,asOf]);
  const [boundaryField,setBoundaryField]=useState('auto'),[boundaryLevel,setBoundaryLevel]=useState('health_zone');
  const [mines,setMines]=useState(null),[showMines,setShowMines]=useState(false);
  const [actions,setActions]=useState([]),[factIds,setFactIds]=useState([]),[reviewed,setReviewed]=useState(false);
  const [saved,setSaved]=useState([]),[record,setRecord]=useState(null),[dirty,setDirty]=useState(false);
  const [compareId,setCompareId]=useState(''),[compareSnapshot,setCompareSnapshot]=useState(null),[briefDirection,setBriefDirection]=useState('outflow');
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
  useEffect(()=>{let live=true;storage.listPlans().then(v=>{if(live)setSaved(v.filter(s=>s.id!==DRAFT_ID));}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[storage]);
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
    const guard=()=>!dirty||draftSaved.current||window.confirm('Leave outbreak response without saving the current snapshot?');
    if(leaveGuard)leaveGuard.current=guard;
    const before=e=>{if(dirty&&!draftSaved.current){e.preventDefault();e.returnValue='';}};
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
  const allDocumentFindings=useMemo(()=>documentFindings(rcceDocuments),[rcceDocuments]);
  const datedDocumentFindings=useMemo(()=>filterDocumentFindings(allDocumentFindings,{asOf}),[allDocumentFindings,asOf]);
  const filteredDocumentFindings=useMemo(()=>filterDocumentFindings(allDocumentFindings,{asOf,...documentFilter}),[allDocumentFindings,asOf,documentFilter]);
  const mappedFindings=useMemo(()=>mappedDocumentFindings(filteredDocumentFindings,geography.data,boundaryLevel),[filteredDocumentFindings,geography,boundaryLevel]);
  const embedded=useMemo(()=>useWorkspaceContext?embeddedEpidemiology(geography.data,boundaryLevel):[],[geography,boundaryLevel,useWorkspaceContext]);
  const availableDatasets=useMemo(()=>[...datasets,...embedded.filter(d=>!datasets.some(source=>(source.id===d.id||source.metricId&&source.metricId===d.metricId)&&source.status==='ready'))],[datasets,embedded]);
  const selected=availableDatasets.find(d=>d.id===selectedId)||availableDatasets.find(d=>d.purpose==='cases')||availableDatasets.find(d=>d.status==='ready');
  const rows=useMemo(()=>latestPerLocation(selected?.records||[],asOf),[selected,asOf]);
  const selectedLocation=location||[...rows].sort((a,b)=>(b.value??-1)-(a.value??-1))[0]?.location||'';
  const names=useMemo(()=>new Set(geography.data?.features.map(f=>f.properties.nom)||[]),[geography]);
  const unmatched=selected?.level===boundaryLevel&&geography.data?rows.filter(r=>!names.has(r.location)):[];
  const comparisons=useMemo(()=>selected?.kind==='daily'?dailyComparison(selected.records,asOf):[],[selected,asOf]);
  const epi=useMemo(()=>epidemiology(availableDatasets,geography.data,asOf,epiSource,boundaryLevel),[availableDatasets,geography,asOf,epiSource,boundaryLevel]);
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
  const mapLabel=mapMode==='growth'&&epi?`${epi.comparisonDays || 7}-day change in reported cumulative cases (${epi.baseline}–${epi.date})`:mapMode==='mining'&&mining?'Documented mining sites':mapMode==='security'&&security?'ACLED events in loaded data':selected?.label||'Administrative boundaries';
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
  const movementOverlays={documentSignals:mappedFindings,mines:eligibleMines,events:security?.records||[],showMines,showSecurity,securityPeriod:`${securityStart}–${securityEnd}`,onMines:value=>{change();setShowMines(value);},onSecurity:value=>{change();setShowSecurity(value);}};
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
  async function refreshConnected(connection=preset, indicatorsOnly=false) {
    if(refreshLock.current)return;
    if(connection!=='drc'){setRefreshStatus('No live source connected. Choose a source in Data. Uploaded and main-app records cannot be refreshed without a source connection.');return;}
    const generation=++refreshGeneration.current;
    refreshLock.current=true;
    setRefreshing(true);setRefreshStatus('Checking connected sources…');
    const uploadedMobility=routeData&&(routeData.origin==='upload'||routeData.origin!=='public'&&!routeData.source?.startsWith('https://raw.githubusercontent.com/INRB-UMIE/'));
    const kinds=indicatorsOnly?['indicators']:['indicators',...(!uploadedMobility?['relocations']:[]),'mobility',...(mines?.origin==='upload'?[]:['mines'])];
    const results=await Promise.allSettled(kinds.map(async kind=>{
      const response=await fetch(`/api/outbreak-data?kind=${kind}`,{signal:AbortSignal.timeout(90000)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
      if(kind==='indicators'&&(!Array.isArray(data.datasets)||!data.datasets.length)||kind==='relocations'&&!Array.isArray(data.routes)||kind==='mobility'&&!Array.isArray(data.products)||kind==='mines'&&!Array.isArray(data.data))throw new Error('Source returned an unexpected format.');
      return data;
    }));
    refreshLock.current=false;
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
    const checkedAt=new Date().toISOString();
    setLastChecked(checkedAt);if(!failures.length)setLastSuccessfulCheck(checkedAt);setRefreshing(false);change();
    setRefreshStatus(failures.length?`Some sources could not refresh. Previously loaded observations remain dated as before. ${failures.join(' · ')}`:'Connected sources checked. Latest available observations loaded; reporting dates may still be older than today.');
  }
  refreshLatest.current=()=>{
    if(refreshLock.current||refreshing||busy||compareLoading||document.visibilityState==='hidden')return;
    setAsOf(today());
    refreshConnected(preset,true);
  };
  useEffect(()=>{
    if(tab!=='Dashboard'||preset!=='drc'||!liveDashboard||!refreshMinutes)return;
    const timer=setInterval(()=>refreshLatest.current?.(),refreshMinutes*60000);
    return()=>clearInterval(timer);
  },[tab,preset,liveDashboard,refreshMinutes]);
  async function refresh(){await refreshConnected('drc');}
  const connectionKey='aidstack.outbreak.connection:'+JSON.stringify(districts.map(d=>d.id||d.name).sort());
  const registeredEpi=geoLayers.some(l=>l.id.startsWith('insp_sitrep.'));
  useEffect(()=>{
    if(autoConnection.current)return;
    let remembered='';try{remembered=localStorage.getItem(connectionKey)||'';}catch{}
    if(!registeredEpi&&remembered!=='drc')return;
    autoConnection.current='drc';setPreset('drc');setName(current=>current===INITIAL_NAME?'DRC Ebola (BVD) outbreak':current);refreshConnected('drc');
  },[registeredEpi,connectionKey]);
  function connectSource(value){
    setLiveDashboard(true);
    refreshGeneration.current++;setRefreshing(false);autoConnection.current='manual';change();setPreset(value);if(value==='drc'&&name===INITIAL_NAME)setName('DRC Ebola (BVD) outbreak');
    try{localStorage.setItem(connectionKey,value);}catch{}
    if(value==='drc')refreshConnected(value);else setRefreshStatus('Using uploaded and main-app data. No live source connected.');
  }
  async function fetchMines() {
    if(mines?.origin==='upload'){openData('context');setNotice('Uploaded mining data is active. Upload a replacement below; public refresh does not overwrite it.');return;}
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
  function snapshot() {return {schemaVersion:2,reportOptions,rcceDocuments,documentFilter,includeEvidenceDates,comparison:comparisonRecord(compareSnapshot),disasters:disasterInput,includeAppendix,bottomLine,briefDirection,routeData,routeDirection,routeLimit,name,preset,asOf,datasets:availableDatasets,selectedId:selected?.id||selectedId,location:selectedLocation,boundaryField,boundaryLevel,boundarySource,geometry:geography.data,mines,showMines,actions,factIds,reviewed,flowCatalogue,useWorkspaceContext,provinceField,epiSource,movementDirection,movementField,securityFrom,securityTo,showSecurity,showSites,mapMode,securityEvents:securityInput.map(e=>({event_id:e.event_id_cnty||e.event_id||e.id,event_date:e.event_date,latitude:e.latitude,longitude:e.longitude,fatalities:e.fatalities,actor1:e.actor1,event_type:e.event_type,location:e.location,country:e.country}))};}
  async function save() {
    setBusy('Saving snapshot');setError('');
    try{const value=await storage.savePlan({id:crypto.randomUUID(),metadata:{name:`${name} — ${asOf} — ${new Date().toISOString()}`},...snapshot()},0);setRecord(value);setDirty(false);setSaved((await storage.listPlans()).filter(s=>s.id!==DRAFT_ID));setNotice('Snapshot saved in this browser workspace.');await draft.flush(snapshot());}catch(e){setError(e.message);}finally{setBusy('');}
  }
  async function restore(id) {
    if(!id||dirty&&!window.confirm('Replace unsaved work with this snapshot?'))return;
    refreshGeneration.current++;autoConnection.current='snapshot';setLiveDashboard(false);setRefreshing(false);setRefreshStatus('Saved snapshot — showing the recorded data. Refresh data to update it.');setLastChecked('');setLastSuccessfulCheck('');
    setBusy('Opening snapshot');setError('');
    try{const s=await storage.loadPlan(id);if(![1,2].includes(s?.schemaVersion))throw new Error('Unsupported snapshot version');
      applySnapshot(s);
    }catch(e){setError(e.message);}finally{setBusy('');}
  }
  function applySnapshot(s) {
      compareGeneration.current++;setCompareLoading(false);setCompareSnapshot(s.comparison||null);setCompareId(s.comparison?.id||'');
      setReportOptions(s.reportOptions||{notes:{},mobilityAreas:[]});setIntakeVersion(v=>v+1);setIncludeEvidenceDates(s.includeEvidenceDates??false);setRcceDocuments(s.rcceDocuments||[]);setDocumentFilter(s.documentFilter||{kind:'',theme:'',from:'',measure:''});
      setRestoredDisasters(s.disasters||[]);setIncludeAppendix(s.includeAppendix||false);setBottomLine(s.bottomLine||'');setBriefDirection(s.briefDirection||'outflow');setRouteDirection(s.routeDirection||'outflow');setRouteLimit(s.routeLimit||'10');setRouteData(s.routeData||null);setName(s.name);setPreset(s.preset);setAsOf(s.asOf);setDatasets(s.datasets);setSelectedId(s.selectedId);setLocation(s.location);setBoundaryField(s.boundaryField);setBoundaryLevel(s.boundaryLevel);setBoundarySource(s.boundarySource);setRestoredGeometry(s.geometry);setMines(s.mines);setShowMines(s.showMines);setActions(s.actions);setFactIds(s.factIds);setReviewed(s.schemaVersion===2&&s.reviewed);setFlowCatalogue(s.flowCatalogue||null);setUseWorkspaceContext(s.useWorkspaceContext??true);setProvinceField(s.provinceField||'province');setEpiSource(s.epiSource||'');setMovementDirection(s.movementDirection||'outflow');setMovementField(s.movementField||'');setSecurityFrom(s.securityFrom||'');setSecurityTo(s.securityTo||'');setRestoredSecurity(s.securityEvents||[]);setShowSecurity(s.showSecurity??true);setShowSites(s.showSites??false);setMapMode(s.mapMode||'indicator');setRecord(s);setDirty(false);setNotice('Saved snapshot opened. Sources were not refreshed.');
  }
  function newOutbreak() {
    if(dirty&&!window.confirm('Start another outbreak without saving current changes?'))return;
    setLiveDashboard(true);
    compareGeneration.current++;setCompareLoading(false);setCompareId('');setCompareSnapshot(null);
    refreshGeneration.current++;autoConnection.current='manual';setRefreshing(false);setRefreshStatus('No live source connected.');setLastChecked('');setLastSuccessfulCheck('');try{localStorage.removeItem(connectionKey);}catch{}
    setReportOptions({notes:{},mobilityAreas:[]});setIntakeVersion(v=>v+1);setDataView('reports');setIncludeEvidenceDates(false);setRcceDocuments([]);setDocumentFilter({kind:'',theme:'',from:'',measure:''});
    setRestoredDisasters(null);setIncludeAppendix(false);setBottomLine('');setBriefDirection('outflow');setRouteData(null);setName('New outbreak');setPreset('custom');setDatasets([]);setSelectedId('');setLocation('');setAsOf(today());setActions([]);setFactIds([]);setMines(null);setShowMines(false);setRecord(null);setRestoredGeometry(null);setRestoredSecurity(null);setUseWorkspaceContext(false);setSecurityFrom('');setSecurityTo('');setEpiSource('');setMovementField('');setMapMode('indicator');change();
  }
  const updateAction=(i,key,value)=>{change();setActions(actions.map((a,n)=>i===n?{...a,[key]:value}:a));};
  function selectProposal(suggestion) {
    if(proposalSelected(actions,suggestion))return;
    change();
    const sources=[...new Set([epi?.dataset&&sourceLabel(epi.dataset),security&&`Uploaded ACLED, ${security.start}–${security.end}`,mining&&mines&&sourceLabel(mines),routeData&&sourceLabel(routeData)].filter(Boolean))];
    setActions(old=>proposalSelected(old,suggestion)?old:[...old,{id:crypto.randomUUID(),proposalKey:proposalKey(suggestion),location:suggestion.areas.join(', '),owner:'',resources:'',due:'',status:'Proposed',action:`${suggestion.title}. ${suggestion.why} ${suggestion.action}`,basis:{asOf,why:suggestion.why,sources}}]);
  }
  const draft=useOutbreakDraft(storage,snapshot(),dirty&&!busy&&!refreshing&&!compareLoading);
  draftSaved.current=draft.saved;
  function resumeDraft(){
    refreshGeneration.current++;autoConnection.current='snapshot';setLiveDashboard(false);setRefreshing(false);setLastChecked('');setLastSuccessfulCheck('');
    applySnapshot(draft.candidate);setRecord(null);setDirty(true);draft.useCurrent();
    setRefreshStatus('Recovered draft — showing its recorded data. Refresh data to update it.');
    setNotice('Working draft recovered.');
  }
  const updateReportOptions=value=>{change();setReportOptions(value);};
  return <section ref={appElement} className={styles.app} aria-label="Outbreak response"><fieldset disabled={!!busy||compareLoading} className={styles.fieldset}>
    <div className={styles.appNavigation}>
      <header className={styles.header}><div><span className={styles.eyebrow}>OUTBREAK RESPONSE</span><h2>{name===INITIAL_NAME?'Situation workspace':name}</h2></div><div className={styles.toolbar}><span className={styles.saveStatus} role="status">{dirty?(draft.status||'Unsaved changes'):record?'Saved report version':'Local workspace'}</span><button onClick={save} disabled={!!busy||refreshing||!name.trim()}>Save snapshot{dirty?' *':''}</button><button className={styles.primaryAction} onClick={()=>goTab('Briefing')}>Prepare Sitrep</button></div></header>
      <nav className={styles.tabs} aria-label="Outbreak sections">{[['Dashboard','Dashboard'],['Situation','Situation'],['Data','Data'],['Actions','Actions'],['Briefing','Sitrep']].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>goTab(id)}>{label}</button>)}</nav>
    </div>
    <div className={styles.scopeBar}>
      <label>Reporting cut-off<input type="date" value={asOf} onChange={e=>{if(validDate(e.target.value)){change();setLiveDashboard(false);setAsOf(e.target.value);}}}/></label>
      <button onClick={()=>refreshConnected()} disabled={refreshing||!!busy}>{refreshing?'Refreshing data…':'Refresh data'}</button>
      <details className={styles.reportSettings}><summary>Report settings &amp; saved versions</summary><div className={styles.controls}>
        <label>Outbreak / operational scope<input value={name} maxLength={180} onChange={e=>{change();setName(e.target.value);}}/></label>
        <label>Saved snapshots<select value="" onChange={e=>restore(e.target.value)} disabled={!!busy}><option value="">Open saved snapshot</option>{saved.map(s=><option key={s.id} value={s.id}>{s.name||s.metadata?.name}</option>)}</select></label>
        <label>Compare with previous brief<select value={compareId} onChange={e=>selectComparison(e.target.value)}><option value="">No comparison selected</option>{saved.map(s=><option key={s.id} value={s.id}>{s.name||s.metadata?.name}</option>)}</select></label>
        {record&&<button onClick={()=>selectComparison(record.id)}>Use open snapshot as baseline</button>}
        <button onClick={newOutbreak}>New outbreak</button>
      </div></details>
    </div>
    {tab==='Dashboard'&&<div className={styles.controls} aria-label="Dashboard refresh controls">
      <label>Auto-refresh<select aria-label="Auto-refresh" value={refreshMinutes} onChange={e=>setRefreshMinutes(Number(e.target.value))}>{[0,5,15,30,60].map(n=><option key={n} value={n}>{n?`Every ${n} minutes`:'Off'}</option>)}</select></label>
      <label><input type="checkbox" checked={liveDashboard} onChange={e=>{setLiveDashboard(e.target.checked);if(e.target.checked){change();setAsOf(today());}}}/>Follow latest reporting dates</label>
      <span role="status">{preset!=='drc'?'Connect a live source in Data to enable automatic refresh.':!liveDashboard?'Automatic refresh paused — historical cut-off or saved data.':!refreshMinutes?'Automatic refresh off.':`Checks every ${refreshMinutes} minutes while this dashboard is visible.`} {lastChecked?`Last check completed: ${new Date(lastChecked).toLocaleString()}.`:'No source check completed this session.'}</span>
      {lastSuccessfulCheck&&<small>Last successful check: {new Date(lastSuccessfulCheck).toLocaleString()}.</small>}
      {refreshStatus&&<small>{refreshStatus}</small>}
    </div>}
    {tab==='Dashboard'&&<Dashboard title={name} freshness={refreshing?'Checking for updates…':refreshStatus.startsWith('Some sources')?'Refresh failed · showing last available reports':preset!=='drc'?'Uploaded / workspace data':!liveDashboard?'Historical view · refresh paused':!refreshMinutes?'Automatic refresh off':`Updates every ${refreshMinutes} min${lastSuccessfulCheck?` · checked ${new Date(lastSuccessfulCheck).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:''}`} province={dashboardProvince} setProvince={setDashboardProvince} epi={epi} geometry={geography.data} boundaryLevel={boundaryLevel} message={openingMessage} asOf={asOf} location={location} onSelect={n=>{change();setLocation(n);}} onAnalysis={()=>goTab('Briefing')} onData={()=>openData('indicators')} reviewed={reviewed}/>}
    {draft.candidate&&<div className={styles.notice} role="status">A working draft is available: {draft.candidate.name} · {draft.candidate.asOf}. <button onClick={resumeDraft}>Resume draft</button> <button onClick={()=>{draft.useCurrent();change();}}>Keep current work</button></div>}
    {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}{busy&&<p role="status">{busy}…</p>}
    {tab==='Situation'&&<KeyMessage compact message={openingMessage} asOf={asOf} reviewed={reviewed} onBriefing={()=>goTab('Briefing')} editor={<><label>Coordinator key message<textarea value={bottomLine} maxLength={800} placeholder="Leave blank to use the summary from loaded data." onChange={e=>{change();setBottomLine(e.target.value);}}/></label><p>Review your wording after changing the reporting cut-off or refreshing data.</p>{bottomLine.trim()&&<button type="button" onClick={()=>{change();setBottomLine('');}}>Use data summary</button>}</>}/>}
    {tab==='Situation'&&<>
      {since&&<BriefChanges since={since}/>}
      <Overview onData={()=>openData('indicators')} datasets={availableDatasets} epi={epi} security={security} mining={mining} asOf={asOf} routeData={routeData} actions={actions} selectedArea={selectedLocation} onSelect={n=>{chooseArea(n);requestAnimationFrame(()=>explorerElement.current?.scrollIntoView({behavior:'smooth',block:'start'}));}} onDecision={selectProposal}/>
      <DocumentEvidence all={allDocumentFindings} findings={filteredDocumentFindings} mapped={mappedFindings} filter={documentFilter} onFilter={value=>{change();setDocumentFilter(value);}} geometry={geography.data} boundaryLevel={boundaryLevel} asOf={asOf} cases={epi?.dataset||availableDatasets.find(d=>d.purpose==='cases')} selected={selectedLocation} onSelect={chooseArea} routeData={routeData} routeDirection={routeDirection} onDirection={value=>{change();setRouteDirection(value);}} overlays={movementOverlays}/>
      <Routes overlays={movementOverlays} showFocus={false} direction={routeDirection} onDirection={d=>{change();setRouteDirection(d);}} limit={routeLimit} onLimit={v=>{change();setRouteLimit(v);}} data={routeData} onLoad={fetchRoutes} loading={routeLoading} error={routeError} epi={epi} security={security} geometry={geography.data} boundaryLevel={boundaryLevel} asOf={asOf} selected={selectedLocation} onSelect={chooseArea}/>
      <EvidenceReadiness datasets={availableDatasets} asOf={asOf}/>
      <ResponseStatus datasets={availableDatasets} actions={actions} asOf={asOf} onData={()=>openData('indicators')}/>
      <details className={styles.panel}><summary>Data coverage — loaded sources and missing inputs</summary><DataAvailability rcceDocuments={eligibleRcce} datasets={availableDatasets} geometry={geography.data} mines={mines} securityCount={securityInput.length} disasterCount={disasterInput.length} routeData={routeData} facilities={facilities} onData={openData} onWorkspace={onOpenWorkspace} onMines={fetchMines} loading={!!busy||refreshing}/></details>
      <details ref={explorerElement} open={explorerOpen||!epi} onToggle={e=>{if(epi)setExplorerOpen(e.currentTarget.open);}} className={styles.panel}><summary>Explore an area{location?` — ${location}`:''}</summary>
      <p>Choose an area to inspect its trend, movement connections and map.</p>
      <div className={styles.controls}><label>Explore an indicator<select value={selected?.id||''} onChange={e=>{change();setSelectedId(e.target.value);setLocation('');}}><option value="">Choose dataset</option>{availableDatasets.filter(d=>d.status==='ready').map(d=><option key={d.id} value={d.id}>{d.label} · {d.level} · {d.origin==='upload'?d.file:d.origin==='boundary'?'GeoJSON':'Source preset'}</option>)}</select></label><label>Explore a location<select value={selectedLocation} onChange={e=>{change();setLocation(e.target.value);}}>{location&&!rows.some(r=>r.location===location)&&<option value={location}>{location} — no observations</option>}{rows.map(r=><option key={r.location}>{r.location}</option>)}</select></label></div>
      {selected&&<><p>{selected.issues?.length?`${selected.issues.length} source validation issues; affected numeric cells are missing. See Data. `:''}{selected.kind} · {selected.unit} · <a href={selected.url||undefined} target="_blank" rel="noreferrer">{sourceLabel(selected)}</a></p><TrendChart records={selected.records} location={selectedLocation} label={selected.label} unit={selected.unit} kind={selected.kind} asOf={asOf} source={sourceLabel(selected)}/></>}
      <div className={styles.panel}><h3>Geographic evidence</h3>
        <details><summary>Map settings</summary><div className={styles.controls}><label>Main-app boundary name field<select value={boundaryField} onChange={e=>{change();setRestoredGeometry(null);setBoundarySource('Main app uploaded boundaries');setBoundaryField(e.target.value);}}><option value="auto">Auto-detected: {effectiveBoundaryField}</option><option value="@name">Main-app area name</option><option value="nom">nom</option>{boundaryFields.filter(k=>k!=='nom').map(k=><option key={k}>{k}</option>)}</select></label><label>Grouping / province field<select aria-label="Grouping / province field" value={provinceField} onChange={e=>{change();setProvinceField(e.target.value);setRestoredGeometry(null);}}><option value="auto">Auto-detected: {effectiveProvinceField||'none'}</option><option value="">No grouping</option><option value="province">province</option>{boundaryFields.filter(k=>k!=='province').map(k=><option key={k}>{k}</option>)}</select></label><label>Boundary geographic level<select value={boundaryLevel} onChange={e=>{change();setBoundaryLevel(e.target.value);}}>{LEVELS.map(l=><option key={l}>{l}</option>)}</select></label></div></details>
        {restoredGeometry&&<p>Using the boundary snapshot saved with this briefing. <button onClick={()=>{change();setRestoredGeometry(null);setBoundarySource('Main app uploaded boundaries');}}>Use current main-app boundaries</button></p>}
        {geography.error&&<p role="alert">Map unavailable: {geography.error}. Choose the field containing unique dataset location names. Analysis remains available.</p>}
        {unmatched.length>0&&<p role="status">{unmatched.length} unmatched locations (not mapped): {unmatched.slice(0,20).map(r=>r.location).join(', ')}{unmatched.length>20?'…':''}</p>}
        <div className={styles.controls}>{hazards.events.length>0&&<label><input type="checkbox" checked={showHazards} onChange={e=>setShowHazards(e.target.checked)}/>Show recent GDACS alert centres</label>}<label>Map measure<select aria-label="Map measure" value={mapMode} onChange={e=>{change();setMapMode(e.target.value);}}><option value="indicator">Selected reported indicator</option><option value="growth" disabled={!epi}>Recent cumulative change</option><option value="mining" disabled={!mining}>Documented mining sites</option><option value="security" disabled={!security}>Security events</option></select></label>{security&&<label><input type="checkbox" checked={showSecurity} onChange={e=>{change();setShowSecurity(e.target.checked);}}/>Show security event locations</label>}{facilities.length>0&&<label><input type="checkbox" checked={showSites} onChange={e=>{change();setShowSites(e.target.checked);}}/>Show uploaded site locations (capacity unverified)</label>}</div>
        <OutbreakMap documentSignals={mappedFindings} geometry={geography.data} rows={mapRows} level={mapLevel} kind={mapMode==='indicator'?selected?.kind:'derived indicator'} unit={mapUnit} boundaryLevel={boundaryLevel} mines={activeMines} selected={selectedLocation} onSelect={n=>{change();setLocation(n);}} label={mapLabel} asOf={asOf} source={mapSource} hazards={showHazards?hazards.events:[]} events={showSecurity?security?.records||[]:[]} sites={showSites?facilities:[]} focusNames={mapRows.filter(r=>r.value>0).sort((a,b)=>b.value-a.value).slice(0,12).map(r=>r.location)}/>
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
    <div hidden={tab!=='Data'}>
      <DataWorkspace key={intakeVersion} active={dataView} onSelect={setDataView} reportCount={rcceDocuments.length} sourceCount={availableDatasets.length}
        reports={<>
      <div id="outbreak-uploads" className={styles.panel}><RcceUpload asOf={asOf} geometry={geography.data} boundaryLevel={boundaryLevel} documents={rcceDocuments} onImport={d=>{change();setRcceDocuments(old=>[...old,d]);setNotice('RCCE report imported. Its summary appears in the briefing when its date is within the reporting cut-off. Save a snapshot to retain it.');}}/>
        {rcceDocuments.length>0&&<h3 className={styles.libraryTitle}>Imported reports <span className={styles.countBadge}>{rcceDocuments.length}</span></h3>}{rcceDocuments.map(d=><details className={styles.reportCard} key={d.id}><summary><span>{d.title}</span><span className={styles.countBadge}>{!d.date?'Date needed for briefing':d.date>asOf?'After cut-off':'In briefing'}</span></summary><p>{d.location} · {d.date} · {d.source} · {d.file}{d.date>asOf?' · After reporting cut-off; excluded from briefing':''}</p><p style={{whiteSpace:'pre-wrap'}}>{d.summary}</p><ReportMetadataEditor document={d} onUpdate={patch=>{change();setRcceDocuments(old=>old.map(item=>item.id===d.id?{...item,...patch}:item));}}/><details><summary>Extracted text and provenance</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}}>{d.text}</pre><p>SHA-256: {d.sha256} · Imported: {d.fetchedAt}</p></details><details><summary>Analyze or edit document findings</summary><DocumentAnalysis document={d} geometry={geography.data} boundaryLevel={boundaryLevel} onUpdate={patch=>{change();setRcceDocuments(old=>old.map(item=>item.id===d.id?{...item,...patch}:item));}}/></details><button onClick={()=>{change();setRcceDocuments(old=>old.filter(item=>item.id!==d.id));}}>Remove RCCE report: {d.title}</button></details>)}
      </div>
        </>}
        indicators={<>
      <div className={styles.panel}><Upload datasets={availableDatasets} onImport={(d,replacedId)=>{refreshGeneration.current++;setRefreshing(false);setRefreshStatus('Uploaded data selected. Public refresh preserves uploaded sources.');change();setDatasets(old=>[d,...old.filter(item=>item.id!==d.id)]);setSelectedId(d.id);if(d.purpose==='cases'&&d.kind==='cumulative'&&d.level!=='national')setEpiSource(d.id);else if(epiSource===replacedId)setEpiSource('');setLocation('');setNotice(replacedId?'Dataset replaced. Maps, summaries and briefing now use the replacement.':'Dataset imported. Open Situation to review its chart and observations.');}}/><button onClick={()=>download('sdb-template.csv','health_zone,date,requests,completed\nExample zone,2026-09-01,12,10\nExample zone,2026-09-02,8,8\n','text/csv')}>Download example SDB template</button><p>Template rows are illustrative. Replace them before importing. Requests and completions are separate indicators; their difference is not automatically a backlog.</p></div>
      <div className={styles.panel}><GeoImport layers={geoLayers} level={boundaryLevel} onImport={d=>{change();setDatasets(old=>[...old,d]);setSelectedId(d.id);if(d.purpose==='cases')setEpiSource(d.id);setNotice('GeoJSON indicator mapped. Insights are available in Situation.');}}/></div>
        </>}
        sources={<>
      <div className={styles.panel}><h3>Sources and freshness</h3><label><input type="checkbox" checked={useWorkspaceContext} onChange={e=>{change();setUseWorkspaceContext(e.target.checked);setRestoredSecurity(null);setRestoredDisasters(null);}}/>Use current main-app contextual indicators and security data for this outbreak</label><label>Optional public source preset<select aria-label="Optional public source preset" value={preset} onChange={e=>connectSource(e.target.value)}><option value="custom">Uploaded / workspace data</option><option value="drc">DRC BDBV2026 — INSP public feeds</option></select></label><p>Connected sources refresh automatically when this app opens. Refresh data checks them again. Saved snapshots open at their recorded dates until you refresh. Uploads have no live connection and keep their original observations.</p>{preset==='drc'&&<button disabled={!!busy} onClick={refresh}>Refresh DRC daily feeds</button>}
        <p>{districts.length} administrative records and {facilities.length} site records are available from the main app. Boundary names are mapped in Situation. Site records are not automatically treated as response capacity.</p>
        {availableDatasets.map(d=><details className={styles.source} key={d.id}><summary><span>{d.label}</span><span className={styles.countBadge}>{d.status==='ready'?`${d.records.length} observations`:"Unavailable"}</span></summary>{d.refreshError&&<p role="alert">Refresh failed: {d.refreshError}. Showing previously loaded observations.</p>}{d.origin==='upload'&&<label>Dataset category for {d.label}<select value={d.category||'other'} onChange={e=>{change();setDatasets(old=>old.map(item=>item.id===d.id?{...item,category:e.target.value}:item));}}>{[['other','Other / unclassified'],['sdb','Safe and dignified burial'],['rcce','Community engagement / RCCE'],['logistics','Logistics and supplies'],['response','Response presence and capacity']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}<h4>{d.label} <small>{d.level} / {d.kind}</small></h4><p>{d.status==='ready'?`${d.records.length} observations · ${d.records.filter(r=>r.value===null).length} missing · ${revisionCount(d.records)} downward cumulative revisions · ${d.issues?.length||0} source validation issues`:d.error}</p><p>{d.url?<a href={d.url} target="_blank" rel="noreferrer">Source CSV</a>:d.source} · Retrieved {d.fetchedAt||'not available'}</p>{d.status==='ready'&&<p>Reporting dates: {[...d.records].map(r=>r.date).sort()[0]} to {[...d.records].map(r=>r.date).sort().at(-1)}</p>}<details><summary>Provenance and validation log</summary>{d.issues?.length>0&&<div className={styles.tableWrap}><table><thead><tr><th>Source row</th><th>Location / date</th><th>Original value</th><th>Issue</th></tr></thead><tbody>{d.issues.map((issue,i)=><tr key={i}><td>{issue.row}</td><td>{issue.location} / {issue.date}</td><td>{issue.raw}</td><td>{issue.message}</td></tr>)}</tbody></table></div>}<p>SHA-256: {d.sha256||'unavailable'}</p>{d.mapping&&<pre>{JSON.stringify(d.mapping,null,2)}</pre>}</details><button disabled={d.origin==='boundary'} onClick={()=>{change();setDatasets(datasets.filter(v=>v.id!==d.id));if(selectedId===d.id)setSelectedId('');}}>Remove dataset</button></details>)}
      </div>
      <DataAvailability rcceDocuments={eligibleRcce} datasets={availableDatasets} geometry={geography.data} mines={mines} securityCount={securityInput.length} disasterCount={disasterInput.length} routeData={routeData} facilities={facilities} onData={openData} onWorkspace={onOpenWorkspace} onMines={fetchMines} loading={!!busy||refreshing}/>
        </>}
        context={<>
      <MineUpload current={mines} asOf={asOf} index={index} onImport={d=>{refreshGeneration.current++;setRefreshing(false);setRefreshStatus('Uploaded data selected. Public refresh preserves uploaded sources.');change();setMines(d);setShowMines(true);setNotice('Uploaded mining data is active across maps and briefing. Public refresh will preserve it.');}}/>
      <RouteUpload current={routeData} onImport={d=>{refreshGeneration.current++;setRefreshing(false);setRefreshStatus('Uploaded data selected. Public refresh preserves uploaded sources.');change();setRouteData(d);setNotice("Mobility routes imported. Open Situation to explore district connections.");}}/>
      <details className={styles.panel}><summary>Concurrent hazards (GDACS) <span className={styles.countBadge}>{hazards.events.length} recent alerts</span></summary><p>Recent means alerts published in the 28 days ending {asOf}. A centre inside a boundary does not describe the full affected footprint. {hazards.excluded} records excluded by date, identifier or spatial match.</p>{hazards.events.map(h=><p key={h.id}><strong>{h.location}</strong> · {h.title} · published {h.date} {h.source&&<a href={h.source}>GDACS report</a>}</p>)}</details>
      <details className={styles.panel}><summary>Security analysis from the main app <span className={styles.countBadge}>{securityInput.length} records</span></summary><p>{securityInput.length} ACLED records available. The default window ends at the latest valid event on or before the briefing cut-off and spans 28 days. This does not establish reporting completeness.</p><div className={styles.controls}><label>Security window start<input type="date" value={securityStart} onChange={e=>{if(validDate(e.target.value)){change();setSecurityFrom(e.target.value);}}}/></label><label>Security window end<input type="date" value={securityEnd} onChange={e=>{if(validDate(e.target.value)){change();setSecurityTo(e.target.value);}}}/></label><button onClick={()=>{change();setSecurityFrom('');setSecurityTo('');}}>Use latest recorded event window</button></div>{securityRangeError&&<p role="alert">Security dates must be ordered and must not extend beyond the briefing cut-off.</p>}{restoredSecurity&&<button onClick={()=>{change();setRestoredSecurity(null);}}>Use current main-app security records</button>}{security?.issues.length>0&&<details><summary>{security.issues.length} security validation issues</summary><ul>{security.issues.map((e,i)=><li key={i}>{e.id||`Row ${e.row}`}: {e.message}</li>)}</ul></details>}</details>
      {mobilityLayers.length>0&&<details className={styles.panel}><summary>Available Flowminder products <span className={styles.countBadge}>Product catalogue</span></summary>{flowCatalogueError&&<p role="status">{flowCatalogueError} Values retain source units until definitions can be verified. <button onClick={()=>setFlowCatalogueError('')}>Retry source definitions</button></p>}{!flowCatalogue&&!flowCatalogueError&&<p>Loading source definitions…</p>}{flowCatalogue&&<><p>Definitions retrieved {flowCatalogue.fetchedAt}. GeoJSON destination indicators are separate from relocation matrices.</p><table><thead><tr><th>Available product</th><th>Format</th><th>Units</th><th>Source</th></tr></thead><tbody>{flowCatalogue.products.filter(p=>p.type==='vector'||p.product==='relocations').map(p=><tr key={p.id}><td>{p.metric}</td><td>{p.inGeoJSON?'Embedded vector':'Separate matrix — load in district connections'}</td><td>{p.unit}</td><td>{p.url&&<a href={p.url} target="_blank" rel="noreferrer">Data file</a>} · <a href={p.documentation} target="_blank" rel="noreferrer">Definitions</a></td></tr>)}</tbody></table></>}</details>}
        </>}
      />
    </div>
    {tab==='Actions'&&<>
      <RcceReports documents={eligibleRcce}/>
      <div className={styles.panel}><h3>Response presence and capacity</h3><p>Import dated presence, capacity and delivery indicators in Data. Response categories and locations come from those datasets; no province or service footprint is pre-populated.</p></div>
      <div className={styles.panel}><h3>Response plan</h3><p>Coordinator-entered proposals, separate from reported evidence. Include the evidence or operational reason in each action.</p>
        <p>{actionFollowUp(actions,asOf).overdue} actions overdue at the reporting cut-off. Assign owners and dates before approving actions.</p>
        {actions.filter(a=>a.basis).map(a=><details key={a.id}><summary>Evidence at selection — {a.location}</summary><p>{a.basis.why}</p><p>Cut-off {a.basis.asOf}. Sources: {a.basis.sources.join('; ')}. This evidence is preserved when the action is edited; recheck it after refreshing data.</p></details>)}
        {actions.map((a,i)=><div className={styles.action} key={a.id}><div className={styles.controls}>{[['location','Location'],['owner','Owner'],['resources','Resources / funding']].map(([k,l])=><label key={k}>{l}<input value={a[k]} maxLength={200} onChange={e=>updateAction(i,k,e.target.value)}/></label>)}<label>Due date<input type="date" value={a.due} onChange={e=>updateAction(i,'due',e.target.value)}/></label><label>Status<select value={a.status} onChange={e=>updateAction(i,'status',e.target.value)}>{['Proposed','Approved','In progress','Completed','Blocked'].map(v=><option key={v}>{v}</option>)}</select></label></div><label>Action, rationale and decision requested<textarea value={a.action} maxLength={2000} onChange={e=>updateAction(i,'action',e.target.value)}/></label><button onClick={()=>{change();setActions(actions.filter((_,n)=>n!==i));}}>Remove action</button></div>)}
        <button onClick={()=>{change();setActions([...actions,{id:crypto.randomUUID(),location:'',owner:'',resources:'',due:'',status:'Proposed',action:''}]);}}>Add decision / action</button>
      </div>
    </>}
    {tab==='Briefing'&&<SitrepWorkspace movementOverlays={movementOverlays} reportRef={briefElement} name={name} asOf={asOf} datasets={availableDatasets} actions={actions} reviewed={reviewed} onReviewed={value=>{setReviewed(value);setDirty(true);}} onTab={value=>value==='Data'?openData('sources'):goTab(value)} options={reportOptions} onOptions={updateReportOptions} bottomLine={bottomLine} onBottomLine={value=>{change();setBottomLine(value);}} includeAppendix={includeAppendix} onAppendix={value=>{change();setIncludeAppendix(value);}} includeEvidenceDates={includeEvidenceDates} onEvidenceDates={value=>{change();setIncludeEvidenceDates(value);}} routeData={routeData} selectedLocation={selectedLocation} briefDirection={briefDirection} onDirection={value=>{change();setBriefDirection(value);}} snapshot={snapshot} organize={organize} canOrganize={!busy&&facts.length>0&&facts.length<=40}>
      <Sitrep mobilityLayers={mobilityLayers} selectedMobility={selectedMobility} movementDirection={direction} ref={briefElement} name={name} asOf={asOf} reviewed={reviewed} options={reportOptions} openingMessage={openingMessage} datasets={availableDatasets} epi={epi} geometry={geography.data} boundaryLevel={boundaryLevel} boundarySource={boundarySource} selected={selected} selectedLocation={selectedLocation} mining={mining} mines={mines} eligibleMines={eligibleMines} security={security} routeData={routeData} briefDirection={briefDirection} movementOverlays={movementOverlays} actions={actions} since={since} reports={eligibleRcce} findings={datedDocumentFindings} hazards={hazards} includeAppendix={includeAppendix} includeEvidenceDates={includeEvidenceDates} facts={facts} highlights={highlights} evidenceSource={evidenceSource}/>
    </SitrepWorkspace>}
    <details className={styles.freshness}>
      <summary>{refreshing?'Updating connected data…':refreshStatus.startsWith('Some sources')?'Source refresh needs attention':'Source dates & refresh details'}</summary>
      <div className={styles.freshnessDates}><strong>Latest observations</strong><span>Area cases: {epi?.date||'not available'}</span><span>Mobility: {routeData?.end||selectedMobility?.date||'not available'}</span><span>Security: {latestSecurityDate||'not available'}</span></div>
      <p role="status">{refreshStatus||'Connect public sources in Data.'}</p><small>{lastChecked?'Sources checked '+new Date(lastChecked).toLocaleString()+'. ':''}Observation dates can be older than the refresh time.</small>
      {asOf<today()&&<p>Historical view: observations after {asOf} are excluded. <button onClick={()=>{change();setAsOf(today());}}>Show latest reporting cut-off</button></p>}
    </details>
  </fieldset></section>;
}
