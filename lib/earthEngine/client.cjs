const ee = require('@google/earthengine');
let initialization;
function earthEngine() {
  if (!initialization) initialization = new Promise((resolve, reject) => {
    try {
      const key = JSON.parse(process.env.GEE_SERVICE_ACCOUNT_KEY?.trim().replace(/^'([\s\S]*)'$/, '$1'));
      ee.data.authenticateViaPrivateKey(key, () => ee.initialize(null, null, () => resolve(ee), reject), reject);
    } catch (error) { reject(error); }
  }).catch(error => { initialization = null; throw error; });
  return initialization;
}
function info(object, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Earth Engine took too long to respond. Retry this calculation.')), timeoutMs);
    object.getInfo((value, error) => {
      clearTimeout(timer);
      if (error) reject(new Error('Earth Engine could not complete this data request.'));
      else resolve(value);
    });
  });
}
module.exports = { earthEngine, info };
