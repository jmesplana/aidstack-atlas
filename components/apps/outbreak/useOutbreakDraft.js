import { useEffect, useRef, useState } from 'react';

export const DRAFT_ID = '__outbreak_working_draft__';

// A draft uses the same workspace/module-scoped, revision-checked storage as
// saved reports. Only confirmed inputs enter snapshot(); pending uploads do not.
export default function useOutbreakDraft(storage, value, enabled) {
  const [candidate,setCandidate] = useState(null);
  const [ready,setReady] = useState(false);
  const [status,setStatus] = useState('');
  const [savedSignature,setSavedSignature] = useState('');
  const revision = useRef(0), queue = useRef(Promise.resolve()), generation = useRef(0), failed = useRef(false);
  const signature = enabled ? JSON.stringify(value) : '';
  const latest = useRef({ value, signature });
  latest.current = { value, signature };

  useEffect(() => {
    let live = true;
    storage.loadPlan(DRAFT_ID).then(draft => {
      if (!live) return;
      revision.current = draft?.revision || 0;
      setCandidate(draft || null);setReady(true);
    }).catch(error => { if(live){failed.current=true;setStatus(`Draft unavailable: ${error.message}`);} });
    return () => { live=false; };
  },[storage]);

  useEffect(() => {
    if (!enabled || !ready || candidate || failed.current || signature === savedSignature) return;
    setStatus('Saving draft…');
    const current = ++generation.current;
    const timer = setTimeout(() => {
      const pending = latest.current;
      queue.current = queue.current.then(async () => {
        if (failed.current || current !== generation.current) return;
        try {
          const saved = await storage.savePlan({ ...pending.value, id:DRAFT_ID, metadata:{name:'Working outbreak draft'} },revision.current);
          revision.current=saved.revision;
          setSavedSignature(pending.signature);
          if (current === generation.current) setStatus(`Draft saved ${new Date(saved.savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`);
        } catch (error) {
          failed.current=true;
          setStatus(`Draft not saved: ${error.message} Save a report version to keep your work.`);
        }
      });
    },1200);
    return () => clearTimeout(timer);
  },[enabled,ready,candidate,signature,savedSignature,storage]);

  function useCurrent() { generation.current++;setCandidate(null);setStatus(''); }
  async function flush(value) {
    if(!ready || candidate || failed.current)return;
    generation.current++;
    queue.current=queue.current.then(async()=>{
      if(failed.current)return;
      try {
        const saved=await storage.savePlan({...value,id:DRAFT_ID,metadata:{name:'Working outbreak draft'}},revision.current);
        revision.current=saved.revision;setSavedSignature(JSON.stringify(value));
        setStatus(`Draft saved ${new Date(saved.savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`);
      } catch(error) { failed.current=true;setStatus(`Draft not saved: ${error.message}`); }
    });
    await queue.current;
  }
  return { candidate, useCurrent, flush, status, saved:!!signature && signature===savedSignature };
}
