// matplotlib-style mathtext for labels: $...$ becomes Plotly pseudo-HTML (<sub>, <sup>,
// <i>, <b>), the way matplotlib renders TeX math. Text outside $...$ passes through
// unchanged, because labels may already hold Plotly markup (e.g. "high-<i>z</i>"); an
// unmatched $ leaves the rest literal. Subset: _ and ^ scripts (nesting ok), {...}
// grouping, \rm \mathrm \text \it \mathit \bf \mathbf font switches, Greek and common
// symbols as Unicode (lowercase Greek italic, like matplotlib), upright function names,
// \, \; \quad \! \ spacing and \$ for a literal dollar.

const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο",
  pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ",
  omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ",
  Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};

const SYMBOLS = {
  odot: "⊙", times: "×", pm: "±", mp: "∓", sim: "∼", approx: "≈",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", propto: "∝", cdot: "·",
  infty: "∞", prime: "′", AA: "Å", circ: "∘", degree: "°", rightarrow: "→",
};

const FUNCS = { log: 1, ln: 1, exp: 1, sin: 1, cos: 1, tan: 1 }; // upright

const SPACES = { ",": "\u2009", ";": "\u2005", "!": "", " ": " ", quad: "\u2003" };

// font switches: \rm{..} and \mathrm{..} take the {...} argument, {\rm ..} and a plain
// \rm apply to the rest of the enclosing group
const FONTS = {
  rm: { rm: 1, it: 0 }, mathrm: { rm: 1, it: 0 }, text: { rm: 1, it: 0 }, textrm: { rm: 1, it: 0 },
  it: { it: 1, rm: 0 }, mathit: { it: 1, rm: 0 },
  bf: { bf: 1 }, mathbf: { bf: 1 },
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// one styled run: t text, sub/sup script depth, i italic, b bold.
// kind "letter" (Latin letters, lowercase Greek) is italic unless \rm/\mathbf; "up" never is.
function push(segs, t, m, sub, sup, kind) {
  const i = kind === "letter" && (m.it || (!m.rm && !m.bf)) ? 1 : 0;
  segs.push({ t, sub, sup, i, b: m.bf ? 1 : 0 });
}

function braceEnd(s, i) {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === "{") d++;
    else if (s[k] === "}" && --d === 0) return k;
  }
  return s.length; // unmatched { runs to the end
}

function mathSegs(src, m, segs, sub, sup) {
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "{") { // grouping: font switches inside stay inside
      const end = braceEnd(src, i);
      mathSegs(src.slice(i + 1, end), { ...m }, segs, sub, sup);
      i = end + 1;
    } else if (c === "}") {
      i++; // stray
    } else if (c === "_" || c === "^") { // script: {...}, \command or one character
      const down = c === "_";
      i++;
      while (src[i] === " ") i++;
      let arg;
      if (src[i] === "{") {
        const end = braceEnd(src, i);
        arg = src.slice(i + 1, end);
        i = end + 1;
      } else if (src[i] === "\\") {
        let j = i + 1;
        if (/[a-zA-Z]/.test(src[j] || "")) while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
        else j = Math.min(j + 1, src.length);
        arg = src.slice(i, j);
        i = j;
      } else {
        arg = src[i] || "";
        i++;
      }
      mathSegs(arg, { ...m }, segs, down ? sub + 1 : sub, down ? sup : sup + 1);
    } else if (c === "\\") {
      let j = i + 1;
      const word = /[a-zA-Z]/.test(src[j] || "");
      if (word) while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
      else j = Math.min(j + 1, src.length);
      const name = src.slice(i + 1, j);
      i = j;
      if (word && src[i] === " ") i++; // TeX drops the space ending a control word
      if (name === "$") segs.push({ t: "$", sub, sup, i: 0, b: 0 });
      else if (name in SPACES) push(segs, SPACES[name], m, sub, sup, "up");
      else if (name in GREEK) push(segs, GREEK[name], m, sub, sup, /^[a-z]/.test(name) ? "letter" : "up");
      else if (name in SYMBOLS) push(segs, SYMBOLS[name], m, sub, sup, "up");
      else if (name in FUNCS) push(segs, name, m, sub, sup, "up");
      else if (name in FONTS) {
        if (src[i] === "{") {
          const end = braceEnd(src, i);
          mathSegs(src.slice(i + 1, end), { ...m, ...FONTS[name] }, segs, sub, sup);
          i = end + 1;
        } else Object.assign(m, FONTS[name]); // to the end of the enclosing group
      } else push(segs, name, m, sub, sup, "up"); // unknown: the name without the backslash
    } else {
      push(segs, c, m, sub, sup, /[A-Za-z]/.test(c) ? "letter" : "up");
      i++;
    }
  }
  return segs;
}

// runs render through a stack of open tags, so a deeper script nests inside its parent
// (x_{a_i} -> <sub>a<sub>i</sub></sub>) instead of becoming a sibling
function toHTML(segs) {
  let out = "";
  const stack = [];
  const closeTo = (want) => {
    let n = 0;
    while (n < stack.length && n < want.length && stack[n] === want[n]) n++;
    while (stack.length > n) out += `</${stack.pop()}>`;
    while (stack.length < want.length) { const t = want[stack.length]; out += `<${t}>`; stack.push(t); }
  };
  for (const s of segs) {
    closeTo([...Array(s.sub).fill("sub"), ...Array(s.sup).fill("sup"), ...(s.b ? ["b"] : []), ...(s.i ? ["i"] : [])]);
    out += esc(s.t);
  }
  closeTo([]);
  return out;
}

/** Convert $...$ mathtext in s to Plotly pseudo-HTML; s without $ is returned unchanged. */
export function mathtext(s) {
  const str = String(s ?? "");
  const lit = (t) => t.replace(/\\\$/g, "$");
  if (!str.includes("$")) return lit(str);
  const dollar = (from) => { // next $ that is not escaped as \$
    for (let i = from; i < str.length; i++) {
      if (str[i] === "\\") i++;
      else if (str[i] === "$") return i;
    }
    return -1;
  };
  let out = "", i = 0;
  while (i < str.length) {
    const d = dollar(i);
    if (d < 0) { out += lit(str.slice(i)); break; }
    out += lit(str.slice(i, d));
    const e = dollar(d + 1);
    if (e < 0) { out += lit(str.slice(d)); break; } // unmatched $: the rest stays literal
    out += toHTML(mathSegs(str.slice(d + 1, e), { rm: 0, it: 0, bf: 0 }, [], 0, 0));
    i = e + 1;
  }
  return out;
}
