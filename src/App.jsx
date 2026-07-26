import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ══════════════ BLACK CHAPEL THEME ══════════════
const C = {
  // Palette matched to the Black Chapel fretboard designer (warm forge-black).
  bg:           "#141210",  // forge — main background
  bgDeep:       "#0e0c0a",  // deeper than forge for insets
  bgLight:      "#2a2622",  // anvil (control surface)
  panel:        "#1c1916",  // forge2 (raised panel / sidebar)
  panelLight:   "#2a2622",  // anvil
  panelBorder:  "#37322c",  // anvil2 (borders)
  gridLine:     "#2a2622",
  gridMajor:    "#37322c",
  center:       "rgba(200,147,90,0.20)",
  snow:         "rgba(237,230,216,0.30)",
  contactLine:  "rgba(232,85,42,0.55)",  // torch, for tip/tail contact reference lines
  skiFill:      "rgba(237,230,216,0.08)",
  skiStroke:    "#ede6d8",  // bone
  skiGlow:      "rgba(237,230,216,0.20)",
  control:      "#e8552a",  // torch
  controlHover: "#f07a52",
  controlActive:"#FFD080",
  handle:       "#c8935a",  // brass
  handleLine:   "rgba(200,147,90,0.55)",
  label:        "#9b9388",  // bone-dim
  labelDim:     "#6f685f",
  value:        "#ede6d8",  // bone
  heading:      "#c8935a",  // brass
  dim:          "rgba(237,230,216,0.35)",
  dimText:      "rgba(237,230,216,0.75)",
  inputBg:      "#141210",  // forge
  inputBorder:  "#37322c",  // anvil2
  inputFocus:   "#c8935a",  // brass
  profileFill:  "rgba(237,230,216,0.06)",
  coreFill:     "rgba(200,147,90,0.10)",
  coreStroke:   "#c8935a",
  coreGlow:     "rgba(200,147,90,0.30)",
  coreNode:     "#c8935a",
  flexStroke:   "#e8552a",  // torch
  flexFill:     "rgba(232,85,42,0.10)",
  flexGlow:     "rgba(232,85,42,0.35)",
  eiStroke:     "#ede6d8",  // bone
  eiFill:       "rgba(237,230,216,0.06)",
  exportBtn:    "#c8935a",  // brass
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

// Default core thickness profile. The wood core proper runs between the tip and tail CONTACT points;
// past the contacts it stays flat & thin (filler territory), so we taper to 2mm at each contact and
// hold 2mm out to the ends. Two nodes are flagged `contact:'tail'|'tip'` — these are pinned to the
// live contact positions (see syncCoreContacts) so they track the ski when tip/tail length changes.
// The end nodes (pos 0 and 1) are flagged `end:true` and also stay pinned to 0/1.
function makeDefaultCore(ski){
  const L = ski ? ski.length : 1800;
  const tailC = ski ? ski.tailLength : 170;
  const tipC = ski ? (ski.length - ski.tipLength) : 1560;
  const tailPos = tailC / L;         // tail contact, as a fraction of length
  const tipPos = tipC / L;           // tip contact
  // Thickness values across the running (contact-to-contact) region, tail→tip. The two ends are the
  // pinned contact nodes at 2mm; the interior nodes rise to the underfoot peak. Positions are spread
  // EVENLY between the contacts so the adjustment dots are uniformly distributed.
  const runThk = [2.0, 6.0, 10.0, 11.5, 10.0, 6.0, 2.0];
  const nSeg = runThk.length - 1;    // 6 segments → 7 evenly spaced nodes
  const nodes = runThk.map((thick, i) => {
    const pos = tailPos + (tipPos - tailPos) * (i / nSeg);
    const node = { pos, thick };
    if (i === 0) node.contact = 'tail';
    if (i === nSeg) node.contact = 'tip';
    return node;
  });
  return [
    { pos: 0.0, thick: 2.0, end: true },   // tail end (flat 2mm past contact)
    ...nodes,
    { pos: 1.0, thick: 2.0, end: true },   // tip end (flat 2mm past contact)
  ];
}

// Keep the contact-flagged core nodes sitting exactly on the live contact positions, and the
// end-flagged nodes pinned at 0/1. Call after any change to length / tipLength / tailLength.
// Interior (unflagged) nodes are re-parameterised proportionally within the new contact span so a
// dimension tweak doesn't shove them past a contact. Returns a new coreProfile array.
function syncCoreContacts(ski){
  const cp = ski.coreProfile;
  if (!cp || !cp.length) return cp;
  const L = ski.length;
  const tailPos = ski.tailLength / L;
  const tipPos = (L - ski.tipLength) / L;
  // Old contact positions (from the flagged nodes) to remap interior nodes proportionally.
  const oldTail = cp.find(n => n.contact === 'tail');
  const oldTip = cp.find(n => n.contact === 'tip');
  const oT = oldTail ? oldTail.pos : tailPos;
  const oP = oldTip ? oldTip.pos : tipPos;
  const span = (oP - oT) || 1;
  return cp.map(n => {
    if (n.end) return { ...n, pos: n.pos <= 0.5 ? 0.0 : 1.0 };
    if (n.contact === 'tail') return { ...n, pos: tailPos };
    if (n.contact === 'tip') return { ...n, pos: tipPos };
    // interior: remap its fractional position within the old span onto the new span
    const frac = (n.pos - oT) / span;
    return { ...n, pos: tailPos + frac * (tipPos - tailPos) };
  });
}
const DEFAULT_LAYUP={wood:"poplar",glass:"triax23",glassLayers:1,metal:"none",carbon:"none",carbonLayers:1};
const DEFAULT_SKI={
  designName: "Untitled Design",
  length:1800,tipWidth:132,waistWidth:98,tailWidth:120,
  tipLength:240,tailLength:170,tipHeight:45,tailHeight:30,camberHeight:3,
  waistPosition:0.48,
  // Rocker takeoff (where the base lifts) vs contact point (widest point / sidecut extent).
  // rockerLinked=true (default, Snocad-style): takeoff = contact, so the rocker/camber boundary in
  // the side profile sits exactly at the tip/tail contact points. When false (advanced): the takeoff
  // sits INBOARD of the contacts, set independently by tipRockerLen/tailRockerLen, so a published
  // rocker % and a published sidecut radius can both be matched at once (they're different locations).
  rockerLinked:true,
  radiusTarget:"waist",  // what the Sidecut R input adjusts: "waist" (design) or "tiptail" (spec-match).
  tipRockerLen:240,   // mm from tip end to rocker takeoff. When linked, mirrors tipLength.
  tailRockerLen:170,  // mm from tail end to rocker takeoff. When linked, mirrors tailLength.
  edgeInset:2.0,    // mm. P-Tex base cut inset from outer edge (steel edge width).
  edgeWrap:"full",  // "full" = edges wrap around tip/tail; "contact" = edges only tail-contact→tip-contact.
  edgeExtTip:0,     // mm. In contact mode, extend the edge past the TIP contact point toward the tip.
  edgeExtTail:0,    // mm. In contact mode, extend the edge past the TAIL contact point toward the tail.
  coreInset:0,      // mm. Core top-profile width reduction per side for sidewall material. Default 0
                    // (flush / cap-construction or wood sidewalls); users doing sidewalls set 5-10.
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
  const newerFile = parsed.formatVersion > BCSKI_FORMAT_VERSION;

  // FORWARD-COMPATIBILITY MERGE — this is what keeps old .bcski files working in future builds.
  // We start from the current DEFAULT_SKI and lay the file's values on top. Any field that exists
  // in a newer app but is MISSING from an older file falls back to the default instead of becoming
  // `undefined` (which is what breaks renders). Nested objects that gained new keys are merged one
  // level deep so their new defaults backfill too, while the file's own values always win.
  const mergeDefaults = (base, loaded) => {
    const out = { ...base, ...loaded };
    for (const k of Object.keys(base)) {
      const bv = base[k], lv = loaded[k];
      // If both are plain (non-array) objects, merge one level so new sub-keys backfill.
      if (bv && lv && typeof bv === "object" && typeof lv === "object" && !Array.isArray(bv) && !Array.isArray(lv)) {
        out[k] = { ...bv, ...lv };
      }
    }
    return out;
  };
  ski = mergeDefaults(DEFAULT_SKI, ski);

  // Rocker-link migration: files saved before the linked/unlinked feature won't have rockerLinked or
  // the takeoff lengths. Default them to LINKED with takeoff = the file's own contacts, so old designs
  // look and behave exactly as before (rocker begins at the contact points).
  if (ski.rockerLinked === undefined) ski.rockerLinked = true;
  if (ski.rockerLinked !== false) {
    ski.tipRockerLen = ski.tipLength;
    ski.tailRockerLen = ski.tailLength;
  } else {
    if (ski.tipRockerLen == null) ski.tipRockerLen = ski.tipLength;
    if (ski.tailRockerLen == null) ski.tailRockerLen = ski.tailLength;
  }

  // Migrate older core profiles that predate contact-pinned nodes: if none of the nodes carry a
  // `contact`/`end` flag, flag the endpoints and the two nodes nearest the current contact points,
  // then snap them onto the contacts. Existing thickness values are preserved; this just upgrades the
  // profile so the new contact behaviour works. Skipped if the file already has flags.
  if (Array.isArray(ski.coreProfile) && ski.coreProfile.length >= 2 &&
      !ski.coreProfile.some(n => n.contact || n.end)) {
    const cp = ski.coreProfile.map(n => ({ ...n }));
    cp[0].end = true; cp[cp.length - 1].end = true;
    const tailPos = ski.tailLength / ski.length;
    const tipPos = (ski.length - ski.tipLength) / ski.length;
    const nearest = (target) => {
      let bi = 1, bd = Infinity;
      for (let i = 1; i < cp.length - 1; i++) { const d = Math.abs(cp[i].pos - target); if (d < bd) { bd = d; bi = i; } }
      return bi;
    };
    const ti = nearest(tailPos); cp[ti].contact = 'tail';
    let pi = nearest(tipPos); if (pi === ti) pi = Math.min(cp.length - 2, ti + 1); cp[pi].contact = 'tip';
    ski.coreProfile = syncCoreContacts({ ...ski, coreProfile: cp });
  }

  if (newerFile) {
    // Newer file than this app knows about. Loaded above with defaults backfilled; warn the caller.
    return { ok: true, ski, warning: `This design was saved by a newer version of the designer. It loaded, but a field or two may not be recognized — update the app if something looks off.` };
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
// Fritsch–Carlson monotone cubic Hermite spline. Unlike per-segment smootherstep (which forces the
// slope to ZERO at every control point and so makes a smooth rise look like a row of moguls), this is
// C1-continuous ACROSS the knots — a rising core section reads as one clean rise — while still being
// guaranteed monotone between monotone data, so it never overshoots (a physical core never gains a
// phantom bulge or dips below a control value). Used for BOTH the on-screen core/flex curves and the
// exported DXF, so what you see matches what gets cut.
function makeMonotoneCubic(xs, ys) {
  const n = xs.length;
  if (n < 2) return () => (ys[0] || 0);
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; dy[i] = ys[i + 1] - ys[i]; m[i] = dy[i] / dx[i]; }
  const t = new Array(n);
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0; // local extremum → flat tangent prevents overshoot
    else { const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1]; t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = dx[i], tt = (x - xs[i]) / h, t2 = tt * tt, t3 = t2 * tt;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + tt, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    return h00 * ys[i] + h10 * h * t[i] + h01 * ys[i + 1] + h11 * h * t[i + 1];
  };
}
// Cache the built spline per profile array so we don't rebuild it on every sample.
let _coreSplineCache = { profile: null, fn: null };
function getCoreThickAt(profile, pos) {
  if (pos <= profile[0].pos) return profile[0].thick;
  if (pos >= profile[profile.length - 1].pos) return profile[profile.length - 1].thick;
  if (_coreSplineCache.profile !== profile) {
    _coreSplineCache = {
      profile,
      fn: makeMonotoneCubic(profile.map(p => p.pos), profile.map(p => p.thick)),
    };
  }
  return _coreSplineCache.fn(pos);
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
// Inverse of the sidecut-radius formula: given a target radius (meters), return the WAIST WIDTH (mm)
// that produces it, holding length / tip-length / tail-length / tip-width / tail-width fixed. Setting
// the radius adjusts the waist because that's the free variable — the ends and running edge are
// things you set deliberately. R = ee²/(8·depth)/1000, depth = (avg − waist)/2, so:
//   depth = ee² / (8·R·1000),  waist = avg − 2·depth.
function waistWidthForRadius(ski, radiusM){
  const ee = ski.length - ski.tipLength - ski.tailLength;
  const avg = (ski.tipWidth + ski.tailWidth) / 2;
  if (!(radiusM > 0)) return avg;              // non-positive / blank → straight (no sidecut)
  const depth = (ee * ee) / (8 * radiusM * 1000);
  return avg - 2 * depth;
}
// Alternative inversion: given a target radius, return the tip/tail LENGTHS (a partial patch) that
// produce it while HOLDING the waist and end widths fixed — by solving for the contact span and
// splitting it across tip/tail by their current ratio. This is the one you want for matching a spec
// sheet: keep the published widths (incl. waist) and let the contacts move to hit the published radius.
function tipTailForRadius(ski, radiusM){
  const avg = (ski.tipWidth + ski.tailWidth) / 2;
  const depth = (avg - ski.waistWidth) / 2;
  if (!(radiusM > 0) || depth <= 0) return null;   // no sidecut / invalid
  const span = Math.sqrt(radiusM * 8 * depth * 1000);   // contact-to-contact distance (mm)
  const totalEnds = ski.length - span;
  if (totalEnds < 80) return null;                  // radius too large to fit (contacts past the ends)
  const curTip = ski.tipLength, curTail = ski.tailLength;
  const curTotal = curTip + curTail || 1;
  const tipFrac = curTip / curTotal;
  return {
    tipLength: Math.max(40, Math.round(totalEnds * tipFrac)),
    tailLength: Math.max(40, Math.round(totalEnds * (1 - tipFrac))),
  };
}

// ── Rocker-profile ↔ tip/tail-length conversions ──
// Manufacturers publish the profile as three percentages of the OVERALL length: tip rocker / camber /
// tail rocker (e.g. 20 / 64 / 16). These are just the zone lengths as % of length. The camber zone is
// the running (contact-to-contact) edge; the tip/tail zones are the tipLength/tailLength here. So the
// rocker percentages and tipLength/tailLength are two views of the same geometry, and both drive the
// running edge that sets the sidecut radius.
function rockerPercents(ski){
  const tip = (ski.tipLength / ski.length) * 100;
  const tail = (ski.tailLength / ski.length) * 100;
  const camber = 100 - tip - tail;   // running edge as % of length
  return { tip, camber, tail };
}
// Effective rocker-takeoff lengths (mm from each end). When rocker is LINKED to the contacts, the
// takeoff equals the tip/tail length (Snocad-style: rocker begins at the contact/widest point). When
// UNLINKED, the takeoff is the independent tipRockerLen/tailRockerLen — the base lifts inboard of the
// contact, so the side-profile rocker/camber boundary and the top-down contact/radius are decoupled.
function rockerTakeoffLens(ski){
  if (ski.rockerLinked === false) {
    return {
      tip: ski.tipRockerLen != null ? ski.tipRockerLen : ski.tipLength,
      tail: ski.tailRockerLen != null ? ski.tailRockerLen : ski.tailLength,
    };
  }
  return { tip: ski.tipLength, tail: ski.tailLength };
}
// Rocker profile as % of length, based on the TAKEOFF points (what manufacturers publish). When
// linked this equals rockerPercents(); when unlinked it reflects the independent takeoff lengths.
function rockerProfilePercents(ski){
  const t = rockerTakeoffLens(ski);
  const tip = (t.tip / ski.length) * 100;
  const tail = (t.tail / ski.length) * 100;
  return { tip, camber: 100 - tip - tail, tail };
}
// Set tip/tail lengths from a tip% and tail% (camber% is the remainder). Returns a partial ski patch.
function tipTailFromRocker(ski, tipPct, tailPct){
  return {
    tipLength: Math.round(ski.length * (tipPct / 100)),
    tailLength: Math.round(ski.length * (tailPct / 100)),
  };
}
// Set the running (effective) edge to a target mm by adjusting tip & tail lengths together, keeping
// their current ratio so the profile balance is preserved. Returns a partial ski patch.
function tipTailFromRunningEdge(ski, runMm){
  const curTip = ski.tipLength, curTail = ski.tailLength;
  const totalEnds = ski.length - runMm;              // combined tip+tail length needed
  const curTotal = curTip + curTail || 1;
  const tipFrac = curTip / curTotal;
  return {
    tipLength: Math.round(totalEnds * tipFrac),
    tailLength: Math.round(totalEnds * (1 - tipFrac)),
  };
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
// Side-profile height (mm) at a given along-ski position (mm from tail end). Rocker rises from each
// end to its takeoff point; camber arcs between the two takeoffs. The takeoff points are the contacts
// when rocker is linked, or independent (inboard) points when unlinked — so this one function drives
// the on-screen side view, the rocker DXF, and the combined export consistently in both modes.
function sideProfileHeightAt(ski, xmm) {
  const t = rockerTakeoffLens(ski);
  const tailTakeoff = t.tail;                 // mm from tail end
  const tipTakeoff = ski.length - t.tip;      // absolute x where tip rocker begins
  if (xmm <= tailTakeoff) {
    const s = tailTakeoff > 0 ? 1 - (xmm / tailTakeoff) : 0;
    return rockerHeight(s, ski.tailHeight);
  }
  if (xmm >= tipTakeoff) {
    const s = t.tip > 0 ? (xmm - tipTakeoff) / t.tip : 0;
    return rockerHeight(s, ski.tipHeight);
  }
  const span = tipTakeoff - tailTakeoff;
  const tt = span > 0 ? (xmm - tailTakeoff) / span : 0.5;
  return ski.camberHeight * 4 * tt * (1 - tt);
}

function makePreset(name,dims,tipR,tipL,tailR,tailL,tipSym,tailSym,profile,core,layup){
  const base={name,waistPosition:0.48,edgeInset:2.0,coreInset:0,...dims,tipNodesR:tipR,tipNodesL:tipL||tipR,tailNodesR:tailR,tailNodesL:tailL||tailR,
    tipSymmetric:tipSym!==false,tailSymmetric:tailSym!==false,...profile,
    coreProfile:core||makeDefaultCore(),layup:layup||{...DEFAULT_LAYUP}};
  // Pin the core's contact/end nodes to THIS preset's contact positions (its tip/tail length differ).
  base.coreProfile = syncCoreContacts(base);
  return base;
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

// ══════════════ DXF WRITER (maximally compatible, entities-only) ══════════════
// Hard-won lesson: different CAD tools have incompatibly strict DXF parsers.
//   • The original minimal writer emitted LWPOLYLINE without the AcDbPolyline subclass marker,
//     which FreeCAD's strict importer rejects (verified: ezdxf raises "missing 'AcDbPolyline'
//     subclass"), so lines silently vanished in FreeCAD.
//   • Adding HEADER + TABLES with subclass-less table records then broke Vectric Aspire, whose
//     table parser reports "Record name is empty" and aborts the whole import.
// The robust solution used here avoids both traps: emit an ENTITIES-only DXF with NO header and
// NO tables, using the classic POLYLINE / VERTEX / SEQEND entity (supported by every DXF reader
// since the 1980s) instead of LWPOLYLINE. Layers are referenced by name and auto-created by the
// importer. Verified against ezdxf (strict, FreeCAD-equivalent): 0 errors, all layers preserved.
// This dialect imports cleanly in Aspire, FreeCAD, Fusion, LightBurn, and Illustrator.
function dxfStart(/* layers unused — kept for call-site compatibility */) {
  return '0\nSECTION\n2\nENTITIES\n';
}
function dxfEnd() { return '0\nENDSEC\n0\nEOF\n'; }
function dxfLwpolyline(layer, pts, closed) {
  // Emitted as classic POLYLINE/VERTEX/SEQEND for maximum reader compatibility.
  let s = `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n${closed ? 1 : 0}\n`;
  pts.forEach(p => { s += `0\nVERTEX\n8\n${layer}\n10\n${p.x.toFixed(3)}\n20\n${p.y.toFixed(3)}\n30\n0\n`; });
  s += '0\nSEQEND\n';
  return s;
}
function dxfLine(layer, x1, y1, x2, y2) {
  return `0\nLINE\n8\n${layer}\n10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0\n11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0\n`;
}
function dxfText(layer, x, y, h, str) {
  return `0\nTEXT\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0\n40\n${h.toFixed(3)}\n1\n${str}\n`;
}

// ══════════════ CONTACT-TO-CONTACT EDGE GEOMETRY ══════════════
// Returns { right, left } — two OPEN polylines running from tail-contact to tip-contact, each
// offset inward from the ski's side edge by `edgeInset` (using the local inward normal so the
// offset tracks the sidecut curve correctly). Used when the user selects "Contact-to-Contact"
// edge wrap instead of "Full Wrap".
//
// The edge samples the TRUE ski outline (from computeOutline, which includes the bezier tip/tail
// curves), NOT getWidthAtPos — the latter flat-lines the width outside the contact zone (it's a
// simplified sidecut model for flex math), which made extended edges run straight instead of
// following the shovel/tail taper. By filtering the real outline to the desired skiY range and
// offsetting inward, the extension curves correctly along the actual edge.
function getContactEdgeLines(ski, edgeInset, extTip, extTail) {
  extTip = extTip || 0;
  extTail = extTail || 0;
  const tailC = ski.tailLength;
  const tipC = ski.length - ski.tipLength;
  // Extend past each contact point, clamped to the physical ends (with a small epsilon so the
  // sampled endpoint stays just inside the outline and the inward normal is well-defined).
  const eps = 0.5;
  const startY = Math.max(eps, tailC - extTail);          // toward the tail
  const endY = Math.min(ski.length - eps, tipC + extTip); // toward the tip

  // True outline points (include tip/tail bezier curves). `right` runs tail-end→tip-end.
  const outline = computeOutline(ski);

  // Extract one side's points within [startY, endY], interpolating exact endpoints so the edge
  // starts/ends precisely at the requested stations. `pts` is assumed ordered by increasing skiY.
  const sliceSide = (pts) => {
    // Ensure ascending skiY order.
    const asc = pts[0].y <= pts[pts.length - 1].y ? pts : pts.slice().reverse();
    const out = [];
    const interp = (a, b, y) => {
      const t = (y - a.y) / (b.y - a.y);
      return { x: a.x + (b.x - a.x) * t, y };
    };
    for (let i = 0; i < asc.length; i++) {
      const p = asc[i];
      if (p.y < startY || p.y > endY) {
        // Check if this segment crosses a boundary; if so, add the interpolated crossing point.
        if (i > 0) {
          const q = asc[i - 1];
          if ((q.y < startY) !== (p.y < startY) && Math.abs(p.y - q.y) > 1e-9) out.push(interp(q, p, startY));
          if ((q.y < endY)   !== (p.y < endY)   && Math.abs(p.y - q.y) > 1e-9) out.push(interp(q, p, endY));
        }
        continue;
      }
      // Point is inside range — but first, if the previous point was outside, add the crossing.
      if (i > 0) {
        const q = asc[i - 1];
        if (q.y < startY && p.y >= startY && Math.abs(p.y - q.y) > 1e-9) out.push(interp(q, p, startY));
        if (q.y > endY && p.y <= endY && Math.abs(p.y - q.y) > 1e-9) out.push(interp(q, p, endY));
      }
      out.push({ x: p.x, y: p.y });
    }
    // Sort by skiY to guarantee monotonic ordering for the offset step.
    out.sort((a, b) => a.y - b.y);
    return out;
  };

  const rightRaw = sliceSide(outline.right);
  const leftRaw = sliceSide(outline.left);

  const offsetInward = (edge) => {
    const out = [];
    for (let i = 0; i < edge.length; i++) {
      const prev = edge[Math.max(0, i - 1)];
      const next = edge[Math.min(edge.length - 1, i + 1)];
      const tx = next.x - prev.x, ty = next.y - prev.y;
      const tlen = Math.hypot(tx, ty) || 1;
      let nx = ty / tlen, ny = -tx / tlen;
      // Point the normal toward the centerline (opposite the edge's x sign)
      if ((edge[i].x > 0 && nx > 0) || (edge[i].x < 0 && nx < 0)) { nx = -nx; ny = -ny; }
      out.push({ x: edge[i].x + nx * edgeInset, y: edge[i].y + ny * edgeInset });
    }
    return out;
  };
  return {
    right: offsetInward(rightRaw), left: offsetInward(leftRaw),
    // Raw (un-offset) source outline points at the sliced stations. The tie-in from an offset
    // edge endpoint back to its matching raw endpoint is EXACTLY -normal*inset — i.e. perpendicular
    // to the edge by construction. The loop builder uses these so tie-ins stay perpendicular.
    rightRaw, leftRaw,
  };
}

// Build a SINGLE CONTINUOUS closed loop for the contact-mode base cut, suitable for a drag knife
// (one perimeter, no lifting).
//
// Handles ASYMMETRIC tips/tails, and keeps the tie-ins TRULY PERPENDICULAR to the edge. The trick:
// each edge-inset endpoint was computed as (rawOutlinePoint + inwardNormal*inset). So the exact
// perpendicular foot of that endpoint is its matching RAW outline point (rightRaw[0], rightRaw[last],
// etc.). We tie the loop in/out at those exact raw points — connecting outline→raw→edge — so the
// tie-in segment is precisely -normal*inset (perpendicular). Previously the loop reconnected to a
// nearby full-outline sample at the same skiY, which is a DIFFERENT point, producing the skewed,
// side-dependent angles. Using the raw feet fixes that.
function getContactBaseCutLoop(ski, edgeInset, extTip, extTail) {
  extTip = extTip || 0;
  extTail = extTail || 0;

  const edges = getContactEdgeLines(ski, edgeInset, extTip, extTail);
  const rightEdge = edges.right, leftEdge = edges.left;       // offset insets, ascending skiY
  const rightRaw = edges.rightRaw, leftRaw = edges.leftRaw;   // exact source outline feet, ascending skiY
  const startY = rightRaw[0].y;               // tail end of the edge slice
  const endY = rightRaw[rightRaw.length - 1].y; // tip end of the edge slice

  const outline = computeOutline(ski);  // { right: [y:0→L], left: [y:0→L] }
  const loop = [];
  const push = (p) => loop.push({ x: p.x, y: p.y });

  // --- RIGHT SIDE: outline tail region → raw tail-foot → edge inset → raw tip-foot → outline tip.
  const R = outline.right;
  let i = 0;
  for (; i < R.length && R[i].y < startY; i++) push(R[i]);   // tail region (below the edge slice)
  push(rightRaw[0]);                                          // exact tie-in foot (perpendicular)
  rightEdge.forEach(push);                                    // edge inset startY→endY
  push(rightRaw[rightRaw.length - 1]);                        // exact tie-out foot (perpendicular)
  while (i < R.length && R[i].y <= endY) i++;                 // skip outline inside the slice
  for (; i < R.length; i++) push(R[i]);                       // tip region (above the edge slice)

  // --- Cross nose, LEFT SIDE walked tip→tail: outline tip → raw tip-foot → edge inset → raw tail-foot → outline tail.
  const Lp = outline.left;
  let j = Lp.length - 1;
  for (; j >= 0 && Lp[j].y > endY; j--) push(Lp[j]);          // tip region (above the edge slice)
  push(leftRaw[leftRaw.length - 1]);                          // exact tie-in foot (perpendicular)
  for (let k = leftEdge.length - 1; k >= 0; k--) push(leftEdge[k]); // edge inset endY→startY
  push(leftRaw[0]);                                           // exact tie-out foot (perpendicular)
  while (j >= 0 && Lp[j].y >= startY) j--;                    // skip outline inside the slice
  for (; j >= 0; j--) push(Lp[j]);                            // tail region (below the edge slice)

  return loop;
}

// ══════════════ POLYGON INSET (for base cut line) ══════════════
// Given a closed CCW polygon `pts`, returns a new polygon offset INWARD by `dist` mm.
// Uses per-vertex angle bisectors for the offset direction. Works well for smooth ski outlines.
// For self-intersection prevention at very tight concave corners, we clamp the offset to never
// cross the centerline (x=0). The ski outline is smooth so this shouldn't trigger in practice.
function offsetPolygonInward(ptsIn, dist) {
  // Remove consecutive coincident points first. computeOutline emits a duplicate vertex where the
  // sidecut meets the tip/tail curve (both sections put a point exactly at the contact station).
  // A zero-length segment there corrupts the edge-direction/normal math and makes the bisector
  // overshoot inward — the visible "bump" at the tip contact. Deduping removes the cause.
  const pts = [];
  for (let i = 0; i < ptsIn.length; i++) {
    const p = ptsIn[i], q = ptsIn[(i + 1) % ptsIn.length];
    if (Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) pts.push({ x: p.x, y: p.y });
  }
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
  const edgeWrap = ski.edgeWrap || "full";
  const pts = getFullOutlinePoints(ski);
  const isContact = edgeInset > 0 && edgeWrap === "contact";
  const insetPts = (edgeInset > 0 && edgeWrap === "full") ? offsetPolygonInward(pts, edgeInset) : null;
  const baseCutLoop = isContact ? getContactBaseCutLoop(ski, edgeInset, ski.edgeExtTip || 0, ski.edgeExtTail || 0) : null;
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

  const pathFrom = (arr, close) => arr.map((p,i) =>
    `${i===0?'M':'L'}${p.x.toFixed(3)},${toSvgY(p.y).toFixed(3)}`
  ).join(' ') + (close ? ' Z' : '');

  const outerPath = pathFrom(pts, true);
  const insetPath = insetPts ? pathFrom(insetPts, true) : '';
  const baseCutPath = baseCutLoop ? pathFrom(baseCutLoop, true) : '';

  // Three horizontal reference cross-lines: tail contact, waist, tip contact (span ski width).
  const refMarks = marks.map(m => {
    const halfW = getWidthAtPos(ski, m.skiY / ski.length) / 2;
    const cy = toSvgY(m.skiY);
    return `    <line x1="${(-halfW).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${halfW.toFixed(2)}" y2="${cy.toFixed(2)}" stroke="#aa0000" stroke-width="0.5"/>
    <text x="${(halfW + 4).toFixed(2)}" y="${(cy + 1.5).toFixed(2)}" font-size="4" fill="#aa0000" font-family="monospace">${m.label}</text>`;
  }).join('\n');

  // Vertical centerline (full length)
  const centerline = `<line x1="0" y1="${toSvgY(0).toFixed(2)}" x2="0" y2="${toSvgY(ski.length).toFixed(2)}" stroke="#0066cc" stroke-width="0.4" stroke-dasharray="6,3"/>`;

  const edgeDesc = isContact
    ? `Cut path = single continuous base-cut loop (${edgeInset}mm edge inset, partial wrap with perpendicular tie-ins).`
    : (insetPts ? `Inset line = base cut (${edgeInset}mm full-wrap inset).` : `Outline only.`);

  // In contact mode, the single closed base-cut loop IS the cut path (black). No separate outline.
  // In full-wrap mode, draw the outline (black) plus optional dashed inset (green).
  const cutGroup = isContact
    ? `  <g id="base_cut" stroke="#000" stroke-width="0.6" fill="none">
    <path d="${baseCutPath}"/>
  </g>`
    : `  <g id="outline" stroke="#000" stroke-width="0.6" fill="none">
    <path d="${outerPath}"/>
  </g>
  ${insetPts ? `<g id="base_cut" stroke="#005000" stroke-width="0.5" stroke-dasharray="2,1.5" fill="none">
    <path d="${insetPath}"/>
  </g>` : ''}`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">
  <title>Black Chapel Studios — Ski Plan ${ski.length}mm ${ski.tipWidth}-${ski.waistWidth}-${ski.tailWidth}</title>
  <desc>${edgeDesc} Red = reference lines. Units: mm.</desc>
${cutGroup}
  <g id="centerline">${centerline}</g>
  <g id="reference">
${refMarks}
  </g>
</svg>`;
  downloadFile(svg, `bcs-ski-plan-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ PLAN DXF EXPORT ══════════════
function exportPlanDXF(ski){
  const edgeInset = ski.edgeInset !== undefined ? ski.edgeInset : 2.0;
  const edgeWrap = ski.edgeWrap || "full";
  const pts = getFullOutlinePoints(ski);
  const marks = getRegistrationMarks(ski);
  const tailC = ski.tailLength, tipC = ski.length - ski.tipLength;

  const layers = [
    { name: 'OUTLINE', color: 7 },
    { name: 'BASE_CUT', color: 7 },
    { name: 'EDGE_OFFSET', color: 3 },
    { name: 'CENTERLINE', color: 5 },
    { name: 'REFERENCE', color: 1 },
    { name: 'TEXT', color: 2 },
  ];
  let dxf = dxfStart(layers);

  if (edgeWrap === "contact" && edgeInset > 0) {
    // Contact mode: the base cut is a SINGLE continuous closed loop (outline arcs at tip/tail +
    // perpendicular tie-ins + edge insets). This is the one perimeter a drag knife follows, so we
    // export just this loop as the cut path — NOT a separate full outline, which would be a second
    // stray cut. The loop already traces the true outline in the tip/tail regions.
    const loop = getContactBaseCutLoop(ski, edgeInset, ski.edgeExtTip || 0, ski.edgeExtTail || 0);
    dxf += dxfLwpolyline('BASE_CUT', loop, true);
  } else {
    // Full-wrap (or zero inset): full outline + (optionally) a closed inset loop around it.
    dxf += dxfLwpolyline('OUTLINE', pts, true);
    if (edgeInset > 0) {
      const insetPts = offsetPolygonInward(pts, edgeInset);
      dxf += dxfLwpolyline('EDGE_OFFSET', insetPts, true);
    }
  }

  // Vertical centerline (length of ski)
  dxf += dxfLine('CENTERLINE', 0, 0, 0, ski.length);

  // Three horizontal reference cross-lines: tail contact, waist, tip contact.
  // Each spans the ski width at its station (touching both edges).
  marks.forEach(m => {
    const hw = getWidthAtPos(ski, m.skiY / ski.length) / 2;
    dxf += dxfLine('REFERENCE', -hw, m.skiY, hw, m.skiY);
    dxf += dxfText('TEXT', hw + 4, m.skiY - 2, 6, m.label);
  });

  dxf += dxfEnd();
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

  const layers = [
    { name: 'CORE_SIDE_PROFILE', color: 3 },
    { name: 'REFERENCE', color: 1 },
    { name: 'TEXT', color: 2 },
  ];
  let dxf = dxfStart(layers);

  // Closed side-profile polygon: flat bottom + thickness curve on top.
  const poly = [{ x: 0, y: 0 }, ...topPts, { x: ski.length, y: 0 }];
  dxf += dxfLwpolyline('CORE_SIDE_PROFILE', poly, true);

  // Reference: vertical lines + labels at tail contact, waist, tip contact.
  marks.forEach(m => {
    dxf += dxfLine('REFERENCE', m.skiY, 0, m.skiY, maxT);
    dxf += dxfText('TEXT', m.skiY + 2, maxT + 1, 6, m.label);
  });

  dxf += dxfEnd();
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
    return `<line x1="${x.toFixed(2)}" y1="${pad}" x2="${x.toFixed(2)}" y2="${(pad + maxT * sz).toFixed(2)}" stroke="#aa0000" stroke-width="0.5"/>
    <text x="${(x + 2).toFixed(2)}" y="${(pad + 5).toFixed(2)}" font-size="4" fill="#aa0000" font-family="monospace">${m.label}</text>`;
  }).join('\n    ');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
  <title>Black Chapel Studios — Core Side Profile ${ski.length}mm</title>
  <desc>Closed shape for flat-bed CNC: flat bottom, thickness curve on top. Y scale ${sz}x.</desc>
  <g id="profile"><path d="${fillPath}" fill="rgba(200,147,90,0.18)" stroke="#C8935A" stroke-width="0.6"/></g>
  <g id="reference">${regLines}</g>
</svg>`;
  downloadFile(svg, `bcs-ski-core-side-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ CORE PLAN OUTLINE EXPORT ══════════════
// Top-down outline of the wood core, narrowed by coreInset on each side for sidewall comp.
// Intended to be imported into 3D modeling software on the XY (top-view) plane. Used to
// boolean-cut the extruded side profile for the final 3D core shape.
function exportCorePlanDXF(ski){
  const coreInset = ski.coreInset !== undefined ? ski.coreInset : 0;
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

  const layers = [
    { name: 'CORE_PLAN_OUTLINE', color: 3 },
    { name: 'CENTERLINE', color: 5 },
    { name: 'REFERENCE', color: 1 },
    { name: 'TEXT', color: 2 },
  ];
  let dxf = dxfStart(layers);

  // Closed core outline
  dxf += dxfLwpolyline('CORE_PLAN_OUTLINE', planPts, true);

  // Vertical centerline
  dxf += dxfLine('CENTERLINE', 0, 0, 0, ski.length);

  // Three horizontal reference cross-lines at tail contact, waist, tip contact (span core width).
  marks.forEach(m => {
    const hw = Math.max(1.0, getWidthAtPos(ski, m.skiY / ski.length) / 2 - coreInset);
    dxf += dxfLine('REFERENCE', -hw, m.skiY, hw, m.skiY);
    dxf += dxfText('TEXT', hw + 4, m.skiY - 2, 6, m.label);
  });

  dxf += dxfEnd();
  downloadFile(dxf, `bcs-ski-core-plan-${ski.length}mm.dxf`, "application/dxf");
}

function exportCorePlanSVG(ski){
  const coreInset = ski.coreInset !== undefined ? ski.coreInset : 0;
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
    const hw = Math.max(1.0, getWidthAtPos(ski, m.skiY / ski.length) / 2 - coreInset);
    const cy = toSvgY(m.skiY);
    return `<line x1="${(-hw).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${hw.toFixed(2)}" y2="${cy.toFixed(2)}" stroke="#aa0000" stroke-width="0.5"/>
    <text x="${(hw + 3).toFixed(2)}" y="${(cy + 1.5).toFixed(2)}" font-size="4" fill="#aa0000" font-family="monospace">${m.label}</text>`;
  }).join('\n    ');
  const centerline = `<line x1="0" y1="${toSvgY(0).toFixed(2)}" x2="0" y2="${toSvgY(ski.length).toFixed(2)}" stroke="#0066cc" stroke-width="0.4" stroke-dasharray="6,3"/>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">
  <title>Black Chapel Studios — Core Plan Outline ${ski.length}mm</title>
  <desc>Top-down core outline narrowed by ${coreInset}mm/side for sidewall compensation.</desc>
  <g id="outline" stroke="#000" stroke-width="0.6" fill="none"><path d="${pathD}"/></g>
  <g id="centerline">${centerline}</g>
  <g id="reference">${regLines}</g>
</svg>`;
  downloadFile(svg, `bcs-ski-core-plan-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ ROCKER (mold) PROFILE EXPORT ══════════════
// Simple line representing the side-view rocker shape — feeds directly into the ski press mold.
// Includes registration marks (vertical lines at tail contact, waist, tip contact) and a baseline.
function exportRockerDXF(ski){
  const N = 400;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const xmm = (i / N) * ski.length;
    pts.push({ x: xmm, y: sideProfileHeightAt(ski, xmm) });
  }
  const marks = getRegistrationMarks(ski);
  const maxY = Math.max(...pts.map(p => p.y));

  const layers = [
    { name: 'ROCKER_PROFILE', color: 3 },
    { name: 'BASELINE', color: 7 },
    { name: 'REFERENCE', color: 1 },
    { name: 'TEXT', color: 2 },
  ];
  let dxf = dxfStart(layers);

  // Rocker curve as an open polyline (it's a line, not a closed shape)
  dxf += dxfLwpolyline('ROCKER_PROFILE', pts, false);

  // Baseline (snow line)
  dxf += dxfLine('BASELINE', 0, 0, ski.length, 0);

  // Reference: vertical lines at tail contact, waist, tip contact
  marks.forEach(m => {
    dxf += dxfLine('REFERENCE', m.skiY, -3, m.skiY, maxY + 4);
    dxf += dxfText('TEXT', m.skiY + 2, maxY + 5, 6, m.label);
  });

  dxf += dxfEnd();
  downloadFile(dxf, `bcs-ski-rocker-${ski.length}mm.dxf`, "application/dxf");
}

function exportRockerSVG(ski){
  const N = 400;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const xmm = (i / N) * ski.length;
    pts.push({ x: xmm, y: sideProfileHeightAt(ski, xmm) });
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

// ══════════════ COMBINED "ALL VIEWS" EXPORT ══════════════
// One file containing the base outline, the core outline (core-inset), and the core-side thickness
// profile — all aligned on the same length (X) axis and vertically stacked with a small gap, so a
// CAD user can import once and have every view registered for lofting. Each view sits on its own
// layer. The length axis runs along X (0 = tail, ski.length = tip); the base and core outlines are
// centered on their own horizontal band, and the side profile sits below, thickness growing upward.
function buildCombinedGeometry(ski){
  const L = ski.length;
  const coreInset = ski.coreInset !== undefined ? ski.coreInset : 0;
  const edgeInset = ski.edgeInset !== undefined ? ski.edgeInset : 2.0;
  const edgeWrap = ski.edgeWrap || "full";
  const marks = getRegistrationMarks(ski);

  // Base outline points (X = along-ski, Y = lateral). computeOutline returns skiX lateral / skiY
  // along-ski, so we swap to put length on X for a horizontal layout.
  const outline = computeOutline(ski);
  const baseRight = outline.right.map(p => ({ x: p.y, y: p.x }));
  const baseLeft = outline.left.map(p => ({ x: p.y, y: p.x }));
  const baseLoopPts = baseRight.concat(baseLeft.slice().reverse());

  // Base edge offset (contact loop or full-wrap inset), also swapped to X=length.
  let baseEdge = null;
  if (edgeInset > 0) {
    if (edgeWrap === "contact") {
      baseEdge = getContactBaseCutLoop(ski, edgeInset, ski.edgeExtTip || 0, ski.edgeExtTail || 0)
        .map(p => ({ x: p.y, y: p.x }));
    } else {
      const full = getFullOutlinePoints(ski);
      baseEdge = offsetPolygonInward(full, edgeInset).map(p => ({ x: p.y, y: p.x }));
    }
  }

  // Core outline (core-inset), X=length.
  const N = 200;
  const coreR = [], coreL = [];
  for (let i = 0; i <= N; i++) {
    const pos = i / N, xmm = pos * L;
    const hw = Math.max(1.0, getWidthAtPos(ski, pos) / 2 - coreInset);
    coreR.push({ x: xmm, y: hw });
    coreL.push({ x: xmm, y: -hw });
  }
  const coreLoopPts = coreR.concat(coreL.slice().reverse());

  // Core side profile (X=length, Y=thickness).
  const sideTop = [];
  for (let i = 0; i <= N; i++) {
    const pos = i / N;
    sideTop.push({ x: pos * L, y: getCoreThickAt(ski.coreProfile, pos) });
  }
  const sideLoop = [{ x: 0, y: 0 }, ...sideTop, { x: L, y: 0 }];

  return { L, marks, baseLoopPts, baseEdge, coreLoopPts, coreR, coreL, sideLoop, sideTop, coreInset };
}

function exportCombinedDXF(ski){
  const g = buildCombinedGeometry(ski);
  const { L, marks } = g;
  const derived = computeDerived(ski);

  // Vertical layout bands (Y offsets). Base on top, core in middle, side profile at bottom.
  const halfBaseW = Math.max(...g.baseLoopPts.map(p => Math.abs(p.y)));
  const halfCoreW = Math.max(...g.coreLoopPts.map(p => Math.abs(p.y)));
  const maxThick = Math.max(...g.sideTop.map(p => p.y));
  const gap = 40;
  const baseYoff = 0;
  const coreYoff = -(halfBaseW + gap + halfCoreW);
  const sideYoff = coreYoff - (halfCoreW + gap + maxThick);

  const shift = (pts, dy) => pts.map(p => ({ x: p.x, y: p.y + dy }));

  const layers = [
    { name: 'FULL_PROFILE', color: 7 },   // full outer outline, no edge offset (white)
    { name: 'BASE_EDGE', color: 3 },      // edge offset / base cut (green)
    { name: 'CORE_OUTLINE', color: 3 },   // core-inset outline (green)
    { name: 'CORE_SIDE', color: 5 },      // side thickness profile (blue)
    { name: 'REFERENCE', color: 1 },      // contact reference lines (red)
    { name: 'CENTERLINE', color: 5 },     // band centerlines (blue)
    { name: 'LABEL', color: 4 },          // view labels (cyan)
    { name: 'TABLE', color: 2 },          // measurements table (yellow)
    { name: 'TEXT', color: 2 },           // contact labels (yellow)
  ];
  let dxf = dxfStart(layers);

  // ── BASE BAND ──
  // Always draw the full outer profile (no edge offset) so the true ski shape is present.
  dxf += dxfLwpolyline('FULL_PROFILE', shift(g.baseLoopPts, baseYoff), true);
  // Plus the edge offset / base cut line on its own layer.
  if (g.baseEdge) dxf += dxfLwpolyline('BASE_EDGE', shift(g.baseEdge, baseYoff), true);
  dxf += dxfLine('CENTERLINE', 0, baseYoff, L, baseYoff);

  // ── CORE BAND ──
  dxf += dxfLwpolyline('CORE_OUTLINE', shift(g.coreLoopPts, coreYoff), true);
  dxf += dxfLine('CENTERLINE', 0, coreYoff, L, coreYoff);

  // ── CORE SIDE BAND ──
  dxf += dxfLwpolyline('CORE_SIDE', shift(g.sideLoop, sideYoff), true);

  // ── SHARED REFERENCE LINES ── at tail/waist/tip contact, spanning all three bands for lofting.
  const topY = baseYoff + halfBaseW + 6;
  const botY = sideYoff - 6;
  g.marks.forEach(m => {
    dxf += dxfLine('REFERENCE', m.skiY, botY, m.skiY, topY);
    dxf += dxfText('TEXT', m.skiY + 2, topY + 3, 6, m.label);
  });

  // ── VIEW LABELS ── one per band, lifted into the empty GAP above each band's top edge so the
  // text never crosses the geometry, and left-aligned at the drawing's left edge (x=0). The base
  // label goes above the contact-label row so nothing stacks on it. ASCII only (DXF default font
  // renders non-ASCII as "???").
  const edgeWrap = ski.edgeWrap || "full";
  const baseLbl = edgeWrap === "contact" ? "BASE: full profile + contact edge cut" : "BASE: full profile + edge offset";
  const lblX = 0, lblH = 9;
  // Base: above the contact-label row (which sits at topY+3 above the base band).
  dxf += dxfText('LABEL', lblX, topY + 22, lblH, baseLbl);
  // Core: in the gap between the base and core bands (just above the core band's top edge).
  dxf += dxfText('LABEL', lblX, coreYoff + halfCoreW + 12, lblH, `CORE: outline (inset ${g.coreInset}mm/side)`);
  // Core side: in the gap between the core and side bands (just above the side profile).
  dxf += dxfText('LABEL', lblX, sideYoff + maxThick + 12, lblH, "CORE SIDE: thickness taper (flat bottom)");

  // ── MEASUREMENTS TABLE ── (as TEXT rows to the right of the drawing)
  const tblX = L + 60;
  let tblY = baseYoff + halfBaseW;       // start near the top
  const rowH = 16, th = 7;
  const row = (label, value) => {
    dxf += dxfText('TABLE', tblX, tblY, th, label);
    dxf += dxfText('TABLE', tblX + 190, tblY, th, value);
    tblY -= rowH;
  };
  dxf += dxfText('TABLE', tblX, tblY + rowH, 9, "MEASUREMENTS (mm)");
  row("Overall length", `${ski.length}`);
  row("Tip width", `${ski.tipWidth}`);
  row("Waist width", `${ski.waistWidth}`);
  row("Tail width", `${ski.tailWidth}`);
  row("Tip length (shovel)", `${ski.tipLength}`);
  row("Tail length", `${ski.tailLength}`);
  row("Running / effective edge", `${derived.effectiveEdge.toFixed(0)}`);
  const rk = rockerPercents(ski);
  row("Rocker profile (T/C/T %)", `${rk.tip.toFixed(0)} / ${rk.camber.toFixed(0)} / ${rk.tail.toFixed(0)}`);
  if (ski.rockerLinked === false) {
    const rp = rockerProfilePercents(ski);
    row("Rocker takeoff (T/C/T %)", `${rp.tip.toFixed(0)} / ${rp.camber.toFixed(0)} / ${rp.tail.toFixed(0)} (unlinked)`);
  }
  row("Sidecut radius (m)", `${isFinite(derived.sidecutRadius) ? derived.sidecutRadius.toFixed(1) : "flat"}`);
  row("Tip height (rocker)", `${ski.tipHeight}`);
  row("Tail height (rocker)", `${ski.tailHeight}`);
  row("Camber height", `${ski.camberHeight}`);
  row("Waist position", `${((ski.waistPosition !== undefined ? ski.waistPosition : 0.48) * 100).toFixed(0)}%`);
  row("Edge inset", `${ski.edgeInset}`);
  row("Edge wrap", edgeWrap === "contact" ? "contact-to-contact" : "full wrap");
  if (edgeWrap === "contact") {
    row("Edge ext (tip / tail)", `${ski.edgeExtTip || 0} / ${ski.edgeExtTail || 0}`);
  }
  row("Core inset", `${g.coreInset}`);

  dxf += dxfEnd();
  downloadFile(dxf, `bcs-ski-combined-${ski.length}mm.dxf`, "application/dxf");
}

function exportCombinedSVG(ski){
  const g = buildCombinedGeometry(ski);
  const { L } = g;
  const halfBaseW = Math.max(...g.baseLoopPts.map(p => Math.abs(p.y)));
  const halfCoreW = Math.max(...g.coreLoopPts.map(p => Math.abs(p.y)));
  const maxThick = Math.max(...g.sideTop.map(p => p.y));
  const gap = 40, pad = 15;
  const topMargin = 26;   // extra room above the base band for the contact row + base label
  const derived = computeDerived(ski);
  // Compute band centers in a top-down SVG (Y grows down). Base at top.
  const baseCY = topMargin + halfBaseW;
  const coreCY = baseCY + halfBaseW + gap + halfCoreW;
  const sideTopY = coreCY + halfCoreW + gap;          // side profile baseline
  const totalH = sideTopY + maxThick + pad;
  const tableW = 320;                                  // room for the measurements table
  const totalW = L + pad * 2 + tableW;

  const pathFrom = (pts, cy, close) => pts.map((p,i) =>
    `${i===0?'M':'L'}${(p.x + pad).toFixed(2)},${(cy - p.y).toFixed(2)}`
  ).join(' ') + (close ? ' Z' : '');

  const edgeWrap = ski.edgeWrap || "full";
  // Always draw the full outer profile (black). Add the edge offset on top (green, dashed for
  // full-wrap; solid for the contact cut loop).
  const baseGroup =
    `<path d="${pathFrom(g.baseLoopPts, baseCY, true)}" fill="none" stroke="#000" stroke-width="0.6"/>` +
    (g.baseEdge ? `<path d="${pathFrom(g.baseEdge, baseCY, true)}" fill="none" stroke="#005000" stroke-width="0.5" ${edgeWrap === "contact" ? "" : 'stroke-dasharray="2,1.5"'}/>` : '');

  const coreGroup = `<path d="${pathFrom(g.coreLoopPts, coreCY, true)}" fill="none" stroke="#C8935A" stroke-width="0.6"/>`;
  const sideGroup = `<path d="${pathFrom(g.sideLoop, sideTopY, true)}" fill="rgba(200,147,90,0.15)" stroke="#0066cc" stroke-width="0.6"/>`;

  const refLines = g.marks.map(m => {
    const x = m.skiY + pad;
    return `<line x1="${x.toFixed(2)}" y1="${(baseCY - halfBaseW - 6).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(sideTopY + maxThick + 4).toFixed(2)}" stroke="#aa0000" stroke-width="0.4" stroke-dasharray="4,3"/>
    <text x="${(x + 2).toFixed(2)}" y="${(baseCY - halfBaseW - 8).toFixed(2)}" font-size="5" fill="#aa0000" font-family="monospace">${m.label}</text>`;
  }).join('\n    ');

  // View labels — lifted above each band (in SVG, smaller Y = higher). Base label goes above the
  // contact-label row so nothing stacks on it.
  const baseLbl = edgeWrap === "contact" ? "BASE: full profile + contact edge cut" : "BASE: full profile + edge offset";
  const labels = `
    <text x="${pad}" y="${(baseCY - halfBaseW - 16).toFixed(1)}" font-size="6" fill="#3aa" font-family="monospace" font-weight="bold">${baseLbl}</text>
    <text x="${pad}" y="${(coreCY - halfCoreW - 8).toFixed(1)}" font-size="6" fill="#3aa" font-family="monospace" font-weight="bold">CORE: outline (inset ${g.coreInset}mm/side)</text>
    <text x="${pad}" y="${(sideTopY - 8).toFixed(1)}" font-size="6" fill="#3aa" font-family="monospace" font-weight="bold">CORE SIDE: thickness taper (flat bottom)</text>`;

  // Measurements table (right of the drawing)
  const rows = [
    ["Overall length", `${ski.length}`],
    ["Tip width", `${ski.tipWidth}`],
    ["Waist width", `${ski.waistWidth}`],
    ["Tail width", `${ski.tailWidth}`],
    ["Tip length (shovel)", `${ski.tipLength}`],
    ["Tail length", `${ski.tailLength}`],
    ["Running edge", `${derived.effectiveEdge.toFixed(0)}`],
    ["Rocker T/C/T %", `${rockerPercents(ski).tip.toFixed(0)}/${rockerPercents(ski).camber.toFixed(0)}/${rockerPercents(ski).tail.toFixed(0)}`],
    ["Sidecut radius (m)", `${isFinite(derived.sidecutRadius) ? derived.sidecutRadius.toFixed(1) : "flat"}`],
    ["Tip height", `${ski.tipHeight}`],
    ["Tail height", `${ski.tailHeight}`],
    ["Camber height", `${ski.camberHeight}`],
    ["Waist position", `${((ski.waistPosition !== undefined ? ski.waistPosition : 0.48) * 100).toFixed(0)}%`],
    ["Edge inset", `${ski.edgeInset}`],
    ["Edge wrap", edgeWrap === "contact" ? "contact" : "full wrap"],
  ];
  if (edgeWrap === "contact") rows.push(["Edge ext tip/tail", `${ski.edgeExtTip || 0} / ${ski.edgeExtTail || 0}`]);
  rows.push(["Core inset", `${g.coreInset}`]);
  const tblX = L + pad * 2 + 8;
  let tblY = pad + 12;
  const tblRows = [`<text x="${tblX}" y="${tblY}" font-size="8" fill="#000" font-family="monospace" font-weight="bold">MEASUREMENTS (mm)</text>`];
  tblY += 16;
  rows.forEach(([k,v]) => {
    tblRows.push(`<text x="${tblX}" y="${tblY}" font-size="6.5" fill="#000" font-family="monospace">${k}</text><text x="${tblX + 210}" y="${tblY}" font-size="6.5" fill="#000" font-family="monospace">${v}</text>`);
    tblY += 13;
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW.toFixed(1)}mm" height="${totalH.toFixed(1)}mm" viewBox="0 0 ${totalW.toFixed(1)} ${totalH.toFixed(1)}">
  <title>Black Chapel Studios — Combined Views ${ski.length}mm</title>
  <desc>Full profile, base edge, core outline, and core side profile — aligned on the length axis for lofting. Units: mm, 1:1.</desc>
  <g id="base">${baseGroup}</g>
  <g id="core">${coreGroup}</g>
  <g id="core_side">${sideGroup}</g>
  <g id="reference">${refLines}</g>
  <g id="labels">${labels}</g>
  <g id="table">${tblRows.join('\n    ')}</g>
</svg>`;
  downloadFile(svg, `bcs-ski-combined-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ PLAN VIEW ══════════════
// Layout:
//   ROW 1 (top, ~38% of height): Full ski plan at TRUE aspect ratio. Long and thin.
//                                Only NODES are draggable here (no handle clutter).
//   ROW 2 (bottom, ~62% of height): Two side-by-side zoom panels — tail (left) | tip (right).
//                                   Lots of headroom so handle dragging doesn't hit the edge.
//                                   This is where bezier handles are edited.
function PlanView({ ski, setSki, width, height, orientation = "horizontal" }) {
  const canvasRef = useRef(null);
  const edgeHandleRef = useRef(null);  // screen positions of edge-extension drag handles
  const [hovered, setHovered] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  // Per-panel zoom (scale multiplier) and pan (screen-pixel offset). Default: 1× / no offset.
  const [tipZoom, setTipZoom] = useState(1);
  const [tailZoom, setTailZoom] = useState(1);
  const [tipPan, setTipPan] = useState({ x: 0, y: 0 });
  const [tailPan, setTailPan] = useState({ x: 0, y: 0 });
  const [mainZoom, setMainZoom] = useState(1);
  const [mainPan, setMainPan] = useState({ x: 0, y: 0 });
  // Active pan gesture (when the user drags empty space inside a panel)
  const [panning, setPanning] = useState(null); // { frame, startMx, startMy, startPan }
  const { right, left, waistY, tipContactY, tailContactY } = useMemo(() => computeOutline(ski), [ski]);
  const isVertical = orientation === "vertical";

  // ── Layout regions ──────────────────────────────────────────────
  // Horizontal (desktop):
  //   Main view on top row (~38%), tail zoom + tip zoom side-by-side below.
  // Vertical (mobile/tablet):
  //   Main view takes a LEFT column with full height. Tip zoom and tail zoom stack in a
  //   RIGHT column, also full height (tip on top, tail on bottom).
  //   This gives the ski MUCH more vertical room than the previous stacked layout,
  //   because the main view no longer has to share its vertical space with zoom panels.
  const rowGap = 8;
  const colGap = 8;

  // Vertical: main view is a narrow LEFT column (the ski is thin so it doesn't need much
  // horizontal room), and the zoom column takes MOST of the width to give fingertip-friendly
  // real estate for editing tip/tail nodes and tangent handles. Main is ~28% of width, capped
  // at 130px so on wider tablets the zoom column still dominates.
  const mainColW = isVertical ? Math.min(Math.floor(width * 0.28), 130) : width;
  const zoomColW = isVertical ? (width - mainColW - colGap) : 0;
  const mainRowH = isVertical ? height : Math.floor(height * 0.38);
  const mainRowY = 0;
  const zoomRowY = isVertical ? 0 : (mainRowH + rowGap);
  const zoomRowH = isVertical ? height : (height - mainRowY - mainRowH - rowGap);

  // Main-view padding: shrink horizontal padding on the narrow vertical column since it's tight.
  const mainPadX = isVertical ? 6 : 24;
  const mainPadY = 8;
  // In vertical, the main view occupies the LEFT column only.
  const mainPlotW = (isVertical ? mainColW : width) - mainPadX * 2;
  const mainPlotH = mainRowH - mainPadY * 2;
  // TRUE aspect ratio: same mm-to-pixel scale for both axes.
  // In vertical: length axis is canvas-Y, so we fit ski.length to plotH and max width to plotW.
  // In horizontal: length axis is canvas-X, so we fit ski.length to plotW and max width to plotH.
  const skiMaxW = Math.max(ski.tipWidth, ski.tailWidth, ski.waistWidth) + 8;
  const mainScale = isVertical
    ? Math.min(mainPlotH / ski.length, mainPlotW / skiMaxW)
    : Math.min(mainPlotW / ski.length, mainPlotH / skiMaxW);
  const mainCenterY = mainRowY + mainPadY + mainPlotH / 2;
  const mainCenterX = mainPadX + mainPlotW / 2;
  const mainOriginX = mainPadX + (mainPlotW - ski.length * mainScale) / 2;
  // Vertical: mainTailY is the canvas-Y where skiY=0 (tail) sits — near the bottom of the plot region
  const mainTailY = mainRowY + mainPadY + (mainPlotH + ski.length * mainScale) / 2;
  // Pivot for main-view zoom: the center of the main plot region.
  const mainPivotX = isVertical ? (mainColW / 2) : (mainOriginX + ski.length * mainScale / 2);
  const mainPivotY = isVertical ? (mainRowY + mainRowH / 2) : mainCenterY;
  const toMainBase = (skiX, skiY) => isVertical
    ? { x: mainCenterX + skiX * mainScale, y: mainTailY - skiY * mainScale }
    : { x: mainOriginX + skiY * mainScale, y: mainCenterY + skiX * mainScale };
  const toMain = (skiX, skiY) => {
    const b = toMainBase(skiX, skiY);
    return {
      x: mainPivotX + (b.x - mainPivotX) * mainZoom + mainPan.x,
      y: mainPivotY + (b.y - mainPivotY) * mainZoom + mainPan.y,
    };
  };

  // ── Zoom row / column ──────────────────────────────────────
  // Horizontal: tail on left, tip on right, side-by-side across the bottom row.
  // Vertical:   tip on top, tail on bottom, stacked full-height in the right column.
  const panelGap = 12;
  // In vertical, both zoom panels get the full zoom-column width and half the height each.
  // In horizontal, zoom panels split the full width side by side.
  const zoomPanelW = isVertical
    ? (zoomColW - panelGap * 2)                       // narrower but full-height in vertical
    : Math.floor((width - panelGap * 3) / 2);
  const zoomPanelH = isVertical
    ? Math.floor((zoomRowH - panelGap * 3) / 2)       // half of column height, minus paddings
    : zoomRowH;
  const zoomColOriginX = isVertical ? (width - zoomColW + panelGap) : 0;

  const tipZoomX  = isVertical ? zoomColOriginX : (panelGap * 2 + zoomPanelW);
  const tipZoomY  = isVertical ? panelGap : zoomRowY;
  const tailZoomX = isVertical ? zoomColOriginX : panelGap;
  const tailZoomY = isVertical ? (tipZoomY + zoomPanelH + panelGap) : zoomRowY;

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
  // In vertical: length axis maps to canvas-Y (skiY range fits into plotH); width axis to canvas-X.
  const tailScale = isVertical
    ? Math.min(tailPlotH / tailViewSpanY, tailPlotW / tailViewSpanX)
    : Math.min(tailPlotW / tailViewSpanY, tailPlotH / tailViewSpanX);
  const tailOriginX = tailZoomX + tailPadInner + (tailPlotW - tailViewSpanY * tailScale) / 2;
  const tailCenterY = tailZoomY + 24 + tailPlotH / 2;
  const tailCenterX = tailZoomX + tailPadInner + tailPlotW / 2;
  const tailTailBaseY = tailZoomY + 24 + (tailPlotH + tailViewSpanY * tailScale) / 2 + tailViewMinY * tailScale;
  // Base transform (before user zoom/pan), then zoom about the panel center and add pan offset.
  const tailPivotX = tailZoomX + zoomPanelW / 2;
  const tailPivotY = tailZoomY + zoomPanelH / 2;
  const toTailBase = (skiX, skiY) => isVertical
    ? { x: tailCenterX + skiX * tailScale, y: tailTailBaseY - skiY * tailScale }
    : { x: tailOriginX + (skiY - tailViewMinY) * tailScale, y: tailCenterY + skiX * tailScale };
  const toTail = (skiX, skiY) => {
    const b = toTailBase(skiX, skiY);
    return {
      x: tailPivotX + (b.x - tailPivotX) * tailZoom + tailPan.x,
      y: tailPivotY + (b.y - tailPivotY) * tailZoom + tailPan.y,
    };
  };

  // Tip: span = [length - tipLength*1.4, length + tipLength*0.4]
  const tipViewSpanY = ski.tipLength * 1.8;
  const tipViewSpanX = Math.max(ski.tipWidth, ski.waistWidth) * 2.0;
  const tipViewMinY = ski.length - ski.tipLength * 1.4;
  const tipPadInner = 16;
  const tipPlotW = zoomPanelW - tipPadInner * 2;
  const tipPlotH = zoomPanelH - 30;
  const tipScale = isVertical
    ? Math.min(tipPlotH / tipViewSpanY, tipPlotW / tipViewSpanX)
    : Math.min(tipPlotW / tipViewSpanY, tipPlotH / tipViewSpanX);
  const tipOriginX = tipZoomX + tipPadInner + (tipPlotW - tipViewSpanY * tipScale) / 2;
  const tipCenterY = tipZoomY + 24 + tipPlotH / 2;
  const tipCenterX = tipZoomX + tipPadInner + tipPlotW / 2;
  const tipTailBaseY = tipZoomY + 24 + (tipPlotH + tipViewSpanY * tipScale) / 2 + tipViewMinY * tipScale;
  const tipPivotX = tipZoomX + zoomPanelW / 2;
  const tipPivotY = tipZoomY + zoomPanelH / 2;
  const toTipBase = (skiX, skiY) => isVertical
    ? { x: tipCenterX + skiX * tipScale, y: tipTailBaseY - skiY * tipScale }
    : { x: tipOriginX + (skiY - tipViewMinY) * tipScale, y: tipCenterY + skiX * tipScale };
  const toTip = (skiX, skiY) => {
    const b = toTipBase(skiX, skiY);
    return {
      x: tipPivotX + (b.x - tipPivotX) * tipZoom + tipPan.x,
      y: tipPivotY + (b.y - tipPivotY) * tipZoom + tipPan.y,
    };
  };

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

    // ── Main view (top row / left column) ───────────────────────
    // Clip the main view so zoomed/panned content stays within its region and doesn't spill
    // into the zoom panels.
    const mainClip = isVertical
      ? { x: 0, y: 0, w: mainColW, h: height }
      : { x: 0, y: 0, w: width, h: mainRowH };
    ctx.save();
    ctx.beginPath();
    ctx.rect(mainClip.x, mainClip.y, mainClip.w, mainClip.h);
    ctx.clip();

    // Centerline (uses toMain so it follows zoom/pan)
    ctx.strokeStyle = C.center; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
    ctx.beginPath();
    {
      const a = toMain(0, 0), b = toMain(0, ski.length);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
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

    // ── Edge offset preview (live) ──────────────────────────────
    // Shows where the metal edges / base cut will sit, updating as the user changes
    // Edge Inset or the Edge Wrap mode. Full wrap = closed inset loop; contact = two side lines.
    const previewInset = ski.edgeInset !== undefined ? ski.edgeInset : 2.0;
    const previewWrap = ski.edgeWrap || "full";
    if (previewInset > 0) {
      ctx.save();
      ctx.strokeStyle = C.coreStroke;   // brass — distinct from the white outline
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      if (previewWrap === "contact") {
        // Show the full continuous base-cut loop (edge insets + perpendicular tie-ins + tip/tail
        // outline arcs) so the user sees exactly the single perimeter the knife will cut.
        const loop = getContactBaseCutLoop(ski, previewInset, ski.edgeExtTip || 0, ski.edgeExtTail || 0);
        ctx.beginPath();
        loop.forEach((p, i) => {
          const s = toMain(p.x, p.y);
          if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.stroke();
      } else {
        const outline = getFullOutlinePoints(ski);
        const inset = offsetPolygonInward(outline, previewInset);
        ctx.beginPath();
        inset.forEach((p, i) => {
          const s = toMain(p.x, p.y);
          if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // Edge extension DRAG HANDLES (contact mode only) — square markers at each edge end on the
      // right side. Dragging along the length axis changes edgeExtTip / edgeExtTail. Their screen
      // positions are stashed in a ref for hit-testing.
      if (previewWrap === "contact") {
        const { right: er2 } = getContactEdgeLines(ski, previewInset, ski.edgeExtTip || 0, ski.edgeExtTail || 0);
        const tipEnd = er2[er2.length - 1];   // toward the tip
        const tailEnd = er2[0];               // toward the tail
        const tipS = toMain(tipEnd.x, tipEnd.y);
        const tailS = toMain(tailEnd.x, tailEnd.y);
        edgeHandleRef.current = { tip: tipS, tail: tailS };
        const drawHandle = (s, isActive) => {
          const r = (isVertical ? 8 : 6) + (isActive ? 2 : 0);
          ctx.beginPath();
          ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
          ctx.fillStyle = isActive ? C.controlActive : C.control;
          ctx.fill();
          ctx.strokeStyle = C.bgDeep; ctx.lineWidth = 1.5; ctx.stroke();
        };
        drawHandle(tipS, dragging === "edgeExtTip");
        drawHandle(tailS, dragging === "edgeExtTail");
      } else {
        edgeHandleRef.current = null;
      }
    } else {
      edgeHandleRef.current = null;
    }

    // TAIL/TIP labels and length dimension label
    ctx.fillStyle = C.dimText;
    ctx.font = "10px 'JetBrains Mono', monospace";
    if (isVertical) {
      // Vertical: TIP label at top, TAIL label at bottom, length dimension on the right side
      const tipPt = toMain(0, ski.length);
      const tailPt = toMain(0, 0);
      ctx.textAlign = "center";
      ctx.fillText("TIP",  tipPt.x, tipPt.y - 6);
      ctx.fillText("TAIL", tailPt.x, tailPt.y + 14);
      ctx.font = "11px 'JetBrains Mono', monospace";
      // Place length label on the LEFT side of the ski, rotated 90° so it reads bottom-to-top.
      // This keeps it clear of the width labels on the right and matches a technical-drawing convention.
      ctx.save();
      ctx.translate(mainPadX + 10, (tipPt.y + tailPt.y) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(`${ski.length} mm`, 0, 0);
      ctx.restore();
    } else {
      ctx.textAlign = "left";
      ctx.fillText("TAIL", toMain(0, 0).x - 4, mainCenterY - 16);
      ctx.textAlign = "right";
      ctx.fillText("TIP", toMain(0, ski.length).x + 4, mainCenterY - 16);
      ctx.textAlign = "center";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.fillText(`${ski.length} mm`, mainOriginX + (ski.length * mainScale) / 2, mainRowY + mainRowH - 4);
    }

    // Width values
    ctx.fillStyle = C.heading;
    ctx.font = "bold 9px 'JetBrains Mono', monospace";
    [
      { skiY: tailContactY, w: ski.tailWidth },
      { skiY: waistY,       w: ski.waistWidth },
      { skiY: tipContactY,  w: ski.tipWidth },
    ].forEach(d => {
      if (isVertical) {
        // Position label to the right of the right edge of the ski, at that skiY station
        const s = toMain(d.w/2, d.skiY);
        ctx.textAlign = "left";
        ctx.fillText(`${Math.round(d.w)}`, s.x + 6, s.y + 3);
      } else {
        const s = toMain(d.w/2 + 2, d.skiY);
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(d.w)}`, s.x, s.y + 10);
      }
    });

    ctx.restore();  // end main-view clip

    // ── Divider between main view and zoom panels ────────────────
    ctx.strokeStyle = C.panelBorder; ctx.lineWidth = 1;
    ctx.beginPath();
    if (isVertical) {
      // Vertical: divider is a vertical line centered in the gap between main and zoom columns
      const dx = mainColW + colGap / 2;
      ctx.moveTo(dx, 0);
      ctx.lineTo(dx, height);
    } else {
      ctx.moveTo(0, mainRowH + rowGap / 2);
      ctx.lineTo(width, mainRowH + rowGap / 2);
    }
    ctx.stroke();

    // ── Zoom panels (bottom row) ─────────────────────────────────
    const drawZoomPanel = (panelX, panelY, panelW, label, toFrame, viewMinY, viewSpanY, zoomFactor) => {
      // Background and border
      ctx.fillStyle = C.bgDeep;
      ctx.fillRect(panelX, panelY, panelW, zoomPanelH);
      ctx.strokeStyle = C.zoomFrame; ctx.lineWidth = 1;
      ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, zoomPanelH - 1);

      // Label
      ctx.fillStyle = C.heading;
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(label, panelX + 10, panelY + 16);

      // Zoom readout (only when zoomed in) — right-aligned in the label row
      if (zoomFactor > 1.01) {
        ctx.fillStyle = C.label;
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${zoomFactor.toFixed(1)}× · dbl-click reset`, panelX + panelW - 8, panelY + 16);
        ctx.textAlign = "left";
      }

      // Clip rest to inside panel
      ctx.save();
      ctx.beginPath();
      ctx.rect(panelX + 3, panelY + 22, panelW - 6, zoomPanelH - 26);
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
    drawZoomPanel(tailZoomX, tailZoomY, zoomPanelW, "TAIL — ZOOM", toTail, tailViewMinY, tailViewSpanY, tailZoom);
    drawZoomPanel(tipZoomX,  tipZoomY,  zoomPanelW, "TIP — ZOOM",  toTip,  tipViewMinY,  tipViewSpanY, tipZoom);

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
    const tailClip = { x: tailZoomX + 3, y: tailZoomY + 22, w: zoomPanelW - 6, h: zoomPanelH - 26 };
    const tipClip  = { x: tipZoomX  + 3, y: tipZoomY  + 22, w: zoomPanelW - 6, h: zoomPanelH - 26 };
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
      if (isVertical) r *= 1.5;  // Larger touch targets on mobile
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

    const mainClipRect = isVertical
      ? { x: 0, y: 0, w: mainColW, h: height }
      : { x: 0, y: 0, w: width, h: mainRowH };
    cps.forEach(cp => {
      if (cp.frames.includes("main"))  drawCP(cp, toMain(cp.skiX, cp.skiY), 0.75, mainClipRect);
      if (cp.frames.includes("tip"))   drawCP(cp, toTip(cp.skiX, cp.skiY), 1.0, tipClip);
      if (cp.frames.includes("tail"))  drawCP(cp, toTail(cp.skiX, cp.skiY), 1.0, tailClip);
    });
  }, [ski, width, height, right, left, waistY, tipContactY, tailContactY, cps, hovered, dragging, isVertical,
      mainScale, mainOriginX, mainCenterY, mainRowY, mainRowH,
      tailScale, tailOriginX, tailCenterY, tailZoomX, tailZoomY, zoomPanelW, zoomPanelH, zoomRowY, tailViewMinY, tailViewSpanY,
      tipScale, tipOriginX, tipCenterY, tipZoomX, tipZoomY, tipViewMinY, tipViewSpanY,
      tipZoom, tailZoom, tipPan, tailPan, mainZoom, mainPan]);

  // ── Hit testing ──────────────────────────────────────────────
  const findCP = useCallback((mx, my) => {
    // Determine which region the cursor is in.
    // Horizontal: zoom row is at the BOTTOM (my >= zoomRowY). Main view is above it.
    // Vertical:   zoom column is on the RIGHT. Main view is on the left.
    const inZoomRegion = isVertical
      ? (mx >= (width - zoomColW))
      : (my >= zoomRowY);
    if (inZoomRegion) {
      // Figure out which panel within the zoom region.
      // Horizontal: tip panel is to the RIGHT of tail panel (mx-based).
      // Vertical:   tip panel is ABOVE tail panel (my-based). tipZoomY < tailZoomY.
      const inTip  = isVertical ? (my < tailZoomY) : (mx >= tipZoomX);
      const inTail = isVertical ? (my >= tailZoomY) : (mx >= tailZoomX && mx < tipZoomX);
      if (inTip) {
        const sorted = [...cps].filter(cp => cp.frames.includes("tip"))
          .sort((a, b) => (a.type.includes("Tangent") ? 0 : 1) - (b.type.includes("Tangent") ? 0 : 1));
        for (const cp of sorted) {
          const s = toTip(cp.skiX, cp.skiY);
          if (Math.hypot(mx - s.x, my - s.y) < (isVertical ? 22 : 14)) return cp.id;
        }
      } else if (inTail) {
        const sorted = [...cps].filter(cp => cp.frames.includes("tail"))
          .sort((a, b) => (a.type.includes("Tangent") ? 0 : 1) - (b.type.includes("Tangent") ? 0 : 1));
        for (const cp of sorted) {
          const s = toTail(cp.skiX, cp.skiY);
          if (Math.hypot(mx - s.x, my - s.y) < (isVertical ? 22 : 14)) return cp.id;
        }
      }
    } else {
      // Main view
      const sorted = [...cps].filter(cp => cp.frames.includes("main"));
      for (const cp of sorted) {
        const s = toMain(cp.skiX, cp.skiY);
        if (Math.hypot(mx - s.x, my - s.y) < (isVertical ? 18 : 9)) return cp.id;
      }
    }
    return null;
  }, [cps, zoomRowY, tipZoomX, tailZoomX, tailZoomY, zoomColW, width, isVertical, toTip, toTail, toMain]);

  const findDragFrame = useCallback((mx, my) => {
    // Horizontal: my < zoomRowY means main view
    // Vertical:   mx < (width - zoomColW) means main view
    const inMain = isVertical ? (mx < (width - zoomColW)) : (my < zoomRowY);
    if (inMain) return "main";
    if (isVertical) return (my < tailZoomY) ? "tip" : "tail";
    if (mx >= tipZoomX) return "tip";
    return "tail";
  }, [zoomRowY, tipZoomX, tailZoomY, zoomColW, width, isVertical]);

  const handleDown = useCallback(e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    // Check edge-extension handles first (contact mode only). Generous hit radius for touch.
    const eh = edgeHandleRef.current;
    if (eh && (ski.edgeWrap || "full") === "contact") {
      const hitR = isVertical ? 22 : 14;
      if (eh.tip && Math.hypot(mx - eh.tip.x, my - eh.tip.y) < hitR) {
        setDragging("edgeExtTip");
        setDragStart({ mx, my, frame: "main", ski: JSON.parse(JSON.stringify(ski)) });
        return;
      }
      if (eh.tail && Math.hypot(mx - eh.tail.x, my - eh.tail.y) < hitR) {
        setDragging("edgeExtTail");
        setDragStart({ mx, my, frame: "main", ski: JSON.parse(JSON.stringify(ski)) });
        return;
      }
    }

    const id = findCP(mx, my);
    if (id) {
      setDragging(id);
      setDragStart({
        mx, my,
        frame: findDragFrame(mx, my),
        ski: JSON.parse(JSON.stringify(ski)),
      });
    } else {
      // No node/handle under cursor — start a PAN gesture for whichever region we're in.
      const frame = findDragFrame(mx, my);
      const startPan = frame === "tip" ? { ...tipPan } : frame === "tail" ? { ...tailPan } : { ...mainPan };
      setPanning({ frame, startMx: mx, startMy: my, startPan });
    }
  }, [findCP, findDragFrame, ski, tipPan, tailPan, mainPan, isVertical]);

  // ── Scroll-wheel zoom (zoom the region under the cursor, keeping cursor point fixed) ──
  const handleWheel = useCallback(e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const frame = findDragFrame(mx, my);
    e.preventDefault();

    // Select the zoom/pan state + pivot for the region under the cursor.
    let z, pan, pivotX, pivotY, setZ, setP;
    if (frame === "tip")       { z = tipZoom;  pan = tipPan;  pivotX = tipPivotX;  pivotY = tipPivotY;  setZ = setTipZoom;  setP = setTipPan; }
    else if (frame === "tail") { z = tailZoom; pan = tailPan; pivotX = tailPivotX; pivotY = tailPivotY; setZ = setTailZoom; setP = setTailPan; }
    else                       { z = mainZoom; pan = mainPan; pivotX = mainPivotX; pivotY = mainPivotY; setZ = setMainZoom; setP = setMainPan; }

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const zNew = Math.max(1, Math.min(8, z * factor));
    if (zNew === z) return;

    // Keep the point under the cursor fixed: p' = c - pv - (c - p - pv) * zNew/z
    const panNewX = mx - pivotX - (mx - pan.x - pivotX) * (zNew / z);
    const panNewY = my - pivotY - (my - pan.y - pivotY) * (zNew / z);
    setZ(zNew); setP({ x: panNewX, y: panNewY });
  }, [findDragFrame, tipZoom, tailZoom, mainZoom, tipPan, tailPan, mainPan,
      tipPivotX, tipPivotY, tailPivotX, tailPivotY, mainPivotX, mainPivotY]);

  // Double-click resets the zoom/pan of the panel under the cursor.
  const handleDoubleClick = useCallback(e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const frame = findDragFrame(mx, my);
    if (frame === "tip")  { setTipZoom(1);  setTipPan({ x: 0, y: 0 }); }
    if (frame === "tail") { setTailZoom(1); setTailPan({ x: 0, y: 0 }); }
    if (frame === "main") { setMainZoom(1); setMainPan({ x: 0, y: 0 }); }
  }, [findDragFrame]);

  // Attach the wheel listener as NON-PASSIVE so preventDefault() actually stops page scroll.
  // React's synthetic onWheel can be passive in some setups, which would let the page scroll.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const onWheelNative = (e) => handleWheel(e);
    canvas.addEventListener("wheel", onWheelNative, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheelNative);
  }, [handleWheel]);

  const handleMove = useCallback(e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    // Pan gesture takes priority (dragging empty space in the main view or a zoomed panel)
    if (panning) {
      const dx = mx - panning.startMx, dy = my - panning.startMy;
      const nx = panning.startPan.x + dx, ny = panning.startPan.y + dy;
      if (panning.frame === "tip") setTipPan({ x: nx, y: ny });
      else if (panning.frame === "tail") setTailPan({ x: nx, y: ny });
      else setMainPan({ x: nx, y: ny });
      return;
    }

    // Edge-extension handle drag (contact mode). Convert along-length pointer motion to mm.
    if ((dragging === "edgeExtTip" || dragging === "edgeExtTail") && dragStart) {
      const scalePx = mainScale * mainZoom;
      // Along-ski delta in mm from the drag start (respects orientation).
      const dAlong = isVertical
        ? -(my - dragStart.my) / scalePx   // vertical: down = toward tail (−skiY)
        :  (mx - dragStart.mx) / scalePx;  // horizontal: right = +skiY (toward tip)
      if (dragging === "edgeExtTip") {
        // Tip handle sits toward the tip; dragging toward the tip (+skiY) increases extension.
        const start = dragStart.ski.edgeExtTip || 0;
        const maxExt = dragStart.ski.tipLength - 1;  // can't pass the physical tip end
        setSki(s => ({ ...s, edgeExtTip: clamp(Math.round(start + dAlong), 0, Math.max(0, maxExt)) }));
      } else {
        // Tail handle sits toward the tail; dragging toward the tail (−skiY) increases extension.
        const start = dragStart.ski.edgeExtTail || 0;
        const maxExt = dragStart.ski.tailLength - 1;  // can't pass the physical tail end
        setSki(s => ({ ...s, edgeExtTail: clamp(Math.round(start - dAlong), 0, Math.max(0, maxExt)) }));
      }
      return;
    }

    if (dragging && dragStart) {
      const cp = cps.find(c => c.id === dragging); if (!cp) return;

      // Pixel-to-mm conversion (same scale for both axes within each frame, true aspect).
      // When a region is zoomed in, the on-screen scale is multiplied by the zoom factor, so
      // divide by it to keep node dragging 1:1 with the cursor.
      let scalePx;
      if (dragStart.frame === "tip")  scalePx = tipScale * tipZoom;
      else if (dragStart.frame === "tail") scalePx = tailScale * tailZoom;
      else scalePx = mainScale * mainZoom;

      const dSkiY = isVertical
        ? -(my - dragStart.my) / scalePx   // vertical: moving down on screen = toward tail = decreasing skiY
        :  (mx - dragStart.mx) / scalePx;  // horizontal: moving right = increasing skiY
      const dSkiX = isVertical
        ?  (mx - dragStart.mx) / scalePx   // vertical: moving right on screen = increasing skiX (right of centerline)
        :  (my - dragStart.my) / scalePx;  // horizontal: moving down = increasing skiX

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
  }, [dragging, dragStart, cps, mainScale, tailScale, tipScale, findCP, setSki, panning, tipZoom, tailZoom, mainZoom, isVertical]);

  const handleUp = useCallback(() => { setDragging(null); setDragStart(null); setPanning(null); }, []);

  const mainViewChanged = mainZoom > 1.01 || Math.abs(mainPan.x) > 0.5 || Math.abs(mainPan.y) > 0.5;

  return (
    <div style={{ position: "relative", width, height }}>
      <canvas
        ref={canvasRef}
        style={{ width, height, cursor: hovered ? (dragging ? "grabbing" : "grab") : (panning ? "grabbing" : "default"), display: "block", touchAction: "none" }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handleDown(e); }}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={() => { setHovered(null); }}
        onDoubleClick={handleDoubleClick}
      />
      {mainViewChanged && (
        <button
          onClick={() => { setMainZoom(1); setMainPan({ x: 0, y: 0 }); }}
          style={{
            position: "absolute", top: 8, right: 8, zIndex: 5,
            background: "rgba(28,25,22,0.92)", color: C.heading,
            border: `1px solid ${C.heading}`, borderRadius: 5,
            padding: "6px 12px", fontSize: 11, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
            cursor: "pointer", textTransform: "uppercase",
          }}
        >Reset View{mainZoom > 1.01 ? ` · ${mainZoom.toFixed(1)}×` : ""}</button>
      )}
    </div>
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
    // Profile heights are tiny vs length, so we exaggerate Y for readability — but with a HARD CAP
    // so the rocker never stretches into an unrealistic shape when the panel is tall. We cap both the
    // exaggeration factor AND the resulting pixel-scale, then anchor the baseline low and let the
    // profile occupy only the space it truly needs. This keeps the rocker looking like a rocker at
    // any panel size (viewed alone or stacked with the other views).
    const MAX_Y_EXAGG = 3.0;         // never exaggerate height more than 3× the true aspect
    const maxH = Math.max(TH, TAH, CH) + 5;
    const trueHpx = maxH * xScale;
    const idealHpx = plotH * 0.72;   // how much height we'd LIKE the profile to use
    let yExagg = 1.0, yScale = xScale;
    if (trueHpx < idealHpx) {
      // Exaggerate toward the ideal, but never beyond MAX_Y_EXAGG.
      yExagg = Math.min(MAX_Y_EXAGG, idealHpx / trueHpx);
      yScale = xScale * yExagg;
    }
    // Baseline: anchor so the (capped) profile sits comfortably; if the panel is taller than the
    // profile needs, the extra space stays empty below rather than stretching the curve.
    const profileHpx = maxH * yScale;
    const baseY = Math.min(padTop + plotH * 0.92, padTop + profileHpx + plotH * 0.12);
    const toC = (xmm, ymm) => ({ x: padX + xmm * xScale, y: baseY - ymm * yScale });

    // Snow line
    ctx.strokeStyle = C.snow; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, baseY);
    ctx.lineTo(padX + plotW, baseY);
    ctx.stroke();

    // Build the profile points via the shared side-profile function so the rocker takeoff points
    // (linked to contacts, or independent when unlinked) are honored consistently with the exports.
    const pts = [];
    const n = 400;
    for (let i = 0; i <= n; i++) {
      const xmm = (i / n) * L;
      pts.push(toC(xmm, sideProfileHeightAt(ski, xmm)));
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
    if (CH > 0) {
      const tk = rockerTakeoffLens(ski);
      const camberMidX = (tk.tail + (L - tk.tip)) / 2;  // midpoint between takeoffs (camber peak)
      drawV(camberMidX, CH, "center");
    }

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
  // Cap the vertical scale (pixels per mm) so a tall panel doesn't stretch the core out of realistic
  // proportion. Beyond the cap, the drawing height stays fixed and the core anchors to the baseline;
  // extra panel height becomes empty space above rather than a stretched curve. MAX_PX_PER_MM is
  // chosen so the 16mm range reads at a believable thickness even in a short/independent panel.
  const MAX_PX_PER_MM = 9;
  const vScale = Math.min(plotH / maxThick, MAX_PX_PER_MM); // px per mm
  const drawH = maxThick * vScale;                          // actual pixel height used by the plot
  const baseY = padT + plotH;                               // baseline stays at the bottom
  const toC2 = useCallback((pos, thick) => ({
    x: padL + pos * plotW,
    y: baseY - thick * vScale,
  }), [plotW, vScale, baseY, padL]);
  const fromC2 = useCallback((cx2, cy2) => ({
    pos: (cx2 - padL) / plotW,
    thick: (baseY - cy2) / vScale,
  }), [plotW, vScale, baseY, padL]);

  const getThickAt = useCallback((pos) => getCoreThickAt(cp, pos), [cp]);

  const cps = useMemo(() => cp.map((n, i) => {
    const c = toC2(n.pos, n.thick);
    return { id: `core_${i}`, cx: c.x, cy: c.y, idx: i, contact: n.contact, end: n.end };
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

    // Vertical CONTACT reference lines — mark where the running edge (and the structural wood core)
    // begins and ends. Past these, the core is a thin flat tab / filler. These track the ski dims.
    const tailContactPos = ski.tailLength / ski.length;
    const tipContactPos = (ski.length - ski.tipLength) / ski.length;
    [["TAIL CONTACT", tailContactPos], ["TIP CONTACT", tipContactPos]].forEach(([lbl, pos]) => {
      const x = padL + pos * plotW;
      ctx.strokeStyle = C.contactLine || "rgba(232,85,42,0.55)";
      ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, baseY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.contactLine || "rgba(232,85,42,0.8)";
      ctx.font = "7px 'JetBrains Mono', monospace";
      ctx.save(); ctx.translate(x, padT + 2); ctx.rotate(Math.PI / 2);
      ctx.textAlign = "left"; ctx.fillText(lbl, 0, -2); ctx.restore();
    });
    // WAIST reference line (boot center) — solid brass, so you can align the thickest part of the
    // core to it. Sits between the contacts at the waist position.
    {
      const wp = ski.waistPosition !== undefined ? ski.waistPosition : 0.48;
      const waistPos = tailContactPos + (tipContactPos - tailContactPos) * wp;
      const x = padL + waistPos * plotW;
      ctx.strokeStyle = C.handle || "#c8935a";
      ctx.lineWidth = 1.2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, baseY); ctx.stroke();
      ctx.fillStyle = C.handle || "#c8935a";
      ctx.font = "7px 'JetBrains Mono', monospace";
      ctx.save(); ctx.translate(x, padT + 2); ctx.rotate(Math.PI / 2);
      ctx.textAlign = "left"; ctx.fillText("WAIST", 0, -2); ctx.restore();
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
      const isContact = !!cpObj.contact;
      const fill = isD ? C.controlActive
        : isH ? C.controlHover
        : isContact ? (C.contactLine || "#e8552a")   // contact taper targets stand out (torch)
        : C.coreNode;
      if (isContact) {
        // Draw a diamond for the pinned contact taper nodes so they read as special.
        ctx.beginPath();
        ctx.moveTo(cpObj.cx, cpObj.cy - r); ctx.lineTo(cpObj.cx + r, cpObj.cy);
        ctx.lineTo(cpObj.cx, cpObj.cy + r); ctx.lineTo(cpObj.cx - r, cpObj.cy);
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.arc(cpObj.cx, cpObj.cy, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = fill;
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
      // Contact-pinned and end nodes move in THICKNESS only — their position is locked to the
      // contact points / ends. Interior nodes can also slide horizontally.
      const node = newCore[cpObj.idx];
      const pinned = node.contact || node.end;
      if (!pinned && cpObj.idx > 0 && cpObj.idx < newCore.length - 1) {
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
      style={{ width, height, cursor: hovered ? (dragging ? "grabbing" : "grab") : "crosshair", display: "block", touchAction: "none" }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handleDown(e); }}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={() => { setHovered(null); }} />
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
    // Cap the drawing height so tall panels don't stretch the curves vertically out of proportion.
    // The baseline stays at the bottom; beyond the cap, extra panel height is empty space on top.
    const MAX_PLOT_H = 260;
    const drawH = Math.min(plotH, MAX_PLOT_H);
    const baseYF = padT + plotH;                 // baseline anchored to bottom of the panel
    const toC3 = (pos, val, mv) => ({
      x: padL + pos * plotW,
      y: baseYF - (val / mv) * drawH,
    });

    ctx.strokeStyle = C.gridLine; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = baseYF - (drawH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }
    ctx.strokeStyle = C.snow; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, baseYF); ctx.lineTo(padL + plotW, baseYF); ctx.stroke();

    // Vertical CONTACT reference lines — same stations as the core view, so you can read stiffness
    // relative to where the running edge / structural core begins and ends.
    const tailContactPos = ski.tailLength / ski.length;
    const tipContactPos = (ski.length - ski.tipLength) / ski.length;
    [["TAIL CONTACT", tailContactPos], ["TIP CONTACT", tipContactPos]].forEach(([lbl, pos]) => {
      const x = padL + pos * plotW;
      ctx.strokeStyle = C.contactLine || "rgba(232,85,42,0.55)";
      ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, baseYF); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.contactLine || "rgba(232,85,42,0.8)";
      ctx.font = "7px 'JetBrains Mono', monospace";
      ctx.save(); ctx.translate(x, padT + 2); ctx.rotate(Math.PI / 2);
      ctx.textAlign = "left"; ctx.fillText(lbl, 0, -2); ctx.restore();
    });
    // WAIST reference line (boot center) — solid brass, matches the core view.
    {
      const wp = ski.waistPosition !== undefined ? ski.waistPosition : 0.48;
      const waistPos = tailContactPos + (tipContactPos - tailContactPos) * wp;
      const x = padL + waistPos * plotW;
      ctx.strokeStyle = C.handle || "#c8935a";
      ctx.lineWidth = 1.2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, baseYF); ctx.stroke();
      ctx.fillStyle = C.handle || "#c8935a";
      ctx.font = "7px 'JetBrains Mono', monospace";
      ctx.save(); ctx.translate(x, padT + 2); ctx.rotate(Math.PI / 2);
      ctx.textAlign = "left"; ctx.fillText("WAIST", 0, -2); ctx.restore();
    }

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
      ctx.lineTo(padL + plotW, baseYF);
      ctx.lineTo(padL, baseYF);
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
      ctx.fillText(`${Math.round(maxK * i / 4)}`, padL - 4, baseYF - (i / 4) * drawH + 3);
    }
    ctx.fillStyle = C.eiStroke; ctx.textAlign = "left";
    for (let i = 0; i <= 4; i++) {
      ctx.fillText(`${(maxEI * i / 4 / 1e6).toFixed(0)}`, padL + plotW + 4, baseYF - (i / 4) * drawH + 3);
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
  }, [ski, flex, width, height]);
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 12 }}>
        <button
          onClick={onToggle}
          style={{
            flex: 1, padding: "9px 12px", background: "transparent", border: "none",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{
            color: C.heading, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
          }}>{title}</span>
          <span style={{ color: C.heading, fontSize: 16, fontFamily: "monospace", lineHeight: 1, marginLeft: 9 }}>
            {isOpen ? "\u25BC" : "\u25B6"}
          </span>
        </button>
        {accent && <span style={{ marginLeft: 6, display: "inline-flex" }}>{accent}</span>}
      </div>
      {isOpen && (
        <div style={{ padding: "2px 12px 10px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ══════════════ INFO BUBBLE ══════════════
// A small "i" icon that reveals a tooltip on hover (or tap on touch). Used to tuck away edit tips and
// other help text so it's discoverable but out of the way. `children` is the tooltip content.
function InfoBubble({ C, children, align = "left", width = 240 }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Help"
        style={{
          width: 16, height: 16, borderRadius: "50%", border: `1px solid ${C.labelDim}`,
          background: open ? C.heading : "transparent", color: open ? C.bgDeep : C.labelDim,
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, lineHeight: 1,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}>i</button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", [align]: 0, zIndex: 60, width,
          background: C.panel || "#1c1916", border: `1px solid ${C.panelBorder || "#37322c"}`,
          borderRadius: 5, padding: "9px 11px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          color: C.value, fontSize: 11.5, lineHeight: 1.5, fontFamily: "'Inter', system-ui, sans-serif",
          textTransform: "none", letterSpacing: 0, fontWeight: 400,
        }}>
          {children}
        </div>
      )}
    </span>
  );
}

// ══════════════ SIDECUT RADIUS FIELD ══════════════
// Two-way sidecut radius (m). Displays the live derived radius and, when you type one, solves back
// for it. The "R adjusts" selector chooses the FREE VARIABLE that flexes to hit the radius:
//   • Waist  — hold contacts, move the waist width (design-from-scratch feel; original behavior).
//   • Tip/Tail — hold ALL widths (incl. waist), move the contact span via tip/tail lengths. This is
//     the one for MATCHING A SPEC SHEET: enter the published length + widths + radius and they all
//     stay, with the contacts settling where they must. Choice persists in the save (ski.radiusTarget).
function SidecutRadiusField({ ski, setSki, C, WAIST_MIN, WAIST_MAX }) {
  const derived = computeDerived(ski);
  const liveR = isFinite(derived.sidecutRadius) ? derived.sidecutRadius : null;
  const target = ski.radiusTarget || "waist";
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : (liveR != null ? liveR.toFixed(1) : "flat");

  const commit = (raw) => {
    const r = parseFloat(raw);
    setEditing(false);
    if (!isFinite(r) || r <= 0) return;
    setSki(s => {
      if ((s.radiusTarget || "waist") === "tiptail") {
        const patch = tipTailForRadius(s, r);
        if (!patch) return s;                    // radius not achievable with these widths → no-op
        const next = { ...s, ...patch };
        next.coreProfile = syncCoreContacts(next);
        if (next.rockerLinked !== false) { next.tipRockerLen = next.tipLength; next.tailRockerLen = next.tailLength; }
        return next;
      }
      // default: adjust waist
      let w = waistWidthForRadius(s, r);
      w = Math.max(WAIST_MIN, Math.min(WAIST_MAX, w));
      w = Math.round(w * 10) / 10;
      return { ...s, waistWidth: w };
    });
  };

  const setTarget = (t) => setSki(s => ({ ...s, radiusTarget: t }));
  const segBtn = (t, lbl) => (
    <button onClick={() => setTarget(t)}
      style={{ flex: 1, padding: "3px 4px", fontSize: 9, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3,
        background: target === t ? C.heading : "transparent", color: target === t ? C.bgDeep : C.labelDim,
        border: `1px solid ${target === t ? C.heading : C.inputBorder}`, borderRadius: 3, cursor: "pointer", textTransform: "uppercase" }}>
      {lbl}
    </button>
  );

  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ color: C.label, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Sidecut R (m)</span>
        <span style={{ display: "flex", gap: 3, alignItems: "center" }}>
          <span style={{ color: C.labelDim, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>adjusts</span>
          {segBtn("waist", "Waist")}
          {segBtn("tiptail", "Tip/Tail")}
        </span>
      </div>
      <input
        type="number" min={4} max={60} step={0.5}
        value={shown === "flat" ? "" : shown}
        placeholder={shown === "flat" ? "flat" : undefined}
        onFocus={e => { setEditing(true); setText(liveR != null ? liveR.toFixed(1) : ""); e.target.style.borderColor = C.inputFocus; }}
        onChange={e => setText(e.target.value)}
        onBlur={e => { commit(e.target.value); e.target.style.borderColor = C.inputBorder; }}
        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }}
      />
    </div>
  );
}

// ══════════════ RUNNING EDGE FIELD ══════════════
// Editable running (contact-to-contact) edge in mm. Typing a value splits the change across tip &
// tail lengths (keeping their ratio) so the contact points move to give that running edge, then
// re-syncs the core contact nodes. Displays live and mirrors any other dimension change.
function RunningEdgeField({ ski, setSki, C }) {
  const liveEE = ski.length - ski.tipLength - ski.tailLength;
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : String(Math.round(liveEE));

  const commit = (raw) => {
    const mm = parseFloat(raw);
    setEditing(false);
    if (!isFinite(mm) || mm <= 0) return;
    // Keep the running edge within what tip+tail can physically allow (leave at least 40mm each end).
    const clamped = Math.max(200, Math.min(ski.length - 80, mm));
    setSki(s => {
      const patch = tipTailFromRunningEdge(s, clamped);
      const next = { ...s, ...patch };
      next.coreProfile = syncCoreContacts(next);
      return next;
    });
  };

  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
        Running Edge (mm)
      </div>
      <input
        type="number" min={200} max={2000} step={5}
        value={shown}
        onFocus={e => { setEditing(true); setText(String(Math.round(liveEE))); e.target.style.borderColor = C.inputFocus; }}
        onChange={e => setText(e.target.value)}
        onBlur={e => { commit(e.target.value); e.target.style.borderColor = C.inputBorder; }}
        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }}
      />
    </div>
  );
}

// ══════════════ ROCKER PROFILE FIELD ══════════════
// Three percentages of overall length: tip rocker / camber / tail rocker (e.g. 20 / 64 / 16) — the way
// manufacturers publish a profile. A LINK toggle controls what the percentages drive:
//   • Linked (default, Snocad-style): rocker takeoff = contact point. Editing % moves the tip/tail
//     lengths (and thus the contacts and the sidecut radius). Simple and familiar.
//   • Unlinked (advanced): rocker takeoff is independent and sits inboard of the contact. Editing %
//     moves ONLY the rocker takeoff (the side-profile lift point); the contacts, widths, and sidecut
//     radius are untouched. This lets you match a published rocker % AND a published radius at once —
//     which is impossible when they're linked, because on a real ski those are different locations.
function RockerProfileField({ ski, setSki, C }) {
  const linked = ski.rockerLinked !== false;
  const live = linked ? rockerPercents(ski) : rockerProfilePercents(ski);
  const [tipT, setTipT] = useState(""); const [tailT, setTailT] = useState("");
  const [editing, setEditing] = useState(null); // 'tip' | 'tail' | null

  const tipShown = editing === 'tip' ? tipT : live.tip.toFixed(0);
  const tailShown = editing === 'tail' ? tailT : live.tail.toFixed(0);
  const camberShown = Math.max(0, 100 - parseFloat(tipShown || live.tip) - parseFloat(tailShown || live.tail));

  const commit = (which, raw) => {
    const v = parseFloat(raw);
    setEditing(null);
    if (!isFinite(v) || v < 0) return;
    setSki(s => {
      const isLinked = s.rockerLinked !== false;
      const cur = isLinked ? rockerPercents(s) : rockerProfilePercents(s);
      const tipPct = which === 'tip' ? v : cur.tip;
      const tailPct = which === 'tail' ? v : cur.tail;
      if (tipPct + tailPct > 90) return s;  // leave some camber zone
      if (isLinked) {
        // Move the contacts (tip/tail length), keep takeoff mirrored, resync core.
        const patch = tipTailFromRocker(s, tipPct, tailPct);
        const next = { ...s, ...patch, tipRockerLen: patch.tipLength, tailRockerLen: patch.tailLength };
        next.coreProfile = syncCoreContacts(next);
        return next;
      }
      // Unlinked: move only the rocker takeoff lengths (side profile), leave contacts/radius alone.
      return {
        ...s,
        tipRockerLen: Math.round(s.length * (tipPct / 100)),
        tailRockerLen: Math.round(s.length * (tailPct / 100)),
      };
    });
  };

  const toggleLink = () => setSki(s => {
    const goingUnlinked = s.rockerLinked !== false;   // currently linked → will unlink
    if (goingUnlinked) {
      // Seed the independent takeoff from the current contacts so nothing visually jumps.
      return { ...s, rockerLinked: false, tipRockerLen: s.tipLength, tailRockerLen: s.tailLength };
    }
    // Re-linking: snap takeoff back to the contacts.
    return { ...s, rockerLinked: true, tipRockerLen: s.tipLength, tailRockerLen: s.tailLength };
  });

  const cellStyle = { flex: 1, minWidth: 0 };
  const inputStyle = { width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 6px", color: C.value, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box", textAlign: "center" };
  const subLabel = { color: C.labelDim, fontSize: 9, textAlign: "center", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ color: C.label, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
          Rocker Profile (% of length)
        </span>
        <button onClick={toggleLink} title={linked ? "Rocker takeoff is locked to the contact points (Snocad-style). Click to unlink." : "Rocker takeoff is independent of the contacts (advanced). Click to relink."}
          style={{ background: linked ? "transparent" : (C.contactLine || "#e8552a") + "22", border: `1px solid ${linked ? C.inputBorder : (C.contactLine || "#e8552a")}`, borderRadius: 3, padding: "2px 7px", color: linked ? C.labelDim : (C.contactLine || "#e8552a"), fontSize: 9, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, cursor: "pointer", textTransform: "uppercase" }}>
          {linked ? "🔗 Linked" : "⛓ Unlinked"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <div style={cellStyle}>
          <input type="number" min={0} max={45} step={1} value={tipShown}
            onFocus={e => { setEditing('tip'); setTipT(live.tip.toFixed(0)); e.target.style.borderColor = C.inputFocus; }}
            onChange={e => setTipT(e.target.value)}
            onBlur={e => { commit('tip', e.target.value); e.target.style.borderColor = C.inputBorder; }}
            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
            style={inputStyle} />
          <div style={subLabel}>TIP</div>
        </div>
        <div style={cellStyle}>
          <input type="number" value={camberShown.toFixed(0)} disabled readOnly
            style={{ ...inputStyle, color: C.labelDim, cursor: "default", opacity: 0.8 }} />
          <div style={subLabel}>CAMBER</div>
        </div>
        <div style={cellStyle}>
          <input type="number" min={0} max={45} step={1} value={tailShown}
            onFocus={e => { setEditing('tail'); setTailT(live.tail.toFixed(0)); e.target.style.borderColor = C.inputFocus; }}
            onChange={e => setTailT(e.target.value)}
            onBlur={e => { commit('tail', e.target.value); e.target.style.borderColor = C.inputBorder; }}
            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
            style={inputStyle} />
          <div style={subLabel}>TAIL</div>
        </div>
      </div>
      <div style={{ color: C.labelDim, fontSize: 9.5, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
        {linked
          ? "Linked: % sets tip/tail length (moves contacts + radius)."
          : "Unlinked: % sets rocker takeoff only. Contacts + radius stay fixed."}
      </div>
    </div>
  );
}

// ══════════════ MAIN ══════════════
export default function App() {
  const [ski, setSki] = useState(DEFAULT_SKI);
  // Default view depends on viewport at mount: mobile/tablet → "plan" (interactive rotated
  // ski is the primary experience), desktop → "all" (see everything at once).
  const [activeView, setActiveView] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) return "plan";
    return "all";
  });
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
    gettingStarted: false, // brief onboarding, collapsed by default so main controls show first
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

  // Coerce activeView when transitioning across the compact/desktop boundary:
  // - Desktop views (all/profile/core/flex) collapse to "analysis" on compact.
  // - The compact "analysis" value collapses to "all" on desktop.
  // "plan" is valid in both modes and passes through unchanged.
  useEffect(() => {
    if (isCompact && activeView !== "plan" && activeView !== "analysis") {
      setActiveView("analysis");
    } else if (!isCompact && activeView === "analysis") {
      setActiveView("all");
    }
  }, [isCompact, activeView]);

  const panelW = 270;
  const mobileHeaderH = 52;
  const desktopHeaderH = 56;
  const headerH = isCompact ? mobileHeaderH : desktopHeaderH;
  // The persistent top header takes a fixed slice of height on all screen sizes.
  // On compact, the sidebar becomes a drawer so the canvas also gets full width.
  const canvasW = isCompact ? size.w : (size.w - panelW);
  const canvasAreaH = Math.max(0, size.h - headerH);
  let planH = 0, profH = 0, coreH = 0, flexH = 0;
  // On compact viewports, we simplify the view options down to two: "plan" (the interactive
  // rotated vertical ski) and "analysis" (a compact stack of Profile + Core + Flex). Any legacy
  // activeView value that isn't "plan" collapses into "analysis". This avoids the terrible
  // stretched look of, say, "profile" alone on a phone.
  //
  // Reserve ~34px at the top of "analysis" mode for a small "expand these on desktop" banner.
  const analysisNoticeH = isCompact ? 34 : 0;
  let effectiveActiveView;
  if (isCompact) {
    effectiveActiveView = (activeView === "plan") ? "plan" : "analysis";
  } else {
    effectiveActiveView = activeView;
  }
  if (effectiveActiveView === "plan")           planH = canvasAreaH;
  else if (effectiveActiveView === "profile")   profH = canvasAreaH;
  else if (effectiveActiveView === "core")      coreH = canvasAreaH;
  else if (effectiveActiveView === "flex")      flexH = canvasAreaH;
  else if (effectiveActiveView === "analysis") {
    // Compact stacked analysis: divide remaining area equally among Profile, Core, Flex.
    const available = canvasAreaH - analysisNoticeH;
    profH = Math.floor(available / 3);
    coreH = Math.floor(available / 3);
    flexH = available - profH - coreH;
  } else {
    // Desktop "All" — plan gets more height because it has 2 rows internally
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
        onChange={e => setSki(s => {
          const next = { ...s, [param]: parseFloat(e.target.value) || 0 };
          // Contact positions depend on length / tipLength / tailLength — keep the contact-pinned
          // core nodes sitting on the contacts when any of those change.
          if (param === "length" || param === "tipLength" || param === "tailLength") {
            next.coreProfile = syncCoreContacts(next);
            // When rocker is linked to the contacts, the takeoff follows the tip/tail length.
            if (next.rockerLinked !== false) {
              next.tipRockerLen = next.tipLength;
              next.tailRockerLen = next.tailLength;
            }
          }
          return next;
        })}
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
      background: effectiveActiveView === val ? C.heading : C.inputBg,
      color: effectiveActiveView === val ? C.bgDeep : C.label,
      border: `1px solid ${effectiveActiveView === val ? C.heading : C.inputBorder}`,
      borderRadius: 3, cursor: "pointer",
      fontWeight: effectiveActiveView === val ? 700 : 400, textTransform: "uppercase", letterSpacing: 0.7
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
  const headerBtn = {
    background: C.bgLight, color: C.value, border: `1px solid ${C.panelBorder}`,
    padding: "7px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
    letterSpacing: "0.02em", fontFamily: "'Inter', 'Segoe UI', sans-serif",
  };
  const headerBtnPrimary = {
    background: C.heading, color: "#1a1611", border: `1px solid ${C.heading}`,
    padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700,
    letterSpacing: "0.02em", fontFamily: "'Inter', 'Segoe UI', sans-serif",
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
      flexDirection: "column",
      height: "100%", width: "100%",
      background: C.bg, fontFamily: "'Inter', 'Segoe UI', sans-serif", overflow: "hidden",
      position: "relative",
    }}>
      {/* Persistent top header (all screen sizes) — matches Black Chapel fretboard designer */}
      <div style={{
        height: isCompact ? mobileHeaderH : 56, minHeight: isCompact ? mobileHeaderH : 56,
        background: "linear-gradient(180deg, #1c1916, #141210)",
        borderBottom: `1px solid ${C.panelBorder}`,
        display: "flex", alignItems: "center", padding: isCompact ? "0 12px" : "0 18px",
        gap: isCompact ? 10 : 16, flexShrink: 0,
      }}>
        {/* Hamburger (compact only) */}
        {isCompact && (
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            style={{
              width: 36, height: 36, background: "transparent",
              border: `1px solid ${C.panelBorder}`, borderRadius: 4,
              color: C.heading, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
              <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        )}

        {/* Brand: logo + divider + tool name */}
        <div style={{ display: "flex", alignItems: "center", gap: isCompact ? 10 : 14, flex: 1, overflow: "hidden" }}>
          <a href="https://blackchapelstudios.com" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", lineHeight: 0, flexShrink: 0 }}>
            <img src="/blackchapel-logo.png" alt="Black Chapel Studios" style={{ height: isCompact ? 30 : 40, width: "auto", display: "block" }} />
          </a>
          {!isCompact && <div style={{ width: 1, height: 26, background: C.panelBorder, flexShrink: 0 }} />}
          <div style={{ overflow: "hidden" }}>
            <div style={{ color: C.label, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Ski Designer{ski.designName && ski.designName !== "Untitled Design" ? ` · ${ski.designName}` : ""}
            </div>
          </div>
        </div>

        {/* Right-side actions */}
        {isCompact ? (
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
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={handleSave} style={headerBtn}>Save</button>
            <button onClick={handleLoadClick} style={headerBtn}>Load</button>
            <button onClick={handleNewDesign} style={headerBtn}>New</button>
            <button onClick={openFeedback} style={headerBtnPrimary}>Send Feedback</button>
          </div>
        )}
      </div>

      {/* Body row: sidebar + canvas */}
      <div style={{ display: "flex", flexDirection: "row", flex: 1, minHeight: 0, position: "relative" }}>

      {/* Backdrop for mobile drawer */}
      {isCompact && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed", top: mobileHeaderH, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 500,
          }}
        />
      )}

      <div style={
        isCompact
          ? {
              // Mobile / tablet: sidebar becomes a slide-in left drawer, below the top header
              position: "fixed", top: mobileHeaderH, left: 0, bottom: 0,
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

        {isCompact && (
          <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${C.panelBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ color: C.heading, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, textTransform: "uppercase" }}>Menu</div>
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
          </div>
        )}

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

        <AccordionSection isOpen={sectionsOpen.gettingStarted} onToggle={() => toggleSection("gettingStarted")} title="Getting Started">
          <div style={{ color: C.value, fontSize: 12.5, lineHeight: 1.6 }}>
            <div style={{ color: C.heading, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>
              Build your first ski
            </div>
            <p style={{ margin: "0 0 12px" }}>
              Work top to bottom through the panels on the left. Each step below matches a panel.
            </p>
            {[
              ["1", "Pick a Preset", "Open Presets and choose a starting shape (All-Mtn is a safe first ski). It fills in sensible dimensions you can tweak."],
              ["2", "Set Dimensions", "In Dimensions, set overall length, tip / waist / tail width, and tip / tail length. Watch the plan view update live."],
              ["3", "Shape the tip & tail", "Drag the round nodes in the plan view to move contact points and widths. Drag the diamond handles in the tip / tail zoom panels to fine-tune the curve. Scroll to zoom, drag to pan."],
              ["4", "Dial the Side Profile", "In Side Profile, set camber and tip / tail rise. This is the rocker line your press mold follows."],
              ["5", "Choose your Layup", "In Layup / Materials, pick wood core, fiberglass, optional metal and carbon. The Flex panel updates to show how stiff the ski will ride."],
              ["6", "Check the Flex", "Read the flex rating chip. Adjust core thickness, width, or materials until it feels right for the skier."],
              ["7", "Set edges & export", "In CNC Export, set the edge inset and choose Full Wrap or Contact-to-Contact edges. Then export Base, Core, Core Side, or the Combined file for CAD."],
            ].map(([n, title, body]) => (
              <div key={n} style={{ display: "flex", gap: 10, marginBottom: 11 }}>
                <div style={{
                  flexShrink: 0, width: 22, height: 22, borderRadius: 3,
                  background: C.heading, color: C.bgDeep, fontWeight: 700, fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}>{n}</div>
                <div>
                  <div style={{ color: C.heading, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                  <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.panelBorder}`, marginTop: 4, paddingTop: 10 }}>
              <div style={{ color: C.heading, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" }}>
                Matching a published ski
              </div>
              <div style={{ color: C.label, fontSize: 12, lineHeight: 1.55 }}>
                Two toggles let you reproduce a real ski from its spec sheet — because on a real ski the
                sidecut radius and the rocker profile describe different geometry, and can't both be
                matched with a single set of numbers.
                <div style={{ marginTop: 8 }}>
                  <b style={{ color: C.heading }}>Sidecut R "adjusts" (Dimensions):</b> pick what flexes
                  when you type a radius.
                  <br />• <b>Waist</b> — holds the contacts, moves the waist. Good for designing from scratch.
                  <br />• <b>Tip/Tail</b> — holds every width (incl. waist), moves the contact points to hit
                  the radius. Use this to keep a published waist <i>and</i> radius at the same time.
                </div>
                <div style={{ marginTop: 8 }}>
                  <b style={{ color: C.heading }}>Rocker link (Side Profile):</b> controls whether the
                  rocker takeoff follows the contact points.
                  <br />• <b>🔗 Linked</b> — rocker begins at the contact (Snocad-style). Editing rocker %
                  moves the contacts and the radius. Simple.
                  <br />• <b>⛓ Unlinked</b> — rocker takeoff is independent and sits inboard of the contact.
                  Editing rocker % changes only the side profile; contacts and radius stay put.
                </div>
                <div style={{ marginTop: 8, color: C.labelDim, fontStyle: "italic" }}>
                  Spec-match recipe: enter length + 3 widths, set R adjusts → Tip/Tail and type the radius,
                  then set rocker → Unlinked and enter the published rocker %. All the numbers hold at once.
                </div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.panelBorder}`, marginTop: 10, paddingTop: 10, color: C.label, fontSize: 12, lineHeight: 1.55 }}>
              <b style={{ color: C.heading }}>Save often.</b> Use Save in the header (or File panel) to keep a <span style={{ color: C.heading, fontFamily: "'JetBrains Mono', monospace" }}>.bcski</span> file. Nothing is lost if you close the tab — auto-save keeps a copy in your browser.<br /><br />
              <b style={{ color: C.heading }}>What comes next?</b> The exported DXFs are cut on a CNC (the Base file runs as one continuous drag-knife path), and the Core Side profile shapes the wood core for pressing. See External Tools for cutting and press notes.
            </div>
          </div>
        </AccordionSection>

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
          {/* Save/Load/New live in the top header on desktop; shown here only in the mobile drawer. */}
          {isCompact && (
            <>
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
            </>
          )}
          <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
            Save to a <span style={{ color: C.heading, fontFamily: "'JetBrains Mono', monospace", borderBottom: `1px solid ${C.heading}` }}>.bcski</span> file on your computer. Files load back at any time, on any device. Auto-save keeps an unsaved copy in your browser.
          </div>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.views} onToggle={() => toggleSection("views")} title="Views"
          accent={
            <InfoBubble C={C} width={250}>
              <b style={{ color: C.heading }}>Editing the shape</b><br />
              • Drag the round nodes on the plan view to reshape and adjust dimensions.<br />
              • Drag the diamond tangent handles in the tip/tail zoom panels for fine bezier control.<br />
              • Drag the square width handles at the contacts to set tip/tail width.<br />
              • Scroll to zoom, drag empty space to pan; double-click to reset.
            </InfoBubble>
          }>
          <div style={{ display: "flex", gap: 4 }}>
            {isCompact ? (
              <>
                {viewBtn("Plan", "plan")}{viewBtn("Analysis", "analysis")}
              </>
            ) : (
              <>
                {viewBtn("Plan", "plan")}{viewBtn("Prof", "profile")}{viewBtn("Core", "core")}{viewBtn("Flex", "flex")}{viewBtn("All", "all")}
              </>
            )}
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
          <SidecutRadiusField ski={ski} setSki={setSki} C={C} WAIST_MIN={50} WAIST_MAX={180} />
          {inputField("Tip Len", "tipLength", 80, 500)}
          {inputField("Tail Len", "tailLength", 60, 400)}
          <RunningEdgeField ski={ski} setSki={setSki} C={C} />
          {inputField("Waist Pos", "waistPosition", 0.30, 0.70, 0.01)}
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.sideProfile} onToggle={() => toggleSection("sideProfile")} title="Side Profile">
          <RockerProfileField ski={ski} setSki={setSki} C={C} />
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
          <div style={{ marginBottom: 9 }}>
            <div style={{ color: C.label, fontSize: 11, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Edge Wrap</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { val: "full", label: "Full Wrap" },
                { val: "contact", label: "Contact→Contact" },
              ].map(opt => {
                const on = (ski.edgeWrap || "full") === opt.val;
                return (
                  <button key={opt.val}
                    onClick={() => setSki(s => ({ ...s, edgeWrap: opt.val }))}
                    style={{
                      flex: 1, padding: "6px 4px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                      background: on ? C.heading : C.inputBg, color: on ? C.bgDeep : C.label,
                      border: `1px solid ${on ? C.heading : C.inputBorder}`, borderRadius: 3,
                      cursor: "pointer", fontWeight: on ? 700 : 400, letterSpacing: 0.3,
                    }}>{opt.label}</button>
                );
              })}
            </div>
            <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
              {(ski.edgeWrap || "full") === "contact"
                ? "Edge offset runs only tip-contact to tail-contact on each side (partial edges)."
                : "Edge offset wraps fully around tip and tail (full-perimeter base cut)."}
            </div>
            {(ski.edgeWrap || "full") === "contact" && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.panelBorder}` }}>
                <div style={{ color: C.label, fontSize: 11, marginBottom: 6, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Edge Extension (mm past contact)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {inputField("Tip end", "edgeExtTip", 0, 400, 5)}
                  {inputField("Tail end", "edgeExtTail", 0, 400, 5)}
                </div>
                <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>
                  Extends each partial edge past its contact point toward the tip / tail. Drag the square handles in the plan view to set these visually. Clamped at the physical ends.
                </div>
              </div>
            )}
          </div>
          {inputField("Core Inset (mm)", "coreInset", 0, 10, 0.5)}
          <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginBottom: 12, marginTop: 8 }}>
            <b style={{color: C.heading}}>Edge inset:</b> P-Tex base cut offset (leaves room for metal edges).<br/>
            <b style={{color: C.heading}}>Core inset:</b> width reduction per side for sidewall material on core blank.
          </div>
          <div style={{ color: C.label, fontSize: 11, marginBottom: 5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Base — ski outline + edge offset</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            <button onClick={() => exportWithFeedbackPrompt(exportPlanDXF)} style={expBtn}>Base DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportPlanSVG)} style={expBtn}>Base SVG</button>
          </div>
          <div style={{ color: C.label, fontSize: 11, marginBottom: 5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Core — core-inset outline + contact marks</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            <button onClick={() => exportWithFeedbackPrompt(exportCorePlanDXF)} style={expBtn}>Core DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportCorePlanSVG)} style={expBtn}>Core SVG</button>
          </div>
          <div style={{ color: C.label, fontSize: 11, marginBottom: 5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Core Side — thickness taper profile</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            <button onClick={() => exportWithFeedbackPrompt(exportCoreSideDXF)} style={expBtn}>Core Side DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportCoreSideSVG)} style={expBtn}>Core Side SVG</button>
          </div>
          <div style={{ color: C.label, fontSize: 11, marginBottom: 5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Combined — all views aligned for lofting</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            <button onClick={() => exportWithFeedbackPrompt(exportCombinedDXF)} style={expBtn}>Combined DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportCombinedSVG)} style={expBtn}>Combined SVG</button>
          </div>
          <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5 }}>
            <b style={{color: C.heading}}>Base</b>: top-down ski outline with the edge offset (single continuous cut path in contact mode).<br/>
            <b style={{color: C.heading}}>Core</b>: top-down core outline narrowed by core inset, with tail/waist/tip contact marks.<br/>
            <b style={{color: C.heading}}>Core Side</b>: side thickness profile (flat bottom) for the taper.<br/>
            <b style={{color: C.heading}}>Combined</b>: base, core, and side profile stacked and aligned on the length axis so they can be lofted together in CAD.
          </div>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.externalTools} onToggle={() => toggleSection("externalTools")} title="External Tools">
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
        {effectiveActiveView === "analysis" && (
          <div style={{
            height: analysisNoticeH, flexShrink: 0,
            background: C.bgDeep, borderBottom: `1px solid ${C.panelBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 12px",
          }}>
            <span style={{ color: C.labelDim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, textAlign: "center", lineHeight: 1.3 }}>
              Compact analysis view — <span style={{ color: C.heading }}>open on desktop</span> for full detail
            </span>
          </div>
        )}
        {planH > 0 && (
          <div style={{ height: planH, position: "relative", borderBottom: `1px solid ${C.panelBorder}` }}>
            <PlanView ski={ski} setSki={setSki} width={canvasW} height={planH} orientation={isCompact ? "vertical" : "horizontal"} />
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
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        trigger={feedbackTrigger}
      />
    </div>
  );
}
