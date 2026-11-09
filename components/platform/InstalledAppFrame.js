import { useLayoutEffect, useMemo, useRef } from 'react';
import { appFrameDocument, handleAppRequest } from '../../lib/platform/appBridge';

export default function InstalledAppFrame({ pkg, workspaceId, districts, facilities, acledData = [], disasters = [], storage, leaveGuard }) {
  const frame = useRef(null);
  const workspaceData = useRef({ districts, facilities, acledData, disasters });
  workspaceData.current = { districts, facilities, acledData, disasters };
  // Render the actual srcdoc on the first commit. Navigating first to an empty
  // srcdoc and replacing it in a passive effect can leave an opaque sandbox blank.
  const document = useMemo(() => appFrameDocument(pkg.html), [pkg.html]);
  useLayoutEffect(() => {
    let channel;
    let disposed = false;
    let dirty = false;
    const guard = () => !dirty || window.confirm('Leave this app without saving?');
    leaveGuard.current = guard;
    const unload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    const connect = (event) => {
      if (event.source !== frame.current?.contentWindow || event.data !== 'aidstack:ready' || channel) return;
      channel = new MessageChannel();
      let inFlight = 0;
      channel.port1.onmessage = async ({ data }) => {
        if (disposed || !data || !Number.isSafeInteger(data.id)) return;
        if (inFlight >= 20) { channel.port1.postMessage({ id: data.id, error: 'Too many app requests.' }); return; }
        inFlight++;
        try {
          const result = await handleAppRequest(data, { manifest: pkg.manifest, workspaceId, ...workspaceData.current, storage, setDirty: (value) => { dirty = value; } });
          if (!disposed) channel.port1.postMessage({ id: data.id, result });
        } catch (error) {
          if (!disposed) channel.port1.postMessage({ id: data.id, error: error.message });
        } finally { inFlight--; }
      };
      frame.current.contentWindow.postMessage('aidstack:connect', '*', [channel.port2]);
    };
    window.addEventListener('message', connect);
    window.addEventListener('beforeunload', unload);
    return () => {
      disposed = true;
      channel?.port1.close();
      window.removeEventListener('message', connect);
      window.removeEventListener('beforeunload', unload);
      if (leaveGuard.current === guard) leaveGuard.current = null;
    };
  }, [pkg, workspaceId, storage, leaveGuard]);
  return <iframe ref={frame} title={pkg.manifest.name} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" srcDoc={document} style={{ border: 0, width: '100%', flex: 1, minHeight: 400 }} />;
}
