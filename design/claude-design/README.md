# Claude Design export: Grocery Genie

The user's Claude Design project, exported on 2026-11-04 (source: claude.ai/design, project "Grocery Genie"). It is the visual reference for the mobile app at every roadmap phase, and for the marketing site. Treat it as reference: read it, compare the app with it, don't import it into the app.

## Which file covers which phase

| Phase | Canvas | Screen components |
|---|---|---|
| MVP | `Grocery Genie V1 Screens.html` (MVP sections) | `components-v2/mvp-screens.jsx`, `v1-mvp-gap.jsx` |
| V1.1 Price Intelligence + Premium | `Grocery Genie V1 Screens.html` (sections `v11-core`, `v11-gaps`) | `components-v2/roadmap-v11.jsx` (item detail, match confirm, price alert, cross-store), `v1-pi-gap.jsx` (manual link, split item, alert mute, custom categories, export, 12-month trend, paywall) |
| V1.5 Household | `Grocery Genie V1 Screens.html` (sections `v15-core`, `v15-gaps`) | `components-v2/roadmap-v15.jsx`, `v15-hh-gap.jsx` |
| V2.0 | `Grocery Genie V2 Screens.html` | `components-v2/roadmap-v20.jsx`, `v20-mp-gap.jsx`, `v20-mp-gap2.jsx` |
| V2.5 | `Grocery Genie V2 Screens.html` | `components-v2/roadmap-v25.jsx`, `v25-ai-gap.jsx`, `v25-ai-gap2.jsx` |
| V3.0 | `Grocery Genie V3 Screens.html` | `components-v2/roadmap-v30.jsx`, `v30-ai-gap.jsx`, `v30-ai-gap2.jsx` |
| Roadmap overview | `Grocery Genie Roadmap.html` | `components-v2/roadmap-shell.jsx` |
| Design system | `Grocery Genie Design System v2.html` | `components-v2/foundations.jsx`, `primitives.jsx`, `patterns.jsx`, `components.jsx`, `motion.jsx` (motion and accessibility rules), `tokens-v2.css` |
| Marketing site | `Grocery Genie Marketing Site v2–v5.html`, `design_handoff_marketing_site/` (v5 is current, with screenshots) | |
| Brand | `Logo Lab.html`, `Logo Lab v2.html` | `components/` (the v1 design system) |

`expo-sample/` holds the drop-in Expo versions of the MVP screens that came with the original MVP handoff. `components-v2/` supersedes `components/`.

When a canvas and an `expo-sample/` file disagree, the canvas wins (same rule as the MVP handoff).

## Viewing a canvas

The canvases load React and Babel from unpkg and the `.jsx` files over HTTP, so open them through a local server, not `file://`:

```bash
python3 -m http.server 8090 --directory design/claude-design
# then open http://localhost:8090/Grocery%20Genie%20V1%20Screens.html
```

## Phase scope

The canvases show later phases next to earlier ones. A phase builds only its own screens (AGENTS.md: phase boundaries are strict). The V1.5+ screens are here so those phases have their reference ready, not as work for the current phase.

## Updating

Export the project again from Claude Design and replace this folder in one PR, so the diff shows what the design changed. The editor's own files (`.thumbnail`, `.design-canvas.state.json`) are left out.
