import { accessCohort, ACCESS_AGE_GROUPS } from './accessCohorts.js';
import { getWorldPopCollectionId } from './worldpopYears.js';
import { validateAccessInputRequest } from '../planning/accessInputs.js';
import { assertArray, assertEnum } from '../validation/apiValidation.js';

export const ACCESS_POPULATION_VIS = { min: 0, max: 100, palette: ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026'] };

export function populationTileSelection(body) {
  try {
    const cohort = body.cohort == null ? null : accessCohort(body.cohort);
    const dataType = cohort?.dataType || assertEnum(body.dataType || 'total', 'dataType', ['total', 'agesex']);
    if (body.districts != null) {
      assertArray(body.districts, 'districts', 1000);
      if (!body.districts.length) throw new Error('Select an area for the population overlay.');
      // Clipping is a union, so adjacent/overlapping display boundaries do not
      // duplicate population. Validate each polygon without a download-batch cap.
      body.districts.forEach(district => validateAccessInputRequest({ districts: [district], kind: 'population' }, { batch: false }));
    }
    return { dataType, cohort, bands: cohort?.bands || (dataType === 'total' ? ['population'] : ACCESS_AGE_GROUPS[0].ages.flatMap(age => [`f_${age}`, `m_${age}`])) };
  } catch (error) { error.status ||= 400; throw error; }
}

export function populationTileImage(ee, year, selection, { districts, bounds } = {}) {
  const bands = ee.ImageCollection(getWorldPopCollectionId(selection.dataType))
    .filterDate(`${year}-01-01`, `${year + 1}-01-01`).mosaic().select(selection.bands);
  // Match the access denominator: every selected band must have valid data.
  let image = bands.reduce(ee.Reducer.sum()).updateMask(bands.mask().reduce(ee.Reducer.min())).rename('population');
  if (districts) image = image.clipToCollection(ee.FeatureCollection(districts.map(d => ee.Feature(ee.Geometry(d.geometry, 'EPSG:4326', false)))));
  else if (bounds) image = image.clip(ee.Geometry.Rectangle([bounds.west, bounds.south, bounds.east, bounds.north]));
  return image;
}
