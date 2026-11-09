import { earthEngine } from './accessCells.js';
import { accessCohort } from './accessCohorts.js';
import { DEMOGRAPHIC_BANDS, demographicKey } from './demographics.js';
import { getWorldPopCollectionId, resolveWorldPopYear } from './worldpopYears.js';
const info = object => new Promise((resolve, reject) => object.getInfo((data, error) => error ? reject(new Error('WorldPop demographic data could not be loaded.')) : resolve(data)));
const finite = value => Number.isFinite(value) && value >= 0 ? value : null;
async function extract(ee, year, dataType, regions, selectedBands, commonMask = false) {
  const collection = ee.ImageCollection(getWorldPopCollectionId(dataType)).filterDate(`${year}-01-01`, `${year + 1}-01-01`);
  const projection = ee.Image(collection.first()).select(selectedBands[0]).projection();
  let image = collection.mosaic().select(selectedBands);
  if (commonMask) image = image.updateMask(image.mask().reduce(ee.Reducer.min()));
  const result = await info(image.reduceRegions({ collection: ee.FeatureCollection(regions.map(row => ee.Feature(ee.Geometry(row.geometry, 'EPSG:4326', false), { id: String(row.id) }))), reducer: ee.Reducer.sum(), crs: projection, tileScale: 4 }));
  return result.features.map(feature => ({ id: feature.properties.id, bands: Object.fromEntries(selectedBands.map(band => [band, finite(selectedBands.length === 1 ? feature.properties[band] ?? feature.properties.sum : feature.properties[band])])) }));
}
export async function fetchAreaDemographics(districts, requestedYear, dataType = 'total') {
  const ee = await earthEngine();
  const year = await resolveWorldPopYear(ee, requestedYear, dataType);
  await resolveWorldPopYear(ee, year, 'agesex');
  await resolveWorldPopYear(ee, year, 'total');
  const [ageSex, totals] = await Promise.all([extract(ee, year, 'agesex', districts, DEMOGRAPHIC_BANDS), extract(ee, year, 'total', districts, ['population'])]);
  const totalMap = new Map(totals.map(row => [row.id, row.bands.population]));
  return { year, scopeKey: demographicKey(districts, requestedYear, dataType), source: 'WorldPop Global 2 / Google Earth Engine', areas: ageSex.map(row => ({ ...row, totalPopulation: totalMap.get(row.id) ?? null })) };
}
export async function fetchCellDemographics(cells, year, selection) {
  const ee = await earthEngine(), cohort = accessCohort(selection);
  await resolveWorldPopYear(ee, year, 'agesex');
  const bands = cohort.dataType === 'total' ? DEMOGRAPHIC_BANDS : cohort.bands;
  return { year, cohort, source: 'WorldPop Global 2 age/sex / Google Earth Engine', cells: await extract(ee, year, 'agesex', cells, bands, true) };
}
