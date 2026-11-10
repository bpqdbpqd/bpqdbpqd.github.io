// Plot frame: the Plotly figure, its events, the selection card and PNG/PDF export.
import { download } from "../exporters.js";
import { h } from "./dom.js";

// the figure has a fixed size (layout width/height); app.js re-renders it when the frame resizes
const CONFIG = { responsive: false, displayModeBar: false, displaylogo: false, scrollZoom: true, doubleClick: "reset" };
const PNG_DPI = 300; // figure.dpi of the notebook rcParams

// svg2pdf ignores relative sizes and em offsets on Plotly's <tspan> superscripts, and the
// standard PDF fonts have no U+2212 minus: make sizes absolute and use an ASCII minus
function prepareSvgForPdf(svg) {
  for (const text of svg.querySelectorAll("text")) {
    // the figure font is Times; svg2pdf only knows the standard PDF font names and falls
    // back to Helvetica for quoted CSS family lists (legend entries)
    text.style.fontFamily = "times";
    text.setAttribute("font-family", "times");
    const base = parseFloat(text.style.fontSize) || 12;
    for (const ts of text.querySelectorAll("tspan")) {
      if (ts.style.fontFamily) ts.style.fontFamily = "times";
      const pct = /([\d.]+)%/.exec(ts.style.fontSize || "");
      const size = pct ? (base * parseFloat(pct[1])) / 100 : base;
      if (pct) ts.style.fontSize = `${size}px`;
      const dy = ts.getAttribute("dy");
      if (dy && dy.endsWith("em")) ts.setAttribute("dy", String(parseFloat(dy) * size));
    }
  }
  const walker = document.createTreeWalker(svg, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) walker.currentNode.data = walker.currentNode.data.replace(/−/g, "-").replace(/​/g, "");
}

const toPoints = (pts) => {
  const seen = new Set(), out = [];
  for (const p of pts || []) {
    if (!Array.isArray(p.customdata)) continue; // arrows and highlight rings carry no row
    const [catalog, index, fi] = p.customdata;
    const k = `${fi}|${catalog}:${index}`;
    if (!seen.has(k)) { seen.add(k); out.push({ catalog, index, fi }); }
  }
  return out;
};

/** handlers: onSelect(points), onLegendClick("catalog|style name"), onResize() */
export function createPlotView(frame, handlers) {
  const gd = frame.querySelector(".plot");
  const status = frame.querySelector(".plot-status");
  const card = frame.querySelector(".sel-card");
  let bound = false, dragmode = "zoom", lastBox = "", resizeTimer = 0;

  new ResizeObserver(() => {
    const box = `${gd.clientWidth}x${gd.clientHeight}`;
    if (box === lastBox) return; // the figure itself changing size must not loop
    lastBox = box;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => handlers.onResize?.(), 120);
  }).observe(gd);

  function bind() {
    gd.on("plotly_click", (ev) => {
      const legend = ev.points.find((p) => p.data.meta?.kind === "legend");
      if (legend) { handlers.onLegendClick(legend.data.meta.group); return; }
      const pts = toPoints(ev.points);
      if (pts.length) handlers.onSelect(pts);
    });
    // legend labels: styles (including visibility) are edited in the options panel
    gd.on("plotly_clickannotation", (ev) => { if (ev.annotation?.name) handlers.onLegendClick(ev.annotation.name); });
    gd.on("plotly_selected", (ev) => { if (ev) handlers.onSelect(toPoints(ev.points)); });
    gd.on("plotly_deselect", () => handlers.onSelect([]));
  }

  return {
    /** px per point so that a figW x figH inch figure fits the plot box */
    fitScale(figW, figH) {
      const w = gd.clientWidth, h = gd.clientHeight;
      if (!w || !h) return 2;
      return Math.max(0.5, Math.min(w / (figW * 72), h / (figH * 72)));
    },

    async render(data, layout) {
      layout.dragmode = dragmode;
      await Plotly.react(gd, data, layout, CONFIG);
      const box = gd.querySelector(".plot-container");
      if (box) Object.assign(box.style, { width: `${layout.width}px`, margin: "0 auto" });
      if (!bound) { bind(); bound = true; }
    },

    // the current axis ranges in Plotly units (log10 for log axes)
    currentRanges() {
      const fl = gd._fullLayout;
      return fl ? { x: fl.xaxis.range.slice(), y: fl.yaxis.range.slice() } : null;
    },

    setStatus(text) { status.hidden = !text; status.textContent = text || ""; },

    setDragmode(mode) {
      dragmode = mode;
      if (gd._fullLayout) Plotly.relayout(gd, { dragmode: mode });
    },

    // the current axis ranges in data units (log axes are stored as log10 by Plotly)
    currentView() {
      const fl = gd._fullLayout;
      const conv = (ax) => ax.range.map((v) => (ax.type === "log" ? 10 ** v : v));
      return { x: conv(fl.xaxis), y: conv(fl.yaxis) };
    },

    clearSelection() {
      if (!gd._fullLayout) return;
      Plotly.relayout(gd, { selections: [] });
      Plotly.restyle(gd, { selectedpoints: [null] });
    },

    /** items: [{name, catalog, x, y}] (x/y already formatted) */
    showSelection(items, onClear) {
      card.hidden = !items.length;
      if (!items.length) return;
      const MAX = 60;
      card.replaceChildren(
        h("div", { class: "sel-head" },
          h("span", { class: "eyebrow" }, items.length === 1 ? "1 point" : `${items.length} points`),
          h("button", { class: "link-btn", type: "button", onclick: onClear }, "Clear selection")),
        h("ol", { class: "sel-list" }, ...items.slice(0, MAX).map((it) => h("li", {},
          h("span", { class: "sel-name" }, it.name),
          h("span", { class: "sel-cat" }, it.catalog),
          h("span", { class: "sel-xy" }, `x ${it.x}`, h("br"), `y ${it.y}`)))),
        ...(items.length > MAX ? [h("p", { class: "sel-more" }, `+ ${items.length - MAX} more in the table`)] : []));
    },

    /**
     * figure: {data, layout} drawn in the light theme at 1 px per point (layout width/height
     * = the figure size in points), so the PDF has the notebook size; keeps the current zoom
     */
    async exportImage(format, figure, name) {
      const fl = gd._fullLayout;
      const { width, height } = figure.layout;
      for (const ax of ["xaxis", "yaxis"]) {
        figure.layout[ax] = { ...figure.layout[ax], range: fl[ax].range.slice(), autorange: false };
      }
      if (format === "png") {
        const url = await Plotly.toImage(figure, { format: "png", width, height, scale: PNG_DPI / 72 });
        download(await (await fetch(url)).blob(), `${name}.png`);
        return;
      }
      const url = await Plotly.toImage(figure, { format: "svg", width, height });
      const svgText = decodeURIComponent(url.slice(url.indexOf(",") + 1));
      const svg = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
      // svg2pdf measures text, so the SVG has to be in the document while it converts
      const holder = document.body.appendChild(h("div", { class: "offscreen", "aria-hidden": "true" }));
      holder.append(svg);
      prepareSvgForPdf(svg);
      const w = width, hgt = height;
      const doc = new jspdf.jsPDF({ orientation: w > hgt ? "landscape" : "portrait", unit: "pt", format: [w, hgt] });
      await doc.svg(svg, { x: 0, y: 0, width: w, height: hgt });
      holder.remove();
      download(doc.output("blob"), `${name}.pdf`);
    },
  };
}
