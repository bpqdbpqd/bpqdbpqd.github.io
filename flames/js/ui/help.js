// Circled "?" buttons with a help bubble: shown on mouse hover or keyboard focus, pinned by a
// click or tap, closed by Escape, a click elsewhere, scrolling or resizing. One bubble for the
// page, kept inside the viewport. Static buttons in index.html work too: they only need
// class="help" and data-help="text".
import { h, uid } from "./dom.js";

const bubble = h("div", { class: "help-bubble", role: "tooltip", id: uid("help"), hidden: true });
let owner = null, pinned = false;

function place(btn) {
  const r = btn.getBoundingClientRect(), pad = 8;
  bubble.style.left = "0px"; bubble.style.top = "0px";
  const b = bubble.getBoundingClientRect();
  const left = Math.min(Math.max(pad, r.left + r.width / 2 - b.width / 2), innerWidth - b.width - pad);
  const below = r.bottom + 8 + b.height <= innerHeight - pad || r.top - 8 - b.height < pad;
  bubble.style.left = `${left}px`;
  bubble.style.top = `${below ? r.bottom + 8 : r.top - 8 - b.height}px`;
  bubble.dataset.side = below ? "below" : "above";
}

function show(btn, pin) {
  if (!bubble.isConnected) document.body.append(bubble);
  if (owner && owner !== btn) owner.removeAttribute("aria-describedby");
  owner = btn; pinned = pin;
  bubble.textContent = btn.dataset.help;
  bubble.hidden = false;
  btn.setAttribute("aria-describedby", bubble.id);
  btn.setAttribute("aria-expanded", "true");
  place(btn);
}

function hide() {
  if (!owner) return;
  owner.removeAttribute("aria-describedby");
  owner.setAttribute("aria-expanded", "false");
  bubble.hidden = true; owner = null; pinned = false;
}

const helpOf = (e) => e.target.closest?.(".help");

document.addEventListener("pointerover", (e) => {
  const btn = helpOf(e);
  if (btn && e.pointerType === "mouse" && !pinned) show(btn, false);
});
document.addEventListener("pointerout", (e) => {
  const btn = helpOf(e);
  if (btn && btn === owner && !pinned && !btn.contains(e.relatedTarget)) hide();
});
document.addEventListener("focusin", (e) => {
  const btn = helpOf(e);
  if (btn && btn !== owner && btn.matches(":focus-visible")) show(btn, false);
});
document.addEventListener("focusout", (e) => { if (helpOf(e) === owner && !pinned) hide(); });
document.addEventListener("click", (e) => {
  const btn = helpOf(e);
  if (!btn) { if (owner && !bubble.contains(e.target)) hide(); return; }
  e.preventDefault(); // inside a <summary>: do not fold the section
  e.stopPropagation();
  if (btn === owner && pinned) hide(); else show(btn, true);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && owner) { owner.focus(); hide(); } });
addEventListener("resize", hide);
addEventListener("scroll", hide, { capture: true, passive: true });

/** a circled "?" button; label names the topic for screen readers ("Help: Axes") */
export function helpTip(label, text) {
  return h("button", { class: "help", type: "button", "aria-label": `Help: ${label}`, "aria-expanded": "false",
    dataset: { help: text } }, "?");
}
