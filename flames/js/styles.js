// Default plotting style, taken from Paper_I_plots.ipynb (c_dict, m_dict, hz_c_dict,
// hz_m_dict, plot_arith_all errorbar kwargs and the rcParams cell).
// Sizes are matplotlib points; PT converts them to screen pixels.

// px per matplotlib point. The figure is drawn at its size in inches. On screen the plot frame
// is the figure (its inches are px / (72 * SCREEN_PT)); PT is 1 (1 px = 1 pt) for PDF export.
export const SCREEN_PT = 2;
export let PT = SCREEN_PT;
export function setPT(v) { PT = v; }

// matplotlib single-letter and named colors used by the notebook
export const MPL_COLORS = {
  r: "#ff0000", g: "#008000", b: "#0000ff", c: "#00bfbf", m: "#bf00bf", y: "#bfbf00",
  k: "#000000", w: "#ffffff", orange: "#ffa500", grey: "#808080", gray: "#808080",
  greenyellow: "#adff2f", brown: "#a52a2a",
};

// matplotlib marker -> plotly symbol
export const MARKERS = {
  o: "circle", "*": "star", s: "square", D: "diamond", d: "diamond-tall", X: "x", x: "x-thin-open",
  h: "hexagon", H: "hexagon2", P: "cross", "+": "cross-thin-open", "^": "triangle-up",
  v: "triangle-down", "<": "triangle-left", ">": "triangle-right", p: "pentagon", ".": "circle",
};
export const BIG_MARKERS = ["*", "P", "X"]; // drawn 1.5x larger, as in plot_type

const low = (name, color) => ({
  name, label: name, color, marker: "o", size: 1.5, edgeColor: "", edgeWidth: 0,
  errWidth: 0.4, capSize: 0, limSize: 1, limAlpha: 0.2, limErrWidth: 0.3, limCapSize: 1, visible: true,
});
const high = (name, color, marker) => ({
  name, label: name.replace("high-z", "high-<i>z</i>"), color, marker, size: 3.5, edgeColor: "#000000",
  edgeWidth: 0.5, errWidth: 0.6, capSize: 1.5, limSize: 1.5, limAlpha: 0.2, limErrWidth: 0.5,
  limCapSize: 1.5, visible: true,
});

// legend order follows the notebook dictionaries
export function defaultStyles() {
  return {
    low: [
      low("U/LIRG", MPL_COLORS.r), low("Dwarf", MPL_COLORS.b), low("AGN", MPL_COLORS.k),
      low("LINER", MPL_COLORS.c), low("SF", MPL_COLORS.orange), low("ETG", MPL_COLORS.grey),
      low("Region", MPL_COLORS.greenyellow),
    ],
    high: [
      high("high-z DSFG", MPL_COLORS.r, "o"), high("high-z LBG/LAE", MPL_COLORS.b, "*"),
      high("high-z QSO/AGN", MPL_COLORS.k, "s"), high("high-z SF", MPL_COLORS.orange, "D"),
      high("high-z DLA host", MPL_COLORS.greenyellow, "X"), high("high-z ETG", MPL_COLORS.grey, "h"),
      high("proto-cluster", MPL_COLORS.brown, "P"),
    ],
  };
}

// figure defaults (rcParams cell + grid_kwargs of the notebook)
export const FIGURE_DEFAULTS = {
  fontFamily: '"Times New Roman", Times, "STIX Two Text", serif',
  fontSize: 8, // pt, font.size / labelsize / legend.fontsize
  // single-panel figure of the notebook: 3.34 in square axes plus margins (inches)
  width: 3.8, height: 3.7,
  margin: { l: 0.38, r: 0.08, t: 0.08, b: 0.28 },
  grid: "color='k', ls=':', lw=0.3, alpha=0.3",
  legend: "loc='best', fontsize=8, frameon=True",
  axis: "direction='in', top=True, right=True, length=4, width=1, minor=True, labelsize=8, fontsize=8",
};

export function resolveColor(c) {
  if (c == null) return null;
  const s = String(c).trim();
  if (/^(0|1|0?\.\d+|1\.0*)$/.test(s)) { // matplotlib grey level, e.g. "0.8"
    const g = Math.round(parseFloat(s) * 255).toString(16).padStart(2, "0");
    return `#${g}${g}${g}`;
  }
  return MPL_COLORS[s] || s;
}

export function withAlpha(color, alpha) {
  const c = resolveColor(color);
  if (alpha == null || alpha >= 1) return c;
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  return c; // CSS named colors: opacity is applied by the caller where possible
}
