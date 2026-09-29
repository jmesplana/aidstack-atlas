import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

const ExportDialog=dynamic(()=>import('./PowerPointExportDialog'),{ssr:false,loading:()=> <p role="status">Preparing PowerPoint export…</p>});

export default function PowerPointExport(props) {
  const [captured,setCaptured]=useState(null),button=useRef(null);
  return <><button ref={button} type="button" onClick={()=>setCaptured({...props})}>Export PowerPoint</button>
    {captured&&<ExportDialog input={captured} onClose={()=>{setCaptured(null);button.current?.focus();}}/>}
  </>;
}
