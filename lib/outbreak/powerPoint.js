import PptxGenJS from 'pptxgenjs';

export const POWERPOINT_MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const powerPointSlideCount=(briefing,requests='')=>2+briefing.visualCount+briefing.chapters.filter(c=>c.appendix).length+(requests.trim()?1:0)+Math.max(1,Math.ceil(briefing.sourceRegister.length/4));
const W=13.333333,H=7.5;
const check=signal=>{if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

// The supplied renderer captures the same SVG as the dashboard. Keeping it
// injectable allows package/notes validation without a browser or live feeds.
export async function createCoordinationPowerPoint({briefing,preparedBy='',keyMessage='',requests='',renderVisual,onProgress=()=>{},signal}) {
  const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';
  pptx.author=preparedBy||'Aidstack';pptx.subject=`Coordination briefing · cut-off ${briefing.asOf}`;
  pptx.title=briefing.title;pptx.company='';pptx.lang='en-GB';
  pptx.theme={headFontFace:'Arial',bodyFontFace:'Arial',lang:'en-GB'};
  const sourcePages=Math.max(1,Math.ceil(briefing.sourceRegister.length/4));
  const total=powerPointSlideCount(briefing,requests);
  let page=0;
  const text=(slide,value,x,y,w,h,options={})=>slide.addText(String(value),{x,y,w,h,fontFace:'Arial',fontSize:18,color:'18334B',margin:0,breakLine:false,fit:'shrink',...options});
  function native(title,subtitle=''){
    const slide=pptx.addSlide();page++;
    slide.background={color:'FFFFFF'};
    slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:W,h:.08,fill:{color:'17576B'},line:{color:'17576B'}});
    text(slide,title,.4,.35,12.4,.7,{fontSize:28,bold:true});
    if(subtitle)text(slide,subtitle,.4,1.08,12.4,.5,{fontSize:13,color:'526B7B'});
    text(slide,`Cut-off ${briefing.asOf} · ${briefing.scope}`,.4,7.02,11,.25,{fontSize:10});
    text(slide,`${page}/${total}`,12,7.02,.9,.25,{fontSize:10,align:'right'});
    return slide;
  }
  const cover=native(briefing.title,'Epidemiological situation and response · coordination briefing');
  text(cover,'Prepared for the Ebola coordination team',.55,2.05,12,1,{fontSize:32,bold:true});
  text(cover,briefing.availability,.55,3.25,12,.8,{fontSize:20});
  text(cover,`${briefing.scope}\n${total} slides${briefing.includeAppendix?' · includes detailed appendix':' · coordination briefing'}`,.55,4.3,12,.9,{fontSize:20});
  text(cover,preparedBy?`Prepared by ${preparedBy}`:'Prepared from the currently loaded dashboard evidence',.55,5.55,12,.5,{fontSize:17});
  cover.addNotes(`${briefing.availability}\nGenerated ${new Date().toISOString()}.\n${briefing.methods.join('\n')}\nMaps/charts preserve dashboard visuals. Briefing text and speaker notes are editable.`);
  const summary=native('Key findings',briefing.availability);
  if(keyMessage.trim())text(summary,keyMessage.trim(),.55,1.7,12.1,.85,{fontSize:20,bold:true});
  const start=keyMessage.trim()?2.75:1.75,step=keyMessage.trim() ? 0.75 : 0.93;
  briefing.findings.forEach((finding,i)=>text(summary,`${i+1}. ${finding}`,.55,start+i*step,12.1,step-.1,{fontSize:18}));
  summary.addNotes([keyMessage.trim(),...briefing.findings,briefing.availability].filter(Boolean).join('\n\n'));
  let completed=0;
  async function renderChapters(chapters){
  for(const chapter of chapters){
    check(signal);
    if(chapter.appendix){
    const divider=native(`Appendix · ${chapter.label}`,`${chapter.deck.pages.length} evidence slides · ${chapter.id==='overview'?'National rings include all loaded provinces':briefing.scope}`);
    text(divider,chapter.label,.55,2.55,12,1.25,{fontSize:36,bold:true});
    text(divider,briefing.availability,.55,4.2,12,.9,{fontSize:20});
    divider.addNotes(`${chapter.label}. ${briefing.availability}\nDetailed pages follow without truncating the selected section.`);
    }
    for(const [index,entry] of chapter.deck.pages.entries()){
      check(signal);onProgress({completed,total:briefing.visualCount,label:chapter.label});await pause();
      const visual=await renderVisual({chapter,entry,index,page,total});check(signal);
      const slide=pptx.addSlide();page++;
      slide.addImage({data:visual.data,x:0,y:0,w:W,h:H,altText:visual.title||chapter.label,objectName:visual.title||chapter.label});
      slide.addNotes(`${visual.title||chapter.label}\nSection: ${chapter.label}\n${briefing.availability}\n\n${visual.notes||''}`);
      completed++;
    }
  }
  }
  await renderChapters(briefing.chapters.filter(c=>!c.appendix));
  if(requests.trim()){
    const slide=native('Coordination requests',preparedBy?`Prepared by ${preparedBy}`:'Coordinator-provided requests');
    text(slide,requests.trim(),.55,1.9,12.1,4.7,{fontSize:24});slide.addNotes(requests.trim());
  }
  for(let i=0;i<sourcePages;i++){
    const slide=native('Sources and data availability',briefing.availability);
    const sources=briefing.sourceRegister.slice(i*4,i*4+4);
    sources.forEach((source,j)=>{
      text(slide,source.name,.55,1.8+j*1.15,12,.28,{fontSize:18,bold:true});
      text(slide,source.source,.55,2.16+j*1.15,12,.62,{fontSize:13});
      if(source.retrieved)text(slide,`Retrieved ${source.retrieved}`,.55,2.78+j*1.15,12,.2,{fontSize:10});
    });
    if(!sources.length)text(slide,'No source metadata is available.',.55,2,12,1);
    slide.addNotes(sources.map(s=>`${s.name}\n${s.source}\nRetrieved: ${s.retrieved||'not recorded'}`).join('\n\n')+'\n\nInterpretation and methods\n'+briefing.methods.join('\n\n'));
  }
  await renderChapters(briefing.chapters.filter(c=>c.appendix));
  check(signal);onProgress({completed,total:briefing.visualCount,label:'Packaging PowerPoint'});await pause();
  const result=await pptx.write({outputType:'blob',compression:true});check(signal);
  return result;
}
