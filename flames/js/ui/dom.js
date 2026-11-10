// Small DOM helpers shared by the UI modules.

const PROPS = new Set(["value", "checked", "disabled", "open", "hidden", "selected"]);

/** h("button", { class: "btn", onclick }, "Text", childNode) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

let uidCounter = 0;
export const uid = (prefix = "id") => `${prefix}-${++uidCounter}`;

export function debounce(fn, ms) {
  let t = 0;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// short display of a number: ~4 significant figures
export function fmtNum(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(3).replace(/\.?0+e/, "e");
  return String(Number(v.toPrecision(4)));
}

// file-name-safe version of a formula
export const slug = (s) => String(s).replace(/[^A-Za-z0-9.+-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "formula";
