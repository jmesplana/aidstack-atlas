import React from 'react';
import OSMInfrastructureSelector from './OSMInfrastructureSelector';
import BuildingFootprintToggle from '../../../platform/BuildingFootprintToggle';

function formatLayerDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
}

function formatMonthInputValue(value) {
  if (!value) return '';
  return value.slice(0, 7);
}

const MapLayersDrawer = ({
  showBuildingFootprints = false, setShowBuildingFootprints, buildingStatus, onRetryBuildings,
  isOpen,
  onClose,
  currentMapLayer,
  setCurrentMapLayer,
  geeBaseLayerMetadata,
  nighttimeCompareEnabled,
  setNighttimeCompareEnabled,
  nighttimeBeforeMonth,
  setNighttimeBeforeMonth,
  nighttimeAfterMonth,
  setNighttimeAfterMonth,
  nighttimeBeforeMetadata,
  showRoads,
  setShowRoads,
  showDisasterIcons,
  setShowDisasterIcons,
  showAcledLayer,
  setShowAcledLayer,
  showOutbreakLayer,
  setShowOutbreakLayer,
  showFacilitiesLayer,
  setShowFacilitiesLayer,
  showFloodContextLayer,
  setShowFloodContextLayer,
  showDroughtContextLayer,
  setShowDroughtContextLayer,
  showAccessibilityContextLayer,
  setShowAccessibilityContextLayer,
  // Support alternative prop format from UnifiedDrawer
  settings,
  onToggle,
  onConfigChange,
  embedded = false, // New prop for when embedded in UnifiedDrawer
  // OSM Infrastructure props
  districts,
  selectedAnalysisDistricts,
  osmData,
  osmStats,
  osmWarning,
  osmLoading,
  osmLayerVisibility,
  onLoadOSM, // (selectedDistricts, selectedCategories) => void
  onOSMSelectionChange,
  onToggleOSMLayerVisibility,
  onClearOSMCategory
}) => {
  // Use either direct props or settings object
  const activeMapLayer = currentMapLayer || settings?.currentMapLayer || 'street';
  const activeShowRoads = showRoads !== undefined ? showRoads : (settings?.showRoads || false);
  const activeShowDisasterIcons = showDisasterIcons !== undefined ? showDisasterIcons : (settings?.showDisasterIcons ?? true);
  const activeShowAcledLayer = showAcledLayer !== undefined ? showAcledLayer : (settings?.showAcledLayer ?? true);
  const activeShowOutbreakLayer = showOutbreakLayer !== undefined ? showOutbreakLayer : (settings?.showOutbreakLayer ?? false);
  const activeShowFacilitiesLayer = showFacilitiesLayer !== undefined ? showFacilitiesLayer : (settings?.showFacilitiesLayer ?? true);
  const activeShowFloodContextLayer = showFloodContextLayer !== undefined ? showFloodContextLayer : (settings?.showFloodContextLayer || false);
  const activeShowDroughtContextLayer = showDroughtContextLayer !== undefined ? showDroughtContextLayer : (settings?.showDroughtContextLayer || false);
  const activeShowAccessibilityContextLayer = showAccessibilityContextLayer !== undefined ? showAccessibilityContextLayer : (settings?.showAccessibilityContextLayer || false);

  const handleMapLayerChange = (layer) => {
    if (setCurrentMapLayer) {
      setCurrentMapLayer(layer);
    } else if (onToggle) {
      onToggle('currentMapLayer', layer);
    } else if (onConfigChange) {
      onConfigChange({ currentMapLayer: layer });
    }
  };

  const handleShowRoadsChange = (value) => {
    if (setShowRoads) {
      setShowRoads(value);
    } else if (onToggle) {
      onToggle('showRoads', value);
    } else if (onConfigChange) {
      onConfigChange({ showRoads: value });
    }
  };

  const handleOverlayToggle = (key, value, setter) => {
    if (setter) {
      setter(value);
    } else if (onToggle) {
      onToggle(key, value);
    } else if (onConfigChange) {
      onConfigChange({ [key]: value });
    }
  };

  const handleFloodContextLayerChange = (value) => {
    if (setShowFloodContextLayer) {
      setShowFloodContextLayer(value);
    } else if (onToggle) {
      onToggle('showFloodContextLayer', value);
    } else if (onConfigChange) {
      onConfigChange({ showFloodContextLayer: value });
    }
  };

  const handleDroughtContextLayerChange = (value) => {
    if (setShowDroughtContextLayer) {
      setShowDroughtContextLayer(value);
    } else if (onToggle) {
      onToggle('showDroughtContextLayer', value);
    } else if (onConfigChange) {
      onConfigChange({ showDroughtContextLayer: value });
    }
  };

  const handleAccessibilityContextLayerChange = (value) => {
    if (setShowAccessibilityContextLayer) {
      setShowAccessibilityContextLayer(value);
    } else if (onToggle) {
      onToggle('showAccessibilityContextLayer', value);
    } else if (onConfigChange) {
      onConfigChange({ showAccessibilityContextLayer: value });
    }
  };

  // Content that will be shown (either embedded or in full drawer)
  const content = (
    <div style={{padding: '20px'}}>
      <h4 style={{marginBottom: '15px', color: '#333', fontSize: '16px'}}>Select Base Layer</h4>

      <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
        <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', borderRadius: '4px', backgroundColor: activeMapLayer === 'street' ? '#e3f2fd' : 'transparent'}}>
          <input
            type="radio"
            name="mapLayer"
            value="street"
            checked={activeMapLayer === 'street'}
            onChange={() => handleMapLayerChange('street')}
            style={{marginRight: '10px'}}
          />
          <span>Street Map</span>
        </label>

        <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', borderRadius: '4px', backgroundColor: activeMapLayer === 'light_minimal' ? '#e3f2fd' : 'transparent'}}>
          <input
            type="radio"
            name="mapLayer"
            value="light_minimal"
            checked={activeMapLayer === 'light_minimal'}
            onChange={() => handleMapLayerChange('light_minimal')}
            style={{marginRight: '10px'}}
          />
          <span>Light Minimal</span>
        </label>

        <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', borderRadius: '4px', backgroundColor: activeMapLayer === 'dark' ? '#e3f2fd' : 'transparent'}}>
          <input
            type="radio"
            name="mapLayer"
            value="dark"
            checked={activeMapLayer === 'dark'}
            onChange={() => handleMapLayerChange('dark')}
            style={{marginRight: '10px'}}
          />
          <span>Dark Map</span>
        </label>

        <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', borderRadius: '4px', backgroundColor: activeMapLayer === 'nighttime_lights' ? '#e3f2fd' : 'transparent'}}>
          <input
            type="radio"
            name="mapLayer"
            value="nighttime_lights"
            checked={activeMapLayer === 'nighttime_lights'}
            onChange={() => handleMapLayerChange('nighttime_lights')}
            style={{marginRight: '10px'}}
          />
          <div>
            <div>🌙 Nighttime Lights (GEE)</div>
            {activeMapLayer === 'nighttime_lights' && geeBaseLayerMetadata?.date && (
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                Data date: {formatLayerDate(geeBaseLayerMetadata.date)} {geeBaseLayerMetadata.cadence ? `(${geeBaseLayerMetadata.cadence})` : ''}
              </div>
            )}
          </div>
        </label>

        <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', borderRadius: '4px', backgroundColor: activeMapLayer === 'satellite' ? '#e3f2fd' : 'transparent'}}>
          <input
            type="radio"
            name="mapLayer"
            value="satellite"
            checked={activeMapLayer === 'satellite'}
            onChange={() => handleMapLayerChange('satellite')}
            style={{marginRight: '10px'}}
          />
          <span>Satellite Imagery</span>
        </label>

        <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', borderRadius: '4px', backgroundColor: activeMapLayer === 'recent_clear' ? '#e3f2fd' : 'transparent'}}>
          <input
            type="radio"
            name="mapLayer"
            value="recent_clear"
            checked={activeMapLayer === 'recent_clear'}
            onChange={() => handleMapLayerChange('recent_clear')}
            style={{marginRight: '10px'}}
          />
          <span>Recent Clear (GEE)</span>
        </label>

        <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', borderRadius: '4px', backgroundColor: activeMapLayer === 'radar_change' ? '#e3f2fd' : 'transparent'}}>
          <input
            type="radio"
            name="mapLayer"
            value="radar_change"
            checked={activeMapLayer === 'radar_change'}
            onChange={() => handleMapLayerChange('radar_change')}
            style={{marginRight: '10px'}}
          />
          <span>Radar Change (GEE)</span>
        </label>

        <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', borderRadius: '4px', backgroundColor: activeMapLayer === 'active_fires' ? '#e3f2fd' : 'transparent'}}>
          <input
            type="radio"
            name="mapLayer"
            value="active_fires"
            checked={activeMapLayer === 'active_fires'}
            onChange={() => handleMapLayerChange('active_fires')}
            style={{marginRight: '10px'}}
          />
          <span>🔥 Active Fires (GEE)</span>
        </label>

        <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px', borderRadius: '4px', backgroundColor: activeMapLayer === 'terrain' ? '#e3f2fd' : 'transparent'}}>
          <input
            type="radio"
            name="mapLayer"
            value="terrain"
            checked={activeMapLayer === 'terrain'}
            onChange={() => handleMapLayerChange('terrain')}
            style={{marginRight: '10px'}}
          />
          <span>Terrain Map</span>
        </label>

        {activeMapLayer === 'recent_clear' && (
          <div style={{
            fontSize: '12px',
            color: '#555',
            backgroundColor: '#f7f7f7',
            borderRadius: '6px',
            padding: '10px',
            lineHeight: 1.5
          }}>
            Sentinel-2 recent clear composite over the last 10 days. Best for a clearer recent view when clouds allow.
          </div>
        )}

        {activeMapLayer === 'radar_change' && (
          <div style={{
            fontSize: '12px',
            color: '#555',
            backgroundColor: '#f7f7f7',
            borderRadius: '6px',
            padding: '10px',
            lineHeight: 1.5
          }}>
            Sentinel-1 radar change view. Useful in cloudy conditions and for recent surface change, but it is not photo imagery.
          </div>
        )}

        {activeMapLayer === 'active_fires' && (
          <div style={{
            fontSize: '12px',
            color: '#555',
            backgroundColor: '#f7f7f7',
            borderRadius: '6px',
            padding: '10px',
            lineHeight: 1.5
          }}>
            NASA FIRMS active fire detections from the last 7 days over a dark basemap. Warmer, brighter points mean a stronger thermal signal. Useful for wildfire spread and active burning, but it is not a fire-perimeter product.
          </div>
        )}

        {activeMapLayer === 'nighttime_lights' && (
          <div style={{
            fontSize: '12px',
            color: '#555',
            backgroundColor: '#f7f7f7',
            borderRadius: '6px',
            padding: '10px',
            lineHeight: 1.5
          }}>
            Monthly VIIRS nighttime lights. Use compare mode to inspect two months with a swipe slider.

            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Compare two dates</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(nighttimeCompareEnabled)}
                  onChange={(event) => setNighttimeCompareEnabled?.(event.target.checked)}
                />
                <span>{nighttimeCompareEnabled ? 'On' : 'Off'}</span>
              </label>
            </div>

            {nighttimeCompareEnabled && (
              <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontWeight: 700, color: '#334155' }}>Before</span>
                  <input
                    type="month"
                    value={formatMonthInputValue(nighttimeBeforeMonth || nighttimeBeforeMetadata?.date || '')}
                    onChange={(event) => setNighttimeBeforeMonth?.(event.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontWeight: 700, color: '#334155' }}>After</span>
                  <input
                    type="month"
                    value={formatMonthInputValue(nighttimeAfterMonth || geeBaseLayerMetadata?.date || '')}
                    onChange={(event) => setNighttimeAfterMonth?.(event.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
                  />
                </label>
                <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#64748b' }}>
                  The map shows the selected "after" month full-frame and the "before" month on the left side of the swipe slider.
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{borderTop: '1px solid #eee', margin: '15px 0', paddingTop: '15px'}}>
          <h4 style={{marginBottom: '10px', color: '#333', fontSize: '14px'}}>Overlay Options</h4>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px', lineHeight: 1.5 }}>
            Turn overlays on and off without changing the basemap.
          </div>
          <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: activeShowDisasterIcons ? '#e3f2fd' : 'transparent'}}>
            <input
              type="checkbox"
              checked={activeShowDisasterIcons}
              onChange={(event) => handleOverlayToggle('showDisasterIcons', event.target.checked, setShowDisasterIcons)}
              style={{marginRight: '10px'}}
            />
            <span>GDACS Disasters</span>
          </label>
          <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: activeShowAcledLayer ? '#fef3c7' : 'transparent'}}>
            <input
              type="checkbox"
              checked={activeShowAcledLayer}
              onChange={(event) => handleOverlayToggle('showAcledLayer', event.target.checked, setShowAcledLayer)}
              style={{marginRight: '10px'}}
            />
            <span>ACLED Conflict</span>
          </label>
          <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: activeShowOutbreakLayer ? '#fce7f3' : 'transparent'}}>
            <input
              type="checkbox"
              checked={activeShowOutbreakLayer}
              onChange={(event) => handleOverlayToggle('showOutbreakLayer', event.target.checked, setShowOutbreakLayer)}
              style={{marginRight: '10px'}}
            />
            <span>WHO Outbreaks <span style={{ fontSize: '11px', color: '#888' }}>(loads on enable)</span></span>
          </label>
          <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: activeShowFacilitiesLayer ? '#dcfce7' : 'transparent'}}>
            <input
              type="checkbox"
              checked={activeShowFacilitiesLayer}
              onChange={(event) => handleOverlayToggle('showFacilitiesLayer', event.target.checked, setShowFacilitiesLayer)}
              style={{marginRight: '10px'}}
            />
            <span>Sites</span>
          </label>
          <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: activeShowRoads ? '#e3f2fd' : 'transparent'}}>
            <input
              type="checkbox"
              checked={activeShowRoads}
              onChange={() => handleShowRoadsChange(!activeShowRoads)}
              style={{marginRight: '10px'}}
            />
            <span>Show Road Network</span>
          </label>
          <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: activeShowFloodContextLayer ? '#e0f2fe' : 'transparent'}}>
            <input
              type="checkbox"
              checked={activeShowFloodContextLayer}
              onChange={(event) => handleFloodContextLayerChange(event.target.checked)}
              style={{marginRight: '10px'}}
            />
            <span>Flood Context Overlay</span>
          </label>
          {activeShowFloodContextLayer && (
            <div style={{ fontSize: '12px', color: '#555', backgroundColor: '#f7f7f7', borderRadius: '6px', padding: '10px', lineHeight: 1.5, marginTop: '6px' }}>
              SRTM terrain plus JRC surface water overlay for flood-prone context. Keep your preferred basemap active underneath.
            </div>
          )}
          <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: activeShowDroughtContextLayer ? '#fef3c7' : 'transparent'}}>
            <input
              type="checkbox"
              checked={activeShowDroughtContextLayer}
              onChange={(event) => handleDroughtContextLayerChange(event.target.checked)}
              style={{marginRight: '10px'}}
            />
            <span>Drought Context Overlay</span>
          </label>
          {activeShowDroughtContextLayer && (
            <div style={{ fontSize: '12px', color: '#555', backgroundColor: '#f7f7f7', borderRadius: '6px', padding: '10px', lineHeight: 1.5, marginTop: '6px' }}>
              CHIRPS rainfall plus ERA5-Land climate overlay for drought context. Keep your preferred basemap active underneath.
            </div>
          )}
          <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: activeShowAccessibilityContextLayer ? '#fee2e2' : 'transparent'}}>
            <input
              type="checkbox"
              checked={activeShowAccessibilityContextLayer}
              onChange={(event) => handleAccessibilityContextLayerChange(event.target.checked)}
              style={{marginRight: '10px'}}
            />
            <span>Accessibility / Hard-to-Reach Overlay</span>
          </label>
          {activeShowAccessibilityContextLayer && (
            <div style={{ fontSize: '12px', color: '#555', backgroundColor: '#f7f7f7', borderRadius: '6px', padding: '10px', lineHeight: 1.5, marginTop: '6px' }}>
              Oxford MAP travel-time overlay showing access to the nearest hospital or clinic. Blue means easier access, warmer tones mean longer travel time. Open the map legend to see the scale.
            </div>
          )}
        </div>

        {/* OSM Infrastructure Section */}
        <div style={{borderTop: '1px solid #eee', margin: '15px 0', paddingTop: '15px'}}>
          {setShowBuildingFootprints && <BuildingFootprintToggle enabled={showBuildingFootprints} onChange={setShowBuildingFootprints} status={buildingStatus} onRetry={onRetryBuildings} />}
          <OSMInfrastructureSelector
            districts={districts}
            selectedAnalysisDistricts={selectedAnalysisDistricts}
            osmData={osmData}
            osmStats={osmStats}
            osmWarning={osmWarning}
            osmLoading={osmLoading}
            osmLayerVisibility={osmLayerVisibility}
            onLoadOSM={onLoadOSM}
            onSelectionChange={onOSMSelectionChange}
            onToggleLayerVisibility={onToggleOSMLayerVisibility}
            onClearCategory={onClearOSMCategory}
          />
        </div>
      </div>
    </div>
  );

  // Return embedded content or full drawer
  if (embedded) {
    return content;
  }

  return (
    <>
      <div className={`drawer-backdrop ${isOpen ? 'open' : ''}`} onClick={onClose}></div>
      <div
        className={`drawer drawer-right ${isOpen ? 'open' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{ zIndex: 3000 }}
      >
        <div className="drawer-header" style={{
          background: 'linear-gradient(135deg, var(--aidstack-navy) 0%, #2D5A7B 100%)',
          color: 'white',
          margin: '-20px -20px 20px -20px',
          padding: '20px'
        }}>
          <h3 className="drawer-title" style={{color: 'white', fontFamily: "'Space Grotesk', sans-serif"}}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--aidstack-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}>
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            Map Layers
          </h3>
          <button className="drawer-close" onClick={onClose} style={{color: 'white'}}>×</button>
        </div>
        <div className="drawer-content">
          {content}
        </div>
      </div>
    </>
  );
};

export default MapLayersDrawer;
