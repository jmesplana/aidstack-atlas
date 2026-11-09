import { analyzeAccessGaps } from '../lib/planning/accessGaps.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ result: analyzeAccessGaps(data) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
