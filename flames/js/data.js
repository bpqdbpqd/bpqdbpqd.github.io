// Load the catalog data built by tools/build_flames_data.py.
const BASE = new URL("../data/", import.meta.url);

const cache = new Map();
function getJSON(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(new URL(name, BASE)).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(name);
}

export const loadCatalog = (catalog) => getJSON(`flames-${catalog}.json`); // "low" | "high"
export const loadRefcodes = () => getJSON("refcodes.json");
// the Cloudy grid is large: stored gzipped, inflated in the browser on first use
export function loadCloudy() {
  if (!cache.has("cloudy")) {
    cache.set("cloudy", fetch(new URL("flames-cloudy.json.gz", BASE)).then(async (r) => {
      if (!r.ok) throw new Error(`flames-cloudy.json.gz: HTTP ${r.status}`);
      const enc = r.headers.get("content-encoding");
      const body = enc && enc.includes("gzip") ? r.body : r.body.pipeThrough(new DecompressionStream("gzip"));
      return new Response(body).json();
    }));
  }
  return cache.get("cloudy");
}
export function loadBib() {
  if (!cache.has("bib")) cache.set("bib", fetch(new URL("flames.bib", BASE)).then((r) => r.text()));
  return cache.get("bib");
}

// numeric columns usable in formulas (excludes _err/_lerr/_flag helpers)
export function formulaColumnNames(table) {
  return table.columns.filter((c) => table.numeric[c] && !/_(err|lerr|flag)$/.test(c));
}
