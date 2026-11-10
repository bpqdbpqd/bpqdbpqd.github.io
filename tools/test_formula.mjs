// Evaluate test formulas with flames/js/formula.js and print JSON for comparison.
// Usage: node tools/test_formula.mjs > out.json
import { readFileSync } from "node:fs";
import { parseFormula, evaluate, applyForceUL, formulaLabel } from "../flames/js/formula.js";

const root = new URL("..", import.meta.url).pathname;
const FORMULAS = [
  "L_CII",
  "L_CII / L_IR",
  "L_OIII88 + L_CII",
  "L_OIII88 / (L_CII + L_NII122)",
  "L_CII^2",
  "L_CII * L_OIII88 / L_IR",
  "L_IR - L_FIR",
];
const out = {};
for (const cat of ["low", "high"]) {
  const tb = JSON.parse(readFileSync(`${root}flames/data/flames-${cat}.json`, "utf8"));
  out[cat] = {};
  for (const fml of FORMULAS) {
    const ast = parseFormula(fml);
    const r = evaluate(ast, tb);
    const fu = applyForceUL(r, 1);
    const arr = (a) => Array.from(a, (x) => (Number.isFinite(x) ? x : null));
    out[cat][fml] = { label: formulaLabel(ast), v: arr(r.v), e: arr(r.e), l: arr(r.l), f: r.f,
      fu_v: arr(fu.v), fu_f: fu.f, missing: r.missing };
  }
}
process.stdout.write(JSON.stringify(out));
