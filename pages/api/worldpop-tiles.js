import { withRateLimit } from '../../lib/rateLimit';
import { sendApiError } from '../../lib/validation/apiValidation';
import { resolveWorldPopYear } from '../../lib/worldpop/worldpopYears';

import { ACCESS_POPULATION_VIS, populationTileSelection, populationTileImage } from '../../lib/worldpop/populationTiles';

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};

// Cache EE initialization across warm invocations
let eeInitialized = false;
let eeInitPromise = null;

async function initEE() {
  if (eeInitialized) {
    console.log('[WorldPop Tiles] EE already initialized');
    return;
  }
  if (eeInitPromise) {
    console.log('[WorldPop Tiles] EE initialization in progress, waiting...');
    return eeInitPromise;
  }

  console.log('[WorldPop Tiles] Starting EE initialization...');

  eeInitPromise = new Promise((resolve, reject) => {
    const ee = require('@google/earthengine');
    let privateKey;
    try {
      const raw = process.env.GEE_SERVICE_ACCOUNT_KEY;
      const cleaned = raw?.trim().replace(/^'([\s\S]*)'$/, '$1');
      privateKey = JSON.parse(cleaned);
      console.log('[WorldPop Tiles] Service account parsed, project:', privateKey.project_id);
    } catch (e) {
      console.error('[WorldPop Tiles] Failed to parse GEE_SERVICE_ACCOUNT_KEY:', e.message);
      return reject(new Error('GEE_SERVICE_ACCOUNT_KEY is not valid JSON'));
    }

    ee.data.authenticateViaPrivateKey(
      privateKey,
      () => {
        console.log('[WorldPop Tiles] EE authentication successful, initializing...');
        ee.initialize(null, null, () => {
          eeInitialized = true;
          console.log('[WorldPop Tiles] EE initialization complete');
          resolve();
        }, (err) => {
          console.error('[WorldPop Tiles] EE initialization failed:', err);
          reject(new Error(`EE init failed: ${err}`));
        });
      },
      (err) => {
        console.error('[WorldPop Tiles] EE authentication failed:', err);
        reject(new Error(`EE auth failed: ${err}`));
      }
    );
  });

  eeInitPromise = eeInitPromise.catch(error => { eeInitPromise = null; throw error; });
  return eeInitPromise;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  if (!process.env.GEE_SERVICE_ACCOUNT_KEY) {
    return sendApiError(res, 503, 'GEE_NOT_CONFIGURED', 'Google Earth Engine is not configured on this server.');
  }

  try {
    const body = req.body || {};
    const { year = 'latest' } = body;
    const selection = populationTileSelection(body);
    const validatedDataType = selection.dataType;

    await initEE();
    const ee = require('@google/earthengine');
    const parsedYear = await resolveWorldPopYear(ee, year, validatedDataType);

    console.log(`[WorldPop Tiles] Generating tile URL for year=${parsedYear}, dataType=${validatedDataType}`);

    const visualizationImage = populationTileImage(ee, parsedYear, selection, body);
    const visParams = selection.cohort ? ACCESS_POPULATION_VIS : {
      min: 0, max: validatedDataType === 'agesex' ? 1000 : 500,
      palette: ['#0571b0', '#92c5de', '#f7f7f7', '#f4a582', '#ca0020'],
    };

    // Get the tile URL using getMapId
    const mapIdPromise = new Promise((resolve, reject) => {
      visualizationImage.getMapId(visParams, (mapId, error) => {
        if (error) {
          console.error('[WorldPop Tiles] getMapId error:', error);
          reject(new Error(typeof error === 'string' ? error : JSON.stringify(error)));
        } else {
          console.log('[WorldPop Tiles] MapId obtained:', mapId);
          resolve(mapId);
        }
      });
    });

    const mapId = await mapIdPromise;

    // Use the urlFormat provided by GEE (it has the correct URL structure)
    // GEE returns a urlFormat field with the proper tile URL template
    const tileUrl = mapId.urlFormat || `https://earthengine.googleapis.com/v1alpha/${mapId.mapid}/tiles/{z}/{x}/{y}`;

    console.log('[WorldPop Tiles] Tile URL generated successfully:', tileUrl);

    return res.status(200).json({
      success: true,
      tileUrl,
      mapId: mapId.mapid,
      token: mapId.token,
      year: parsedYear,
      dataType: validatedDataType,
      visParams,
      cohort: selection.cohort,
      units: 'people per source pixel (approximately 100 m)',
    });

  } catch (error) {
    console.error('[WorldPop Tiles] Error:', error.message);
    return sendApiError(res, error.status || 500, error.code || 'WORLDPOP_TILES_ERROR', error.message || 'Failed to generate tile URL from Earth Engine.');
  }
}

export default withRateLimit(handler);
