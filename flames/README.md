# FLAMES catalog explorer

Static page (no build step): plain HTML, CSS, native ES modules and vendored libraries
loaded with classic `<script>` tags (`Plotly`, `Tabulator`, `jspdf`, `svg2pdf`).
Preview with `python3 -m http.server 8765 --directory ..` and open `http://localhost:8765/flames/`.

## Layout

```
index.html            page skeleton: header, plot frame, options frame, table frame, footer
css/style.css         all styling; colors are custom properties, [data-theme="dark"] swaps them;
                      Tabulator is restyled at the bottom of the file
vendor/               third-party libraries (see LICENSE.* files)
data/                 catalog JSON, flames.bib, refcodes.json, meta.json, gzipped Cloudy grid (tools/build_flames_data.py)

js/  model (no DOM; also used by tools/*.mjs tests)
  formula.js          parse + evaluate formulas with error / limit propagation
  plot.js             Plotly traces and layout from evaluated series
  styles.js           paper-default point styles and figure defaults
  mplkw.js            matplotlib kwargs parser -> grid / legend / axis settings
  table.js            formula-table and raw-table rows, bib keys of rows
  exporters.js        CSV, FITS, BibTeX subset, download()
  data.js             fetch + cache of the data files

js/  app
  config.js           CATALOGS registry (label, loader, plot: true/false) and defaultState()
  state.js            store (update(fn, "data" | "view")), localStorage and URL-hash persistence
  compute.js          computePair(): one formula pair on every enabled catalog
  app.js              wiring: store -> compute -> plot + table; selection and highlights; toolbar
  ui/dom.js           h() element helper, debounce, number formatting, file-name slug
  ui/options.js       options frame (formula pairs, axes, figure kwargs, session)
  ui/styleEditor.js   per point-type style rows
  ui/autocomplete.js  column-name suggestions in formula inputs
  ui/plotView.js      Plotly figure, events, selection card, PNG / PDF export
  ui/tableView.js     table frame: tabs per pair, or raw catalog panels; table exports
  ui/grid.js          Tabulator factory, numeric header filters (">1e9", "1..10", "!=0")
  ui/splitters.js     draggable / keyboard-resizable frame splitters
  ui/theme.js         light / dark page theme
  ui/toast.js         status messages
```

## Data flow

1. Every control changes state through `store.update(fn, kind)`. `kind = "data"` (formulas,
   catalogs, forced upper limits) re-evaluates the pairs; `"view"` (styles, scales, limits,
   kwargs) only re-plots. Both are debounced by 150 ms in `app.js`.
2. `computePair()` returns parse errors, missing columns, point counts, the evaluated
   `parts` (for `buildFormulaTable`) and the plot `series` (for `buildTraces`).
3. Plot traces carry `customdata = [catalog, rowIndex, formulaIndex]`; table rows carry
   `_key = "catalog:rowIndex"`. Selection on the plot filters the table by `_key`; clicking a
   row adds a highlight ring at that point.
4. `layout.uirevision` only changes with scales, limits, formulas or "Reset view", so style
   edits keep the current zoom.

## Adding a feature

- **A new option**: add its default to `defaultState()` in `config.js`, a control in
  `ui/options.js` that calls `store.update(..., "view")` (or `"data"` if it changes values), and
  read it in `figure()` (plot) or `computePair()` (values) in `app.js` / `compute.js`.
- **Plotting another catalog (e.g. the Cloudy grid)**: set `plot: true` for it in `CATALOGS`,
  give it a style list under the same key in `styles.js` (`defaultStyles()`), and make sure its
  table has `Name` and `groups` (or adapt `computePair` / `buildFormulaTable` for a model grid).
  Pair catalog toggles, legend, table and exports follow the registry.
- **A new export**: add a writer to `exporters.js` and a button in `exportButtons()` in
  `ui/tableView.js` (table) or the plot toolbar in `index.html` + `app.js` (figure).

## Checks

The model modules have node tests in `../tools/` (see the top-level README). The UI was checked
in headless Chromium (Playwright): load without console errors, default plot, formula edits,
row highlight, box select, all five exports, theme toggle, raw/Cloudy tables, 390 px and 1440 px
layouts.
