import React, { useEffect, useMemo, useState } from 'react';

/**
 * OSM Infrastructure Selector Component
 *
 * User flow:
 * 1. Select which admin areas to load
 * 2. Select which infrastructure types to load (hospitals, schools, water, etc.)
 * 3. Click "Load Selected Data" button
 * 4. Data is fetched only for selected admin areas and categories
 */

const INFRASTRUCTURE_CATEGORIES = [
  { id: 'hospitals', name: 'Hospitals & Clinics', icon: '🏥', priority: 'critical' },
  { id: 'water', name: 'Water Sources', icon: '💧', priority: 'critical' },
  { id: 'schools', name: 'Schools', icon: '🏫', priority: 'secondary' },
  { id: 'power', name: 'Power Stations', icon: '⚡', priority: 'critical' },
  { id: 'pharmacies', name: 'Pharmacies', icon: '💊', priority: 'secondary' },
  { id: 'airports', name: 'Airports', icon: '✈️', priority: 'critical' },
  { id: 'roads', name: 'Major Roads', icon: '🛣️', priority: 'secondary' },
  { id: 'fuel', name: 'Fuel Stations', icon: '⛽', priority: 'secondary' },
  { id: 'bridges', name: 'Bridges', icon: '🌉', priority: 'secondary' }
];

const CATEGORY_RESULT_KEYS = {
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

function getCategoryResultKeys(categoryId) {
  return CATEGORY_RESULT_KEYS[categoryId] || [categoryId];
}

function getCategoryFeatureCount(layerCounts = {}, categoryId) {
  return getCategoryResultKeys(categoryId).reduce(
    (total, resultKey) => total + (layerCounts?.[resultKey] || 0),
    0
  );
}

function isCategoryVisible(osmLayerVisibility = {}, categoryId) {
  return getCategoryResultKeys(categoryId).some(resultKey => osmLayerVisibility[resultKey] !== false);
}

function getDistrictSelectionId(district, fallbackIndex) {
  return district?.id ?? fallbackIndex;
}

function haveSameIds(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export default function OSMInfrastructureSelector({
  districts = [],
  selectedAnalysisDistricts = [],
  osmLoading = false,
  osmData = null,
  osmStats = null,
  osmWarning = null,
  osmLayerVisibility = {},
  onLoadOSM, // Callback: (selectedDistricts, selectedCategories) => void
  onSelectionChange, // Callback: (selectedDistricts) => void
  onToggleLayerVisibility, // Callback: (category) => void
  onClearCategory, // Callback: (category) => void
}) {
  const [selectedDistricts, setSelectedDistricts] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);
  const [loadProgress, setLoadProgress] = useState(null);
  const [requestStartedAt, setRequestStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastCompletedLoad, setLastCompletedLoad] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const districtSignature = useMemo(
    () => districts.map((district, idx) => getDistrictSelectionId(district, idx) || district.name || idx).join('|'),
    [districts]
  );
  const selectedAnalysisDistrictIds = useMemo(
    () => selectedAnalysisDistricts.map((district, idx) => getDistrictSelectionId(district, idx)),
    [selectedAnalysisDistricts]
  );
  const layerCounts = useMemo(
    () => osmData?.metadata?.byLayer || osmStats?.byLayer || osmStats || {},
    [osmData, osmStats]
  );
  const requestedLayerIds = useMemo(
    () => osmData?.metadata?.requestedLayers || [],
    [osmData]
  );

  const syncSelectionToParent = (nextSelectedDistrictIds) => {
    if (!onSelectionChange) return;

    const selectedDistrictRecords = districts.filter((district, idx) =>
      nextSelectedDistrictIds.includes(getDistrictSelectionId(district, idx))
    );

    onSelectionChange(selectedDistrictRecords);
  };

  useEffect(() => {
    if (!osmLoading && activeRequest) {
      const loadedBreakdown = activeRequest.categoryIds.map(categoryId => {
        const category = INFRASTRUCTURE_CATEGORIES.find(item => item.id === categoryId);
        const featureCount = getCategoryFeatureCount(layerCounts, categoryId);
        return {
          id: categoryId,
          name: category?.name || categoryId,
          featureCount
        };
      });

      setLastCompletedLoad({
        districtCount: activeRequest.districtCount,
        categoryCount: activeRequest.categoryCount,
        elapsedSeconds,
        loadedBreakdown,
        totalFeatures: loadedBreakdown.reduce((sum, item) => sum + item.featureCount, 0),
        failedTasks: loadProgress?.failedTasks || 0,
        completedAt: new Date().toISOString()
      });

      setActiveRequest(null);
      setLoadProgress(null);
      setRequestStartedAt(null);
      setElapsedSeconds(0);
    }
  }, [osmLoading, activeRequest, layerCounts, elapsedSeconds, loadProgress]);

  useEffect(() => {
    setSelectedDistricts([]);
    setSelectedCategories([]);
    setActiveRequest(null);
    setLoadProgress(null);
    setLastCompletedLoad(null);
  }, [districtSignature]);

  useEffect(() => {
    setSelectedDistricts((previous) => (
      haveSameIds(previous, selectedAnalysisDistrictIds) ? previous : selectedAnalysisDistrictIds
    ));
  }, [selectedAnalysisDistrictIds]);

  useEffect(() => {
    if (!osmLoading || !requestStartedAt) return undefined;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.floor((Date.now() - requestStartedAt) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [osmLoading, requestStartedAt]);

  const estimatedTimeLabel = useMemo(() => {
    if (!activeRequest) return 'OSM can queue requests before processing them. Retry waits are shown here.';
    if (activeRequest.districtCount >= 10 || activeRequest.categoryCount >= 5) {
      return 'Larger selections load in stages. Queues and retries can extend the wait.';
    }
    return 'Most OSM requests complete in around 10-30 seconds.';
  }, [activeRequest]);

  // No admin boundaries uploaded yet
  if (!districts || districts.length === 0) {
    return (
      <div style={{
        padding: '16px',
        fontSize: '13px',
        color: '#666',
        backgroundColor: '#f5f5f5',
        borderRadius: '6px',
        textAlign: 'center',
        border: '1px solid #e0e0e0'
      }}>
        📍 Upload an admin boundary shapefile to enable infrastructure data loading
      </div>
    );
  }

  // Sort uploaded admin areas alphabetically by name
  const sortedDistricts = [...districts].sort((a, b) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Filter districts based on search text
  const filteredDistricts = searchFilter.trim()
    ? sortedDistricts.filter(d => {
        const name = (d.name || '').toLowerCase();
        const search = searchFilter.toLowerCase();
        return name.includes(search);
      })
    : sortedDistricts;

  const handleLoadData = async () => {
    console.log('🔘 Load button clicked!', {
      selectedDistricts: selectedDistricts.length,
      selectedCategories: selectedCategories.length,
      selectedDistrictIds: selectedDistricts
    });

    if (selectedDistricts.length === 0 || selectedCategories.length === 0) {
      console.warn('⚠️ Cannot load: missing admin areas or categories');
      return;
    }

    const districtsToLoad = districts.filter((d, idx) =>
      selectedDistricts.includes(d.id || idx)
    );

    console.log('📦 Districts to load:', districtsToLoad.map(d => ({
      id: d.id,
      name: d.name || 'Unnamed'
    })));
    console.log('📦 Full district objects:', districtsToLoad);
    const categoriesToLoad = selectedCategories.filter(
      categoryId => !loadedCategories.includes(categoryId)
    );

    console.log('📦 Categories to load:', categoriesToLoad);

    if (categoriesToLoad.length === 0) {
      console.warn('⚠️ Cannot load: selected categories are already loaded');
      setSelectedCategories([]);
      return;
    }

    setActiveRequest({
      districtCount: districtsToLoad.length,
      categoryCount: categoriesToLoad.length,
      categoryIds: categoriesToLoad,
      categoryNames: categoriesToLoad
        .map(categoryId => INFRASTRUCTURE_CATEGORIES.find(category => category.id === categoryId)?.name || categoryId),
      totalTasks: districtsToLoad.length * categoriesToLoad.length
    });
    setLoadProgress({
      completedTasks: 0,
      totalTasks: districtsToLoad.length * categoriesToLoad.length,
      loadedFeatures: osmData?.features?.length || 0,
      districtName: districtsToLoad[0]?.name || null,
      categoryId: categoriesToLoad[0] || null
    });
    setLastCompletedLoad(null);
    setRequestStartedAt(Date.now());
    setElapsedSeconds(0);

    if (onLoadOSM) {
      console.log('✅ Calling onLoadOSM callback...');
      try {
        await onLoadOSM(districtsToLoad, categoriesToLoad, {
          onProgress: (nextProgress) => {
            setLoadProgress(previous => ({
              ...(previous || {}),
              ...nextProgress
            }));
          }
        });
        setSelectedCategories([]);
      } catch (error) {
        console.error('❌ OSM load callback failed:', error);
      }
    } else {
      console.error('❌ onLoadOSM callback is not defined!');
    }
  };

  // Get loaded categories
  const loadedCategories = INFRASTRUCTURE_CATEGORIES
    .map(category => category.id)
    .filter(categoryId => requestedLayerIds.includes(categoryId) || getCategoryFeatureCount(layerCounts, categoryId) > 0);
  const remainingCategories = INFRASTRUCTURE_CATEGORIES
    .map(category => category.id)
    .filter(categoryId => !loadedCategories.includes(categoryId));
  const pendingCategories = selectedCategories.filter(
    categoryId => !loadedCategories.includes(categoryId)
  );
  const pendingCategoryCount = pendingCategories.length;
  const progressTotal = loadProgress?.totalTasks || activeRequest?.totalTasks || 0;
  const progressCompleted = Math.min(loadProgress?.completedTasks || 0, progressTotal);
  const progressPercent = progressTotal > 0
    ? Math.min(100, Math.round((progressCompleted / progressTotal) * 100))
    : 0;
  const currentCategoryName = loadProgress?.categoryId
    ? INFRASTRUCTURE_CATEGORIES.find(category => category.id === loadProgress.categoryId)?.name || loadProgress.categoryId
    : null;

  return (
    <div style={{ padding: '0' }}>
      <h4 style={{ marginTop: 0, marginBottom: '16px', fontSize: '14px', color: '#333' }}>
        OpenStreetMap Infrastructure
      </h4>

      {osmWarning && !osmLoading && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #f59e0b',
          backgroundColor: '#fffbeb',
          color: '#92400e',
          fontSize: '12px',
          lineHeight: 1.5
        }}>
          {osmWarning}
        </div>
      )}

      {osmLoading && (
        <div style={{
          marginBottom: '16px',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 107, 53, 0.28)',
          background: 'linear-gradient(135deg, rgba(255, 247, 237, 0.98) 0%, rgba(255, 237, 213, 0.98) 100%)',
          boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#9a3412' }}>
              Loading OpenStreetMap infrastructure
            </div>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#1B3A5C',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid rgba(26, 54, 93, 0.12)',
              borderRadius: '999px',
              padding: '5px 10px'
            }}>
              {progressTotal > 0 ? `${progressPercent}%` : (elapsedSeconds > 0 ? `${elapsedSeconds}s elapsed` : 'Starting request...')}
            </div>
          </div>
          <div style={{ fontSize: '13px', color: '#7c2d12', lineHeight: 1.55 }}>
            {activeRequest
              ? `Fetching ${activeRequest.categoryCount} infrastructure ${activeRequest.categoryCount === 1 ? 'type' : 'types'} for ${activeRequest.districtCount} ${activeRequest.districtCount === 1 ? 'admin area' : 'admin areas'}.`
              : 'Fetching the selected infrastructure layers for the selected admin areas.'}
          </div>
          {progressTotal > 0 && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#9a3412', lineHeight: 1.55 }}>
              {progressCompleted.toLocaleString()} of {progressTotal.toLocaleString()} requests processed
              {loadProgress?.failedTasks > 0 ? ` · ${loadProgress.failedTasks} failed` : ''}
              {loadProgress?.loadedFeatures !== undefined
                ? ` · ${Number(loadProgress.loadedFeatures || 0).toLocaleString()} features available on the map`
                : ''}
            </div>
          )}
          {(loadProgress?.districtName || currentCategoryName) && progressCompleted < progressTotal && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: '#7c2d12' }}>
              Current: {[loadProgress?.districtName, currentCategoryName].filter(Boolean).join(' · ')}
            </div>
          )}
          {loadProgress?.message && <div role="status" style={{ marginTop: 8, fontSize: 12 }}>{loadProgress.message}</div>}
          {activeRequest?.categoryNames?.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#9a3412', fontWeight: 600 }}>
              {activeRequest.categoryNames.join(', ')}
            </div>
          )}
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#7c2d12' }}>
            {elapsedSeconds > 0 ? `${elapsedSeconds}s elapsed. ` : ''}{estimatedTimeLabel}
          </div>
          <div style={{
            marginTop: '12px',
            height: '8px',
            borderRadius: '999px',
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(255, 107, 53, 0.14)'
          }}>
            <div style={{
              width: progressTotal > 0 ? `${Math.max(progressPercent, 4)}%` : '35%',
              height: '100%',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, var(--aidstack-orange) 0%, #ff9a5f 100%)',
              transition: 'width 0.25s ease',
              animation: progressTotal > 0 ? 'none' : 'osm-loading-slide 1.4s ease-in-out infinite'
            }} />
          </div>
        </div>
      )}

      {!osmLoading && lastCompletedLoad && (
        <div style={{
          marginBottom: '16px',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid rgba(16, 185, 129, 0.22)',
          background: 'linear-gradient(135deg, rgba(236, 253, 245, 0.98) 0%, rgba(209, 250, 229, 0.98) 100%)',
          boxShadow: '0 8px 20px rgba(15, 23, 42, 0.05)'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#065f46', marginBottom: '6px' }}>
            {lastCompletedLoad.failedTasks ? 'OSM loading finished with errors' : 'OSM infrastructure loaded'}
          </div>
          <div style={{ fontSize: '13px', color: '#065f46', lineHeight: 1.55 }}>
            {lastCompletedLoad.failedTasks > 0 && <span>{lastCompletedLoad.failedTasks} requests failed. Previously loaded assets were retained. </span>}
            Available: {lastCompletedLoad.totalFeatures.toLocaleString()} features across {lastCompletedLoad.categoryCount} {lastCompletedLoad.categoryCount === 1 ? 'category' : 'categories'} for {lastCompletedLoad.districtCount} {lastCompletedLoad.districtCount === 1 ? 'admin area' : 'admin areas'}.
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#047857' }}>
            Completed in {Math.max(lastCompletedLoad.elapsedSeconds, 1)}s
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#047857' }}>
            {lastCompletedLoad.loadedBreakdown
              .filter(item => item.featureCount > 0)
              .map(item => `${item.name}: ${item.featureCount}`)
              .join(' | ') || (lastCompletedLoad.failedTasks ? 'Retry the failed categories when the service is available.' : 'No matching assets were found.')}
          </div>
        </div>
      )}

      {/* Step 1: Select Admin Areas */}
      <div style={{
        marginBottom: '16px',
        padding: '12px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span>Step 1: Select Admin Areas</span>
          {osmLoading && (
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#92400e',
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '999px',
              padding: '4px 8px'
            }}>
              Loading in progress
            </span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>
          Choose which admin areas to load ({sortedDistricts.length} total, {filteredDistricts.length} shown):
        </div>

        {/* Search Box */}
        <input
          type="text"
          placeholder="🔍 Search admin areas by name..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            marginBottom: '10px',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />

        <div style={{
          maxHeight: '240px',
          overflowY: 'auto',
          border: '1px solid #ddd',
          borderRadius: '4px',
          backgroundColor: 'white',
          padding: '4px',
          marginBottom: '10px'
        }}>
          {filteredDistricts.length === 0 ? (
            <div style={{ padding: '16px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
              No admin areas match "{searchFilter}"
            </div>
          ) : (
            filteredDistricts.map((district, idx) => {
              // Find the original index from the unsorted districts array
              const originalIdx = districts.findIndex(d => d === district);
              const districtId = getDistrictSelectionId(district, originalIdx);

              return (
                <label
                  key={districtId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    borderBottom: idx < filteredDistricts.length - 1 ? '1px solid #f0f0f0' : 'none',
                    backgroundColor: selectedDistricts.includes(districtId) ? '#e3f2fd' : 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedDistricts.includes(districtId)}
                    onChange={(e) => {
                      const nextSelectedDistricts = e.target.checked
                        ? [...selectedDistricts, districtId]
                        : selectedDistricts.filter(id => id !== districtId);

                      setSelectedDistricts(nextSelectedDistricts);
                      syncSelectionToParent(nextSelectedDistricts);

                    }}
                    style={{ marginRight: '8px' }}
                  />
                  <span>{district.name || `Admin Area ${originalIdx + 1}`}</span>
                </label>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => {
              const first10 = filteredDistricts.slice(0, Math.min(10, filteredDistricts.length)).map(d => {
                const originalIdx = districts.findIndex(orig => orig === d);
                return getDistrictSelectionId(d, originalIdx);
              });
              setSelectedDistricts(first10);
              syncSelectionToParent(first10);
            }}
            disabled={osmLoading || filteredDistricts.length === 0}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              background: 'white',
              color: '#3b82f6',
              cursor: (osmLoading || filteredDistricts.length === 0) ? 'not-allowed' : 'pointer',
              fontWeight: 500
            }}
          >
            Select Visible
          </button>
          <button
            onClick={() => {
              setSelectedDistricts([]);
              syncSelectionToParent([]);
            }}
            disabled={osmLoading || selectedDistricts.length === 0}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: 'white',
              color: '#666',
              cursor: (osmLoading || selectedDistricts.length === 0) ? 'not-allowed' : 'pointer'
            }}
          >
            Clear
          </button>
        </div>

        {selectedDistricts.length > 0 && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#059669', fontWeight: 500 }}>
            ✓ {selectedDistricts.length} {selectedDistricts.length === 1 ? 'admin area' : 'admin areas'} selected
          </div>
        )}
      </div>

      {/* Step 2: Select Infrastructure Types */}
      <div style={{
        marginBottom: '16px',
        padding: '12px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
        opacity: selectedDistricts.length === 0 ? 0.5 : 1
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#333' }}>
          Step 2: Select Infrastructure Types
        </div>
        {selectedDistricts.length === 0 && (
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '10px', fontStyle: 'italic' }}>
            Select admin areas first ↑
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
          {INFRASTRUCTURE_CATEGORIES.map(category => {
            const isSelected = selectedCategories.includes(category.id);
            const isLoaded = loadedCategories.includes(category.id);
            const isSelectable = selectedDistricts.length > 0 && !isLoaded && !osmLoading;

            return (
              <label
                key={category.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px',
                  cursor: isSelectable ? 'pointer' : 'not-allowed',
                  borderRadius: '4px',
                  backgroundColor: isLoaded ? '#ecfdf5' : (isSelected ? '#e3f2fd' : 'white'),
                  border: '1px solid ' + (isLoaded ? '#10b981' : (isSelected ? '#3b82f6' : '#e5e7eb')),
                  fontSize: '12px',
                  opacity: selectedDistricts.length === 0 ? 0.7 : 1
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected || isLoaded}
                  onChange={(e) => {
                    if (!isSelectable) return;

                    if (e.target.checked) {
                      setSelectedCategories(prev => Array.from(new Set([...prev, category.id])));
                    } else {
                      setSelectedCategories(prev => prev.filter(id => id !== category.id));
                    }
                  }}
                  disabled={!isSelectable}
                  style={{ marginRight: '6px' }}
                />
                <span style={{ marginRight: '4px' }}>{category.icon}</span>
                <span style={{ fontSize: '11px', flex: 1 }}>{category.name}</span>
                {isLoaded && (
                  <span style={{ fontSize: '10px', color: '#059669', fontWeight: 500 }}>✓</span>
                )}
              </label>
            );
          })}
        </div>

        {/* Quick select buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
          <button
            onClick={() => {
              const critical = INFRASTRUCTURE_CATEGORIES
                .filter(c => c.priority === 'critical' && !loadedCategories.includes(c.id))
                .map(c => c.id);
              setSelectedCategories(critical);
            }}
            disabled={osmLoading || selectedDistricts.length === 0}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              background: 'white',
              color: '#3b82f6',
              cursor: (osmLoading || selectedDistricts.length === 0) ? 'not-allowed' : 'pointer',
              fontWeight: 500
            }}
          >
            Critical Only
          </button>
          <button
            onClick={() => setSelectedCategories(remainingCategories)}
            disabled={osmLoading || selectedDistricts.length === 0 || remainingCategories.length === 0}
            style={{
              padding: '6px',
              fontSize: '11px',
              border: '1px solid #10b981',
              borderRadius: '4px',
              background: 'white',
              color: '#059669',
              cursor: (osmLoading || selectedDistricts.length === 0 || remainingCategories.length === 0) ? 'not-allowed' : 'pointer',
              fontWeight: 500
            }}
          >
            Select Remaining
          </button>
          <button
            onClick={() => setSelectedCategories([])}
            disabled={osmLoading || selectedCategories.length === 0}
            style={{
              padding: '6px',
              fontSize: '11px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: 'white',
              color: '#666',
              cursor: (osmLoading || selectedCategories.length === 0) ? 'not-allowed' : 'pointer'
            }}
          >
            Clear
          </button>
        </div>

        {selectedCategories.length > 0 && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#059669', fontWeight: 500 }}>
            ✓ {pendingCategoryCount} new {pendingCategoryCount === 1 ? 'category' : 'categories'} selected
          </div>
        )}
        {loadedCategories.length > 0 && remainingCategories.length > 0 && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#6b7280' }}>
            {loadedCategories.length} loaded, {remainingCategories.length} available to add
          </div>
        )}
      </div>

      {/* Load Button */}
      <button
        onClick={handleLoadData}
        disabled={osmLoading || selectedDistricts.length === 0 || pendingCategoryCount === 0}
        style={{
          width: '100%',
          padding: '14px',
          fontSize: '14px',
          fontWeight: 600,
          border: 'none',
          borderRadius: '6px',
          background: (osmLoading || selectedDistricts.length === 0 || pendingCategoryCount === 0)
            ? '#ccc'
            : 'linear-gradient(135deg, var(--aidstack-orange) 0%, #ff6b35 100%)',
          color: 'white',
          cursor: (osmLoading || selectedDistricts.length === 0 || pendingCategoryCount === 0) ? 'not-allowed' : 'pointer',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          transition: 'all 0.2s'
        }}
      >
        {osmLoading ? (
          activeRequest
            ? `Loading ${activeRequest.categoryCount} ${activeRequest.categoryCount === 1 ? 'Type' : 'Types'} for ${activeRequest.districtCount} ${activeRequest.districtCount === 1 ? 'Admin Area' : 'Admin Areas'}...`
            : 'Loading Infrastructure Data...'
        ) : selectedDistricts.length === 0 ? (
          'Select Admin Areas to Continue'
        ) : pendingCategoryCount === 0 ? (
          loadedCategories.length > 0 ? 'Select More Infrastructure Types to Add' : 'Select Infrastructure Types to Continue'
        ) : (
          `Load ${pendingCategoryCount} ${pendingCategoryCount === 1 ? 'Type' : 'Types'} for ${selectedDistricts.length} ${selectedDistricts.length === 1 ? 'Admin Area' : 'Admin Areas'}`
        )}
      </button>

      {/* Loaded Data Section */}
      {loadedCategories.length > 0 && (
        <div style={{
          padding: '12px',
          backgroundColor: '#ecfdf5',
          borderRadius: '6px',
          border: '1px solid #d1fae5'
        }}>
          <h4 style={{
            marginTop: 0,
            marginBottom: '10px',
            fontSize: '13px',
            color: '#065f46',
            fontWeight: 600
          }}>
            Loaded Infrastructure ({loadedCategories.length})
          </h4>

          {loadedCategories.map(categoryId => {
            const categoryDef = INFRASTRUCTURE_CATEGORIES.find(c => c.id === categoryId);
            if (!categoryDef) return null;

            const count = getCategoryFeatureCount(layerCounts, categoryId);
            const isVisible = isCategoryVisible(osmLayerVisibility, categoryId);

            return (
              <div
                key={categoryId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px',
                  marginBottom: '4px',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  border: '1px solid #d1fae5'
                }}
              >
                <span style={{ marginRight: '8px', fontSize: '16px' }}>
                  {categoryDef.icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>
                    {categoryDef.name}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>
                    {count} {count === 1 ? 'feature' : 'features'}
                  </div>
                </div>

                <button
                  onClick={() => onToggleLayerVisibility && onToggleLayerVisibility(categoryId)}
                  style={{
                    padding: '4px 10px',
                    marginRight: '6px',
                    fontSize: '11px',
                    backgroundColor: isVisible ? '#10b981' : '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {isVisible ? 'Hide' : 'Show'}
                </button>

                <button
                  onClick={() => onClearCategory && onClearCategory(categoryId)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  title="Remove this category data"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes osm-loading-slide {
          0% { transform: translateX(-100%); opacity: 0.5; }
          50% { transform: translateX(120%); opacity: 1; }
          100% { transform: translateX(260%); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
