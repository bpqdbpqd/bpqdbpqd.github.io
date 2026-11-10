// Evaluate one formula pair on every enabled catalog: parse errors, missing columns,
// forced upper limits, the plot series and per-catalog point counts.
import { parseFormula, formulaLabel, evaluate, applyForceUL, conditionForPlot } from "./formula.js";
import { PLOT_CATALOGS } from "./config.js";

export function computePair(pair, fi, tables, { forceUL, snr }) {
  const out = { fi, pair, errors: {}, missing: {}, counts: {}, parts: [], series: [], xAst: null, yAst: null };
  for (const ax of ["x", "y"]) {
    try { out[`${ax}Ast`] = parseFormula(pair[ax]); }
    catch (e) { out.errors[ax] = e.message; }
  }
  if (!out.xAst || !out.yAst) return out;
  out.xlabel = formulaLabel(out.xAst);
  out.ylabel = formulaLabel(out.yAst);
  const flabel = `${out.ylabel} vs ${out.xlabel}`;
  for (const catalog of PLOT_CATALOGS) {
    if (!pair.cats[catalog]) continue;
    const table = tables[catalog];
    let xr = evaluate(out.xAst, table), yr = evaluate(out.yAst, table);
    const miss = [...new Set([...xr.missing, ...yr.missing])];
    if (miss.length) out.missing[catalog] = miss;
    if (forceUL.x) xr = applyForceUL(xr, snr);
    if (forceUL.y) yr = applyForceUL(yr, snr);
    out.parts.push({ catalog, table, xr, yr });
    const x = conditionForPlot(xr), y = conditionForPlot(yr);
    out.counts[catalog] = x.use.reduce((n, u, i) => n + (u && y.use[i] ? 1 : 0), 0);
    out.series.push({ fi, flabel, catalog, names: table.data.Name, groups: table.groups, x, y });
  }
  return out;
}

export const isPlottable = (c) => c.pair.on && c.xAst && c.yAst;
