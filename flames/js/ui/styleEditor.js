// Per point-type style editor (one foldable row per plot group of each catalog).
import { defaultStyles, MARKERS, resolveColor } from "../styles.js";
import { CATALOGS } from "../config.js";
import { h, uid } from "./dom.js";

// marker glyphs for the swatch; close enough to the plotted symbols
const GLYPH = { o: "●", ".": "●", "*": "★", s: "■", D: "◆", d: "◆", X: "✖", x: "×", h: "⬢", H: "⬣",
  P: "✚", "+": "+", "^": "▲", v: "▼", "<": "◀", ">": "▶", p: "⬟" };
const MARKER_NAMES = { o: "circle", ".": "point", "*": "star", s: "square", D: "diamond", d: "thin diamond",
  X: "filled x", x: "x", h: "hexagon", H: "hexagon 2", P: "filled plus", "+": "plus", "^": "triangle up",
  v: "triangle down", "<": "triangle left", ">": "triangle right", p: "pentagon" };

const NUMBER_FIELDS = [
  ["size", "Size (pt)", 0.1], ["edgeWidth", "Edge width", 0.1], ["errWidth", "Error bar width", 0.1],
  ["capSize", "Cap size", 0.5], ["limSize", "Limit marker size", 0.1], ["limErrWidth", "Limit line width", 0.1],
  ["limCapSize", "Arrow head size", 0.5],
];

const hex = (c) => {
  const r = resolveColor(c);
  return /^#[0-9a-f]{6}$/i.test(r || "") ? r : "#000000";
};
const stripTags = (s) => String(s).replace(/<[^>]+>/g, "");

export function createStyleEditor(el, store) {
  function paintSwatch(sw, st) {
    sw.textContent = GLYPH[st.marker] || "●";
    sw.style.color = resolveColor(st.color);
    sw.style.setProperty("--edge", st.edgeColor && st.edgeWidth > 0 ? resolveColor(st.edgeColor) : "transparent");
  }

  function row(cat, st) {
    const set = (prop, v) => {
      store.update((s) => { s.styles[cat].find((x) => x.name === st.name)[prop] = v; }, "view");
      st[prop] = v;
      paintSwatch(swatch, st);
    };
    const swatch = h("span", { class: "swatch", "aria-hidden": "true" });
    paintSwatch(swatch, st);

    const field = (label, control) => {
      control.id ||= uid("st");
      return h("div", { class: "field" }, h("label", { for: control.id }, label), control);
    };
    const colorField = (label, prop) => {
      const text = h("input", { class: "input", type: "text", value: st[prop] || "", spellcheck: "false",
        placeholder: prop === "edgeColor" ? "none" : "", oninput: (e) => {
          set(prop, e.target.value.trim());
          const c = resolveColor(e.target.value.trim());
          if (/^#[0-9a-f]{6}$/i.test(c)) picker.value = c;
        } });
      text.id = uid("st");
      const picker = h("input", { class: "color", type: "color", value: hex(st[prop]),
        "aria-label": `${label} picker`, oninput: (e) => { text.value = e.target.value; set(prop, e.target.value); } });
      return h("div", { class: "field" }, h("label", { for: text.id }, label),
        h("div", { class: "color-field" }, picker, text));
    };
    const num = ([prop, label, step]) => field(label, h("input", { class: "input", type: "number", min: "0",
      step: String(step), value: String(st[prop]), oninput: (e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v >= 0) set(prop, v);
      } }));
    const marker = field("Marker", h("select", { class: "input", onchange: (e) => set("marker", e.target.value) },
      ...Object.keys(MARKERS).map((m) => h("option", { value: m, selected: m === st.marker },
        `${GLYPH[m] || ""}  ${MARKER_NAMES[m] || m}  (${m})`))));
    const alpha = h("output", {}, st.limAlpha.toFixed(2));
    const alphaField = field("Limit opacity", h("input", { class: "range", type: "range", min: "0", max: "1",
      step: "0.05", value: String(st.limAlpha), oninput: (e) => {
        set("limAlpha", parseFloat(e.target.value)); alpha.textContent = parseFloat(e.target.value).toFixed(2);
      } }));
    alphaField.append(alpha);

    return h("details", { class: "style-row", dataset: { key: `${cat}|${st.name}` } },
      h("summary", {},
        h("input", { type: "checkbox", class: "check", checked: st.visible, "aria-label": `Show ${stripTags(st.label)}`,
          onclick: (e) => e.stopPropagation(), onchange: (e) => set("visible", e.target.checked) }),
        swatch,
        h("span", { class: "style-name" }, stripTags(st.label)),
        h("span", { class: "style-meta" }, `${st.size} pt`)),
      h("div", { class: "style-fields" },
        colorField("Fill color", "color"), colorField("Edge color", "edgeColor"), marker,
        ...NUMBER_FIELDS.map(num), alphaField,
        field("Legend label (HTML)", h("input", { class: "input", type: "text", value: st.label,
          oninput: (e) => set("label", e.target.value) }))));
  }

  function render() {
    const { styles } = store.get();
    el.replaceChildren(
      h("p", { class: "hint" }, "Click a legend entry on the plot to jump to its style."),
      ...Object.keys(styles).filter((cat) => CATALOGS[cat]).map((cat) => h("div", { class: "style-group" },
        h("h3", { class: "eyebrow" }, CATALOGS[cat].label), ...styles[cat].map((st) => row(cat, st)))),
      h("button", { class: "btn", type: "button", onclick: () => {
        store.update((s) => { s.styles = defaultStyles(); }, "view");
        render();
      } }, "Reset to paper defaults"));
  }

  return {
    render,
    open(cat, name) {
      const row = el.querySelector(`.style-row[data-key="${CSS.escape(`${cat}|${name}`)}"]`);
      if (!row) return;
      row.open = true;
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      row.querySelector("summary").focus({ preventScroll: true });
      row.classList.add("is-flash");
      setTimeout(() => row.classList.remove("is-flash"), 1200);
    },
  };
}
