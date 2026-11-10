# bpqdbpqd.github.io

GitHub Pages site. The root `index.html` redirects to `/flames/`.

- `index.html` — redirect to `/flames/`
- `flames/` — FLAMES catalog explorer (static HTML + ES modules, no build step; see `flames/README.md`)
- `catalogs/` — the released FLAMES tables the site is built from (copies of `FS_Line/results/FLAMES`)
- `tools/` — data build and test scripts (not used by the site at runtime)

## Updating the catalog data

Copy a release into `catalogs/`:

- `flames-low_v{version}.ecsv`, `flames-high_v{version}.ecsv`
- `flames-low_v{version}.bib`, `flames-high_v{version}.bib` (the unversioned `.bib` is used if these are missing)
- `low-z_cite_dict.json`

`catalogs/flames_papers.bib` (the FLAMES I entry, key `FLAMESI`) is kept across releases. The build
stops if a BibTeX key appears in more than one of the bib files.

Then:

```bash
conda activate py311
python tools/build_flames_data.py            # highest version in catalogs/, plus the Cloudy grid
python tools/build_flames_data.py --version 0.3   # or a specific one
```

Without versioned files it reads the unversioned `flames-{low,high}.ecsv` and the page shows
"Table version: unversioned". The build writes `flames/data/`: catalog JSON, merged `flames.bib`,
`refcodes.json`, `meta.json` (version, row counts, redshift ranges and the FLAMES I–III links for
the page footer), and the gzipped Cloudy grid.

## Checks

```bash
node tools/test_formula.mjs > /scratch/$USER/js_arith.json
python tools/compare_notebook_arith.py ~/workspace/FS_Line/nb/Paper_I_plots.ipynb /scratch/$USER/js_arith.json
node tools/test_exports.mjs /scratch/$USER/exp_test   # CSV / FITS / BibTeX subset
```

`compare_notebook_arith.py` runs the arith helpers of `Paper_I_plots.ipynb` on the same catalogs and
compares value, errors and limit flags with `flames/js/formula.js`. Known, intended differences:
subtraction swaps upper/lower errors of the subtracted term (the notebook does not), and a result whose
operands all lack errors keeps a missing error (the notebook returns 0 when a constant is involved, and
its 3-factor products depend on operand order).

## Local preview

```bash
python3 -m http.server 8765 --directory .    # then open http://localhost:8765/
```
