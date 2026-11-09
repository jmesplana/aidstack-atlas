// Coalesce expensive calculations while invalidating stale results immediately.
export function createLatestTaskRunner() {
  let generation = 0, running = false, pending = null;
  async function drain() {
    if (running) return;
    running = true;
    while (pending) {
      const job = pending; pending = null;
      try { job.resolve(await job.task(() => job.generation === generation)); }
      catch (error) { job.reject(error); }
    }
    running = false;
  }
  return {
    run(task) {
      generation++;
      pending?.resolve(undefined);
      return new Promise((resolve, reject) => {
        pending = { task, resolve, reject, generation };
        drain();
      });
    },
    invalidate() { generation++; pending?.resolve(undefined); pending = null; },
  };
}
