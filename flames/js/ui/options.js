// Options frame: formula pairs, axes, figure kwargs, point styles and session controls.
import { parseKwargs } from "../mplkw.js";
import { FIGURE_DEFAULTS } from "../styles.js";
import { CATALOGS, PLOT_CATALOGS, newPair, setScale } from "../config.js";
import { h, uid } from "./dom.js";
import { attachAutocomplete } from "./autocomplete.js";
import { createStyleEditor } from "./styleEditor.js";
import { helpTip } from "./help.js";

const HELP = {
  formulas: "Each pair plots y against x. Combine catalog columns with + − × / ^ and brackets, and the functions "
    + "log10() ln() exp() sqrt() abs(). Put names with odd characters in `backticks`. Errors and upper / lower "
    + "limits propagate through the formula.\n\nTyping suggests column names: ↑ ↓ to choose, Tab or Enter to insert. "
    + "The chips pick the catalogs; the switch hides a pair without deleting it.",
  axes: "Linear or Log per axis. Min and max fix the limits (with one bound only, the other follows the data); "
    + "Use current view copies the zoom of the figure.\n\nLow S/N as upper limit: a value below S/N threshold × its "
    + "error is drawn as an upper limit at value + 3σ. It is on by default for log axes.",
  legend: "matplotlib ax.legend() keywords, e.g. loc='upper right' (or 'best'), ncol=2, fontsize=7, "
    + "frameon=False, framealpha=0.8, title='…', markerscale=1.5, bbox_to_anchor=(1, 0.5). "
    + "Click a legend entry in the figure to edit that point style.",
};

const KW_ROWS = [
  { show: "showGrid", kw: "gridKw", label: "Grid", call: "ax.grid(", def: FIGURE_DEFAULTS.grid },
  { show: "showLegend", kw: "legendKw", label: "Legend", call: "ax.legend(", def: FIGURE_DEFAULTS.legend, help: HELP.legend },
  { show: "showAxis", kw: "axisKw", label: "Axis", call: "tick_params(", def: FIGURE_DEFAULTS.axis },
];

const check = (label, checked, onchange, extra = {}) => {
  const id = uid("chk");
  return h("span", { class: "check-field" },
    h("input", { type: "checkbox", class: "check", id, checked, onchange: (e) => onchange(e.target.checked), ...extra }),
    h("label", { for: id }, label));
};

// help: text of a "?" beside the title, or null
function section(title, key, help, ...body) {
  return h("details", { class: "opt-section", open: true, dataset: { section: key } },
    h("summary", {}, h("h2", { class: "eyebrow" }, title), help && helpTip(title, help)),
    h("div", { class: "opt-body" }, ...body));
}

/** handlers: onUseView(), onShare(), onFigureSize({w?, h?} in inches), onReset() ; names: column names for autocomplete */
export function createOptions(el, store, names, handlers) {
  const styleHost = h("div", { class: "style-editor" });
  const styles = createStyleEditor(styleHost, store);
  const pairList = h("div", { class: "pairs" });
  const axesHost = h("div", {});
  let autoLabels = { x: "", y: "" };
  const sizeInputs = {}; // figure size inputs by key: w, h

  // ------------------------------------------------------------ formula pairs
  function pairCard(pair, fi) {
    const upd = (fn, kind = "data") => store.update((s) => fn(s.pairs.find((p) => p.id === pair.id)), kind);
    const formula = (ax) => {
      const id = uid("f"), errId = `${id}-err`;
      const input = h("input", { class: "input mono", id, type: "text", value: pair[ax], spellcheck: "false",
        autocomplete: "off", autocapitalize: "off", "aria-describedby": errId,
        placeholder: ax === "x" ? "e.g. L_IR" : "e.g. L_CII / L_IR",
        oninput: (e) => upd((p) => { p[ax] = e.target.value; }) });
      const wrap = h("div", { class: "ac-wrap" }, input);
      attachAutocomplete(input, names);
      return h("div", { class: "formula-field" },
        h("label", { for: id, class: "axis-tag" }, ax),
        wrap, h("p", { class: "field-error", id: errId, dataset: { err: ax }, "aria-live": "polite" }));
    };
    return h("article", { class: "pair", dataset: { id: pair.id }, "data-off": pair.on ? null : "true" },
      h("div", { class: "pair-head" },
        h("label", { class: "switch" },
          h("input", { type: "checkbox", checked: pair.on, "aria-label": `Plot pair ${fi + 1}`,
            onchange: (e) => {
              e.target.closest(".pair").toggleAttribute("data-off", !e.target.checked);
              upd((p) => { p.on = e.target.checked; });
            } }),
          h("span", { class: "switch-track", "aria-hidden": "true" }),
          h("span", { class: "pair-title" }, `Pair ${fi + 1}`)),
        h("div", { class: "chips", role: "group", "aria-label": "Catalogs" },
          ...PLOT_CATALOGS.map((c) => h("label", { class: "chip" },
            h("input", { type: "checkbox", checked: pair.cats[c], onchange: (e) => upd((p) => { p.cats[c] = e.target.checked; }) }),
            h("span", {}, CATALOGS[c].label)))),
        h("button", { class: "icon-btn", type: "button", "aria-label": `Remove pair ${fi + 1}`, title: "Remove pair",
          onclick: () => { store.update((s) => { s.pairs = s.pairs.filter((p) => p.id !== pair.id); }, "data"); renderPairs(); } },
        "×")),
      formula("x"), formula("y"),
      h("p", { class: "pair-diag", "aria-live": "polite" }));
  }

  function renderPairs() {
    const { pairs } = store.get();
    pairList.replaceChildren(...pairs.map(pairCard));
    if (!pairs.length) pairList.append(h("p", { class: "hint" }, "No formula pairs: the table frame shows the raw catalogs."));
  }

  // ------------------------------------------------------------ axes
  function renderAxes() {
    const s = store.get();
    const axisCol = (ax) => {
      const lim = `${ax}lim`, scale = `${ax}scale`;
      const limInput = (k, label) => h("input", { class: "input", type: "number", step: "any", value: s[lim][k],
        "aria-label": `${ax} ${label}`, placeholder: label,
        oninput: (e) => store.update((st) => { st[lim][k] = e.target.value; }, "view") });
      const segBtn = (value, text) => h("button", { type: "button", "aria-pressed": String(s[scale] === value),
        onclick: () => { store.update((st) => setScale(st, ax, value), "data"); renderAxes(); } }, text);
      const labelId = uid("lab");
      return h("fieldset", { class: "axis-col" },
        h("legend", { class: "axis-tag" }, ax),
        h("div", { class: "seg", role: "group", "aria-label": `${ax} scale` }, segBtn("linear", "Linear"), segBtn("log", "Log")),
        h("div", { class: "lim-row" }, limInput(0, "min"), h("span", { class: "dash", "aria-hidden": "true" }, "–"), limInput(1, "max")),
        h("label", { for: labelId, class: "sub-label" }, "Label"),
        h("input", { class: "input", id: labelId, type: "text", value: s[`${ax}label`], placeholder: autoLabels[ax] || "auto",
          dataset: { autolabel: ax }, oninput: (e) => store.update((st) => { st[`${ax}label`] = e.target.value; }, "view") }),
        check("Low S/N as upper limit", s.forceUL[ax], (v) => store.update((st) => { st.forceUL[ax] = v; }, "data")));
    };
    const snrId = uid("snr");
    axesHost.replaceChildren(
      h("div", { class: "axis-grid" }, axisCol("x"), axisCol("y")),
      h("div", { class: "row" },
        h("label", { for: snrId, class: "sub-label inline" }, "S/N threshold"),
        h("input", { class: "input narrow", id: snrId, type: "number", min: "0", step: "1", value: String(s.snr),
          oninput: (e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && v >= 0) store.update((st) => { st.snr = v; }, "data");
          } }),
        h("span", { class: "spacer" }),
        h("button", { class: "btn btn-sm", type: "button", onclick: handlers.onUseView }, "Use current view"),
        h("button", { class: "btn btn-quiet btn-sm", type: "button", onclick: () => {
          store.update((st) => { st.xlim = ["", ""]; st.ylim = ["", ""]; }, "view"); renderAxes();
        } }, "Clear limits")));
  }

  // ------------------------------------------------------------ figure kwargs
  function figureBody() {
    const s = store.get();
    const rows = KW_ROWS.map((r) => {
      const id = uid("kw"), err = h("p", { class: "field-error", id: `${id}-err`, "aria-live": "polite" });
      const validate = (v) => {
        try { parseKwargs(v); err.textContent = ""; }
        catch (e) { err.textContent = e.message; }
      };
      const input = h("input", { class: "input mono", id, type: "text", value: s[r.kw], spellcheck: "false",
        autocomplete: "off", "aria-describedby": err.id,
        oninput: (e) => { validate(e.target.value); store.update((st) => { st[r.kw] = e.target.value; }, "view"); } });
      validate(s[r.kw]);
      return h("div", { class: "kw-row" },
        h("div", { class: "kw-head" },
          check(r.label, s[r.show], (v) => store.update((st) => { st[r.show] = v; }, "view")),
          r.help && helpTip(`${r.label} options`, r.help)),
        h("div", { class: "kw-input" }, h("span", { class: "kw-call mono", "aria-hidden": "true" }, r.call), input,
          h("span", { class: "kw-call mono", "aria-hidden": "true" }, ")"),
          h("button", { class: "icon-btn", type: "button", title: "Restore default", "aria-label": `Restore ${r.label} default`,
            onclick: () => { input.value = r.def; validate(r.def); store.update((st) => { st[r.kw] = r.def; }, "view"); } }, "↺")),
        err);
    });
    // the inputs show the plot frame's size (showFigureSize); a committed value sets the frame
    const sizeInput = (key, label) => {
      sizeInputs[key] = h("input", { class: "input narrow", type: "number", min: "1", step: "0.01",
        "aria-label": `Figure ${label} in inches`, placeholder: label,
        onchange: (e) => {
          const v = parseFloat(e.target.value);
          handlers.onFigureSize(Number.isFinite(v) && v > 0 ? { [key]: v } : {});
        } });
      return sizeInputs[key];
    };
    return [
      h("div", { class: "row" },
        h("span", { class: "sub-label inline" }, "Figure size (in)"),
        sizeInput("w", "width"), h("span", { class: "dash", "aria-hidden": "true" }, "×"), sizeInput("h", "height"),
        h("button", { class: "btn btn-quiet btn-sm", type: "button",
          title: `Reset to ${FIGURE_DEFAULTS.width.toFixed(2)} × ${FIGURE_DEFAULTS.height.toFixed(2)} in`,
          onclick: () => handlers.onFigureSize({ w: FIGURE_DEFAULTS.width, h: FIGURE_DEFAULTS.height }) }, "Reset")),
      ...rows,
      h("p", { class: "hint" }, "matplotlib keyword syntax, e.g. ", h("code", {}, "loc='lower left', ncol=2, markerscale=1.5"),
        "; axis also takes ", h("code", {}, "xlabel, ylabel, title")),
      h("p", { class: "hint" }, "The figure follows the page theme; PNG and PDF exports always use the light paper figure."),
    ];
  }

  // ------------------------------------------------------------ assembly
  function render() {
    renderPairs();
    renderAxes();
    styles.render();
    el.replaceChildren(
      section("Formulas", "formulas", HELP.formulas,
        h("p", { class: "hint syntax" }, "Columns combined with ", h("code", {}, "+ − × / ^"), ", brackets, ",
          h("code", {}, "log10() ln() exp() sqrt() abs()"), "; quote odd names in ", h("code", {}, "`backticks`"),
          ". Errors and limits propagate."),
        pairList,
        h("button", { class: "btn btn-add", type: "button", onclick: () => {
          store.update((s) => { s.pairs.push(newPair("", "")); }, "data");
          renderPairs();
          pairList.lastElementChild.querySelector("input.mono")?.focus();
        } }, "+ Add formula pair")),
      section("Axes", "axes", HELP.axes, axesHost),
      section("Figure", "figure", null, ...figureBody()),
      section("Point styles", "styles", null, styleHost),
      section("Session", "session", null,
        h("div", { class: "row" },
          h("button", { class: "btn btn-sm", type: "button", onclick: handlers.onShare }, "Copy share link"),
          h("button", { class: "btn btn-quiet btn-sm danger", type: "button", onclick: handlers.onReset }, "Reset everything")),
        h("p", { class: "hint" }, "Settings are kept in this browser. The link stores the formulas and axis scales.")),
    );
  }

  return {
    render,
    renderAxes,
    /** size in inches {w, h} of the plot frame; a focused input keeps what was typed unless forced */
    showFigureSize(size, force = false) {
      for (const k of ["w", "h"]) {
        const input = sizeInputs[k];
        if (input && (force || document.activeElement !== input)) input.value = size[k].toFixed(2);
      }
    },
    openStyle(cat, name) {
      el.querySelector('[data-section="styles"]').open = true;
      styles.open(cat, name);
    },
    /** inline parse errors, missing columns and point counts per pair */
    showDiagnostics(computed) {
      for (const c of computed) {
        const card = pairList.querySelector(`.pair[data-id="${CSS.escape(c.pair.id)}"]`);
        if (!card) continue;
        for (const ax of ["x", "y"]) card.querySelector(`[data-err="${ax}"]`).textContent = c.errors[ax] || "";
        const diag = card.querySelector(".pair-diag");
        diag.replaceChildren();
        if (!c.xAst || !c.yAst) continue;
        const bits = PLOT_CATALOGS.filter((cat) => c.pair.cats[cat]).map((cat) => {
          const miss = c.missing[cat];
          return miss
            ? h("span", { class: "diag-bad" }, `${CATALOGS[cat].label}: no column ${miss.join(", ")}`)
            : h("span", {}, `${CATALOGS[cat].label} · ${c.counts[cat] ?? 0} points`);
        });
        diag.append(...(bits.length ? bits : [h("span", { class: "diag-bad" }, "no catalog selected")]));
      }
    },
    setAutoLabels(labels) {
      autoLabels = labels;
      for (const ax of ["x", "y"]) {
        const input = axesHost.querySelector(`[data-autolabel="${ax}"]`);
        if (input) input.placeholder = labels[ax] || "auto";
      }
    },
  };
}
