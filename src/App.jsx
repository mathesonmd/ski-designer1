import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ══════════════ BLACK CHAPEL THEME ══════════════
const C = {
  bg:           "#3D3D3A",
  bgDeep:       "#2A2A28",
  bgLight:      "#4A4A47",
  panel:        "#2F2F2D",
  panelLight:   "#4A4A47",
  panelBorder:  "#5A5A55",
  gridLine:     "#4F4F4A",
  gridMajor:    "#5A5A55",
  center:       "rgba(200,147,90,0.20)",
  snow:         "rgba(240,237,228,0.30)",
  skiFill:      "rgba(240,237,228,0.08)",
  skiStroke:    "#F0EDE4",
  skiGlow:      "rgba(240,237,228,0.20)",
  control:      "#D85A30",
  controlHover: "#E87A55",
  controlActive:"#FFD080",
  handle:       "#C8935A",
  handleLine:   "rgba(200,147,90,0.55)",
  label:        "#A8A39A",
  labelDim:     "#7A766E",
  value:        "#F0EDE4",
  heading:      "#C8935A",
  dim:          "rgba(240,237,228,0.35)",
  dimText:      "rgba(240,237,228,0.75)",
  inputBg:      "#1F1F1D",
  inputBorder:  "#5A5A55",
  inputFocus:   "#C8935A",
  profileFill:  "rgba(240,237,228,0.06)",
  coreFill:     "rgba(200,147,90,0.10)",
  coreStroke:   "#C8935A",
  coreGlow:     "rgba(200,147,90,0.30)",
  coreNode:     "#C8935A",
  flexStroke:   "#D85A30",
  flexFill:     "rgba(216,90,48,0.10)",
  flexGlow:     "rgba(216,90,48,0.35)",
  eiStroke:     "#F0EDE4",
  eiFill:       "rgba(240,237,228,0.06)",
  exportBtn:    "#C8935A",
  zoomFrame:    "rgba(200,147,90,0.7)",
};

// ══════════════ MATERIALS ══════════════
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

// ══════════════ BEZIER (2-node smooth shape) ══════════════
// Convention: each shape (tip or tail) is a SINGLE cubic bezier segment with 2 endpoint nodes.
// Each node has: x, y (in normalized [0,1] space) and a tangent vector (tx, ty).
// The tangent vector is the handle direction & length emanating FROM the node toward the
// interior of the curve. (So at node 0, tangent points "forward into segment"; at node 1, tangent
// points "backward into segment.")
//
// For the tip:
//   x = 0 means centerline, x = 1 means full sidecut width
//   y = 0 means contact-point, y = 1 means nose-end
// For the tail:
//   x = 0 means centerline, x = 1 means full sidecut width
//   y = 0 means contact-point, y = 1 means tail-end
//
// A 2-node shape is parameterized by exactly TWO tangent handles, which is much simpler than
// the 3-node Illustrator-style approach and matches how skis are actually shaped in industry tools.
function cubicBez(p0,p1,p2,p3,t){const u=1-t;return u*u*u*p0+3*u*u*t*p1+3*u*t*t*p2+t*t*t*p3;}
function evalBez(n0, n1, t) {
  // n0.tx, n0.ty: forward tangent at node 0 (from node 0 toward control point 1)
  // n1.tx, n1.ty: backward tangent at node 1 (from node 1 toward control point 2)
  const c1x = n0.x + n0.tx, c1y = n0.y + n0.ty;
  const c2x = n1.x + n1.tx, c2y = n1.y + n1.ty;
  return {
    x: cubicBez(n0.x, c1x, c2x, n1.x, t),
    y: cubicBez(n0.y, c1y, c2y, n1.y, t),
  };
}

// ══════════════ DEFAULT SHAPES ══════════════
// Tip: 2 nodes — contact-point (1,0) with vertical out-tangent, and nose-end (0,1) with horizontal in-tangent.
// This gives a clean shovel shape that:
//   - has the same width as the sidecut at the contact point (true continuity with the sidecut)
//   - widens slightly forward of contact (because the vertical tangent maintains width briefly)
//   - rounds smoothly to a point at the nose centerline
function makeRoundedTip() { return [
  { x: 1.0, y: 0.0, tx: 0,    ty: 0.65 },  // contact: tangent points straight along ski
  { x: 0.0, y: 1.0, tx: 0.45, ty: 0    },  // nose: tangent points laterally inward
];}
function makeRoundedTail() { return [
  // Node 0 = contact point at (1, 0): sidecut full width, at the start of the tail run.
  //   Tangent points along the ski (toward the tail-end), magnitude 0.65 — same as tip.
  // Node 1 = tail-end at (0, 1): centerline, at the back of the ski.
  //   Tangent points laterally inward (back from tail-end), magnitude 0.45 — same as tip.
  { x: 1.0, y: 0.0, tx: 0,    ty: 0.65 },  // contact: tangent along ski (toward end)
  { x: 0.0, y: 1.0, tx: 0.45, ty: 0    },  // tail-end: tangent laterally inward
];}
// Swallowtail fin: per-side curve from contact point (x=1, y=0) outward to notch at (x=0.40, y=1)
function makeSwallowTailR() { return [
  { x: 1.0,  y: 0.0, tx: 0,    ty: 0.50 },   // contact: vertical tangent, magnitude trimmed for stubbier fin
  { x: 0.40, y: 1.0, tx: 0.35, ty:-0.05 },   // notch tip: lateral inward tangent
];}
function makeSwallowTailL() { return makeSwallowTailR(); }

function makeDefaultCore(){return[
  {pos:0.0,thick:2.0},{pos:0.10,thick:2.5},{pos:0.20,thick:6.0},
  {pos:0.35,thick:10.0},{pos:0.50,thick:11.5},{pos:0.65,thick:10.0},
  {pos:0.80,thick:6.0},{pos:0.90,thick:2.5},{pos:1.0,thick:2.0},
];}
const DEFAULT_LAYUP={wood:"poplar",glass:"triax23",glassLayers:1,metal:"none",carbon:"none",carbonLayers:1};
const DEFAULT_SKI={
  designName: "Untitled Design",
  length:1800,tipWidth:132,waistWidth:98,tailWidth:120,
  tipLength:240,tailLength:170,tipHeight:45,tailHeight:30,camberHeight:3,
  waistPosition:0.48,
  edgeInset:2.0,    // mm. P-Tex base cut inset from outer edge (steel edge width).
  coreInset:2.0,    // mm. Core top-profile width reduction per side for sidewall material.
  tipNodesR:makeRoundedTip(),tipNodesL:makeRoundedTip(),
  tailNodesR:makeRoundedTail(),tailNodesL:makeRoundedTail(),
  tipSymmetric:true,tailSymmetric:true,
  coreProfile:makeDefaultCore(),layup:{...DEFAULT_LAYUP},
};

// ══════════════ FILE SAVE / LOAD ══════════════
// Format version 1 — bump this when the ski state schema changes incompatibly.
// File extension `.bcski` (Black Chapel Ski). JSON envelope with metadata for forward-compat.
const BCSKI_FORMAT = "bcs.ski-design";
const BCSKI_FORMAT_VERSION = 1;
const APP_VERSION = "0.6";

function saveDesignToFile(ski) {
  const envelope = {
    format: BCSKI_FORMAT,
    formatVersion: BCSKI_FORMAT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    designName: ski.designName || "Untitled Design",
    ski: ski,
  };
  const json = JSON.stringify(envelope, null, 2);
  const safeName = (ski.designName || "untitled").replace(/[^a-z0-9-]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "");
  const filename = `bcs-${safeName}-${ski.length}mm.bcski`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Parse a loaded file's JSON contents. Returns { ok: true, ski } or { ok: false, error }.
// Handles forward-compat: if format version is newer than this app supports, warn but try to load.
// Handles older versions via migration step (currently a no-op since version 1 is the first).
function parseDesignFile(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: "File is not valid JSON. Try a .bcski file from a previous save." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "File doesn't contain a valid design." };
  }
  if (parsed.format !== BCSKI_FORMAT) {
    return { ok: false, error: "This doesn't look like a Black Chapel ski design file." };
  }
  if (!parsed.ski || typeof parsed.ski !== "object") {
    return { ok: false, error: "File is missing ski data." };
  }
  // Migration hook for future format versions:
  let ski = parsed.ski;
  if (parsed.formatVersion > BCSKI_FORMAT_VERSION) {
    // Newer file than this app knows about. Try to load anyway but caller should warn.
    return { ok: true, ski, warning: `File was saved by a newer app version (format v${parsed.formatVersion}). Some fields may not be recognized.` };
  }
  // Ensure designName exists (older files may not have it)
  if (!ski.designName) ski.designName = parsed.designName || "Loaded Design";
  return { ok: true, ski };
}

function loadDesignFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => resolve(parseDesignFile(e.target.result));
    reader.onerror = () => resolve({ ok: false, error: "Could not read file." });
    reader.readAsText(file);
  });
}

// ══════════════ AUTOSAVE TO LOCALSTORAGE ══════════════
const AUTOSAVE_KEY = "bcs_autosave";
const AUTOSAVE_META_KEY = "bcs_autosave_meta";

function writeAutosave(ski) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(ski));
    localStorage.setItem(AUTOSAVE_META_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      designName: ski.designName || "Untitled Design",
    }));
  } catch (e) {
    // localStorage may be unavailable or full — ignore
  }
}

function readAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    const metaRaw = localStorage.getItem(AUTOSAVE_META_KEY);
    if (!raw) return null;
    const ski = JSON.parse(raw);
    const meta = metaRaw ? JSON.parse(metaRaw) : {};
    return { ski, meta };
  } catch (e) {
    return null;
  }
}

function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(AUTOSAVE_META_KEY);
  } catch (e) {}
}
// ══════════════ EI ENGINE ══════════════
function getWidthAtPos(ski,pos){
  const L=ski.length,TL=ski.tipLength,TAIL=ski.tailLength;
  const wp=ski.waistPosition!==undefined?ski.waistPosition:0.48;
  const xmm=pos*L,tailC=TAIL,tipC=L-TL,waistPos=tailC+(tipC-tailC)*wp;
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
  const N=250,stations=[];
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
  if(k<400)return{label:"Very Soft",color:"#9FB8A8"};if(k<550)return{label:"Soft",color:"#B8C8B0"};
  if(k<700)return{label:"Medium",color:"#C8935A"};if(k<850)return{label:"Stiff",color:"#D85A30"};
  return{label:"Very Stiff",color:"#B83A20"};
}

// ══════════════ GEOMETRY ══════════════
// Sample a 2-node bezier shape into a sequence of points in normalized [0,1]² space.
function sampleShape(nodes, nPts) {
  const pts = [];
  for (let i = 0; i <= nPts; i++) pts.push(evalBez(nodes[0], nodes[1], i / nPts));
  return pts;
}

// Compute the full outline in REAL MM coordinates.
// Coordinates:
//   skiX = lateral mm, 0 = centerline, positive = "right" side
//   skiY = along-ski mm, 0 = tail end, ski.length = tip end (nose)
function computeOutline(ski) {
  const { length: L, tipWidth: TW, waistWidth: WW, tailWidth: TAW, tipLength: TL, tailLength: TAIL } = ski;
  const tipContactY = L - TL, tailContactY = TAIL;
  const wp = ski.waistPosition !== undefined ? ski.waistPosition : 0.48;
  const waistY = tailContactY + (tipContactY - tailContactY) * wp;
  const nSamplesSidecut = 60, nSamplesShape = 60;

  const tipR = sampleShape(ski.tipNodesR, nSamplesShape);
  const tipL = ski.tipSymmetric ? tipR : sampleShape(ski.tipNodesL, nSamplesShape);
  const tailR = sampleShape(ski.tailNodesR, nSamplesShape);
  const tailL = ski.tailSymmetric ? tailR : sampleShape(ski.tailNodesL, nSamplesShape);

  const buildSide = (tailPtsNorm, tipPtsNorm, sign) => {
    const side = [];
    const tw2 = TAW / 2, ww2 = WW / 2, tipw2 = TW / 2;
    // Tail curve: same convention as tip — node 0 (pt.y=0) is the contact point, node 1 (pt.y=1) is the tail-end.
    //   pt.y=0 ↔ skiY=tailContactY,  pt.y=1 ↔ skiY=0
    // We need to draw the outline from skiY=0 (tail-end) UP to skiY=tailContactY (contact), so
    // we iterate the sampled curve points from LAST to FIRST.
    for (let i = tailPtsNorm.length - 1; i >= 0; i--) {
      const pt = tailPtsNorm[i];
      side.push({
        x: sign * pt.x * tw2,
        y: (1 - pt.y) * tailContactY,
      });
    }
    // Sidecut: tail-contact (width=TAW) → waist (width=WW)
    const tailRunLen = waistY - tailContactY;
    for (let i = 1; i <= nSamplesSidecut; i++) {
      const t = i / nSamplesSidecut, b = t * t * (3 - 2 * t);
      side.push({
        x: sign * (tw2 + b * (ww2 - tw2)),
        y: tailContactY + t * tailRunLen,
      });
    }
    // Sidecut: waist → tip-contact (width=TW)
    const tipRunLen = tipContactY - waistY;
    for (let i = 1; i <= nSamplesSidecut; i++) {
      const t = i / nSamplesSidecut, b = t * t * (3 - 2 * t);
      side.push({
        x: sign * (ww2 + b * (tipw2 - ww2)),
        y: waistY + t * tipRunLen,
      });
    }
    // Tip curve: y=0 is tip-contact (skiY=tipContactY), y=1 is nose-end (skiY=ski.length)
    tipPtsNorm.forEach(pt => {
      side.push({
        x: sign * pt.x * tipw2,
        y: tipContactY + pt.y * TL,
      });
    });
    return side;
  };

  return {
    right: buildSide(tailR, tipR,  1),
    left:  buildSide(tailL, tipL, -1),
    waistY, tipContactY, tailContactY,
  };
}

function computeDerived(ski){
  const ee=ski.length-ski.tipLength-ski.tailLength,avg=(ski.tipWidth+ski.tailWidth)/2;
  const depth=(avg-ski.waistWidth)/2,radius=depth>0.5?(ee*ee)/(8*depth)/1000:Infinity;
  return{effectiveEdge:ee,sidecutRadius:radius};
}

// Side-profile rocker curve. Real ski tips/tails follow a smooth parabolic rise —
// they begin curving immediately at the contact point and continue accelerating gradually
// to the very end. NO leveling off, NO acute "hockey-stick" bend.
//
// Formula: y(s) = totalHeight * s²
//   s = 0 at the contact point  → y = 0 (smooth join with snow)
//   s = 1 at the tip/tail end   → y = totalHeight
//
// Slope at s=0: 0 (curve just barely starts rising — smooth tangent to snow line)
// Slope at s=1: 2*totalHeight (positive, finite — curve keeps rising, never levels off)
//
// This gives the gentle, even, parabolic curve seen on real skis, matches the shape used
// in commercial CNC ski-core molds, and exports cleanly to CAM software.
function rockerHeight(s, totalHeight) {
  return totalHeight * s * s;
}

function makePreset(name,dims,tipR,tipL,tailR,tailL,tipSym,tailSym,profile,core,layup){
  return{name,waistPosition:0.48,edgeInset:2.0,coreInset:2.0,...dims,tipNodesR:tipR,tipNodesL:tipL||tipR,tailNodesR:tailR,tailNodesL:tailL||tailR,
    tipSymmetric:tipSym!==false,tailSymmetric:tailSym!==false,...profile,
    coreProfile:core||makeDefaultCore(),layup:layup||{...DEFAULT_LAYUP}};
}
const rT=makeRoundedTip(),rTa=makeRoundedTail();
// Spatula: extra-long forward tangent → curve stays wide for most of tip length, tightens fast at end
const spatulaTip = [
  { x: 1.0, y: 0.0, tx: 0,    ty: 0.85 },
  { x: 0.0, y: 1.0, tx: 0.55, ty: 0    },
];
const PRESETS=[
  makePreset("All-Mtn",{length:1780,tipWidth:131,waistWidth:98,tailWidth:119,tipLength:230,tailLength:160},rT,null,rTa,null,true,true,{tipHeight:42,tailHeight:28,camberHeight:3}),
  makePreset("Powder",{length:1860,tipWidth:142,waistWidth:112,tailWidth:128,tipLength:310,tailLength:200},rT,null,rTa,null,true,true,{tipHeight:55,tailHeight:35,camberHeight:2}),
  makePreset("Spatula",{length:1800,tipWidth:138,waistWidth:100,tailWidth:118,tipLength:280,tailLength:160},spatulaTip,null,rTa,null,true,true,{tipHeight:50,tailHeight:28,camberHeight:3}),
  makePreset("Swallow",{length:1760,tipWidth:126,waistWidth:100,tailWidth:130,tipLength:240,tailLength:260},
    rT,null,makeSwallowTailR(),makeSwallowTailL(),true,false,{tipHeight:45,tailHeight:25,camberHeight:3}),
  makePreset("Twin Tip",{length:1720,tipWidth:118,waistWidth:90,tailWidth:118,tipLength:220,tailLength:220},rT,null,rTa,null,true,true,{tipHeight:40,tailHeight:40,camberHeight:3,waistPosition:0.50}),
];
// ══════════════ EXPORTS ══════════════
function downloadFile(content,filename,mime){
  const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

// ══════════════ POLYGON INSET (for base cut line) ══════════════
// Given a closed CCW polygon `pts`, returns a new polygon offset INWARD by `dist` mm.
// Uses per-vertex angle bisectors for the offset direction. Works well for smooth ski outlines.
// For self-intersection prevention at very tight concave corners, we clamp the offset to never
// cross the centerline (x=0). The ski outline is smooth so this shouldn't trigger in practice.
function offsetPolygonInward(pts, dist) {
  const n = pts.length;
  if (n < 3 || dist <= 0) return pts.slice();
  // Determine winding (signed area). If negative, polygon is CW; flip the offset direction.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i+1) % n];
    area += (a.x * b.y - b.x * a.y);
  }
  const sign = area > 0 ? 1 : -1;  // CCW => positive area => offset normal points "left" of edge direction
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    // Edge directions (incoming and outgoing)
    const d1x = curr.x - prev.x, d1y = curr.y - prev.y;
    const d2x = next.x - curr.x, d2y = next.y - curr.y;
    const l1 = Math.hypot(d1x, d1y) || 1;
    const l2 = Math.hypot(d2x, d2y) || 1;
    // For a CCW polygon, the LEFT normal of each edge (rotate +90°) points INWARD.
    // `sign` is +1 for CCW (no flip), -1 for CW (flip to get inward direction).
    const n1x = -d1y / l1 * sign, n1y = d1x / l1 * sign;
    const n2x = -d2y / l2 * sign, n2y = d2x / l2 * sign;
    // Bisector points along the average of the two inward normals — already inward.
    let bx = (n1x + n2x), by = (n1y + n2y);
    const blen = Math.hypot(bx, by);
    if (blen < 1e-6) {
      bx = n1x; by = n1y;
    } else {
      bx /= blen; by /= blen;
    }
    // Compute the scaling factor for the bisector length.
    // At a vertex with interior angle α, moving both adjacent edges inward by `dist` and finding
    // the new vertex along the bisector requires scale = dist / sin(α/2).
    // With inward unit normals n1, n2, the angle BETWEEN them is β = π - α, so cos(β) = n1·n2.
    // Therefore sin(α/2) = cos(β/2) = sqrt((1 + cos(β))/2) = sqrt((1 + n1·n2)/2).
    const dot = (n1x * n2x + n1y * n2y);
    const halfAngleCos = Math.sqrt(Math.max(0.0001, (1 + dot) / 2));
    const scale = dist / halfAngleCos;
    out.push({ x: curr.x + bx * scale, y: curr.y + by * scale });
  }
  return out;
}

function getFullOutlinePoints(ski){
  const{right,left}=computeOutline(ski);
  const pts=[];
  right.forEach(p=>pts.push({x:p.x,y:p.y}));
  for(let i=left.length-1;i>=0;i--)pts.push({x:left[i].x,y:left[i].y});
  return pts;
}

// Build a list of registration marks (cross-section transverse lines) at meaningful positions:
// tail contact, waist (configurable), tip contact, plus the centerline. Each entry returns
// the skiY position and an optional label.
function getRegistrationMarks(ski) {
  const tailC = ski.tailLength;
  const tipC = ski.length - ski.tipLength;
  const wp = ski.waistPosition !== undefined ? ski.waistPosition : 0.48;
  const waistY = tailC + (tipC - tailC) * wp;
  return [
    { skiY: tailC,  label: "TAIL CONTACT", halfWidthAt: getWidthAtPos(ski, tailC / ski.length) / 2 + 6 },
    { skiY: waistY, label: "WAIST",         halfWidthAt: getWidthAtPos(ski, waistY / ski.length) / 2 + 6 },
    { skiY: tipC,   label: "TIP CONTACT",  halfWidthAt: getWidthAtPos(ski, tipC / ski.length) / 2 + 6 },
  ];
}

// ══════════════ PLAN SVG EXPORT ══════════════
function exportPlanSVG(ski){
  const edgeInset = ski.edgeInset !== undefined ? ski.edgeInset : 2.0;
  const pts = getFullOutlinePoints(ski);
  const insetPts = edgeInset > 0 ? offsetPolygonInward(pts, edgeInset) : null;
  const marks = getRegistrationMarks(ski);

  // SVG bounds — encompass outer outline plus a small margin
  const pad = 10;
  const minX = Math.min(...pts.map(p=>p.x)) - pad;
  const maxX = Math.max(...pts.map(p=>p.x)) + pad;
  const minY = Math.min(...pts.map(p=>p.y)) - pad;
  const maxY = Math.max(...pts.map(p=>p.y)) + pad;
  const w = maxX - minX, h = maxY - minY;

  // In SVG, Y increases downward. We flip so that ski Y (which goes tail-to-tip) is shown vertically.
  const toSvgY = y => (maxY - y + minY);

  const outerPath = pts.map((p,i) =>
    `${i===0?'M':'L'}${p.x.toFixed(3)},${toSvgY(p.y).toFixed(3)}`
  ).join(' ') + ' Z';

  const insetPath = insetPts ? (insetPts.map((p,i) =>
    `${i===0?'M':'L'}${p.x.toFixed(3)},${toSvgY(p.y).toFixed(3)}`
  ).join(' ') + ' Z') : '';

  // Registration marks: transverse lines at each station
  const regMarks = marks.map(m => {
    const halfW = m.halfWidthAt;
    const cy = toSvgY(m.skiY);
    return `    <line x1="${(-halfW).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${halfW.toFixed(2)}" y2="${cy.toFixed(2)}" stroke="#aa0000" stroke-width="0.4" stroke-dasharray="3,2"/>
    <text x="${(halfW + 4).toFixed(2)}" y="${(cy + 1.5).toFixed(2)}" font-size="4" fill="#aa0000" font-family="monospace">${m.label}</text>`;
  }).join('\n');

  // Centerline (full length)
  const centerline = `<line x1="0" y1="${toSvgY(0).toFixed(2)}" x2="0" y2="${toSvgY(ski.length).toFixed(2)}" stroke="#0066cc" stroke-width="0.3" stroke-dasharray="6,3"/>`;

  // Core thickness station markers
  const coreMarks = ski.coreProfile.map(cp => {
    const xmm = cp.pos * ski.length, wh = getWidthAtPos(ski, cp.pos) / 2;
    const cy = toSvgY(xmm);
    return `    <line x1="${(-wh).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${wh.toFixed(2)}" y2="${cy.toFixed(2)}" stroke="#C8935A" stroke-width="0.2" stroke-dasharray="1.5,1.5" opacity="0.6"/>
    <text x="${(wh + 3).toFixed(2)}" y="${(cy + 1.5).toFixed(2)}" font-size="3" fill="#C8935A" font-family="monospace">${cp.thick.toFixed(1)}</text>`;
  }).join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">
  <title>Black Chapel Studios — Ski Plan ${ski.length}mm ${ski.tipWidth}-${ski.waistWidth}-${ski.tailWidth}</title>
  <desc>Outer line = true outline (edge cut). Inset line = base cut (${edgeInset}mm inset). Red dashed = registration. Units: mm.</desc>
  <g id="outline" stroke="#000" stroke-width="0.6" fill="none">
    <path d="${outerPath}"/>
  </g>
  ${insetPts ? `<g id="base_cut" stroke="#005000" stroke-width="0.4" stroke-dasharray="2,1.5" fill="none">
    <path d="${insetPath}"/>
  </g>` : ''}
  <g id="centerline">${centerline}</g>
  <g id="registration">
${regMarks}
  </g>
  <g id="core_stations">
${coreMarks}
  </g>
</svg>`;
  downloadFile(svg, `bcs-ski-plan-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ PLAN DXF EXPORT ══════════════
function exportPlanDXF(ski){
  const edgeInset = ski.edgeInset !== undefined ? ski.edgeInset : 2.0;
  const pts = getFullOutlinePoints(ski);
  const insetPts = edgeInset > 0 ? offsetPolygonInward(pts, edgeInset) : null;
  const marks = getRegistrationMarks(ski);

  let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n6\n`;
  dxf += `0\nLAYER\n2\nOUTLINE\n70\n0\n62\n7\n6\nCONTINUOUS\n`;          // white/black
  dxf += `0\nLAYER\n2\nBASE_CUT\n70\n0\n62\n3\n6\nDASHED\n`;             // green dashed
  dxf += `0\nLAYER\n2\nCENTERLINE\n70\n0\n62\n5\n6\nCENTER\n`;           // blue
  dxf += `0\nLAYER\n2\nREGISTRATION\n70\n0\n62\n1\n6\nCONTINUOUS\n`;     // red
  dxf += `0\nLAYER\n2\nCORE_STATIONS\n70\n0\n62\n8\n6\nCONTINUOUS\n`;    // dark grey
  dxf += `0\nLAYER\n2\nTEXT\n70\n0\n62\n1\n6\nCONTINUOUS\n`;             // red
  dxf += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  // Outer outline (LWPOLYLINE, closed)
  dxf += `0\nLWPOLYLINE\n8\nOUTLINE\n90\n${pts.length}\n70\n1\n`;
  pts.forEach(p => { dxf += `10\n${p.x.toFixed(3)}\n20\n${p.y.toFixed(3)}\n`; });

  // Inset base-cut line (LWPOLYLINE, closed)
  if (insetPts) {
    dxf += `0\nLWPOLYLINE\n8\nBASE_CUT\n90\n${insetPts.length}\n70\n1\n`;
    insetPts.forEach(p => { dxf += `10\n${p.x.toFixed(3)}\n20\n${p.y.toFixed(3)}\n`; });
  }

  // Centerline
  dxf += `0\nLINE\n8\nCENTERLINE\n10\n0\n20\n0\n11\n0\n21\n${ski.length.toFixed(3)}\n`;

  // Registration marks — transverse lines at tail contact, waist, tip contact
  marks.forEach(m => {
    const hw = m.halfWidthAt;
    dxf += `0\nLINE\n8\nREGISTRATION\n10\n${(-hw).toFixed(3)}\n20\n${m.skiY.toFixed(3)}\n11\n${hw.toFixed(3)}\n21\n${m.skiY.toFixed(3)}\n`;
    // Text label at the right of the line
    dxf += `0\nTEXT\n8\nTEXT\n10\n${(hw + 4).toFixed(3)}\n20\n${(m.skiY - 2).toFixed(3)}\n40\n6\n1\n${m.label}\n`;
  });

  // Core station marks (faint)
  ski.coreProfile.forEach(cp => {
    const xmm = cp.pos * ski.length;
    const wh = getWidthAtPos(ski, cp.pos) / 2;
    dxf += `0\nLINE\n8\nCORE_STATIONS\n10\n${(-wh).toFixed(3)}\n20\n${xmm.toFixed(3)}\n11\n${wh.toFixed(3)}\n21\n${xmm.toFixed(3)}\n`;
  });

  dxf += `0\nENDSEC\n0\nEOF\n`;
  downloadFile(dxf, `bcs-ski-plan-${ski.length}mm.dxf`, "application/dxf");
}

// ══════════════ CORE TOP-PROFILE EXPORT (for flat-bed CNC milling) ══════════════
// Closed extrudable shape with:
//   • Flat bottom (at z=0) — the wood blank rests on the CNC bed
//   • Thickness profile on top — the milled top surface
// Width at each station is the SKI width minus 2× coreInset (sidewall material compensation).
// Registration marks are included as transverse lines at tail contact, waist, tip contact,
// so this profile can be aligned with the plan view in CAD.
// ══════════════ CORE SIDE PROFILE EXPORT ══════════════
// Closed extrudable shape with flat bottom + thickness profile on top. Intended to be imported
// into 3D modeling software on the XZ (side-view) plane. Combined with the Core Plan export
// (which lives on the XY plane), the user can extrude the side profile then boolean-cut with
// the plan outline to produce the 3D core shape.
function exportCoreSideDXF(ski){
  const N = 200;
  const topPts = [];
  for (let i = 0; i <= N; i++) {
    const pos = i / N;
    topPts.push({ x: pos * ski.length, y: getCoreThickAt(ski.coreProfile, pos) });
  }
  const marks = getRegistrationMarks(ski);
  const maxT = Math.max(...topPts.map(p => p.y)) + 4;

  let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n3\n`;
  dxf += `0\nLAYER\n2\nCORE_SIDE_PROFILE\n70\n0\n62\n3\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nREGISTRATION\n70\n0\n62\n1\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nTEXT\n70\n0\n62\n1\n6\nCONTINUOUS\n`;
  dxf += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  // Closed side-profile polygon: flat bottom + thickness curve on top.
  const nClosed = topPts.length + 2;
  dxf += `0\nLWPOLYLINE\n8\nCORE_SIDE_PROFILE\n90\n${nClosed}\n70\n1\n`;
  dxf += `10\n0\n20\n0\n`;
  topPts.forEach(p => { dxf += `10\n${p.x.toFixed(3)}\n20\n${p.y.toFixed(3)}\n`; });
  dxf += `10\n${ski.length.toFixed(3)}\n20\n0\n`;

  // Registration: vertical lines + labels at tail contact, waist, tip contact.
  marks.forEach(m => {
    dxf += `0\nLINE\n8\nREGISTRATION\n10\n${m.skiY.toFixed(3)}\n20\n0\n11\n${m.skiY.toFixed(3)}\n21\n${maxT.toFixed(3)}\n`;
    dxf += `0\nTEXT\n8\nTEXT\n10\n${(m.skiY + 2).toFixed(3)}\n20\n${(maxT + 1).toFixed(3)}\n40\n6\n1\n${m.label}\n`;
  });

  dxf += `0\nENDSEC\n0\nEOF\n`;
  downloadFile(dxf, `bcs-ski-core-side-${ski.length}mm.dxf`, "application/dxf");
}

function exportCoreSideSVG(ski){
  const N = 200;
  const topPts = [];
  for (let i = 0; i <= N; i++) {
    const pos = i / N;
    topPts.push({ x: pos * ski.length, y: getCoreThickAt(ski.coreProfile, pos) });
  }
  const maxT = Math.max(...topPts.map(p => p.y));
  const L = ski.length, pad = 10, sz = 8;
  const w = L + pad * 2, h = maxT * sz + pad * 2;
  const topPath = topPts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${(p.x + pad).toFixed(2)},${(pad + (maxT - p.y) * sz).toFixed(2)}`
  ).join(' ');
  const fillPath = topPath + ` L${L + pad},${pad + maxT * sz} L${pad},${pad + maxT * sz} Z`;
  const marks = getRegistrationMarks(ski);
  const regLines = marks.map(m => {
    const x = pad + m.skiY;
    return `<line x1="${x.toFixed(2)}" y1="${pad}" x2="${x.toFixed(2)}" y2="${(pad + maxT * sz).toFixed(2)}" stroke="#aa0000" stroke-width="0.4" stroke-dasharray="3,2"/>
    <text x="${(x + 2).toFixed(2)}" y="${(pad + 5).toFixed(2)}" font-size="4" fill="#aa0000" font-family="monospace">${m.label}</text>`;
  }).join('\n    ');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
  <title>Black Chapel Studios — Core Side Profile ${ski.length}mm</title>
  <desc>Closed shape for flat-bed CNC: flat bottom, thickness curve on top. Y scale ${sz}x.</desc>
  <g id="profile"><path d="${fillPath}" fill="rgba(200,147,90,0.18)" stroke="#C8935A" stroke-width="0.6"/></g>
  <g id="registration">${regLines}</g>
</svg>`;
  downloadFile(svg, `bcs-ski-core-side-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ CORE PLAN OUTLINE EXPORT ══════════════
// Top-down outline of the wood core, narrowed by coreInset on each side for sidewall comp.
// Intended to be imported into 3D modeling software on the XY (top-view) plane. Used to
// boolean-cut the extruded side profile for the final 3D core shape.
function exportCorePlanDXF(ski){
  const coreInset = ski.coreInset !== undefined ? ski.coreInset : 2.0;
  const N = 200;
  const planPts = [];
  for (let i = 0; i <= N; i++) {
    const pos = i / N;
    const xmm = pos * ski.length;
    const halfW = Math.max(1.0, getWidthAtPos(ski, pos) / 2 - coreInset);
    planPts.push({ x: halfW, y: xmm });
  }
  for (let i = N; i >= 0; i--) {
    const pos = i / N;
    const xmm = pos * ski.length;
    const halfW = Math.max(1.0, getWidthAtPos(ski, pos) / 2 - coreInset);
    planPts.push({ x: -halfW, y: xmm });
  }
  const marks = getRegistrationMarks(ski);

  let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n4\n`;
  dxf += `0\nLAYER\n2\nCORE_PLAN_OUTLINE\n70\n0\n62\n3\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nCENTERLINE\n70\n0\n62\n5\n6\nCENTER\n`;
  dxf += `0\nLAYER\n2\nREGISTRATION\n70\n0\n62\n1\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nTEXT\n70\n0\n62\n1\n6\nCONTINUOUS\n`;
  dxf += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  dxf += `0\nLWPOLYLINE\n8\nCORE_PLAN_OUTLINE\n90\n${planPts.length}\n70\n1\n`;
  planPts.forEach(p => { dxf += `10\n${p.x.toFixed(3)}\n20\n${p.y.toFixed(3)}\n`; });

  dxf += `0\nLINE\n8\nCENTERLINE\n10\n0\n20\n0\n11\n0\n21\n${ski.length.toFixed(3)}\n`;

  marks.forEach(m => {
    const hw = Math.max(1.0, getWidthAtPos(ski, m.skiY / ski.length) / 2 - coreInset) + 6;
    dxf += `0\nLINE\n8\nREGISTRATION\n10\n${(-hw).toFixed(3)}\n20\n${m.skiY.toFixed(3)}\n11\n${hw.toFixed(3)}\n21\n${m.skiY.toFixed(3)}\n`;
    dxf += `0\nTEXT\n8\nTEXT\n10\n${(hw + 4).toFixed(3)}\n20\n${(m.skiY - 2).toFixed(3)}\n40\n6\n1\n${m.label}\n`;
  });

  dxf += `0\nENDSEC\n0\nEOF\n`;
  downloadFile(dxf, `bcs-ski-core-plan-${ski.length}mm.dxf`, "application/dxf");
}

function exportCorePlanSVG(ski){
  const coreInset = ski.coreInset !== undefined ? ski.coreInset : 2.0;
  const N = 200;
  const right = [], left = [];
  for (let i = 0; i <= N; i++) {
    const pos = i / N;
    const xmm = pos * ski.length;
    const halfW = Math.max(1.0, getWidthAtPos(ski, pos) / 2 - coreInset);
    right.push({ x: halfW, y: xmm });
    left.unshift({ x: -halfW, y: xmm });
  }
  const all = [...right, ...left];
  const pad = 10;
  const minX = Math.min(...all.map(p => p.x)) - pad;
  const maxX = Math.max(...all.map(p => p.x)) + pad;
  const minY = Math.min(...all.map(p => p.y)) - pad;
  const maxY = Math.max(...all.map(p => p.y)) + pad;
  const w = maxX - minX, h = maxY - minY;
  const toSvgY = y => (maxY - y + minY);
  const pathD = all.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${p.x.toFixed(3)},${toSvgY(p.y).toFixed(3)}`
  ).join(' ') + ' Z';
  const marks = getRegistrationMarks(ski);
  const regLines = marks.map(m => {
    const hw = Math.max(1.0, getWidthAtPos(ski, m.skiY / ski.length) / 2 - coreInset) + 4;
    const cy = toSvgY(m.skiY);
    return `<line x1="${(-hw).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${hw.toFixed(2)}" y2="${cy.toFixed(2)}" stroke="#aa0000" stroke-width="0.4" stroke-dasharray="3,2"/>
    <text x="${(hw + 3).toFixed(2)}" y="${(cy + 1.5).toFixed(2)}" font-size="4" fill="#aa0000" font-family="monospace">${m.label}</text>`;
  }).join('\n    ');
  const centerline = `<line x1="0" y1="${toSvgY(0).toFixed(2)}" x2="0" y2="${toSvgY(ski.length).toFixed(2)}" stroke="#0066cc" stroke-width="0.3" stroke-dasharray="6,3"/>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">
  <title>Black Chapel Studios — Core Plan Outline ${ski.length}mm</title>
  <desc>Top-down core outline narrowed by ${coreInset}mm/side for sidewall compensation.</desc>
  <g id="outline" stroke="#000" stroke-width="0.6" fill="none"><path d="${pathD}"/></g>
  <g id="centerline">${centerline}</g>
  <g id="registration">${regLines}</g>
</svg>`;
  downloadFile(svg, `bcs-ski-core-plan-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ ROCKER (mold) PROFILE EXPORT ══════════════
// Simple line representing the side-view rocker shape — feeds directly into the ski press mold.
// Includes registration marks (vertical lines at tail contact, waist, tip contact) and a baseline.
function exportRockerDXF(ski){
  const N = 400;
  const tailC = ski.tailLength, tipC = ski.length - ski.tipLength;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const xmm = (i / N) * ski.length;
    let ymm;
    if (xmm <= tailC)        { const s = 1 - (xmm / tailC); ymm = rockerHeight(s, ski.tailHeight); }
    else if (xmm >= tipC)    { const s = (xmm - tipC) / ski.tipLength; ymm = rockerHeight(s, ski.tipHeight); }
    else                     { const t = (xmm - tailC) / (tipC - tailC); ymm = ski.camberHeight * 4 * t * (1 - t); }
    pts.push({ x: xmm, y: ymm });
  }
  const marks = getRegistrationMarks(ski);
  const maxY = Math.max(...pts.map(p => p.y));

  let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n4\n`;
  dxf += `0\nLAYER\n2\nROCKER_PROFILE\n70\n0\n62\n3\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nBASELINE\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nREGISTRATION\n70\n0\n62\n1\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nTEXT\n70\n0\n62\n1\n6\nCONTINUOUS\n`;
  dxf += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  // Rocker curve as an open polyline (it's just a line, not a closed shape)
  dxf += `0\nLWPOLYLINE\n8\nROCKER_PROFILE\n90\n${pts.length}\n70\n0\n`;
  pts.forEach(p => { dxf += `10\n${p.x.toFixed(3)}\n20\n${p.y.toFixed(3)}\n`; });

  // Baseline (snow line)
  dxf += `0\nLINE\n8\nBASELINE\n10\n0\n20\n0\n11\n${ski.length.toFixed(3)}\n21\n0\n`;

  // Registration: vertical lines at tail contact, waist, tip contact
  marks.forEach(m => {
    dxf += `0\nLINE\n8\nREGISTRATION\n10\n${m.skiY.toFixed(3)}\n20\n${(-3).toFixed(3)}\n11\n${m.skiY.toFixed(3)}\n21\n${(maxY + 4).toFixed(3)}\n`;
    dxf += `0\nTEXT\n8\nTEXT\n10\n${(m.skiY + 2).toFixed(3)}\n20\n${(maxY + 5).toFixed(3)}\n40\n6\n1\n${m.label}\n`;
  });

  dxf += `0\nENDSEC\n0\nEOF\n`;
  downloadFile(dxf, `bcs-ski-rocker-${ski.length}mm.dxf`, "application/dxf");
}

function exportRockerSVG(ski){
  const N = 400;
  const tailC = ski.tailLength, tipC = ski.length - ski.tipLength;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const xmm = (i / N) * ski.length;
    let ymm;
    if (xmm <= tailC)        { const s = 1 - (xmm / tailC); ymm = rockerHeight(s, ski.tailHeight); }
    else if (xmm >= tipC)    { const s = (xmm - tipC) / ski.tipLength; ymm = rockerHeight(s, ski.tipHeight); }
    else                     { const t = (xmm - tailC) / (tipC - tailC); ymm = ski.camberHeight * 4 * t * (1 - t); }
    pts.push({ x: xmm, y: ymm });
  }
  const maxY = Math.max(...pts.map(p => p.y));
  const L = ski.length, pad = 10;
  const w = L + pad * 2, h = maxY + pad * 2 + 6;  // small extra space for labels
  const toSY = y => (pad + (maxY - y));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x + pad).toFixed(2)},${toSY(p.y).toFixed(2)}`).join(' ');
  const marks = getRegistrationMarks(ski);
  const regLines = marks.map(m => {
    const x = pad + m.skiY;
    return `<line x1="${x.toFixed(2)}" y1="${(toSY(maxY) - 2).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(toSY(0) + 2).toFixed(2)}" stroke="#aa0000" stroke-width="0.4" stroke-dasharray="3,2"/>
    <text x="${(x + 2).toFixed(2)}" y="${(toSY(maxY) - 3).toFixed(2)}" font-size="4" fill="#aa0000" font-family="monospace">${m.label}</text>`;
  }).join('\n    ');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
  <title>Black Chapel Studios — Rocker/Mold Profile ${ski.length}mm</title>
  <desc>Side-view rocker line for press mold. Units: mm, true 1:1 scale.</desc>
  <g id="rocker"><path d="${pathD}" fill="none" stroke="#000" stroke-width="0.6"/></g>
  <g id="baseline"><line x1="${pad}" y1="${toSY(0).toFixed(2)}" x2="${(L + pad).toFixed(2)}" y2="${toSY(0).toFixed(2)}" stroke="#888" stroke-width="0.3"/></g>
  <g id="registration">${regLines}</g>
</svg>`;
  downloadFile(svg, `bcs-ski-rocker-${ski.length}mm.svg`, "image/svg+xml");
}
// ══════════════ PLAN VIEW ══════════════
// Layout:
//   ROW 1 (top, ~38% of height): Full ski plan at TRUE aspect ratio. Long and thin.
//                                Only NODES are draggable here (no handle clutter).
//   ROW 2 (bottom, ~62% of height): Two side-by-side zoom panels — tail (left) | tip (right).
//                                   Lots of headroom so handle dragging doesn't hit the edge.
//                                   This is where bezier handles are edited.
function PlanView({ ski, setSki, width, height }) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const { right, left, waistY, tipContactY, tailContactY } = useMemo(() => computeOutline(ski), [ski]);

  // ── Layout regions ──────────────────────────────────────────────
  const rowGap = 8;
  const mainRowH = Math.floor(height * 0.38);
  const mainRowY = 0;
  const zoomRowY = mainRowH + rowGap;
  const zoomRowH = height - mainRowY - mainRowH - rowGap;

  const mainPadX = 24;
  const mainPadY = 8;
  const mainPlotW = width - mainPadX * 2;
  const mainPlotH = mainRowH - mainPadY * 2;
  // TRUE aspect ratio: same mm-to-pixel scale for both axes.
  const mainScale = Math.min(
    mainPlotW / ski.length,
    mainPlotH / (Math.max(ski.tipWidth, ski.tailWidth, ski.waistWidth) + 8)  // tiny breathing room
  );
  const mainCenterY = mainRowY + mainPadY + mainPlotH / 2;
  const mainOriginX = mainPadX + (mainPlotW - ski.length * mainScale) / 2;
  const toMain = (skiX, skiY) => ({
    x: mainOriginX + skiY * mainScale,
    y: mainCenterY + skiX * mainScale,
  });

  // ── Zoom row: two panels side by side, generous size ─────────
  const panelGap = 12;
  const zoomPanelW = Math.floor((width - panelGap * 3) / 2);
  const zoomPanelH = zoomRowH;
  const tailZoomX = panelGap;
  const tipZoomX = panelGap * 2 + zoomPanelW;

  // Each zoom panel shows MUCH more area than just the tip/tail. The bezier handles can extend
  // outside the curve they shape — give 1.5× the tip/tail length and 2× the width so the
  // user always has room.
  // For the tail: skiY range = [-tailLength*0.4, tailLength*1.4]; this is roughly skiY range
  // [-tailLength*0.4, tailContactY*1.4] = covers from beyond tail-end to past contact.
  const tailViewSpanY = ski.tailLength * 1.8;          // along-ski extent shown
  const tailViewSpanX = Math.max(ski.tailWidth, ski.waistWidth) * 2.0;  // lateral extent shown
  const tailViewMinY = -ski.tailLength * 0.4;          // start before the tail end
  const tailPadInner = 16;
  const tailPlotW = zoomPanelW - tailPadInner * 2;
  const tailPlotH = zoomPanelH - 30;  // leave room for label at top
  const tailScale = Math.min(tailPlotW / tailViewSpanY, tailPlotH / tailViewSpanX);
  const tailOriginX = tailZoomX + tailPadInner + (tailPlotW - tailViewSpanY * tailScale) / 2;
  const tailCenterY = zoomRowY + 24 + tailPlotH / 2;
  const toTail = (skiX, skiY) => ({
    x: tailOriginX + (skiY - tailViewMinY) * tailScale,
    y: tailCenterY + skiX * tailScale,
  });

  // Tip: span = [length - tipLength*1.4, length + tipLength*0.4]
  const tipViewSpanY = ski.tipLength * 1.8;
  const tipViewSpanX = Math.max(ski.tipWidth, ski.waistWidth) * 2.0;
  const tipViewMinY = ski.length - ski.tipLength * 1.4;
  const tipPadInner = 16;
  const tipPlotW = zoomPanelW - tipPadInner * 2;
  const tipPlotH = zoomPanelH - 30;
  const tipScale = Math.min(tipPlotW / tipViewSpanY, tipPlotH / tipViewSpanX);
  const tipOriginX = tipZoomX + tipPadInner + (tipPlotW - tipViewSpanY * tipScale) / 2;
  const tipCenterY = zoomRowY + 24 + tipPlotH / 2;
  const toTip = (skiX, skiY) => ({
    x: tipOriginX + (skiY - tipViewMinY) * tipScale,
    y: tipCenterY + skiX * tipScale,
  });

  // ── Build control points ──────────────────────────────────────
  const buildCPs = useCallback(() => {
    const cps = [];
    // Note: dedicated tip/tail width handles were removed — the bezier contact-nodes (idx 0)
    // now handle dimension edits (along-ski drag → tipLength/tailLength; lateral → tipWidth/tailWidth),
    // so separate width handles were redundant at contact points.
    // Waist dots are KEPT and editable — the `"width"` type drag handler responds only to lateral
    // motion (it uses dSkiX, ignoring dSkiY), so the waist position stays fixed fore/aft. Width
    // changes via these dots OR via the sidebar input — either way only waistWidth changes.
    cps.push({ id:"ww_r",  skiX: ski.waistWidth/2, skiY: waistY, type:"width", param:"waistWidth", mult:2,  frames:["main"] });
    cps.push({ id:"ww_l",  skiX:-ski.waistWidth/2, skiY: waistY, type:"width", param:"waistWidth", mult:-2, frames:["main"] });

    // Bezier nodes and tangent handles — handles ONLY appear in zoom panels (not main view)
    // to keep the main view uncluttered.
    const addShape = (nodes, prefix, isTip, sign, zoomFrame) => {
      const wHalf = isTip ? ski.tipWidth/2 : ski.tailWidth/2;
      const yBase = isTip ? tipContactY : tailContactY;
      const ySpan = isTip ? ski.tipLength : -tailContactY;  // tail uses negative span

      nodes.forEach((n, i) => {
        const nodeSkiX = sign * n.x * wHalf;
        const nodeSkiY = yBase + n.y * ySpan;
        cps.push({
          id: `${prefix}_n${i}`,
          skiX: nodeSkiX, skiY: nodeSkiY,
          type: `${prefix}Node`, idx: i, sign, isTip,
          frames: ["main", zoomFrame],  // nodes in both
        });
        // Tangent handle — only in zoom frame
        if (n.tx !== 0 || n.ty !== 0) {
          const hSkiX = sign * (n.x + n.tx) * wHalf;
          const hSkiY = yBase + (n.y + n.ty) * ySpan;
          cps.push({
            id: `${prefix}_t${i}`,
            skiX: hSkiX, skiY: hSkiY,
            type: `${prefix}Tangent`, idx: i, sign, isTip,
            frames: [zoomFrame],  // ONLY in zoom — keeps main uncluttered
            parentNodeIdx: i,
          });
        }
      });
    };
    addShape(ski.tipNodesR, "tipR", true, 1, "tip");
    if (!ski.tipSymmetric) addShape(ski.tipNodesL, "tipL", true, -1, "tip");
    addShape(ski.tailNodesR, "tailR", false, 1, "tail");
    if (!ski.tailSymmetric) addShape(ski.tailNodesL, "tailL", false, -1, "tail");
    return cps;
  }, [ski, tipContactY, tailContactY, waistY]);
  const cps = useMemo(buildCPs, [buildCPs]);

  // ── Render ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);

    // ── Main view (top row) ─────────────────────────────────────
    // Centerline
    ctx.strokeStyle = C.center; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(toMain(0, 0).x, mainCenterY);
    ctx.lineTo(toMain(0, ski.length).x, mainCenterY);
    ctx.stroke(); ctx.setLineDash([]);

    // Ski outline
    ctx.save();
    ctx.shadowColor = C.skiGlow; ctx.shadowBlur = 8;
    ctx.beginPath();
    right.forEach((p, i) => {
      const s = toMain(p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    for (let i = left.length - 1; i >= 0; i--) {
      const s = toMain(left[i].x, left[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.fillStyle = C.skiFill; ctx.fill();
    ctx.strokeStyle = C.skiStroke; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();

    // TAIL/TIP labels and length
    ctx.fillStyle = C.dimText;
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("TAIL", toMain(0, 0).x - 4, mainCenterY - 16);
    ctx.textAlign = "right";
    ctx.fillText("TIP", toMain(0, ski.length).x + 4, mainCenterY - 16);
    ctx.textAlign = "center";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillText(`${ski.length} mm`, mainOriginX + (ski.length * mainScale) / 2, mainRowY + mainRowH - 4);

    // Width values
    ctx.fillStyle = C.heading;
    ctx.font = "bold 9px 'JetBrains Mono', monospace";
    [
      { skiY: tailContactY, w: ski.tailWidth },
      { skiY: waistY,       w: ski.waistWidth },
      { skiY: tipContactY,  w: ski.tipWidth },
    ].forEach(d => {
      const s = toMain(d.w/2 + 2, d.skiY);
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(d.w)}`, s.x, s.y + 10);
    });

    // ── Divider between rows ────────────────────────────────────
    ctx.strokeStyle = C.panelBorder; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mainRowH + rowGap / 2);
    ctx.lineTo(width, mainRowH + rowGap / 2);
    ctx.stroke();

    // ── Zoom panels (bottom row) ─────────────────────────────────
    const drawZoomPanel = (panelX, panelW, label, toFrame, viewMinY, viewSpanY) => {
      // Background and border
      ctx.fillStyle = C.bgDeep;
      ctx.fillRect(panelX, zoomRowY, panelW, zoomPanelH);
      ctx.strokeStyle = C.zoomFrame; ctx.lineWidth = 1;
      ctx.strokeRect(panelX + 0.5, zoomRowY + 0.5, panelW - 1, zoomPanelH - 1);

      // Label
      ctx.fillStyle = C.heading;
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(label, panelX + 10, zoomRowY + 16);

      // Clip rest to inside panel
      ctx.save();
      ctx.beginPath();
      ctx.rect(panelX + 3, zoomRowY + 22, panelW - 6, zoomPanelH - 26);
      ctx.clip();

      // Centerline inside panel
      const cL = toFrame(0, viewMinY);
      const cR = toFrame(0, viewMinY + viewSpanY);
      ctx.strokeStyle = C.center; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cL.x, cL.y);
      ctx.lineTo(cR.x, cR.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw outline within panel (the ski sidecut + tip/tail curve)
      ctx.save();
      ctx.shadowColor = C.skiGlow; ctx.shadowBlur = 6;
      ctx.beginPath();
      right.forEach((p, i) => {
        const s = toFrame(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      for (let i = left.length - 1; i >= 0; i--) {
        const s = toFrame(left[i].x, left[i].y);
        ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
      ctx.fillStyle = C.skiFill; ctx.fill();
      ctx.strokeStyle = C.skiStroke; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.restore();

      ctx.restore();  // outer clip
    };
    drawZoomPanel(tailZoomX, zoomPanelW, "TAIL — ZOOM", toTail, tailViewMinY, tailViewSpanY);
    drawZoomPanel(tipZoomX, zoomPanelW, "TIP — ZOOM", toTip, tipViewMinY, tipViewSpanY);

    // ── Tangent handle lines (only in zoom panels) ───────────────
    const drawTangents = (toFrame, nodes, isTip, sign, clipRect) => {
      const wHalf = isTip ? ski.tipWidth/2 : ski.tailWidth/2;
      const yBase = isTip ? tipContactY : tailContactY;
      const ySpan = isTip ? ski.tipLength : -tailContactY;
      ctx.save();
      ctx.beginPath();
      ctx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
      ctx.clip();
      ctx.strokeStyle = C.handleLine; ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      nodes.forEach(n => {
        if (n.tx === 0 && n.ty === 0) return;
        const nodeS = toFrame(sign * n.x * wHalf, yBase + n.y * ySpan);
        const handS = toFrame(sign * (n.x + n.tx) * wHalf, yBase + (n.y + n.ty) * ySpan);
        ctx.beginPath();
        ctx.moveTo(nodeS.x, nodeS.y);
        ctx.lineTo(handS.x, handS.y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.restore();
    };
    const tailClip = { x: tailZoomX + 3, y: zoomRowY + 22, w: zoomPanelW - 6, h: zoomPanelH - 26 };
    const tipClip  = { x: tipZoomX  + 3, y: zoomRowY + 22, w: zoomPanelW - 6, h: zoomPanelH - 26 };
    drawTangents(toTip, ski.tipNodesR, true, 1, tipClip);
    if (!ski.tipSymmetric) drawTangents(toTip, ski.tipNodesL, true, -1, tipClip);
    drawTangents(toTail, ski.tailNodesR, false, 1, tailClip);
    if (!ski.tailSymmetric) drawTangents(toTail, ski.tailNodesL, false, -1, tailClip);

    // ── Draw control points ─────────────────────────────────────
    const drawCP = (cp, screenPos, scaleMul, doClip) => {
      if (doClip) ctx.save();
      if (doClip) {
        ctx.beginPath();
        ctx.rect(doClip.x, doClip.y, doClip.w, doClip.h);
        ctx.clip();
      }
      const isHovered = hovered === cp.id;
      const isDragged = dragging === cp.id;
      const isHandle = cp.type.includes("Tangent");
      let r = isHandle ? 5.5 : 6.5;
      r *= scaleMul;
      if (isDragged) r += 2;
      else if (isHovered) r += 1.4;

      if (isHovered || isDragged) {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = isHandle ? "rgba(200,147,90,0.30)" : "rgba(216,90,48,0.30)";
        ctx.fill();
      }
      ctx.beginPath();
      if (isHandle) {
        const d = r;
        ctx.moveTo(screenPos.x, screenPos.y - d);
        ctx.lineTo(screenPos.x + d, screenPos.y);
        ctx.lineTo(screenPos.x, screenPos.y + d);
        ctx.lineTo(screenPos.x - d, screenPos.y);
        ctx.closePath();
      } else {
        ctx.arc(screenPos.x, screenPos.y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = isDragged ? C.controlActive : isHovered ? C.controlHover : isHandle ? C.handle : C.control;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();

      if (doClip) ctx.restore();
    };

    cps.forEach(cp => {
      if (cp.frames.includes("main"))  drawCP(cp, toMain(cp.skiX, cp.skiY), 0.75, null);
      if (cp.frames.includes("tip"))   drawCP(cp, toTip(cp.skiX, cp.skiY), 1.0, tipClip);
      if (cp.frames.includes("tail"))  drawCP(cp, toTail(cp.skiX, cp.skiY), 1.0, tailClip);
    });
  }, [ski, width, height, right, left, waistY, tipContactY, tailContactY, cps, hovered, dragging,
      mainScale, mainOriginX, mainCenterY, mainRowY, mainRowH,
      tailScale, tailOriginX, tailCenterY, tailZoomX, zoomPanelW, zoomPanelH, zoomRowY, tailViewMinY, tailViewSpanY,
      tipScale, tipOriginX, tipCenterY, tipZoomX, tipViewMinY, tipViewSpanY]);

  // ── Hit testing ──────────────────────────────────────────────
  const findCP = useCallback((mx, my) => {
    // Determine which region the cursor is in
    if (my >= zoomRowY) {
      // In zoom row — figure out which panel
      if (mx >= tipZoomX) {
        // Tip zoom panel
        const sorted = [...cps].filter(cp => cp.frames.includes("tip"))
          .sort((a, b) => (a.type.includes("Tangent") ? 0 : 1) - (b.type.includes("Tangent") ? 0 : 1));
        for (const cp of sorted) {
          const s = toTip(cp.skiX, cp.skiY);
          if (Math.hypot(mx - s.x, my - s.y) < 14) return cp.id;
        }
      } else if (mx >= tailZoomX && mx < tipZoomX) {
        // Tail zoom panel
        const sorted = [...cps].filter(cp => cp.frames.includes("tail"))
          .sort((a, b) => (a.type.includes("Tangent") ? 0 : 1) - (b.type.includes("Tangent") ? 0 : 1));
        for (const cp of sorted) {
          const s = toTail(cp.skiX, cp.skiY);
          if (Math.hypot(mx - s.x, my - s.y) < 14) return cp.id;
        }
      }
    } else {
      // Main view
      const sorted = [...cps].filter(cp => cp.frames.includes("main"));
      for (const cp of sorted) {
        const s = toMain(cp.skiX, cp.skiY);
        if (Math.hypot(mx - s.x, my - s.y) < 9) return cp.id;
      }
    }
    return null;
  }, [cps, zoomRowY, tipZoomX, tailZoomX, toTip, toTail, toMain]);

  const findDragFrame = useCallback((mx, my) => {
    if (my < zoomRowY) return "main";
    if (mx >= tipZoomX) return "tip";
    return "tail";
  }, [zoomRowY, tipZoomX]);

  const handleDown = useCallback(e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const id = findCP(mx, my);
    if (id) {
      setDragging(id);
      setDragStart({
        mx, my,
        frame: findDragFrame(mx, my),
        ski: JSON.parse(JSON.stringify(ski)),
      });
    }
  }, [findCP, findDragFrame, ski]);

  const handleMove = useCallback(e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    if (dragging && dragStart) {
      const cp = cps.find(c => c.id === dragging); if (!cp) return;

      // Pixel-to-mm conversion (same scale for both axes within each frame, true aspect)
      let scalePx;
      if (dragStart.frame === "tip")  scalePx = tipScale;
      else if (dragStart.frame === "tail") scalePx = tailScale;
      else scalePx = mainScale;

      const dSkiY = (mx - dragStart.mx) / scalePx;
      const dSkiX = (my - dragStart.my) / scalePx;

      if (cp.type === "width") {
        setSki(s => ({ ...s, [cp.param]: clamp(Math.round(dragStart.ski[cp.param] + dSkiX * cp.mult), 50, 220) }));
        return;
      }

      // Determine which node array we're editing
      let arrKey, nodes, wHalf, ySpan, sign = 1, isTip = false;
      const t = cp.type.replace(/Node|Tangent/, "");
      if (t === "tipR")       { arrKey="tipNodesR";  nodes=dragStart.ski.tipNodesR;  wHalf=dragStart.ski.tipWidth/2;  ySpan=dragStart.ski.tipLength;  isTip=true; }
      else if (t === "tipL")  { arrKey="tipNodesL";  nodes=dragStart.ski.tipNodesL;  wHalf=dragStart.ski.tipWidth/2;  ySpan=dragStart.ski.tipLength;  isTip=true;  sign=-1; }
      else if (t === "tailR") { arrKey="tailNodesR"; nodes=dragStart.ski.tailNodesR; wHalf=dragStart.ski.tailWidth/2; ySpan=-dragStart.ski.tailLength; isTip=false; }
      else if (t === "tailL") { arrKey="tailNodesL"; nodes=dragStart.ski.tailNodesL; wHalf=dragStart.ski.tailWidth/2; ySpan=-dragStart.ski.tailLength; isTip=false; sign=-1; }
      if (!nodes) return;

      const dNx = (dSkiX * sign) / wHalf;
      const dNy = dSkiY / ySpan;

      const newNodes = JSON.parse(JSON.stringify(nodes));
      if (cp.type.includes("Tangent")) {
        // Tangent handle drag — pure bezier shape edit, no dimension changes
        newNodes[cp.idx].tx = nodes[cp.idx].tx + dNx;
        newNodes[cp.idx].ty = nodes[cp.idx].ty + dNy;
        const updates = { [arrKey]: newNodes };
        if (arrKey === "tipNodesR"  && dragStart.ski.tipSymmetric)  updates.tipNodesL  = JSON.parse(JSON.stringify(newNodes));
        if (arrKey === "tailNodesR" && dragStart.ski.tailSymmetric) updates.tailNodesL = JSON.parse(JSON.stringify(newNodes));
        setSki(s => ({ ...s, ...updates }));
        return;
      }

      // Bezier NODE drag — update ski dimensions so the node follows the mouse and the
      // dimensions panel stays in sync. Mapping:
      //   • Tip contact-node (idx=0): along-ski → tipLength (contact slides, nose stays).
      //                                lateral  → tipWidth.
      //   • Tip end-node    (idx=last): along-ski → ski.length (nose moves with mouse, contact stays put).
      //                                  lateral  → bezier node.x (asymmetric nose).
      //   • Tail contact-node (idx=0):  along-ski → tailLength (contact slides, tail-end stays at skiY=0).
      //                                  lateral  → tailWidth.
      //   • Tail end-node   (idx=last): along-ski → ski.length AND tailLength change equally
      //                                  (tail-end tracks mouse; contact-point absolute position unchanged).
      //                                  lateral  → bezier node.x (asymmetric tail).
      //   • Interior nodes (only for multi-node shapes like swallowtail): pure shape edit.

      const isEndNode = (cp.idx === nodes.length - 1);
      const isContactNode = (cp.idx === 0);
      const updates = {};

      if (isContactNode) {
        // Along-ski drag of CONTACT node:
        //   Tip: contact at skiY = ski.length - tipLength. Drag right (+dSkiY) moves toward tip → tipLength shrinks.
        //   Tail: contact at skiY = tailLength. Drag right (+dSkiY) moves toward tip → tailLength grows.
        if (isTip) {
          updates.tipLength = clamp(Math.round(dragStart.ski.tipLength - dSkiY), 80, 500);
        } else {
          updates.tailLength = clamp(Math.round(dragStart.ski.tailLength + dSkiY), 60, 400);
        }
        // Lateral drag of CONTACT node: change tip/tail width.
        // The contact point is at skiX = sign·wHalf. Moving FURTHER from centerline grows the width.
        // For right side (sign=+1): positive dSkiX moves outward; for left (sign=-1): negative dSkiX moves outward.
        const widthParam = isTip ? "tipWidth" : "tailWidth";
        updates[widthParam] = clamp(Math.round(dragStart.ski[widthParam] + dSkiX * sign * 2), 50, 220);
        // Bezier normalized coords for the contact node stay locked at (1, 0).
      } else if (isEndNode) {
        if (isTip) {
          // Tip end-node along-ski: the nose is at skiY = ski.length. Drag right grows ski.length.
          const newSkiLen = clamp(Math.round(dragStart.ski.length + dSkiY), 1200, 2200);
          updates.length = newSkiLen;
        } else {
          // Tail end-node along-ski: the tail-end is at skiY = 0. Dragging right (+dSkiY) makes
          // the tail-end move forward (closer to tip), which means the ski gets shorter from the
          // back. To keep the contact point at the same ABSOLUTE position, ski.length and
          // tailLength must change by the same amount.
          const delta = dSkiY;  // mm by which the back of the ski moves forward
          const newSkiLen = clamp(Math.round(dragStart.ski.length - delta), 1200, 2200);
          const actualDelta = dragStart.ski.length - newSkiLen;  // actually applied delta after clamping
          const newTailLen = clamp(Math.round(dragStart.ski.tailLength - actualDelta), 60, 400);
          updates.length = newSkiLen;
          updates.tailLength = newTailLen;
        }
        // Lateral drag of END node → change bezier node.x for off-centerline asymmetric ends.
        // Clamp to [0, 0.50] so the node can never cross the centerline. Stored x is a positive
        // normalized half-width offset; the left side's mirror multiplies by sign=-1 at render.
        // Without the lower bound, dragging past x=0 would put both sides on the wrong half,
        // producing self-crossing outlines that CAM software rejects. The upper bound of 0.50
        // accommodates wide-notch tails like the swallowtail preset (which starts at x=0.40).
        newNodes[cp.idx].x = clamp(nodes[cp.idx].x + dNx, 0, 0.50);
        // Keep bezier normalized y at its original value (1.0).
        updates[arrKey] = newNodes;
      } else {
        // Interior node (3+ node shapes like future swallowtail extensions). Pure shape edit.
        // Same centerline rule applies — stored x is positive, can't cross centerline.
        newNodes[cp.idx].x = clamp(nodes[cp.idx].x + dNx, 0, 1.30);
        newNodes[cp.idx].y = clamp(nodes[cp.idx].y + dNy, -0.10, 1.30);
        updates[arrKey] = newNodes;
      }

      // Mirror to opposite side if symmetric
      if (arrKey === "tipNodesR"  && dragStart.ski.tipSymmetric  && updates[arrKey])  updates.tipNodesL  = JSON.parse(JSON.stringify(updates[arrKey]));
      if (arrKey === "tailNodesR" && dragStart.ski.tailSymmetric && updates[arrKey]) updates.tailNodesL = JSON.parse(JSON.stringify(updates[arrKey]));
      setSki(s => ({ ...s, ...updates }));
    } else {
      setHovered(findCP(mx, my));
    }
  }, [dragging, dragStart, cps, mainScale, tailScale, tipScale, findCP, setSki]);

  const handleUp = useCallback(() => { setDragging(null); setDragStart(null); }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, cursor: hovered ? (dragging ? "grabbing" : "grab") : "default", display: "block" }}
      onMouseDown={handleDown}
      onMouseMove={handleMove}
      onMouseUp={handleUp}
      onMouseLeave={() => { handleUp(); setHovered(null); }}
    />
  );
}
// ══════════════ PROFILE VIEW (smooth continuous rise — no level-off at tips) ══════════════
function ProfileView({ ski, width, height }) {
  const canvasRef = useRef(null);
  const { tipLength: TL, tailLength: TAIL, tipHeight: TH, tailHeight: TAH, camberHeight: CH, length: L } = ski;
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);

    const padX = 12, padTop = 18, padBot = 22;
    const plotW = width - padX * 2;
    const plotH = height - padTop - padBot;
    const xScale = plotW / L;
    // Profile heights are tiny vs length → apply mild Y exaggeration (3-6×).
    const maxH = Math.max(TH, TAH, CH) + 5;
    const trueHpx = maxH * xScale;
    const idealHpx = plotH * 0.75;
    let yExagg = 1.0, yScale = xScale;
    if (trueHpx < idealHpx) {
      yExagg = Math.min(8.0, idealHpx / trueHpx);
      yScale = xScale * yExagg;
    }
    const baseY = padTop + plotH * 0.92;
    const toC = (xmm, ymm) => ({ x: padX + xmm * xScale, y: baseY - ymm * yScale });

    // Snow line
    ctx.strokeStyle = C.snow; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, baseY);
    ctx.lineTo(padX + plotW, baseY);
    ctx.stroke();

    // Build the profile points using the new rockerHeight() formula which gives a continuous,
    // upward-curving rise (no leveling off at the very ends).
    const tailC = TAIL, tipC = L - TL, runL = tipC - tailC;
    const pts = [];
    const n = 400;
    for (let i = 0; i <= n; i++) {
      const xmm = (i / n) * L;
      let ymm;
      if (xmm <= tailC) {
        // Tail rocker: rise from 0 at the contact (xmm=tailC) up to TAH at the tail-end (xmm=0).
        // Define s so that s=0 at contact and s=1 at tail-end — same convention as the tip.
        const s = 1 - (xmm / tailC);
        ymm = rockerHeight(s, TAH);
      } else if (xmm >= tipC) {
        // Tip rocker: from 0 at xmm=tipC up to tipHeight at xmm=L.
        const s = (xmm - tipC) / TL;  // s=0 at contact, s=1 at tip-end
        ymm = rockerHeight(s, TH);
      } else {
        // Camber arch in the middle
        const t = (xmm - tailC) / runL;
        ymm = CH * 4 * t * (1 - t);
      }
      pts.push(toC(xmm, ymm));
    }

    // Fill profile
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i+1].x) / 2;
      const yc = (pts[i].y + pts[i+1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.quadraticCurveTo(pts[pts.length-2].x, pts[pts.length-2].y, pts[pts.length-1].x, pts[pts.length-1].y);
    ctx.lineTo(pts[pts.length-1].x, baseY);
    ctx.lineTo(pts[0].x, baseY);
    ctx.closePath();
    ctx.fillStyle = C.profileFill; ctx.fill();

    // Stroke top curve only
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i+1].x) / 2;
      const yc = (pts[i].y + pts[i+1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.quadraticCurveTo(pts[pts.length-2].x, pts[pts.length-2].y, pts[pts.length-1].x, pts[pts.length-1].y);
    ctx.save();
    ctx.shadowColor = C.skiGlow; ctx.shadowBlur = 5;
    ctx.strokeStyle = C.skiStroke; ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // Height value labels
    ctx.fillStyle = C.heading;
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    const drawV = (xmm, ymm, align) => {
      const top = toC(xmm, ymm);
      ctx.textAlign = align;
      ctx.fillText(`${ymm}mm`, top.x + (align === "left" ? 6 : align === "right" ? -6 : 0), top.y - 6);
    };
    drawV(0, TAH, "left");
    drawV(L, TH, "right");
    if (CH > 0) drawV(tailC + runL/2, CH, "center");

    ctx.fillStyle = C.dimText;
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";  ctx.fillText("TAIL", padX + 6, padTop + 10);
    ctx.textAlign = "right"; ctx.fillText("TIP",  padX + plotW - 6, padTop + 10);

    if (yExagg > 1.05) {
      ctx.fillStyle = C.labelDim;
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`Y-scale: ${yExagg.toFixed(1)}\u00D7 exaggerated for readability`, padX + 6, height - 6);
    }
  }, [ski, width, height, TL, TAIL, TH, TAH, CH, L]);
  return (<canvas ref={canvasRef} style={{ width, height, cursor: "default", display: "block" }} />);
}

// ══════════════ CORE VIEW ══════════════
function CoreView({ ski, setSki, width, height }) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const cp = ski.coreProfile;

  const padL = 30, padR = 14, padT = 18, padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxThick = 16;
  const toC2 = useCallback((pos, thick) => ({
    x: padL + pos * plotW,
    y: padT + plotH - (thick / maxThick) * plotH,
  }), [plotW, plotH]);
  const baseY = padT + plotH;
  const fromC2 = useCallback((cx2, cy2) => ({
    pos: (cx2 - padL) / plotW,
    thick: ((baseY - cy2) / plotH) * maxThick,
  }), [plotW, plotH, baseY]);

  const getThickAt = useCallback((pos) => {
    if (pos <= cp[0].pos) return cp[0].thick;
    if (pos >= cp[cp.length - 1].pos) return cp[cp.length - 1].thick;
    for (let i = 0; i < cp.length - 1; i++) {
      if (pos >= cp[i].pos && pos <= cp[i+1].pos) {
        const t = (pos - cp[i].pos) / (cp[i+1].pos - cp[i].pos);
        const s = t * t * t * (t * (t * 6 - 15) + 10);  // smootherstep
        return cp[i].thick + s * (cp[i+1].thick - cp[i].thick);
      }
    }
    return 0;
  }, [cp]);

  const cps = useMemo(() => cp.map((n, i) => {
    const c = toC2(n.pos, n.thick);
    return { id: `core_${i}`, cx: c.x, cy: c.y, idx: i };
  }), [cp, toC2]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);

    // Gridlines
    ctx.strokeStyle = C.gridLine; ctx.lineWidth = 0.5;
    for (let mm = 0; mm <= maxThick; mm += 4) {
      const p = toC2(0, mm);
      ctx.beginPath(); ctx.moveTo(padL, p.y); ctx.lineTo(padL + plotW, p.y); ctx.stroke();
    }
    ctx.strokeStyle = C.snow; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, baseY); ctx.lineTo(padL + plotW, baseY); ctx.stroke();
    ctx.fillStyle = C.labelDim; ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    for (let mm = 0; mm <= maxThick; mm += 4) {
      const p = toC2(0, mm);
      ctx.fillText(`${mm}`, padL - 4, p.y + 3);
    }

    // Smooth profile
    const nPts = 400;
    const pts = [];
    for (let i = 0; i <= nPts; i++) {
      const pos = i / nPts;
      pts.push(toC2(pos, getThickAt(pos)));
    }
    // Fill
    ctx.beginPath();
    ctx.moveTo(padL, baseY);
    ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i+1].x) / 2;
      const yc = (pts[i].y + pts[i+1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
    ctx.lineTo(padL + plotW, baseY);
    ctx.closePath();
    ctx.fillStyle = C.coreFill; ctx.fill();
    // Stroke
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i+1].x) / 2;
      const yc = (pts[i].y + pts[i+1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
    ctx.save();
    ctx.shadowColor = C.coreGlow; ctx.shadowBlur = 4;
    ctx.strokeStyle = C.coreStroke; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    cps.forEach(cpObj => {
      const isH = hovered === cpObj.id, isD = dragging === cpObj.id;
      const r = isD ? 7 : isH ? 6 : 4.5;
      if (isH || isD) {
        ctx.beginPath();
        ctx.arc(cpObj.cx, cpObj.cy, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(200,147,90,0.30)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cpObj.cx, cpObj.cy, r, 0, Math.PI * 2);
      ctx.fillStyle = isD ? C.controlActive : isH ? C.controlHover : C.coreNode;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = C.heading;
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${cp[cpObj.idx].thick.toFixed(1)}`, cpObj.cx, cpObj.cy - 10);
    });

    ctx.fillStyle = C.dimText;
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";  ctx.fillText("TAIL", padL + 2, padT + 10);
    ctx.textAlign = "right"; ctx.fillText("TIP",  padL + plotW - 2, padT + 10);
  }, [ski, width, height, cp, cps, hovered, dragging, toC2, baseY, plotW, plotH, padL, padT, getThickAt]);

  const findCP3 = useCallback((mx, my) => {
    for (const c of cps) if (Math.hypot(mx - c.cx, my - c.cy) < 14) return c.id;
    return null;
  }, [cps]);
  const handleDown = useCallback(e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const id = findCP3(mx, my);
    if (id) { setDragging(id); setDragStart({ mx, my, core: JSON.parse(JSON.stringify(cp)) }); }
  }, [findCP3, cp]);
  const handleMove = useCallback(e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (dragging && dragStart) {
      const cpObj = cps.find(c => c.id === dragging); if (!cpObj) return;
      const cur = fromC2(mx, my), start = fromC2(dragStart.mx, dragStart.my);
      const dy = cur.thick - start.thick;
      const newCore = JSON.parse(JSON.stringify(dragStart.core));
      newCore[cpObj.idx].thick = clamp(dragStart.core[cpObj.idx].thick + dy, 0.5, 15);
      if (cpObj.idx > 0 && cpObj.idx < newCore.length - 1) {
        const dx = cur.pos - start.pos;
        newCore[cpObj.idx].pos = clamp(
          dragStart.core[cpObj.idx].pos + dx,
          newCore[cpObj.idx - 1].pos + 0.02,
          newCore[cpObj.idx + 1].pos - 0.02
        );
      }
      setSki(s => ({ ...s, coreProfile: newCore }));
    } else {
      setHovered(findCP3(mx, my));
    }
  }, [dragging, dragStart, cps, fromC2, findCP3, setSki]);
  const handleUp = useCallback(() => { setDragging(null); setDragStart(null); }, []);

  return (
    <canvas ref={canvasRef}
      style={{ width, height, cursor: hovered ? (dragging ? "grabbing" : "grab") : "crosshair", display: "block" }}
      onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp}
      onMouseLeave={() => { handleUp(); setHovered(null); }} />
  );
}

// ══════════════ FLEX VIEW (smooth curves) ══════════════
function FlexView({ ski, flex, width, height }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !flex) return;
    const ctx = canvas.getContext("2d"); const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);

    const padL = 42, padR = 42, padT = 18, padB = 22;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const st = flex.stations;
    const maxK = Math.max(...st.map(s => s.kCant)) * 1.15;
    const maxEI = Math.max(...st.map(s => s.ei)) * 1.15;
    const toC3 = (pos, val, mv) => ({
      x: padL + pos * plotW,
      y: padT + plotH - (val / mv) * plotH,
    });

    ctx.strokeStyle = C.gridLine; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }
    ctx.strokeStyle = C.snow; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

    const drawSmoothCurve = (points, fillStyle, strokeStyle, lineWidth, glow) => {
      // Fill
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i+1].x) / 2;
        const yc = (points[i].y + points[i+1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.lineTo(padL, padT + plotH);
      ctx.closePath();
      ctx.fillStyle = fillStyle; ctx.fill();
      // Stroke
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i+1].x) / 2;
        const yc = (points[i].y + points[i+1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
      if (glow) { ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 4; }
      ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke();
      if (glow) ctx.restore();
    };

    const eiPts = st.map(s => toC3(s.pos, s.ei, maxEI));
    drawSmoothCurve(eiPts, C.eiFill, C.eiStroke, 1.5, null);
    const kPts = st.map(s => toC3(s.pos, s.kCant, maxK));
    drawSmoothCurve(kPts, C.flexFill, C.flexStroke, 2, C.flexGlow);

    ctx.fillStyle = C.flexStroke; ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      ctx.fillText(`${Math.round(maxK * i / 4)}`, padL - 4, padT + plotH - (i / 4) * plotH + 3);
    }
    ctx.fillStyle = C.eiStroke; ctx.textAlign = "left";
    for (let i = 0; i <= 4; i++) {
      ctx.fillText(`${(maxEI * i / 4 / 1e6).toFixed(0)}`, padL + plotW + 4, padT + plotH - (i / 4) * plotH + 3);
    }
    ctx.fillStyle = C.flexStroke;
    ctx.save();
    ctx.translate(10, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.fillText("N/mm", 0, 0);
    ctx.restore();
    ctx.fillStyle = C.eiStroke;
    ctx.save();
    ctx.translate(width - 6, padT + plotH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("N\u00B7m\u00B2", 0, 0);
    ctx.restore();

    ctx.fillStyle = C.dimText; ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";  ctx.fillText("TAIL", padL + 2, padT + 10);
    ctx.textAlign = "right"; ctx.fillText("TIP",  padL + plotW - 2, padT + 10);

    ctx.fillStyle = C.flexStroke;
    ctx.fillRect(padL + 6, padT + plotH - 32, 12, 2);
    ctx.fillStyle = C.dimText; ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textAlign = "left"; ctx.fillText("Stiffness", padL + 22, padT + plotH - 29);
    ctx.fillStyle = C.eiStroke;
    ctx.fillRect(padL + 6, padT + plotH - 20, 12, 2);
    ctx.fillStyle = C.dimText; ctx.fillText("EI", padL + 22, padT + plotH - 17);

    const pk = st.reduce((a, b) => b.kCant > a.kCant ? b : a);
    const pp = toC3(pk.pos, pk.kCant, maxK);
    ctx.beginPath(); ctx.arc(pp.x, pp.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = C.flexStroke; ctx.fill();
    ctx.fillStyle = C.controlActive; ctx.font = "bold 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(pk.kCant)}`, pp.x, pp.y - 8);
  }, [flex, width, height]);
  return (<canvas ref={canvasRef} style={{ width, height, cursor: "default", display: "block" }} />);
}
// ══════════════ FEEDBACK MODAL ══════════════
// Lightweight beta-feedback form. POSTs to Formspree's REST endpoint (free tier, up to 50
// submissions/month at launch — plenty for early Reddit-driven validation). Submissions arrive
// via email and are also viewable in the Formspree dashboard, exportable to CSV.
//
// To activate: replace FORMSPREE_ENDPOINT below with your actual Formspree form URL (after
// signing up at formspree.io and creating a form).
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xkoegnlg";

function FeedbackModal({ isOpen, onClose, trigger }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    experience: "",
    heardFrom: "",
    feedback: "",
    interestedPaid: false,
    interestedForum: false,
  });

  if (!isOpen) return null;

  const handleField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.feedback) {
      setError("Email and feedback are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          name: form.name || "(not provided)",
          email: form.email,
          experience: form.experience || "(not provided)",
          heard_from: form.heardFrom || "(not provided)",
          feedback: form.feedback,
          interested_in_paid_version: form.interestedPaid ? "Yes" : "No",
          interested_in_revived_forum: form.interestedForum ? "Yes" : "No",
          trigger: trigger || "manual",
          source: "Black Chapel Ski Designer",
          timestamp: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError("Submission failed. Please try again, or email matheson@blackchapelstudios.com directly.");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: "100%",
    background: C.inputBg,
    border: `1px solid ${C.inputBorder}`,
    borderRadius: 4,
    padding: "8px 10px",
    color: C.value,
    fontSize: 13,
    fontFamily: "'Segoe UI', sans-serif",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 12,
  };
  const labelStyle = {
    display: "block",
    color: C.label,
    fontSize: 11,
    marginBottom: 4,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 6,
        padding: "24px 28px", width: "100%", maxWidth: 520, maxHeight: "90vh",
        overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }} onClick={e => e.stopPropagation()}>
        {!submitted ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ color: C.heading, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, marginBottom: 4 }}>BLACK CHAPEL STUDIOS</div>
                <div style={{ color: C.value, fontSize: 20, fontWeight: 600 }}>Send Feedback</div>
                <div style={{ color: C.labelDim, fontSize: 12, marginTop: 4 }}>This designer is in early beta. Your input shapes what comes next.</div>
              </div>
              <button onClick={onClose} style={{
                background: "transparent", border: "none", color: C.labelDim,
                fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1,
              }}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <label style={labelStyle}>Name <span style={{ color: C.labelDim, textTransform: "none" }}>(optional)</span></label>
              <input type="text" value={form.name} onChange={e => handleField("name", e.target.value)} style={inputStyle} />

              <label style={labelStyle}>Email <span style={{ color: C.torch }}>*</span></label>
              <input type="email" value={form.email} onChange={e => handleField("email", e.target.value)} style={inputStyle} required />

              <label style={labelStyle}>Ski Building Experience</label>
              <select value={form.experience} onChange={e => handleField("experience", e.target.value)} style={{...inputStyle, cursor: "pointer"}}>
                <option value="">Select...</option>
                <option value="Never built one">Never built a ski</option>
                <option value="Built 1-5">Built 1–5 pairs</option>
                <option value="Built 6+">Built 6+ pairs</option>
                <option value="Professional">Professional / commercial builder</option>
              </select>

              <label style={labelStyle}>How did you hear about this?</label>
              <input type="text" value={form.heardFrom} onChange={e => handleField("heardFrom", e.target.value)}
                placeholder="Reddit, friend, search..." style={inputStyle} />

              <label style={labelStyle}>Your Feedback <span style={{ color: C.torch }}>*</span></label>
              <textarea value={form.feedback} onChange={e => handleField("feedback", e.target.value)}
                placeholder="What's working, what's broken, what's missing?"
                style={{...inputStyle, minHeight: 100, fontFamily: "'Segoe UI', sans-serif", resize: "vertical"}}
                required />

              <div style={{ background: C.bgDeep, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "12px 14px", marginBottom: 14 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 10 }}>
                  <input type="checkbox" checked={form.interestedPaid}
                    onChange={e => handleField("interestedPaid", e.target.checked)}
                    style={{ marginTop: 3, accentColor: C.heading, cursor: "pointer" }} />
                  <span style={{ color: C.value, fontSize: 13, lineHeight: 1.4 }}>
                    I'd be interested in a paid version with unlimited exports and advanced features.
                  </span>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.interestedForum}
                    onChange={e => handleField("interestedForum", e.target.checked)}
                    style={{ marginTop: 3, accentColor: C.heading, cursor: "pointer" }} />
                  <span style={{ color: C.value, fontSize: 13, lineHeight: 1.4 }}>
                    I'd be interested in joining a new forum — similar to the old skibuilders.com forum if it were revived.
                  </span>
                </label>
              </div>

              {error && (
                <div style={{ color: C.torch, fontSize: 12, marginBottom: 12, padding: "8px 10px", background: "rgba(216,90,48,0.10)", border: `1px solid ${C.torch}`, borderRadius: 4 }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
                <button type="button" onClick={onClose} style={{
                  background: "transparent", border: `1px solid ${C.inputBorder}`, color: C.label,
                  padding: "10px 18px", borderRadius: 4, cursor: "pointer", fontSize: 13,
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
                }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{
                  background: C.heading, border: "none", color: C.bgDeep,
                  padding: "10px 22px", borderRadius: 4, cursor: submitting ? "wait" : "pointer", fontSize: 13,
                  fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
                  opacity: submitting ? 0.6 : 1,
                }}>{submitting ? "Sending..." : "Send Feedback"}</button>
              </div>
            </form>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 10px" }}>
            <div style={{ color: C.heading, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, marginBottom: 8 }}>RECEIVED</div>
            <div style={{ color: C.value, fontSize: 22, fontWeight: 600, marginBottom: 12, fontFamily: "'Fraunces', Georgia, serif" }}>Thank you.</div>
            <div style={{ color: C.labelDim, fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
              Your feedback has been recorded. We read every submission.<br/>
              Worship the work.
            </div>
            <button onClick={onClose} style={{
              background: C.heading, border: "none", color: C.bgDeep,
              padding: "10px 28px", borderRadius: 4, cursor: "pointer", fontSize: 13,
              fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
            }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════ ACCORDION SECTION (module-level for stable identity) ══════════════
// Defined at module scope rather than inside App() so React doesn't unmount/remount it on every
// parent re-render. (When defined inline, every keystroke in any input triggers App to re-render,
// which creates a fresh AccordionSection function reference, which makes React tear down and
// rebuild the entire subtree — causing focused inputs to lose focus after each character.)
function AccordionSection({ isOpen, onToggle, title, accent, children }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.panelBorder}` }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "9px 12px", background: "transparent", border: "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            color: C.heading, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
          }}>{title}</span>
          {accent}
        </span>
        <span style={{ color: C.heading, fontSize: 10, fontFamily: "monospace" }}>
          {isOpen ? "▾" : "▸"}
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: "2px 12px 10px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ══════════════ MAIN ══════════════
export default function App() {
  const [ski, setSki] = useState(DEFAULT_SKI);
  const [activeView, setActiveView] = useState("all");
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const derived = useMemo(() => computeDerived(ski), [ski]);
  const flex = useMemo(() => computeFlexProfile(ski), [ski]);

  // ── Save / Load state ─────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [loadMessage, setLoadMessage] = useState(null);  // { type: "ok"|"error"|"warn", text }
  const [recoverBanner, setRecoverBanner] = useState(null);

  // On mount: check for an autosave session that doesn't match the initial state.
  useEffect(() => {
    const saved = readAutosave();
    if (saved && saved.ski && JSON.stringify(saved.ski) !== JSON.stringify(DEFAULT_SKI)) {
      setRecoverBanner(saved);
    }
  }, []);

  // Debounced autosave: write to localStorage 1 second after the last edit.
  useEffect(() => {
    const t = setTimeout(() => writeAutosave(ski), 1000);
    return () => clearTimeout(t);
  }, [ski]);

  const handleSave = useCallback(() => {
    if (!ski.designName || ski.designName === "Untitled Design") {
      const name = window.prompt("Name this design before saving:", "My Ski Design");
      if (!name) return;
      const named = { ...ski, designName: name };
      setSki(named);
      saveDesignToFile(named);
    } else {
      saveDesignToFile(ski);
    }
  }, [ski]);

  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await loadDesignFromFile(file);
    if (result.ok) {
      setSki(result.ski);
      setLoadMessage({ type: result.warning ? "warn" : "ok", text: result.warning || `Loaded "${result.ski.designName}"` });
      setTimeout(() => setLoadMessage(null), 4000);
    } else {
      setLoadMessage({ type: "error", text: result.error });
      setTimeout(() => setLoadMessage(null), 5000);
    }
    e.target.value = "";  // allow re-loading the same file
  }, []);

  const handleNewDesign = useCallback(() => {
    if (window.confirm("Start a new design? Any unsaved changes will be lost (autosave will keep a copy).")) {
      setSki({ ...DEFAULT_SKI, designName: "Untitled Design" });
    }
  }, []);

  const acceptRecover = useCallback(() => {
    if (recoverBanner?.ski) setSki(recoverBanner.ski);
    setRecoverBanner(null);
  }, [recoverBanner]);

  const dismissRecover = useCallback(() => {
    clearAutosave();
    setRecoverBanner(null);
  }, []);

  // ── Accordion section state ──────────────────────────────────
  // Persisted in localStorage so user's preferred layout sticks across sessions.
  const ACCORDION_KEY = "bcs_sections_open";
  const defaultSectionsOpen = {
    file: true,
    views: true,
    presets: true,
    dimensions: true,
    sideProfile: false,
    symmetry: false,
    layup: false,
    flex: true,           // open by default so the rating chip is visible
    cncExport: false,
    externalTools: false,
    beta: true,
  };
  const [sectionsOpen, setSectionsOpen] = useState(() => {
    try {
      const raw = localStorage.getItem(ACCORDION_KEY);
      if (raw) return { ...defaultSectionsOpen, ...JSON.parse(raw) };
    } catch (e) {}
    return defaultSectionsOpen;
  });
  const toggleSection = useCallback((key) => {
    setSectionsOpen(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(ACCORDION_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }, []);

  // Feedback modal state. `feedbackTrigger` records WHY the modal was opened (for analytics
  // in the form submission payload — "manual" vs "first-export-prompt").
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackTrigger, setFeedbackTrigger] = useState("manual");

  // Wraps any export function to: (1) run the export, (2) check if this is the user's first
  // export in this browser, and if so, schedule a gentle feedback prompt ~1.5s later.
  // localStorage flag prevents re-prompting on subsequent sessions.
  const exportWithFeedbackPrompt = useCallback((exportFn) => {
    exportFn(ski);
    try {
      const hasPrompted = localStorage.getItem("bcs_feedback_prompted");
      if (!hasPrompted) {
        localStorage.setItem("bcs_feedback_prompted", "1");
        setTimeout(() => {
          setFeedbackTrigger("first-export-prompt");
          setFeedbackOpen(true);
        }, 1500);
      }
    } catch (e) {
      // localStorage may be unavailable (private browsing, etc.) — fail silently
    }
  }, [ski]);

  const openFeedback = useCallback(() => {
    setFeedbackTrigger("manual");
    setFeedbackOpen(true);
  }, []);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Responsive breakpoints ──────────────────────────────────
  // Mobile:  < 768px  (phones any orientation, phablets)
  // Tablet:  768–1023 (iPad portrait, small tablets)
  // Desktop: ≥ 1024   (iPad landscape, laptops, monitors) — original layout
  const isMobile = size.w < 768;
  const isTablet = size.w >= 768 && size.w < 1024;
  const isCompact = isMobile || isTablet;  // both use drawer sidebar
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Close the drawer if the viewport grows back to desktop while it was open,
  // to prevent a lingering overlay when someone rotates or resizes a window.
  useEffect(() => {
    if (!isCompact && drawerOpen) setDrawerOpen(false);
  }, [isCompact, drawerOpen]);

  const panelW = 270;
  const mobileHeaderH = 52;
  // On compact viewports the sidebar becomes a drawer, so the main canvas gets full width
  // and the top mobile header takes a fixed slice of the height.
  const canvasW = isCompact ? size.w : (size.w - panelW);
  const canvasAreaH = isCompact ? Math.max(0, size.h - mobileHeaderH) : size.h;
  let planH = 0, profH = 0, coreH = 0, flexH = 0;
  if (activeView === "plan")    planH = canvasAreaH;
  else if (activeView === "profile") profH = canvasAreaH;
  else if (activeView === "core")    coreH = canvasAreaH;
  else if (activeView === "flex")    flexH = canvasAreaH;
  else {
    // Plan gets more height because it now has 2 rows internally
    planH = Math.floor(canvasAreaH * 0.48);
    profH = Math.floor(canvasAreaH * 0.16);
    coreH = Math.floor(canvasAreaH * 0.18);
    flexH = canvasAreaH - planH - profH - coreH;
  }

  const setLayup = (key, val) => setSki(s => ({ ...s, layup: { ...s.layup, [key]: val } }));

  const inputField = (label, param, min, max, step) => (
    <div style={{ marginBottom: 7 }}>
      <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>{label}</div>
      <input
        type="number" value={ski[param]} min={min} max={max} step={step || 1}
        onChange={e => setSki(s => ({ ...s, [param]: parseFloat(e.target.value) || 0 }))}
        style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }}
        onFocus={e => e.target.style.borderColor = C.inputFocus}
        onBlur={e => e.target.style.borderColor = C.inputBorder}
      />
    </div>
  );
  const selectField = (label, value, options, onChange) => (
    <div style={{ marginBottom: 7 }}>
      <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 6px", color: C.value, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box", cursor: "pointer" }}>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v.name}{v.E > 0 ? ` (${(v.E / 1000).toFixed(v.E > 50000 ? 0 : 1)}GPa)` : ""}
          </option>
        ))}
      </select>
    </div>
  );
  const stat = (label, value, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.panelBorder}` }}>
      <span style={{ color: C.label, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
      <span style={{ color: color || C.heading, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{value}</span>
    </div>
  );
  const viewBtn = (label, val) => (
    <button onClick={() => setActiveView(val)} style={{
      flex: 1, padding: "6px 0", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
      background: activeView === val ? C.heading : C.inputBg,
      color: activeView === val ? C.bgDeep : C.label,
      border: `1px solid ${activeView === val ? C.heading : C.inputBorder}`,
      borderRadius: 3, cursor: "pointer",
      fontWeight: activeView === val ? 700 : 400, textTransform: "uppercase", letterSpacing: 0.7
    }}>{label}</button>
  );
  const toggleBtn = (label, key) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <button onClick={() => {
        const nv = !ski[key]; const u = { [key]: nv };
        if (nv) {
          if (key === "tipSymmetric")  u.tipNodesL  = JSON.parse(JSON.stringify(ski.tipNodesR));
          if (key === "tailSymmetric") u.tailNodesL = JSON.parse(JSON.stringify(ski.tailNodesR));
        }
        setSki(s => ({ ...s, ...u }));
      }} style={{ width: 30, height: 14, borderRadius: 7, border: "none", cursor: "pointer", position: "relative", background: ski[key] ? C.heading : C.inputBorder }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, background: "#F0EDE4", position: "absolute", top: 2, left: ski[key] ? 18 : 2, transition: "left 0.2s" }} />
      </button>
      <span style={{ color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>{label}</span>
    </div>
  );

  const expBtn = {
    background: C.exportBtn, border: "none", borderRadius: 3, padding: "7px 0",
    color: C.bgDeep, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer", fontWeight: 700, letterSpacing: 0.7, width: "100%"
  };
  const rating = flexRating(flex.underfootK);

  const viewLabelChip = (text) => (
    <div style={{
      position: "absolute", top: 6, left: 8,
      color: C.heading, fontSize: 8, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
      background: "rgba(31,31,29,0.85)", padding: "2px 8px", borderRadius: 2,
      border: `1px solid ${C.panelBorder}`, textTransform: "uppercase", letterSpacing: 1, pointerEvents: "none",
    }}>{text}</div>
  );

  return (
    <div ref={containerRef} style={{
      display: "flex",
      flexDirection: isCompact ? "column" : "row",
      height: "100%", width: "100%",
      background: C.bg, fontFamily: "'Segoe UI', sans-serif", overflow: "hidden",
      position: "relative",
    }}>
      {/* Mobile / tablet header bar */}
      {isCompact && (
        <div style={{
          height: mobileHeaderH, minHeight: mobileHeaderH,
          background: C.panel, borderBottom: `1px solid ${C.panelBorder}`,
          display: "flex", alignItems: "center", padding: "0 12px",
          gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            style={{
              width: 36, height: 36, background: "transparent",
              border: `1px solid ${C.panelBorder}`, borderRadius: 4,
              color: C.heading, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
              <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ color: C.heading, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", lineHeight: 1.1 }}>Black Chapel Studios</div>
            <div style={{ color: C.label, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", lineHeight: 1.1, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Ski Designer{ski.designName && ski.designName !== "Untitled Design" ? ` · ${ski.designName}` : ""}
            </div>
          </div>
          <button
            onClick={handleSave}
            style={{
              height: 36, padding: "0 14px", background: C.heading,
              border: "none", borderRadius: 4, color: C.bgDeep,
              fontSize: 11, fontWeight: 700, letterSpacing: 0.7,
              fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
              textTransform: "uppercase", flexShrink: 0,
            }}
          >Save</button>
        </div>
      )}

      {/* Backdrop for mobile drawer */}
      {isCompact && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            zIndex: 500,
          }}
        />
      )}

      <div style={
        isCompact
          ? {
              // Mobile / tablet: sidebar becomes a slide-in left drawer
              position: "fixed", top: 0, left: 0, bottom: 0,
              width: Math.min(320, size.w - 40),
              background: C.panel, borderRight: `1px solid ${C.panelBorder}`,
              display: "flex", flexDirection: "column", overflowY: "auto",
              zIndex: 501,
              transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.24s ease-out",
              boxShadow: drawerOpen ? "4px 0 24px rgba(0,0,0,0.4)" : "none",
              WebkitOverflowScrolling: "touch",
            }
          : {
              // Desktop: original inline sidebar
              width: panelW, minWidth: panelW, background: C.panel,
              borderRight: `1px solid ${C.panelBorder}`,
              display: "flex", flexDirection: "column", overflowY: "auto",
            }
      }>
        {/* Hidden file input for Load Design */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          accept=".bcski,.json,application/json"
          style={{ display: "none" }}
        />

        <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${C.panelBorder}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.heading, fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>BLACK CHAPEL STUDIOS</div>
            <div style={{ color: C.label, fontSize: 8, letterSpacing: 2, textTransform: "uppercase", marginTop: 1 }}>Ski Designer</div>
          </div>
          {isCompact && (
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              style={{
                width: 32, height: 32, background: "transparent",
                border: `1px solid ${C.panelBorder}`, borderRadius: 4,
                color: C.heading, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0,
              }}
            >×</button>
          )}
        </div>

        {/* Recover-session banner */}
        {recoverBanner && (
          <div style={{
            margin: "10px 12px",
            background: "rgba(200,147,90,0.10)", border: `1px solid ${C.heading}`, borderRadius: 4,
            padding: "10px 12px",
          }}>
            <div style={{ color: C.heading, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>UNSAVED SESSION</div>
            <div style={{ color: C.value, fontSize: 12, lineHeight: 1.4, marginBottom: 8 }}>
              "{recoverBanner.meta?.designName || "Untitled"}" was left in progress.
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={acceptRecover} style={{
                flex: 1, background: C.heading, border: "none", borderRadius: 3,
                padding: "6px 0", color: C.bgDeep, fontSize: 11, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
              }}>Recover</button>
              <button onClick={dismissRecover} style={{
                flex: 1, background: "transparent", border: `1px solid ${C.panelBorder}`, borderRadius: 3,
                padding: "6px 0", color: C.label, fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
              }}>Discard</button>
            </div>
          </div>
        )}

        {/* Load message toast */}
        {loadMessage && (
          <div style={{
            margin: "0 12px 8px",
            padding: "8px 12px", borderRadius: 4, fontSize: 12, lineHeight: 1.4,
            background: loadMessage.type === "error" ? "rgba(216,90,48,0.15)" : loadMessage.type === "warn" ? "rgba(200,147,90,0.15)" : "rgba(159,184,168,0.15)",
            border: `1px solid ${loadMessage.type === "error" ? C.torch : loadMessage.type === "warn" ? C.heading : "#9FB8A8"}`,
            color: loadMessage.type === "error" ? C.torch : C.value,
          }}>{loadMessage.text}</div>
        )}

        <AccordionSection isOpen={sectionsOpen.file} onToggle={() => toggleSection("file")} title="File">
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Design Name</div>
            <input
              type="text" value={ski.designName || ""}
              onChange={e => setSki(s => ({ ...s, designName: e.target.value }))}
              placeholder="Untitled Design"
              style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "7px 9px", color: C.value, fontSize: 13, fontFamily: "'Segoe UI', sans-serif", outline: "none", boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = C.inputFocus}
              onBlur={e => e.target.style.borderColor = C.inputBorder}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
            <button onClick={handleSave} style={{
              background: C.heading, border: "none", borderRadius: 3, padding: "8px 0",
              color: C.bgDeep, fontSize: 12, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.7, cursor: "pointer",
              textTransform: "uppercase",
            }}>Save</button>
            <button onClick={handleLoadClick} style={{
              background: "transparent", border: `1px solid ${C.heading}`, borderRadius: 3, padding: "8px 0",
              color: C.heading, fontSize: 12, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.7, cursor: "pointer",
              textTransform: "uppercase",
            }}>Load</button>
          </div>
          <button onClick={handleNewDesign} style={{
            width: "100%", background: "transparent", border: `1px solid ${C.inputBorder}`,
            borderRadius: 3, padding: "6px 0", color: C.label, fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, cursor: "pointer",
            textTransform: "uppercase",
          }}>New Design</button>
          <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
            Save to a <span style={{ color: C.heading, fontFamily: "'JetBrains Mono', monospace", borderBottom: `1px solid ${C.heading}` }}>.bcski</span> file on your computer. Files load back at any time, on any device. Auto-save keeps an unsaved copy in your browser.
          </div>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.views} onToggle={() => toggleSection("views")} title="Views">
          <div style={{ display: "flex", gap: 3 }}>
            {viewBtn("Plan", "plan")}{viewBtn("Prof", "profile")}{viewBtn("Core", "core")}{viewBtn("Flex", "flex")}{viewBtn("All", "all")}
          </div>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.presets} onToggle={() => toggleSection("presets")} title="Presets">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => setSki({ ...p, designName: p.name, layup: ski.layup })}
                style={{ background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "5px 11px", color: C.label, fontSize: 12, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
                onMouseOver={e => { e.currentTarget.style.borderColor = C.heading; e.currentTarget.style.color = C.heading; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = C.inputBorder; e.currentTarget.style.color = C.label; }}
              >{p.name}</button>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.dimensions} onToggle={() => toggleSection("dimensions")} title="Dimensions (mm)">
          {inputField("Length", "length", 1200, 2200)}
          {inputField("Tip W", "tipWidth", 60, 200)}
          {inputField("Waist", "waistWidth", 50, 180)}
          {inputField("Tail W", "tailWidth", 60, 200)}
          {inputField("Tip Len", "tipLength", 80, 500)}
          {inputField("Tail Len", "tailLength", 60, 400)}
          {inputField("Waist Pos", "waistPosition", 0.30, 0.70, 0.01)}
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.sideProfile} onToggle={() => toggleSection("sideProfile")} title="Side Profile">
          {inputField("Tip Rise", "tipHeight", 5, 80)}
          {inputField("Tail Rise", "tailHeight", 5, 60)}
          {inputField("Camber", "camberHeight", 0, 10, 0.5)}
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.symmetry} onToggle={() => toggleSection("symmetry")} title="Symmetry">
          {toggleBtn("Tip Symmetric", "tipSymmetric")}
          {toggleBtn("Tail Symmetric", "tailSymmetric")}
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.layup} onToggle={() => toggleSection("layup")} title="Layup / Materials">
          {selectField("Wood Core", ski.layup.wood, WOODS, v => setLayup("wood", v))}
          {selectField("Fiberglass", ski.layup.glass, GLASS, v => setLayup("glass", v))}
          <div style={{ marginBottom: 7 }}>
            <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Glass Layers / side</div>
            <input type="number" value={ski.layup.glassLayers} min={1} max={4} step={1}
              onChange={e => setLayup("glassLayers", parseInt(e.target.value) || 1)}
              style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }} />
          </div>
          {selectField("Metal", ski.layup.metal, METALS, v => setLayup("metal", v))}
          {selectField("Carbon", ski.layup.carbon, CARBON, v => setLayup("carbon", v))}
          {ski.layup.carbon !== "none" && (
            <div style={{ marginBottom: 7 }}>
              <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Carbon Layers</div>
              <input type="number" value={ski.layup.carbonLayers} min={1} max={4} step={1}
                onChange={e => setLayup("carbonLayers", parseInt(e.target.value) || 1)}
                style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.flex} onToggle={() => toggleSection("flex")}
          title="Flex Analysis"
          accent={
            <span style={{
              background: rating.color + "30", color: rating.color,
              border: `1px solid ${rating.color}66`, borderRadius: 3,
              padding: "2px 8px", fontSize: 10, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
            }}>{rating.label}</span>
          }
        >
          <div style={{ background: rating.color + "20", border: `1px solid ${rating.color}66`, borderRadius: 4, padding: "7px 10px", marginBottom: 8, textAlign: "center" }}>
            <div style={{ color: rating.color, fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{rating.label}</div>
            <div style={{ color: C.labelDim, fontSize: 10, marginTop: 2 }}>Underfoot flex rating</div>
          </div>
          {stat("Underfoot", `${Math.round(flex.underfootK)} N/mm`, C.flexStroke)}
          {stat("Peak", `${Math.round(flex.peakK)} N/mm`, C.flexStroke)}
          {stat("3pt Bend", `${flex.k3pt.toFixed(2)} N/mm`, C.flexStroke)}
          {stat("Peak EI", `${(flex.peakEI / 1e6).toFixed(0)} N\u00B7m\u00B2`, C.eiStroke)}
          {stat("Dims", `${ski.tipWidth}-${ski.waistWidth}-${ski.tailWidth}`)}
          {stat("Eff Edge", `${Math.round(derived.effectiveEdge)} mm`)}
          {stat("Sidecut R", derived.sidecutRadius < 999 ? `${derived.sidecutRadius.toFixed(1)} m` : "--")}
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.cncExport} onToggle={() => toggleSection("cncExport")} title="CNC Export">
          {inputField("Edge Inset (mm)", "edgeInset", 0, 10, 0.5)}
          {inputField("Core Inset (mm)", "coreInset", 0, 10, 0.5)}
          <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginBottom: 12, marginTop: 8 }}>
            <b style={{color: C.heading}}>Edge inset:</b> P-Tex base cut offset (leaves room for metal edges).<br/>
            <b style={{color: C.heading}}>Core inset:</b> width reduction per side for sidewall material on core blank.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            <button onClick={() => exportWithFeedbackPrompt(exportPlanDXF)} style={expBtn}>Plan DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportPlanSVG)} style={expBtn}>Plan SVG</button>
            <button onClick={() => exportWithFeedbackPrompt(exportCoreSideDXF)} style={expBtn}>Core Side DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportCoreSideSVG)} style={expBtn}>Core Side SVG</button>
            <button onClick={() => exportWithFeedbackPrompt(exportCorePlanDXF)} style={expBtn}>Core Plan DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportCorePlanSVG)} style={expBtn}>Core Plan SVG</button>
            <button onClick={() => exportWithFeedbackPrompt(exportRockerDXF)} style={expBtn}>Rocker DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportRockerSVG)} style={expBtn}>Rocker SVG</button>
          </div>
          <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5 }}>
            <b style={{color: C.heading}}>Plan</b>: outer edge line + inset base-cut line (top-down).<br/>
            <b style={{color: C.heading}}>Core Side</b>: closed flat-bottom side profile for extrusion in 3D (XZ plane).<br/>
            <b style={{color: C.heading}}>Core Plan</b>: top-down core outline for boolean cut (XY plane).<br/>
            <b style={{color: C.heading}}>Rocker</b>: side-view line for press mold.<br/>
            All include registration marks at tail / waist / tip contact for CAD alignment.
          </div>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.externalTools} onToggle={() => toggleSection("externalTools")} title="External Tools">
          <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
            <b style={{color: C.heading}}>Edit tips:</b><br/>
            • Drag nodes (circles) on the main view to reshape & adjust dimensions.<br/>
            • Drag tangent handles (diamonds) in the zoom panels for fine bezier control.<br/>
            • Width handles on contacts adjust tip/tail width.
          </div>
          <a href="https://www.junksupply.com/ski-calculator/" target="_blank" rel="noopener noreferrer"
            style={{ display: "block", color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, textDecoration: "none" }}>Junk Supply Calc ↗</a>
          <a href="https://soothski.com/compare/" target="_blank" rel="noopener noreferrer"
            style={{ display: "block", color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, textDecoration: "none" }}>Sooth Ski Comparator ↗</a>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.beta} onToggle={() => toggleSection("beta")} title="Beta / Feedback">
          <div style={{
            background: "rgba(216,90,48,0.10)", border: `1px solid ${C.torch}`, borderRadius: 4,
            padding: "8px 10px", marginBottom: 8,
          }}>
            <div style={{ color: C.value, fontSize: 11, lineHeight: 1.4 }}>
              This designer is in active development. Your feedback shapes what comes next.
            </div>
          </div>
          <button onClick={openFeedback} style={{
            width: "100%", background: C.heading, border: "none", borderRadius: 4,
            padding: "9px 0", color: C.bgDeep, fontSize: 11, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, cursor: "pointer",
            textTransform: "uppercase",
          }}>Send Feedback</button>
        </AccordionSection>

        <div style={{ marginTop: "auto", padding: "8px 12px", borderTop: `1px solid ${C.panelBorder}` }}>
          <div style={{ color: C.labelDim, fontSize: 7, letterSpacing: 1 }}>WORSHIP THE WORK.</div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {planH > 0 && (
          <div style={{ height: planH, position: "relative", borderBottom: `1px solid ${C.panelBorder}` }}>
            <PlanView ski={ski} setSki={setSki} width={canvasW} height={planH} />
            {viewLabelChip("Plan")}
          </div>
        )}
        {profH > 0 && (
          <div style={{ height: profH, position: "relative", borderBottom: `1px solid ${C.panelBorder}` }}>
            <ProfileView ski={ski} width={canvasW} height={profH} />
            {viewLabelChip("Side Profile")}
          </div>
        )}
        {coreH > 0 && (
          <div style={{ height: coreH, position: "relative", borderBottom: `1px solid ${C.panelBorder}` }}>
            <CoreView ski={ski} setSki={setSki} width={canvasW} height={coreH} />
            {viewLabelChip("Core")}
          </div>
        )}
        {flexH > 0 && (
          <div style={{ height: flexH, position: "relative" }}>
            <FlexView ski={ski} flex={flex} width={canvasW} height={flexH} />
            {viewLabelChip("Flex")}
          </div>
        )}
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        trigger={feedbackTrigger}
      />
    </div>
  );
}
