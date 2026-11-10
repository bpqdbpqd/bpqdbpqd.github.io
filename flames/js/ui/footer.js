// Page footer: catalog sizes, paper links and the table version from data/meta.json.
// index.html carries the current numbers, so a missing meta.json keeps them as they are.
import { h } from "./dom.js";

// "≤ 1.13" for a catalog starting near z = 0, else "1.0–14.2"; one decimal above z = 10
function zRange({ zmin, zmax }) {
  const d = zmax >= 10 ? 1 : 2;
  return zmin < 0.1 ? `≤ ${zmax.toFixed(d)}` : `${zmin.toFixed(1)}–${zmax.toFixed(d)}`;
}

export async function initFooter(el) {
  const version = el.querySelector(".version");
  const res = await fetch("data/meta.json").catch(() => null);
  if (!res?.ok) { version.textContent = "not available"; return; }
  const meta = await res.json();
  version.textContent = meta.version ? `v${meta.version}` : "unversioned";
  for (const [id, cat] of Object.entries(meta.catalogs || {})) {
    const li = el.querySelector(`[data-cat="${id}"]`);
    if (!li) continue;
    li.querySelector(".cat-n").textContent = cat.rows;
    li.querySelector(".cat-z").textContent = zRange(cat);
  }
  if (meta.papers?.length) {
    const links = meta.papers.map((p) => h("a", { href: p.url, target: "_blank", rel: "noopener" }, p.label));
    const parts = links.flatMap((a, i) => (i === 0 ? [a] : [i === links.length - 1 ? " and " : ", ", a]));
    el.querySelector(".papers").replaceChildren(...parts);
  }
}
