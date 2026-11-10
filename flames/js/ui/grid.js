// Tabulator factory with the explorer's column conventions: ~4 significant figures on
// screen (exports read the raw row data), "like" text filters and numeric expression filters.
import { fmtNum } from "./dom.js";

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const RANGE = new RegExp(`^(${NUM})\\s*\\.\\.\\s*(${NUM})$`);
const COMPARE = new RegExp(`^(<=|>=|<|>|==|=|!=)\\s*(${NUM})$`);
const PLAIN = new RegExp(`^${NUM}$`);

/** ">1e9", "<=0.1", "1..10", "!=0", "3.2" (match to 4 significant figures); null if not valid */
export function parseNumFilter(text) {
  const t = text.trim();
  let m;
  if ((m = RANGE.exec(t))) {
    const [a, b] = [parseFloat(m[1]), parseFloat(m[2])].sort((p, q) => p - q);
    return (v) => v >= a && v <= b;
  }
  if ((m = COMPARE.exec(t))) {
    const n = parseFloat(m[2]);
    const ops = { "<": (v) => v < n, ">": (v) => v > n, "<=": (v) => v <= n, ">=": (v) => v >= n,
      "=": (v) => v === n, "==": (v) => v === n, "!=": (v) => v !== n };
    return ops[m[1]];
  }
  if (PLAIN.test(t)) {
    const n = parseFloat(t);
    return (v) => Number(v.toPrecision(4)) === Number(n.toPrecision(4));
  }
  return null;
}

const filterCache = new Map();
function numHeaderFilter(headerValue, rowValue) {
  if (!filterCache.has(headerValue)) filterCache.set(headerValue, parseNumFilter(headerValue));
  const test = filterCache.get(headerValue);
  if (!test) return true; // incomplete expression while typing: keep every row
  return typeof rowValue === "number" && Number.isFinite(rowValue) && test(rowValue);
}

// input columns stay folded until their "x inputs" / "y inputs" toggle is on
function columnDef(c, tips, inputsShown) {
  const def = { field: c.field, title: c.title, headerFilter: "input", headerTooltip: tips?.[c.field] || c.title,
    visible: !c.input || inputsShown[c.input] };
  if (c.kind === "num") {
    return { ...def, sorter: "number", hozAlign: "right", formatter: (cell) => fmtNum(cell.getValue()),
      headerFilterFunc: numHeaderFilter, headerFilterPlaceholder: ">1e9",
      headerTooltip: `${def.headerTooltip} — filter: >1e9, <=0.1, 1..10, !=0` };
  }
  return { ...def, headerFilterFunc: "like", headerFilterPlaceholder: "filter",
    maxWidth: c.kind === "ref" ? 260 : undefined, tooltip: c.kind === "ref" };
}

/**
 * columns: [{field, title, kind}] (table.js format); rows carry _key.
 * opts: { wide, tips: {field: tooltip}, inputsShown: {x, y}, onRowClick(row), isHighlighted(data) }
 * Returns { table, ready } — call table methods after `ready` resolves.
 */
export function makeTable(el, columns, rows, opts = {}) {
  // no fixed height: the table takes its natural height in the page, one page of rows at a time
  const mount = document.createElement("div");
  mount.className = "grid-mount";
  el.replaceChildren(mount);
  const table = new Tabulator(mount, {
    data: rows,
    index: "_key",
    pagination: true,
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 250],
    paginationCounter: "rows",
    layout: opts.wide ? "fitData" : "fitDataFill",
    renderHorizontal: opts.wide ? "virtual" : "basic",
    nestedFieldSeparator: false, // column names may contain dots
    movableColumns: true,
    columnDefaults: { resizable: true, minWidth: 56, headerSortTristate: true },
    placeholder: "No matching rows",
    columns: columns.map((c) => columnDef(c, opts.tips, opts.inputsShown)),
    rowFormatter: (row) => {
      row.getElement().classList.toggle("is-highlighted", !!opts.isHighlighted?.(row.getData()));
    },
  });
  const ready = new Promise((resolve) => table.on("tableBuilt", () => resolve(table)));
  if (opts.onRowClick) table.on("rowClick", (e, row) => opts.onRowClick(row));
  return { table, ready };
}

// shown columns in the on-screen order (columns can be dragged), for exports
export function visibleColumns(table, columns) {
  const byField = new Map(columns.map((c) => [c.field, c]));
  return table.getColumns().filter((c) => c.isVisible()).map((c) => byField.get(c.getField())).filter(Boolean);
}
