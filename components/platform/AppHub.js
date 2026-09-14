import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Download, Trash2, X, Boxes } from 'lucide-react';
import { APP_REGISTRY } from '../../lib/platform/appRegistry';
import { missingAppData } from '../../lib/platform/appManifest';
import { APP_COMPONENTS } from './appComponents';
import { getInstalledApps, setInstalledApps } from '../../lib/platform/appStore';
import { createModuleStorage } from '../../lib/platform/moduleStorage';
import { geographyKey } from '../../lib/planning/geography';
import styles from './Planning.module.css';
import { readAppPackage, listAppPackages, installAppPackage, setPackageEnabled } from '../../lib/platform/appPackages';
import InstalledAppFrame from './InstalledAppFrame';

const accessLabels = { 'read:boundaries': 'Read administrative boundaries', 'read:sites': 'Read facilities', 'read:security': 'Read workspace security events', 'write:plans': 'Read and save this app’s plans', 'export:plans': 'Export plans (not supported by uploaded apps yet)' };

class AppBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert">The planning app could not open. Return to Apps and try again.</p> : this.props.children;
  }
}

export default function AppHub({ districts, facilities, acledData = [], disasters = [], onClose }) {
  const dialog = useRef(null);
  const workspaceId = useMemo(() => geographyKey(districts), [districts]);
  const [installed, setInstalled] = useState([]);
  const [packages, setPackages] = useState([]);
  const [pendingPackage, setPendingPackage] = useState(null);
  const upload = useRef(null);
  const catalog = [...APP_REGISTRY, ...packages.map((pkg) => pkg.manifest)];
  const enabled = [...installed, ...packages.filter((pkg) => pkg.enabled).map((pkg) => pkg.manifest.id)];
  const [active, setActive] = useState(null);
  const activeApp = catalog.find((app) => app.id === active);
  const activePackage = packages.find((pkg) => pkg.manifest.id === active);
  const ActiveApp = activeApp && APP_COMPONENTS[activeApp.id];
  const storage = useMemo(() => active ? createModuleStorage({ workspaceId, moduleId: active }) : null, [workspaceId, active]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const leaveGuard = useRef(null);
  const requestLeave = (action) => {
    if (!leaveGuard.current || leaveGuard.current()) action();
  };
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    let mounted = true;
    setReady(false);
    setActive(null);
    setInstalled([]);
    setPackages([]);
    setPendingPackage(null);
    Promise.all([getInstalledApps(workspaceId), listAppPackages(workspaceId)]).then(([ids, apps]) => { if (mounted) { setInstalled(ids); setPackages(apps); setReady(true); } })
      .catch((err) => { if (mounted) setError(`Browser storage unavailable: ${err.message}`); });
    return () => { mounted = false; };
  }, [workspaceId]);
  async function toggleApp(id) {
    const app = catalog.find((item) => item.id === id);
    if (!ready || saving || !app) return;
    const pkg = packages.find((item) => item.manifest.id === id);
    if (!enabled.includes(id) && ((!APP_COMPONENTS[id] && !pkg) || missingAppData(app, { districts, facilities }).length)) return;
    setError('');
    setSaving(true);
    const next = installed.includes(id) ? installed.filter((value) => value !== id) : [...installed, id];
    try {
      if (pkg) {
        await setPackageEnabled(workspaceId, id, !pkg.enabled);
        setPackages(await listAppPackages(workspaceId));
      } else { await setInstalledApps(workspaceId, next); setInstalled(next); }
    }
    catch (err) { setError(`App settings were not saved: ${err.message}`); }
    finally { setSaving(false); }
  }
  async function previewPackage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setPendingPackage(null); setSaving(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('App ZIP must be at most 5 MB.');
      setPendingPackage(await readAppPackage(await file.arrayBuffer(), APP_REGISTRY.map((app) => app.id)));
    } catch (err) { setError(`App could not be added: ${err.message}`); }
    finally { setSaving(false); }
  }
  async function confirmPackage() {
    if (!pendingPackage || saving) return;
    setSaving(true); setError('');
    try {
      await installAppPackage(workspaceId, pendingPackage);
      setPackages(await listAppPackages(workspaceId));
      setPendingPackage(null);
    } catch (err) { setError(`App was not installed: ${err.message}`); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} onCancel={(event) => { event.preventDefault(); requestLeave(onClose); }}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          {active && <button title="Back to Apps" aria-label="Back to Apps" onClick={() => requestLeave(() => setActive(null))}><ArrowLeft size={18} /></button>}
          <h1>{activeApp ? activeApp.name : 'Workspace apps'}</h1>
          <span className={styles.muted}>{districts.length} admin areas</span>
        </div>
        <button aria-label="Close apps" title="Close apps" onClick={() => requestLeave(onClose)}><X size={20} /></button>
      </header>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!active ? <div className={styles.catalog}>
        <div className={styles.actions}>
          <button className={styles.primary} disabled={!ready || saving} onClick={() => upload.current.click()}>Add app</button>
          <a href="/apps/activity-planner.zip" download>Download example app</a>
          <a
            href="https://github.com/jmesplana/gdacs_ai/blob/main/templates/installable-app/README.md"
            target="_blank"
            rel="noopener noreferrer"
          >Build your own app</a>
          <input ref={upload} hidden type="file" accept=".zip" aria-label="App ZIP package" onChange={previewPackage} />
        </div>
        <p className={styles.muted}>Upload an app ZIP. Apps and saved plans stay in this browser and workspace. Start from the example app and the developer guide to build your own.</p>
        {pendingPackage && <section className={styles.appCard} aria-label="Review app installation">
          <h2>{pendingPackage.manifest.name}</h2>
          <p>{pendingPackage.manifest.description}</p>
          <p>By {pendingPackage.manifest.author} · Version {pendingPackage.manifest.version}</p>
          <p>Requested access: {pendingPackage.manifest.capabilities.map((value) => accessLabels[value]).join(', ') || 'None'}</p>
          <p>Required data: {pendingPackage.manifest.requiredData.map((value) => value.replaceAll('-', ' ')).join(', ') || 'None'}</p>
          {packages.some((pkg) => pkg.manifest.id === pendingPackage.manifest.id) && <p>This replaces the installed app code. Saved plans are retained.</p>}
          <button disabled={saving} onClick={confirmPackage}>Confirm installation</button>
          <button disabled={saving} onClick={() => setPendingPackage(null)}>Cancel</button>
        </section>}
        {!districts.length && <p role="status">No administrative boundaries loaded. Apps without boundary requirements can still be used.</p>}
        <div className={styles.appGrid}>
        {catalog.map((app) => {
          const missing = missingAppData(app, { districts, facilities });
          const unavailable = !APP_COMPONENTS[app.id] && !packages.some((pkg) => pkg.manifest.id === app.id);
          return <article key={app.id} className={styles.appCard}>
          <div className={styles.appCardTitle}>
            <Boxes size={22} color="#087f6a" aria-hidden="true" />
            <h2>{app.name}</h2>
          </div>
          <p>{app.description}</p>
          <p className={styles.muted}>By {app.author}</p>
          <p className={styles.muted}>Version {app.version} · {enabled.includes(app.id) ? 'Enabled in this workspace' : 'Not installed'}</p>
          {!!missing.length && <p role="status">Requires: {missing.map((value) => value.replaceAll('-', ' ')).join(', ')}.</p>}
          {unavailable && <p role="status">This app is unavailable in this release.</p>}
          <div className={`${styles.actions} ${styles.appCardActions}`}>
            <button disabled={!ready || saving || (!enabled.includes(app.id) && (unavailable || !!missing.length))} onClick={() => toggleApp(app.id)}>{enabled.includes(app.id) ? <Trash2 size={16} /> : <Download size={16} />}{enabled.includes(app.id) ? 'Disable app' : 'Install app'}</button>
            {enabled.includes(app.id) && <button disabled={!ready || saving || unavailable || !!missing.length} className={styles.primary} onClick={() => setActive(app.id)}>Open <ArrowUpRight size={16} /></button>}
          </div>
          {enabled.includes(app.id) && <p className={styles.muted}>Saved plans are retained when this app is disabled.</p>}
        </article>; })}
        </div>
      </div> : <AppBoundary key={`${workspaceId}:${active}`}>
        {activePackage ? <InstalledAppFrame pkg={activePackage} workspaceId={workspaceId} districts={districts} facilities={facilities} acledData={acledData} disasters={disasters} storage={storage} leaveGuard={leaveGuard} /> : ActiveApp ? <ActiveApp onOpenWorkspace={()=>requestLeave(onClose)} disasters={activeApp.capabilities.includes('read:disasters')?disasters:[]} storage={activeApp.capabilities.includes('write:plans') ? storage : undefined} workspaceId={workspaceId} districts={activeApp.capabilities.includes('read:boundaries') ? districts : []} facilities={activeApp.capabilities.includes('read:sites') ? facilities : []} acledData={activeApp.capabilities.includes('read:security') ? acledData : []} leaveGuard={leaveGuard} /> : <p role="alert">This app is unavailable. Return to Apps.</p>}
      </AppBoundary>}
    </div>
  </dialog>;
}
