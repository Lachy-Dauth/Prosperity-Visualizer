# OpenProsperity Visualizer

A local-first, open-source dashboard for the **IMC Prosperity** algorithmic
trading competition. Drop in your backtest `.log` files and get a fast,
information-dense view of what your algorithm actually did — and crucially,
load **N variants at once** to compare them side-by-side.

**Your strategy never leaves your laptop. No uploads, no accounts, no
telemetry.**

**Pure HTML, CSS, and vanilla JavaScript — no framework, no build step.**

## Why another visualizer?

jmerle's
[`imc-prosperity-3-visualizer`](https://github.com/jmerle/imc-prosperity-3-visualizer)
set the bar for what a static-SPA Prosperity tool should look like, and much
of OpenProsperity is downstream of that prior art. We emphasize:

- **Multi-strategy comparison as the default mental model.** Loading 2–10 log
  files at once is a first-class flow. Diff mode plots `variant − baseline`
  on the PnL chart. Normalized-x mode lets you compare a 1k-tick preview
  against a 10k-tick full day on the same axis.
- **Local-first, proven.** Open the devtools network tab and confirm nothing
  leaves the browser. The only outbound request is for the static HTML / JS
  / CSS bundle.
- **Zero dependencies at runtime.** No React, no Tailwind, no npm packages in
  the shipped site — just browser APIs. Clone and serve any HTTP server.

## Quick start

```bash
git clone https://github.com/lachy-dauth/prosperity-visualizer
cd prosperity-visualizer

# Serve the directory with any static HTTP server. Examples:
python3 -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080` and drop any `.log` file from IMC's submission
dashboard (or from `prosperity3bt`) into the left rail.

> A plain `file://` open will *not* work because the app uses a Web Worker
> and `fetch()` for the demo log. You need an HTTP server.

## Deploy to GitHub Pages

This repo ships with a ready-to-go Pages workflow at
`.github/workflows/deploy.yml`. It publishes the repo root as-is (no build).

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` (or run the workflow manually from the Actions tab).

## Features

- Drop 1–N log files; each gets a color and appears in all comparison charts.
- Playback controls with variable speed (1×/5×/10×/20×/50×), scrubber,
  keyboard shortcuts (Space / ←→ / Shift+←→).
- KPI cards, PnL performance chart, per-product price & liquidity chart,
  position chart with limit bands, live order book, pressure gauge, own-fills
  table, and sandbox/algorithm/trader-data log tabs — all synchronized.
- Decodes jmerle-style base64 `lambdaLog` dumps automatically; falls back
  gracefully when your algo just uses `print()`.
- Export: PnL chart → PNG, comparison summary → CSV.
- Optional "Save to browser" toggle persists parsed strategies to IndexedDB
  across reloads. Off by default.

## Data handling (read this)

1. Your file is read client-side with the File API and parsed in a Web Worker.
2. Parsed data lives only in JavaScript memory for the tab. Refresh the tab
   and it's gone, unless you opted in to IndexedDB persistence.
3. No network requests are made with the contents of your log.
4. No analytics, no cookies, no Google-anything.

## Project layout

```
index.html            # Entry HTML
styles.css            # All styles (custom variables, dark/light)
app.js                # Top-level wiring
favicon.svg
demo.log              # Bundled sample log for first-time visitors
js/
  store.js            # Tiny pub/sub store + prefs
  parser.js           # CSV + strategy builder (multi-day safe)
  worker.js           # Parser Web Worker entry
  parserClient.js     # Main-thread worker client
  persistence.js      # Native IndexedDB
  chart.js            # Vanilla Canvas line chart
  downsample.js       # LTTB downsampling
  colors.js           # Strategy palette
  format.js           # Number formatters
  positionLimits.js   # Known IMC limits per season
  exporters.js        # CSV + PNG download
  demoLog.js          # Bundled demo fetch
  uid.js              # Id generator
  panels/
    rail.js  topBar.js  kpi.js
    pnlChart.js  priceChart.js  positionChart.js
    summary.js  orderBook.js  pressure.js
    ownFills.js  logs.js  about.js
```

## Adding a new Prosperity season

Product names and position limits change every year. Edit
`js/positionLimits.js` and add the new symbols. Nothing else should need
touching unless IMC changes the log schema.

## Credits

- Inspired by
  [jmerle/imc-prosperity-3-visualizer](https://github.com/jmerle/imc-prosperity-3-visualizer).
- IMC Prosperity is © IMC Trading; this project is an independent fan tool.

## License

MIT — see [LICENSE](./LICENSE).
