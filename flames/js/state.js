// App state: a tiny store, localStorage persistence and a shareable URL hash
// (#x=L_IR&y=L_CII%2FL_IR&xs=log&ys=log, one x/y pair per formula pair).
import { defaultState, newPair } from "./config.js";

const KEY = "flames.state.v2"; // v2: S/N 3, scale-dependent low-S/N default, figure size, no figure theme
export const STORAGE_KEYS = [KEY, "flames.theme", "flames.layout"];

function readSaved() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; } // corrupt storage: start fresh
}

// saved styles are merged into the current defaults by name, so new style fields still get defaults
function mergeStyles(base, saved) {
  for (const cat of Object.keys(base)) {
    for (const st of base[cat]) {
      const old = saved?.[cat]?.find((s) => s.name === st.name);
      if (old) Object.assign(st, old);
    }
  }
  return base;
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const xs = p.getAll("x"), ys = p.getAll("y");
  if (!xs.length) return null;
  const out = { pairs: xs.map((x, i) => newPair(x, ys[i] ?? "")) };
  if (p.get("xs")) out.xscale = p.get("xs");
  if (p.get("ys")) out.yscale = p.get("ys");
  return out;
}

export function writeHash(state) {
  const p = new URLSearchParams();
  for (const pair of state.pairs) { p.append("x", pair.x); p.append("y", pair.y); }
  p.set("xs", state.xscale); p.set("ys", state.yscale);
  history.replaceState(null, "", `#${p}`);
}

export function loadState() {
  const base = defaultState();
  const saved = readSaved();
  if (saved) {
    const { styles, ...rest } = saved;
    Object.assign(base, rest);
    mergeStyles(base.styles, styles);
  }
  Object.assign(base, readHash() || {});
  return base;
}

/** kind: "data" (formulas, catalogs, limits flags: recompute + table) or "view" (re-plot only) */
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  let saveTimer = 0;
  return {
    get: () => state,
    update(fn, kind = "view") {
      fn(state);
      for (const f of subs) f(state, kind);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { localStorage.setItem(KEY, JSON.stringify(state)); writeHash(state); }, 300);
    },
    subscribe: (f) => subs.add(f),
  };
}
