// Formula engine for the FLAMES explorer.
//
// Mirrors the arith helpers of Paper_I_plots.ipynb (stack_arith*, get_arith_all,
// corr_limit, force_upperlimit, condition_data):
//   - a column X brings X, X_err, X_lerr (falls back to X_err) and X_flag
//   - flags: "<" upper limit, ">" lower limit; as in corr_limit, a limit result is
//     placed at value + 3 err (upper) or value - 3 lerr (lower) and carries no error
//   - + and - add errors in quadrature; *, / and powers add relative errors in
//     quadrature; upper/lower errors swap where the result decreases with an operand
//     (the notebook does not swap for subtraction; this does)
//   - a missing error counts as 0 when another operand has an error, and stays
//     missing (NaN) when no operand has one (constants carry no error; the notebook
//     gives 0 in that case)
//   - limits propagate through monotonic operations (division or a negative factor
//     flips them); a value bounded both ways ("<" and ">") is dropped
//
// Grammar: expr := term (("+"|"-") term)* ; term := unary (("*"|"/") unary)* ;
// unary := "-" unary | power ; power := primary (("^"|"**") unary)? ;
// primary := number | column | "(" expr ")" | func "(" expr ")"
// Functions: log10, ln, exp, sqrt, abs. Column names may be wrapped in backticks.

export const FUNCS = ["log10", "ln", "exp", "sqrt", "abs"];

// ---------------------------------------------------------------- parser

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "`") {
      const j = src.indexOf("`", i + 1);
      if (j < 0) throw new SyntaxError(`unclosed backtick at ${i + 1}`);
      toks.push({ t: "id", v: src.slice(i + 1, j), p: i });
      i = j + 1; continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { toks.push({ t: "num", v: parseFloat(num[0]), p: i }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { toks.push({ t: "id", v: id[0], p: i }); i += id[0].length; continue; }
    if (src.startsWith("**", i)) { toks.push({ t: "op", v: "^", p: i }); i += 2; continue; }
    if ("+-*/^()×÷".includes(c)) {
      toks.push({ t: "op", v: c === "×" ? "*" : c === "÷" ? "/" : c, p: i }); i++; continue;
    }
    throw new SyntaxError(`unexpected "${c}" at ${i + 1}`);
  }
  return toks;
}

export function parseFormula(src) {
  const toks = tokenize(src);
  let k = 0;
  const peek = () => toks[k];
  const isOp = (v) => peek() && peek().t === "op" && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new SyntaxError(`expected "${v}"${peek() ? ` at ${peek().p + 1}` : " at end"}`);
    k++;
  };
  function expr() {
    let node = term();
    while (isOp("+") || isOp("-")) {
      const op = toks[k++].v;
      node = { type: "bin", op, a: node, b: term() };
    }
    return node;
  }
  function term() {
    let node = unary();
    while (isOp("*") || isOp("/")) {
      const op = toks[k++].v;
      node = { type: "bin", op, a: node, b: unary() };
    }
    return node;
  }
  function unary() {
    if (isOp("-")) { k++; return { type: "neg", a: unary() }; }
    if (isOp("+")) { k++; return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (isOp("^")) { k++; return { type: "bin", op: "^", a: base, b: unary() }; }
    return base;
  }
  function primary() {
    const tk = peek();
    if (!tk) throw new SyntaxError("unexpected end of formula");
    if (tk.t === "num") { k++; return { type: "num", v: tk.v }; }
    if (tk.t === "id") {
      k++;
      if (FUNCS.includes(tk.v) && isOp("(")) {
        k++; const a = expr(); expect(")");
        return { type: "fn", fn: tk.v, a };
      }
      return { type: "col", name: tk.v };
    }
    if (isOp("(")) { k++; const a = expr(); expect(")"); return { type: "group", a }; }
    throw new SyntaxError(`unexpected "${tk.v}" at ${tk.p + 1}`);
  }
  if (!toks.length) throw new SyntaxError("empty formula");
  const ast = expr();
  if (k < toks.length) throw new SyntaxError(`unexpected "${toks[k].v}" at ${toks[k].p + 1}`);
  return ast;
}

export function formulaColumns(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.type === "col") out.add(ast.name);
  for (const key of ["a", "b"]) if (ast[key]) formulaColumns(ast[key], out);
  return out;
}

const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
export function formulaLabel(ast) {
  function lab(n, parentPrec = 0, right = false) {
    switch (n.type) {
      case "num": return String(n.v);
      case "col": return n.name;
      case "group": return lab(n.a, parentPrec, right);
      case "neg": return "-" + lab(n.a, 3);
      case "fn": return `${n.fn}(${lab(n.a)})`;
      case "bin": {
        const p = PREC[n.op];
        const s = `${lab(n.a, p)} ${n.op === "*" ? "×" : n.op} ${lab(n.b, p, true)}`.replace(/ \^ /, "^");
        const need = p < parentPrec || (right && p === parentPrec && (n.op === "-" || n.op === "/"));
        return need ? `(${s})` : s;
      }
    }
    return "";
  }
  return lab(ast);
}

// ---------------------------------------------------------------- evaluation

const sq = (x) => x * x;

// combine error contributions in quadrature; NaN contributions count as 0 unless all are NaN
function quad(parts) {
  let s = 0, any = false;
  for (const p of parts) if (Number.isFinite(p)) { s += p * p; any = true; }
  return any ? Math.sqrt(s) : NaN;
}

// merge limit flags of operands (each already oriented to the result)
function mergeFlags(fs) {
  let up = false, lo = false;
  for (const f of fs) { if (f.includes("<")) up = true; if (f.includes(">")) lo = true; }
  return up && lo ? "<>" : up ? "<" : lo ? ">" : "";
}
const flipFlag = (f) => f.replace(/[<>]/g, (m) => (m === "<" ? ">" : "<"));

function constant(n, v) {
  return { v: new Float64Array(n).fill(v), e: new Float64Array(n), l: new Float64Array(n),
    f: new Array(n).fill(""), constant: true };
}

function getCol(table, name) {
  const d = table.data;
  if (!(name in d)) return null;
  return d[name];
}

function loadColumn(table, name, n) {
  const vals = getCol(table, name);
  const v = new Float64Array(n), e = new Float64Array(n), l = new Float64Array(n);
  const f = new Array(n).fill("");
  const err = getCol(table, name + "_err");
  const lerr = getCol(table, name + "_lerr");
  const flag = getCol(table, name + "_flag");
  for (let i = 0; i < n; i++) {
    const x = vals[i];
    v[i] = typeof x === "number" ? x : NaN;
    let eu = err && typeof err[i] === "number" ? err[i] : NaN;
    let el = lerr && typeof lerr[i] === "number" ? lerr[i] : eu;
    if (!Number.isFinite(eu) && Number.isFinite(el)) eu = el;
    const fl = flag && flag[i] ? String(flag[i]) : "";
    if (fl.includes("<") && fl.includes(">")) v[i] = NaN;
    e[i] = eu; l[i] = el; f[i] = fl.includes("<") ? "<" : fl.includes(">") ? ">" : "";
  }
  return { v, e, l, f };
}

// apply y = g(x) elementwise with exact asymmetric errors for a monotonic g
function monotonic(x, g, increasing) {
  const n = x.v.length;
  const out = { v: new Float64Array(n), e: new Float64Array(n), l: new Float64Array(n), f: new Array(n) };
  for (let i = 0; i < n; i++) {
    const y = g(x.v[i]);
    out.v[i] = y;
    const hi = Number.isFinite(x.e[i]) ? g(x.v[i] + x.e[i]) - y : NaN;
    const lo = Number.isFinite(x.l[i]) ? y - g(x.v[i] - x.l[i]) : NaN;
    // y(x - lerr) may leave the domain (log of a negative): fall back to the slope
    const loSafe = Number.isFinite(lo) ? lo : Number.isFinite(x.l[i]) ? Math.abs(hi / (x.e[i] || 1)) * x.l[i] : NaN;
    if (increasing) { out.e[i] = Math.abs(hi); out.l[i] = Math.abs(loSafe); out.f[i] = x.f[i]; }
    else { out.e[i] = Math.abs(loSafe); out.l[i] = Math.abs(hi); out.f[i] = flipFlag(x.f[i]); }
  }
  out.constant = x.constant;
  return out;
}

function binary(op, a, b) {
  const n = a.v.length;
  const out = { v: new Float64Array(n), e: new Float64Array(n), l: new Float64Array(n), f: new Array(n),
    constant: a.constant && b.constant };
  for (let i = 0; i < n; i++) {
    const x = a.v[i], y = b.v[i];
    let r, da, db; // partial derivatives dr/dx, dr/dy
    switch (op) {
      case "+": r = x + y; da = 1; db = 1; break;
      case "-": r = x - y; da = 1; db = -1; break;
      case "*": r = x * y; da = y; db = x; break;
      case "/": r = x / y; da = 1 / y; db = -x / (y * y); break;
      case "^":
        r = Math.pow(x, y);
        da = a.constant ? 0 : y * Math.pow(x, y - 1);
        db = b.constant ? 0 : r * Math.log(Math.abs(x));
        break;
    }
    out.v[i] = r;
    // an operand going up by its upper error moves r by d*err (up if d > 0);
    // constants carry no error and no flag, so they do not enter the sums
    const up = [], dn = [], fl = [];
    for (const [d, s] of [[da, a], [db, b]]) {
      if (s.constant || d === 0 || !Number.isFinite(d)) continue;
      const eu = s.e[i], el = s.l[i];
      if (d > 0) { up.push(d * eu); dn.push(d * el); fl.push(s.f[i]); }
      else { up.push(-d * el); dn.push(-d * eu); fl.push(flipFlag(s.f[i])); }
    }
    out.e[i] = quad(up); out.l[i] = quad(dn);
    const f = mergeFlags(fl);
    if (f === "<>") { out.v[i] = NaN; out.f[i] = ""; } else out.f[i] = f;
  }
  return out;
}

export function evaluate(ast, table) {
  const n = table.nrows;
  const missing = new Set();
  const cache = new Map();
  function ev(node) {
    switch (node.type) {
      case "num": return constant(n, node.v);
      case "group": return ev(node.a);
      case "col": {
        if (!(node.name in table.data) || table.numeric && table.numeric[node.name] === false) {
          missing.add(node.name);
          return constant(n, NaN);
        }
        if (!cache.has(node.name)) cache.set(node.name, loadColumn(table, node.name, n));
        return cache.get(node.name);
      }
      case "neg": return binary("*", constant(n, -1), ev(node.a));
      case "fn": {
        const a = ev(node.a);
        switch (node.fn) {
          case "log10": return monotonic(a, Math.log10, true);
          case "ln": return monotonic(a, Math.log, true);
          case "exp": return monotonic(a, Math.exp, true);
          case "sqrt": return monotonic(a, Math.sqrt, true);
          case "abs": {
            const out = monotonic(a, Math.abs, true);
            for (let i = 0; i < n; i++) if (a.v[i] < 0) {
              [out.e[i], out.l[i]] = [a.l[i], a.e[i]]; out.f[i] = flipFlag(a.f[i]);
            }
            return out;
          }
        }
        throw new Error(`unknown function ${node.fn}`);
      }
      case "bin": return binary(node.op, ev(node.a), ev(node.b));
    }
    throw new Error("bad formula node");
  }
  const res = ev(ast);
  const v = Float64Array.from(res.v), e = Float64Array.from(res.e), l = Float64Array.from(res.l);
  // corr_limit on the result: a limit sits at value + 3 err (upper) or value - 3 lerr
  // (lower) and carries no error
  for (let i = 0; i < n; i++) {
    if (res.f[i] === "<") { v[i] += Number.isFinite(e[i]) ? 3 * e[i] : 0; e[i] = 0; l[i] = 0; }
    else if (res.f[i] === ">") { v[i] -= Number.isFinite(l[i]) ? 3 * l[i] : 0; e[i] = 0; l[i] = 0; }
  }
  return { v, e, l, f: res.f.slice(), missing: [...missing] };
}

// force_upperlimit: rows without a flag whose value is within snr x lower error
// become upper limits at value + 3 err
export function applyForceUL(res, snr = 1) {
  const n = res.v.length;
  const out = { v: Float64Array.from(res.v), e: Float64Array.from(res.e), l: Float64Array.from(res.l),
    f: res.f.slice(), missing: res.missing, forced: new Array(n).fill(false) };
  for (let i = 0; i < n; i++) {
    if (out.f[i] === "" && Number.isFinite(out.v[i]) && Number.isFinite(out.l[i]) &&
        out.v[i] <= snr * out.l[i]) {
      out.v[i] += 3 * (Number.isFinite(out.e[i]) ? out.e[i] : out.l[i]);
      out.e[i] = 0; out.l[i] = 0; out.f[i] = "<"; out.forced[i] = true;
    }
  }
  return out;
}

// condition_data: arrays ready for plotting. Limit rows get an arrow of length |v|/3
// toward the allowed side; missing errors become 0.
export function conditionForPlot(res) {
  const n = res.v.length;
  const v = new Float64Array(n), ep = new Float64Array(n), em = new Float64Array(n);
  const use = new Array(n), upl = new Array(n), lol = new Array(n);
  for (let i = 0; i < n; i++) {
    upl[i] = res.f[i] === "<"; lol[i] = res.f[i] === ">";
    use[i] = Number.isFinite(res.v[i]);
    v[i] = use[i] ? res.v[i] : NaN;
    ep[i] = Number.isFinite(res.e[i]) ? res.e[i] : 0;
    em[i] = Number.isFinite(res.l[i]) ? res.l[i] : ep[i];
    if (upl[i]) { em[i] = Math.abs(v[i]) / 3; ep[i] = 0; }
    if (lol[i]) { ep[i] = Math.abs(v[i]) / 3; em[i] = 0; }
  }
  return { v, ep, em, use, upl, lol };
}

// does the table have a separate lower-error column for any column in the formula?
export function hasLowerErr(ast, table) {
  return [...formulaColumns(ast)].some((c) => (c + "_lerr") in table.data);
}
