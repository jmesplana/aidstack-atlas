import PptxGenJS from 'pptxgenjs';

export const POWERPOINT_MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const powerPointSlideCount=(briefing,requests='')=>2+briefing.visualCount+briefing.chapters.filter(c=>c.appendix).length+(requests.trim()?1:0)+Math.max(1,Math.ceil(briefing.sourceRegister.length/4));
const W=13.333333,H=7.5;
// IFRC primary palette: https://brand.ifrc.org/ifrc-brand-system/basics/colour
// Muted text and rules use neutral greys for hierarchy on white.
const BRAND={red:'EE2435',navy:'011E41',black:'000000',white:'FFFFFF',muted:'595959',rule:'D9D9D9'};
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
  const text=(slide,value,x,y,w,h,options={})=>slide.addText(String(value),{x,y,w,h,fontFace:'Arial',fontSize:18,color:BRAND.black,margin:0,breakLine:false,fit:'shrink',...options});
  function native(title,subtitle=''){
    const slide=pptx.addSlide();page++;
    slide.background={color:BRAND.white};
    slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:W,h:.08,fill:{color:BRAND.red},line:{color:BRAND.red}});
    text(slide,title,.4,.35,12.4,.7,{fontSize:28,bold:true,color:BRAND.navy});
    if(subtitle)text(slide,subtitle,.4,1.08,12.4,.5,{fontSize:13,color:BRAND.muted});
    text(slide,`Cut-off ${briefing.asOf} · ${briefing.scope}`,.4,7.02,11,.25,{fontSize:10});
    text(slide,`${page}/${total}`,12,7.02,.9,.25,{fontSize:10,align:'right'});
    return slide;
  }
  // Covers and dividers have one headline, with source dates kept in a quiet
  // footer. Content slides retain their compact heading and body layout.
  function introduction({label,title,subtitle,detail,credit=''}){
    const slide=pptx.addSlide();page++;
    slide.background={color:BRAND.white};
    slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:.16,h:H,fill:{color:BRAND.red},line:{color:BRAND.red}});
    text(slide,label,.7,.65,11.9,.35,{fontSize:12,bold:true,color:BRAND.navy,charSpacing:2});
    slide.addShape(pptx.ShapeType.rect,{x:.7,y:1.55,w:.8,h:.06,fill:{color:BRAND.red},line:{color:BRAND.red}});
    text(slide,title,.7,1.95,11.9,1.65,{fontSize:40,bold:true,color:BRAND.navy,valign:'top'});
    text(slide,subtitle,.7,3.85,11.9,.7,{fontSize:21,color:BRAND.muted,valign:'top'});
    text(slide,detail,.7,4.75,11.9,.55,{fontSize:16,valign:'top'});
    if(credit)text(slide,credit,.7,5.45,11.9,.55,{fontSize:14,color:BRAND.muted,valign:'top'});
    slide.addShape(pptx.ShapeType.line,{x:.7,y:6.28,w:11.9,h:0,line:{color:BRAND.rule,width:.8}});
    text(slide,briefing.availability,.7,6.46,11.9,.42,{fontSize:11,color:BRAND.muted,valign:'top'});
    text(slide,'Aidstack · Coordination briefing',.7,7.02,10.5,.25,{fontSize:10,color:BRAND.muted});
    text(slide,`${page}/${total}`,11.7,7.02,.9,.25,{fontSize:10,color:BRAND.muted,align:'right'});
    return slide;
  }
  const cover=introduction({
    label:'COORDINATION BRIEFING',title:briefing.title,
    subtitle:'Epidemiological situation and response',
    detail:`${briefing.scope} · Reporting cut-off ${briefing.asOf}`,
    credit:preparedBy.trim()?`Prepared by ${preparedBy.trim()}`:''
  });
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
    const divider=introduction({
      label:'Appendix',title:chapter.label,
      subtitle:chapter.id==='overview'?'National rings include all loaded provinces':briefing.scope,
      detail:`${chapter.deck.pages.length} supporting evidence ${chapter.deck.pages.length===1?'slide':'slides'}`
    });
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
