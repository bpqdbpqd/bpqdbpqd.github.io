// Build a formula table and write CSV / FITS / BibTeX subset to an output folder.
// Usage: node tools/test_exports.mjs OUTDIR
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseFormula, evaluate, applyForceUL } from "../flames/js/formula.js";
import { buildFormulaTable, bibKeysForRows } from "../flames/js/table.js";
import { toCSV, toFITS, splitBib, bibSubset } from "../flames/js/exporters.js";

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const root = new URL("..", import.meta.url).pathname;
const load = (c) => JSON.parse(readFileSync(`${root}flames/data/flames-${c}.json`, "utf8"));
const refcodes = JSON.parse(readFileSync(`${root}flames/data/refcodes.json`, "utf8"));
const bib = splitBib(readFileSync(`${root}flames/data/flames.bib`, "utf8"));

const xAst = parseFormula("L_IR"), yAst = parseFormula("L_CII / L_IR");
const parts = ["low", "high"].map((catalog) => {
  const table = load(catalog);
  return { catalog, table, xr: applyForceUL(evaluate(xAst, table)), yr: applyForceUL(evaluate(yAst, table)) };
});
const { columns, rows, refCols } = buildFormulaTable(parts, xAst, yAst);
writeFileSync(`${out}/t.csv`, toCSV(columns, rows));
writeFileSync(`${out}/t.fits`, toFITS(columns, rows));
const keys = bibKeysForRows(rows, refCols, refcodes);
const { text, missing } = bibSubset(bib, keys);
writeFileSync(`${out}/t.bib`, text);
console.log(JSON.stringify({ nrows: rows.length, columns: columns.map((c) => c.field), refCols,
  nkeys: keys.length, missing, firstRow: rows[0] }));
