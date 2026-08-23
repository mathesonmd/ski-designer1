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
  contactLine:  "rgba(232,85,42,0.55)",  // torch, for tip/tail contact reference LINES (semi-transparent)
  contactLabel: "#f0895c",                // brighter torch for contact LABEL TEXT (legible when small)
  waistLine:    "rgba(237,230,216,0.65)", // light bone for the WAIST line (legible, distinct from torch)
  waistLabel:   "#f3ecdd",                // near-white for the WAIST label text
  skiFill:      "rgba(237,230,216,0.08)",
  skiStroke:    "#ede6d8",  // bone
  skiGlow:      "rgba(237,230,216,0.20)",
  control:      "#e8552a",  // torch
  torch:        "#e8552a",  // torch (alias used across UI for warnings / destructive actions)
  controlHover: "#f07a52",
  controlActive:"#FFD080",
  handle:       "#c8935a",  // brass
  handleLine:   "rgba(200,147,90,0.55)",
  label:        "#9b9388",  // bone-dim
  labelDim:     "#928a7d",  // lighter dim so small captions stay readable
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
  triax23:{name:"Glass Triax 23oz",E:26900,thick:0.57},triax19:{name:"Glass Triax 19oz",E:24200,thick:0.48},
  biax:{name:"Glass Biax \u00B145",E:12000,thick:0.45},
  // Carbon fabrics (full-width facing, like the glass fabrics). Effective laminate moduli — carbon biax
  // ±45 is matrix-influenced so only modestly stiffer than glass; carbon triax has 0° fibres that carry
  // most of the bending load, so it's much stiffer. Combine with UD glass/carbon stringers below.
  carbonBiax:{name:"Carbon Biax \u00B145",E:24000,thick:0.40},
  carbonTriax:{name:"Carbon Triax",E:58000,thick:0.55},
  // bcomp natural-fibre flax (ampliTex). Laminate moduli from bcomp/measured data (see notes):
  //  - 2x2 twill 0/90 (e.g. 5040): ~9 GPa tensile / 7 GPa flexural at ~40% Vf. Replaces 495gsm glass 0/90.
  //  - UD 0° (e.g. 5009): ~11 GPa along fibres. Replaces 500gsm glass UD. User uses it for tip/tail torsion.
  // Flax is damper and softer than glass — these lower E values reflect the real, mellower ride.
  flaxTwill:{name:"Flax 2\u00D72 Twill (bcomp)",E:9000,thick:0.45},
  flaxUD:{name:"Flax UD (bcomp)",E:11000,thick:0.35},
};
const METALS = {
  none:{name:"None",E:0,thick:0},titanal:{name:"Titanal 0.4mm",E:71700,thick:0.4},
  titanalH:{name:"Titanal 0.6mm",E:71700,thick:0.6},
};
// UD stringer slot: width-limited unidirectional reinforcement over/under the core. Carbon UD is the
// stiff default; glass UD lets you pair UD glass with a carbon biax/triax fabric above (a common combo).
const CARBON = {
  none:{name:"None",E:0,width:0},
  narrow:{name:"Carbon UD 15mm",E:135000,width:15},
  medium:{name:"Carbon UD 25mm",E:135000,width:25},wide:{name:"Carbon UD Full",E:135000,width:0},
  glassNarrow:{name:"Glass UD 15mm",E:40000,width:15,thick:0.5},
  glassMedium:{name:"Glass UD 25mm",E:40000,width:25,thick:0.5},
  glassWide:{name:"Glass UD Full",E:40000,width:0,thick:0.5},
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
const DEFAULT_LAYUP={wood:"poplar",glass:"triax23",glassLayers:1,fabricSplit:false,glassBot:"triax23",glassBotLayers:1,metal:"none",carbon:"none",carbonLayers:1};
const DEFAULT_SKI={
  designName: "Untitled Design",
  mode: "ski",       // "ski" | "snowboard". Snowboard mode reveals stance/setback/insert controls
                     // and renders + exports binding inserts; the geometry engine is shared.
  length:1800,tipWidth:132,waistWidth:98,tailWidth:120,
  asymSidecut:false,waistOutside:98,waistInside:98,
  asymContact:false,tipLengthOutside:240,tipLengthInside:240,tailLengthOutside:170,tailLengthInside:170,
  tipLength:240,tailLength:170,tipHeight:45,tailHeight:30,camberHeight:3,
  waistPosition:0.48,
  // How waistPosition is interpreted: false (default) = fraction of the contact-to-contact span
  // (0.5 = midway between the contacts); true = fraction of the FULL tip-to-tail length (0.5 =
  // geometric center of the ski). Full-length is handy when matching a spec that quotes boot-center
  // from the tail, independent of tip/tail lengths.
  waistFullLength:false,
  // ── Snowboard-only (ignored in ski mode) ──
  stanceWidth:560,   // mm, center-to-center of the two binding insert packs (rider reference stance).
  setback:0,         // mm the stance center sits BEHIND the effective-edge center (0 = true twin).
  insertPattern:"2x4", // "2x4" (40mm across × 20mm along, modern standard), "4x4" (40×40), "channel".
  // ── Core tip/tail V-cut fill (skis + boards) ──
  // A symmetric V notch where the wood core ENDS: base runs edge-to-edge across the core at the
  // contact point, two equal sides converge to an apex pointing toward the tip/tail end. The
  // triangular region beyond the V is fill material. Each end is independent (on/off + extension mm
  // past the contact toward the end).
  vcutTip:false, vcutTipExt:120,
  vcutTail:false, vcutTailExt:120,
  // Export orientation for all CNC files: "vertical" (portrait, length up the page) or
  // "horizontal" (landscape, length across the page). Geometry rotates; text labels and the
  // measurements table always stay horizontal for readability.
  exportOrientation: "vertical",
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
  // Snowboards save as .bcboard, skis as .bcski. Both are the same JSON format (mode is stored inside);
  // the extension is just a friendlier label, and Load accepts either and routes by the mode field.
  const ext = (ski.mode === "snowboard") ? "bcboard" : "bcski";
  const filename = `bcs-${safeName}-${ski.length}mm.${ext}`;
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
// Two slots — one per mode — so a ski AND a board can each be auto-saved without clobbering the other.
// A separate key records which mode was last active, so a page reload reopens that one.
const AUTOSAVE_KEY = "bcs_autosave";          // legacy single-slot key (migrated on read)
const AUTOSAVE_META_KEY = "bcs_autosave_meta";
const autosaveKey = (mode) => `bcs_autosave_${mode === "snowboard" ? "board" : "ski"}`;
const autosaveMetaKey = (mode) => `bcs_autosave_${mode === "snowboard" ? "board" : "ski"}_meta`;
const LAST_MODE_KEY = "bcs_last_mode";

function writeAutosave(ski) {
  const mode = ski.mode === "snowboard" ? "snowboard" : "ski";
  try {
    localStorage.setItem(autosaveKey(mode), JSON.stringify(ski));
    localStorage.setItem(autosaveMetaKey(mode), JSON.stringify({
      savedAt: new Date().toISOString(),
      designName: ski.designName || "Untitled Design",
    }));
    localStorage.setItem(LAST_MODE_KEY, mode);
  } catch (e) {
    // localStorage may be unavailable or full — ignore
  }
}

// Read the autosave for a specific mode ("ski" | "snowboard"). Falls back to the legacy single slot
// (only for ski) so designs saved before dual-slot autosave aren't lost.
function readAutosave(mode = "ski") {
  try {
    let raw = localStorage.getItem(autosaveKey(mode));
    let metaRaw = localStorage.getItem(autosaveMetaKey(mode));
    if (!raw && mode === "ski") {           // migrate legacy single slot → ski slot
      raw = localStorage.getItem(AUTOSAVE_KEY);
      metaRaw = localStorage.getItem(AUTOSAVE_META_KEY);
    }
    if (!raw) return null;
    const ski = JSON.parse(raw);
    const meta = metaRaw ? JSON.parse(metaRaw) : {};
    return { ski, meta };
  } catch (e) {
    return null;
  }
}

function readLastMode() {
  try { return localStorage.getItem(LAST_MODE_KEY) === "snowboard" ? "snowboard" : "ski"; }
  catch (e) { return "ski"; }
}

function clearAutosave(mode) {
  try {
    if (mode) {
      localStorage.removeItem(autosaveKey(mode));
      localStorage.removeItem(autosaveMetaKey(mode));
    } else {
      ["ski", "snowboard"].forEach(m => {
        localStorage.removeItem(autosaveKey(m));
        localStorage.removeItem(autosaveMetaKey(m));
      });
      localStorage.removeItem(AUTOSAVE_KEY);
      localStorage.removeItem(AUTOSAVE_META_KEY);
    }
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
  const nG=layup.glassLayers||1,nC=layup.carbonLayers||1,cW=carbon.width===0?skiWidth:carbon.width,cT=carbon.thick||CARBON_THICK;
  // Fabric can differ top vs bottom when fabricSplit is on (e.g. biax carbon above, triax carbon below);
  // otherwise the top fabric is mirrored on the bottom. Stack is built base->top.
  const split=!!layup.fabricSplit;
  const botFab=split?(GLASS[layup.glassBot]||glass):glass, nGb=split?(layup.glassBotLayers||1):nG;
  const layers=[];
  layers.push({E:BASE_E,b:skiWidth,t:BASE_THICK});
  layers.push({E:EDGE_E,b:EDGE_W*2,t:EDGE_H});
  for(let i=0;i<nGb;i++)layers.push({E:botFab.E,b:skiWidth,t:botFab.thick});   // bottom fabric
  if(metal.E>0)layers.push({E:metal.E,b:skiWidth,t:metal.thick});
  if(carbon.E>0)for(let i=0;i<nC;i++)layers.push({E:carbon.E,b:cW,t:cT});
  layers.push({E:wood.E,b:skiWidth,t:Math.max(coreThick,0.5)});
  if(carbon.E>0)for(let i=0;i<nC;i++)layers.push({E:carbon.E,b:cW,t:cT});
  if(metal.E>0)layers.push({E:metal.E,b:skiWidth,t:metal.thick});
  for(let i=0;i<nG;i++)layers.push({E:glass.E,b:skiWidth,t:glass.thick});      // top fabric
  let yBot=0;const yc=[];
  for(const l of layers){yc.push(yBot+l.t/2);yBot+=l.t;}
  let sEA=0,sEAy=0;
  for(let i=0;i<layers.length;i++){const ea=layers[i].E*layers[i].b*layers[i].t;sEA+=ea;sEAy+=ea*yc[i];}
  const ybar=sEA>0?sEAy/sEA:0;
  let EI=0;
  for(let i=0;i<layers.length;i++){const{E,b,t}=layers[i];const d=yc[i]-ybar;EI+=E*(b*t*t*t/12+b*t*d*d);}
  return EI;
}
// ══════════════ BILL OF MATERIALS ══════════════
// Rough shop densities (kg/m^3) for a swing-weight-ish core mass estimate.
const WOOD_DENSITY = { poplar: 420, ash: 670, maple: 705, bamboo: 650, paulownia: 280, fir: 450, birch: 670, aspen: 420, walnut: 610, cherry: 560 };
function _polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a) / 2; }
function _polyPerim(pts) { let L = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; L += Math.hypot(q.x - p.x, q.y - p.y); } return L; }
// Derives objective build quantities (areas, lengths, volumes, counts) from the geometry + layup.
// Units returned: areas in m^2, lengths in m, volume in liters, mass in kg.
function computeBOM(ski) {
  let outline = [];
  try { outline = getFullOutlinePoints(ski); } catch (e) { outline = []; }
  const areaMM2 = outline.length ? _polyArea(outline) : 0;
  const perimMM = outline.length ? _polyPerim(outline) : 0;
  const N = 200, dx = ski.length / N;
  let vol = 0, maxThick = 0;
  for (let i = 0; i <= N; i++) {
    const pos = i / N;
    const w = getWidthAtPos(ski, pos);
    const t = getCoreThickAt(ski.coreProfile, pos);
    if (t > maxThick) maxThick = t;
    vol += (i === 0 || i === N ? 0.5 : 1) * w * t * dx;   // mm^3 (trapezoidal)
  }
  const areaM2 = areaMM2 / 1e6;
  const coreVolL = vol / 1e6;                              // 1 L = 1e6 mm^3
  const wood = (ski.layup && ski.layup.wood) || "";
  const density = WOOD_DENSITY[wood] || 500;
  const coreMassKg = (vol / 1e9) * density;               // mm^3 -> m^3
  let effEdge = 0, effEdgeSum = 0;
  try { const d = computeDerived(ski); effEdge = d.effectiveEdge || 0; effEdgeSum = ski.asymContact ? (d.effectiveEdgeOutside + d.effectiveEdgeInside) : 2 * effEdge; } catch (e) {}
  const edgeWrap = ski.edgeWrap || "full";
  const edgeLenM = (edgeWrap === "contact" ? effEdgeSum : perimMM) / 1000;
  const glassLayers = (ski.layup && ski.layup.glassLayers) || 1;
  const glassBotLayers = (ski.layup && ski.layup.fabricSplit) ? ((ski.layup.glassBotLayers) || 1) : glassLayers;
  const glassM2 = areaM2 * (glassLayers + glassBotLayers);   // top + bottom faces (may differ if split)
  const hasMetal = ski.layup && ski.layup.metal && ski.layup.metal !== "none";
  const metalM2 = hasMetal ? areaM2 * 2 : 0;
  const carbonLayers = (ski.layup && ski.layup.carbon && ski.layup.carbon !== "none") ? (ski.layup.carbonLayers || 1) : 0;
  const carbonM2 = carbonLayers ? areaM2 * 2 * carbonLayers : 0;
  let inserts = 0;
  if (ski.mode === "snowboard") { try { const ins = computeInserts(ski); inserts = (ins.holes && ins.holes.length) || 0; } catch (e) {} }
  const maxW = Math.max(ski.tipWidth, ski.waistWidth, ski.tailWidth);
  // Epoxy: ~ wet-out for all fiber layers at ~250 g/m^2 per layer-side, in kg.
  const epoxyKg = (glassM2 + carbonM2) * 0.25 + areaM2 * 0.15;
  return {
    areaM2, perimM: perimMM / 1000, coreVolL, coreMassKg, maxThick, density,
    blank: { L: ski.length, W: Math.ceil(maxW + 10), T: Math.ceil(maxThick + 2) },
    edgeLenM, edgeWrap, glassLayers, glassM2, metalM2, carbonLayers, carbonM2,
    baseM2: areaM2, topsheetM2: areaM2, inserts, epoxyKg,
  };
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
// Resolve the waist's actual along-ski position (mm) from waistPosition, honoring waistFullLength.
//   • span mode (default): 0..1 maps across the contact-to-contact span (0.5 = midway between contacts)
//   • full-length mode:     0..1 maps across the whole tail-end..tip-end length (0.5 = geometric center),
//     then clamped to stay strictly between the contacts (the sidecut must live inside the running edge)
function resolveWaistY(ski) {
  const wp = ski.waistPosition !== undefined ? ski.waistPosition : 0.48;
  const tipContactY = ski.length - ski.tipLength, tailContactY = ski.tailLength;
  if (ski.waistFullLength) {
    const y = wp * ski.length;                       // fraction of full length, 0 = tail end
    const margin = 1;                                // keep off the exact contact points
    return Math.max(tailContactY + margin, Math.min(tipContactY - margin, y));
  }
  return tailContactY + (tipContactY - tailContactY) * wp;
}
// Per-side contact lengths (effective edge). side: "out" = right/+x edge, "in" = left/-x edge.
// Off → both sides use the shared tipLength/tailLength. Missing per-side values fall back to shared.
function sideContact(ski, side) {
  if (!ski.asymContact) return { tipL: ski.tipLength, tailL: ski.tailLength };
  const tipL = side === "out" ? ski.tipLengthOutside : ski.tipLengthInside;
  const tailL = side === "out" ? ski.tailLengthOutside : ski.tailLengthInside;
  return { tipL: tipL != null ? tipL : ski.tipLength, tailL: tailL != null ? tailL : ski.tailLength };
}

function computeOutline(ski) {
  const { length: L, tipWidth: TW, waistWidth: WW, tailWidth: TAW, tipLength: TL, tailLength: TAIL } = ski;
  const tipContactY = L - TL, tailContactY = TAIL;
  const wp = ski.waistPosition !== undefined ? ski.waistPosition : 0.48;
  const waistY = resolveWaistY(ski);
  const nSamplesSidecut = 60, nSamplesShape = 60;

  const tipR = sampleShape(ski.tipNodesR, nSamplesShape);
  const tipL = ski.tipSymmetric ? tipR : sampleShape(ski.tipNodesL, nSamplesShape);
  const tailR = sampleShape(ski.tailNodesR, nSamplesShape);
  const tailL = ski.tailSymmetric ? tailR : sampleShape(ski.tailNodesL, nSamplesShape);

  const buildSide = (tailPtsNorm, tipPtsNorm, sign, ww2, tipCY, tailCY) => {
    const side = [];
    const tw2 = TAW / 2, tipw2 = TW / 2;
    // Tail curve: node 0 (pt.y=0) is the contact point, node 1 (pt.y=1) is the tail-end.
    for (let i = tailPtsNorm.length - 1; i >= 0; i--) {
      const pt = tailPtsNorm[i];
      side.push({
        x: sign * pt.x * tw2,
        y: (1 - pt.y) * tailCY,
      });
    }
    // Sidecut: tail-contact (width=TAW) → waist (width=WW)
    const tailRunLen = waistY - tailCY;
    for (let i = 1; i <= nSamplesSidecut; i++) {
      const t = i / nSamplesSidecut, b = t * t * (3 - 2 * t);
      side.push({
        x: sign * (tw2 + b * (ww2 - tw2)),
        y: tailCY + t * tailRunLen,
      });
    }
    // Sidecut: waist → tip-contact (width=TW)
    const tipRunLen = tipCY - waistY;
    for (let i = 1; i <= nSamplesSidecut; i++) {
      const t = i / nSamplesSidecut, b = t * t * (3 - 2 * t);
      side.push({
        x: sign * (ww2 + b * (tipw2 - ww2)),
        y: waistY + t * tipRunLen,
      });
    }
    // Tip curve: pt.y=0 is tip-contact (skiY=tipCY), pt.y=1 is nose-end (skiY=L)
    const tipSpan = L - tipCY;
    tipPtsNorm.forEach(pt => {
      side.push({
        x: sign * pt.x * tipw2,
        y: tipCY + pt.y * tipSpan,
      });
    });
    return side;
  };

  // Asymmetric sidecut: each edge can use its own waist width (→ its own sidecut radius). Off = both
  // sides use WW, giving the original symmetric outline. +x side = OUTSIDE, -x side = INSIDE.
  const asym = !!ski.asymSidecut;
  const wOut2 = (asym && ski.waistOutside != null ? ski.waistOutside : WW) / 2;
  const wIn2 = (asym && ski.waistInside != null ? ski.waistInside : WW) / 2;
  // Per-side contact points (effective edge). Waist Y is a single shared line; each edge runs its own
  // sidecut from its own contacts to that waist. Tip/tail curves span from each side's contact to the ends.
  const oc = sideContact(ski, "out"), ic = sideContact(ski, "in");
  const tipCYout = L - oc.tipL, tailCYout = oc.tailL;
  const tipCYin = L - ic.tipL, tailCYin = ic.tailL;
  return {
    right: buildSide(tailR, tipR,  1, wIn2, tipCYin, tailCYin),     // +x edge = INSIDE
    left:  buildSide(tailL, tipL, -1, wOut2, tipCYout, tailCYout),  // -x edge = OUTSIDE
    waistY, tipContactY, tailContactY,
  };
}

function computeDerived(ski){
  const ee=ski.length-ski.tipLength-ski.tailLength,avg=(ski.tipWidth+ski.tailWidth)/2;
  const depth=(avg-ski.waistWidth)/2,radius=depth>0.5?(ee*ee)/(8*depth)/1000:Infinity;
  // Per-side sidecut radii. The waist is the apex (edge tangent to centerline); each side is an arc
  // from a contact to the waist. Over a side run Ls the edge moves in by d=(endW−waist)/2, giving
  // R = Ls²/(2d). This reduces to the standard whole-edge formula when the waist is centered AND the
  // end widths are equal — but when the waist is off-center (or ends differ), the two sides genuinely
  // have different radii (a tighter arc on the short side, looser on the long side), which the single
  // number hides. `asymmetric` flags when the two diverge enough to be worth surfacing.
  // Per-side runs are measured from the ACTUAL waist position (which may be full-length-referenced),
  // as the fraction of the effective edge on each side of the waist.
  const tipC = ski.length - ski.tipLength, tailC = ski.tailLength;
  const waistY = resolveWaistY(ski);
  const backRun = waistY - tailC, frontRun = tipC - waistY;
  const sideR = (runLen, endW) => {
    const d = (endW - ski.waistWidth) / 2;
    return d > 0.01 ? runLen * runLen / (2 * d) / 1000 : Infinity;
  };
  const backRadius = sideR(backRun, ski.tailWidth);
  const frontRadius = sideR(frontRun, ski.tipWidth);
  // Inside/outside (left/right edge) radii when asymmetric sidecut is on. Each edge uses its own waist
  // width across the full effective edge; a narrower waist on a side gives a tighter radius there.
  const asymOn = !!ski.asymSidecut;
  const oc = sideContact(ski, "out"), ic = sideContact(ski, "in");
  const eeOut = ski.length - oc.tipL - oc.tailL, eeIn = ski.length - ic.tipL - ic.tailL;
  const wOut = asymOn && ski.waistOutside != null ? ski.waistOutside : ski.waistWidth;
  const wIn = asymOn && ski.waistInside != null ? ski.waistInside : ski.waistWidth;
  const edgeR = (ee_, w) => { const d = (avg - w) / 2; return d > 0.5 ? (ee_ * ee_) / (8 * d) / 1000 : Infinity; };
  const radiusOutside = edgeR(eeOut, wOut), radiusInside = edgeR(eeIn, wIn);
  const finiteBoth = isFinite(backRadius) && isFinite(frontRadius);
  const ratio = finiteBoth ? Math.max(backRadius, frontRadius) / Math.min(backRadius, frontRadius) : 1;
  const asymmetric = finiteBoth && ratio > 1.15;   // >15% apart → worth showing per-side
  return { effectiveEdge: ee, sidecutRadius: radius, backRadius, frontRadius, asymmetric,
           backRun, frontRun, radiusOutside, radiusInside, asymSidecut: asymOn,
           effectiveEdgeOutside: eeOut, effectiveEdgeInside: eeIn, asymContact: !!ski.asymContact };
}
// Binding-insert geometry for snowboard mode. Coordinates match the plan view: X = width (centered on
// 0), Y = along the board (tail end = 0, tip end = length). Two packs are placed symmetrically about
// the stance center, which sits at the effective-edge center shifted back by `setback` (toward tail).
// Standard spacings: 2x4 = 40mm across (heel↔toe) × 20mm along (nose↔tail); 4x4 = 40×40. Each foot's
// pack is 2 columns (±20mm) × 4 rows so there are multiple mountable stance positions, matching a real
// board. Channel mode returns one centered lengthwise slot per foot instead of discrete holes.
function computeInserts(ski){
  if (ski.mode !== "snowboard") return { holes: [], slots: [], packs: [] };
  const tailC = ski.tailLength;
  const tipC = ski.length - ski.tipLength;
  const eeCenter = (tailC + tipC) / 2;               // effective-edge center along Y
  const stanceCenter = eeCenter - (ski.setback || 0); // setback shifts toward tail (−Y)
  const half = (ski.stanceWidth || 560) / 2;
  const backCenterY = stanceCenter - half;           // rear foot (toward tail)
  const frontCenterY = stanceCenter + half;          // front foot (toward tip)
  const packCenters = [
    { foot: "back", y: backCenterY },
    { foot: "front", y: frontCenterY },
  ];

  if (ski.insertPattern === "channel") {
    const slotLen = 160;   // Burton-style centered channel per foot (~6 in)
    const slots = packCenters.map(p => ({
      foot: p.foot, x: 0, y0: p.y - slotLen / 2, y1: p.y + slotLen / 2, width: 10,
    }));
    return { holes: [], slots, packs: packCenters };
  }

  const alongPitch = ski.insertPattern === "4x4" ? 40 : 20;  // Y spacing
  const acrossHalf = 20;    // 40mm apart across width → ±20mm columns
  const rows = 4;           // 4 rows → several stance positions
  const holes = [];
  packCenters.forEach(p => {
    for (let r = 0; r < rows; r++) {
      const dy = (r - (rows - 1) / 2) * alongPitch;   // center the rows on the pack
      holes.push({ foot: p.foot, x: -acrossHalf, y: p.y + dy });
      holes.push({ foot: p.foot, x:  acrossHalf, y: p.y + dy });
    }
  });
  return { holes, slots: [], packs: packCenters };
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
// Snowboard presets — wide, board-appropriate geometry with stance/setback/insert defaults. The
// engine is shared with skis; these just carry mode:"snowboard" plus the board-only fields.
const SNOWBOARD_PRESETS=[
  makePreset("True Twin",{mode:"snowboard",length:1560,tipWidth:290,waistWidth:250,tailWidth:290,tipLength:230,tailLength:230,stanceWidth:560,setback:0,insertPattern:"2x4"},
    rT,null,rTa,null,true,true,{tipHeight:40,tailHeight:40,camberHeight:4,waistPosition:0.50}),
  makePreset("Dir. Twin",{mode:"snowboard",length:1580,tipWidth:295,waistWidth:252,tailWidth:292,tipLength:250,tailLength:220,stanceWidth:570,setback:20,insertPattern:"2x4"},
    rT,null,rTa,null,true,true,{tipHeight:45,tailHeight:38,camberHeight:4,waistPosition:0.50}),
  makePreset("Directional",{mode:"snowboard",length:1600,tipWidth:300,waistWidth:255,tailWidth:290,tipLength:275,tailLength:205,stanceWidth:570,setback:30,insertPattern:"2x4"},
    rT,null,rTa,null,true,true,{tipHeight:50,tailHeight:32,camberHeight:3,waistPosition:0.48}),
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
function dxfText(layer, x, y, h, str, align) {
  let s = `0\nTEXT\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0\n40\n${h.toFixed(3)}\n1\n${str}\n`;
  // Optional horizontal justification: right (72=2) or center (72=1) anchor the text edge exactly at
  // (x,y) via the second alignment point (11/21), independent of the rendering font's glyph widths —
  // so right-grown labels can't overrun their target no matter how wide the CAD font draws them.
  if (align === 'right' || align === 'center') {
    s += `72\n${align === 'right' ? 2 : 1}\n11\n${x.toFixed(3)}\n21\n${y.toFixed(3)}\n31\n0\n`;
  }
  return s;
}
function dxfCircle(layer, x, y, r) {
  return `0\nCIRCLE\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0\n40\n${r.toFixed(3)}\n`;
}
// ── Export orientation ──
// Canonical geometry is authored in (a, t): a = along-length (0..L, tail→tip), t = lateral offset
// (width for plan views; thickness/height for profile views). orientPt projects a canonical point
// into output XY for the chosen orientation. DXF is Y-up directly; SVG helpers apply their own Y
// flip. Text labels and the measurements table are NEVER rotated — callers place them at a projected
// anchor but always draw horizontally.
//   vertical (portrait): length runs up the page  → x = t (lateral), y = a (along)
//   horizontal (landscape): length runs across     → x = a (along),   y = t (lateral)
function orientPt(a, t, orientation) {
  return orientation === "horizontal" ? { x: a, y: t } : { x: t, y: a };
}
function skiOrientation(ski) {
  return ski.exportOrientation === "horizontal" ? "horizontal" : "vertical";
}
const HERSHEY = {"0":[10,"M9,1 L6,2 4,5 3,10 3,13 4,18 6,21 9,22 11,22 14,21 16,18 17,13 17,10 16,5 14,2 11,1 9,1"],"1":[10,"M6,5 L8,4 11,1 11,22"],"2":[10,"M4,6 L4,5 5,3 6,2 8,1 12,1 14,2 15,3 16,5 16,7 15,9 13,12 3,22 17,22"],"3":[10,"M5,1 L16,1 10,9 13,9 15,10 16,11 17,14 17,16 16,19 14,21 11,22 8,22 5,21 4,20 3,18"],"4":[10,"M13,1 L3,15 18,15 M13,1 L13,22"],"5":[10,"M15,1 L5,1 4,10 5,9 8,8 11,8 14,9 16,11 17,14 17,16 16,19 14,21 11,22 8,22 5,21 4,20 3,18"],"6":[10,"M16,4 L15,2 12,1 10,1 7,2 5,5 4,10 4,15 5,19 7,21 10,22 11,22 14,21 16,19 17,16 17,15 16,12 14,10 11,9 10,9 7,10 5,12 4,15"],"7":[10,"M17,1 L7,22 M3,1 L17,1"],"8":[10,"M8,1 L5,2 4,4 4,6 5,8 7,9 11,10 14,11 16,13 17,15 17,18 16,20 15,21 12,22 8,22 5,21 4,20 3,18 3,15 4,13 6,11 9,10 13,9 15,8 16,6 16,4 15,2 12,1 8,1"],"9":[10,"M16,8 L15,11 13,13 10,14 9,14 6,13 4,11 3,8 3,7 4,4 6,2 9,1 10,1 13,2 15,4 16,8 16,13 15,18 13,21 10,22 8,22 5,21 4,19"],"!":[5,"M5,1 L5,15 M5,20 L4,21 5,22 6,21 5,20"],"\"":[8,"M4,1 L4,8 M12,1 L12,8"],"#":[11,"M11,-3 L4,29 M17,-3 L10,29 M4,10 L18,10 M3,16 L17,16"],"$":[10,"M8,-3 L8,26 M12,-3 L12,26 M17,4 L15,2 12,1 8,1 5,2 3,4 3,6 4,8 5,9 7,10 13,12 15,13 16,14 17,16 17,19 15,21 12,22 8,22 5,21 3,19"],"%":[12,"M21,1 L3,22 M8,1 L10,3 10,5 9,7 7,8 5,8 3,6 3,4 4,2 6,1 8,1 10,2 13,3 16,3 19,2 21,1 M17,15 L15,16 14,18 14,20 16,22 18,22 20,21 21,19 21,17 19,15 17,15"],"&":[13,"M23,10 L23,9 22,8 21,8 20,9 19,11 17,16 15,19 13,21 11,22 7,22 5,21 4,20 3,18 3,16 4,14 5,13 12,9 13,8 14,6 14,4 13,2 11,1 9,2 8,4 8,6 9,9 11,12 16,19 18,21 20,22 22,22 23,21 23,20"],"'":[5,"M5,3 L4,2 5,1 6,2 6,4 5,6 4,7"],"(":[7,"M11,-3 L9,-1 7,2 5,6 4,11 4,15 5,20 7,24 9,27 11,29"],")":[7,"M3,-3 L5,-1 7,2 9,6 10,11 10,15 9,20 7,24 5,27 3,29"],"*":[8,"M8,7 L8,19 M3,10 L13,16 M13,10 L3,16"],"+":[13,"M13,4 L13,22 M4,13 L22,13"],",":[4,"M5,18 L4,19 3,18 4,17 5,18 5,20 3,22"],"-":[13,"M4,13 L22,13"],".":[4,"M4,17 L3,18 4,19 5,18 4,17"],"/":[11,"M20,-3 L2,29"],":":[4,"M4,10 L3,11 4,12 5,11 4,10 M4,17 L3,18 4,19 5,18 4,17"],";":[4,"M4,10 L3,11 4,12 5,11 4,10 M5,18 L4,19 3,18 4,17 5,18 5,20 3,22"],"<":[12,"M20,4 L4,13 20,22"],"=":[13,"M4,10 L22,10 M4,16 L22,16"],">":[12,"M4,4 L20,13 4,22"],"?":[9,"M3,6 L3,5 4,3 5,2 7,1 11,1 13,2 14,3 15,5 15,7 14,9 13,10 9,12 9,15 M9,20 L8,21 9,22 10,21 9,20"],"@":[14,"M18,9 L17,7 15,6 12,6 10,7 9,8 8,11 8,14 9,16 11,17 14,17 16,16 17,14 M12,6 L10,8 9,11 9,14 10,16 11,17 M18,6 L17,14 17,16 19,17 21,17 23,15 24,12 24,10 23,7 22,5 20,3 18,2 15,1 12,1 9,2 7,3 5,5 4,7 3,10 3,13 4,16 5,18 7,20 9,21 12,22 15,22 18,21 20,20 21,19 M19,6 L18,14 18,16 19,17"],"A":[9,"M9,1 L1,22 M9,1 L17,22 M4,15 L14,15"],"B":[10,"M4,1 L4,22 M4,1 L13,1 16,2 17,3 18,5 18,7 17,9 16,10 13,11 M4,11 L13,11 16,12 17,13 18,15 18,18 17,20 16,21 13,22 4,22"],"C":[11,"M18,6 L17,4 15,2 13,1 9,1 7,2 5,4 4,6 3,9 3,14 4,17 5,19 7,21 9,22 13,22 15,21 17,19 18,17"],"D":[10,"M4,1 L4,22 M4,1 L11,1 14,2 16,4 17,6 18,9 18,14 17,17 16,19 14,21 11,22 4,22"],"E":[9,"M4,1 L4,22 M4,1 L17,1 M4,11 L12,11 M4,22 L17,22"],"F":[8,"M4,1 L4,22 M4,1 L17,1 M4,11 L12,11"],"G":[11,"M18,6 L17,4 15,2 13,1 9,1 7,2 5,4 4,6 3,9 3,14 4,17 5,19 7,21 9,22 13,22 15,21 17,19 18,17 18,14 M13,14 L18,14"],"H":[11,"M4,1 L4,22 M18,1 L18,22 M4,11 L18,11"],"I":[4,"M4,1 L4,22"],"J":[8,"M12,1 L12,17 11,20 10,21 8,22 6,22 4,21 3,20 2,17 2,15"],"K":[10,"M4,1 L4,22 M18,1 L4,15 M9,10 L18,22"],"L":[7,"M4,1 L4,22 M4,22 L16,22"],"M":[12,"M4,1 L4,22 M4,1 L12,22 M20,1 L12,22 M20,1 L20,22"],"N":[11,"M4,1 L4,22 M4,1 L18,22 M18,1 L18,22"],"O":[11,"M9,1 L7,2 5,4 4,6 3,9 3,14 4,17 5,19 7,21 9,22 13,22 15,21 17,19 18,17 19,14 19,9 18,6 17,4 15,2 13,1 9,1"],"P":[10,"M4,1 L4,22 M4,1 L13,1 16,2 17,3 18,5 18,8 17,10 16,11 13,12 4,12"],"Q":[11,"M9,1 L7,2 5,4 4,6 3,9 3,14 4,17 5,19 7,21 9,22 13,22 15,21 17,19 18,17 19,14 19,9 18,6 17,4 15,2 13,1 9,1 M12,18 L18,24"],"R":[10,"M4,1 L4,22 M4,1 L13,1 16,2 17,3 18,5 18,7 17,9 16,10 13,11 4,11 M11,11 L18,22"],"S":[10,"M17,4 L15,2 12,1 8,1 5,2 3,4 3,6 4,8 5,9 7,10 13,12 15,13 16,14 17,16 17,19 15,21 12,22 8,22 5,21 3,19"],"T":[8,"M8,1 L8,22 M1,1 L15,1"],"U":[11,"M4,1 L4,16 5,19 7,21 10,22 12,22 15,21 17,19 18,16 18,1"],"V":[9,"M1,1 L9,22 M17,1 L9,22"],"W":[12,"M2,1 L7,22 M12,1 L7,22 M12,1 L17,22 M22,1 L17,22"],"X":[10,"M3,1 L17,22 M17,1 L3,22"],"Y":[9,"M1,1 L9,11 9,22 M17,1 L9,11"],"Z":[10,"M17,1 L3,22 M3,1 L17,1 M3,22 L17,22"],"[":[7,"M4,-3 L4,29 M5,-3 L5,29 M4,-3 L11,-3 M4,29 L11,29"],"\\":[7,"M0,1 L14,25"],"]":[7,"M9,-3 L9,29 M10,-3 L10,29 M3,-3 L10,-3 M3,29 L10,29"],"^":[8,"M8,-1 L0,13 M8,-1 L16,13"],"_":[9,"M0,29 L18,29"],"`":[4,"M5,6 L3,8 3,10 4,11 5,10 4,9 3,10"],"a":[10,"M15,8 L15,22 M15,11 L13,9 11,8 8,8 6,9 4,11 3,14 3,16 4,19 6,21 8,22 11,22 13,21 15,19"],"b":[9,"M4,1 L4,22 M4,11 L6,9 8,8 11,8 13,9 15,11 16,14 16,16 15,19 13,21 11,22 8,22 6,21 4,19"],"c":[9,"M15,11 L13,9 11,8 8,8 6,9 4,11 3,14 3,16 4,19 6,21 8,22 11,22 13,21 15,19"],"d":[10,"M15,1 L15,22 M15,11 L13,9 11,8 8,8 6,9 4,11 3,14 3,16 4,19 6,21 8,22 11,22 13,21 15,19"],"e":[9,"M3,14 L15,14 15,12 14,10 13,9 11,8 8,8 6,9 4,11 3,14 3,16 4,19 6,21 8,22 11,22 13,21 15,19"],"f":[7,"M10,1 L8,1 6,2 5,5 5,22 M2,8 L9,8"],"g":[10,"M15,8 L15,24 14,27 13,28 11,29 8,29 6,28 M15,11 L13,9 11,8 8,8 6,9 4,11 3,14 3,16 4,19 6,21 8,22 11,22 13,21 15,19"],"h":[10,"M4,1 L4,22 M4,12 L7,9 9,8 12,8 14,9 15,12 15,22"],"i":[4,"M3,1 L4,2 5,1 4,0 3,1 M4,8 L4,22"],"j":[5,"M5,1 L6,2 7,1 6,0 5,1 M6,8 L6,25 5,28 3,29 1,29"],"k":[8,"M4,1 L4,22 M14,8 L4,18 M8,14 L15,22"],"l":[4,"M4,1 L4,22"],"m":[15,"M4,8 L4,22 M4,12 L7,9 9,8 12,8 14,9 15,12 15,22 M15,12 L18,9 20,8 23,8 25,9 26,12 26,22"],"n":[10,"M4,8 L4,22 M4,12 L7,9 9,8 12,8 14,9 15,12 15,22"],"o":[10,"M8,8 L6,9 4,11 3,14 3,16 4,19 6,21 8,22 11,22 13,21 15,19 16,16 16,14 15,11 13,9 11,8 8,8"],"p":[9,"M4,8 L4,29 M4,11 L6,9 8,8 11,8 13,9 15,11 16,14 16,16 15,19 13,21 11,22 8,22 6,21 4,19"],"q":[10,"M15,8 L15,29 M15,11 L13,9 11,8 8,8 6,9 4,11 3,14 3,16 4,19 6,21 8,22 11,22 13,21 15,19"],"r":[6,"M4,8 L4,22 M4,14 L5,11 7,9 9,8 12,8"],"s":[9,"M14,11 L13,9 10,8 7,8 4,9 3,11 4,13 6,14 11,15 13,16 14,18 14,19 13,21 10,22 7,22 4,21 3,19"],"t":[7,"M5,1 L5,18 6,21 8,22 10,22 M2,8 L9,8"],"u":[10,"M4,8 L4,18 5,21 7,22 10,22 12,21 15,18 M15,8 L15,22"],"v":[8,"M2,8 L8,22 M14,8 L8,22"],"w":[11,"M3,8 L7,22 M11,8 L7,22 M11,8 L15,22 M19,8 L15,22"],"x":[9,"M3,8 L14,22 M14,8 L3,22"],"y":[8,"M2,8 L8,22 M14,8 L8,22 6,26 4,28 2,29 1,29"],"z":[9,"M14,8 L3,22 M3,8 L14,8 M3,22 L14,22"],"{":[7,"M9,-3 L7,-2 6,-1 5,1 5,3 6,5 7,6 8,8 8,10 6,12 M7,-2 L6,0 6,2 7,4 8,5 9,7 9,9 8,11 4,13 8,15 9,17 9,19 8,21 7,22 6,24 6,26 7,28 M6,14 L8,16 8,18 7,20 6,21 5,23 5,25 6,27 7,28 9,29"],"|":[4,"M4,-3 L4,29"],"}":[7,"M5,-3 L7,-2 8,-1 9,1 9,3 8,5 7,6 6,8 6,10 8,12 M7,-2 L8,0 8,2 7,4 6,5 5,7 5,9 6,11 10,13 6,15 5,17 5,19 6,21 7,22 8,24 8,26 7,28 M8,14 L6,16 6,18 7,20 8,21 9,23 9,25 8,27 7,28 5,29"],"~":[12,"M3,16 L3,14 4,11 6,10 8,10 10,11 14,14 16,15 18,15 20,14 21,12 M3,14 L4,12 6,11 8,11 10,12 14,15 16,16 18,16 20,15 21,12 21,10"]};
// Render a string as baked single-stroke (Hershey Simplex) polyline path geometry. Unlike SVG
// <text>, this imports as real vector geometry in CAM tools (Vectric, LightBurn, Illustrator),
// which typically ignore <text>. Baseline sits at (x, y); capitals are ~sizeMM tall; y increases
// downward (SVG screen space). anchor: 'start' | 'middle' | 'end'.
// Hershey advance widths are in a compressed unit — the canonical renderer multiplies them by 1.68
// (the em factor) to get true spacing, so we do the same or characters overlap.
const HFONT_ADV = 1.68;
function hersheyPath(str, x, y, sizeMM, opts) {
  opts = opts || {};
  const s = sizeMM / 21, SPACE_W = 10;
  let total = 0;
  for (const ch of str) { const g = HERSHEY[ch]; total += (g ? g[0] : SPACE_W) * HFONT_ADV; }
  let penX = x;
  if (opts.anchor === 'middle') penX = x - total * s / 2;
  else if (opts.anchor === 'end') penX = x - total * s;
  let d = '';
  for (const ch of str) {
    const g = HERSHEY[ch];
    const w = (g ? g[0] : SPACE_W) * HFONT_ADV;
    if (g && g[1]) {
      const toks = g[1].split(' ');
      let cmd = 'L';
      for (const t of toks) {
        let coord = t;
        if (t[0] === 'M' || t[0] === 'L') { cmd = t[0]; coord = t.slice(1); }
        const p = coord.split(',');
        const X = penX + parseFloat(p[0]) * s, Y = y + (parseFloat(p[1]) - 22) * s;
        d += (cmd === 'M' ? 'M' : 'L') + X.toFixed(2) + ',' + Y.toFixed(2) + ' ';
        if (cmd === 'M') cmd = 'L';
      }
    }
    penX += w * s;
  }
  const sw = (opts.strokeWidth !== undefined) ? opts.strokeWidth : sizeMM * 0.05;
  return `<path d="${d.trim()}" fill="none" stroke="${opts.color || '#000'}" stroke-width="${sw.toFixed(2)}"/>`;
}
// Approximate rendered width (mm) of a Hershey string at a given cap size — for layout/bounds.
function hersheyWidth(str, sizeMM) {
  const s = sizeMM / 21; let total = 0;
  for (const ch of str) { const g = HERSHEY[ch]; total += (g ? g[0] : 10) * HFONT_ADV; }
  return total * s;
}
// Compute a tight bounding box (with padding) over ALL geometry in an assembled SVG body — path 'd'
// coordinates plus <line> endpoints. Used to frame the viewBox so nothing (including baked label
// paths, which can overhang the geometry) ever clips.
function svgBBox(content, pad = 12) {
  const xs = [], ys = [];
  const dAttr = content.matchAll(/\sd="([^"]+)"/g);
  for (const dm of dAttr) {
    const cm = dm[1].matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g);
    for (const c of cm) { xs.push(parseFloat(c[1])); ys.push(parseFloat(c[2])); }
  }
  const lines = content.matchAll(/<line[^>]*x1="(-?[\d.]+)"[^>]*y1="(-?[\d.]+)"[^>]*x2="(-?[\d.]+)"[^>]*y2="(-?[\d.]+)"/g);
  for (const l of lines) { xs.push(parseFloat(l[1]), parseFloat(l[3])); ys.push(parseFloat(l[2]), parseFloat(l[4])); }
  if (!xs.length) return { minX: 0, minY: 0, W: 1, H: 1 };
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad, maxY = Math.max(...ys) + pad;
  return { minX, minY, W: maxX - minX, H: maxY - minY };
}

// Appends binding-insert geometry to a DXF on the INSERTS layer (snowboard mode only): a circle at
// each drill center (2x4 / 4x4) or a closed slot outline per foot (channel), plus a small cross at
// each pack center. `tf(x,y)` maps ski coords (x=width, y=length) to the target layout (default:
// identity, used by the base DXF; the combined DXF passes a swap+offset). Empty string in ski mode.
function buildInsertsDXF(ski, tf) {
  if ((ski.mode || "ski") !== "snowboard") return "";
  const T = tf || ((x, y) => ({ x, y }));
  const ins = computeInserts(ski);
  let out = "";
  const holeR = 3.2;  // ~M6 insert (6.4mm dia). Drill centers.
  ins.holes.forEach(h => { const p = T(h.x, h.y); out += dxfCircle('INSERTS', p.x, p.y, holeR); });
  ins.slots.forEach(sl => {
    const hw = sl.width / 2;
    const pts = [
      T(sl.x - hw, sl.y0), T(sl.x + hw, sl.y0), T(sl.x + hw, sl.y1), T(sl.x - hw, sl.y1),
    ];
    out += dxfLwpolyline('INSERTS', pts, true);
  });
  ins.packs.forEach(p => {
    const c = T(0, p.y), a1 = T(-7, p.y), a2 = T(7, p.y), b1 = T(0, p.y - 7), b2 = T(0, p.y + 7);
    out += dxfLine('INSERTS', a1.x, a1.y, a2.x, a2.y);
    out += dxfLine('INSERTS', b1.x, b1.y, b2.x, b2.y);
    // Label placed in FINAL space past the cross's 7mm arm (x+11) and clear of the board centerline
    // (y+9), grown right — clears both the cross marks and the centerline in either orientation.
    out += dxfText('INSERTS', c.x + 11, c.y + 9, 6, p.foot === "front" ? "FRONT" : "BACK");
  });
  return out;
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
  // Per-side contact ranges: each edge runs from its own tail-contact to its own tip-contact (plus the
  // shared wrap extensions), so the base cut is independently asymmetric on the inside/outside edges.
  const eps = 0.5;
  const rangeFor = (con) => ({
    startY: Math.max(eps, con.tailL - extTail),
    endY: Math.min(ski.length - eps, (ski.length - con.tipL) + extTip),
  });
  const rOut = rangeFor(sideContact(ski, "out"));   // right / +x = outside
  const rIn = rangeFor(sideContact(ski, "in"));     // left / -x = inside

  // True outline points (include tip/tail bezier curves). `right` runs tail-end→tip-end.
  const outline = computeOutline(ski);

  // Extract one side's points within [startY, endY], interpolating exact endpoints so the edge
  // starts/ends precisely at the requested stations. `pts` is assumed ordered by increasing skiY.
  const sliceSide = (pts, startY, endY) => {
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

  const rightRaw = sliceSide(outline.right, rIn.startY, rIn.endY);   // +x = inside
  const leftRaw = sliceSide(outline.left, rOut.startY, rOut.endY);   // -x = outside

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
  const waistY = resolveWaistY(ski);
  return [
    { skiY: tailC,  label: "TAIL CONTACT", halfWidthAt: getWidthAtPos(ski, tailC / ski.length) / 2 + 6 },
    { skiY: waistY, label: "WAIST",         halfWidthAt: getWidthAtPos(ski, waistY / ski.length) / 2 + 6 },
    { skiY: tipC,   label: "TIP CONTACT",  halfWidthAt: getWidthAtPos(ski, tipC / ski.length) / 2 + 6 },
  ];
}

// ══════════════ PLAN SVG EXPORT ══════════════
function exportPlanSVG(ski){
  const O = skiOrientation(ski);
  // getFullOutlinePoints returns vertical convention {x: lateral, y: along}. Project to the chosen
  // orientation (P), then flip into SVG screen space (Y down) via screenY.
  const P = p => O === "horizontal" ? { x: p.y, y: p.x } : { x: p.x, y: p.y };
  const edgeInset = ski.edgeInset !== undefined ? ski.edgeInset : 2.0;
  const edgeWrap = ski.edgeWrap || "full";
  const ptsRaw = getFullOutlinePoints(ski);
  const isContact = edgeInset > 0 && edgeWrap === "contact";
  const insetRaw = (edgeInset > 0 && edgeWrap === "full") ? offsetPolygonInward(ptsRaw, edgeInset) : null;
  const baseCutRaw = isContact ? getContactBaseCutLoop(ski, edgeInset, ski.edgeExtTip || 0, ski.edgeExtTail || 0) : null;
  const pts = ptsRaw.map(P);
  const insetPts = insetRaw ? insetRaw.map(P) : null;
  const baseCutLoop = baseCutRaw ? baseCutRaw.map(P) : null;
  const marks = getRegistrationMarks(ski);

  const pad = 10;
  // Math-space bounds of the geometry (before adding labels / table).
  const gMinX = Math.min(...pts.map(p=>p.x)), gMaxX = Math.max(...pts.map(p=>p.x));
  const gMinY = Math.min(...pts.map(p=>p.y)), gMaxY = Math.max(...pts.map(p=>p.y));
  const geomW = gMaxX - gMinX, geomH = gMaxY - gMinY;

  // Screen transform: geometry starts at (pad, pad); SVG Y increases downward so we flip.
  const sx = x => (x - gMinX + pad);
  const sy = y => (gMaxY - y + pad);

  // Text is sized relative to the drawing so it stays legible when the whole SVG is viewed at once
  // (a 4mm label on an 1800mm sheet is invisible at fit-to-view). fL = contact-label height.
  const fL = Math.max(ski.length / 200, 7);
  const fTbl = Math.max(ski.length / 240, 6);
  const charW = fL * 0.62;

  // Contact labels are placed beyond the ski's MAXIMUM half-width (not the local width at each
  // station), so the text always clears the whole curved outline — plus a gap past the reference
  // line. Aligned in a neat column just outside the widest point.
  const maxHW = Math.max(...ptsRaw.map(p => Math.abs(p.x)));
  const refGap = fL;
  const labelLat = maxHW + refGap;

  // Right extent of the contact labels — the table must clear these so nothing overlaps.
  const labelRightExtent = Math.max(gMaxX, ...marks.map(m => {
    const pl = P({ x: labelLat, y: m.skiY });
    return pl.x + hersheyWidth(m.label, fL);
  }));

  // Measurements table (top-right, beyond both the geometry and the contact labels).
  const coreInsetVal = ski.coreInset !== undefined ? ski.coreInset : 0;
  const tblGap = fL;
  const tblX = (labelRightExtent - gMinX + pad) + tblGap;
  const tblTopY = pad + 8;
  const tbl = buildMeasurementsTableSVG(ski, tblX, tblTopY, { coreInset: coreInsetVal }, fTbl);
  const tblH = tbl.height;

  const totalW = tblX + tbl.width + pad;
  const totalH = pad + Math.max(geomH, tblH) + pad;

  const pathFrom = (arr, close) => arr.map((p,i) =>
    `${i===0?'M':'L'}${sx(p.x).toFixed(3)},${sy(p.y).toFixed(3)}`
  ).join(' ') + (close ? ' Z' : '');

  const outerPath = pathFrom(pts, true);
  const insetPath = insetPts ? pathFrom(insetPts, true) : '';
  const baseCutPath = baseCutLoop ? pathFrom(baseCutLoop, true) : '';

  // Reference cross-lines + horizontal labels. Anchor points are defined in vertical convention then
  // projected (P) so they land correctly in either orientation; text is always drawn horizontal and
  // sits clear of the outline (past the widest point).
  const refMarks = marks.map(m => {
    const halfW = getWidthAtPos(ski, m.skiY / ski.length) / 2;
    const a = { x: -halfW, y: m.skiY }, b = { x: halfW, y: m.skiY };
    const lbl = { x: labelLat, y: m.skiY };
    const pa = P(a), pb = P(b), pl = P(lbl);
    return `    <line x1="${sx(pa.x).toFixed(2)}" y1="${sy(pa.y).toFixed(2)}" x2="${sx(pb.x).toFixed(2)}" y2="${sy(pb.y).toFixed(2)}" stroke="#aa0000" stroke-width="${(fL*0.08).toFixed(2)}"/>
    ${hersheyPath(m.label, sx(pl.x), sy(pl.y) + fL*0.35, fL, {color:'#aa0000'})}`;
  }).join('\n');

  // Centerline along the full length at lateral 0.
  const c0 = P({ x: 0, y: 0 }), c1 = P({ x: 0, y: ski.length });
  const centerline = `<line x1="${sx(c0.x).toFixed(2)}" y1="${sy(c0.y).toFixed(2)}" x2="${sx(c1.x).toFixed(2)}" y2="${sy(c1.y).toFixed(2)}" stroke="#0066cc" stroke-width="0.4" stroke-dasharray="6,3"/>`;

  const edgeDesc = isContact
    ? `Cut path = single continuous base-cut loop (${edgeInset}mm edge inset, partial wrap with perpendicular tie-ins).`
    : (insetPts ? `Inset line = base cut (${edgeInset}mm full-wrap inset).` : `Outline only.`);

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

  const body = `${cutGroup}
  <g id="table">${tbl.svg}</g>
  <g id="centerline">${centerline}</g>
  <g id="reference">
${refMarks}
  </g>`;
  const bb = svgBBox(body);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bb.W.toFixed(2)}mm" height="${bb.H.toFixed(2)}mm" viewBox="${bb.minX.toFixed(2)} ${bb.minY.toFixed(2)} ${bb.W.toFixed(2)} ${bb.H.toFixed(2)}">
  <title>Black Chapel Studios — Ski Plan ${ski.length}mm ${ski.tipWidth}-${ski.waistWidth}-${ski.tailWidth}</title>
  <desc>${edgeDesc} Red = reference lines. Orientation: ${O}. Units: mm.</desc>
${body}
</svg>`;
  downloadFile(svg, `bcs-ski-plan-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ PLAN DXF EXPORT ══════════════
// Appends the measurements table (as TEXT rows) to a DXF string, on the 'TABLE' layer, with its top
// at (tblX, tblTopY). Shared by the combined AND base exports so both carry identical spec data.
// Returns the DXF text to append.
// Shared row data for the measurements table — single source of truth for both the DXF and SVG
// table builders, so every export shows identical spec data.
function measurementRows(ski, extra = {}) {
  const derived = computeDerived(ski);
  const edgeWrap = ski.edgeWrap || "full";
  const rows = [];
  rows.push(["Overall length", `${ski.length}`]);
  rows.push(["Tip width", `${ski.tipWidth}`]);
  rows.push(["Waist width", `${ski.waistWidth}`]);
  rows.push(["Tail width", `${ski.tailWidth}`]);
  rows.push(["Tip length (shovel)", `${ski.tipLength}`]);
  rows.push(["Tail length", `${ski.tailLength}`]);
  rows.push(["Running / effective edge", `${derived.effectiveEdge.toFixed(0)}`]);
  const rk = rockerPercents(ski);
  rows.push(["Rocker profile (T/C/T %)", `${rk.tip.toFixed(0)} / ${rk.camber.toFixed(0)} / ${rk.tail.toFixed(0)}`]);
  if (ski.rockerLinked === false) {
    const rp = rockerProfilePercents(ski);
    rows.push(["Rocker takeoff (T/C/T %)", `${rp.tip.toFixed(0)} / ${rp.camber.toFixed(0)} / ${rp.tail.toFixed(0)} (unlinked)`]);
  }
  rows.push(["Sidecut radius (m)", `${isFinite(derived.sidecutRadius) ? derived.sidecutRadius.toFixed(1) : "flat"}`]);
  rows.push(["Tip height (rocker)", `${ski.tipHeight}`]);
  rows.push(["Tail height (rocker)", `${ski.tailHeight}`]);
  rows.push(["Camber height", `${ski.camberHeight}`]);
  rows.push(["Waist position", `${((ski.waistPosition !== undefined ? ski.waistPosition : 0.48) * 100).toFixed(0)}%`]);
  rows.push(["Edge inset", `${ski.edgeInset}`]);
  rows.push(["Edge wrap", edgeWrap === "contact" ? "contact-to-contact" : "full wrap"]);
  if (edgeWrap === "contact") rows.push(["Edge ext (tip / tail)", `${ski.edgeExtTip || 0} / ${ski.edgeExtTail || 0}`]);
  if (extra.coreInset !== undefined) rows.push(["Core inset", `${extra.coreInset}`]);
  if ((ski.mode || "ski") === "snowboard") {
    rows.push(["Stance width", `${ski.stanceWidth} (${(ski.stanceWidth/10).toFixed(1)}cm)`]);
    rows.push(["Setback", `${ski.setback}`]);
    rows.push(["Insert pattern", `${ski.insertPattern || "2x4"}`]);
  }
  return rows;
}

function buildMeasurementsTable(ski, tblX, tblTopY, extra = {}) {
  const rowH = 16, th = 7;
  let tblY = tblTopY;
  let out = dxfText('TABLE', tblX, tblY + rowH, 9, "MEASUREMENTS (mm)");
  measurementRows(ski, extra).forEach(([label, value]) => {
    out += dxfText('TABLE', tblX, tblY, th, label);
    out += dxfText('TABLE', tblX + 190, tblY, th, value);
    tblY -= rowH;
  });
  return out;
}

// SVG measurements table. Rows flow DOWNWARD from the top anchor; text is always horizontal. `fs` is
// the row font size in mm (scaled to the drawing so it's legible at fit-to-view). Returns the markup
// plus the table's width/height so callers can size the viewBox and place it without overlap.
function buildMeasurementsTableSVG(ski, tblX, tblTopY, extra = {}, fs = 24) {
  const rows = measurementRows(ski, extra);
  const headerF = fs * 1.3, rowH = fs * 1.7;
  // Column width from actual Hershey advance widths so the value column clears the widest label.
  const valOff = Math.max(...rows.map(r => hersheyWidth(r[0], fs))) + fs * 1.2;
  const maxValW = Math.max(...rows.map(r => hersheyWidth(r[1], fs)));
  const width = valOff + maxValW + fs;
  let y = tblTopY + headerF;
  let out = hersheyPath("MEASUREMENTS (mm)", tblX, y, headerF, { strokeWidth: headerF * 0.07 });
  y += rowH * 1.2;
  rows.forEach(([k, v]) => {
    out += "\n    " + hersheyPath(k, tblX, y, fs) + hersheyPath(v, tblX + valOff, y, fs);
    y += rowH;
  });
  return { svg: out, width, height: (y - tblTopY) };
}

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
    { name: 'TABLE', color: 2 },
    { name: 'INSERTS', color: 4 },
  ];
  let dxf = dxfStart(layers);

  // Orientation: geometry authored in vertical convention {x: lateral, y: along}; P projects it.
  const O = skiOrientation(ski);
  const P = p => O === "horizontal" ? { x: p.y, y: p.x } : { x: p.x, y: p.y };

  if (edgeWrap === "contact" && edgeInset > 0) {
    // Contact mode: the base cut is a SINGLE continuous closed loop (outline arcs at tip/tail +
    // perpendicular tie-ins + edge insets). This is the one perimeter a drag knife follows, so we
    // export just this loop as the cut path — NOT a separate full outline, which would be a second
    // stray cut. The loop already traces the true outline in the tip/tail regions.
    const loop = getContactBaseCutLoop(ski, edgeInset, ski.edgeExtTip || 0, ski.edgeExtTail || 0).map(P);
    dxf += dxfLwpolyline('BASE_CUT', loop, true);
  } else {
    // Full-wrap (or zero inset): full outline + (optionally) a closed inset loop around it.
    dxf += dxfLwpolyline('OUTLINE', pts.map(P), true);
    if (edgeInset > 0) {
      const insetPts = offsetPolygonInward(pts, edgeInset).map(P);
      dxf += dxfLwpolyline('EDGE_OFFSET', insetPts, true);
    }
  }

  // Centerline along the full length at lateral 0.
  const c0 = P({ x: 0, y: 0 }), c1 = P({ x: 0, y: ski.length });
  dxf += dxfLine('CENTERLINE', c0.x, c0.y, c1.x, c1.y);

  // Reference cross-lines: tail contact, waist, tip contact — each spans the width at its station.
  // Contact labels sit beyond the ski's MAXIMUM half-width so they clear the whole outline.
  const maxHW = Math.max(...pts.map(p => Math.abs(p.x)));
  const labelLat = maxHW + 12;
  marks.forEach(m => {
    const hw = getWidthAtPos(ski, m.skiY / ski.length) / 2;
    const a = P({ x: -hw, y: m.skiY }), b = P({ x: hw, y: m.skiY }), lbl = P({ x: labelLat, y: m.skiY - 2 });
    dxf += dxfLine('REFERENCE', a.x, a.y, b.x, b.y);
    dxf += dxfText('TEXT', lbl.x, lbl.y, 6, m.label);
  });

  // Binding inserts (snowboard mode) on the INSERTS layer — pass P so they orient with the outline.
  dxf += buildInsertsDXF(ski, (x, y) => P({ x, y }));

  // Measurements table — beyond the geometry AND the contact labels so nothing overlaps it.
  const projPts = pts.map(P);
  const lblPts = marks.map(m => P({ x: labelLat + m.label.length * 6 * 0.62, y: m.skiY }));
  const gMaxX = Math.max(...projPts.map(p => p.x), ...lblPts.map(p => p.x));
  const gMaxY = Math.max(...projPts.map(p => p.y));
  dxf += buildMeasurementsTable(ski, gMaxX + 40, gMaxY, { coreInset: ski.coreInset !== undefined ? ski.coreInset : 0 });

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
  const O = skiOrientation(ski);
  const Q = (a, t) => orientPt(a, t, O);  // a = along-length, t = thickness

  const layers = [
    { name: 'CORE_SIDE_PROFILE', color: 3 },
    { name: 'REFERENCE', color: 1 },
    { name: 'TEXT', color: 2 },
  ];
  let dxf = dxfStart(layers);

  // Closed side-profile polygon: flat bottom (t=0) + thickness curve on top.
  const poly = [Q(0, 0), ...topPts.map(p => Q(p.x, p.y)), Q(ski.length, 0)];
  dxf += dxfLwpolyline('CORE_SIDE_PROFILE', poly, true);

  // Reference lines + horizontal labels at tail contact, waist, tip contact.
  marks.forEach(m => {
    const a = Q(m.skiY, 0), b = Q(m.skiY, maxT), lbl = Q(m.skiY + 2, maxT + 1);
    dxf += dxfLine('REFERENCE', a.x, a.y, b.x, b.y);
    dxf += dxfText('TEXT', lbl.x, lbl.y, 6, m.label);
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
  const marks = getRegistrationMarks(ski);
  const L = ski.length, pad = 10, sz = 1;  // sz=1: true 1:1 thickness, matching the DXF (no exaggeration)
  const O = skiOrientation(ski);
  const fL = Math.max(ski.length / 200, 7);
  // Canonical math point (Y up): a = along, te = thickness * sz (exaggerated for readability).
  const M = (a, t) => orientPt(a, t * sz, O);

  const poly = [M(0, 0), ...topPts.map(p => M(p.x, p.y)), M(L, 0)];
  const gMinX = Math.min(...poly.map(p => p.x)), gMaxX = Math.max(...poly.map(p => p.x));
  const gMinY = Math.min(...poly.map(p => p.y)), gMaxY = Math.max(...poly.map(p => p.y));
  const geomW = gMaxX - gMinX, geomH = gMaxY - gMinY;
  const sx = x => (x - gMinX + pad);
  const sy = y => (gMaxY - y + pad);

  const labelCharW = fL * 0.62;
  const labelRightExtent = Math.max(0, ...marks.map(m => {
    const lp = M(m.skiY + 2, maxT);
    return sx(lp.x) + m.label.length * labelCharW;
  }));
  const totalW = Math.max(pad + geomW + pad, labelRightExtent + pad);
  const totalH = pad + geomH + pad;

  const fillPath = poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ') + ' Z';
  const regLines = marks.map(m => {
    const a = M(m.skiY, 0), b = M(m.skiY, maxT), lbl = M(m.skiY + 2, maxT);
    return `<line x1="${sx(a.x).toFixed(2)}" y1="${sy(a.y).toFixed(2)}" x2="${sx(b.x).toFixed(2)}" y2="${sy(b.y).toFixed(2)}" stroke="#aa0000" stroke-width="${(fL*0.08).toFixed(2)}"/>
    ${hersheyPath(m.label, sx(lbl.x), sy(lbl.y) - fL*0.3, fL, {color:'#aa0000'})}`;
  }).join('\n    ');

  const body = `  <g id="profile"><path d="${fillPath}" fill="rgba(200,147,90,0.18)" stroke="#C8935A" stroke-width="0.6"/></g>
  <g id="reference">${regLines}</g>`;
  const bb = svgBBox(body);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bb.W.toFixed(1)}mm" height="${bb.H.toFixed(1)}mm" viewBox="${bb.minX.toFixed(1)} ${bb.minY.toFixed(1)} ${bb.W.toFixed(1)} ${bb.H.toFixed(1)}">
  <title>Black Chapel Studios — Core Side Profile ${ski.length}mm</title>
  <desc>Closed shape for flat-bed CNC: flat bottom, thickness curve on top. True 1:1 (matches DXF). Orientation: ${O}.</desc>
${body}
</svg>`;
  downloadFile(svg, `bcs-ski-core-side-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ CORE PLAN OUTLINE EXPORT ══════════════
// Top-down outline of the wood core, narrowed by coreInset on each side for sidewall comp.
// Intended to be imported into 3D modeling software on the XY (top-view) plane. Used to
// boolean-cut the extruded side profile for the final 3D core shape.
// 3D wood core as a binary STL. Lofts the core as left/right half-intervals along the length, which
// captures the FULL V-cut in either direction: an OUTWARD spear (positive extension, apex past the
// contact) or an INWARD notch / swallowtail (negative extension, apex back toward the center). The top
// follows the core-side thickness curve (flat bottom at Z=0). Planform matches the DXF outline, so the
// solid is WYSIWYG. Honors the Export Orientation dropdown. Import into CAM as millimetres.
function exportCoreSTL(ski) {
  const coreInset = ski.coreInset !== undefined ? ski.coreInset : 0;
  const L = ski.length;
  const tailContactX = ski.tailLength, tipContactX = L - ski.tipLength;
  const vTip = !!ski.vcutTip, vTail = !!ski.vcutTail;
  // Extension: POSITIVE reaches past the contact toward the tip/tail (outward spear); NEGATIVE reaches
  // back toward the center (inward notch). Clamp to a safe range so the outline can't self-intersect.
  const effHalf = Math.max(1, (tipContactX - tailContactX) / 2);
  const tipExt = vTip ? Math.max(-effHalf * 0.9, Math.min(ski.tipLength, ski.vcutTipExt || 0)) : 0;
  const tailExt = vTail ? Math.max(-effHalf * 0.9, Math.min(ski.tailLength, ski.vcutTailExt || 0)) : 0;
  const hw = (x) => Math.max(1.0, getWidthAtPos(ski, x / L) / 2 - coreInset);
  const th = (x) => Math.max(0.3, getCoreThickAt(ski.coreProfile, x / L));

  // Cross-section at length x -> { o: outer half-width, n: inner notch edge } or null (no core). Body:
  // n=0. Outward spear: o tapers to 0 at the apex. Inward notch: n rises to o at the contact (two prongs).
  function sec(x) {
    if (vTip) {
      if (tipExt > 0) { const apex = tipContactX + tipExt; if (x > tipContactX) { if (x > apex) return null; return { o: Math.max(0, hw(tipContactX) * (apex - x) / tipExt), n: 0 }; } }
      else if (tipExt < 0) { const apex = tipContactX + tipExt; if (x > tipContactX) return null; if (x >= apex) { const o = hw(x); return { o, n: Math.min(hw(tipContactX) * (x - apex) / (-tipExt), o) }; } }
      else { if (x > tipContactX) return null; }
    }
    if (vTail) {
      if (tailExt > 0) { const apex = tailContactX - tailExt; if (x < tailContactX) { if (x < apex) return null; return { o: Math.max(0, hw(tailContactX) * (x - apex) / tailExt), n: 0 }; } }
      else if (tailExt < 0) { const apex = tailContactX - tailExt; if (x < tailContactX) return null; if (x <= apex) { const o = hw(x); return { o, n: Math.min(hw(tailContactX) * (apex - x) / (-tailExt), o) }; } }
      else { if (x < tailContactX) return null; }
    }
    return { o: hw(x), n: 0 };
  }

  const xLo = vTail ? (tailExt > 0 ? tailContactX - tailExt : tailContactX) : 0;
  const xHi = vTip ? (tipExt > 0 ? tipContactX + tipExt : tipContactX) : L;
  const NS = 360, xset = new Set();
  for (let i = 0; i <= NS; i++) xset.add(xLo + (xHi - xLo) * i / NS);
  [tipContactX, tipContactX + tipExt, tailContactX, tailContactX - tailExt].forEach(e => { if (e >= xLo - 1e-6 && e <= xHi + 1e-6) xset.add(e); });
  const X = [...xset].filter(x => x >= xLo - 1e-6 && x <= xHi + 1e-6).sort((a, b) => a - b);
  const XX = []; for (const x of X) { if (!XX.length || Math.abs(x - XX[XX.length - 1]) > 1e-4) XX.push(x); }

  const cx = L / 2, tris = [];
  const nrm = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const m = Math.hypot(nx, ny, nz) || 1; return [nx / m, ny / m, nz / m]; };
  const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6 && Math.abs(p[2] - q[2]) < 1e-6;
  const tri = (a, b, c, dir) => { let n = nrm(a, b, c); if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) { const t = b; b = c; c = t; n = nrm(a, b, c); } tris.push({ n, v: [a, b, c] }); };
  const P = (x, y, z) => [x - cx, y, z];
  const quad = (a, b, c, d, dir) => { const pts = [a, b, c, d], u = []; for (const p of pts) { const q = u[u.length - 1]; if (!q || !same(p, q)) u.push(p); } if (u.length > 1 && same(u[0], u[u.length - 1])) u.pop(); if (u.length === 4) { tri(u[0], u[1], u[2], dir); tri(u[0], u[2], u[3], dir); } else if (u.length === 3) tri(u[0], u[1], u[2], dir); };

  // Loft one half-interval between two slices: top, bottom, outer wall, and (for a notch) the inner wall.
  const loftHalf = (x0, x1, t0, t1, lo0, hi0, lo1, hi1, outer, innerOn) => {
    quad(P(x0, lo0, t0), P(x0, hi0, t0), P(x1, hi1, t1), P(x1, lo1, t1), [0, 0, 1]);
    quad(P(x0, lo0, 0), P(x0, hi0, 0), P(x1, hi1, 0), P(x1, lo1, 0), [0, 0, -1]);
    if (outer === 'lo') { quad(P(x0, lo0, 0), P(x0, lo0, t0), P(x1, lo1, t1), P(x1, lo1, 0), [0, -1, 0]); if (innerOn) quad(P(x0, hi0, 0), P(x0, hi0, t0), P(x1, hi1, t1), P(x1, hi1, 0), [0, 1, 0]); }
    else { quad(P(x0, hi0, 0), P(x0, hi0, t0), P(x1, hi1, t1), P(x1, hi1, 0), [0, 1, 0]); if (innerOn) quad(P(x0, lo0, 0), P(x0, lo0, t0), P(x1, lo1, t1), P(x1, lo1, 0), [0, -1, 0]); }
  };

  for (let i = 0; i < XX.length - 1; i++) {
    const x0 = XX[i], x1 = XX[i + 1], s0 = sec(x0), s1 = sec(x1);
    if (!s0 || !s1) continue;
    const t0 = th(x0), t1 = th(x1), notch = s0.n > 1e-6 || s1.n > 1e-6;
    loftHalf(x0, x1, t0, t1, -s0.o, -s0.n, -s1.o, -s1.n, 'lo', notch);
    loftHalf(x0, x1, t0, t1, s0.n, s0.o, s1.n, s1.o, 'hi', notch);
  }
  // End caps at blunt / non-V ends (tapered ends converge to a point and need no cap).
  const capX = (x, dir) => { const s = sec(x); if (!s) return; const t = th(x); quad(P(x, -s.o, 0), P(x, -s.n, 0), P(x, -s.n, t), P(x, -s.o, t), dir); quad(P(x, s.n, 0), P(x, s.o, 0), P(x, s.o, t), P(x, s.n, t), dir); };
  const sA = sec(XX[0]); if (sA && sA.o - sA.n > 0.05 && !(vTail && tailExt > 0)) capX(XX[0], [-1, 0, 0]);
  const sB = sec(XX[XX.length - 1]); if (sB && sB.o - sB.n > 0.05 && !(vTip && tipExt > 0)) capX(XX[XX.length - 1], [1, 0, 0]);

  // Honor the Export Orientation dropdown: "vertical" (default) runs length up +Y; "horizontal" keeps
  // length along X. Applied as a true 90° rotation about Z so the solid stays valid.
  const vertical = (ski.exportOrientation || "vertical") !== "horizontal";
  if (vertical) for (const t of tris) { t.v = t.v.map(v => [-v[1], v[0], v[2]]); t.n = [-t.n[1], t.n[0], t.n[2]]; }

  const n = tris.length;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const hdr = `Black Chapel Studios core ${ski.length}mm (mm)`;
  for (let i = 0; i < Math.min(hdr.length, 79); i++) dv.setUint8(i, hdr.charCodeAt(i) & 0xff);
  let off = 80; dv.setUint32(off, n, true); off += 4;
  for (const t of tris) {
    dv.setFloat32(off, t.n[0], true); dv.setFloat32(off + 4, t.n[1], true); dv.setFloat32(off + 8, t.n[2], true); off += 12;
    for (const v of t.v) { dv.setFloat32(off, v[0], true); dv.setFloat32(off + 4, v[1], true); dv.setFloat32(off + 8, v[2], true); off += 12; }
    dv.setUint16(off, 0, true); off += 2;
  }
  downloadFile(buf, `bcs-ski-core-3d-${ski.length}mm.stl`, "model/stl");
}

function exportCorePlanDXF(ski){
  const coreInset = ski.coreInset !== undefined ? ski.coreInset : 0;
  const N = 200;
  let planPts;
  if (ski.vcutTip || ski.vcutTail) {
    // V-cut core: use the shared helper (X=length space) and swap to this export's X=width/Y=length.
    planPts = applyVCutToCore(ski).map(p => ({ x: p.y, y: p.x }));
  } else {
    planPts = [];
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
  }
  const marks = getRegistrationMarks(ski);
  const O = skiOrientation(ski);
  const P = p => O === "horizontal" ? { x: p.y, y: p.x } : { x: p.x, y: p.y };

  const layers = [
    { name: 'CORE_PLAN_OUTLINE', color: 3 },
    { name: 'CENTERLINE', color: 5 },
    { name: 'REFERENCE', color: 1 },
    { name: 'TEXT', color: 2 },
  ];
  let dxf = dxfStart(layers);

  // Closed core outline
  dxf += dxfLwpolyline('CORE_PLAN_OUTLINE', planPts.map(P), true);

  // Labels sit beyond the core's MAXIMUM half-width so they clear the whole outline.
  const maxHW = Math.max(...planPts.map(p => Math.abs(p.x)));
  const labelLat = maxHW + 12;

  // V-cut note: mark the fill triangle(s) so the builder knows the core ends at the V.
  if (ski.vcutTip) {
    const apexY = (ski.length - ski.tipLength) + (ski.vcutTipExt || 0);
    const p = P({ x: labelLat, y: Math.min(apexY, ski.length - 4) });
    dxf += dxfText('TEXT', p.x, p.y, 6, "TIP V-CUT (fill beyond)");
  }
  if (ski.vcutTail) {
    const apexY = ski.tailLength - (ski.vcutTailExt || 0);
    const p = P({ x: labelLat, y: Math.max(apexY, 8) });
    dxf += dxfText('TEXT', p.x, p.y, 6, "TAIL V-CUT (fill beyond)");
  }

  // Centerline along the full length at lateral 0.
  const cc0 = P({ x: 0, y: 0 }), cc1 = P({ x: 0, y: ski.length });
  dxf += dxfLine('CENTERLINE', cc0.x, cc0.y, cc1.x, cc1.y);

  // Reference cross-lines at tail contact, waist, tip contact (span core width). Labels horizontal.
  marks.forEach(m => {
    const hw = Math.max(1.0, getWidthAtPos(ski, m.skiY / ski.length) / 2 - coreInset);
    const a = P({ x: -hw, y: m.skiY }), b = P({ x: hw, y: m.skiY }), lbl = P({ x: labelLat, y: m.skiY - 2 });
    dxf += dxfLine('REFERENCE', a.x, a.y, b.x, b.y);
    dxf += dxfText('TEXT', lbl.x, lbl.y, 6, m.label);
  });

  dxf += dxfEnd();
  downloadFile(dxf, `bcs-ski-core-plan-${ski.length}mm.dxf`, "application/dxf");
}

function exportCorePlanSVG(ski){
  const coreInset = ski.coreInset !== undefined ? ski.coreInset : 0;
  const N = 200;
  let all;
  if (ski.vcutTip || ski.vcutTail) {
    // V-cut core: reuse the shared helper (X=length space) and swap to this export's
    // convention (x = lateral/width, y = length) so tip/tail terminate in the V fill.
    all = applyVCutToCore(ski).map(p => ({ x: p.y, y: p.x }));
  } else {
    const right = [], left = [];
    for (let i = 0; i <= N; i++) {
      const pos = i / N;
      const xmm = pos * ski.length;
      const halfW = Math.max(1.0, getWidthAtPos(ski, pos) / 2 - coreInset);
      right.push({ x: halfW, y: xmm });
      left.unshift({ x: -halfW, y: xmm });
    }
    all = [...right, ...left];
  }
  const marks = getRegistrationMarks(ski);
  const O = skiOrientation(ski);
  const P = p => O === "horizontal" ? { x: p.y, y: p.x } : { x: p.x, y: p.y };
  const pts = all.map(P);
  const pad = 10;
  const fL = Math.max(ski.length / 200, 7);
  const gMinX = Math.min(...pts.map(p => p.x)), gMaxX = Math.max(...pts.map(p => p.x));
  const gMinY = Math.min(...pts.map(p => p.y)), gMaxY = Math.max(...pts.map(p => p.y));
  const geomW = gMaxX - gMinX, geomH = gMaxY - gMinY;
  const sx = x => (x - gMinX + pad);
  const sy = y => (gMaxY - y + pad);

  // Contact labels placed beyond the core's MAXIMUM half-width so they clear the whole outline.
  const maxHW = Math.max(...all.map(p => Math.abs(p.x)));
  const refGap = fL;
  const labelLat = maxHW + refGap;
  const labelCharW = fL * 0.62;
  const labelRightExtent = Math.max(0, ...marks.map(m => {
    const pl = P({ x: labelLat, y: m.skiY });
    return sx(pl.x) + hersheyWidth(m.label, fL);
  }));
  const totalW = Math.max(pad + geomW + pad, labelRightExtent + pad);
  const totalH = pad + geomH + pad;

  const pathD = pts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(3)},${sy(p.y).toFixed(3)}`
  ).join(' ') + ' Z';
  const regLines = marks.map(m => {
    const hw = Math.max(1.0, getWidthAtPos(ski, m.skiY / ski.length) / 2 - coreInset);
    const a = P({ x: -hw, y: m.skiY }), b = P({ x: hw, y: m.skiY }), lbl = P({ x: labelLat, y: m.skiY });
    return `<line x1="${sx(a.x).toFixed(2)}" y1="${sy(a.y).toFixed(2)}" x2="${sx(b.x).toFixed(2)}" y2="${sy(b.y).toFixed(2)}" stroke="#aa0000" stroke-width="${(fL*0.08).toFixed(2)}"/>
    ${hersheyPath(m.label, sx(lbl.x), sy(lbl.y) + fL*0.35, fL, {color:'#aa0000'})}`;
  }).join('\n    ');
  const cc0 = P({ x: 0, y: 0 }), cc1 = P({ x: 0, y: ski.length });
  const centerline = `<line x1="${sx(cc0.x).toFixed(2)}" y1="${sy(cc0.y).toFixed(2)}" x2="${sx(cc1.x).toFixed(2)}" y2="${sy(cc1.y).toFixed(2)}" stroke="#0066cc" stroke-width="0.4" stroke-dasharray="6,3"/>`;

  // V-cut fill notes — placed beyond the outline (past the max half-width) at the apex station so the
  // text doesn't cross the core geometry. Matches the DXF's intent.
  const vcutNotes = [];
  if (ski.vcutTip) {
    const apexY = Math.min((ski.length - ski.tipLength) + (ski.vcutTipExt || 0), ski.length - 4);
    const p = P({ x: labelLat, y: apexY });
    vcutNotes.push(hersheyPath("TIP V-CUT (fill beyond)", sx(p.x), sy(p.y) + fL*0.3, fL*0.85, {color:'#aa0000'}));
  }
  if (ski.vcutTail) {
    const apexY = Math.max(ski.tailLength - (ski.vcutTailExt || 0), 8);
    const p = P({ x: labelLat, y: apexY });
    vcutNotes.push(hersheyPath("TAIL V-CUT (fill beyond)", sx(p.x), sy(p.y) + fL*0.3, fL*0.85, {color:'#aa0000'}));
  }
  const vcutNote = vcutNotes.join('\n    ');

  const body = `  <g id="outline" stroke="#000" stroke-width="0.6" fill="none"><path d="${pathD}"/></g>
  <g id="centerline">${centerline}</g>
  <g id="reference">${regLines}</g>
  <g id="vcut-notes">${vcutNote}</g>`;
  const bb = svgBBox(body);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bb.W.toFixed(2)}mm" height="${bb.H.toFixed(2)}mm" viewBox="${bb.minX.toFixed(2)} ${bb.minY.toFixed(2)} ${bb.W.toFixed(2)} ${bb.H.toFixed(2)}">
  <title>Black Chapel Studios — Core Plan Outline ${ski.length}mm</title>
  <desc>Top-down core outline narrowed by ${coreInset}mm/side for sidewall compensation${(ski.vcutTip || ski.vcutTail) ? "; tip/tail terminate in a V-cut fill" : ""}. Orientation: ${O}.</desc>
${body}
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
  const O = skiOrientation(ski);
  const Q = (a, t) => orientPt(a, t, O);  // a = along-length, t = height

  const layers = [
    { name: 'ROCKER_PROFILE', color: 3 },
    { name: 'BASELINE', color: 7 },
    { name: 'REFERENCE', color: 1 },
    { name: 'TEXT', color: 2 },
  ];
  let dxf = dxfStart(layers);

  // Rocker curve as an open polyline (it's a line, not a closed shape)
  dxf += dxfLwpolyline('ROCKER_PROFILE', pts.map(p => Q(p.x, p.y)), false);

  // Baseline (snow line)
  const bl0 = Q(0, 0), bl1 = Q(ski.length, 0);
  dxf += dxfLine('BASELINE', bl0.x, bl0.y, bl1.x, bl1.y);

  // Reference lines at tail contact, waist, tip contact; horizontal labels.
  marks.forEach(m => {
    const a = Q(m.skiY, -3), b = Q(m.skiY, maxY + 4), lbl = Q(m.skiY + 2, maxY + 5);
    dxf += dxfLine('REFERENCE', a.x, a.y, b.x, b.y);
    dxf += dxfText('TEXT', lbl.x, lbl.y, 6, m.label);
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
  const O = skiOrientation(ski);
  const fL = Math.max(ski.length / 200, 7);
  const M = (a, t) => orientPt(a, t, O);  // math space, Y up

  const curve = pts.map(p => M(p.x, p.y));
  const corners = [M(0, -3), M(L, -3), M(0, maxY + 5)];
  const allPts = curve.concat(corners);
  const gMinX = Math.min(...allPts.map(p => p.x)), gMaxX = Math.max(...allPts.map(p => p.x));
  const gMinY = Math.min(...allPts.map(p => p.y)), gMaxY = Math.max(...allPts.map(p => p.y));
  const geomW = gMaxX - gMinX, geomH = gMaxY - gMinY;
  const sx = x => (x - gMinX + pad);
  const sy = y => (gMaxY - y + pad);

  const labelCharW = fL * 0.62;
  const labelRightExtent = Math.max(0, ...getRegistrationMarks(ski).map(m => {
    const lp = M(m.skiY + 2, maxY);
    return sx(lp.x) + m.label.length * labelCharW;
  }));
  const totalW = Math.max(pad + geomW + pad, labelRightExtent + pad);
  const totalH = pad + geomH + pad;

  const pathD = curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ');
  const marks = getRegistrationMarks(ski);
  const regLines = marks.map(m => {
    const a = M(m.skiY, -2), b = M(m.skiY, maxY + 2), lbl = M(m.skiY + 2, maxY);
    return `<line x1="${sx(a.x).toFixed(2)}" y1="${sy(a.y).toFixed(2)}" x2="${sx(b.x).toFixed(2)}" y2="${sy(b.y).toFixed(2)}" stroke="#aa0000" stroke-width="${(fL*0.06).toFixed(2)}" stroke-dasharray="3,2"/>
    ${hersheyPath(m.label, sx(lbl.x), sy(lbl.y) - fL*0.4, fL, {color:'#aa0000'})}`;
  }).join('\n    ');
  const b0 = M(0, 0), b1 = M(L, 0);

  const body = `  <g id="rocker"><path d="${pathD}" fill="none" stroke="#000" stroke-width="0.6"/></g>
  <g id="baseline"><line x1="${sx(b0.x).toFixed(2)}" y1="${sy(b0.y).toFixed(2)}" x2="${sx(b1.x).toFixed(2)}" y2="${sy(b1.y).toFixed(2)}" stroke="#888" stroke-width="0.3"/></g>
  <g id="registration">${regLines}</g>`;
  const bb = svgBBox(body);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bb.W.toFixed(1)}mm" height="${bb.H.toFixed(1)}mm" viewBox="${bb.minX.toFixed(1)} ${bb.minY.toFixed(1)} ${bb.W.toFixed(1)} ${bb.H.toFixed(1)}">
  <title>Black Chapel Studios — Rocker/Mold Profile ${ski.length}mm</title>
  <desc>Side-view rocker line for press mold. Orientation: ${O}. Units: mm, true 1:1 scale.</desc>
${body}
</svg>`;
  downloadFile(svg, `bcs-ski-rocker-${ski.length}mm.svg`, "image/svg+xml");
}

// Apply the tip/tail V-cut to a core outline expressed as right/left rails in X=length space
// (arrays of {x,y}, x along ski 0→L, y = ±half-width). Where a V-cut is enabled, the core is
// TERMINATED in an isosceles V: base edge-to-edge at the contact, apex on the centerline extending
// `ext` mm toward that end. Points beyond the contact are dropped (that triangular region is fill).
// Returns a single closed loop of points. `coreInset` matches how the rails were built.
function applyVCutToCore(ski) {
  const L = ski.length;
  const coreInset = ski.coreInset !== undefined ? ski.coreInset : 0;
  const tailContactX = ski.tailLength;
  const tipContactX = L - ski.tipLength;
  const vTip = !!ski.vcutTip, vTail = !!ski.vcutTail;
  // POSITIVE extension = outward spear (apex past the contact); NEGATIVE = inward notch (apex toward
  // the center). Clamp to a safe range so the outline can't self-intersect.
  const effHalf = Math.max(1, (tipContactX - tailContactX) / 2);
  const tipExt = vTip ? Math.max(-effHalf * 0.9, Math.min(ski.tipLength, ski.vcutTipExt || 0)) : 0;
  const tailExt = vTail ? Math.max(-effHalf * 0.9, Math.min(ski.tailLength, ski.vcutTailExt || 0)) : 0;
  const hwAt = (xmm) => Math.max(1.0, getWidthAtPos(ski, xmm / L) / 2 - coreInset);

  // Sample the core rails only within the (possibly clipped) X range.
  const xStart = vTail ? tailContactX : 0;
  const xEnd = vTip ? tipContactX : L;
  const N = 200;
  const rightRail = [], leftRail = [];
  for (let i = 0; i <= N; i++) {
    const xmm = xStart + (xEnd - xStart) * (i / N);
    const hw = hwAt(xmm);
    rightRail.push({ x: xmm, y: hw });
    leftRail.push({ x: xmm, y: -hw });
  }

  // Build the closed loop. Order: right rail (tail→tip), tip cap, left rail (tip→tail), tail cap.
  const loop = [];
  // Right rail tail→tip
  rightRail.forEach(p => loop.push(p));
  // Tip end
  if (vTip) {
    // from right contact → apex (pointing toward tip) → left contact
    loop.push({ x: tipContactX + tipExt, y: 0 });
  }
  // Left rail tip→tail (reverse)
  for (let i = leftRail.length - 1; i >= 0; i--) loop.push(leftRail[i]);
  // Tail end
  if (vTail) {
    loop.push({ x: tailContactX - tailExt, y: 0 });
  }
  return loop;
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

  // Core outline (core-inset), X=length. When a tip/tail V-cut is enabled the core terminates in a V.
  const N = 200;
  const coreR = [], coreL = [];
  for (let i = 0; i <= N; i++) {
    const pos = i / N, xmm = pos * L;
    const hw = Math.max(1.0, getWidthAtPos(ski, pos) / 2 - coreInset);
    coreR.push({ x: xmm, y: hw });
    coreL.push({ x: xmm, y: -hw });
  }
  const coreLoopPts = (ski.vcutTip || ski.vcutTail)
    ? applyVCutToCore(ski)
    : coreR.concat(coreL.slice().reverse());

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
    { name: 'INSERTS', color: 4 },        // binding inserts, snowboard mode (cyan)
  ];
  let dxf = dxfStart(layers);

  // Orientation: the layout is composed horizontally (length on X, bands stacked in Y). R rotates the
  // whole composition — identity for horizontal, 90° CCW for vertical (length runs up the page). Text
  // anchors rotate but glyphs stay horizontal.
  const O = skiOrientation(ski);
  const R = p => O === "horizontal" ? { x: p.x, y: p.y } : { x: -p.y, y: p.x };
  const poly = (layer, pts, closed) => dxfLwpolyline(layer, pts.map(R), closed);
  const line = (layer, a, b) => { const A = R(a), B = R(b); return dxfLine(layer, A.x, A.y, B.x, B.y); };
  const text = (layer, p, h, s) => { const P = R(p); return dxfText(layer, P.x, P.y, h, s); };

  // ── BASE BAND ──
  // Always draw the full outer profile (no edge offset) so the true ski shape is present.
  dxf += poly('FULL_PROFILE', shift(g.baseLoopPts, baseYoff), true);
  // Plus the edge offset / base cut line on its own layer.
  if (g.baseEdge) dxf += poly('BASE_EDGE', shift(g.baseEdge, baseYoff), true);
  dxf += line('CENTERLINE', { x: 0, y: baseYoff }, { x: L, y: baseYoff });

  // ── CORE BAND ──
  dxf += poly('CORE_OUTLINE', shift(g.coreLoopPts, coreYoff), true);
  dxf += line('CENTERLINE', { x: 0, y: coreYoff }, { x: L, y: coreYoff });

  // ── CORE SIDE BAND ──
  dxf += poly('CORE_SIDE', shift(g.sideLoop, sideYoff), true);

  // ── SHARED REFERENCE LINES ── at tail/waist/tip contact, spanning all three bands for lofting.
  // Contact labels use LEFT-aligned text (many CAD importers, incl. Vectric, ignore DXF text
  // justification), placed so growing rightward lands in open space clear of every shape vector.
  const topY = baseYoff + halfBaseW + 6;
  const botY = sideYoff - 6;
  const lblH = 9;
  const refGap = lblH;
  const contactW = (str) => str.length * 6 * 1.0;  // generous width est (h=6) for table clearance
  let maxLabelX = -Infinity;
  g.marks.forEach(m => {
    dxf += line('REFERENCE', { x: m.skiY, y: botY }, { x: m.skiY, y: topY });
    const a = R({ x: m.skiY, y: botY }), b = R({ x: m.skiY, y: topY });
    if (O === "vertical") {
      // The (horizontal) line's RIGHT end is `a`. Place the label just past it, growing right into
      // the open margin — never crosses the line or any band regardless of the CAD font width.
      const lx = a.x + refGap;
      dxf += dxfText('TEXT', lx, a.y - 3, 6, m.label);
      maxLabelX = Math.max(maxLabelX, lx + contactW(m.label));
    } else {
      // The (vertical) line's TOP end is `b`. Label sits above it, growing right, clear of the band.
      dxf += dxfText('TEXT', b.x + 2, b.y + refGap, 6, m.label);
    }
  });

  // ── VIEW LABELS ── short identifiers (BASE / CORE / CORE SIDE) in BOTH orientations, above each
  // band/strip in the clear margin (short text never reaches the first reference line). Full spec
  // detail is in the measurements table. ASCII only.
  const bands = [
    { short: "BASE", cy: baseYoff, half: halfBaseW },
    { short: "CORE", cy: coreYoff, half: halfCoreW },
    { short: "CORE SIDE", cy: sideYoff + maxThick / 2, half: maxThick / 2 },
  ];
  bands.forEach(b => {
    if (O === "horizontal") {
      dxf += dxfText('LABEL', 0, b.cy + b.half + lblH * 1.6, lblH, b.short);
    } else {
      dxf += dxfText('LABEL', -(b.cy + b.half), L + lblH * 2, lblH, b.short);
    }
  });

  // ── BINDING INSERTS ── snowboard mode; compose the combined swap then the orientation rotation.
  dxf += buildInsertsDXF(ski, (x, y) => R({ x: y, y: x + baseYoff }));

  // ── MEASUREMENTS TABLE ── placed to the right of the rotated composition, text horizontal.
  const allGeom = [
    ...shift(g.baseLoopPts, baseYoff), ...shift(g.coreLoopPts, coreYoff), ...shift(g.sideLoop, sideYoff),
    { x: 0, y: topY }, { x: L, y: botY },
  ].map(R);
  const tblAnchorX = Math.max(Math.max(...allGeom.map(p => p.x)), maxLabelX) + 40;
  const tblAnchorY = Math.max(...allGeom.map(p => p.y));
  dxf += buildMeasurementsTable(ski, tblAnchorX, tblAnchorY, { coreInset: g.coreInset });

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
  const edgeWrap = ski.edgeWrap || "full";

  // Build in the SAME math space (Y up) as the combined DXF so both formats match, then rotate for
  // orientation, then flip once into SVG screen space. Band Y-offsets mirror the DXF exactly.
  const baseYoff = 0;
  const coreYoff = -(halfBaseW + gap + halfCoreW);
  const sideYoff = coreYoff - (halfCoreW + gap + maxThick);
  const shift = (pts, dy) => pts.map(p => ({ x: p.x, y: p.y + dy }));
  const O = skiOrientation(ski);
  const R = p => O === "horizontal" ? { x: p.x, y: p.y } : { x: -p.y, y: p.x };

  const baseLoop = shift(g.baseLoopPts, baseYoff).map(R);
  const baseEdge = g.baseEdge ? shift(g.baseEdge, baseYoff).map(R) : null;
  const coreLoop = shift(g.coreLoopPts, coreYoff).map(R);
  const sideLoop = shift(g.sideLoop, sideYoff).map(R);

  const topY = baseYoff + halfBaseW + 6, botY = sideYoff - 6;
  const edgeWrapC = ski.edgeWrap || "full";
  const baseLbl = edgeWrapC === "contact" ? "BASE: full profile + contact edge cut" : "BASE: full profile + edge offset";

  // Text sized to the drawing so it's legible at fit-to-view.
  const fL = Math.max(ski.length / 200, 7);
  const fTbl = Math.max(ski.length / 240, 6);
  const charW = fL * 0.62;

  // Contact labels: placed BEYOND the far end of each reference line (in the clear margin) and
  // anchored to grow away from the geometry, so no shape vector runs through the text.
  const refGap = fL * 0.8;
  const refData = g.marks.map(m => {
    const a = R({ x: m.skiY, y: botY }), b = R({ x: m.skiY, y: topY });
    // b is the base-band end of the line. In vertical it's the left end (label grows left);
    // in horizontal it's the top end (label sits above, growing right).
    const lbl = O === "vertical"
      ? { x: b.x - refGap, y: b.y, anchor: 'end' }
      : { x: b.x, y: b.y + refGap + fL, anchor: 'start' };
    return { a, b, lbl, label: m.label };
  });

  // View labels: short identifiers (BASE / CORE / CORE SIDE) in BOTH orientations, placed above each
  // band/strip in the clear margin. Short text never reaches the first reference line. Full spec
  // detail lives in the measurements table.
  const bandsV = [
    { short: "BASE", cy: baseYoff, half: halfBaseW },
    { short: "CORE", cy: coreYoff, half: halfCoreW },
    { short: "CORE SIDE", cy: sideYoff + maxThick / 2, half: maxThick / 2 },
  ];
  const lblData = bandsV.map(b => O === "horizontal"
    ? { x: 0, y: b.cy + b.half + fL * 1.4, t: b.short }
    : { x: -(b.cy + b.half), y: L + fL * 1.6, t: b.short });

  // Bounds over all geometry + anchors + label text extents.
  const lblExtents = lblData.map(l => ({ x: l.x + hersheyWidth(l.t, fL * 1.1), y: l.y - fL }));
  const refLblExtents = refData.flatMap(r => {
    const w = hersheyWidth(r.label, fL);
    const x0 = r.lbl.anchor === 'end' ? r.lbl.x - w : r.lbl.x;
    return [{ x: x0, y: r.lbl.y }, { x: x0 + w, y: r.lbl.y - fL }];
  });
  const allPts = [...baseLoop, ...(baseEdge || []), ...coreLoop, ...sideLoop,
    ...refData.flatMap(r => [r.a, r.b]), ...refLblExtents, ...lblData.map(l => ({ x: l.x, y: l.y })), ...lblExtents];
  const gMinX = Math.min(...allPts.map(p => p.x)), gMaxX = Math.max(...allPts.map(p => p.x));
  const gMinY = Math.min(...allPts.map(p => p.y)), gMaxY = Math.max(...allPts.map(p => p.y));
  const geomW = gMaxX - gMinX, geomH = gMaxY - gMinY;
  const sx = x => (x - gMinX + pad);
  const sy = y => (gMaxY - y + pad);

  // Table sits to the right of everything, so nothing overlaps it.
  const tblGap = fL;
  const tblX = pad + geomW + tblGap;
  const tblTopY = pad + 6;
  const tbl = buildMeasurementsTableSVG(ski, tblX, tblTopY, { coreInset: g.coreInset }, fTbl);
  const totalW = tblX + tbl.width + pad;
  const totalH = pad + Math.max(geomH, tbl.height) + pad;

  const pathFrom = (pts, close) => pts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`
  ).join(' ') + (close ? ' Z' : '');

  const baseGroup =
    `<path d="${pathFrom(baseLoop, true)}" fill="none" stroke="#000" stroke-width="0.6"/>` +
    (baseEdge ? `<path d="${pathFrom(baseEdge, true)}" fill="none" stroke="#005000" stroke-width="0.5" ${edgeWrapC === "contact" ? "" : 'stroke-dasharray="2,1.5"'}/>` : '');
  const coreGroup = `<path d="${pathFrom(coreLoop, true)}" fill="none" stroke="#C8935A" stroke-width="0.6"/>`;
  const sideGroup = `<path d="${pathFrom(sideLoop, true)}" fill="rgba(200,147,90,0.15)" stroke="#0066cc" stroke-width="0.6"/>`;

  const refLines = refData.map(r =>
    `<line x1="${sx(r.a.x).toFixed(2)}" y1="${sy(r.a.y).toFixed(2)}" x2="${sx(r.b.x).toFixed(2)}" y2="${sy(r.b.y).toFixed(2)}" stroke="#aa0000" stroke-width="${(fL*0.06).toFixed(2)}" stroke-dasharray="4,3"/>
    ${hersheyPath(r.label, sx(r.lbl.x), sy(r.lbl.y), fL, {color:'#aa0000', anchor: r.lbl.anchor})}`
  ).join('\n    ');

  const labels = lblData.map(l =>
    hersheyPath(l.t, sx(l.x), sy(l.y), fL*1.1, {color:'#2a8a8a', strokeWidth: fL*0.08})
  ).join('\n    ');

  const body = `  <g id="base">${baseGroup}</g>
  <g id="core">${coreGroup}</g>
  <g id="core_side">${sideGroup}</g>
  <g id="reference">${refLines}</g>
  <g id="labels">${labels}</g>
  <g id="table">${tbl.svg}</g>`;
  const bb = svgBBox(body);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bb.W.toFixed(1)}mm" height="${bb.H.toFixed(1)}mm" viewBox="${bb.minX.toFixed(1)} ${bb.minY.toFixed(1)} ${bb.W.toFixed(1)} ${bb.H.toFixed(1)}">
  <title>Black Chapel Studios — Combined Views ${ski.length}mm</title>
  <desc>Full profile, base edge, core outline, and core side profile — aligned on the length axis for lofting. Orientation: ${O}. Units: mm, 1:1.</desc>
${body}
</svg>`;
  downloadFile(svg, `bcs-ski-combined-${ski.length}mm.svg`, "image/svg+xml");
}

// ══════════════ TOPSHEET OVERLAY ══════════════
// Draws a topsheet artwork image into a screen-space box {minX,minY,maxX,maxY}, honoring fit mode
// ("cover" | "contain" | "stretch"), a scale multiplier, offsets (as fractions of the box size),
// rotation (degrees) and opacity. The CALLER is responsible for clipping the canvas to the ski
// outline first, so the artwork only shows inside the silhouette. Shared by the live PlanView
// preview and the standalone PNG render so both look identical.
function drawTopsheetImage(ctx, img, box, ts) {
  const bw = box.maxX - box.minX, bh = box.maxY - box.minY;
  if (!img || bw <= 0 || bh <= 0) return;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const arImg = iw / ih, arBox = bw / bh;
  let dw, dh;
  if (ts.fit === "stretch") {
    dw = bw; dh = bh;                                   // fill box exactly, distort to match
  } else {
    const cover = ts.fit !== "contain";                // default = cover (fill + crop)
    const fillWidth = cover ? (arImg < arBox) : (arImg > arBox);
    if (fillWidth) { dw = bw; dh = bw / arImg; } else { dh = bh; dw = bh * arImg; }
  }
  const scale = ts.scale || 1;
  dw *= scale; dh *= scale;
  const cx = (box.minX + box.maxX) / 2 + (ts.offsetX || 0) * bw;
  const cy = (box.minY + box.maxY) / 2 + (ts.offsetY || 0) * bh;
  ctx.save();
  ctx.globalAlpha = ts.opacity != null ? ts.opacity : 1;
  ctx.translate(cx, cy);
  if (ts.rotation) ctx.rotate(ts.rotation * Math.PI / 180);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

// Offsets a closed polygon OUTWARD by `dist` (mm) along per-vertex normals — used for the print
// bleed line around the topsheet template.
function offsetPolygonOutward(ptsIn, dist) {
  const pts = [];
  for (let i = 0; i < ptsIn.length; i++) {
    const p = ptsIn[i], q = ptsIn[(i + 1) % ptsIn.length];
    if (Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) pts.push({ x: p.x, y: p.y });
  }
  const n = pts.length;
  if (n < 3 || dist <= 0) return pts.slice();
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a.x * b.y - b.x * a.y; }
  const ccw = area > 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], curr = pts[i], next = pts[(i + 1) % n];
    const e1x = curr.x - prev.x, e1y = curr.y - prev.y, l1 = Math.hypot(e1x, e1y) || 1;
    const e2x = next.x - curr.x, e2y = next.y - curr.y, l2 = Math.hypot(e2x, e2y) || 1;
    // Outward normal: for a CCW polygon the RIGHT normal (dy,-dx) points outward.
    const n1x = ccw ? e1y / l1 : -e1y / l1, n1y = ccw ? -e1x / l1 : e1x / l1;
    const n2x = ccw ? e2y / l2 : -e2y / l2, n2y = ccw ? -e2x / l2 : e2x / l2;
    let bx = n1x + n2x, by = n1y + n2y; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    const cosHalf = Math.max(0.35, bx * n1x + by * n1y);
    const off = dist / cosHalf;
    out.push({ x: curr.x + bx * off, y: curr.y + by * off });
  }
  return out;
}

// Builds a 1:1 (mm) print-ready topsheet template SVG: solid CUT line = the ski outline, dashed
// BLEED line offset outward, corner crop marks, centerline + length/waist dimensions, and (if art is
// supplied) the artwork embedded and clipped to the bleed so a print shop gets a correctly-sized,
// full-bleed file. SVG <text> is fine here — print software (Illustrator/Corel/RIP) renders it.
function buildTopsheetTemplateSVG(ski, topsheet, imgDims, bleedMM = 8, pair = false) {
  const outline = getFullOutlinePoints(ski);
  const bleedOutline = offsetPolygonOutward(outline, bleedMM);
  const bleedMaxLat = Math.max(1, ...bleedOutline.map(p => Math.abs(p.x)));
  const gap = 24;                                     // mm between the two skis
  const bandH = 2 * bleedMaxLat;
  const yA = bleedMaxLat;                              // ski A lateral center
  const yB = yA + bandH + gap;                         // ski B lateral center (below A)
  const TA = p => ({ x: p.y, y: yA + p.x });           // length horizontal
  const TB = p => ({ x: p.y, y: yB - p.x });           // mirror partner
  const cutA = outline.map(TA), bleedA = bleedOutline.map(TA);
  const cutB = outline.map(TB), bleedB = bleedOutline.map(TB);
  const pathOf = pts => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") + " Z";

  // Combined bounding box (both bleeds in pair mode) — the art is fit to THIS so one image spans the set.
  const allBleed = pair ? bleedA.concat(bleedB) : bleedA;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  allBleed.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; });
  const margin = 16;
  const vbX = minX - margin, vbY = minY - margin, vbW = (maxX - minX) + margin * 2, vbH = (maxY - minY) + margin * 2;

  // Artwork placement (identical math to the on-screen preview, fit to the combined box). One <image>
  // geometry, clipped separately to each ski's bleed, so the picture reads continuously across the pair.
  let imgSVG = "";
  if (topsheet && topsheet.src && imgDims && imgDims.w && imgDims.h) {
    const bw = maxX - minX, bh = maxY - minY, arImg = imgDims.w / imgDims.h, arBox = bw / bh;
    let dw, dh;
    if (topsheet.fit === "stretch") { dw = bw; dh = bh; }
    else { const cover = topsheet.fit !== "contain"; const fillW = cover ? arImg < arBox : arImg > arBox; if (fillW) { dw = bw; dh = bw / arImg; } else { dh = bh; dw = bh * arImg; } }
    dw *= (topsheet.scale || 1); dh *= (topsheet.scale || 1);
    const cx = (minX + maxX) / 2 + (topsheet.offsetX || 0) * bw;
    const cy = (minY + maxY) / 2 + (topsheet.offsetY || 0) * bh;
    const rot = topsheet.rotation || 0;
    const op = topsheet.opacity != null ? topsheet.opacity : 1;
    const image = `<image href="${topsheet.src}" x="${(cx - dw / 2).toFixed(2)}" y="${(cy - dh / 2).toFixed(2)}" width="${dw.toFixed(2)}" height="${dh.toFixed(2)}" preserveAspectRatio="none" opacity="${op}" transform="rotate(${rot} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`;
    imgSVG = `<g clip-path="url(#bleedclipA)">${image}</g>` + (pair ? `<g clip-path="url(#bleedclipB)">${image}</g>` : "");
  }

  const ml = 10;
  const corner = (x, y, sx, sy) => `<path d="M${(x + sx * 2).toFixed(1)},${y.toFixed(1)} L${(x + sx * (2 + ml)).toFixed(1)},${y.toFixed(1)} M${x.toFixed(1)},${(y + sy * 2).toFixed(1)} L${x.toFixed(1)},${(y + sy * (2 + ml)).toFixed(1)}" stroke="#000" stroke-width="0.3" fill="none"/>`;
  const crop = [corner(minX, minY, -1, -1), corner(maxX, minY, 1, -1), corner(minX, maxY, -1, 1), corner(maxX, maxY, 1, 1)].join("");

  const dims = `${ski.tipWidth}-${ski.waistWidth}-${ski.tailWidth} \u00B7 ${ski.length}mm`;
  const fs = Math.max(6, ski.length / 220);
  const clips = `<clipPath id="bleedclipA"><path d="${pathOf(bleedA)}"/></clipPath>` + (pair ? `<clipPath id="bleedclipB"><path d="${pathOf(bleedB)}"/></clipPath>` : "");
  const cutPaths = `<path d="${pathOf(cutA)}" fill="none" stroke="#000" stroke-width="0.5"/>` + (pair ? `<path d="${pathOf(cutB)}" fill="none" stroke="#000" stroke-width="0.5"/>` : "");
  const bleedPaths = `<path d="${pathOf(bleedA)}" fill="none" stroke="#c8935a" stroke-width="0.4" stroke-dasharray="4,2"/>` + (pair ? `<path d="${pathOf(bleedB)}" fill="none" stroke="#c8935a" stroke-width="0.4" stroke-dasharray="4,2"/>` : "");
  const centerlines = `<line x1="${minX.toFixed(1)}" y1="${yA.toFixed(1)}" x2="${maxX.toFixed(1)}" y2="${yA.toFixed(1)}" stroke="#000" stroke-width="0.2" stroke-dasharray="6,4"/>` + (pair ? `<line x1="${minX.toFixed(1)}" y1="${yB.toFixed(1)}" x2="${maxX.toFixed(1)}" y2="${yB.toFixed(1)}" stroke="#000" stroke-width="0.2" stroke-dasharray="6,4"/>` : "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${vbW.toFixed(1)}mm" height="${vbH.toFixed(1)}mm" viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}">
  <title>Black Chapel Studios \u2014 Topsheet Print Template ${ski.length}mm${pair ? " (pair)" : ""}</title>
  <desc>1:1 mm scale. Solid = cut line (ski outline). Dashed = ${bleedMM}mm bleed. Print full-bleed, trim on the solid line.</desc>
  <defs>${clips}</defs>
  <g id="artwork">${imgSVG}</g>
  <g id="bleed">${bleedPaths}</g>
  <g id="cut">${cutPaths}</g>
  <g id="centerline">${centerlines}</g>
  <g id="cropmarks">${crop}</g>
  <g id="labels" fill="#000" font-family="monospace">
    <text x="${minX.toFixed(1)}" y="${(minY - 5).toFixed(1)}" font-size="${fs.toFixed(1)}">CUT LINE (solid) \u00B7 BLEED ${bleedMM}mm (dashed) \u00B7 1:1 mm${pair ? " \u00B7 PAIR" : ""}</text>
    <text x="${minX.toFixed(1)}" y="${(maxY + fs + 5).toFixed(1)}" font-size="${fs.toFixed(1)}">${(ski.designName || "Topsheet")} \u00B7 ${dims}</text>
  </g>
</svg>`;
}


// Layout:
//   ROW 1 (top, ~38% of height): Full ski plan at TRUE aspect ratio. Long and thin.
//                                Only NODES are draggable here (no handle clutter).
//   ROW 2 (bottom, ~62% of height): Two side-by-side zoom panels — tail (left) | tip (right).
//                                   Lots of headroom so handle dragging doesn't hit the edge.
//                                   This is where bezier handles are edited.
// Builds plain vertex data for a 3D ski mesh (top surface = topsheet-mapped, bottom = base, walls =
// edge). Kept dependency-free and pure so it can be unit-tested; the 3D modal uploads these arrays
// into THREE BufferGeometries. Units are scaled by S (mm -> ~cm) for numerical comfort.
function buildSki3DGeometry(ski, pair) {
  const L = ski.length, TL = ski.tipLength, TAIL = ski.tailLength, N = 160, S = 0.01;
  const halfW = (pos) => {
    const xmm = pos * L;
    let base = getWidthAtPos(ski, pos) / 2;
    if (xmm >= L - TL) { const u = TL > 0 ? (xmm - (L - TL)) / TL : 0; base = (ski.tipWidth / 2) * Math.sqrt(Math.max(0, 1 - u * u)); }
    else if (xmm <= TAIL) { const u = TAIL > 0 ? (TAIL - xmm) / TAIL : 0; base = (ski.tailWidth / 2) * Math.sqrt(Math.max(0, 1 - u * u)); }
    return Math.max(0, base);
  };
  const thick = (pos) => (getCoreThickAt(ski.coreProfile, pos) + 2);
  const st = [];
  for (let i = 0; i <= N; i++) {
    const pos = i / N, xmm = pos * L, y = (xmm - L / 2) * S;
    const hw = halfW(pos) * S, bz = sideProfileHeightAt(ski, xmm) * S, tz = bz + thick(pos) * S;
    st.push({ pos, y, hw, bz, tz });
  }
  const maxHW = Math.max(0.001, ...st.map(s => s.hw));
  const gap = maxHW * 0.4;
  const cOff = pair ? (maxHW + gap / 2) : 0;
  // The topsheet UV spans the WHOLE pair across its combined width, so one image flows continuously
  // over both skis (not doubled/mirrored). u = along length, v = lateral position across the pair.
  const combMin = -(cOff + maxHW), combSpan = 2 * (cOff + maxHW) || 1;
  const topPos = [], topUV = [], topIdx = [], botPos = [], botIdx = [], wallPos = [], wallIdx = [];
  // sign: +1 normal, -1 mirrored (flips lateral so an asymmetric tip mirrors). off: lateral world offset.
  const emit = (sign, off) => {
    const xL = (s) => off + sign * (-s.hw), xR = (s) => off + sign * (s.hw);
    let b = topPos.length / 3;
    for (let i = 0; i <= N; i++) { const s = st[i]; const l = xL(s), r = xR(s); topPos.push(l, s.tz, s.y, r, s.tz, s.y); topUV.push(s.pos, (l - combMin) / combSpan, s.pos, (r - combMin) / combSpan); }
    for (let i = 0; i < N; i++) { const a = b + i * 2; topIdx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    b = botPos.length / 3;
    for (let i = 0; i <= N; i++) { const s = st[i]; botPos.push(xL(s), s.bz, s.y, xR(s), s.bz, s.y); }
    for (let i = 0; i < N; i++) { const a = b + i * 2; botIdx.push(a, a + 3, a + 1, a, a + 2, a + 3); }
    b = wallPos.length / 3;
    for (let i = 0; i <= N; i++) { const s = st[i]; wallPos.push(xL(s), s.tz, s.y, xL(s), s.bz, s.y); }
    for (let i = 0; i < N; i++) { const a = b + i * 2; wallIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    b = wallPos.length / 3;
    for (let i = 0; i <= N; i++) { const s = st[i]; wallPos.push(xR(s), s.tz, s.y, xR(s), s.bz, s.y); }
    for (let i = 0; i < N; i++) { const a = b + i * 2; wallIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  if (pair) { emit(1, -cOff); emit(-1, cOff); } else { emit(1, 0); }
  const len = L * S;
  return { topPos, topUV, topIdx, botPos, botIdx, wallPos, wallIdx, len, maxHW: cOff + maxHW };
}

// Builds a branded one-page "build card" spec sheet (fixed 1400x900 SVG) summarizing the design:
// silhouette + all key numbers + layup + flex + estimated core mass, in the Black Chapel palette.
// Ordered physical layer stack (top surface -> base) derived from the layup. Drives the cross-section
// diagram used in the Layers view and the build sheet.
function layupStack(ski) {
  const lu = ski.layup || {};
  const g = GLASS[lu.glass] || GLASS.triax23;
  const split = !!lu.fabricSplit;
  const gb = split ? (GLASS[lu.glassBot] || g) : g;
  const nGt = lu.glassLayers || 1, nGb = split ? (lu.glassBotLayers || 1) : nGt;
  const metal = METALS[lu.metal]; const hasMetal = metal && metal.E > 0;
  const carbon = CARBON[lu.carbon]; const hasCarbon = carbon && carbon.E > 0 && lu.carbon !== "none";
  const nC = lu.carbonLayers || 1;
  const wood = WOODS[lu.wood] || WOODS.poplar;
  const coreThick = (ski.coreProfile && ski.coreProfile.length) ? Math.max(...ski.coreProfile.map(p => p.thick || 0)) : 8;
  const isCarbon = k => typeof k === "string" && k.toLowerCase().includes("carbon");
  const isFlax = k => typeof k === "string" && k.toLowerCase().includes("flax");
  const fabRole = k => isCarbon(k) ? "fabricC" : (isFlax(k) ? "fabricF" : "fabric");
  const strRole = k => (typeof k === "string" && k.startsWith("glass")) ? "stringerG" : "stringerC";
  const S = [];
  S.push({ role: "topsheet", name: "Topsheet", thick: 0.5, count: 1 });
  S.push({ role: fabRole(lu.glass), name: g.name, thick: g.thick, count: nGt });
  if (hasMetal) S.push({ role: "metal", name: metal.name, thick: metal.thick, count: 1 });
  if (hasCarbon) S.push({ role: strRole(lu.carbon), name: carbon.name, thick: carbon.thick || 0.3, count: nC, width: carbon.width });
  S.push({ role: "core", name: (wood.name || "Wood") + " core", thick: coreThick, count: 1 });
  if (hasCarbon) S.push({ role: strRole(lu.carbon), name: carbon.name, thick: carbon.thick || 0.3, count: nC, width: carbon.width });
  if (hasMetal) S.push({ role: "metal", name: metal.name, thick: metal.thick, count: 1 });
  S.push({ role: fabRole(split ? lu.glassBot : lu.glass), name: gb.name, thick: gb.thick, count: nGb });
  S.push({ role: "base", name: "Base + steel edges", thick: 1.5, count: 1 });
  return S;
}

// Cross-section diagram of the layup — a stack of labelled bars, top surface at the top, base at the
// bottom. Returns { svg, height }. Coloured by role; width-limited UD stringers draw narrower & centred.
function buildLayerStackSVG(ski, opts) {
  const o = opts || {}, x = o.x || 0, y = o.y || 0, w = o.w || 520;
  const bone = "#ede6d8", dim = "#9b9388", border = "#37322c";
  const COL = {
    topsheet: { fill: "#2a2620", txt: dim }, fabric: { fill: "#c8935a", txt: "#141210" },
    fabricC: { fill: "#4b4742", txt: bone }, fabricF: { fill: "#8a9a5f", txt: "#141210" },
    metal: { fill: "#8f99a6", txt: "#141210" }, stringerC: { fill: "#e8552a", txt: "#141210" },
    stringerG: { fill: "#d8b48a", txt: "#141210" }, core: { fill: "#b0824e", txt: "#141210" },
    base: { fill: "#1c1a17", txt: dim },
  };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const S = layupStack(ski), gap = 3;
  const hOf = L => L.role === "core" ? Math.max(38, Math.min(62, 16 + L.thick * 4)) : Math.max(20, Math.min(34, 13 + L.thick * 7));
  let totalH = S.reduce((a, L) => a + hOf(L) + gap, 0) - gap;
  const scale = (o.maxH && totalH > o.maxH) ? o.maxH / totalH : 1;
  let cy = y, bars = "";
  for (const L of S) {
    const h = hOf(L) * scale, c = COL[L.role] || COL.fabric;
    const bw = w, bx = x;   // every layer spans full width so labels never clip
    bars += `<rect x="${bx.toFixed(1)}" y="${cy.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" fill="${c.fill}" stroke="${border}" stroke-width="0.8"/>`;
    if (L.count > 1) for (let k = 1; k < L.count; k++) { const ly = cy + h * k / L.count; bars += `<line x1="${bx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${(bx + bw).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${c.txt}" stroke-opacity="0.35" stroke-width="0.6"/>`; }
    if (h >= 13) {
      const fs = Math.min(17, Math.max(12, h * 0.6)).toFixed(0);
      bars += `<text x="${(bx + 10).toFixed(1)}" y="${(cy + h / 2 + 5).toFixed(1)}" font-size="${fs}" fill="${c.txt}" font-family="monospace" font-weight="bold">${esc(L.count > 1 ? `${L.name}  \u00D7${L.count}` : L.name)}</text>`;
      bars += `<text x="${(bx + bw - 10).toFixed(1)}" y="${(cy + h / 2 + 5).toFixed(1)}" font-size="13" fill="${c.txt}" font-family="monospace" text-anchor="end" opacity="0.85">${L.thick.toFixed(1)}mm${L.role === "core" ? " max" : ""}</text>`;
    }
    cy += h + gap * scale;
  }
  return { svg: `<g>${bars}</g>`, height: cy - y - gap * scale };
}

// ── Core CAM: core-thickness profiling + perimeter contour → Centroid-friendly G-code ──
// X = length, Y = width (lateral), Z = up. Heights are measured above the bed, then shifted to the
// chosen Z-zero reference (bed/table, or top of stock).
function _camCrossingsX(poly, yline) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a.y <= yline && b.y > yline) || (b.y <= yline && a.y > yline)) {
      const t = (yline - a.y) / (b.y - a.y); xs.push(a.x + t * (b.x - a.x));
    }
  }
  xs.sort((p, q) => p - q); return xs;
}
// Post-processor dialects. `decimals: null` = auto (4 for inch, 3 for mm). Overridable via postOverride.
const POST_PROFILES = {
  centroid: { name: "Centroid CNC12 / Avid", comment: ";", lineNum: false, tc: "tm6", end: ["M30"], ext: "nc", pct: false, decimals: null },
  grbl: { name: "GRBL / Shapeoko / X-Carve", comment: ";", lineNum: false, tc: "manual", end: ["M5", "M30"], ext: "nc", pct: false, decimals: null },
  mach: { name: "Mach3 / Mach4", comment: ";", lineNum: false, tc: "tm6", end: ["M30"], ext: "tap", pct: false, decimals: null },
  linuxcnc: { name: "LinuxCNC", comment: ";", lineNum: false, tc: "tm6", end: ["M2"], ext: "ngc", pct: false, decimals: null },
  fanuc: { name: "Fanuc / Haas", comment: "()", lineNum: true, tc: "tm6", end: ["M30"], ext: "nc", pct: true, decimals: null },
};

// Arc fitting: collapse runs of linear G1 moves that lie on a common circle into G2/G3 arcs.
function _circleFrom(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - ux, a.y - uy);
  if (!isFinite(r) || r > 1e5 || r < 1e-3) return null;
  return { x: ux, y: uy, r };
}
function _allWithin(pts, i, j, c, tol) { for (let k = i; k <= j; k++) if (Math.abs(Math.hypot(pts[k].x - c.x, pts[k].y - c.y) - c.r) > tol) return false; return true; }
function arcFitGcode(gcode, tol, dec, lineNum) {
  const fmt = n => (Math.abs(n) < 1e-9 ? "0" : n.toFixed(dec));
  const src = gcode.split("\n").map(l => l.replace(/^N\d+\s+/, ""));
  const out = []; let cx = 0, cy = 0, cz = 0, run = null;
  const num = (l, a) => { const m = l.match(new RegExp(a + "(-?[0-9.]+)")); return m ? parseFloat(m[1]) : null; };
  const emitRun = () => {
    if (!run) return; const pts = run.pts, F = run.f; let first = true;
    if (pts.length < 4) { for (let k = 1; k < pts.length; k++) { out.push(`G1 X${fmt(pts[k].x)} Y${fmt(pts[k].y)}${first && F != null ? " F" + fmt(F) : ""}`); first = false; } run = null; return; }
    let i = 0;
    while (i < pts.length - 1) {
      let best = -1, bestC = null, bestCW = false, j = i + 2;
      while (j < pts.length) { const c = _circleFrom(pts[i], pts[(i + j) >> 1], pts[j]); if (c && _allWithin(pts, i, j, c, tol)) { best = j; bestC = c; bestCW = ((pts[i + 1].x - pts[i].x) * (c.y - pts[i].y) - (pts[i + 1].y - pts[i].y) * (c.x - pts[i].x)) < 0; j++; } else break; }
      if (best > i + 2 && bestC) { const e = pts[best]; out.push(`${bestCW ? "G2" : "G3"} X${fmt(e.x)} Y${fmt(e.y)} I${fmt(bestC.x - pts[i].x)} J${fmt(bestC.y - pts[i].y)}${first && F != null ? " F" + fmt(F) : ""}`); first = false; i = best; }
      else { out.push(`G1 X${fmt(pts[i + 1].x)} Y${fmt(pts[i + 1].y)}${first && F != null ? " F" + fmt(F) : ""}`); first = false; i++; }
    }
    run = null;
  };
  for (const l of src) {
    const X = num(l, "X"), Y = num(l, "Y"), Z = num(l, "Z"), F = num(l, "F");
    if (/^G1\b/.test(l) && X != null && Y != null && (Z == null || Math.abs(Z - cz) < 1e-6)) { if (!run) run = { f: null, pts: [{ x: cx, y: cy }] }; if (F != null) run.f = F; run.pts.push({ x: X, y: Y }); cx = X; cy = Y; continue; }
    emitRun(); out.push(l); if (X != null) cx = X; if (Y != null) cy = Y; if (Z != null) cz = Z;
  }
  emitRun();
  if (lineNum) { let n = 0; return out.map(l => (l.trim() === "" || /^[%(;]/.test(l)) ? l : "N" + (n += 10) + " " + l).join("\n"); }
  return out.join("\n");
}

function buildCoreCAM(ski, opt) {
  const o = Object.assign({ units: "mm", toolDia: 12.7, feed: 2500, plunge: 800, spindle: 18000,
    stepdown: 3, stepover: 6, safeZ: 6, stockThick: 13, zZero: "bed", doProfile: true, doPerimeter: true,
    perimeterSide: "outside", cutThrough: 0.5, tabN: 4, tabLen: 8, tabHeight: 2, origin: "corner",
    profPattern: "zigzag", profDir: "+", sidewallStock: 1.5, perimDir: "conventional", spindleCW: true,
    rampEntry: true, rampLen: 12, sidewallEngage: "conventional", toolNum: 1, heightMode: "thickness", moldMargin: 15, slatHoleDia: 6.6, slatHoleToolNum: 5, boreDia: 7, boreDepth: 9, boreHelix: true, postKey: "centroid", postOverride: null, partAxis: "y", offsetX: 0, offsetY: 0, moldInvert: false, roughing: false, roughToolNum: 2, roughToolDia: 12.7, roughStepover: 8, roughStepdown: 4, finishAllowance: 1, arcOut: false, dragKnife: false, bladeOffset: 1, dragLeadIn: 12, dragLeadIn: 12, pocketCenterX: 0.5, pocketCenterY: 0, pocketL: 300, pocketW: 60, pocketDepth: 6 }, opt || {});
  const inch = o.units === "inch", uL = inch ? 25.4 : 1;
  // User-entered lengths/feeds are in the SELECTED unit; convert to mm so all geometry math stays metric,
  // then convert back on output. This makes an inch program come out in real inches and inch/min (IPM).
  const disp = {};
  for (const k of ["toolDia", "stockThick", "stockL", "stockW", "safeZ", "stepover", "stepdown", "cutThrough", "tabHeight", "tabLen", "rampLen", "sidewallStock", "moldMargin", "slatHoleDia", "boreDia", "boreDepth", "offsetX", "offsetY", "pocketL", "pocketW", "pocketDepth", "roughToolDia", "roughStepover", "roughStepdown", "finishAllowance", "bladeOffset", "dragLeadIn", "feed", "plunge"]) { if (o[k] == null) continue; disp[k] = o[k]; o[k] = o[k] * uL; }
  const pst = Object.assign({}, POST_PROFILES[o.postKey] || POST_PROFILES.centroid, o.postOverride || {});
  const f = n => { const v = n / uL; const dp = pst.decimals != null ? pst.decimals : (inch ? 4 : 3); return v.toFixed(dp); };
  const uu = inch ? "in" : "mm", uf = inch ? "in/min" : "mm/min";
  const lerp = (a, b, t) => a + (b - a) * t;
  const L = ski.length, prof = ski.coreProfile;
  const core = applyVCutToCore(ski);
  let halfW = 0; for (const p of core) halfW = Math.max(halfW, Math.abs(p.y));
  let originShiftLen = 0, originShiftWid = 0, cOffX = 0, cOffY = 0;   // set after the part bbox is known (below)
  const zref = o.zZero === "bed" ? 0 : o.stockThick;
  const MZ = h => h - zref;
  const isBase = o.heightMode === "base";
  let baseMin = 0, baseMax = 0, baseSpan = 0;
  if (isBase) { let mn = 1e9, mx = -1e9; for (let xx = 0; xx <= L; xx += 4) { const h = sideProfileHeightAt(ski, xx); mn = Math.min(mn, h); mx = Math.max(mx, h); } baseMin = mn; baseMax = mx; baseSpan = mx - mn; }
  // Mold cavity: reference the surface to the top of the blank so the tallest point sits at the blank top
  // (no cut) and the rest carves down, leaving (stockThick - baseSpan) of solid base under the lowest point.
  const topH = isBase ? (x => { const b = sideProfileHeightAt(ski, x); return o.moldInvert ? (o.stockThick - (b - baseMin)) : (o.stockThick - (baseMax - b)); }) : (x => getCoreThickAt(prof, Math.min(1, Math.max(0, x / L))));
  const safeZ = MZ(o.stockThick + o.safeZ), R = o.toolDia / 2;
  const G = [];
  let lineNo = 10;
  const P = s => { if (s === "") { G.push(""); return; } if (pst.lineNum) { G.push("N" + lineNo + " " + s); lineNo += 10; } else G.push(s); };
  const PC = t => G.push(pst.comment === "()" ? "(" + String(t).replace(/[()]/g, "") + ")" : "; " + t);
  const PB = () => G.push("");
  const toolChange = n => { if (pst.tc === "manual") { P("M5"); PC("TOOL CHANGE -> T" + n + " - resume when ready"); P("M0"); } else if (pst.tc === "m6t") P("M6 T" + n); else P("T" + n + " M6"); };
  let cuts = 0, rapids = 0, cutDist = 0, minZ = 1e9, maxZ = -1e9;
  let minCX = 1e9, maxCX = -1e9, minCY = 1e9, maxCY = -1e9;   // cut extents → required stock size
  const tk = z => { minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };
  // Part orientation: which machine axis the ski LENGTH runs along. "y" (default) puts length on the
  // long bed axis (portrait). Emit swaps X/Y accordingly so the preview and the machine always agree.
  const emitXY = (x, y) => { const sx = x + originShiftLen, sy = y + originShiftWid; const p = o.partAxis === "x" ? [sx, sy] : [sy, sx]; return [p[0] + (o.offsetX || 0) + cOffX, p[1] + (o.offsetY || 0) + cOffY]; };
  const tkC = (mx, my) => { if (mx < minCX) minCX = mx; if (mx > maxCX) maxCX = mx; if (my < minCY) minCY = my; if (my > maxCY) maxCY = my; };
  const g0 = (x, y) => { const [mx, my] = emitXY(x, y); P(`G0 X${f(mx)} Y${f(my)}`); rapids++; };
  const g0z = z => { P(`G0 Z${f(z)}`); tk(z); };
  const g1 = (x, y, z, fr) => { const [mx, my] = emitXY(x, y); P(`G1 X${f(mx)} Y${f(my)} Z${f(z)} F${f(fr || o.feed)}`); cuts++; tk(z); tkC(mx, my); };
  const g1z = z => { P(`G1 Z${f(z)} F${f(o.plunge)}`); tk(z); };
  // ── Required stock/blank footprint (from geometry, so it can go in the header) ──
  let sx0 = 1e9, sx1 = -1e9, sy0 = 1e9, sy1 = -1e9;
  const accXY = pts => { for (const p of pts) { if (p.x < sx0) sx0 = p.x; if (p.x > sx1) sx1 = p.x; if (p.y < sy0) sy0 = p.y; if (p.y > sy1) sy1 = p.y; } };
  if (o.slatPolys && o.slatPolys.length) { for (const poly of o.slatPolys) accXY(poly); }
  else {
    let fp = core;
    if (isBase && o.moldMargin > 0) { try { const e = offsetPolygonOutward(core, o.moldMargin); if (e && e.length >= 3) fp = e; } catch (e) {} }
    else if (o.baseOp) { const m = (o.bladeOffset || 1) + (o.dragLeadIn || 12) + 2; try { const e = offsetPolygonOutward(core, m); if (e && e.length >= 3) fp = e; } catch (e) {} }
    else if (o.doPerimeter) { try { const e = offsetPolygonOutward(core, R); if (e && e.length >= 3) fp = e; } catch (e) {} }
    accXY(fp);
  }
  const stockX = (sx1 - sx0) / uL, stockY = (sy1 - sy0) / uL;           // in output units
  // Origin shift (internal coords): corner = shift so the whole part is in +X/+Y (min -> 0), so every
  // emitted coordinate is positive and nothing drives negative past a soft limit. center = centred on 0.
  if (o.origin === "corner") { originShiftLen = -sx0; originShiftWid = -sy0; }
  else { originShiftLen = -(sx0 + sx1) / 2; originShiftWid = -(sy0 + sy1) / 2; }
  // Center the part within the stock (so the cut follows the stock's lengthwise centerline / stringer),
  // while still zeroing at the corner: shift the whole part in by half the leftover stock on each axis.
  if (o.centerInStock && o.stockL > 0 && o.stockW > 0 && o.origin === "corner") {
    const partMX = o.partAxis === "y" ? (sy1 - sy0) : (sx1 - sx0);   // part extent along machine X
    const partMY = o.partAxis === "y" ? (sx1 - sx0) : (sy1 - sy0);   // along machine Y
    const stockMX = o.partAxis === "y" ? o.stockW : o.stockL;         // stock extent along machine X (mm)
    const stockMY = o.partAxis === "y" ? o.stockL : o.stockW;
    cOffX = Math.max(0, (stockMX - partMX) / 2);
    cOffY = Math.max(0, (stockMY - partMY) / 2);
  }
  const dv = n => inch ? (+n.toFixed(3)) : Math.round(n);
  // Required thickness: blanks/sheets for cut ops = stock; mold blank = surface span + a solid base.
  const moldBase = 12;                                                   // mm of base left under the deepest cut
  const stockT = isBase ? dv((baseSpan + moldBase) / uL) : disp.stockThick;
  const stockLbl = o.slatPolys ? "SHEET (MDF)" : isBase ? "MOLD BLANK" : o.baseOp ? "BASE SHEET" : "STOCK BLANK";
  const thickNote = isBase
    ? `>= ${stockT} ${uu} thick (${dv(baseSpan / uL)} carve + ${dv(moldBase / uL)} base) - you set ${disp.stockThick}`
    : o.slatPolys ? `${disp.stockThick} ${uu} thick = rib thickness` : o.baseOp ? `${disp.stockThick} ${uu} base material` : `${disp.stockThick} ${uu} thick`;
  if (pst.pct) { G.push("%"); G.push("O1001 (BCS SKI CORE)"); }
  PC(`Black Chapel Studios - ski core CAM`);
  PC(`${new Date().toISOString().slice(0, 10)}  |  ${inch ? "IMPERIAL inch/IPM" : "METRIC mm"}  |  post: ${pst.name}`);
  PC(`${stockLbl} NEEDED: ${dv(stockX)} x ${dv(stockY)} ${uu}, ${thickNote}`);
  PC(`Z ZERO = ${o.zZero === "bed" ? "BED / TABLE TOP" : "TOP OF STOCK"}   (stock ${disp.stockThick} ${uu})`);
  PC(`Tool T${o.toolNum}  ${disp.toolDia} ${uu} dia   Spindle ${o.spindle} ${o.spindleCW ? "CW" : "CCW"}   Feed ${disp.feed} ${uf}  Plunge ${disp.plunge} ${uf}`);
  if (o.doProfile) {
    PC(`${isBase ? "Mold surface (camber/rocker)" : "Surface taper"}: ${o.profPattern}${o.profPattern === "oneway" ? " " + (o.profDir === "+" ? "tail->tip" : "tip->tail") : ""}${isBase ? ", margin " + disp.moldMargin + " " + uu : ", leave " + disp.sidewallStock + " " + uu + " sidewall stock"}`);
    if (!isBase) PC(`Sidewall engagement (glued walls): ${o.sidewallEngage === "off" ? "off" : o.sidewallEngage + " (edge lanes)"}`);
  }
  if (o.doPerimeter) PC(`Outline: ${o.perimDir} milling, ${o.rampEntry ? "ramp entry " + disp.rampLen + " " + uu : "straight plunge"}`);
  PC(`Part orientation: length along ${o.partAxis === "x" ? "X" : "Y"} axis`);
  PC(`Origin: ${o.origin === "center" ? "part center (X0/Y0 at mid-length centerline)" : "corner"}`);
  PC(`ALWAYS air-cut / dry-run above the stock before committing.`);
  P(inch ? "G20" : "G21"); P("G90"); P("G17"); P("G94");
  toolChange(o.toolNum); P(o.baseOp ? "M5" : `S${o.spindle} M3`); if (o.baseOp) PC("DRAG KNIFE — spindle stays OFF (blade is dragged, not spun)"); P(`G0 Z${f(safeZ)}`);
  if (o.doProfile) {
    PB(); PC("===== CORE PROFILE (top surface to thickness) =====");
    let minTop = 1e9; for (let x = 0; x <= L; x += 5) minTop = Math.min(minTop, topH(x));
    // One surfacing set: lanes spaced by `so`, stepping down by `sd` from `startTop` to `minTop+zOff`,
    // each lane cutting to max(topH(x)+zOff, floor). zOff>0 leaves finish stock; tnum triggers a tool change.
    const doSurface = (toolR, so, sd, zOff, tnum, startTop, label) => {
      let surfPoly = core;
      if (isBase) { const mm2 = Math.max(0, o.moldMargin || 0); if (mm2 > 0) { try { const op2 = offsetPolygonOutward(core, mm2); if (op2 && op2.length >= 3) surfPoly = op2; } catch (e) {} } }
      else { const inset = toolR + Math.max(0, o.sidewallStock); try { const ip = offsetPolygonInward(core, inset); if (ip && ip.length >= 3) surfPoly = ip; } catch (e) {} }
      let sHalf = 0; for (const p of surfPoly) sHalf = Math.max(sHalf, Math.abs(p.y));
      const lanes = []; const yL = -sHalf + 0.4, yR = sHalf - 0.4; lanes.push(yL);
      for (let y = -sHalf + so; y < yR - 1e-6; y += so) lanes.push(y);
      lanes.push(yR);
      const passes = Math.max(1, Math.ceil((startTop - (minTop + zOff)) / sd));
      if (tnum != null) { P(`G0 Z${f(safeZ)}`); toolChange(tnum); P(`S${o.spindle} M3`); }
      for (let k = 1; k <= passes; k++) {
        const floor = startTop - k * sd;
        PC(`-- ${label} pass ${k}/${passes} --`);
        lanes.forEach((y, li) => {
          const xs = _camCrossingsX(surfPoly, y); if (xs.length < 2) return;
          for (let s = 0; s + 1 < xs.length; s += 2) {
            const xa = xs[s], xb = xs[s + 1]; if (xb - xa < 3) continue;
            const isLeft = li === 0, isRight = li === lanes.length - 1;
            let wantPlus;
            if (o.sidewallEngage !== "off" && !isBase && (isLeft || isRight)) { let base = isLeft; if (o.sidewallEngage === "climb") base = !base; if (!o.spindleCW) base = !base; wantPlus = base; }
            else { wantPlus = o.profPattern === "oneway" ? (o.profDir === "+") : ((o.profDir === "+") !== (li % 2 === 1)); }
            const x0 = wantPlus ? xa : xb, x1 = wantPlus ? xb : xa, step = (x1 >= x0 ? 1 : -1) * 3;
            const zAt = x => MZ(Math.max(topH(x) + zOff, floor));
            g0(x0, y); g0z(MZ(o.stockThick + 1)); g1z(zAt(x0));
            let px = x0;
            for (let x = x0; step > 0 ? x <= x1 : x >= x1; x += step) { g1(x, y, zAt(x)); cutDist += Math.abs(x - px); px = x; }
            g1(x1, y, zAt(x1)); g0z(safeZ);
          }
        });
      }
    };
    if (o.roughing) {
      const allow = Math.max(0.2, o.finishAllowance || 1), rR = (o.roughToolDia || o.toolDia) / 2;
      PC(`Roughing (leave ${f(allow)} ${uu}) then finishing skim`);
      doSurface(rR, Math.max(1, o.roughStepover || o.toolDia), Math.max(0.5, o.roughStepdown || o.stepdown), allow, o.roughToolNum != null ? o.roughToolNum : o.toolNum, o.stockThick, "rough");
      doSurface(R, o.stepover, allow + 1, 0, o.toolNum, minTop + allow + 0.5, "finish");
    } else {
      doSurface(R, o.stepover, o.stepdown, 0, null, o.stockThick, "profile");
    }
  }
  const emitDragKnife = (poly, label) => {
    // Drag knife (e.g. Donek): spindle off, a blade that trails the tool center by `bladeOffset`.
    // The tool-center path leads the desired cut line by the offset, and at corners it swivels on an
    // arc of radius=offset centered on the corner so the blade re-aligns instead of tearing.
    if (!poly || poly.length < 3) return;
    PB(); PC(`===== ${label} — DRAG KNIFE (spindle OFF) =====`);
    PC(`Blade offset ${disp.bladeOffset} ${uu} · lead-in ${disp.dragLeadIn} ${uu} · swivel at corners · single pass`);
    const off = Math.max(0.05, o.bladeOffset || 1);
    let bp = poly.slice();
    { const dstep = 3, dp = []; for (let i = 0; i < bp.length; i++) { const a = bp[i], b = bp[(i + 1) % bp.length], d = Math.hypot(b.x - a.x, b.y - a.y), nn = Math.max(1, Math.ceil(d / dstep)); for (let j = 0; j < nn; j++) { const t = j / nn; dp.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); } } bp = dp; }
    const n = bp.length, dir = i => { const a = bp[i], b = bp[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return { x: dx / L, y: dy / L }; };
    const tc = []; const d0 = dir(0); tc.push({ x: bp[0].x + off * d0.x, y: bp[0].y + off * d0.y });
    for (let i = 0; i < n; i++) {
      const dOut = dir(i), V = bp[(i + 1) % n];
      tc.push({ x: V.x + off * dOut.x, y: V.y + off * dOut.y });
      const dNext = dir((i + 1) % n); let a0 = Math.atan2(dOut.y, dOut.x), a1 = Math.atan2(dNext.y, dNext.x), da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) > 0.09) { const steps = Math.max(1, Math.ceil(Math.abs(da) / (12 * Math.PI / 180))); for (let s = 1; s <= steps; s++) { const a = a0 + da * s / steps; tc.push({ x: V.x + off * Math.cos(a), y: V.y + off * Math.sin(a) }); } }
    }
    const cutZ = MZ(-o.cutThrough);
    // Lead-in: plunge in the waste, offset back along the first cut direction, then cut into the start
    // point. That first straight move casters the blade into alignment with edge 0 before the real cut.
    const lead = Math.max(off * 3, o.dragLeadIn || 12);
    const lx = tc[0].x - lead * d0.x, ly = tc[0].y - lead * d0.y;
    PC(`lead-in pre-aligns the blade before the cut line`);
    g0(lx, ly); g0z(MZ(o.stockThick + 1)); g1z(cutZ);
    g1(tc[0].x, tc[0].y, cutZ); cutDist += lead;
    let px = tc[0].x, py = tc[0].y;
    for (let i = 1; i < tc.length; i++) { g1(tc[i].x, tc[i].y, cutZ); cutDist += Math.hypot(tc[i].x - px, tc[i].y - py); px = tc[i].x; py = tc[i].y; }
    g0z(safeZ);
  };
  if (o.baseOp) {
    // Base cut line: full-wrap inset, or contact-wrap sections + full outline at tips/tails.
    const eInset = ski.edgeInset !== undefined ? ski.edgeInset : 2.0, eWrap = ski.edgeWrap || "full";
    let baseEdge;
    try {
      if (eWrap === "contact" && eInset > 0) baseEdge = getContactBaseCutLoop(ski, eInset, ski.edgeExtTip || 0, ski.edgeExtTail || 0).map(p => ({ x: p.y, y: p.x }));
      else if (eInset > 0) baseEdge = offsetPolygonInward(getFullOutlinePoints(ski), eInset).map(p => ({ x: p.y, y: p.x }));
      else baseEdge = getFullOutlinePoints(ski).map(p => ({ x: p.y, y: p.x }));
    } catch (e) { baseEdge = getFullOutlinePoints(ski).map(p => ({ x: p.y, y: p.x })); }
    emitDragKnife(baseEdge, `BASE CUT (${eWrap === "contact" && eInset > 0 ? "contact-wrap + tip/tail outline" : eInset > 0 ? eInset + "mm full-wrap inset" : "full outline"})`);
  }
  if (o.doPerimeter) {
    let path = core;
    if (o.perimeterSide === "outside") path = offsetPolygonOutward(core, R);
    else if (o.perimeterSide === "inside") path = offsetPolygonInward(core, R);
    // Order the loop for the chosen milling direction. Standard CW spindle: climb = CCW travel on an
    // outside profile (CW on an inside/pocket); conventional is the reverse. Flip if spindle runs CCW.
    let area = 0; for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length]; area += a.x * b.y - b.x * a.y; }
    const isCCW = area > 0, outside = o.perimeterSide !== "inside";
    let wantCCW = o.perimDir === "climb" ? outside : !outside; if (!o.spindleCW) wantCCW = !wantCCW;
    if (isCCW !== wantCCW) path = path.slice().reverse();
    // densify so the ramp Z and tabs sample smoothly along long offset segments
    { const dstep = 4, dp = []; for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / dstep)); for (let j = 0; j < n; j++) { const t = j / n; dp.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); } } path = dp; }
    // cumulative arc-length verts (+ overlap tail so the ramp entry gets cleaned to full depth)
    const verts = [{ x: path[0].x, y: path[0].y, run: 0 }]; let per = 0;
    for (let i = 1; i <= path.length; i++) { const a = path[(i - 1) % path.length], b = path[i % path.length]; per += Math.hypot(b.x - a.x, b.y - a.y); verts.push({ x: b.x, y: b.y, run: per }); }
    if (o.rampEntry) { let orun = per, i = 1; while (orun - per < o.rampLen && i < path.length) { const a = path[(i - 1) % path.length], b = path[i % path.length]; orun += Math.hypot(b.x - a.x, b.y - a.y); verts.push({ x: b.x, y: b.y, run: orun }); i++; } }
    const tabAt = []; for (let t = 0; t < o.tabN; t++) tabAt.push((t + 0.5) / o.tabN * per);
    const botH = -o.cutThrough, pPass = Math.max(1, Math.ceil((o.stockThick - botH) / o.stepdown));
    for (let k = 1; k <= pPass; k++) {
      const targetH = Math.max(botH, o.stockThick - k * o.stepdown);
      const prevH = k === 1 ? o.stockThick : Math.max(botH, o.stockThick - (k - 1) * o.stepdown);
      PC(`-- perimeter pass ${k}/${pPass} (Z ${f(MZ(targetH))})${o.rampEntry ? " ramped" : ""} --`);
      const zAtRun = run => {
        let h = targetH;
        if (o.rampEntry && run < o.rampLen && per > 1) h = lerp(prevH, targetH, run / Math.min(o.rampLen, per));
        if (k === pPass) { const rr = run % per; for (const ta of tabAt) if (Math.abs(rr - ta) < o.tabLen / 2) h = Math.max(h, o.tabHeight); }
        return MZ(h);
      };
      g0(verts[0].x, verts[0].y); g0z(MZ(o.stockThick + 1));
      if (o.rampEntry) g0z(MZ(prevH)); else g1z(MZ(targetH));
      let pr = verts[0].run;
      for (let i = 1; i < verts.length; i++) { const v = verts[i]; g1(v.x, v.y, zAtRun(v.run)); cutDist += Math.abs(v.run - pr); pr = v.run; }
      g0z(safeZ);
    }
  }
  if (o.slatPolys && o.slatPolys.length) {
    PB(); PC("===== MOLD SLATS (camber/rocker ribs cut through sheet) =====");
    const botH = -o.cutThrough, pPass = Math.max(1, Math.ceil((o.stockThick - botH) / o.stepdown));
    o.slatPolys.forEach((poly0, idx) => {
      let path = poly0;
      try { const op2 = offsetPolygonOutward(poly0, R); if (op2 && op2.length >= 3) path = op2; } catch (e) {}
      { const dstep = 4, dp = []; for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / dstep)); for (let j = 0; j < n; j++) { const t = j / n; dp.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); } } path = dp; }
      let per = 0; const verts = [{ x: path[0].x, y: path[0].y, run: 0 }]; for (let i = 1; i <= path.length; i++) { const a = path[(i - 1) % path.length], b = path[i % path.length]; per += Math.hypot(b.x - a.x, b.y - a.y); verts.push({ x: b.x, y: b.y, run: per }); }
      const tabAt = []; for (let t = 0; t < o.tabN; t++) tabAt.push((t + 0.5) / o.tabN * per);
      PC(`-- slat ${idx + 1}/${o.slatPolys.length} (${poly0._label || ""}) --`);
      for (let k = 1; k <= pPass; k++) {
        const targetH = Math.max(botH, o.stockThick - k * o.stepdown);
        g0(verts[0].x, verts[0].y); g0z(MZ(o.stockThick + 1)); g1z(MZ(targetH));
        for (let i = 1; i < verts.length; i++) { const v = verts[i]; let h = targetH; if (k === pPass) { const rr = v.run % per; for (const ta of tabAt) if (Math.abs(rr - ta) < o.tabLen / 2) h = Math.max(h, o.tabHeight); } g1(v.x, v.y, MZ(h)); cutDist += Math.abs(v.run - verts[i - 1].run); }
        g0z(safeZ);
      }
    });
    // Rod alignment holes — drilled after all contours with a dedicated bit (via the ATC), so the holes
    // come out at the exact clearance diameter regardless of the slat-cutting tool.
    const anyHoles = o.slatPolys.some(p => p._holes && p._holes.length);
    if (anyHoles) {
      let nHoles = 0;
      PB(); PC(`===== ROD ALIGNMENT HOLES (${f(o.slatHoleDia)} ${uu} dia) =====`);
      P(`G0 Z${f(safeZ)}`); toolChange(o.slatHoleToolNum); P(`S${o.spindle} M3`);
      const botZh = -o.cutThrough;
      // Order the holes as a snake (by stacking band, alternating direction each row) so the drill
      // doesn't zig-zag/jump back across the sheet between holes.
      const all = [];
      for (const poly0 of o.slatPolys) if (poly0._holes) for (const h of poly0._holes) all.push(h);
      const bands = new Map();
      for (const h of all) { const k = Math.round(h.y); if (!bands.has(k)) bands.set(k, []); bands.get(k).push(h); }
      const keys = [...bands.keys()].sort((a, b) => a - b);
      const ordered = [];
      keys.forEach((k, i) => { const row = bands.get(k).sort((a, b) => a.x - b.x); if (i % 2) row.reverse(); ordered.push(...row); });
      for (const hh of ordered) { g0(hh.x, hh.y); g0z(MZ(o.stockThick + 1)); g1z(MZ(botZh)); g0z(safeZ); nHoles++; }
      PC(`${nHoles} holes drilled (travel-optimised)`);
    }
  }
  if (o.borePts && o.borePts.length) {
    PB(); PC(`===== BORING - insert holes (${f(o.boreDia)} ${uu} dia x ${f(o.boreDepth)} ${uu} deep) =====`);
    const hr = Math.max(0, (o.boreDia - o.toolDia) / 2);
    const topZ = o.stockThick, botZ = o.stockThick - o.boreDepth;   // blind hole, depth measured from stock top
    o.borePts.forEach((h, i) => {
      PC(`-- insert ${i + 1}/${o.borePts.length} --`);
      if (hr < 0.15 || !o.boreHelix) {
        // straight plunge (bit ~ hole size), stepped for chip clearing
        g0(h.x, h.y); g0z(MZ(topZ + 1));
        let z = topZ; while (z > botZ + 1e-6) { z = Math.max(botZ, z - o.stepdown); g1z(MZ(z)); }
        g0z(safeZ);
      } else {
        // helical bore: spiral down at radius hr, then a clean-up circle at depth
        const segs = 24, turns = Math.max(2, Math.ceil((topZ - botZ) / 1.2)), dz = (topZ - botZ) / (turns * segs);
        g0(h.x + hr, h.y); g0z(MZ(topZ + 0.5)); let z = topZ;
        for (let t = 0; t < turns; t++) for (let s = 1; s <= segs; s++) { const a = (s / segs) * 2 * Math.PI; z -= dz; g1(h.x + hr * Math.cos(a), h.y + hr * Math.sin(a), MZ(z)); }
        for (let s = 1; s <= segs; s++) { const a = (s / segs) * 2 * Math.PI; g1(h.x + hr * Math.cos(a), h.y + hr * Math.sin(a), MZ(botZ)); }
        g1(h.x + hr, h.y, MZ(botZ)); g0z(safeZ);
      }
    });
  }
  if (o.doPocket) {
    PB(); PC(`===== POCKET (raster clear, ${f(o.pocketDepth)} ${uu} deep) =====`);
    const cxL = (o.pocketCenterX != null ? o.pocketCenterX : 0.5) * L, r = o.toolDia / 2;
    const x0p = cxL - o.pocketL / 2 + r, x1p = cxL + o.pocketL / 2 - r;
    const y0p = (o.pocketCenterY || 0) - o.pocketW / 2 + r, y1p = (o.pocketCenterY || 0) + o.pocketW / 2 - r;
    const topZ = o.stockThick, botZ = o.stockThick - o.pocketDepth, so = Math.max(0.5, o.stepover);
    const passes = Math.max(1, Math.ceil(o.pocketDepth / o.stepdown));
    if (x1p > x0p && y1p > y0p) {
      for (let pi = 1; pi <= passes; pi++) {
        const z = Math.max(botZ, topZ - pi * (o.pocketDepth / passes));
        g0(x0p, y0p); g0z(MZ(topZ + 1)); g1z(MZ(z));
        let yy = y0p, atLeft = true;
        while (yy <= y1p + 1e-6) {
          g1(atLeft ? x1p : x0p, yy, MZ(z));                 // cut across in X
          const ny = Math.min(y1p, yy + so);
          if (ny <= yy + 1e-9) break;
          g1(atLeft ? x1p : x0p, ny, MZ(z));                 // step over in Y at the far wall
          yy = ny; atLeft = !atLeft;
        }
        g1(x0p, y1p, MZ(z)); g1(x0p, y0p, MZ(z)); g1(x1p, y0p, MZ(z)); g1(x1p, y1p, MZ(z)); g1(x0p, y1p, MZ(z)); // finish walls
        g0z(safeZ);
      }
    }
  }
  PB(); P(`G0 Z${f(safeZ)}`); P("G0 X0 Y0"); pst.end.forEach(e => P(e)); if (pst.pct) G.push("%");
  let _gc = G.join("\n"), _lines = G.length;
  if (o.arcOut) { const dec = pst.decimals != null ? pst.decimals : (inch ? 4 : 3); _gc = arcFitGcode(_gc, 0.02 / uL, dec, pst.lineNum); _lines = _gc.split("\n").length; }
  return { gcode: _gc, stats: { lines: _lines, cuts, rapids, cutDistMM: Math.round(cutDist), minZ: +(minZ / uL).toFixed(inch ? 3 : 2), maxZ: +(maxZ / uL).toFixed(inch ? 3 : 2), estMin: +(cutDist / o.feed + rapids * 0.03).toFixed(1), unit: uu, ext: pst.ext, machX: +((maxCX - minCX) / uL).toFixed(inch ? 2 : 0), machY: +((maxCY - minCY) / uL).toFixed(inch ? 2 : 0), stockX: dv(stockX), stockY: dv(stockY), stockT, stockLbl, stockKind: o.slatPolys ? "sheet" : isBase ? "mold" : o.baseOp ? "base" : "blank", setThick: disp.stockThick } };
}

// Top-down toolpath preview: parses the generated G-code and draws rapids (dim/dashed) and cutting
// moves coloured by depth (deep = torch red, shallow = brass), so paths can be checked before cutting.
// Shared canvas renderer: parses G-code and draws rapids (dim dashed) + cuts coloured by depth. When a
// machine work area is supplied, the bed rectangle and origin are drawn too, so fit is obvious.
function parseToolpath(gcode) {
  let x = 0, y = 0, z = 0, have = false; const segs = []; let zMin = 1e9, zMax = -1e9, bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (const raw of (gcode || "").split("\n")) {
    const line = raw.trim(); if (!line || line[0] === ";") continue;
    const g0 = /^G0\b/.test(line), g1 = /^G1\b/.test(line); if (!g0 && !g1) continue;
    const mx = line.match(/X(-?[\d.]+)/), my = line.match(/Y(-?[\d.]+)/), mz = line.match(/Z(-?[\d.]+)/);
    const nx = mx ? parseFloat(mx[1]) : x, ny = my ? parseFloat(my[1]) : y, nz = mz ? parseFloat(mz[1]) : z;
    if ((mx || my) && have) { segs.push({ x0: x, y0: y, x1: nx, y1: ny, z: nz, cut: g1 }); if (g1) { zMin = Math.min(zMin, nz); zMax = Math.max(zMax, nz); bx0 = Math.min(bx0, x, nx); by0 = Math.min(by0, y, ny); bx1 = Math.max(bx1, x, nx); by1 = Math.max(by1, y, ny); } }
    x = nx; y = ny; z = nz; have = have || !!(mx || my);
  }
  return { segs, zMin, zMax, bx0, by0, bx1, by1 };
}
function drawToolpathCanvas(cv, data, machine, view, stock) {
  const ctx = cv.getContext("2d"); const W = cv.width, H = cv.height;
  const parsed = typeof data === "string" ? parseToolpath(data) : data;
  const { segs, zMin, zMax, bx0, by0, bx1, by1 } = parsed || { segs: [] };
  ctx.fillStyle = "#14100d"; ctx.fillRect(0, 0, W, H);
  if (!segs || !segs.length) return null;
  // Draw the ACTUAL emitted G-code (X horizontal, Y vertical) so the preview always matches the machine.
  // The bed is machine X (short) wide x machine Y (long) tall, anchored at the toolpath's corner.
  const hasBed = !!(machine && machine.short > 0 && isFinite(bx0));
  const bedX1 = machine ? machine.short : 0, bedY1 = machine ? machine.long : 0;
  const hasStock = !!(stock && stock.xExt > 0 && isFinite(bx0));
  const stkX1 = stock ? stock.xExt : 0, stkY1 = stock ? stock.yExt : 0;
  let mnx = bx0, mxx = bx1, mny = by0, mxy = by1;
  if (hasBed || hasStock) { mnx = Math.min(mnx, 0); mny = Math.min(mny, 0); }   // include the zero corner
  if (hasBed) { mxx = Math.max(mxx, bedX1); mxy = Math.max(mxy, bedY1); }
  if (hasStock) { mxx = Math.max(mxx, stkX1); mxy = Math.max(mxy, stkY1); }
  const bw = (mxx - mnx) || 1, bh = (mxy - mny) || 1, pad = 26;
  const sBase = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
  const zoom = (view && view.zoom) || 1, s = sBase * zoom;
  const ox = (W - bw * s) / 2 - mnx * s + (view ? view.panX || 0 : 0), oy = (H - bh * s) / 2 - mny * s + (view ? view.panY || 0 : 0);
  const MXc = (gx, gy) => ox + gx * s;
  const MYc = (gx, gy) => H - (oy + gy * s);
  if (hasBed) {
    ctx.strokeStyle = machine.fits ? "rgba(120,180,120,0.55)" : "rgba(232,85,42,0.85)";
    ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
    ctx.strokeRect(MXc(0, 0), MYc(0, bedY1), machine.short * s, machine.long * s);
    ctx.setLineDash([]);
    ctx.fillStyle = machine.fits ? "rgba(120,180,120,0.7)" : "rgba(232,85,42,0.9)";
    ctx.font = "9px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText(machine.fits ? "MACHINE BED" : "EXCEEDS BED", MXc(0, 0) + 3, MYc(0, bedY1) + 11);
  }
  if (hasStock) {
    const col = stock.fits ? "200,147,90" : "232,85,42";
    ctx.fillStyle = `rgba(${col},0.12)`; ctx.fillRect(MXc(0, 0), MYc(0, stkY1), stock.xExt * s, stock.yExt * s);
    ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.strokeRect(MXc(0, 0), MYc(0, stkY1), stock.xExt * s, stock.yExt * s);
    // stock centerlines (dashed) so you can confirm the profile follows the stringer
    ctx.strokeStyle = `rgba(${col},0.4)`; ctx.lineWidth = 1; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(MXc(stock.xExt / 2, 0), MYc(0, 0)); ctx.lineTo(MXc(stock.xExt / 2, 0), MYc(0, stkY1)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(MXc(0, 0), MYc(0, stock.yExt / 2)); ctx.lineTo(MXc(stkX1, 0), MYc(0, stock.yExt / 2)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(${col},1)`; ctx.font = "bold 10px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText(stock.fits ? "YOUR STOCK" : "TOOLPATH EXCEEDS STOCK", MXc(0, 0) + 4, MYc(0, stkY1) + 14);
  }
  ctx.strokeStyle = "rgba(155,147,136,0.28)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath();
  for (const g of segs) if (!g.cut) { ctx.moveTo(MXc(g.x0, g.y0), MYc(g.x0, g.y0)); ctx.lineTo(MXc(g.x1, g.y1), MYc(g.x1, g.y1)); }
  ctx.stroke(); ctx.setLineDash([]);
  const zr = (zMax - zMin) || 1, N = 12, buckets = Array.from({ length: N }, () => []);
  for (const g of segs) if (g.cut) buckets[Math.min(N - 1, Math.max(0, Math.round((g.z - zMin) / zr * (N - 1))))].push(g);
  buckets.forEach((arr, i) => {
    if (!arr.length) return; const t = i / (N - 1);
    ctx.strokeStyle = `rgb(${Math.round(232 - (232 - 200) * t)},${Math.round(85 + (147 - 85) * t)},${Math.round(42 + (90 - 42) * t)})`;
    ctx.lineWidth = 1.1; ctx.beginPath();
    for (const g of arr) { ctx.moveTo(MXc(g.x0, g.y0), MYc(g.x0, g.y0)); ctx.lineTo(MXc(g.x1, g.y1), MYc(g.x1, g.y1)); }
    ctx.stroke();
  });
  return { sBase, s, ox, oy, mnx, mny, bw, bh, H };
}

// Live right-side toolpath view — redraws whenever the G-code or size changes. Zoom (wheel/buttons) + pan (drag).
function ToolpathView({ gcode, width, height, machine, stock }) {
  const ref = useRef(null), tf = useRef(null), drag = useRef(null), raf = useRef(0);
  const parsed = useMemo(() => parseToolpath(gcode), [gcode]);   // parse ONCE per G-code, not per pan/zoom frame
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => { const cv = ref.current; if (!cv) return; const fw = Math.max(1, Math.floor(width)), fh = Math.max(1, Math.floor(height)); if (cv.width !== fw) cv.width = fw; if (cv.height !== fh) cv.height = fh; tf.current = drawToolpathCanvas(cv, parsed, machine, { zoom, panX: pan.x, panY: pan.y }, stock); }, [parsed, width, height, machine, stock, zoom, pan]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const ptr = e => { const cv = ref.current, r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height), sc: cv.width / r.width }; };
  const onWheel = e => { e.preventDefault(); const t = tf.current; if (!t) return; const p = ptr(e); const wx = (p.x - t.ox) / t.s, wy = (t.H - p.y - t.oy) / t.s; const nz = Math.max(1, Math.min(24, zoom * (1 - e.deltaY * 0.0015))); const ns = t.sBase * nz; setZoom(nz); setPan({ x: (p.x - wx * ns) - ((ref.current.width - t.bw * ns) / 2 - t.mnx * ns), y: (t.H - p.y - wy * ns) - ((t.H - t.bh * ns) / 2 - t.mny * ns) }); };
  const onDown = e => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, sc: ptr(e).sc }; };
  const onMove = e => { if (!drag.current) return; const d = drag.current, cx = e.clientX, cy = e.clientY; if (raf.current) return; raf.current = requestAnimationFrame(() => { raf.current = 0; setPan({ x: d.px + (cx - d.x) * d.sc, y: d.py - (cy - d.y) * d.sc }); }); };
  const onUp = () => { drag.current = null; };
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const btn = { minWidth: 26, height: 24, background: "rgba(20,16,13,0.88)", border: "1px solid rgba(155,147,136,0.32)", color: "#c8935a", borderRadius: 3, cursor: "pointer", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, padding: "0 7px" };
  return (
    <div style={{ position: "relative", width, height, overflow: "hidden" }}>
      <canvas ref={ref} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onDoubleClick={reset} style={{ width, height, display: "block", cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }} />
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
        <button onClick={() => setZoom(z => Math.max(1, z / 1.4))} style={btn}>−</button>
        <span style={{ ...btn, cursor: "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9b9388" }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(24, z * 1.4))} style={btn}>+</button>
        <button onClick={reset} style={{ ...btn, fontWeight: 700 }}>Reset view</button>
      </div>
      <div style={{ position: "absolute", bottom: 6, left: 10, fontSize: 9.5, color: "rgba(155,147,136,0.6)", fontFamily: "'JetBrains Mono', monospace", pointerEvents: "none" }}>scroll to zoom · drag to pan · double-click to reset</div>
    </div>
  );
}

// GPU 3D toolpath view (Three.js): cut moves coloured by depth, rapids dim, orbit/zoom, ground grid.
function Toolpath3DView({ gcode, machine }) {
  const mountRef = useRef(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let renderer, scene, camera, raf, ro, disposed = false; const cleanup = [];
    const mount = mountRef.current; if (!mount) return;
    let x = 0, y = 0, z = 0, have = false; const cut = [], rap = [];
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, bz0 = 1e9, bz1 = -1e9, zmin = 1e9, zmax = -1e9;
    for (const raw of (gcode || "").split("\n")) {
      const line = raw.trim(); if (!line || line[0] === ";") continue;
      const g0 = /^G0\b/.test(line), g1 = /^G1\b/.test(line); if (!g0 && !g1) continue;
      const mx = line.match(/X(-?[\d.]+)/), my = line.match(/Y(-?[\d.]+)/), mz = line.match(/Z(-?[\d.]+)/);
      const nx = mx ? parseFloat(mx[1]) : x, ny = my ? parseFloat(my[1]) : y, nz = mz ? parseFloat(mz[1]) : z;
      if (have && (mx || my || mz)) {
        (g1 ? cut : rap).push([x, y, z, nx, ny, nz]);
        if (g1) { for (const [a, b, c] of [[x, y, z], [nx, ny, nz]]) { bx0 = Math.min(bx0, a); bx1 = Math.max(bx1, a); by0 = Math.min(by0, b); by1 = Math.max(by1, b); bz0 = Math.min(bz0, c); bz1 = Math.max(bz1, c); } zmin = Math.min(zmin, z, nz); zmax = Math.max(zmax, z, nz); }
      }
      x = nx; y = ny; z = nz; have = have || !!(mx || my || mz);
    }
    if (!cut.length) { setStatus("empty"); return; }
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, cz = (bz0 + bz1) / 2;
    const size = Math.max(bx1 - bx0, by1 - by0, bz1 - bz0, 1);
    loadThree().then(THREE => {
      if (disposed) return;
      const W = mount.clientWidth || 700, H = mount.clientHeight || 460;
      scene = new THREE.Scene(); scene.background = new THREE.Color("#14100d");
      camera = new THREE.PerspectiveCamera(45, W / H, size * 0.01, size * 30);
      renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); mount.appendChild(renderer.domElement);
      // machine (X length, Y width, Z up) -> three (x right, y up, z toward viewer)
      const P = (mX, mY, mZ) => [mX - cx, mZ - cz, -(mY - cy)];
      const zr = (zmax - zmin) || 1;
      const col = zz => { const t = (zz - zmin) / zr; return [(232 - (232 - 200) * t) / 255, (85 + (147 - 85) * t) / 255, (42 + (90 - 42) * t) / 255]; };
      const cpos = new Float32Array(cut.length * 6), ccol = new Float32Array(cut.length * 6);
      cut.forEach((s, i) => { const A = P(s[0], s[1], s[2]), B = P(s[3], s[4], s[5]); cpos.set([A[0], A[1], A[2], B[0], B[1], B[2]], i * 6); ccol.set([...col(s[2]), ...col(s[5])], i * 6); });
      const cgeo = new THREE.BufferGeometry(); cgeo.setAttribute("position", new THREE.Float32BufferAttribute(cpos, 3)); cgeo.setAttribute("color", new THREE.Float32BufferAttribute(ccol, 3));
      const cmat = new THREE.LineBasicMaterial({ vertexColors: true }); scene.add(new THREE.LineSegments(cgeo, cmat)); cleanup.push(() => { cgeo.dispose(); cmat.dispose(); });
      if (rap.length) { const rpos = new Float32Array(rap.length * 6); rap.forEach((s, i) => { const A = P(s[0], s[1], s[2]), B = P(s[3], s[4], s[5]); rpos.set([A[0], A[1], A[2], B[0], B[1], B[2]], i * 6); }); const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute("position", new THREE.Float32BufferAttribute(rpos, 3)); const rmat = new THREE.LineBasicMaterial({ color: 0x5a5148, transparent: true, opacity: 0.35 }); scene.add(new THREE.LineSegments(rgeo, rmat)); cleanup.push(() => { rgeo.dispose(); rmat.dispose(); }); }
      const floorY = zmin - cz - 0.5;
      // Machine bed footprint on the floor (short X x long Y), anchored at the toolpath's corner —
      // matches the 2D view. Falls back to a tight grid hugging the part when no bed is set.
      if (machine && machine.short > 0) {
        const bx = bx0, by = by0, bX = machine.short, bY = machine.long;   // gcode X=width(short), Y=length(long)
        const corners = [[bx, by], [bx + bX, by], [bx + bX, by + bY], [bx, by + bY], [bx, by]];
        const pts = corners.map(([mX, mY]) => new THREE.Vector3(mX - cx, floorY, -(mY - cy)));
        const bgeo = new THREE.BufferGeometry().setFromPoints(pts);
        const bmat = new THREE.LineBasicMaterial({ color: machine.fits ? 0x6f9d6f : 0xe8552a });
        scene.add(new THREE.Line(bgeo, bmat)); cleanup.push(() => { bgeo.dispose(); bmat.dispose(); });
        const grid = new THREE.GridHelper(Math.max(bX, bY), 20, 0x2f2a24, 0x241f1a); grid.position.set((bx + bX / 2) - cx, floorY, -((by + bY / 2) - cy)); scene.add(grid); cleanup.push(() => grid.geometry.dispose());
      } else {
        const g = Math.max(bx1 - bx0, by1 - by0) * 1.1;
        const grid = new THREE.GridHelper(g, 16, 0x3a332c, 0x241f1a); grid.position.set((bx0 + bx1) / 2 - cx, floorY, -((by0 + by1) / 2 - cy)); scene.add(grid); cleanup.push(() => grid.geometry.dispose());
      }
      let az = 0.9, pol = 1.0, rad = size * 1.7;
      const el = renderer.domElement;
      const updateCam = () => { camera.position.set(rad * Math.sin(pol) * Math.sin(az), rad * Math.cos(pol), rad * Math.sin(pol) * Math.cos(az)); camera.lookAt(0, 0, 0); };
      updateCam();
      let drag = null, spun = false;
      const onDown = e => { drag = { x: e.clientX, y: e.clientY }; spun = true; };
      const onMove = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; az -= dx * 0.008; pol = Math.max(0.12, Math.min(Math.PI - 0.12, pol - dy * 0.008)); updateCam(); };
      const onUp = () => { drag = null; };
      const onWheel = e => { e.preventDefault(); rad = Math.max(size * 0.4, Math.min(size * 6, rad * (1 + e.deltaY * 0.001))); updateCam(); };
      const onTS = e => { if (e.touches[0]) { drag = { x: e.touches[0].clientX, y: e.touches[0].clientY }; spun = true; } };
      const onTM = e => { if (drag && e.touches[0]) { const t = e.touches[0]; const dx = t.clientX - drag.x, dy = t.clientY - drag.y; drag = { x: t.clientX, y: t.clientY }; az -= dx * 0.008; pol = Math.max(0.12, Math.min(Math.PI - 0.12, pol - dy * 0.008)); updateCam(); } };
      el.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
      el.addEventListener("wheel", onWheel, { passive: false });
      el.addEventListener("touchstart", onTS, { passive: true }); el.addEventListener("touchmove", onTM, { passive: true }); el.addEventListener("touchend", onUp);
      cleanup.push(() => { el.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); el.removeEventListener("wheel", onWheel); el.removeEventListener("touchstart", onTS); el.removeEventListener("touchmove", onTM); el.removeEventListener("touchend", onUp); });
      const animate = () => { raf = requestAnimationFrame(animate); if (!spun) { az += 0.0025; updateCam(); } renderer.render(scene, camera); };
      animate();
      ro = new ResizeObserver(() => { if (!mountRef.current) return; const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight; if (w && h) { camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); } }); ro.observe(mount);
      setStatus("ok");
    }).catch(() => { if (!disposed) setStatus("error"); });
    return () => { disposed = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); cleanup.forEach(fn => { try { fn(); } catch (e) {} }); if (renderer) { try { renderer.dispose(); if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); } catch (e) {} } };
  }, [gcode, machine]);
  return <div ref={mountRef} style={{ width: "100%", height: "100%", cursor: "grab", position: "relative" }}>{status !== "ok" && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: status === "error" ? "#e8552a" : "#9b9388", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{status === "error" ? "3D unavailable" : status === "empty" ? "no cuts to show" : "loading 3D\u2026"}</div>}</div>;
}

function ToolpathPreviewModal({ gcode, stats, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const cv = ref.current; if (cv) drawToolpathCanvas(cv, gcode); }, [gcode]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 16, width: "min(1040px, 95vw)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: C.heading, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>TOOLPATH PREVIEW · TOP-DOWN</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: C.label, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>{"\u2715"}</button>
        </div>
        <canvas ref={ref} width={992} height={420} style={{ width: "100%", height: "auto", borderRadius: 4, border: `1px solid ${C.panelBorder}`, background: "#14100d" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.label }}>
          <span><span style={{ display: "inline-block", width: 18, height: 0, borderTop: `1px dashed ${C.labelDim}`, verticalAlign: "middle", marginRight: 6 }} />rapid</span>
          <span><span style={{ display: "inline-block", width: 18, height: 3, background: "#e8552a", verticalAlign: "middle", marginRight: 6 }} />deeper cut</span>
          <span><span style={{ display: "inline-block", width: 18, height: 3, background: "#c8935a", verticalAlign: "middle", marginRight: 6 }} />shallower cut</span>
          {stats && <span style={{ marginLeft: "auto", color: C.labelDim }}>Z {stats.minZ}…{stats.maxZ} mm · ~{(stats.cutDistMM / 1000).toFixed(1)} m · {stats.estMin} min</span>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.labelDim, marginBottom: -4 }}>
          <span>G-CODE PREVIEW</span>
          <span>first 30 of {(gcode.split("\n").length).toLocaleString()} lines · download for full program</span>
        </div>
        <pre style={{ margin: 0, maxHeight: 150, overflow: "auto", background: "#0f0c0a", border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "8px 10px", color: C.labelDim, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, lineHeight: 1.5, whiteSpace: "pre" }}>{gcode.split("\n").slice(0, 30).join("\n")}</pre>
      </div>
    </div>
  );
}

function buildSpecSheetSVG(ski, derived, flex, bom, brand) {
  const W = 1400, H = 900, pad = 50;
  const bg = "#141210", brass = "#c8935a", bone = "#ede6d8", dim = "#9b9388", torch = "#e8552a", border = "#37322c";
  const rating = flexRating(flex.underfootK);
  const isBoard = ski.mode === "snowboard";
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let outline = [];
  try { outline = getFullOutlinePoints(ski); } catch (e) {}
  const rx = pad, ry = 210, rw = 540, rh = 300;
  const maxLat = Math.max(1, ...outline.map(p => Math.abs(p.x)));
  const sc = Math.min(rw / ski.length, rh / (2 * maxLat));
  const ox = rx + (rw - ski.length * sc) / 2, oy = ry + rh / 2;
  const mp = p => ({ x: ox + p.y * sc, y: oy - p.x * sc });
  const silPath = outline.length ? outline.map((p, i) => `${i ? "L" : "M"}${mp(p).x.toFixed(1)},${mp(p).y.toFixed(1)}`).join(" ") + " Z" : "";
  // Layup cross-section, stacked below the silhouette in the left column.
  const stackTop = 590;
  const stack = buildLayerStackSVG(ski, { x: rx, y: stackTop + 6, w: rw, maxH: (H - 110) - (stackTop + 6) });

  const rows = [
    ["Length", `${ski.length} mm`],
    ["Dimensions", `${ski.tipWidth}-${ski.waistWidth}-${ski.tailWidth} mm`],
    ["Sidecut radius", derived.sidecutRadius < 999 ? `${derived.sidecutRadius.toFixed(1)} m` : "--"],
    ["Effective edge", `${Math.round(derived.effectiveEdge)} mm`],
    ["Tip / tail length", `${ski.tipLength} / ${ski.tailLength} mm`],
    ["Tip / tail rise", `${ski.tipHeight} / ${ski.tailHeight} mm`],
    ["Camber", `${ski.camberHeight} mm`],
    ["Flex", `${rating.label} (${Math.round(flex.underfootK)} N/mm)`],
    ...(isBoard ? [["Stance / setback", `${ski.stanceWidth || 0} / ${ski.setback || 0} mm`]] : []),
    ["Core", ski.layup.wood],
    ["Fabric", ski.layup.fabricSplit
      ? `top ${ski.layup.glass} \u00D7${ski.layup.glassLayers} / bot ${ski.layup.glassBot || ski.layup.glass} \u00D7${ski.layup.glassBotLayers || ski.layup.glassLayers}`
      : `${ski.layup.glass} \u00D7${ski.layup.glassLayers}/side`],
    ...(ski.layup.metal && ski.layup.metal !== "none" ? [["Metal", ski.layup.metal]] : []),
    ...(ski.layup.carbon && ski.layup.carbon !== "none" ? [["Stringer", `${ski.layup.carbon} \u00D7${ski.layup.carbonLayers}`]] : []),
    ["Edge wrap", ski.edgeWrap || "full"],
    ["Core mass (est)", `~${bom.coreMassKg.toFixed(2)} kg`],
  ];
  const cx = 630, cyTop = 210, availH = H - cyTop - 150, rowH = availH / rows.length;
  const rowsSvg = rows.map((r, i) => {
    const yb = cyTop + i * rowH + rowH * 0.66;
    return `<text x="${cx}" y="${yb.toFixed(0)}" font-size="21" fill="${dim}" font-family="monospace">${esc(r[0])}</text>`
      + `<text x="${W - pad}" y="${yb.toFixed(0)}" font-size="22" fill="${bone}" font-family="monospace" text-anchor="end">${esc(r[1])}</text>`
      + `<line x1="${cx}" y1="${(cyTop + (i + 1) * rowH).toFixed(0)}" x2="${W - pad}" y2="${(cyTop + (i + 1) * rowH).toFixed(0)}" stroke="${border}" stroke-width="1"/>`;
  }).join("");

  const dateStr = new Date().toISOString().slice(0, 10);
  const typeLabel = isBoard ? "SNOWBOARD SPEC SHEET" : "SKI SPEC SHEET";

  // White-label header: builder's brand name (default Black Chapel Studios) + optional uploaded logo
  // placed top-right. A small tool-attribution credit sits in the footer.
  const brandName = (brand && brand.name && brand.name.trim()) ? brand.name.trim() : "BLACK CHAPEL STUDIOS";
  let logoSVG = "";
  if (brand && brand.logoSrc && brand.logoDims && brand.logoDims.w && brand.logoDims.h) {
    const boxH = 118, boxW = 470;                       // generous logo box, top-right of header
    let lw = boxH * (brand.logoDims.w / brand.logoDims.h), lh = boxH;
    if (lw > boxW) { lw = boxW; lh = boxW * (brand.logoDims.h / brand.logoDims.w); }
    const lx = W - pad - lw, ly = 100 - lh / 2;         // vertically centered in the header band
    logoSVG = `<image href="${brand.logoSrc}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${lw.toFixed(1)}" height="${lh.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="16" y="16" width="${W - 32}" height="${H - 32}" fill="none" stroke="${border}" stroke-width="1.5"/>
  <text x="${pad}" y="72" font-size="22" fill="${brass}" font-family="monospace" letter-spacing="4">${esc(brandName)}</text>
  ${logoSVG}
  <text x="${pad}" y="128" font-size="46" fill="${bone}" font-family="monospace" font-weight="bold">${esc(ski.designName || "Untitled Design")}</text>
  <text x="${pad}" y="160" font-size="18" fill="${torch}" font-family="monospace" letter-spacing="3">${typeLabel}</text>
  <line x1="${pad}" y1="180" x2="${W - pad}" y2="180" stroke="${brass}" stroke-width="1.5"/>
  <g id="silhouette">
    <path d="${silPath}" fill="rgba(200,147,90,0.10)" stroke="${brass}" stroke-width="2"/>
    <text x="${rx + rw / 2}" y="${(oy + maxLat * sc + 34).toFixed(0)}" font-size="20" fill="${dim}" font-family="monospace" text-anchor="middle">${ski.tipWidth} \u2013 ${ski.waistWidth} \u2013 ${ski.tailWidth} mm</text>
    <text x="${rx + rw / 2}" y="${(oy + maxLat * sc + 56).toFixed(0)}" font-size="15" fill="${dim}" font-family="monospace" text-anchor="middle">TIP \u00B7 WAIST \u00B7 TAIL</text>
  </g>
  <g id="layup">
    <text x="${pad}" y="${stackTop}" font-size="16" fill="${brass}" font-family="monospace" letter-spacing="2">LAYUP \u00B7 TOP \u2192 BASE</text>
    ${stack.svg}
  </g>
  <g id="specs">${rowsSvg}</g>
  <line x1="${pad}" y1="${H - 96}" x2="${W - pad}" y2="${H - 96}" stroke="${border}" stroke-width="1"/>
  <text x="${pad}" y="${H - 54}" font-size="17" fill="${dim}" font-family="monospace" letter-spacing="1">Generated with Black Chapel Studios Designer</text>
  <text x="${W - pad}" y="${H - 54}" font-size="17" fill="${dim}" font-family="monospace" text-anchor="end">designer.blackchapelstudios.com \u00B7 ${dateStr}</text>
</svg>`;
}

// A reference "ghost" outline built ONLY from the four numbers we actually have (length + tip/waist/
// tail widths). Tip/tail length and nose shape aren't in the database, so this is deliberately a plain
// schematic envelope — a dimension reference, not a claim about the real ski's exact shape.
function buildRefGhostOutline(L, tip, waist, tail) {
  const ss = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const tipLen = L * 0.12, tailLen = L * 0.08;          // typical proportions (estimate only)
  const tipContact = L - tipLen, tailContact = tailLen;
  const tHW = tip / 2, wHW = waist / 2, taHW = tail / 2;
  const N = 140, right = [];
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * L; let hw;
    if (y <= tailContact) { const t = tailContact > 0 ? y / tailContact : 1; hw = taHW * (0.30 + 0.70 * Math.sqrt(t)); }
    else if (y >= tipContact) { const t = tipLen > 0 ? (L - y) / tipLen : 1; hw = tHW * (0.30 + 0.70 * Math.sqrt(t)); }
    else { const u = (y - tailContact) / (tipContact - tailContact); hw = u <= 0.5 ? taHW + (wHW - taHW) * ss(u / 0.5) : wHW + (tHW - wHW) * ss((u - 0.5) / 0.5); }
    right.push({ x: hw, y });
  }
  const left = right.slice().reverse().map(p => ({ x: -p.x, y: p.y }));
  return { outline: right.concat(left), tipContact, tailContact, tHW, wHW, taHW };
}

function PlanView({ ski, setSki, width, height, orientation = "horizontal", topsheet, pairView, refGhost }) {
  const canvasRef = useRef(null);
  // Topsheet artwork: keep a decoded HTMLImageElement in a ref, and bump a counter when it finishes
  // loading so the drawing effect re-runs and paints it.
  const topsheetImgRef = useRef(null);
  const [topsheetTick, setTopsheetTick] = useState(0);
  useEffect(() => {
    const src = topsheet && topsheet.src;
    if (!src) { topsheetImgRef.current = null; setTopsheetTick(t => t + 1); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) { topsheetImgRef.current = img; setTopsheetTick(t => t + 1); } };
    img.onerror = () => { if (!cancelled) { topsheetImgRef.current = null; setTopsheetTick(t => t + 1); } };
    img.src = src;
    return () => { cancelled = true; };
  }, [topsheet && topsheet.src]);
  const edgeHandleRef = useRef(null);  // screen positions of edge-extension drag handles
  const [hovered, setHovered] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [handleAngle, setHandleAngle] = useState(null);  // live tangent-handle angle readout during drag
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
  // Pair view: fit BOTH skis (side by side across the width) so the view resizes instead of clipping.
  const pairGapMM = 24;
  const pairLatW = pairView ? (skiMaxW * 2 + pairGapMM) : skiMaxW;   // lateral extent to fit
  const cOff = pairView ? (skiMaxW + pairGapMM) / 2 : 0;             // each ski's offset from plot centerline
  const mainScale = isVertical
    ? Math.min(mainPlotH / ski.length, mainPlotW / pairLatW)
    : Math.min(mainPlotW / ski.length, mainPlotH / pairLatW);
  const mainCenterY = mainRowY + mainPadY + mainPlotH / 2;
  const mainCenterX = mainPadX + mainPlotW / 2;
  const mainOriginX = mainPadX + (mainPlotW - ski.length * mainScale) / 2;
  // Vertical: mainTailY is the canvas-Y where skiY=0 (tail) sits — near the bottom of the plot region
  const mainTailY = mainRowY + mainPadY + (mainPlotH + ski.length * mainScale) / 2;
  // Pivot for main-view zoom: the center of the main plot region.
  const mainPivotX = isVertical ? (mainColW / 2) : (mainOriginX + ski.length * mainScale / 2);
  const mainPivotY = isVertical ? (mainRowY + mainRowH / 2) : mainCenterY;
  // Lateral is expressed in "plot" coordinates (0 = plot centerline). Ski A sits at -cOff, its mirror
  // partner at +cOff. In single-ski mode cOff=0 so this reduces to the original transform exactly.
  const toMainLat = (latPlot, skiY) => {
    const b = isVertical
      ? { x: mainCenterX + latPlot * mainScale, y: mainTailY - skiY * mainScale }
      : { x: mainOriginX + skiY * mainScale, y: mainCenterY + latPlot * mainScale };
    return {
      x: mainPivotX + (b.x - mainPivotX) * mainZoom + mainPan.x,
      y: mainPivotY + (b.y - mainPivotY) * mainZoom + mainPan.y,
    };
  };
  const toMain = (skiX, skiY) => toMainLat(skiX - cOff, skiY);
  const toMainPartner = (skiX, skiY) => toMainLat(cOff - skiX, skiY);

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
    // Waist dots are editable in BOTH axes: lateral drag → waistWidth, along-ski drag → waistPosition
    // (so you can slide the waist fore/aft right on the plan view instead of hunting for the sidebar
    // setting). Handled by the dedicated "waist" drag type below.
    cps.push({ id:"ww_r",  skiX: (ski.asymSidecut ? ski.waistInside : ski.waistWidth)/2, skiY: waistY, type:"waist", param: ski.asymSidecut ? "waistInside" : "waistWidth", mult:2,  frames:["main"] });
    cps.push({ id:"ww_l",  skiX:-(ski.asymSidecut ? ski.waistOutside : ski.waistWidth)/2, skiY: waistY, type:"waist", param: ski.asymSidecut ? "waistOutside" : "waistWidth", mult:-2, frames:["main"] });

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

    // Reference ghost (from the Ski Database) — a plain dimension envelope from the four known numbers,
    // drawn dashed behind the design with the tip/waist/tail widths labeled. Not the real ski's shape.
    if (refGhost && refGhost.lengthMM) {
      try {
        const g = buildRefGhostOutline(refGhost.lengthMM, refGhost.tip, refGhost.waist, refGhost.tail);
        const shift = (ski.length - refGhost.lengthMM) / 2;
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = "rgba(200,147,90,0.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        g.outline.forEach((p, i) => { const s = toMain(p.x, p.y + shift); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
        ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
        // Width labels at tip / waist / tail so it reads as a dimension reference.
        ctx.fillStyle = "rgba(200,147,90,0.9)";
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const lab = (val, hw, y) => { const s = toMain(hw + 6, y + shift); ctx.fillText(String(val), s.x, s.y); };
        lab(refGhost.tip, g.tHW, g.tipContact);
        lab(refGhost.waist, g.wHW, refGhost.lengthMM / 2);
        lab(refGhost.tail, g.taHW, g.tailContact);
        ctx.restore();
      } catch (e) {}
    }

    // Ski outline(s). In pair view we also draw the mirrored partner ski below, and (if art is loaded)
    // project the topsheet across BOTH skis so asymmetric tips and split graphics read as a set.
    const mapA = (p) => toMain(p.x, p.y);
    // Partner ski = mirror across the plot centerline (handled by toMainPartner), auto-positioned in
    // the second band. The view already resized (via pairLatW) so both fit without dragging.
    const mapB = (p) => toMainPartner(p.x, p.y);
    const tracePath = (mapFn) => {
      ctx.beginPath();
      right.forEach((p, i) => { const s = mapFn(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      for (let i = left.length - 1; i >= 0; i--) { const s = mapFn(left[i]); ctx.lineTo(s.x, s.y); }
      ctx.closePath();
    };

    ctx.save();
    ctx.shadowColor = C.skiGlow; ctx.shadowBlur = 8;
    tracePath(mapA);
    ctx.fillStyle = C.skiFill; ctx.fill();
    ctx.strokeStyle = C.skiStroke; ctx.lineWidth = 1.8; ctx.stroke();
    if (pairView) { tracePath(mapB); ctx.fillStyle = C.skiFill; ctx.fill(); ctx.strokeStyle = C.skiStroke; ctx.lineWidth = 1.8; ctx.stroke(); }
    ctx.restore();

    // Inside / outside edge labels when either asymmetry mode is on (outside = -x edge, inside = +x edge).
    if (ski.asymSidecut || ski.asymContact) {
      try {
        const wy = resolveWaistY(ski);
        const oHW = (ski.waistOutside != null ? ski.waistOutside : ski.waistWidth) / 2;
        const iHW = (ski.waistInside != null ? ski.waistInside : ski.waistWidth) / 2;
        ctx.save();
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.fillStyle = C.heading; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const sO = toMain(-(oHW + 11), wy), sI = toMain(iHW + 11, wy);
        ctx.fillText("OUTSIDE", sO.x, sO.y);
        ctx.fillText("INSIDE", sI.x, sI.y);
        ctx.restore();
      } catch (e) {}
    }

    // ── Topsheet artwork ──────────────────────────────────────────
    if (topsheet && topsheet.src && topsheetImgRef.current) {
      // Combined on-screen bounding box (both skis in pair view, else just ski A). The art is fit to
      // this box, so each ski shows its slice of one continuous image.
      let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
      const acc = (s) => { if (s.x < bMinX) bMinX = s.x; if (s.x > bMaxX) bMaxX = s.x; if (s.y < bMinY) bMinY = s.y; if (s.y > bMaxY) bMaxY = s.y; };
      right.concat(left).forEach(p => { acc(mapA(p)); if (pairView) acc(mapB(p)); });
      const box = { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY };
      const rowClip = () => { ctx.beginPath(); if (isVertical) ctx.rect(0, 0, mainColW, height); else ctx.rect(0, mainRowY, width, mainRowH); ctx.clip(); };
      const paint = (mapFn) => { ctx.save(); rowClip(); tracePath(mapFn); ctx.clip(); drawTopsheetImage(ctx, topsheetImgRef.current, box, topsheet); ctx.restore(); };
      paint(mapA);
      if (pairView) paint(mapB);
      // Re-stroke outlines on top for crisp edges over the artwork.
      ctx.save(); tracePath(mapA); ctx.strokeStyle = C.skiStroke; ctx.lineWidth = 1.8; ctx.stroke();
      if (pairView) { tracePath(mapB); ctx.strokeStyle = C.skiStroke; ctx.lineWidth = 1.8; ctx.stroke(); }
      ctx.restore();
    }

    // ── Effective-edge highlight ──────────────────────────────────
    // Overlay the contact-to-contact portion of each edge (the actual turning section / sidecut) in
    // torch so you can see where the running edge starts and ends — and, with an off-center waist,
    // how much shorter the sidecut is on one side. Also marks the waist apex on each edge.
    {
      const eps = 0.5, Lp = ski.length;
      const oc = sideContact(ski, "out"), ic = sideContact(ski, "in");
      const tipCYin = Lp - ic.tipL, tailCYin = ic.tailL;    // right (+x) = inside
      const tipCYout = Lp - oc.tipL, tailCYout = oc.tailL;  // left (-x) = outside
      const drawEdgeSpan = (side, tailCY, tipCY) => {
        ctx.beginPath();
        let started = false;
        side.forEach(p => {
          if (p.y >= tailCY - eps && p.y <= tipCY + eps) {
            const s = toMain(p.x, p.y);
            if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
          }
        });
        ctx.stroke();
      };
      ctx.save();
      ctx.strokeStyle = C.contactLabel || "#f0895c";
      ctx.lineWidth = 2.6;
      ctx.shadowColor = "rgba(232,85,42,0.5)"; ctx.shadowBlur = 6;
      drawEdgeSpan(right, tailCYin, tipCYin);
      drawEdgeSpan(left, tailCYout, tipCYout);
      ctx.restore();
      // Contact-point dots on each edge (both sides × tip/tail contact), per-side.
      ctx.fillStyle = C.contactLabel || "#f0895c";
      [[ski.tailWidth / 2, tailCYin], [ski.tipWidth / 2, tipCYin],
       [-ski.tailWidth / 2, tailCYout], [-ski.tipWidth / 2, tipCYout]].forEach(([x, y]) => {
        const s = toMain(x, y);
        ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
      });
    }

    // ── V-cut core-fill preview ──────────────────────────────────
    // Only shown when a tip/tail V-cut is enabled (keeps the view clean otherwise). Draws the core
    // outline terminating in the V at the cut end(s), in brass, so you can see where the wood core
    // ends and the fill triangle begins.
    if (ski.vcutTip || ski.vcutTail) {
      const loop = applyVCutToCore(ski);   // X=length space; swap to plan (skiX=y, skiY=x)
      ctx.save();
      ctx.strokeStyle = C.coreStroke || "#c8935a";
      ctx.lineWidth = 1.6; ctx.setLineDash([5, 3]);
      ctx.beginPath();
      loop.forEach((p, i) => {
        const s = toMain(p.y, p.x);   // p.x is along-length, p.y is lateral → toMain(lateral, along)
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      // Label the fill triangles
      ctx.fillStyle = C.coreStroke || "#c8935a";
      ctx.font = "8px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
      if (ski.vcutTip) {
        const apex = toMain(0, (ski.length - ski.tipLength) + (ski.vcutTipExt || 0));
        ctx.fillText("FILL", apex.x, apex.y - 4);
      }
      if (ski.vcutTail) {
        const apex = toMain(0, ski.tailLength - (ski.vcutTailExt || 0));
        ctx.fillText("FILL", apex.x, apex.y + 10);
      }
      ctx.restore();
    }

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

    // ── Binding inserts (snowboard mode) ──────────────────────────
    // Drill-center circles (2x4 / 4x4) or centered channel slots per foot, positioned by stance
    // width + setback. Drawn in torch so they stand out on the base. A short cross marks each pack
    // center (the mount reference).
    if ((ski.mode || "ski") === "snowboard") {
      const ins = computeInserts(ski);
      ctx.save();
      // Holes
      ctx.strokeStyle = C.control; ctx.fillStyle = "rgba(232,85,42,0.20)"; ctx.lineWidth = 1.4;
      ins.holes.forEach(h => {
        const s = toMain(h.x, h.y);
        const r = 3.2 * mainScale > 3 ? 3.2 * mainScale : 4;  // ~6.4mm insert, min 4px
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      // Channel slots
      ins.slots.forEach(sl => {
        const a = toMain(sl.x, sl.y0), b = toMain(sl.x, sl.y1);
        const w = Math.max(4, sl.width * mainScale);
        ctx.strokeStyle = C.control; ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.lineCap = "butt";
      });
      // Pack-center crosses + foot labels
      ctx.strokeStyle = C.heading; ctx.fillStyle = C.heading; ctx.lineWidth = 1;
      ctx.font = "8px 'JetBrains Mono', monospace";
      ins.packs.forEach(p => {
        const c = toMain(0, p.y);
        ctx.beginPath();
        ctx.moveTo(c.x - 7, c.y); ctx.lineTo(c.x + 7, c.y);
        ctx.moveTo(c.x, c.y - 7); ctx.lineTo(c.x, c.y + 7);
        ctx.stroke();
      });
      ctx.restore();
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

    // Live tangent-handle angle readout (during a handle drag). Shows the physical angle and turns
    // torch + "SNAP" when sitting on a detent, so you can tell exactly where the handle points.
    if (handleAngle && dragging && String(dragging).includes("_t")) {
      const cp = cps.find(c => c.id === dragging);
      if (cp) {
        const frame = dragStart?.frame;
        const s = frame === "tip" ? toTip(cp.skiX, cp.skiY) : frame === "tail" ? toTail(cp.skiX, cp.skiY) : toMain(cp.skiX, cp.skiY);
        const label = `${handleAngle.deg}\u00B0${handleAngle.snapped ? " SNAP" : ""}`;
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        const tw = ctx.measureText(label).width;
        const bx = s.x + 12, by = s.y - 22;
        ctx.fillStyle = "rgba(20,18,16,0.9)";
        ctx.fillRect(bx - 4, by - 12, tw + 8, 18);
        ctx.strokeStyle = handleAngle.snapped ? (C.contactLabel || "#f0895c") : C.panelBorder;
        ctx.lineWidth = 1; ctx.strokeRect(bx - 4, by - 12, tw + 8, 18);
        ctx.fillStyle = handleAngle.snapped ? (C.contactLabel || "#f0895c") : C.value;
        ctx.textAlign = "left"; ctx.fillText(label, bx, by + 1);
      }
    }
  }, [ski, width, height, right, left, waistY, tipContactY, tailContactY, cps, hovered, dragging, isVertical, handleAngle, dragStart,
      mainScale, mainOriginX, mainCenterY, mainRowY, mainRowH,
      tailScale, tailOriginX, tailCenterY, tailZoomX, tailZoomY, zoomPanelW, zoomPanelH, zoomRowY, tailViewMinY, tailViewSpanY,
      tipScale, tipOriginX, tipCenterY, tipZoomX, tipZoomY, tipViewMinY, tipViewSpanY,
      tipZoom, tailZoom, tipPan, tailPan, mainZoom, mainPan, topsheet, topsheetTick, pairView, refGhost]);

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

    // Edge-extension endpoints (square markers) are visual reference only — edited via the sidebar
    // "Tip end / Tail end" inputs for accuracy, not by dragging (dragging them was error-prone at the tip).

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
  // Double-click a control node or tangent handle → reset THAT node to its default shape position
  // (the tester's ask: undo an accidental drag without hunting for the exact value). If not over a
  // node, fall back to resetting the zoom/pan of the panel under the cursor.
  const handleDoubleClick = useCallback(e => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    const id = findCP(mx, my);
    if (id) {
      const cp = cps.find(c => c.id === id);
      if (cp && (cp.type?.endsWith("Node") || cp.type?.endsWith("Tangent"))) {
        // Which node array + default shape does this handle belong to?
        const isTip = cp.isTip;
        const sideR = cp.type.startsWith("tipR") || cp.type.startsWith("tailR");
        const param = isTip ? (sideR ? "tipNodesR" : "tipNodesL") : (sideR ? "tailNodesR" : "tailNodesL");
        const defShape = isTip ? makeRoundedTip() : makeRoundedTail();
        const def = defShape[cp.idx];
        if (def) {
          setSki(s => {
            const arr = (s[param] || (isTip ? makeRoundedTip() : makeRoundedTail())).map(n => ({ ...n }));
            if (cp.type.endsWith("Node")) { arr[cp.idx].x = def.x; arr[cp.idx].y = def.y; }
            else { arr[cp.idx].tx = def.tx; arr[cp.idx].ty = def.ty; }
            const next = { ...s, [param]: arr };
            // Keep symmetric side mirrored if applicable.
            if (isTip && s.tipSymmetric) next.tipNodesL = arr.map(n => ({ ...n }));
            if (!isTip && s.tailSymmetric) next.tailNodesL = arr.map(n => ({ ...n }));
            return next;
          });
          return;
        }
      }
    }

    const frame = findDragFrame(mx, my);
    if (frame === "tip")  { setTipZoom(1);  setTipPan({ x: 0, y: 0 }); }
    if (frame === "tail") { setTailZoom(1); setTailPan({ x: 0, y: 0 }); }
    if (frame === "main") { setMainZoom(1); setMainPan({ x: 0, y: 0 }); }
  }, [findCP, cps, findDragFrame, setSki]);

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

      if (cp.type === "waist") {
        // Lateral drag → waistWidth; along-ski drag → waistPosition. The along-ski divisor matches the
        // reference frame: full length in full-length mode, else the contact-to-contact span.
        const full = dragStart.ski.waistFullLength;
        const span = full
          ? dragStart.ski.length
          : (dragStart.ski.length - dragStart.ski.tipLength - dragStart.ski.tailLength);
        const startWP = dragStart.ski.waistPosition !== undefined ? dragStart.ski.waistPosition : 0.48;
        const lo = full ? 0.10 : 0.30, hi = full ? 0.90 : 0.70;
        const wp = cp.param || "waistWidth";
        setSki(s => ({
          ...s,
          [wp]: clamp(Math.round(dragStart.ski[wp] + dSkiX * cp.mult), 50, 320),
          waistPosition: span > 0 ? clamp(startWP + dSkiY / span, lo, hi) : startWP,
        }));
        return;
      }

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
        // Tangent handle drag — pure bezier shape edit, no dimension changes. The handle follows the
        // cursor 1:1 (no forced snapping — that fought the drag). We only REPORT the physical angle so
        // you can see when you cross 90° (past which the curve can dimple), and flag when you're
        // sitting within a couple degrees of a notable angle.
        const ntx = nodes[cp.idx].tx + dNx;
        const nty = nodes[cp.idx].ty + dNy;
        // Physical direction of the handle on the ski (mm space). Screen angle: atan2(lateral, along).
        const physAlong = nty * ySpan;              // along-ski component (mm)
        const physLat = ntx * wHalf * sign;          // lateral component (mm)
        const mag = Math.hypot(physAlong, physLat);
        if (mag > 1e-6) {
          let deg = Math.atan2(physLat, physAlong) * 180 / Math.PI;  // 0° = straight along ski toward end
          deg = ((deg % 360) + 360) % 360;
          const near = [0, 45, 90, 135, 180, 225, 270, 315, 360].some(d => Math.abs(((deg - d + 540) % 360) - 180) < 2.5);
          setHandleAngle({ deg: Math.round(deg), snapped: near });
        }
        newNodes[cp.idx].tx = ntx;
        newNodes[cp.idx].ty = nty;
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

  const handleUp = useCallback(() => { setDragging(null); setDragStart(null); setPanning(null); setHandleAngle(null); }, []);

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
function ProfileView({ ski, setSki, width, height }) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [dragging, setDragging] = useState(null);
  const handlesRef = useRef([]);        // last-drawn handle screen positions + metadata
  const dragXformRef = useRef(null);     // vertical transform frozen for the duration of a drag
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
    // Profile heights are tiny vs length, so we exaggerate Y for readability (capped at 3×). While a
    // handle is being dragged we FREEZE this vertical transform so the profile doesn't rescale under
    // the cursor mid-drag (the max-height value changing would otherwise shift the whole curve).
    let yScale, baseY, yExagg = 1.0;
    if (dragging && dragXformRef.current) {
      yScale = dragXformRef.current.yScale; baseY = dragXformRef.current.baseY; yExagg = dragXformRef.current.yExagg;
    } else {
      const MAX_Y_EXAGG = 3.0;
      const maxH = Math.max(TH, TAH, CH) + 5;
      const trueHpx = maxH * xScale;
      const idealHpx = plotH * 0.72;
      yScale = xScale;
      if (trueHpx < idealHpx) { yExagg = Math.min(MAX_Y_EXAGG, idealHpx / trueHpx); yScale = xScale * yExagg; }
      const profileHpx = maxH * yScale;
      baseY = Math.min(padTop + plotH * 0.92, padTop + profileHpx + plotH * 0.12);
    }
    const toC = (xmm, ymm) => ({ x: padX + xmm * xScale, y: baseY - ymm * yScale });

    // Snow line
    ctx.strokeStyle = C.snow; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, baseY);
    ctx.lineTo(padX + plotW, baseY);
    ctx.stroke();

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

    // ── Draggable measurement handles: tail rise, tip rise, camber peak ──
    const tk = rockerTakeoffLens(ski);
    const camberMidX = (tk.tail + (L - tk.tip)) / 2;   // midpoint between takeoffs (camber peak)
    const handleDefs = [
      { key: "tailHeight", xmm: 0, ymm: TAH, min: 5, max: 60, step: 1, align: "left" },
      { key: "tipHeight",  xmm: L, ymm: TH,  min: 5, max: 80, step: 1, align: "right" },
      { key: "camberHeight", xmm: camberMidX, ymm: CH, min: 0, max: 10, step: 0.5, align: "center" },
    ];
    const handles = handleDefs.map(h => { const s = toC(h.xmm, h.ymm); return { ...h, x: s.x, y: s.y, yScale, baseY, yExagg }; });
    handlesRef.current = handles;

    // Value labels (kept, nudged above the handle)
    ctx.fillStyle = C.heading;
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    handles.forEach(h => {
      ctx.textAlign = h.align;
      const val = h.step < 1 ? h.ymm.toFixed(1) : Math.round(h.ymm);
      ctx.fillText(`${val}mm`, h.x + (h.align === "left" ? 8 : h.align === "right" ? -8 : 0), h.y - 11);
    });

    // Handle dots
    handles.forEach(h => {
      const active = dragging === h.key || hovered === h.key;
      ctx.beginPath(); ctx.arc(h.x, h.y, active ? 7 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = active ? C.controlHover : C.heading; ctx.fill();
      ctx.strokeStyle = C.bgDeep; ctx.lineWidth = 1.5; ctx.stroke();
    });

    ctx.fillStyle = C.dimText;
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";  ctx.fillText("TAIL", padX + 6, baseY - 4);
    ctx.textAlign = "right"; ctx.fillText("TIP",  padX + plotW - 6, baseY - 4);

    ctx.fillStyle = C.labelDim;
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`drag \u25CF to set tip / tail rise & camber${yExagg > 1.05 ? `  \u00B7  Y ${yExagg.toFixed(1)}\u00D7 exaggerated` : ""}`, padX + 6, height - 6);
  }, [ski, setSki, width, height, TL, TAIL, TH, TAH, CH, L, hovered, dragging]);

  const getPos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hitTest = (p) => handlesRef.current.find(h => Math.hypot(p.x - h.x, p.y - h.y) <= 11);
  const onDown = (e) => {
    const h = hitTest(getPos(e));
    if (h) { dragXformRef.current = { yScale: h.yScale, baseY: h.baseY, yExagg: h.yExagg }; setDragging(h.key); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {} }
  };
  const onMove = (e) => {
    const p = getPos(e);
    if (dragging) {
      const xf = dragXformRef.current; if (!xf) return;
      const meta = handlesRef.current.find(h => h.key === dragging); if (!meta) return;
      let ymm = (xf.baseY - p.y) / xf.yScale;
      ymm = Math.max(meta.min, Math.min(meta.max, ymm));
      ymm = Math.round(ymm / meta.step) * meta.step;
      setSki(s => (s[dragging] === ymm ? s : { ...s, [dragging]: ymm }));
    } else {
      const h = hitTest(p);
      setHovered(h ? h.key : null);
    }
  };
  const onUp = (e) => { if (dragging) { setDragging(null); dragXformRef.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {} } };
  const cursor = dragging ? "grabbing" : hovered ? "grab" : "default";
  return (<canvas ref={canvasRef}
    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
    onPointerLeave={() => { if (!dragging) setHovered(null); }}
    style={{ width, height, cursor, display: "block", touchAction: "none" }} />);
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
      ctx.fillStyle = C.contactLabel || "#f0895c";
      ctx.font = "bold 8px 'JetBrains Mono', monospace";
      ctx.save(); ctx.translate(x - 2, padT + 3); ctx.rotate(Math.PI / 2);
      ctx.textAlign = "left"; ctx.fillText(lbl, 0, 0); ctx.restore();
    });
    // WAIST reference line (boot center) — light bone, so you can align the thickest part of the
    // core to it. Sits between the contacts at the resolved waist position.
    {
      const wY = resolveWaistY(ski);
      const tailCmm = ski.tailLength, tipCmm = ski.length - ski.tipLength;
      const waistPos = tailContactPos + (tipContactPos - tailContactPos) * ((wY - tailCmm) / (tipCmm - tailCmm));
      const x = padL + waistPos * plotW;
      ctx.strokeStyle = C.waistLine || "rgba(237,230,216,0.65)";
      ctx.lineWidth = 1.2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, baseY); ctx.stroke();
      ctx.fillStyle = C.waistLabel || "#f3ecdd";
      ctx.font = "bold 8px 'JetBrains Mono', monospace";
      ctx.save(); ctx.translate(x - 2, padT + 3); ctx.rotate(Math.PI / 2);
      ctx.textAlign = "left"; ctx.fillText("WAIST", 0, 0); ctx.restore();
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
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";  ctx.fillText("TAIL", padL + 3, baseY - 4);
    ctx.textAlign = "right"; ctx.fillText("TIP",  padL + plotW - 3, baseY - 4);
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
      ctx.fillStyle = C.contactLabel || "#f0895c";
      ctx.font = "bold 8px 'JetBrains Mono', monospace";
      ctx.save(); ctx.translate(x - 2, padT + 3); ctx.rotate(Math.PI / 2);
      ctx.textAlign = "left"; ctx.fillText(lbl, 0, 0); ctx.restore();
    });
    // WAIST reference line (boot center) — light bone, matches the core view.
    {
      const wY = resolveWaistY(ski);
      const tailCmm = ski.tailLength, tipCmm = ski.length - ski.tipLength;
      const waistPos = tailContactPos + (tipContactPos - tailContactPos) * ((wY - tailCmm) / (tipCmm - tailCmm));
      const x = padL + waistPos * plotW;
      ctx.strokeStyle = C.waistLine || "rgba(237,230,216,0.65)";
      ctx.lineWidth = 1.2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, baseYF); ctx.stroke();
      ctx.fillStyle = C.waistLabel || "#f3ecdd";
      ctx.font = "bold 8px 'JetBrains Mono', monospace";
      ctx.save(); ctx.translate(x - 2, padT + 3); ctx.rotate(Math.PI / 2);
      ctx.textAlign = "left"; ctx.fillText("WAIST", 0, 0); ctx.restore();
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

    ctx.fillStyle = C.dimText; ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";  ctx.fillText("TAIL", padL + 3, baseYF - 4);
    ctx.textAlign = "right"; ctx.fillText("TIP",  padL + plotW - 3, baseYF - 4);

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
    interestedGcode: false,
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
          interested_in_gcode_export: form.interestedGcode ? "Yes" : "No",
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
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 10 }}>
                  <input type="checkbox" checked={form.interestedForum}
                    onChange={e => handleField("interestedForum", e.target.checked)}
                    style={{ marginTop: 3, accentColor: C.heading, cursor: "pointer" }} />
                  <span style={{ color: C.value, fontSize: 13, lineHeight: 1.4 }}>
                    I'd be interested in joining a new forum — similar to the old skibuilders.com forum if it were revived.
                  </span>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.interestedGcode}
                    onChange={e => handleField("interestedGcode", e.target.checked)}
                    style={{ marginTop: 3, accentColor: C.heading, cursor: "pointer" }} />
                  <span style={{ color: C.value, fontSize: 13, lineHeight: 1.4 }}>
                    I'd use direct G-code (CNC toolpath) export — cut parts straight from the designer without a separate CAM program.
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
// Sidebar navigation model — drives the jump-to chips, per-group collapse, and the search box. The
// bespoke panel CONTENT stays in the JSX below; this only carries keys, labels and search terms.
const SIDEBAR_GROUPS = [
  { id: "g1", num: "1", label: "SET UP", caption: "Start a design or open a saved one, and choose how to view it.", sections: [
    { key: "gettingStarted", title: "Getting Started", terms: "onboarding help start tutorial guide steps" },
    { key: "file", title: "File", terms: "save load new open import export bcski download" },
    { key: "views", title: "Views", terms: "pair single 3d view render preview" },
  ]},
  { id: "g2", num: "2", label: "DESIGN", caption: "Shape the ski — dimensions, rocker & camber, core, and layup.", sections: [
    { key: "presets", title: "Presets", terms: "preset template starting shape example" },
    { key: "dimensions", title: "Dimensions", terms: "length width waist tip tail nose radius sidecut mm dimensions taper" },
    { key: "snowboard", title: "Snowboard", terms: "stance setback insert binding board pack", mode: "snowboard" },
    { key: "sideProfile", title: "Side Profile", terms: "rocker camber tip rise tail rise profile height elevation" },
    { key: "symmetry", title: "Symmetry", terms: "symmetric mirror tip tail nodes bezier asymmetric" },
    { key: "coreFill", title: "Core", terms: "core inset v-cut vcut fill notch spear swallowtail sidewall" },
    { key: "layup", title: "Layup / Materials", terms: "layup fiber fabric glass carbon biax triax metal titanal wood core flex stiffness ud stringer epoxy flax" },
  ]},
  { id: "g3", num: "3", label: "ARTWORK", caption: "Wrap a topsheet image, preview the pair, and view it in 3D.", sections: [
    { key: "topsheet", title: "Topsheet Art", terms: "topsheet art image graphic overlay png preview scale rotate" },
  ]},
  { id: "g4", num: "4", label: "ANALYZE", caption: "Check the flex profile and a materials + cost estimate.", sections: [
    { key: "flex", title: "Flex", terms: "flex stiffness ei bend rating profile soft stiff" },
    { key: "materials", title: "Bill of Materials", terms: "bom bill materials cost price estimate mass budget" },
  ]},
  { id: "g5", num: "5", label: "EXPORT", caption: "CNC cut files (DXF/SVG/STL) and a branded build card.", sections: [
    { key: "cncExport", title: "CNC Export", terms: "cnc export dxf svg stl core base cut orientation vertical horizontal" },
    { key: "cam", title: "CNC G-code (CAM)", terms: "cam gcode g-code toolpath nc centroid avid mill router core profile perimeter feed spindle stepover stepdown machine" },
    { key: "buildCard", title: "Build Card", terms: "build card spec sheet brand logo png svg summary" },
  ]},
  { id: "g6", num: "6", label: "MORE", caption: "Suppliers, external calculators, and a place to send feedback.", sections: [
    { key: "suppliers", title: "Material Suppliers", terms: "materials suppliers junksupply sandwich tech buy shop store" },
    { key: "externalTools", title: "External Tools", terms: "external tools calculator sooth junk link" },
    { key: "beta", title: "Beta / Feedback", terms: "beta feedback contact bug report" },
  ]},
];
const SECTION_META = {};
SIDEBAR_GROUPS.forEach(g => g.sections.forEach(s => { SECTION_META[s.key] = { ...s, group: g.id }; }));

// Material suppliers, ordered nearest-first from the browser's IANA timezone — no geolocation prompt,
// no IP lookup, no network call. Americas → the US supplier first; everywhere else → the EU supplier.
const USER_REGION = (() => {
  try { return /^America\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone || "") ? "US" : "EU"; }
  catch (e) { return "EU"; }
})();
const SUPPLIERS = [
  { name: "Sandwich Tech", region: "US", url: "https://sandwichtechskis.com/" },
  { name: "JunkSupply", region: "EU", url: "https://www.junksupply.com/" },
];
const ORDERED_SUPPLIERS = [...SUPPLIERS].sort((a, b) => (a.region === USER_REGION ? 0 : 1) - (b.region === USER_REGION ? 0 : 1));

function AccordionSection({ isOpen, onToggle, title, accent, children }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.panelBorder}` }}>
      <div style={{
        display: "flex", alignItems: "center", width: "100%",
        // Open panels keep their title pinned just below the sticky top bar while their (often long)
        // content scrolls, so you always know which section you're in. Bounded by the panel, so the
        // next open panel pushes it away.
        position: isOpen ? "sticky" : "static", top: "var(--sb-bar-h, 66px)", zIndex: 4, background: C.panel,
      }}>
        {/* Title button takes the available space so its click target is the whole left area. */}
        <button
          onClick={onToggle}
          style={{
            flex: 1, minWidth: 0, padding: "9px 6px 9px 12px", background: "transparent", border: "none",
            display: "flex", alignItems: "center", cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{
            color: C.heading, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{title}</span>
        </button>
        {/* Accent (info bubble / status chip) sits just left of the triangle, not affecting its position. */}
        {accent && <span style={{ display: "inline-flex", alignItems: "center", marginRight: 8, flexShrink: 0 }}>{accent}</span>}
        {/* Triangle is always the last item → always flush right, identical on every row. */}
        <button
          onClick={onToggle}
          aria-label={isOpen ? "Collapse" : "Expand"}
          style={{
            background: "transparent", border: "none", cursor: "pointer", padding: "9px 12px 9px 0",
            color: C.heading, fontSize: 16, fontFamily: "monospace", lineHeight: 1, flexShrink: 0,
          }}>
          {isOpen ? "\u25BC" : "\u25B6"}
        </button>
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
// A small "i" icon that reveals a tooltip on hover (or tap on touch). The tooltip is rendered as a
// FIXED-position layer anchored to the button's on-screen rect, so it floats OVER the main view and
// is never clipped by the sidebar's overflow (a plain absolute tooltip gets cropped by the scrolling
// sidebar; a high z-index alone can't fix that because clipping happens before stacking).
function InfoBubble({ C, children, width = 250 }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    // Prefer opening to the right of the icon; flip left if it would overflow the viewport.
    let left = r.right + 6;
    if (left + width + margin > window.innerWidth) left = r.left - width - 6;
    if (left < margin) left = margin;
    let top = r.top;
    // Keep within the viewport vertically (tooltip is short, but guard the bottom).
    const maxTop = window.innerHeight - 160;
    if (top > maxTop) top = Math.max(margin, maxTop);
    setPos({ top, left });
  }, [width]);

  const show = useCallback(() => { place(); setOpen(true); }, [place]);
  const hide = useCallback(() => setOpen(false), []);

  return (
    <span style={{ display: "inline-flex" }}
      onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={btnRef}
        onClick={() => (open ? hide() : show())}
        aria-label="Help"
        style={{
          width: 16, height: 16, borderRadius: "50%", border: `1px solid ${C.labelDim}`,
          background: open ? C.heading : "transparent", color: open ? C.bgDeep : C.labelDim,
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, lineHeight: 1,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}>i</button>
      {open && pos && (
        <div style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width,
          background: C.panel || "#1c1916", border: `1px solid ${C.panelBorder || "#37322c"}`,
          borderRadius: 5, padding: "9px 11px", boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
          color: C.value, fontSize: 11.5, lineHeight: 1.5, fontFamily: "'Inter', system-ui, sans-serif",
          textTransform: "none", letterSpacing: 0, fontWeight: 400, pointerEvents: "none",
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
          <span style={{ color: C.labelDim, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" }}>adjusts</span>
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
      {derived.asymmetric && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <span style={{ color: C.labelDim, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>
            front / back R
          </span>
          <span style={{ color: C.contactLabel || "#f0895c", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            {isFinite(derived.frontRadius) ? derived.frontRadius.toFixed(1) : "--"} / {isFinite(derived.backRadius) ? derived.backRadius.toFixed(1) : "--"} m
          </span>
        </div>
      )}
      {derived.asymmetric && (
        <div style={{ color: C.labelDim, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.4, marginTop: 2 }}>
          Waist off-center → each side turns at a different radius (highlighted on the plan view).
        </div>
      )}
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
  const subLabel = { color: C.labelDim, fontSize: 10.5, textAlign: "center", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" };

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
      <div style={{ color: C.labelDim, fontSize: 10.5, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
        {linked
          ? "Linked: % sets tip/tail length (moves contacts + radius)."
          : "Unlinked: % sets rocker takeoff only. Contacts + radius stay fixed."}
      </div>
    </div>
  );
}

// ══════════════ SHAREABLE PERMALINK ══════════════
// Encodes a design to a URL-safe string (base64url of JSON) and back, so a whole ski/board can be
// shared as a link with no backend. Topsheet art is intentionally excluded (too large for a URL).
function encodeDesign(ski) {
  try {
    const clean = { ...ski };
    delete clean.topsheet;
    const json = JSON.stringify(clean);
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (e) { return null; }
}
function decodeDesign(str) {
  try {
    const b = str.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b)));
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    // Backfill any keys missing from older shares so renders don't break.
    const out = { ...DEFAULT_SKI, ...obj };
    for (const k of Object.keys(DEFAULT_SKI)) {
      const bv = DEFAULT_SKI[k], lv = obj[k];
      if (bv && lv && typeof bv === "object" && typeof lv === "object" && !Array.isArray(bv) && !Array.isArray(lv)) {
        out[k] = { ...bv, ...lv };
      }
    }
    return out;
  } catch (e) { return null; }
}

// ══════════════ 3D PREVIEW ══════════════
// Loads Three.js from a CDN at runtime (once) so the single-file deploy flow needs no new npm deps.
let _threePromise = null;
function loadThree() {
  if (typeof window !== "undefined" && window.THREE) return Promise.resolve(window.THREE);
  if (_threePromise) return _threePromise;
  _threePromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.id = "three-cdn";
    s.src = "https://unpkg.com/three@0.149.0/build/three.min.js";
    s.onload = () => resolve(window.THREE);
    s.onerror = () => reject(new Error("Could not load 3D library"));
    document.head.appendChild(s);
  });
  return _threePromise;
}

function Ski3DModal({ ski, topsheet, pairView, onClose }) {
  const mountRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error

  useEffect(() => {
    let renderer, scene, camera, raf, ro;
    let disposed = false;
    const cleanupFns = [];
    loadThree().then((THREE) => {
      if (disposed || !mountRef.current) return;
      const mount = mountRef.current;
      const W = mount.clientWidth, H = mount.clientHeight;
      scene = new THREE.Scene();
      scene.background = new THREE.Color("#0e0c0a");
      camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(W, H);
      mount.appendChild(renderer.domElement);

      // Lights.
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(6, 12, 8); scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
      dir2.position.set(-8, 6, -6); scene.add(dir2);

      // Geometry (one mesh set; in pair mode it already contains both skis with continuous UVs).
      const g = buildSki3DGeometry(ski, pairView);
      const grp = new THREE.Group();
      const mkGeom = (pos, idx, uv) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        if (uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return geo;
      };
      const topGeo = mkGeom(g.topPos, g.topIdx, g.topUV);
      const botGeo = mkGeom(g.botPos, g.botIdx);
      const wallGeo = mkGeom(g.wallPos, g.wallIdx);

      let topMat;
      if (topsheet && topsheet.src) {
        const tex = new THREE.Texture();
        const im = new Image();
        im.onload = () => { tex.image = im; tex.needsUpdate = true; };
        im.src = topsheet.src;
        tex.colorSpace = THREE.SRGBColorSpace || undefined;
        topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
      } else {
        topMat = new THREE.MeshStandardMaterial({ color: "#c8935a", roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
      }
      const botMat = new THREE.MeshStandardMaterial({ color: "#0e0c0a", roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
      const wallMat = new THREE.MeshStandardMaterial({ color: "#8a8f96", roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide });
      grp.add(new THREE.Mesh(topGeo, topMat));
      grp.add(new THREE.Mesh(botGeo, botMat));
      grp.add(new THREE.Mesh(wallGeo, wallMat));
      scene.add(grp);
      cleanupFns.push(() => { [topGeo, botGeo, wallGeo].forEach(x => x.dispose()); [topMat, botMat, wallMat].forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });

      // Orbit (custom, no OrbitControls dep).
      let az = 0.7, pol = 1.05, rad = g.len * 1.5;
      const updateCam = () => {
        camera.position.set(rad * Math.sin(pol) * Math.sin(az), rad * Math.cos(pol), rad * Math.sin(pol) * Math.cos(az));
        camera.lookAt(0, 0, 0);
      };
      updateCam();
      let drag = null;
      const el = renderer.domElement;
      const onDown = (e) => { drag = { x: e.clientX, y: e.clientY }; };
      const onMove = (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
        az -= dx * 0.008; pol = Math.max(0.15, Math.min(Math.PI - 0.15, pol - dy * 0.008)); updateCam();
      };
      const onUp = () => { drag = null; };
      const onWheel = (e) => { e.preventDefault(); rad = Math.max(g.len * 0.5, Math.min(g.len * 4, rad * (1 + e.deltaY * 0.001))); updateCam(); };
      const onTouchStart = (e) => { if (e.touches[0]) drag = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
      const onTouchMove = (e) => { if (drag && e.touches[0]) { const t = e.touches[0]; const dx = t.clientX - drag.x, dy = t.clientY - drag.y; drag = { x: t.clientX, y: t.clientY }; az -= dx * 0.008; pol = Math.max(0.15, Math.min(Math.PI - 0.15, pol - dy * 0.008)); updateCam(); } };
      el.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
      el.addEventListener("wheel", onWheel, { passive: false });
      el.addEventListener("touchstart", onTouchStart, { passive: true }); el.addEventListener("touchmove", onTouchMove, { passive: true }); el.addEventListener("touchend", onUp);
      cleanupFns.push(() => { el.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); el.removeEventListener("wheel", onWheel); el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchmove", onTouchMove); el.removeEventListener("touchend", onUp); });

      // Gentle auto-spin until the user interacts.
      let spun = false;
      const markSpun = () => { spun = true; };
      el.addEventListener("pointerdown", markSpun);
      const animate = () => {
        raf = requestAnimationFrame(animate);
        if (!spun) { az += 0.003; updateCam(); }
        renderer.render(scene, camera);
      };
      animate();

      ro = new ResizeObserver(() => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight;
        camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
      });
      ro.observe(mount);
      setStatus("ok");
    }).catch(() => { if (!disposed) setStatus("error"); });

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      cleanupFns.forEach(fn => { try { fn(); } catch (e) {} });
      if (renderer) { try { renderer.dispose(); if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); } catch (e) {} }
    };
  }, [ski, topsheet, pairView]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.86)", zIndex: 1000, display: "flex", flexDirection: "column" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #37322c" }}>
        <div style={{ color: "#c8935a", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
          3D PREVIEW · {(ski.designName || "Untitled")}{topsheet && topsheet.src ? " · topsheet mapped" : ""}
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "1px solid #37322c", color: "#ede6d8", padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>Close ✕</button>
      </div>
      <div ref={mountRef} style={{ flex: 1, position: "relative", cursor: "grab", minHeight: 0 }}>
        {status !== "ok" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: status === "error" ? "#e8552a" : "#9b9388", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", textAlign: "center", padding: 20 }}>
            {status === "error"
              ? "Couldn't load the 3D preview (the 3D library may be blocked on your network). Everything else works normally."
              : "Loading 3D preview\u2026"}
          </div>
        )}
      </div>
      <div style={{ padding: "8px 16px", borderTop: "1px solid #37322c", color: "#6f685f", fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", textAlign: "center" }}>
        Drag to rotate · scroll to zoom · topsheet is mapped onto the top surface with rocker &amp; camber
      </div>
    </div>
  );
}

// ══════════════ REFERENCE DATABASE (skis + snowboards) ══════════════
// Loads a static /ski-database.json or /snowboard-database.json once per kind, cached. No backend —
// edit the JSON to grow the database without touching this file.
const _dbCache = {}, _dbPromise = {};
function loadDesignDb(kind) {
  const file = kind === "snowboard" ? "/snowboard-database.json" : "/ski-database.json";
  if (_dbCache[kind]) return Promise.resolve(_dbCache[kind]);
  if (_dbPromise[kind]) return _dbPromise[kind];
  _dbPromise[kind] = fetch(file)
    .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
    .then(d => { _dbCache[kind] = d; return d; })
    .catch(e => { _dbPromise[kind] = null; throw e; });
  return _dbPromise[kind];
}

const WAIST_BANDS_SKI = [
  { key: "all", label: "All widths", test: () => true },
  { key: "carve", label: "\u2039 85", test: w => w < 85 },
  { key: "am", label: "85\u201399", test: w => w >= 85 && w < 100 },
  { key: "free", label: "100\u2013109", test: w => w >= 100 && w < 110 },
  { key: "pow", label: "110 +", test: w => w >= 110 },
];
const WAIST_BANDS_BOARD = [
  { key: "all", label: "All widths", test: () => true },
  { key: "narrow", label: "\u2039 250", test: w => w < 250 },
  { key: "mid", label: "250\u2013255", test: w => w >= 250 && w < 256 },
  { key: "wide", label: "256\u2013260", test: w => w >= 256 && w < 261 },
  { key: "xwide", label: "261 +", test: w => w >= 261 },
];

const CAT_COLORS = { "Carving": "#6ba3d6", "All-Mountain": "#c8935a", "Freeride": "#e8552a", "Powder": "#8fd3e0", "Park": "#8bc48a", "Touring": "#b08fd0", "Freestyle": "#8bc48a", "Splitboard": "#b08fd0" };

// Industry explorer: scatter of waist (x) vs sidecut radius (y) at each ski's mid length, colored by
// category. Tap a dot to select, then load its dimensions or drop it in as a ghost overlay.
function ExploreChart({ list, onApply, onGhost }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const ptsRef = useRef([]);
  const [sel, setSel] = useState(null);
  const [size, setSize] = useState({ w: 600, h: 340 });
  const midR = (s) => s.lengths[Math.floor(s.lengths.length / 2)];
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: Math.max(260, Math.min(420, el.clientWidth * 0.6)) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); const dpr = window.devicePixelRatio || 1;
    const W = size.w, H = size.h;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    if (!list.length) { ctx.fillStyle = C.labelDim; ctx.font = "12px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.fillText("No skis match those filters.", W / 2, H / 2); ptsRef.current = []; return; }
    const padL = 46, padR = 14, padT = 14, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const waists = list.map(s => s.waist), rads = list.map(s => midR(s).r);
    const wMin = Math.min(...waists) - 3, wMax = Math.max(...waists) + 3;
    const rMin = Math.max(0, Math.min(...rads) - 2), rMax = Math.max(...rads) + 2;
    const xOf = (w) => padL + ((w - wMin) / (wMax - wMin || 1)) * plotW;
    const yOf = (r) => padT + plotH - ((r - rMin) / (rMax - rMin || 1)) * plotH;
    ctx.strokeStyle = C.inputBorder; ctx.lineWidth = 1; ctx.fillStyle = C.labelDim; ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let w = Math.ceil(wMin / 10) * 10; w <= wMax; w += 10) { const x = xOf(w); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(String(w), x, padT + plotH + 5); }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let r = Math.ceil(rMin / 5) * 5; r <= rMax; r += 5) { const y = yOf(r); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(r + "m", padL - 6, y); }
    ctx.fillStyle = C.label; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillText("waist (mm)", padL + plotW / 2, H - 13);
    ctx.save(); ctx.translate(13, padT + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("sidecut radius (m)", 0, 0); ctx.restore();
    const pts = [];
    list.forEach(s => {
      const r = midR(s), x = xOf(s.waist), y = yOf(r.r), col = CAT_COLORS[s.category] || C.heading;
      const on = sel && sel.brand === s.brand && sel.model === s.model;
      ctx.beginPath(); ctx.arc(x, y, on ? 6 : 4, 0, Math.PI * 2); ctx.globalAlpha = on ? 1 : 0.85; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
      if (on) { ctx.strokeStyle = C.value; ctx.lineWidth = 1.5; ctx.stroke(); }
      pts.push({ x, y, s, len: r.l, rad: r.r });
    });
    ptsRef.current = pts;
  }, [list, size, sel]);
  const pick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect(); const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bd = 18 * 18;
    ptsRef.current.forEach(p => { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd) { bd = d; best = p; } });
    if (best) setSel({ ...best.s, _len: best.len, _rad: best.rad });
  };
  return (
    <div>
      <div ref={wrapRef} style={{ width: "100%" }}>
        <canvas ref={canvasRef} onPointerDown={pick} style={{ width: size.w, height: size.h, display: "block", cursor: "pointer", touchAction: "none", borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        {[...new Set(list.map(s => s.category))].map(cat => (
          <span key={cat} style={{ display: "flex", alignItems: "center", gap: 4, color: C.labelDim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: CAT_COLORS[cat] || C.heading, display: "inline-block" }} />{cat}
          </span>
        ))}
      </div>
      {sel && (
        <div style={{ marginTop: 10, padding: "10px 12px", border: `1px solid ${C.inputBorder}`, borderRadius: 6, background: C.inputBg }}>
          <div style={{ color: C.value, fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{sel.brand} {sel.model} <span style={{ color: C.labelDim, fontSize: 11 }}>{sel.year}</span></div>
          <div style={{ color: C.heading, fontSize: 12, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{sel.tip}–{sel.waist}–{sel.tail} mm · R{sel._rad} @ {sel._len}cm</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={() => onApply({ brand: sel.brand, model: sel.model, tip: sel.tip, waist: sel.waist, tail: sel.tail, length: sel._len, radius: sel._rad })} style={{ flex: 1, background: C.heading, border: "none", color: C.bgDeep, padding: "8px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>Use dimensions</button>
            <button onClick={() => onGhost({ brand: sel.brand, model: sel.model, tip: sel.tip, waist: sel.waist, tail: sel.tail, length: sel._len })} style={{ flex: 1, background: "transparent", border: `1px solid ${C.heading}`, color: C.heading, padding: "8px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>Ghost overlay</button>
          </div>
        </div>
      )}
      <div style={{ color: C.labelDim, fontSize: 9.5, marginTop: 8, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>Each dot = one ski at its mid length. Tap to select. Powder skis trend top-right (wide, long radius); carvers bottom-left.</div>
    </div>
  );
}

function SkiDatabaseModal({ kind = "ski", onClose, onApply, onGhost }) {
  const isBoard = kind === "snowboard";
  const bandsDef = isBoard ? WAIST_BANDS_BOARD : WAIST_BANDS_SKI;
  const dbTitle = isBoard ? "SNOWBOARD DATABASE" : "SKI DATABASE";
  const dimsWord = isBoard ? "nose\u00b7waist\u00b7tail" : "tip\u00b7waist\u00b7tail";
  const dbFile = isBoard ? "snowboard-database.json" : "ski-database.json";
  const [mode, setMode] = useState("list");   // list | explore
  const [db, setDb] = useState(null);
  const [status, setStatus] = useState("loading");   // loading | ok | error
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [band, setBand] = useState("all");
  const [sort, setSort] = useState("brand");
  useEffect(() => { setStatus("loading"); loadDesignDb(kind).then(d => { setDb(d); setStatus("ok"); }).catch(() => setStatus("error")); }, [kind]);

  const skis = (db && db.skis) || [];
  const cats = ["All", ...((db && db.meta && db.meta.categories) || [...new Set(skis.map(s => s.category))])];
  const bandDef = bandsDef.find(b => b.key === band) || bandsDef[0];
  const ql = q.trim().toLowerCase();
  let list = skis.filter(s =>
    (cat === "All" || s.category === cat) &&
    bandDef.test(s.waist) &&
    (!ql || (`${s.brand} ${s.model}`).toLowerCase().includes(ql))
  );
  list = list.slice().sort((a, b) =>
    sort === "waist" ? a.waist - b.waist :
    sort === "year" ? (b.year - a.year) || a.brand.localeCompare(b.brand) :
    (a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model)));

  const chip = (active, label, onClick, key) => (
    <button key={key} onClick={onClick} style={{
      background: active ? C.heading : C.inputBg, color: active ? C.bgDeep : C.label,
      border: `1px solid ${active ? C.heading : C.inputBorder}`, borderRadius: 3, padding: "5px 10px",
      cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 400, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap",
    }}>{label}</button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.86)", zIndex: 1000, display: "flex", flexDirection: "column" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.bg, margin: "auto", width: "min(920px, 94vw)", height: "min(88vh, 900px)", border: `1px solid ${C.panelBorder}`, borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${C.panelBorder}` }}>
          <div>
            <div style={{ color: C.heading, fontSize: 14, fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>{dbTitle}</div>
            <div style={{ color: C.labelDim, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" }}>Reference shapes from the industry · tap a size to load its dimensions</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[["list", "List"], ["explore", "Explore"]].map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} style={{ background: mode === k ? C.heading : C.inputBg, color: mode === k ? C.bgDeep : C.label, border: `1px solid ${mode === k ? C.heading : C.inputBorder}`, borderRadius: 3, padding: "5px 12px", cursor: "pointer", fontSize: 11, fontWeight: mode === k ? 700 : 400, fontFamily: "'JetBrains Mono', monospace" }}>{l}</button>
              ))}
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.inputBorder}`, color: C.value, padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>Close ✕</button>
          </div>
        </div>

        {status === "ok" && (
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.panelBorder}`, display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search brand or model…"
              style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 4, padding: "8px 10px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {cats.map(c => chip(cat === c, c, () => setCat(c), c))}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              {bandsDef.map(b => chip(band === b.key, b.label, () => setBand(b.key), b.key))}
              <div style={{ flex: 1 }} />
              <span style={{ color: C.labelDim, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" }}>sort</span>
              {[["brand", "A\u2013Z"], ["waist", "Waist"], ["year", "Year"]].map(([k, l]) => chip(sort === k, l, () => setSort(k), k))}
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px", minHeight: 0 }}>
          {status === "loading" && <div style={{ color: C.labelDim, fontSize: 13, textAlign: "center", padding: 40, fontFamily: "'JetBrains Mono', monospace" }}>Loading database…</div>}
          {status === "error" && (
            <div style={{ color: C.torch, fontSize: 12.5, lineHeight: 1.6, padding: 24, fontFamily: "'JetBrains Mono', monospace", textAlign: "center" }}>
              Couldn't load <b>{dbFile}</b>. Make sure the file is in your site's <b>public/</b> folder (served at <b>/ski-database.json</b>), then hard-refresh.
            </div>
          )}
          {status === "ok" && mode === "list" && list.length === 0 && <div style={{ color: C.labelDim, fontSize: 13, textAlign: "center", padding: 40, fontFamily: "'JetBrains Mono', monospace" }}>No skis match those filters.</div>}
          {status === "ok" && mode === "list" && list.map((s, i) => (
            <div key={`${s.brand}-${s.model}-${i}`} style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 6, padding: "12px 14px", marginBottom: 10, background: C.inputBg }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <span style={{ color: C.value, fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{s.brand} {s.model}</span>
                  <span style={{ color: C.labelDim, fontSize: 11, marginLeft: 8, fontFamily: "'JetBrains Mono', monospace" }}>{s.year}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {s.shape && <span style={{ background: C.inputBg, color: C.label, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "2px 8px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{s.shape}</span>}
                  <span style={{ background: C.heading + "22", color: C.heading, border: `1px solid ${C.heading}55`, borderRadius: 3, padding: "2px 8px", fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{s.category}</span>
                </div>
              </div>
              <div style={{ color: C.brass || C.heading, fontSize: 13, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                {s.tip}–{s.waist}–{s.tail} <span style={{ color: C.labelDim, fontSize: 11 }}>mm ({dimsWord})</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {s.lengths.map(len => (
                  <button key={len.l} onClick={() => onApply({ brand: s.brand, model: s.model, tip: s.tip, waist: s.waist, tail: s.tail, length: len.l, radius: len.r })}
                    title={`Load ${s.brand} ${s.model} ${len.l}cm dimensions into the designer`}
                    style={{ background: "transparent", border: `1px solid ${C.heading}`, color: C.heading, borderRadius: 4, padding: "6px 10px", cursor: "pointer", fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                    {len.l}cm <span style={{ color: C.labelDim, fontWeight: 400 }}>· R{len.r}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => onGhost({ brand: s.brand, model: s.model, tip: s.tip, waist: s.waist, tail: s.tail, length: s.lengths[Math.floor(s.lengths.length / 2)].l })}
                style={{ marginTop: 8, background: "transparent", border: `1px dashed ${C.inputBorder}`, color: C.label, borderRadius: 4, padding: "6px 10px", cursor: "pointer", fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" }}>Ghost overlay (compare)</button>
            </div>
          ))}
          {status === "ok" && mode === "explore" && <ExploreChart list={list} onApply={onApply} onGhost={onGhost} />}
        </div>

        <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.panelBorder}`, color: C.labelDim, fontSize: 9.5, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
          {status === "ok" ? `${list.length} of ${skis.length} ${isBoard ? "boards" : "skis"} \u00b7 ` : ""}Reference specs are approximate \u2014 verify against manufacturer sources. Not affiliated with any manufacturer.
        </div>
      </div>
    </div>
  );
}

// ══════════════ MAIN ══════════════
// ── Topsheet Designer: true-scale pair template with paint/gradient/image/text layers + print export ──
// Example print shops (not endorsements) — presented alphabetically. "PBT" is a common printable
// topsheet plastic; these shops sublimate your artwork onto it.
// Example print shops (not endorsements). "PBT" is a printable topsheet plastic these shops sublimate onto.
const TOPSHEET_PRINTERS = [
  { name: "Miller Studio (Auburn, WA)", url: "https://www.millerstudio.us", note: "sublimated topsheet printing" },
  { name: "Sandwich Tech", url: "https://sandwichtechskis.com/printed-pbt-topsheets", note: "prints on PBT topsheet plastic. Upload RGB (their printer converts to CMYK). 150 dpi min, 1\" bleed, up to 180 cm long / 33 cm wide." },
  { name: "Shaggy's Copper Country", url: "https://www.skishaggys.com/products/custom-printed-ski-and-snowboard-topsheets", note: "prints on PBT topsheet plastic. 200 dpi, CMYK, 1\" bleed. Use a rich black (C75 M68 Y67 K100), not 100% K." },
];

// Feeds & speeds helper: chip-load calculator (material + tool Ø + flutes + RPM -> feed/plunge).
// Consistent branded header for full-screen sections (CAM, Topsheet) — logo + title + back.
function BrandBar({ title, subtitle, onClose, C }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 18px", borderBottom: `1px solid ${C.panelBorder}`, background: C.panel, flexShrink: 0, boxShadow: "0 1px 0 rgba(0,0,0,0.25)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <a href="https://blackchapelstudios.com" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", lineHeight: 0, flexShrink: 0 }}>
          <img src="/blackchapel-logo.png" alt="Black Chapel Studios" style={{ height: 34, width: "auto", display: "block" }} />
        </a>
        <div style={{ width: 1, height: 24, background: C.panelBorder, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.heading, fontSize: 12.5, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{title}</div>
          {subtitle && <div style={{ color: C.labelDim, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>}
        </div>
      </div>
      <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.heading}`, color: C.heading, padding: "8px 15px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, letterSpacing: 0.5 }}>← Back to Design</button>
    </div>
  );
}

function FeedsHelper({ toolDiaMM, C, uu, uf, onApply }) {
  const CHIP = { "Softwood": 0.23, "Hardwood": 0.15, "Ply / MDF": 0.18, "Hard plastic": 0.13, "Soft plastic": 0.20, "Aluminum": 0.10, "Foam / core": 0.40 };
  const RPMR = { "Softwood": 18000, "Hardwood": 16000, "Ply / MDF": 18000, "Hard plastic": 13000, "Soft plastic": 12000, "Aluminum": 11000, "Foam / core": 18000 };
  const [open, setOpen] = useState(false);
  const [mat, setMat] = useState("Hardwood");
  const [flutes, setFlutes] = useState(2);
  const [rpm, setRpm] = useState(16000);
  const chip = (CHIP[mat] || 0.15) * Math.min(2.5, Math.max(0.5, (toolDiaMM || 6.35) / 6.35));
  const feedMM = Math.round(rpm * flutes * chip), plungeMM = Math.round(feedMM * 0.35);
  const toU = v => uu === "in" ? +(v / 25.4).toFixed(1) : Math.round(v);
  const feedD = toU(feedMM), plungeD = toU(plungeMM);
  const mono = { fontFamily: "'JetBrains Mono', monospace" };
  const inp = { background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "5px 7px", color: C.value, fontSize: 12, outline: "none", ...mono };
  const sm = { color: C.label, fontSize: 10, marginBottom: 2, ...mono };
  return (
    <div style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 4, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "7px 9px", cursor: "pointer", display: "flex", justifyContent: "space-between", color: C.label, fontSize: 11.5, ...mono }}>
        <span>⚙ Feeds &amp; speeds helper</span><span style={{ color: C.heading }}>{open ? "−" : "+"}</span>
      </div>
      {open && (
        <div style={{ padding: 9, borderTop: `1px solid ${C.inputBorder}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 6 }}>
            <div><div style={sm}>Material</div><select value={mat} onChange={e => { setMat(e.target.value); setRpm(RPMR[e.target.value]); }} style={{ ...inp, width: "100%" }}>{Object.keys(CHIP).map(m => <option key={m} value={m}>{m}</option>)}</select></div>
            <div><div style={sm}>Flutes</div><input type="number" min={1} max={6} value={flutes} onChange={e => setFlutes(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
            <div><div style={sm}>RPM</div><input type="number" step={500} value={rpm} onChange={e => setRpm(parseInt(e.target.value) || 0)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
          </div>
          <div style={{ marginTop: 8, padding: 8, background: C.inputBg, borderRadius: 3, fontSize: 11.5, color: C.value, lineHeight: 1.6, ...mono }}>
            For a {uu === "in" ? +(toolDiaMM / 25.4).toFixed(3) : Math.round(toolDiaMM * 10) / 10} {uu} bit · chip load ≈ {(uu === "in" ? chip / 25.4 : chip).toFixed(uu === "in" ? 4 : 3)} {uu}/tooth<br />
            → <b style={{ color: C.heading }}>Feed {feedD} {uf}</b> · Plunge {plungeD} {uf} · {rpm} rpm
          </div>
          <button onClick={() => onApply(feedD, plungeD, rpm)} style={{ marginTop: 7, width: "100%", background: C.heading, color: C.bgDeep, border: "none", borderRadius: 3, padding: "7px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", ...mono }}>Apply to this op</button>
          <div style={{ color: C.labelDim, fontSize: 9.5, marginTop: 6, lineHeight: 1.4, ...mono }}>Starting points, not gospel — verify chip load against your bit maker's data, and slow down if you hear chatter or see burning.</div>
        </div>
      )}
    </div>
  );
}

function TopsheetDesigner({ ski, C, onClose }) {
  const bleed = 25.4, gap = 25;
  const W = Math.max(ski.tipWidth, ski.waistWidth, ski.tailWidth), L = ski.length;
  const tL = L + 2 * bleed, tW = 2 * W + gap + 2 * bleed;
  const outline = useMemo(() => { try { return getFullOutlinePoints(ski); } catch (e) { return []; } }, [ski]);
  const skiYc = [bleed + W / 2, bleed + W + gap + W / 2];
  const [layers, setLayers] = useState([{ id: "bg", type: "bg", kind: "solid", color: "#141414", c2: "#3a3a3a", angle: 0, gx: 0.5, gy: 0.5 }]);
  const [sel, setSel] = useState("bg");
  const [dpi, setDpi] = useState(150);
  const [guides, setGuides] = useState(true);
  const [crop, setCrop] = useState(true);
  const [busy, setBusy] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState("select");         // select | rect | ellipse | line | pen
  const [draw, setDraw] = useState(null);             // in-progress drag-create
  const [penAnchors, setPenAnchors] = useState([]);    // in-progress bezier pen anchors {x,y,ix,iy,ox,oy}
  const [penCur, setPenCur] = useState(null);          // pen cursor (for preview + snap)
  const [fonts, setFonts] = useState(["Oswald, Impact, sans-serif", "Impact", "Georgia", "Times New Roman", "Arial", "Helvetica", "Verdana", "Courier New", "Trebuchet MS", "Palatino", "Bebas Neue", "Futura"]);
  const [box, setBox] = useState({ w: 880, h: 460 });
  const cvRef = useRef(null), wrapRef = useRef(null), dragRef = useRef(null);
  useEffect(() => { const el = wrapRef.current; if (!el) return; const set = () => setBox({ w: Math.max(360, el.clientWidth - 4), h: Math.max(260, el.clientHeight - 4) }); const ro = new ResizeObserver(set); ro.observe(el); set(); return () => ro.disconnect(); }, []);
  useEffect(() => { const h = e => { const t = (document.activeElement || {}).tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return; if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) { e.preventDefault(); dup(); } else if ((e.key === "Delete" || e.key === "Backspace") && sel !== "bg" && mode === "select") { e.preventDefault(); del(sel); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); });
  const fit = Math.min((box.w - 24) / tL, (box.h - 24) / tW);
  const eff = fit * zoom;
  const ox = (box.w - tL * eff) / 2 + pan.x, oy = (box.h - tW * eff) / 2 + pan.y;
  const toMM = (sx, sy) => ({ x: (sx - ox) / eff, y: (sy - oy) / eff });
  const toSC = (mx, my) => ({ x: ox + mx * eff, y: oy + my * eff });

  const loadSystemFonts = async () => { try { if (window.queryLocalFonts) { const f = await window.queryLocalFonts(); const fams = [...new Set(f.map(x => x.family))].sort(); if (fams.length) setFonts(fams); } else alert("System-font access isn't supported by this browser. Type any installed font name in the Font box."); } catch (e) { alert("Font access blocked. Type any installed font name in the Font box."); } };

  const shapePath = (ctx, l) => {
    if (l.shape === "rect") { ctx.beginPath(); ctx.rect(-l.w / 2, -l.h / 2, l.w, l.h); }
    else if (l.shape === "ellipse") { ctx.beginPath(); ctx.ellipse(0, 0, l.w / 2, l.h / 2, 0, 0, Math.PI * 2); }
    else if (l.shape === "line") { ctx.beginPath(); ctx.moveTo(-l.w / 2, 0); ctx.lineTo(l.w / 2, 0); }
    else if (l.shape === "path") { const P = l.pts; ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; ctx.bezierCurveTo(a.x + a.ox, a.y + a.oy, b.x + b.ix, b.y + b.iy, b.x, b.y); } if (l.closed && P.length > 1) { const a = P[P.length - 1], b = P[0]; ctx.bezierCurveTo(a.x + a.ox, a.y + a.oy, b.x + b.ix, b.y + b.iy, b.x, b.y); ctx.closePath(); } }
  };
  const paint = (ctx, guidesOn, cropOn) => {
    const bg = layers.find(l => l.type === "bg");
    if (bg) { if (bg.kind === "gradient") { const a = (bg.angle || 0) * Math.PI / 180, cx = (bg.gx != null ? bg.gx : 0.5) * tL, cy = (bg.gy != null ? bg.gy : 0.5) * tW, sp = Math.hypot(tL, tW) / 2; const g = ctx.createLinearGradient(cx - Math.cos(a) * sp, cy - Math.sin(a) * sp, cx + Math.cos(a) * sp, cy + Math.sin(a) * sp); g.addColorStop(0, bg.color); g.addColorStop(1, bg.c2); ctx.fillStyle = g; } else ctx.fillStyle = bg.color; ctx.fillRect(0, 0, tL, tW); }
    for (const l of layers) {
      ctx.save(); ctx.globalAlpha = l.opacity != null ? l.opacity : 1;
      if (l.type === "img" && l.img) { const w = l.wmm, h = w * (l.img.height / l.img.width); ctx.translate(l.x, l.y); ctx.rotate((l.rot || 0) * Math.PI / 180); ctx.drawImage(l.img, -w / 2, -h / 2, w, h); }
      else if (l.type === "text") { ctx.fillStyle = l.color; ctx.font = `${l.bold ? "bold " : ""}${l.size}px ${l.font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.translate(l.x, l.y); ctx.rotate((l.rot || 0) * Math.PI / 180); ctx.fillText(l.text, 0, 0); }
      else if (l.type === "shape") {
        ctx.translate(l.x, l.y); ctx.rotate((l.rot || 0) * Math.PI / 180);
        if (l.shape === "line") { ctx.strokeStyle = l.color; ctx.lineWidth = Math.max(0.5, l.thick || 6); ctx.lineCap = "round"; shapePath(ctx, l); ctx.stroke(); }
        else { shapePath(ctx, l); if (l.fill !== false) { ctx.fillStyle = l.color; ctx.fill(); } if (l.stroke > 0) { ctx.strokeStyle = l.strokeColor || "#000"; ctx.lineWidth = l.stroke; ctx.stroke(); } }
      }
      ctx.restore();
    }
    if (guidesOn) { ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.2 / eff; ctx.setLineDash([6 / eff, 5 / eff]); for (const yc of skiYc) { ctx.beginPath(); outline.forEach((p, i) => { const x = bleed + p.y, y = yc + p.x; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); } ctx.setLineDash([]); ctx.strokeStyle = "rgba(232,85,42,0.9)"; ctx.lineWidth = 1 / eff; ctx.strokeRect(bleed, bleed, tL - 2 * bleed, tW - 2 * bleed); ctx.restore(); }
    if (cropOn) { ctx.save(); ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(0.3, 1.2 / eff); const m = 12; [[0, 0, 1, 1], [tL, 0, -1, 1], [0, tW, 1, -1], [tL, tW, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sx * m, y); ctx.moveTo(x, y); ctx.lineTo(x, y + sy * m); ctx.stroke(); }); ctx.restore(); }
  };

  const layerBox = l => {
    if (l.type === "img" && l.img) { const w = l.wmm, h = w * (l.img.height / l.img.width); return { x: l.x - w / 2, y: l.y - h / 2, w, h }; }
    if (l.type === "shape") { if (l.shape === "path") { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; l.pts.forEach(p => { a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.y); d = Math.max(d, p.y); }); return { x: l.x + a, y: l.y + c, w: b - a, h: d - c }; } return { x: l.x - l.w / 2, y: l.y - (l.shape === "line" ? (l.thick || 6) / 2 : l.h / 2), w: l.w, h: l.shape === "line" ? (l.thick || 6) : l.h }; }
    if (l.type === "text") { const w = l.text.length * l.size * 0.6, h = l.size; return { x: l.x - w / 2, y: l.y - h / 2, w, h }; }
    return null;
  };
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return; cv.width = box.w; cv.height = box.h;
    const ctx = cv.getContext("2d"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#0d0b09"; ctx.fillRect(0, 0, box.w, box.h);
    ctx.setTransform(eff, 0, 0, eff, ox, oy); paint(ctx, guides, crop);
    // draw preview
    if (draw) { ctx.strokeStyle = C.heading; ctx.lineWidth = 1.5 / eff; ctx.setLineDash([5 / eff, 4 / eff]); let x1 = draw.x1, y1 = draw.y1; if (draw.sq && mode !== "line") { const q = Math.max(Math.abs(x1 - draw.x0), Math.abs(y1 - draw.y0)); x1 = draw.x0 + (x1 < draw.x0 ? -1 : 1) * q; y1 = draw.y0 + (y1 < draw.y0 ? -1 : 1) * q; } const x = Math.min(draw.x0, x1), y = Math.min(draw.y0, y1), w = Math.abs(x1 - draw.x0), h = Math.abs(y1 - draw.y0); if (mode === "line") { ctx.beginPath(); ctx.moveTo(draw.x0, draw.y0); ctx.lineTo(draw.x1, draw.y1); ctx.stroke(); } else if (mode === "ellipse") { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.stroke(); } else { ctx.strokeRect(x, y, w, h); } ctx.setLineDash([]); }
    // pen draft
    if (penAnchors.length) {
      ctx.strokeStyle = C.heading; ctx.lineWidth = 1.5 / eff;
      if (penAnchors.length > 1) { ctx.beginPath(); ctx.moveTo(penAnchors[0].x, penAnchors[0].y); for (let i = 1; i < penAnchors.length; i++) { const a = penAnchors[i - 1], b = penAnchors[i]; ctx.bezierCurveTo(a.x + a.ox, a.y + a.oy, b.x + b.ix, b.y + b.iy, b.x, b.y); } ctx.stroke(); }
      if (penCur) { const a = penAnchors[penAnchors.length - 1]; ctx.setLineDash([5 / eff, 4 / eff]); ctx.beginPath(); ctx.moveTo(a.x, a.y); if (a.ox || a.oy) ctx.bezierCurveTo(a.x + a.ox, a.y + a.oy, penCur.x, penCur.y, penCur.x, penCur.y); else ctx.lineTo(penCur.x, penCur.y); ctx.stroke(); ctx.setLineDash([]); }
      penAnchors.forEach(an => { ctx.fillStyle = C.heading; ctx.beginPath(); ctx.arc(an.x, an.y, 4 / eff, 0, Math.PI * 2); ctx.fill(); if (an.ox || an.oy || an.ix || an.iy) { ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1 / eff; ctx.beginPath(); ctx.moveTo(an.x + an.ix, an.y + an.iy); ctx.lineTo(an.x + an.ox, an.y + an.oy); ctx.stroke(); } });
      if (penAnchors.length >= 2 && penCur) { const f = penAnchors[0]; if (Math.hypot(penCur.x - f.x, penCur.y - f.y) * eff < 12) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 / eff; ctx.beginPath(); ctx.arc(f.x, f.y, 7 / eff, 0, Math.PI * 2); ctx.stroke(); } }
    }
    // selection + rotate handle (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const s = layers.find(l => l.id === sel);
    if (s && s.type !== "bg" && mode === "select") { const b = layerBox(s); if (b) { const cS = toSC(b.x, b.y), c2 = toSC(b.x + b.w, b.y + b.h); ctx.save(); if (s.rot) { const cen = toSC(s.x, s.y); ctx.translate(cen.x, cen.y); ctx.rotate((s.rot) * Math.PI / 180); ctx.translate(-cen.x, -cen.y); } ctx.strokeStyle = C.heading; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(cS.x, cS.y, c2.x - cS.x, c2.y - cS.y); ctx.setLineDash([]); const hx = (cS.x + c2.x) / 2, hy = cS.y - 22; ctx.beginPath(); ctx.moveTo(hx, cS.y); ctx.lineTo(hx, hy); ctx.stroke(); ctx.fillStyle = C.heading; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); } }
    if (s && s.type === "bg" && s.kind === "gradient") { const h = toSC(s.gx * tL, s.gy * tW); ctx.fillStyle = C.heading; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x, h.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (s && s.type === "shape" && s.shape === "path" && mode === "select") { const a = (s.rot || 0) * Math.PI / 180, cx = ox + s.x * eff, cy = oy + s.y * eff; const tf = (px, py) => ({ x: cx + (px * Math.cos(a) - py * Math.sin(a)) * eff, y: cy + (px * Math.sin(a) + py * Math.cos(a)) * eff }); s.pts.forEach(pt => { const A = tf(pt.x, pt.y); [[pt.ox, pt.oy], [pt.ix, pt.iy]].forEach(([hx, hy]) => { if (hx || hy) { const H = tf(pt.x + hx, pt.y + hy); ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(H.x, H.y); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(H.x, H.y, 4, 0, Math.PI * 2); ctx.fill(); } }); ctx.fillStyle = C.heading; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(A.x, A.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }); }
  }, [layers, sel, guides, crop, eff, ox, oy, box, outline, draw, penAnchors, penCur, mode]);

  const ptr = e => { const r = cvRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cvRef.current.width / r.width), y: (e.clientY - r.top) * (cvRef.current.height / r.height) }; };
  const rotHandleAt = (s, p) => { const b = layerBox(s); if (!b) return false; let hx = ox + (b.x + b.w / 2) * eff, hy = oy + b.y * eff - 22; if (s.rot) { const cx = ox + s.x * eff, cy = oy + s.y * eff, a = s.rot * Math.PI / 180, dx = hx - cx, dy = hy - cy; hx = cx + dx * Math.cos(a) - dy * Math.sin(a); hy = cy + dx * Math.sin(a) + dy * Math.cos(a); } return Math.hypot(p.x - hx, p.y - hy) < 12; };
  const onDown = e => {
    const p = ptr(e), mm = toMM(p.x, p.y);
    if (mode === "pen") { if (penAnchors.length >= 2) { const f = toSC(penAnchors[0].x, penAnchors[0].y); if (Math.hypot(p.x - f.x, p.y - f.y) < 12) { finishPen(true); return; } } const idx = penAnchors.length; setPenAnchors(a => [...a, { x: mm.x, y: mm.y, ix: 0, iy: 0, ox: 0, oy: 0 }]); dragRef.current = { pen: idx }; return; }
    if (mode !== "select") { setDraw({ x0: mm.x, y0: mm.y, x1: mm.x, y1: mm.y }); return; }
    const s0 = layers.find(l => l.id === sel);
    if (s0 && s0.type !== "bg" && rotHandleAt(s0, p)) { dragRef.current = { rot: s0.id, cx: ox + s0.x * eff, cy: oy + s0.y * eff }; return; }
    if (s0 && s0.type === "shape" && s0.shape === "path") { const a = (s0.rot || 0) * Math.PI / 180, cx = ox + s0.x * eff, cy = oy + s0.y * eff; const tf = (px, py) => ({ x: cx + (px * Math.cos(a) - py * Math.sin(a)) * eff, y: cy + (px * Math.sin(a) + py * Math.cos(a)) * eff }); for (let i = 0; i < s0.pts.length; i++) { const pt = s0.pts[i]; if (pt.ox || pt.oy) { const H = tf(pt.x + pt.ox, pt.y + pt.oy); if (Math.hypot(p.x - H.x, p.y - H.y) < 8) { dragRef.current = { pathH: s0.id, idx: i, which: "o" }; return; } } if (pt.ix || pt.iy) { const H = tf(pt.x + pt.ix, pt.y + pt.iy); if (Math.hypot(p.x - H.x, p.y - H.y) < 8) { dragRef.current = { pathH: s0.id, idx: i, which: "i" }; return; } } const A = tf(pt.x, pt.y); if (Math.hypot(p.x - A.x, p.y - A.y) < 9) { dragRef.current = { pathA: s0.id, idx: i }; return; } } }
    if (s0 && s0.type === "bg" && s0.kind === "gradient") { const h = toSC(s0.gx * tL, s0.gy * tW); if (Math.hypot(p.x - h.x, p.y - h.y) < 14) { dragRef.current = { grad: true }; return; } }
    for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; if (l.type === "bg") continue; const b = layerBox(l); if (b && mm.x >= b.x - 2 && mm.x <= b.x + b.w + 2 && mm.y >= b.y - 2 && mm.y <= b.y + b.h + 2) { setSel(l.id); dragRef.current = { id: l.id, ox: mm.x - l.x, oy: mm.y - l.y }; return; } }
    dragRef.current = { pan: true, sx: p.x - pan.x, sy: p.y - pan.y };
  };
  const onMove = e => {
    const p = ptr(e);
    if (mode === "pen" && !dragRef.current) { setPenCur(toMM(p.x, p.y)); return; }
    if (draw) { const mm = toMM(p.x, p.y); setDraw(d => ({ ...d, x1: mm.x, y1: mm.y, sq: e.shiftKey })); return; }
    const d = dragRef.current; if (!d) return;
    if (d.pen != null) { const mm = toMM(p.x, p.y); setPenAnchors(a => a.map((an, i) => i === d.pen ? { ...an, ox: mm.x - an.x, oy: mm.y - an.y, ix: an.x - mm.x, iy: an.y - mm.y } : an)); setPenCur(mm); return; }
    if (d.pan) setPan({ x: p.x - d.sx, y: p.y - d.sy });
    else if (d.grad) { const mm = toMM(p.x, p.y); upd("bg", { gx: Math.max(0, Math.min(1, mm.x / tL)), gy: Math.max(0, Math.min(1, mm.y / tW)) }); }
    else if (d.rot) { const ang = Math.atan2(p.y - d.cy, p.x - d.cx) * 180 / Math.PI + 90; upd(d.rot, { rot: Math.round(ang) }); }
    else if (d.pathA != null) { const mm = toMM(p.x, p.y); setLayers(ls => ls.map(l => { if (l.id !== d.pathA) return l; const a = -(l.rot || 0) * Math.PI / 180, dx = mm.x - l.x, dy = mm.y - l.y, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a); const pts = l.pts.slice(); pts[d.idx] = { ...pts[d.idx], x: lx, y: ly }; return { ...l, pts }; })); }
    else if (d.pathH) { const mm = toMM(p.x, p.y); setLayers(ls => ls.map(l => { if (l.id !== d.pathH) return l; const a = -(l.rot || 0) * Math.PI / 180, dx = mm.x - l.x, dy = mm.y - l.y, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a); const an = l.pts[d.idx], hx = lx - an.x, hy = ly - an.y; const pts = l.pts.slice(); pts[d.idx] = d.which === "o" ? { ...an, ox: hx, oy: hy, ix: -hx, iy: -hy } : { ...an, ix: hx, iy: hy, ox: -hx, oy: -hy }; return { ...l, pts }; })); }
    else { const mm = toMM(p.x, p.y); setLayers(ls => ls.map(l => l.id === d.id ? { ...l, x: mm.x - d.ox, y: mm.y - d.oy } : l)); }
  };
  const onUp = () => {
    if (draw) {
      let x0 = draw.x0, y0 = draw.y0, x1 = draw.x1, y1 = draw.y1; const id = "s" + Date.now();
      if (mode === "line") { const len = Math.hypot(x1 - x0, y1 - y0); if (len > 4) { setLayers(ls => [...ls, { id, type: "shape", shape: "line", x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: len, thick: 8, color: "#e8552a", rot: Math.round(Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI), opacity: 1 }]); setSel(id); } }
      else { if (draw.sq) { const q = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + (x1 < x0 ? -1 : 1) * q; y1 = y0 + (y1 < y0 ? -1 : 1) * q; } const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0); if (w > 4 && h > 4) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; if (mode === "rect") { const hw = w / 2, hh = h / 2, pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([px, py]) => ({ x: px, y: py, ix: 0, iy: 0, ox: 0, oy: 0 })); setLayers(ls => [...ls, { id, type: "shape", shape: "path", pts, closed: true, x: cx, y: cy, color: "#e8552a", fill: true, stroke: 0, strokeColor: "#000", rot: 0, opacity: 1 }]); } else { setLayers(ls => [...ls, { id, type: "shape", shape: mode, x: cx, y: cy, w, h, color: "#e8552a", fill: true, stroke: 0, strokeColor: "#000", rot: 0, opacity: 1 }]); } setSel(id); } }
      setDraw(null); setMode("select");
    }
    dragRef.current = null;
  };
  const onWheel = e => { e.preventDefault(); const p = ptr(e), before = toMM(p.x, p.y); const nz = Math.max(1, Math.min(12, zoom * (1 - e.deltaY * 0.0015))); const neff = fit * nz; setZoom(nz); setPan({ x: (p.x - before.x * neff) - (box.w - tL * neff) / 2, y: (p.y - before.y * neff) - (box.h - tW * neff) / 2 }); };
  const finishPen = closed => { if (penAnchors.length >= 2) { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; penAnchors.forEach(p => { a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.y); d = Math.max(d, p.y); }); const cx = (a + b) / 2, cy = (c + d) / 2, id = "p" + Date.now(); setLayers(ls => [...ls, { id, type: "shape", shape: "path", pts: penAnchors.map(p => ({ x: p.x - cx, y: p.y - cy, ix: p.ix, iy: p.iy, ox: p.ox, oy: p.oy })), closed: !!closed, x: cx, y: cy, color: "#e8552a", fill: !!closed, stroke: closed ? 0 : 4, strokeColor: "#000", rot: 0, opacity: 1 }]); setSel(id); } setPenAnchors([]); setPenCur(null); setMode("select"); };

  const addImage = file => { const id = "img" + Date.now(); const img = new Image(); img.onload = () => setLayers(ls => [...ls, { id, type: "img", img, x: tL / 2, y: tW / 2, wmm: Math.min(tL, tW * 1.5) * 0.4, rot: 0, opacity: 1 }]); img.src = URL.createObjectURL(file); setSel(id); };
  const addText = () => { const id = "t" + Date.now(); setLayers(ls => [...ls, { id, type: "text", text: "BLACK CHAPEL", x: tL / 2, y: tW / 2, size: 60, color: "#F0EDE4", font: fonts[0], bold: true, rot: 0, opacity: 1 }]); setSel(id); };
  const upd = (id, patch) => setLayers(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  const del = id => { setLayers(ls => ls.filter(l => l.id !== id)); setSel("bg"); };
  const moveL = (id, dir) => setLayers(ls => { const i = ls.findIndex(l => l.id === id); const j = i + dir; if (j < 1 || j >= ls.length) return ls; const a = ls.slice(); [a[i], a[j]] = [a[j], a[i]]; return a; });
  const dup = () => { const l = layers.find(x => x.id === sel); if (!l || l.type === "bg") return; const id = "d" + Date.now(); const clone = { ...l, id, x: l.x + 25, y: l.y + 25 }; if (l.pts) clone.pts = l.pts.map(pt => ({ ...pt })); setLayers(ls => [...ls, clone]); setSel(id); };
  const exportImg = async fmt => { setBusy("Rendering " + dpi + " dpi…"); await new Promise(r => setTimeout(r, 30)); const ppm = dpi / 25.4, oc = document.createElement("canvas"); oc.width = Math.round(tL * ppm); oc.height = Math.round(tW * ppm); const ctx = oc.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, oc.width, oc.height); ctx.setTransform(ppm, 0, 0, ppm, 0, 0); paint(ctx, false, crop); oc.toBlob(b => { const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `topsheet-${ski.length}mm-pair-${dpi}dpi.${fmt === "jpg" ? "jpg" : "png"}`; a.click(); URL.revokeObjectURL(u); setBusy(""); }, fmt === "jpg" ? "image/jpeg" : "image/png", 0.95); };

  const s = layers.find(l => l.id === sel);
  const inp = { width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" };
  const numInp = { width: 62, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "4px 6px", color: C.value, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none" };
  const lab = { color: C.label, fontSize: 10, marginBottom: 2, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" };
  const btn = on => ({ padding: "6px 10px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: on ? C.heading : C.inputBg, color: on ? C.bgDeep : C.label, border: `1px solid ${on ? C.heading : C.inputBorder}`, borderRadius: 3, cursor: "pointer", fontWeight: on ? 700 : 400 });
  const numField = (label, val, min, max, step, on) => (<div><div style={lab}>{label}</div><div style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="range" min={min} max={max} step={step} value={val} onChange={e => on(+e.target.value)} style={{ flex: 1 }} /><input type="number" min={min} max={max} step={step} value={+(+val).toFixed(2)} onChange={e => on(+e.target.value)} style={numInp} /></div></div>);
  const colorField = (label, val, on) => (<div><div style={lab}>{label}</div><div style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="color" value={val} onChange={e => on(e.target.value)} style={{ width: 40, height: 30, padding: 1, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3 }} /><input value={val} onChange={e => on(e.target.value)} style={{ ...numInp, width: 80 }} /></div></div>);
  const outPx = { w: Math.round(tL / 25.4 * dpi), h: Math.round(tW / 25.4 * dpi) };
  const drawing = mode !== "select";

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bgDeep, zIndex: 1200, display: "flex", flexDirection: "column" }}>
      <BrandBar title="Topsheet Designer" subtitle={`pair · ${(tL / 25.4).toFixed(1)}" × ${(tW / 25.4).toFixed(1)}" incl. 1" bleed`} onClose={onClose} C={C} />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 322, flexShrink: 0, overflowY: "auto", padding: 14, borderRight: `1px solid ${C.panelBorder}` }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <label style={{ ...btn(false), textAlign: "center" }}>+ Image<input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && addImage(e.target.files[0])} /></label>
            <button onClick={addText} style={btn(false)}>+ Text</button>
            <button onClick={() => setMode("rect")} style={btn(mode === "rect")}>▭ Rect</button>
            <button onClick={() => setMode("ellipse")} style={btn(mode === "ellipse")}>◯ Ellipse</button>
            <button onClick={() => setMode("line")} style={btn(mode === "line")}>╱ Line</button>
            <button onClick={() => { setMode("pen"); setPenPts([]); }} style={btn(mode === "pen")}>✎ Pen</button>
          </div>
          {drawing && <div style={{ background: C.inputBg, border: `1px solid ${C.heading}`, borderRadius: 4, padding: "7px 9px", marginBottom: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.heading, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ flex: 1 }}>{mode === "pen" ? `Pen: click to place points, drag for curves (${penAnchors.length}). Click the first point or Finish to close.` : `Drag to draw the ${mode}.${mode === "ellipse" ? " Hold Shift for a circle." : mode === "rect" ? " Hold Shift for a square." : ""}`}</span>
            {mode === "pen" && <button onClick={() => finishPen(true)} style={{ ...btn(true), padding: "4px 8px" }}>Finish</button>}
            <button onClick={() => { setMode("select"); setPenAnchors([]); setPenCur(null); setDraw(null); }} style={{ ...btn(false), padding: "4px 8px" }}>Cancel</button>
          </div>}
          <div style={{ ...lab, marginTop: 0 }}>LAYERS (drag on canvas to move · handle to rotate)</div>
          <div style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 4, marginBottom: 10, maxHeight: 140, overflowY: "auto" }}>
            {layers.slice().reverse().map(l => (
              <div key={l.id} onClick={() => { setSel(l.id); setMode("select"); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", cursor: "pointer", background: sel === l.id ? C.inputBg : "transparent", borderBottom: `1px solid ${C.inputBorder}`, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: sel === l.id ? C.heading : C.label }}>
                <span style={{ flex: 1 }}>{l.type === "bg" ? "Background" : l.type === "img" ? "Image" : l.type === "shape" ? l.shape : `"${l.text.slice(0, 12)}"`}</span>
                {l.type !== "bg" && <><span onClick={e => { e.stopPropagation(); moveL(l.id, 1); }} style={{ cursor: "pointer" }}>▲</span><span onClick={e => { e.stopPropagation(); moveL(l.id, -1); }} style={{ cursor: "pointer" }}>▼</span><span onClick={e => { e.stopPropagation(); del(l.id); }} style={{ cursor: "pointer", color: "#e8552a" }}>✕</span></>}
              </div>
            ))}
          </div>
          {s && s.type !== "bg" && <button onClick={dup} style={{ ...btn(false), width: "100%", marginBottom: 10 }}>⧉  Duplicate (Ctrl+D)</button>}
          {s && s.type === "bg" && (<>
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>{[["solid", "Solid"], ["gradient", "Gradient"]].map(([v, t]) => <button key={v} onClick={() => upd("bg", { kind: v })} style={{ ...btn(s.kind === v), flex: 1 }}>{t}</button>)}</div>
            {colorField("Color", s.color, v => upd("bg", { color: v }))}
            {s.kind === "gradient" && (<>{colorField("Color 2", s.c2, v => upd("bg", { c2: v }))}{numField("Angle°", s.angle, 0, 360, 1, v => upd("bg", { angle: v }))}<div style={{ color: C.labelDim, fontSize: 10, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>Drag the dot on the canvas to move the gradient.</div></>)}
          </>)}
          {s && s.type === "img" && (<>{numField("Size in", s.wmm / 25.4, 1, tL / 25.4, 0.1, v => upd(s.id, { wmm: v * 25.4 }))}{numField("Rotate°", s.rot || 0, -180, 180, 1, v => upd(s.id, { rot: v }))}{numField("Opacity", s.opacity != null ? s.opacity : 1, 0, 1, 0.05, v => upd(s.id, { opacity: v }))}</>)}
          {s && s.type === "shape" && s.shape === "line" && (<>{colorField("Color", s.color, v => upd(s.id, { color: v }))}{numField("Thickness mm", s.thick || 6, 1, 60, 1, v => upd(s.id, { thick: v }))}{numField("Length mm", s.w, 10, tL, 1, v => upd(s.id, { w: v }))}{numField("Rotate°", s.rot || 0, -180, 180, 1, v => upd(s.id, { rot: v }))}{numField("Opacity", s.opacity != null ? s.opacity : 1, 0, 1, 0.05, v => upd(s.id, { opacity: v }))}</>)}
          {s && s.type === "shape" && s.shape !== "line" && (<>
            {colorField("Fill", s.color, v => upd(s.id, { color: v }))}
            <label style={{ display: "flex", gap: 5, alignItems: "center", color: C.label, fontSize: 11, marginTop: 6, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}><input type="checkbox" checked={s.fill !== false} onChange={e => upd(s.id, { fill: e.target.checked })} /> Filled</label>
            {numField("Outline mm", s.stroke || 0, 0, 30, 1, v => upd(s.id, { stroke: v }))}
            {s.stroke > 0 && colorField("Outline color", s.strokeColor || "#000000", v => upd(s.id, { strokeColor: v }))}
            {s.shape !== "path" && numField("Width mm", s.w, 10, tL, 1, v => upd(s.id, { w: v }))}
            {s.shape !== "path" && numField("Height mm", s.h, 10, tW, 1, v => upd(s.id, { h: v }))}
            {numField("Rotate°", s.rot || 0, -180, 180, 1, v => upd(s.id, { rot: v }))}
            {numField("Opacity", s.opacity != null ? s.opacity : 1, 0, 1, 0.05, v => upd(s.id, { opacity: v }))}
          </>)}
          {s && s.type === "text" && (<>
            <div style={lab}>Text</div><input value={s.text} onChange={e => upd(s.id, { text: e.target.value })} style={inp} />
            <div style={lab}>Font (type any installed name)</div><input list="ts-fonts" value={s.font} onChange={e => upd(s.id, { font: e.target.value })} style={inp} /><datalist id="ts-fonts">{fonts.map(fn => <option key={fn} value={fn} />)}</datalist>
            <button onClick={loadSystemFonts} style={{ ...btn(false), width: "100%", marginTop: 4 }}>Load system fonts</button>
            {numField("Size mm", s.size, 10, 300, 1, v => upd(s.id, { size: v }))}{colorField("Color", s.color, v => upd(s.id, { color: v }))}{numField("Rotate°", s.rot || 0, -180, 180, 1, v => upd(s.id, { rot: v }))}
          </>)}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: 14, gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)} /> Ski + bleed guides</label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}><input type="checkbox" checked={crop} onChange={e => setCrop(e.target.checked)} /> Crop marks</label>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto", alignItems: "center" }}>
              <button onClick={() => setZoom(z => Math.max(1, z / 1.3))} style={btn(false)}>−</button>
              <span style={{ color: C.labelDim, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", minWidth: 46, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(12, z * 1.3))} style={btn(false)}>+</button>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={btn(false)}>Fit</button>
            </div>
          </div>
          <div ref={wrapRef} style={{ flex: 1, minHeight: 260, background: "#0d0b09", borderRadius: 6, border: `1px solid ${C.panelBorder}`, overflow: "hidden" }}>
            <canvas ref={cvRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onWheel={onWheel} onDoubleClick={() => mode === "pen" && finishPen(true)} style={{ display: "block", cursor: drawing ? "crosshair" : "grab", touchAction: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div><div style={lab}>Export DPI</div><div style={{ display: "flex", gap: 4 }}>{[150, 200, 300].map(d => <button key={d} onClick={() => setDpi(d)} style={btn(dpi === d)}>{d}</button>)}</div></div>
            <span style={{ color: C.labelDim, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", paddingBottom: 4 }}>{outPx.w.toLocaleString()} × {outPx.h.toLocaleString()} px</span>
            <button disabled={!!busy} onClick={() => exportImg("png")} style={{ background: C.heading, color: C.bgDeep, border: "none", padding: "9px 16px", borderRadius: 4, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{busy || "Export PNG (print-ready)"}</button>
            <button disabled={!!busy} onClick={() => exportImg("jpg")} style={{ background: "transparent", color: C.label, border: `1px solid ${C.inputBorder}`, padding: "9px 14px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>JPG</button>
          </div>
          <div style={{ background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 5, padding: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.value, lineHeight: 1.5 }}>
            <div style={{ color: C.heading, fontWeight: 700, marginBottom: 4 }}>PRINT & SEND OUT</div>
            <div style={{ color: C.labelDim, marginBottom: 6 }}>Your export is <b style={{ color: C.value }}>{(tL / 25.4).toFixed(1)}" × {(tW / 25.4).toFixed(1)}"</b> with a built-in 1" bleed all around. Most shops want <b style={{ color: C.value }}>≥150 dpi</b>. It exports RGB, which sublimation printers convert to CMYK — if a shop requires true CMYK, open the PNG in Photoshop and convert (use a rich black, not 100% K).</div>
            <div style={{ color: C.labelDim, marginBottom: 6, fontStyle: "italic" }}>A few shops that print custom topsheets (examples, not endorsements):</div>
            {TOPSHEET_PRINTERS.map(p => (<div key={p.name} style={{ marginBottom: 4 }}><a href={p.url} target="_blank" rel="noreferrer" style={{ color: C.heading, textDecoration: "none" }}>{p.name} ↗</a><span style={{ color: C.labelDim }}> — {p.note}</span></div>))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [ski, setSki] = useState(DEFAULT_SKI);
  // Per-mode in-memory stash: when you toggle away from a mode, its design is parked here so toggling
  // back restores it (rather than mutating one shared design). Keyed "ski" / "snowboard".
  const modeStash = useRef({});
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
  const bom = useMemo(() => computeBOM(ski), [ski]);
  // Editable per-unit material prices (USD) for the cost estimate. Persisted to localStorage.
  const [bomPrices, setBomPrices] = useState(() => {
    const defs = { wood: 4, glass: 9, metal: 45, carbon: 38, edge: 2.5, base: 14, topsheet: 16, insert: 0.6, epoxy: 22 };
    try { const raw = localStorage.getItem("bcs_bom_prices"); if (raw) return { ...defs, ...JSON.parse(raw) }; } catch (e) {}
    return defs;
  });
  useEffect(() => { try { localStorage.setItem("bcs_bom_prices", JSON.stringify(bomPrices)); } catch (e) {} }, [bomPrices]);

  // White-label branding for the build card (a shop's own name + logo). Persisted so it's set once.
  const [builderBrand, setBuilderBrand] = useState(() => {
    try { const raw = localStorage.getItem("bcs_builder_brand"); if (raw) return { name: "", logoSrc: null, logoName: null, ...JSON.parse(raw) }; } catch (e) {}
    return { name: "", logoSrc: null, logoName: null };
  });
  useEffect(() => { try { localStorage.setItem("bcs_builder_brand", JSON.stringify(builderBrand)); } catch (e) {} }, [builderBrand]);
  const brandLogoRef = useRef(null);
  const handleBrandLogoFile = useCallback((file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { alert("Please choose an image file (PNG or SVG works best for logos)."); return; }
    if (file.size > 4 * 1024 * 1024) { alert("Logo is larger than 4 MB — please use a smaller file."); return; }
    const reader = new FileReader();
    reader.onload = () => setBuilderBrand(b => ({ ...b, logoSrc: reader.result, logoName: file.name }));
    reader.readAsDataURL(file);
  }, []);
  const clearBrandLogo = useCallback(() => {
    setBuilderBrand(b => ({ ...b, logoSrc: null, logoName: null }));
    if (brandLogoRef.current) brandLogoRef.current.value = "";
  }, []);

  // ── Topsheet artwork overlay ──────────────────────────────────
  // Kept in component state (not the saved ski JSON) so large base64 images don't bloat design files.
  const [topsheet, setTopsheet] = useState({
    src: null, name: null, opacity: 1, scale: 1, offsetX: 0, offsetY: 0, rotation: 0, fit: "cover",
  });
  const topsheetFileRef = useRef(null);
  const [show3D, setShow3D] = useState(false);
  const [pairView, setPairView] = useState(false);
  // Ski reference database (browse industry shapes → load dimensions).
  const [showDb, setShowDb] = useState(false);
  const [dbMsg, setDbMsg] = useState(null);
  const applySkiFromDb = useCallback((s) => {
    setSki(prev => ({ ...prev, length: s.length * 10, tipWidth: s.tip, waistWidth: s.waist, tailWidth: s.tail }));
    setShowDb(false);
    setDbMsg(`Loaded ${s.brand} ${s.model} · ${s.length}cm · ${s.tip}-${s.waist}-${s.tail}${s.radius ? ` (published radius ~${s.radius} m)` : ""}. The designer recomputes radius from tip/tail length & edges — set those, plus rocker, core & layup.`);
    setTimeout(() => setDbMsg(null), 5000);
  }, []);
  // Reference "ghost" overlay: trace a database ski behind the design without changing it.
  const [refGhost, setRefGhost] = useState(null);   // { ...skiObj, _label }
  const setGhostFromDb = useCallback((s) => {
    setRefGhost({ lengthMM: s.length * 10, tip: s.tip, waist: s.waist, tail: s.tail, _label: `${s.brand} ${s.model} ${s.length}cm` });
    setShowDb(false);
  }, []);
  // A snowboard is a single board, not a pair — keep pair view off (and its toggles hidden) in that mode.
  useEffect(() => { if (ski.mode === "snowboard" && pairView) setPairView(false); }, [ski.mode, pairView]);
  const setTopsheetField = useCallback((k, v) => setTopsheet(t => ({ ...t, [k]: v })), []);
  const handleTopsheetFile = useCallback((file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { alert("Please choose an image file (PNG, JPG, WEBP, or SVG)."); return; }
    if (file.size > 12 * 1024 * 1024) { alert("Image is larger than 12 MB — please use a smaller file."); return; }
    const reader = new FileReader();
    reader.onload = () => setTopsheet(t => ({ ...t, src: reader.result, name: file.name }));
    reader.readAsDataURL(file);
  }, []);
  const clearTopsheet = useCallback(() => {
    setTopsheet({ src: null, name: null, opacity: 1, scale: 1, offsetX: 0, offsetY: 0, rotation: 0, fit: "cover" });
    if (topsheetFileRef.current) topsheetFileRef.current.value = "";
  }, []);
  // Render a clean "finished ski" PNG: silhouette + clipped topsheet + crisp outline, length along X.
  const exportTopsheetPNG = useCallback(() => {
    if (!topsheet.src) { alert("Upload a topsheet image first."); return; }
    const img = new Image();
    img.onload = () => {
      const { right, left } = computeOutline(ski);
      const all = right.concat(left);
      const maxLat = Math.max(...all.map(p => Math.abs(p.x)));
      const pad = 24, gapMM = 12;
      const pxPerMM = Math.max(0.5, Math.min(4, 2400 / ski.length)); // ~2400px long side
      const W = Math.ceil(ski.length * pxPerMM + pad * 2);
      const bandMM = maxLat * 2;
      const H = Math.ceil((pairView ? bandMM * 2 + gapMM : bandMM) * pxPerMM + pad * 2);
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      const cyA = pad + maxLat * pxPerMM;
      const cyB = cyA + (bandMM + gapMM) * pxPerMM;
      const mapA = (p) => ({ x: pad + p.y * pxPerMM, y: cyA + p.x * pxPerMM });   // along->X, lateral->Y
      const mapB = (p) => ({ x: pad + p.y * pxPerMM, y: cyB - p.x * pxPerMM });   // mirrored partner
      const outline = (mapFn) => {
        ctx.beginPath();
        right.forEach((p, i) => { const s = mapFn(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
        for (let i = left.length - 1; i >= 0; i--) { const s = mapFn(left[i]); ctx.lineTo(s.x, s.y); }
        ctx.closePath();
      };
      // Combined art box across both skis (or just ski A).
      let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
      const acc = (s) => { if (s.x < mnX) mnX = s.x; if (s.x > mxX) mxX = s.x; if (s.y < mnY) mnY = s.y; if (s.y > mxY) mxY = s.y; };
      all.forEach(p => { acc(mapA(p)); if (pairView) acc(mapB(p)); });
      const box = { minX: mnX, minY: mnY, maxX: mxX, maxY: mxY };
      const paintSki = (mapFn) => {
        outline(mapFn); ctx.fillStyle = "#1c1916"; ctx.fill();       // base fill
        ctx.save(); outline(mapFn); ctx.clip();
        drawTopsheetImage(ctx, img, box, topsheet);
        ctx.restore();
        outline(mapFn); ctx.strokeStyle = "#ede6d8"; ctx.lineWidth = 2.5; ctx.stroke();
      };
      paintSki(mapA);
      if (pairView) paintSki(mapB);
      cv.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bcs-${(ski.designName || "ski").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-topsheet${pairView ? "-pair" : ""}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    };
    img.src = topsheet.src;
  }, [ski, topsheet, pairView]);

  // Export a 1:1 print-ready topsheet template. fmt "svg" = vector (Illustrator/CorelDraw). fmt "png"
  // = flattened raster at ~150 DPI for print RIPs. In pair view it renders both skis with the art
  // projected across the set.
  const exportTopsheetTemplate = useCallback((fmt = "svg") => {
    const nameBase = `bcs-${(ski.designName || "ski").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-topsheet-template${pairView ? "-pair" : ""}`;
    const finish = (imgDims) => {
      const svg = buildTopsheetTemplateSVG(ski, topsheet, imgDims, 8, pairView);
      if (fmt === "svg") {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${nameBase}.svg`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      // PNG: rasterize the SVG at print DPI. viewBox units are mm, so px = mm * (dpi/25.4).
      const vb = svg.match(/viewBox="([\d.\- ]+)"/);
      const parts = vb ? vb[1].split(" ").map(Number) : [0, 0, ski.length + 40, 320];
      const vbW = parts[2], vbH = parts[3];
      const dpi = 150;
      let pxPerMM = dpi / 25.4;
      const MAXPX = 12000;
      if (vbW * pxPerMM > MAXPX) pxPerMM = MAXPX / vbW;   // clamp huge long-side
      const W = Math.round(vbW * pxPerMM), H = Math.round(vbH * pxPerMM);
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(im, 0, 0, W, H);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => {
          const u = URL.createObjectURL(b);
          const a = document.createElement("a"); a.href = u; a.download = `${nameBase}-${dpi}dpi.png`; a.click();
          setTimeout(() => URL.revokeObjectURL(u), 1000);
        }, "image/png");
      };
      im.onerror = () => { URL.revokeObjectURL(url); alert("Could not rasterize the template to PNG. Use the SVG export."); };
      im.src = url;
    };
    if (topsheet.src) {
      const img = new Image();
      img.onload = () => finish({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => finish(null);
      img.src = topsheet.src;
    } else finish(null);
  }, [ski, topsheet, pairView]);

  // Export the branded (white-labelable) spec sheet as SVG or PNG.
  const exportSpecSheet = useCallback((fmt) => {
    const run = (logoDims) => {
      const brand = { name: builderBrand.name, logoSrc: builderBrand.logoSrc, logoDims };
      const svg = buildSpecSheetSVG(ski, derived, flex, bom, brand);
      const nameBase = `bcs-${(ski.designName || "ski").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-specsheet`;
      if (fmt === "svg") {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${nameBase}.svg`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = 1400; cv.height = 900;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#141210"; ctx.fillRect(0, 0, 1400, 900);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => {
          const u = URL.createObjectURL(b);
          const a = document.createElement("a"); a.href = u; a.download = `${nameBase}.png`; a.click();
          setTimeout(() => URL.revokeObjectURL(u), 1000);
        }, "image/png");
      };
      img.onerror = () => { URL.revokeObjectURL(url); alert("Could not render the spec sheet to PNG. Try the SVG export."); };
      img.src = url;
    };
    // Load the logo first (if any) so we can preserve its aspect ratio in the layout.
    if (builderBrand.logoSrc) {
      const lg = new Image();
      lg.onload = () => run({ w: lg.naturalWidth, h: lg.naturalHeight });
      lg.onerror = () => run(null);
      lg.src = builderBrand.logoSrc;
    } else run(null);
  }, [ski, derived, flex, bom, builderBrand]);

  // Build-sheet PREVIEW — render the spec sheet on screen before exporting so you can see the layup
  // cross-section and every spec. Loads the logo dims first (same as export) so the preview matches 1:1.
  const [previewSvg, setPreviewSvg] = useState(null);
  const [showToolpath, setShowToolpath] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [topsheetOpen, setTopsheetOpen] = useState(false);
  useEffect(() => {
    if (document.getElementById("bcs-polish")) return;
    const st = document.createElement("style"); st.id = "bcs-polish";
    st.textContent = `
      button { transition: filter .13s ease, transform .05s ease, box-shadow .15s ease; }
      button:hover:not(:disabled) { filter: brightness(1.1); }
      button:active:not(:disabled) { transform: translateY(1px); }
      button:disabled { opacity: .5; cursor: default; }
      input, select, textarea { transition: border-color .13s ease, box-shadow .13s ease; }
      input:focus, select:focus, textarea:focus { border-color: ${C.heading} !important; box-shadow: 0 0 0 2px ${C.heading}33; }
      input[type=range] { accent-color: ${C.heading}; }
      input[type=checkbox], input[type=radio] { accent-color: ${C.heading}; }
      a { transition: opacity .13s ease; } a:hover { opacity: .82; }
      *::-webkit-scrollbar { width: 11px; height: 11px; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-thumb { background: ${C.panelBorder}; border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
      *::-webkit-scrollbar-thumb:hover { background: ${C.heading}99; background-clip: padding-box; }
    `;
    document.head.appendChild(st);
  }, []);
  const [preview3D, setPreview3D] = useState(false);
  const [asymOpen, setAsymOpen] = useState(false);
  const openSpecPreview = useCallback(() => {
    const run = (logoDims) => setPreviewSvg(buildSpecSheetSVG(ski, derived, flex, bom, { name: builderBrand.name, logoSrc: builderBrand.logoSrc, logoDims }));
    if (builderBrand.logoSrc) { const lg = new Image(); lg.onload = () => run({ w: lg.naturalWidth, h: lg.naturalHeight }); lg.onerror = () => run(null); lg.src = builderBrand.logoSrc; } else run(null);
  }, [ski, derived, flex, bom, builderBrand]);

  // ── CAM (CNC G-code) settings + export ──
  const [camOpt, setCamOpt] = useState(() => {
    const d = { op: "outline", units: "mm", zZero: "bed", stockThick: 13, spindle: 18000, safeZ: 6, stepdown: 3, origin: "corner", spindleCW: true, stockL: 0, stockW: 0, centerInStock: true,
      outlineToolNum: 1, outlineToolDia: 6.35, outlineFeed: 2000, outlinePlunge: 600, baseToolNum: 1, baseToolDia: 3.175, baseFeed: 2500, basePlunge: 800, bladeOffset: 1, dragLeadIn: 12,
      taperToolNum: 2, taperToolDia: 12.7, taperFeed: 2500, taperPlunge: 800,
      moldToolNum: 3, moldToolDia: 12.7, moldFeed: 2500, moldPlunge: 800, moldMargin: 15,
      slatToolNum: 4, slatToolDia: 6.35, slatFeed: 2000, slatPlunge: 600, slatBase: 20, slatSections: "three", slatOverlap: 60, slatCopies: 6, slatSheetW: 1200,
      slatHoles: true, slatHoleDia: 6.6, slatHoleH: 12, slatHoleSpacing: 10, slatHoleEndZone: 300, slatHoleToolNum: 5,
      machineX: 1219.2, machineY: 2438.4, showMachine: true, camV: 7,
      boreToolNum: 6, boreToolDia: 6.35, boreFeed: 1500, borePlunge: 400, boreDia: 7, boreDepth: 9, boreHelix: true, boreRows: 2, boreCols: 4, boreSpaceX: 40, boreSpaceY: 40, boreCenter: 0.5, postKey: "centroid", postOverride: null, partAxis: "y", roughing: false, roughToolNum: 2, roughToolDia: 12.7, roughStepover: 8, roughStepdown: 4, finishAllowance: 1, offsetX: 0, offsetY: 0, moldInvert: false, pocketToolNum: 1, pocketToolDia: 6.35, pocketFeed: 2000, pocketPlunge: 600, pocketCenterX: 0.5, pocketCenterY: 0, pocketL: 300, pocketW: 60, pocketDepth: 6,
      perimeterSide: "outside", cutThrough: 0.5, tabN: 4, tabHeight: 2, tabLen: 8, perimDir: "conventional", rampEntry: true, rampLen: 12,
      stepover: 6, profPattern: "zigzag", profDir: "+", sidewallStock: 0, sidewallEngage: "conventional" };
    try { const s = JSON.parse(localStorage.getItem("bcs_cam")); if (s) { const m = { ...d, ...s }; if (m.camV !== d.camV) { m.machineX = d.machineX; m.machineY = d.machineY; m.origin = "corner"; const inch = m.units === "inch"; m.slatHoleSpacing = inch ? +(10 / 25.4).toFixed(3) : 10; m.slatHoleH = inch ? +(12 / 25.4).toFixed(3) : 12; m.slatHoleDia = inch ? +(6.6 / 25.4).toFixed(3) : 6.6; m.slatHoleEndZone = inch ? +(300 / 25.4).toFixed(2) : 300; m.bladeOffset = inch ? +(1 / 25.4).toFixed(3) : 1; m.dragLeadIn = inch ? +(12 / 25.4).toFixed(2) : 12; m.camV = d.camV; } return m; } } catch (e) {}
    return d;
  });
  const setCam = (k, v) => setCamOpt(o => { const n = { ...o, [k]: v }; try { localStorage.setItem("bcs_cam", JSON.stringify(n)); } catch (e) {} return n; });
  // Switching units converts every length/feed field so the physical setup is unchanged (13 mm stays 0.512 in).
  const setCamUnits = u => setCamOpt(o => { if (o.units === u) return o; const fac = u === "inch" ? 1 / 25.4 : 25.4; const n = { ...o, units: u }; for (const k of ["stockThick", "stockL", "stockW", "safeZ", "stepdown", "outlineToolDia", "taperToolDia", "moldToolDia", "slatToolDia", "outlineFeed", "taperFeed", "moldFeed", "slatFeed", "outlinePlunge", "taperPlunge", "moldPlunge", "slatPlunge", "cutThrough", "tabHeight", "rampLen", "stepover", "sidewallStock", "moldMargin", "slatBase", "slatOverlap", "slatSheetW", "slatHoleDia", "slatHoleH", "slatHoleSpacing", "boreToolDia", "boreFeed", "borePlunge", "boreDia", "boreDepth", "boreSpaceX", "boreSpaceY", "offsetX", "offsetY", "pocketToolDia", "pocketFeed", "pocketPlunge", "pocketL", "pocketW", "pocketDepth", "pocketCenterY", "roughToolDia", "roughStepover", "roughStepdown", "finishAllowance", "bladeOffset", "dragLeadIn"]) if (typeof n[k] === "number") n[k] = +(n[k] * fac).toFixed(u === "inch" ? 4 : 2); try { localStorage.setItem("bcs_cam", JSON.stringify(n)); } catch (e) {} return n; });
  // Mold-slat rib profiles (length × height): top edge = camber/rocker base curve, flat bottom. Auto-nests
  // N copies of each section into columns that respect the sheet width, so a whole rack cuts in one program.
  const slatPolys = useMemo(() => {
    if (camOpt.op !== "slat") return null;
    const L = ski.length, uLm = camOpt.units === "inch" ? 25.4 : 1;
    const slatBase = camOpt.slatBase * uLm, overlap = camOpt.slatOverlap * uLm;
    const sheetY = Math.max(80, (camOpt.slatSheetW || 1200) * uLm), copies = Math.max(1, Math.round(camOpt.slatCopies || 1));
    const holesOn = !!camOpt.slatHoles, holeH = (camOpt.slatHoleH || 15) * uLm, holeSp = Math.max(2, (camOpt.slatHoleSpacing || 10) * uLm), holeMargin = Math.max(holeSp, 20);
    const holeEndZone = Math.max(holeSp, (camOpt.slatHoleEndZone || 300) * uLm);   // holes only within this of each end; middle skipped
    let bmin = 1e9; for (let x = 0; x <= L; x += 4) bmin = Math.min(bmin, sideProfileHeightAt(ski, x));
    const topY = x => (sideProfileHeightAt(ski, x) - bmin) + slatBase;
    const ribH = (x0, x1) => { let m = 0; for (let i = 0; i <= 60; i++) m = Math.max(m, topY(x0 + (x1 - x0) * i / 60)); return m; };
    const mk = (x0, x1, colX, yShift, label) => { const N = 200, pts = []; for (let i = 0; i <= N; i++) { const x = x0 + (x1 - x0) * i / N; pts.push({ x: colX + (x - x0), y: topY(x) + yShift }); } pts.push({ x: colX + (x1 - x0), y: yShift }); pts.push({ x: colX, y: yShift }); pts._label = label; return pts; };
    const cp = ski.coreProfile || [];
    const tc = (cp.find(p => p.contact === "tail") || {}).pos, pc = (cp.find(p => p.contact === "tip") || {}).pos;
    const xTail = (tc != null ? tc : 0.12) * L, xTip = (pc != null ? pc : 0.88) * L;
    const gap = 18, colGap = 30, out = [];
    // Threaded-rod alignment holes: fixed height off the flat bottom; a row every 'spacing' on the long
    // center slats, one hole per short end piece (near the edge that overlaps the center).
    const addHoles = (poly, leftX, len, kind) => {
      if (holesOn) {
        const y = poly[poly.length - 1].y + holeH, hs = [];
        if (kind === "center") { for (let hx = holeMargin; hx <= len - holeMargin + 1e-6; hx += holeSp) { if (hx <= holeEndZone || hx >= len - holeEndZone) hs.push({ x: leftX + hx, y }); } }
        else if (kind === "tail") hs.push({ x: leftX + Math.max(15, len - 25), y });   // inner edge = right end
        else hs.push({ x: leftX + Math.min(len - 15, 25), y });                        // tip inner edge = left end
        poly._holes = hs;
      }
      return poly;
    };
    if (camOpt.slatSections === "whole") {
      let colX = 0, y = 0;
      for (let c = 0; c < copies; c++) { const h = ribH(0, L); if (y > 0 && y + h > sheetY) { colX += L + colGap; y = 0; } out.push(addHoles(mk(0, L, colX, y, "full #" + (c + 1)), colX, L, "center")); y += h + gap; }
      return out;
    }
    const boardW = xTip - xTail;                 // longest section → board length in use
    let colX = 0, y = 0;
    const nextCol = () => { colX += boardW + colGap; y = 0; };
    for (let c = 0; c < copies; c++) { const h = ribH(xTail, xTip); if (y > 0 && y + h > sheetY) nextCol(); out.push(addHoles(mk(xTail, xTip, colX, y, "center #" + (c + 1)), colX, boardW, "center")); y += h + gap; }
    y += gap * 1.5;                              // separate the center stack from the end-piece grid
    const ends = [];
    for (let c = 0; c < copies; c++) { ends.push([0, Math.min(L, xTail + overlap), "tail", c + 1]); ends.push([Math.max(0, xTip - overlap), L, "tip", c + 1]); }
    let rowX = 0, rowMaxH = 0;
    for (const [x0, x1, kind, ci] of ends) {
      const len = x1 - x0, h = ribH(x0, x1);
      if (rowX > 0 && rowX + len > boardW) { y += rowMaxH + gap; rowX = 0; rowMaxH = 0; }   // wrap to next row
      if (y + h > sheetY) { nextCol(); rowX = 0; rowMaxH = 0; }                              // wrap to next column
      out.push(addHoles(mk(x0, x1, colX + rowX, y, kind + " #" + ci), colX + rowX, len, kind));
      rowX += len + gap; rowMaxH = Math.max(rowMaxH, h);
    }
    return out;
  }, [ski, camOpt.op, camOpt.slatBase, camOpt.slatOverlap, camOpt.slatSections, camOpt.slatCopies, camOpt.slatSheetW, camOpt.units]);
  const borePts = useMemo(() => {
    if (camOpt.op !== "bore") return null;
    const L = ski.length, uLm = camOpt.units === "inch" ? 25.4 : 1;
    const cx = (camOpt.boreCenter != null ? camOpt.boreCenter : 0.5) * L, spx = camOpt.boreSpaceX * uLm, spy = camOpt.boreSpaceY * uLm;
    const cols = Math.max(1, Math.round(camOpt.boreCols || 1)), rows = Math.max(1, Math.round(camOpt.boreRows || 1));
    const pts = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) pts.push({ x: cx + (i - (cols - 1) / 2) * spx, y: (j - (rows - 1) / 2) * spy });
    return pts;
  }, [ski.length, camOpt.op, camOpt.boreCenter, camOpt.boreSpaceX, camOpt.boreSpaceY, camOpt.boreCols, camOpt.boreRows, camOpt.units]);
  const camResult = useMemo(() => {
    try {
      const b = { units: camOpt.units, zZero: camOpt.zZero, stockThick: camOpt.stockThick, spindle: camOpt.spindle, safeZ: camOpt.safeZ, origin: camOpt.origin, spindleCW: camOpt.spindleCW, stepdown: camOpt.stepdown, stockL: camOpt.stockL, stockW: camOpt.stockW, centerInStock: camOpt.centerInStock, postKey: camOpt.postKey, postOverride: camOpt.postOverride, arcOut: camOpt.arcOut, partAxis: camOpt.partAxis, offsetX: camOpt.offsetX, offsetY: camOpt.offsetY };
      const opt = camOpt.op === "outline"
        ? { ...b, doProfile: false, doPerimeter: true, toolNum: camOpt.outlineToolNum, toolDia: camOpt.outlineToolDia, feed: camOpt.outlineFeed, plunge: camOpt.outlinePlunge, perimeterSide: camOpt.perimeterSide, cutThrough: camOpt.cutThrough, tabN: camOpt.tabN, tabHeight: camOpt.tabHeight, perimDir: camOpt.perimDir, rampEntry: camOpt.rampEntry, rampLen: camOpt.rampLen }
        : camOpt.op === "mold"
        ? { ...b, doProfile: true, doPerimeter: false, heightMode: "base", moldInvert: camOpt.moldInvert, moldMargin: camOpt.moldMargin, toolNum: camOpt.moldToolNum, toolDia: camOpt.moldToolDia, feed: camOpt.moldFeed, plunge: camOpt.moldPlunge, stepover: camOpt.stepover, profPattern: camOpt.profPattern, profDir: camOpt.profDir, sidewallEngage: "off", roughing: camOpt.roughing, roughToolNum: camOpt.roughToolNum, roughToolDia: camOpt.roughToolDia, roughStepover: camOpt.roughStepover, roughStepdown: camOpt.roughStepdown, finishAllowance: camOpt.finishAllowance }
        : camOpt.op === "slat"
        ? { ...b, doProfile: false, doPerimeter: false, slatPolys, toolNum: camOpt.slatToolNum, toolDia: camOpt.slatToolDia, feed: camOpt.slatFeed, plunge: camOpt.slatPlunge, cutThrough: camOpt.cutThrough, tabN: camOpt.tabN, tabHeight: camOpt.tabHeight, slatHoleDia: camOpt.slatHoleDia, slatHoleToolNum: camOpt.slatHoleToolNum }
        : camOpt.op === "bore"
        ? { ...b, doProfile: false, doPerimeter: false, borePts, toolNum: camOpt.boreToolNum, toolDia: camOpt.boreToolDia, feed: camOpt.boreFeed, plunge: camOpt.borePlunge, boreDia: camOpt.boreDia, boreDepth: camOpt.boreDepth, boreHelix: camOpt.boreHelix }
        : camOpt.op === "base"
        ? { ...b, doProfile: false, doPerimeter: false, baseOp: true, toolNum: camOpt.baseToolNum, toolDia: camOpt.baseToolDia, feed: camOpt.baseFeed, plunge: camOpt.basePlunge, cutThrough: camOpt.cutThrough, bladeOffset: camOpt.bladeOffset, dragLeadIn: camOpt.dragLeadIn }
        : camOpt.op === "pocket"
        ? { ...b, doProfile: false, doPerimeter: false, doPocket: true, toolNum: camOpt.pocketToolNum, toolDia: camOpt.pocketToolDia, feed: camOpt.pocketFeed, plunge: camOpt.pocketPlunge, stepover: camOpt.stepover, pocketCenterX: camOpt.pocketCenterX, pocketCenterY: camOpt.pocketCenterY, pocketL: camOpt.pocketL, pocketW: camOpt.pocketW, pocketDepth: camOpt.pocketDepth }
        : { ...b, doProfile: true, doPerimeter: false, toolNum: camOpt.taperToolNum, toolDia: camOpt.taperToolDia, feed: camOpt.taperFeed, plunge: camOpt.taperPlunge, stepover: camOpt.stepover, profPattern: camOpt.profPattern, profDir: camOpt.profDir, sidewallStock: camOpt.sidewallStock, sidewallEngage: camOpt.sidewallEngage, roughing: camOpt.roughing, roughToolNum: camOpt.roughToolNum, roughToolDia: camOpt.roughToolDia, roughStepover: camOpt.roughStepover, roughStepdown: camOpt.roughStepdown, finishAllowance: camOpt.finishAllowance };
      return buildCoreCAM(ski, opt);
    } catch (e) { return { gcode: "; error\n" + e, stats: null }; }
  }, [ski, camOpt, slatPolys, borePts]);
  const downloadCAM = useCallback(() => {
    downloadFile(camResult.gcode, `bcs-core-${camOpt.op}-${ski.length}mm-${camOpt.units}.${(camResult.stats && camResult.stats.ext) || "nc"}`, "text/plain");
  }, [camResult, ski.length, camOpt.op, camOpt.units]);
  const camMachine = useMemo(() => {
    if (!camOpt.showMachine || !camResult || !camResult.stats) return null;
    const inch = camOpt.units === "inch", cv = v => inch ? v / 25.4 : v;
    const mShort = cv(camOpt.machineX), mLong = cv(camOpt.machineY);   // bed X short, Y long, display units
    const mx = camResult.stats.machX != null ? camResult.stats.machX : camResult.stats.stockY;
    const my = camResult.stats.machY != null ? camResult.stats.machY : camResult.stats.stockX;
    const fits = mx <= mShort && my <= mLong;   // actual toolpath X-extent vs short bed, Y-extent vs long
    return { short: mShort, long: mLong, fits };
  }, [camOpt.showMachine, camOpt.machineX, camOpt.machineY, camOpt.units, camResult]);
  const camStock = useMemo(() => {
    const L = camOpt.stockL || 0, W = camOpt.stockW || 0;                 // user's real stock, display units
    if (!L || !W || !camResult || !camResult.stats) return null;
    const xExt = camOpt.partAxis === "y" ? W : L, yExt = camOpt.partAxis === "y" ? L : W;   // along machine X / Y
    const s = camResult.stats, mx = s.machX != null ? s.machX : s.stockY, my = s.machY != null ? s.machY : s.stockX;
    return { xExt, yExt, fits: mx <= xExt + 1e-6 && my <= yExt + 1e-6, overX: +(mx - xExt).toFixed(2), overY: +(my - yExt).toFixed(2) };
  }, [camOpt.stockL, camOpt.stockW, camOpt.partAxis, camOpt.units, camResult]);
  const openSetupSheet = useCallback(() => {
    const s = camResult.stats; if (!s) return;
    const tK = k => camOpt.op + k, uu = camOpt.units === "inch" ? "in" : "mm", uf = uu + "/min";
    const opName = { outline: "Outline through-cut", taper: "Surface taper", mold: "Mold surfacing", slat: "Slat molds", bore: "Insert bores", pocket: "Pocket" }[camOpt.op] || camOpt.op;
    const post = (POST_PROFILES[camOpt.postKey] || {}).name || camOpt.postKey;
    const tool = `T${camOpt[tK("ToolNum")]} · ${camOpt[tK("ToolDia")]} ${uu} dia`;
    const rows = [["Operation", opName], ["Controller / post", post], ["Units", uu], ["Stock needed", `${s.stockX} × ${s.stockY} × ${s.setThick} ${uu} (${s.stockLbl})`], ["Primary tool", tool]];
    if (camOpt.roughing && (camOpt.op === "mold" || camOpt.op === "taper")) rows.push(["Rough tool", `T${camOpt.roughToolNum} · ${camOpt.roughToolDia} ${uu} dia — leaves ${camOpt.finishAllowance} ${uu}`]);
    if (camOpt.op === "slat" && camOpt.slatHoles) rows.push(["Drill tool", `T${camOpt.slatHoleToolNum} · ${camOpt.slatHoleDia} ${uu} dia — rod holes`]);
    rows.push(["Spindle", `${camOpt.spindle} rpm ${camOpt.spindleCW ? "CW" : "CCW"}`], ["Feed / plunge", `${camOpt[tK("Feed")]} / ${camOpt[tK("Plunge")]} ${uf}`]);
    const so = camOpt.op === "outline" || camOpt.op === "slat" || camOpt.op === "bore";
    rows.push([so ? "Stepdown" : "Stepdown / stepover", so ? `${camOpt.stepdown} ${uu}` : `${camOpt.stepdown} / ${camOpt.stepover} ${uu}`], ["Deepest cut (Z)", `${s.minZ} ${uu}`], ["Est. run time", `${s.estMin} min · ${s.lines.toLocaleString()} lines${camOpt.arcOut ? " · arcs on" : ""}`]);
    if (camMachine) rows.push(["Machine bed", `${camMachine.fits ? "✓ fits" : "✗ EXCEEDS"} · part ${s.machX}×${s.machY} on ${uu === "in" ? camMachine.short.toFixed(0) + "×" + camMachine.long.toFixed(0) : Math.round(camMachine.short) + "×" + Math.round(camMachine.long)} ${uu} bed`]);
    const steps = [`Clamp the ${s.stockKind} down — confirm clamps clear the entire toolpath.`, `Load ${tool}${camOpt.roughing && (camOpt.op === "mold" || camOpt.op === "taper") ? " and the rough tool" : ""} (or set up the ATC tools).`, `Jog to the FRONT-LEFT corner of the stock and zero X and Y there (corner origin — every move is positive).`, `Zero Z on ${camOpt.zZero === "bed" ? "the machine bed / spoilboard" : "the top of the stock"}.`, `Air-cut once above the stock to confirm the program stays on the part and nothing goes negative.`, `Run it — keep a hand near feed-hold, especially on the first pass.`];
    const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Setup Sheet — ${esc(ski.designName || "Ski")} ${esc(camOpt.op)}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:32px auto;padding:0 24px;color:#1a1a1a}h1{font-size:20px;letter-spacing:2px;margin:0 0 2px}.sub{color:#777;font-size:12px;margin-bottom:22px}table{width:100%;border-collapse:collapse;margin-bottom:22px}td{padding:7px 6px;border-bottom:1px solid #e8e8e8;font-size:13px;vertical-align:top}td:first-child{color:#888;width:38%}h3{font-size:12px;letter-spacing:2px;color:#555}ol{font-size:13px;line-height:1.75;padding-left:20px}.warn{background:#fdf1ec;border:1px solid #e8552a;border-radius:6px;padding:10px 14px;font-size:12px;color:#b5391a;margin-top:16px}.foot{color:#bbb;font-size:11px;margin-top:26px;border-top:1px solid #eee;padding-top:10px}@media print{.np{display:none}}</style></head><body><h1>CNC SETUP SHEET</h1><div class="sub">${esc(ski.designName || "Ski")} · ${esc(opName)} · ${new Date().toLocaleDateString()}</div><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table><h3>SET UP &amp; RUN</h3><ol>${steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol>${camMachine && !camMachine.fits ? `<div class="warn">⚠ This job EXCEEDS the machine bed as set. Re-orient, tile it, or use a larger machine before running.</div>` : ""}<div class="foot">Black Chapel Studios ski designer · designer.blackchapelstudios.com</div><button class="np" onclick="window.print()" style="margin-top:20px;padding:8px 16px;font-size:13px;cursor:pointer">Print / Save PDF</button></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); } else downloadFile(html, `setup-${camOpt.op}-${ski.length}mm.html`, "text/html");
  }, [camResult, camOpt, camMachine, ski]);
  const camLabel = { color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 };
  const camSmall = { color: C.labelDim, fontSize: 10, marginBottom: 2, fontFamily: "'JetBrains Mono', monospace" };
  const camInput = { width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "5px 7px", color: C.value, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" };
  const camSeg = on => ({ flex: 1, padding: "6px 4px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", background: on ? C.heading : C.inputBg, color: on ? C.bgDeep : C.label, border: `1px solid ${on ? C.heading : C.inputBorder}`, borderRadius: 3, cursor: "pointer", fontWeight: on ? 700 : 400 });

  // ── Save / Load state ─────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [loadMessage, setLoadMessage] = useState(null);  // { type: "ok"|"error"|"warn", text }
  const [recoverBanner, setRecoverBanner] = useState(null);

  // On mount: restore the last-active mode's autosave if it differs from that mode's default.
  useEffect(() => {
    const lastMode = readLastMode();
    const saved = readAutosave(lastMode);
    const baseline = lastMode === "snowboard" ? SNOWBOARD_PRESETS[0] : DEFAULT_SKI;
    if (saved && saved.ski && JSON.stringify(saved.ski) !== JSON.stringify(baseline)) {
      setRecoverBanner({ ...saved, mode: lastMode });
    }
  }, []);

  // Debounced autosave: write to localStorage 1 second after the last edit.
  useEffect(() => {
    const t = setTimeout(() => writeAutosave(ski), 1000);
    return () => clearTimeout(t);
  }, [ski]);

  // Toggle between ski and snowboard, parking the current design in the stash and restoring the other
  // mode's design if we have one (in the stash or its autosave slot); otherwise start from that mode's
  // default. This makes the toggle feel like switching between two workbenches — both shapes and names
  // persist independently.
  const switchMode = useCallback((targetMode) => {
    const current = ski.mode === "snowboard" ? "snowboard" : "ski";
    if (targetMode === current) return;
    // Park the current design.
    modeStash.current[current] = ski;
    writeAutosave(ski);
    // Restore the target design: stash first, then its autosave slot, then a fresh default.
    let next = modeStash.current[targetMode];
    if (!next) {
      const saved = readAutosave(targetMode);
      if (saved && saved.ski) next = saved.ski;
    }
    if (!next) {
      next = targetMode === "snowboard"
        ? { ...SNOWBOARD_PRESETS[0], designName: "Untitled Board", layup: ski.layup }
        : { ...DEFAULT_SKI, layup: ski.layup };
    }
    setSki(next);
  }, [ski]);

  const handleSave = useCallback(() => {
    const isBoard = ski.mode === "snowboard";
    const isUnnamed = !ski.designName || ski.designName === "Untitled Design" || ski.designName === "Untitled Board";
    if (isUnnamed) {
      const name = window.prompt("Name this design before saving:", isBoard ? "My Snowboard" : "My Ski Design");
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

  // ── Shareable permalink ───────────────────────────────────────
  const [shareMsg, setShareMsg] = useState(null);
  // On first mount, if the URL carries a shared design (#d=...), load it and clear the hash so a
  // later save/edit doesn't keep re-loading the old link.
  const sharedLoadedRef = useRef(false);
  useEffect(() => {
    if (sharedLoadedRef.current) return;
    sharedLoadedRef.current = true;
    try {
      const m = (window.location.hash || "").match(/[#&]d=([^&]+)/);
      if (m) {
        const decoded = decodeDesign(m[1]);
        if (decoded) {
          setSki(decoded);
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }
    } catch (e) {}
  }, []);
  const handleCopyShareLink = useCallback(() => {
    const enc = encodeDesign(ski);
    if (!enc) { setShareMsg({ type: "error", text: "Could not build link." }); return; }
    const url = `${window.location.origin}${window.location.pathname}#d=${enc}`;
    const done = (ok) => {
      setShareMsg(ok
        ? { type: "ok", text: `Link copied (${(url.length / 1024).toFixed(1)} KB)` }
        : { type: "warn", text: "Copy failed — select the box and copy manually." });
      setShareCopyUrl(url);
      setTimeout(() => setShareMsg(null), 4000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => done(true)).catch(() => done(false));
    } else { done(false); }
  }, [ski]);
  const [shareCopyUrl, setShareCopyUrl] = useState("");

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
    snowboard: true,
    coreFill: false,
    sideProfile: false,
    symmetry: false,
    layup: false,
    topsheet: false,
    flex: true,           // open by default so the rating chip is visible
    materials: false,
    buildCard: false,
    cncExport: false,
    cam: false,
    externalTools: false,
    suppliers: false,
    beta: true,
  };
  const [sectionsOpen, setSectionsOpen] = useState(() => {
    try {
      const raw = localStorage.getItem(ACCORDION_KEY);
      if (raw) return { ...defaultSectionsOpen, ...JSON.parse(raw) };
    } catch (e) {}
    return defaultSectionsOpen;
  });
  // One-panel-at-a-time: opening a panel auto-collapses the others. Opt-in, persisted.
  const [singleOpen, setSingleOpen] = useState(() => { try { return localStorage.getItem("bcs_single_open") === "1"; } catch (e) { return false; } });
  const singleOpenRef = useRef(singleOpen);
  useEffect(() => { singleOpenRef.current = singleOpen; try { localStorage.setItem("bcs_single_open", singleOpen ? "1" : "0"); } catch (e) {} }, [singleOpen]);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const toggleSection = useCallback((key) => {
    setSectionsOpen(prev => {
      const opening = !prev[key];
      let next;
      if (opening && singleOpenRef.current) { next = {}; for (const k of Object.keys(prev)) next[k] = false; next[key] = true; }
      else next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(ACCORDION_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }, []);
  const setAllSections = useCallback((open) => {
    setSectionsOpen(prev => {
      const next = {}; for (const k of Object.keys(prev)) next[k] = open;
      try { localStorage.setItem(ACCORDION_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }, []);
  const toggleGroup = useCallback((keys) => {
    setSectionsOpen(prev => {
      const allOpen = keys.every(k => !!prev[k]);
      const next = { ...prev }; keys.forEach(k => next[k] = !allOpen);
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
  // ── Resizable sidebar + navigation refs ──
  const [panelW, setPanelW] = useState(() => { try { const v = parseInt(localStorage.getItem("bcs_sidebar_w")); if (v >= 240 && v <= 560) return v; } catch (e) {} return 290; });
  useEffect(() => { try { localStorage.setItem("bcs_sidebar_w", String(panelW)); } catch (e) {} }, [panelW]);
  const [barH, setBarH] = useState(96);
  const sidebarScrollRef = useRef(null);
  const groupRefs = useRef({});
  const barRef = useRef(null);
  const startResize = useCallback((e) => {
    const onMove = (ev) => setPanelW(Math.max(240, Math.min(560, ev.clientX)));
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none"; e.preventDefault();
  }, []);
  const scrollToGroup = useCallback((id) => { const el = groupRefs.current[id]; if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);
  const runSearch = useCallback((q) => {
    setSidebarQuery(q);
    const ql = q.trim().toLowerCase(); if (!ql) return;
    for (const g of SIDEBAR_GROUPS) {
      for (const s of g.sections) {
        if (s.mode && s.mode !== (ski.mode || "ski")) continue;
        if (s.title.toLowerCase().includes(ql) || s.terms.includes(ql)) {
          setSectionsOpen(prev => { const n = singleOpenRef.current ? Object.fromEntries(Object.keys(prev).map(k => [k, false])) : { ...prev }; n[s.key] = true; try { localStorage.setItem(ACCORDION_KEY, JSON.stringify(n)); } catch (e) {} return n; });
          setTimeout(() => scrollToGroup(g.id), 60);
          return;
        }
      }
    }
  }, [ski.mode, scrollToGroup]);
  // Keep the sticky-header offset in sync with the top bar's real height (it grows when search wraps).
  useEffect(() => { const el = barRef.current; if (!el || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(() => setBarH(el.offsetHeight)); ro.observe(el); setBarH(el.offsetHeight); return () => ro.disconnect(); }, []);
  // Restore the sidebar scroll position from last visit, and save it as you scroll.
  useEffect(() => { const el = sidebarScrollRef.current; if (!el) return; try { const t = parseInt(localStorage.getItem("bcs_sidebar_scroll")); if (t > 0) setTimeout(() => { if (sidebarScrollRef.current) sidebarScrollRef.current.scrollTop = t; }, 30); } catch (e) {} }, []);
  const scrollSaveTimer = useRef(null);
  const onSidebarScroll = useCallback(() => { if (scrollSaveTimer.current) return; scrollSaveTimer.current = setTimeout(() => { scrollSaveTimer.current = null; const el = sidebarScrollRef.current; if (el) { try { localStorage.setItem("bcs_sidebar_scroll", String(el.scrollTop)); } catch (e) {} } }, 350); }, []);
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

  const mobileHeaderH = 52;
  const desktopHeaderH = 56;
  const headerH = isCompact ? mobileHeaderH : desktopHeaderH;
  // The persistent top header takes a fixed slice of height on all screen sizes.
  // On compact, the sidebar becomes a drawer so the canvas also gets full width.
  const canvasW = isCompact ? size.w : (size.w - panelW - 5);
  const canvasAreaH = Math.max(0, size.h - headerH);
  let planH = 0, profH = 0, coreH = 0, flexH = 0, layersH = 0, camH = 0;
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
  else if (effectiveActiveView === "layers")    layersH = canvasAreaH;
  else if (effectiveActiveView === "cam")       camH = canvasAreaH;
  else if (effectiveActiveView === "analysis") {
    // Compact stacked analysis: divide remaining area equally among Profile, Core, Flex.
    const available = canvasAreaH - analysisNoticeH;
    profH = Math.floor(available / 3);
    coreH = Math.floor(available / 3);
    flexH = available - profH - coreH;
  } else {
    // Desktop "All" — give the layup band its natural height (capped) so it never needs scrolling, and
    // compress the other rows to make room.
    const stackNatH = buildLayerStackSVG(ski, { w: 460 }).height + 70;
    layersH = Math.min(stackNatH, Math.floor(canvasAreaH * 0.42));
    const rest = canvasAreaH - layersH;
    planH = Math.floor(rest * 0.50);
    profH = Math.floor(rest * 0.16);
    coreH = Math.floor(rest * 0.17);
    flexH = rest - planH - profH - coreH;
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
  // Section-group header. Carries a ref for jump-to scrolling and a click target that collapses /
  // expands every panel in the group at once. The info bubble keeps the one-line guidance a tap away.
  const groupHeader = (group) => {
    const keys = group.sections.filter(s => !s.mode || s.mode === (ski.mode || "ski")).map(s => s.key);
    const allOpen = keys.length > 0 && keys.every(k => !!sectionsOpen[k]);
    return (
      <div ref={el => { groupRefs.current[group.id] = el; }} style={{ display: "flex", alignItems: "center", gap: 7, margin: "16px 2px 5px", scrollMarginTop: (barH + 6) + "px" }}>
        <button onClick={() => toggleGroup(keys)} title={allOpen ? "Collapse this group" : "Expand this group"}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
          <span style={{ color: C.heading, fontSize: 9, lineHeight: 1, width: 8, textAlign: "center" }}>{allOpen ? "\u25BC" : "\u25B6"}</span>
          <span style={{ color: C.heading, fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.5, whiteSpace: "nowrap" }}>{group.num} · {group.label}</span>
        </button>
        {group.caption && <InfoBubble C={C} width={230}>{group.caption}</InfoBubble>}
        <div style={{ flex: 1, height: 1, background: C.panelBorder }} />
      </div>
    );
  };
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
              {(ski.mode === "snowboard" ? "Snowboard Designer" : "Ski Designer")}
              {ski.designName && ski.designName !== "Untitled Design" && ski.designName !== "Untitled Board" ? ` · ${ski.designName}` : ""}
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
            <div style={{ display: "flex", gap: 2, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 5, padding: 2, marginRight: 2 }}>
              {[["ski", "🎿 Ski"], ["snowboard", "🏂 Board"]].map(([m, lbl]) => {
                const active = (ski.mode || "ski") === m;
                return (
                  <button key={m} onClick={() => switchMode(m)} style={{
                    padding: "5px 10px", fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: 0.3, borderRadius: 3, border: "none", cursor: "pointer",
                    background: active ? C.heading : "transparent", color: active ? C.bgDeep : C.labelDim,
                  }}>{lbl}</button>
                );
              })}
            </div>
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

      <div ref={sidebarScrollRef} onScroll={onSidebarScroll} style={
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
              "--sb-bar-h": barH + "px",
            }
          : {
              // Desktop: original inline sidebar
              width: panelW, minWidth: panelW, background: C.panel,
              borderRight: `1px solid ${C.panelBorder}`,
              display: "flex", flexDirection: "column", overflowY: "auto",
              "--sb-bar-h": barH + "px",
            }
      }>
        {/* Hidden file input for Load Design */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          accept=".bcski,.bcboard,.json,application/json"
          style={{ display: "none" }}
        />

        {/* Sticky navigation bar — pinned to the top of the sidebar. Collapse/expand all, a one-panel
            mode, a search box that jumps to the matching panel, and jump-to-group chips. */}
        <div ref={barRef} style={{
          position: "sticky", top: 0, zIndex: 30, background: C.panel,
          borderBottom: `1px solid ${C.panelBorder}`, padding: "7px 12px 6px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <button onClick={() => setSingleOpen(v => !v)} title="Open only one panel at a time"
              style={{
                display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
                cursor: "pointer", padding: 0, color: singleOpen ? C.heading : C.labelDim,
                fontSize: 10, letterSpacing: 0.5, fontFamily: "'JetBrains Mono', monospace",
              }}>
              <span style={{ width: 26, height: 13, borderRadius: 7, position: "relative", background: singleOpen ? C.heading : C.inputBorder, flexShrink: 0 }}>
                <span style={{ position: "absolute", top: 2, left: singleOpen ? 15 : 2, width: 9, height: 9, borderRadius: 5, background: "#F0EDE4", transition: "left 0.18s" }} />
              </span>
              ONE AT A TIME
            </button>
            {(() => {
              const anyOpen = Object.values(sectionsOpen).some(Boolean);
              return (
                <button onClick={() => setAllSections(!anyOpen)} title={anyOpen ? "Collapse every panel" : "Open every panel"} style={{
                  background: "transparent", border: `1px solid ${C.inputBorder}`, borderRadius: 3,
                  padding: "3px 10px", color: C.label, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
                  fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", flexShrink: 0,
                }}>{anyOpen ? "Collapse all" : "Expand all"}</button>
              );
            })()}
          </div>
          <div style={{ position: "relative", marginTop: 6 }}>
            <input value={sidebarQuery} onChange={e => runSearch(e.target.value)}
              placeholder="Search panels (radius, rocker, layup…)"
              style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "5px 24px 5px 9px", color: C.value, fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }} />
            {sidebarQuery && (
              <button onClick={() => setSidebarQuery("")} aria-label="Clear search" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: C.labelDim, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 4px" }}>{"\u2715"}</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            {SIDEBAR_GROUPS.map(g => (
              <button key={g.id} onClick={() => scrollToGroup(g.id)} title={g.caption}
                style={{ flex: 1, minWidth: 22, background: "transparent", border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "2px 0", color: C.labelDim, fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>{g.num}</button>
            ))}
          </div>
        </div>

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

        {/* ── Ski / Snowboard mode toggle ── on compact only; desktop shows it in the header. */}
        {isCompact && (
        <div style={{ display: "flex", gap: 5, margin: "8px 12px 10px" }}>
          {[["ski", "🎿 Ski"], ["snowboard", "🏂 Snowboard"]].map(([m, lbl]) => {
            const active = (ski.mode || "ski") === m;
            return (
              <button key={m}
                onClick={() => switchMode(m)}
                style={{
                  flex: 1, padding: "7px 4px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: 0.5, fontWeight: 700, cursor: "pointer", borderRadius: 4,
                  background: active ? C.heading : "transparent", color: active ? C.bgDeep : C.labelDim,
                  border: `1px solid ${active ? C.heading : C.inputBorder}`,
                }}>{lbl}</button>
            );
          })}
        </div>
        )}

        {groupHeader(SIDEBAR_GROUPS[0])}
        <button onClick={() => setShowDb(true)} style={{
          width: "100%", background: C.control, border: "none", color: C.bgDeep, padding: "10px 12px",
          borderRadius: 4, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 0.5, marginBottom: 10,
        }}>{ski.mode === "snowboard" ? "Browse Snowboard Database" : "Browse Ski Database"}</button>
        {refGhost && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "6px 10px", background: C.inputBg, border: `1px dashed ${C.heading}`, borderRadius: 4 }}>
            <span style={{ color: C.heading, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" }}>Ghost (dims only): {refGhost._label}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setRefGhost(null)} style={{ background: "transparent", border: "none", color: C.controlHover, cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>clear ✕</button>
          </div>
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
              ["7", "Set edges & export", "In Edges & Core (Design), set the edge inset, core inset, and Full Wrap vs Contact-to-Contact edges. Then in CNC Export choose Base, Core, Core Side, Core STL, or the Combined file."],
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
              <b style={{ color: C.heading }}>Save often.</b> Use Save in the header (or File panel) to keep a <span style={{ color: C.heading, fontFamily: "'JetBrains Mono', monospace" }}>{ski.mode === "snowboard" ? ".bcboard" : ".bcski"}</span> file. Nothing is lost if you close the tab — auto-save keeps a copy in your browser.<br /><br />
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
          <button onClick={handleCopyShareLink} style={{
            width: "100%", background: "transparent", border: `1px solid ${C.heading}`,
            borderRadius: 3, padding: "8px 0", color: C.heading, fontSize: 12, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.6, cursor: "pointer",
            textTransform: "uppercase", marginTop: 10,
          }}>Copy Share Link</button>
          {shareMsg && (
            <div style={{ marginTop: 6, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace",
              color: shareMsg.type === "error" ? C.torch : shareMsg.type === "warn" ? C.heading : "#9FB8A8" }}>
              {shareMsg.text}
            </div>
          )}
          {shareMsg && shareMsg.type === "warn" && shareCopyUrl && (
            <input readOnly value={shareCopyUrl} onFocus={e => e.target.select()}
              style={{ width: "100%", marginTop: 6, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px", color: C.value, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box" }} />
          )}
          <div style={{ color: C.labelDim, fontSize: 10.5, marginTop: 6, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            A link that reopens this exact design in any browser. Artwork isn't included.
          </div>
          <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
            Save to a <span style={{ color: C.heading, fontFamily: "'JetBrains Mono', monospace", borderBottom: `1px solid ${C.heading}` }}>{ski.mode === "snowboard" ? ".bcboard" : ".bcski"}</span> file on your computer. Files load back at any time, on any device. Auto-save keeps an unsaved copy in your browser.
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
                {viewBtn("Plan", "plan")}{viewBtn("Prof", "profile")}{viewBtn("Core", "core")}{viewBtn("Flex", "flex")}{viewBtn("Layup", "layers")}{viewBtn("Path", "cam")}{viewBtn("All", "all")}
              </>
            )}
          </div>
          {ski.mode !== "snowboard" && (
            <button onClick={() => setPairView(v => !v)}
              style={{ width: "100%", marginTop: 8, background: pairView ? C.heading : "transparent", border: `1px solid ${C.heading}`, color: pairView ? C.bgDeep : C.heading, padding: "8px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
              {pairView ? "Pair View: ON" : "Pair View: OFF"}
            </button>
          )}
        </AccordionSection>

        {groupHeader(SIDEBAR_GROUPS[1])}
        <AccordionSection isOpen={sectionsOpen.presets} onToggle={() => toggleSection("presets")} title="Presets">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {((ski.mode || "ski") === "snowboard" ? SNOWBOARD_PRESETS : PRESETS).map(p => (
              <button key={p.name} onClick={() => setSki({ ...p, designName: p.name, layup: ski.layup })}
                style={{ background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "5px 11px", color: C.label, fontSize: 12, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
                onMouseOver={e => { e.currentTarget.style.borderColor = C.heading; e.currentTarget.style.color = C.heading; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = C.inputBorder; e.currentTarget.style.color = C.label; }}
              >{p.name}</button>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.dimensions} onToggle={() => toggleSection("dimensions")} title="Dimensions (mm)">
          {(() => {
            const board = (ski.mode || "ski") === "snowboard";
            const wMax = board ? 340 : 200;      // widths: boards run ~250-300mm
            const waistMin = board ? 180 : 50, waistMax = board ? 320 : 180;
            const lenMin = board ? 1000 : 1200, lenMax = 2200;
            return (
              <>
                {inputField("Length", "length", lenMin, lenMax)}
                {inputField(board ? "Nose W" : "Tip W", "tipWidth", 60, wMax)}
                {!ski.asymSidecut && inputField("Waist", "waistWidth", waistMin, waistMax)}
                {inputField("Tail W", "tailWidth", 60, wMax)}
                {!ski.asymSidecut && <SidecutRadiusField ski={ski} setSki={setSki} C={C} WAIST_MIN={waistMin} WAIST_MAX={waistMax} />}
                {!ski.asymContact && inputField(board ? "Nose Len" : "Tip Len", "tipLength", 80, 500)}
                {!ski.asymContact && inputField("Tail Len", "tailLength", 60, 400)}
                <RunningEdgeField ski={ski} setSki={setSki} C={C} />
                {inputField("Waist Pos", "waistPosition", ski.waistFullLength ? 0.10 : 0.30, ski.waistFullLength ? 0.90 : 0.70, 0.01)}
                <div style={{ display: "flex", gap: 5, marginTop: -2, marginBottom: 8 }}>
                  {[["span", false], ["full length", true]].map(([lbl, val]) => {
                    const active = !!ski.waistFullLength === val;
                    return (
                      <button key={lbl} onClick={() => setSki(s => {
                        if (!!s.waistFullLength === val) return s;
                        // Convert waistPosition so the waist stays at the same physical spot when the
                        // reference frame changes (span ↔ full length).
                        const tailC = s.tailLength, tipC = s.length - s.tipLength;
                        const wY = resolveWaistY(s);   // current absolute position
                        let wp;
                        if (val) wp = wY / s.length;                       // → fraction of full length
                        else wp = (wY - tailC) / (tipC - tailC);            // → fraction of span
                        return { ...s, waistFullLength: val, waistPosition: Math.round(wp * 100) / 100 };
                      })}
                        style={{ flex: 1, padding: "4px 4px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                          background: active ? C.heading : "transparent", color: active ? C.bgDeep : C.labelDim,
                          border: `1px solid ${active ? C.heading : C.inputBorder}`, borderRadius: 3, cursor: "pointer" }}>
                        {lbl}
                      </button>
                    );
                  })}
                </div>
                <div style={{ color: C.labelDim, fontSize: 10.5, marginTop: -4, marginBottom: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                  {ski.waistFullLength
                    ? "0.5 = geometric center of the ski (fraction of full length)."
                    : "0.5 = midway between the contact points (fraction of running edge)."}
                </div>
                {/* ── Asymmetric (advanced) — all left/right asymmetry contained here so symmetric skis are untouched ── */}
                <div style={{ border: `1px solid ${(ski.asymSidecut || ski.asymContact) ? C.heading : C.inputBorder}`, borderRadius: 5, marginTop: 6 }}>
                  <button onClick={() => setAsymOpen(o => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer", padding: "8px 10px", color: (ski.asymSidecut || ski.asymContact) ? C.heading : C.label, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
                    <span>ASYMMETRIC{(ski.asymSidecut || ski.asymContact) ? " · ON" : " (advanced)"}</span>
                    <span style={{ fontSize: 14 }}>{asymOpen ? "\u2212" : "+"}</span>
                  </button>
                  {asymOpen && (() => {
                    const swBtn = (on, onClick) => (
                      <button onClick={onClick} style={{ width: 30, height: 14, borderRadius: 7, border: "none", cursor: "pointer", position: "relative", background: on ? C.heading : C.inputBorder, flexShrink: 0 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 5, background: "#F0EDE4", position: "absolute", top: 2, left: on ? 18 : 2, transition: "left 0.2s" }} />
                      </button>
                    );
                    const numRow = (param, lab, extra) => (
                      <div key={param} style={{ marginBottom: 6 }}>
                        <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, display: "flex", justifyContent: "space-between" }}>
                          <span>{lab}</span>{extra != null && <span style={{ color: C.heading }}>{extra}</span>}
                        </div>
                        <input type="number" value={ski[param]} step={1}
                          onChange={e => setSki(s => ({ ...s, [param]: parseFloat(e.target.value) || 0 }))}
                          style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    );
                    return (
                      <div style={{ padding: "0 10px 10px" }}>
                        {/* Different sidecut radii (same effective edge) */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          {swBtn(ski.asymSidecut, () => setSki(s => s.asymSidecut
                            ? { ...s, asymSidecut: false, waistWidth: Math.round(((s.waistOutside ?? s.waistWidth) + (s.waistInside ?? s.waistWidth)) / 2) }
                            : { ...s, asymSidecut: true, waistOutside: s.waistWidth, waistInside: s.waistWidth }))}
                          <span style={{ color: C.value, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>Different sidecut radii</span>
                        </div>
                        {ski.asymSidecut && [["waistOutside", "Waist \u25B2 OUTSIDE", derived.radiusOutside], ["waistInside", "Waist \u25BC INSIDE", derived.radiusInside]].map(([p, l, r]) => numRow(p, l, "R " + (isFinite(r) ? r.toFixed(1) + " m" : "flat")))}
                        {/* Different effective edges (contact lengths) */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
                          {swBtn(ski.asymContact, () => setSki(s => s.asymContact
                            ? { ...s, asymContact: false }
                            : { ...s, asymContact: true, tipLengthOutside: s.tipLength, tipLengthInside: s.tipLength, tailLengthOutside: s.tailLength, tailLengthInside: s.tailLength }))}
                          <span style={{ color: C.value, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>Different effective edges</span>
                        </div>
                        {ski.asymContact && (
                          <>
                            <div style={{ color: C.heading, fontSize: 10, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, display: "flex", justifyContent: "space-between" }}>
                              <span>▲ OUTSIDE edge</span><span>eff {derived.effectiveEdgeOutside} mm</span>
                            </div>
                            {numRow("tipLengthOutside", "Tip Len", null)}
                            {numRow("tailLengthOutside", "Tail Len", null)}
                            <div style={{ color: C.heading, fontSize: 10, margin: "8px 0 4px", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, display: "flex", justifyContent: "space-between" }}>
                              <span>▼ INSIDE edge</span><span>eff {derived.effectiveEdgeInside} mm</span>
                            </div>
                            {numRow("tipLengthInside", "Tip Len", null)}
                            {numRow("tailLengthInside", "Tail Len", null)}
                          </>
                        )}
                        <div style={{ color: C.labelDim, fontSize: 10, marginTop: 8, lineHeight: 1.45, fontFamily: "'JetBrains Mono', monospace" }}>
                          ▲ outside = +x edge, ▼ inside = −x edge. Both base-cut modes (full-wrap and contact-wrap) follow each edge independently, so cutouts are asymmetric too.
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            );
          })()}
        </AccordionSection>

        {(ski.mode || "ski") === "snowboard" && (
          <AccordionSection isOpen={sectionsOpen.snowboard !== false} onToggle={() => toggleSection("snowboard")} title="Snowboard">
            {inputField("Stance W", "stanceWidth", 400, 720)}
            {inputField("Setback", "setback", -40, 80)}
            <div style={{ marginBottom: 7 }}>
              <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
                Insert Pattern
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {[["2x4", "2×4"], ["4x4", "4×4"], ["channel", "Channel"]].map(([val, lbl]) => {
                  const active = (ski.insertPattern || "2x4") === val;
                  return (
                    <button key={val} onClick={() => setSki(s => ({ ...s, insertPattern: val }))}
                      style={{ flex: 1, padding: "5px 4px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                        background: active ? C.heading : "transparent", color: active ? C.bgDeep : C.labelDim,
                        border: `1px solid ${active ? C.heading : C.inputBorder}`, borderRadius: 3, cursor: "pointer" }}>
                      {lbl}
                    </button>
                  );
                })}
              </div>
              <div style={{ color: C.labelDim, fontSize: 10.5, marginTop: 5, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                {(ski.insertPattern || "2x4") === "channel"
                  ? "Burton-style centered channel per foot."
                  : (ski.insertPattern === "4x4" ? "40×40mm grid. Older standard." : "40mm across × 20mm along. Modern standard.")}
                {" "}Stance {(ski.stanceWidth/10).toFixed(1)}cm · setback from effective-edge center.
              </div>
            </div>
          </AccordionSection>
        )}

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

        <AccordionSection isOpen={sectionsOpen.coreFill !== false} onToggle={() => toggleSection("coreFill")}
          title="Edges & Core">
          <div style={{ color: C.heading, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>EDGES</div>
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

          <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${C.panelBorder}`, color: C.heading, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>CORE</div>
          {inputField("Core Inset (mm)", "coreInset", 0, 10, 0.5)}
          <div style={{ color: C.labelDim, fontSize: 10.5, marginTop: -2, marginBottom: 6, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Narrows the wood core inside the edges (sidewall material) per side.
          </div>

          <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${C.panelBorder}`, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ color: C.heading, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>CORE FILL (V-CUT)</span>
            <InfoBubble C={C} width={260}>
              The wood core ends in a V at the enabled end. The extension sets the apex:
              a <b style={{ color: C.heading }}>positive</b> value pushes it <b style={{ color: C.heading }}>outward</b>
              past the contact (a spear pointing toward the tip/tail), a <b style={{ color: C.heading }}>negative</b>
              value pulls it <b style={{ color: C.heading }}>inward</b> toward the center (a swallowtail-style notch
              between two prongs). The region left open is fill material. Shows in the Core view and exports to
              the Core / Combined DXF and the Core STL.
            </InfoBubble>
          </div>
          {toggleBtn("Tip V-cut", "vcutTip")}
          {ski.vcutTip && inputField("Tip ext (mm) \u2014 + out / \u2212 in", "vcutTipExt", -Math.round((ski.length - ski.tipLength - ski.tailLength) / 2 * 0.9), Math.max(20, ski.tipLength))}
          {toggleBtn("Tail V-cut", "vcutTail")}
          {ski.vcutTail && inputField("Tail ext (mm) \u2014 + out / \u2212 in", "vcutTailExt", -Math.round((ski.length - ski.tipLength - ski.tailLength) / 2 * 0.9), Math.max(20, ski.tailLength))}
          <div style={{ color: C.labelDim, fontSize: 10.5, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Positive = outward spear, negative = inward notch. Preview in the Core view.
          </div>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.layup} onToggle={() => toggleSection("layup")} title="Layup / Materials">
          {selectField("Wood Core", ski.layup.wood, WOODS, v => setLayup("wood", v))}
          {selectField(ski.layup.fabricSplit ? "Fabric — TOP (biax / triax)" : "Fabric (biax / triax)", ski.layup.glass, GLASS, v => setLayup("glass", v))}
          <div style={{ marginBottom: 7 }}>
            <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>{ski.layup.fabricSplit ? "Top layers / side" : "Fabric Layers / side"}</div>
            <input type="number" value={ski.layup.glassLayers} min={1} max={4} step={1}
              onChange={e => setLayup("glassLayers", parseInt(e.target.value) || 1)}
              style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }} />
          </div>
          {/* Split the fabric so the top and bottom faces can use different weaves (e.g. biax carbon
              above the core, triax carbon below). Off = the top fabric is mirrored on the bottom. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: ski.layup.fabricSplit ? 8 : 6 }}>
            <button onClick={() => setSki(s => { const sp = !s.layup.fabricSplit; const lu = { ...s.layup, fabricSplit: sp }; if (sp && lu.glassBot === undefined) { lu.glassBot = lu.glass; lu.glassBotLayers = lu.glassLayers; } return { ...s, layup: lu }; })}
              style={{ width: 30, height: 14, borderRadius: 7, border: "none", cursor: "pointer", position: "relative", background: ski.layup.fabricSplit ? C.heading : C.inputBorder, flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: "#F0EDE4", position: "absolute", top: 2, left: ski.layup.fabricSplit ? 18 : 2, transition: "left 0.2s" }} />
            </button>
            <span style={{ color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>Different bottom fabric</span>
          </div>
          {ski.layup.fabricSplit && (
            <>
              {selectField("Fabric — BOTTOM (biax / triax)", ski.layup.glassBot || ski.layup.glass, GLASS, v => setLayup("glassBot", v))}
              <div style={{ marginBottom: 7 }}>
                <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Bottom layers / side</div>
                <input type="number" value={ski.layup.glassBotLayers || ski.layup.glassLayers} min={1} max={4} step={1}
                  onChange={e => setLayup("glassBotLayers", parseInt(e.target.value) || 1)}
                  style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }} />
              </div>
            </>
          )}
          {selectField("Metal", ski.layup.metal, METALS, v => setLayup("metal", v))}
          {selectField("UD Stringer", ski.layup.carbon, CARBON, v => setLayup("carbon", v))}
          {ski.layup.carbon !== "none" && (
            <div style={{ marginBottom: 7 }}>
              <div style={{ color: C.label, fontSize: 11, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Stringer Layers</div>
              <input type="number" value={ski.layup.carbonLayers} min={1} max={4} step={1}
                onChange={e => setLayup("carbonLayers", parseInt(e.target.value) || 1)}
                style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
          <div style={{ color: C.labelDim, fontSize: 10.5, marginTop: 2, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Both slots take glass or carbon — e.g. a carbon triax fabric over UD glass stringers. Turn on "Different bottom fabric" to run, say, biax carbon on top and triax below. The Flex panel updates as you mix.
          </div>
        </AccordionSection>

        {groupHeader(SIDEBAR_GROUPS[2])}
        <AccordionSection isOpen={sectionsOpen.topsheet} onToggle={() => toggleSection("topsheet")}
          title="Topsheet Art"
          accent={topsheet.src
            ? <span style={{ background: C.heading + "30", color: C.heading, border: `1px solid ${C.heading}66`, borderRadius: 3, padding: "2px 8px", fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>ON</span>
            : null}>
          <div style={{ color: C.labelDim, fontSize: 10, marginBottom: 10, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>
            Overlay artwork on the ski silhouette to preview a finished topsheet. Clipped to the outline. Export a rendered PNG below.
          </div>

          <button onClick={() => setTopsheetOpen(true)} style={{ width: "100%", background: C.heading, border: "none", color: C.bgDeep, padding: "12px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, marginBottom: 6 }}>◨  Open Topsheet Designer</button>
          <div style={{ color: C.labelDim, fontSize: 10, marginBottom: 12, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>
            Full pair-template designer — colors, gradients, uploaded art, text & shapes, with a print-ready export (1" bleed) for a topsheet printer. The quick overlay below is just for previewing on the silhouette.
          </div>

          <input ref={topsheetFileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => handleTopsheetFile(e.target.files && e.target.files[0])} />
          <button onClick={() => topsheetFileRef.current && topsheetFileRef.current.click()}
            style={{ width: "100%", background: C.heading, border: "none", color: C.bgDeep, padding: "9px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, marginBottom: 8 }}>
            {topsheet.src ? "Replace Image" : "Upload Image"}
          </button>

          <div style={{ color: C.label, fontSize: 10.5, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Print Template{pairView ? " (pair)" : ""}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            <button onClick={() => exportTopsheetTemplate("svg")}
              style={{ flex: 1, background: "transparent", border: `1px solid ${C.heading}`, color: C.heading, padding: "8px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
              SVG (vector)
            </button>
            <button onClick={() => exportTopsheetTemplate("png")}
              style={{ flex: 1, background: "transparent", border: `1px solid ${C.heading}`, color: C.heading, padding: "8px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
              PNG (150dpi)
            </button>
          </div>
          <div style={{ color: C.labelDim, fontSize: 10.5, marginBottom: 8, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            1:1 cut line + bleed + crop marks. Art is embedded and aligned exactly as shown above (use the Fit/Shift/Scale/Rotate controls to place it). For crisp prints, upload art at ~150 dpi of the final size (a full ski ≈ 10,600 px long).
          </div>

          <button onClick={() => setShow3D(true)}
            style={{ width: "100%", background: C.control, border: "none", color: C.bgDeep, padding: "9px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, marginBottom: 8 }}>
            View in 3D
          </button>

          {ski.mode !== "snowboard" && (
            <>
              <button onClick={() => setPairView(v => !v)}
                style={{ width: "100%", background: pairView ? C.heading : "transparent", border: `1px solid ${C.heading}`, color: pairView ? C.bgDeep : C.heading, padding: "9px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, marginBottom: 6 }}>
                {pairView ? "Pair View: ON" : "Pair View: OFF"}
              </button>
              <div style={{ color: C.labelDim, fontSize: 10.5, marginBottom: 8, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                Shows both skis as a mirrored pair. Topsheet art is projected across the pair, so asymmetric tips and split graphics render as a set.
              </div>
            </>
          )}

          {topsheet.src && (
            <>
              <div style={{ color: C.value, fontSize: 10, marginBottom: 10, wordBreak: "break-all", fontFamily: "'JetBrains Mono', monospace" }}>
                {topsheet.name || "topsheet image"}
              </div>

              <div style={{ color: C.label, fontSize: 11, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Fit</div>
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                {["cover", "contain", "stretch"].map(mode => (
                  <button key={mode} onClick={() => setTopsheetField("fit", mode)}
                    style={{ flex: 1, background: topsheet.fit === mode ? C.heading : C.inputBg, color: topsheet.fit === mode ? C.bgDeep : C.label, border: `1px solid ${topsheet.fit === mode ? C.heading : C.inputBorder}`, borderRadius: 3, padding: "6px 4px", cursor: "pointer", fontSize: 10.5, fontWeight: topsheet.fit === mode ? 700 : 400, fontFamily: "'JetBrains Mono', monospace", textTransform: "capitalize" }}>
                    {mode}
                  </button>
                ))}
              </div>

              {[
                { key: "opacity", label: "Opacity", min: 0.1, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)}%` },
                { key: "scale", label: "Scale", min: 0.2, max: 3, step: 0.02, fmt: v => `${v.toFixed(2)}\u00D7` },
                { key: "offsetX", label: "Shift \u2194", min: -0.5, max: 0.5, step: 0.01, fmt: v => `${Math.round(v * 100)}%` },
                { key: "offsetY", label: "Shift \u2195", min: -0.5, max: 0.5, step: 0.01, fmt: v => `${Math.round(v * 100)}%` },
                { key: "rotation", label: "Rotate", min: -180, max: 180, step: 1, fmt: v => `${Math.round(v)}\u00B0` },
              ].map(s => (
                <div key={s.key} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ color: C.label, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>{s.label}</span>
                    <span style={{ color: C.value, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{s.fmt(topsheet[s.key])}</span>
                  </div>
                  <input type="range" min={s.min} max={s.max} step={s.step} value={topsheet[s.key]}
                    onChange={e => setTopsheetField(s.key, parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: C.heading, cursor: "pointer" }} />
                </div>
              ))}

              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => setTopsheet(t => ({ ...t, opacity: 1, scale: 1, offsetX: 0, offsetY: 0, rotation: 0 }))}
                  style={{ flex: 1, background: "transparent", border: `1px solid ${C.inputBorder}`, color: C.label, padding: "7px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" }}>
                  Reset
                </button>
                <button onClick={clearTopsheet}
                  style={{ flex: 1, background: "rgba(232,85,42,0.14)", border: `1px solid ${C.torch}`, color: C.controlHover, fontWeight: 600, padding: "7px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" }}>
                  Remove
                </button>
              </div>

              <button onClick={exportTopsheetPNG}
                style={{ width: "100%", background: "transparent", border: `1px solid ${C.heading}`, color: C.heading, padding: "9px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, marginTop: 8 }}>
                Export Rendered PNG
              </button>
            </>
          )}
        </AccordionSection>

        {groupHeader(SIDEBAR_GROUPS[3])}
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
          {derived.asymmetric && stat("R front / back",
            `${isFinite(derived.frontRadius) ? derived.frontRadius.toFixed(1) : "--"} / ${isFinite(derived.backRadius) ? derived.backRadius.toFixed(1) : "--"} m`,
            C.contactLabel)}
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.materials} onToggle={() => toggleSection("materials")}
          title="Bill of Materials"
          accent={<span style={{ color: C.heading, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
            ${(() => {
              const qv = { wood: bom.coreVolL, glass: bom.glassM2, metal: bom.metalM2, carbon: bom.carbonM2, edge: bom.edgeLenM, base: bom.baseM2, topsheet: bom.topsheetM2, epoxy: bom.epoxyKg, insert: bom.inserts };
              return Math.round(Object.keys(qv).reduce((s, k) => s + qv[k] * (bomPrices[k] || 0), 0));
            })()}
          </span>}>
          <div style={{ color: C.labelDim, fontSize: 10.5, marginBottom: 8, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Estimated from geometry + layup. Prices are editable (USD) and saved on this device. A rough guide, not a quote.
          </div>
          {(() => {
            const rows = [
              { key: "wood", label: "Wood core", qty: bom.coreVolL, disp: `${bom.coreVolL.toFixed(2)} L`, unit: "$/L" },
              { key: "glass", label: `Fabric (${bom.glassLayers}/side)`, qty: bom.glassM2, disp: `${bom.glassM2.toFixed(2)} m\u00B2`, unit: "$/m\u00B2" },
              ...(bom.metalM2 > 0 ? [{ key: "metal", label: "Metal laminate", qty: bom.metalM2, disp: `${bom.metalM2.toFixed(2)} m\u00B2`, unit: "$/m\u00B2" }] : []),
              ...(bom.carbonM2 > 0 ? [{ key: "carbon", label: `UD stringer (${bom.carbonLayers}/side)`, qty: bom.carbonM2, disp: `${bom.carbonM2.toFixed(2)} m\u00B2`, unit: "$/m\u00B2" }] : []),
              { key: "edge", label: `Steel edge (${bom.edgeWrap})`, qty: bom.edgeLenM, disp: `${bom.edgeLenM.toFixed(2)} m`, unit: "$/m" },
              { key: "base", label: "Base (P-tex)", qty: bom.baseM2, disp: `${bom.baseM2.toFixed(2)} m\u00B2`, unit: "$/m\u00B2" },
              { key: "topsheet", label: "Topsheet", qty: bom.topsheetM2, disp: `${bom.topsheetM2.toFixed(2)} m\u00B2`, unit: "$/m\u00B2" },
              { key: "epoxy", label: "Epoxy (wet-out)", qty: bom.epoxyKg, disp: `${bom.epoxyKg.toFixed(2)} kg`, unit: "$/kg" },
              ...(bom.inserts > 0 ? [{ key: "insert", label: "Inserts", qty: bom.inserts, disp: `${bom.inserts} ea`, unit: "$/ea" }] : []),
            ];
            const total = rows.reduce((s, r) => s + r.qty * (bomPrices[r.key] || 0), 0);
            const cellL = { color: C.value, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" };
            const cellD = { color: C.labelDim, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" };
            return (
              <>
                {rows.map(r => (
                  <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1.25fr 0.8fr 52px 0.7fr", gap: 6, alignItems: "center", marginBottom: 5 }}>
                    <div>
                      <div style={cellL}>{r.label}</div>
                      <div style={cellD}>{r.disp}</div>
                    </div>
                    <div style={{ ...cellD, textAlign: "right" }}>{r.unit}</div>
                    <input type="number" value={bomPrices[r.key]} min={0} step={0.5}
                      onChange={e => setBomPrices(p => ({ ...p, [r.key]: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "4px 4px", color: C.value, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box", textAlign: "center" }} />
                    <div style={{ ...cellL, textAlign: "right" }}>${(r.qty * (bomPrices[r.key] || 0)).toFixed(0)}</div>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${C.inputBorder}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.heading, fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>EST. TOTAL</span>
                  <span style={{ color: C.heading, fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>${total.toFixed(0)}</span>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                  {stat("Core mass", `~${bom.coreMassKg.toFixed(2)} kg`, C.heading)}
                  {stat("Core blank", `${bom.blank.L}\u00D7${bom.blank.W}\u00D7${bom.blank.T} mm`)}
                  {stat("Planform", `${(bom.areaM2 * 1e4).toFixed(0)} cm\u00B2`)}
                </div>
              </>
            );
          })()}
        </AccordionSection>

        {groupHeader(SIDEBAR_GROUPS[4])}
        <AccordionSection isOpen={sectionsOpen.cncExport} onToggle={() => toggleSection("cncExport")} title="CNC Export">
          <div style={{ marginBottom: 9 }}>
            <div style={{ color: C.label, fontSize: 11, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Export Orientation</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { val: "vertical", label: "Vertical" },
                { val: "horizontal", label: "Horizontal" },
              ].map(opt => {
                const on = skiOrientation(ski) === opt.val;
                return (
                  <button key={opt.val}
                    onClick={() => setSki(s => ({ ...s, exportOrientation: opt.val }))}
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
              {skiOrientation(ski) === "vertical"
                ? "All exports run length up the page (portrait). Labels stay horizontal."
                : "All exports run length across the page (landscape). Labels stay horizontal."}
            </div>
          </div>
          <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginBottom: 12, marginTop: 8 }}>
            <b style={{color: C.heading}}>Edge inset:</b> P-Tex base cut offset (leaves room for metal edges).<br/>
            <b style={{color: C.heading}}>Core inset:</b> width reduction per side for sidewall material on core blank.
          </div>
          <div style={{ color: C.label, fontSize: 11, marginBottom: 5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Base — ski outline + edge offset</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            <button onClick={() => exportWithFeedbackPrompt(exportPlanDXF)} style={expBtn}>Base DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportPlanSVG)} style={expBtn}>Base SVG</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ color: C.label, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Core — outline + 3D solid</span>
            <InfoBubble C={C} width={260}>
              <b style={{ color: C.heading }}>DXF / SVG</b> are the core-inset top outline with contact marks. <b style={{ color: C.heading }}>STL</b> is a flat-bottomed 3D solid whose top follows the core-side taper &mdash; it includes the core inset and any tip/tail V-cuts. Import into CAM as millimetres to rough &amp; finish the core, no CAD modeling needed.
            </InfoBubble>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            <button onClick={() => exportWithFeedbackPrompt(exportCorePlanDXF)} style={expBtn}>DXF</button>
            <button onClick={() => exportWithFeedbackPrompt(exportCorePlanSVG)} style={expBtn}>SVG</button>
            <button onClick={() => exportWithFeedbackPrompt(exportCoreSTL)} style={expBtn}>STL</button>
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

        <AccordionSection isOpen={sectionsOpen.cam} onToggle={() => toggleSection("cam")} title="CNC G-code (CAM)">
          <button onClick={() => setCamOpen(true)} style={{ width: "100%", background: C.heading, border: "none", color: C.bgDeep, padding: "12px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>⛶  Open CAM Workspace</button>
        </AccordionSection>

        <AccordionSection isOpen={sectionsOpen.buildCard} onToggle={() => toggleSection("buildCard")} title="Build Card">
          <div style={{ color: C.labelDim, fontSize: 10, marginBottom: 10, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>
            A one-page spec sheet for customers or your bench: dimensions, sidecut, flex, layup, and core mass. Add your own name and logo to white-label it.
          </div>
          <div style={{ color: C.label, fontSize: 10.5, marginBottom: 6, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Your Branding</div>
          <input type="text" value={builderBrand.name}
            onChange={e => setBuilderBrand(b => ({ ...b, name: e.target.value }))}
            placeholder="Your shop / brand name"
            style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "7px 8px", color: C.value, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
          <input ref={brandLogoRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => handleBrandLogoFile(e.target.files && e.target.files[0])} />
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button onClick={() => brandLogoRef.current && brandLogoRef.current.click()}
              style={{ flex: 1, background: "transparent", border: `1px solid ${C.inputBorder}`, color: C.label, padding: "8px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" }}>
              {builderBrand.logoSrc ? "Replace Logo" : "Upload Logo"}
            </button>
            {builderBrand.logoSrc && (
              <button onClick={clearBrandLogo}
                style={{ flex: 1, background: "rgba(232,85,42,0.14)", border: `1px solid ${C.torch}`, color: C.controlHover, fontWeight: 600, padding: "8px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace" }}>
                Remove Logo
              </button>
            )}
          </div>
          {builderBrand.logoSrc && (
            <div style={{ color: C.value, fontSize: 9.5, marginBottom: 6, wordBreak: "break-all", fontFamily: "'JetBrains Mono', monospace" }}>{builderBrand.logoName || "logo"}</div>
          )}
          <div style={{ color: C.labelDim, fontSize: 10.5, marginBottom: 10, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            A wide logo (e.g. 800×200 px) reads best. Saved on this device; the footer credits the tool.
          </div>
          <button onClick={openSpecPreview}
            style={{ width: "100%", marginBottom: 6, background: C.control, border: "none", color: C.bgDeep, padding: "9px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
            Preview Build Card
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => exportSpecSheet("png")}
              style={{ flex: 1, background: C.heading, border: "none", color: C.bgDeep, padding: "9px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
              Spec Sheet PNG
            </button>
            <button onClick={() => exportSpecSheet("svg")}
              style={{ flex: 1, background: "transparent", border: `1px solid ${C.heading}`, color: C.heading, padding: "9px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
              SVG
            </button>
          </div>
        </AccordionSection>

        {groupHeader(SIDEBAR_GROUPS[5])}
        <AccordionSection isOpen={sectionsOpen.suppliers} onToggle={() => toggleSection("suppliers")} title="Material Suppliers">
          <div style={{ color: C.labelDim, fontSize: 10, marginBottom: 8, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>
            DIY ski &amp; snowboard build materials — wood cores, P-tex bases, steel edges, glass / carbon / flax fabric, epoxy, inserts. Nearest to you first.
          </div>
          {ORDERED_SUPPLIERS.map(s => (
            <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
              style={{ display: "block", color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, textDecoration: "none" }}>{s.name} — {s.region} ↗</a>
          ))}
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

      {/* Drag handle to resize the sidebar (desktop). Width persists across sessions. */}
      {!isCompact && (
        <div onMouseDown={startResize} title="Drag to resize"
          onMouseEnter={e => { e.currentTarget.style.background = C.heading; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          style={{ width: 5, flexShrink: 0, cursor: "col-resize", background: "transparent", transition: "background 0.15s", zIndex: 5 }} />
      )}

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
            <PlanView ski={ski} setSki={setSki} width={canvasW} height={planH} orientation={isCompact ? "vertical" : "horizontal"} topsheet={topsheet} pairView={pairView && ski.mode !== "snowboard"} refGhost={refGhost} />
            {viewLabelChip("Plan")}
          </div>
        )}
        {profH > 0 && (
          <div style={{ height: profH, position: "relative", borderBottom: `1px solid ${C.panelBorder}` }}>
            <ProfileView ski={ski} setSki={setSki} width={canvasW} height={profH} />
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
        {layersH > 0 && (
          <div style={{ height: layersH, position: "relative", overflow: "auto", background: "#141210" }}>
            {(() => {
              const w = Math.min(560, Math.max(280, canvasW - 40));
              const r = buildLayerStackSVG(ski, { x: 20, y: 44, w: w - 40, maxH: layersH - 64 });
              const h = r.height + 64;
              const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#141210"/><text x="20" y="28" font-size="13" fill="#c8935a" font-family="monospace" letter-spacing="2">LAYUP \u00B7 TOP \u2192 BASE</text>${r.svg}</svg>`;
              return (
                <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                  <img src={"data:image/svg+xml;utf8," + encodeURIComponent(svg)} alt="Layup cross-section" style={{ maxWidth: "100%", height: "auto" }} />
                </div>
              );
            })()}
            {viewLabelChip("Layup")}
          </div>
        )}
        {camH > 0 && (
          <div style={{ height: camH, position: "relative", background: "#14100d" }}>
            <ToolpathView gcode={camResult.gcode} width={canvasW} height={camH} />
            <div style={{ position: "absolute", left: 12, top: 10, color: C.heading, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.5 }}>
              TOOLPATH · {camOpt.op === "outline" ? "① OUTLINE" : camOpt.op === "mold" ? "③ MOLD" : camOpt.op === "slat" ? "④ SLATS" : camOpt.op === "bore" ? "⑤ BORE" : camOpt.op === "pocket" ? "⑥ POCKET" : camOpt.op === "base" ? "⑦ BASE (DRAG KNIFE)" : "② SURFACE TAPER"}
            </div>
            {camResult.stats && (
              <div style={{ position: "absolute", right: 12, top: 10, color: C.labelDim, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                Z {camResult.stats.minZ}…{camResult.stats.maxZ} {camResult.stats.unit} · {camResult.stats.estMin} min
              </div>
            )}
            {viewLabelChip("Path")}
          </div>
        )}
      </div>
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        trigger={feedbackTrigger}
      />
      {show3D && <Ski3DModal ski={ski} topsheet={topsheet} pairView={pairView && ski.mode !== "snowboard"} onClose={() => setShow3D(false)} />}
      {showDb && <SkiDatabaseModal kind={ski.mode === "snowboard" ? "snowboard" : "ski"} onClose={() => setShowDb(false)} onApply={applySkiFromDb} onGhost={setGhostFromDb} />}

      {camOpen && (
        <div style={{ position: "fixed", inset: 0, background: C.bgDeep, zIndex: 1200, display: "flex", flexDirection: "column" }}>
          <BrandBar title="CAM Workspace" subtitle="ski core · mold · slats · G-code" onClose={() => setCamOpen(false)} C={C} />
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            <div style={{ width: 400, flexShrink: 0, overflowY: "auto", padding: 16, borderRight: `1px solid ${C.panelBorder}` }}>
          {(() => {
            const uu = camOpt.units === "inch" ? "in" : "mm", uf = camOpt.units === "inch" ? "in/min" : "mm/min";
            const st = camOpt.units === "inch" ? 0.01 : 0.5, stf = camOpt.units === "inch" ? 10 : 50;
            const isOutline = camOpt.op === "outline", isMold = camOpt.op === "mold", isSlat = camOpt.op === "slat", isBore = camOpt.op === "bore", isPocket = camOpt.op === "pocket", isBaseOp = camOpt.op === "base", tK = k => camOpt.op + k;
            return (
              <>
                <div style={{ color: C.value, fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
                  Two files for the two setups: <b style={{ color: C.heading }}>① Outline</b> the flat blank, glue &amp; cure sidewalls, then <b style={{ color: C.heading }}>② Surface taper</b> the assembled core. Generate one, then switch and generate the other.
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={camLabel}>Units</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[["mm", "Metric"], ["inch", "Imperial"]].map(([v, l]) => (<button key={v} onClick={() => setCamUnits(v)} style={camSeg(camOpt.units === v)}>{l}</button>))}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={camLabel}>Z zero</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[["bed", "Bed"], ["stocktop", "Stock top"]].map(([v, l]) => (<button key={v} onClick={() => setCam("zZero", v)} style={camSeg(camOpt.zZero === v)}>{l}</button>))}
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={camLabel}>Operation (one file each)</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["outline", "① Outline"], ["taper", "② Taper"], ["mold", "③ Mold"], ["slat", "④ Slats"], ["bore", "⑤ Bore"], ["pocket", "⑥ Pocket"], ["base", "⑦ Base"]].map(([v, l]) => (<button key={v} onClick={() => setCam("op", v)} style={camSeg(camOpt.op === v)}>{l}</button>))}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                  {[["Tool #", "ToolNum", 1], ["Tool Ø", "ToolDia", st], ["Feed", "Feed", stf], ["Plunge", "Plunge", stf]].map(([lab, kk, step]) => (
                    <div key={kk}><div style={camSmall}>{lab}{kk === "ToolNum" ? "" : (kk === "Feed" || kk === "Plunge" ? " " + uf : " " + uu)}</div>
                      <input type="number" value={camOpt[tK(kk)]} step={step} onChange={e => setCam(tK(kk), parseFloat(e.target.value) || 0)} style={camInput} /></div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                  {[["Stock " + uu, "stockThick", st], ["Spindle rpm", "spindle", 500], ["Safe Z " + uu, "safeZ", st], ["Stepdown " + uu, "stepdown", st]].concat(isOutline || isSlat || isBore ? [] : [["Stepover " + uu, "stepover", st]]).map(([lab, key, step]) => (
                    <div key={key}><div style={camSmall}>{lab}</div><input type="number" value={camOpt[key]} step={step} onChange={e => setCam(key, parseFloat(e.target.value) || 0)} style={camInput} /></div>
                  ))}
                </div>
                <FeedsHelper toolDiaMM={(camOpt.units === "inch" ? 25.4 : 1) * (camOpt[tK("ToolDia")] || 6.35)} C={C} uu={uu} uf={uf} onApply={(fd, pl, rpm) => { setCam(tK("Feed"), fd); setCam(tK("Plunge"), pl); setCam("spindle", rpm); }} />
                {isOutline ? (
                  <div style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    <div style={{ ...camLabel, color: C.heading }}>Outline cut (flat blank)</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[["outside", "Outside"], ["on", "On line"], ["inside", "Inside"]].map(([v, l]) => (<button key={v} onClick={() => setCam("perimeterSide", v)} style={camSeg(camOpt.perimeterSide === v)}>{l}</button>))}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[["conventional", "Conventional"], ["climb", "Climb"]].map(([v, l]) => (<button key={v} onClick={() => setCam("perimDir", v)} style={camSeg(camOpt.perimDir === v)}>{l}</button>))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[["Cut-thru " + uu, "cutThrough", st], ["Tabs", "tabN", 1], ["Tab ht " + uu, "tabHeight", st]].map(([lab, key, step]) => (<div key={key}><div style={camSmall}>{lab}</div><input type="number" value={camOpt[key]} step={step} onChange={e => setCam(key, parseFloat(e.target.value) || 0)} style={camInput} /></div>))}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>
                      <input type="checkbox" checked={camOpt.rampEntry} onChange={e => setCam("rampEntry", e.target.checked)} /> Ramp entry ({camOpt.rampLen} {uu})
                    </label>
                  </div>
                ) : isMold ? (
                  <div style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    <div style={{ ...camLabel, color: C.heading }}>Mold surface (camber / rocker)</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[["zigzag", "Zigzag"], ["oneway", "One-way"]].map(([v, l]) => (<button key={v} onClick={() => setCam("profPattern", v)} style={camSeg(camOpt.profPattern === v)}>{l}</button>))}
                    </div>
                    {camOpt.profPattern === "oneway" && (<div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[["+", "Tail → Tip"], ["-", "Tip → Tail"]].map(([v, l]) => (<button key={v} onClick={() => setCam("profDir", v)} style={camSeg(camOpt.profDir === v)}>{l}</button>))}
                    </div>)}
                    <div style={camSmall}>Mold margin {uu} (surface this far beyond the ski outline)</div>
                    <input type="number" value={camOpt.moldMargin} step={st} min={0} onChange={e => setCam("moldMargin", parseFloat(e.target.value) || 0)} style={camInput} />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>
                      <input type="checkbox" checked={camOpt.moldInvert} onChange={e => setCam("moldInvert", e.target.checked)} /> Invert (mating / top mold half)
                    </label>
                    <div style={{ color: C.labelDim, fontSize: 10, marginTop: 6, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                      Carves the base curve (camber + rocker) into a mold blank: lowest at the contact line, rising at the tips. Blank must be at least as thick as the tip rise. {camOpt.moldInvert ? "Inverted: flips high↔low for the opposite (top) half of a cassette mold." : ""}
                    </div>
                  </div>
                ) : isSlat ? (
                  <div style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    <div style={{ ...camLabel, color: C.heading }}>Mold slats (camber / rocker ribs)</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[["three", "3-section adjustable"], ["whole", "Full length"]].map(([v, l]) => (<button key={v} onClick={() => setCam("slatSections", v)} style={camSeg(camOpt.slatSections === v)}>{l}</button>))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[["Base ht " + uu, "slatBase", st]].concat(camOpt.slatSections === "three" ? [["Overlap " + uu, "slatOverlap", st]] : []).concat([["Copies", "slatCopies", 1], ["Sheet W " + uu, "slatSheetW", st], ["Cut-thru " + uu, "cutThrough", st], ["Tabs", "tabN", 1]]).map(([lab, key, step]) => (<div key={key}><div style={camSmall}>{lab}</div><input type="number" value={camOpt[key]} step={step} onChange={e => setCam(key, parseFloat(e.target.value) || 0)} style={camInput} /></div>))}
                    </div>
                    <div style={{ color: C.labelDim, fontSize: 10, marginTop: 6, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                      Cuts a full rack: {camOpt.slatCopies}× each section, auto-nested into columns within your sheet width. Top edge follows the camber/rocker curve; 3-section adds telescoping tip/tail (overlap) so one set fits many lengths.
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginTop: 8 }}>
                      <input type="checkbox" checked={camOpt.slatHoles} onChange={e => setCam("slatHoles", e.target.checked)} /> Threaded-rod alignment holes
                    </label>
                    {camOpt.slatHoles && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
                          {[["Hole \u00D8 " + uu, "slatHoleDia", st], ["From bottom " + uu, "slatHoleH", st], ["Row spacing " + uu, "slatHoleSpacing", st], ["Drill tool #", "slatHoleToolNum", 1]].map(([lab, key, step]) => (
                            <div key={key}><div style={camSmall}>{lab}</div><input type="number" value={camOpt[key]} step={step} onChange={e => setCam(key, parseFloat(e.target.value) || 0)} style={camInput} /></div>
                          ))}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <div style={camSmall}>End zone {uu} (holes only within this of each end; middle skipped)</div>
                          <input type="number" value={camOpt.slatHoleEndZone} step={st} onChange={e => setCam("slatHoleEndZone", parseFloat(e.target.value) || 0)} style={camInput} />
                        </div>
                        <div style={{ color: C.labelDim, fontSize: 10, marginTop: 6, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                          A row of holes every {camOpt.slatHoleSpacing} {uu} within {camOpt.slatHoleEndZone} {uu} of each end of the center slats (the middle is skipped - the tip/tail sections never slide there), plus one per end piece, all at {camOpt.slatHoleH} {uu} off the flat bottom. Drilled with T{camOpt.slatHoleToolNum} (ATC change).
                        </div>
                      </>
                    )}
                  </div>
                ) : isBore ? (
                  <div style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    <div style={{ ...camLabel, color: C.heading }}>Insert boring (helical)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[["Hole \u00D8 " + uu, "boreDia", st], ["Depth " + uu, "boreDepth", st], ["Cols", "boreCols", 1], ["Rows", "boreRows", 1], ["Col gap " + uu, "boreSpaceX", st], ["Row gap " + uu, "boreSpaceY", st], ["Center 0-1", "boreCenter", 0.01]].map(([lab, key, step]) => (
                        <div key={key}><div style={camSmall}>{lab}</div><input type="number" value={camOpt[key]} step={step} onChange={e => setCam(key, parseFloat(e.target.value) || 0)} style={camInput} /></div>
                      ))}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>
                      <input type="checkbox" checked={camOpt.boreHelix} onChange={e => setCam("boreHelix", e.target.checked)} /> Helical bore
                    </label>
                    <div style={{ color: C.labelDim, fontSize: 10, marginTop: 6, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                      {Math.round(camOpt.boreCols) * Math.round(camOpt.boreRows)} blind holes in a {camOpt.boreCols}\u00D7{camOpt.boreRows} grid at {(camOpt.boreCenter * 100).toFixed(0)}% of length. Helical lets a {camOpt.boreToolDia} {uu} bit bore an exact {camOpt.boreDia} {uu} hole.
                    </div>
                  </div>
                ) : isPocket ? (
                  <div style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    <div style={{ ...camLabel, color: C.heading }}>Pocket (raster clear)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[["Length " + uu, "pocketL", st], ["Width " + uu, "pocketW", st], ["Depth " + uu, "pocketDepth", st], ["Center 0-1", "pocketCenterX", 0.01], ["Off-center " + uu, "pocketCenterY", st]].map(([lab, key, step]) => (
                        <div key={key}><div style={camSmall}>{lab}</div><input type="number" value={camOpt[key]} step={step} onChange={e => setCam(key, parseFloat(e.target.value) || 0)} style={camInput} /></div>
                      ))}
                    </div>
                    <div style={{ color: C.labelDim, fontSize: 10, marginTop: 6, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                      Clears a {camOpt.pocketL}\u00D7{camOpt.pocketW} {uu} rectangle {camOpt.pocketDepth} {uu} deep at {(camOpt.pocketCenterX * 100).toFixed(0)}% of length (raster + finish pass). For inlays, weight-relief pockets, or recesses.
                    </div>
                  </div>
                ) : isBaseOp ? (
                  <div style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    <div style={{ ...camLabel, color: C.heading }}>Base cut — drag knife (spindle OFF)</div>
                    <div style={{ color: C.labelDim, fontSize: 10.5, marginBottom: 8, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>
                      Cuts the <b style={{ color: C.value }}>base cut line</b> from your design{ski.edgeInset > 0 ? (ski.edgeWrap === "contact" ? ` — contact-wrap: sections along each edge's contacts (${ski.edgeInset}mm inset) with the full outline at the tips and tails.` : ` — full-wrap: the whole outline inset ${ski.edgeInset}mm.`) : " — full outline (no edge inset set)."} Set the inset & wrap mode back in the Dimensions → base/edge controls.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div><div style={camSmall}>Blade offset {uu}</div><input type="number" value={camOpt.bladeOffset} step={st} min={0.05} onChange={e => setCam("bladeOffset", parseFloat(e.target.value) || 0)} style={camInput} /></div>
                      <div><div style={camSmall}>Lead-in {uu}</div><input type="number" value={camOpt.dragLeadIn} step={st} min={0} onChange={e => setCam("dragLeadIn", parseFloat(e.target.value) || 0)} style={camInput} /></div>
                      <div><div style={camSmall}>Cut-thru {uu}</div><input type="number" value={camOpt.cutThrough} step={st} min={0} onChange={e => setCam("cutThrough", parseFloat(e.target.value) || 0)} style={camInput} /></div>
                      <div><div style={camSmall}>Knife tool #</div><input type="number" value={camOpt.baseToolNum} step={1} min={1} onChange={e => setCam("baseToolNum", parseInt(e.target.value) || 1)} style={camInput} /></div>
                    </div>
                    <div style={{ color: C.labelDim, fontSize: 10, marginTop: 8, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                      Chuck the Donek, set the blade offset stamped on your blade, and cut-thru to your base thickness plus a hair. Spindle stays off; it plunges in the waste, cuts a lead-in to pre-align the blade, then follows the base line with corner swivels. Tape or vacuum the base down.
                    </div>
                  </div>
                ) : (
                  <div style={{ border: `1px solid ${C.inputBorder}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    <div style={{ ...camLabel, color: C.heading }}>Surface taper (3D carve, assembled)</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[["zigzag", "Zigzag"], ["oneway", "One-way"]].map(([v, l]) => (<button key={v} onClick={() => setCam("profPattern", v)} style={camSeg(camOpt.profPattern === v)}>{l}</button>))}
                    </div>
                    {camOpt.profPattern === "oneway" && (<div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[["+", "Tail → Tip"], ["-", "Tip → Tail"]].map(([v, l]) => (<button key={v} onClick={() => setCam("profDir", v)} style={camSeg(camOpt.profDir === v)}>{l}</button>))}
                    </div>)}
                    <div style={camSmall}>Glued-on sidewalls — edge-lane engagement</div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[["conventional", "Conventional"], ["climb", "Climb"], ["off", "Off"]].map(([v, l]) => (<button key={v} onClick={() => setCam("sidewallEngage", v)} style={camSeg(camOpt.sidewallEngage === v)}>{l}</button>))}
                    </div>
                    <div style={{ color: C.labelDim, fontSize: 10, marginBottom: 6, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                      Conventional presses each glued wall into the core (won’t peel it); the two edges auto-run opposite ways. Climb can tear it off.
                    </div>
                    <div style={camSmall}>Sidewall stock {uu} (0 = cut walls flush)</div>
                    <input type="number" value={camOpt.sidewallStock} step={st} min={0} onChange={e => setCam("sidewallStock", parseFloat(e.target.value) || 0)} style={camInput} />
                  </div>
                )}
                {(isMold || camOpt.op === "taper") && (
                  <div style={{ border: `1px solid ${camOpt.roughing ? C.heading : C.inputBorder}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: camOpt.roughing ? C.heading : C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                      <input type="checkbox" checked={camOpt.roughing} onChange={e => setCam("roughing", e.target.checked)} /> Rough + finish (2 passes)
                    </label>
                    {camOpt.roughing && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
                          {[["Rough tool #", "roughToolNum", 1], ["Rough \u00D8 " + uu, "roughToolDia", st], ["Leave " + uu, "finishAllowance", st], ["Rough stepover " + uu, "roughStepover", st], ["Rough stepdown " + uu, "roughStepdown", st]].map(([lab, key, step]) => (
                            <div key={key}><div style={camSmall}>{lab}</div><input type="number" value={camOpt[key]} step={step} onChange={e => setCam(key, parseFloat(e.target.value) || 0)} style={camInput} /></div>
                          ))}
                        </div>
                        <div style={{ color: C.labelDim, fontSize: 10, marginTop: 6, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                          Hogs out the bulk with the big {camOpt.roughToolDia} {uu} bit (T{camOpt.roughToolNum}), leaving {camOpt.finishAllowance} {uu}, then a single finishing skim with the fine bit (T{camOpt.moldToolNum || camOpt.taperToolNum}). Cuts a huge mold in a fraction of the time.
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                    <input type="checkbox" checked={camOpt.spindleCW} onChange={e => setCam("spindleCW", e.target.checked)} /> Spindle CW
                  </label>
                  {[["center", "Center"], ["corner", "Corner"]].map(([v, l]) => (<button key={v} onClick={() => setCam("origin", v)} style={{ ...camSeg(camOpt.origin === v), flex: "none", padding: "6px 10px" }}>{l} origin</button>))}
                </div>
                {camResult.stats && (
                  <>
                    <div style={{ background: C.heading, borderRadius: 4, padding: "8px 10px", marginBottom: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: C.bgDeep, lineHeight: 1.5, fontWeight: 700 }}>
                      {camResult.stats.stockLbl}: {camResult.stats.stockX} × {camResult.stats.stockY} {camResult.stats.unit}
                      <div style={{ fontWeight: 400, fontSize: 10.5, marginTop: 2 }}>
                        {camResult.stats.stockKind === "mold"
                          ? `≥ ${camResult.stats.stockT} ${camResult.stats.unit} thick (carve + base) · you set ${camResult.stats.setThick}`
                          : camResult.stats.stockKind === "sheet"
                          ? `${camResult.stats.setThick} ${camResult.stats.unit} MDF (= rib thickness)`
                          : `${camResult.stats.setThick} ${camResult.stats.unit} thick`}
                      </div>
                    </div>
                    <div style={{ background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 4, padding: "8px 10px", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.value, lineHeight: 1.6 }}>
                      {isOutline ? "OUTLINE" : isMold ? "MOLD" : isSlat ? "SLATS" : isBore ? "BORE" : isPocket ? "POCKET" : isBaseOp ? "BASE" : "TAPER"} · Z {camResult.stats.minZ}…{camResult.stats.maxZ} {camResult.stats.unit} · est <b style={{ color: C.heading }}>{camResult.stats.estMin} min</b> · {camResult.stats.lines.toLocaleString()} lines
                    </div>
                  </>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={downloadCAM} style={{ flex: 1, background: C.heading, border: "none", color: C.bgDeep, padding: "10px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Download {isOutline ? "① Outline" : isMold ? "③ Mold" : isSlat ? "④ Slats" : isBore ? "⑤ Bore" : isPocket ? "⑥ Pocket" : isBaseOp ? "⑦ Base" : "② Taper"} .nc</button>
                  <button onClick={openSetupSheet} title="Printable setup sheet: tool, stock, zeroing, run time" style={{ background: "transparent", border: `1px solid ${C.inputBorder}`, color: C.label, padding: "10px 14px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>▤ Setup sheet</button>
                </div>
                <button onClick={() => setShowToolpath(true)} style={{ width: "100%", marginTop: 6, background: "transparent", border: `1px solid ${C.heading}`, color: C.heading, padding: "9px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Preview Toolpaths</button>
                <div style={{ color: C.labelDim, fontSize: 10.5, marginTop: 8, lineHeight: 1.45, fontFamily: "'JetBrains Mono', monospace" }}>
                  Centroid CNC12 / Avid CNC ATC · {camOpt.units === "inch" ? "G20 inch / IPM" : "G21 mm"} · emits T{isOutline ? camOpt.outlineToolNum : isMold ? camOpt.moldToolNum : isSlat ? camOpt.slatToolNum : isBore ? camOpt.boreToolNum : isPocket ? camOpt.pocketToolNum : camOpt.taperToolNum} M6 for the changer. Always air-cut first and confirm your WCS zero.
                </div>
              </>
            );
          })()}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, padding: 16, overflow: "auto" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                {[["Bed X · short", "machineX"], ["Bed Y · long", "machineY"]].map(([lab, key]) => {
                  const inch = camOpt.units === "inch", shown = inch ? camOpt[key] / 25.4 : camOpt[key];
                  return (
                  <div key={key}>
                    <div style={{ color: C.label, fontSize: 10, marginBottom: 2, fontFamily: "'JetBrains Mono', monospace" }}>{lab} ({inch ? "in" : "mm"})</div>
                    <input type="number" value={+shown.toFixed(inch ? 1 : 0)} step={inch ? 1 : 10} onChange={e => setCam(key, (parseFloat(e.target.value) || 0) * (inch ? 25.4 : 1))} style={{ width: 110, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none" }} />
                  </div>
                  );
                })}
                <div style={{ width: 1, height: 34, background: C.panelBorder, alignSelf: "center" }} />
                {[["Stock L", "stockL"], ["Stock W", "stockW"], ["Stock T", "stockThick"]].map(([lab, key]) => (
                  <div key={key}>
                    <div style={{ color: camStock ? (camStock.fits ? C.label : "#e8552a") : C.label, fontSize: 10, marginBottom: 2, fontFamily: "'JetBrains Mono', monospace" }}>{lab} ({camOpt.units === "inch" ? "in" : "mm"})</div>
                    <input type="number" value={camOpt[key]} step={camOpt.units === "inch" ? 0.25 : 5} min={0} onChange={e => setCam(key, parseFloat(e.target.value) || 0)} style={{ width: 78, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none" }} />
                  </div>
                ))}
                {camStock ? (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: camStock.fits ? "#8ab98a" : "#e8552a", alignSelf: "center" }}>{camStock.fits ? "✓ fits your stock" : `✗ over by ${Math.max(camStock.overX, camStock.overY)} ${camOpt.units === "inch" ? "in" : "mm"}`}</span>
                ) : camResult.stats ? (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: C.labelDim, alignSelf: "center" }}>needs ≥ {camResult.stats.stockX}×{camResult.stats.stockY} {camResult.stats.unit}</span>
                ) : null}
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: camOpt.centerInStock ? C.heading : C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", alignSelf: "center" }} title="Center the profile on the stock so the cut follows the lengthwise centerline / foam stringer, even when you zero at the corner.">
                  <input type="checkbox" checked={camOpt.centerInStock} onChange={e => setCam("centerInStock", e.target.checked)} /> Center in stock
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                  <input type="checkbox" checked={camOpt.showMachine} onChange={e => setCam("showMachine", e.target.checked)} /> Show bed
                </label>
                <div style={{ display: "flex", gap: 4 }}>
                  {[[false, "2D"], [true, "3D"]].map(([v, l]) => (
                    <button key={l} onClick={() => setPreview3D(v)} style={{ padding: "6px 12px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: preview3D === v ? C.heading : C.inputBg, color: preview3D === v ? C.bgDeep : C.label, border: `1px solid ${preview3D === v ? C.heading : C.inputBorder}`, borderRadius: 3, cursor: "pointer", fontWeight: preview3D === v ? 700 : 400 }}>{l}</button>
                  ))}
                </div>
                <div style={{ marginLeft: 4 }}>
                  <div style={{ color: C.label, fontSize: 10, marginBottom: 2, fontFamily: "'JetBrains Mono', monospace" }}>Work offset ({camOpt.units === "inch" ? "in" : "mm"}) - clamp clearance</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["X+", "offsetX"], ["Y+", "offsetY"]].map(([lab, key]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ color: C.labelDim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{lab}</span>
                        <input type="number" value={camOpt[key]} step={camOpt.units === "inch" ? 0.25 : 5} onChange={e => setCam(key, parseFloat(e.target.value) || 0)} style={{ width: 70, background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 8px", color: C.value, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none" }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginLeft: 4 }}>
                  <div style={{ color: C.label, fontSize: 10, marginBottom: 2, fontFamily: "'JetBrains Mono', monospace" }}>Part orientation</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["y", "Length \u2192 Y (long)"], ["x", "Length \u2192 X"]].map(([v, l]) => (
                      <button key={v} onClick={() => setCam("partAxis", v)} style={{ padding: "6px 10px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: camOpt.partAxis === v ? C.heading : C.inputBg, color: camOpt.partAxis === v ? C.bgDeep : C.label, border: `1px solid ${camOpt.partAxis === v ? C.heading : C.inputBorder}`, borderRadius: 3, cursor: "pointer", fontWeight: camOpt.partAxis === v ? 700 : 400 }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginLeft: 4 }}>
                  <div style={{ color: C.label, fontSize: 10, marginBottom: 2, fontFamily: "'JetBrains Mono', monospace" }}>Post-processor (controller)</div>
                  <select value={camOpt.postKey} onChange={e => setCamOpt(o => { const n = { ...o, postKey: e.target.value, postOverride: null }; try { localStorage.setItem("bcs_cam", JSON.stringify(n)); } catch (er) {} return n; })} style={{ background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "6px 9px", color: C.value, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none" }}>
                    <option value="centroid">Centroid CNC12 / Avid</option>
                    <option value="grbl">GRBL / Shapeoko / X-Carve</option>
                    <option value="mach">Mach3 / Mach4</option>
                    <option value="linuxcnc">LinuxCNC</option>
                    <option value="fanuc">Fanuc / Haas (generic)</option>
                  </select>
                </div>
                {(() => {
                  const prof = POST_PROFILES[camOpt.postKey] || POST_PROFILES.centroid;
                  const ov = camOpt.postOverride || {};
                  const eff = k => ov[k] != null ? ov[k] : prof[k];
                  const setOv = (k, v) => setCam("postOverride", { ...ov, [k]: v });
                  const changed = Object.keys(ov).some(k => JSON.stringify(ov[k]) !== JSON.stringify(prof[k]));
                  const sel = { background: C.inputBg, border: `1px solid ${C.inputBorder}`, borderRadius: 3, padding: "5px 7px", color: C.value, fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", outline: "none" };
                  const lab = { color: C.label, fontSize: 10, marginBottom: 2, fontFamily: "'JetBrains Mono', monospace" };
                  return (
                    <div style={{ marginLeft: 4, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div>
                        <div style={lab}>Tool change</div>
                        <select value={eff("tc")} onChange={e => setOv("tc", e.target.value)} style={sel}>
                          <option value="tm6">T# then M6</option>
                          <option value="m6t">M6 then T#</option>
                          <option value="manual">Manual pause (M0)</option>
                        </select>
                      </div>
                      <div>
                        <div style={lab}>Comments</div>
                        <select value={eff("comment")} onChange={e => setOv("comment", e.target.value)} style={sel}>
                          <option value=";">; semicolon</option>
                          <option value="()">( ) parens</option>
                        </select>
                      </div>
                      <div>
                        <div style={lab}>Decimals</div>
                        <select value={eff("decimals") == null ? "auto" : String(eff("decimals"))} onChange={e => setOv("decimals", e.target.value === "auto" ? null : parseInt(e.target.value))} style={sel}>
                          <option value="auto">auto</option>
                          <option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
                        </select>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", color: C.label, fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", paddingBottom: 5 }}>
                        <input type="checkbox" checked={!!eff("lineNum")} onChange={e => setOv("lineNum", e.target.checked)} /> Line numbers
                      </label>
                      {changed && <button onClick={() => setCam("postOverride", null)} style={{ background: "transparent", border: `1px solid ${C.inputBorder}`, color: C.labelDim, borderRadius: 3, padding: "5px 8px", fontSize: 10.5, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", marginBottom: 1 }}>reset to {prof.name.split(" ")[0]}</button>}
                    </div>
                  );
                })()}
                <label style={{ marginLeft: 4, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: camOpt.arcOut ? C.heading : C.label, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }} title="Fits curved runs of moves into G2/G3 arcs — smaller files, smoother motion. Universally supported on the profiles here.">
                  <input type="checkbox" checked={camOpt.arcOut} onChange={e => setCam("arcOut", e.target.checked)} /> Arc output (G2/G3) — smaller, smoother
                </label>
                {camResult.stats && camMachine && (
                  <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, fontWeight: 700, color: camMachine.fits ? "#8ab98a" : "#e8552a" }}>
                    {camMachine.fits ? "✓ fits the bed" : "✗ exceeds the bed"} · part {camResult.stats.stockX}×{camResult.stats.stockY} {camResult.stats.unit}
                  </span>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 320, background: "#14100d", borderRadius: 6, border: `1px solid ${C.panelBorder}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {preview3D
                  ? <Toolpath3DView gcode={camResult.gcode} machine={camMachine} />
                  : <ToolpathView gcode={camResult.gcode} width={880} height={500} machine={camMachine} stock={camStock} />}
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.labelDim }}>
                <span>rapids dashed · cuts coloured by depth</span>
                {camResult.stats && <span style={{ marginLeft: "auto" }}>Z {camResult.stats.minZ}…{camResult.stats.maxZ} {camResult.stats.unit} · ~{(camResult.stats.cutDistMM / 1000).toFixed(1)} m · {camResult.stats.estMin} min · {camResult.stats.lines.toLocaleString()} lines</span>}
              </div>
            </div>
          </div>
        </div>
      )}
      {topsheetOpen && <TopsheetDesigner ski={ski} C={C} onClose={() => setTopsheetOpen(false)} />}
      {showToolpath && <ToolpathPreviewModal gcode={camResult.gcode} stats={camResult.stats} onClose={() => setShowToolpath(false)} />}

      {previewSvg && (
        <div onClick={() => setPreviewSvg(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 16, width: "min(1040px, 95vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: C.heading, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>BUILD CARD PREVIEW</span>
              <button onClick={() => setPreviewSvg(null)} aria-label="Close" style={{ background: "transparent", border: "none", color: C.label, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>{"\u2715"}</button>
            </div>
            <div style={{ overflow: "auto", border: `1px solid ${C.panelBorder}`, borderRadius: 4, background: "#141210" }}>
              <img src={"data:image/svg+xml;utf8," + encodeURIComponent(previewSvg)} alt="Build card preview" style={{ display: "block", width: "100%", height: "auto" }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={() => exportSpecSheet("png")} style={{ background: C.heading, border: "none", color: C.bgDeep, padding: "9px 16px", borderRadius: 4, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Download PNG</button>
              <button onClick={() => exportSpecSheet("svg")} style={{ background: "transparent", border: `1px solid ${C.heading}`, color: C.heading, padding: "9px 16px", borderRadius: 4, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Download SVG</button>
              <button onClick={() => setPreviewSvg(null)} style={{ background: "transparent", border: `1px solid ${C.inputBorder}`, color: C.label, padding: "9px 16px", borderRadius: 4, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Close</button>
            </div>
          </div>
        </div>
      )}
      {dbMsg && (
        <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 1100, background: C.panel || C.inputBg, border: `1px solid ${C.heading}`, color: C.value, padding: "12px 18px", borderRadius: 6, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", maxWidth: "92vw", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>
          {dbMsg}
        </div>
      )}
    </div>
  );
}
