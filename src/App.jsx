import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const C = {
  bg: "#060b14", grid: "#0e1525", gridMajor: "#141f35",
  skiFill: "rgba(0, 200, 240, 0.04)", skiStroke: "#00ccee", skiGlow: "rgba(0, 204, 238, 0.25)",
  control: "#ff6b35", controlHover: "#ffb800", controlActive: "#ff3060",
  handle: "#886bff", handleLine: "rgba(136,107,255,0.35)",
  dim: "rgba(255,255,255,0.3)", dimText: "rgba(255,255,255,0.7)",
  center: "rgba(255,255,255,0.07)", panel: "#0b1120", panelBorder: "#1a2540",
  inputBg: "#0f1829", inputBorder: "#1e2d4a", inputFocus: "#00ccee",
  label: "#6b7fa0", value: "#e2e8f0", heading: "#00ccee",
  snow: "rgba(255,255,255,0.15)", profileFill: "rgba(0, 200, 240, 0.06)",
  coreFill: "rgba(255, 180, 80, 0.08)", coreStroke: "#ffb850", coreGlow: "rgba(255,184,80,0.25)",
  coreNode: "#ffb850",
  flexStroke: "#ff4080", flexFill: "rgba(255, 64, 128, 0.08)", flexGlow: "rgba(255,64,128,0.3)",
  eiStroke: "#40ff80", eiFill: "rgba(64, 255, 128, 0.06)",
  exportBtn: "#2a7fff",
};

const WOODS = {
  paulownia:{name:"Paulownia",E:5000,density:280},poplar:{name:"Poplar",E:8800,density:420},
  aspen:{name:"Aspen",E:9000,density:385},ash:{name:"Ash",E:12000,density:650},
  maple:{name:"Hard Maple",E:12600,density:670},birch:{name:"Birch",E:13900,density:635},
  bamboo:{name:"Bamboo",E:14000,density:725},
};
const GLASS = {
  triax23:{name:"Triax 23oz",E:26900,thick:0.57},triax19:{name:"Triax 19oz",E:24200,thick:0.48},
  biax:{name:"Biaxial \u00B145",E:12000,thick:0.45},
};
const METALS = {
  none:{name:"None",E:0,thick:0},titanal:{name:"Titanal 0.4mm",E:71700,thick:0.4},
  titanalH:{name:"Titanal 0.6mm",E:71700,thick:0.6},
};
const CARBON = {
  none:{name:"None",E:0,width:0},narrow:{name:"UD 15mm",E:135000,width:15},
  medium:{name:"UD 25mm",E:135000,width:25},wide:{name:"UD Full Width",E:135000,width:0},
};
const CARBON_THICK=0.3,EDGE_E=200000,EDGE_W=2,EDGE_H=2,BASE_E=800,BASE_THICK=1.2;

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function bez(a,b,c,d,t){const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;}
function evalBezSeg(nodes,seg,lt){
  const n0=nodes[seg],n1=nodes[seg+1];
  const hx2=n0.hx2!==undefined?n0.hx2:n0.hx,hy2=n0.hy2!==undefined?n0.hy2:n0.hy;
  return{x:bez(n0.x,n0.x+hx2,n1.x+n1.hx,n1.x,lt),y:bez(n0.y,n0.y+hy2,n1.y+n1.hy,n1.y,lt)};
}
function makeRoundedTip(){return[
  {x:1.0,y:0.0,hx:0,hy:0,hx2:0,hy2:0.3},{x:0.95,y:0.5,hx:0.02,hy:-0.15,hx2:-0.05,hy2:0.15},
  {x:0.55,y:0.85,hx:0.12,hy:-0.03,hx2:-0.18,hy2:0.05},{x:0.0,y:1.0,hx:0.15,hy:0,hx2:0,hy2:0},
];}
function makeRoundedTail(){return[
  {x:0.0,y:0.0,hx:0,hy:0,hx2:0.02,hy2:0.15},{x:0.55,y:0.15,hx:-0.12,hy:-0.05,hx2:0.18,hy2:0.05},
  {x:0.95,y:0.5,hx:-0.1,hy:-0.12,hx2:0.02,hy2:0.15},{x:1.0,y:1.0,hx:0,hy:-0.3,hx2:0,hy2:0},
];}
function makeSwallowTailR(){return[
  {x:0.40,y:0.0,hx:0,hy:0,hx2:0.12,hy2:0.06},
  {x:0.92,y:0.15,hx:-0.06,hy:-0.04,hx2:0.03,hy2:0.08},
  {x:1.0,y:0.45,hx:0,hy:-0.1,hx2:0,hy2:0.15},
  {x:1.0,y:1.0,hx:0,hy:-0.2,hx2:0,hy2:0},
];}
function makeSwallowTailL(){return[
  {x:0.40,y:0.0,hx:0,hy:0,hx2:0.12,hy2:0.06},
  {x:0.92,y:0.15,hx:-0.06,hy:-0.04,hx2:0.03,hy2:0.08},
  {x:1.0,y:0.45,hx:0,hy:-0.1,hx2:0,hy2:0.15},
  {x:1.0,y:1.0,hx:0,hy:-0.2,hx2:0,hy2:0},
];}
function makeDefaultCore(){return[
  {pos:0.0,thick:2.0},{pos:0.10,thick:2.5},{pos:0.20,thick:6.0},
  {pos:0.35,thick:10.0},{pos:0.50,thick:11.5},{pos:0.65,thick:10.0},
  {pos:0.80,thick:6.0},{pos:0.90,thick:2.5},{pos:1.0,thick:2.0},
];}
const DEFAULT_LAYUP={wood:"poplar",glass:"triax23",glassLayers:1,metal:"none",carbon:"none",carbonLayers:1};
const DEFAULT_SKI={
  length:1800,tipWidth:132,waistWidth:98,tailWidth:120,
  tipLength:240,tailLength:170,tipHeight:45,tailHeight:30,camberHeight:3,
  tipNodesR:makeRoundedTip(),tipNodesL:makeRoundedTip(),
  tailNodesR:makeRoundedTail(),tailNodesL:makeRoundedTail(),
  tipSymmetric:true,tailSymmetric:true,
  coreProfile:makeDefaultCore(),layup:{...DEFAULT_LAYUP},
};

// ══════════════ EI ENGINE ══════════════
function getWidthAtPos(ski,pos){
  const L=ski.length,TL=ski.tipLength,TAIL=ski.tailLength;
  const xmm=pos*L,tailC=TAIL,tipC=L-TL,waistPos=tailC+(tipC-tailC)*0.48;
  if(xmm<=0)return ski.tailWidth;if(xmm>=L)return ski.tipWidth;
  if(xmm<=tailC)return ski.tailWidth;if(xmm>=tipC)return ski.tipWidth;
  if(xmm<=waistPos){const t=(xmm-tailC)/(waistPos-tailC);return ski.tailWidth+t*t*(3-2*t)*(ski.waistWidth-ski.tailWidth);}
  const t=(xmm-waistPos)/(tipC-waistPos);return ski.waistWidth+t*t*(3-2*t)*(ski.tipWidth-ski.waistWidth);
}
function getCoreThickAt(profile,pos){
  if(pos<=profile[0].pos)return profile[0].thick;if(pos>=profile[profile.length-1].pos)return profile[profile.length-1].thick;
  for(let i=0;i<profile.length-1;i++){if(pos>=profile[i].pos&&pos<=profile[i+1].pos){
    const t=(pos-profile[i].pos)/(profile[i+1].pos-profile[i].pos);return profile[i].thick+t*t*(3-2*t)*(profile[i+1].thick-profile[i].thick);}}
  return 0;
}
function computeEIAtStation(skiWidth,coreThick,layup){
  const glass=GLASS[layup.glass],metal=METALS[layup.metal],wood=WOODS[layup.wood],carbon=CARBON[layup.carbon];
  const nG=layup.glassLayers||1,nC=layup.carbonLayers||1,cW=carbon.width===0?skiWidth:carbon.width;
  const layers=[];
  layers.push({E:BASE_E,b:skiWidth,t:BASE_THICK});
  layers.push({E:EDGE_E,b:EDGE_W*2,t:EDGE_H});
  for(let i=0;i<nG;i++)layers.push({E:glass.E,b:skiWidth,t:glass.thick});
  if(metal.E>0)layers.push({E:metal.E,b:skiWidth,t:metal.thick});
  if(carbon.E>0)for(let i=0;i<nC;i++)layers.push({E:carbon.E,b:cW,t:CARBON_THICK});
  layers.push({E:wood.E,b:skiWidth,t:Math.max(coreThick,0.5)});
  if(carbon.E>0)for(let i=0;i<nC;i++)layers.push({E:carbon.E,b:cW,t:CARBON_THICK});
  if(metal.E>0)layers.push({E:metal.E,b:skiWidth,t:metal.thick});
  for(let i=0;i<nG;i++)layers.push({E:glass.E,b:skiWidth,t:glass.thick});
  let yBot=0;const yc=[];
  for(const l of layers){yc.push(yBot+l.t/2);yBot+=l.t;}
  let sEA=0,sEAy=0;
  for(let i=0;i<layers.length;i++){const ea=layers[i].E*layers[i].b*layers[i].t;sEA+=ea;sEAy+=ea*yc[i];}
  const ybar=sEA>0?sEAy/sEA:0;
  let EI=0;
  for(let i=0;i<layers.length;i++){const{E,b,t}=layers[i];const d=yc[i]-ybar;EI+=E*(b*t*t*t/12+b*t*d*d);}
  return EI;
}
function computeFlexProfile(ski){
  const N=100,stations=[];
  for(let i=0;i<=N;i++){
    const pos=i/N,w=getWidthAtPos(ski,pos),ct=getCoreThickAt(ski.coreProfile,pos);
    const ei=computeEIAtStation(w,ct,ski.layup);
    stations.push({pos,xmm:pos*ski.length,width:w,coreThick:ct,ei,kCant:3*ei/(1e6)});
  }
  const span=ski.length-ski.tipLength-ski.tailLength,tailStart=ski.tailLength;
  let integral=0;const dx=span/N;
  for(let i=0;i<=N;i++){
    const x=i*dx,m=(x<=span/2)?x/2:(span-x)/2;
    const pos=(tailStart+x)/ski.length;
    const ei=computeEIAtStation(getWidthAtPos(ski,pos),getCoreThickAt(ski.coreProfile,pos),ski.layup);
    const f=ei>0?(m*m)/ei:0;integral+=(i===0||i===N?0.5:1.0)*f*dx;
  }
  const k3pt=integral>0?1/integral:0,midIdx=Math.round(N*0.5);
  return{stations,k3pt,peakK:Math.max(...stations.map(s=>s.kCant)),underfootK:stations[midIdx].kCant,peakEI:Math.max(...stations.map(s=>s.ei))};
}
function flexRating(k){
  if(k<400)return{label:"Very Soft",color:"#4ecdc4"};if(k<550)return{label:"Soft",color:"#45b7d1"};
  if(k<700)return{label:"Medium",color:"#f9ca24"};if(k<850)return{label:"Stiff",color:"#ff6b35"};
  return{label:"Very Stiff",color:"#ff3060"};
}

// ══════════════ GEOMETRY ══════════════
function sampleShapeNodes(nodes,nPts){
  const pts=[];for(let seg=0;seg<nodes.length-1;seg++)
    for(let i=(seg===0?0:1);i<=nPts;i++)pts.push(evalBezSeg(nodes,seg,i/nPts));return pts;
}
function computeOutline(ski){
  const{length:L,tipWidth:TW,waistWidth:WW,tailWidth:TAW,tipLength:TL,tailLength:TAIL}=ski;
  const tipContactY=L-TL,tailContactY=TAIL,waistY=tailContactY+(tipContactY-tailContactY)*0.48;
  const nSC=50,nSH=24;
  const rTP=sampleShapeNodes(ski.tailNodesR,nSH),rTiP=sampleShapeNodes(ski.tipNodesR,nSH);
  const lTP=ski.tailSymmetric?rTP:sampleShapeNodes(ski.tailNodesL,nSH);
  const lTiP=ski.tipSymmetric?rTiP:sampleShapeNodes(ski.tipNodesL,nSH);
  const buildSide=(tailPts,tipPts,sign)=>{
    const side=[],tw2=TAW/2,ww2=WW/2,tipw2=TW/2;
    tailPts.forEach(pt=>side.push({x:sign*pt.x*tw2,y:pt.y*TAIL}));
    const tailLen=waistY-tailContactY;
    for(let i=1;i<=nSC;i++){const t=i/nSC,b=t*t*(3-2*t);side.push({x:sign*(tw2+b*(ww2-tw2)),y:tailContactY+t*tailLen});}
    const tipLen=tipContactY-waistY;
    for(let i=1;i<=nSC;i++){const t=i/nSC,b=t*t*(3-2*t);side.push({x:sign*(ww2+b*(tipw2-ww2)),y:waistY+t*tipLen});}
    tipPts.forEach(pt=>side.push({x:sign*pt.x*tipw2,y:tipContactY+pt.y*TL}));return side;
  };
  return{right:buildSide(rTP,rTiP,1),left:buildSide(lTP,lTiP,-1),waistY,tipContactY,tailContactY};
}
function computeDerived(ski){
  const ee=ski.length-ski.tipLength-ski.tailLength,avg=(ski.tipWidth+ski.tailWidth)/2;
  const depth=(avg-ski.waistWidth)/2,radius=depth>0.5?(ee*ee)/(8*depth)/1000:Infinity;
  return{effectiveEdge:ee,sidecutRadius:radius};
}
function makePreset(name,dims,tipR,tipL,tailR,tailL,tipSym,tailSym,profile,core,layup){
  return{name,...dims,tipNodesR:tipR,tipNodesL:tipL||tipR,tailNodesR:tailR,tailNodesL:tailL||tailR,
    tipSymmetric:tipSym!==false,tailSymmetric:tailSym!==false,...profile,
    coreProfile:core||makeDefaultCore(),layup:layup||{...DEFAULT_LAYUP}};
}
const rT=makeRoundedTip(),rTa=makeRoundedTail();
const spatulaTip=[{x:1.0,y:0.0,hx:0,hy:0,hx2:0,hy2:0.25},{x:1.0,y:0.4,hx:0,hy:-0.1,hx2:0,hy2:0.15},
  {x:0.85,y:0.7,hx:0.05,hy:-0.08,hx2:-0.15,hy2:0.08},{x:0.0,y:1.0,hx:0.2,hy:0,hx2:0,hy2:0}];
const PRESETS=[
  makePreset("All-Mtn",{length:1780,tipWidth:131,waistWidth:98,tailWidth:119,tipLength:230,tailLength:160},rT,null,rTa,null,true,true,{tipHeight:42,tailHeight:28,camberHeight:3}),
  makePreset("Powder",{length:1860,tipWidth:142,waistWidth:112,tailWidth:128,tipLength:310,tailLength:200},rT,null,rTa,null,true,true,{tipHeight:55,tailHeight:35,camberHeight:2}),
  makePreset("Spatula",{length:1800,tipWidth:138,waistWidth:100,tailWidth:118,tipLength:280,tailLength:160},spatulaTip,null,rTa,null,true,true,{tipHeight:50,tailHeight:28,camberHeight:3}),
  makePreset("Swallow",{length:1760,tipWidth:126,waistWidth:100,tailWidth:130,tipLength:240,tailLength:260},
    rT,null,makeSwallowTailR(),makeSwallowTailL(),true,false,{tipHeight:45,tailHeight:25,camberHeight:3}),
  makePreset("Twin Tip",{length:1720,tipWidth:118,waistWidth:90,tailWidth:118,tipLength:220,tailLength:220},rT,null,rTa,null,true,true,{tipHeight:40,tailHeight:40,camberHeight:3}),
];

// ══════════════ EXPORT ══════════════
function getFullOutlinePoints(ski){
  const{right,left}=computeOutline(ski);
  const pts=[];
  right.forEach(p=>pts.push({x:p.x,y:p.y}));
  for(let i=left.length-1;i>=0;i--)pts.push({x:left[i].x,y:left[i].y});
  return pts;
}
function downloadFile(content,filename,mime){
  const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}
function exportPlanSVG(ski){
  const pts=getFullOutlinePoints(ski);const pad=10;
  const minX=Math.min(...pts.map(p=>p.x))-pad,maxX=Math.max(...pts.map(p=>p.x))+pad;
  const minY=Math.min(...pts.map(p=>p.y))-pad,maxY=Math.max(...pts.map(p=>p.y))+pad;
  const w=maxX-minX,h=maxY-minY;
  const pathD=pts.map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(2)},${(maxY-p.y+minY).toFixed(2)}`).join(' ')+' Z';
  const marks=ski.coreProfile.map(cp=>{
    const xmm=cp.pos*ski.length,wh=getWidthAtPos(ski,cp.pos)/2,cy=maxY-xmm+minY;
    return `<line x1="${(-wh).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${wh.toFixed(2)}" y2="${cy.toFixed(2)}" stroke="#ff8800" stroke-width="0.3" stroke-dasharray="2,2"/>
    <text x="${(wh+3).toFixed(2)}" y="${(cy+1).toFixed(2)}" font-size="3" fill="#ff8800">${cp.thick.toFixed(1)}mm</text>`;
  }).join('\n    ');
  const svg=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">
  <title>Ski Plan - ${ski.length}mm ${ski.tipWidth}-${ski.waistWidth}-${ski.tailWidth}</title>
  <g id="outline"><path d="${pathD}" fill="none" stroke="#000" stroke-width="0.5"/></g>
  <g id="centerline"><line x1="0" y1="${minY.toFixed(2)}" x2="0" y2="${maxY.toFixed(2)}" stroke="#0088ff" stroke-width="0.2" stroke-dasharray="4,4"/></g>
  <g id="core-stations">${marks}</g>
</svg>`;
  downloadFile(svg,`ski-plan-${ski.length}mm.svg`,"image/svg+xml");
}
function exportPlanDXF(ski){
  const pts=getFullOutlinePoints(ski);
  let dxf=`0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n3\n`;
  dxf+=`0\nLAYER\n2\nOUTLINE\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
  dxf+=`0\nLAYER\n2\nCENTERLINE\n70\n0\n62\n5\n6\nCONTINUOUS\n`;
  dxf+=`0\nLAYER\n2\nCORE_STATIONS\n70\n0\n62\n1\n6\nCONTINUOUS\n`;
  dxf+=`0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;
  dxf+=`0\nLWPOLYLINE\n8\nOUTLINE\n90\n${pts.length}\n70\n1\n`;
  pts.forEach(p=>{dxf+=`10\n${p.x.toFixed(3)}\n20\n${p.y.toFixed(3)}\n`;});
  dxf+=`0\nLINE\n8\nCENTERLINE\n10\n0\n20\n0\n11\n0\n21\n${ski.length.toFixed(3)}\n`;
  ski.coreProfile.forEach(cp=>{
    const xmm=cp.pos*ski.length,wh=getWidthAtPos(ski,cp.pos)/2;
    dxf+=`0\nLINE\n8\nCORE_STATIONS\n10\n${(-wh).toFixed(3)}\n20\n${xmm.toFixed(3)}\n11\n${wh.toFixed(3)}\n21\n${xmm.toFixed(3)}\n`;
  });
  dxf+=`0\nENDSEC\n0\nEOF\n`;
  downloadFile(dxf,`ski-plan-${ski.length}mm.dxf`,"application/dxf");
}
function exportCoreDXF(ski){
  const N=80;const cl=[];const cs=[];
  for(let i=0;i<=N;i++){
    const pos=i/N,xmm=pos*ski.length,w=getWidthAtPos(ski,pos),t=getCoreThickAt(ski.coreProfile,pos);
    cl.push({x:xmm,z:t});cs.push({xmm,hw:w/2,t});
  }
  let dxf=`0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n4\n`;
  dxf+=`0\nLAYER\n2\nCORE_PROFILE\n70\n0\n62\n3\n6\nCONTINUOUS\n`;
  dxf+=`0\nLAYER\n2\nBASELINE\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
  dxf+=`0\nLAYER\n2\nCROSS_SECTIONS\n70\n0\n62\n1\n6\nCONTINUOUS\n`;
  dxf+=`0\nLAYER\n2\nSURFACE_RIBS\n70\n0\n62\n5\n6\nCONTINUOUS\n`;
  dxf+=`0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;
  // Side profile top curve
  dxf+=`0\nLWPOLYLINE\n8\nCORE_PROFILE\n90\n${cl.length}\n70\n0\n`;
  cl.forEach(p=>{dxf+=`10\n${p.x.toFixed(3)}\n20\n${p.z.toFixed(3)}\n`;});
  dxf+=`0\nLINE\n8\nBASELINE\n10\n0\n20\n0\n11\n${ski.length.toFixed(3)}\n21\n0\n`;
  // Cross-section rectangles at each core station (3D: X=pos, Y=width, Z=thickness)
  ski.coreProfile.forEach(cp=>{
    const xmm=cp.pos*ski.length,hw=getWidthAtPos(ski,cp.pos)/2,t=cp.thick;
    dxf+=`0\nLINE\n8\nCROSS_SECTIONS\n10\n${xmm.toFixed(3)}\n20\n${(-hw).toFixed(3)}\n30\n0\n11\n${xmm.toFixed(3)}\n21\n${hw.toFixed(3)}\n31\n0\n`;
    dxf+=`0\nLINE\n8\nCROSS_SECTIONS\n10\n${xmm.toFixed(3)}\n20\n${hw.toFixed(3)}\n30\n0\n11\n${xmm.toFixed(3)}\n21\n${hw.toFixed(3)}\n31\n${t.toFixed(3)}\n`;
    dxf+=`0\nLINE\n8\nCROSS_SECTIONS\n10\n${xmm.toFixed(3)}\n20\n${hw.toFixed(3)}\n30\n${t.toFixed(3)}\n11\n${xmm.toFixed(3)}\n21\n${(-hw).toFixed(3)}\n31\n${t.toFixed(3)}\n`;
    dxf+=`0\nLINE\n8\nCROSS_SECTIONS\n10\n${xmm.toFixed(3)}\n20\n${(-hw).toFixed(3)}\n30\n${t.toFixed(3)}\n11\n${xmm.toFixed(3)}\n21\n${(-hw).toFixed(3)}\n31\n0\n`;
  });
  // 3D surface ribs at 0%, 25%, 50%, 75%, 100% width
  [0,0.25,0.5,0.75,1.0].forEach(wf=>{
    for(let i=0;i<cs.length-1;i++){
      const a=cs[i],b=cs[i+1];
      dxf+=`0\nLINE\n8\nSURFACE_RIBS\n10\n${a.xmm.toFixed(3)}\n20\n${(a.hw*wf).toFixed(3)}\n30\n${a.t.toFixed(3)}\n11\n${b.xmm.toFixed(3)}\n21\n${(b.hw*wf).toFixed(3)}\n31\n${b.t.toFixed(3)}\n`;
      if(wf>0)dxf+=`0\nLINE\n8\nSURFACE_RIBS\n10\n${a.xmm.toFixed(3)}\n20\n${(-a.hw*wf).toFixed(3)}\n30\n${a.t.toFixed(3)}\n11\n${b.xmm.toFixed(3)}\n21\n${(-b.hw*wf).toFixed(3)}\n31\n${b.t.toFixed(3)}\n`;
    }
  });
  dxf+=`0\nENDSEC\n0\nEOF\n`;
  downloadFile(dxf,`ski-core-3d-${ski.length}mm.dxf`,"application/dxf");
}
function exportCoreSVG(ski){
  const N=80;const cl=[];
  for(let i=0;i<=N;i++){const pos=i/N;cl.push({x:pos*ski.length,z:getCoreThickAt(ski.coreProfile,pos)});}
  const maxT=Math.max(...cl.map(p=>p.z)),L=ski.length,pad=10,sz=8;
  const w=L+pad*2,h=maxT*sz+pad*2;
  const topPath=cl.map((p,i)=>`${i===0?'M':'L'}${(p.x+pad).toFixed(2)},${(pad+(maxT-p.z)*sz).toFixed(2)}`).join(' ');
  const fillPath=topPath+` L${L+pad},${pad+maxT*sz} L${pad},${pad+maxT*sz} Z`;
  const marks=ski.coreProfile.map(cp=>{
    const x=cp.pos*L+pad,yt=pad+(maxT-cp.thick)*sz,yb=pad+maxT*sz;
    return `<line x1="${x.toFixed(1)}" y1="${yt.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yb.toFixed(1)}" stroke="#ff8800" stroke-width="0.3" stroke-dasharray="2,2"/>
    <text x="${(x+2).toFixed(1)}" y="${(yt-2).toFixed(1)}" font-size="4" fill="#ff8800">${cp.thick.toFixed(1)}</text>`;
  }).join('\n    ');
  const svg=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
  <title>Core Profile - ${ski.length}mm</title>
  <desc>Thickness profile. X=position(mm), Y=thickness(${sz}x scale). Max: ${maxT.toFixed(1)}mm</desc>
  <g id="profile"><path d="${fillPath}" fill="rgba(255,180,80,0.15)" stroke="#ff8800" stroke-width="0.5"/>
    <line x1="${pad}" y1="${pad+maxT*sz}" x2="${L+pad}" y2="${pad+maxT*sz}" stroke="#000" stroke-width="0.3"/></g>
  <g id="stations">${marks}</g>
</svg>`;
  downloadFile(svg,`ski-core-profile-${ski.length}mm.svg`,"image/svg+xml");
}


// ══════════════ PLAN VIEW ══════════════
function PlanView({ski,setSki,width,height}){
  const canvasRef=useRef(null);const[hovered,setHovered]=useState(null);
  const[dragging,setDragging]=useState(null);const[dragStart,setDragStart]=useState(null);
  const{right,left,waistY,tipContactY,tailContactY}=useMemo(()=>computeOutline(ski),[ski]);
  const pad=55,maxW=Math.max(ski.tipWidth,ski.tailWidth)+40;
  const scale=Math.min((width-pad*2)/maxW,(height-pad*2)/ski.length);
  const cx=width/2,cy=height/2;
  const toC=useCallback((sx,sy)=>({x:cx+sx*scale,y:cy+(ski.length/2-sy)*scale}),[cx,cy,scale,ski.length]);
  const buildCPs=useCallback(()=>{
    const cps=[];
    cps.push({id:"tw_r",sx:ski.tipWidth/2,sy:tipContactY,type:"width",param:"tipWidth",mult:2});
    cps.push({id:"ww_r",sx:ski.waistWidth/2,sy:waistY,type:"width",param:"waistWidth",mult:2});
    cps.push({id:"taw_r",sx:ski.tailWidth/2,sy:tailContactY,type:"width",param:"tailWidth",mult:2});
    cps.push({id:"tw_l",sx:-ski.tipWidth/2,sy:tipContactY,type:"width",param:"tipWidth",mult:-2});
    cps.push({id:"ww_l",sx:-ski.waistWidth/2,sy:waistY,type:"width",param:"waistWidth",mult:-2});
    cps.push({id:"taw_l",sx:-ski.tailWidth/2,sy:tailContactY,type:"width",param:"tailWidth",mult:-2});
    const addSh=(nodes,prefix,wHalf,baseY,riseH)=>{nodes.forEach((n,i)=>{
      cps.push({id:`${prefix}_n${i}`,sx:n.x*wHalf,sy:baseY+n.y*riseH,type:`${prefix}Node`,idx:i});
      cps.push({id:`${prefix}_h${i}`,sx:(n.x+n.hx)*wHalf,sy:baseY+(n.y+n.hy)*riseH,type:`${prefix}Handle`,idx:i});
      if(n.hx2!==undefined&&(i>0||n.hx2!==0||n.hy2!==0))
        cps.push({id:`${prefix}_h2_${i}`,sx:(n.x+n.hx2)*wHalf,sy:baseY+(n.y+n.hy2)*riseH,type:`${prefix}Handle2`,idx:i});
    });};
    addSh(ski.tipNodesR,"tipR",ski.tipWidth/2,tipContactY,ski.tipLength);
    if(!ski.tipSymmetric)addSh(ski.tipNodesL,"tipL",-ski.tipWidth/2,tipContactY,ski.tipLength);
    addSh(ski.tailNodesR,"tailR",ski.tailWidth/2,0,ski.tailLength);
    if(!ski.tailSymmetric)addSh(ski.tailNodesL,"tailL",-ski.tailWidth/2,0,ski.tailLength);
    return cps;
  },[ski,tipContactY,tailContactY,waistY]);
  const cps=useMemo(buildCPs,[buildCPs]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");const dpr=window.devicePixelRatio||1;
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle=C.bg;ctx.fillRect(0,0,width,height);
    const gp=50*scale;
    if(gp>6){ctx.strokeStyle=C.grid;ctx.lineWidth=0.5;
      for(let x=cx%gp;x<width;x+=gp){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
      for(let y=cy%gp;y<height;y+=gp){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
    }
    ctx.strokeStyle=C.center;ctx.lineWidth=1;ctx.setLineDash([8,6]);
    const ct2=toC(0,ski.length),cb2=toC(0,0);ctx.beginPath();ctx.moveTo(ct2.x,ct2.y);ctx.lineTo(cb2.x,cb2.y);ctx.stroke();ctx.setLineDash([]);
    ctx.save();ctx.shadowColor=C.skiGlow;ctx.shadowBlur=14;ctx.beginPath();
    right.forEach((p,i)=>{const c=toC(p.x,p.y);i===0?ctx.moveTo(c.x,c.y):ctx.lineTo(c.x,c.y);});
    for(let i=left.length-1;i>=0;i--){const c=toC(left[i].x,left[i].y);ctx.lineTo(c.x,c.y);}
    ctx.closePath();ctx.fillStyle=C.skiFill;ctx.fill();ctx.strokeStyle=C.skiStroke;ctx.lineWidth=1.6;ctx.stroke();ctx.restore();
    const drawHL=(nodes,wHalf,baseY,riseH,sign)=>{nodes.forEach(n=>{
      const nc=toC(sign*n.x*wHalf,baseY+n.y*riseH),h1=toC(sign*(n.x+n.hx)*wHalf,baseY+(n.y+n.hy)*riseH);
      ctx.strokeStyle=C.handleLine;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(nc.x,nc.y);ctx.lineTo(h1.x,h1.y);ctx.stroke();
      if(n.hx2!==undefined){const h2=toC(sign*(n.x+n.hx2)*wHalf,baseY+(n.y+n.hy2)*riseH);ctx.beginPath();ctx.moveTo(nc.x,nc.y);ctx.lineTo(h2.x,h2.y);ctx.stroke();}
    });};
    drawHL(ski.tipNodesR,ski.tipWidth/2,tipContactY,ski.tipLength,1);
    if(!ski.tipSymmetric)drawHL(ski.tipNodesL,ski.tipWidth/2,tipContactY,ski.tipLength,-1);
    drawHL(ski.tailNodesR,ski.tailWidth/2,0,ski.tailLength,1);
    if(!ski.tailSymmetric)drawHL(ski.tailNodesL,ski.tailWidth/2,0,ski.tailLength,-1);
    cps.forEach(cp=>{const c=toC(cp.sx,cp.sy);const isH=hovered===cp.id,isD=dragging===cp.id,isHdl=cp.type.includes("Handle");
      const r=isD?7:isH?6:isHdl?3.5:5;
      if(isH||isD){ctx.beginPath();ctx.arc(c.x,c.y,r+5,0,Math.PI*2);ctx.fillStyle=isHdl?"rgba(136,107,255,0.2)":"rgba(255,107,53,0.2)";ctx.fill();}
      ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.fillStyle=isD?C.controlActive:isH?C.controlHover:isHdl?C.handle:C.control;
      ctx.fill();ctx.strokeStyle="rgba(0,0,0,0.5)";ctx.lineWidth=1;ctx.stroke();
    });
    ctx.fillStyle=C.dimText;ctx.font="11px 'JetBrains Mono',monospace";ctx.textAlign="left";ctx.textBaseline="middle";
    [[tipContactY,ski.tipWidth],[waistY,ski.waistWidth],[tailContactY,ski.tailWidth]].forEach(([yy,w])=>{const p=toC(w/2+28,yy);ctx.fillText(`${Math.round(w)}`,p.x,p.y);});
    const lx=maxW/2+45,lt2=toC(lx,ski.length),lb2=toC(lx,0);
    ctx.strokeStyle=C.dim;ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(lt2.x,lt2.y);ctx.lineTo(lb2.x,lb2.y);ctx.stroke();
    ctx.save();ctx.translate(lt2.x+10,(lt2.y+lb2.y)/2);ctx.rotate(-Math.PI/2);ctx.fillStyle=C.dimText;ctx.font="11px 'JetBrains Mono',monospace";ctx.textAlign="center";ctx.fillText(`${ski.length} mm`,0,0);ctx.restore();
  },[ski,width,height,right,left,waistY,tipContactY,tailContactY,cps,hovered,dragging,toC,scale,cx,cy,maxW]);
  const findCP=useCallback((mx,my)=>{
    const sorted=[...cps].sort((a,b)=>(a.type.includes("Handle")?0:1)-(b.type.includes("Handle")?0:1));
    for(const cp of sorted){const c=toC(cp.sx,cp.sy);if(Math.sqrt((mx-c.x)**2+(my-c.y)**2)<12)return cp.id;}return null;
  },[cps,toC]);
  const handleDown=useCallback(e=>{const rect=canvasRef.current.getBoundingClientRect();const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const id=findCP(mx,my);if(id){setDragging(id);setDragStart({mx,my,ski:JSON.parse(JSON.stringify(ski))});}
  },[findCP,ski]);
  const handleMove=useCallback(e=>{const rect=canvasRef.current.getBoundingClientRect();const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    if(dragging&&dragStart){const cp=cps.find(c=>c.id===dragging);if(!cp)return;
      const dxS=(mx-dragStart.mx)/scale,dyS=-(my-dragStart.my)/scale;
      if(cp.type==="width"){setSki(s=>({...s,[cp.param]:clamp(Math.round(dragStart.ski[cp.param]+dxS*cp.mult),50,200)}));return;}
      let arrKey,nodes,wHalf,riseH,sign=1;
      const t=cp.type.replace("Node","").replace("Handle2","").replace("Handle","");
      if(t==="tipR"){arrKey="tipNodesR";nodes=dragStart.ski.tipNodesR;wHalf=dragStart.ski.tipWidth/2;riseH=dragStart.ski.tipLength;}
      else if(t==="tipL"){arrKey="tipNodesL";nodes=dragStart.ski.tipNodesL;wHalf=dragStart.ski.tipWidth/2;riseH=dragStart.ski.tipLength;sign=-1;}
      else if(t==="tailR"){arrKey="tailNodesR";nodes=dragStart.ski.tailNodesR;wHalf=dragStart.ski.tailWidth/2;riseH=dragStart.ski.tailLength;}
      else if(t==="tailL"){arrKey="tailNodesL";nodes=dragStart.ski.tailNodesL;wHalf=dragStart.ski.tailWidth/2;riseH=dragStart.ski.tailLength;sign=-1;}
      if(!nodes)return;const newN=JSON.parse(JSON.stringify(nodes));const dxN=(dxS*sign)/wHalf,dyN=dyS/riseH;
      if(cp.type.includes("Node")){newN[cp.idx].x=clamp(nodes[cp.idx].x+dxN,-0.05,1.15);newN[cp.idx].y=clamp(nodes[cp.idx].y+dyN,-0.05,1.15);}
      else if(cp.type.includes("Handle2")){newN[cp.idx].hx2=nodes[cp.idx].hx2+dxN;newN[cp.idx].hy2=nodes[cp.idx].hy2+dyN;}
      else{newN[cp.idx].hx=nodes[cp.idx].hx+dxN;newN[cp.idx].hy=nodes[cp.idx].hy+dyN;}
      const updates={[arrKey]:newN};
      if(arrKey==="tipNodesR"&&dragStart.ski.tipSymmetric)updates.tipNodesL=JSON.parse(JSON.stringify(newN));
      if(arrKey==="tailNodesR"&&dragStart.ski.tailSymmetric)updates.tailNodesL=JSON.parse(JSON.stringify(newN));
      setSki(s=>({...s,...updates}));
    }else{setHovered(findCP(mx,my));}
  },[dragging,dragStart,cps,scale,findCP,setSki]);
  const handleUp=useCallback(()=>{setDragging(null);setDragStart(null);},[]);
  return (<canvas ref={canvasRef} style={{width,height,cursor:hovered?(dragging?"grabbing":"grab"):"crosshair",display:"block"}}
    onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={()=>{handleUp();setHovered(null);}}/>);
}

// ══════════════ PROFILE VIEW ══════════════
function ProfileView({ski,width,height}){
  const canvasRef=useRef(null);
  const{tipLength:TL,tailLength:TAIL,tipHeight:TH,tailHeight:TAH,camberHeight:CH,length:L}=ski;
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext("2d");const dpr=window.devicePixelRatio||1;
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=C.bg;ctx.fillRect(0,0,width,height);
    const padL=45,padR=25,padT=15,padB=20,plotW=width-padL-padR,plotH=height-padT-padB;
    const maxH=Math.max(TH,TAH,CH)*1.4+5;
    const toC2=(xmm,ymm)=>({x:padL+(xmm/L)*plotW,y:padT+plotH-(ymm/maxH)*plotH});
    ctx.strokeStyle=C.snow;ctx.lineWidth=1.5;const sl=toC2(0,0),sr=toC2(L,0);ctx.beginPath();ctx.moveTo(sl.x,sl.y);ctx.lineTo(sr.x,sr.y);ctx.stroke();
    const tailC=TAIL,tipC=L-TL,runL=tipC-tailC;const pts=[];const n=200;
    for(let i=0;i<=n;i++){const xmm=(i/n)*L;let ymm;
      if(xmm<=tailC){const t=xmm/tailC;ymm=TAH*(1-t)*(1-t);}
      else if(xmm>=tipC){const t=(xmm-tipC)/TL;ymm=TH*t*t;}
      else{const t=(xmm-tailC)/runL;ymm=CH*4*t*(1-t);}pts.push(toC2(xmm,ymm));}
    ctx.beginPath();pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.lineTo(toC2(L,0).x,toC2(L,0).y);ctx.lineTo(toC2(0,0).x,toC2(0,0).y);ctx.closePath();ctx.fillStyle=C.profileFill;ctx.fill();
    ctx.beginPath();pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.save();ctx.shadowColor=C.skiGlow;ctx.shadowBlur=6;ctx.strokeStyle=C.skiStroke;ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
    const drawV=(xmm,ymm,align)=>{const top=toC2(xmm,ymm);ctx.fillStyle=C.controlHover;ctx.font="bold 9px 'JetBrains Mono',monospace";ctx.textAlign=align;
      ctx.fillText(`${ymm}mm`,top.x+(align==="left"?5:align==="right"?-5:0),top.y-5);};
    drawV(0,TAH,"left");drawV(L,TH,"right");if(CH>0)drawV(tailC+runL/2,CH,"center");
  },[ski,width,height,TL,TAIL,TH,TAH,CH,L]);
  return (<canvas ref={canvasRef} style={{width,height,cursor:"default",display:"block"}}/>);
}

// ══════════════ CORE VIEW ══════════════
function CoreView({ski,setSki,width,height}){
  const canvasRef=useRef(null);const[hovered,setHovered]=useState(null);
  const[dragging,setDragging]=useState(null);const[dragStart,setDragStart]=useState(null);
  const cp=ski.coreProfile;
  const padL=45,padR=25,padT=15,padB=20,plotW=width-padL-padR,plotH=height-padT-padB,maxThick=16;
  const toC2=useCallback((pos,thick)=>({x:padL+pos*plotW,y:padT+plotH-(thick/maxThick)*plotH}),[plotW,plotH]);
  const baseY=padT+plotH;
  const fromC2=useCallback((cx2,cy2)=>({pos:(cx2-padL)/plotW,thick:((baseY-cy2)/plotH)*maxThick}),[plotW,plotH,baseY]);
  const getThickAt=useCallback((pos)=>{
    if(pos<=cp[0].pos)return cp[0].thick;if(pos>=cp[cp.length-1].pos)return cp[cp.length-1].thick;
    for(let i=0;i<cp.length-1;i++){if(pos>=cp[i].pos&&pos<=cp[i+1].pos){
      const t=(pos-cp[i].pos)/(cp[i+1].pos-cp[i].pos);return cp[i].thick+t*t*(3-2*t)*(cp[i+1].thick-cp[i].thick);}}return 0;
  },[cp]);
  const cps=useMemo(()=>cp.map((n,i)=>{const c=toC2(n.pos,n.thick);return{id:`core_${i}`,cx:c.x,cy:c.y,idx:i};}),[cp,toC2]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext("2d");const dpr=window.devicePixelRatio||1;
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=C.bg;ctx.fillRect(0,0,width,height);
    ctx.strokeStyle=C.grid;ctx.lineWidth=0.5;
    for(let mm=0;mm<=maxThick;mm+=2){const p=toC2(0,mm);ctx.beginPath();ctx.moveTo(padL,p.y);ctx.lineTo(padL+plotW,p.y);ctx.stroke();}
    ctx.strokeStyle=C.snow;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(padL,baseY);ctx.lineTo(padL+plotW,baseY);ctx.stroke();
    ctx.fillStyle=C.dim;ctx.font="8px 'JetBrains Mono',monospace";ctx.textAlign="right";
    for(let mm=0;mm<=maxThick;mm+=4){const p=toC2(0,mm);ctx.fillText(`${mm}`,padL-4,p.y+3);}
    const nPts=150;ctx.beginPath();ctx.moveTo(padL,baseY);
    for(let i=0;i<=nPts;i++){const pos=i/nPts;const p=toC2(pos,getThickAt(pos));ctx.lineTo(p.x,p.y);}
    ctx.lineTo(padL+plotW,baseY);ctx.closePath();ctx.fillStyle=C.coreFill;ctx.fill();
    ctx.beginPath();for(let i=0;i<=nPts;i++){const pos=i/nPts;const p=toC2(pos,getThickAt(pos));i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);}
    ctx.save();ctx.shadowColor=C.coreGlow;ctx.shadowBlur=4;ctx.strokeStyle=C.coreStroke;ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
    cps.forEach(cpObj=>{const isH=hovered===cpObj.id,isD=dragging===cpObj.id;const r=isD?7:isH?6:4;
      if(isH||isD){ctx.beginPath();ctx.arc(cpObj.cx,cpObj.cy,r+4,0,Math.PI*2);ctx.fillStyle="rgba(255,184,80,0.2)";ctx.fill();}
      ctx.beginPath();ctx.arc(cpObj.cx,cpObj.cy,r,0,Math.PI*2);
      ctx.fillStyle=isD?C.controlActive:isH?C.controlHover:C.coreNode;ctx.fill();ctx.strokeStyle="rgba(0,0,0,0.4)";ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=C.coreStroke;ctx.font="8px 'JetBrains Mono',monospace";ctx.textAlign="center";
      ctx.fillText(`${cp[cpObj.idx].thick.toFixed(1)}`,cpObj.cx,cpObj.cy-10);
    });
  },[ski,width,height,cp,cps,hovered,dragging,toC2,baseY,plotW,plotH,getThickAt]);
  const findCP3=useCallback((mx,my)=>{for(const c of cps)if(Math.sqrt((mx-c.cx)**2+(my-c.cy)**2)<14)return c.id;return null;},[cps]);
  const handleDown=useCallback(e=>{const rect=canvasRef.current.getBoundingClientRect();const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const id=findCP3(mx,my);if(id){setDragging(id);setDragStart({mx,my,core:JSON.parse(JSON.stringify(cp))});}
  },[findCP3,cp]);
  const handleMove=useCallback(e=>{const rect=canvasRef.current.getBoundingClientRect();const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    if(dragging&&dragStart){const cpObj=cps.find(c=>c.id===dragging);if(!cpObj)return;
      const cur=fromC2(mx,my),start=fromC2(dragStart.mx,dragStart.my);
      const dy=cur.thick-start.thick;const newCore=JSON.parse(JSON.stringify(dragStart.core));
      newCore[cpObj.idx].thick=clamp(dragStart.core[cpObj.idx].thick+dy,0.5,15);
      if(cpObj.idx>0&&cpObj.idx<newCore.length-1){const dx=cur.pos-start.pos;
        newCore[cpObj.idx].pos=clamp(dragStart.core[cpObj.idx].pos+dx,newCore[cpObj.idx-1].pos+0.02,newCore[cpObj.idx+1].pos-0.02);}
      setSki(s=>({...s,coreProfile:newCore}));
    }else{setHovered(findCP3(mx,my));}
  },[dragging,dragStart,cps,fromC2,findCP3,setSki]);
  const handleUp=useCallback(()=>{setDragging(null);setDragStart(null);},[]);
  return (<canvas ref={canvasRef} style={{width,height,cursor:hovered?(dragging?"grabbing":"grab"):"crosshair",display:"block"}}
    onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={()=>{handleUp();setHovered(null);}}/>);
}

// ══════════════ FLEX VIEW ══════════════
function FlexView({ski,flex,width,height}){
  const canvasRef=useRef(null);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||!flex)return;
    const ctx=canvas.getContext("2d");const dpr=window.devicePixelRatio||1;
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle=C.bg;ctx.fillRect(0,0,width,height);
    const padL=55,padR=55,padT=18,padB=22,plotW=width-padL-padR,plotH=height-padT-padB;
    const st=flex.stations,maxK=Math.max(...st.map(s=>s.kCant))*1.15,maxEI=Math.max(...st.map(s=>s.ei))*1.15;
    const toC3=(pos,val,mv)=>({x:padL+pos*plotW,y:padT+plotH-(val/mv)*plotH});
    ctx.strokeStyle=C.grid;ctx.lineWidth=0.5;
    for(let i=0;i<=4;i++){const y=padT+(plotH/4)*i;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(padL+plotW,y);ctx.stroke();}
    ctx.strokeStyle=C.snow;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(padL,padT+plotH);ctx.lineTo(padL+plotW,padT+plotH);ctx.stroke();
    ctx.beginPath();st.forEach((s,i)=>{const p=toC3(s.pos,s.ei,maxEI);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);});
    ctx.lineTo(padL+plotW,padT+plotH);ctx.lineTo(padL,padT+plotH);ctx.closePath();ctx.fillStyle=C.eiFill;ctx.fill();
    ctx.beginPath();st.forEach((s,i)=>{const p=toC3(s.pos,s.ei,maxEI);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);});
    ctx.strokeStyle=C.eiStroke;ctx.lineWidth=1.5;ctx.stroke();
    ctx.beginPath();st.forEach((s,i)=>{const p=toC3(s.pos,s.kCant,maxK);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);});
    ctx.lineTo(padL+plotW,padT+plotH);ctx.lineTo(padL,padT+plotH);ctx.closePath();ctx.fillStyle=C.flexFill;ctx.fill();
    ctx.beginPath();st.forEach((s,i)=>{const p=toC3(s.pos,s.kCant,maxK);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);});
    ctx.save();ctx.shadowColor=C.flexGlow;ctx.shadowBlur=4;ctx.strokeStyle=C.flexStroke;ctx.lineWidth=2;ctx.stroke();ctx.restore();
    ctx.fillStyle=C.flexStroke;ctx.font="8px 'JetBrains Mono',monospace";ctx.textAlign="right";
    for(let i=0;i<=4;i++){ctx.fillText(`${Math.round(maxK*i/4)}`,padL-4,padT+plotH-(i/4)*plotH+3);}
    ctx.fillStyle=C.eiStroke;ctx.textAlign="left";
    for(let i=0;i<=4;i++){ctx.fillText(`${(maxEI*i/4/1e6).toFixed(0)}`,padL+plotW+4,padT+plotH-(i/4)*plotH+3);}
    ctx.fillStyle=C.flexStroke;ctx.save();ctx.translate(10,padT+plotH/2);ctx.rotate(-Math.PI/2);ctx.textAlign="center";ctx.font="8px 'JetBrains Mono',monospace";ctx.fillText("N/mm",0,0);ctx.restore();
    ctx.fillStyle=C.eiStroke;ctx.save();ctx.translate(width-6,padT+plotH/2);ctx.rotate(Math.PI/2);ctx.textAlign="center";ctx.fillText("N\u00B7m\u00B2",0,0);ctx.restore();
    ctx.fillStyle=C.dim;ctx.textAlign="center";ctx.font="8px 'JetBrains Mono',monospace";
    ctx.fillText("TAIL",toC3(0,0,1).x,padT+plotH+14);ctx.fillText("TIP",toC3(1,0,1).x,padT+plotH+14);
    ctx.fillStyle=C.flexStroke;ctx.fillRect(padL+6,padT+4,12,2);ctx.textAlign="left";ctx.fillText("Stiffness",padL+22,padT+7);
    ctx.fillStyle=C.eiStroke;ctx.fillRect(padL+6,padT+14,12,2);ctx.fillText("EI",padL+22,padT+17);
    const pk=st.reduce((a,b)=>b.kCant>a.kCant?b:a);const pp=toC3(pk.pos,pk.kCant,maxK);
    ctx.beginPath();ctx.arc(pp.x,pp.y,3,0,Math.PI*2);ctx.fillStyle=C.flexStroke;ctx.fill();
    ctx.fillStyle=C.controlHover;ctx.font="bold 9px 'JetBrains Mono',monospace";ctx.textAlign="center";
    ctx.fillText(`${Math.round(pk.kCant)}`,pp.x,pp.y-8);
  },[flex,width,height]);
  return (<canvas ref={canvasRef} style={{width,height,cursor:"default",display:"block"}}/>);
}

// ══════════════ MAIN ══════════════
export default function App(){
  const[ski,setSki]=useState(DEFAULT_SKI);
  const[activeView,setActiveView]=useState("all");
  const containerRef=useRef(null);
  const[size,setSize]=useState({w:900,h:700});
  const derived=useMemo(()=>computeDerived(ski),[ski]);
  const flex=useMemo(()=>computeFlexProfile(ski),[ski]);

  useEffect(()=>{const el=containerRef.current;if(!el)return;
    const ro=new ResizeObserver(entries=>{const{width,height}=entries[0].contentRect;setSize({w:Math.floor(width),h:Math.floor(height)});});
    ro.observe(el);return ()=>ro.disconnect();
  },[]);

  const panelW=250,canvasW=size.w-panelW;
  let planH=0,profH=0,coreH=0,flexH=0;
  if(activeView==="plan")planH=size.h;
  else if(activeView==="profile")profH=size.h;
  else if(activeView==="core")coreH=size.h;
  else if(activeView==="flex")flexH=size.h;
  else{planH=Math.floor(size.h*0.36);profH=Math.floor(size.h*0.18);coreH=Math.floor(size.h*0.22);flexH=size.h-planH-profH-coreH;}

  const setLayup=(key,val)=>setSki(s=>({...s,layup:{...s.layup,[key]:val}}));

  const inputField=(label,param,min,max,step)=>(
    <div style={{marginBottom:4}}>
      <div style={{color:C.label,fontSize:9,marginBottom:1,fontFamily:"'JetBrains Mono',monospace"}}>{label}</div>
      <input type="number" value={ski[param]} min={min} max={max} step={step||1}
        onChange={e=>setSki(s=>({...s,[param]:parseFloat(e.target.value)||0}))}
        style={{width:"100%",background:C.inputBg,border:`1px solid ${C.inputBorder}`,borderRadius:3,padding:"3px 6px",color:C.value,fontSize:11,fontFamily:"'JetBrains Mono',monospace",outline:"none",boxSizing:"border-box"}}
        onFocus={e=>e.target.style.borderColor=C.inputFocus} onBlur={e=>e.target.style.borderColor=C.inputBorder}/>
    </div>);
  const selectField=(label,value,options,onChange)=>(
    <div style={{marginBottom:4}}>
      <div style={{color:C.label,fontSize:9,marginBottom:1,fontFamily:"'JetBrains Mono',monospace"}}>{label}</div>
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:"100%",background:C.inputBg,border:`1px solid ${C.inputBorder}`,borderRadius:3,padding:"3px 4px",color:C.value,fontSize:10,fontFamily:"'JetBrains Mono',monospace",outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
        {Object.entries(options).map(([k,v])=>(<option key={k} value={k}>{v.name}{v.E>0?` (${(v.E/1000).toFixed(v.E>50000?0:1)}GPa)`:""}</option>))}
      </select>
    </div>);
  const stat=(label,value,color)=>(<div style={{display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:`1px solid ${C.panelBorder}`}}>
    <span style={{color:C.label,fontSize:9,fontFamily:"'JetBrains Mono',monospace"}}>{label}</span>
    <span style={{color:color||C.heading,fontSize:10,fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{value}</span></div>);
  const viewBtn=(label,val)=>(<button onClick={()=>setActiveView(val)} style={{
    flex:1,padding:"3px 0",fontSize:7,fontFamily:"'JetBrains Mono',monospace",
    background:activeView===val?C.heading:C.inputBg,color:activeView===val?C.bg:C.label,
    border:`1px solid ${activeView===val?C.heading:C.inputBorder}`,borderRadius:3,cursor:"pointer",
    fontWeight:activeView===val?700:400,textTransform:"uppercase"}}>{label}</button>);
  const toggleBtn=(label,key)=>(<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
    <button onClick={()=>{const nv=!ski[key];const u={[key]:nv};
      if(nv){if(key==="tipSymmetric")u.tipNodesL=JSON.parse(JSON.stringify(ski.tipNodesR));if(key==="tailSymmetric")u.tailNodesL=JSON.parse(JSON.stringify(ski.tailNodesR));}
      setSki(s=>({...s,...u}));}} style={{width:30,height:14,borderRadius:7,border:"none",cursor:"pointer",position:"relative",background:ski[key]?C.heading:C.inputBorder}}>
      <div style={{width:10,height:10,borderRadius:5,background:"#fff",position:"absolute",top:2,left:ski[key]?18:2,transition:"left 0.2s"}}/></button>
    <span style={{color:C.label,fontSize:8,fontFamily:"'JetBrains Mono',monospace"}}>{label}</span></div>);

  const expBtn={background:C.exportBtn,border:"none",borderRadius:3,padding:"4px 0",color:"#fff",fontSize:8,
    fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",fontWeight:600,letterSpacing:0.5,width:"100%"};
  const rating=flexRating(flex.underfootK);

  return(
    <div ref={containerRef} style={{display:"flex",height:"100vh",width:"100vw",background:C.bg,fontFamily:"'Segoe UI',sans-serif",overflow:"hidden"}}>
      <div style={{width:panelW,minWidth:panelW,background:C.panel,borderRight:`1px solid ${C.panelBorder}`,display:"flex",flexDirection:"column",overflowY:"auto"}}>
        <div style={{padding:"8px 10px 4px",borderBottom:`1px solid ${C.panelBorder}`}}>
          <div style={{color:C.value,fontSize:12,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>Ski Designer</div>
          <span style={{color:C.label,fontSize:7}}>SHAPE + PROFILE + CORE + FLEX + CNC</span>
        </div>
        <div style={{padding:"3px 10px",borderBottom:`1px solid ${C.panelBorder}`,display:"flex",gap:2}}>
          {viewBtn("Plan","plan")}{viewBtn("Prof","profile")}{viewBtn("Core","core")}{viewBtn("Flex","flex")}{viewBtn("All","all")}
        </div>
        <div style={{padding:"3px 10px",borderBottom:`1px solid ${C.panelBorder}`}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
            {PRESETS.map(p=>(<button key={p.name} onClick={()=>setSki({...p,layup:ski.layup})} style={{background:C.inputBg,border:`1px solid ${C.inputBorder}`,borderRadius:3,padding:"1px 5px",color:C.label,fontSize:8,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}
              onMouseOver={e=>{e.target.style.borderColor=C.heading;e.target.style.color=C.heading}} onMouseOut={e=>{e.target.style.borderColor=C.inputBorder;e.target.style.color=C.label}}>{p.name}</button>))}
          </div>
        </div>
        <div style={{padding:"3px 10px",borderBottom:`1px solid ${C.panelBorder}`}}>
          <div style={{color:C.label,fontSize:8,marginBottom:2,textTransform:"uppercase",letterSpacing:0.8}}>Dimensions (mm)</div>
          {inputField("Length","length",1200,2200)}{inputField("Tip W","tipWidth",60,200)}{inputField("Waist","waistWidth",50,180)}{inputField("Tail W","tailWidth",60,200)}
        </div>
        <div style={{padding:"3px 10px",borderBottom:`1px solid ${C.panelBorder}`}}>
          {inputField("Tip Len","tipLength",80,500)}{inputField("Tail Len","tailLength",60,400)}
        </div>
        <div style={{padding:"3px 10px",borderBottom:`1px solid ${C.panelBorder}`}}>
          <div style={{color:C.label,fontSize:8,marginBottom:2,textTransform:"uppercase",letterSpacing:0.8}}>Side Profile</div>
          {inputField("Tip Rise","tipHeight",5,80)}{inputField("Tail Rise","tailHeight",5,60)}{inputField("Camber","camberHeight",0,10,0.5)}
        </div>
        <div style={{padding:"3px 10px",borderBottom:`1px solid ${C.panelBorder}`}}>
          {toggleBtn("Tip Symmetric","tipSymmetric")}{toggleBtn("Tail Symmetric","tailSymmetric")}
        </div>
        <div style={{padding:"3px 10px",borderBottom:`1px solid ${C.panelBorder}`}}>
          <div style={{color:C.flexStroke,fontSize:8,marginBottom:2,textTransform:"uppercase",letterSpacing:0.8,fontWeight:700}}>Layup / Materials</div>
          {selectField("Wood Core",ski.layup.wood,WOODS,v=>setLayup("wood",v))}
          {selectField("Fiberglass",ski.layup.glass,GLASS,v=>setLayup("glass",v))}
          <div style={{marginBottom:4}}>
            <div style={{color:C.label,fontSize:9,marginBottom:1,fontFamily:"'JetBrains Mono',monospace"}}>Glass Layers (each side)</div>
            <input type="number" value={ski.layup.glassLayers} min={1} max={4} step={1}
              onChange={e=>setLayup("glassLayers",parseInt(e.target.value)||1)}
              style={{width:"100%",background:C.inputBg,border:`1px solid ${C.inputBorder}`,borderRadius:3,padding:"3px 6px",color:C.value,fontSize:11,fontFamily:"'JetBrains Mono',monospace",outline:"none",boxSizing:"border-box"}}/>
          </div>
          {selectField("Metal",ski.layup.metal,METALS,v=>setLayup("metal",v))}
          {selectField("Carbon",ski.layup.carbon,CARBON,v=>setLayup("carbon",v))}
          {ski.layup.carbon!=="none"&&(
            <div style={{marginBottom:4}}>
              <div style={{color:C.label,fontSize:9,marginBottom:1,fontFamily:"'JetBrains Mono',monospace"}}>Carbon Layers</div>
              <input type="number" value={ski.layup.carbonLayers} min={1} max={4} step={1}
                onChange={e=>setLayup("carbonLayers",parseInt(e.target.value)||1)}
                style={{width:"100%",background:C.inputBg,border:`1px solid ${C.inputBorder}`,borderRadius:3,padding:"3px 6px",color:C.value,fontSize:11,fontFamily:"'JetBrains Mono',monospace",outline:"none",boxSizing:"border-box"}}/>
            </div>
          )}
        </div>
        <div style={{padding:"3px 10px",borderBottom:`1px solid ${C.panelBorder}`}}>
          <div style={{color:C.flexStroke,fontSize:8,marginBottom:2,textTransform:"uppercase",letterSpacing:0.8,fontWeight:700}}>Flex Analysis</div>
          <div style={{background:rating.color+"18",border:`1px solid ${rating.color}55`,borderRadius:4,padding:"3px 6px",marginBottom:4,textAlign:"center"}}>
            <div style={{color:rating.color,fontSize:13,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{rating.label}</div>
            <div style={{color:C.label,fontSize:7}}>Underfoot flex rating</div>
          </div>
          {stat("Underfoot",`${Math.round(flex.underfootK)} N/mm`,C.flexStroke)}
          {stat("Peak",`${Math.round(flex.peakK)} N/mm`,C.flexStroke)}
          {stat("3pt Bend",`${flex.k3pt.toFixed(2)} N/mm`,C.flexStroke)}
          {stat("Peak EI",`${(flex.peakEI/1e6).toFixed(0)} N\u00B7m\u00B2`,C.eiStroke)}
          {stat("Dims",`${ski.tipWidth}-${ski.waistWidth}-${ski.tailWidth}`)}
          {stat("Eff Edge",`${Math.round(derived.effectiveEdge)} mm`)}
          {stat("Sidecut R",derived.sidecutRadius<999?`${derived.sidecutRadius.toFixed(1)} m`:"--")}
        </div>
        <div style={{padding:"4px 10px",borderBottom:`1px solid ${C.panelBorder}`}}>
          <div style={{color:C.exportBtn,fontSize:8,marginBottom:4,textTransform:"uppercase",letterSpacing:0.8,fontWeight:700}}>CNC Export</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3,marginBottom:4}}>
            <button onClick={()=>exportPlanDXF(ski)} style={expBtn}>Plan DXF</button>
            <button onClick={()=>exportPlanSVG(ski)} style={expBtn}>Plan SVG</button>
            <button onClick={()=>exportCoreDXF(ski)} style={expBtn}>Core 3D DXF</button>
            <button onClick={()=>exportCoreSVG(ski)} style={expBtn}>Core SVG</button>
          </div>
          <div style={{color:C.label,fontSize:7,lineHeight:1.2,opacity:0.5}}>
            Plan: closed outline for blank/base cutting. Core 3D: cross-sections + surface ribs for CNC thickness profiling. All units mm.
          </div>
        </div>
        <div style={{padding:"3px 10px",borderBottom:`1px solid ${C.panelBorder}`}}>
          <a href="https://www.junksupply.com/ski-calculator/" target="_blank" rel="noopener noreferrer"
            style={{display:"block",color:C.heading,fontSize:9,fontFamily:"'JetBrains Mono',monospace",marginBottom:2,textDecoration:"none"}}>Junk Supply Calc ↗</a>
          <a href="https://soothski.com/compare/" target="_blank" rel="noopener noreferrer"
            style={{display:"block",color:C.heading,fontSize:9,fontFamily:"'JetBrains Mono',monospace",marginBottom:2,textDecoration:"none"}}>Sooth Ski Comparator ↗</a>
        </div>
        <div style={{marginTop:"auto",padding:"3px 10px",borderTop:`1px solid ${C.panelBorder}`}}>
          <div style={{color:C.label,fontSize:7,opacity:0.35}}>Phase 4 — Shape + Profile + Core + Flex + CNC</div>
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {planH>0&&(<div style={{height:planH,position:"relative",borderBottom:`1px solid ${C.panelBorder}`}}>
          <PlanView ski={ski} setSki={setSki} width={canvasW} height={planH}/>
          <div style={{position:"absolute",top:4,left:6,color:C.label,fontSize:7,fontFamily:"'JetBrains Mono',monospace",background:"rgba(11,17,32,0.85)",padding:"1px 6px",borderRadius:2,border:`1px solid ${C.panelBorder}`,textTransform:"uppercase"}}>Plan</div>
        </div>)}
        {profH>0&&(<div style={{height:profH,position:"relative",borderBottom:`1px solid ${C.panelBorder}`}}>
          <ProfileView ski={ski} width={canvasW} height={profH}/>
          <div style={{position:"absolute",top:4,left:6,color:C.label,fontSize:7,fontFamily:"'JetBrains Mono',monospace",background:"rgba(11,17,32,0.85)",padding:"1px 6px",borderRadius:2,border:`1px solid ${C.panelBorder}`,textTransform:"uppercase"}}>Profile</div>
        </div>)}
        {coreH>0&&(<div style={{height:coreH,position:"relative",borderBottom:`1px solid ${C.panelBorder}`}}>
          <CoreView ski={ski} setSki={setSki} width={canvasW} height={coreH}/>
          <div style={{position:"absolute",top:4,left:6,color:C.label,fontSize:7,fontFamily:"'JetBrains Mono',monospace",background:"rgba(11,17,32,0.85)",padding:"1px 6px",borderRadius:2,border:`1px solid ${C.panelBorder}`,textTransform:"uppercase"}}>Core</div>
        </div>)}
        {flexH>0&&(<div style={{height:flexH,position:"relative"}}>
          <FlexView ski={ski} flex={flex} width={canvasW} height={flexH}/>
          <div style={{position:"absolute",top:4,left:6,color:C.label,fontSize:7,fontFamily:"'JetBrains Mono',monospace",background:"rgba(11,17,32,0.85)",padding:"1px 6px",borderRadius:2,border:`1px solid ${C.panelBorder}`,textTransform:"uppercase"}}>Flex</div>
        </div>)}
      </div>
    </div>
  );
}
