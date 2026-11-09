import { accessCohort } from '../worldpop/accessCohorts.js';
export async function loadCellDemographics(result, { signal, onProgress = () => {}, request = fetch } = {}) {
  if (!result.populationCoverage?.year || result.settlements.some(row => !row.populationGeometry)) throw new Error('Reload Atlas population data and recalculate to enable a cell-level age/sex breakdown for this assessment.');
  const cohort = accessCohort(result.settings.populationCohort || {}), cells = [];
  for (let start = 0; start < result.settlements.length; start += 200) {
    if (signal?.aborted) throw new DOMException('Loading cancelled.', 'AbortError');
    const rows = result.settlements.slice(start, start + 200);
    const input = rows.map(row => ({ id: JSON.stringify([row.areaId, row.settlementId]), geometry: row.populationGeometry }));
    onProgress(`Loading demographic counts: cells ${start + 1}–${start + rows.length} of ${result.settlements.length}`);
    const response = await request('/api/access-demographics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ level: 'cell', year: result.populationCoverage.year, cohort, cells: input }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Demographic counts could not be loaded.');
    if (data.year !== result.populationCoverage.year || data.cohort?.age !== cohort.age || data.cohort?.sex !== cohort.sex || data.cells?.length !== input.length || new Set(data.cells.map(cell => cell.id)).size !== input.length || input.some(row => !data.cells.some(cell => cell.id === row.id))) throw new Error('Demographic counts did not match this assessment’s cells, year and population group.');
    if (cohort.dataType === 'agesex') {
      for (const cell of data.cells) {
        const values = cohort.bands.map(band => cell.bands?.[band]);
        if (values.every(value => Number.isFinite(value) && value >= 0)) {
          const expected = rows.find(row => JSON.stringify([row.areaId, row.settlementId]) === cell.id).population;
          const actual = values.reduce((sum, value) => sum + value, 0);
          if (Math.abs(expected - actual) > Math.max(.00001, expected * .00001)) throw new Error('The demographic counts differ from the population used in this assessment. Reload population data and recalculate before comparing them.');
        }
      }
    }
    cells.push(...data.cells);
  }
  if (signal?.aborted) throw new DOMException('Loading cancelled.', 'AbortError');
  return { cells, year: result.populationCoverage.year, cohort, fetchedAt: new Date().toISOString(), source: 'WorldPop Global 2 age/sex / Google Earth Engine' };
}
