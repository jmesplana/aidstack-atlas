import { openDB } from 'idb';

const connections = new Map();
export function openCachedDB(name, version, options = {}) {
  const key = `${name}:${version}`;
  if (!connections.has(key)) {
    let db;
    const clear = () => { db?.close(); connections.delete(key); };
    const promise = openDB(name, version, { ...options, blocking: clear, terminated: clear })
      .then(value => { db = value; return value; }, error => { connections.delete(key); throw error; });
    connections.set(key, promise);
  }
  return connections.get(key);
}
