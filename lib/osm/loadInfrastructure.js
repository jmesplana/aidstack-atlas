// Browser-side retries keep each server request within its execution deadline.
export async function loadInfrastructure(boundary, layers, options = {}, onProgress = () => {}, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (layers.length > 1) {
    const results = [], errors = [];
    for (const layer of layers) {
      onProgress(`Loading OSM ${layer} (${results.length + errors.length + 1} of ${layers.length})…`);
      try { results.push({ layer, result: await loadInfrastructure(boundary, [layer], options, onProgress, wait) }); }
      catch (error) { errors.push({ layer, message: error.message }); }
    }
    if (!results.length) throw new Error(errors.map(e => `${e.layer}: ${e.message}`).join(' '));
    const features = [...new Map(results.flatMap(({ result }) => result.data.features).map(f => [f.id || JSON.stringify(f), f])).values()];
    const warnings = [...results.flatMap(({ result }) => result.warning ? [result.warning] : []), ...errors.map(e => `${e.layer}: ${e.message}`)];
    return { success: true, warning: warnings.join(' ') || undefined, data: { type: 'FeatureCollection', features, metadata: {
      ...results[0].result.data.metadata, requestedLayers: results.map(r => r.layer),
      failedLayers: errors.map(e => e.layer), partialFailures: errors.length + results.reduce((sum, r) => sum + (r.result.data.metadata?.partialFailures || 0), 0), warnings,
      byLayer: features.reduce((counts, f) => { const key = f.properties?.category || 'other'; counts[key] = (counts[key] || 0) + 1; return counts; }, {}),
      timestamp: results.map(r => r.result.data.metadata?.timestamp).filter(Boolean).sort()[0],
      stale: results.some(r => r.result.data.metadata?.stale)
    } } };
  }
  const { requestTimeoutMs: suppliedTimeout, onProgress: ignored, ...serverOptions } = options;
  const requestTimeoutMs = Math.max(60000, Number(suppliedTimeout) || 60000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let result, response;
    try {
      response = await fetch('/api/osm-infrastructure', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundary, layers, options: { maxFeatures: 5000, includeMetadata: true, ...serverOptions, providerAttempt: attempt } }) });
      result = await response.json();
    } catch (error) {
      result = { error: { message: controller.signal.aborted ? 'OSM download timed out while waiting for a response.' : 'The OSM download connection was interrupted.', retryAfter: 30, retryable: true } };
    } finally { clearTimeout(timer); }
    const partial = response?.ok && result.success && result.data?.metadata?.partialFailures > 0;
    if (response?.ok && result.success && Array.isArray(result.data?.features) && (!partial || (attempt === 2 && result.data.features.length > 0))) return result;
    const error = result?.error || (partial ? { message: 'Some OSM sections are still unavailable. Completed sections are cached for retry.', retryable: true } : {});
    const delay = Math.max(30 * 2 ** attempt, Number(error.retryAfter || response?.headers?.get('retry-after')) || 0);
    const retryable = error.retryable !== false && (partial || !response || [429, 500, 502, 503, 504].includes(response.status));
    if (!retryable || attempt === 2 || delay > 60) throw new Error(error.message || 'OSM infrastructure could not be loaded. Previously loaded assets are retained.');
    onProgress(`OSM service busy or unavailable. Retrying in ${delay} seconds (attempt ${attempt + 2} of 3)…`);
    await wait(delay * 1000);
    onProgress(`Retrying OSM download (attempt ${attempt + 2} of 3)…`);
  }
}
