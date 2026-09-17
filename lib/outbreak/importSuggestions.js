// Suggest only unambiguous, recognizable headers. All suggestions stay editable
// and the existing preview/confirmation validates the actual values and dates.
export function suggestIndicatorColumns(columns, mapping) {
  const aliases = {
    location:['location','health_zone','zone','district','province','nom'],
    date:['date','reporting_date','report_date','observation_date'],
    metric:mapping.purpose==='cases' ? ['cumulative_confirmed_cases','new_confirmed_cases','confirmed_cases','cases','value'] : ['value']
  };
  const result = {...mapping};
  for (const [field,names] of Object.entries(aliases)) {
    if(columns.includes(mapping[field])) continue;
    const matches=columns.filter(column=>names.includes(column.trim().toLowerCase()));
    result[field]=matches.length===1?matches[0]:'';
  }
  if(result.metric?.toLowerCase()==='cumulative_confirmed_cases') result.kind='cumulative';
  if(result.metric?.toLowerCase()==='new_confirmed_cases') result.kind='daily';
  return result;
}
