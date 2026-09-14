/**
 * IndexedDB persistence layer for Aidstack Atlas
 * Handles storage of districts, WorldPop, OSM, ACLED data, and config
 */

import { openDB } from 'idb';

const DB_NAME = 'aidstack_storage';
const DB_VERSION = 2;

const STORES = {
  DISTRICTS: 'districts',
  WORLDPOP: 'worldpop',
  OSM: 'osm_infrastructure',
  ACLED: 'acled_data',
  OUTBREAKS: 'outbreaks',
  GDACS: 'gdacs',
  CONFIG: 'config'
};

/**
 * Initialize or get the IndexedDB database
 */
async function getDB() {
  if (typeof window === 'undefined') return null;

  try {
    return await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create object stores if they don't exist
        Object.values(STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        });
      },
    });
  } catch (error) {
    console.error('❌ Failed to open IndexedDB:', error);
    return null;
  }
}

// ==================== Districts ====================

/**
 * Save districts data to IndexedDB
 * @param {Array} districts - Array of district GeoJSON features
 */
export async function saveDistricts(districts) {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.put(STORES.DISTRICTS, districts, 'data');
    console.log('✅ Districts saved to IndexedDB:', districts.length, 'features');
    return true;
  } catch (error) {
    console.error('❌ Failed to save districts:', error);
    return false;
  }
}

/**
 * Load districts data from IndexedDB
 * @returns {Array|null} Districts array or null if not found
 */
export async function loadDistricts() {
  try {
    const db = await getDB();
    if (!db) return null;

    const data = await db.get(STORES.DISTRICTS, 'data');
    if (data) {
      console.log('✅ Districts loaded from IndexedDB:', data.length, 'features');
    }
    return data || null;
  } catch (error) {
    console.error('❌ Failed to load districts:', error);
    return null;
  }
}

/**
 * Clear districts data from IndexedDB
 */
export async function clearDistricts() {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.delete(STORES.DISTRICTS, 'data');
    console.log('✅ Districts cleared from IndexedDB');
    return true;
  } catch (error) {
    console.error('❌ Failed to clear districts:', error);
    return false;
  }
}

// ==================== WorldPop ====================

/**
 * Save WorldPop data to IndexedDB
 * @param {Object} worldPopData - WorldPop data object
 */
export async function saveWorldPop(worldPopData) {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.put(STORES.WORLDPOP, worldPopData, 'data');
    const districtCount = Object.keys(worldPopData).length;
    console.log('✅ WorldPop data saved to IndexedDB:', districtCount, 'districts');
    return true;
  } catch (error) {
    console.error('❌ Failed to save WorldPop data:', error);
    return false;
  }
}

/**
 * Load WorldPop data from IndexedDB
 * @returns {Object|null} WorldPop data or null if not found
 */
export async function loadWorldPop() {
  try {
    const db = await getDB();
    if (!db) return null;

    const data = await db.get(STORES.WORLDPOP, 'data');
    if (data) {
      const districtCount = Object.keys(data).length;
      console.log('✅ WorldPop data loaded from IndexedDB:', districtCount, 'districts');
    }
    return data || null;
  } catch (error) {
    console.error('❌ Failed to load WorldPop data:', error);
    return null;
  }
}

/**
 * Clear WorldPop data from IndexedDB
 */
export async function clearWorldPop() {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.delete(STORES.WORLDPOP, 'data');
    console.log('✅ WorldPop data cleared from IndexedDB');
    return true;
  } catch (error) {
    console.error('❌ Failed to clear WorldPop data:', error);
    return false;
  }
}

// ==================== OSM Infrastructure ====================

/**
 * Save OSM infrastructure data to IndexedDB
 * @param {Object} osmData - OSM infrastructure data object
 */
export async function saveOSMData(osmData) {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.put(STORES.OSM, osmData, 'data');
    const featureCount = osmData?.features?.length || 0;
    console.log('✅ OSM data saved to IndexedDB:', featureCount, 'features');
    return true;
  } catch (error) {
    console.error('❌ Failed to save OSM data:', error);
    return false;
  }
}

/**
 * Load OSM infrastructure data from IndexedDB
 * @returns {Object|null} OSM data or null if not found
 */
export async function loadOSMData() {
  try {
    const db = await getDB();
    if (!db) return null;

    const data = await db.get(STORES.OSM, 'data');
    if (data) {
      const featureCount = data?.features?.length || 0;
      console.log('✅ OSM data loaded from IndexedDB:', featureCount, 'features');
    }
    return data || null;
  } catch (error) {
    console.error('❌ Failed to load OSM data:', error);
    return null;
  }
}

/**
 * Clear OSM infrastructure data from IndexedDB
 */
export async function clearOSMData() {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.delete(STORES.OSM, 'data');
    console.log('✅ OSM data cleared from IndexedDB');
    return true;
  } catch (error) {
    console.error('❌ Failed to clear OSM data:', error);
    return false;
  }
}

// ==================== ACLED Data ====================

/**
 * Save ACLED data to IndexedDB
 * @param {Array} acledData - Array of ACLED events
 */
export async function saveACLEDData(acledData) {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.put(STORES.ACLED, acledData, 'data');
    console.log('✅ ACLED data saved to IndexedDB:', acledData.length, 'events');
    return true;
  } catch (error) {
    console.error('❌ Failed to save ACLED data:', error);
    return false;
  }
}

/**
 * Load ACLED data from IndexedDB
 * @returns {Array|null} ACLED data or null if not found
 */
export async function loadACLEDData() {
  try {
    const db = await getDB();
    if (!db) return null;

    const data = await db.get(STORES.ACLED, 'data');
    if (data) {
      console.log('✅ ACLED data loaded from IndexedDB:', data.length, 'events');
    }
    return data || null;
  } catch (error) {
    console.error('❌ Failed to load ACLED data:', error);
    return null;
  }
}

/**
 * Clear ACLED data from IndexedDB
 */
export async function clearACLEDData() {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.delete(STORES.ACLED, 'data');
    console.log('✅ ACLED data cleared from IndexedDB');
    return true;
  } catch (error) {
    console.error('❌ Failed to clear ACLED data:', error);
    return false;
  }
}

// ==================== Outbreaks (WHO) ====================

const OUTBREAKS_TTL_MS = 6 * 60 * 60 * 1000;

export async function saveOutbreaks(payload) {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.put(STORES.OUTBREAKS, { ...payload, savedAt: Date.now() }, 'data');
    return true;
  } catch (error) {
    console.error('Failed to save outbreaks:', error);
    return false;
  }
}

export async function loadOutbreaks() {
  try {
    const db = await getDB();
    if (!db) return null;
    const data = await db.get(STORES.OUTBREAKS, 'data');
    if (!data) return null;
    const isStale = !data.savedAt || (Date.now() - data.savedAt) > OUTBREAKS_TTL_MS;
    return { ...data, isStale };
  } catch (error) {
    console.error('Failed to load outbreaks:', error);
    return null;
  }
}

export async function clearOutbreaks() {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.delete(STORES.OUTBREAKS, 'data');
    return true;
  } catch (error) {
    console.error('Failed to clear outbreaks:', error);
    return false;
  }
}

// ==================== GDACS Disasters ====================

const GDACS_TTL_MS = 30 * 60 * 1000;

export async function saveGdacs(payload) {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.put(STORES.GDACS, { ...payload, savedAt: Date.now() }, 'data');
    return true;
  } catch (error) {
    console.error('Failed to save GDACS:', error);
    return false;
  }
}

export async function loadGdacs() {
  try {
    const db = await getDB();
    if (!db) return null;
    const data = await db.get(STORES.GDACS, 'data');
    if (!data) return null;
    const isStale = !data.savedAt || (Date.now() - data.savedAt) > GDACS_TTL_MS;
    return { ...data, isStale };
  } catch (error) {
    console.error('Failed to load GDACS:', error);
    return null;
  }
}

export async function clearGdacs() {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.delete(STORES.GDACS, 'data');
    return true;
  } catch (error) {
    console.error('Failed to clear GDACS:', error);
    return false;
  }
}

// ==================== Config (Selected Districts, Enabled Layers) ====================

/**
 * Save config value to IndexedDB
 * @param {string} key - Config key (e.g., 'selectedDistricts', 'enabledLayers')
 * @param {any} value - Config value
 */
export async function saveConfig(key, value) {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.put(STORES.CONFIG, value, key);
    console.log(`✅ Config saved to IndexedDB: ${key}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to save config ${key}:`, error);
    return false;
  }
}

/**
 * Load config value from IndexedDB
 * @param {string} key - Config key
 * @returns {any|null} Config value or null if not found
 */
export async function loadConfig(key) {
  try {
    const db = await getDB();
    if (!db) return null;

    const data = await db.get(STORES.CONFIG, key);
    if (data !== undefined) {
      console.log(`✅ Config loaded from IndexedDB: ${key}`);
    }
    return data !== undefined ? data : null;
  } catch (error) {
    console.error(`❌ Failed to load config ${key}:`, error);
    return null;
  }
}

/**
 * Clear specific config value from IndexedDB
 * @param {string} key - Config key
 */
export async function clearConfig(key) {
  try {
    const db = await getDB();
    if (!db) return false;

    await db.delete(STORES.CONFIG, key);
    console.log(`✅ Config cleared from IndexedDB: ${key}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to clear config ${key}:`, error);
    return false;
  }
}

// ==================== Storage Stats ====================

/**
 * Get storage statistics for all stores
 * @returns {Object} Storage stats object
 */
export async function getStorageStats() {
  try {
    const db = await getDB();
    if (!db) {
      return {
        districts: 0,
        worldpop: 0,
        osm: 0,
        acled: 0,
        selectedDistricts: 0,
        enabledLayers: 0
      };
    }

    const [districts, worldpop, osm, acled, selectedDistricts, enabledLayers] = await Promise.all([
      db.get(STORES.DISTRICTS, 'data'),
      db.get(STORES.WORLDPOP, 'data'),
      db.get(STORES.OSM, 'data'),
      db.get(STORES.ACLED, 'data'),
      db.get(STORES.CONFIG, 'selectedDistricts'),
      db.get(STORES.CONFIG, 'enabledLayers')
    ]);

    return {
      districts: districts?.length || 0,
      worldpop: worldpop ? Object.keys(worldpop).length : 0,
      osm: osm?.features?.length || 0,
      acled: acled?.length || 0,
      selectedDistricts: selectedDistricts?.length || 0,
      enabledLayers: enabledLayers?.length || 0
    };
  } catch (error) {
    console.error('❌ Failed to get storage stats:', error);
    return {
      districts: 0,
      worldpop: 0,
      osm: 0,
      acled: 0,
      selectedDistricts: 0,
      enabledLayers: 0
    };
  }
}

// ==================== Bulk Clear ====================

/**
 * Clear all data from IndexedDB (including facilities via existing logic)
 */
export async function clearAllData() {
  try {
    const db = await getDB();
    if (!db) return false;

    await Promise.all([
      db.delete(STORES.DISTRICTS, 'data'),
      db.delete(STORES.WORLDPOP, 'data'),
      db.delete(STORES.OSM, 'data'),
      db.delete(STORES.ACLED, 'data'),
      db.delete(STORES.OUTBREAKS, 'data'),
      db.delete(STORES.GDACS, 'data'),
      db.delete(STORES.CONFIG, 'selectedDistricts'),
      db.delete(STORES.CONFIG, 'enabledLayers')
    ]);

    console.log('✅ All data cleared from IndexedDB');
    return true;
  } catch (error) {
    console.error('❌ Failed to clear all data:', error);
    return false;
  }
}
