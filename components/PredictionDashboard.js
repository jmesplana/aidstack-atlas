/**
 * Prediction Dashboard Component
 * Displays future risk forecasts, disease outbreak predictions, and supply chain disruptions
 * Uses Aidstack branding and flat SVG icons
 * Intelligently extracts metadata from facilities (population, disease prevalence, demographics)
 */

import { useState, useEffect } from 'react';
import bbox from '@turf/bbox';
import { useToast } from './Toast';
import { DecisionBadge, RiskBar, getDecisionLabel } from './DecisionSupport';
import {
  filterFacilitiesToDistricts,
  filterItemsToDistricts
} from '../lib/analysisScope';

const experimentalTabs = new Set(['disaster', 'outbreak', 'supply']);

const experimentalBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 8px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
};

function buildForecastFooterLabel(districtAnalysis, districtCount) {
  const summarySources = districtAnalysis?.summary?.sources || [];
  const hasGeeEvidence = summarySources.some((source) => source.includes('district summaries'));

  if (hasGeeEvidence) {
    return `District outlook uses Open-Meteo forecast plus district-level Earth Engine evidence${districtCount > 0 ? ` • ${districtCount} district${districtCount === 1 ? '' : 's'} analyzed` : ''}`;
  }

  return `District outlook uses Open-Meteo forecast plus selected districts and currently loaded context${districtCount > 0 ? ` • ${districtCount} district${districtCount === 1 ? '' : 's'} analyzed` : ''}`;
}

function getDistrictDecisionLabel(district = {}) {
  const score = typeof district?.dominantHazard?.score === 'number' ? district.dominantHazard.score : 0;
  if ((district?.exposure?.securitySignalCount || 0) > 0 && String(district?.confidence || '').toLowerCase() === 'low' && score >= 70) {
    return 'Delay';
  }
  return getDecisionLabel(score);
}

function getDistrictMissingEvidence(district = {}) {
  const gaps = [];
  if (Array.isArray(district?.limitations)) {
    gaps.push(...district.limitations);
  }
  return gaps.filter(Boolean);
}

const PredictionDashboard = ({
  facilities,
  disasters,
  districts = [],
  selectedDistricts = [],
  acledData = [],
  selectedDistrict = null, // If provided, shows district-specific forecast
  worldPopData = {},
  enabledEvidenceLayers = [],
  onClose
}) => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [activeTab, setActiveTab] = useState('districts');
  const [locationInfo, setLocationInfo] = useState(null);
  const [facilitiesMetadata, setFacilitiesMetadata] = useState(null);
  const [weatherData, setWeatherData] = useState(null); // Store raw weather data for charts
  const analysisDistricts = selectedDistrict
    ? [selectedDistrict]
    : (selectedDistricts.length > 0 ? selectedDistricts : districts);
  const scopedFacilities = analysisDistricts.length > 0
    ? filterFacilitiesToDistricts(facilities || [], analysisDistricts)
    : (facilities || []);
  const scopedDisasters = analysisDistricts.length > 0
    ? filterItemsToDistricts(disasters || [], analysisDistricts)
    : (disasters || []);
  const scopedAcled = analysisDistricts.length > 0
    ? filterItemsToDistricts(acledData || [], analysisDistricts)
    : (acledData || []);

  // Extract metadata from facilities (population, country, disease prevalence, etc.)
  const extractFacilitiesMetadata = (facilities) => {
    if (!facilities || facilities.length === 0) return null;

    const metadata = {
      countries: new Set(),
      regions: new Set(),
      totalPopulation: 0,
      diseaseData: {},
      demographics: {},
      washData: {},
      healthFacilities: 0,
    };

    // Common field name variations
    const fieldMappings = {
      country: ['country', 'nation', 'admin0', 'country_name'],
      region: ['region', 'state', 'province', 'admin1', 'district', 'admin2'],
      population: ['population', 'pop', 'catchment', 'catchment_population', 'target_population'],
      malaria: ['malaria', 'malaria_prevalence', 'malaria_rate', 'malaria_cases'],
      measles: ['measles', 'measles_coverage', 'measles_cases'],
      cholera: ['cholera', 'cholera_cases', 'cholera_risk'],
      children_u5: ['children_under_5', 'u5', 'children_u5', 'under_five'],
      wash_access: ['wash', 'water_access', 'improved_water', 'sanitation'],
      facility_type: ['type', 'facility_type', 'category'],
    };

    // Helper to find field value by multiple possible names
    const findField = (facility, fieldNames) => {
      for (const name of fieldNames) {
        const value = facility[name] || facility[name.toLowerCase()] || facility[name.toUpperCase()];
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
      return null;
    };

    facilities.forEach(facility => {
      // Extract country
      const country = findField(facility, fieldMappings.country);
      if (country) metadata.countries.add(country);

      // Extract region/state
      const region = findField(facility, fieldMappings.region);
      if (region) metadata.regions.add(region);

      // Extract population
      const population = findField(facility, fieldMappings.population);
      if (population) {
        const popValue = parseFloat(String(population).replace(/,/g, ''));
        if (!isNaN(popValue)) {
          metadata.totalPopulation += popValue;
        }
      }

      // Extract disease prevalence data
      const malariaData = findField(facility, fieldMappings.malaria);
      if (malariaData) {
        if (!metadata.diseaseData.malaria) metadata.diseaseData.malaria = [];
        metadata.diseaseData.malaria.push(parseFloat(malariaData) || 0);
      }

      const measlesData = findField(facility, fieldMappings.measles);
      if (measlesData) {
        if (!metadata.diseaseData.measles) metadata.diseaseData.measles = [];
        metadata.diseaseData.measles.push(parseFloat(measlesData) || 0);
      }

      const choleraData = findField(facility, fieldMappings.cholera);
      if (choleraData) {
        if (!metadata.diseaseData.cholera) metadata.diseaseData.cholera = [];
        metadata.diseaseData.cholera.push(parseFloat(choleraData) || 0);
      }

      // Extract demographic data
      const childrenU5 = findField(facility, fieldMappings.children_u5);
      if (childrenU5) {
        if (!metadata.demographics.children_u5) metadata.demographics.children_u5 = [];
        metadata.demographics.children_u5.push(parseFloat(childrenU5) || 0);
      }

      // Extract WASH data
      const washAccess = findField(facility, fieldMappings.wash_access);
      if (washAccess) {
        if (!metadata.washData.access) metadata.washData.access = [];
        metadata.washData.access.push(parseFloat(washAccess) || 0);
      }

      // Count health facilities
      const facilityType = findField(facility, fieldMappings.facility_type);
      if (facilityType && (
        String(facilityType).toLowerCase().includes('health') ||
        String(facilityType).toLowerCase().includes('hospital') ||
        String(facilityType).toLowerCase().includes('clinic')
      )) {
        metadata.healthFacilities++;
      }
    });

    // Calculate averages
    if (metadata.diseaseData.malaria?.length > 0) {
      metadata.diseaseData.malariaAvg = metadata.diseaseData.malaria.reduce((a, b) => a + b, 0) / metadata.diseaseData.malaria.length;
    }
    if (metadata.diseaseData.measles?.length > 0) {
      metadata.diseaseData.measlesAvg = metadata.diseaseData.measles.reduce((a, b) => a + b, 0) / metadata.diseaseData.measles.length;
    }
    if (metadata.washData.access?.length > 0) {
      metadata.washData.accessAvg = metadata.washData.access.reduce((a, b) => a + b, 0) / metadata.washData.access.length;
    }
    if (metadata.demographics.children_u5?.length > 0) {
      metadata.demographics.children_u5_total = metadata.demographics.children_u5.reduce((a, b) => a + b, 0);
    }

    return {
      countries: Array.from(metadata.countries),
      regions: Array.from(metadata.regions),
      totalPopulation: Math.round(metadata.totalPopulation),
      diseaseData: metadata.diseaseData,
      demographics: metadata.demographics,
      washData: metadata.washData,
      healthFacilities: metadata.healthFacilities,
    };
  };

  // Use the same admin scope for the regional weather and district outlook.
  const getCenterPoint = () => {
    const districtBounds = analysisDistricts.flatMap((district) => {
      let bounds = district.bounds
        ? [district.bounds.minLng, district.bounds.minLat, district.bounds.maxLng, district.bounds.maxLat]
        : null;
      if (!bounds?.every(Number.isFinite) && district.geometry) {
        try {
          bounds = bbox(district.geometry);
        } catch (_) {
          return [];
        }
      }
      return bounds?.every(Number.isFinite) ? [bounds] : [];
    });

    if (districtBounds.length > 0) {
      return {
        latitude: (Math.min(...districtBounds.map(b => b[1])) + Math.max(...districtBounds.map(b => b[3]))) / 2,
        longitude: (Math.min(...districtBounds.map(b => b[0])) + Math.max(...districtBounds.map(b => b[2]))) / 2,
        source: 'district',
        count: districtBounds.length,
      };
    }

    // Priority 1: Use facilities if available
    if (scopedFacilities && scopedFacilities.length > 0) {
      const sumLat = scopedFacilities.reduce((sum, f) => sum + f.latitude, 0);
      const sumLng = scopedFacilities.reduce((sum, f) => sum + f.longitude, 0);

      return {
        latitude: sumLat / scopedFacilities.length,
        longitude: sumLng / scopedFacilities.length,
        source: 'facilities',
        count: scopedFacilities.length,
      };
    }

    // Priority 2: Use disasters if no facilities
    if (scopedDisasters && scopedDisasters.length > 0) {
      const validDisasters = scopedDisasters.filter(d => d.latitude && d.longitude);
      if (validDisasters.length > 0) {
        const sumLat = validDisasters.reduce((sum, d) => sum + parseFloat(d.latitude), 0);
        const sumLng = validDisasters.reduce((sum, d) => sum + parseFloat(d.longitude), 0);

        return {
          latitude: sumLat / validDisasters.length,
          longitude: sumLng / validDisasters.length,
          source: 'disasters',
          count: validDisasters.length,
        };
      }
    }

    return null;
  };

  const loadPredictions = async () => {
    setLoadError(null);
    if (analysisDistricts.length === 0) {
      const message = 'Upload or select one or more admin areas to generate the district outlook.';
      setLoadError(message);
      addToast(message, 'warning');
      return;
    }

    const center = getCenterPoint();
    if (!center) {
      const message = 'No usable location found in the selected admin areas. Reload boundaries with valid geometry or coordinates.';
      setLoadError(message);
      addToast(message, 'error');
      return;
    }

    setLoading(true);

    try {
      // Extract metadata from facilities
      const metadata = extractFacilitiesMetadata(scopedFacilities);
      setFacilitiesMetadata(metadata);

      // Determine population estimate
      let populationEstimate = 50000; // Default
      if (metadata && metadata.totalPopulation > 0) {
        populationEstimate = metadata.totalPopulation;
      } else if (scopedFacilities && scopedFacilities.length > 0) {
        populationEstimate = scopedFacilities.length * 5000; // Estimate 5k per facility
      }

      // Build location info - prioritize selected district, then shapefile, then facilities metadata
      let locationName = 'Global View';
      let countryNames = [];
      let regionNames = [];

      // Priority 0: District-specific mode
      if (selectedDistrict) {
        locationName = selectedDistrict.name;
        if (selectedDistrict.region) {
          locationName += `, ${selectedDistrict.region}`;
        }
        if (selectedDistrict.country) {
          locationName += ` (${selectedDistrict.country})`;
          countryNames = [selectedDistrict.country];
        }
        if (selectedDistrict.region) {
          regionNames = [selectedDistrict.region];
        }
        // Override population estimate if district has population data
        if (selectedDistrict.population) {
          populationEstimate = selectedDistrict.population;
        }
      }
      // Priority 1: Check if we have districts from shapefile
      else if (analysisDistricts.length > 0) {
        // Extract unique countries and regions from districts
        locationName = analysisDistricts.length === 1
          ? analysisDistricts[0].name || 'Selected admin area'
          : `${analysisDistricts.length} admin areas`;
        const districtCountries = [...new Set(analysisDistricts.map(d => d.country).filter(Boolean))];
        const districtRegions = [...new Set(analysisDistricts.map(d => d.region).filter(Boolean))];

        if (districtCountries.length > 0) {
          countryNames = districtCountries;
          regionNames = districtRegions;

          if (districtCountries.length === 1) {
            locationName = districtCountries[0];
            if (districtRegions.length > 0 && districtRegions.length <= 5) {
              locationName += ` (${districtRegions.slice(0, 5).join(', ')})`;
            } else if (districtRegions.length > 5) {
              locationName += ` (${districtRegions.length} regions)`;
            }
          } else {
            locationName = `${districtCountries.length} Countries (${districtCountries.slice(0, 3).join(', ')}${districtCountries.length > 3 ? '...' : ''})`;
          }
        }
      }
      // Fallback to facilities metadata if no districts
      else if (metadata && metadata.countries.length > 0) {
        countryNames = metadata.countries;
        regionNames = metadata.regions;

        if (metadata.countries.length === 1) {
          locationName = metadata.countries[0];
          if (metadata.regions.length > 0 && metadata.regions.length <= 3) {
            locationName += ` (${metadata.regions.join(', ')})`;
          }
        } else {
          locationName = `${metadata.countries.length} Countries (${metadata.countries.slice(0, 3).join(', ')}${metadata.countries.length > 3 ? '...' : ''})`;
        }
      }

      const filteredAcled = scopedAcled;

      // Fetch weather data first (need it for weather chart tab)
      let weatherResponse;
      try {
        weatherResponse = await fetch('/api/weather-forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: center.latitude,
            longitude: center.longitude,
            days: 14,
          }),
        });
        const weatherJson = await weatherResponse.json();
        setWeatherData(weatherJson); // Store for weather chart
      } catch (error) {
        console.error('Failed to fetch weather data:', error);
        setWeatherData(null);
      }

      setLocationInfo({
        name: locationName,
        coordinates: `${center.latitude.toFixed(4)}°, ${center.longitude.toFixed(4)}°`,
        isMultiCountry: countryNames.length > 1,
        isSpecificRegion: regionNames.length > 0 && regionNames.length <= 5,
        countries: countryNames,
        regions: regionNames,
        source: selectedDistrict ? 'district' : (districts && districts.length > 0 ? 'shapefile' : 'facilities'),
        isDistrictMode: !!selectedDistrict,
        acledEventCount: filteredAcled.length,
      });

      const districtHazardAnalysis = await fetch('/api/district-hazard-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          districts: analysisDistricts,
          facilities: scopedFacilities,
          disasters: scopedDisasters,
          acledData: filteredAcled,
          worldPopData,
          enabledEvidenceLayers,
          days: 7,
        }),
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to generate district hazard analysis');
        }
        return payload;
      });

      setPredictions({
        districtAnalysis: districtHazardAnalysis,
        centerPoint: center,
      });

    } catch (error) {
      console.error('Failed to load predictions:', error);
      const message = `Failed to load predictions: ${error.message || 'Please try again.'}`;
      setLoadError(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPredictions();
  }, []);

  const getRiskColor = (level) => {
    switch (level) {
      case 'CRITICAL': return '#DC2626';
      case 'HIGH': return '#FF6B35'; // Aidstack orange
      case 'MEDIUM': return '#F59E0B';
      case 'LOW': return '#10B981';
      default: return '#64748B';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '1000px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '2px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--aidstack-navy)',
          color: 'white',
          borderRadius: '12px 12px 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Forecast Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>
                  Predictive Forecast
                </h2>
                <span style={{
                  ...experimentalBadgeStyle,
                  background: 'rgba(255, 255, 255, 0.16)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  color: '#FFD7C7',
                }}>
                  Experimental
                </span>
              </div>
              <p style={{
                margin: '4px 0 0 0',
                fontSize: '13px',
                opacity: 0.9,
                fontFamily: "'Inter', sans-serif",
              }}>
                {locationInfo ? locationInfo.name : 'Loading location...'}
                {facilitiesMetadata && facilitiesMetadata.totalPopulation > 0 && (
                  <span> • Pop: {facilitiesMetadata.totalPopulation.toLocaleString()}</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'white',
              padding: '4px 12px',
              borderRadius: '6px',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
          >
            ×
          </button>
        </div>

        <div style={{
          padding: '12px 24px',
          background: '#FFF7ED',
          borderBottom: '1px solid #FED7AA',
          color: '#9A3412',
          fontSize: '13px',
          lineHeight: 1.5,
          fontFamily: "'Inter', sans-serif",
        }}>
          District hazard outputs are directional and designed for transparent review. Use the drivers, sources, and limitations shown for each district before acting.
        </div>

        {/* Metadata Summary Bar (if available) */}
        {facilitiesMetadata && (
          <div style={{
            padding: '12px 24px',
            background: '#F0F9FF',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            gap: '20px',
            flexWrap: 'wrap',
            fontSize: '12px',
            fontFamily: "'Inter', sans-serif",
          }}>
            {facilitiesMetadata.countries.length > 0 && (
              <div>
                <strong style={{ color: 'var(--aidstack-navy)' }}>Countries:</strong>{' '}
                <span style={{ color: '#64748B' }}>{facilitiesMetadata.countries.join(', ')}</span>
              </div>
            )}
            {facilitiesMetadata.diseaseData.malariaAvg && (
              <div>
                <strong style={{ color: 'var(--aidstack-navy)' }}>Avg Malaria Prevalence:</strong>{' '}
                <span style={{ color: '#64748B' }}>{facilitiesMetadata.diseaseData.malariaAvg.toFixed(1)}%</span>
              </div>
            )}
            {facilitiesMetadata.washData.accessAvg && (
              <div>
                <strong style={{ color: 'var(--aidstack-navy)' }}>WASH Access:</strong>{' '}
                <span style={{ color: '#64748B' }}>{facilitiesMetadata.washData.accessAvg.toFixed(0)}%</span>
              </div>
            )}
            {facilitiesMetadata.healthFacilities > 0 && (
              <div>
                <strong style={{ color: 'var(--aidstack-navy)' }}>Health Sites:</strong>{' '}
                <span style={{ color: '#64748B' }}>{facilitiesMetadata.healthFacilities}</span>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '2px solid #E5E7EB',
          padding: '0 24px',
          background: '#F8FAFC',
        }}>
          {[
            {
              id: 'districts',
              label: 'District Outlook',
              icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>,
              count: predictions?.districtAnalysis?.districts?.length || 0
            },
            {
              id: 'weather',
              label: 'Weather Chart',
              icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v1m0 18v1M4.22 4.22l.707.707m14.142 14.142.707.707M2 12h1m18 0h1M4.22 19.78l.707-.707M18.364 5.636l.707-.707"></path><circle cx="12" cy="12" r="5"></circle></svg>,
              count: weatherData ? 14 : 0
            },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '14px 20px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === tab.id ? '3px solid var(--aidstack-orange)' : '3px solid transparent',
                color: activeTab === tab.id ? 'var(--aidstack-navy)' : 'var(--aidstack-slate-medium)',
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: "'Inter', sans-serif",
                transition: 'all 0.2s',
              }}
            >
              {tab.icon}
              {tab.label}
              {experimentalTabs.has(tab.id) && (
                <span style={{
                  ...experimentalBadgeStyle,
                  background: activeTab === tab.id ? '#FFF7ED' : '#F1F5F9',
                  color: '#C2410C',
                  border: '1px solid #FED7AA',
                }}>
                  Experimental
                </span>
              )}
              {tab.count > 0 && (
                <span style={{
                  background: 'var(--aidstack-orange)',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '2px 7px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
          background: 'white',
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--aidstack-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }}>
                <line x1="12" y1="2" x2="12" y2="6"></line>
                <line x1="12" y1="18" x2="12" y2="22"></line>
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                <line x1="2" y1="12" x2="6" y2="12"></line>
                <line x1="18" y1="12" x2="22" y2="12"></line>
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
              </svg>
              <p style={{ color: 'var(--aidstack-slate-medium)', fontSize: '16px', fontFamily: "'Inter', sans-serif" }}>Building district hazard scores and collecting auditable evidence...</p>
            </div>
          ) : loadError || !predictions ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <p role={loadError ? 'alert' : undefined} style={{ color: 'var(--aidstack-slate-medium)', fontFamily: "'Inter', sans-serif" }}>{loadError || 'Select admin areas to generate a forecast.'}</p>
            </div>
          ) : (
            <>
              {activeTab === 'districts' && <DistrictHazardAnalysisView data={predictions.districtAnalysis} getRiskColor={getRiskColor} />}
              {activeTab === 'weather' && <WeatherChartView data={weatherData} locationInfo={locationInfo} />}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '2px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#F8FAFC',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--aidstack-slate-medium)', fontFamily: "'Inter', sans-serif" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            {buildForecastFooterLabel(predictions?.districtAnalysis, analysisDistricts.length)}
          </div>
          <button
            onClick={loadPredictions}
            disabled={loading}
            style={{
              background: 'var(--aidstack-navy)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontFamily: "'Inter', sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <polyline points="23 20 23 14 17 14"></polyline>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
            </svg>
            Refresh Forecast
          </button>
        </div>

        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};

const DistrictHazardAnalysisView = ({ data, getRiskColor }) => {
  if (!data || !Array.isArray(data.districts) || data.districts.length === 0) {
    return <div>No district hazard analysis available</div>;
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {data.warnings?.length > 0 && (
        <div style={{
          marginBottom: '20px',
          padding: '14px 16px',
          background: '#FFF7ED',
          border: '1px solid #FED7AA',
          borderRadius: '10px',
          color: '#9A3412',
          fontSize: '13px',
          lineHeight: 1.6
        }}>
          {data.warnings.map((warning, index) => (
            <div key={index}>{warning}</div>
          ))}
        </div>
      )}

      <div style={{
        padding: '18px',
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: 'var(--aidstack-navy)', fontSize: '18px', fontWeight: 700 }}>
          How This Was Calculated
        </h3>
        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '10px' }}>
          {data.summary?.methodology?.map((item, index) => (
            <div key={index}>{item}</div>
          ))}
        </div>
        <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--aidstack-navy)' }}>Sources:</strong> {data.summary?.sources?.join(' | ')}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {data.districts.map((district) => {
          const decisionLabel = getDistrictDecisionLabel(district);
          const missingEvidence = getDistrictMissingEvidence(district);
          return (
            <div
              key={district.districtId}
              style={{
                padding: '18px',
                background: 'white',
                borderRadius: '12px',
                border: `2px solid ${getRiskColor(district.dominantHazard.level.toUpperCase())}`,
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '17px', color: 'var(--aidstack-navy)', fontWeight: 700 }}>
                    {district.districtName}
                  </h4>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                    {district.timeWindow}
                  </div>
                </div>
                <DecisionBadge label={decisionLabel} />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <RiskBar
                  value={typeof district.dominantHazard.score === 'number' ? district.dominantHazard.score : 0}
                  label="Current risk position"
                  sublabel={`${district.dominantHazard.type} ${district.dominantHazard.level}${typeof district.dominantHazard.score === 'number' ? ` • ${district.dominantHazard.score}/100` : ''}`}
                />
              </div>

              <div style={{ marginBottom: '14px', fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
                <div><strong>Decision:</strong> {decisionLabel}</div>
                <div style={{ marginTop: '6px' }}>
                  <strong>What to do now:</strong> {typeof district.dominantHazard.score === 'number'
                    ? `Use the current district signal, exposure, and evidence limits below to decide whether to monitor, prepare, or escalate.`
                    : 'Load the missing evidence called out below before using this district for escalation decisions.'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginBottom: '14px' }}>
                <MetricCard
                  label="Flood"
                  value={district.hazardAssessments?.flood?.status === 'ready' ? `${district.hazardScores.flood}/100` : 'Not ready'}
                  tone="#2563EB"
                  note={district.hazardAssessments?.flood?.status === 'ready' ? null : district.hazardAssessments?.flood?.message}
                />
                <MetricCard
                  label="Drought"
                  value={district.hazardAssessments?.drought?.status === 'ready' ? `${district.hazardScores.drought}/100` : 'Not ready'}
                  tone="#B45309"
                  note={district.hazardAssessments?.drought?.status === 'ready' ? null : district.hazardAssessments?.drought?.message}
                />
                <MetricCard
                  label="Access"
                  value={district.accessibilityAssessment?.status === 'ready'
                    ? `${district.accessibilityAssessment.summary?.meanTravelTimeMinutes || 0} min`
                    : 'Not ready'}
                  tone="#C2410C"
                  note={district.accessibilityAssessment?.status === 'ready'
                    ? `${district.accessibilityAssessment.summary?.hardToReachSharePct || 0}% of area >120 min`
                    : district.accessibilityAssessment?.message}
                />
                <MetricCard
                  label="Heat"
                  value={district.hazardAssessments?.heat?.status === 'ready' ? `${district.hazardScores.heat}/100` : 'Not ready'}
                  tone="#DC2626"
                  note={district.hazardAssessments?.heat?.status === 'ready' ? null : district.hazardAssessments?.heat?.message}
                />
                <MetricCard label="Response Scale" value={district.responseScale} tone="#0F766E" />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  What We Know
                </div>
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.7 }}>
                  <div>Population: {district.exposure.populationEstimate ? district.exposure.populationEstimate.toLocaleString() : 'Unknown'}</div>
                  <div>Sites in scope: {district.exposure.facilityCount}</div>
                  <div>GDACS signals in district: {district.exposure.disasterSignalCount}</div>
                  <div>ACLED events in district: {district.exposure.securitySignalCount}</div>
                  {district.weatherSummary && (
                    <div>Forecast rainfall: {district.weatherSummary.totalRainMm} mm total, peak {district.weatherSummary.maxDailyRainMm} mm/day</div>
                  )}
                </div>
              </div>

              {missingEvidence.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    What Is Missing
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.7 }}>
                    {missingEvidence.map((item, index) => (
                      <div key={index}>{item}</div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Why This District
                </div>
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
                  {district.rationale.map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Top Drivers
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {district.drivers.length === 0 ? (
                    <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#64748B' }}>
                      No scored hazard drivers yet. Enable the required evidence layers to generate auditable district drivers.
                    </div>
                  ) : district.drivers.slice(0, 4).map((driver) => (
                    <div key={driver.key} style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', marginBottom: '4px' }}>
                        <strong style={{ color: 'var(--aidstack-navy)' }}>{driver.label}</strong>
                        <span style={{ color: '#334155' }}>{driver.value}{driver.unit ? ` ${driver.unit}` : ''}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Weight {Math.round(driver.weight * 100)}% • Source: {driver.source}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ paddingTop: '12px', borderTop: '1px solid #E2E8F0', fontSize: '12px', color: '#64748B', lineHeight: 1.6 }}>
                <div><strong style={{ color: 'var(--aidstack-navy)' }}>Evidence Base:</strong> {district.evidenceBase || 'forecast-only'}</div>
                <div><strong style={{ color: 'var(--aidstack-navy)' }}>Confidence:</strong> {district.confidence}</div>
                {district.confidenceReasoning && (
                  <div><strong style={{ color: 'var(--aidstack-navy)' }}>Confidence Basis:</strong> {district.confidenceReasoning}</div>
                )}
                {district.responseScaleReasoning && (
                  <div><strong style={{ color: 'var(--aidstack-navy)' }}>Response Scale Basis:</strong> {district.responseScaleReasoning}</div>
                )}
                <div><strong style={{ color: 'var(--aidstack-navy)' }}>Sources used:</strong> {district.sources.join(' | ')}</div>
                {district.limitations.map((item, index) => (
                  <div key={index}><strong style={{ color: 'var(--aidstack-navy)' }}>Limitation:</strong> {item}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, tone, note = null }) => (
  <div style={{ padding: '10px 12px', borderRadius: '10px', background: `${tone}12`, border: `1px solid ${tone}25` }}>
    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </div>
    <div style={{ fontSize: '18px', color: tone, fontWeight: 700 }}>
      {value}
    </div>
    {note && (
      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px', lineHeight: 1.4 }}>
        {note}
      </div>
    )}
  </div>
);

// Disaster Forecast View Component
const DisasterForecastView = ({ data, getRiskColor }) => {
  if (!data || !data.summary) return <div>No forecast data available</div>;

  const { summary, flood, drought, cyclone, heatwave } = data;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Overall Summary */}
      <div style={{
        padding: '20px',
        background: `${getRiskColor(summary.overallRisk)}15`,
        border: `2px solid ${getRiskColor(summary.overallRisk)}`,
        borderRadius: '8px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={getRiskColor(summary.overallRisk)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: getRiskColor(summary.overallRisk) }}>
            Overall Risk: {summary.overallRisk}
          </h3>
        </div>

        {summary.primaryThreats && summary.primaryThreats.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <strong style={{ fontSize: '13px', color: 'var(--aidstack-navy)' }}>Primary Threats:</strong>
            {summary.primaryThreats.map((threat, idx) => (
              <div key={idx} style={{
                marginTop: '8px',
                padding: '10px',
                background: 'white',
                borderRadius: '6px',
                border: '1px solid #E5E7EB',
              }}>
                <span style={{ fontWeight: 600, color: getRiskColor(threat.level) }}>{threat.type}</span>
                <span style={{ marginLeft: '8px', color: '#64748B' }}>({threat.probability}% probability)</span>
              </div>
            ))}
          </div>
        )}

        {summary.recommendedActions && summary.recommendedActions.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <strong style={{ fontSize: '13px', color: 'var(--aidstack-navy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              Recommended Actions:
            </strong>
            <ul style={{ marginTop: '8px', paddingLeft: '24px', color: '#334155' }}>
              {summary.recommendedActions.map((action, idx) => (
                <li key={idx} style={{ marginBottom: '6px', fontSize: '14px' }}>{action}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Individual Risk Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {flood && <RiskCard title="Flood Risk" data={flood} getRiskColor={getRiskColor} icon="droplet" />}
        {drought && <RiskCard title="Drought Risk" data={drought} getRiskColor={getRiskColor} icon="sun" />}
        {cyclone && <RiskCard title="Cyclone Risk" data={cyclone} getRiskColor={getRiskColor} icon="wind" />}
        {heatwave && <RiskCard title="Heatwave Risk" data={heatwave} getRiskColor={getRiskColor} icon="thermometer" />}
      </div>
    </div>
  );
};

// Outbreak Prediction View Component
const OutbreakPredictionView = ({ data, getRiskColor, metadata }) => {
  if (!data || !data.predictions) return <div>No outbreak prediction data available</div>;

  const { predictions, topThreats, aiAnalysis } = data;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* AI Analysis (if available) */}
      {aiAnalysis && (
        <div style={{
          padding: '16px',
          background: '#F0F9FF',
          border: '1px solid #BFDBFE',
          borderRadius: '8px',
          marginBottom: '24px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: '#334155',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--aidstack-navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            </svg>
            <strong style={{ color: 'var(--aidstack-navy)' }}>AI Analysis</strong>
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{aiAnalysis}</div>
        </div>
      )}

      {/* Top Threats */}
      {topThreats && topThreats.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--aidstack-navy)', marginBottom: '12px' }}>
            Top Disease Threats
          </h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {topThreats.map((threat, idx) => (
              <div key={idx} style={{
                padding: '12px 16px',
                background: `${getRiskColor(threat.level)}15`,
                border: `2px solid ${getRiskColor(threat.level)}`,
                borderRadius: '8px',
                flex: '1 1 200px',
              }}>
                <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '4px' }}>#{idx + 1} Threat</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: getRiskColor(threat.level), textTransform: 'capitalize' }}>
                  {threat.disease}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                  Heuristic score: {threat.riskScore}/100
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disease Predictions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {Object.entries(predictions).map(([disease, data]) => (
          <div key={disease} style={{
            padding: '16px',
            background: 'white',
            border: `2px solid ${getRiskColor(data.risk)}`,
            borderRadius: '8px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--aidstack-navy)' }}>
                {data.disease}
              </h4>
              <span style={{
                padding: '4px 10px',
                background: getRiskColor(data.risk),
                color: 'white',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
              }}>
                {data.risk}
              </span>
            </div>

            <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '12px' }}>
              <strong style={{ color: 'var(--aidstack-navy)' }}>Heuristic score:</strong> {data.riskScore}/100. Unvalidated; not an outbreak probability.
            </div>

            {data.peakDay && (
              <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '12px' }}>
                <strong style={{ color: 'var(--aidstack-navy)' }}>Peak Day:</strong> Day {data.peakDay}
              </div>
            )}

            {data.casePredictions && data.casePredictions.length > 0 && (
              <div style={{ marginTop: '12px', fontSize: '12px' }}>
                <strong style={{ color: 'var(--aidstack-navy)' }}>Case Projections:</strong>
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {data.casePredictions.slice(0, 3).map((prediction, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      background: '#F8FAFC',
                      borderRadius: '4px',
                    }}>
                      <span style={{ color: '#64748B' }}>Day {prediction.day}</span>
                      <span style={{ fontWeight: 600, color: 'var(--aidstack-navy)' }}>
                        ~{Math.round(prediction.cases)} cases
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Metadata-based insights */}
      {metadata && (
        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: '#FEF3C7',
          border: '1px solid #FCD34D',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#78350F',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <strong>Site Data Incorporated</strong>
          </div>
          <div>
            Analysis includes {metadata.totalPopulation > 0 && `population data (${metadata.totalPopulation.toLocaleString()}), `}
            {metadata.diseaseData.malariaAvg && `malaria prevalence (${metadata.diseaseData.malariaAvg.toFixed(1)}%), `}
            {metadata.washData.accessAvg && `WASH access (${metadata.washData.accessAvg.toFixed(0)}%), `}
            and {metadata.healthFacilities} health sites from your uploaded data.
          </div>
        </div>
      )}
    </div>
  );
};

// Weather Chart View Component
const WeatherChartView = ({ data, locationInfo }) => {
  if (!data || !data.daily) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', fontFamily: "'Inter', sans-serif" }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--aidstack-slate-medium)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px' }}>
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
        </svg>
        <p style={{ color: 'var(--aidstack-slate-medium)' }}>No weather data available</p>
      </div>
    );
  }

  const { daily } = data;
  const maxTemp = Math.max(...daily.temperature_2m_max);
  const minTemp = Math.min(...daily.temperature_2m_min);
  const maxRain = Math.max(...daily.precipitation_sum);
  const totalRain = daily.precipitation_sum.reduce((a, b) => a + b, 0);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '16px', background: '#FEF3C7', borderRadius: '8px', border: '1px solid #FCD34D' }}>
          <div style={{ fontSize: '12px', color: '#78350F', marginBottom: '4px', fontWeight: 600 }}>Max Temperature</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#D97706' }}>{maxTemp.toFixed(1)}°C</div>
        </div>
        <div style={{ padding: '16px', background: '#DBEAFE', borderRadius: '8px', border: '1px solid #93C5FD' }}>
          <div style={{ fontSize: '12px', color: '#1E40AF', marginBottom: '4px', fontWeight: 600 }}>Min Temperature</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#2563EB' }}>{minTemp.toFixed(1)}°C</div>
        </div>
        <div style={{ padding: '16px', background: '#DBEAFE', borderRadius: '8px', border: '1px solid #60A5FA' }}>
          <div style={{ fontSize: '12px', color: '#1E3A8A', marginBottom: '4px', fontWeight: 600 }}>Total Rainfall</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#1D4ED8' }}>{totalRain.toFixed(0)} mm</div>
        </div>
        <div style={{ padding: '16px', background: '#E0E7FF', borderRadius: '8px', border: '1px solid #A5B4FC' }}>
          <div style={{ fontSize: '12px', color: '#3730A3', marginBottom: '4px', fontWeight: 600 }}>Peak Daily Rain</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#4F46E5' }}>{maxRain.toFixed(0)} mm</div>
        </div>
      </div>

      {/* Temperature Chart */}
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--aidstack-navy)', marginBottom: '12px' }}>
          14-Day Temperature Forecast
        </h3>
        <div style={{ background: 'linear-gradient(to bottom, #F8FAFC 0%, #FFFFFF 100%)', padding: '24px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {/* Chart Container */}
          <div style={{ position: 'relative', height: '240px', marginBottom: '20px' }}>
            {/* Temperature scale on left */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
              <div>{Math.ceil(maxTemp)}°C</div>
              <div>{Math.ceil((maxTemp + minTemp) / 2)}°C</div>
              <div>{Math.floor(minTemp)}°C</div>
            </div>

            {/* Chart area */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100%', paddingLeft: '40px', paddingRight: '20px', paddingBottom: '40px' }}>
              {daily.temperature_2m_max.map((tempMax, idx) => {
                const tempMin = daily.temperature_2m_min[idx];
                const tempRange = maxTemp - minTemp;

                // Calculate positions (bottom to top)
                const maxTempPos = tempRange > 0 ? ((tempMax - minTemp) / tempRange) * 180 : 90;
                const minTempPos = tempRange > 0 ? ((tempMin - minTemp) / tempRange) * 180 : 90;
                const tempBarHeight = Math.abs(maxTempPos - minTempPos);

                // Color based on temperature
                const avgTemp = (tempMax + tempMin) / 2;
                const tempGradient = avgTemp > 30
                  ? 'linear-gradient(180deg, #F59E0B 0%, #D97706 100%)'
                  : avgTemp > 20
                  ? 'linear-gradient(180deg, #10B981 0%, #059669 100%)'
                  : 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)';

                return (
                  <div key={idx} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px' }}>
                    {/* Max temperature label */}
                    <div style={{
                      position: 'absolute',
                      bottom: `${maxTempPos + 8}px`,
                      fontSize: '11px',
                      fontWeight: 700,
                      color: avgTemp > 30 ? '#D97706' : avgTemp > 20 ? '#059669' : '#3B82F6',
                      textShadow: '0 0 3px white, 0 0 3px white'
                    }}>
                      {Math.round(tempMax)}°
                    </div>

                    {/* Temperature range bar (candlestick) */}
                    <div style={{
                      position: 'absolute',
                      bottom: `${minTempPos}px`,
                      width: '18px',
                      height: `${Math.max(tempBarHeight, 2)}px`,
                      background: tempGradient,
                      borderRadius: '10px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      border: '2px solid white'
                    }}
                    title={`High: ${tempMax.toFixed(1)}°C, Low: ${tempMin.toFixed(1)}°C`}
                    ></div>

                    {/* Min temperature label */}
                    <div style={{
                      position: 'absolute',
                      bottom: `${minTempPos - 16}px`,
                      fontSize: '11px',
                      fontWeight: 600,
                      color: avgTemp > 30 ? '#D97706' : avgTemp > 20 ? '#059669' : '#3B82F6',
                      opacity: 0.7,
                      textShadow: '0 0 3px white, 0 0 3px white'
                    }}>
                      {Math.round(tempMin)}°
                    </div>

                    {/* Date label */}
                    <div style={{
                      position: 'absolute',
                      bottom: '-32px',
                      left: '50%',
                      fontSize: '9px',
                      color: '#64748B',
                      fontWeight: 500,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      transform: 'translateX(-50%) rotate(-45deg)',
                      transformOrigin: 'center center'
                    }}>
                      {new Date(daily.time[idx]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', fontSize: '12px', color: '#64748B', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '18px', height: '18px', background: 'linear-gradient(180deg, #F59E0B 0%, #D97706 100%)', borderRadius: '10px', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}></div>
              <span style={{ fontWeight: 500 }}>Hot (&gt;30°C)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '18px', height: '18px', background: 'linear-gradient(180deg, #10B981 0%, #059669 100%)', borderRadius: '10px', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}></div>
              <span style={{ fontWeight: 500 }}>Warm (20-30°C)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '18px', height: '18px', background: 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)', borderRadius: '10px', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}></div>
              <span style={{ fontWeight: 500 }}>Cool (&lt;20°C)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rainfall Chart */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--aidstack-navy)', marginBottom: '12px' }}>
          14-Day Rainfall Forecast
        </h3>
        <div style={{ background: 'linear-gradient(to bottom, #EFF6FF 0%, #FFFFFF 100%)', padding: '24px', borderRadius: '12px', border: '1px solid #BFDBFE', boxShadow: '0 1px 3px rgba(59,130,246,0.05)' }}>
          {/* Chart Container */}
          <div style={{ position: 'relative', height: '120px', marginBottom: '16px' }}>
            {/* Rainfall scale on left */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 30, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '10px', color: '#3B82F6', fontWeight: 500 }}>
              <div>{Math.ceil(maxRain)} mm</div>
              <div>{Math.ceil(maxRain / 2)} mm</div>
              <div>0 mm</div>
            </div>

            {/* Chart area */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100%', paddingLeft: '40px', paddingRight: '20px', paddingBottom: '30px' }}>
              {daily.precipitation_sum.map((rain, idx) => {
                const rainHeight = maxRain > 0 ? (rain / maxRain) * 80 : 0;

                return (
                  <div key={idx} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px' }}>
                    {/* Rainfall bar */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      width: '100%',
                      height: `${rainHeight}px`,
                      background: rain > 50 ? 'linear-gradient(180deg, #2563EB 0%, #1E40AF 100%)' : 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)',
                      borderRadius: '4px 4px 0 0',
                      boxShadow: rain > 0 ? '0 2px 4px rgba(59, 130, 246, 0.2)' : 'none',
                      transition: 'all 0.3s'
                    }}
                    title={`${rain.toFixed(1)}mm`}
                    ></div>

                    {/* Rainfall amount label (if > 0) */}
                    {rain > 0 && (
                      <div style={{
                        position: 'absolute',
                        bottom: `${rainHeight + 2}px`,
                        fontSize: '8px',
                        fontWeight: 700,
                        color: '#1E40AF',
                        background: 'rgba(255,255,255,0.95)',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        border: '1px solid #BFDBFE'
                      }}>
                        {rain.toFixed(0)}
                      </div>
                    )}

                    {/* Date label */}
                    <div style={{
                      position: 'absolute',
                      bottom: '-24px',
                      left: '50%',
                      fontSize: '9px',
                      color: '#64748B',
                      fontWeight: 500,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      transform: 'translateX(-50%) rotate(-45deg)',
                      transformOrigin: 'center center'
                    }}>
                      {new Date(daily.time[idx]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '11px', color: '#64748B', paddingTop: '12px', borderTop: '1px solid #BFDBFE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '14px', height: '14px', background: 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)', borderRadius: '3px' }}></div>
              <span style={{ fontWeight: 500 }}>Light Rain (&lt;50mm)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '14px', height: '14px', background: 'linear-gradient(180deg, #2563EB 0%, #1E40AF 100%)', borderRadius: '3px' }}></div>
              <span style={{ fontWeight: 500 }}>Heavy Rain (&gt;50mm)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Details Table */}
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--aidstack-navy)', marginBottom: '12px' }}>
          Daily Weather Details
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, color: 'var(--aidstack-navy)' }}>Date</th>
                <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--aidstack-navy)' }}>Max Temp</th>
                <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--aidstack-navy)' }}>Min Temp</th>
                <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--aidstack-navy)' }}>Rainfall</th>
                {daily.windspeed_10m_max && <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--aidstack-navy)' }}>Wind</th>}
              </tr>
            </thead>
            <tbody>
              {daily.time.map((date, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                  <td style={{ padding: '10px', color: '#334155' }}>
                    {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#D97706', fontWeight: 600 }}>
                    {daily.temperature_2m_max[idx].toFixed(1)}°C
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#2563EB', fontWeight: 600 }}>
                    {daily.temperature_2m_min[idx].toFixed(1)}°C
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: daily.precipitation_sum[idx] > 50 ? '#DC2626' : '#1D4ED8', fontWeight: 600 }}>
                    {daily.precipitation_sum[idx].toFixed(1)} mm
                  </td>
                  {daily.windspeed_10m_max && (
                    <td style={{ padding: '10px', textAlign: 'right', color: '#64748B' }}>
                      {daily.windspeed_10m_max[idx].toFixed(0)} km/h
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ACLED Events Notice (if in district mode) */}
      {locationInfo?.isDistrictMode && locationInfo?.acledEventCount > 0 && (
        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: '#FEF3C7',
          border: '1px solid #FCD34D',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#78350F',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <strong>Security Context</strong>
          </div>
          <div>
            {locationInfo.acledEventCount} security event{locationInfo.acledEventCount !== 1 ? 's' : ''} (ACLED data) detected in this district.
            Weather conditions may impact security operations and humanitarian access.
          </div>
        </div>
      )}
    </div>
  );
};

// Supply Chain View Component
const SupplyChainView = ({ data, getRiskColor }) => {
  if (!data || !data.overallAssessment) return <div>No supply chain data available</div>;

  const { coldChain, roadAccess, airTransport, overallAssessment } = data;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Overall Assessment */}
      <div style={{
        padding: '20px',
        background: `${getRiskColor(overallAssessment.overallRisk)}15`,
        border: `2px solid ${getRiskColor(overallAssessment.overallRisk)}`,
        borderRadius: '8px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={getRiskColor(overallAssessment.overallRisk)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5"></circle>
            <circle cx="18.5" cy="18.5" r="2.5"></circle>
          </svg>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: getRiskColor(overallAssessment.overallRisk) }}>
            Overall Supply Chain Risk: {overallAssessment.overallRisk}
          </h3>
        </div>

        {overallAssessment.criticalComponents && overallAssessment.criticalComponents.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <strong style={{ fontSize: '13px', color: 'var(--aidstack-navy)' }}>Critical Components:</strong>
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {overallAssessment.criticalComponents.map((component, idx) => (
                <span key={idx} style={{
                  padding: '6px 12px',
                  background: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--aidstack-navy)',
                }}>
                  {component}
                </span>
              ))}
            </div>
          </div>
        )}

        {overallAssessment.recommendations && overallAssessment.recommendations.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <strong style={{ fontSize: '13px', color: 'var(--aidstack-navy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
              Urgent Actions:
            </strong>
            <ul style={{ marginTop: '8px', paddingLeft: '24px', color: '#334155' }}>
              {overallAssessment.recommendations.map((action, idx) => (
                <li key={idx} style={{ marginBottom: '6px', fontSize: '14px' }}>{action}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Individual Supply Chain Components */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {coldChain && <SupplyChainCard title="Cold Chain" data={coldChain} getRiskColor={getRiskColor} icon="thermometer" />}
        {roadAccess && <SupplyChainCard title="Road Access" data={roadAccess} getRiskColor={getRiskColor} icon="truck" />}
        {airTransport && <SupplyChainCard title="Air Transport" data={airTransport} getRiskColor={getRiskColor} icon="plane" />}
      </div>
    </div>
  );
};

// Risk Card Component (for disaster forecast)
const RiskCard = ({ title, data, getRiskColor, icon }) => {
  const getIcon = () => {
    switch (icon) {
      case 'droplet':
        return <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>;
      case 'sun':
        return <><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></>;
      case 'wind':
        return <><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path></>;
      case 'thermometer':
        return <><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></>;
      default:
        return null;
    }
  };

  return (
    <div style={{
      padding: '16px',
      background: 'white',
      border: `2px solid ${getRiskColor(data.riskLevel)}`,
      borderRadius: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={getRiskColor(data.riskLevel)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {getIcon()}
          </svg>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--aidstack-navy)' }}>{title}</h4>
        </div>
        <span style={{
          padding: '4px 10px',
          background: getRiskColor(data.riskLevel),
          color: 'white',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 700,
        }}>
          {data.riskLevel}
        </span>
      </div>

      {data.probability !== undefined && (
        <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
          <strong style={{ color: 'var(--aidstack-navy)' }}>Probability:</strong> {data.probability}%
        </div>
      )}

      {Object.entries(data).map(([key, value]) => {
        if (key === 'riskLevel' || key === 'probability' || key === 'recommendations' || key === 'threats') return null;
        return (
          <div key={key} style={{ fontSize: '13px', color: '#64748B', marginBottom: '6px' }}>
            <strong style={{ color: 'var(--aidstack-navy)', textTransform: 'capitalize' }}>
              {key.replace(/([A-Z])/g, ' $1').trim()}:
            </strong> {typeof value === 'number' ? value : String(value)}
          </div>
        );
      })}
    </div>
  );
};

// Supply Chain Card Component
const SupplyChainCard = ({ title, data, getRiskColor, icon }) => {
  const getIcon = () => {
    switch (icon) {
      case 'thermometer':
        return <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>;
      case 'truck':
        return <><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></>;
      case 'plane':
        return <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"></path>;
      default:
        return null;
    }
  };

  return (
    <div style={{
      padding: '16px',
      background: 'white',
      border: `2px solid ${getRiskColor(data.riskLevel)}`,
      borderRadius: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={getRiskColor(data.riskLevel)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {getIcon()}
          </svg>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--aidstack-navy)' }}>{title}</h4>
        </div>
        <span style={{
          padding: '4px 10px',
          background: getRiskColor(data.riskLevel),
          color: 'white',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 700,
        }}>
          {data.riskLevel}
        </span>
      </div>

      {data.probability !== undefined && (
        <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
          <strong style={{ color: 'var(--aidstack-navy)' }}>Disruption Probability:</strong> {data.probability}%
        </div>
      )}

      {data.estimatedDurationDays && (
        <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
          <strong style={{ color: 'var(--aidstack-navy)' }}>Estimated Duration:</strong> {data.estimatedDurationDays} days
        </div>
      )}

      {data.estimatedRecoveryDays && (
        <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
          <strong style={{ color: 'var(--aidstack-navy)' }}>Recovery Time:</strong> {data.estimatedRecoveryDays} days
        </div>
      )}

      {data.threats && data.threats.length > 0 && (
        <div style={{ marginTop: '12px', fontSize: '12px' }}>
          <strong style={{ color: 'var(--aidstack-navy)' }}>Threats Identified:</strong>
          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {data.threats.map((threat, idx) => (
              <div key={idx} style={{
                padding: '6px 8px',
                background: '#F8FAFC',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#64748B',
              }}>
                {threat.source} ({threat.probability || 0}%)
              </div>
            ))}
          </div>
        </div>
      )}

      {data.recommendations && data.recommendations.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <strong style={{ fontSize: '12px', color: 'var(--aidstack-navy)' }}>Actions:</strong>
          <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '12px', color: '#334155' }}>
            {data.recommendations.slice(0, 3).map((rec, idx) => (
              <li key={idx} style={{ marginBottom: '4px' }}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PredictionDashboard;
