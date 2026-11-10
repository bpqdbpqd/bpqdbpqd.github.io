// Column-name suggestions for the word under the caret of a formula input.
import { h, uid } from "./dom.js";

const WORD_BEFORE = /[A-Za-z_][A-Za-z0-9_]*$/;
const WORD_AFTER = /^[A-Za-z0-9_]*/;
const MAX = 12;

export function attachAutocomplete(input, names) {
  const list = h("ul", { class: "ac-list", role: "listbox", id: uid("ac"), hidden: true });
  input.after(list);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");
  let items = [], active = -1;

  const word = () => {
    const pos = input.selectionStart ?? input.value.length;
    const m = WORD_BEFORE.exec(input.value.slice(0, pos));
    if (!m) return null;
    return { start: pos - m[0].length, end: pos + WORD_AFTER.exec(input.value.slice(pos))[0].length, text: m[0] };
  };

  const close = () => {
    list.hidden = true; items = []; active = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };

  function paint() {
    list.replaceChildren(...items.map((name, i) => h("li", {
      id: `${list.id}-${i}`, role: "option", class: i === active ? "is-active" : "",
      "aria-selected": String(i === active), onclick: () => pick(name),
    }, name)));
    if (active >= 0) {
      input.setAttribute("aria-activedescendant", `${list.id}-${active}`);
      list.children[active].scrollIntoView({ block: "nearest" });
    }
  }

  function update() {
    const w = word();
    if (!w) return close();
    const q = w.text.toLowerCase();
    const starts = [], contains = [];
    for (const n of names) {
      const l = n.toLowerCase();
      if (l.startsWith(q)) starts.push(n); else if (l.includes(q)) contains.push(n);
    }
    items = [...starts, ...contains].slice(0, MAX);
    if (!items.length || (items.length === 1 && items[0] === w.text)) return close();
    active = 0;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    paint();
  }

  function pick(name) {
    const w = word();
    if (!w) return;
    input.value = input.value.slice(0, w.start) + name + input.value.slice(w.end);
    const caret = w.start + name.length;
    input.setSelectionRange(caret, caret);
    close();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close(); // the input event re-runs update(); the word is now complete
  }

  input.addEventListener("input", update);
  input.addEventListener("blur", close);
  list.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
}
