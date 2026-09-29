import { createContext, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './outbreak.module.css';

const SlideViewContext=createContext(null);

// Keep each tab's briefing tied to its local filters while giving its action a
// shared home. Full-screen dashboards provide their own slot inside the dialog.
export function SlideViewProvider({children}) {
  const [target,setTarget]=useState(null);
  const value=useMemo(()=>({target,setTarget}),[target]);
  return <SlideViewContext.Provider value={value}>{children}</SlideViewContext.Provider>;
}

export function SlideViewSlot() {
  const context=useContext(SlideViewContext);
  return <div ref={context?.setTarget} className={styles.slideViewSlot}/>;
}

export default function SlideViewActions({children}) {
  const context=useContext(SlideViewContext);
  const content=<div className={styles.reportingBriefingActions}>{children}</div>;
  return context?(context.target?createPortal(content,context.target):null):content;
}
