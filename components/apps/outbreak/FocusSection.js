import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import styles from './outbreak.module.css';

// Keep the same content mounted while the native dialog moves into the top layer.
export default function FocusSection({ title, label, className='', headingLevel=3, actions, children }) {
  const [focused,setFocused]=useState(false);
  const dialogRef=useRef(null),buttonRef=useRef(null),heightRef=useRef(0);
  const Heading=`h${headingLevel}`;
  useEffect(()=>{
    if(!focused)return;
    const dialog=dialogRef.current,previous=document.activeElement,overflow=document.body.style.overflow;
    dialog.close();
    dialog.showModal();
    buttonRef.current?.focus();
    if(overflow!=='hidden')document.body.style.overflow='hidden';
    return()=>{
      dialog.close();
      if(dialog.isConnected)dialog.show();
      if(overflow!=='hidden')document.body.style.overflow=overflow;
      if(previous?.isConnected)previous.focus();
    };
  },[focused]);
  function toggle(){
    if(!focused)heightRef.current=dialogRef.current.getBoundingClientRect().height;
    setFocused(value=>!value);
  }
  return <>
    <dialog open ref={dialogRef} role={focused?'dialog':'region'} aria-label={label} aria-modal={focused?true:undefined} data-section-focus={focused?'true':undefined} className={`${className} ${styles.focusSection}`}
      onCancel={event=>{event.preventDefault();event.stopPropagation();setFocused(false);}}
      onKeyDown={event=>{if(focused&&event.key==='Escape'){event.preventDefault();event.stopPropagation();setFocused(false);}}}>
      <div className={styles.focusSectionHeading}>
        <Heading>{title}</Heading>
        <div className={styles.focusSectionActions}>{actions}<button ref={buttonRef} type="button" onClick={toggle} aria-label={focused?`Return from ${label}`:`Focus ${label}`} aria-expanded={focused}>{focused?<Minimize2 size={15}/>:<Maximize2 size={15}/>} {focused?'Back to dashboard':'Focus'}</button></div>
      </div>
      {children}
    </dialog>
    {focused&&<div aria-hidden="true" style={{height:heightRef.current,minWidth:0,minHeight:0}}/>}
  </>;
}
