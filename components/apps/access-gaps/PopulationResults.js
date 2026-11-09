import { useMemo, useState } from 'react';
import { formatTravelMinutes } from '../../../lib/planning/displayAccess';
import styles from '../../platform/Planning.module.css';

const PAGE_SIZE = 50;
export default function PopulationResults({ result }) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [sort, setSort] = useState('source'), [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = result.settlements.filter(row => (!status || row.status === status) && (!query || `${row.name} ${row.areaName}`.toLocaleLowerCase().includes(query)));
    if (sort === 'population') filtered.sort((a, b) => b.population - a.population);
    if (sort === 'travel') filtered.sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1));
    return filtered;
  }, [result.settlements, search, status, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), current = Math.min(page, pages - 1);
  return <section aria-label="Population result table">
    <div className={styles.form}>
      <label>Search population results<input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Location or area" /></label>
      <label>Filter access<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">All access results</option><option value="covered">Within threshold</option><option value="beyond-threshold">Beyond threshold</option><option value="unknown">Unknown access</option></select></label>
      <label>Sort population results<select value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="source">Original order</option><option value="population">Largest population</option><option value="travel">Longest travel time</option></select></label>
    </div>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{result.settings.platformInputs ? 'Population cell' : 'Settlement'}</th><th>Area</th><th>Population</th><th>Travel time</th><th>Access</th></tr></thead>
      <tbody>{rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(row => <tr key={JSON.stringify([row.areaId, row.id])}><td>{row.name}</td><td>{row.areaName}</td><td>{row.population.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td><td title={row.minutes == null ? undefined : `${row.minutes} modeled minutes`}>{formatTravelMinutes(row.minutes)}</td><td>{row.status.replaceAll('-', ' ')}</td></tr>)}</tbody>
    </table></div>
    <div className={styles.actions}><button disabled={current === 0} onClick={() => setPage(current - 1)}>Previous population page</button><span role="status">Page {current + 1} of {pages} · {rows.length.toLocaleString()} matching locations</span><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next population page</button></div>
    <p className={styles.muted}>Exports retain every location and the original calculation precision.</p>
  </section>;
}
