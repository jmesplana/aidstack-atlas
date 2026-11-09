import { ACCESS_AGE_GROUPS, accessCohort } from './accessCohorts.js';
import { fingerprint } from '../planning/geography.js';

export const DEMOGRAPHIC_AGES = ACCESS_AGE_GROUPS[0].ages.map(code => ({ code, label: code === '00' ? 'Under 1' : code === '01' ? '1–4' : code === '90' ? '90+' : `${Number(code)}–${Number(code) + 4}` }));
export const DEMOGRAPHIC_BANDS = DEMOGRAPHIC_AGES.flatMap(({ code }) => [`f_${code}`, `m_${code}`]);
export const completeSum = values => values.length && values.every(value => Number.isFinite(value) && value >= 0) ? values.reduce((sum, value) => sum + value, 0) : null;
export const demographicKey = (areas, year, dataType = 'total') => fingerprint({ areas: areas.map(d => [String(d.id), d.geometry]).sort(([a], [b]) => a.localeCompare(b)), year, dataType });
export function demographicTable(records, selection = { age: 'all', sex: 'both' }) {
  const cohort = accessCohort(selection), ages = ACCESS_AGE_GROUPS.find(group => group.id === cohort.age).ages;
  return DEMOGRAPHIC_AGES.filter(age => ages.includes(age.code)).map(age => {
    const female = cohort.sex === 'male' ? null : completeSum(records.map(row => row.bands?.[`f_${age.code}`]));
    const male = cohort.sex === 'female' ? null : completeSum(records.map(row => row.bands?.[`m_${age.code}`]));
    return { ...age, female, male, total: completeSum(cohort.sex === 'both' ? [female, male] : [cohort.sex === 'female' ? female : male]) };
  });
}
export function summarizeDemographics(records, selection) {
  const rows = demographicTable(records, selection);
  return { rows, female: selection?.sex === 'male' ? null : completeSum(rows.map(row => row.female)), male: selection?.sex === 'female' ? null : completeSum(rows.map(row => row.male)), total: completeSum(rows.map(row => row.total)) };
}
export function accessDemographicRows(result, cells, areaId = '', cellId = '', option = 'recommended', selectionOverride = null) {
  const ids = option === 'baseline' ? [] : option === 'scenario' ? result.scenario.selectedCandidateIds : result.decision?.selectedCandidateIds || [];
  const reached = new Set(result.candidates.filter(site => ids.includes(site.id)).flatMap(site => site.settlementIds));
  const records = new Map(cells.map(cell => [cell.id, cell]));
  const groups = { current: [], additional: [], newlyKnown: [], beyond: [], unknown: [] };
  for (const row of result.settlements) {
    const id = JSON.stringify([row.areaId, row.settlementId]);
    if ((areaId && row.areaId !== areaId) || (cellId && id !== cellId)) continue;
    const cell = records.get(id) || { id, bands: {} };
    const status = row.status === 'covered' ? 'current' : reached.has(id) ? row.status === 'unknown' ? 'newlyKnown' : 'additional' : row.status === 'unknown' ? 'unknown' : 'beyond';
    groups[status].push(cell);
  }
  const selection = selectionOverride || result.settings.populationCohort || { age: 'all', sex: 'both' };
  const ages = demographicTable(Object.values(groups).flat(), selection);
  return ages.map(age => ({ ...age, ...Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length ? demographicTable(rows, selection).find(row => row.code === age.code)?.total ?? null : 0])) }));
}
