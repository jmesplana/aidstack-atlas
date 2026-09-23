/*
 * Aidstack Atlas — Geospatial Operational Intelligence
 * Copyright (C) 2025-2026 John Mark Esplana
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file for the full text.
 */

// The bridge exposes explicit operations only; package-supplied scope is never used.
export async function handleAppRequest(request, { manifest, workspaceId, districts, facilities, acledData = [], disasters = [], storage, setDirty }) {
  const args = Array.isArray(request.args) ? request.args : [];
  if (request.method === 'workspace') return {
    workspaceId,
    districts: manifest.capabilities.includes('read:boundaries') ? districts : [],
    facilities: manifest.capabilities.includes('read:sites') ? facilities : [],
    ...(manifest.capabilities.includes('read:security') ? { acledData } : {}),
    ...(manifest.capabilities.includes('read:disasters') ? { disasters } : {})
  };
  if (request.method === 'setDirty') { setDirty(args[0] === true); return true; }
  if (!['listPlans', 'loadPlan', 'savePlan'].includes(request.method)) throw new Error('Unsupported app operation.');
  if (!manifest.capabilities.includes('write:plans')) throw new Error('App has no plan storage permission.');
  if (request.method === 'listPlans') return storage.listPlans();
  if (request.method === 'loadPlan') {
    if (typeof args[0] !== 'string') throw new Error('Invalid plan ID.');
    return storage.loadPlan(args[0]);
  }
  if (JSON.stringify(args).length > 2 * 1024 * 1024) throw new Error('Plan exceeds the 2 MB limit.');
  return storage.savePlan(args[0], args[1]);
}

export function appFrameDocument(html) {
  const sdk = `(() => {
    let port, sequence = 0;
    const pending = new Map();
    let connected;
    const ready = new Promise(resolve => { connected = resolve; });
    window.addEventListener('message', function connect(event) {
      if (event.source !== parent || event.data !== 'aidstack:connect' || !event.ports[0] || port) return;
      port = event.ports[0];
      port.onmessage = ({data}) => {
        const task = pending.get(data.id);
        if (!task) return;
        pending.delete(data.id);
        clearTimeout(task.timer);
        data.error ? task.reject(new Error(data.error)) : task.resolve(data.result);
      };
      connected();
    });
    async function call(method, ...args) {
      await ready;
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('App request timed out.')); }, 15000);
        pending.set(id, {resolve, reject, timer});
        port.postMessage({id, method, args});
      });
    }
    window.aidstack = Object.freeze({
      getWorkspace: () => call('workspace'),
      setDirty: value => call('setDirty', value),
      storage: Object.freeze({
        listPlans: () => call('listPlans'),
        loadPlan: id => call('loadPlan', id),
        savePlan: (plan, revision = 0) => call('savePlan', plan, revision)
      })
    });
    parent.postMessage('aidstack:ready', '*');
  })();`;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><script>${sdk}</script></head><body>${html}</body></html>`;
}
