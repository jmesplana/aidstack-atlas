// Coordinates in the map viewport, independent of SVG content bounds.
export function zoomView(view,factor,anchor,dimensions=[900,440]) {
  const [widthPixels,heightPixels]=dimensions;
  anchor=anchor||[widthPixels/2,heightPixels/2];
  const width=Math.min(3600,Math.max(5,view[2]*factor)),ratio=width/view[2];
  return [view[0]+anchor[0]/widthPixels*view[2]*(1-ratio),view[1]+anchor[1]/heightPixels*view[3]*(1-ratio),width,width*heightPixels/widthPixels];
}
export function placeLabels(features,view,selected,allowed,scale=1,dimensions=[900,440]) {
  const [widthPixels,heightPixels]=dimensions;
  const boxes=[],result=[];
  const ordered=[...features].sort((a,b)=>(b.name===selected)-(a.name===selected));
  for(const f of ordered){
    if(!allowed.has(f.name))continue;
    const x=(f.center[0]-view[0])/view[2]*widthPixels,y=(f.center[1]-view[1])/view[3]*heightPixels;
    if(x<0||x>widthPixels||y<0||y>heightPixels)continue;
    const width=Math.min(widthPixels-30,Math.max(28,(f.labelWidth||f.name.length*12+12)/scale)),height=21/scale;
    for(const offset of [0,-26/scale,26/scale,-52/scale,52/scale]){
      const left=Math.max(8,Math.min(widthPixels-8-width,x-width/2)),top=Math.max(8,Math.min(heightPixels-8-height,y-10/scale+offset));
      const box=[left,top,left+width,top+height];
      if(boxes.some(b=>box[0]<b[2]+4&&box[2]>b[0]-4&&box[1]<b[3]+3&&box[3]>b[1]-3))continue;
      boxes.push(box);result.push({...f,labelX:view[0]+(left+width/2)/widthPixels*view[2],labelY:view[1]+(top+15/scale)/heightPixels*view[3]});break;
    }
  }
  return result;
}
