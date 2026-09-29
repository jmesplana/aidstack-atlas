import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardSlide, dashboardSlideMetadata } from './DashboardBriefingDialog';
import { ReportingSlide } from './ReportingBriefing';
import CoordinationSummarySlide from './CoordinationSummarySlide';
import { SlideFrame, SvgText } from './BriefingPrimitives';

export async function renderPowerPointVisual({chapter,entry,page,total,input,briefing}) {
  const metadata=dashboardSlideMetadata({...input,entry,deck:chapter.deck,view:chapter.view,province:briefing.province,location:''});
  let element;
  if(chapter.type==='coordination')element=<CoordinationSummarySlide entry={entry} briefing={briefing} input={input} page={page} total={total} source={metadata.source}/>;
  else if(entry.kind==='empty')element=<SlideFrame {...metadata} title={chapter.label} asOf={input.asOf} page={page} total={total}><SvgText x={65} y={245} text="No eligible observations are available for this section at the reporting cut-off." fontSize={25} width={96}/></SlideFrame>;
  else if(chapter.type==='reporting')element=<ReportingSlide entry={entry} deck={chapter.deck} mode={chapter.mode} model={input.model} geometry={input.geometry} source={metadata.source} scope={briefing.scope} page={page} total={total}/>;
  else element=<DashboardSlide {...input} {...metadata} entry={entry} deck={chapter.deck} ringModel={briefing.ringModel} trendRows={briefing.trendRows} scopeTotal={briefing.scopeTotal} page={page} total={total}/>;
  const doc=new DOMParser().parseFromString(renderToStaticMarkup(element),'image/svg+xml'),svg=doc.documentElement;
  if(doc.querySelector('parsererror'))throw new Error('Unable to prepare a briefing slide.');
  const notes=[...svg.querySelectorAll('text, title')].filter(node=>node.tagName==='text'||!node.closest('text')).map(node=>node.querySelector('title')?.textContent||[...node.childNodes].map(n=>n.textContent).join(' ')).join('\n');
  svg.removeAttribute('class');svg.setAttribute('width','1920');svg.setAttribute('height','1080');
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}));
  const canvas=document.createElement('canvas');
  try {
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Unable to render a briefing slide.'));img.src=url;});
    canvas.width=1920;canvas.height=1080;
    const context=canvas.getContext('2d');if(!context)throw new Error('Image export is unavailable in this browser.');
    context.drawImage(img,0,0,1920,1080);
    return {data:canvas.toDataURL('image/png'),title:svg.querySelector('title')?.textContent||chapter.label,notes};
  }finally{URL.revokeObjectURL(url);canvas.width=0;canvas.height=0;}
}
