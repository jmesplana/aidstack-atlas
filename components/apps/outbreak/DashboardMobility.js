import { useMemo } from 'react';
import { districtRoutes } from '../../../lib/outbreak/mobility';
import { formatValue, validDate } from '../../../lib/outbreak/data';
import MobilityMap from './MobilityMap';
import styles from './outbreak.module.css';

export default function DashboardMobility({ data, direction='outflow', onDirection, location, defaultLocation, focus=[], onSelect, geometry, boundaryLevel, asOf, overlays, onLoad, loading, error }) {
  const areas=useMemo(()=>[...new Set((data?.routes||[]).flatMap(route=>[route.origin,route.destination]))].sort(),[data]);
  const area=location||(focus.length?(focus.includes(defaultLocation)?defaultLocation:focus.find(name=>areas.includes(name))||focus[0]):defaultLocation||areas[0])||'';
  const routes=useMemo(()=>districtRoutes(data,area,direction,asOf),[data,area,direction,asOf]);
  const positive=routes.filter(route=>Number.isFinite(route.value)&&route.value>0),shown=positive.slice(0,10);
  const names=new Set(geometry?.features.map(feature=>feature.properties.nom)||[]);
  const unmatched=shown.filter(route=>!names.has(route.origin)||!names.has(route.destination)).length;
  const dated=validDate(data?.end),eligible=dated&&data.end<=asOf;
  const label=`${direction==='inflow'?'Inflow to':'Outflow from'} ${area}`;
  return <div className={styles.dashboardMobility}>
    {error&&<p role="alert">{error}</p>}
    {!data?.routes?.length?<>
      <p>No origin–destination movement data is available. Load the Flowminder relocation matrix or import mobility routes in Data & uploads.</p>
      <button disabled={loading} onClick={onLoad}>{loading?'Loading movement data…':'Load movement data'}</button>
    </>:!eligible?<p role="status">{dated?'Mobility observations fall after the reporting cut-off and are excluded.':'The mobility observation date is unavailable; connections are hidden.'}</p>:<>
      <div className={styles.controls}>
        <label>Movement direction<select aria-label="Movement direction" value={direction} onChange={event=>onDirection(event.target.value)}><option value="outflow">Outflow — destinations</option><option value="inflow">Inflow — origins</option></select></label>
        <label>Movement focus<select aria-label="Movement focus" value={area} onChange={event=>onSelect(event.target.value)}>{[...new Set([area,...areas])].filter(Boolean).map(name=><option key={name}>{name}</option>)}</select></label>
      </div>
      <p className={styles.movementPeriod}>{data.start}–{data.end} · {data.unit}</p>
      {shown.length?<>
        <div className={styles.dashboardMovementMap}>
          <MobilityMap compact presentation overlays={overlays} geometry={geometry} rows={shown.map(route=>({location:direction==='inflow'?route.origin:route.destination,value:route.value,date:data.end}))} level={boundaryLevel} boundaryLevel={boundaryLevel} kind="directed mobility" unit={data.unit} selected={area} onSelect={onSelect} label={label} asOf={asOf} source={data.source} routes={shown} routeDirection={direction} routeUnit={data.unit} focusNames={[area,...shown.flatMap(route=>[route.origin,route.destination])]}/>
        </div>
        <details className={styles.movementDetails}><summary>{label} · {shown.length} of {positive.length} connections</summary>
          <div className={styles.tableWrap}><table><thead><tr><th>Origin</th><th>Destination</th><th>{data.unit}</th></tr></thead><tbody>{shown.map(route=><tr key={JSON.stringify([route.origin,route.destination])}><td>{route.origin}</td><td>{route.destination}</td><td>{formatValue(route.value)}</td></tr>)}</tbody></table></div>
          <p>{routes.filter(route=>route.value===null).length} missing/redacted and {routes.filter(route=>route.value===0).length} zero observations. Internal movements are excluded.</p>
          <p>Source: {data.source||'Loaded mobility records'}. {data.limitation}</p>
        </details>
        {unmatched>0&&<p className={styles.movementPeriod}>{unmatched} connections cannot be mapped because an endpoint has no matching boundary.</p>}
      </>:<p>No positive {direction} connections are reported for {area} in this period. Missing or unlisted connections are unknown.</p>}
      <p className={styles.movementPeriod}>Arrows show reported movement from origin to destination during the observation period, not actual travel paths or current movement.</p>
    </>}
  </div>;
}
