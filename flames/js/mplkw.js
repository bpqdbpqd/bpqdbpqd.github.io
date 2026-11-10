// Parse matplotlib-style keyword strings ("color='k', ls=':', lw=0.3") and map
// ax.grid / ax.legend / ax.tick_params-like options onto a Plotly layout.
import { PT, resolveColor, withAlpha } from "./styles.js";

// ------------------------------------------------------------ python literal parser
export function parseKwargs(src) {
  const s = (src || "").trim();
  if (!s) return {};
  if (s.startsWith("{")) return parseDictLiteral(s);
  let i = 0;
  const out = {};
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  while (i < s.length) {
    ws();
    if (i >= s.length) break;
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (!m) throw new SyntaxError(`expected a keyword at ${i + 1}`);
    i += m[0].length; ws();
    if (s[i] !== "=") throw new SyntaxError(`expected "=" after ${m[0]}`);
    i++;
    const [val, j] = parseValue(s, i);
    out[m[0]] = val; i = j; ws();
    if (i < s.length) {
      if (s[i] !== ",") throw new SyntaxError(`expected "," at ${i + 1}`);
      i++;
    }
  }
  return out;
}

function parseDictLiteral(s) {
  const [val, j] = parseValue(s, 0);
  if (s.slice(j).trim()) throw new SyntaxError("trailing text after dict");
  return val;
}

function parseValue(s, i) {
  while (/\s/.test(s[i])) i++;
  const c = s[i];
  if (c === "'" || c === '"') {
    let j = i + 1, out = "";
    while (j < s.length && s[j] !== c) { if (s[j] === "\\") j++; out += s[j]; j++; }
    if (j >= s.length) throw new SyntaxError("unclosed string");
    return [out, j + 1];
  }
  if (c === "(" || c === "[") {
    const close = c === "(" ? ")" : "]";
    const arr = [];
    i++;
    for (;;) {
      while (/\s/.test(s[i])) i++;
      if (s[i] === close) return [arr, i + 1];
      const [v, j] = parseValue(s, i);
      arr.push(v); i = j;
      while (/\s/.test(s[i])) i++;
      if (s[i] === ",") i++;
      else if (s[i] !== close) throw new SyntaxError(`expected "${close}"`);
    }
  }
  if (c === "{") {
    const obj = {};
    i++;
    for (;;) {
      while (/\s/.test(s[i])) i++;
      if (s[i] === "}") return [obj, i + 1];
      const [k, j] = parseValue(s, i);
      i = j; while (/\s/.test(s[i])) i++;
      if (s[i] !== ":") throw new SyntaxError('expected ":" in dict');
      const [v, j2] = parseValue(s, i + 1);
      obj[k] = v; i = j2; while (/\s/.test(s[i])) i++;
      if (s[i] === ",") i++;
      else if (s[i] !== "}") throw new SyntaxError('expected "}"');
    }
  }
  const m = /^(True|False|None|true|false|null|[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(s.slice(i));
  if (!m) throw new SyntaxError(`cannot read value at ${i + 1}`);
  const t = m[0];
  const v = t === "True" || t === "true" ? true : t === "False" || t === "false" ? false
    : t === "None" || t === "null" ? null : parseFloat(t);
  return [v, i + t.length];
}

// ------------------------------------------------------------ mapping helpers
const DASH = { "-": "solid", solid: "solid", "--": "dash", dashed: "dash", ":": "dot", dotted: "dot",
  "-.": "dashdot", dashdot: "dashdot" };

const LOC = {
  "upper right": [0.98, 0.98, "right", "top"], "upper left": [0.02, 0.98, "left", "top"],
  "lower left": [0.02, 0.02, "left", "bottom"], "lower right": [0.98, 0.02, "right", "bottom"],
  right: [0.98, 0.5, "right", "middle"], "center left": [0.02, 0.5, "left", "middle"],
  "center right": [0.98, 0.5, "right", "middle"], "lower center": [0.5, 0.02, "center", "bottom"],
  "upper center": [0.5, 0.98, "center", "top"], center: [0.5, 0.5, "center", "middle"],
};
const LOC_CODES = ["best", "upper right", "upper left", "lower left", "lower right", "right",
  "center left", "center right", "lower center", "upper center", "center"];

const kw = (o, ...names) => { for (const n of names) if (o[n] !== undefined) return o[n]; return undefined; };

// ax.grid(**kwargs) -> per-axis grid settings
export function gridSettings(k, visible) {
  const on = kw(k, "visible", "b") ?? visible;
  const which = kw(k, "which") ?? "major";
  const axis = kw(k, "axis") ?? "both";
  const color = withAlpha(resolveColor(kw(k, "color", "c") ?? "#b0b0b0"), kw(k, "alpha") ?? 1);
  const width = (kw(k, "lw", "linewidth") ?? 0.8) * PT;
  const dash = DASH[kw(k, "ls", "linestyle") ?? "-"] || "solid";
  const major = on && which !== "minor";
  const minor = on && which !== "major";
  return { axis, major, minor, color, width, dash };
}

// ax.legend(**kwargs) -> matplotlib legend parameters (sizes in font-size units, as in
// matplotlib's rcParams legend.*); plot.js draws the legend from these.
export function legendSettings(k, fontPx) {
  let loc = kw(k, "loc") ?? "best";
  if (typeof loc === "number") loc = LOC_CODES[loc] || "best";
  // loc=(x, y): lower-left corner of the legend at axes fraction (x, y)
  let bbox = kw(k, "bbox_to_anchor");
  if (Array.isArray(loc)) { bbox = loc; loc = "lower left"; }
  if (!LOC[loc]) loc = "best";
  const fs = kw(k, "fontsize");
  const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    loc,
    bbox: Array.isArray(bbox) && bbox.length >= 2 ? bbox.slice(0, 2).map(Number) : null,
    ncol: Math.max(1, Math.round(num(kw(k, "ncol", "ncols"), 1))),
    fontPx: typeof fs === "number" ? fs * PT : fontPx,
    frameon: kw(k, "frameon") ?? true,
    framealpha: num(kw(k, "framealpha"), 0.8),
    facecolor: kw(k, "facecolor") ?? null,
    edgecolor: kw(k, "edgecolor") ?? "0.8",
    title: kw(k, "title") ?? null,
    markerscale: num(kw(k, "markerscale"), 1),
    borderpad: num(kw(k, "borderpad"), 0.4),
    labelspacing: num(kw(k, "labelspacing"), 0.5),
    handlelength: num(kw(k, "handlelength"), 2.0),
    handletextpad: num(kw(k, "handletextpad"), 0.8),
    borderaxespad: num(kw(k, "borderaxespad"), 0.5),
    columnspacing: num(kw(k, "columnspacing"), 2.0),
  };
}

// anchor point of a legend box on the axes: [fx, fy, xanchor, yanchor]
export const legendAnchor = (loc) => LOC[loc] || LOC["upper right"];

// tick_params-like axis options + labels
export function axisSettings(k, theme, fontPx, fontFamily) {
  const dir = kw(k, "direction") ?? "in";
  const ticks = dir === "in" ? "inside" : dir === "out" ? "outside" : "inside";
  const len = (kw(k, "length") ?? 4) * PT;
  const width = (kw(k, "width") ?? 1) * PT / 2;
  const labelsize = kw(k, "labelsize");
  const fontsize = kw(k, "fontsize");
  const lw = (kw(k, "linewidth", "lw") ?? 0.8) * PT / 1.5;
  const color = resolveColor(kw(k, "color", "colors") ?? theme.ink);
  const minorOn = kw(k, "minor") ?? true;
  const base = (mirrorKey) => ({
    ticks, ticklen: len, tickwidth: width, tickcolor: color,
    mirror: (kw(k, mirrorKey) ?? true) ? "ticks" : true,
    showline: kw(k, "frame") ?? true, linecolor: color, linewidth: lw,
    tickfont: { size: typeof labelsize === "number" ? labelsize * PT : fontPx, family: fontFamily, color },
    title: { font: { size: typeof fontsize === "number" ? fontsize * PT : fontPx, family: fontFamily, color },
      standoff: 4 },
    minor: minorOn ? { ticks, ticklen: len / 2, tickwidth: width / 2, tickcolor: color } : { ticks: "" },
    zeroline: false,
  });
  return {
    x: base("top"), y: base("right"),
    xlabel: kw(k, "xlabel"), ylabel: kw(k, "ylabel"), title: kw(k, "title"),
  };
}
