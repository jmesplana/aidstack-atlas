import { useState } from 'react';
import { formatValue } from '../../../lib/outbreak/data';
import { EBOLA_END_CRITERIA } from '../../../lib/outbreak/areaHistory';

const number = value => Number.isFinite(value) ? formatValue(value) : 'Not available';

export function ProvinceCoverage({ coverage }) {
  if (!coverage?.rows.length) return <p className="report-unavailable">Province coverage requires health-zone boundaries with province names and matching case data.</p>;
  const rows = coverage.rows.filter(row => row.affected > 0);
  if (!rows.length) return <p className="report-unavailable">No provinces have health zones with reported cumulative cases on {coverage.date}.</p>;
  return <section aria-label="Province case coverage">
    <h3>Case coverage by province</h3>
    <table><caption>Health zones with reported cumulative cases / all loaded health zones · {coverage.date}</caption>
      <thead><tr><th>Province</th><th>Health zones with cases / total</th><th>Reported affected (%)</th><th>Reported cumulative cases</th><th>Health zones with data / total</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.province}><td>{row.province}</td><td>{row.reported ? row.affected : 'Unknown'} / {row.total}</td><td>{row.reported ? `${row.percent.toFixed(1)}%` : 'Unknown'}</td><td>{number(row.cases)}{row.missing > 0 && row.reported > 0 && <small>Partial sum</small>}</td><td>{row.reported} / {row.total}{row.missing > 0 && <small>{row.missing} unknown</small>}</td></tr>)}</tbody>
    </table>
    <small>Only provinces with reported cases are shown. “Affected” means a positive cumulative total on {coverage.date}, not current transmission. Denominators use unique health zones in the loaded boundaries and may not cover the whole province. Missing reports are unknown, not zero; percentages are the reported affected share of that denominator. Case totals are sums of available matched health-zone reports, not official province totals.</small>
    {(coverage.excludedBoundaries > 0 || coverage.unmapped > 0) && <small>{coverage.excludedBoundaries} boundary names lack a unique province assignment; {coverage.unmapped} current case locations cannot be assigned to these province denominators.</small>}
  </section>;
}

export function AreaHistoryTable({ activity, date }) {
  if (!activity) return null;
  return <section aria-label="Health-zone reporting history">
    <h3>Health-zone reporting history</h3>
    {activity.firstReports.length > 0 ? <table><caption>First positive reports during the comparison interval</caption><thead><tr><th>Health zone</th><th>First positive report</th><th>Earlier evidence</th></tr></thead><tbody>{activity.firstReports.map(row => <tr key={row.location}><td>{row.location}</td><td>{row.date}</td><td>{row.priorZero ? 'Previously reported zero' : 'No earlier zero established'}</td></tr>)}</tbody></table> : <p>No first positive reports identified during this comparison interval in the loaded history.</p>}
    <small>First appearance can reflect expanded reporting or incomplete history; it does not establish the date of the first infection.</small>
    {activity.quiet.length > 0 ? <table><caption>Unchanged positive cumulative totals through {date}</caption><thead><tr><th>Health zone</th><th>Unchanged since</th><th>Complete weeks (days)</th><th>Review</th></tr></thead><tbody>{activity.quiet.map(row => <tr key={row.location}><td>{row.location}</td><td>{row.start}</td><td>{row.weeks} ({row.days})</td><td>{row.review42 ? '≥42 days unchanged — verify surveillance' : 'Confirm continued reporting'}</td></tr>)}</tbody></table> : <p>No health zones have a verified run of at least one week of unchanged positive cumulative reports in the loaded data.</p>}
    <small>Counts describe unchanged reports, not weeks without infection. A missing value, a gap longer than eight days, or a revision breaks the run. Time is measured to the case reporting date, not publication.</small>
    <small>Six weeks (42 days) is not an automatic Ebola-free designation. <a href={EBOLA_END_CRITERIA}>WHO end-of-outbreak criteria</a> require no confirmed or probable cases for 42 days after the last potential exposure to the last case, with surveillance. These aggregate counts do not establish that starting event or those conditions.</small>
  </section>;
}

const positive = ['#b6dce2','#54a6b5','#146078'];
const negative = ['#dfcbe8','#b282c6','#77428f'];

export function ProvinceHorizon({ model, compact=false, onSelect, selected }) {
  const [detail,setDetail] = useState('Hover over or focus a week to inspect the reported change and its actual dates.');
  if (!model?.groups.length) return <p className="report-unavailable">{model?.comparisonsOnly?'No weekly case comparisons are available for this selection.':'Province horizon charts require matched health zones with dated case history.'}</p>;
  const {weeks,band} = model;
  const panels = model.groups.flatMap(group => Array.from({length:Math.ceil(group.rows.length/12)},(_,i) => ({
    province:group.province, part:i, rows:group.rows.slice(i*12,(i+1)*12)
  })));
  const left = 190, plotWidth = 750, rowHeight = 27, cell = plotWidth / weeks.length;
  return <section className="report-horizon" aria-label="Health-zone horizon charts">
    {!compact&&<><h3>Reported case changes by health zone and epidemiological week</h3>
    <p>Health zones grouped by province · ISO weeks (Monday–Sunday) · {weeks[0].label}–{weeks.at(-1).label}{model.truncated ? ` · last ${model.maxWeeks||26} weeks` : ''}</p>
    <small>Horizon strips fold changes into three colour bands on one shared scale: each band represents {number(band)} cases. Darker bands show larger changes. Teal = increase; purple = downward revision; a baseline = zero; grey × = unavailable. {model.comparisonsOnly ? 'Matched health zones with available weekly comparisons are shown.' : model.includeAll ? 'All matched health zones with observations in the loaded history are shown.' : 'Only health zones with positive cumulative cases on the latest reporting date are shown.'}</small></>}
    <div className="report-horizon-legend" aria-label="Horizon colour scale">{[positive,negative].map((colors,sign) => <span key={sign}>{sign ? 'Revisions: ' : 'Increases: '}{colors.map((color,i) => <span key={color} style={{borderBottom:`6px solid ${color}`,marginRight:8}}>{number(i*band)}–{number((i+1)*band)}</span>)}</span>)}</div>
    {panels.map(panel => <figure key={`${panel.province}:${panel.part}`}>
      <h4>{panel.province}{panel.part ? ' (continued)' : ''}</h4>
      <div className="report-horizon-scroll"><svg viewBox={`0 0 960 ${55+panel.rows.length*rowHeight}`} role="img" aria-label={`Health-zone horizon chart — ${panel.province}${panel.part ? ` part ${panel.part+1}` : ''}`}>
        <title>Changes in reported cumulative totals by ISO week; actual reporting intervals are available for each cell.</title>
        <rect width="960" height={55+panel.rows.length*rowHeight} fill="white"/>
        <text x="0" y="16" fontSize="12" fill="#52616d">Health zone</text>
        {weeks.map((week,i) => <g key={week.label}><title>{week.label}{week.partial ? ' — partial week' : ''}</title><text x={left+(i+.5)*cell} y="16" textAnchor="middle" fontSize={weeks.length>30?8:10} fill="#52616d">{`W${String(week.week).padStart(2,'0')}`}{week.partial?'*':''}</text>{(i===0 || week.year!==weeks[i-1].year) && <text x={left+i*cell} y="30" fontSize="10" fill="#52616d">{week.year}</text>}</g>)}
        {panel.rows.map((row,j) => {
          const top=40+j*rowHeight, height=rowHeight-5;
          return <g key={row.location}>{selected===row.location&&<rect x="0" y={top-2} width="950" height={rowHeight} fill="#e4f1f5"/>}<g role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} aria-label={onSelect?`Select ${row.location} on map`:undefined} onClick={()=>onSelect?.(row.location)} onKeyDown={e=>{if(onSelect&&['Enter',' '].includes(e.key)){e.preventDefault();onSelect(row.location);}}} style={{cursor:onSelect?'pointer':'default'}}><text x="0" y={top+16} fontSize="12" fill="#203b50">{row.location.length>26?`${row.location.slice(0,25)}…`:row.location}<title>{row.location}</title></text></g>
            {row.values.map((value,i) => {
              const week=weeks[i], x=left+i*cell;
              const description=`${panel.province} / ${row.location} · ${week.label}${week.partial?' (partial week)':''}: ${value===null?'comparison unavailable':`${value>0?'+':''}${number(value)} change in reported cumulative cases`}. ${week.start||'No previous report'}–${week.end||'No current report'}${week.days?` (${week.days} days)`:''}.`;
              return <g key={week.label} tabIndex={0} role="img" aria-label={description} onMouseEnter={()=>setDetail(description)} onFocus={()=>setDetail(description)}>
                <title>{description}</title><rect x={x} y={top} width={cell} height={height} fill={value===null?'#edf0f3':'#fafcfc'} stroke="#e0e6ea" strokeWidth=".5"/>
                {value===null ? <text x={x+cell/2} y={top+16} textAnchor="middle" fontSize="13" fill="#a3adb6">×</text> : value===0 ? <line x1={x+1} x2={x+cell-1} y1={top+height-1} y2={top+height-1} stroke="#536979"/> : [0,1,2].map(b => {
                  const h=Math.min(1,Math.max(0,Math.abs(value)/band-b))*height;
                  return h>0 ? <rect key={b} x={x} y={top+height-h} width={cell} height={h} fill={(value<0?negative:positive)[b]}/> : null;
                })}
              </g>;
            })}
          </g>;
        })}
      </svg></div>
    </figure>)}
    <p className="report-horizon-detail" aria-live="polite">{detail}</p>
    {!compact&&<small>Each column uses the last source report in that ISO week and the last report in the preceding week. Full-week comparisons require endpoints 6–8 days apart. * marks a partial week, which can cover fewer days and is not directly comparable with full weeks. Missing endpoints remain unavailable; no values are interpolated. Changes may include backlogs and revisions and are not onset-based incidence. {model.excluded} locations with reported cases lack a province match.</small>}
  </section>;
}
