import { withRateLimit } from '../../lib/rateLimit';
import { sendApiError, assertArray, assertEnum, assertYear } from '../../lib/validation/apiValidation';
import { validateAccessInputRequest } from '../../lib/planning/accessInputs';
import { accessCohort } from '../../lib/worldpop/accessCohorts';
import { fetchAreaDemographics, fetchCellDemographics } from '../../lib/worldpop/fetchDemographics';
import { fingerprint } from '../../lib/planning/geography';
import cache from '../../lib/osmCache';
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };
export const maxDuration = 60;
export async function handler(req, res) {
  if (req.method !== 'POST') return sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  let body;
  try {
    body = req.body || {};
    assertEnum(body.level, 'level', ['area', 'cell']);
    if (body.level === 'area') {
      validateAccessInputRequest({ districts: body.districts, kind: 'population', year: body.year }, { batch: false });
      assertEnum(body.dataType, 'dataType', ['total', 'agesex']);
    } else {
      assertYear(body.year); accessCohort(body.cohort);
      assertArray(body.cells, 'cells', 200);
      if (!body.cells.length || new Set(body.cells.map(cell => cell.id)).size !== body.cells.length) throw new Error('Provide distinct analysis cells.');
      for (const cell of body.cells) validateAccessInputRequest({ districts: [cell], kind: 'population' });
    }
  } catch (error) { return sendApiError(res, 400, 'INVALID_DEMOGRAPHIC_SCOPE', error.message); }
  if (!process.env.GEE_SERVICE_ACCOUNT_KEY) return sendApiError(res, 503, 'GEE_NOT_CONFIGURED', 'WorldPop requires the platform’s Google Earth Engine connection.');
  try {
    const key = `access-demographics:v1:${fingerprint(body)}`;
    const cached = await cache.getCachedOSM(key);
    if (cached) return res.status(200).json(cached);
    const data = body.level === 'area' ? await fetchAreaDemographics(body.districts, body.year, body.dataType) : await fetchCellDemographics(body.cells, body.year, body.cohort);
    const result = { ...data, fetchedAt: new Date().toISOString() };
    await cache.setCachedOSM(key, result, 24);
    return res.status(200).json(result);
  } catch (error) { return sendApiError(res, 502, 'DEMOGRAPHICS_UNAVAILABLE', error.message || 'Population breakdown is unavailable. Retry or choose another year.'); }
}
export default withRateLimit(handler, { keyPrefix: 'access-demographics', limit: 300 });
