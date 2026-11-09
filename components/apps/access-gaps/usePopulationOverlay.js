import { useEffect, useMemo, useRef, useState } from 'react';
import { accessCohort } from '../../../lib/worldpop/accessCohorts';

// Map-only state: toggling the overlay never changes the assessment or reruns access.
export default function usePopulationOverlay(result, districts, enabled) {
  const year = result.populationCoverage?.year;
  const cohort = useMemo(() => accessCohort(result.settings.populationCohort || {}), [result.settings.populationCohort]);
  const available = Number.isInteger(year) && year >= 2015 && year <= 2030;
  const requestKey = JSON.stringify({ year, cohort: { age: cohort.age, sex: cohort.sex }, districts: districts.map(({ id, geometry }) => ({ id, geometry })) });
  const cache = useRef(null), failedTiles = useRef(false);
  const [data, setData] = useState(null), [status, setStatus] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !available) return;
    failedTiles.current = false;
    if (cache.current?.key === requestKey && Date.now() - cache.current.created < 30 * 60 * 1000) {
      setData(cache.current); setStatus({ key: requestKey, loading: true, message: 'Loading WorldPop map tiles…' });
      return;
    }
    setData(null); setStatus({ key: requestKey, loading: true, message: 'Preparing WorldPop population overlay…' });
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 45000);
    (async () => {
      try {
        const response = await fetch('/api/worldpop-tiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestKey, signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.tileUrl) throw new Error(body.error || 'WorldPop overlay is unavailable.');
        if (body.year !== year || body.cohort?.age !== cohort.age || body.cohort?.sex !== cohort.sex) throw new Error('The population overlay does not match this assessment’s year and population group.');
        if (controller.signal.aborted) return;
        const entry = { key: requestKey, created: Date.now(), ...body };
        cache.current = entry; setData(entry);
        setStatus({ key: requestKey, loading: true, message: 'Loading WorldPop map tiles…' });
      } catch (error) {
        if (!controller.signal.aborted || timedOut) setStatus({ key: requestKey, error: true, message: timedOut ? 'WorldPop overlay timed out. Retry to load the population layer.' : error.message });
      } finally { clearTimeout(timeout); }
    })();
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [enabled, available, requestKey, attempt]);
  const events = useMemo(() => ({
    loading: () => { failedTiles.current = false; setStatus({ key: requestKey, loading: true, message: 'Loading WorldPop map tiles…' }); },
    tileerror: () => { failedTiles.current = true; setStatus({ key: requestKey, error: true, message: 'Some WorldPop tiles could not load. The overlay may be incomplete; retry to refresh it.' }); },
    load: () => { if (!failedTiles.current) setStatus({ key: requestKey, message: 'WorldPop overlay ready.' }); },
  }), [requestKey]);
  return {
    available, year, cohort, data: enabled && data?.key === requestKey ? data : null,
    status: enabled && status?.key === requestKey ? status : null, events,
    retry: () => { cache.current = null; setData(null); setAttempt(value => value + 1); },
  };
}
