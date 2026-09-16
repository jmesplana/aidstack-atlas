import { latestPerLocation } from './data.js';

export function evidenceReadiness(datasets, asOf) {
  return datasets.map(dataset => {
    const rows = latestPerLocation(dataset.records || [], asOf);
    const dates = rows.map(row => row.date).sort();
    return {
      id: dataset.id, label: dataset.label, source: dataset.url || dataset.source || dataset.id,
      start: dates[0], end: dates.at(-1),
      missing: rows.filter(row => row.value === null).length,
      older: rows.filter(row => row.date < asOf).length,
      available: rows.filter(row => row.value !== null).length,
      warning: dataset.refreshError || dataset.error || '',
      issues: dataset.issues?.length || 0
    };
  });
}

// Keep the exact comparison inputs, without recursively nesting earlier briefs.
export function comparisonRecord(snapshot) {
  if (!snapshot) return null;
  const { id, name, asOf, datasets, geometry, epiSource, boundaryLevel, actions } = snapshot;
  return { id, name, asOf, datasets, geometry, epiSource, boundaryLevel, actions };
}

export function actionFollowUp(actions, asOf) {
  const open = actions.filter(action => action.status !== 'Completed');
  return {
    unassigned: open.filter(action => !action.owner?.trim()).length,
    undated: open.filter(action => !action.due).length,
    overdue: open.filter(action => action.due && action.due < asOf).length,
    blocked: open.filter(action => action.status === 'Blocked').length
  };
}
