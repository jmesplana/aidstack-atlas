import { createModuleStorage } from './moduleStorage.js';

// Trusted bundled modules only. This API is never passed to the iframe bridge.
const publishers = new Set(['access-gaps']);
const readers = new Set(['access-gaps', 'immunization', 'atlas']);
export function createWorkspaceResults({ workspaceId, moduleId }, adapter = createModuleStorage) {
  if (!readers.has(moduleId)) return undefined;
  // '@' cannot occur in an app manifest ID, so an uploaded app cannot claim this namespace.
  const storage = adapter({ workspaceId, moduleId: '@workspace-results' });
  return Object.freeze({
    async list() {
      const summaries = await storage.listPlans();
      const records = await Promise.all(summaries.map((item) => storage.loadPlan(item.id)));
      return records.filter((record) => record && !record.withdrawn && record.kind === 'access-gaps').map(({ id, metadata, savedAt, source, result }) => ({ id, name: metadata.name, publishedAt: savedAt, source, scope: result.scope, computedAt: result.computedAt }));
    },
    async load(id) {
      const record = await storage.loadPlan(id);
      return record && !record.withdrawn && record.kind === 'access-gaps' ? record : undefined;
    },
    ...(publishers.has(moduleId) ? {
      async publish(plan) {
        if (plan?.workspaceId !== workspaceId || plan?.moduleId !== moduleId || !Number.isInteger(plan.revision) || plan.revision < 1 || plan.result?.kind !== 'access-gaps' || plan.result?.schemaVersion !== 1 || !['road-network-v1', 'friction-surface-v1'].includes(plan.result?.method)) throw new Error('Save a valid Access Gaps assessment in this workspace before publishing.');
        // Read the persisted record: publication never captures an unsaved draft.
        const saved = await adapter({ workspaceId, moduleId }).loadPlan(plan.id);
        if (!saved || saved.revision !== plan.revision || JSON.stringify(saved.result) !== JSON.stringify(plan.result)) throw new Error('The saved assessment changed. Reopen it before publishing.');
        const id = JSON.stringify([moduleId, saved.id, saved.revision]);
        const prior = await storage.loadPlan(id);
        if (prior) {
          if (prior.withdrawn) throw new Error('This publication was withdrawn. Save a new assessment revision to publish again.');
          return prior;
        }
        return storage.savePlan({ id, metadata: { name: saved.metadata.name }, kind: 'access-gaps',
          source: { moduleId, planId: saved.id, revision: saved.revision, savedAt: saved.savedAt }, result: saved.result }, 0);
      },
      async withdraw(id) {
        const record = await storage.loadPlan(id);
        if (!record || record.source.moduleId !== moduleId) throw new Error('Publication not found for this module.');
        return storage.savePlan({ ...record, withdrawn: true }, record.revision);
      }
    } : {})
  });
}
