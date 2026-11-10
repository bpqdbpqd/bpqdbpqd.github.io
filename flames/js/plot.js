// Build Plotly traces and layout, mirroring plot_type / plot_arith_all of Paper_I_plots.ipynb:
// detections are drawn with error bars; limits are drawn faint (alpha) with an arrow of
// length |v|/3 pointing to the allowed side; high-z markers are larger with a black edge.
// The figure has the notebook size in inches; all sizes scale with PT (px per point).
// The legend is drawn like matplotlib's (ncol, loc, bbox_to_anchor, frame) on an overlay
// axis in axes-fraction units, because Plotly's own legend cannot do a fixed column count.
import { PT, MARKERS, BIG_MARKERS, FIGURE_DEFAULTS, resolveColor, withAlpha } from "./styles.js";
import { gridSettings, legendSettings, legendAnchor, axisSettings } from "./mplkw.js";
import { mathtext } from "./mathtext.js";

export const FIGURE_THEMES = {
  light: { paper: "#ffffff", plot: "#ffffff", ink: "#000000" },
  dark: { paper: "#2f3034", plot: "#36373b", ink: "#e9e7e2" },
};

const fmt = (v) => (Number.isFinite(v) ? Number(v).toPrecision(4) : "–");

function markerFor(st, limit, scale = 1) {
  const big = BIG_MARKERS.includes(st.marker) ? 1.5 : 1;
  return {
    symbol: MARKERS[st.marker] || st.marker || "circle",
    size: Math.max(1, (limit ? st.limSize : st.size) * big * PT * scale),
    color: resolveColor(st.color),
    line: { color: resolveColor(st.edgeColor) || "rgba(0,0,0,0)", width: (st.edgeWidth || 0) * PT * (limit ? 0.6 : 1) },
  };
}

/**
 * series: [{ fi, flabel, catalog, names: string[], groups: string[],
 *            x: conditioned, y: conditioned }]  (conditioned = conditionForPlot output)
 * styles: { low: [style], high: [style] }
 * opts:   { gl: draw the data with WebGL (screen: zoom redraws ~10x faster than SVG);
 *           exports use SVG }
 * Returns the data traces; `traces.legendEntries` lists one entry per point type in
 * plotting order (a type drawn for several formulas appears once).
 */
export function buildTraces(series, styles, opts = {}) {
  const type = opts.gl ? "scattergl" : "scatter";
  // WebGL has no arrow symbols: limit arrow heads become small triangles on screen
  const head = opts.gl ? { "arrow-down": "triangle-down", "arrow-up": "triangle-up",
    "arrow-left": "triangle-left", "arrow-right": "triangle-right" } : null;
  const traces = [];
  const entries = new Map();
  for (const s of series) {
    const stList = styles[s.catalog] || [];
    for (const st of stList) {
      if (!st.visible) continue;
      const det = [], lim = [];
      for (let i = 0; i < s.groups.length; i++) {
        if (s.groups[i] !== st.name || !s.x.use[i] || !s.y.use[i]) continue;
        (s.x.upl[i] || s.x.lol[i] || s.y.upl[i] || s.y.lol[i] ? lim : det).push(i);
      }
      if (!det.length && !lim.length) continue;
      const key = `${s.catalog}|${st.name}`;
      const e = entries.get(key) || { key, catalog: s.catalog, name: st.name, label: st.label, style: st, det: false };
      e.det ||= det.length > 0;
      entries.set(key, e);
      const name = st.label;
      const group = `${s.fi}|${s.catalog}|${st.name}`;
      const color = resolveColor(st.color);
      const custom = (idx) => idx.map((i) => [s.catalog, i, s.fi]);
      const hover = (idx) => idx.map((i) =>
        `<b>${s.names[i]}</b><br>x = ${s.x.upl[i] ? "<" : s.x.lol[i] ? ">" : ""}${fmt(s.x.v[i])}` +
        `<br>y = ${s.y.upl[i] ? "<" : s.y.lol[i] ? ">" : ""}${fmt(s.y.v[i])}`);
      const pick = (arr, idx) => idx.map((i) => arr[i]);
      if (det.length) {
        traces.push({
          type, mode: "markers", name, legendgroup: group, showlegend: false,
          x: pick(s.x.v, det), y: pick(s.y.v, det),
          error_x: { type: "data", symmetric: false, array: pick(s.x.ep, det), arrayminus: pick(s.x.em, det),
            thickness: st.errWidth * PT, width: st.capSize * PT, color },
          error_y: { type: "data", symmetric: false, array: pick(s.y.ep, det), arrayminus: pick(s.y.em, det),
            thickness: st.errWidth * PT, width: st.capSize * PT, color },
          marker: markerFor(st, false), customdata: custom(det), text: hover(det),
          hovertemplate: "%{text}<extra></extra>",
          meta: { kind: "det", catalog: s.catalog, fi: s.fi },
        });
      }
      if (lim.length) {
        // faint markers with the error bars of the measured axis
        const ex = lim.map((i) => (s.x.upl[i] || s.x.lol[i] ? 0 : s.x.ep[i]));
        const exm = lim.map((i) => (s.x.upl[i] || s.x.lol[i] ? 0 : s.x.em[i]));
        const ey = lim.map((i) => (s.y.upl[i] || s.y.lol[i] ? 0 : s.y.ep[i]));
        const eym = lim.map((i) => (s.y.upl[i] || s.y.lol[i] ? 0 : s.y.em[i]));
        const faint = withAlpha(color, st.limAlpha);
        traces.push({
          type, mode: "markers", name, legendgroup: group, showlegend: false,
          x: pick(s.x.v, lim), y: pick(s.y.v, lim), opacity: st.limAlpha,
          error_x: { type: "data", symmetric: false, array: ex, arrayminus: exm,
            thickness: st.limErrWidth * PT, width: 0, color },
          error_y: { type: "data", symmetric: false, array: ey, arrayminus: eym,
            thickness: st.limErrWidth * PT, width: 0, color },
          marker: markerFor(st, true), customdata: custom(lim), text: hover(lim),
          hovertemplate: "%{text}<extra></extra>",
          meta: { kind: "lim", catalog: s.catalog, fi: s.fi },
        });
        // arrows: shaft (line segments) + head (arrow markers)
        const lx = [], ly = [], hx = [], hy = [], hs = [];
        for (const i of lim) {
          const x0 = s.x.v[i], y0 = s.y.v[i];
          const arrows = [];
          if (s.y.upl[i]) arrows.push([x0, y0 - s.y.em[i], "arrow-down"]);
          if (s.y.lol[i]) arrows.push([x0, y0 + s.y.ep[i], "arrow-up"]);
          if (s.x.upl[i]) arrows.push([x0 - s.x.em[i], y0, "arrow-left"]);
          if (s.x.lol[i]) arrows.push([x0 + s.x.ep[i], y0, "arrow-right"]);
          for (const [x1, y1, sym] of arrows) {
            lx.push(x0, x1, null); ly.push(y0, y1, null);
            hx.push(x1); hy.push(y1); hs.push(sym);
          }
        }
        traces.push({
          type, mode: "lines", legendgroup: group, showlegend: false, hoverinfo: "skip",
          x: lx, y: ly, line: { color: faint, width: st.limErrWidth * PT }, meta: { kind: "arrow" },
        });
        traces.push({
          type, mode: "markers", legendgroup: group, showlegend: false, hoverinfo: "skip",
          x: hx, y: hy, marker: { symbol: head ? hs.map((v) => head[v]) : hs,
            size: Math.max(head ? 3 : 4, st.limCapSize * PT * (head ? 1.6 : 2.5)), color: faint,
            line: { width: 0 } }, meta: { kind: "arrowhead" },
        });
      }
    }
  }
  traces.legendEntries = [...entries.values()];
  return traces;
}

// ring markers around highlighted points: [{x, y}]
export function highlightTrace(points) {
  return {
    type: "scatter", mode: "markers", showlegend: false, hoverinfo: "skip",
    x: points.map((p) => p.x), y: points.map((p) => p.y),
    marker: { symbol: "circle-open", size: 16, color: "#2F4FB0", line: { width: 2.5, color: "#2F4FB0" } },
    meta: { kind: "highlight" }, name: "highlight",
  };
}

const rangeOf = (lim, scale) => {
  if (!lim || lim.length !== 2 || !lim.every(Number.isFinite)) return undefined;
  if (scale === "log") return lim.every((v) => v > 0) ? lim.map(Math.log10) : undefined;
  return lim.slice();
};

// data points (detections and limits) in plot units: log10 on log axes
function plotPoints(traces, xscale, yscale) {
  const tf = (v, scale) => (scale === "log" ? (v > 0 ? Math.log10(v) : NaN) : v);
  const pts = [];
  for (const t of traces) {
    if (t.meta?.kind !== "det" && t.meta?.kind !== "lim") continue;
    for (let i = 0; i < t.x.length; i++) {
      const x = tf(t.x[i], xscale), y = tf(t.y[i], yscale);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
    }
  }
  return pts;
}

// [lo, hi] of one axis: the given range, else the points' extent with 5 % padding
function spanOf(pts, k, r) {
  if (r) return r;
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p[k]); hi = Math.max(hi, p[k]); }
  const pad = (hi - lo || 1) * 0.05;
  return [lo - pad, hi + pad];
}

// points in axes-fraction coordinates (for loc="best")
function axesFractions(pts, xr, yr) {
  return pts.map(([x, y]) => [(x - xr[0]) / (xr[1] - xr[0]), (y - yr[0]) / (yr[1] - yr[0])]);
}

// matplotlib loc="best": the location (in matplotlib's order) whose box covers the fewest points
const BEST_ORDER = ["upper right", "upper left", "lower left", "lower right", "right", "center left",
  "center right", "lower center", "upper center", "center"];

let measureCtx = null;
// width of label text, which may hold Plotly pseudo-HTML (mathtext output, or the
// <i>/<b> already in style labels): <i>/<b> are measured in the matching font,
// sub/sup at Plotly's 70 % script size, <br> starting a new line
function textWidth(html, px, family) {
  measureCtx ||= document.createElement("canvas").getContext("2d");
  const lines = [0];
  let sub = 0, sup = 0, it = 0, bo = 0, buf = "";
  const flush = () => {
    if (!buf) return;
    measureCtx.font = `${it > 0 ? "italic " : ""}${bo > 0 ? "bold " : ""}${px * (sub > 0 || sup > 0 ? 0.7 : 1)}px ${family}`;
    lines[lines.length - 1] += measureCtx.measureText(buf).width;
    buf = "";
  };
  const s = String(html);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "<") {
      const end = s.indexOf(">", i);
      if (end < 0) break;
      flush(); // the text before the tag was in the style it accumulated under
      const tag = s.slice(i + 1, end).toLowerCase();
      if (tag === "sub") sub++;
      else if (tag === "/sub") sub--;
      else if (tag === "sup") sup++;
      else if (tag === "/sup") sup--;
      else if (tag === "i" || tag === "em") it++;
      else if (tag === "/i" || tag === "/em") it--;
      else if (tag === "b" || tag === "strong") bo++;
      else if (tag === "/b" || tag === "/strong") bo--;
      else if (tag === "br") lines.push(0);
      i = end;
    } else if (c === "&") {
      const m = /^&(amp|lt|gt|quot|apos|#39);/.exec(s.slice(i));
      if (m) { buf += { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" }[m[1]]; i += m[0].length - 1; }
      else buf += c;
    } else buf += c;
  }
  flush();
  return Math.max(...lines);
}

/**
 * Legend as overlay traces + annotations. Geometry follows matplotlib.legend.Legend:
 * columns filled top to bottom, sizes in units of the legend font size.
 * area: plot-area size in px. Returns { traces, annotations } in x2/y2 (axes fraction).
 */
function drawLegend(entries, L, area, theme, fontFamily, points) {
  const fs = L.fontPx;
  entries = entries.map((e) => ({ ...e, label: mathtext(e.label) })); // $...$ in entry labels
  const title = L.title == null ? null : mathtext(String(L.title));
  const n = entries.length;
  const ncol = Math.min(L.ncol, n);
  const nrow = Math.ceil(n / ncol);
  const cols = [];
  for (let c = 0, i = 0; c < ncol; c++) {
    const rows = Math.ceil((n - i) / (ncol - c)); // first columns take the extra entries
    cols.push(entries.slice(i, i + rows));
    i += rows;
  }
  const rowH = fs * 1.15, hl = L.handlelength * fs, tp = L.handletextpad * fs, bp = L.borderpad * fs;
  const colW = cols.map((col) => hl + tp + Math.max(...col.map((e) => textWidth(e.label, fs, fontFamily))));
  const titleH = title ? rowH + L.labelspacing * fs : 0;
  let w = 2 * bp + colW.reduce((a, b) => a + b, 0) + (ncol - 1) * L.columnspacing * fs;
  if (title) w = Math.max(w, 2 * bp + textWidth(title, fs, fontFamily));
  const h = 2 * bp + titleH + nrow * rowH + (nrow - 1) * L.labelspacing * fs;

  // box position (lower-left corner) in px of the plot area
  const pad = L.borderaxespad * fs;
  const place = (loc) => {
    // anchor fraction of the box (0 left/bottom, 0.5 centre, 1 right/top), also its place on the axes
    const [, , xa, ya] = legendAnchor(loc);
    const ax = xa === "left" ? 0 : xa === "right" ? 1 : 0.5;
    const ay = ya === "bottom" ? 0 : ya === "top" ? 1 : 0.5;
    if (L.bbox) return [L.bbox[0] * area.w - ax * w, L.bbox[1] * area.h - ay * h];
    const off = (a) => (a === 0 ? pad : a === 1 ? -pad : 0);
    return [ax * (area.w - w) + off(ax), ay * (area.h - h) + off(ay)];
  };
  let loc = L.loc;
  if (loc === "best" && !L.bbox) {
    let min = Infinity;
    for (const cand of BEST_ORDER) {
      const [x, y] = place(cand);
      const fx0 = x / area.w, fx1 = (x + w) / area.w, fy0 = y / area.h, fy1 = (y + h) / area.h;
      let k = 0;
      for (const [px, py] of points) if (px >= fx0 && px <= fx1 && py >= fy0 && py <= fy1) k++;
      if (k < min) { min = k; loc = cand; }
      if (k === 0) break;
    }
  }
  const [bx, by] = place(loc === "best" ? "upper right" : loc);
  const fxp = (px) => px / area.w, fyp = (py) => py / area.h;

  const traces = [], annotations = [];
  const keep = { selected: { marker: { opacity: 1 } }, unselected: { marker: { opacity: 1 } } };
  if (L.frameon) {
    const face = L.facecolor ? resolveColor(L.facecolor) : theme.paper;
    traces.push({
      type: "scatter", mode: "lines", xaxis: "x2", yaxis: "y2", hoverinfo: "skip", showlegend: false,
      x: [bx, bx + w, bx + w, bx, bx].map(fxp), y: [by, by, by + h, by + h, by].map(fyp),
      fill: "toself", fillcolor: withAlpha(face, L.framealpha),
      line: { color: resolveColor(L.edgecolor), width: 0.8 * PT / 2 }, meta: { kind: "legendframe" },
    });
  }
  let top = by + h - bp;
  if (title) {
    annotations.push({ xref: "x2", yref: "y2", x: fxp(bx + w / 2), y: fyp(top - rowH / 2), text: title,
      showarrow: false, xanchor: "center", yanchor: "middle", font: { size: fs, family: fontFamily, color: theme.ink } });
    top -= titleH;
  }
  let cx = bx + bp;
  cols.forEach((col, c) => {
    col.forEach((e, r) => {
      const cy = top - r * (rowH + L.labelspacing * fs) - rowH / 2;
      const m = markerFor(e.style, !e.det, L.markerscale);
      traces.push({
        type: "scatter", mode: "markers", xaxis: "x2", yaxis: "y2", showlegend: false, hoverinfo: "none",
        x: [fxp(cx + hl / 2)], y: [fyp(cy)], marker: m, opacity: e.det ? 1 : e.style.limAlpha, ...keep,
        meta: { kind: "legend", group: e.key },
      });
      annotations.push({
        xref: "x2", yref: "y2", x: fxp(cx + hl + tp), y: fyp(cy), text: e.label, showarrow: false,
        xanchor: "left", yanchor: "middle", align: "left", captureevents: true, name: e.key,
        font: { size: fs, family: fontFamily, color: theme.ink },
      });
    });
    cx += colW[c] + L.columnspacing * fs;
  });
  return { traces, annotations };
}

/**
 * opts: { xlabel, ylabel, xscale, yscale, xlim, ylim,
 *         showGrid, gridKw, showLegend, legendKw, showAxis, axisKw,
 *         fontFamily, fontSize (pt), figWidth, figHeight (in), figureTheme: "light"|"dark",
 *         xrange, yrange: the zoomed view in plot units (log10 on log axes), for legend and ticks,
 *         traces: the data traces from buildTraces; legend traces are appended to it }
 */
export function buildLayout(opts) {
  const theme = FIGURE_THEMES[opts.figureTheme] || FIGURE_THEMES.light;
  const fontPx = (opts.fontSize || 8) * PT;
  const ax = axisSettings(opts.axisKw || {}, theme, fontPx, opts.fontFamily);
  const grid = gridSettings(opts.gridKw || {}, !!opts.showGrid);
  const inch = 72 * PT;
  const width = (opts.figWidth || FIGURE_DEFAULTS.width) * inch; // not rounded: exports keep the exact size
  const height = (opts.figHeight || FIGURE_DEFAULTS.height) * inch;
  const mg = FIGURE_DEFAULTS.margin;
  const margin = { l: mg.l * inch, r: mg.r * inch, t: (mg.t + (ax.title ? 0.2 : 0)) * inch, b: mg.b * inch, pad: 0 };
  // plot units (log10 on log axes) of the data and of the limits shown: the zoomed view, else
  // the set limits, else the data's extent
  const pts = plotPoints(opts.traces || [], opts.xscale, opts.yscale);
  const shown = {
    x: spanOf(pts, 0, opts.xrange || rangeOf(opts.xlim, opts.xscale)),
    y: spanOf(pts, 1, opts.yrange || rangeOf(opts.ylim, opts.yscale)),
  };
  const minorOn = opts.axisKw?.minor ?? true;
  const axis = (which, scale, lim, label) => {
    const a = { ...ax[which], type: scale === "log" ? "log" : "linear", autorange: !rangeOf(lim, scale),
      range: rangeOf(lim, scale), exponentformat: "power", showexponent: "all", automargin: true };
    const text = (which === "x" ? ax.xlabel : ax.ylabel) ?? label;
    a.title = { ...a.title, text: text == null ? text : mathtext(String(text)) };
    // a log axis spanning a decade or more: labelled decades, 2..9 unlabelled minor ticks, as in
    // matplotlib; less in view keeps Plotly's own ticks, so that some labels show
    const decades = scale === "log" && shown[which][1] - shown[which][0] >= 1;
    if (decades) a.dtick = 1;
    const gridOn = grid.axis === "both" || grid.axis === which;
    a.showgrid = gridOn && grid.major;
    a.gridcolor = grid.color; a.gridwidth = grid.width; a.griddash = grid.dash;
    a.minor = { ...a.minor, showgrid: gridOn && grid.minor, gridcolor: grid.color, gridwidth: grid.width / 2,
      griddash: grid.dash };
    if (decades && minorOn) a.minor.dtick = "D1";
    if (opts.showAxis === false) {
      Object.assign(a, { visible: false });
    }
    return a;
  };
  const layout = {
    autosize: false, width, height,
    paper_bgcolor: theme.paper, plot_bgcolor: theme.plot,
    font: { family: opts.fontFamily, size: fontPx, color: theme.ink },
    margin,
    title: ax.title ? { text: String(ax.title), font: { size: fontPx * 1.1 } } : undefined,
    xaxis: axis("x", opts.xscale, opts.xlim, opts.xlabel),
    yaxis: axis("y", opts.yscale, opts.ylim, opts.ylabel),
    showlegend: false,
    dragmode: opts.dragmode || "zoom",
    hovermode: "closest",
    hoverlabel: { font: { family: "Inter, system-ui, sans-serif", size: 12 } },
    uirevision: opts.uirevision,
  };
  const entries = opts.traces?.legendEntries || [];
  if (opts.showLegend && entries.length) {
    const L = legendSettings(opts.legendKw || {}, fontPx);
    const area = { w: width - margin.l - margin.r, h: height - margin.t - margin.b };
    const points = L.loc === "best" && !L.bbox ? axesFractions(pts, shown.x, shown.y) : [];
    const lg = drawLegend(entries, L, area, theme, opts.fontFamily, points);
    const overlay = { range: [0, 1], autorange: false, fixedrange: true, visible: false, showgrid: false,
      zeroline: false };
    layout.xaxis2 = { ...overlay, overlaying: "x", anchor: "y2" };
    layout.yaxis2 = { ...overlay, overlaying: "y", anchor: "x2" };
    layout.annotations = lg.annotations;
    opts.traces.push(...lg.traces);
  }
  return layout;
}
