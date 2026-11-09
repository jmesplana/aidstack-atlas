import { numericValue } from './indicators.js';
import { isPointInGeometry } from '../geo/geometry.js';
import { validAccessEvidence } from './accessGaps.js';

export const OBSERVATION_FIELDS = ['settlement_id', 'settlement', 'area_code', 'target_population', 'children_vaccinated', 'latitude', 'longitude'];
export const REQUIRED_METADATA = ['name', 'vaccine', 'dose', 'cohort', 'period', 'source'];

export function validateMetadata(metadata) {
  return REQUIRED_METADATA.filter((field) => !String(metadata?.[field] || '').trim()).map((field) => `${field.replaceAll('_', ' ')} is required`);
}

export function normalizeObservations(rows, districts, mapping, areaField = 'id') {
  const issues = [];
  const observations = [];
  const seen = new Set();
  const areaIndex = new Map();
  for (const district of districts) {
    const value = areaField === 'id' ? district.id : district.properties?.[areaField];
    if (value == null || value === '') continue;
    const key = String(value).trim();
    areaIndex.set(key, [...(areaIndex.get(key) || []), district]);
  }
  rows.forEach((raw, index) => {
    const row = Object.fromEntries(OBSERVATION_FIELDS.map((field) => [field, raw[mapping[field] || field]]));
    const errors = [];
    const code = String(row.area_code ?? '').trim();
    const lat = numericValue(row.latitude);
    const lng = numericValue(row.longitude);
    const hasPoint = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    let matches = code ? (areaIndex.get(code) || []) : [];
    if (!code && hasPoint) matches = districts.filter((district) => isPointInGeometry([lng, lat], district.geometry));
    if (matches.length !== 1) errors.push(matches.length > 1 ? 'Ambiguous area; use unique area codes' : 'No matching administrative area');
    const district = matches.length === 1 ? matches[0] : null;
    if (code && hasPoint && district && !isPointInGeometry([lng, lat], district.geometry)) errors.push('Coordinates conflict with area code');
    if ((row.latitude !== undefined && row.latitude !== '' || row.longitude !== undefined && row.longitude !== '') && !hasPoint) errors.push('Invalid coordinates');
    const target = numericValue(row.target_population);
    const vaccinated = numericValue(row.children_vaccinated);
    if (target === null || !Number.isSafeInteger(target) || target < 0) errors.push('Target must be a non-negative whole number');
    if (vaccinated === null || !Number.isSafeInteger(vaccinated) || vaccinated < 0) errors.push('Vaccinated count must be a non-negative whole number');
    if (target !== null && vaccinated !== null && vaccinated > target) errors.push('Vaccinated exceeds target; review denominator');
    const settlementId = String(row.settlement_id ?? '').trim();
    const name = String(row.settlement ?? '').trim();
    if (!settlementId || !name) errors.push('Settlement ID and name are required');
    const id = JSON.stringify([district?.id, settlementId]);
    if (seen.has(id)) errors.push('Duplicate settlement observation');
    seen.add(id);
    if (errors.length) {
      issues.push({ row: index + 2, settlement: name, errors: errors.join('; ') });
    } else {
      observations.push({ id, settlementId, name, areaId: String(district.id), areaName: district.name,
        target, vaccinated, latitude: hasPoint ? lat : null, longitude: hasPoint ? lng : null });
    }
  });
  return { observations, issues, totalRows: rows.length };
}

export function validateSessions(sessions, observations) {
  const errors = [];
  const byId = new Map(observations.map((row) => [row.id, row]));
  const assigned = new Map();
  const ids = new Set();
  sessions.forEach((session, index) => {
    const prefix = `Session ${index + 1}`;
    const row = byId.get(session.observationId);
    if (!session.id || ids.has(session.id)) errors.push(`${prefix}: missing or duplicate session ID`);
    ids.add(session.id);
    if (!row) errors.push(`${prefix}: unknown settlement`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date || '') || !Number.isFinite(Date.parse(session.date)) || new Date(session.date).toISOString().slice(0, 10) !== session.date) errors.push(`${prefix}: valid date required`);
    if (!String(session.team || '').trim()) errors.push(`${prefix}: team required`);
    if (!['Fixed', 'Outreach', 'Mobile'].includes(session.mode)) errors.push(`${prefix}: invalid delivery mode`);
    const planned = numericValue(session.planned);
    const actual = numericValue(session.actual);
    if (!Number.isSafeInteger(planned) || planned <= 0) errors.push(`${prefix}: planned children must be a positive whole number`);
    if (!Number.isSafeInteger(actual) || actual < 0 || actual > planned) errors.push(`${prefix}: actual must be between zero and planned`);
    if (planned !== null) assigned.set(session.observationId, (assigned.get(session.observationId) || 0) + planned);
  });
  assigned.forEach((count, id) => {
    const row = byId.get(id);
    if (row && count > row.target - row.vaccinated) errors.push(`${row.name}: allocations exceed the baseline gap`);
  });
  return errors;
}

export function validateAssumptions(assumptions) {
  const errors = [];
  for (const key of ['dailyCapacity', 'wastagePercent', 'bufferPercent', 'stockDoses', 'costPerTeamDay']) {
    const value = numericValue(assumptions?.[key]);
    if (value === null || value < 0 || (key === 'dailyCapacity' && (!Number.isSafeInteger(value) || value <= 0)) || (key === 'wastagePercent' && value >= 100) || (key === 'stockDoses' && !Number.isSafeInteger(value))) errors.push(`Invalid ${key}`);
  }
  return errors;
}

export function calculatePlan(plan) {
  const errors = [...validateSessions(plan.sessions || [], plan.observations || []), ...validateAssumptions(plan.assumptions)];
  const allocations = new Map();
  for (const session of plan.sessions || []) {
    const current = allocations.get(session.observationId) || { planned: 0, actual: 0 };
    current.planned += numericValue(session.planned) || 0;
    current.actual += numericValue(session.actual) || 0;
    allocations.set(session.observationId, current);
  }
  const rows = (plan.observations || []).map((row) => {
    const allocation = allocations.get(row.id) || { planned: 0, actual: 0 };
    const missed = row.target - row.vaccinated;
    return { ...row, ...allocation, missed, remaining: missed - allocation.actual, unassigned: missed - allocation.planned,
      coverage: row.target > 0 ? 100 * row.vaccinated / row.target : null };
  });
  const totals = rows.reduce((sum, row) => {
    for (const key of ['target', 'vaccinated', 'missed', 'planned', 'actual', 'remaining', 'unassigned']) sum[key] += row[key];
    return sum;
  }, { target: 0, vaccinated: 0, missed: 0, planned: 0, actual: 0, remaining: 0, unassigned: 0 });
  totals.coverage = totals.target ? 100 * totals.vaccinated / totals.target : null;
  const grouped = new Map();
  rows.forEach((row) => {
    const area = grouped.get(row.areaId) || { id: row.areaId, name: row.areaName, target: 0, vaccinated: 0, missed: 0, planned: 0, actual: 0, remaining: 0, unassigned: 0 };
    for (const key of ['target', 'vaccinated', 'missed', 'planned', 'actual', 'remaining', 'unassigned']) area[key] += row[key];
    grouped.set(row.areaId, area);
  });
  const areas = [...grouped.values()].map((area) => ({ ...area, coverage: area.target ? 100 * area.vaccinated / area.target : null })).sort((a, b) => b.remaining - a.remaining);
  let resources = null;
  if (!errors.length) {
    const { dailyCapacity, wastagePercent, bufferPercent, stockDoses, costPerTeamDay } = plan.assumptions;
    const doses = Math.ceil(totals.planned / (1 - Number(wastagePercent) / 100) * (1 + Number(bufferPercent) / 100));
    const workload = new Map();
    for (const session of plan.sessions || []) {
      const key = JSON.stringify([session.team.trim().toLowerCase(), session.date]);
      workload.set(key, (workload.get(key) || 0) + Number(session.planned));
    }
    const teamDays = [...workload.values()].reduce((sum, count) => sum + Math.ceil(count / Number(dailyCapacity)), 0);
    const overloaded = [...workload.values()].filter((count) => count > Number(dailyCapacity)).length;
    resources = { doses, stockGap: Math.max(0, doses - Number(stockDoses)), teamDays, budget: teamDays * Number(costPerTeamDay), overloaded };
  }
  return { rows, totals, areas, resources, errors };
}

export function validatePlan(plan) {
  if (!plan || plan.schemaVersion !== 1 || !Array.isArray(plan.observations) || !Array.isArray(plan.sessions)) return ['Unsupported plan format'];
  const errors = validateMetadata(plan.metadata);
  if (!validAccessEvidence(plan.accessEvidence)) errors.push('Invalid attached access evidence');
  if (!plan.observations.length) errors.push('At least one validated observation is required');
  const ids = new Set();
  for (const row of plan.observations) {
    if (!row.id || ids.has(row.id) || !row.areaId || !row.name || !Number.isSafeInteger(row.target) || !Number.isSafeInteger(row.vaccinated) || row.target < 0 || row.vaccinated < 0 || row.vaccinated > row.target) errors.push('Invalid or duplicate observation');
    ids.add(row.id);
  }
  return [...errors, ...validateSessions(plan.sessions, plan.observations), ...validateAssumptions(plan.assumptions)];
}
