// CSV, FITS (binary table) and BibTeX subset writers, plus a download helper.

export function download(data, filename, type = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// columns: [{field, title, kind: "num"|"text"|"ref"}], rows: objects
export function toCSV(columns, rows) {
  const q = (v) => {
    if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => q(c.title)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => q(r[c.field])).join(","));
  return lines.join("\n") + "\n";
}

// ------------------------------------------------------------ FITS
const card = (key, value, comment = "") => {
  let v;
  if (value === undefined) v = "";
  else if (typeof value === "string") v = `'${value.replace(/'/g, "''").padEnd(8)}'`.padEnd(20);
  else if (typeof value === "boolean") v = (value ? "T" : "F").padStart(20);
  else v = String(value).padStart(20);
  let s = value === undefined ? key.padEnd(8) : `${key.padEnd(8)}= ${v}`;
  if (comment) s += ` / ${comment}`;
  return s.slice(0, 80).padEnd(80);
};

function headerBytes(cards) {
  let s = cards.join("") + "END".padEnd(80);
  while (s.length % 2880) s += " ";
  return new TextEncoder().encode(s);
}

// FITS keyword-safe column name (TTYPE allows any text, but keep it ASCII)
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, "?");

/** Binary table: numeric columns as 64-bit floats (NaN for blanks), others as fixed strings. */
export function toFITS(columns, rows, extname = "FLAMES") {
  const cols = columns.map((c) => {
    if (c.kind === "num") return { ...c, form: "1D", width: 8 };
    let w = 1;
    for (const r of rows) {
      const v = r[c.field];
      if (v !== null && v !== undefined) w = Math.max(w, new TextEncoder().encode(String(v)).length);
    }
    return { ...c, form: `${w}A`, width: w };
  });
  const rowBytes = cols.reduce((a, c) => a + c.width, 0);
  const primary = headerBytes([
    card("SIMPLE", true, "conforms to FITS standard"), card("BITPIX", 8), card("NAXIS", 0),
    card("EXTEND", true),
  ]);
  const hcards = [
    card("XTENSION", "BINTABLE", "binary table extension"), card("BITPIX", 8), card("NAXIS", 2),
    card("NAXIS1", rowBytes, "bytes per row"), card("NAXIS2", rows.length, "number of rows"),
    card("PCOUNT", 0), card("GCOUNT", 1), card("TFIELDS", cols.length), card("EXTNAME", extname),
  ];
  cols.forEach((c, j) => {
    hcards.push(card(`TTYPE${j + 1}`, ascii(c.title)));
    hcards.push(card(`TFORM${j + 1}`, c.form));
  });
  const header = headerBytes(hcards);
  const dataLen = Math.ceil((rowBytes * rows.length) / 2880) * 2880;
  const buf = new Uint8Array(primary.length + header.length + dataLen);
  buf.set(primary, 0);
  buf.set(header, primary.length);
  const view = new DataView(buf.buffer, primary.length + header.length);
  const enc = new TextEncoder();
  let off = 0;
  for (const r of rows) {
    for (const c of cols) {
      const v = r[c.field];
      if (c.kind === "num") {
        view.setFloat64(off, typeof v === "number" ? v : NaN, false); // big-endian
      } else {
        const b = enc.encode(v === null || v === undefined ? "" : String(v));
        for (let k = 0; k < c.width; k++) view.setUint8(off + k, k < b.length ? b[k] : 0x20);
      }
      off += c.width;
    }
  }
  return buf;
}

// ------------------------------------------------------------ BibTeX
export function splitBib(text) {
  const entries = new Map();
  for (const chunk of text.split(/(?=^@\w+\s*\{)/m)) {
    const m = /^@\w+\s*\{\s*([^,\s]+)\s*,/.exec(chunk);
    if (m && !entries.has(m[1])) entries.set(m[1], chunk.trim());
  }
  return entries;
}

export function bibSubset(bibEntries, keys) {
  const out = [], missing = [];
  for (const k of [...keys].sort()) {
    if (bibEntries.has(k)) out.push(bibEntries.get(k));
    else missing.push(k);
  }
  return { text: out.join("\n\n") + (out.length ? "\n" : ""), missing };
}
