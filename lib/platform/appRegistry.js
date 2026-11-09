import immunization from '../../components/apps/immunization/manifest.json';
import outbreak from '../../components/apps/outbreak/manifest.json';
import accessGaps from '../../components/apps/access-gaps/manifest.json';
import { defineAppRegistry, PLATFORM_API_VERSION } from './appManifest.js';
export { PLATFORM_API_VERSION } from './appManifest.js';

export const APP_REGISTRY = defineAppRegistry([immunization, outbreak, accessGaps]);

export function getApp(id) {
  return APP_REGISTRY.find((app) => app.id === id && app.platformApiVersion === PLATFORM_API_VERSION) || null;
}
