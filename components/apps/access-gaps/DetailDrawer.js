import { useEffect, useId, useRef } from 'react';
import ux from './AccessGaps.module.css';
export default function DetailDrawer({ title, onClose, children }) {
  const ref = useRef(null), id = useId();
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={ux.detailDialog} aria-labelledby={id} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
    <header className={ux.drawerHeader}><h2 id={id}>{title}</h2><button type="button" onClick={onClose} aria-label={`Close ${title}`}>Close</button></header>
    <div className={ux.drawerBody}>{children}</div>
  </dialog>;
}
