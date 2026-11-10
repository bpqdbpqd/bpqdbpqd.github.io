// Rows and columns of the per-formula table frame, and the bib keys behind them.
import { formulaColumns } from "./formula.js";

const num = (v) => (Number.isFinite(v) ? v : null);

/**
 * parts: [{ catalog, table, xr, yr }]  xr/yr: evaluate()/applyForceUL() results
 * xAst/yAst: parsed formulas
 * Returns { columns: [{field, title, kind}], rows: [{...}] } with one row per point
 * that has finite x and y. Every row carries _key = "catalog:index".
 */
export function buildFormulaTable(parts, xAst, yAst) {
  const xCols = [...formulaColumns(xAst)], yCols = [...formulaColumns(yAst)];
  const hasL = (cols) => parts.some((p) => cols.some((c) => (c + "_lerr") in p.table.data));
  const xL = hasL(xCols), yL = hasL(yCols);
  const refCols = [];
  for (const c of [...xCols, ...yCols]) {
    for (const p of parts) {
      const r = p.table.refs[c];
      if (r && !refCols.includes(r)) refCols.push(r);
    }
  }
  const columns = [
    { field: "Catalog", title: "Catalog", kind: "text" },
    { field: "Name", title: "Name", kind: "text" },
    { field: "Redshift", title: "Redshift", kind: "num" },
    { field: "Group", title: "Type", kind: "text" },
  ];
  for (const [ax, L] of [["x", xL], ["y", yL]]) {
    columns.push({ field: ax, title: ax, kind: "num" }, { field: `${ax}_err`, title: `${ax}_err`, kind: "num" });
    if (L) columns.push({ field: `${ax}_lerr`, title: `${ax}_lerr`, kind: "num" });
    columns.push({ field: `${ax}_flag`, title: `${ax}_flag`, kind: "text" });
  }
  for (const r of refCols) columns.push({ field: r, title: r, kind: "ref" });

  const rows = [];
  for (const p of parts) {
    const d = p.table.data;
    for (let i = 0; i < p.table.nrows; i++) {
      if (!Number.isFinite(p.xr.v[i]) || !Number.isFinite(p.yr.v[i])) continue;
      const row = {
        _key: `${p.catalog}:${i}`, _catalog: p.catalog, _index: i,
        Catalog: p.catalog === "low" ? "low-z" : "high-z",
        Name: d.Name[i], Redshift: num(d.Redshift[i]), Group: p.table.groups[i],
      };
      for (const [ax, r, L] of [["x", p.xr, xL], ["y", p.yr, yL]]) {
        row[ax] = num(r.v[i]);
        row[`${ax}_err`] = num(r.e[i]);
        if (L) row[`${ax}_lerr`] = num(r.l[i]);
        row[`${ax}_flag`] = r.f[i] || "";
      }
      for (const rc of refCols) row[rc] = rc in d ? d[rc][i] ?? "" : "";
      rows.push(row);
    }
  }
  return { columns, rows, refCols };
}

// raw catalog table: all columns
export function buildRawTable(table, catalog) {
  const columns = table.columns.map((c) => ({
    field: c, title: c, kind: table.numeric[c] ? "num" : c.endsWith("_ref") ? "ref" : "text",
  }));
  columns.splice(1, 0, { field: "Group", title: "Type (plot group)", kind: "text" });
  const rows = [];
  for (let i = 0; i < table.nrows; i++) {
    const row = { _key: `${catalog}:${i}`, _catalog: catalog, _index: i, Group: table.groups ? table.groups[i] : "" };
    for (const c of table.columns) row[c] = table.data[c][i];
    rows.push(row);
  }
  return { columns, rows, refCols: table.columns.filter((c) => c.endsWith("_ref")) };
}

// ref codes of the given rows -> bib keys (refcodes = data/refcodes.json)
export function bibKeysForRows(rows, refCols, refcodes) {
  const keys = new Set();
  for (const row of rows) {
    const map = refcodes[row._catalog] || {};
    for (const rc of refCols) {
      const v = row[rc];
      if (!v) continue;
      for (const code of String(v).split(",")) {
        const c = code.trim();
        for (const k of map[c] || []) keys.add(k);
      }
    }
  }
  return [...keys];
}
