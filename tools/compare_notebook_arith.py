"""Compare flames/js/formula.js with the arith helpers of Paper_I_plots.ipynb.

Runs the notebook's own function definitions (cells defining flag_uplim ... get_arith_all)
on the released catalogs and compares value, errors and flags with the JS engine output
from tools/test_formula.mjs.

Usage: python tools/compare_notebook_arith.py NOTEBOOK JS_OUTPUT_JSON
"""
import copy
import json
import re
import sys
from pathlib import Path

import astropy as ap
import numpy as np
from astropy.table import Table as Tb

NB, JS = sys.argv[1], sys.argv[2]
SRC = str(Path(__file__).resolve().parents[1] / "catalogs" / "flames-{}.ecsv")

nb = json.load(open(NB))
cells = ["".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code"]
wanted = ("flag_uplim", "flag_lolim", "stack_arith", "stack_arith_in", "stack_arith_kw", "min_nan_op",
          "stack_arith_err", "stack_arith_flag", "seg_data", "force_upperlimit", "clean_ma",
          "corr_limit", "get_arith_data")
ns = {"np": np, "copy": copy, "ap": ap, "Tb": Tb}
for s in cells:
    m = re.match(r"\s*def (\w+)\(", s)
    if m and m.group(1) in wanted:
        exec(s, ns)

KW = {
    "L_CII": "L_CII",
    "L_CII / L_IR": ("L_CII", {-1: "L_IR"}),
    "L_OIII88 + L_CII": ["L_OIII88", "L_CII"],
    "L_OIII88 / (L_CII + L_NII122)": ("L_OIII88", {-1: ["L_CII", "L_NII122"]}),
    "L_CII^2": {2: "L_CII"},
    "L_CII * L_OIII88 / L_IR": ("L_CII", "L_OIII88", {-1: "L_IR"}),
    "L_IR - L_FIR": ["L_IR", (-1, "L_FIR")],
}

js = json.load(open(JS))


def filled(a, fill=np.nan):
    if np.ma.isMaskedArray(a) or hasattr(a, "mask"):
        return np.asarray(np.ma.filled(np.ma.asarray(a, dtype=float), fill))
    return np.asarray(a, dtype=float)


def close(a, b, rtol=1e-4):
    a, b = np.asarray(a, float), np.asarray(b, float)
    both_nan = ~np.isfinite(a) & ~np.isfinite(b)
    ok = both_nan | np.isclose(a, b, rtol=rtol, atol=0)
    return ok


bad = 0
for cat in ("low", "high"):
    tb = Tb(Tb.read(SRC.format(cat), format="ascii.ecsv"), masked=True)
    for fml, kw in KW.items():
        for force in (False, True):
            d, e, le, f = ns["get_arith_all"](kw, tb, fallback_value=0.0, force_ul=force)
            d, e, le = filled(d), filled(e), filled(le)
            f = np.asarray(np.ma.filled(f, "")) if np.ndim(f) else np.full(len(tb), "")
            r = js[cat][fml]
            v = np.array([np.nan if x is None else x for x in (r["fu_v"] if force else r["v"])])
            jf = np.array(r["fu_f"] if force else r["f"])
            # notebook keeps a value for flags it cleans with masks; compare where both are finite
            valid = np.isfinite(d) & np.isfinite(v)
            n_valid_nb, n_valid_js = int(np.isfinite(d).sum()), int(np.isfinite(v).sum())
            okv = close(d[valid], v[valid])
            okf = (np.char.replace(np.char.replace(f[valid], "<<", "<"), ">>", ">") == jf[valid])
            msg = f"{cat:4s} {fml:32s} force={force!s:5s} nb_valid={n_valid_nb:4d} js_valid={n_valid_js:4d} " \
                  f"value_mismatch={int((~okv).sum())} flag_mismatch={int((~okf).sum())}"
            if not force:
                je = np.array([np.nan if x is None else x for x in r["e"]])
                jl = np.array([np.nan if x is None else x for x in r["l"]])
                eu = valid & (f == "")
                oke = close(e[eu], je[eu], rtol=1e-3)
                okl = close(le[eu], jl[eu], rtol=1e-3)
                msg += f" err_mismatch={int((~oke).sum())} lerr_mismatch={int((~okl).sum())}"
                if (~oke).sum():
                    i = np.where(eu)[0][~oke][:3]
                    msg += f" e.g. nb={e[i]} js={je[i]}"
                bad += int((~oke).sum() + (~okl).sum())
            bad += int((~okv).sum() + (~okf).sum()) + int(n_valid_nb != n_valid_js)
            print(msg)
print("TOTAL MISMATCHES", bad)
