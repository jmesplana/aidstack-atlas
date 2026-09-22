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

import Papa from 'papaparse';
import { getDistance, isPointInPolygon, getAreaOfPolygon } from 'geolib';
import { convertPolygonFormat, toNumber } from './geo/coordinates.js';
import { isPointInGeometry } from './geo/geometry.js';

export function normalizeImpactFacilities(facilities) {
  if (typeof facilities === 'string') {
    const parsedCsv = Papa.parse(facilities, {
      header: true,
      skipEmptyLines: true
    });

    return parsedCsv.data.map((row) => {
      const facility = {
        name: row.name,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude)
      };

      Object.keys(row).forEach((key) => {
        if (key !== 'name' && key !== 'latitude' && key !== 'longitude' && row[key]) {
          facility[key] = row[key];
        }
      });

      return facility;
    });
  }

  if (Array.isArray(facilities)) {
    return facilities;
  }

  return [];
}

export function runImpactAssessment({
  facilities,
  disasters,
  acledEvents = [],
  worldPopData = {},
  districts = []
}, options = {}) {
  const facilityData = normalizeImpactFacilities(facilities);

  if ((!disasters || disasters.length === 0) && (!acledEvents || acledEvents.length === 0)) {
    return {
      impactedFacilities: [],
      statistics: {
        totalDisasters: 0,
        totalFacilities: facilityData.length,
        impactedFacilityCount: 0,
        percentageImpacted: 0,
        disasterStats: [],
        overlappingImpacts: [],
        affectedDistricts: 0,
        estimatedAffectedPopulation: null
      }
    };
  }

  return assessImpact(facilityData, disasters || [], acledEvents || [], worldPopData, districts, options);
}

export function assessImpact(facilities, disasters, acledEvents, worldPopData = {}, districts = [], options = {}) {
  console.time('Impact assessment total');
  const impacted = [];
  const disasterStats = {};
  const overlappingDisasters = {};
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const progressInterval = Math.max(1, Number(options.progressInterval || 100));

  const findFacilityDistrict = (facility) => {
    if (!districts || districts.length === 0) return null;

    const facilityPoint = [facility.longitude, facility.latitude];

    for (const district of districts) {
      try {
        const districtFeature = district.type === 'Feature' ? district
          : district.geometry ? { type: 'Feature', geometry: district.geometry } : null;

        if (!districtFeature) continue;

        if (isPointInGeometry(facilityPoint, districtFeature.geometry)) {
          const props = district.properties || {};
          return {
            name: props.ADM2_EN || props.NAME || props.name || props.district || 'Unknown',
            population: props.population || props.POP || null
          };
        }
      } catch (_) {
        continue;
      }
    }
    return null;
  };

  const acledThreats = acledEvents.map((event) => ({
    eventType: event.event_type || 'Security Event',
    eventName: event.event_type || 'ACLED Event',
    title: `${event.event_type} - ${event.sub_event_type}`,
    latitude: toNumber(event.latitude),
    longitude: toNumber(event.longitude),
    alertLevel: 'Orange',
    severity: 'Moderate',
    source: 'ACLED',
    event_date: event.event_date,
    fatalities: event.fatalities || 0,
    notes: event.notes
  }));

  const allThreats = [...disasters, ...acledThreats];

  console.log(`Starting assessment: ${facilities.length} facilities vs ${disasters.length} GDACS disasters + ${acledEvents.length} ACLED events = ${allThreats.length} total threats`);

  console.time('Pre-process threats');
  for (const threat of allThreats) {
    const lat = toNumber(threat.latitude);
    const lng = toNumber(threat.longitude);

    if (lat === null || lng === null) continue;

    const threatId = threat.eventName || threat.title || `${threat.eventType}-${threat.latitude}-${threat.longitude}`;
    disasterStats[threatId] = {
      type: threat.eventType,
      alertLevel: threat.alertLevel || 'Unknown',
      name: threat.eventName || threat.title || 'Unnamed',
      affectedFacilities: 0,
      impactArea: calculateImpactArea(threat),
      severity: threat.severity || threat.alertLevel || 'Unknown',
      polygon: hasValidPolygon(threat),
      source: threat.source || 'GDACS'
    };
  }
  console.timeEnd('Pre-process threats');

  console.time('Process facilities');

  const threatData = allThreats.map((threat) => {
    const lat = toNumber(threat.latitude);
    const lng = toNumber(threat.longitude);

    if (lat === null || lng === null) return null;

    const impactRadius = getImpactRadius(threat);
    const longitudeScale = Math.cos(lat * Math.PI / 180);
    const lngDelta = Math.abs(longitudeScale) < Number.EPSILON
      ? 180
      : impactRadius / (111 * longitudeScale);

    return {
      disaster: threat,
      lat,
      lng,
      radius: impactRadius,
      minLat: lat - (impactRadius / 111),
      maxLat: lat + (impactRadius / 111),
      minLng: lng - lngDelta,
      maxLng: lng + lngDelta,
      disasterId: threat.eventName || threat.title || `${threat.eventType}-${threat.latitude}-${threat.longitude}`
    };
  }).filter(Boolean);

  for (let facilityIndex = 0; facilityIndex < facilities.length; facilityIndex += 1) {
    const facility = facilities[facilityIndex];
    if (onProgress && (facilityIndex === 0 || facilityIndex % progressInterval === 0)) {
      onProgress({
        phase: 'processing',
        processedFacilities: facilityIndex,
        totalFacilities: facilities.length,
        impactedFacilities: impacted.length
      });
    }

    const facilityLat = toNumber(facility.latitude);
    const facilityLng = toNumber(facility.longitude);

    if (facilityLat === null || facilityLng === null) continue;

    const facilityPos = { latitude: facilityLat, longitude: facilityLng };

    const facilityImpacts = [];
    const impactingDisasters = [];

    for (const threatInfo of threatData) {
      const { disaster, lat, lng, radius, minLat, maxLat, minLng, maxLng, disasterId } = threatInfo;

      if (facilityLat < minLat || facilityLat > maxLat || facilityLng < minLng || facilityLng > maxLng) {
        continue;
      }

      const disasterPos = { latitude: lat, longitude: lng };

      let isImpacted = false;
      let impactMethod = null;
      let confidence = 'low';
      let distance = getDistance(facilityPos, disasterPos) / 1000;

      if (hasValidPolygon(disaster)) {
        const polygon = convertPolygonFormat(disaster.polygon);
        if (isPointInPolygon(facilityPos, polygon)) {
          isImpacted = true;
          impactMethod = 'confirmed_polygon';
          confidence = 'high';
          distance = 0;
        } else if (distance <= radius) {
          isImpacted = true;
          impactMethod = 'proximity_buffer';
          confidence = 'low';
        }
      } else if (distance <= radius) {
        isImpacted = true;
        impactMethod = 'screening_radius';
        confidence = 'low';
      }

      if (isImpacted) {
        facilityImpacts.push({
          disaster,
          distance: Math.round(distance * 100) / 100,
          impactMethod,
          confidence
        });

        impactingDisasters.push(disasterId);

        if (disasterStats[disasterId]) {
          disasterStats[disasterId].affectedFacilities++;
        }
      }
    }

    if (impactingDisasters.length > 1) {
      for (let i = 0; i < impactingDisasters.length; i++) {
        for (let j = i + 1; j < impactingDisasters.length; j++) {
          const overlapKey = [impactingDisasters[i], impactingDisasters[j]].sort().join('__');

          if (!overlappingDisasters[overlapKey]) {
            overlappingDisasters[overlapKey] = {
              disasters: [impactingDisasters[i], impactingDisasters[j]],
              facilities: []
            };
          }

          overlappingDisasters[overlapKey].facilities.push(facility.name);
        }
      }
    }

    if (facilityImpacts.length > 0) {
      const districtInfo = findFacilityDistrict(facility);
      const enrichedFacility = { ...facility };

      if (districtInfo) {
        enrichedFacility.district = districtInfo.name;
        enrichedFacility.districtPopulation = districtInfo.population;
      }

      if (districtInfo && worldPopData[districtInfo.name]) {
        enrichedFacility.populationData = worldPopData[districtInfo.name];
      }

      impacted.push({
        facility: enrichedFacility,
        impacts: facilityImpacts
      });
    }
  }
  if (onProgress) {
    onProgress({
      phase: 'processing',
      processedFacilities: facilities.length,
      totalFacilities: facilities.length,
      impactedFacilities: impacted.length
    });
  }
  console.timeEnd('Process facilities');

  console.time('Compile statistics');

  let totalAffectedPopulation = 0;
  const affectedDistricts = new Set();

  impacted.forEach((item) => {
    if (item.facility.districtPopulation) {
      affectedDistricts.add(item.facility.district);
    }
  });

  affectedDistricts.forEach((districtName) => {
    const districtData = districts.find((d) => {
      const props = d.properties || {};
      const name = props.ADM2_EN || props.NAME || props.name || props.district;
      return name === districtName;
    });
    if (districtData && districtData.properties) {
      const pop = districtData.properties.population || districtData.properties.POP || 0;
      totalAffectedPopulation += pop;
    }
  });

  const statistics = {
    totalDisasters: disasters.length,
    totalFacilities: facilities.length,
    impactedFacilityCount: impacted.length,
    percentageImpacted: facilities.length ? Math.round((impacted.length / facilities.length) * 100) : 0,
    disasterStats: Object.values(disasterStats).filter((stat) => stat.affectedFacilities > 0),
    overlappingImpacts: Object.values(overlappingDisasters),
    affectedDistricts: affectedDistricts.size,
    estimatedAffectedPopulation: totalAffectedPopulation > 0 ? totalAffectedPopulation : null
  };
  console.timeEnd('Compile statistics');
  console.timeEnd('Impact assessment total');

  console.log(`Assessment complete: ${impacted.length} impacted facilities found`);

  return {
    impactedFacilities: impacted,
    statistics
  };
}

function hasValidPolygon(disaster) {
  return disaster.polygon &&
    Array.isArray(disaster.polygon) &&
    disaster.polygon.length > 2;
}

function calculateImpactArea(disaster) {
  if (hasValidPolygon(disaster)) {
    try {
      const polygon = convertPolygonFormat(disaster.polygon);
      return Math.round(getAreaOfPolygon(polygon) / 1000000);
    } catch (e) {
      console.error('Error calculating area:', e);
    }
  }

  const radius = getImpactRadius(disaster);
  return Math.round(Math.PI * radius * radius);
}

function getImpactRadius(disaster) {
  let impactRadius = 0;

  if (disaster.source === 'ACLED') {
    const eventType = disaster.eventType?.toLowerCase() || '';
    const fatalities = disaster.fatalities || 0;

    if (eventType.includes('battle') || eventType.includes('violence against civilians')) {
      impactRadius = 20;
    } else if (eventType.includes('explosion')) {
      impactRadius = 30;
    } else if (eventType.includes('strategic development') || eventType.includes('protest')) {
      impactRadius = 10;
    } else {
      impactRadius = 15;
    }

    if (fatalities > 50) {
      impactRadius += 20;
    } else if (fatalities > 10) {
      impactRadius += 10;
    }

    return impactRadius;
  }

  if (disaster.eventType?.toLowerCase() === 'eq') {
    let magnitude = 6.0;
    const title = disaster.title?.toLowerCase() || '';
    if (title.includes('m=')) {
      try {
        const magMatch = title.match(/m=([0-9.]+)/);
        if (magMatch && magMatch[1]) {
          magnitude = parseFloat(magMatch[1]);
        }
      } catch (_) {}
    }

    impactRadius = magnitude * 50;
  } else if (disaster.eventType?.toLowerCase() === 'tc') {
    impactRadius = 300;
  } else if (disaster.eventType?.toLowerCase() === 'fl') {
    impactRadius = 100;
  } else if (disaster.eventType?.toLowerCase() === 'vo') {
    impactRadius = 100;
  } else if (disaster.eventType?.toLowerCase() === 'dr') {
    impactRadius = 500;
  } else {
    impactRadius = 100;
  }

  return impactRadius;
}
