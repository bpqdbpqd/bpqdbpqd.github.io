// FLAMES catalog explorer: wires state, computation, plot, options and table together.
import { FUNCS } from "./formula.js";
import { buildTraces, highlightTrace, buildLayout } from "./plot.js";
import { FIGURE_DEFAULTS, PT, setPT } from "./styles.js";
import { parseKwargs } from "./mplkw.js";
import { formulaColumnNames } from "./data.js";
import { CATALOGS, PLOT_CATALOGS, setScale } from "./config.js";
import { loadState, createStore, writeHash, STORAGE_KEYS } from "./state.js";
import { computePair, isPlottable } from "./compute.js";
import { fmtNum, slug } from "./ui/dom.js";
import { initTheme, pageTheme } from "./ui/theme.js";
import { initSplitters } from "./ui/splitters.js";
import { initFooter } from "./ui/footer.js";
import { createPlotView } from "./ui/plotView.js";
import { createOptions } from "./ui/options.js";
import { createTableView } from "./ui/tableView.js";
import { toast } from "./ui/toast.js";

const $ = (sel) => document.querySelector(sel);

// WebGL redraws a zoomed plot ~10x faster than SVG, but only with a GPU: software renderers
// (SwiftShader, llvmpipe; hardware acceleration off) are slower than SVG
const HARDWARE_GL = (() => {
  const gl = document.createElement("canvas").getContext("webgl");
  if (!gl) return false;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(renderer));
})();
const REPLOT_MS = 150;

const store = createStore(loadState());
let tables = null;          // { low, high } once loaded
let computed = [];          // computePair() per formula pair
let selection = null;       // { fi, keys: Set("catalog:index"), points }
const highlights = new Set(); // "fi@catalog:index"
let resetCount = 0, pairIds = "";
const lastKw = { gridKw: {}, legendKw: {}, axisKw: {} }; // last kwargs that parsed

initTheme($("#theme-toggle"), () => renderPlot()); // the figure follows the page theme
initSplitters($("#workspace"));
initFooter($(".app-footer")).catch(() => { $(".app-footer .version").textContent = "not available"; });

const names = []; // filled once the catalogs are loaded
const options = createOptions($("#options-body"), store, names, {
  onUseView() {
    const v = plotView.currentView();
    const r = (n) => String(Number(n.toPrecision(4)));
    store.update((s) => { s.xlim = v.x.map(r); s.ylim = v.y.map(r); }, "view");
    options.renderAxes();
  },
  async onShare() {
    writeHash(store.get());
    await navigator.clipboard.writeText(location.href);
    toast("Link copied to the clipboard.");
  },
  onReset() {
    if (!confirm("Reset formulas, styles, figure settings, layout and theme to the defaults?")) return;
    for (const k of STORAGE_KEYS) localStorage.removeItem(k);
    location.replace(location.pathname);
  },
});

const plotView = createPlotView($(".plot-frame"), {
  onSelect: (points) => (points.length ? select(points) : clearSelection()),
  onResize: () => renderPlot(),
  onLegendClick(group) {
    const [catalog, name] = group.split("|"); // legend entry key "catalog|style name"
    openOptions();
    options.openStyle(catalog, name);
  },
});

const tableView = createTableView($(".table-frame"), {
  onRowClick(fi, key) {
    const k = `${fi}@${key}`;
    if (highlights.has(k)) highlights.delete(k); else highlights.add(k);
    afterHighlight();
  },
  isHighlighted: (fi, key) => highlights.has(`${fi}@${key}`),
  onClearSelection: clearSelection,
  onClearHighlights() { highlights.clear(); afterHighlight(); },
});

// ------------------------------------------------------------ selection & highlights
function pointValues(fi, catalog, index) {
  const ser = computed[fi]?.series.find((s) => s.catalog === catalog);
  if (!ser) return null;
  return { name: ser.names[index], x: ser.x, y: ser.y, i: index };
}

function select(points) {
  const fi = points[0].fi;
  selection = { fi, points, keys: new Set(points.filter((p) => p.fi === fi).map((p) => `${p.catalog}:${p.index}`)) };
  tableView.show(fi);
  tableView.setSelection(selection);
  const flag = (a, i) => (a.upl[i] ? "< " : a.lol[i] ? "> " : "");
  plotView.showSelection(points.map((p) => {
    const v = pointValues(p.fi, p.catalog, p.index);
    return { name: v?.name ?? "?", catalog: CATALOGS[p.catalog].label,
      x: v ? flag(v.x, v.i) + fmtNum(v.x.v[v.i]) : "–", y: v ? flag(v.y, v.i) + fmtNum(v.y.v[v.i]) : "–" };
  }), clearSelection);
}

function clearSelection() {
  if (!selection) return; // plotly_deselect also fires when we clear the plot selection ourselves
  selection = null;
  tableView.setSelection(null);
  plotView.showSelection([]);
  plotView.clearSelection();
}

function afterHighlight() {
  tableView.refreshHighlights(highlights.size);
  renderPlot();
}

function highlightPoints() {
  const pts = [];
  for (const k of highlights) {
    const [fi, key] = k.split("@");
    const [catalog, index] = key.split(":");
    if (!computed[fi] || !isPlottable(computed[fi])) continue;
    const v = pointValues(Number(fi), catalog, Number(index));
    if (v && Number.isFinite(v.x.v[v.i]) && Number.isFinite(v.y.v[v.i])) pts.push({ x: v.x.v[v.i], y: v.y.v[v.i] });
  }
  return pts;
}

// ------------------------------------------------------------ compute & render
const joinLabels = (labels) => [...new Set(labels)].join("; ");

function recompute() {
  const s = store.get();
  computed = s.pairs.map((p, fi) => computePair(p, fi, tables, s));
  const ids = s.pairs.map((p) => p.id).join();
  if (ids !== pairIds) { // pair indices shifted: selection and highlights no longer apply
    pairIds = ids;
    highlights.clear();
    clearSelection();
  }
  const plotted = computed.filter(isPlottable);
  options.showDiagnostics(computed);
  options.setAutoLabels({ x: joinLabels(plotted.map((c) => c.xlabel)), y: joinLabels(plotted.map((c) => c.ylabel)) });
  tableView.update(computed);
  tableView.setSelection(selection);
  tableView.refreshHighlights(highlights.size);
}

function limits(s, ax) {
  const [lo, hi] = s[`${ax}lim`].map((v) => (v === "" || v === null ? NaN : parseFloat(v)));
  return { lo, hi, both: Number.isFinite(lo) && Number.isFinite(hi) };
}

function figure(figureTheme, exporting = false) {
  const s = store.get();
  for (const k of Object.keys(lastKw)) {
    try { lastKw[k] = parseKwargs(s[k]); } catch { /* keep the last valid kwargs; options shows the error */ }
  }
  const plotted = computed.filter(isPlottable);
  // screen: WebGL for fast zoom when the GPU renders it; exports: SVG
  const data = buildTraces(plotted.flatMap((c) => c.series), s.styles, { gl: !exporting && HARDWARE_GL });
  const xl = limits(s, "x"), yl = limits(s, "y");
  const layout = buildLayout({
    xlabel: s.xlabel || joinLabels(plotted.map((c) => c.xlabel)),
    ylabel: s.ylabel || joinLabels(plotted.map((c) => c.ylabel)),
    xscale: s.xscale, yscale: s.yscale,
    xlim: xl.both ? [xl.lo, xl.hi] : undefined, ylim: yl.both ? [yl.lo, yl.hi] : undefined,
    showGrid: s.showGrid, gridKw: lastKw.gridKw,
    showLegend: s.showLegend, legendKw: lastKw.legendKw,
    showAxis: s.showAxis, axisKw: lastKw.axisKw,
    fontFamily: FIGURE_DEFAULTS.fontFamily, fontSize: FIGURE_DEFAULTS.fontSize,
    figWidth: Number(s.figWidth) || FIGURE_DEFAULTS.width, figHeight: Number(s.figHeight) || FIGURE_DEFAULTS.height,
    figureTheme, traces: data,
    uirevision: JSON.stringify([s.xscale, s.yscale, s.xlim, s.ylim, s.pairs.map((p) => [p.x, p.y]), resetCount]),
  });
  // a single bound: autorange the other side
  for (const [ax, l] of [["x", xl], ["y", yl]]) {
    if (l.both || Number.isFinite(l.lo) === Number.isFinite(l.hi)) continue;
    const log = s[`${ax}scale`] === "log";
    const v = Number.isFinite(l.lo) ? l.lo : l.hi;
    if (log && v <= 0) continue;
    const t = log ? Math.log10(v) : v;
    Object.assign(layout[`${ax}axis`], Number.isFinite(l.lo)
      ? { range: [t, null], autorange: "max" } : { range: [null, t], autorange: "min" });
  }
  return { data, layout, plotted };
}

function renderPlot() {
  if (!tables) return;
  const s = store.get();
  setPT(plotView.fitScale(Number(s.figWidth) || FIGURE_DEFAULTS.width, Number(s.figHeight) || FIGURE_DEFAULTS.height));
  const { data, layout, plotted } = figure(pageTheme());
  const hl = highlightPoints();
  if (hl.length) data.push(highlightTrace(hl));
  plotView.setStatus(plotted.length ? "" : "Add or enable a formula pair in Options to plot.");
  plotView.render(data, layout);
}

let timer = 0, dataDirty = true;
function flush() {
  if (!tables) return;
  if (dataDirty) { recompute(); dataDirty = false; }
  renderPlot();
}
store.subscribe((s, kind) => {
  if (kind === "data") dataDirty = true;
  syncToolbar();
  clearTimeout(timer);
  timer = setTimeout(flush, REPLOT_MS);
});

// ------------------------------------------------------------ plot toolbar
const dragButtons = [...document.querySelectorAll("[data-mode]")];
for (const b of dragButtons) {
  b.addEventListener("click", () => {
    plotView.setDragmode(b.dataset.mode);
    for (const o of dragButtons) o.setAttribute("aria-pressed", String(o === b));
  });
}
$("#reset-view").addEventListener("click", () => { resetCount += 1; renderPlot(); });
for (const ax of ["x", "y"]) {
  $(`#log${ax}`).addEventListener("click", () => {
    store.update((s) => setScale(s, ax, s[`${ax}scale`] === "log" ? "linear" : "log"), "data");
    options.renderAxes();
  });
}
function syncToolbar() {
  const s = store.get();
  for (const ax of ["x", "y"]) $(`#log${ax}`).setAttribute("aria-pressed", String(s[`${ax}scale`] === "log"));
}

function exportName() {
  const p = computed.filter(isPlottable).map((c) => c.pair);
  if (!p.length) return "flames_figure";
  return `flames_${slug(p.map((q) => q.x).join("+"))}_vs_${slug(p.map((q) => q.y).join("+"))}`;
}
for (const fmt of ["png", "pdf"]) {
  $(`#export-${fmt}`).addEventListener("click", async (e) => {
    if (!tables) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    // the exported figure is drawn at 1 px per point: its size is the notebook figure size
    const screenPT = PT;
    setPT(1);
    const { data, layout } = figure("light", true);
    setPT(screenPT);
    await plotView.exportImage(fmt, { data, layout }, exportName())
      .catch((err) => toast(`${fmt.toUpperCase()} export failed: ${err.message}`, { tone: "error" }));
    btn.disabled = false;
  });
}

// ------------------------------------------------------------ mobile options drawer
const optionsFrame = $(".options-frame"), optionsToggle = $(".options-toggle");
function openOptions() {
  optionsFrame.classList.remove("is-collapsed");
  optionsToggle.setAttribute("aria-expanded", "true");
}
optionsToggle.addEventListener("click", () => {
  const open = optionsFrame.classList.toggle("is-collapsed") === false;
  optionsToggle.setAttribute("aria-expanded", String(open));
});

// ------------------------------------------------------------ start
options.render();
syncToolbar();
plotView.setStatus("Loading catalogs…");
Promise.all(PLOT_CATALOGS.map(async (c) => [c, await CATALOGS[c].load()]))
  .then((entries) => {
    tables = Object.fromEntries(entries);
    const cols = new Set(PLOT_CATALOGS.flatMap((c) => formulaColumnNames(tables[c])));
    names.push(...[...cols].sort((a, b) => a.localeCompare(b)), ...FUNCS);
    flush();
  })
  .catch((err) => plotView.setStatus(`Could not load the catalogs: ${err.message}`));
