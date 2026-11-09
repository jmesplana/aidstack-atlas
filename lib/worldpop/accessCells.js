import { accessCohort } from './accessCohorts.js';
import bbox from '@turf/bbox';
import { getWorldPopCollectionId, resolveWorldPopYear } from './worldpopYears.js';
import { MAX_DEMAND_CELLS, populationCellsToPoints } from '../planning/accessInputs.js';

let initialization;
export async function earthEngine() {
  const ee = require('@google/earthengine');
  if (!initialization) initialization = new Promise((resolve, reject) => {
    try {
      const key = JSON.parse(process.env.GEE_SERVICE_ACCOUNT_KEY?.trim().replace(/^'([\s\S]*)'$/, '$1'));
      ee.data.authenticateViaPrivateKey(key, () => ee.initialize(null, null, () => resolve(ee), reject), reject);
    } catch (error) { reject(error); }
  }).catch((error) => { initialization = null; throw error; });
  return initialization;
}
const info = (object) => new Promise((resolve, reject) => object.getInfo((value, error) => error ? reject(new Error('Earth Engine request failed.')) : resolve(value)));

// Remote raster extraction only; network routing and coverage analysis remain in the browser.
export async function fetchAccessPopulation(districts, requestedYear, cellSize, selection = {}) {
  const cohort = accessCohort(selection);
  const ee = await earthEngine();
  const year = await resolveWorldPopYear(ee, requestedYear, cohort.dataType);
  let cells = ee.FeatureCollection([]);
  for (const district of districts) {
    const geometry = ee.Geometry(district.geometry, 'EPSG:4326', false);
    // Earth Engine does not resolve EPSG:6933. Use a local metric UTM grid.
    const [west, south, east, north] = bbox(district.geometry);
    const zone = Math.max(1, Math.min(60, Math.floor(((west + east) / 2 + 180) / 6) + 1));
    const gridCrs = `EPSG:${(south + north >= 0 ? 32600 : 32700) + zone}`;
    const grid = geometry.coveringGrid(ee.Projection(gridCrs), cellSize).map((cell) => {
      const clipped = cell.geometry().intersection(geometry, ee.ErrorMargin(1));
      return ee.Feature(clipped, { areaId: String(district.id), point: clipped.centroid(1).coordinates(), cellArea: clipped.area(1) });
    }).filter(ee.Filter.gt('cellArea', 0));
    cells = cells.merge(grid);
  }
  const size = await info(cells.size());
  if (size > MAX_DEMAND_CELLS) { const error = new Error('Too many cells'); error.code = 'TOO_MANY_CELLS'; throw error; }
  const collection = ee.ImageCollection(getWorldPopCollectionId(cohort.dataType)).filterDate(`${year}-01-01`, `${year + 1}-01-01`);
  const projection = ee.Image(collection.first()).select(cohort.bands[0]).projection();
  const bands = collection.mosaic().select(cohort.bands);
  // Sum the selected source bands at each pixel, then aggregate those counts
  // into the existing demand grid. No district-wide age proportions.
  const image = bands.reduce(ee.Reducer.sum()).updateMask(bands.mask().reduce(ee.Reducer.min())).rename('population');
  // Sum the source raster in its native projection and pixel grid inside each clipped grid cell.
  // Merely resampling counts at cellSize would lose population mass.
  const data = await info(image.reduceRegions({ collection: cells, reducer: ee.Reducer.sum(), crs: projection, tileScale: 4 }));
  return { ...populationCellsToPoints(data.features, districts, year), year, cellSize, cohort, source: 'WorldPop Global 2 / Google Earth Engine', sourceScale: 100, gridProjection: 'Local UTM per administrative area' };
}
