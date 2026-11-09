import { createContext, useContext, useEffect, useState } from 'react';
import { loadRegionalBasemap } from '../../../lib/outbreak/regionalBasemap';

export const RegionalBasemapContext = createContext(null);
export function useRegionalBasemap(bounds) {
  const provided = useContext(RegionalBasemapContext);
  const key = JSON.stringify(bounds || []);
  const [data, setData] = useState({ key: '', features: [], status: 'loading' });
  useEffect(() => {
    if (provided) return;
    let active = true;
    loadRegionalBasemap(JSON.parse(key)).then(features => { if (active) setData({ key, features, status: 'ready' }); }, () => { if (active) setData({ key, features: [], status: 'error' }); });
    return () => { active = false; };
  }, [key, provided]);
  return provided ? { features: provided, status: 'ready' } : data.key === key ? data : { features: [], status: 'loading' };
}
