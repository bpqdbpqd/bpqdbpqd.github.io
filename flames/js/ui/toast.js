// Transient status messages in the corner of the page.
import { h } from "./dom.js";

let host = null;

export function toast(message, { tone = "info", ms = 4500 } = {}) {
  host ??= document.body.appendChild(h("div", { class: "toasts", role: "status", "aria-live": "polite" }));
  const el = host.appendChild(h("div", { class: "toast", "data-tone": tone }, message));
  setTimeout(() => el.remove(), ms);
}
