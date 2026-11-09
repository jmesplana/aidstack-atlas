import { useEffect, useRef, useState } from 'react';
import { demographicKey } from '../../../lib/worldpop/demographics';
export default function useAreaPopulation(areas, year, dataType, enabled, saved) {
  const key = demographicKey(areas, year, dataType), areaKey = demographicKey(areas, 'area');
  const cache = useRef(new Map());
  const [data, setData] = useState(null), [status, setStatus] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const matches = value => value?.areaKey === areaKey && value?.dataType === dataType && (value.scopeKey === key || (Number.isInteger(year) && value.year === year));
  useEffect(() => {
    if (!enabled || !areas.length) return;
    const cached = cache.current.get(key) || (matches(saved) ? saved : matches(data) ? data : null);
    if (cached) { setData(cached); setStatus(''); setError(''); return; }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    setStatus('Loading area population and age/sex counts…'); setError('');
    (async () => {
      try {
        const response = await fetch('/api/access-demographics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ level: 'area', districts: areas.map(({ id, geometry }) => ({ id, geometry })), year, dataType }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Population summary could not be loaded.');
        if (body.scopeKey !== key || body.areas?.length !== areas.length || areas.some(area => !body.areas.some(row => row.id === String(area.id)))) throw new Error('Population summary did not match the selected areas.');
        if (controller.signal.aborted) return;
        const value = { ...body, areaKey, dataType }; cache.current.set(key, value); setData(value); setStatus('');
      } catch (error) { if (!controller.signal.aborted || timedOut) { setError(timedOut ? 'Population summary timed out. Retry to load it.' : error.message); setStatus(''); } }
      finally { clearTimeout(timer); }
    })();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [key, enabled, retry, saved]);
  return { data: matches(data) ? data : matches(saved) ? saved : null, status, error, retry: () => { cache.current.delete(key); setRetry(value => value + 1); } };
}
