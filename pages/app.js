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

import { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';
import { ToastContainer, useToast } from '../components/Toast';
import OnboardingModal from '../components/OnboardingModal';
import ErrorBoundary from '../components/ErrorBoundary';
import { getDisasterTimelineDate } from '../components/MapComponent/utils/disasterHelpers';
import {
  filterFacilitiesToDistricts,
  filterImpactedFacilitiesToDistricts,
  getScopedWorldPopData,
  filterItemsToDistricts,
  filterOsmDataToDistricts
} from '../lib/analysisScope';
import { getFacilityIdentityKey } from '../lib/facilityIdentity';
import {
  saveWorkspace,
  loadWorkspace,
  clearWorkspace
} from '../lib/storage/workspaceStore';
import { expandOutbreakMapFeatures } from '../lib/whoOutbreaks';
import { buildDistrictRiskIndex } from '../lib/districtRiskScoring';
import { saveOutbreaks, loadOutbreaks, saveGdacs, loadGdacs } from '../lib/dataStore';

// Import components with dynamic loading (no SSR) for Leaflet compatibility
const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
});
const AppHub = dynamic(() => import('../components/platform/AppHub'), { ssr: false });

const FacilityUploader = dynamic(() => import('../components/FacilityUploader'), {
  ssr: false,
});

const RecommendationsPanel = dynamic(() => import('../components/RecommendationsPanel'), {
  ssr: false,
});

const SitrepGenerator = dynamic(() => import('../components/SitrepGenerator'), {
  ssr: false,
});

const PredictionDashboard = dynamic(() => import('../components/PredictionDashboard'), {
  ssr: false,
});

const OperationalOutlook = dynamic(() => import('../components/OperationalOutlook'), {
  ssr: false,
});

const PrioritizationBoard = dynamic(() => import('../components/PrioritizationBoard'), {
  ssr: false,
});

const StorageStatusPanel = dynamic(() => import('../components/StorageStatusPanel'), {
  ssr: false,
});

const DataFreshnessBar = dynamic(() => import('../components/DataFreshnessBar'), {
  ssr: false,
});

const TrendAnalysisDashboard = dynamic(() => import('../components/TrendAnalysisDashboard'), {
  ssr: false,
});

const SitrepDrawer = dynamic(() => import('../components/MapComponent/components/drawers/SitrepDrawer'), {
  ssr: false,
});

const matrixTone = {
  ready: { text: '#166534', background: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.22)' },
  partial: { text: '#92400e', background: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.24)' },
  blocked: { text: '#6b7280', background: 'rgba(107, 114, 128, 0.10)', border: 'rgba(107, 114, 128, 0.20)' }
};

const IMPACT_ASSESSMENT_REMOTE_PAYLOAD_LIMIT_BYTES = 3_500_000;
const GDACS_CLIENT_CACHE_MS = 30_000;

let gdacsClientRequestPromise = null;
let gdacsClientRequestCache = null;

function formatCompactCount(value) {
  if (value === null || value === undefined) return 'Unknown';
  return Number(value).toLocaleString();
}

function OperationalContextBar({
  selectedAnalysisDistricts = [],
  districts = [],
  facilities = [],
  impactedFacilities = [],
  worldPopData = {},
  latestPrioritizationBoard = null,
  enabledEvidenceLayers = [],
  acledEnabled = true,
  acledData = [],
  osmData = null,
  canUseDistrictDecisionTools = false,
  onOpenSitrep,
  sitrepLoading = false,
  canOpenSitrep = false
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia('(max-width: 768px)');
    const sync = () => {
      setIsMobile(media.matches);
      setDetailsOpen(!media.matches);
    };

    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  const facilitiesInScope = useMemo(
    () => selectedAnalysisDistricts.length > 0
      ? filterFacilitiesToDistricts(facilities, selectedAnalysisDistricts)
      : facilities,
    [facilities, selectedAnalysisDistricts]
  );

  const impactedFacilitiesInScope = useMemo(
    () => selectedAnalysisDistricts.length > 0
      ? filterImpactedFacilitiesToDistricts(impactedFacilities, selectedAnalysisDistricts)
      : impactedFacilities,
    [impactedFacilities, selectedAnalysisDistricts]
  );

  const scopedAcledData = useMemo(
    () => selectedAnalysisDistricts.length > 0
      ? filterItemsToDistricts(acledData, selectedAnalysisDistricts, 'latitude', 'longitude')
      : acledData,
    [acledData, selectedAnalysisDistricts]
  );

  const scopedWorldPopData = useMemo(
    () => selectedAnalysisDistricts.length > 0
      ? getScopedWorldPopData(worldPopData, selectedAnalysisDistricts)
      : worldPopData,
    [worldPopData, selectedAnalysisDistricts]
  );

  const scopedPopulation = useMemo(
    () => Object.values(scopedWorldPopData || {}).reduce((sum, entry) => {
      const value = Number(entry?.total || entry?.ageGroups?.total || 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0),
    [scopedWorldPopData]
  );

  const hasAgeBreakdown = useMemo(
    () => Object.values(scopedWorldPopData || {}).some((entry) => entry?.ageGroups && Object.keys(entry.ageGroups).length > 0),
    [scopedWorldPopData]
  );

  const safeFacilitiesCount = Math.max(0, facilitiesInScope.length - impactedFacilitiesInScope.length);
  const osmLayerCount = (osmData?.metadata?.requestedLayers || []).length > 0
    ? osmData.metadata.requestedLayers.length
    : Object.keys(osmData?.metadata?.byLayer || {}).filter((layer) => (osmData.metadata.byLayer[layer] || 0) > 0).length;
  const topDistrict = latestPrioritizationBoard?.districtRows?.[0] || null;
  const scopeLabel = selectedAnalysisDistricts.length > 0
    ? `${selectedAnalysisDistricts.length} selected admin area${selectedAnalysisDistricts.length === 1 ? '' : 's'}`
    : `${districts.length} uploaded admin area${districts.length === 1 ? '' : 's'} loaded`;

  const workflowItems = [
    { label: '1. Forecast', status: canUseDistrictDecisionTools ? 'ready' : 'blocked', detail: canUseDistrictDecisionTools ? 'facts layer ready' : 'select admin areas' },
    { label: '2. Outlook', status: canUseDistrictDecisionTools ? 'ready' : 'blocked', detail: canUseDistrictDecisionTools ? 'narrative layer ready' : 'select admin areas' },
    { label: '3. Decision', status: canUseDistrictDecisionTools ? 'ready' : 'blocked', detail: canUseDistrictDecisionTools ? 'prioritization ready' : 'select admin areas' }
  ];

  const evidenceItems = [
    { label: 'Flood', status: enabledEvidenceLayers.includes('flood_context') ? 'ready' : 'blocked', detail: enabledEvidenceLayers.includes('flood_context') ? 'enabled' : 'load Flood Context' },
    { label: 'Drought', status: enabledEvidenceLayers.includes('drought_context') ? 'ready' : 'blocked', detail: enabledEvidenceLayers.includes('drought_context') ? 'enabled' : 'load Drought Context' },
    { label: 'Access', status: enabledEvidenceLayers.includes('accessibility_context') ? 'ready' : 'blocked', detail: enabledEvidenceLayers.includes('accessibility_context') ? 'enabled' : 'load Accessibility' },
    { label: 'Nighttime', status: enabledEvidenceLayers.includes('nighttime_lights') ? 'ready' : 'blocked', detail: enabledEvidenceLayers.includes('nighttime_lights') ? 'loaded' : 'switch to Nighttime Lights' },
    { label: 'Security', status: acledEnabled && acledData.length > 0 ? 'ready' : 'blocked', detail: acledEnabled && acledData.length > 0 ? `${acledData.length} ACLED events` : 'upload or enable ACLED' },
    { label: 'Logistics', status: osmLayerCount > 0 ? 'ready' : 'blocked', detail: osmLayerCount > 0 ? `${osmLayerCount} OSM layer${osmLayerCount === 1 ? '' : 's'}` : 'load roads, airports, fuel' },
    { label: 'Population', status: scopedPopulation > 0 ? (hasAgeBreakdown ? 'ready' : 'partial') : 'blocked', detail: scopedPopulation > 0 ? (hasAgeBreakdown ? 'total + age breakdown' : 'total only') : 'load WorldPop' }
  ];

  const summaryItems = isMobile
    ? [
        { label: scopeLabel, tone: '#1f2937', background: 'rgba(248, 250, 252, 0.95)', border: 'rgba(148, 163, 184, 0.18)' },
        { label: `Top risk: ${topDistrict?.district || 'None'}`, tone: '#1f2937', background: 'rgba(248, 250, 252, 0.95)', border: 'rgba(148, 163, 184, 0.18)' },
        canUseDistrictDecisionTools
          ? { label: 'Analysis ready', tone: '#166534', background: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.22)' }
          : { label: 'Select admin areas to analyze', tone: '#1d4ed8', background: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.22)' }
      ]
    : [
        { label: scopeLabel, tone: '#1f2937', background: 'rgba(248, 250, 252, 0.95)', border: 'rgba(148, 163, 184, 0.18)' },
        { label: `Population: ${scopedPopulation > 0 ? formatCompactCount(scopedPopulation) : 'Unknown'}`, tone: '#1f2937', background: 'rgba(248, 250, 252, 0.95)', border: 'rgba(148, 163, 184, 0.18)' },
        { label: `Top risk: ${topDistrict?.district || 'None'}`, tone: '#1f2937', background: 'rgba(248, 250, 252, 0.95)', border: 'rgba(148, 163, 184, 0.18)' },
        canUseDistrictDecisionTools
          ? { label: 'Analysis ready', tone: '#166534', background: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.22)' }
          : { label: 'Select admin areas to analyze', tone: '#1d4ed8', background: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.22)' }
      ];

  return (
    <div style={{
      background: 'white',
      border: '1px solid rgba(27, 58, 92, 0.10)',
      borderRadius: '14px',
      boxShadow: '0 10px 26px rgba(15, 23, 42, 0.08)',
      padding: isMobile ? '10px 12px' : '12px 14px',
      marginTop: '12px',
      marginBottom: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', flex: '1 1 560px' }}>
          {summaryItems.map((item) => (
            <span key={item.label} style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              color: item.tone,
              background: item.background,
              border: `1px solid ${item.border}`
            }}>
              {item.label}
            </span>
          ))}
          <button
            type="button"
            onClick={() => onOpenSitrep && onOpenSitrep()}
            disabled={!canOpenSitrep || sitrepLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              color: 'white',
              background: canOpenSitrep ? '#F44336' : '#CBD5E1',
              border: 'none',
              cursor: canOpenSitrep && !sitrepLoading ? 'pointer' : 'not-allowed',
              opacity: sitrepLoading ? 0.85 : 1
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            {sitrepLoading ? 'Generating report...' : 'Sitrep'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          style={{
            border: 'none',
            borderRadius: '999px',
            background: 'rgba(27, 58, 92, 0.08)',
            color: 'var(--aidstack-navy)',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          {detailsOpen ? 'Hide details' : 'View details'}
        </button>
      </div>

      {detailsOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(220px, 1fr))', gap: '10px', marginTop: '12px' }}>
          <div style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(248,250,252,0.95)', border: '1px solid rgba(148,163,184,0.16)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', marginBottom: '8px' }}>
              Analysis Workflow
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {workflowItems.map((item) => {
                const tone = matrixTone[item.status];
                return (
                  <span key={item.label} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '7px 10px',
                    borderRadius: '999px',
                    border: `1px solid ${tone.border}`,
                    background: tone.background,
                    color: tone.text,
                    fontSize: '12px',
                    fontWeight: 700
                  }}>
                    {item.label}: {item.detail}
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(248,250,252,0.95)', border: '1px solid rgba(148,163,184,0.16)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', marginBottom: '8px' }}>
              Evidence Readiness
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {evidenceItems.map((item) => {
                const tone = matrixTone[item.status];
                return (
                  <span key={item.label} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '7px 10px',
                    borderRadius: '999px',
                    border: `1px solid ${tone.border}`,
                    background: tone.background,
                    color: tone.text,
                    fontSize: '12px',
                    fontWeight: 700
                  }}>
                    {item.label}: {item.detail}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// GDACS Facilities Impact Assessment Tool
// Developed by John Mark Esplana (https://github.com/jmesplana)
export default function Home() {
  const impactWorkerRef = useRef(null);
  const impactWorkerRunIdRef = useRef(0);

  const parseApiResponse = async (response, label) => {
    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();

    if (!response.ok) {
      const preview = raw.slice(0, 160).replace(/\s+/g, ' ').trim();
      throw new Error(`${label} failed with status ${response.status}${preview ? `: ${preview}` : ''}`);
    }

    if (!contentType.includes('application/json')) {
      const preview = raw.slice(0, 160).replace(/\s+/g, ' ').trim();
      throw new Error(`${label} returned ${contentType || 'non-JSON content'}${preview ? `: ${preview}` : ''}`);
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      const preview = raw.slice(0, 160).replace(/\s+/g, ' ').trim();
      throw new Error(`${label} returned invalid JSON${preview ? `: ${preview}` : ''}`);
    }
  };

  const shouldSkipCacheRestore = () => {
    try {
      return new URLSearchParams(window.location.search).has('skipCache');
    } catch (_) {
      return false;
    }
  };

  const scheduleCacheRestore = (callback, delay = 800) => {
    if (typeof window === 'undefined') return () => {};

    let idleId = null;
    const timeoutId = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(callback, { timeout: 2500 });
      } else {
        callback();
      }
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  };

  const yieldToBrowser = () => new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });

  const buildImpactFacilitiesPayload = (facilityData) => {
    return facilityData.map((facility) => ({
      name: facility.name,
      latitude: facility.latitude,
      longitude: facility.longitude
    }));
  };

  const buildImpactDisastersPayload = (items = []) => {
    return items.map((item) => ({
      eventType: item.eventType,
      eventName: item.eventName,
      title: item.title,
      latitude: item.latitude,
      longitude: item.longitude,
      alertLevel: item.alertLevel,
      severity: item.severity,
      polygon: item.polygon,
      source: item.source
    }));
  };

  const buildImpactAcledPayload = (items = []) => {
    return items.map((item) => ({
      event_type: item.event_type,
      sub_event_type: item.sub_event_type,
      latitude: item.latitude,
      longitude: item.longitude,
      event_date: item.event_date,
      fatalities: item.fatalities
    }));
  };

  const runImpactAssessmentOnMainThread = async (requestPayload) => {
    const { runImpactAssessment } = await import('../lib/impactAssessment');
    return runImpactAssessment(requestPayload, {
      progressInterval: 100,
      onProgress: (progress) => setImpactProgress(progress)
    });
  };

  const runImpactAssessmentInWorker = (requestPayload) => {
    if (typeof Worker === 'undefined') {
      return runImpactAssessmentOnMainThread(requestPayload);
    }

    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/impactAssessment.worker.js', import.meta.url));
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      impactWorkerRunIdRef.current += 1;
      const activeRunNumber = impactWorkerRunIdRef.current;

      impactWorkerRef.current?.terminate();
      impactWorkerRef.current = worker;

      worker.onmessage = (event) => {
        const { id, type, progress, result, error } = event.data || {};
        if (id !== runId || activeRunNumber !== impactWorkerRunIdRef.current) return;

        if (type === 'progress') {
          setImpactProgress(progress);
          return;
        }

        worker.terminate();
        if (impactWorkerRef.current === worker) {
          impactWorkerRef.current = null;
        }

        if (type === 'complete') {
          resolve(result);
        } else if (type === 'error') {
          reject(new Error(error?.message || 'Impact assessment worker failed'));
        }
      };

      worker.onerror = (error) => {
        worker.terminate();
        if (impactWorkerRef.current === worker) {
          impactWorkerRef.current = null;
        }
        reject(new Error(error?.message || 'Impact assessment worker failed'));
      };

      worker.postMessage({ id: runId, payload: requestPayload });
    });
  };

  const runImpactAssessmentLocally = async (requestPayload, facilityData, disastersToAssess) => {
    console.log('Impact assessment: running in a worker to avoid blocking the UI');
    setImpactProgress({
      phase: 'starting',
      processedFacilities: 0,
      totalFacilities: requestPayload?.facilities?.length || 0,
      impactedFacilities: 0
    });

    let data;
    try {
      data = await runImpactAssessmentInWorker(requestPayload);
    } catch (workerError) {
      console.warn('Impact assessment worker unavailable, falling back to main thread:', workerError);
      data = await runImpactAssessmentOnMainThread(requestPayload);
    }

    lastImpactPayloadRef.current = JSON.stringify(requestPayload);
    lastImpactResultRef.current = data;
    applyImpactAssessmentResult(facilityData, data, disastersToAssess);
  };

  const sanitizeDistrictLabel = (value, fallback = '') => {
    if (value === null || value === undefined) return fallback;

    const cleaned = String(value)
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || fallback;
  };

  const [disasters, setDisasters] = useState([]);
  const [filteredDisasters, setFilteredDisasters] = useState([]);
  const [outbreakReports, setOutbreakReports] = useState([]);
  const [outbreaks, setOutbreaks] = useState([]);
  const [filteredOutbreaks, setFilteredOutbreaks] = useState([]);
  const [gdacsDiagnostics, setGdacsDiagnostics] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [impactedFacilities, setImpactedFacilities] = useState([]);
  const [impactStatistics, setImpactStatistics] = useState(null);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [recommendationsAIGenerated, setRecommendationsAIGenerated] = useState(false);
  const [sitrep, setSitrep] = useState('');
  const [sitrepTimestamp, setSitrepTimestamp] = useState(null);
  const [loading, setLoading] = useState({
    disasters: true,
    outbreaks: false,
    outbreaksBackfill: false,
    impact: false,
    recommendations: false,
    sitrep: false
  });
  const [impactProgress, setImpactProgress] = useState(null);
  const [workspaceRestoreProgress, setWorkspaceRestoreProgress] = useState(null);
  const outbreakFetchRunRef = useRef(0);
  const [activeTab, setActiveTab] = useState('map');
  const [dataSource, setDataSource] = useState('');
  const [dateFilter, setDateFilter] = useState('30d'); // default to recent operational updates
  const [fetchError, setFetchError] = useState(null);
  const [showHelp, setShowHelp] = useState(false); // Help panel visibility
  const [showAppHub, setShowAppHub] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false); // Chat drawer visibility
  const [showPredictions, setShowPredictions] = useState(false); // Prediction dashboard visibility
  const [showOperationalOutlook, setShowOperationalOutlook] = useState(false); // Operational outlook dashboard visibility
  const [showPrioritizationBoard, setShowPrioritizationBoard] = useState(false); // Prioritization board visibility
  const [showTrendAnalysis, setShowTrendAnalysis] = useState(false); // Trend analysis dashboard visibility
  const [showSitrepModal, setShowSitrepModal] = useState(false); // Sitrep modal visibility
  const [completeReport, setCompleteReport] = useState(null); // Store combined AI report
  const [lastUpdated, setLastUpdated] = useState(null); // Track when data was last updated
  const [timeSinceUpdate, setTimeSinceUpdate] = useState(''); // Human-readable time since last update
  const [aiAnalysisFields, setAiAnalysisFields] = useState([]); // Track which fields are selected for AI analysis

  // ACLED security data state
  const [acledData, setAcledData] = useState([]); // ACLED conflict/security events
  const [acledEnabled, setAcledEnabled] = useState(true); // Toggle ACLED in analysis
  const [acledConfig, setAcledConfig] = useState({
    dateRange: 60, // days to consider
    eventTypes: ['Battles', 'Explosions/Remote violence', 'Violence against civilians', 'Riots'],
    showOnMap: true,
    selectedCountries: [], // Filter by countries
    selectedRegions: [] // Filter by regions (admin1)
  });

  // District boundaries from shapefile upload
  const [districts, setDistricts] = useState([]);
  const [districtAvailableFields, setDistrictAvailableFields] = useState([]);
  const [districtLabelField, setDistrictLabelField] = useState(null);
  const [districtRawData, setDistrictRawData] = useState([]); // Store original district data for remapping
  const [selectedDistrictForForecast, setSelectedDistrictForForecast] = useState(null); // For district-specific forecast
  const [selectedDistrictForOutlook, setSelectedDistrictForOutlook] = useState(null); // For district-specific operational outlook

  // WorldPop population data (lifted from MapComponent)
  const [worldPopData, setWorldPopData] = useState({});
  const [worldPopLastFetch, setWorldPopLastFetch] = useState(null);

  // OSM infrastructure data (lifted from MapComponent)
  const [osmData, setOsmData] = useState(null);
  const [selectedAnalysisDistricts, setSelectedAnalysisDistricts] = useState([]);
  const [latestPrioritizationBoard, setLatestPrioritizationBoard] = useState(null);
  const [enabledEvidenceLayers, setEnabledEvidenceLayers] = useState([]);
  const workspaceRestoredRef = useRef(false);
  const workspaceHydratingRef = useRef(false);
  const workspaceSaveTimeoutRef = useRef(null);
  const skipNextWorkspaceSaveRef = useRef(false);
  const workspaceRestoreClearTimeoutRef = useRef(null);
  const skipNextAutoImpactAssessmentRef = useRef({ disasters: false, acled: false });

  useEffect(() => {
    return () => {
      impactWorkerRunIdRef.current += 1;
      impactWorkerRef.current?.terminate();
      impactWorkerRef.current = null;
      if (workspaceSaveTimeoutRef.current) {
        window.clearTimeout(workspaceSaveTimeoutRef.current);
        workspaceSaveTimeoutRef.current = null;
      }
      if (workspaceRestoreClearTimeoutRef.current) {
        window.clearTimeout(workspaceRestoreClearTimeoutRef.current);
        workspaceRestoreClearTimeoutRef.current = null;
      }
    };
  }, []);

  const updateWorkspaceRestoreProgress = (nextProgress) => {
    setWorkspaceRestoreProgress((previous) => ({
      phase: 'Restoring saved workspace',
      step: 0,
      totalSteps: 1,
      percent: 0,
      counts: {},
      ...previous,
      ...nextProgress
    }));
  };

  const filteredAcledData = useMemo(() => {
    if (!acledData || acledData.length === 0 || !acledEnabled) {
      return [];
    }

    const allDates = acledData
      .map((event) => new Date(event.event_date))
      .filter((date) => !isNaN(date.getTime()));

    const mostRecentDate = allDates.length > 0
      ? new Date(Math.max(...allDates))
      : new Date();

    const dateRange = acledConfig.dateRange || 60;
    const cutoffDate = new Date(mostRecentDate);
    cutoffDate.setDate(cutoffDate.getDate() - dateRange);

    const eventTypeFilter = acledConfig.eventTypes || [];
    const selectedCountries = acledConfig.selectedCountries || [];
    const selectedRegions = acledConfig.selectedRegions || [];

    return acledData.filter((event) => {
      const eventDate = new Date(event.event_date);
      if (eventDate < cutoffDate) return false;

      if (eventTypeFilter.length > 0 && !eventTypeFilter.includes(event.event_type)) {
        return false;
      }

      if (selectedCountries.length > 0 && !selectedCountries.includes(event.country)) {
        return false;
      }

      if (selectedRegions.length > 0 && !selectedRegions.includes(event.admin1)) {
        return false;
      }

      if (!event.latitude || !event.longitude) return false;

      return true;
    }).sort((a, b) => {
      const aTime = new Date(a.event_date).getTime() || 0;
      const bTime = new Date(b.event_date).getTime() || 0;
      return bTime - aTime;
    });
  }, [acledData, acledEnabled, acledConfig]);
  const scopedAcledData = useMemo(
    () => selectedAnalysisDistricts.length > 0
      ? filterItemsToDistricts(filteredAcledData, selectedAnalysisDistricts, 'latitude', 'longitude')
      : filteredAcledData,
    [filteredAcledData, selectedAnalysisDistricts]
  );
  const canUseDistrictDecisionTools = districts.length > 0 && selectedAnalysisDistricts.length > 0;
  const hasSitrepContext = (
    impactedFacilities.length > 0 ||
    filteredDisasters.length > 0 ||
    disasters.length > 0 ||
    filteredOutbreaks.length > 0 ||
    outbreaks.length > 0 ||
    districts.length > 0
  );
  const canOpenSitrep = hasSitrepContext && (
    facilities.length > 0 || selectedAnalysisDistricts.length > 0
  );

  // Toast notifications
  const { toasts, addToast, dismissToast } = useToast();

  // First-time onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem('gdacs_onboarding_done')) {
        setShowOnboarding(true);
      }
    } catch (_) {}
  }, []);
  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    try { localStorage.setItem('gdacs_onboarding_done', '1'); } catch (_) {}
  };

  // Operation type state (for multi-use humanitarian operations)
  const [operationType, setOperationType] = useState('');
  useEffect(() => {
    let mounted = true;

    const restoreWorkspace = async () => {
      try {
        workspaceHydratingRef.current = true;
        updateWorkspaceRestoreProgress({
          phase: 'Reading saved workspace',
          step: 1,
          totalSteps: 7,
          percent: 8
        });
        await yieldToBrowser();

        const cachedWorkspace = await loadWorkspace();
        if (!mounted) return;

        if (!cachedWorkspace) {
          workspaceHydratingRef.current = false;
          workspaceRestoredRef.current = true;
          setWorkspaceRestoreProgress(null);
          return;
        }

        const restoredDistricts = cachedWorkspace.districts || [];
        const restoredConfig = cachedWorkspace.config || {};
        const restoredFacilities = cachedWorkspace.facilities || [];
        const restoredImpactedFacilities = cachedWorkspace.impactedFacilities || [];
        const restoredAcledData = cachedWorkspace.acledData || [];
        const restoredSelectedDistricts = cachedWorkspace.selectedAnalysisDistricts || [];
        const restoredWorldPopData = cachedWorkspace.worldPopData || {};
        const restoredOsmData = cachedWorkspace.osmData || null;

        updateWorkspaceRestoreProgress({
          phase: 'Restoring sites and security events',
          step: 2,
          totalSteps: 7,
          percent: 24,
          counts: {
            sites: restoredFacilities.length,
            impactedSites: restoredImpactedFacilities.length,
            acledEvents: restoredAcledData.length,
            adminAreas: restoredDistricts.length,
            selectedAdminAreas: restoredSelectedDistricts.length,
            worldPopAreas: Object.keys(restoredWorldPopData || {}).length,
            osmFeatures: restoredOsmData?.features?.length || 0
          }
        });

        setFacilities(restoredFacilities);
        setImpactedFacilities(restoredImpactedFacilities);
        setAcledData(restoredAcledData);
        setEnabledEvidenceLayers(cachedWorkspace.enabledEvidenceLayers || []);
        setOperationType(cachedWorkspace.operationType || '');
        setAiAnalysisFields(Array.isArray(restoredConfig.aiAnalysisFields) ? restoredConfig.aiAnalysisFields : []);
        setAcledEnabled(restoredConfig.acledEnabled !== undefined ? restoredConfig.acledEnabled : true);

        if (restoredConfig.acledConfig && typeof restoredConfig.acledConfig === 'object') {
          setAcledConfig(restoredConfig.acledConfig);
        }

        await yieldToBrowser();
        if (!mounted) return;

        updateWorkspaceRestoreProgress({
          phase: 'Restoring admin boundaries',
          step: 3,
          totalSteps: 7,
          percent: 42
        });

        if (restoredDistricts.length > 0) {
          setDistricts(restoredDistricts);
          setDistrictRawData(restoredDistricts);
          if (restoredDistricts[0]?.properties) {
            setDistrictAvailableFields(Object.keys(restoredDistricts[0].properties));
          }
        }

        if (restoredConfig.districtLabelField) {
          setDistrictLabelField(restoredConfig.districtLabelField);
        }

        await yieldToBrowser();
        if (!mounted) return;

        updateWorkspaceRestoreProgress({
          phase: 'Restoring selected analysis scope',
          step: 4,
          totalSteps: 7,
          percent: 58
        });

        setSelectedAnalysisDistricts(restoredSelectedDistricts);

        await yieldToBrowser();
        if (!mounted) return;

        updateWorkspaceRestoreProgress({
          phase: 'Restoring population context',
          step: 5,
          totalSteps: 7,
          percent: 72
        });

        setWorldPopData(restoredWorldPopData);
        setWorldPopLastFetch(cachedWorkspace.worldPopLastFetch || null);

        await yieldToBrowser();
        if (!mounted) return;

        updateWorkspaceRestoreProgress({
          phase: 'Restoring OSM infrastructure',
          step: 6,
          totalSteps: 7,
          percent: 86
        });

        setOsmData(restoredOsmData);

        await yieldToBrowser();
        if (!mounted) return;

        updateWorkspaceRestoreProgress({
          phase: 'Preparing map layers',
          step: 7,
          totalSteps: 7,
          percent: 100
        });

        workspaceHydratingRef.current = false;
        workspaceRestoredRef.current = true;
        skipNextWorkspaceSaveRef.current = true;
        skipNextAutoImpactAssessmentRef.current = { disasters: true, acled: true };
        workspaceRestoreClearTimeoutRef.current = window.setTimeout(() => {
          workspaceRestoreClearTimeoutRef.current = null;
          setWorkspaceRestoreProgress(null);
        }, 900);
        console.log('Workspace restored from IndexedDB:', {
          districts: restoredDistricts.length,
          facilities: restoredFacilities.length,
          impactedFacilities: restoredImpactedFacilities.length,
          acledEvents: restoredAcledData.length
        });
      } catch (error) {
        console.error('Error restoring workspace:', error);
        workspaceHydratingRef.current = false;
        workspaceRestoredRef.current = true;
        setWorkspaceRestoreProgress(null);
      }
    };

    // Restore the user's saved workspace shortly after first paint. This is the
    // data the user is actually waiting for, so keep the pre-delay small — just
    // enough to let the initial frame render — rather than a full second.
    const cancelRestore = scheduleCacheRestore(() => {
      if (!shouldSkipCacheRestore()) {
        restoreWorkspace();
      } else {
        workspaceRestoredRef.current = true;
      }
    }, 250);

    return () => {
      mounted = false;
      workspaceHydratingRef.current = false;
      cancelRestore();
    };
  }, []);

  useEffect(() => {
    if (!workspaceRestoredRef.current) return;
    if (workspaceHydratingRef.current) return;
    if (skipNextWorkspaceSaveRef.current) {
      skipNextWorkspaceSaveRef.current = false;
      return;
    }

    if (workspaceSaveTimeoutRef.current) {
      window.clearTimeout(workspaceSaveTimeoutRef.current);
    }

    workspaceSaveTimeoutRef.current = window.setTimeout(() => {
      workspaceSaveTimeoutRef.current = null;
      saveWorkspace({
      districts,
      facilities,
      impactedFacilities,
      worldPopData,
      worldPopLastFetch,
      osmData,
      acledData,
      selectedAnalysisDistricts,
      enabledEvidenceLayers,
      operationType,
      config: {
        acledEnabled,
        acledConfig,
        aiAnalysisFields,
        districtLabelField
      }
      }).then((saved) => {
        if (!saved) addToast('Workspace changes could not be saved on this device. Check browser storage before closing.', 'error');
      });
    }, 1200);
  }, [
    districts,
    facilities,
    impactedFacilities,
    worldPopData,
    worldPopLastFetch,
    osmData,
    acledData,
    selectedAnalysisDistricts,
    enabledEvidenceLayers,
    operationType,
    acledEnabled,
    acledConfig,
    aiAnalysisFields,
    districtLabelField
  ]);

  // Update the "time since" last data refresh
  useEffect(() => {
    if (!lastUpdated) return;
    
    const updateTimeSince = () => {
      const now = new Date();
      const diffMs = now - lastUpdated;
      const diffMinutes = Math.floor(diffMs / 60000);
      
      if (diffMinutes < 1) {
        setTimeSinceUpdate('just now');
      } else if (diffMinutes === 1) {
        setTimeSinceUpdate('1 minute ago');
      } else if (diffMinutes < 60) {
        setTimeSinceUpdate(`${diffMinutes} minutes ago`);
      } else {
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours === 1) {
          setTimeSinceUpdate('1 hour ago');
        } else if (diffHours < 24) {
          setTimeSinceUpdate(`${diffHours} hours ago`);
        } else {
          const diffDays = Math.floor(diffHours / 24);
          setTimeSinceUpdate(`${diffDays} day${diffDays > 1 ? 's' : ''} ago`);
        }
      }
    };
    
    // Update immediately
    updateTimeSince();
    
    // Then update every minute
    const interval = setInterval(updateTimeSince, 60000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Per-layer freshness state for the DataFreshnessBar. Each layer reports an
  // honest state (live / cached / loading / unavailable / off) so field users
  // can see at a glance whether the data behind a decision is fresh or stale.
  const dataLayers = useMemo(() => {
    const updatedTs = lastUpdated ? lastUpdated.getTime() : null;

    // GDACS: infer state from the human-readable dataSource string the fetch sets.
    let gdacsState = 'off';
    if (loading.disasters) {
      gdacsState = 'loading';
    } else if (/cached/i.test(dataSource)) {
      gdacsState = 'cached';
    } else if (/unavailable/i.test(dataSource)) {
      gdacsState = 'unavailable';
    } else if (disasters.length > 0) {
      gdacsState = 'live';
    }

    let outbreaksState = 'off';
    if (loading.outbreaks) outbreaksState = 'loading';
    else if (outbreaks.length > 0) outbreaksState = 'live';

    let acledState = 'off';
    if (acledEnabled && acledData.length > 0) acledState = 'live';

    let districtsState = 'off';
    if (districts.length > 0) districtsState = 'live';

    return [
      { name: 'Disasters', state: gdacsState, count: disasters.length, timestamp: updatedTs },
      { name: 'Outbreaks', state: outbreaksState, count: outbreaks.length },
      { name: 'ACLED', state: acledState, count: acledData.length, detail: acledEnabled ? undefined : 'disabled in analysis' },
      { name: 'Districts', state: districtsState, count: districts.length },
    ];
  }, [loading.disasters, loading.outbreaks, dataSource, disasters.length, outbreaks.length, acledEnabled, acledData.length, districts.length, lastUpdated]);

  // Filter disasters when disaster data or date filter changes
  useEffect(() => {
    if (workspaceHydratingRef.current) return;

    const nextFilteredDisasters = filterDisastersByDate(dateFilter);
    filterOutbreaksByDate(dateFilter);

    // Re-assess impact when filter changes if facilities are available
    if (facilities.length > 0) {
      if (skipNextAutoImpactAssessmentRef.current.disasters) {
        skipNextAutoImpactAssessmentRef.current = {
          ...skipNextAutoImpactAssessmentRef.current,
          disasters: false
        };
        return;
      }

      assessImpact(facilities, { disastersOverride: nextFilteredDisasters });
    }
  }, [disasters, outbreaks, dateFilter]);

  // Re-assess impact when ACLED data or enabled state changes
  useEffect(() => {
    if (workspaceHydratingRef.current) return;

    if (facilities.length > 0) {
      if (skipNextAutoImpactAssessmentRef.current.acled) {
        skipNextAutoImpactAssessmentRef.current = {
          ...skipNextAutoImpactAssessmentRef.current,
          acled: false
        };
        console.log('Skipping initial ACLED impact assessment after workspace restore');
        return;
      }

      console.log('ACLED data/state changed - re-assessing facility impacts...', {
        acledEvents: acledData.length,
        acledEnabled: acledEnabled
      });
      assessImpact(facilities);
    }
  }, [acledData, acledEnabled]);

  // Initialize with disaster data on mount.
  // GDACS is required for baseline context; outbreaks are gated behind the
  // Map Layers "WHO Outbreaks" toggle and fired via onOutbreakLayerEnable.
  useEffect(() => {
    (async () => {
      await hydrateGdacsFromCache();
      fetchDisasterData();
    })();
    hydrateOutbreaksFromCache();
  }, []);

  // On a live-fetch failure, fall back to the last cached GDACS feed instead of
  // blanking the map. Returns true if cached data was applied.
  const fallbackToCachedGdacs = async (reason) => {
    try {
      const cached = await loadGdacs();
      if (cached && Array.isArray(cached.disasters) && cached.disasters.length > 0) {
        setDisasters(cached.disasters);
        setFilteredDisasters(filterDisastersByDate(dateFilter, cached.disasters, false));
        setDataSource(`Cached GDACS data (${cached.disasters.length} events — live feed unavailable)`);
        setFetchError(`${reason} Showing the last cached disaster data.`);
        return true;
      }
    } catch (cacheError) {
      console.warn('GDACS cache fallback failed:', cacheError);
    }
    setDisasters([]);
    setFilteredDisasters([]);
    setDataSource('GDACS data unavailable');
    setFetchError(`${reason} No cached disaster data is available.`);
    return false;
  };

  // Fetch GDACS disaster data
  const fetchDisasterData = async () => {
    try {
      setLoading(prev => ({ ...prev, disasters: true }));
      setFetchError(null);

      const cacheAge = gdacsClientRequestCache
        ? Date.now() - gdacsClientRequestCache.savedAt
        : Number.POSITIVE_INFINITY;
      let data;

      if (gdacsClientRequestCache && cacheAge < GDACS_CLIENT_CACHE_MS) {
        data = gdacsClientRequestCache.data;
      } else {
        if (!gdacsClientRequestPromise) {
          gdacsClientRequestPromise = fetch('/api/gdacs', { cache: 'no-store' })
            .then(async (response) => {
              if (!response.ok) {
                throw new Error(`GDACS API unavailable (status ${response.status})`);
              }
              const payload = await parseApiResponse(response, 'GDACS API');
              gdacsClientRequestCache = {
                data: payload,
                savedAt: Date.now()
              };
              return payload;
            })
            .finally(() => {
              gdacsClientRequestPromise = null;
            });
        }

        try {
          data = await gdacsClientRequestPromise;
        } catch (requestError) {
          console.warn(`${requestError.message}. Falling back to cached disaster data.`);
          await fallbackToCachedGdacs('GDACS servers are temporarily unavailable.');
          return;
        }
      }

      if (!data || !Array.isArray(data)) {
        console.warn('Invalid GDACS data format. Falling back to cached disaster data.');
        await fallbackToCachedGdacs('GDACS returned invalid data.');
        return;
      }

      // Filter to events with valid coordinates
      const processedData = data
        .filter(d => d.latitude !== null && d.longitude !== null &&
          !isNaN(parseFloat(d.latitude)) && !isNaN(parseFloat(d.longitude)))
        .map(d => ({
          ...d,
          latitude: typeof d.latitude === 'string' ? parseFloat(d.latitude) : d.latitude,
          longitude: typeof d.longitude === 'string' ? parseFloat(d.longitude) : d.longitude,
        }));

      const initiallyFilteredDisasters = filterDisastersByDate(dateFilter, processedData, false);

      setDisasters(processedData);
      setFilteredDisasters(initiallyFilteredDisasters);
      setDataSource(`Live GDACS data (${processedData.length} events)`);
      saveGdacs({ disasters: processedData }).catch(() => {});
      const primarySourceLabel = processedData[0]?.primarySource === 'rss_fallback' ? 'RSS fallback' : 'CAP/RSS feed';
      setGdacsDiagnostics({
        fetchedTotal: processedData.length,
        primarySourceLabel,
        primaryOnly: processedData.filter(event => event.dataSources?.length === 1 && event.dataSources.includes(processedData[0]?.primarySource === 'rss_fallback' ? 'rss' : 'cap')).length,
        jsonOnly: processedData.filter(event => event.dataSources?.length === 1 && event.dataSources.includes('json_api')).length,
        enriched: processedData.filter(event => event.enriched).length,
        withGeometryUrl: processedData.filter(event => Boolean(event.geometryUrl)).length,
        lastFetchAt: new Date().toISOString()
      });

      // Set last updated from most recent event modification date (when GDACS last updated any event)
      const sorted = [...processedData].sort((a, b) => {
        const dateA = b.lastModified || b.pubDate;
        const dateB = a.lastModified || a.pubDate;
        return (dateA ? new Date(dateA) : 0) - (dateB ? new Date(dateB) : 0);
      });
      const mostRecentDate = sorted[0]?.lastModified || sorted[0]?.pubDate;
      setLastUpdated(mostRecentDate ? new Date(mostRecentDate) : new Date());

    } catch (error) {
      console.error('Error fetching disaster data:', error);
      await fallbackToCachedGdacs('Could not reach the GDACS feed.');
    } finally {
      setLoading(prev => ({ ...prev, disasters: false }));
    }
  };

  const normalizeOutbreakPayload = (data) => {
    const reports = Array.isArray(data?.reports) ? data.reports : [];
    const features = Array.isArray(data?.mapFeatures)
      ? data.mapFeatures
      : reports.flatMap(expandOutbreakMapFeatures);

    const validFeatures = features
      .filter((item) => item.latitude !== null && item.longitude !== null)
      .map((item) => ({
        ...item,
        latitude: typeof item.latitude === 'string' ? parseFloat(item.latitude) : item.latitude,
        longitude: typeof item.longitude === 'string' ? parseFloat(item.longitude) : item.longitude
      }))
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

    return { reports, validFeatures };
  };

  const mergeOutbreakReports = (currentReports = [], nextReports = []) => {
    const byId = new Map();
    [...currentReports, ...nextReports].forEach((report) => {
      const key = report.id || report.sourceUrl || report.title;
      if (key && !byId.has(key)) byId.set(key, report);
    });
    return Array.from(byId.values());
  };

  const mergeOutbreakFeatures = (currentFeatures = [], nextFeatures = []) => {
    const byId = new Map();
    [...currentFeatures, ...nextFeatures].forEach((feature) => {
      const key = feature.id || [
        feature.reportId,
        feature.title,
        feature.locationName,
        feature.country,
        feature.latitude,
        feature.longitude
      ].filter(Boolean).join('|');
      if (key) byId.set(key, feature);
    });
    return Array.from(byId.values());
  };

  const fetchOutbreakPage = async ({ limit, skip = 0, geocodeLimit, detailLocations = true, aiLocations = false }) => {
    const params = new URLSearchParams({
      ts: String(Date.now()),
      limit: String(limit),
      skip: String(skip),
      detailLocations: detailLocations ? 'true' : 'false',
      aiLocations: aiLocations ? 'true' : 'false'
    });
    if (Number.isFinite(geocodeLimit)) params.set('geocodeLimit', String(geocodeLimit));

    const response = await fetch(`/api/who-outbreaks?${params.toString()}`, {
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`WHO outbreaks unavailable (status ${response.status})`);
    }

    const data = await parseApiResponse(response, 'WHO outbreaks');
    return {
      ...normalizeOutbreakPayload(data),
      diagnostics: data?.diagnostics || null
    };
  };

  const hydrateGdacsFromCache = async () => {
    try {
      const cached = await loadGdacs();
      if (!cached || !Array.isArray(cached.disasters) || cached.disasters.length === 0) return;
      setDisasters(cached.disasters);
      setFilteredDisasters(filterDisastersByDate(dateFilter, cached.disasters, false));
      setDataSource(`Cached GDACS data (${cached.disasters.length} events, refreshing…)`);
    } catch (error) {
      console.warn('GDACS cache hydrate failed:', error);
    }
  };

  const hydrateOutbreaksFromCache = async () => {
    try {
      const cached = await loadOutbreaks();
      if (!cached || !Array.isArray(cached.features) || cached.features.length === 0) return;
      setOutbreakReports(cached.reports || []);
      setOutbreaks(cached.features);
      setFilteredOutbreaks(filterOutbreaksByDate(dateFilter, cached.features, false));
    } catch (error) {
      console.warn('Outbreak cache hydrate failed:', error);
    }
  };

  const fetchOutbreakData = async () => {
    const fetchRunId = outbreakFetchRunRef.current + 1;
    outbreakFetchRunRef.current = fetchRunId;

    try {
      setLoading(prev => ({ ...prev, outbreaks: true }));

      const initialPage = await fetchOutbreakPage({
        limit: 10,
        skip: 0,
        geocodeLimit: 20,
        detailLocations: false
      });
      if (outbreakFetchRunRef.current !== fetchRunId) return;

      setOutbreakReports(initialPage.reports);
      setOutbreaks(initialPage.validFeatures);
      const initiallyFilteredOutbreaks = filterOutbreaksByDate(dateFilter, initialPage.validFeatures, false);
      setFilteredOutbreaks(initiallyFilteredOutbreaks);
      setLoading(prev => ({ ...prev, outbreaks: false, outbreaksBackfill: true }));

      console.log('🦠 WHO OUTBREAKS INITIAL PAGE LOADED:', {
        reports: initialPage.reports.length,
        mapFeatures: initialPage.validFeatures.length,
        filtered: initiallyFilteredOutbreaks.length,
        dateFilter,
        diagnostics: initialPage.diagnostics,
        recentItems: initialPage.validFeatures
          .sort((a, b) => new Date(b.filterDate || 0) - new Date(a.filterDate || 0))
          .slice(0, 5)
          .map((item) => ({
            title: item.title,
            country: item.country,
            filterDate: item.filterDate,
            updatedDate: item.updatedDate,
            reportDate: item.reportDate,
            daysAgo: item.filterDate ? Math.floor((Date.now() - new Date(item.filterDate).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A'
          }))
      });

      try {
        const backfillPage = await fetchOutbreakPage({
          limit: 100,
          skip: 0,
          geocodeLimit: 80,
          aiLocations: true
        });
        if (outbreakFetchRunRef.current !== fetchRunId) return;

        let mergedReports;
        setOutbreakReports((currentReports) => {
          mergedReports = mergeOutbreakReports(currentReports, backfillPage.reports);
          return mergedReports;
        });
        let mergedFeatures;
        setOutbreaks((currentFeatures) => {
          mergedFeatures = mergeOutbreakFeatures(currentFeatures, backfillPage.validFeatures);
          setFilteredOutbreaks(filterOutbreaksByDate(dateFilter, mergedFeatures, false));
          return mergedFeatures;
        });

        if (mergedFeatures?.length) {
          saveOutbreaks({ features: mergedFeatures, reports: mergedReports || [] }).catch(() => {});
        }

        console.log('🦠 WHO OUTBREAKS BACKFILL LOADED:', {
          reports: backfillPage.reports.length,
          mapFeatures: backfillPage.validFeatures.length,
          diagnostics: backfillPage.diagnostics
        });
      } catch (backfillError) {
        console.warn('WHO outbreak background load failed:', backfillError);
      } finally {
        if (outbreakFetchRunRef.current === fetchRunId) {
          setLoading(prev => ({ ...prev, outbreaksBackfill: false }));
        }
      }
    } catch (error) {
      console.error('Error fetching WHO outbreaks:', error);
      setOutbreakReports([]);
      setOutbreaks([]);
      setFilteredOutbreaks([]);
    } finally {
      if (outbreakFetchRunRef.current === fetchRunId) {
        setLoading(prev => ({ ...prev, outbreaks: false, outbreaksBackfill: false }));
      }
    }
  };

  // Filter disasters based on the selected date range
  const filterDisastersByDate = (filter, sourceDisasters = disasters, updateState = true) => {
    if (!sourceDisasters || sourceDisasters.length === 0) {
      if (updateState) {
        setFilteredDisasters([]);
      }
      return [];
    }

    if (filter === 'all') {
      console.log('Setting all disasters without filtering');
      if (updateState) {
        setFilteredDisasters(sourceDisasters);
      }
      return sourceDisasters;
    }
    
    const now = new Date();
    let cutoffDate;
    
    switch (filter) {
      case '24h':
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '48h':
        cutoffDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        break;
      case '72h':
        cutoffDate = new Date(now.getTime() - 72 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffDate = new Date(now.getTime() - 48 * 60 * 60 * 1000); // Default to 48h
    }
    
    const filtered = sourceDisasters.filter(disaster => {
      const disasterDate = getDisasterTimelineDate(disaster);
      if (!disasterDate) return false;
      return disasterDate >= cutoffDate;
    });

    if (updateState) {
      setFilteredDisasters(filtered);
    }

    return filtered;
  };

  const filterOutbreaksByDate = (filter, sourceOutbreaks = outbreaks, updateState = true) => {
    if (!sourceOutbreaks || sourceOutbreaks.length === 0) {
      if (updateState) {
        setFilteredOutbreaks([]);
      }
      return [];
    }

    if (filter === 'all') {
      if (updateState) {
        setFilteredOutbreaks(sourceOutbreaks);
      }
      return sourceOutbreaks;
    }

    const now = new Date();
    let cutoffDate;

    switch (filter) {
      case '24h':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '48h':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '72h':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Use the pre-computed WHO publication date from normalizeWhoOutbreakItem.
    const filtered = sourceOutbreaks.filter((outbreak) => {
      const filterDate = outbreak.filterDate ? new Date(outbreak.filterDate) : null;

      if (!filterDate || Number.isNaN(filterDate.getTime())) {
        console.log('Invalid filterDate for outbreak:', {
          title: outbreak.title,
          filterDate: outbreak.filterDate,
          reportDate: outbreak.reportDate,
          updatedDate: outbreak.updatedDate
        });
        return false;
      }

      const passes = filterDate >= cutoffDate;

      if (!passes && filter !== 'all') {
        console.log('Outbreak filtered out:', {
          title: outbreak.title,
          country: outbreak.country,
          filterDate: filterDate.toISOString(),
          cutoffDate: cutoffDate.toISOString(),
          diff: (cutoffDate - filterDate) / (1000 * 60 * 60 * 24) + ' days'
        });
      }

      return passes;
    });

    console.log('WHO outbreak date filter:', {
      filter,
      effectiveWindow: filter === 'all' ? 'all' : '30d minimum for WHO outbreak reports',
      cutoffDate: cutoffDate.toISOString(),
      sourceCount: sourceOutbreaks.length,
      filteredCount: filtered.length,
      sampleDates: sourceOutbreaks.slice(0, 5).map((outbreak) => ({
        title: outbreak.title,
        country: outbreak.country,
        filterDate: outbreak.filterDate,
        reportDate: outbreak.reportDate,
        updatedDate: outbreak.updatedDate,
        passesFilter: outbreak.filterDate && new Date(outbreak.filterDate) >= cutoffDate
      }))
    });

    if (updateState) {
      console.log('Setting filteredOutbreaks state:', {
        filter,
        count: filtered.length,
        samples: filtered.slice(0, 3).map(o => ({ title: o.title, country: o.country, filterDate: o.filterDate }))
      });
      setFilteredOutbreaks(filtered);
    }

    return filtered;
  };

  // Handle clearing cached facility data
  const handleClearCache = async () => {
    try {
      await clearWorkspace();

      // Clear all state
      setFacilities([]);
      setImpactedFacilities([]);
      setImpactStatistics(null);
      setOutbreakReports([]);
      setOutbreaks([]);
      setFilteredOutbreaks([]);
      setAiAnalysisFields([]);
      setSitrep('');
      setSitrepTimestamp(null);
      setSelectedFacility(null);
      setRecommendations(null);
      setRecommendationsAIGenerated(false);
      setDistricts([]);
      setDistrictRawData([]);
      setDistrictAvailableFields([]);
      setDistrictLabelField(null);
      setSelectedDistrictForForecast(null);
      setSelectedDistrictForOutlook(null);
      setWorldPopData({});
      setWorldPopLastFetch(null);
      setOsmData(null);
      setAcledData([]);
      setAcledEnabled(true);
      setAcledConfig({
        dateRange: 60,
        eventTypes: ['Battles', 'Explosions/Remote violence', 'Violence against civilians', 'Riots'],
        showOnMap: true,
        selectedCountries: [],
        selectedRegions: []
      });
      setSelectedAnalysisDistricts([]);
      setEnabledEvidenceLayers([]);
      setLatestPrioritizationBoard(null);
      setOperationType('');
      setCompleteReport(null);
      setActiveTab('map');
      setShowChatDrawer(false);
      setShowPredictions(false);
      setShowOperationalOutlook(false);
      setShowPrioritizationBoard(false);
      setShowTrendAnalysis(false);
      setShowSitrepModal(false);

      lastImpactPayloadRef.current = '';
      lastImpactResultRef.current = null;

      addToast('All cached data cleared.', 'success');
    } catch (error) {
      console.error('Error clearing cache:', error);
      addToast('Failed to clear cache. Please try again.', 'error');
    }
  };

  // Handle districts loaded from shapefile
  const handleDistrictsLoaded = (districtsData, availableFields, selectedField) => {
    setDistricts(districtsData);
    setDistrictRawData(districtsData); // Store raw data for remapping
    if (availableFields) {
      setDistrictAvailableFields(availableFields);
    }
    if (selectedField) {
      setDistrictLabelField(selectedField);
    }
  };

  // Handle label field change for districts
  const handleDistrictLabelFieldChange = (fieldName) => {
    if (!districtRawData || districtRawData.length === 0) {
      return;
    }

    // Remap districts using the new field
    const remappedDistricts = districtRawData.map(district => ({
      ...district,
      name: sanitizeDistrictLabel(district.properties[fieldName], district.name),
      labelField: fieldName,
      properties: {
        ...district.properties,
        displayName: sanitizeDistrictLabel(district.properties[fieldName], district.name)
      }
    }));

    setDistricts(remappedDistricts);
    setDistrictLabelField(fieldName);
  };

  // Handle ACLED data upload
  const handleAcledUpload = (csvData) => {
    try {
      // Parse CSV
      Papa.parse(csvData, {
        header: true,
        complete: async (results) => {
          // Validate and process ACLED data
          const validEvents = results.data.filter(event =>
            event.event_date &&
            !isNaN(parseFloat(event.latitude)) &&
            !isNaN(parseFloat(event.longitude)) &&
            event.event_type
          ).map(event => ({
            event_id: event.event_id_cnty || event.event_id,
            event_date: event.event_date,
            event_type: event.event_type,
            sub_event_type: event.sub_event_type,
            actor1: event.actor1,
            actor2: event.actor2,
            latitude: parseFloat(event.latitude),
            longitude: parseFloat(event.longitude),
            location: event.location,
            admin1: event.admin1,
            admin2: event.admin2,
            admin3: event.admin3,
            country: event.country,
            fatalities: parseInt(event.fatalities) || 0,
            notes: event.notes,
            source: event.source
          }));

          if (validEvents.length === 0) {
            addToast('No valid ACLED events found. Check that your CSV has event_date, latitude, longitude, and event_type columns.', 'error');
            return;
          }

          console.log(`Loaded ${validEvents.length} ACLED events`);

          // Update state (useEffect will trigger reassessment automatically)
          setAcledData(validEvents);
          setAcledEnabled(true);

          addToast(`${validEvents.length.toLocaleString()} ACLED security events loaded.`, 'success');
        },
        error: (error) => {
          console.error('Error parsing ACLED CSV:', error);
          addToast('Failed to parse ACLED CSV. Please check the file format.', 'error');
        }
      });
    } catch (error) {
      console.error('Error processing ACLED upload:', error);
      addToast('Failed to process ACLED data. Please try again.', 'error');
    }
  };

  // Handle clearing ACLED cache
  const handleClearAcledCache = () => {
    try {
      setAcledData([]);
      setAcledEnabled(true);
      setAcledConfig({
        dateRange: 60,
        eventTypes: ['Battles', 'Explosions/Remote violence', 'Violence against civilians', 'Riots'],
        showOnMap: true,
        selectedCountries: [],
        selectedRegions: []
      });
      addToast('Security event data cleared.', 'success');
    } catch (error) {
      console.error('Error clearing ACLED cache:', error);
      addToast('Failed to clear security data. Please try again.', 'error');
    }
  };

  // Toggle ACLED enabled/disabled
  const handleToggleAcled = (enabled) => {
    setAcledEnabled(enabled);
    // useEffect will trigger reassessment automatically when acledEnabled changes
  };

  // Handle ACLED config changes (date range, etc.)
  const handleAcledConfigChange = (newConfig) => {
    setAcledConfig(newConfig);
    console.log('ACLED config updated:', newConfig);
  };

  // Handle facility CSV upload
  const handleFacilityUpload = (csvData, columnSelections) => {
    try {
      // Store AI analysis fields for use in chat context
      if (columnSelections && columnSelections.aiAnalysisFields) {
        console.log('Storing AI analysis fields:', columnSelections.aiAnalysisFields);
        setAiAnalysisFields(columnSelections.aiAnalysisFields);
      }

      // Parse CSV
      Papa.parse(csvData, {
        header: true,
        complete: async (results) => {
          // Validate and process facility data
          const validFacilities = results.data.filter(facility =>
            facility.name &&
            !isNaN(parseFloat(facility.latitude)) &&
            !isNaN(parseFloat(facility.longitude))
          ).map(facility => {
            // Create a base object with required fields
            const facilityObject = {
              name: facility.name,
              latitude: parseFloat(facility.latitude),
              longitude: parseFloat(facility.longitude)
            };

            // Add all other fields from the CSV
            Object.keys(facility).forEach(key => {
              if (key !== 'name' && key !== 'latitude' && key !== 'longitude' && facility[key]) {
                facilityObject[key] = facility[key];
              }
            });

            return facilityObject;
          });

          if (validFacilities.length === 0) {
            addToast('No valid sites found. Ensure your CSV has name, latitude, and longitude columns.', 'error');
            return;
          }

          console.log(`Loaded ${validFacilities.length} facilities`);

          // Clear any existing sitrep when facilities change
          setSitrep('');

          // Update facilities and immediately assess impact
          setFacilities(validFacilities);
          assessImpact(validFacilities);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          addToast('Failed to parse CSV. Please check the file format.', 'error');
        }
      });
    } catch (error) {
      console.error('Error processing facility upload:', error);
      addToast('Failed to process site data. Please try again.', 'error');
    }
  };

  // Assess the impact of disasters on facilities
  const assessImpactRef = useRef(false); // Prevent concurrent calls
  const lastImpactPayloadRef = useRef('');
  const lastImpactResultRef = useRef(null);

  const applyImpactAssessmentResult = (facilityData, data, disastersToAssess) => {
    const facilityLookup = new Map(
      facilityData.map((facility) => [
        `${facility.name}__${facility.latitude}__${facility.longitude}`,
        facility
      ])
    );

    const mergedImpactedFacilities = (data.impactedFacilities || []).map((item) => {
      const key = `${item.facility?.name}__${item.facility?.latitude}__${item.facility?.longitude}`;
      const originalFacility = facilityLookup.get(key);

      return {
        ...item,
        facility: originalFacility
          ? { ...originalFacility, ...item.facility }
          : item.facility
      };
    });

    console.log(`Impact assessment found ${mergedImpactedFacilities.length || 0} impacted facilities`);

    setImpactedFacilities(mergedImpactedFacilities);

    if (data.statistics) {
      console.log('Impact assessment statistics:', data.statistics);
      setImpactStatistics(data.statistics);
    }

    console.log(`Applied impact assessment with ${dateFilter} date filter (${disastersToAssess.length} disasters)`);

    setSelectedFacility(null);
    setRecommendations(null);
  };

  const assessImpact = async (facilityData, options = {}) => {
    // Prevent multiple simultaneous assessments
    if (assessImpactRef.current) {
      console.log('Impact assessment already running, skipping...');
      return;
    }

    try {
      assessImpactRef.current = true;
      setLoading(prev => ({ ...prev, impact: true }));
      setImpactProgress(null);

      // Use filtered disasters instead of all disasters
      const disastersToAssess = options.disastersOverride || (filteredDisasters.length > 0 ? filteredDisasters : disasters);

      // Include ACLED events only if enabled and available
      const acledToAssess = options.acledOverride || filteredAcledData;
      const scopedFacilities = selectedAnalysisDistricts.length > 0
        ? filterFacilitiesToDistricts(facilityData, selectedAnalysisDistricts)
        : facilityData;
      const impactFacilities = buildImpactFacilitiesPayload(scopedFacilities);
      const impactDisasters = buildImpactDisastersPayload(disastersToAssess);
      const impactAcledEvents = buildImpactAcledPayload(acledToAssess);
      const requestPayload = {
        facilities: impactFacilities,
        disasters: impactDisasters,
        acledEvents: impactAcledEvents,
        districts: selectedAnalysisDistricts
      };
      const payloadJson = JSON.stringify(requestPayload);

      console.log(`Impact assessment: ${disastersToAssess.length} GDACS disasters + ${acledToAssess.length} ACLED events`);
      console.log('Impact assessment payload summary:', {
        facilities: scopedFacilities.length,
        disasters: disastersToAssess.length,
        acledEvents: acledToAssess.length,
        districts: selectedAnalysisDistricts.length,
        bytes: payloadJson.length
      });

      if (scopedFacilities.length === 0) {
        lastImpactPayloadRef.current = payloadJson;
        lastImpactResultRef.current = {
          impactedFacilities: [],
          statistics: {
            totalDisasters: disastersToAssess.length,
            totalFacilities: 0,
            impactedFacilityCount: 0,
            percentageImpacted: 0,
            disasterStats: [],
            overlappingImpacts: [],
            affectedDistricts: 0,
            estimatedAffectedPopulation: null
          }
        };
        applyImpactAssessmentResult(scopedFacilities, lastImpactResultRef.current, disastersToAssess);
        return;
      }

      if (lastImpactPayloadRef.current === payloadJson && lastImpactResultRef.current) {
        console.log('Impact assessment payload unchanged, reusing cached result');
        applyImpactAssessmentResult(scopedFacilities, lastImpactResultRef.current, disastersToAssess);
        return;
      }

      if (payloadJson.length > IMPACT_ASSESSMENT_REMOTE_PAYLOAD_LIMIT_BYTES) {
        await runImpactAssessmentLocally(requestPayload, scopedFacilities, disastersToAssess);
        return;
      }

      let data;

      try {
        const response = await fetch('/api/impact_assessment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payloadJson,
        });

        if (response.status === 413) {
          await runImpactAssessmentLocally(requestPayload, scopedFacilities, disastersToAssess);
          return;
        }

        data = await parseApiResponse(response, 'Impact assessment');
      } catch (error) {
        if (String(error?.message || '').includes('status 413')) {
          await runImpactAssessmentLocally(requestPayload, scopedFacilities, disastersToAssess);
          return;
        }
        throw error;
      }

      lastImpactPayloadRef.current = payloadJson;
      lastImpactResultRef.current = data;
      applyImpactAssessmentResult(scopedFacilities, data, disastersToAssess);
    } catch (error) {
      console.error('Error assessing impact:', error);
      addToast('Failed to assess site impact. Please try again.', 'error');
    } finally {
      assessImpactRef.current = false;
      setImpactProgress(null);
      setLoading(prev => ({ ...prev, impact: false }));
    }
  };

  // Generate recommendations for a selected facility
  const generateRecommendations = async (facility, impacts, useAI = true) => {
    try {
      setLoading(prev => ({ ...prev, recommendations: true }));
      
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          facility: facility,
          impacts: impacts,
          useAI: useAI
        }),
      });
      
      const data = await parseApiResponse(response, 'Recommendations');
      setRecommendations(data.recommendations || null);
      setRecommendationsAIGenerated(data.isAIGenerated || false);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      addToast('Failed to generate recommendations. Please try again.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, recommendations: false }));
    }
  };

  const compactSitrepImpactedFacilities = (items = [], maxItems = 75) =>
    (items || []).slice(0, maxItems).map((item) => ({
      facility: {
        name: item?.facility?.name,
        latitude: item?.facility?.latitude,
        longitude: item?.facility?.longitude,
        type: item?.facility?.type || item?.facility?.facilityType,
        country: item?.facility?.country,
        region: item?.facility?.region,
        district: item?.facility?.district
      },
      attributes: Object.fromEntries(
        Object.entries(item?.facility || {})
          .filter(([key, value]) => !['name', 'latitude', 'longitude', 'type', 'facilityType', 'country', 'region', 'district'].includes(key))
          .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
          .slice(0, 24)
      ),
      impacts: (item?.impacts || []).slice(0, 8).map((impact) => ({
        distance: impact?.distance,
        impactMethod: impact?.impactMethod,
        confidence: impact?.confidence,
        disaster: {
          eventType: impact?.disaster?.eventType,
          eventName: impact?.disaster?.eventName,
          title: impact?.disaster?.title,
          alertLevel: impact?.disaster?.alertLevel,
          severity: impact?.disaster?.severity,
          source: impact?.disaster?.source,
          event_date: impact?.disaster?.event_date
        }
      }))
    }));

  const buildSitrepSchemaSummary = (items = []) => {
    const records = (items || []).map((item) => item?.facility || item).filter(Boolean);
    const fieldCounts = {};
    const typeCounts = {};

    records.forEach((record) => {
      const recordType = record.type || record.facilityType || record.site_type || record.siteType || record.category || record.service_type || null;
      if (recordType) {
        const normalizedType = String(recordType).trim();
        if (normalizedType) {
          typeCounts[normalizedType] = (typeCounts[normalizedType] || 0) + 1;
        }
      }

      Object.entries(record).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return;
        if (['object', 'function'].includes(typeof value)) return;
        fieldCounts[key] = (fieldCounts[key] || 0) + 1;
      });
    });

    const preferredFieldMatchers = [
      'type', 'category', 'service', 'target', 'population', 'refusal', 'coverage', 'malaria',
      'stock', 'supply', 'capacity', 'status', 'team', 'dose', 'children', 'women', 'campaign'
    ];

    const keyFields = Object.entries(fieldCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([field]) => field)
      .sort((a, b) => {
        const aMatch = preferredFieldMatchers.findIndex((matcher) => a.toLowerCase().includes(matcher));
        const bMatch = preferredFieldMatchers.findIndex((matcher) => b.toLowerCase().includes(matcher));
        const aRank = aMatch === -1 ? 999 : aMatch;
        const bRank = bMatch === -1 ? 999 : bMatch;
        if (aRank !== bRank) return aRank - bRank;
        return a.localeCompare(b);
      })
      .slice(0, 18);

    return {
      recordCount: records.length,
      typeBreakdown: Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([label, count]) => ({ label, count })),
      keyFields
    };
  };

  const compactSitrepDisasters = (items = [], maxItems = 100) =>
    (items || []).slice(0, maxItems).map((item) => ({
      eventType: item?.eventType,
      eventName: item?.eventName,
      title: item?.title,
      alertLevel: item?.alertLevel,
      severity: item?.severity,
      country: item?.country,
      latitude: item?.latitude,
      longitude: item?.longitude,
      polygon: Array.isArray(item?.polygon) ? item.polygon.slice(0, 25) : undefined
    }));

  const compactSitrepOutbreaks = (items = [], maxItems = 80) =>
    (items || []).slice(0, maxItems).map((item) => ({
      title: item?.title,
      disease: item?.disease,
      reportDate: item?.reportDate,
      updatedDate: item?.updatedDate,
      country: item?.country,
      locationName: item?.locationName,
      locationType: item?.locationType,
      admin1: item?.admin1,
      locationConfidence: item?.locationConfidence,
      locationSnippet: item?.locationSnippet,
      affectedCountries: item?.affectedCountries,
      latitude: item?.latitude,
      longitude: item?.longitude,
      metrics: item?.metrics,
      reportMetrics: item?.reportMetrics,
      source: item?.source,
      sourceUrl: item?.sourceUrl
    }));

  const compactSitrepAcled = (items = [], maxItems = 100) =>
    (items || []).slice(0, maxItems).map((item) => ({
      event_date: item?.event_date,
      event_type: item?.event_type,
      sub_event_type: item?.sub_event_type,
      country: item?.country,
      admin1: item?.admin1,
      admin2: item?.admin2,
      location: item?.location,
      fatalities: item?.fatalities,
      actor1: item?.actor1,
      actor2: item?.actor2,
      source: item?.source,
      notes: item?.notes ? String(item.notes).slice(0, 160) : null
    }));

  const compactSitrepStatistics = (statistics = null) => {
    if (!statistics) return null;

    return {
      totalDisasters: statistics.totalDisasters,
      totalFacilities: statistics.totalFacilities,
      impactedFacilityCount: statistics.impactedFacilityCount,
      percentageImpacted: statistics.percentageImpacted,
      affectedDistricts: statistics.affectedDistricts,
      estimatedAffectedPopulation: statistics.estimatedAffectedPopulation,
      disasterStats: Array.isArray(statistics.disasterStats)
        ? statistics.disasterStats.slice(0, 25).map((item) => ({
            name: item?.name,
            type: item?.type,
            affectedFacilities: item?.affectedFacilities,
            impactArea: item?.impactArea,
            polygon: item?.polygon,
            source: item?.source
          }))
        : [],
      overlappingImpacts: Array.isArray(statistics.overlappingImpacts)
        ? statistics.overlappingImpacts.slice(0, 15).map((item) => ({
            disasters: Array.isArray(item?.disasters) ? item.disasters.slice(0, 3) : [],
            facilities: Array.isArray(item?.facilities) ? item.facilities.slice(0, 6) : []
          }))
        : []
    };
  };

  const compactSitrepDistricts = (items = [], maxItems = 100) =>
    (items || []).slice(0, maxItems).map((district) => {
      const properties = district?.properties || district || {};
      const compactProperties = Object.fromEntries(
        Object.entries(properties)
          .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
          .slice(0, 40)
      );

      return { properties: compactProperties };
    });

  const compactSitrepWorldPopData = (data = {}, maxEntries = 100) =>
    Object.fromEntries(Object.entries(data || {}).slice(0, maxEntries));

  const buildSitrepDistrictRiskSummary = (districtScope = [], disasterScope = [], acledScope = [], maxRows = 20) => {
    if (!Array.isArray(districtScope) || districtScope.length === 0) {
      return null;
    }

    const riskIndex = buildDistrictRiskIndex(districtScope, {
      disasters: disasterScope || [],
      acledData: acledScope || []
    });
    const seenDistrictIds = new Set();
    const rows = districtScope.map((district, index) => {
      const props = district?.properties || {};
      const districtName = district.name || props.ADM2_EN || props.NAME_2 || props.NAME || props.name || props.district || `Admin area ${index + 1}`;
      const risk = riskIndex[district.id] || riskIndex[districtName] || { level: 'none', score: 0, eventCount: 0, disasterCount: 0, acledCount: 0 };
      const stableId = String(district.id ?? districtName);
      if (seenDistrictIds.has(stableId)) return null;
      seenDistrictIds.add(stableId);

      return {
        district: districtName,
        region: district.region || props.ADM1_EN || props.NAME_1 || props.region || props.province || null,
        country: district.country || props.ADM0_EN || props.NAME_0 || props.country || null,
        level: risk.level || 'none',
        score: risk.score || 0,
        eventCount: risk.eventCount || 0,
        disasterCount: risk.disasterCount || 0,
        acledCount: risk.acledCount || 0
      };
    }).filter(Boolean);

    const riskBreakdown = rows.reduce((acc, row) => {
      acc[row.level] = (acc[row.level] || 0) + 1;
      return acc;
    }, { none: 0, low: 0, medium: 0, high: 0, 'very-high': 0 });

    const activeRows = rows
      .filter((row) => row.eventCount > 0 || row.score > 0)
      .sort((a, b) => b.score - a.score || b.eventCount - a.eventCount)
      .slice(0, maxRows);

    return {
      totalAdminAreas: rows.length,
      riskBreakdown,
      hazardSignalAdminAreas: rows.filter((row) => row.disasterCount > 0).length,
      securitySignalAdminAreas: rows.filter((row) => row.acledCount > 0).length,
      totalDisasterSignals: rows.reduce((sum, row) => sum + row.disasterCount, 0),
      totalSecuritySignals: rows.reduce((sum, row) => sum + row.acledCount, 0),
      topAdminAreas: activeRows
    };
  };

  const compactSitrepOsmData = (data = null, maxFeatures = 250) => {
    const features = data?.features || [];
    if (!features.length) return null;

    return {
      type: 'FeatureCollection',
      metadata: {
        totalFeatures: data?.metadata?.totalFeatures || features.length,
        byLayer: data?.metadata?.byLayer || {},
        requestedLayers: data?.metadata?.requestedLayers || []
      },
      features: features.slice(0, maxFeatures).map((feature) => ({
        geometry: feature?.geometry,
        properties: {
          name: feature?.properties?.name || feature?.properties?.tags?.name || null,
          category: feature?.properties?.category || null,
          priority: feature?.properties?.priority || null,
          tags: {
            name: feature?.properties?.tags?.name || null,
            amenity: feature?.properties?.tags?.amenity || null,
            healthcare: feature?.properties?.tags?.healthcare || null,
            highway: feature?.properties?.tags?.highway || null,
            bridge: feature?.properties?.tags?.bridge || null,
            aeroway: feature?.properties?.tags?.aeroway || null,
            power: feature?.properties?.tags?.power || null
          }
        }
      }))
    };
  };

  // Generate situation report
  const generateSitrep = async (forceRefresh = false) => {
    try {
      // Check cache if not forcing refresh
      if (!forceRefresh && sitrep && sitrepTimestamp) {
        console.log('Using cached sitrep');
        setActiveTab('sitrep');
        return;
      }

      setLoading(prev => ({ ...prev, sitrep: true }));

      const sitrepDistrictScope = selectedAnalysisDistricts.length > 0
        ? selectedAnalysisDistricts
        : (districtRawData || []);
      const hasAdminSitrepScope = sitrepDistrictScope.length > 0;
      const sitrepFacilitiesScope = hasAdminSitrepScope
        ? filterFacilitiesToDistricts(facilities, sitrepDistrictScope)
        : facilities;
      const sitrepImpactedScope = hasAdminSitrepScope
        ? filterImpactedFacilitiesToDistricts(impactedFacilities, sitrepDistrictScope)
        : impactedFacilities;
      const sitrepBaseDisasters = filteredDisasters.length > 0 ? filteredDisasters : disasters;
      const sitrepDisasterScope = hasAdminSitrepScope
        ? filterItemsToDistricts(sitrepBaseDisasters, sitrepDistrictScope, 'latitude', 'longitude')
        : sitrepBaseDisasters;
      const sitrepOutbreakScope = hasAdminSitrepScope
        ? filterItemsToDistricts(filteredOutbreaks, sitrepDistrictScope, 'latitude', 'longitude')
        : filteredOutbreaks;
      const sitrepAcledScope = acledEnabled && hasAdminSitrepScope
        ? filterItemsToDistricts(filteredAcledData, sitrepDistrictScope, 'latitude', 'longitude')
        : scopedAcledData;
      const sitrepOsmScope = hasAdminSitrepScope
        ? filterOsmDataToDistricts(osmData, sitrepDistrictScope)
        : osmData;
      const sitrepWorldPopScope = hasAdminSitrepScope
        ? getScopedWorldPopData(worldPopData, sitrepDistrictScope)
        : worldPopData;
      const sitrepDistrictRiskSummary = buildSitrepDistrictRiskSummary(
        sitrepDistrictScope,
        sitrepDisasterScope,
        sitrepAcledScope
      );

      const requestBody = JSON.stringify({
        impactedFacilities: compactSitrepImpactedFacilities(sitrepImpactedScope),
        disasters: compactSitrepDisasters(sitrepDisasterScope),
        outbreaks: compactSitrepOutbreaks(sitrepOutbreakScope),
        dateFilter: dateFilter,
        statistics: compactSitrepStatistics(impactStatistics),
        acledData: acledEnabled ? compactSitrepAcled(sitrepAcledScope) : [],
        osmData: compactSitrepOsmData(sitrepOsmScope),
        worldPopData: compactSitrepWorldPopData(sitrepWorldPopScope),
        worldPopYear: worldPopLastFetch?.year || null,
        districts: compactSitrepDistricts(sitrepDistrictScope),
        uploadedDistrictCount: sitrepDistrictScope.length,
        uploadedSiteCount: sitrepFacilitiesScope.length,
        districtRiskSummary: sitrepDistrictRiskSummary,
        uploadedDataSchema: buildSitrepSchemaSummary(sitrepFacilitiesScope),
        stream: true
      });

      console.log(`Sitrep request body size: ${(requestBody.length / 1024).toFixed(2)} KB`);

      const response = await fetch('/api/sitrep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      // Switch to the sitrep tab immediately so streamed text renders as it arrives.
      setActiveTab('sitrep');

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        setSitrep('');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;

            try {
              const parsed = JSON.parse(payload);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.content) {
                accumulated += parsed.content;
                setSitrep(accumulated);
              }
              if (parsed.done) {
                if (parsed.sitrep) {
                  accumulated = parsed.sitrep;
                  setSitrep(accumulated);
                }
              }
            } catch (parseError) {
              console.warn('Skipping malformed sitrep stream chunk:', parseError);
            }
          }
        }

        setSitrepTimestamp(Date.now());
      } else {
        // Fallback: non-streaming JSON response
        const data = await parseApiResponse(response, 'Situation report');
        setSitrep(data.sitrep || '');
        setSitrepTimestamp(Date.now());
      }
    } catch (error) {
      console.error('Error generating sitrep:', error);
      addToast('Failed to generate situation report. Please try again.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, sitrep: false }));
    }
  };

  const openSitrepModal = async (forceRefresh = false) => {
    if (!canOpenSitrep) return;
    setShowSitrepModal(true);
    await generateSitrep(forceRefresh);
  };

  // Handle facility selection
  const handleFacilitySelect = (facility) => {
    setSelectedFacility(facility);
    const selectedFacilityKey = getFacilityIdentityKey(facility);

    // Find the impacts for this facility
    const facilityImpact = impactedFacilities.find(
      impact => getFacilityIdentityKey(impact.facility) === selectedFacilityKey
    );
    
    if (facilityImpact) {
      generateRecommendations(facility, facilityImpact.impacts);
    } else {
      setRecommendations(null);
    }
  };

  // Handle refreshing data from GDACS
  // Impact reassessment is triggered automatically by the [disasters] effect above
  const handleRefreshData = () => {
    fetchDisasterData();
    fetchOutbreakData();
  };

  // Handle date filter change
  const handleDateFilterChange = (e) => {
    console.log(`Changing date filter from ${dateFilter} to ${e.target.value}`);
    setDateFilter(e.target.value);
    
    // Clear any existing sitrep when filter changes
    setSitrep('');
    
    // Map will be automatically refreshed via useEffect dependency on dateFilter
  };
  
  // Generate and download comprehensive AI report
  const generateCompleteReport = async () => {
    try {
      setLoading(prev => ({ ...prev, sitrep: true }));
      
      // Collect all available AI data
      let reportContent = '';
      const date = new Date().toISOString().split('T')[0];
      const time = new Date().toTimeString().split(' ')[0];
      
      // Start with header
      reportContent += `# Emergency Response Overview Report\n`;
      reportContent += `## Generated: ${date} | ${time} | Filter: ${dateFilter === '24h' ? 'Last 24h' : 
                                 dateFilter === '48h' ? 'Last 48h' : 
                                 dateFilter === '72h' ? 'Last 72h' : 
                                 dateFilter === '7d' ? 'Last 7 days' : 
                                 dateFilter === '30d' ? 'Last 30 days' : 'All time'}\n\n`;
      
      // Executive Summary Section
      reportContent += `# EXECUTIVE SUMMARY\n\n`;
      reportContent += `## Key Statistics\n`;
      reportContent += `- **Total Sites Monitored:** ${facilities.length}\n`;
      reportContent += `- **Sites Potentially Impacted:** ${impactedFacilities.length} (${Math.round((impactedFacilities.length/facilities.length)*100)}% of total)\n`;
      reportContent += `- **Total Active Disasters:** ${disasters.length}\n`;
      reportContent += `- **Active Disaster Alert Levels:** ${
        filteredDisasters.filter(d => 
          (d.alertLevel?.toLowerCase() === 'red') || 
          (d.severity?.toLowerCase()?.includes('extreme')) || 
          (d.severity?.toLowerCase()?.includes('severe'))).length
      } Red, ${
        filteredDisasters.filter(d => 
          (d.alertLevel?.toLowerCase() === 'orange') || 
          (d.severity?.toLowerCase()?.includes('moderate'))).length
      } Orange, ${
        filteredDisasters.filter(d => 
          (d.alertLevel?.toLowerCase() === 'green') || 
          (d.severity?.toLowerCase()?.includes('minor')) ||
          (!d.alertLevel && !d.severity)).length
      } Green\n\n`;
      
      // Add current disaster breakdown by type
      const disasterTypes = {};
      filteredDisasters.forEach(disaster => {
        const type = disaster.eventType?.toUpperCase() || 'Unknown';
        disasterTypes[type] = (disasterTypes[type] || 0) + 1;
      });
      
      reportContent += `## Active Disasters by Type\n`;
      Object.entries(disasterTypes).forEach(([type, count]) => {
        const fullName = getDisasterFullName(type);
        reportContent += `- **${fullName}:** ${count}\n`;
      });
      reportContent += `\n`;
      
      // Add situation report if available
      if (sitrep) {
        reportContent += `# Situation Overview\n\n${sitrep}\n\n`;
        reportContent += `---\n\n`;
      }
      
      // Group impacted facilities by disaster type, then by country and facility type
      const facilitiesByDisasterType = {};
      impactedFacilities.forEach(impact => {
        impact.impacts.forEach(disasterImpact => {
          const disasterType = disasterImpact.disaster?.eventType?.toUpperCase() || 'Unknown';
          if (!facilitiesByDisasterType[disasterType]) {
            facilitiesByDisasterType[disasterType] = {};
          }
          
          // Get country from facility data if available, otherwise "Unknown"
          const country = impact.facility.country || 
                         (impact.facility.address && impact.facility.address.includes(',') ? 
                          impact.facility.address.split(',').pop().trim() : "Unknown Location");
          
          if (!facilitiesByDisasterType[disasterType][country]) {
            facilitiesByDisasterType[disasterType][country] = {};
          }
          
          // Get facility type if available, otherwise "General"
          const facilityType = impact.facility.type || 
                              impact.facility.facilityType || 
                              impact.facility.category || 
                              "General";
                              
          if (!facilitiesByDisasterType[disasterType][country][facilityType]) {
            facilitiesByDisasterType[disasterType][country][facilityType] = [];
          }
          
          if (!facilitiesByDisasterType[disasterType][country][facilityType].includes(impact.facility)) {
            facilitiesByDisasterType[disasterType][country][facilityType].push(impact.facility);
          }
        });
      });
      
      // Add facilities impacted by disaster type section
      reportContent += `# IMPACT BREAKDOWN BY DISASTER TYPE\n\n`;
      Object.entries(facilitiesByDisasterType).forEach(([disasterType, countriesMap]) => {
        const fullName = getDisasterFullName(disasterType);
        
        // Count total facilities for this disaster type
        let totalFacilitiesForDisaster = 0;
        Object.values(countriesMap).forEach(facilityTypeMap => {
          Object.values(facilityTypeMap).forEach(facilities => {
            totalFacilitiesForDisaster += facilities.length;
          });
        });
        
        reportContent += `## ${fullName} (${totalFacilitiesForDisaster} sites)\n`;
        
        // List facilities by country, then by facility type
        Object.entries(countriesMap).forEach(([country, facilityTypesMap]) => {
          // Count facilities for this country
          let totalFacilitiesForCountry = 0;
          Object.values(facilityTypesMap).forEach(facilities => {
            totalFacilitiesForCountry += facilities.length;
          });
          
          reportContent += `### ${country} (${totalFacilitiesForCountry} sites)\n`;
          
          Object.entries(facilityTypesMap).forEach(([facilityType, facilities]) => {
            reportContent += `#### ${facilityType} Sites (${facilities.length})\n`;
            
            facilities.forEach(facility => {
              // Include all available facility metadata
              const additionalInfo = Object.entries(facility)
                .filter(([key, _]) => !['name', 'latitude', 'longitude', 'type', 'facilityType', 'category', 'country'].includes(key))
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
              
              const locationInfo = `${facility.latitude}, ${facility.longitude}`;
              
              if (additionalInfo) {
                reportContent += `- **${facility.name}** - Location: ${locationInfo} - ${additionalInfo}\n`;
              } else {
                reportContent += `- **${facility.name}** - Location: ${locationInfo}\n`;
              }
            });
            
            reportContent += `\n`;
          });
        });
        
        reportContent += `\n`;
      });
      
      // For large numbers of facilities, provide high-level recommendations by disaster type
      reportContent += `# PRIORITY RECOMMENDATIONS BY DISASTER TYPE\n\n`;
      
      const highPriorityRecommendations = {
        "EQ": [
          "Immediately check structural integrity of all buildings in earthquake-affected regions",
          "Initiate communication with all sites in affected areas; prioritize those without response",
          "Deploy assessment teams to sites reporting damage or with no communication",
          "Prepare temporary housing and supplies for displaced personnel"
        ],
        "TC": [
          "Evacuate personnel from sites in the direct path of tropical cyclones",
          "Secure all equipment and materials that could become projectiles in high winds",
          "Pre-position emergency supplies before landfall at safe locations",
          "Maintain hourly communication with sites during storm passage when safe"
        ],
        "FL": [
          "Move essential equipment and supplies to higher floors in flood-prone sites",
          "Establish evacuation routes that avoid flood-prone roads and bridges",
          "Deploy water pumping equipment to critical sites",
          "Establish decontamination protocols for sites after floodwaters recede"
        ],
        "VO": [
          "Monitor air quality at all sites within volcanic ash fallout zones",
          "Distribute respiratory protection equipment to affected sites",
          "Clear ash from rooftops to prevent structural collapse",
          "Establish protocols for safe ash removal and disposal"
        ],
        "DR": [
          "Implement water conservation measures at all sites in drought-affected regions",
          "Secure additional water supplies for critical operations",
          "Prioritize sites with highest water dependency for assistance",
          "Deploy water quality testing kits to monitor deteriorating water sources"
        ],
        "WF": [
          "Establish defensible space around sites in wildfire-prone areas",
          "Prepare evacuation plans with multiple exit routes",
          "Monitor air quality and provide filtration systems for affected sites",
          "Pre-position firefighting equipment at high-risk sites"
        ],
        "TS": [
          "Evacuate all coastal sites in tsunami warning zones immediately",
          "Position emergency response teams at safe elevations near tsunami-prone areas",
          "Establish clear tsunami evacuation routes with marked safe zones",
          "Prepare for potential contamination from seawater inundation of sites"
        ]
      };
      
      Object.entries(facilitiesByDisasterType).forEach(([disasterType, facilitiesList]) => {
        const fullName = getDisasterFullName(disasterType);
        reportContent += `## ${fullName} Priority Response Actions\n`;
        
        // Add high-priority recommendations for this disaster type
        const recommendations = highPriorityRecommendations[disasterType] ||
          ["Conduct rapid assessment of all affected sites",
           "Establish communication protocols with affected sites",
           "Prepare emergency resources for deployment"];
        
        recommendations.forEach(rec => {
          reportContent += `- ${rec}\n`;
        });
        
        reportContent += `\n`;
      });
      
      // Provide a summary of the most critical facilities
      if (impactedFacilities.length > 0) {
        // Sort facilities by number of disasters affecting them
        const criticalFacilities = [...impactedFacilities]
          .sort((a, b) => b.impacts.length - a.impacts.length)
          .slice(0, Math.min(5, impactedFacilities.length));
        
        reportContent += `# HIGHEST PRIORITY SITES\n\n`;
        reportContent += `The following sites are affected by multiple disasters or high-severity events and require immediate attention:\n\n`;
        
        criticalFacilities.forEach((impact, index) => {
          const facility = impact.facility;
          const disasterCount = impact.impacts.length;
          const disasterTypes = impact.impacts.map(i => getDisasterFullName(i.disaster?.eventType?.toUpperCase() || 'Unknown'));
          const uniqueDisasterTypes = [...new Set(disasterTypes)];
          
          reportContent += `## ${index + 1}. ${facility.name}\n`;
          reportContent += `- **Location:** ${facility.latitude}, ${facility.longitude}\n`;
          reportContent += `- **Impacted by:** ${disasterCount} disaster event(s)\n`;
          reportContent += `- **Disaster Types:** ${uniqueDisasterTypes.join(', ')}\n`;
          
          // If available, add a brief recommendation for this specific facility
          reportContent += `- **Immediate Action:** ${getImmediateAction(uniqueDisasterTypes)}\n\n`;
        });
      }
      
      // Add resource allocation guidance
      reportContent += `# RESOURCE ALLOCATION GUIDANCE\n\n`;
      reportContent += `## Personnel Deployment Priorities\n`;
      reportContent += `- Deploy assessment teams to ${Math.min(10, impactedFacilities.length)} highest priority sites first\n`;
      reportContent += `- Establish forward command posts in areas with clusters of affected sites\n`;
      reportContent += `- Rotate personnel working in extreme conditions every 12 hours\n\n`;
      
      reportContent += `## Equipment & Supply Distribution\n`;
      reportContent += `- Pre-position emergency supplies at strategic locations to serve multiple affected sites\n`;
      reportContent += `- Prioritize communication equipment for sites in areas with infrastructure damage\n`;
      reportContent += `- Allocate temporary power generation to sites with critical operations\n\n`;
      
      reportContent += `## Communication Protocol\n`;
      reportContent += `- Establish hourly check-ins with sites in red alert zones\n`;
      reportContent += `- Implement twice-daily situation reports from all affected sites\n`;
      reportContent += `- Maintain dedicated communication channels for highest priority sites\n\n`;
      
      // Add contact information section
      reportContent += `# EMERGENCY CONTACT INFORMATION\n\n`;
      reportContent += `## Emergency Operations Center\n`;
      reportContent += `- **Main Dispatch:** [Add primary EOC contact number]\n`;
      reportContent += `- **Email:** [Add EOC email]\n`;
      reportContent += `- **Radio Frequency:** [Add emergency frequency if applicable]\n\n`;
      
      reportContent += `## Key Personnel\n`;
      reportContent += `- **Emergency Coordinator:** [Add name and contact details]\n`;
      reportContent += `- **Logistics Coordinator:** [Add name and contact details]\n`;
      reportContent += `- **Medical Coordinator:** [Add name and contact details]\n\n`;
      
      // Add detailed facility-specific recommendations only for the top 5 most critical facilities
      if (impactedFacilities.length > 0) {
        const criticalFacilities = [...impactedFacilities]
          .sort((a, b) => b.impacts.length - a.impacts.length)
          .slice(0, Math.min(5, impactedFacilities.length));
        
        if (criticalFacilities.length > 0) {
          reportContent += `# DETAILED RECOMMENDATIONS FOR CRITICAL SITES\n\n`;
          
          // Get detailed recommendations for these critical facilities only
          for (const impact of criticalFacilities) {
            try {
              const response = await fetch('/api/recommendations', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  facility: impact.facility,
                  impacts: impact.impacts,
                  useAI: true
                }),
              });
              
              if (response.ok) {
                const data = await parseApiResponse(response, 'Facility recommendations');
                if (data.recommendations) {
                  reportContent += `## ${impact.facility.name}\n\n`;
                  
                  // Format recommendations
                  Object.entries(data.recommendations).forEach(([category, items]) => {
                    if (category !== 'error' && category !== 'Credits' && category !== 'About' && items) {
                      reportContent += `### ${category}\n`;
                      
                      if (Array.isArray(items)) {
                        items.forEach(item => {
                          reportContent += `- ${item}\n`;
                        });
                      } else {
                        reportContent += `- ${items}\n`;
                      }
                      
                      reportContent += '\n';
                    }
                  });
                  
                  reportContent += `\n`;
                }
              }
            } catch (err) {
              console.error(`Error getting recommendations for ${impact.facility.name}:`, err);
            }
          }
        }
      }
      
      // Add attribution (only in the footer)
      reportContent += `\n\n---\n\n`;
      reportContent += `*Generated by AI Disaster Impact and Response Tool | Developed by John Mark Esplana*`;
      
      // Save the complete report
      setCompleteReport(reportContent);
      
      // Convert to Word format and download
      downloadWordDocument(reportContent, `Emergency-Response-Overview-${date}`);
      
    } catch (error) {
      console.error('Error generating comprehensive report:', error);
      addToast('Failed to generate comprehensive report. Please try again.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, sitrep: false }));
    }
  };
  
  // Helper function to get full disaster name from code
  const getDisasterFullName = (code) => {
    const disasterCodes = {
      'EQ': 'Earthquake',
      'TC': 'Tropical Cyclone',
      'FL': 'Flood',
      'VO': 'Volcanic Activity',
      'DR': 'Drought',
      'WF': 'Wildfire',
      'TS': 'Tsunami',
      'UNKNOWN': 'Unspecified Disaster'
    };
    
    return disasterCodes[code] || code;
  };
  
  // Helper function to get immediate action based on disaster types
  const getImmediateAction = (disasterTypes) => {
    if (disasterTypes.includes('Earthquake')) {
      return 'Conduct structural assessment and establish emergency shelter';
    } else if (disasterTypes.includes('Tropical Cyclone')) {
      return 'Secure site and prepare for evacuation if in direct path';
    } else if (disasterTypes.includes('Flood')) {
      return 'Move critical equipment to higher ground and monitor water levels';
    } else if (disasterTypes.includes('Tsunami')) {
      return 'Evacuate immediately to designated high ground';
    } else if (disasterTypes.includes('Volcanic Activity')) {
      return 'Monitor air quality and prepare for evacuation if eruption intensifies';
    } else if (disasterTypes.includes('Wildfire')) {
      return 'Clear defensible space and prepare for evacuation';
    } else if (disasterTypes.includes('Drought')) {
      return 'Implement water conservation measures and secure alternative supplies';
    } else {
      return 'Conduct rapid assessment and establish communication';
    }
  };
  
  // Helper function to download content as Word document
  const downloadWordDocument = (content, filename) => {
    try {
      // Create Word document format using basic HTML with MS Word-specific XML
      const htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" 
              xmlns:w="urn:schemas-microsoft-com:office:word" 
              xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8">
            <meta name="ProgId" content="Word.Document">
            <meta name="Generator" content="Microsoft Word 15">
            <meta name="Originator" content="Microsoft Word 15">
            <title>AI Analysis Report</title>
            <!--[if gte mso 9]>
            <xml>
              <w:WordDocument>
                <w:View>Print</w:View>
                <w:Zoom>90</w:Zoom>
                <w:DoNotOptimizeForBrowser/>
              </w:WordDocument>
            </xml>
            <![endif]-->
            <style>
              body { font-family: 'Calibri', sans-serif; margin: 1cm; }
              h1, h2, h3 { font-family: 'Calibri', sans-serif; }
              h1 { font-size: 16pt; color: #2196F3; margin-top: 24pt; margin-bottom: 6pt; }
              h2 { font-size: 14pt; color: #0d47a1; margin-top: 18pt; margin-bottom: 6pt; }
              h3 { font-size: 12pt; color: #333; margin-top: 12pt; margin-bottom: 3pt; }
              p { margin: 6pt 0; }
              ul { margin-left: 20pt; }
              li { margin-bottom: 3pt; }
              .highlight { color: #d32f2f; font-weight: bold; background-color: #ffebee; padding: 2pt; }
              .footer { font-style: italic; color: #666; margin-top: 24pt; border-top: 1pt solid #ccc; padding-top: 12pt; text-align: center; }
            </style>
          </head>
          <body>
            ${content
              .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
              .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
              .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/\n- (.*?)$/gm, '<ul><li>$1</li></ul>')
              .replace(/<\/ul>\s*<ul>/g, '')  // Combine adjacent lists
              .replace(/\n\n/g, '<p></p>')
              .replace(/\n/g, '<br>')
              .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
              .replace(/---\n\n\*(.*?)\*/, '<hr><div class="footer">$1</div>')} <!-- Format footer -->
          </body>
        </html>
      `;
      
      // Correct MIME type for Word documents
      const blob = new Blob([htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.doc`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error('Error downloading Word document:', e);
      
      // Try again with a simpler HTML structure
      try {
        const simpleHtml = `<html><head><title>GDACS Report</title></head><body>${content.replace(/\n/g, '<br>')}</body></html>`;
        const simpleBlob = new Blob([simpleHtml], { type: 'application/msword' });
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(simpleBlob);
        a.download = `${filename}.doc`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
      } catch (finalError) {
        console.error('Final error trying to download Word document:', finalError);
        addToast('Unable to download Word document. Please try again.', 'error');
      }
    }
  };

  const impactProgressPercent = impactProgress?.totalFacilities > 0
    ? Math.min(100, Math.round(((impactProgress.processedFacilities || 0) / impactProgress.totalFacilities) * 100))
    : null;
  const workspaceRestorePercent = workspaceRestoreProgress
    ? Math.min(100, Math.max(0, Math.round(
      workspaceRestoreProgress.percent ??
      ((workspaceRestoreProgress.step || 0) / Math.max(1, workspaceRestoreProgress.totalSteps || 1)) * 100
    )))
    : null;
  const workspaceRestoreCounts = workspaceRestoreProgress?.counts || {};
  const workspaceRestoreDetails = workspaceRestoreProgress
    ? [
      workspaceRestoreCounts.adminAreas ? `${workspaceRestoreCounts.adminAreas.toLocaleString()} admin areas` : null,
      workspaceRestoreCounts.sites ? `${workspaceRestoreCounts.sites.toLocaleString()} sites` : null,
      workspaceRestoreCounts.acledEvents ? `${workspaceRestoreCounts.acledEvents.toLocaleString()} ACLED events` : null,
      workspaceRestoreCounts.worldPopAreas ? `${workspaceRestoreCounts.worldPopAreas.toLocaleString()} population areas` : null,
      workspaceRestoreCounts.osmFeatures ? `${workspaceRestoreCounts.osmFeatures.toLocaleString()} OSM features` : null
    ].filter(Boolean).join(' · ')
    : '';

  return (
    <ErrorBoundary>
    <div className="container">
      <Head>
        <title>Aidstack Atlas — Geospatial Operational Intelligence</title>
        <meta name="description" content="Combine global risk signals with your own locations and operational data to understand exposure, changing conditions, and operational risk." key="description" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="noindex" />
        <link rel="icon" type="image/svg+xml" href="/images/gdacs/warning.svg" />
        <link rel="canonical" href="https://disasters.aidstack.ai/app" />
      </Head>

      {showOnboarding && <OnboardingModal onClose={handleCloseOnboarding} />}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <main style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

        {workspaceRestoreProgress && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 12000,
              background: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              padding: '10px 16px',
              marginBottom: '8px',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              color: '#0F172A'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700 }}>
                {workspaceRestoreProgress.phase || 'Restoring saved workspace'}
                {workspaceRestorePercent !== null ? ` (${workspaceRestorePercent}%)` : ''}
              </span>
              <span style={{ color: '#475569' }}>
                Step {workspaceRestoreProgress.step || 1} of {workspaceRestoreProgress.totalSteps || 1}
                {workspaceRestoreDetails ? ` · ${workspaceRestoreDetails}` : ''}
              </span>
            </div>
            <div style={{
              height: '6px',
              borderRadius: '999px',
              overflow: 'hidden',
              background: '#E2E8F0',
              marginTop: '8px'
            }}>
              <div style={{
                width: workspaceRestorePercent !== null ? `${Math.max(workspaceRestorePercent, 4)}%` : '12%',
                height: '100%',
                borderRadius: '999px',
                background: '#0F766E',
                transition: 'width 0.25s ease'
              }} />
            </div>
          </div>
        )}

        {/* GDACS data unavailable banner */}
        {fetchError && !loading.disasters && (
          <div style={{
            background: '#FEF3C7', border: '1px solid #F59E0B',
            borderRadius: '6px', padding: '10px 16px',
            marginBottom: '8px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#92400E',
          }}>
            <span>⚠️ {fetchError} Check your connection or try refreshing.</span>
            <button
              onClick={handleRefreshData}
              style={{
                background: '#F59E0B', color: 'white', border: 'none',
                borderRadius: '4px', padding: '4px 10px',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginLeft: '12px',
              }}
            >Retry</button>
          </div>
        )}
        {loading.impact && impactProgress && (
          <div style={{
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '6px',
            padding: '10px 16px',
            marginBottom: '8px',
            fontFamily: "'Inter', sans-serif",
            fontSize: '13px',
            color: '#1E3A8A'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700 }}>
                Assessing site impacts{impactProgressPercent !== null ? ` (${impactProgressPercent}%)` : ''}
              </span>
              <span>
                {(impactProgress.processedFacilities || 0).toLocaleString()} of {(impactProgress.totalFacilities || 0).toLocaleString()} sites checked
                {impactProgress.impactedFacilities !== undefined ? ` · ${impactProgress.impactedFacilities.toLocaleString()} impacted so far` : ''}
              </span>
            </div>
            <div style={{
              height: '6px',
              borderRadius: '999px',
              overflow: 'hidden',
              background: 'rgba(191, 219, 254, 0.8)',
              marginTop: '8px'
            }}>
              <div style={{
                width: impactProgressPercent !== null ? `${Math.max(impactProgressPercent, 3)}%` : '30%',
                height: '100%',
                borderRadius: '999px',
                background: '#2563EB',
                transition: 'width 0.2s ease'
              }} />
            </div>
          </div>
        )}
        <div className="header">
          <h1 style={{
            color: 'var(--aidstack-navy)',
            display: 'flex',
            alignItems: 'center',
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '28px'
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--aidstack-orange)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '12px'}}>
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>
            <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
              <span>aidstack<span style={{color: 'var(--aidstack-slate-medium)', fontWeight: 500}}>.disasters</span></span>
              <span style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--aidstack-slate-medium)',
                letterSpacing: '0.5px',
                fontFamily: "'Inter', sans-serif"
              }}>Intelligence for impact workers</span>
            </div>
          </h1>
          
          <div className="data-summary" style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px',
            justifyContent: 'space-between',
            width: '100%'
          }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--aidstack-light-gray)',
                padding: '7px 10px',
                borderRadius: '999px',
                border: '1px solid var(--aidstack-slate-light)',
                fontFamily: "'Inter', sans-serif"
              }}>
                <span style={{
                  fontWeight: 700,
                  fontSize: '12px',
                  color: 'var(--aidstack-navy)'
                }}>
                  {filteredDisasters.length} disasters
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    backgroundColor: 'var(--color-error)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '999px'
                  }}>
                    {filteredDisasters.filter(d =>
                      (d.alertLevel?.toLowerCase() === 'red') ||
                      (d.severity?.toLowerCase()?.includes('extreme')) ||
                      (d.severity?.toLowerCase()?.includes('severe'))).length}
                  </span>
                  <span style={{
                    backgroundColor: 'var(--aidstack-orange)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '999px'
                  }}>
                    {filteredDisasters.filter(d =>
                      (d.alertLevel?.toLowerCase() === 'orange') ||
                      (d.severity?.toLowerCase()?.includes('moderate'))).length}
                  </span>
                  <span style={{
                    backgroundColor: 'var(--color-success)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '999px'
                  }}>
                    {filteredDisasters.filter(d =>
                      (d.alertLevel?.toLowerCase() === 'green') ||
                      (d.severity?.toLowerCase()?.includes('minor')) ||
                      (!d.alertLevel && !d.severity)).length}
                  </span>
                </div>
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--aidstack-light-gray)',
                padding: '7px 10px',
                borderRadius: '999px',
                border: '1px solid var(--aidstack-slate-light)',
                fontFamily: "'Inter', sans-serif"
              }}>
                <span style={{
                  fontWeight: 700,
                  fontSize: '12px',
                  color: 'var(--aidstack-navy)'
                }}>
                  {facilities.length} sites
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    backgroundColor: 'var(--color-error)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '999px'
                  }}>
                    {impactedFacilities.length} impacted
                  </span>
                  <span style={{
                    backgroundColor: 'var(--color-success)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '999px'
                  }}>
                    {facilities.length - impactedFacilities.length} safe
                  </span>
                </div>
              </div>
              <DataFreshnessBar layers={dataLayers} />
              {lastUpdated && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#f5f5f5',
                  padding: '7px 10px',
                  borderRadius: '999px',
                  border: '1px solid var(--aidstack-slate-light)',
                  fontSize: '12px',
                  color: '#475569',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600
                }}>
                  Updated {new Intl.DateTimeFormat('en-US', {
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  }).format(lastUpdated)}
                  {timeSinceUpdate && (
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      backgroundColor: timeSinceUpdate.includes('hour') || timeSinceUpdate.includes('day') ? '#ffebee' : '#e8f5e9',
                      color: timeSinceUpdate.includes('hour') || timeSinceUpdate.includes('day') ? '#d32f2f' : '#2e7d32',
                      fontWeight: 700
                    }}>
                      {timeSinceUpdate}
                    </span>
                  )}
                </span>
              )}
              {(loading.outbreaks || loading.outbreaksBackfill || filteredOutbreaks.length > 0) && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: loading.outbreaks ? 'rgba(190, 24, 93, 0.10)' : '#f5f5f5',
                  padding: '7px 10px',
                  borderRadius: '999px',
                  border: '1px solid rgba(190, 24, 93, 0.22)',
                  fontSize: '12px',
                  color: '#831843',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700
                }}>
                  {(loading.outbreaks || loading.outbreaksBackfill) && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                      <line x1="12" y1="2" x2="12" y2="6"></line>
                      <line x1="12" y1="18" x2="12" y2="22"></line>
                      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                      <line x1="2" y1="12" x2="6" y2="12"></line>
                      <line x1="18" y1="12" x2="22" y2="12"></line>
                    </svg>
                  )}
                  {loading.outbreaks
                    ? 'Loading WHO outbreaks...'
                    : loading.outbreaksBackfill
                      ? `${filteredOutbreaks.length} outbreaks, updating...`
                      : `${filteredOutbreaks.length} outbreaks`}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleRefreshData}
                disabled={loading.disasters || loading.outbreaks}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: (loading.disasters || loading.outbreaks) ? 'var(--aidstack-slate-light)' : 'var(--aidstack-navy)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '7px 11px',
                  cursor: (loading.disasters || loading.outbreaks) ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                {(loading.disasters || loading.outbreaks) ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }}>
                    <line x1="12" y1="2" x2="12" y2="6"></line>
                    <line x1="12" y1="18" x2="12" y2="22"></line>
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                    <line x1="2" y1="12" x2="6" y2="12"></line>
                    <line x1="18" y1="12" x2="22" y2="12"></line>
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <polyline points="23 20 23 14 17 14"></polyline>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                  </svg>
                )}
                {(loading.disasters || loading.outbreaks) ? 'Refreshing...' : 'Refresh Data'}
              </button>

              {/* Prediction Dashboard Button */}
              <button
                onClick={() => setShowPredictions(true)}
                disabled={!canUseDistrictDecisionTools}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: !canUseDistrictDecisionTools ? 'var(--aidstack-slate-light)' : 'var(--aidstack-navy)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '7px 11px',
                  cursor: !canUseDistrictDecisionTools ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
                  <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
                  <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                Forecast
              </button>

              {/* Operational Outlook Button */}
              <button
                onClick={() => setShowOperationalOutlook(true)}
                disabled={!canUseDistrictDecisionTools}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: !canUseDistrictDecisionTools ? 'var(--aidstack-slate-light)' : 'var(--aidstack-orange)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '7px 11px',
                  cursor: !canUseDistrictDecisionTools ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                Outlook
              </button>

              <button
                onClick={() => setShowPrioritizationBoard(true)}
                disabled={!canUseDistrictDecisionTools}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: !canUseDistrictDecisionTools ? 'var(--aidstack-slate-light)' : '#0f766e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '7px 11px',
                  cursor: !canUseDistrictDecisionTools ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <path d="M3 3v18h18"></path>
                  <path d="M7 14l4-4 3 3 5-7"></path>
                </svg>
                Prioritization
              </button>

              {/* Trend Analysis Button */}
              <button
                onClick={() => setShowTrendAnalysis(true)}
                disabled={!canUseDistrictDecisionTools}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: !canUseDistrictDecisionTools ? 'var(--aidstack-slate-light)' : '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '7px 11px',
                  cursor: !canUseDistrictDecisionTools ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                Trends
              </button>

              <button
                onClick={() => setShowHelp(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'white',
                  color: 'var(--aidstack-navy)',
                  border: '1px solid var(--aidstack-slate-light)',
                  borderRadius: '999px',
                  padding: '7px 11px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                Help
              </button>
            </div>
          </div>
        </div>

        
        {/* Help panel as drawer */}
        <div className={`drawer-backdrop ${showHelp ? 'open' : ''}`} onClick={() => setShowHelp(false)}></div>
        <div
          className={`drawer drawer-right ${showHelp ? 'open' : ''}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            zIndex: 3000
          }}
        >
          <div className="drawer-header" style={{
            background: 'linear-gradient(135deg, var(--aidstack-navy) 0%, #2D5A7B 100%)',
            color: 'white',
            margin: '-20px -20px 20px -20px',
            padding: '20px'
          }}>
            <h3 className="drawer-title" style={{color: 'white', fontFamily: "'Space Grotesk', sans-serif"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--aidstack-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}>
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              Help Guide
            </h3>
            <button className="drawer-close" onClick={() => setShowHelp(false)} style={{color: 'white'}}>×</button>
          </div>
          <div className="drawer-content">
          
          {/* What Is This Tool section */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', color: 'var(--aidstack-orange)', marginBottom: '10px', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>What Is This Tool?</h3>
            <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', marginBottom: '10px' }}>
              The Disaster Impact Assessment Tool helps organizations monitor their global facilities and assess potential impacts from current natural disasters. It combines real-time disaster data with your facility locations to identify risks and provide AI-powered recommendations.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
              <button
                onClick={() => {
                  setShowHelp(false);
                  setShowOnboarding(true);
                }}
                style={{
                  background: 'var(--aidstack-orange)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Replay quick start
              </button>
              <a
                href="/landing"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#F8FAFC',
                  color: 'var(--aidstack-navy)',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Open landing page
              </a>
            </div>
          </div>
          
          {/* Problems Solved section */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', color: 'var(--aidstack-orange)', marginBottom: '10px', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>Problems This Tool Solves</h3>
            <ul style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', paddingLeft: '20px' }}>
              <li style={{ marginBottom: '8px' }}>
                <strong>Scattered Information:</strong> Consolidates disaster data and site locations in one visual interface
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Manual Assessment:</strong> Automatically identifies which sites are at risk from active disasters
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Response Planning:</strong> Generates AI-powered recommendations specific to each site and disaster type
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Situation Reporting:</strong> Creates comprehensive reports for stakeholders with a single click
              </li>
            </ul>
          </div>
          
          {/* Key Features section */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', color: 'var(--aidstack-orange)', marginBottom: '10px', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>Key Features</h3>
            <ul style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', paddingLeft: '20px' }}>
              <li style={{ marginBottom: '8px' }}>
                <strong>Interactive Map:</strong> Visualize disasters and sites globally
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Site Upload:</strong> Import your sites from CSV/Excel files
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Automated Impact Assessment:</strong> Identify which sites are affected by disasters
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>AI Analysis:</strong> Get personalized risk analysis for any site
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Smart Recommendations:</strong> Receive specific action items based on disaster type
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Situation Reports:</strong> Generate comprehensive reports for stakeholders
              </li>
              <li style={{ marginBottom: '8px', backgroundColor: '#ffebee', padding: '5px 8px', borderRadius: '4px' }}>
                <strong>Complete AI Report:</strong> Download all AI-generated content in a single Word document
              </li>
            </ul>
          </div>
          
          {/* How To Use section */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', color: 'var(--aidstack-orange)', marginBottom: '10px', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>How To Use This Tool</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <h4 style={{ fontSize: '14px', color: '#333', marginBottom: '5px' }}>1. Upload Your Sites</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', marginBottom: '5px' }}>
                Click the <strong>Sites</strong> button on the right side of the map. Upload a CSV or Excel file with your site locations (must include name, latitude, and longitude columns).
              </p>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <h4 style={{ fontSize: '14px', color: '#333', marginBottom: '5px' }}>2. View Disaster Data</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', marginBottom: '5px' }}>
                The map shows active disasters from global sources. Use the <strong>Filters</strong> button to filter disasters by type and time period.
              </p>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <h4 style={{ fontSize: '14px', color: '#333', marginBottom: '5px' }}>3. Assess Impact</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', marginBottom: '5px' }}>
                Once sites are uploaded, the system automatically identifies which are in the impact radius of active disasters.
              </p>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <h4 style={{ fontSize: '14px', color: '#333', marginBottom: '5px' }}>4. Analyze Sites</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', marginBottom: '5px' }}>
                Click on a site marker, then select <strong>Analyze with AI</strong> to get a detailed risk assessment.
              </p>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <h4 style={{ fontSize: '14px', color: '#333', marginBottom: '5px' }}>5. Get Recommendations</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', marginBottom: '5px' }}>
                Click <strong>View Recommendations</strong> to receive specific action items tailored to the site and disasters affecting it.
              </p>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <h4 style={{ fontSize: '14px', color: '#333', marginBottom: '5px' }}>6. Generate Report</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', marginBottom: '5px' }}>
                Click the <strong>Sitrep</strong> button to create a comprehensive situation report for all impacted sites.
              </p>
            </div>
            
            <div style={{ marginBottom: '12px', backgroundColor: '#ffebee', padding: '10px', borderRadius: '4px' }}>
              <h4 style={{ fontSize: '14px', color: 'var(--aidstack-orange)', marginBottom: '5px', fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>7. Operational Outlook</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', marginBottom: '5px' }}>
                Click the <strong>Operational Outlook</strong> button to generate a forward-looking humanitarian analysis. The AI analyzes current signals, identifies humanitarian drivers, describes possible developments (most likely, escalation, and stabilization scenarios), and provides operational implications.
              </p>
            </div>
          </div>
          
          {/* Use Cases section */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', color: 'var(--aidstack-orange)', marginBottom: '10px', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>Use Cases</h3>
            <ul style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', paddingLeft: '20px' }}>
              <li style={{ marginBottom: '8px' }}>
                <strong>Emergency Response:</strong> Quickly identify which sites need immediate assistance during a disaster
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Business Continuity:</strong> Prepare specific action plans for sites at risk
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Risk Assessment:</strong> Evaluate which sites might be impacted by developing situations
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Executive Briefing:</strong> Generate professional reports for leadership teams
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Resource Allocation:</strong> Make informed decisions on where to deploy emergency resources
              </li>
            </ul>
          </div>
          
          {/* Tips section */}
          <div style={{ 
            backgroundColor: 'rgba(244, 67, 54, 0.05)', 
            padding: '15px', 
            borderRadius: '6px',
            marginBottom: '15px'
          }}>
            <h3 style={{ fontSize: '16px', color: 'var(--aidstack-orange)', marginBottom: '10px', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>Pro Tips</h3>
            <ul style={{ fontSize: '14px', lineHeight: '1.5', color: '#555', paddingLeft: '20px' }}>
              <li style={{ marginBottom: '8px' }}>
                Use the time filter to focus on recent disasters or historical events
              </li>
              <li style={{ marginBottom: '8px' }}>
                High-risk recommendations are automatically highlighted in red
              </li>
              <li style={{ marginBottom: '8px' }}>
                Download reports in Word format for easy sharing with stakeholders
              </li>
              <li style={{ marginBottom: '8px' }}>
                Use the "Operational Outlook" button for forward-looking humanitarian analysis that combines predictions, current signals, humanitarian drivers, possible scenarios, and operational implications
              </li>
              <li style={{ marginBottom: '8px' }}>
                Click the map legend to filter disasters by type
              </li>
            </ul>
          </div>
          
          <div style={{
            fontSize: '11px',
            color: '#999',
            fontStyle: 'italic',
            textAlign: 'center',
            marginTop: '12px',
            borderTop: '1px solid #eee',
            paddingTop: '8px'
          }}>
            Developed by <a href="https://github.com/jmesplana" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--aidstack-orange)', textDecoration: 'none', fontWeight: '500' }}>John Mark Esplana</a>
          </div>
          </div>
        </div>
        {showAppHub && <AppHub districts={districts} facilities={facilities} acledData={acledData} disasters={disasters} onClose={() => setShowAppHub(false)} />}
        <OperationalContextBar
          selectedAnalysisDistricts={selectedAnalysisDistricts}
          districts={districts}
          facilities={facilities}
          impactedFacilities={impactedFacilities}
          worldPopData={worldPopData}
          latestPrioritizationBoard={latestPrioritizationBoard}
          enabledEvidenceLayers={enabledEvidenceLayers}
          acledEnabled={acledEnabled}
          acledData={acledData}
          osmData={osmData}
          canUseDistrictDecisionTools={canUseDistrictDecisionTools}
          onOpenSitrep={() => openSitrepModal()}
          sitrepLoading={loading.sitrep}
          canOpenSitrep={canOpenSitrep}
        />

        <MapComponent
          onOpenApps={() => setShowAppHub(true)}
          disasters={filteredDisasters}
          outbreaks={filteredOutbreaks}
          outbreakReports={outbreakReports}
          outbreakLoading={loading.outbreaks}
          outbreakBackfillLoading={loading.outbreaksBackfill}
          onOutbreakLayerEnable={fetchOutbreakData}
          allDisasters={disasters}
          gdacsDiagnostics={gdacsDiagnostics ? {
            ...gdacsDiagnostics,
            filteredTotal: filteredDisasters.length,
            dateFilter
          } : null}
          facilities={facilities}
          impactedFacilities={impactedFacilities}
          impactStatistics={impactStatistics}
          onFacilitySelect={handleFacilitySelect}
          loading={loading.disasters}
          onDrawerState={handleFacilityUpload}
          onGenerateSitrep={generateSitrep}
          sitrepLoading={loading.sitrep}
          sitrep={sitrep}
          sitrepTimestamp={sitrepTimestamp}
          showHelp={showHelp}
          setShowHelp={setShowHelp}
          showChatDrawer={showChatDrawer}
          setShowChatDrawer={setShowChatDrawer}
          dateFilter={dateFilter}
          handleDateFilterChange={handleDateFilterChange}
          aiAnalysisFields={aiAnalysisFields}
          onClearCache={handleClearCache}
          acledData={acledData}
          acledEnabled={acledEnabled}
          acledConfig={acledConfig}
          onAcledUpload={handleAcledUpload}
          onClearAcledCache={handleClearAcledCache}
          onToggleAcled={handleToggleAcled}
          districts={districts}
          onDistrictsLoaded={handleDistrictsLoaded}
          districtAvailableFields={districtAvailableFields}
          districtLabelField={districtLabelField}
          onDistrictLabelFieldChange={handleDistrictLabelFieldChange}
          onAcledConfigChange={handleAcledConfigChange}
          operationType={operationType}
          onOperationTypeChange={setOperationType}
          canUseDistrictDecisionTools={canUseDistrictDecisionTools}
          onDistrictClick={(district) => {
            if (!canUseDistrictDecisionTools) return;
            setSelectedDistrictForForecast(district);
            setShowPredictions(true);
          }}
          onDistrictOutlookClick={(district) => {
            if (!canUseDistrictDecisionTools) return;
            setSelectedDistrictForOutlook(district);
            setShowOperationalOutlook(true);
          }}
          onWorldPopDataChange={(data, fetchParams) => {
            setWorldPopData(data);
            setWorldPopLastFetch(fetchParams);
          }}
          onOSMDataChange={(data) => {
            setOsmData(data);
          }}
          onAnalysisDistrictsChange={setSelectedAnalysisDistricts}
          onEvidenceLayersChange={setEnabledEvidenceLayers}
          enabledEvidenceLayers={enabledEvidenceLayers}
          selectedAnalysisDistricts={selectedAnalysisDistricts}
          prioritizationBoard={latestPrioritizationBoard}
        />

        {selectedFacility && (
          <RecommendationsPanel
            facility={selectedFacility}
            recommendations={recommendations}
            loading={loading.recommendations}
            isAIGenerated={recommendationsAIGenerated}
          />
        )}

        {/* Prediction Dashboard */}
        {showPredictions && (
          <PredictionDashboard
            facilities={facilities}
            disasters={filteredDisasters}
            districts={districts}
            selectedDistricts={selectedAnalysisDistricts}
            acledData={acledData}
            selectedDistrict={selectedDistrictForForecast}
            worldPopData={worldPopData}
            enabledEvidenceLayers={enabledEvidenceLayers}
            worldPopYear={worldPopLastFetch?.year}
            onClose={() => {
              setShowPredictions(false);
              setSelectedDistrictForForecast(null); // Clear selected district when closing
            }}
          />
        )}

        {/* Operational Outlook Dashboard */}
        {showOperationalOutlook && (
          <OperationalOutlook
            facilities={facilities}
            disasters={filteredDisasters}
            acledData={acledData}
            districts={districts}
            selectedDistricts={selectedAnalysisDistricts}
            selectedDistrict={selectedDistrictForOutlook}
            worldPopData={worldPopData}
            worldPopYear={worldPopLastFetch?.year}
            osmData={osmData}
            enabledEvidenceLayers={enabledEvidenceLayers}
            onClose={() => {
              setShowOperationalOutlook(false);
              setSelectedDistrictForOutlook(null); // Clear selected district when closing
            }}
          />
        )}

        {showSitrepModal && (
          <div
            onClick={() => setShowSitrepModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(15, 23, 42, 0.62)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px'
            }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                width: 'min(1120px, 100%)',
                maxHeight: '88vh',
                overflowY: 'auto',
                background: '#F8FAFC',
                border: '1px solid rgba(148, 163, 184, 0.32)',
                borderRadius: '20px',
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
                position: 'relative'
              }}
            >
              <button
                type="button"
                onClick={() => setShowSitrepModal(false)}
                style={{
                  position: 'sticky',
                  top: '16px',
                  float: 'right',
                  margin: '16px 16px 0 0',
                  width: '38px',
                  height: '38px',
                  borderRadius: '999px',
                  border: '1px solid #CBD5E1',
                  background: 'rgba(255, 255, 255, 0.96)',
                  color: '#334155',
                  fontSize: '22px',
                  lineHeight: 1,
                  cursor: 'pointer',
                  zIndex: 1
                }}
                aria-label="Close situation report"
              >
                ×
              </button>
              <div style={{ padding: '8px 24px 24px 24px' }}>
                <SitrepDrawer
                  embedded={true}
                  isOpen={true}
                  onClose={() => setShowSitrepModal(false)}
                  sitrep={sitrep}
                  timestamp={sitrepTimestamp}
                  sitrepLoading={loading.sitrep}
                  onGenerateSitrep={openSitrepModal}
                  impactedFacilities={impactedFacilities}
                  facilities={facilities}
                  selectedAnalysisDistrictCount={selectedAnalysisDistricts.length}
                />
              </div>
            </div>
          </div>
        )}

        {showPrioritizationBoard && (
          <PrioritizationBoard
            isOpen={showPrioritizationBoard}
            onClose={() => setShowPrioritizationBoard(false)}
            facilities={facilities}
            impactedFacilities={impactedFacilities}
            disasters={filteredDisasters.length > 0 ? filteredDisasters : disasters}
            acledData={acledEnabled ? acledData : []}
            districts={districts}
            selectedDistricts={selectedAnalysisDistricts}
            worldPopData={worldPopData}
            osmData={osmData}
            operationType={operationType || 'general'}
            enabledEvidenceLayers={enabledEvidenceLayers}
            onBoardLoaded={setLatestPrioritizationBoard}
            onViewFacility={(facility) => {
              setShowPrioritizationBoard(false);
              handleFacilitySelect(facility);
            }}
          />
        )}

        {/* Trend Analysis Dashboard */}
        {showTrendAnalysis && (
          <TrendAnalysisDashboard
            districts={districts}
            selectedDistricts={selectedAnalysisDistricts}
            facilities={facilities}
            impactedFacilities={impactedFacilities}
            acledData={acledEnabled ? acledData : []}
            disasters={filteredDisasters.length > 0 ? filteredDisasters : disasters}
            onClose={() => setShowTrendAnalysis(false)}
          />
        )}

        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </main>

      <footer style={{
        padding: '6px 20px',
        textAlign: 'center',
        borderTop: '1px solid #eaeaea',
        marginTop: '0',
        marginBottom: '0',
        fontSize: '10px',
        color: '#999',
        backgroundColor: '#fafafa',
        position: 'relative',
        bottom: '0'
      }}>
        Created by <a href="https://github.com/jmesplana" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--aidstack-orange)', textDecoration: 'none', fontWeight: '500' }}>John Mark Esplana</a> <span style={{color: '#ccc', margin: '0 6px'}}>|</span> <span style={{color: '#bbb'}}>Aidstack Atlas</span>
      </footer>

      {/* Storage status panel */}
      <StorageStatusPanel onClear={handleClearCache} />
    </div>
    </ErrorBoundary>
  )
}
