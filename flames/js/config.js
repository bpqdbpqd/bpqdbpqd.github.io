// Catalog registry and the default app state. To plot a new catalog later, give it
// `plot: true` here, a style list in styles.js and a `Name` column + `groups` in its data.
import { loadCatalog, loadCloudy } from "./data.js";
import { defaultStyles, FIGURE_DEFAULTS } from "./styles.js";

export const CATALOGS = {
  low: { label: "low-z", title: "Low-z catalog", load: () => loadCatalog("low"), plot: true },
  high: { label: "high-z", title: "High-z catalog", load: () => loadCatalog("high"), plot: true },
  cloudy: { label: "Cloudy", title: "Cloudy model grid", load: loadCloudy, plot: false },
};
export const PLOT_CATALOGS = Object.keys(CATALOGS).filter((c) => CATALOGS[c].plot);

let pairCounter = 0;
export function newPair(x = "", y = "") {
  pairCounter += 1;
  return {
    id: `p${Date.now().toString(36)}${pairCounter}`,
    x, y, on: true,
    cats: Object.fromEntries(PLOT_CATALOGS.map((c) => [c, true])),
  };
}

// the paper's [C II] deficit figure
export function defaultState() {
  return {
    pairs: [newPair("L_IR", "L_CII / L_IR")],
    xscale: "log", yscale: "log",
    xlim: ["", ""], ylim: ["", ""],
    xlabel: "", ylabel: "",
    forceUL: { x: forceULDefault("log"), y: forceULDefault("log") }, snr: 3,
    figWidth: FIGURE_DEFAULTS.width, figHeight: FIGURE_DEFAULTS.height,
    showGrid: false, gridKw: FIGURE_DEFAULTS.grid,
    showLegend: true, legendKw: FIGURE_DEFAULTS.legend,
    showAxis: true, axisKw: FIGURE_DEFAULTS.axis,
    styles: defaultStyles(),
  };
}

// low S/N values are turned into upper limits by default only on a log axis
export const forceULDefault = (scale) => scale === "log";

// switch an axis scale; the low-S/N option follows the default of the new scale
export function setScale(state, ax, scale) {
  state[`${ax}scale`] = scale;
  state.forceUL[ax] = forceULDefault(scale);
}
