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

import { openDB } from 'idb';

const CURRENT_SCHEMA_VERSION = 1;
const DB_NAME = 'aidstack_workspace';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
const WORKSPACE_KEY = 'current';

const LEGACY_CACHE_DB_NAME = 'gdacs-browser-cache';
const LEGACY_CACHE_STORE_NAME = 'cache';
const LEGACY_LOCAL_KEYS = [
  'gdacs_facilities',
  'gdacs_ai_analysis_fields',
  'gdacs_acled_data',
  'gdacs_acled_config',
  'gdacs_operation_type'
];

const DEFAULT_WORKSPACE = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  savedAt: null,
  districts: [],
  facilities: [],
  impactedFacilities: [],
  worldPopData: {},
  worldPopLastFetch: null,
  osmData: null,
  acledData: [],
  selectedAnalysisDistricts: [],
  enabledEvidenceLayers: [],
  operationType: '',
  config: {}
};

async function getDB() {
  if (typeof window === 'undefined') return null;

  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    }
  });
}

function normalizeWorkspace(rawWorkspace = null) {
  const workspace = rawWorkspace && typeof rawWorkspace === 'object' ? rawWorkspace : {};

  return {
    ...DEFAULT_WORKSPACE,
    ...workspace,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    districts: Array.isArray(workspace.districts) ? workspace.districts : [],
    facilities: Array.isArray(workspace.facilities) ? workspace.facilities : [],
    impactedFacilities: Array.isArray(workspace.impactedFacilities) ? workspace.impactedFacilities : [],
    worldPopData: workspace.worldPopData && typeof workspace.worldPopData === 'object' ? workspace.worldPopData : {},
    worldPopLastFetch: workspace.worldPopLastFetch ?? null,
    osmData: workspace.osmData ?? null,
    acledData: Array.isArray(workspace.acledData) ? workspace.acledData : [],
    selectedAnalysisDistricts: Array.isArray(workspace.selectedAnalysisDistricts) ? workspace.selectedAnalysisDistricts : [],
    enabledEvidenceLayers: Array.isArray(workspace.enabledEvidenceLayers) ? workspace.enabledEvidenceLayers : [],
    operationType: typeof workspace.operationType === 'string' ? workspace.operationType : '',
    config: workspace.config && typeof workspace.config === 'object' ? workspace.config : {}
  };
}

async function clearLegacyWorkspaceStorage() {
  if (typeof window === 'undefined') return;

  LEGACY_LOCAL_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (_) {}

    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
  });

  if (typeof window.indexedDB === 'undefined') return;

  try {
    const db = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open(LEGACY_CACHE_DB_NAME, 1);
      request.onerror = () => reject(request.error || new Error('Unable to open legacy cache database'));
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => resolve(request.result);
    });

    if (!db || !db.objectStoreNames?.contains(LEGACY_CACHE_STORE_NAME)) {
      db?.close?.();
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(LEGACY_CACHE_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(LEGACY_CACHE_STORE_NAME);
      const requests = LEGACY_LOCAL_KEYS.map((key) => store.delete(key));

      requests.forEach((request) => {
        request.onerror = () => reject(request.error || new Error('Unable to clear legacy workspace cache'));
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Unable to clear legacy workspace cache'));
    });

    db.close?.();
  } catch (_) {}
}

export async function saveWorkspace(workspace) {
  try {
    const db = await getDB();
    if (!db) return false;

    const payload = {
      ...normalizeWorkspace(workspace),
      savedAt: new Date().toISOString()
    };

    await db.put(STORE_NAME, payload, WORKSPACE_KEY);
    await clearLegacyWorkspaceStorage();
    return true;
  } catch (error) {
    console.error('Failed to save workspace:', error);
    return false;
  }
}

export async function loadWorkspace() {
  try {
    const db = await getDB();
    if (!db) return null;

    const workspace = await db.get(STORE_NAME, WORKSPACE_KEY);
    if (!workspace) return null;

    if (workspace.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      return null;
    }

    return normalizeWorkspace(workspace);
  } catch (error) {
    console.error('Failed to load workspace:', error);
    return null;
  }
}

export async function clearWorkspace() {
  try {
    const db = await getDB();
    if (db) {
      await db.delete(STORE_NAME, WORKSPACE_KEY);
    }

    await clearLegacyWorkspaceStorage();
    return true;
  } catch (error) {
    console.error('Failed to clear workspace:', error);
    return false;
  }
}

export async function getWorkspaceStats() {
  try {
    const workspace = await loadWorkspace();
    if (!workspace) {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        savedAt: null,
        facilities: 0,
        impactedFacilities: 0,
        districts: 0,
        worldpop: 0,
        osm: 0,
        acled: 0,
        selectedDistricts: 0,
        enabledLayers: 0,
        operationType: ''
      };
    }

    return {
      schemaVersion: workspace.schemaVersion,
      savedAt: workspace.savedAt,
      facilities: workspace.facilities.length,
      impactedFacilities: workspace.impactedFacilities.length,
      districts: workspace.districts.length,
      worldpop: Object.keys(workspace.worldPopData || {}).length,
      osm: workspace.osmData?.features?.length || 0,
      acled: workspace.acledData.length,
      selectedDistricts: workspace.selectedAnalysisDistricts.length,
      enabledLayers: workspace.enabledEvidenceLayers.length,
      operationType: workspace.operationType
    };
  } catch (error) {
    console.error('Failed to get workspace stats:', error);
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAt: null,
      facilities: 0,
      impactedFacilities: 0,
      districts: 0,
      worldpop: 0,
      osm: 0,
      acled: 0,
      selectedDistricts: 0,
      enabledLayers: 0,
      operationType: ''
    };
  }
}
