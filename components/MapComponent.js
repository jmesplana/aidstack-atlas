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

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
// GDACS Facilities Impact Assessment Tool
// Developed by John Mark Esplana (https://github.com/jmesplana)
import { MapContainer, TileLayer, WMSTileLayer, CircleMarker, Marker as ReactLeafletMarker, Popup, Tooltip } from 'react-leaflet';
import MarkerClusterGroup from '@changey/react-leaflet-markercluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import ReactMarkdown from 'react-markdown';
import ShapefileUploader from './ShapefileUploader';

// Fix for default markers in Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Import extracted components
import {
  HeatmapLayer,
  MapAccess,
  DrawingLayer,
  DisasterMarkers,
  OutbreakMarkers,
  StatisticsPanel,
  TimelineVisualization,
  AcledMarkers,
  MetricBubblesLayer
} from './MapComponent/components';
import OSMInfrastructureLayer from './MapComponent/components/OSMInfrastructureLayer';
import LogisticsOverlaysLayer from './MapComponent/components/LogisticsOverlaysLayer';
import AdminBoundariesLayer from './MapComponent/components/AdminBoundariesLayer';
import { calculateBounds } from '../utils/worldpopHelpers';

import {
  FilterDrawer,
  UnifiedDrawer,
  ColumnSelectionModal,
  ChatDrawer,
  WorldPopDrawer,
  MapLayersDrawer
} from './MapComponent/components/drawers';

import {
  FloatingActionButtons,
  MapLegend,
  CampaignDashboard,
  HamburgerMenu,
  TimelineScrubber,
  GeocodingSearch
} from './MapComponent/components/overlays';

// Import hooks
import {
  useMapFilters,
  useDrawing,
  useFileUpload,
  useMapControls,
  useAIAnalysis,
  usePlayback,
  useWorldPop
} from './MapComponent/hooks';
import { useOSMInfrastructure } from './MapComponent/hooks/useOSMInfrastructure';
import { useLogisticsAssessment } from './MapComponent/hooks/useLogisticsAssessment';

// Import utils
import {
  getDisasterInfo,
  getAlertColor,
  zoomToFilteredEvents,
  toggleFullscreen
} from './MapComponent/utils';
import {
  ADMIN_COLOR_PALETTES,
  ADMIN_FILL_MODES,
  buildDatasetColorScale,
  suggestMetricMeaning
} from './MapComponent/utils/adminDatasetStyling';
import { buildAdminDatasetJoin } from './MapComponent/utils/adminDatasetJoin';
import {
  DEFAULT_METRIC_BUBBLE_COLOR,
  buildMetricBubbleFeatures,
  buildMetricBubbleJoin,
  buildMetricBubbleLegend,
  buildMetricBubbleScale
} from './MapComponent/utils/metricBubbles';
import {
  buildAdminMetricCatalog,
  buildAdminPropertyMetricJoin,
  isAdminPropertyMetric
} from './MapComponent/utils/adminMetricFields';

import buildWeatherContext from '../utils/weatherContextBuilder';
// import { WORLDPOP_TILE_LAYERS } from '../utils/worldpopHelpers'; // Not needed - using GEE tiles
import { useToast } from './Toast';
import { getOperationType } from '../config/operationTypes';
import { buildDistrictRiskIndex } from '../lib/districtRiskScoring';
import { isPointInDistricts } from '../lib/geo/geometry.js';
import { getFacilityIdentityKey } from '../lib/facilityIdentity';
import { getScopedWorldPopData } from '../lib/analysisScope';
import { summarizeDistrictAttributes } from '../lib/adminProperties';

// Import constants
import {
  MAP_LAYERS,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM
} from './MapComponent/constants';

// Custom styles for animations and labels
const customStyles = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulse {
    0%, 100% {
      stroke-width: 7;
      stroke-opacity: 1;
    }
    50% {
      stroke-width: 9;
      stroke-opacity: 0.9;
    }
  }

  .fade-in {
    animation: fadeIn 0.3s ease-out forwards;
  }

  .highlighted-district {
    animation: pulse 2s ease-in-out infinite;
    filter: drop-shadow(0 0 4px rgba(255, 59, 0, 0.75));
  }

  .facility-label {
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    pointer-events: none;
    z-index: 1000;
  }

  .facility-label.impacted {
    background: rgba(255, 68, 68, 0.95);
    color: white;
    border-color: #d32f2f;
  }

  .facility-label.safe {
    background: rgba(76, 175, 80, 0.95);
    color: white;
    border-color: #388e3c;
  }

  .district-label {
    background: rgba(33, 150, 243, 0.75) !important;
    border: 1px solid rgba(25, 118, 210, 0.8) !important;
    border-radius: 4px !important;
    padding: 3px 8px !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    font-family: 'Inter', sans-serif !important;
    color: white !important;
    white-space: nowrap !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important;
    pointer-events: none !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4) !important;
  }

  .drawer-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 998;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  .drawer-backdrop.open {
    opacity: 1;
    pointer-events: all;
  }

  .drawer {
    position: fixed;
    top: 0;
    height: 100vh;
    width: 400px;
    background: white;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2);
    z-index: 999;
    overflow-y: auto;
    transition: transform 0.3s ease;
  }

  .drawer-right {
    right: 0;
    transform: translateX(100%);
  }

  .drawer-right.open {
    transform: translateX(0);
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #e0e0e0;
    background: linear-gradient(135deg, var(--aidstack-navy) 0%, #2D5A7B 100%);
    color: white;
  }

  .drawer-title {
    margin: 0;
    font-size: 18px;
    font-weight: bold;
    display: flex;
    align-items: center;
  }

  .drawer-close {
    background: none;
    border: none;
    font-size: 28px;
    cursor: pointer;
    color: white;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s;
  }

  .drawer-close:hover {
    transform: scale(1.2);
  }

  .drawer-content {
    padding: 20px;
  }

  .drawer-section {
    margin-bottom: 20px;
  }

  .leaflet-top.leaflet-left {
    top: 110px;
  }
`;

function simplifyRing(ring = [], maxPoints = 250) {
  if (!Array.isArray(ring) || ring.length <= maxPoints) return ring;

  const closed = ring.length > 2 &&
    ring[0]?.[0] === ring[ring.length - 1]?.[0] &&
    ring[0]?.[1] === ring[ring.length - 1]?.[1];
  const workingRing = closed ? ring.slice(0, -1) : ring.slice();
  const stride = Math.max(1, Math.ceil(workingRing.length / maxPoints));
  const simplified = workingRing.filter((_, index) => index === 0 || index === workingRing.length - 1 || index % stride === 0);

  if (closed) {
    simplified.push(simplified[0]);
  }

  return simplified;
}

// Cache simplified display geometry keyed by the source geometry object, so the
// expensive coordinate decimation runs once per district for the lifetime of the
// loaded data instead of on every re-render of the displayDistricts memo. The
// source geometry reference is stable across renders (it comes from the stored
// districts array), so this turns O(districts) simplification per render into
// O(new-or-changed districts).
const displayGeometryCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

function simplifyGeometryCached(geometry = null) {
  if (!geometry || !displayGeometryCache) return simplifyGeometry(geometry);
  const cached = displayGeometryCache.get(geometry);
  if (cached !== undefined) return cached;
  const simplified = simplifyGeometry(geometry);
  displayGeometryCache.set(geometry, simplified);
  return simplified;
}

function simplifyGeometry(geometry = null) {
  if (!geometry?.type || !geometry?.coordinates) return geometry;

  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring, index) => simplifyRing(ring, index === 0 ? 250 : 100))
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring, index) => simplifyRing(ring, index === 0 ? 250 : 100))
      )
    };
  }

  return geometry;
}

function compactDistrictForContext(district = {}, index = 0) {
  const props = district.properties || {};
  const adminAttributes = summarizeDistrictAttributes(district, { maxFields: 20, maxDepth: 3 });

  return {
    id: district.id || index,
    name: district.name || props.ADM2_EN || props.NAME_2 || props.NAME || props.name || props.district || `Selected Area ${index + 1}`,
    country: district.country,
    region: district.region,
    geometry: simplifyGeometry(district.geometry || null),
    bounds: district.bounds || null,
    properties: {
      ADM2_EN: props.ADM2_EN,
      NAME_2: props.NAME_2,
      NAME: props.NAME,
      name: props.name,
      district: props.district,
      population: props.population,
      POP: props.POP
    },
    adminAttributes
  };
}

function normalizeAdminSearchValue(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function adminSearchTextContains(searchText = '', term = '') {
  const normalizedSearchText = normalizeAdminSearchValue(searchText);
  const normalizedTerm = normalizeAdminSearchValue(term);
  if (!normalizedSearchText || !normalizedTerm) return false;
  return ` ${normalizedSearchText} `.includes(` ${normalizedTerm} `);
}

function isAdminIdentityKey(key = '') {
  const normalized = normalizeAdminSearchValue(key).replace(/\s+/g, '');
  return (
    normalized === 'name' ||
    normalized === 'nom' ||
    normalized === 'displayname' ||
    normalized === 'province' ||
    normalized === 'territory' ||
    normalized === 'district' ||
    normalized === 'healthzone' ||
    normalized === 'zone' ||
    normalized === 'zscode' ||
    /^adm\d/.test(normalized) ||
    /^name\d/.test(normalized)
  );
}

function getAdminIdentityLevel(key = '') {
  const normalized = normalizeAdminSearchValue(key).replace(/\s+/g, '');
  if (normalized === 'province' || normalized === 'adm1' || normalized === 'name1') return 'province';
  if (normalized === 'territory' || normalized === 'district' || normalized === 'adm2' || normalized === 'name2') return 'district';
  if (normalized === 'healthzone' || normalized === 'zone' || normalized === 'zscode') return 'health_zone';
  if (normalized === 'name' || normalized === 'nom' || normalized === 'displayname') return 'name';
  if (/^adm1/.test(normalized) || /^name1/.test(normalized)) return 'province';
  if (/^adm2/.test(normalized) || /^name2/.test(normalized)) return 'district';
  return 'identity';
}

function getDistrictSearchValues(district = {}) {
  const values = [
    district.id,
    district.name,
    district.country,
    district.region
  ];

  Object.values(district.properties || {}).forEach((value) => {
    if (value === null || value === undefined || value === '') return;
    if (typeof value === 'string' || typeof value === 'number') {
      values.push(value);
    }
  });

  summarizeDistrictAttributes(district, { maxFields: 80, maxDepth: 4 }).forEach((attribute) => {
    values.push(attribute.value);
  });

  return Array.from(new Set(
    values
      .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
      .filter((value) => value.length >= 2)
  ));
}

function getDistrictIdentityEntries(district = {}) {
  const entries = [
    { level: 'id', value: district.id },
    { level: 'name', value: district.name },
    { level: 'country', value: district.country },
    { level: 'region', value: district.region }
  ];

  Object.entries(district.properties || {}).forEach(([key, value]) => {
    if (!isAdminIdentityKey(key)) return;
    if (value === null || value === undefined || value === '') return;
    if (typeof value === 'string' || typeof value === 'number') {
      entries.push({ level: getAdminIdentityLevel(key), value });
    }
  });

  summarizeDistrictAttributes(district, { maxFields: 120, maxDepth: 4 }).forEach((attribute) => {
    if (isAdminIdentityKey(attribute.path) || isAdminIdentityKey(attribute.label)) {
      entries.push({
        level: getAdminIdentityLevel(attribute.path || attribute.label),
        value: attribute.value
      });
    }
  });

  const seen = new Set();
  return entries
    .map((entry) => ({
      level: entry.level,
      value: String(entry.value ?? '').replace(/\s+/g, ' ').trim()
    }))
    .filter((entry) => {
      if (entry.value.length < 2) return false;
      const key = `${entry.level}:${entry.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getDistrictIdentitySearchValues(district = {}, adminLevel = '') {
  const entries = getDistrictIdentityEntries(district);
  const level = normalizeAdminSearchValue(adminLevel).replace(/\s+/g, '_');
  const values = entries
    .filter((entry) => {
      if (!level) return true;
      if (level === 'province') return entry.level === 'province';
      if (level === 'district') return entry.level === 'district' || entry.level === 'name';
      if (level === 'health_zone') return entry.level === 'health_zone' || entry.level === 'name';
      return true;
    })
    .map((entry) => entry.value);
  const searchValues = values.length > 0 ? values : getDistrictSearchValues(district);

  return Array.from(new Set(
    searchValues
      .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
      .filter((value) => value.length >= 2)
  ));
}

function districtIdentityValueMatches(value = '', requestedName = '') {
  const normalizedValue = normalizeAdminSearchValue(value);
  const normalizedRequest = normalizeAdminSearchValue(requestedName);
  if (!normalizedValue || !normalizedRequest) return false;

  return normalizedValue === normalizedRequest ||
    adminSearchTextContains(normalizedValue, normalizedRequest) ||
    adminSearchTextContains(normalizedRequest, normalizedValue);
}

function districtIdentityValueEquals(value = '', requestedName = '') {
  const normalizedValue = normalizeAdminSearchValue(value);
  const normalizedRequest = normalizeAdminSearchValue(requestedName);
  return Boolean(normalizedValue && normalizedRequest && normalizedValue === normalizedRequest);
}

function getDistrictsMatchingRequestedNames(districts = [], requestedNames = [], adminLevel = '') {
  const specificNames = requestedNames.filter(isSpecificAdminMatchTerm);
  if (!specificNames.length) return [];

  const getPrimaryValues = (district) => [
    district.name,
    ...getDistrictIdentityEntries(district)
      .filter((entry) => entry.level === 'name')
      .map((entry) => entry.value)
  ];

  const primaryExactMatches = districts.filter((district) => {
    const primaryValues = getPrimaryValues(district);

    return specificNames.some((name) =>
      primaryValues.some((value) => districtIdentityValueEquals(value, name))
    );
  });

  if (primaryExactMatches.length > 0 && !adminLevel) {
    return primaryExactMatches;
  }

  const primaryLooseMatches = districts.filter((district) => {
    if (primaryExactMatches.some((match) => String(match.id) === String(district.id))) return false;
    const primaryValues = getPrimaryValues(district);

    return specificNames.some((name) =>
      primaryValues.some((value) => districtIdentityValueMatches(value, name))
    );
  });

  if (primaryLooseMatches.length > 0 && !adminLevel) {
    return primaryLooseMatches;
  }

  const identityExactMatches = districts.filter((district) => {
    const identityValues = getDistrictIdentitySearchValues(district, adminLevel);
    return specificNames.some((name) =>
      identityValues.some((value) => districtIdentityValueEquals(value, name))
    );
  });

  if (identityExactMatches.length > 0) {
    return identityExactMatches;
  }

  const identityLooseMatches = districts.filter((district) => {
    const primaryValues = [
      ...getDistrictIdentitySearchValues(district, adminLevel)
    ];

    return specificNames.some((name) =>
      primaryValues.some((value) => districtIdentityValueMatches(value, name))
    );
  });

  return identityLooseMatches;
}

// District objects are stable references (loaded once from state/IndexedDB), so
// their chat-index entry — the expensive part is the deep property walk in
// summarizeDistrictAttributes — is computed once per district and cached.
const adminAreaChatEntryCache = new WeakMap();

function buildAdminAreaChatEntry(district, index) {
  const cached = adminAreaChatEntryCache.get(district);
  if (cached) return cached;

  const identityEntries = getDistrictIdentityEntries(district);
  const searchValues = Array.from(new Set([
    ...identityEntries.map((entry) => entry.value),
    ...getDistrictSearchValues(district)
  ]));
  const attributes = summarizeDistrictAttributes(district, { maxFields: 120, maxDepth: 4 });
  const entry = {
    id: district.id ?? index,
    name: district.name || `Admin Area ${index + 1}`,
    country: district.country || null,
    region: district.region || null,
    aliases: searchValues.slice(0, 40),
    identityEntries: identityEntries.slice(0, 40),
    attributes,
    searchText: normalizeAdminSearchValue(searchValues.join(' '))
  };
  adminAreaChatEntryCache.set(district, entry);
  return entry;
}

function buildAdminAreaChatIndex(districts = []) {
  return (districts || []).map((district, index) => buildAdminAreaChatEntry(district, index));
}

const GENERIC_ADMIN_MATCH_TERMS = new Set([
  'admin',
  'area',
  'areas',
  'boundary',
  'boundaries',
  'district',
  'districts',
  'province',
  'provinces',
  'region',
  'regions',
  'territory',
  'territories',
  'health',
  'zone',
  'zones',
  'sud',
  'nord',
  'est',
  'ouest',
  'north',
  'south',
  'east',
  'west',
  'central',
  'highlight',
  'show',
  'map'
]);

function isSpecificAdminMatchTerm(value = '') {
  const normalized = normalizeAdminSearchValue(value);
  return normalized.length >= 3 && !GENERIC_ADMIN_MATCH_TERMS.has(normalized);
}

function simplifyGeometryForAnalysis(geometry = null) {
  if (!geometry?.type || !geometry?.coordinates) return null;

  const simplifyRing = (ring = [], maxPoints = 80) => {
    if (!Array.isArray(ring) || ring.length <= maxPoints) return ring;
    const step = Math.max(1, Math.ceil(ring.length / maxPoints));
    const simplified = ring.filter((_, idx) => idx % step === 0);

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first && simplified[0] !== first) simplified.unshift(first);
    if (last && simplified[simplified.length - 1] !== last) simplified.push(last);

    return simplified;
  };

  if (geometry.type === 'Polygon') {
    return {
      type: geometry.type,
      coordinates: geometry.coordinates.map((ring, index) => simplifyRing(ring, index === 0 ? 80 : 30))
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      type: geometry.type,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring, index) => simplifyRing(ring, index === 0 ? 80 : 30))
      )
    };
  }

  return geometry;
}

function compactDistrictForAnalysis(district = {}, index = 0) {
  const props = district.properties || {};
  const adminAttributes = summarizeDistrictAttributes(district, { maxFields: 25, maxDepth: 3 });

  return {
    id: district.id || index,
    name: district.name || props.ADM2_EN || props.NAME_2 || props.NAME || props.name || props.district || `Selected Area ${index + 1}`,
    country: district.country,
    region: district.region,
    geometry: simplifyGeometryForAnalysis(district.geometry || null),
    properties: {
      ADM2_EN: props.ADM2_EN,
      NAME_2: props.NAME_2,
      NAME: props.NAME,
      name: props.name,
      district: props.district
    },
    adminAttributes
  };
}

function compactAcledForAnalysis(events = [], maxItems = 50) {
  return (events || []).slice(0, maxItems).map((event) => ({
    event_date: event?.event_date,
    event_type: event?.event_type,
    sub_event_type: event?.sub_event_type,
    admin1: event?.admin1,
    admin2: event?.admin2,
    location: event?.location,
    latitude: event?.latitude,
    longitude: event?.longitude,
    fatalities: event?.fatalities,
    actor1: event?.actor1,
    actor2: event?.actor2,
    notes: event?.notes ? String(event.notes).slice(0, 160) : null
  }));
}

const LARGE_DISTRICT_COUNT = 80;
const getAdminLabelMinZoom = (districtCount = 0) => {
  if (districtCount > 1000) return 8;
  if (districtCount > 300) return 7;
  if (districtCount > LARGE_DISTRICT_COUNT) return 6;
  return 5;
};

function buildAcledAggregateSummary(events = [], selectedDistricts = []) {
  const scopedEvents = selectedDistricts.length > 0
    ? events.filter((event) => isPointInDistricts(event.latitude, event.longitude, selectedDistricts))
    : events;

  const byEventType = scopedEvents.reduce((acc, event) => {
    const key = event?.event_type || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const bySubEventType = scopedEvents.reduce((acc, event) => {
    const key = event?.sub_event_type || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const byActor1 = scopedEvents.reduce((acc, event) => {
    const key = event?.actor1 || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    totalEvents: scopedEvents.length,
    byEventType,
    bySubEventType,
    byActor1,
    latestEventDate: scopedEvents[0]?.event_date || null,
    selectedDistrictCount: selectedDistricts.length
  };
}

function buildDistrictRiskSummary(districts = [], districtRiskIndex = {}) {
  if (!districts || districts.length === 0) return null;

  const riskCounts = {
    'very-high': 0,
    'high': 0,
    'medium': 0,
    'low': 0,
    'none': 0
  };
  const samplesByRisk = {
    'very-high': [],
    'high': [],
    'medium': [],
    'low': [],
    'none': []
  };
  const rankedDistricts = [];
  const attributeSamples = [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  districts.forEach((district) => {
    const risk = districtRiskIndex[district.id] || { level: 'none', score: 0, eventCount: 0, acledCount: 0, disasterCount: 0 };
    riskCounts[risk.level] += 1;

    const districtEntry = {
      id: district.id,
      name: district.name,
      eventCount: risk.eventCount || 0,
      acledCount: risk.acledCount || 0,
      disasterCount: risk.disasterCount || 0,
      score: risk.score || 0,
      level: risk.level || 'none'
    };

    if (samplesByRisk[risk.level].length < 3) {
      samplesByRisk[risk.level].push(districtEntry);
    }

    rankedDistricts.push(districtEntry);

    if (attributeSamples.length < 5) {
      const adminAttributes = summarizeDistrictAttributes(district, { maxFields: 12, maxDepth: 3 });
      if (adminAttributes.length > 0) {
        attributeSamples.push({
          name: district.name || `Admin Area ${attributeSamples.length + 1}`,
          attributes: adminAttributes
        });
      }
    }

    if (district.bounds) {
      minLat = Math.min(minLat, district.bounds.minLat);
      maxLat = Math.max(maxLat, district.bounds.maxLat);
      minLng = Math.min(minLng, district.bounds.minLng);
      maxLng = Math.max(maxLng, district.bounds.maxLng);
    }
  });

  rankedDistricts.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.acledCount || 0) !== (a.acledCount || 0)) return (b.acledCount || 0) - (a.acledCount || 0);
    return (b.eventCount || 0) - (a.eventCount || 0);
  });

  return {
    totalCount: districts.length,
    geographicBounds: Number.isFinite(minLat) ? {
      minLat: minLat.toFixed(2),
      maxLat: maxLat.toFixed(2),
      minLng: minLng.toFixed(2),
      maxLng: maxLng.toFixed(2),
      centerLat: ((minLat + maxLat) / 2).toFixed(2),
      centerLng: ((minLng + maxLng) / 2).toFixed(2)
    } : null,
    riskBreakdown: riskCounts,
    sampleDistricts: samplesByRisk,
    rankedDistricts: rankedDistricts.slice(0, 10),
    attributeSamples
  };
}

function extractLocationFromDistrict(district) {
  const props = district?.properties || district || {};
  const countryFields = [
    'NAME_0', 'ADM0_EN', 'COUNTRY', 'Country', 'country',
    'admin0Name', 'ADM0_NAME', 'ADMIN0', 'name_0'
  ];
  const regionFields = [
    'NAME_1', 'ADM1_EN', 'REGION', 'Region', 'region',
    'admin1Name', 'ADM1_NAME', 'ADMIN1', 'name_1'
  ];

  let country = district?.country || null;
  let region = district?.region || null;

  if (!country) {
    for (const field of countryFields) {
      if (props[field]) {
        country = props[field];
        break;
      }
    }
  }

  if (!region) {
    for (const field of regionFields) {
      if (props[field]) {
        region = props[field];
        break;
      }
    }
  }

  if (!country && props.name) {
    const parts = props.name.split(',');
    if (parts.length > 1) {
      country = parts[parts.length - 1].trim();
    }
  }

  return { country, region };
}

const formatMonthLabel = (value) => {
  if (!value) return 'Unknown';
  const parsed = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const FACILITY_BASE_FIELDS = new Set(['name', 'latitude', 'longitude']);
const FACILITY_SUMMARY_FIELDS = new Set(['refusal_reason', 'refusal_rate', 'refusal', 'target']);
const CHAT_DRAWER_WIDTH = 420;
const CHAT_DRAWER_EXPANDED_WIDTH = 1040;

function getResponsiveChatDrawerWidth(isExpanded, viewportWidth) {
  const targetWidth = isExpanded ? CHAT_DRAWER_EXPANDED_WIDTH : CHAT_DRAWER_WIDTH;
  if (!viewportWidth) return targetWidth;
  return Math.min(targetWidth, Math.floor(viewportWidth * 0.92));
}

function normalizeFacilityFieldKey(key = '') {
  return String(key).replace(/_\d+$/, '');
}

function getFacilityFieldValue(facility = {}, key) {
  if (facility[key] !== undefined && facility[key] !== null && facility[key] !== '') {
    return facility[key];
  }

  const matchingKey = Object.keys(facility).find((candidate) => normalizeFacilityFieldKey(candidate) === key && facility[candidate] !== undefined && facility[candidate] !== null && facility[candidate] !== '');
  return matchingKey ? facility[matchingKey] : null;
}

function formatFacilityFieldLabel(key = '') {
  return normalizeFacilityFieldKey(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatFacilityFieldValue(key = '', value) {
  if (value === null || value === undefined || value === '') return '';

  const normalizedKey = normalizeFacilityFieldKey(key);
  const numericValue = Number(value);
  const isNumeric = !Number.isNaN(numericValue);

  if (normalizedKey === 'refusal_rate' && isNumeric) {
    return `${(numericValue * 100).toFixed(1)}%`;
  }

  if (isNumeric) {
    if (Number.isInteger(numericValue)) {
      return numericValue.toLocaleString();
    }

    return numericValue.toLocaleString(undefined, {
      maximumFractionDigits: 3
    });
  }

  return String(value);
}

function buildFacilityPopupData(facility = {}) {
  const refusalReason = getFacilityFieldValue(facility, 'refusal_reason');
  const refusalRate = getFacilityFieldValue(facility, 'refusal_rate');
  const refusalCount = getFacilityFieldValue(facility, 'refusal');
  const targetCount = getFacilityFieldValue(facility, 'target');
  const hasRefusalSummary = [refusalReason, refusalRate, refusalCount, targetCount].some(
    (value) => value !== null && value !== undefined && value !== ''
  );

  const seenFields = new Map();
  const detailFields = [];

  Object.entries(facility).forEach(([key, value]) => {
    const normalizedKey = normalizeFacilityFieldKey(key);

    if (FACILITY_BASE_FIELDS.has(normalizedKey)) return;
    if (value === null || value === undefined || value === '') return;
    if (hasRefusalSummary && FACILITY_SUMMARY_FIELDS.has(normalizedKey)) return;

    const formattedValue = formatFacilityFieldValue(key, value);
    if (seenFields.get(normalizedKey) === formattedValue) return;

    seenFields.set(normalizedKey, formattedValue);
    detailFields.push({
      key,
      label: formatFacilityFieldLabel(key),
      value: formattedValue
    });
  });

  return {
    refusalReason,
    refusalRate: formatFacilityFieldValue('refusal_rate', refusalRate),
    refusalCount: formatFacilityFieldValue('refusal', refusalCount),
    targetCount: formatFacilityFieldValue('target', targetCount),
    hasRefusalSummary,
    detailFields
  };
}

function FacilityPopupContent({
  facility,
  isImpacted,
  markerColor,
  hasSelectedAnalysisDistricts,
  runFacilityAnalysis
}) {
  const popupData = buildFacilityPopupData(facility);

  return (
    <div style={{ minWidth: '240px' }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
        {facility.name}
      </h4>
      <p style={{ margin: '5px 0', fontSize: '13px' }}>
        <strong>Status:</strong>{' '}
        <span style={{ color: markerColor, fontWeight: 'bold' }}>
          {isImpacted ? 'IMPACTED' : 'Safe'}
        </span>
      </p>
      <p style={{ margin: '5px 0', fontSize: '13px' }}>
        <strong>Location:</strong> {facility.latitude}, {facility.longitude}
      </p>
      {popupData.hasRefusalSummary && (
        <>
          {popupData.refusalReason && (
            <p style={{ margin: '5px 0', fontSize: '13px' }}>
              <strong>Reason:</strong> {popupData.refusalReason}
            </p>
          )}
          {(popupData.refusalCount || popupData.targetCount || popupData.refusalRate) && (
            <p style={{ margin: '5px 0', fontSize: '13px' }}>
              <strong>Refusals:</strong>{' '}
              {[
                popupData.refusalCount && popupData.targetCount
                  ? `${popupData.refusalCount} of ${popupData.targetCount}`
                  : popupData.refusalCount || popupData.targetCount,
                popupData.refusalRate ? `(${popupData.refusalRate})` : null
              ].filter(Boolean).join(' ')}
            </p>
          )}
        </>
      )}
      {popupData.detailFields.map((field) => (
        <p key={field.key} style={{ margin: '5px 0', fontSize: '13px' }}>
          <strong>{field.label}:</strong> {field.value}
        </p>
      ))}
      <button
        onClick={() => runFacilityAnalysis(facility)}
        style={{
          marginTop: '10px',
          padding: '8px 16px',
          background: hasSelectedAnalysisDistricts
            ? 'linear-gradient(135deg, var(--aidstack-navy) 0%, #2D5A7B 100%)'
            : 'var(--aidstack-slate-light)',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: hasSelectedAnalysisDistricts ? 'pointer' : 'not-allowed',
          fontSize: '13px',
          fontWeight: 'bold',
          width: '100%'
        }}
      >
        {hasSelectedAnalysisDistricts ? 'Analyze Site' : 'Select Districts First'}
      </button>
    </div>
  );
}

const MapComponent = ({
  disasters,
  allDisasters = [],
  gdacsDiagnostics = null,
  facilities,
  impactedFacilities,
  impactStatistics,
  onFacilitySelect,
  loading,
  dateFilter,
  handleDateFilterChange,
  onDrawerState,
  onGenerateSitrep,
  sitrepLoading,
  sitrep,
  sitrepTimestamp,
  showHelp,
  onOpenApps,
  setShowHelp,
  showChatDrawer,
  setShowChatDrawer,
  aiAnalysisFields = [],
  onClearCache,
  acledData = [],
  outbreaks = [],
  outbreakReports = [],
  outbreakLoading = false,
  outbreakBackfillLoading = false,
  onOutbreakLayerEnable,
  acledEnabled = true,
  acledConfig = {},
  onAcledUpload,
  onClearAcledCache,
  onToggleAcled,
  onAcledConfigChange,
  operationType = '',
  onOperationTypeChange,
  districts = [],
  onDistrictsLoaded,
  districtAvailableFields = [],
  districtLabelField = null,
  onDistrictLabelFieldChange,
  canUseDistrictDecisionTools = false,
  onDistrictClick,
  onDistrictOutlookClick,
  onWorldPopDataChange,
  onOSMDataChange,
  onAnalysisDistrictsChange,
  onEvidenceLayersChange,
  enabledEvidenceLayers = [],
  selectedAnalysisDistricts = [],
  prioritizationBoard = null
}) => {
  // Map refs - keep these in main component
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const nighttimeCompareDragRef = useRef(false);
  const hydratedEvidenceLayersRef = useRef(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [chatDrawerExpanded, setChatDrawerExpanded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0
  );
  const { addToast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use custom hooks
  const {
    visibleDisasterTypes,
    severityFilters,
    certaintyFilters,
    urgencyFilters,
    timelineFilteredDisasters,
    filteredDisasters,
    alertLevelCounts,
    toggleDisasterType,
    toggleSeverityFilter,
    toggleCertaintyFilter,
    toggleUrgencyFilter,
    handleTimelineChange,
    setTimelineFilteredDisasters
  } = useMapFilters(disasters);

  const {
    drawingEnabled,
    drawingColor,
    drawings,
    annotationMode,
    freehandMode,
    drawControlRef,
    drawnItemsRef,
    toggleDrawing,
    toggleAnnotationMode,
    toggleFreehandMode,
    setColor: setDrawingColor,
    clearAllDrawings,
    undoLastDrawing,
    setDrawings
  } = useDrawing();

  const {
    showColumnModal,
    fileData,
    fileColumns,
    selectedColumns,
    handleFileUpload,
    processExcelData,
    resetFileUpload,
    setShowColumnModal,
    setSelectedColumns
  } = useFileUpload(addToast);

  const {
    showHeatmap,
    showImpactZones,
    showDisasterIcons,
    showZoomIndicator,
    showTimeline,
    showStatistics,
    showLegend,
    showContextStatusBar,
    showClusterCounts,
    showClustering,
    showFacilitiesLayer,
    showAcledLayer,
    showOutbreakLayer,
    showFloodContextLayer,
    showDroughtContextLayer,
    showAccessibilityContextLayer,
    showDistrictRiskFill,
    adminFillMode,
    adminMetricField,
    adminMetricMeaning,
    adminClassification,
    adminClassCount,
    adminColorPalette,
    adminReverseColors,
    adminNoDataStyle,
    showLabels,
    showDistrictLabels,
    isFullscreen,
    filterDrawerOpen,
    unifiedDrawerOpen,
    mapLayersDrawerOpen,
    activeDrawerTab,
    drawerMode,
    currentMapLayer,
    showRoads,
    setShowHeatmap,
    setShowImpactZones,
    setShowDisasterIcons,
    setShowZoomIndicator,
    setShowTimeline,
    setShowStatistics,
    setShowLegend,
    setShowContextStatusBar,
    setShowClusterCounts,
    setShowClustering,
    setShowFacilitiesLayer,
    setShowAcledLayer,
    setShowOutbreakLayer,
    setShowFloodContextLayer,
    setShowDroughtContextLayer,
    setShowAccessibilityContextLayer,
    setShowDistrictRiskFill,
    setAdminFillMode,
    setAdminMetricField,
    setAdminMetricMeaning,
    setAdminClassification,
    setAdminClassCount,
    setAdminColorPalette,
    setAdminReverseColors,
    setAdminNoDataStyle,
    setShowLabels,
    setShowDistrictLabels,
    setIsFullscreen,
    setCurrentMapLayer,
    setShowRoads,
    toggleFilterDrawer,
    openUnifiedDrawer,
    toggleUnifiedDrawer,
    setActiveDrawerTab,
    setDrawerMode,
    toggleFacilityDrawer,
    toggleSitrepDrawer,
    toggleMapLayersDrawer,
    openMapLayersDrawer,
    toggleAnalysisDrawer,
    closeAllOverlays
  } = useMapControls();

  const outbreakLoadFiredRef = useRef(false);
  useEffect(() => {
    if (showOutbreakLayer && !outbreakLoadFiredRef.current && onOutbreakLayerEnable) {
      outbreakLoadFiredRef.current = true;
      onOutbreakLayerEnable();
    }
  }, [showOutbreakLayer, onOutbreakLayerEnable]);

  const {
    selectedFacility,
    analysisData,
    analysisLoading,
    isAIGenerated,
    analysisTimestamp,
    handleAnalyzeFacility,
    setSelectedFacility,
    setAnalysisData
  } = useAIAnalysis();
  const [dataHubSection, setDataHubSection] = useState('boundaries');

  // Playback hook - must come after filteredDisasters is defined
  const {
    playbackEnabled,
    isPlaying,
    currentDate,
    playbackSpeed,
    dateRange,
    togglePlayback,
    togglePlayPause,
    changeSpeed,
    jumpToDate,
    filterByPlaybackDate
  } = usePlayback(filteredDisasters, acledData, outbreaks);

  // WorldPop hook
  const {
    worldPopData,
    isLoading: worldPopLoading,
    error: worldPopError,
    lastFetchParams: worldPopLastFetch,
    showWorldPopLayer,
    activeLayerType: worldPopLayerType,
    setActiveLayerType: setWorldPopLayerType,
    toggleWorldPopLayer,
    fetchWorldPopData,
    clearWorldPopData,
    geeTileUrl, // GEE tile URL for raster visualization
    scopeToShapefile,
    toggleScopeToShapefile,
  } = useWorldPop();
  const [showWorldPopDrawer, setShowWorldPopDrawer] = useState(false);

  // Lift worldPopData to parent when it changes
  useEffect(() => {
    if (onWorldPopDataChange) {
      onWorldPopDataChange(worldPopData, worldPopLastFetch);
    }
  }, [worldPopData, worldPopLastFetch]);

  // OSM Infrastructure hook
  const {
    osmData,
    osmLoading,
    osmError,
    osmStats,
    osmTimestamp,
    osmBoundary,
    osmWarning,
    osmLayers,
    osmLayerVisibility,
    showOSMLayer,
    fetchOSMInfrastructure,
    beginOSMBatch,
    endOSMBatch,
    refreshOSM,
    clearOSM,
    clearOSMCategory,
    toggleLayer,
    toggleLayerVisibility,
    toggleAllOSM,
    setOsmLayerVisibility,
    setShowOSMLayer,
  } = useOSMInfrastructure();
  const [showOSMDrawer, setShowOSMDrawer] = useState(false);

  // Lift osmData to parent when it changes
  useEffect(() => {
    if (onOSMDataChange) {
      onOSMDataChange(osmData);
    }
  }, [osmData, onOSMDataChange]);

  // Logistics Assessment hook
  const {
    logisticsData,
    logisticsLoading,
    logisticsError,
    showLogisticsLayer,
    logisticsLayerVisibility,
    assessLogistics,
    clearLogistics,
    toggleLogisticsLayerVisibility,
    toggleAllLogistics,
    retryAssessment
  } = useLogisticsAssessment();

  const [recommendations, setRecommendations] = useState(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsAIGenerated, setRecommendationsAIGenerated] = useState(false);
  const [recommendationsTimestamp, setRecommendationsTimestamp] = useState(null);
  const [recommendationsCache, setRecommendationsCache] = useState({}); // Cache by facility name
  const [recommendationsFacilityKey, setRecommendationsFacilityKey] = useState(null);

  // Campaign Dashboard state
  const [showCampaignDashboard, setShowCampaignDashboard] = useState(false);

  // District boundaries state (districts is now passed as prop)
  const [showDistricts, setShowDistricts] = useState(true);
  const [showDistrictBorders, setShowDistrictBorders] = useState(true);
  const [forceDistrictLabels, setForceDistrictLabels] = useState(false);
  const [highlightedDistricts, setHighlightedDistricts] = useState([]);
  const [chatMapMarkers, setChatMapMarkers] = useState([]);
  const [chatMetricBubbleField, setChatMetricBubbleField] = useState('');
  const [chatMetricBubbleColor, setChatMetricBubbleColor] = useState(DEFAULT_METRIC_BUBBLE_COLOR);
  const [adminDatasetScopeSelectedOnly, setAdminDatasetScopeSelectedOnly] = useState(false);

  // Weather context state for chatbot
  const [weatherContext, setWeatherContext] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Auto-zoom to fit districts when loaded (only once when first loaded)
  const hasZoomedToDistricts = useRef(false);
  useEffect(() => {
    if (districts && districts.length > 0 && mapRef.current && !hasZoomedToDistricts.current) {
      console.log('Auto-zooming to fit', districts.length, 'districts');

      // Calculate bounds from all districts
      const bounds = L.latLngBounds();
      let hasValidBounds = false;

      districts.forEach(district => {
        if (district.bounds) {
          bounds.extend([
            [district.bounds.minLat, district.bounds.minLng],
            [district.bounds.maxLat, district.bounds.maxLng]
          ]);
          hasValidBounds = true;
        }
      });

      if (hasValidBounds && bounds.isValid()) {
        console.log('Fitting map to district bounds:', bounds);
        // Use animate: false to make it instant and less jarring
        // Don't set maxZoom so it can zoom appropriately based on bounds
        mapRef.current.fitBounds(bounds, {
          padding: [50, 50],
          animate: false
        });
        hasZoomedToDistricts.current = true;
      }
    }
  }, [districts]);

  // Fetch weather context when chat drawer opens or data changes
  useEffect(() => {
    // Only fetch if chat drawer is open and we have facilities
    if (!showChatDrawer || !facilities || facilities.length === 0) {
      return;
    }

    // Avoid refetching if we already have weather data
    if (weatherContext) {
      return;
    }

    const fetchWeather = async () => {
      setWeatherLoading(true);
      console.log('Fetching weather context for chatbot...');

      try {
        // Extract GeoJSON features from districts for weather context
        const districtFeatures = districts && districts.length > 0
          ? districts.map(d => ({
              geometry: d.geometry,
              properties: {
                name: d.name,
                NAME: d.name,
                DISTRICT: d.name
              }
            }))
          : null;

        const weather = await buildWeatherContext(facilities, districtFeatures);

        if (weather) {
          console.log('Weather context loaded:', weather);
          setWeatherContext(weather);
        } else {
          console.log('No weather data available');
        }
      } catch (error) {
        console.error('Failed to fetch weather context:', error);
      } finally {
        setWeatherLoading(false);
      }
    };

    fetchWeather();
  }, [showChatDrawer, facilities, districts, weatherContext]);

  // Function to highlight districts based on criteria from AI chat
  const handleHighlightDistricts = (criteria) => {
    console.log('Highlighting districts with criteria:', criteria);

    if (!districts || districts.length === 0) {
      console.warn('No districts available to highlight');
      return;
    }

    // Calculate risk levels first
    const districtRisks = calculateDistrictRisks(districts, filteredDisasters, filteredAcledData);

    let matchingDistricts = [];

    if (Array.isArray(criteria.ids) && criteria.ids.length > 0) {
      const requestedIds = new Set(criteria.ids.map((id) => String(id)));
      matchingDistricts = districts.filter((district) => requestedIds.has(String(district.id)));
    }

    // Filter based on risk level
    if (criteria.riskLevels && criteria.riskLevels.length > 0) {
      matchingDistricts = districts.filter(district => {
        const risk = districtRisks[district.id];
        return risk && criteria.riskLevels.includes(risk.level);
      });
    }

    // Filter based on district names
    if (criteria.names && criteria.names.length > 0) {
      const nameMatches = getDistrictsMatchingRequestedNames(districts, criteria.names, criteria.adminLevel);
      matchingDistricts = [...matchingDistricts, ...nameMatches];
    }

    // Filter based on event count threshold
    if (criteria.minEventCount !== undefined) {
      const eventCountMatches = districts.filter(district => {
        const risk = districtRisks[district.id];
        return risk && risk.eventCount >= criteria.minEventCount;
      });
      matchingDistricts = [...matchingDistricts, ...eventCountMatches];
    }

    // Remove duplicates
    matchingDistricts = [...new Set(matchingDistricts)];

    console.log(`Found ${matchingDistricts.length} districts matching criteria:`, matchingDistricts.map(d => d.name));
    setShowDistricts(true);
    setHighlightedDistricts(matchingDistricts.map(d => d.id));
    if (matchingDistricts.length === 0) {
      addToast('No admin areas matched that highlight request.', 'warning');
    } else {
      // Show which districts were found if names were requested
      if (criteria.names && criteria.names.length > 0) {
        const foundNames = matchingDistricts.map(d => d.name).join(', ');
        if (matchingDistricts.length < criteria.names.length) {
          addToast(`Highlighted ${matchingDistricts.length} of ${criteria.names.length} requested areas: ${foundNames}`, 'warning');
        } else {
          addToast(`Highlighted ${matchingDistricts.length} admin area${matchingDistricts.length === 1 ? '' : 's'}: ${foundNames}`, 'success');
        }
      } else {
        addToast(`Highlighted ${matchingDistricts.length} admin area${matchingDistricts.length === 1 ? '' : 's'}.`, 'success');
      }
    }

    // Zoom to highlighted districts if any found
    if (matchingDistricts.length > 0 && mapInstance) {
      const bounds = L.latLngBounds();
      matchingDistricts.forEach(district => {
        if (district.bounds) {
          bounds.extend([
            [district.bounds.minLat, district.bounds.minLng],
            [district.bounds.maxLat, district.bounds.maxLng]
          ]);
        }
      });
      if (bounds.isValid()) {
        mapInstance.fitBounds(bounds, { padding: [50, 50] });
      }
    }

    if (mapInstance) {
      window.setTimeout(() => mapInstance.invalidateSize(), 50);
    }
  };

  const getDistrictsMatchingChatCriteria = (criteria = {}) => {
    if (!districts || districts.length === 0) return [];

    const risks = calculateDistrictRisks(districts, filteredDisasters, filteredAcledData);
    let matchingDistricts = [];

    if (Array.isArray(criteria.ids) && criteria.ids.length > 0) {
      const requestedIds = new Set(criteria.ids.map((id) => String(id)));
      matchingDistricts = districts.filter((district) => requestedIds.has(String(district.id)));
    }

    if (Array.isArray(criteria.riskLevels) && criteria.riskLevels.length > 0) {
      matchingDistricts = districts.filter((district) => {
        const risk = risks[district.id];
        return risk && criteria.riskLevels.includes(risk.level);
      });
    }

    if (Array.isArray(criteria.names) && criteria.names.length > 0) {
      const nameMatches = getDistrictsMatchingRequestedNames(districts, criteria.names, criteria.adminLevel);
      matchingDistricts = [...matchingDistricts, ...nameMatches];
    }

    if (criteria.minEventCount !== undefined) {
      const eventCountMatches = districts.filter((district) => {
        const risk = risks[district.id];
        return risk && risk.eventCount >= criteria.minEventCount;
      });
      matchingDistricts = [...matchingDistricts, ...eventCountMatches];
    }

    return Array.from(new Map(matchingDistricts.map((district) => [district.id, district])).values());
  };

  const zoomToDistricts = (districtsToZoom = []) => {
    if (!districtsToZoom.length || !mapInstance) return;

    const bounds = L.latLngBounds();
    districtsToZoom.forEach((district) => {
      if (district.bounds) {
        bounds.extend([
          [district.bounds.minLat, district.bounds.minLng],
          [district.bounds.maxLat, district.bounds.maxLng]
        ]);
      }
    });

    if (bounds.isValid()) {
      mapInstance.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  const getDistrictCenter = (district = {}) => {
    if (district.bounds) {
      const latitude = (Number(district.bounds.minLat) + Number(district.bounds.maxLat)) / 2;
      const longitude = (Number(district.bounds.minLng) + Number(district.bounds.maxLng)) / 2;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    }

    try {
      const layer = L.geoJSON({
        type: 'Feature',
        properties: district.properties || {},
        geometry: district.geometry
      });
      const center = layer.getBounds().getCenter();
      if (Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
        return { latitude: center.lat, longitude: center.lng };
      }
    } catch (error) {
      console.warn('Unable to calculate district center for chat pin:', error);
    }

    return null;
  };

  const handleChatMapCommand = (command) => {
    if (!command?.action) return;

    switch (command.action) {
      case 'set_base_map': {
        const requestedLayer = String(command.layer || '').toLowerCase();
        const layerExists = Object.values(MAP_LAYERS).some((layer) => layer.id === requestedLayer);

        if (!layerExists) {
          addToast('Chat requested an unsupported map layer.', 'warning');
          return;
        }

        setCurrentMapLayer(requestedLayer);

        if (command.resetContextOverlays) {
          setShowFloodContextLayer(false);
          setShowDroughtContextLayer(false);
          setShowAccessibilityContextLayer(false);
        }

        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }

        const nextLayer = Object.values(MAP_LAYERS).find((layer) => layer.id === requestedLayer);
        addToast(`Switched map to ${nextLayer?.name || requestedLayer}.`, 'success');
        return;
      }
      case 'set_context_overlays': {
        const overlays = Array.isArray(command.overlays) ? command.overlays : [];
        const visible = command.visible !== false;
        const supportedOverlays = {
          flood_context: setShowFloodContextLayer,
          drought_context: setShowDroughtContextLayer,
          accessibility_context: setShowAccessibilityContextLayer
        };
        const labels = {
          flood_context: 'Flood Context',
          drought_context: 'Drought Context',
          accessibility_context: 'Accessibility / Hard-to-Reach'
        };
        const appliedOverlays = overlays.filter((overlay) => supportedOverlays[overlay]);

        if (!appliedOverlays.length) {
          addToast('Chat requested an unsupported context overlay.', 'warning');
          return;
        }

        appliedOverlays.forEach((overlay) => supportedOverlays[overlay](visible));

        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }

        addToast(
          `${visible ? 'Showing' : 'Hiding'} ${appliedOverlays.map((overlay) => labels[overlay]).join(', ')} overlay${appliedOverlays.length === 1 ? '' : 's'}.`,
          'success'
        );
        return;
      }
      case 'highlight_districts': {
        handleHighlightDistricts(command.criteria || {});
        return;
      }
      case 'select_districts': {
        const matchingDistricts = getDistrictsMatchingChatCriteria(command.criteria || {});
        if (!matchingDistricts.length) {
          addToast('No matching admin areas found for that chat request.', 'warning');
          return;
        }

        setHighlightedDistricts(matchingDistricts.map((district) => district.id));
        zoomToDistricts(matchingDistricts);
        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }

        if (onAnalysisDistrictsChange) {
          const selectedById = new Map((selectedAnalysisDistricts || []).map((district) => [String(district.id), district]));
          matchingDistricts.forEach((district) => {
            selectedById.set(String(district.id), district);
          });
          onAnalysisDistrictsChange(Array.from(selectedById.values()));
          addToast(`Selected ${matchingDistricts.length} admin area${matchingDistricts.length === 1 ? '' : 's'} from chat.`, 'success');
        }
        return;
      }
      case 'deselect_districts': {
        const matchingDistricts = getDistrictsMatchingChatCriteria(command.criteria || {});
        if (!matchingDistricts.length) {
          addToast('No matching admin areas found for that chat request.', 'warning');
          return;
        }

        const removeIds = new Set(matchingDistricts.map((district) => String(district.id)));
        const nextSelectedDistricts = (selectedAnalysisDistricts || []).filter((district) => !removeIds.has(String(district.id)));
        setHighlightedDistricts([]);

        if (onAnalysisDistrictsChange) {
          onAnalysisDistrictsChange(nextSelectedDistricts);
          addToast(`Deselected ${matchingDistricts.length} admin area${matchingDistricts.length === 1 ? '' : 's'} from analysis.`, 'success');
        }

        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }
        return;
      }
      case 'clear_analysis_scope': {
        setHighlightedDistricts([]);

        if (onAnalysisDistrictsChange) {
          onAnalysisDistrictsChange([]);
          addToast('Cleared the analysis admin selection.', 'success');
        }

        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }
        return;
      }
      case 'clear_highlights': {
        setHighlightedDistricts([]);
        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }
        addToast('Cleared admin highlights.', 'info');
        return;
      }
      case 'clear_all_map_overlays': {
        // Clear everything: highlights, selections, markers, metric layers, AND OSM data
        setHighlightedDistricts([]);
        setChatMapMarkers([]);
        setChatMetricBubbleField('');
        setAdminDatasetScopeSelectedOnly(false);
        if (adminFillMode === ADMIN_FILL_MODES.DATASET) {
          setAdminFillMode(ADMIN_FILL_MODES.RISK);
          setShowDistrictRiskFill(true);
        }
        if (onAnalysisDistrictsChange) {
          onAnalysisDistrictsChange([]);
        }
        // Also clear OSM data
        if (osmData || osmLayers.length > 0) {
          clearOSM();
        }
        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }
        addToast('Cleared all map overlays, selections, and OSM infrastructure.', 'info');
        return;
      }
      case 'clear_map_annotations': {
        setHighlightedDistricts([]);
        setChatMapMarkers([]);
        setChatMetricBubbleField('');
        setAdminDatasetScopeSelectedOnly(false);
        if (adminFillMode === ADMIN_FILL_MODES.DATASET) {
          setAdminFillMode(ADMIN_FILL_MODES.RISK);
          setShowDistrictRiskFill(true);
        }
        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }
        addToast('Cleared chat map overlays.', 'info');
        return;
      }
      case 'clear_metric_bubbles': {
        setChatMetricBubbleField('');
        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }
        addToast('Cleared metric bubbles.', 'info');
        return;
      }
      case 'clear_metric_layers': {
        setHighlightedDistricts([]);
        setChatMetricBubbleField('');
        setAdminDatasetScopeSelectedOnly(false);
        if (adminFillMode === ADMIN_FILL_MODES.DATASET) {
          setAdminFillMode(ADMIN_FILL_MODES.RISK);
          setShowDistrictRiskFill(true);
        }
        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }
        addToast('Reset chat metric map layers.', 'info');
        return;
      }
      case 'set_admin_display': {
        if (typeof command.showLayer === 'boolean') {
          setShowDistricts(command.showLayer);
        }
        if (typeof command.showBorders === 'boolean') {
          setShowDistrictBorders(command.showBorders);
        }
        if (typeof command.showLabels === 'boolean') {
          setShowDistrictLabels(command.showLabels);
          setForceDistrictLabels(command.showLabels);
        }
        if ((command.showBorders === true || command.showLabels === true) && typeof command.showLayer !== 'boolean') {
          setShowDistricts(true);
        }
        if (mapInstance) {
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }
        addToast('Updated admin layer display.', 'info');
        return;
      }
      case 'add_marker': {
        let latitude = Number(command.latitude ?? command.lat);
        let longitude = Number(command.longitude ?? command.lng ?? command.lon);
        let label = command.label || 'Chat marker';

        if ((!Number.isFinite(latitude) || !Number.isFinite(longitude)) && command.criteria) {
          const matchingDistricts = getDistrictsMatchingChatCriteria(command.criteria || {});
          const targetDistrict = matchingDistricts[0];
          const center = targetDistrict ? getDistrictCenter(targetDistrict) : null;

          if (center) {
            latitude = center.latitude;
            longitude = center.longitude;
            label = command.label || targetDistrict.name || label;
            setShowDistricts(true);
            setHighlightedDistricts(matchingDistricts.slice(0, 1).map((district) => district.id));
          }
        }

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          addToast('Chat could not find valid marker coordinates.', 'warning');
          return;
        }

        const marker = {
          id: `${Date.now()}-${chatMapMarkers.length}`,
          latitude,
          longitude,
          label,
          color: command.color || '#2563eb'
        };
        setChatMapMarkers((current) => [...current, marker].slice(-25));
        addToast(`Dropped pin: ${marker.label}.`, 'success');
        if (mapInstance) {
          mapInstance.flyTo([latitude, longitude], Math.max(mapInstance.getZoom(), 9), { duration: 0.8 });
          window.setTimeout(() => mapInstance.invalidateSize(), 50);
        }
        return;
      }
      case 'style_admin_by_metric': {
        const requestedField = String(command.metricField || '').toLowerCase();
        const metric = adminNumericFields.find((item) => (
          item.field.toLowerCase() === requestedField ||
          item.field.toLowerCase().includes(requestedField) ||
          requestedField.includes(item.field.toLowerCase())
        ));

        if (!metric) {
          addToast('No matching numeric field found for chat choropleth styling.', 'warning');
          return;
        }

        setShowDistricts(true);
        setAdminFillMode(ADMIN_FILL_MODES.DATASET);
        setAdminMetricField(metric.field);
        setAdminMetricMeaning(metric.suggestedMeaning || suggestMetricMeaning(metric.field));
        setAdminDatasetScopeSelectedOnly((selectedAnalysisDistricts || []).length > 0);
        setHighlightedDistricts([]);
        if (command.palette && Object.values(ADMIN_COLOR_PALETTES).includes(command.palette)) {
          setAdminColorPalette(command.palette);
        }
        addToast(`Colored admin areas by ${metric.field}.`, 'success');
        return;
      }
      case 'style_admin_metric_bubbles': {
        const requestedField = String(command.metricField || '').toLowerCase();
        const metric = adminNumericFields.find((item) => (
          item.field.toLowerCase() === requestedField ||
          item.field.toLowerCase().includes(requestedField) ||
          requestedField.includes(item.field.toLowerCase())
        ));

        if (!metric) {
          addToast('No matching numeric field found for chat bubble styling.', 'warning');
          return;
        }

        if (!districts?.length) {
          addToast('Upload admin boundaries before creating district metric bubbles.', 'warning');
          return;
        }

        setShowDistricts(true);
        setChatMetricBubbleField(metric.field);
        setChatMetricBubbleColor(command.color || DEFAULT_METRIC_BUBBLE_COLOR);
        addToast(`Mapped ${metric.field} as proportional bubbles.`, 'success');
        return;
      }
      case 'show_osm_layer': {
        const category = command.category;
        if (!category) {
          addToast('No OSM category specified.', 'warning');
          return;
        }

        // Check if we have selected analysis districts
        if (!selectedAnalysisDistricts || selectedAnalysisDistricts.length === 0) {
          addToast('Please select an analysis area first to load OSM infrastructure.', 'warning');
          return;
        }

        // Set visibility to true first
        const categories = category === 'hospitals' ? ['hospital', 'clinic'] : [category.replace(/s$/, '')];
        setOsmLayerVisibility(prev => {
          const next = { ...prev };
          categories.forEach(cat => {
            next[cat] = true;
          });
          return next;
        });

        // Ensure OSM layer is shown
        setShowOSMLayer(true);

        // Fetch the OSM data - replicate the onLoadOSM flow
        addToast(`Loading ${category}...`, 'info');

        (async () => {
          const districtsWithGeometry = selectedAnalysisDistricts.filter((district) =>
            district?.geometry?.coordinates
          );

          if (districtsWithGeometry.length === 0) {
            addToast('Selected districts have no geometry data.', 'error');
            return;
          }

          beginOSMBatch();

          try {
            for (let districtIndex = 0; districtIndex < districtsWithGeometry.length; districtIndex += 1) {
              const district = districtsWithGeometry[districtIndex];
              const districtName = district.name || district.properties?.name || district.properties?.NAME || `District ${districtIndex + 1}`;

              console.log(`📍 Loading OSM ${category} for: ${districtName}`);

              await fetchOSMInfrastructure(district.geometry, [category], {
                mergeWithExisting: districtIndex > 0,
                timeoutMs: 20000,
                maxRetries: 0,
                disableBboxFallback: true,
                requestTimeoutMs: 28000
              });
            }

            addToast(`${category} loaded successfully.`, 'success');
          } catch (err) {
            console.error('Failed to load OSM category:', err);
            addToast(`Failed to load ${category}.`, 'error');
          } finally {
            endOSMBatch();
          }
        })();

        return;
      }
      case 'hide_osm_layer': {
        const category = command.category;
        if (!category) {
          addToast('No OSM category specified.', 'warning');
          return;
        }

        // Set visibility to false (keeps data, just hides)
        const categories = category === 'hospitals' ? ['hospital', 'clinic'] : [category.replace(/s$/, '')];
        setOsmLayerVisibility(prev => {
          const next = { ...prev };
          categories.forEach(cat => {
            next[cat] = false;
          });
          return next;
        });

        addToast(`Hid ${category} from map.`, 'info');
        return;
      }
      case 'remove_osm_layer': {
        const category = command.category;
        if (!category) {
          addToast('No OSM category specified.', 'warning');
          return;
        }

        // Remove from data completely
        clearOSMCategory(category);

        // Remove from osmLayers
        if (osmLayers.includes(category)) {
          toggleLayer(category);
        }

        addToast(`Removed ${category} data.`, 'info');
        return;
      }
      case 'remove_all_osm': {
        // Clear ALL OSM data
        if (osmData || osmLayers.length > 0) {
          // Clear all OSM data
          clearOSM();
          addToast('Removed all OSM infrastructure data.', 'success');
        } else {
          addToast('No OSM data to remove.', 'info');
        }
        return;
      }
      case 'style_admin_by_risk': {
        setShowDistricts(true);
        setAdminFillMode(ADMIN_FILL_MODES.RISK);
        setAdminDatasetScopeSelectedOnly(false);
        setShowDistrictRiskFill(true);
        addToast('Colored admin areas by current risk level.', 'success');
        return;
      }
      default:
        console.warn('Unsupported chat map command:', command);
    }
  };

  // Calculate district risk levels based on disasters and ACLED events
  const calculateDistrictRisks = (districts, disasters, acledData) => {
    if (!districts || districts.length === 0) return {};
    return buildDistrictRiskIndex(districts, { disasters, acledData });
  };

  const getRecommendationsCacheKey = (facility) => {
    const facilityKey = getFacilityIdentityKey(facility);
    const facilityImpacts = impactedFacilities.find(
      f => getFacilityIdentityKey(f.facility) === facilityKey
    )?.impacts || [];

    return `${facilityKey || 'unknown'}_${facilityImpacts.length}`;
  };

  // Generate recommendations for a facility
  const handleGenerateRecommendations = async (facility, forceRefresh = false) => {
    const facilityKey = getFacilityIdentityKey(facility);
    const facilityImpacts = impactedFacilities.find(
      f => getFacilityIdentityKey(f.facility) === facilityKey
    )?.impacts || [];

    // Check if we have cached recommendations for this facility
    const cacheKey = getRecommendationsCacheKey(facility);
    if (!forceRefresh && recommendationsCache[cacheKey]) {
      console.log('Using cached recommendations for:', facility.name);
      setRecommendations(recommendationsCache[cacheKey].recommendations);
      setRecommendationsAIGenerated(recommendationsCache[cacheKey].isAIGenerated);
      setRecommendationsTimestamp(recommendationsCache[cacheKey].timestamp);
      setRecommendationsFacilityKey(cacheKey);
      return;
    }

    setRecommendationsLoading(true);
    setRecommendationsFacilityKey(cacheKey);

    try {
      console.log('Generating recommendations for:', facility.name, 'with', facilityImpacts.length, 'impacts');
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          facility,
          impacts: facilityImpacts,
          useAI: true,
          osmData: osmData
        })
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Recommendations received:', data);

      const timestamp = Date.now();

      // Cache the recommendations
      setRecommendationsCache(prev => ({
        ...prev,
        [cacheKey]: {
          recommendations: data.recommendations,
          isAIGenerated: data.isAIGenerated || false,
          timestamp
        }
      }));

      setRecommendations(data.recommendations || null);
      setRecommendationsAIGenerated(data.isAIGenerated || false);
      setRecommendationsTimestamp(timestamp);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      setRecommendations({ error: 'Failed to generate recommendations. Please try again.' });
      setRecommendationsAIGenerated(false);
      setRecommendationsTimestamp(Date.now());
    } finally {
      setRecommendationsLoading(false);
    }
  };

  // Filter ACLED data based on config (same logic as AcledMarkers.js)
  const filteredAcledData = useMemo(() => {
    if (!acledData || acledData.length === 0 || !acledEnabled) {
      return [];
    }

    // Find the most recent date in the dataset
    const allDates = acledData
      .map(e => new Date(e.event_date))
      .filter(d => !isNaN(d.getTime()));

    const mostRecentDate = allDates.length > 0
      ? new Date(Math.max(...allDates))
      : new Date();

    // Calculate cutoff date from the most recent event
    const dateRange = acledConfig.dateRange || 60;
    const cutoffDate = new Date(mostRecentDate);
    cutoffDate.setDate(cutoffDate.getDate() - dateRange);

    // Get filters from config
    const eventTypeFilter = acledConfig.eventTypes || [];
    const selectedCountries = acledConfig.selectedCountries || [];
    const selectedRegions = acledConfig.selectedRegions || [];

    // Filter ACLED data
    return acledData.filter(event => {
      // Date filter
      const eventDate = new Date(event.event_date);
      if (eventDate < cutoffDate) return false;

      // Event type filter (if specified)
      if (eventTypeFilter.length > 0 && !eventTypeFilter.includes(event.event_type)) {
        return false;
      }

      // Country filter (if countries are selected)
      if (selectedCountries.length > 0 && !selectedCountries.includes(event.country)) {
        return false;
      }

      // Region filter (if regions are selected)
      if (selectedRegions.length > 0 && !selectedRegions.includes(event.admin1)) {
        return false;
      }

      // Ensure valid coordinates
      if (!event.latitude || !event.longitude) return false;

      return true;
    }).sort((a, b) => {
      const aTime = new Date(a.event_date).getTime() || 0;
      const bTime = new Date(b.event_date).getTime() || 0;
      return bTime - aTime;
    });
  }, [acledData, acledEnabled, acledConfig]);

  // Removed: Auto-showing zoom indicator when date filter changes
  // useEffect(() => {
  //   if (dateFilter) {
  //     setShowZoomIndicator(true);
  //   }
  // }, [dateFilter, setShowZoomIndicator]);

  // Initialize timeline with all disasters
  useEffect(() => {
    setTimelineFilteredDisasters(disasters || []);
  }, [disasters, setTimelineFilteredDisasters]);

  // Handle fullscreen change events from the browser
  useEffect(() => {
    const fullscreenChangeHandler = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.mozFullScreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', fullscreenChangeHandler);
    document.addEventListener('mozfullscreenchange', fullscreenChangeHandler);
    document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
    document.addEventListener('MSFullscreenChange', fullscreenChangeHandler);

    return () => {
      document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
      document.removeEventListener('mozfullscreenchange', fullscreenChangeHandler);
      document.removeEventListener('webkitfullscreenchange', fullscreenChangeHandler);
      document.removeEventListener('MSFullscreenChange', fullscreenChangeHandler);
    };
  }, [setIsFullscreen]);

  // Effect to clean up map resources when component unmounts
  useEffect(() => {
    return () => {
      if (mapInstance) {
        mapInstance.off('click', handleMapClick);
      }
    };
  }, [mapInstance]);

  // Handle map click to close overlays
  const handleMapClick = () => {
    closeAllOverlays();
  };

  // Invalidate map size when drawer opens/closes
  useEffect(() => {
    if (mapInstance) {
      // Add a small delay to allow CSS transition to complete
      const timer = setTimeout(() => {
        mapInstance.invalidateSize();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [filterDrawerOpen, unifiedDrawerOpen, showChatDrawer, mapInstance]);

  // Zoom to fit all filtered events
  const handleZoomToFit = () => {
    if (mapInstance && filteredDisasters.length > 0) {
      zoomToFilteredEvents(mapInstance, filteredDisasters, facilities);
    }
  };

  // Handle logistics assessment
  const handleLogisticsAssessment = async () => {
    // Only require OSM data - disasters are optional (baseline assessment)
    if (!osmData) {
      addToast('Please upload an admin boundary shapefile to enable logistics assessment', 'warning');
      openWorkflowStep('enrich');
      return;
    }

    const hasDisasters = filteredDisasters && filteredDisasters.length > 0;
    console.log('🚚 Starting logistics assessment...', hasDisasters ? 'with disasters' : 'baseline mode');

    let logisticsWeatherData = weatherContext?.regional?.rawData || null;

    if (!logisticsWeatherData && facilities && facilities.length > 0) {
      try {
        const weather = await buildWeatherContext(facilities, null);
        if (weather?.regional?.rawData) {
          logisticsWeatherData = weather.regional.rawData;
          setWeatherContext(prev => prev || weather);
        }
      } catch (error) {
        console.warn('Could not fetch weather context for logistics assessment:', error);
      }
    }

    // Calculate bounding box from districts or OSM metadata
    let bounds = osmData.metadata?.boundingBox;

    // OSM metadata boundingBox is [minLon, minLat, maxLon, maxLat].
    if (Array.isArray(bounds) && bounds.length === 4) {
      bounds = {
        west: bounds[0],
        south: bounds[1],
        east: bounds[2],
        north: bounds[3]
      };
    }

    // If no metadata bounds, calculate from districts
    if (!bounds && districts && districts.length > 0) {
      let minLat = Infinity, maxLat = -Infinity;
      let minLon = Infinity, maxLon = -Infinity;

      districts.forEach(district => {
        if (district.geometry && district.geometry.coordinates) {
          const coords = district.geometry.type === 'Polygon'
            ? district.geometry.coordinates[0]
            : district.geometry.coordinates.flat(2);

          coords.forEach(coord => {
            const [lon, lat] = coord;
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);
          });
        }
      });

      if (minLat !== Infinity) {
        bounds = { north: maxLat, south: minLat, east: maxLon, west: minLon };
        console.log('📦 Calculated bounds from districts:', bounds);
      }
    }

    const nearbyAcledEvents = filteredAcledData.filter(event => {
      const eventLat = parseFloat(event.latitude);
      const eventLon = parseFloat(event.longitude);

      if (isNaN(eventLat) || isNaN(eventLon)) return false;
      if (!bounds) return true;

      const buffer = 2;
      return (
        eventLat >= bounds.south - buffer &&
        eventLat <= bounds.north + buffer &&
        eventLon >= bounds.west - buffer &&
        eventLon <= bounds.east + buffer
      );
    });

    // Filter disasters to only those near the region (within 200km)
    // This prevents AI from analyzing irrelevant disasters from other regions
    const nearbyDisasters = !hasDisasters ? [] : filteredDisasters.filter(disaster => {
      const disasterLat = parseFloat(disaster.latitude ?? disaster.lat);
      const disasterLon = parseFloat(disaster.longitude ?? disaster.lon);

      if (isNaN(disasterLat) || isNaN(disasterLon)) return false; // Skip disasters without coordinates
      if (!bounds) return true; // If we still can't determine bounds, include all

      // Simple bounding box check with 200km buffer (~2 degrees)
      const buffer = 2;
      const isNearby = (
        disasterLat >= bounds.south - buffer &&
        disasterLat <= bounds.north + buffer &&
        disasterLon >= bounds.west - buffer &&
        disasterLon <= bounds.east + buffer
      );

      if (!isNearby) {
        console.log(`🚫 Filtered out disaster: ${disaster.title || disaster.eventName} at [${disasterLat}, ${disasterLon}]`);
      }

      return isNearby;
    });

    console.log(`📍 Filtered disasters from ${hasDisasters ? filteredDisasters.length : 0} to ${nearbyDisasters.length} within region`);

    // Allow assessment even without disasters - shows baseline logistics status
    if (nearbyDisasters.length === 0) {
      console.log('⚠️ No disasters found near region - will show baseline logistics assessment');
      addToast('No active disasters near this region. Showing baseline logistics status.', 'info');
      // Continue with empty disasters array to show baseline assessment
    }

    // Open the logistics drawer immediately to show loading state
    openUnifiedDrawer('logistics', 'logistics');

    const locationContext = districts && districts.length > 0
      ? extractLocationFromDistrict(districts[0])
      : null;

    // Perform assessment with nearby disasters only
    const result = await assessLogistics(
      osmData,
      nearbyDisasters,
      facilities,
      nearbyAcledEvents,
      {
        weatherData: logisticsWeatherData,
        locationContext
      }
    );

    if (result) {
      addToast('Logistics assessment completed successfully', 'success');
    } else if (logisticsError) {
      addToast(`Logistics assessment failed: ${logisticsError}`, 'error');
    }
  };

  // Handle fullscreen toggle
  const handleFullscreenToggle = () => {
    if (mapContainerRef.current) {
      toggleFullscreen(mapContainerRef.current, isFullscreen);
    }
  };

  // Get current map layer configuration
  const currentLayer = MAP_LAYERS[currentMapLayer.toUpperCase()] || MAP_LAYERS.STREET;
  const [geeBaseLayerUrl, setGeeBaseLayerUrl] = useState(null);
  const [geeBaseLayerMetadata, setGeeBaseLayerMetadata] = useState(null);
  const [geeBaseLayerError, setGeeBaseLayerError] = useState(null);
  const [nighttimeCompareEnabled, setNighttimeCompareEnabled] = useState(false);
  const [nighttimeBeforeMonth, setNighttimeBeforeMonth] = useState('');
  const [nighttimeAfterMonth, setNighttimeAfterMonth] = useState('');
  const [nighttimeBeforeTileUrl, setNighttimeBeforeTileUrl] = useState(null);
  const [nighttimeBeforeMetadata, setNighttimeBeforeMetadata] = useState(null);
  const [nighttimeComparePosition, setNighttimeComparePosition] = useState(50);
  const [floodContextTileUrl, setFloodContextTileUrl] = useState(null);
  const [droughtContextTileUrl, setDroughtContextTileUrl] = useState(null);
  const [accessibilityContextTileUrl, setAccessibilityContextTileUrl] = useState(null);
  const [geeEvidencePaneReady, setGeeEvidencePaneReady] = useState(false);
  const [geeOverlayError, setGeeOverlayError] = useState(null);
  const geeBounds = useMemo(
    () => calculateBounds(selectedAnalysisDistricts?.length ? selectedAnalysisDistricts : districts),
    [selectedAnalysisDistricts, districts]
  );
  const filteredAcledCount = filteredAcledData.length;
  const selectedDistrictAcledSummary = useMemo(
    () => buildAcledAggregateSummary(filteredAcledData, selectedAnalysisDistricts),
    [filteredAcledData, selectedAnalysisDistricts]
  );
  const visibleDisasters = useMemo(
    () => (playbackEnabled ? filterByPlaybackDate(filteredDisasters, 'pubDate') : filteredDisasters),
    [playbackEnabled, filterByPlaybackDate, filteredDisasters]
  );
  const visibleAcledEvents = useMemo(
    () => (playbackEnabled ? filterByPlaybackDate(filteredAcledData, 'event_date') : filteredAcledData),
    [playbackEnabled, filterByPlaybackDate, filteredAcledData]
  );
  const visibleOutbreaks = useMemo(
    () => (playbackEnabled ? filterByPlaybackDate(outbreaks, 'filterDate') : outbreaks),
    [playbackEnabled, filterByPlaybackDate, outbreaks]
  );
  const deferredDistricts = useDeferredValue(districts);
  const deferredFacilities = useDeferredValue(facilities);
  // Defer the chat-open flag so flipping it doesn't synchronously block the
  // click on building the (heavy) admin-area chat index over all districts.
  const deferredShowChatDrawer = useDeferredValue(showChatDrawer);
  const facilityImpactState = useMemo(() => {
    const keys = new Set();

    (impactedFacilities || []).forEach((impactRecord) => {
      const facilityKey = getFacilityIdentityKey(impactRecord?.facility);
      if (facilityKey) keys.add(facilityKey);
    });

    return {
      keys,
      signature: Array.from(keys).sort().join('|') || 'none',
    };
  }, [impactedFacilities]);

  useEffect(() => {
    if (onEvidenceLayersChange) {
      onEvidenceLayersChange([
        ...(showFloodContextLayer ? ['flood_context'] : []),
        ...(showDroughtContextLayer ? ['drought_context'] : []),
        ...(showAccessibilityContextLayer ? ['accessibility_context'] : []),
        ...(currentMapLayer === 'nighttime_lights' ? ['nighttime_lights'] : [])
      ]);
    }
  }, [showFloodContextLayer, showDroughtContextLayer, showAccessibilityContextLayer, currentMapLayer, onEvidenceLayersChange]);

  useEffect(() => {
    if (hydratedEvidenceLayersRef.current) return;
    if (!Array.isArray(enabledEvidenceLayers) || enabledEvidenceLayers.length === 0) return;

    const enabled = new Set(enabledEvidenceLayers);
    setShowFloodContextLayer(enabled.has('flood_context'));
    setShowDroughtContextLayer(enabled.has('drought_context'));
    setShowAccessibilityContextLayer(enabled.has('accessibility_context'));
    hydratedEvidenceLayersRef.current = true;
  }, [enabledEvidenceLayers, setShowFloodContextLayer, setShowDroughtContextLayer, setShowAccessibilityContextLayer]);

  useEffect(() => {
    let cancelled = false;

    if (currentLayer.type !== 'gee') {
      setGeeBaseLayerUrl(null);
      setGeeBaseLayerMetadata(null);
      setGeeBaseLayerError(null);
      return undefined;
    }

    const loadGeeBaseLayer = async () => {
      try {
        setGeeBaseLayerError(null);
        const response = await fetch('/api/gee-tiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset: currentLayer.dataset,
            bounds: geeBounds || null,
            month: currentMapLayer === 'nighttime_lights' ? (nighttimeAfterMonth || null) : null
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load Earth Engine imagery');
        }

        if (!cancelled) {
          setGeeBaseLayerUrl(data.tileUrl);
          setGeeBaseLayerMetadata(data.metadata || null);
        }
      } catch (error) {
        if (!cancelled) {
          setGeeBaseLayerUrl(null);
          setGeeBaseLayerMetadata(null);
          setGeeBaseLayerError(error.message || 'Failed to load Earth Engine imagery');
          console.error('[MapComponent] GEE baselayer error:', error);
        }
      }
    };

    loadGeeBaseLayer();
    return () => {
      cancelled = true;
    };
  }, [currentLayer, currentMapLayer, nighttimeAfterMonth, geeBounds]);

  useEffect(() => {
    if (currentMapLayer !== 'nighttime_lights') {
      setNighttimeCompareEnabled(false);
      setNighttimeBeforeTileUrl(null);
      setNighttimeBeforeMetadata(null);
      return;
    }

    if (geeBaseLayerMetadata?.date && !nighttimeAfterMonth) {
      const afterMonth = geeBaseLayerMetadata.date.slice(0, 7);
      const afterDate = new Date(`${afterMonth}-01T00:00:00Z`);
      const beforeDate = new Date(afterDate);
      beforeDate.setUTCMonth(beforeDate.getUTCMonth() - 12);
      setNighttimeAfterMonth(afterMonth);
      setNighttimeBeforeMonth(beforeDate.toISOString().slice(0, 7));
    }
  }, [currentMapLayer, geeBaseLayerMetadata, nighttimeAfterMonth]);

  useEffect(() => {
    let cancelled = false;

    if (
      currentMapLayer !== 'nighttime_lights' ||
      !nighttimeCompareEnabled ||
      !nighttimeBeforeMonth
    ) {
      setNighttimeBeforeTileUrl(null);
      setNighttimeBeforeMetadata(null);
      return undefined;
    }

    const loadNighttimeBeforeLayer = async () => {
      try {
        const response = await fetch('/api/gee-tiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset: 'nighttime_lights',
            bounds: geeBounds || null,
            month: nighttimeBeforeMonth
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load comparison nighttime lights layer');
        }

        if (!cancelled) {
          setNighttimeBeforeTileUrl(data.tileUrl);
          setNighttimeBeforeMetadata(data.metadata || null);
        }
      } catch (error) {
        if (!cancelled) {
          setNighttimeBeforeTileUrl(null);
          setNighttimeBeforeMetadata(null);
          console.error('[MapComponent] Nighttime compare layer error:', error);
        }
      }
    };

    loadNighttimeBeforeLayer();
    return () => {
      cancelled = true;
    };
  }, [currentMapLayer, nighttimeCompareEnabled, nighttimeBeforeMonth, geeBounds]);

  useEffect(() => {
    if (!mapInstance) return undefined;

    const paneName = 'nighttimeCompareBeforePane';
    const existingPane = mapInstance.getPane(paneName) || mapInstance.createPane(paneName);
    existingPane.style.zIndex = '350';
    existingPane.style.pointerEvents = 'none';
    existingPane.style.position = 'absolute';
    existingPane.style.left = '0';
    existingPane.style.top = '0';
    existingPane.style.width = `${nighttimeComparePosition}%`;
    existingPane.style.height = '100%';
    existingPane.style.overflow = 'hidden';
    existingPane.style.clipPath = 'none';
    existingPane.style.webkitClipPath = 'none';

    return undefined;
  }, [mapInstance, nighttimeComparePosition]);

  useEffect(() => {
    if (!mapInstance) {
      setGeeEvidencePaneReady(false);
      return undefined;
    }

    const paneName = 'geeEvidencePane';
    const existingPane = mapInstance.getPane(paneName) || mapInstance.createPane(paneName);
    existingPane.style.zIndex = '300'; // Below admin boundaries (400) but above base tiles (200)
    existingPane.style.pointerEvents = 'none';
    setGeeEvidencePaneReady(true);

    return undefined;
  }, [mapInstance]);

  const updateNighttimeComparePosition = (clientX) => {
    if (!mapContainerRef.current || typeof clientX !== 'number') return;

    const bounds = mapContainerRef.current.getBoundingClientRect();
    if (!bounds.width) return;

    const rawPosition = ((clientX - bounds.left) / bounds.width) * 100;
    setNighttimeComparePosition(Math.max(0, Math.min(100, rawPosition)));
  };

  const stopNighttimeCompareDrag = () => {
    nighttimeCompareDragRef.current = false;
    if (mapInstance?.dragging && !mapInstance.dragging.enabled()) {
      mapInstance.dragging.enable();
    }
  };

  const startNighttimeCompareDrag = (event) => {
    nighttimeCompareDragRef.current = true;
    if (mapInstance?.dragging?.enabled()) {
      mapInstance.dragging.disable();
    }

    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    updateNighttimeComparePosition(clientX);
  };

  useEffect(() => {
    if (!nighttimeCompareEnabled) {
      stopNighttimeCompareDrag();
      return undefined;
    }

    const handlePointerMove = (event) => {
      if (!nighttimeCompareDragRef.current) return;
      const clientX = event.touches?.[0]?.clientX ?? event.clientX;
      updateNighttimeComparePosition(clientX);
    };

    const handlePointerUp = () => {
      if (!nighttimeCompareDragRef.current) return;
      stopNighttimeCompareDrag();
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: true });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
      stopNighttimeCompareDrag();
    };
  }, [nighttimeCompareEnabled, mapInstance]);

  useEffect(() => {
    let cancelled = false;

    const loadOverlay = async (dataset, setter) => {
      try {
        const response = await fetch('/api/gee-tiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset,
            bounds: geeBounds || null
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Failed to load ${dataset}`);
        }

        if (!cancelled) {
          setter(data.tileUrl);
          setGeeOverlayError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setter(null);
          setGeeOverlayError(error.message || 'Failed to load Earth Engine overlay');
          console.error('[MapComponent] GEE overlay error:', error);
        }
      }
    };

    if (showFloodContextLayer) {
      loadOverlay('flood_context', setFloodContextTileUrl);
    } else {
      setFloodContextTileUrl(null);
    }

    if (showDroughtContextLayer) {
      loadOverlay('drought_context', setDroughtContextTileUrl);
    } else {
      setDroughtContextTileUrl(null);
    }

    if (showAccessibilityContextLayer) {
      loadOverlay('accessibility_context', setAccessibilityContextTileUrl);
    } else {
      setAccessibilityContextTileUrl(null);
    }

    return () => {
      cancelled = true;
    };
  }, [showFloodContextLayer, showDroughtContextLayer, showAccessibilityContextLayer, geeBounds]);

  useEffect(() => {
    if (geeBaseLayerError && currentLayer.type === 'gee') {
      addToast(`Earth Engine layer unavailable: ${geeBaseLayerError}`, 'warning');
    }
  }, [geeBaseLayerError, currentLayer.type, addToast]);

  useEffect(() => {
    if (geeOverlayError) {
      addToast(`Earth Engine overlay unavailable: ${geeOverlayError}`, 'warning');
    }
  }, [geeOverlayError, addToast]);
  const districtRisks = useMemo(
    () => calculateDistrictRisks(deferredDistricts, visibleDisasters, visibleAcledEvents),
    [deferredDistricts, visibleDisasters, visibleAcledEvents]
  );
  const shouldBuildAdminMetrics = unifiedDrawerOpen ||
    deferredShowChatDrawer ||
    adminFillMode === ADMIN_FILL_MODES.DATASET ||
    Boolean(chatMetricBubbleField);
  const adminNumericFields = useMemo(
    () => shouldBuildAdminMetrics
      ? buildAdminMetricCatalog(deferredFacilities, deferredDistricts)
      : [],
    [shouldBuildAdminMetrics, deferredFacilities, deferredDistricts]
  );
  const selectedAdminMetric = useMemo(
    () => adminNumericFields.find((item) => item.field === adminMetricField) || null,
    [adminNumericFields, adminMetricField]
  );
  const selectedChatBubbleMetric = useMemo(
    () => adminNumericFields.find((item) => item.field === chatMetricBubbleField) || null,
    [adminNumericFields, chatMetricBubbleField]
  );
  const adminMetricValueSummaries = useMemo(() => {
    if (!deferredShowChatDrawer) return [];
    if (!adminNumericFields.length || !deferredDistricts?.length) return [];

    return adminNumericFields.slice(0, 40).map((metric) => {
      const join = isAdminPropertyMetric(metric)
        ? buildAdminPropertyMetricJoin(deferredDistricts, metric.field)
        : buildAdminDatasetJoin(deferredFacilities, deferredDistricts, metric.field);
      const values = Object.values(join.byDistrictId || {})
        .map((entry) => {
          const aggregated = entry?.aggregated?.[metric.field];
          if (!Number.isFinite(aggregated?.value)) return null;
          return {
            district: entry.districtName || 'Unknown admin area',
            value: aggregated.value,
            count: aggregated.count || 1
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.district.localeCompare(b.district));

      return {
        field: metric.field,
        label: metric.label || metric.field,
        source: metric.source,
        count: values.length,
        values: values.slice(0, values.length <= 80 ? 80 : 25),
        truncated: values.length > 80
      };
    }).filter((summary) => summary.count > 0);
  }, [deferredShowChatDrawer, adminNumericFields, deferredDistricts, deferredFacilities]);
  useEffect(() => {
    if (adminFillMode !== ADMIN_FILL_MODES.DATASET) return;
    if (!adminNumericFields.length) return;
    if (adminMetricField && adminNumericFields.some((item) => item.field === adminMetricField)) return;

    const nextField = adminNumericFields[0];
    setAdminMetricField(nextField.field);
    setAdminMetricMeaning(nextField.suggestedMeaning || suggestMetricMeaning(nextField.field));
  }, [adminFillMode, adminMetricField, adminNumericFields, setAdminMetricField, setAdminMetricMeaning]);
  const adminDatasetJoin = useMemo(
    () => {
      if (adminFillMode !== ADMIN_FILL_MODES.DATASET || !adminMetricField) {
        return {
          byDistrictId: {},
          matchedRows: 0,
          unmatchedRows: 0,
          matchedDistricts: 0,
          totalRows: facilities?.length || 0
        };
      }

      if (isAdminPropertyMetric(selectedAdminMetric)) {
        return buildAdminPropertyMetricJoin(deferredDistricts, adminMetricField);
      }

      return buildAdminDatasetJoin(deferredFacilities, deferredDistricts, adminMetricField);
    },
    [adminFillMode, deferredFacilities, deferredDistricts, adminMetricField, selectedAdminMetric]
  );
  const adminMetricValues = useMemo(
    () => Object.values(adminDatasetJoin.byDistrictId || {})
      .map((entry) => entry?.aggregated?.[adminMetricField]?.value)
      .filter((value) => Number.isFinite(value)),
    [adminDatasetJoin, adminMetricField]
  );
  const adminDatasetScale = useMemo(
    () => buildDatasetColorScale(adminMetricValues, {
      classCount: adminClassCount,
      meaning: adminMetricMeaning,
      classification: adminClassification,
      isPercent: Boolean(selectedAdminMetric?.isPercent),
      palette: adminColorPalette,
      reverseColors: adminReverseColors
    }),
    [adminMetricValues, adminClassCount, adminMetricMeaning, adminClassification, adminColorPalette, adminReverseColors, selectedAdminMetric]
  );
  const adminDatasetStyle = useMemo(
    () => ({
      mode: adminFillMode,
      metricField: adminMetricField,
      byDistrictId: adminDatasetJoin.byDistrictId,
      noDataStyle: adminNoDataStyle,
      scale: adminDatasetScale,
      isPercent: Boolean(selectedAdminMetric?.isPercent),
      scopeSelectedOnly: adminDatasetScopeSelectedOnly,
      legend: adminFillMode === ADMIN_FILL_MODES.DATASET ? adminDatasetScale.legend : [],
      legendKey: `${adminMetricField}-${adminMetricMeaning}-${adminClassification}-${adminClassCount}-${adminColorPalette}-${adminReverseColors}-${adminMetricValues.length}-${adminMetricValues[0] || 0}-${adminMetricValues[adminMetricValues.length - 1] || 0}`
    }),
    [
      adminFillMode,
      adminMetricField,
      adminDatasetJoin,
      adminNoDataStyle,
      adminDatasetScale,
      selectedAdminMetric,
      adminDatasetScopeSelectedOnly,
      adminMetricMeaning,
      adminClassification,
      adminClassCount,
      adminColorPalette,
      adminReverseColors,
      adminMetricValues
    ]
  );
  const chatMetricBubbleJoin = useMemo(
    () => {
      if (isAdminPropertyMetric(selectedChatBubbleMetric)) {
        return buildAdminPropertyMetricJoin(deferredDistricts, chatMetricBubbleField);
      }

      return buildMetricBubbleJoin({
        rows: deferredFacilities,
        districts: deferredDistricts,
        metricField: chatMetricBubbleField
      });
    },
    [chatMetricBubbleField, deferredFacilities, deferredDistricts, selectedChatBubbleMetric]
  );
  const chatMetricBubbleFeatures = useMemo(
    () => buildMetricBubbleFeatures({
      districts: deferredDistricts,
      join: chatMetricBubbleJoin,
      metricField: chatMetricBubbleField,
      getDistrictCenter
    }),
    [chatMetricBubbleField, chatMetricBubbleJoin, deferredDistricts]
  );
  const chatMetricBubbleValues = useMemo(
    () => chatMetricBubbleFeatures.map((feature) => feature.value).filter((value) => Number.isFinite(value)),
    [chatMetricBubbleFeatures]
  );
  const chatMetricBubbleScale = useMemo(
    () => buildMetricBubbleScale(chatMetricBubbleValues),
    [chatMetricBubbleValues]
  );
  const chatMetricBubbleLegend = useMemo(
    () => buildMetricBubbleLegend({
      metricField: chatMetricBubbleField,
      color: chatMetricBubbleColor,
      scale: chatMetricBubbleScale,
      features: chatMetricBubbleFeatures,
      selectedMetric: selectedChatBubbleMetric,
      join: chatMetricBubbleJoin
    }),
    [
      chatMetricBubbleField,
      chatMetricBubbleScale,
      chatMetricBubbleColor,
      chatMetricBubbleFeatures,
      selectedChatBubbleMetric,
      chatMetricBubbleJoin
    ]
  );
  const selectedAnalysisDistrictIds = useMemo(
    () => new Set((selectedAnalysisDistricts || []).map(district => String(district.id))),
    [selectedAnalysisDistricts]
  );
  const adminAreaChatIndex = useMemo(
    () => deferredShowChatDrawer ? buildAdminAreaChatIndex(deferredDistricts) : [],
    [deferredShowChatDrawer, deferredDistricts]
  );
  // Chat-context district projections — only built while the drawer is open, and
  // memoized so map pan/zoom re-renders don't re-scan all districts.
  const highlightedAdminAreasForChat = useMemo(() => {
    if (!deferredShowChatDrawer || !districts) return [];
    const highlightedIdSet = new Set(highlightedDistricts.map((id) => String(id)));
    return districts
      .filter((district) => highlightedIdSet.has(String(district.id)))
      .map((district) => ({
        id: district.id,
        name: district.name,
        country: district.country,
        region: district.region
      }));
  }, [deferredShowChatDrawer, districts, highlightedDistricts]);
  const districtsForWorldPopChat = useMemo(() => {
    if (!deferredShowChatDrawer || !districts || districts.length === 0) return null;
    return districts.map((d) => ({
      id: d.id,
      name: d.name,
      country: d.country,
      region: d.region
    }));
  }, [deferredShowChatDrawer, districts]);
  const allowDistrictLabels = showDistrictLabels;
  const adminLabelMinZoom = getAdminLabelMinZoom(deferredDistricts.length);
  const displayDistricts = useMemo(() => {
    const shouldSimplifyForDisplay = deferredDistricts.length >= LARGE_DISTRICT_COUNT;

    return deferredDistricts.map(district => ({
      ...district,
      displayGeometry: district.renderGeometry || (shouldSimplifyForDisplay
        ? simplifyGeometryCached(district.geometry || null)
        : district.geometry)
    }));
  }, [deferredDistricts]);
  const districtSummary = useMemo(() => {
    if (!deferredDistricts || deferredDistricts.length === 0) return null;

    const summary = buildDistrictRiskSummary(deferredDistricts, districtRisks);
    return summary ? {
      ...summary,
      country: deferredDistricts[0]?.country || 'Unknown',
      region: deferredDistricts[0]?.region || 'Unknown'
    } : null;
  }, [deferredDistricts, districtRisks]);
  const activeDistrictSummary = useMemo(() => {
    const activeDistricts = selectedAnalysisDistricts?.length ? selectedAnalysisDistricts : deferredDistricts;
    if (!activeDistricts || activeDistricts.length === 0) return null;

    const summary = buildDistrictRiskSummary(activeDistricts, districtRisks);
    return summary ? {
      ...summary,
      country: activeDistricts[0]?.country || 'Unknown',
      region: activeDistricts[0]?.region || 'Unknown',
      isSelectedScope: Boolean(selectedAnalysisDistricts?.length)
    } : null;
  }, [selectedAnalysisDistricts, deferredDistricts, districtRisks]);
  const enrichedDistricts = useMemo(
    () => deferredDistricts.map(district => {
      const risk = districtRisks[district.id] || { level: 'none', score: 0, eventCount: 0 };
      return {
        ...district,
        riskLevel: risk.level,
        riskScore: risk.score,
        eventCount: risk.eventCount
      };
    }),
    [deferredDistricts, districtRisks]
  );
  const hasSelectedAnalysisDistricts = selectedAnalysisDistricts.length > 0;
  const openWorkflowStep = (stepId) => {
    if (stepId === 'area') {
      setDataHubSection('boundaries');
      openUnifiedDrawer('facilities', 'datahub');
      return;
    }

    if (stepId === 'data') {
      setDataHubSection('data');
      openUnifiedDrawer('facilities', 'datahub');
      return;
    }

    if (stepId === 'scope' || stepId === 'enrich') {
      openMapLayersDrawer();
      return;
    }

    if (stepId === 'analyze') {
      openUnifiedDrawer('analysis', 'analysis');
      return;
    }

    openSituationReport();
  };
  const handleDrawerTabChange = (tab) => {
    setActiveDrawerTab(tab);
  };

  const runFacilityAnalysis = (facility) => {
    if (!facility) return;

    if (!hasSelectedAnalysisDistricts) {
      addToast('Select one or more districts before running analysis.', 'warning');
      openWorkflowStep('scope');
      return;
    }

    setSelectedFacility(facility);
    const facilityImpacts = impactedFacilities.find(
      f => getFacilityIdentityKey(f.facility) === getFacilityIdentityKey(facility)
    )?.impacts || [];
    const analysisDistricts = selectedAnalysisDistricts.map(compactDistrictForAnalysis);
    const scopedWorldPopData = getScopedWorldPopData(worldPopData, analysisDistricts);

    handleAnalyzeFacility(facility, facilityImpacts, {
      acledData: acledEnabled ? compactAcledForAnalysis(filteredAcledData) : [],
      worldPopData: scopedWorldPopData,
      selectedDistricts: analysisDistricts,
      operationType,
      nighttimeLightsLoaded: currentMapLayer === 'nighttime_lights',
      enabledEvidenceLayers: [
        ...(showFloodContextLayer ? ['flood_context'] : []),
        ...(showDroughtContextLayer ? ['drought_context'] : []),
        ...(showAccessibilityContextLayer ? ['accessibility_context'] : []),
        ...(currentMapLayer === 'nighttime_lights' ? ['nighttime_lights'] : [])
      ],
      activeMapLayerName: currentLayer?.name || null,
      activeMapLayerNote: currentLayer?.note || null
    });

    openUnifiedDrawer('analysis', 'analysis');
  };

  const openSituationReport = async (forceRefresh = false) => {
    await onGenerateSitrep(forceRefresh);
    openUnifiedDrawer('reports', 'reports');
  };

  // Check if any drawer is open
  const isAnyDrawerOpen = filterDrawerOpen || unifiedDrawerOpen || mapLayersDrawerOpen || showChatDrawer;

  // Drawer width (should match the drawer width in CSS)
  const drawerWidth = showChatDrawer
    ? getResponsiveChatDrawerWidth(chatDrawerExpanded, viewportWidth)
    : 400;

  return (
    <div
      className="map-container"
      ref={mapContainerRef}
      style={{
        position: 'relative',
        transition: 'margin-right 0.3s ease, width 0.3s ease',
        marginRight: isAnyDrawerOpen ? `${drawerWidth}px` : '0',
        width: isAnyDrawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%',
        ...(isFullscreen && {
          height: '100vh',
          width: '100vw',
          margin: 0,
          padding: 0,
          borderRadius: 0,
          overflow: 'hidden'
        })
      }}
    >
      <style>{customStyles}</style>

      {/* Hamburger Menu - high-level workspace and analysis actions */}
      <HamburgerMenu
        onControlPanelClick={() => openWorkflowStep('data')}
        onFilterClick={toggleFilterDrawer}
        onCampaignDashboardClick={() => setShowCampaignDashboard(true)}
        onLogisticsClick={handleLogisticsAssessment}
        onFullscreenClick={handleFullscreenToggle}
        isFullscreen={isFullscreen}
        onHelpClick={() => setShowHelp(!showHelp)}
        drawingEnabled={drawingEnabled}
        onDrawClick={toggleDrawing}
        annotationMode={annotationMode}
        freehandMode={freehandMode}
        onAddAnnotation={toggleAnnotationMode}
        onToggleFreehand={toggleFreehandMode}
        drawingColor={drawingColor}
        setDrawingColor={setDrawingColor}
        onUndoDrawing={undoLastDrawing}
        onClearDrawings={clearAllDrawings}
        drawingsCount={drawings.length}
        operationType={operationType}
        onOperationTypeChange={onOperationTypeChange}
        playbackEnabled={playbackEnabled}
        onPlaybackClick={togglePlayback}
        logisticsEnabled={activeDrawerTab === 'logistics' && unifiedDrawerOpen}
        hasDistricts={districts && districts.length > 0}
      />

      <FloatingActionButtons
        onAppsClick={onOpenApps}
        onDataHubClick={() => openWorkflowStep('data')}
        onLayersClick={toggleMapLayersDrawer}
        onFilterClick={toggleFilterDrawer}
        drawingEnabled={drawingEnabled}
        onDrawClick={toggleDrawing}
        annotationMode={annotationMode}
        freehandMode={freehandMode}
        onAddAnnotation={toggleAnnotationMode}
        onToggleFreehand={toggleFreehandMode}
        drawingColor={drawingColor}
        setDrawingColor={setDrawingColor}
        onUndoDrawing={undoLastDrawing}
        onClearDrawings={clearAllDrawings}
        drawingsCount={drawings.length}
      />

      {/* Filter Drawer */}
      <FilterDrawer
        isOpen={filterDrawerOpen}
        onClose={toggleFilterDrawer}
        visibleDisasterTypes={visibleDisasterTypes}
        toggleDisasterType={toggleDisasterType}
        severityFilters={severityFilters}
        toggleSeverityFilter={toggleSeverityFilter}
        certaintyFilters={certaintyFilters}
        toggleCertaintyFilter={toggleCertaintyFilter}
        urgencyFilters={urgencyFilters}
        toggleUrgencyFilter={toggleUrgencyFilter}
        showHeatmap={showHeatmap}
        setShowHeatmap={setShowHeatmap}
        showImpactZones={showImpactZones}
        setShowImpactZones={setShowImpactZones}
        showDisasterIcons={showDisasterIcons}
        setShowDisasterIcons={setShowDisasterIcons}
        showLegend={showLegend}
        setShowLegend={setShowLegend}
        showContextStatusBar={showContextStatusBar}
        setShowContextStatusBar={setShowContextStatusBar}
        showClusterCounts={showClusterCounts}
        setShowClusterCounts={setShowClusterCounts}
        showClustering={showClustering}
        setShowClustering={setShowClustering}
        showFacilitiesLayer={showFacilitiesLayer}
        setShowFacilitiesLayer={setShowFacilitiesLayer}
        showAcledLayer={showAcledLayer}
        setShowAcledLayer={setShowAcledLayer}
        showOutbreakLayer={showOutbreakLayer}
        setShowOutbreakLayer={setShowOutbreakLayer}
        showDistricts={showDistricts}
        setShowDistricts={setShowDistricts}
        showDistrictBorders={showDistrictBorders}
        setShowDistrictBorders={setShowDistrictBorders}
        showDistrictRiskFill={showDistrictRiskFill}
        setShowDistrictRiskFill={setShowDistrictRiskFill}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        showDistrictLabels={showDistrictLabels}
        setShowDistrictLabels={setShowDistrictLabels}
        forceDistrictLabels={forceDistrictLabels}
        setForceDistrictLabels={setForceDistrictLabels}
        onZoomToFit={handleZoomToFit}
        showZoomIndicator={showZoomIndicator}
        disasters={allDisasters.length > 0 ? allDisasters : disasters}
        dateFilter={dateFilter}
        handleDateFilterChange={handleDateFilterChange}
      />

      {/* Unified Drawer - Consolidates Facilities, Analysis, Chat, Reports, and Layers */}
      <UnifiedDrawer
        isOpen={unifiedDrawerOpen}
        onClose={toggleUnifiedDrawer}
        initialTab={activeDrawerTab}
        onTabChange={handleDrawerTabChange}
        drawerMode={drawerMode}
        dataHubSection={dataHubSection}

        // Facility tab props
        facilities={facilities}
        impactedFacilities={impactedFacilities}
        impactStatistics={impactStatistics}
        districts={districts}
        onDistrictsLoaded={onDistrictsLoaded}
        districtAvailableFields={districtAvailableFields}
        districtLabelField={districtLabelField}
        onDistrictLabelFieldChange={onDistrictLabelFieldChange}
        adminNumericFields={adminNumericFields}
        adminFillMode={adminFillMode}
        setAdminFillMode={setAdminFillMode}
        adminMetricField={adminMetricField}
        setAdminMetricField={setAdminMetricField}
        adminMetricMeaning={adminMetricMeaning}
        setAdminMetricMeaning={setAdminMetricMeaning}
        adminClassification={adminClassification}
        setAdminClassification={setAdminClassification}
        adminClassCount={adminClassCount}
        setAdminClassCount={setAdminClassCount}
        adminColorPalette={adminColorPalette}
        setAdminColorPalette={setAdminColorPalette}
        adminReverseColors={adminReverseColors}
        setAdminReverseColors={setAdminReverseColors}
        adminNoDataStyle={adminNoDataStyle}
        setAdminNoDataStyle={setAdminNoDataStyle}
        adminDatasetJoinSummary={adminDatasetJoin}
        adminDatasetLegend={adminDatasetStyle.legend}
        adminDatasetScaleInfo={adminDatasetScale}
        selectedAnalysisDistricts={selectedAnalysisDistricts}
        onFileUpload={(file) => {
          console.log('File selected:', file);
          const syntheticEvent = { target: { files: [file] } };
          handleFileUpload(syntheticEvent);
        }}
        onFacilitySelect={(facility) => {
          runFacilityAnalysis(facility);
        }}
        onFacilityViewOnMap={(facility) => {
          if (mapRef.current && facility.latitude && facility.longitude) {
            mapRef.current.setView([facility.latitude, facility.longitude], 12, {
              animate: true,
              duration: 1
            });
          }
        }}
        onGenerateSitrep={openSituationReport}
        sitrepLoading={sitrepLoading}
        onClearCache={onClearCache}
        acledData={acledData}
        acledEnabled={acledEnabled}
        acledConfig={acledConfig}
        onAcledUpload={onAcledUpload}
        onClearAcledCache={onClearAcledCache}
        onToggleAcled={onToggleAcled}
        onAcledConfigChange={onAcledConfigChange}

        // Analysis tab props
        selectedFacility={selectedFacility}
        analysis={analysisData}
        analysisLoading={analysisLoading}
        operationType={operationType}
        onViewRecommendations={handleGenerateRecommendations}
        recommendations={recommendations}
        recommendationsLoading={recommendationsLoading}
        recommendationsAIGenerated={recommendationsAIGenerated}
        recommendationsTimestamp={recommendationsTimestamp}
        recommendationsFacilityKey={recommendationsFacilityKey}
        osmData={osmData}
        worldPopData={worldPopData}
        logisticsData={logisticsData}
        logisticsLoading={logisticsLoading}
        logisticsError={logisticsError}
        onRunLogistics={handleLogisticsAssessment}

        // Label control
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        showDistrictLabels={showDistrictLabels}
        setShowDistrictLabels={setShowDistrictLabels}

        // Reports tab props
        sitrep={sitrep}
        sitrepTimestamp={sitrepTimestamp}

      />

      <MapLayersDrawer
        isOpen={mapLayersDrawerOpen}
        onClose={toggleMapLayersDrawer}
        currentMapLayer={currentMapLayer}
        setCurrentMapLayer={setCurrentMapLayer}
        geeBaseLayerMetadata={geeBaseLayerMetadata}
        nighttimeCompareEnabled={nighttimeCompareEnabled}
        setNighttimeCompareEnabled={setNighttimeCompareEnabled}
        nighttimeBeforeMonth={nighttimeBeforeMonth}
        setNighttimeBeforeMonth={setNighttimeBeforeMonth}
        nighttimeAfterMonth={nighttimeAfterMonth}
        setNighttimeAfterMonth={setNighttimeAfterMonth}
        nighttimeBeforeMetadata={nighttimeBeforeMetadata}
        showRoads={showRoads}
        setShowRoads={setShowRoads}
        showDisasterIcons={showDisasterIcons}
        setShowDisasterIcons={setShowDisasterIcons}
        showAcledLayer={showAcledLayer}
        setShowAcledLayer={setShowAcledLayer}
        showOutbreakLayer={showOutbreakLayer}
        setShowOutbreakLayer={setShowOutbreakLayer}
        showFacilitiesLayer={showFacilitiesLayer}
        setShowFacilitiesLayer={setShowFacilitiesLayer}
        showFloodContextLayer={showFloodContextLayer}
        setShowFloodContextLayer={setShowFloodContextLayer}
        showDroughtContextLayer={showDroughtContextLayer}
        setShowDroughtContextLayer={setShowDroughtContextLayer}
        showAccessibilityContextLayer={showAccessibilityContextLayer}
        setShowAccessibilityContextLayer={setShowAccessibilityContextLayer}
        districts={districts}
        selectedAnalysisDistricts={selectedAnalysisDistricts}
        osmData={osmData}
        osmStats={osmStats}
        osmWarning={osmWarning}
        osmLoading={osmLoading}
        osmLayerVisibility={osmLayerVisibility}
        onOSMSelectionChange={onAnalysisDistrictsChange}
        onLoadOSM={async (selectedDistricts, selectedCategories, progress = {}) => {
          console.log('🚀 onLoadOSM called!', {
            districtsCount: selectedDistricts?.length,
            categoriesCount: selectedCategories?.length,
            districts: selectedDistricts?.map(d => d.name || 'Unnamed'),
            categories: selectedCategories
          });

          const districtsWithGeometry = selectedDistricts.filter((district) =>
            district?.geometry?.coordinates
          );

          if (districtsWithGeometry.length === 0) {
            console.error('❌ No coordinates collected from districts!');
            return;
          }

          const categoriesToLoad = Array.isArray(selectedCategories) ? selectedCategories : [];
          const totalTasks = districtsWithGeometry.length * categoriesToLoad.length;
          let completedTasks = 0;
          let loadedFeatures = 0;

          beginOSMBatch();
          progress.onProgress?.({
            status: 'running',
            completedTasks,
            totalTasks,
            loadedFeatures,
            districtName: districtsWithGeometry[0]?.name || 'Selected admin area',
            categoryId: categoriesToLoad[0] || null
          });

          try {
            for (let districtIndex = 0; districtIndex < districtsWithGeometry.length; districtIndex += 1) {
              const district = districtsWithGeometry[districtIndex];
              const districtName = district.name || district.properties?.name || district.properties?.NAME || `District ${districtIndex + 1}`;

              for (let categoryIndex = 0; categoryIndex < categoriesToLoad.length; categoryIndex += 1) {
                const categoryId = categoriesToLoad[categoryIndex];

                console.log(`📍 Loading OSM ${categoryId} for: ${districtName} (${completedTasks + 1}/${totalTasks})`);
                progress.onProgress?.({
                  status: 'running',
                  completedTasks,
                  totalTasks,
                  loadedFeatures,
                  districtName,
                  categoryId,
                  districtIndex,
                  categoryIndex
                });

                const result = await fetchOSMInfrastructure(district.geometry, [categoryId], {
                  mergeWithExisting: completedTasks > 0,
                  timeoutMs: 20000,
                  maxRetries: 0,
                  disableBboxFallback: true,
                  requestTimeoutMs: 28000
                });

                completedTasks += 1;
                loadedFeatures = result?.features?.length || loadedFeatures;
                progress.onProgress?.({
                  status: 'running',
                  completedTasks,
                  totalTasks,
                  loadedFeatures,
                  districtName,
                  categoryId,
                  districtIndex,
                  categoryIndex
                });
              }
            }
          } finally {
            endOSMBatch();
          }
        }}
        onToggleOSMLayerVisibility={toggleLayerVisibility}
        onClearOSMCategory={clearOSMCategory}
      />

      {/* Column Selection Modal */}
      <ColumnSelectionModal
        isOpen={showColumnModal}
        onClose={() => setShowColumnModal(false)}
        fileColumns={fileColumns}
        selectedColumns={selectedColumns}
        setSelectedColumns={setSelectedColumns}
        onProcessData={() => {
          processExcelData((processedFile, columnSelections) => {
            // After processing, pass the CSV data and column selections to the parent
            console.log('Processing with column selections:', columnSelections);
            const reader = new FileReader();
            reader.onload = (e) => {
              onDrawerState(e.target.result, columnSelections);
              toggleFacilityDrawer();
            };
            reader.readAsText(processedFile);
          });
        }}
      />

      {/* Map Legend */}
      {showLegend && (
        <MapLegend
          showLegend={showLegend}
          setShowLegend={setShowLegend}
          showTimeline={showTimeline}
          setShowTimeline={setShowTimeline}
          showStatistics={showStatistics}
          setShowStatistics={setShowStatistics}
          showLabels={showLabels}
          setShowLabels={setShowLabels}
          hasFacilities={facilities && facilities.length > 0}
          hasStatistics={!!impactStatistics}
          hasAcledData={acledEnabled && acledData && acledData.length > 0}
          hasOutbreakData={outbreaks && outbreaks.length > 0}
          outbreakLoading={outbreakLoading}
          outbreakBackfillLoading={outbreakBackfillLoading}
          hasDistricts={districts && districts.length > 0}
          showDistricts={showDistricts}
          setShowDistricts={setShowDistricts}
          currentMapLayer={currentMapLayer}
          showFloodContextLayer={showFloodContextLayer}
          showDroughtContextLayer={showDroughtContextLayer}
          showAccessibilityContextLayer={showAccessibilityContextLayer}
          gdacsDiagnostics={gdacsDiagnostics}
          adminFillMode={adminFillMode}
          adminDatasetLegend={adminDatasetStyle.legend}
          adminMetricField={adminMetricField}
          adminDatasetJoinSummary={adminDatasetJoin}
          chatMetricBubbleLegend={chatMetricBubbleLegend}
        />
      )}

      {/* Statistics Panel */}
      {showStatistics && impactStatistics && (
        <StatisticsPanel
          statistics={impactStatistics}
        />
      )}

      {/* Timeline Visualization */}
      {showTimeline && (
        <TimelineVisualization
          disasters={filteredDisasters}
          onTimeChange={handleTimelineChange}
        />
      )}

      {/* Zoom Indicator */}
      {showZoomIndicator && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'linear-gradient(135deg, var(--aidstack-navy) 0%, #2D5A7B 100%)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer'
          }}
          onClick={() => {
            handleZoomToFit();
            setShowZoomIndicator(false);
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
          Click to zoom to filtered events
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowZoomIndicator(false);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: 'white',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              marginLeft: '10px'
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {showAccessibilityContextLayer && accessibilityContextTileUrl && (
        <div
          style={{
            position: 'absolute',
            left: showLegend ? '320px' : '16px',
            bottom: showLegend ? '160px' : '24px',
            zIndex: 1100,
            width: '240px',
            background: 'rgba(255, 255, 255, 0.96)',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: '10px',
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.14)',
            padding: '12px 14px',
            color: '#0f172a'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', marginBottom: '6px' }}>
            ACCESSIBILITY CONTEXT
          </div>
          <div style={{ fontSize: '11px', lineHeight: 1.45, color: '#475569', marginBottom: '10px' }}>
            Modeled travel time to the nearest hospital or clinic.
          </div>
          <div
            style={{
              height: '12px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, #dbeafe 0%, #60a5fa 22%, #facc15 48%, #f97316 74%, #dc2626 90%, #4c0519 100%)',
              marginBottom: '8px'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#334155' }}>
            <span>Easier access</span>
            <span>Harder to reach</span>
          </div>
        </div>
      )}

      {/* Map Container */}
      <MapContainer
        ref={mapRef}
        center={DEFAULT_MAP_CENTER}
        zoom={DEFAULT_MAP_ZOOM}
        preferCanvas={true}
        style={{
          height: isFullscreen ? '100vh' : '100%',
          width: '100%',
          zIndex: 1
        }}
        zoomControl={true}
      >
        {/* Base map layer */}
        {currentLayer.type === 'gee' ? (
          <>
            {/* If GEE layer has a baseLayer, render it first */}
            {currentLayer.baseLayer && MAP_LAYERS[currentLayer.baseLayer.toUpperCase()] && (
              <TileLayer
                key={`base-${currentLayer.baseLayer}`}
                url={MAP_LAYERS[currentLayer.baseLayer.toUpperCase()].url}
                attribution={MAP_LAYERS[currentLayer.baseLayer.toUpperCase()].attribution}
              />
            )}
            {/* Then render the GEE layer on top */}
            {geeBaseLayerUrl && (
              <TileLayer
                key={geeBaseLayerUrl}
                url={geeBaseLayerUrl}
                attribution={currentLayer.attribution}
                opacity={0.8}
              />
            )}
            {currentMapLayer === 'nighttime_lights' && nighttimeCompareEnabled && nighttimeBeforeTileUrl && mapInstance && (
              <TileLayer
                key={`${nighttimeBeforeTileUrl}-${nighttimeBeforeMonth}`}
                url={nighttimeBeforeTileUrl}
                attribution={currentLayer.attribution}
                opacity={0.8}
                pane="nighttimeCompareBeforePane"
              />
            )}
            {/* Fallback to satellite if no GEE tiles yet */}
            {!geeBaseLayerUrl && !currentLayer.baseLayer && (
              <TileLayer
                key={currentLayer.id}
                url={MAP_LAYERS.SATELLITE.url}
                attribution={MAP_LAYERS.SATELLITE.attribution}
              />
            )}
          </>
        ) : currentLayer.type === 'wms' ? (
          <WMSTileLayer
            url={currentLayer.url}
            layers={currentLayer.layers}
            format={currentLayer.format || 'image/png'}
            transparent={false}
            attribution={currentLayer.attribution}
          />
        ) : (
          <TileLayer
            url={currentLayer.url}
            attribution={currentLayer.attribution}
          />
        )}

        {geeEvidencePaneReady && showFloodContextLayer && floodContextTileUrl && (
          <TileLayer
            key={floodContextTileUrl}
            url={floodContextTileUrl}
            attribution={MAP_LAYERS.FLOOD_CONTEXT.attribution}
            opacity={MAP_LAYERS.FLOOD_CONTEXT.overlayOpacity || 0.6}
            pane="geeEvidencePane"
          />
        )}

        {geeEvidencePaneReady && showDroughtContextLayer && droughtContextTileUrl && (
          <TileLayer
            key={droughtContextTileUrl}
            url={droughtContextTileUrl}
            attribution={MAP_LAYERS.DROUGHT_CONTEXT.attribution}
            opacity={MAP_LAYERS.DROUGHT_CONTEXT.overlayOpacity || 0.6}
            pane="geeEvidencePane"
          />
        )}

        {geeEvidencePaneReady && showAccessibilityContextLayer && accessibilityContextTileUrl && (
          <TileLayer
            key={accessibilityContextTileUrl}
            url={accessibilityContextTileUrl}
            attribution={MAP_LAYERS.ACCESSIBILITY_CONTEXT.attribution}
            opacity={MAP_LAYERS.ACCESSIBILITY_CONTEXT.overlayOpacity || 0.58}
            pane="geeEvidencePane"
          />
        )}

        {/* Road overlay (optional) */}
        {showRoads && currentMapLayer !== 'street' && (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            opacity={0.5}
          />
        )}

        {/* WorldPop population density overlay - using GEE tiles */}
        {showWorldPopLayer && geeTileUrl && (() => {
          console.log('[WorldPop] Rendering GEE tile layer:', {
            showWorldPopLayer,
            geeTileUrl
          });
          return (
            <TileLayer
              key={geeTileUrl}
              url={geeTileUrl}
              attribution='&copy; <a href="https://www.worldpop.org">WorldPop</a> via Google Earth Engine'
              opacity={0.65}
              pane="overlayPane"
              zIndex={650}
              eventHandlers={{
                tileerror: (error) => {
                  console.error('[WorldPop] GEE tile load error:', error);
                },
                tileload: () => {
                  console.log('[WorldPop] GEE tile loaded successfully');
                },
                loading: () => {
                  console.log('[WorldPop] GEE tiles loading...');
                }
              }}
            />
          );
        })()}

        {/* Map access component for capturing map instance */}
        <MapAccess onMapReady={(map) => {
          setMapInstance(map);
          map.on('click', handleMapClick);
        }} />

        {chatMapMarkers.map((marker) => (
          <CircleMarker
            key={marker.id}
            center={[marker.latitude, marker.longitude]}
            radius={9}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: marker.color,
              fillOpacity: 0.95
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              {marker.label}
            </Tooltip>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif' }}>
                <strong>{marker.label}</strong>
                <div style={{ marginTop: 4, color: '#475569' }}>
                  {marker.latitude.toFixed(5)}, {marker.longitude.toFixed(5)}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* District boundaries layer */}
        {showDistricts && deferredDistricts && deferredDistricts.length > 0 && (
          <AdminBoundariesLayer
            districts={deferredDistricts}
            displayDistricts={displayDistricts}
            districtRisks={districtRisks}
            highlightedDistricts={highlightedDistricts}
            selectedAnalysisDistricts={selectedAnalysisDistricts}
            selectedAnalysisDistrictIds={selectedAnalysisDistrictIds}
            onAnalysisDistrictsChange={onAnalysisDistrictsChange}
            canUseDistrictDecisionTools={canUseDistrictDecisionTools}
            onDistrictClick={onDistrictClick}
            onDistrictOutlookClick={onDistrictOutlookClick}
            mapInstance={mapInstance}
            allowDistrictLabels={allowDistrictLabels}
            labelMinZoom={adminLabelMinZoom}
            showDistrictBorders={showDistrictBorders}
            showDistrictRiskFill={showDistrictRiskFill}
            visibleDisasters={visibleDisasters}
            visibleAcledEvents={visibleAcledEvents}
            datasetStyle={adminDatasetStyle}
            isDrawingMode={drawingEnabled && (annotationMode || freehandMode)}
          />
        )}

        <MetricBubblesLayer
          features={chatMetricBubbleFeatures}
          field={chatMetricBubbleField}
          color={chatMetricBubbleColor}
          scale={chatMetricBubbleScale}
          isPercent={Boolean(selectedChatBubbleMetric?.isPercent)}
        />

        {/* Heatmap layer */}
        {showHeatmap && <HeatmapLayer disasters={visibleDisasters} />}

        {/* Disaster markers */}
        <DisasterMarkers
          key={`disaster-markers-${visibleDisasters.length}-${visibleDisasters[0]?.eventId || 'none'}-${visibleDisasters[visibleDisasters.length - 1]?.eventId || 'none'}`}
          disasters={visibleDisasters}
          showImpactZones={showImpactZones}
          showDisasterIcons={showDisasterIcons}
          showClusterCounts={showClusterCounts}
          isDarkMode={currentMapLayer === 'dark' || currentMapLayer === 'nighttime_lights'}
        />

        {/* ACLED conflict event markers */}
        {showAcledLayer && (
          <AcledMarkers
            key={`acled-markers-${showClusterCounts ? 'counts' : 'no-counts'}-${showClustering ? 'clustered' : 'plain'}-${visibleAcledEvents.length}`}
            acledData={visibleAcledEvents}
            acledEnabled={acledEnabled}
            acledConfig={acledConfig}
            showClusterCounts={showClusterCounts}
            showClustering={showClustering}
          />
        )}

        {showOutbreakLayer && visibleOutbreaks && visibleOutbreaks.length > 0 && (
          <OutbreakMarkers
            key={`outbreak-markers-${showClusterCounts ? 'counts' : 'no-counts'}-${showClustering ? 'clustered' : 'plain'}-${visibleOutbreaks.length}`}
            outbreaks={visibleOutbreaks}
            showClusterCounts={showClusterCounts}
            showClustering={showClustering}
          />
        )}

        {/* OSM Infrastructure layer */}
        <OSMInfrastructureLayer
          osmData={osmData}
          layerVisibility={osmLayerVisibility}
          showOSMLayer={showOSMLayer}
          showClusterCounts={showClusterCounts}
        />

        {/* Logistics Overlays Layer */}
        <LogisticsOverlaysLayer
          data={logisticsData}
          visible={showLogisticsLayer}
          showRoads={logisticsLayerVisibility.roads}
          showBridges={logisticsLayerVisibility.bridges}
          showFuel={logisticsLayerVisibility.fuel}
          showAirports={logisticsLayerVisibility.airports}
        />

        {/* Drawing layer */}
        <DrawingLayer
          enabled={drawingEnabled}
          color={drawingColor}
          annotationMode={annotationMode}
          freehandMode={freehandMode}
          drawControlRef={drawControlRef}
          drawnItemsRef={drawnItemsRef}
          drawings={drawings}
          setDrawings={setDrawings}
        />

        {/* Facility markers */}
        {showFacilitiesLayer && facilities && facilities.length > 0 && (
          <MarkerClusterGroup
            key={`facility-clusters-${showClusterCounts ? 'counts' : 'no-counts'}-${showClustering ? 'clustered' : 'plain'}-${facilities.length}-${facilityImpactState.signature}`}
            showCoverageOnHover={false}
            maxClusterRadius={showClusterCounts ? 50 : 22}
            chunkedLoading
            chunkInterval={80}
            chunkDelay={30}
            iconCreateFunction={(cluster) => {
              const count = cluster.getChildCount();
              const size = count < 10 ? 'small' : count < 50 ? 'medium' : 'large';

              // Check if any facilities in the cluster are impacted
              const markers = cluster.getAllChildMarkers();
              const hasImpacted = markers.some(marker => {
                const facilityKey = marker.options.facilityKey;
                return facilityImpactState.keys.has(facilityKey);
              });

              const bgColor = hasImpacted ? 'rgba(255, 68, 68, 0.9)' : 'rgba(76, 175, 80, 0.9)';
              const dimension = showClusterCounts
                ? (size === 'small' ? '36px' : size === 'medium' ? '46px' : '56px')
                : '16px';
              const fontSize = size === 'small' ? '13px' : size === 'medium' ? '15px' : '18px';

              return L.divIcon({
                html: `<div style="
                  background: ${bgColor};
                  color: white;
                  border-radius: ${showClusterCounts ? '4px' : '50%'};
                  width: ${dimension};
                  height: ${dimension};
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  font-weight: bold;
                  border: ${showClusterCounts ? '3px solid white' : '2px solid white'};
                  box-shadow: ${showClusterCounts ? '0 3px 8px rgba(0,0,0,0.4)' : '0 2px 5px rgba(0,0,0,0.25)'};
                ">
                  ${showClusterCounts ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 2px;">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>` : ''}
                  <span style="font-size: ${fontSize}; line-height: 1;">${showClusterCounts ? count : ''}</span>
                </div>`,
                className: 'facility-cluster',
                iconSize: [parseInt(dimension), parseInt(dimension)]
              });
            }}
          >
            {showClustering && facilities.map((facility, idx) => {
              const facilityKey = getFacilityIdentityKey(facility);
              // Fix: impactedFacilities has structure { facility: {...}, impacts: [...] }
              const isImpacted = facilityImpactState.keys.has(facilityKey);

              const markerColor = isImpacted ? '#ff4444' : '#4CAF50';

              const customIcon = L.divIcon({
                className: 'custom-facility-icon',
                html: `
                  <div style="
                    width: 12px;
                    height: 12px;
                    background-color: ${markerColor};
                    border: 2px solid white;
                    border-radius: 2px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                  "></div>
                `,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              });

              return (
                <ReactLeafletMarker
                  key={`facility-${idx}-${facilityKey || 'unknown'}-${isImpacted ? 'impacted' : 'safe'}`}
                  position={[parseFloat(facility.latitude), parseFloat(facility.longitude)]}
                  icon={customIcon}
                  title={facility.name}
                  facilityKey={facilityKey}
                  eventHandlers={{
                    click: () => {
                      setSelectedFacility(facility);
                      // Just set the selected facility, don't open analysis drawer
                      // The popup will open automatically and user can click "Analyze Facility" button
                    }
                  }}
                >
                  {showLabels && (
                    <Tooltip
                      permanent
                      direction="top"
                      offset={[0, -10]}
                      className={`facility-label ${isImpacted ? 'impacted' : 'safe'}`}
                    >
                      {facility.name}
                    </Tooltip>
                  )}
                  <Popup>
                    <FacilityPopupContent
                      facility={facility}
                      isImpacted={isImpacted}
                      markerColor={markerColor}
                      hasSelectedAnalysisDistricts={hasSelectedAnalysisDistricts}
                      runFacilityAnalysis={runFacilityAnalysis}
                    />
                  </Popup>
                </ReactLeafletMarker>
              );
            })}
          </MarkerClusterGroup>
        )}
        {showFacilitiesLayer && facilities && facilities.length > 0 && !showClustering && facilities.map((facility, idx) => {
          const facilityKey = getFacilityIdentityKey(facility);
          const isImpacted = facilityImpactState.keys.has(facilityKey);

          const markerColor = isImpacted ? '#ff4444' : '#4CAF50';

          const customIcon = L.divIcon({
            className: 'custom-facility-icon',
            html: `
              <div style="
                width: 12px;
                height: 12px;
                background-color: ${markerColor};
                border: 2px solid white;
                border-radius: 2px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              "></div>
            `,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });

          return (
            <ReactLeafletMarker
              key={`facility-plain-${idx}-${facilityKey || 'unknown'}-${isImpacted ? 'impacted' : 'safe'}`}
              position={[parseFloat(facility.latitude), parseFloat(facility.longitude)]}
              icon={customIcon}
              facilityKey={facilityKey}
              title={facility.name}
              eventHandlers={{
                click: () => {
                  setSelectedFacility(facility);
                }
              }}
            >
              {showLabels && (
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -10]}
                  className={`facility-label ${isImpacted ? 'impacted' : 'safe'}`}
                >
                  {facility.name}
                </Tooltip>
              )}
              <Popup>
                <FacilityPopupContent
                  facility={facility}
                  isImpacted={isImpacted}
                  markerColor={markerColor}
                  hasSelectedAnalysisDistricts={hasSelectedAnalysisDistricts}
                  runFacilityAnalysis={runFacilityAnalysis}
                />
              </Popup>
            </ReactLeafletMarker>
          );
        })}

        {/* Geocoding Search */}
        <GeocodingSearch />
      </MapContainer>

      {currentMapLayer === 'nighttime_lights' && nighttimeCompareEnabled && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1300,
          pointerEvents: 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.82)',
            color: 'white',
            borderRadius: '999px',
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: 700
          }}>
            Before: {formatMonthLabel(nighttimeBeforeMonth || nighttimeBeforeMetadata?.date?.slice?.(0, 7))}
          </div>
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.82)',
            color: 'white',
            borderRadius: '999px',
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: 700
          }}>
            After: {formatMonthLabel(nighttimeAfterMonth || geeBaseLayerMetadata?.date?.slice?.(0, 7))}
          </div>
          <div
            onMouseDown={startNighttimeCompareDrag}
            onTouchStart={startNighttimeCompareDrag}
            style={{
              position: 'absolute',
              left: `${nighttimeComparePosition}%`,
              top: 0,
              bottom: 0,
              width: '36px',
              transform: 'translateX(-50%)',
              pointerEvents: 'auto',
              cursor: 'ew-resize',
              touchAction: 'none'
            }}
          >
            <div style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: '0',
              borderLeft: '3px solid rgba(255,255,255,0.96)',
              boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.22), 0 0 22px rgba(15, 23, 42, 0.18)',
              transform: 'translateX(-50%)'
            }}>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '28px',
                height: '56px',
                background: 'rgba(15, 23, 42, 0.84)',
                color: 'white',
                borderRadius: '999px',
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.24)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 700
              }}>
                ↔
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Drawer - Kept separate due to complex context management */}
      <ChatDrawer
        isOpen={showChatDrawer}
        onClose={() => {
          setShowChatDrawer(false);
          setChatDrawerExpanded(false);
        }}
        onHighlightDistricts={districts && districts.length > 0 ? handleHighlightDistricts : null}
        onMapCommand={handleChatMapCommand}
        isExpanded={chatDrawerExpanded}
        onToggleExpand={() => setChatDrawerExpanded((current) => !current)}
        context={{
          activeMapLayer: currentMapLayer,
          activeMapLayerName: currentLayer?.name || null,
          activeMapLayerType: currentLayer?.type || 'tile',
          activeMapLayerNote: currentLayer?.note || null,
          nighttimeLightsLoaded: currentMapLayer === 'nighttime_lights',
          enabledEvidenceLayers: [
            ...(showFloodContextLayer ? ['flood_context'] : []),
            ...(showDroughtContextLayer ? ['drought_context'] : []),
            ...(showAccessibilityContextLayer ? ['accessibility_context'] : []),
            ...(currentMapLayer === 'nighttime_lights' ? ['nighttime_lights'] : [])
          ],
          selectedFacility: selectedFacility,
          totalFacilities: facilities?.length || 0,
          totalImpactedFacilities: impactedFacilities?.length || 0,
          totalAcledEvents: acledData?.length || 0,
          scopedAcledEvents: prioritizationBoard?.summary?.totalAcledEvents ?? filteredAcledData.length,
          totalDistricts: districts?.length || 0,
          adminAreas: adminAreaChatIndex,
          highlightedAdminAreas: highlightedAdminAreasForChat,
          adminNumericFields: adminNumericFields.map((item) => ({
            id: item.id,
            field: item.field,
            label: item.label || item.field,
            source: item.source,
            count: item.count,
            suggestedMeaning: item.suggestedMeaning
          })),
          adminMetricValues: adminMetricValueSummaries,
          selectedAnalysisDistricts: selectedAnalysisDistricts?.map(compactDistrictForContext) || [],
          hasDistricts: districts && districts.length > 0,
          districts: districtSummary,
          activeDistrictSummary: activeDistrictSummary,
          // Send a compact facility sample to keep chat fast
          facilities: facilities?.slice(0, 75).map(f => ({
            name: f.name,
            latitude: f.latitude,
            longitude: f.longitude,
            type: f.type || f.facilityType,
            country: f.country,
            // Include AI analysis fields
            ...(aiAnalysisFields?.reduce((acc, field) => {
              if (f[field]) acc[field] = f[field];
              return acc;
            }, {}))
          })),
          aiAnalysisFields: aiAnalysisFields,
          disasters: disasters?.slice(0, 30),
          outbreaks: visibleOutbreaks?.slice(0, 40).map((outbreak) => ({
            title: outbreak.title,
            disease: outbreak.disease,
            reportDate: outbreak.reportDate,
            updatedDate: outbreak.updatedDate,
            country: outbreak.country,
            affectedCountries: outbreak.affectedCountries,
            metrics: outbreak.metrics,
            source: outbreak.source,
            sourceUrl: outbreak.sourceUrl
          })),
          outbreakReports: outbreakReports?.slice(0, 20).map((report) => ({
            title: report.title,
            disease: report.disease,
            reportDate: report.reportDate,
            updatedDate: report.updatedDate,
            countries: report.countries,
            metrics: report.metrics,
            sourceUrl: report.sourceUrl
          })),
            impactedFacilities: impactedFacilities?.slice(0, 20),
            selectedFacilityImpacts: selectedFacility
            ? (impactedFacilities.find((item) => getFacilityIdentityKey(item?.facility) === getFacilityIdentityKey(selectedFacility))?.impacts || []).slice(0, 10)
            : [],
          impactStatistics: impactStatistics,
          recentAnalysis: analysisData ? JSON.stringify(analysisData).substring(0, 200) : null,
          acledData: filteredAcledData.slice(0, 30), // Reduced ACLED to 30 for performance
          acledDeepPool: filteredAcledData.slice(0, 200),
          acledEnabled: acledEnabled,
          acledConfig: acledConfig,
          operationType: operationType || 'general',
          weatherForecast: weatherContext, // Add weather context for chatbot
          worldPopData: worldPopData, // Add WorldPop population data
          worldPopYear: worldPopLastFetch?.year || null, // Add WorldPop year
          // Send simplified districts array (just name and id) for WorldPop context formatting
          districtsForWorldPop: districtsForWorldPopChat,
          // OpenStreetMap Infrastructure data
          osmData: osmData,
          prioritizationBoard: prioritizationBoard
        }}
      />

      {/* WorldPop Population Drawer */}
      <WorldPopDrawer
        isOpen={showWorldPopDrawer}
        onClose={() => setShowWorldPopDrawer(false)}
        districts={districts}
        selectedDistricts={selectedAnalysisDistricts}
        worldPopData={worldPopData}
        isLoading={worldPopLoading}
        error={worldPopError}
        lastFetchParams={worldPopLastFetch}
        showWorldPopLayer={showWorldPopLayer}
        activeLayerType={worldPopLayerType}
        setActiveLayerType={setWorldPopLayerType}
        toggleWorldPopLayer={toggleWorldPopLayer}
        fetchWorldPopData={fetchWorldPopData}
        clearWorldPopData={clearWorldPopData}
        scopeToShapefile={scopeToShapefile}
        toggleScopeToShapefile={toggleScopeToShapefile}
      />

      {/* Campaign Dashboard */}
      <CampaignDashboard
        facilities={facilities}
        disasters={visibleDisasters}
        outbreaks={visibleOutbreaks}
        impactedFacilities={impactedFacilities}
        acledData={filteredAcledData}
        acledEnabled={acledEnabled}
        districts={enrichedDistricts}
        selectedDistricts={selectedAnalysisDistricts}
        worldPopData={worldPopData}
        worldPopYear={worldPopLastFetch?.year}
        isOpen={showCampaignDashboard}
        onClose={() => setShowCampaignDashboard(false)}
        operationType={operationType}
      />

      {/* Campaign Dashboard button moved to hamburger menu for cleaner UI */}

      {/* WorldPop Population Button - visible when districts are loaded */}
      {districts && districts.length > 0 && (
        <button
          onClick={() => setShowWorldPopDrawer(true)}
          title="Population Data (WorldPop)"
          style={{
            position: 'absolute',
            bottom: '182px',
            right: '20px',
            zIndex: 1000,
            backgroundColor: Object.keys(worldPopData).length > 0 ? '#059669' : 'var(--aidstack-navy, #1B3A5C)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '56px',
            height: '56px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
            transition: 'all 0.3s ease',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.08)';
            e.currentTarget.style.boxShadow = '0 5px 16px rgba(0,0,0,0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.25)';
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span style={{ fontSize: '9px', marginTop: '2px', fontWeight: 700 }}>POP</span>
        </button>
      )}

      {/* AI Chat Button - Positioned at bottom-right of map */}
      {(
      <button
        onClick={() => setShowChatDrawer(true)}
        title="Ask AI Assistant"
        style={{
          position: 'absolute',
          bottom: '116px',
          right: '20px',
          zIndex: 1000,
          backgroundColor: 'var(--aidstack-orange)',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '56px',
          height: '56px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
          transition: 'all 0.3s ease',
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)';
          e.currentTarget.style.boxShadow = '0 5px 16px rgba(0,0,0,0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.25)';
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span style={{fontSize: '11px', marginTop: '2px', fontWeight: 700}}>AI</span>
      </button>
      )}

      <button
        type="button"
        onClick={handleFullscreenToggle}
        title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
        style={{
          position: 'absolute',
          bottom: '50px',
          right: '20px',
          zIndex: 1000,
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          color: isFullscreen ? 'var(--aidstack-orange)' : 'var(--aidstack-navy)',
          border: '2px solid rgba(15, 23, 42, 0.10)',
          borderRadius: '8px',
          width: '48px',
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 3px 10px rgba(0,0,0,0.22)',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--aidstack-orange)';
          e.currentTarget.style.transform = 'scale(1.08)';
          e.currentTarget.style.boxShadow = '0 5px 16px rgba(0,0,0,0.30)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.10)';
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.22)';
        }}
      >
        {isFullscreen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
            <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
            <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
            <path d="M9 14 4 19"></path>
            <path d="M20 4 15 9"></path>
            <path d="M15 15 20 20"></path>
            <path d="M4 4 9 9"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
            <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
            <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
            <path d="M4 9 9 4"></path>
            <path d="M15 4 20 9"></path>
            <path d="M20 15 15 20"></path>
            <path d="M9 20 4 15"></path>
          </svg>
        )}
      </button>

      {/* Timeline Scrubber - Bottom playback controls */}
      <TimelineScrubber
        isEnabled={playbackEnabled}
        minDate={dateRange.minDate}
        maxDate={dateRange.maxDate}
        currentDate={currentDate}
        onDateChange={jumpToDate}
        onPlayPause={togglePlayPause}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        onSpeedChange={changeSpeed}
        onClose={togglePlayback}
      />

      {/* Loading / empty state overlay */}
      {facilities.length === 0 && disasters.length === 0 && (() => {
        try { return !!localStorage.getItem('gdacs_onboarding_done'); } catch (_) { return false; }
      })() && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          pointerEvents: 'auto'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(4px)',
            borderRadius: '12px',
            padding: '32px 40px',
            textAlign: 'center',
            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
            maxWidth: '320px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>
              {loading ? '⏳' : '🗺️'}
            </div>
            <div style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--aidstack-navy)',
              fontFamily: "'Space Grotesk', sans-serif",
              marginBottom: '8px'
            }}>
              {loading ? 'Loading live GDACS data' : 'No data loaded yet'}
            </div>
            <div style={{
              fontSize: '13px',
              color: '#666',
              fontFamily: "'Inter', sans-serif",
              marginBottom: '20px',
              lineHeight: '1.5'
            }}>
              {loading
                ? 'Fetching the latest disaster events from GDACS.'
                : 'Upload site data or load live disasters to get started'}
            </div>
            <button
              onClick={() => {
                if (!loading) {
                  openUnifiedDrawer('facilities');
                }
              }}
              style={{
                backgroundColor: loading ? '#cbd5e1' : 'var(--aidstack-orange)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
                fontFamily: "'Inter', sans-serif"
              }}
            >
              {loading ? 'Loading…' : 'Get Started'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
