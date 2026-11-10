// Draggable splitters: plot | options (--opt-w) and the plot row height (--top-h); the
// table below takes its natural height and the page scrolls.
// Sizes are CSS custom properties on the workspace, persisted in localStorage.
const KEY = "flames.layout";
const STEP = 24; // px per arrow key
const TOP_MIN = 320, TOP_MAX = 2000;

export function initSplitters(workspace) {
  const sizes = JSON.parse(localStorage.getItem(KEY) || "{}");
  const apply = () => {
    if (sizes.optW) workspace.style.setProperty("--opt-w", `${sizes.optW}px`);
    else workspace.style.removeProperty("--opt-w");
    if (sizes.topH) workspace.style.setProperty("--top-h", `${sizes.topH}px`);
    else workspace.style.removeProperty("--top-h");
  };
  const save = () => localStorage.setItem(KEY, JSON.stringify(sizes));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function setFromPointer(dir, ev) {
    const r = workspace.getBoundingClientRect();
    if (dir === "col") sizes.optW = clamp(r.right - ev.clientX, 260, r.width - 320);
    else sizes.topH = clamp(ev.clientY - workspace.querySelector(".top").getBoundingClientRect().top, TOP_MIN, TOP_MAX);
    apply();
  }

  for (const sp of workspace.querySelectorAll("[data-split]")) {
    const dir = sp.dataset.split;
    sp.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      sp.setPointerCapture(e.pointerId);
      sp.classList.add("is-dragging");
      document.body.classList.add("is-resizing", `is-resizing-${dir}`);
      const move = (ev) => setFromPointer(dir, ev);
      const up = () => {
        sp.removeEventListener("pointermove", move);
        sp.classList.remove("is-dragging");
        document.body.classList.remove("is-resizing", `is-resizing-${dir}`);
        save();
      };
      sp.addEventListener("pointermove", move);
      sp.addEventListener("pointerup", up, { once: true });
      sp.addEventListener("pointercancel", up, { once: true });
    });
    sp.addEventListener("keydown", (e) => {
      const r = workspace.getBoundingClientRect();
      const keys = dir === "col" ? { ArrowLeft: 1, ArrowRight: -1 } : { ArrowUp: -1, ArrowDown: 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      if (dir === "col") {
        const cur = sizes.optW || workspace.querySelector(".options-frame").offsetWidth;
        sizes.optW = clamp(cur + keys[e.key] * STEP, 260, r.width - 320);
      } else {
        const cur = sizes.topH || workspace.querySelector(".top").offsetHeight;
        sizes.topH = clamp(cur + keys[e.key] * STEP, TOP_MIN, TOP_MAX);
      }
      apply(); save();
    });
    sp.addEventListener("dblclick", () => {
      delete sizes[dir === "col" ? "optW" : "topH"];
      apply(); save();
    });
  }
  apply();
}
