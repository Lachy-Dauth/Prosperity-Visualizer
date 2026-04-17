# Contributing

Thanks for thinking about contributing! The project is intentionally boring
vanilla JS so it's easy to fork.

## Development

Because there's no build step, you just need a static HTTP server:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080` and edit any file — refresh the browser to see
changes. Module caching can be sticky; a hard refresh (Cmd/Ctrl+Shift+R)
usually suffices.

## Ground rules

- **No telemetry.** Not even privacy-respecting telemetry. Ever.
- **No external scripts loaded at runtime** (CDN fonts/CSS are fine; tracking
  pixels and analytics SDKs are not).
- **Keep the parsed data in-memory-only by default.** The IndexedDB
  persistence toggle must stay opt-in.
- **Don't hardcode product names.** Derive them from `activitiesLog`.
- **No build step, no framework.** If you need a module bundler, you're
  probably going in the wrong direction for this project.

## Adding a new Prosperity season

Edit `js/positionLimits.js` and add entries for the new symbols. The UI lets
users override at runtime too, so this is a quality-of-life default rather
than a correctness gate.

If IMC changes the CSV schema, update `js/parser.js::parseActivitiesCsv`.

## Filing issues

If the visualizer chokes on a log, a reduced `.log` attached to the issue is
worth a thousand words — but remember that logs may contain algorithm output
you consider private. A redacted or synthetic minimal reproducer is always
fine.
