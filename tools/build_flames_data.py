"""Build the web data files for the FLAMES explorer.

Reads the released FLAMES tables from ``catalogs/`` (copies of FS_Line/results/FLAMES):

- ``flames-{low,high}_v{version}.ecsv`` and ``flames-{low,high}_v{version}.bib``
  (the highest version present), or the unversioned ``flames-{low,high}.ecsv/.bib``
- ``low-z_cite_dict.json``

and writes, under ``flames/data/``:

- ``flames-low.json`` / ``flames-high.json``: columnar tables plus metadata
  (column list, per-column ref column, plotting group of each row)
- ``flames.bib``: union of the low-z and high-z bib files
- ``refcodes.json``: ref code -> list of bib keys, per catalog
- ``meta.json``: table version, row counts and redshift ranges, FLAMES paper links
- ``flames-cloudy.json.gz``: the Cloudy grid

Usage::

    python tools/build_flames_data.py [--src catalogs] [--version 0.3]
"""

import argparse
import gzip
import json
import math
import re
from pathlib import Path

import numpy as np
import pandas as pd
from astropy.table import Table

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "flames" / "data"
DEFAULT_SRC = ROOT / "catalogs"
DEFAULT_CLOUDY = Path("~/workspace/results/pycloudy/flames-cloudy.csv").expanduser()

PAPERS = [
    {"label": "I", "url": "https://scixplorer.org/abs/2025arXiv250710702P/abstract"},
    {"label": "II", "url": "https://scixplorer.org/abs/2025arXiv250711829P/abstract"},
    {"label": "III", "url": "https://scixplorer.org/abs/2025arXiv250712896P/abstract"},
]


def _vkey(v):
    return tuple(int(p) if p.isdigit() else p for p in re.split(r"[.\-]", v))


def find_release(src, version=None):
    """(version or None, {low: ecsv, high: ecsv}, {low: bib, high: bib}).

    The highest version with both versioned tables wins; without any, the unversioned files.
    """
    if version is None:
        found = set()
        for p in src.glob("flames-*_v*.ecsv"):
            m = re.match(r"flames-(low|high)_v(.+)\.ecsv$", p.name)
            if m:
                found.add(m.group(2))
        full = [v for v in found if all((src / f"flames-{c}_v{v}.ecsv").exists() for c in ("low", "high"))]
        version = max(full, key=_vkey) if full else None
    tag = f"_v{version}" if version and (src / f"flames-low_v{version}.ecsv").exists() else ""
    ecsv = {c: src / f"flames-{c}{tag}.ecsv" for c in ("low", "high")}
    bib = {c: src / f"flames-{c}{tag}.bib" for c in ("low", "high")}
    for c in ("low", "high"):  # a release may ship one bib per version or keep the old one
        if not bib[c].exists():
            bib[c] = src / f"flames-{c}.bib"
    return version, ecsv, bib


def read_ecsv(path):
    """ECSV -> DataFrame; masked values become NaN / None."""
    tb = Table.read(path, format="ascii.ecsv")
    cols = {}
    for name in tb.colnames:
        col = tb[name]
        mask = np.asarray(getattr(col, "mask", np.zeros(len(col), bool)))
        if col.dtype.kind in "fiub":
            v = np.asarray(col, dtype=float)
            v = np.where(mask, np.nan, v)
        else:
            v = [None if m or str(x) == "" else str(x) for x, m in zip(np.asarray(col), mask)]
        cols[name] = v
    return pd.DataFrame(cols)

SUFFIXES = ("_err", "_lerr", "_flag", "_ref")

# columns whose ref column does not follow the {col}_ref / {line}_ref pattern
HIGH_REF_MAP = {
    "mu": "Lens_ref",
    "L_IR": "IR_ref", "L_FIR": "IR_ref", "M_dust": "IR_ref", "T_dust": "IR_ref",
    "M_FUV": "UV_ref", "L_FUV": "UV_ref", "beta_UV": "UV_ref", "IRX": "UV_ref",
    "lg_M_star_SED": "UV_ref", "SFR_SED": "UV_ref",
    "lg_O_H": "Metallicity_ref", "lg_N_O": "Metallicity_ref",
    "Av": "Extinction_ref", "E_B_V": "Extinction_ref",
}
HIGH_OPTICAL = re.compile(r"^(f|L)_(Halpha|OIII5007|NII6584)(_corr)?$")
LOW_OPTICAL_EXT = {"Av": "Halpha_ref", "E_B_V": "Halpha_ref"}


def low_group(tp):
    """Plot group of a low-z row; same priority as Paper_I_plots.ipynb."""
    group = "SF"
    for key, name in (("U/LIRG", "U/LIRG"), ("ETG", "ETG"), ("AGN", "AGN"),
                      ("LINER", "LINER"), ("Dwarf", "Dwarf"), ("Region", "Region")):
        if key in tp:
            group = name
    return group


def high_group(tp):
    """Plot group of a high-z row; same priority as Paper_I_plots.ipynb."""
    smg = "SMG" in tp or "DSFG" in tp
    group = None
    if smg:
        group = "high-z DSFG"
    if "LBG" in tp or "LAE" in tp:
        group = "high-z LBG/LAE"
    if "QSO" in tp or "AGN" in tp:
        group = "high-z QSO/AGN"
    if "SF" in tp and "DSFG" not in tp:
        group = "high-z SF"
    if "ETG" in tp:
        group = "high-z ETG"
    if "DLA" in tp:
        group = "high-z DLA host"
    if "cluster" in tp:
        group = "proto-cluster"
    return group or "high-z SF"


def ref_column(col, cols, catalog):
    if catalog == "high":
        if col in HIGH_REF_MAP:
            return HIGH_REF_MAP[col]
        if HIGH_OPTICAL.match(col):
            return "Optical_ref"
        m = re.match(r"^vLv_(\d+)$", col)
        if m:
            return f"S{m.group(1)}_ref"
        m = re.match(r"^(CII|OIII88)_(width|redshift)$", col)
        if m:
            return f"{m.group(1)}_ref"
    elif col in LOW_OPTICAL_EXT:
        return LOW_OPTICAL_EXT[col]
    base = re.sub(r"_(corr|EW)$", "", col)
    for cand in (f"{col}_ref", f"{base}_ref", re.sub(r"^(F|L|S|f)_", "", base) + "_ref"):
        if cand in cols:
            return cand
    return None


def clean(v):
    if v is None:
        return None
    if isinstance(v, float):
        if math.isnan(v):
            return None
        return float(f"{v:.6g}")
    return v


def build_catalog(path, catalog):
    df = read_ecsv(path)
    cols = list(df.columns)
    data = {}
    numeric = {}
    for c in cols:
        s = df[c]
        if pd.api.types.is_numeric_dtype(s):
            numeric[c] = True
            data[c] = [clean(float(v)) for v in s]
        else:
            numeric[c] = False
            data[c] = [None if pd.isna(v) else str(v) for v in s]
    groups = [(low_group if catalog == "low" else high_group)(str(t) if not pd.isna(t) else "")
              for t in df["Type"]]
    refs = {}
    for c in cols:
        if c.endswith(SUFFIXES) or not numeric[c]:
            continue
        r = ref_column(c, cols, catalog)
        if r:
            refs[c] = r
    return {
        "catalog": catalog,
        "nrows": len(df),
        "columns": cols,
        "numeric": numeric,
        "refs": refs,
        "groups": groups,
        "data": data,
    }


def build_cloudy(path):
    """Cloudy grid (FLAMES II) as a gzipped columnar JSON; loaded on demand by the page."""
    df = pd.read_csv(path, low_memory=False)
    data, numeric = {}, {}
    for c in df.columns:
        s = df[c]
        numeric[c] = bool(pd.api.types.is_numeric_dtype(s))
        data[c] = [clean(float(v)) for v in s] if numeric[c] else [None if pd.isna(v) else str(v) for v in s]
    return {"catalog": "cloudy", "nrows": len(df), "columns": list(df.columns), "numeric": numeric,
            "refs": {}, "groups": None, "data": data}


def bib_keys(text):
    return re.findall(r"^@\w+\{\s*([^,\s]+)\s*,", text, re.M)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    ap.add_argument("--cloudy", type=Path, default=DEFAULT_CLOUDY)
    ap.add_argument("--version", default=None,
                    help="table version; default: the highest flames-*_v{version}.ecsv in --src")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    version, ecsv, bibs = find_release(args.src, args.version)
    print(f"table version: {version or 'unversioned'};", ", ".join(p.name for p in [*ecsv.values(), *bibs.values()]))
    tables = {}
    meta = {"version": version, "catalogs": {}, "papers": PAPERS}
    for catalog in ("low", "high"):
        tb = build_catalog(ecsv[catalog], catalog)
        tables[catalog] = tb
        with open(OUT / f"flames-{catalog}.json", "w") as f:
            json.dump(tb, f, separators=(",", ":"), allow_nan=False)
        z = [v for v in tb["data"]["Redshift"] if v is not None]
        meta["catalogs"][catalog] = {"rows": tb["nrows"], "zmin": min(z), "zmax": max(z)}
        print(f"flames-{catalog}: {tb['nrows']} rows, {len(tb['columns'])} columns, {len(tb['refs'])} ref links")
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))

    low_bib = bibs["low"].read_text()
    high_bib = bibs["high"].read_text()
    low_keys, high_keys = set(bib_keys(low_bib)), set(bib_keys(high_bib))
    # union: keep every low-z entry, then high-z entries with new keys
    entries = re.split(r"(?m)^(?=@\w+\{)", high_bib)
    extra = [e for e in entries if bib_keys(e) and bib_keys(e)[0] not in low_keys]
    (OUT / "flames.bib").write_text(low_bib.rstrip() + "\n\n" + "".join(extra))
    all_keys = low_keys | high_keys

    cite = json.loads((args.src / "low-z_cite_dict.json").read_text())
    # the page links each ref code to its bib entries; keep this mapping from the release dict
    refcodes = {"low": {}, "high": {}}
    for code, citet in cite.items():
        keys = [k.strip() for m in re.findall(r"\\cite\w*\{([^}]*)\}", citet) for k in m.split(",")]
        refcodes["low"][code] = [k for k in keys if k in all_keys]
    for catalog in ("low", "high"):
        tb = tables[catalog]
        for rc in set(tb["refs"].values()):
            for v in tb["data"].get(rc, []):
                for code in (v or "").split(","):
                    code = code.strip()
                    if code and code not in refcodes[catalog]:
                        refcodes[catalog][code] = [code] if code in all_keys else []
    (OUT / "refcodes.json").write_text(json.dumps(refcodes, indent=1, sort_keys=True))
    missing = {c: sorted(k for k, v in refcodes[c].items() if not v) for c in refcodes}
    print("ref codes without bib entry:", missing)

    cl = build_cloudy(args.cloudy)
    with gzip.open(OUT / "flames-cloudy.json.gz", "wt", compresslevel=9) as f:
        json.dump(cl, f, separators=(",", ":"), allow_nan=False)
    print(f"flames-cloudy: {cl['nrows']} rows, {len(cl['columns'])} columns")


if __name__ == "__main__":
    main()
