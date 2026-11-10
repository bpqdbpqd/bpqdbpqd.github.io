// Table frame. With formula pairs: one tab per pair (buildFormulaTable rows). Without:
// folded panels with the raw catalogs, each loaded only when unfolded.
import { buildFormulaTable, buildRawTable, bibKeysForRows, refCodesForRows } from "../table.js";
import { toCSV, toFITS, splitBib, bibSubset, download, texCitations, FLAMES_I_KEY } from "../exporters.js";
import { loadBib, loadRefcodes } from "../data.js";
import { CATALOGS } from "../config.js";
import { h, slug } from "./dom.js";
import { makeTable, visibleColumns } from "./grid.js";
import { toast } from "./toast.js";
import { helpTip } from "./help.js";

let bibEntries = null;

async function exportRows(kind, grid, columns, refCols, name) {
  const rows = grid.getData("active"); // filtered and sorted, raw values
  const cols = visibleColumns(grid, columns);
  if (!rows.length) { toast("No rows to export.", { tone: "warning" }); return; }
  if (kind === "csv") download(toCSV(cols, rows), `${name}.csv`, "text/csv");
  else if (kind === "fits") download(toFITS(cols, rows, "FLAMES"), `${name}.fits`, "application/fits");
  else if (kind === "tex") {
    const refcodes = await loadRefcodes();
    download(texCitations(refCodesForRows(rows, refCols), refcodes), `${name}.tex`, "application/x-tex");
  } else {
    const [bibText, refcodes] = await Promise.all([loadBib(), loadRefcodes()]);
    bibEntries ??= splitBib(bibText);
    const keys = [...new Set([FLAMES_I_KEY, ...bibKeysForRows(rows, refCols, refcodes)])];
    const { text, missing } = bibSubset(bibEntries, keys);
    download(text, `${name}.bib`, "application/x-bibtex");
    const found = keys.length - missing.length;
    toast(`${found} BibTeX ${found === 1 ? "entry" : "entries"} exported` + (missing.length
      ? `; ${missing.length} not in flames.bib: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}`
      : "."), { tone: missing.length ? "warning" : "info", ms: missing.length ? 8000 : 4500 });
  }
}

function exportButtons(getGrid, getMeta) {
  const btn = (kind, label) => h("button", { class: "btn btn-quiet btn-sm", type: "button", dataset: { kind },
    onclick: () => { const g = getGrid(); if (g) exportRows(kind, g, ...getMeta()); } }, label);
  return h("div", { class: "export-group", role: "group", "aria-label": "Export rows" },
    h("span", { class: "eyebrow" }, "Export"), btn("csv", "CSV"), btn("fits", "FITS"), btn("bib", "BibTeX"),
    btn("tex", "TeX"), helpTip("export", EXPORT_HELP));
}

const EXPORT_HELP = "CSV and FITS: the rows and columns shown (after filters and sorting).\n\n"
  + "BibTeX: a .bib file with the references of those rows, plus FLAMES I.\n\n"
  + "TeX: one line of \\citet{…} commands grouped by reference code, in the format of the FLAMES paper, "
  + "starting with FLAMES I.";

// raw tables: catalogs with plot groups go through buildRawTable; others (Cloudy) are plain
function rawTable(table, id) {
  if (!table.groups) {
    const columns = table.columns.map((c) => ({ field: c, title: c, kind: table.numeric[c] ? "num" : "text" }));
    const rows = new Array(table.nrows);
    for (let i = 0; i < table.nrows; i++) {
      const row = { _key: `${id}:${i}`, _catalog: id, _index: i };
      for (const c of table.columns) row[c] = table.data[c][i];
      rows[i] = row;
    }
    return { columns, rows, refCols: [] };
  }
  return buildRawTable(table, id);
}

/**
 * handlers: onRowClick(fi, key), isHighlighted(fi, key), onClearSelection(), onClearHighlights()
 */
export function createTableView(el, handlers) {
  const tabsEl = el.querySelector(".table-tabs");
  const bodyEl = el.querySelector(".table-body");
  const toolsEl = el.querySelector(".table-head .table-toolbar"); // row count and exports, beside the tabs
  let mode = "", active = 0, computed = [], selection = null;
  let grid = null, ready = null, sig = "", current = null; // current: buildFormulaTable result
  const inputsShown = { x: false, y: false }; // "x inputs" / "y inputs" toggles, kept across rebuilds
  const ui = {};

  const destroyGrid = () => { grid?.destroy(); grid = null; ready = null; sig = ""; };

  // ------------------------------------------------------------ formula pair tabs
  function buildPairShell() {
    ui.count = h("span", { class: "table-count", "aria-live": "polite" });
    ui.selChip = h("span", { class: "chip-note", hidden: true });
    ui.hlChip = h("button", { class: "btn btn-quiet btn-sm", type: "button", hidden: true,
      onclick: () => handlers.onClearHighlights() }, "Clear highlights");
    ui.host = h("div", { class: "table-host" });
    ui.msg = h("p", { class: "table-msg", hidden: true });
    const inputToggle = (ax) => h("label", { class: "chip" },
      h("input", { type: "checkbox", checked: inputsShown[ax], onchange: (e) => setInputs(ax, e.target.checked) }),
      h("span", {}, `${ax} inputs`));
    toolsEl.hidden = false;
    toolsEl.replaceChildren(ui.selChip, ui.hlChip,
      h("div", { class: "chips", role: "group", "aria-label": "Input columns" }, inputToggle("x"), inputToggle("y")),
      ui.count, exportButtons(() => grid, () => [current.columns, current.refCols, fileName()]));
    bodyEl.replaceChildren(ui.msg, ui.host);
  }

  const fileName = () => {
    const p = computed[active].pair;
    return `flames_${slug(p.x)}_vs_${slug(p.y)}`;
  };

  function renderTabs() {
    tabsEl.hidden = false;
    tabsEl.replaceChildren(...computed.map((c, fi) => {
      const bad = !c.xAst || !c.yAst;
      return h("button", {
        class: "tab", role: "tab", type: "button", id: `tab-${fi}`, "aria-selected": String(fi === active),
        "aria-controls": "table-panel", tabindex: fi === active ? "0" : "-1", "data-invalid": bad ? "true" : null,
        title: bad ? "Formula has an error" : `${c.pair.y} vs ${c.pair.x}`,
        onclick: () => show(fi),
        onkeydown: (e) => {
          const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
          if (!d) return;
          const n = (fi + d + computed.length) % computed.length;
          show(n); tabsEl.children[n].focus();
        },
      }, h("span", { class: "tab-index" }, fi + 1), `${c.pair.y || "?"}  vs  ${c.pair.x || "?"}`);
    }));
    bodyEl.id = "table-panel";
    bodyEl.setAttribute("role", "tabpanel");
    bodyEl.setAttribute("aria-labelledby", `tab-${active}`);
  }

  function updateCount() {
    if (!grid) { ui.count.textContent = ""; return; }
    const shown = grid.getDataCount("active"), total = grid.getDataCount();
    ui.count.textContent = shown === total ? `${total} rows` : `${shown} of ${total} rows`;
  }

  function applySelection() {
    const sel = selection && selection.fi === active ? selection : null;
    ui.selChip.hidden = !sel;
    if (sel) {
      ui.selChip.replaceChildren(`${sel.keys.size} selected on plot`,
        h("button", { class: "link-btn", type: "button", onclick: () => handlers.onClearSelection() }, "Clear selection"));
    }
    ready?.then((t) => {
      if (sel) t.setFilter((d) => sel.keys.has(d._key));
      else t.clearFilter();
      updateCount();
    });
  }

  // the "x inputs" / "y inputs" toggles; hiding also drops the column's filter and sort, so none stays applied unseen
  function setInputs(ax, on) {
    inputsShown[ax] = on;
    if (!grid) return;
    const fields = current.columns.filter((c) => c.input === ax).map((c) => c.field);
    ready.then((t) => {
      for (const f of fields) {
        if (on) t.showColumn(f);
        else if (t.getColumn(f).isVisible()) { t.setHeaderFilterValue(f, ""); t.hideColumn(f); }
      }
      if (!on) t.setSort(t.getSorters().filter((s) => !fields.includes(s.field)).map((s) => ({ column: s.field, dir: s.dir })));
    });
  }

  function renderPairTable() {
    const c = computed[active];
    if (!c.xAst || !c.yAst) {
      destroyGrid();
      ui.msg.hidden = false;
      ui.msg.textContent = "Fix the formula in Options to see its table.";
      updateCount();
      return;
    }
    ui.msg.hidden = true;
    current = buildFormulaTable(c.parts, c.xAst, c.yAst);
    const nextSig = `${active}|${current.columns.map((col) => col.field).join(",")}`;
    if (grid && nextSig === sig) {
      ready.then((t) => t.replaceData(current.rows)).then(updateCount);
      return;
    }
    destroyGrid();
    sig = nextSig;
    ({ table: grid, ready } = makeTable(ui.host, current.columns, current.rows, {
      tips: { x: `x = ${c.pair.x}`, y: `y = ${c.pair.y}` },
      inputsShown,
      onRowClick: (row) => handlers.onRowClick(active, row.getData()._key),
      isHighlighted: (d) => handlers.isHighlighted(active, d._key),
    }));
    grid.on("dataFiltered", () => setTimeout(updateCount));
    applySelection();
  }

  function show(fi) {
    if (mode !== "pairs" || fi === active && grid) return;
    active = fi;
    renderTabs();
    destroyGrid();
    renderPairTable();
  }

  // ------------------------------------------------------------ raw catalogs
  function buildRawShell() {
    destroyGrid();
    tabsEl.hidden = true;
    toolsEl.hidden = true;
    toolsEl.replaceChildren();
    bodyEl.removeAttribute("role");
    const panels = Object.entries(CATALOGS).map(([id, cat]) => {
      let g = null, meta = null;
      const host = h("div", { class: "table-host table-host-raw" });
      const info = h("span", { class: "table-count" });
      const tools = h("div", { class: "table-toolbar", hidden: true }, info, h("span", { class: "spacer" }),
        exportButtons(() => g, () => [meta.columns, meta.refCols, `flames_${slug(cat.label)}_catalog`]));
      const panel = h("details", { class: "raw-panel" },
        h("summary", {}, h("span", { class: "raw-title" }, cat.title),
          h("span", { class: "raw-hint" }, id === "cloudy" ? "loaded on demand (~8 MB)" : "")),
        tools, host);
      panel.addEventListener("toggle", async () => {
        if (!panel.open) { g?.destroy(); g = null; tools.hidden = true; host.replaceChildren(); return; }
        host.replaceChildren(h("p", { class: "table-msg" }, `Loading ${cat.title.toLowerCase()}…`));
        const table = await cat.load();
        if (!panel.open) return;
        meta = rawTable(table, id);
        host.replaceChildren();
        ({ table: g } = makeTable(host, meta.columns, meta.rows, { wide: true }));
        g.on("dataFiltered", () => setTimeout(() => {
          info.textContent = `${g.getDataCount("active")} of ${table.nrows} rows · ${meta.columns.length} columns`;
        }));
        info.textContent = `${table.nrows} rows · ${meta.columns.length} columns`;
        tools.hidden = false;
        tools.querySelectorAll('[data-kind="bib"], [data-kind="tex"]').forEach((b) => { b.hidden = !meta.refCols.length; });
      });
      return panel;
    });
    bodyEl.replaceChildren(h("p", { class: "table-msg" }, "No formula pairs — browse the raw catalogs below."), ...panels);
  }

  // ------------------------------------------------------------ public API
  return {
    update(next) {
      computed = next;
      if (!computed.length) {
        if (mode !== "raw") { mode = "raw"; buildRawShell(); }
        return;
      }
      if (mode !== "pairs") { mode = "pairs"; buildPairShell(); }
      if (active >= computed.length) { active = computed.length - 1; destroyGrid(); }
      renderTabs();
      renderPairTable();
    },
    show,
    get active() { return active; },
    setSelection(sel) { selection = sel; if (mode === "pairs") applySelection(); },
    refreshHighlights(count) {
      if (mode !== "pairs") return;
      ui.hlChip.hidden = !count;
      ready?.then((t) => t.getRows("visible").forEach((r) => r.reformat()));
    },
  };
}
