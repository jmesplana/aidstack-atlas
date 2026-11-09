/**
 * Custom hook for OSM infrastructure data management
 * Handles fetching, caching, and state management
 */

import { loadInfrastructure } from '../../../lib/osm/loadInfrastructure';
import { useState, useCallback, useEffect, useRef } from 'react';

const OSM_RESULT_CATEGORIES = {
  hospitals: ['hospital', 'clinic'],
  schools: ['school'],
  roads: ['road'],
  bridges: ['bridge'],
  water: ['water'],
  power: ['power'],
  fuel: ['fuel'],
  pharmacies: ['pharmacy'],
  airports: ['airport'],
};

const OSM_STORAGE_KEY = 'osmData';
function getResultCategories(categoryId) {
  return OSM_RESULT_CATEGORIES[categoryId] || [categoryId];
}

function areBoundariesEqual(boundaryA, boundaryB) {
  if (!boundaryA || !boundaryB) return false;

  try {
    return JSON.stringify(boundaryA) === JSON.stringify(boundaryB);
  } catch (_) {
    return false;
  }
}

function mergeOsmData(existingData, incomingData) {
  if (!existingData) return incomingData;
  if (!incomingData) return existingData;

  const combinedFeatures = [...(existingData.features || [])];
  const seenKeys = new Set(
    combinedFeatures.map(feature => `${feature.properties?.category || 'unknown'}:${feature.properties?.id || feature.properties?.osm_id || feature.id || JSON.stringify(feature.geometry)}`)
  );

  (incomingData.features || []).forEach(feature => {
    const featureKey = `${feature.properties?.category || 'unknown'}:${feature.properties?.id || feature.properties?.osm_id || feature.id || JSON.stringify(feature.geometry)}`;
    if (!seenKeys.has(featureKey)) {
      seenKeys.add(featureKey);
      combinedFeatures.push(feature);
    }
  });

  const existingLayers = existingData.metadata?.byLayer || {};
  const incomingLayers = incomingData.metadata?.byLayer || {};
  const existingRequestedLayers = existingData.metadata?.requestedLayers || [];
  const incomingRequestedLayers = incomingData.metadata?.requestedLayers || [];

  return {
    ...incomingData,
    features: combinedFeatures,
    metadata: {
      ...(existingData.metadata || {}),
      ...(incomingData.metadata || {}),
      totalFeatures: combinedFeatures.length,
      byLayer: {
        ...existingLayers,
        ...incomingLayers
      },
      requestedLayers: Array.from(new Set([
        ...existingRequestedLayers,
        ...incomingRequestedLayers
      ]))
    }
  };
}

function removeOsmCategoryData(existingData, categoryId) {
  if (!existingData) return null;

  const categoriesToRemove = getResultCategories(categoryId);
  const remainingFeatures = (existingData.features || []).filter(
    feature => !categoriesToRemove.includes(feature.properties?.category)
  );
  const existingLayers = existingData.metadata?.byLayer || {};
  const nextByLayer = { ...existingLayers };
  categoriesToRemove.forEach(category => {
    delete nextByLayer[category];
  });

  const nextRequestedLayers = (existingData.metadata?.requestedLayers || []).filter(
    layer => layer !== categoryId
  );

  if (remainingFeatures.length === 0) {
    return null;
  }

  return {
    ...existingData,
    features: remainingFeatures,
    metadata: {
      ...(existingData.metadata || {}),
      totalFeatures: remainingFeatures.length,
      byLayer: nextByLayer,
      requestedLayers: nextRequestedLayers
    }
  };
}

export function useOSMInfrastructure() {
  const [osmData, setOsmData] = useState(null);
  const [osmLoading, setOsmLoading] = useState(false);
  const [osmError, setOsmError] = useState(null);
  const [osmStats, setOsmStats] = useState(null);
  const [osmTimestamp, setOsmTimestamp] = useState(null);
  const [osmBoundary, setOsmBoundary] = useState(null);
  const [osmWarning, setOsmWarning] = useState(null);
  const [osmLayers, setOsmLayers] = useState([
    'hospitals',
    'schools',
    'roads',
    'bridges',
    'water',
    'power',
    'fuel',
    'pharmacies',
    'airports'
  ]);
  const [osmLayerVisibility, setOsmLayerVisibility] = useState({
    hospital: true,
    clinic: true,
    school: true,
    road: true,
    water: true,
    power: true,
    fuel: true,
    pharmacy: true,
    bridge: true,
    airport: true,
  });
  const [showOSMLayer, setShowOSMLayer] = useState(true);
  const osmDataRef = useRef(null);
  const osmBoundaryRef = useRef(null);
  const osmBatchDepthRef = useRef(0);

  useEffect(() => {
    osmDataRef.current = osmData;
  }, [osmData]);

  useEffect(() => {
    osmBoundaryRef.current = osmBoundary;
  }, [osmBoundary]);

  // Clear legacy OSM browser cache on mount. Full OSM payloads can exceed browser storage quota.
  useEffect(() => {
    try {
      localStorage.removeItem(OSM_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear legacy OSM browser cache:', err);
    }
  }, []);

  // Do not persist OSM data in browser storage. Keep features in memory for the current session.
  useEffect(() => {
    if (osmData) {
      localStorage.removeItem(OSM_STORAGE_KEY);
    }
  }, [osmData]);

  // Sanitize boundary to remove circular references
  const sanitizeBoundary = (boundary) => {
    if (!boundary) return null;

    // Handle already-sanitized GeoJSON
    if (boundary.type && boundary.coordinates) {
      // It's a GeoJSON geometry - make a clean copy
      return {
        type: boundary.type,
        coordinates: boundary.coordinates
      };
    }

    // Handle GeoJSON Feature
    if (boundary.type === 'Feature' && boundary.geometry) {
      return {
        type: boundary.geometry.type,
        coordinates: boundary.geometry.coordinates
      };
    }

    // Last resort: try to parse/stringify (will fail if circular)
    try {
      const str = JSON.stringify(boundary);
      return JSON.parse(str);
    } catch (err) {
      console.error('Failed to sanitize boundary - has circular references:', err);
      console.log('Boundary object:', boundary);
      return null;
    }
  };

  // Fetch OSM infrastructure
  const fetchOSMInfrastructure = useCallback(async (boundary, selectedCategories = null, options = {}) => {
    console.log('🔵 fetchOSMInfrastructure called with:', {
      boundaryProvided: !!boundary,
      selectedCategories,
      options
    });

    if (!boundary) {
      console.error('❌ No boundary provided');
      setOsmError('No boundary provided');
      return;
    }

    // Sanitize boundary to remove circular references
    const cleanBoundary = sanitizeBoundary(boundary);
    if (!cleanBoundary) {
      console.error('❌ Invalid boundary format');
      setOsmError('Invalid boundary format');
      return;
    }

    // Use selected categories if provided, otherwise use all osmLayers
    const layersToFetch = selectedCategories || osmLayers;

    setOsmLoading(true);
    setOsmError(null);
    setOsmWarning(null);

    try {
      console.log('✅ Fetching OSM infrastructure for boundary:', cleanBoundary);
      console.log('✅ Categories to fetch:', layersToFetch);

      const result = await loadInfrastructure(cleanBoundary, layersToFetch, options, (message) => {
        setOsmWarning(message);
        options.onProgress?.(message);
      });

      if (result.success) {
        console.log('✅ OSM data loaded successfully:', result.data.metadata);
        console.log('📊 Features by category:', result.data.metadata.byLayer);
        console.log('📍 Total features:', result.data.features.length);
        console.log('🔍 Sample features:', result.data.features.slice(0, 5).map(f => ({
          category: f.properties.category,
          name: f.properties.name || f.properties.tags?.name,
          tags: f.properties.tags
        })));

        const currentOsmData = osmDataRef.current;
        const currentBoundary = osmBoundaryRef.current;
        const incomingFeatureCount = result.data?.features?.length || 0;
        const shouldMergeWithExisting =
          Boolean(options.mergeWithExisting) || Boolean(result.data.metadata?.partialFailures && currentOsmData) || (
            selectedCategories &&
            Array.isArray(selectedCategories) &&
            selectedCategories.length > 0 &&
            currentOsmData &&
            areBoundariesEqual(currentBoundary, cleanBoundary)
          );

        if (incomingFeatureCount === 0 && currentOsmData) {
          const warning = result.warning || result.data?.metadata?.warnings?.join(' ') || 'No matching OSM infrastructure features were found for the selected area and layers.';
          setOsmWarning(warning);
          console.warn('⚠️ OSM request returned no new features; preserving existing OSM data');
          return currentOsmData;
        }

        const nextData = shouldMergeWithExisting
          ? mergeOsmData(currentOsmData, result.data)
          : result.data;

        osmDataRef.current = nextData;
        osmBoundaryRef.current = shouldMergeWithExisting && currentBoundary ? currentBoundary : cleanBoundary;
        setOsmData(nextData);
        setOsmStats(nextData.metadata.byLayer);
        setOsmTimestamp(nextData.metadata.timestamp);
        setOsmBoundary(shouldMergeWithExisting && currentBoundary ? currentBoundary : cleanBoundary);
        setOsmWarning(result.warning || result.data?.metadata?.warnings?.join(' ') || null);

        console.log('💾 OSM state updated');
        return nextData;
      } else {
        setOsmError(result.error?.message || 'Unknown error');
        console.error('❌ OSM fetch error:', result.error);
        return null;
      }
    } catch (err) {
      let errorMsg = err.message || 'Failed to fetch OSM infrastructure data';

      if (err.name === 'AbortError') {
        errorMsg = 'OSM download timed out while waiting for a response. Previously loaded assets are retained.';
        console.error('⏱️ OSM fetch timeout');
      } else {
        console.error('❌ OSM fetch error:', err);
        console.error('❌ Error details:', {
          message: err.message,
          stack: err.stack,
          name: err.name
        });
      }

      setOsmError(errorMsg);
      return null;
    } finally {
      console.log('🏁 Fetch completed, setting loading to false');
      if (osmBatchDepthRef.current === 0) {
        setOsmLoading(false);
      }
    }
  }, [osmLayers]);

  const beginOSMBatch = useCallback(() => {
    osmBatchDepthRef.current += 1;
    setOsmLoading(true);
    setOsmError(null);
    setOsmWarning(null);
  }, []);

  const endOSMBatch = useCallback(() => {
    osmBatchDepthRef.current = Math.max(0, osmBatchDepthRef.current - 1);
    if (osmBatchDepthRef.current === 0) {
      setOsmLoading(false);
    }
  }, []);

  // Refresh with current boundary
  const refreshOSM = useCallback((forceRefresh = false) => {
    if (osmBoundary) {
      return fetchOSMInfrastructure(osmBoundary, null, { forceRefresh });
    }
  }, [osmBoundary, fetchOSMInfrastructure]);

  // Clear OSM data
  const clearOSM = useCallback(() => {
    setOsmData(null);
    setOsmStats(null);
    setOsmTimestamp(null);
    setOsmBoundary(null);
    setOsmError(null);
    setOsmWarning(null);
    osmDataRef.current = null;
    osmBoundaryRef.current = null;
    localStorage.removeItem(OSM_STORAGE_KEY);
    console.log('OSM data cleared');
  }, []);

  const clearOSMCategory = useCallback((categoryId) => {
    if (!categoryId) return;

    setOsmData(prev => {
      const nextData = removeOsmCategoryData(prev, categoryId);

      if (!nextData) {
        setOsmStats(null);
        setOsmTimestamp(null);
        setOsmBoundary(null);
        setOsmWarning(null);
        osmDataRef.current = null;
        osmBoundaryRef.current = null;
        localStorage.removeItem(OSM_STORAGE_KEY);
        return null;
      }

      setOsmStats(nextData.metadata?.byLayer || null);
      setOsmTimestamp(nextData.metadata?.timestamp || null);
      setOsmWarning(nextData.metadata?.warnings?.join(' ') || null);
      osmDataRef.current = nextData;
      return nextData;
    });

    setOsmLayerVisibility(prev => ({
      ...prev,
      [categoryId]: true
    }));
  }, []);

  // Toggle layer in query
  const toggleLayer = useCallback((layer) => {
    setOsmLayers(prev => {
      if (prev.includes(layer)) {
        return prev.filter(l => l !== layer);
      } else {
        return [...prev, layer];
      }
    });
  }, []);

  // Toggle layer visibility on map
  const toggleLayerVisibility = useCallback((layer) => {
    const categories = getResultCategories(layer);

    setOsmLayerVisibility(prev => {
      const shouldShow = categories.some(category => prev[category] === false);
      const next = { ...prev };

      categories.forEach(category => {
        next[category] = shouldShow;
      });

      return next;
    });
  }, []);

  // Toggle all OSM layers
  const toggleAllOSM = useCallback(() => {
    setShowOSMLayer(prev => !prev);
  }, []);

  return {
    // State
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

    // Actions
    fetchOSMInfrastructure,
    refreshOSM,
    clearOSM,
    clearOSMCategory,
    toggleLayer,
    toggleLayerVisibility,
    toggleAllOSM,
    setOsmLayers,
    setOsmLayerVisibility,
    setShowOSMLayer,
    beginOSMBatch,
    endOSMBatch,
  };
}
