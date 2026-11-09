import booleanIntersects from '@turf/boolean-intersects';
import { fingerprint, geographyKey } from './geography.js';

export const AREA_ACCESS_METHOD = 'area-planning-v1';
const normalized = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const numeric = (value) => value == null || String(value).trim() === '' ? null : Number(String(value).replace(/,/g, ''));
const nonnegative = (value) => Number.isFinite(value) && value >= 0 ? value : null;

export function resolveListAreas(rows, mapping, overrides, districts, selectedIds, kind = 'targets') {
  const index = new Map();
  for (const d of districts) {
    const values = [d.id, d.name, d.areaCode, ...Object.entries(d.properties || {}).filter(([k]) => /^(?:ADM\d_(?:PCODE|NAME|EN)|NAME_\d|PCODE|GID_\d|name)$/i.test(k)).map(([, v]) => v)];
    for (const key of new Set(values.map(normalized).filter(Boolean))) index.set(key, [...(index.get(key) || []), String(d.id)]);
  }
  return rows.map((raw, i) => {
    const id = String(i), place = String(raw[mapping.place] ?? '').trim();
    const areaLabel = String(raw[mapping.area] ?? place).trim();
    const matches = [...new Set(index.get(normalized(areaLabel)) || [])];
    const manual = overrides?.[id];
    const resolvedId = manual !== undefined ? manual : matches.length === 1 ? matches[0] : null;
    const validId = districts.some((d) => String(d.id) === resolvedId);
    const status = manual === '' ? 'excluded' : validId ? selectedIds.includes(resolvedId) ? 'matched' : 'outside-scope' : matches.length > 1 ? 'ambiguous' : 'unmatched';
    const count = mapping.target ? numeric(raw[mapping.target]) : null;
    const invalidTarget = mapping.target && raw[mapping.target] != null && String(raw[mapping.target]).trim() !== '' && (!Number.isSafeInteger(count) || count < 0);
    return { id, place: place || `Row ${i + 2}`, areaLabel, areaId: validId ? resolvedId : null, status,
      matchMethod: manual !== undefined ? 'manual' : matches.length === 1 ? 'exact-name-or-code' : 'unresolved',
      target: kind === 'targets' && !invalidTarget ? count : null,
      feedback: kind === 'feedback' ? String(raw[mapping.feedback] ?? '').trim() : '',
      issues: [...(!place ? ['Missing place name'] : []), ...(invalidTarget ? ['Invalid target count'] : []), ...(kind === 'feedback' && !String(raw[mapping.feedback] ?? '').trim() ? ['Missing feedback text'] : [])]
    };
  });
}

export function summarizeAreaContext(districts, worldPopData = {}, worldPopLastFetch = null, osmData = null) {
  return districts.map((d) => {
    const fallbackKey = [d.name, d.properties?.ADM2_EN, d.properties?.NAME_2].find((key) => key && districts.filter((area) => [area.name, area.properties?.ADM2_EN, area.properties?.NAME_2].includes(key)).length === 1 && worldPopData[key]);
    const pop = worldPopData[String(d.id)] ?? (fallbackKey ? worldPopData[fallbackKey] : null);
    const infrastructure = { available: Array.isArray(osmData?.features), roadFeatures: 0, healthFacilities: 0, bridgeFeatures: 0, invalidGeometries: 0 };
    const requested = osmData?.metadata?.requestedLayers;
    infrastructure.roadsAvailable = osmData?.metadata?.roadsAvailable ?? (infrastructure.available && (!requested?.length || requested.includes('roads')));
    infrastructure.facilitiesAvailable = osmData?.metadata?.facilitiesAvailable ?? (infrastructure.available && (!requested?.length || requested.includes('hospitals')));
    infrastructure.facilitySource = osmData?.metadata?.facilitySource || 'OpenStreetMap';
    infrastructure.roadSource = infrastructure.roadsAvailable ? (osmData?.metadata?.roadSource || 'OpenStreetMap') : null;
    for (const feature of osmData?.features || []) {
      try {
        if (!feature?.geometry || !d.geometry || !booleanIntersects(feature.geometry, d.geometry)) continue;
        const tags = { ...feature.properties, ...feature.properties?.tags }, category = feature.properties?.category;
        if (category === 'road' || tags.highway) infrastructure.roadFeatures++;
        if (['hospital', 'clinic'].includes(category) || ['hospital', 'clinic'].includes(tags.amenity) || ['hospital', 'clinic'].includes(tags.healthcare)) infrastructure.healthFacilities++;
        if (category === 'bridge' || tags.bridge === 'yes') infrastructure.bridgeFeatures++;
      } catch (_) { infrastructure.invalidGeometries++; }
    }
    return { id: String(d.id), name: d.name, population: nonnegative(numeric(pop?.total)), under5: nonnegative(numeric(pop?.ageGroups?.under5)), populationYear: worldPopLastFetch?.year ?? null,
      infrastructure, osmFetchedAt: osmData?.metadata?.timestamp || osmData?.metadata?.fetchedAt || null, osmRequestedLayers: osmData?.metadata?.requestedLayers || [] };
  });
}

export function buildAreaAccessAssessment({ districts, context, targets = [], feedback = [], mobility = {}, sources = {} }) {
  if (!districts.length) throw new Error('Select at least one operational area.');
  if (targets.length && !sources.targets?.trim()) throw new Error('Add the source of the catch-up list.');
  if (feedback.length && !sources.feedback?.trim()) throw new Error('Add the source of the community feedback.');
  const areaRows = districts.map((d) => {
    const includedTargets = targets.filter((r) => r.status === 'matched' && r.areaId === String(d.id));
    const includedFeedback = feedback.filter((r) => r.status === 'matched' && r.areaId === String(d.id) && r.feedback);
    const known = includedTargets.filter((r) => r.target !== null);
    const mobilityValue = mobility.field ? d.properties?.[mobility.field] : null;
    return { ...context.find((a) => a.id === String(d.id)), id: String(d.id), name: d.name,
      places: includedTargets.length, listedTarget: known.length ? known.reduce((sum, r) => sum + r.target, 0) : null,
      unknownTargetPlaces: includedTargets.length - known.length,
      feedbackCount: includedFeedback.length, feedback: includedFeedback.map((r) => ({ place: r.place, text: r.feedback })),
      adminPopulation: { field: mobility.populationField || null, value: mobility.populationField ? d.properties?.[mobility.populationField] ?? null : null },
      mobility: { field: mobility.field || null, value: mobilityValue === undefined ? null : mobilityValue, source: mobility.source || null, period: mobility.period || null, units: mobility.units || null },
      nextStep: includedTargets.length ? includedFeedback.length ? 'Review community feedback when arranging catch-up visits' : 'Confirm local visit arrangements with the field team' : includedFeedback.length ? 'Review community concerns with local partners' : 'Confirm whether catch-up activity is needed'
    };
  });
  const issueCounts = (rows) => rows.reduce((sum, r) => { sum[r.status] = (sum[r.status] || 0) + 1; if (r.issues.length) sum['rows-with-issues'] = (sum['rows-with-issues'] || 0) + 1; return sum; }, {});
  return { kind: 'access-gaps', method: AREA_ACCESS_METHOD, schemaVersion: 1, computedAt: new Date().toISOString(),
    scope: { geographyKey: geographyKey(districts), areas: districts.map((d) => ({ id: String(d.id), name: d.name, geometryVersion: fingerprint(d.geometry) })) },
    mapAreas: districts.map((d) => ({ id: String(d.id), geometry: d.renderGeometry || d.geometry })), areaRows,
    targetRows: targets, feedbackRows: feedback, sources: { ...sources },
    totals: { areas: areaRows.length, matchedPlaces: targets.filter((r) => r.status === 'matched').length, unassignedPlaces: targets.filter((r) => ['ambiguous', 'unmatched', 'outside-scope'].includes(r.status)).length,
      knownListedTarget: areaRows.some((a) => a.listedTarget !== null) ? areaRows.reduce((sum, a) => sum + (a.listedTarget ?? 0), 0) : null,
      matchedFeedback: feedback.filter((r) => r.status === 'matched' && r.feedback).length },
    audit: { targets: issueCounts(targets), feedback: issueCounts(feedback), propertiesFingerprint: fingerprint(districts.map((d) => [d.id, d.properties])), contextFingerprint: fingerprint(context) },
    limitations: [
      'This is an area planning review. Places without coordinates remain named list entries assigned to areas; no settlement locations or travel times are inferred.',
      'WorldPop describes the population of the administrative area. It is not the number needing catch-up and is not allocated to listed places.',
      'Listed target totals sum supplied counts only. Missing or invalid counts remain unknown. Verify that the list does not duplicate people or cohorts.',
      'OSM shows recorded infrastructure in the loaded extract. A missing feature does not establish that no road or health service exists. Roads shown here are not a verified routing network.',
      'Community feedback is qualitative context from the supplied records, not a representative estimate of prevalence or sentiment.',
      'Mobility values retain the selected field, units, source and period. They are not converted into travel times, access scores or disease predictions.',
      'Unmatched, ambiguous, excluded and out-of-scope rows are retained in the assessment audit and are not added to area totals.'
    ] };
}

export function isAreaAccessResult(result) { return result?.kind === 'access-gaps' && result?.method === AREA_ACCESS_METHOD && result?.schemaVersion === 1; }

// Backups may carry area context: validate the fields rendered by the review UI.
export function validAreaAccessContext(r) {
  const text = v => typeof v === 'string';
  const optionalText = v => v == null || text(v);
  const row = a => a && ['places', 'listedTarget', 'unknownTargetPlaces', 'feedbackCount', 'population', 'populationYear'].every(k => a[k] == null || Number.isFinite(a[k])) && text(a.id) && text(a.name) && Number.isFinite(a.places) && Number.isFinite(a.feedbackCount) &&
    text(a.nextStep) && a.mobility && ['field', 'source', 'period', 'units'].every(k => optionalText(a.mobility[k])) &&
    Array.isArray(a.feedback) && a.feedback.every(f => f && text(f.place) && text(f.text)) &&
    (!a.adminPopulation || optionalText(a.adminPopulation.field));
  const listRow = a => a && text(a.id) && text(a.place) && optionalText(a.areaId) && optionalText(a.areaLabel) && text(a.status) &&
    (a.target == null || Number.isFinite(a.target)) && Array.isArray(a.issues) && a.issues.every(text);
  return isAreaAccessResult(r) && !!r.totals && !!r.sources &&
    ['targets', 'targetsPeriod', 'feedback', 'feedbackPeriod'].every(k => optionalText(r.sources[k])) &&
    Array.isArray(r.areaRows) && r.areaRows.every(row) && Array.isArray(r.targetRows) && r.targetRows.every(listRow) &&
    Array.isArray(r.feedbackRows) && r.feedbackRows.every(listRow) && Array.isArray(r.limitations) && r.limitations.every(text);
}
