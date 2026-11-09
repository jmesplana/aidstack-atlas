export const ALLOWED_WORLDPOP_DATA_TYPES = ['total', 'agesex'];

const WORLDPOP_COLLECTIONS = {
  total: 'projects/sat-io/open-datasets/WORLDPOP/pop',
  agesex: 'projects/sat-io/open-datasets/WORLDPOP/agesex',
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const yearsCache = new Map();

export function getWorldPopCollectionId(dataType = 'total') {
  return WORLDPOP_COLLECTIONS[dataType] || WORLDPOP_COLLECTIONS.total;
}

function getInfoAsync(computedObject) {
  return new Promise((resolve, reject) => {
    computedObject.getInfo((data, error) => {
      if (error) {
        reject(new Error(typeof error === 'string' ? error : JSON.stringify(error)));
      } else {
        resolve(data);
      }
    });
  });
}

export async function getAvailableWorldPopYears(ee, dataType = 'total') {
  const collectionId = getWorldPopCollectionId(dataType);
  const cacheKey = `${dataType}:${collectionId}`;
  const cached = yearsCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.years;
  }

  const timestamps = await getInfoAsync(
    ee.ImageCollection(collectionId).aggregate_array('system:time_start')
  );

  const years = [...new Set(
    (timestamps || [])
      .map((timestamp) => new Date(timestamp).getUTCFullYear())
      .filter((year) => Number.isInteger(year))
  )].sort((a, b) => a - b);

  yearsCache.set(cacheKey, {
    timestamp: Date.now(),
    years,
  });

  return years;
}

export async function resolveWorldPopYear(ee, requestedYear = 'latest', dataType = 'total') {
  const years = await getAvailableWorldPopYears(ee, dataType);

  if (years.length === 0) {
    const error = new Error(`No WorldPop years are available for ${dataType}.`);
    error.code = 'NO_WORLDPOP_YEARS';
    error.status = 404;
    throw error;
  }

  if (requestedYear === 'current') {
    const current = years.filter(year => year <= new Date().getFullYear());
    if (!current.length) throw new Error('No population year at or before the current year is available. Select a planning year explicitly.');
    return current[current.length - 1];
  }

  if (requestedYear === 'latest' || requestedYear === undefined || requestedYear === null || requestedYear === '') {
    return years[years.length - 1];
  }

  const year = Number(requestedYear);
  if (!Number.isInteger(year)) {
    const error = new Error('year must be "latest" or an available WorldPop year');
    error.code = 'INVALID_YEAR';
    error.status = 400;
    throw error;
  }

  if (!years.includes(year)) {
    const error = new Error(`WorldPop data is not available for ${year}. Choose one of: ${years.join(', ')}`);
    error.code = 'WORLDPOP_YEAR_UNAVAILABLE';
    error.status = 400;
    throw error;
  }

  return year;
}
