# Grocery Genie — Marketing Site

The landing page for Grocery Genie, built from the Claude Design handoff **"Grocery Genie Marketing Site v5"** and the MVP brief (`docs/marketing/mvp/design-brief.md`, `docs/marketing/decisions.md`).

- **Astro** with static output. Every section is plain HTML/CSS at build time.
- **React** for the phone mockups. They render to static HTML; only the hero animation (`HeroMoment`) hydrates on the client.
- A small client script (`src/scripts/site.ts`) handles the waitlist form, analytics events, "What's next" votes and the sticky-nav rule.
- The **Resend-backed waitlist API** in `api/` is unchanged in shape and runs on Vercel, Netlify or the bundled Node server.

## What's here

```
marketing/
├── src/
│   ├── pages/index.astro          # the page (all sections, in design order)
│   ├── config.ts                  # launch state, App Store ID, headlines, lists, privacy line
│   ├── components/
│   │   ├── CtaSlot.astro          # hero / mid / final CTA: waitlist form (A) or App Store badge + QR (B)
│   │   ├── Wordmark.astro         # Leaf Drop mark + "grocerygenie"
│   │   └── mocks/                 # phone mockups (React); HeroMoment is the animated hero
│   ├── scripts/site.ts            # waitlist submit, events, votes, nav
│   └── styles/
│       ├── tokens-v2.css          # app design tokens (Apple-lens v2)
│       └── site.css               # page styles, ported 1:1 from the v5 design
├── public/                        # favicon, app icons, OG card, manifest, robots, sitemap, badges/
├── api/                           # waitlist handler (+ Vercel / Cloudflare entry)
├── netlify/functions/             # Netlify entry for the waitlist handler
├── server.js                      # Node server: serves dist/ and /api/waitlist
├── scripts/render-icons.mjs       # renders PNG icons + OG card from their SVGs
└── tests/
    ├── smoke.mjs                  # waitlist handler tests (no network)
    └── page.mjs                   # built-page checks against the brief's copy rules
```

## Run locally

```bash
npm install
npm run dev            # Astro dev server, http://localhost:4321 (page only, no /api)

# Full stack (page + waitlist API):
cp .env.example .env   # fill RESEND_API_KEY + RESEND_AUDIENCE_ID
npm run build && npm start   # http://localhost:3000
```

Without Resend keys, the form shows "Waitlist is temporarily unavailable."

## Configuration (replaces the design's Tweaks panel)

The design prototype had a Tweaks panel. In production these settings are fixed or come from build-time env:

| Prototype tweak | Production |
|---|---|
| Launch state A/B | `PUBLIC_LAUNCH_STATE=a` (pre-launch waitlist, default) or `b` (App Store). Rebuild to switch. |
| Hero headline A/B/C | Each visitor gets a random variant that sticks (`localStorage gg_hl_variant`). `?hl=a`, `?hl=b` or `?hl=c` forces one. Copy lives in `src/config.ts`. |
| Green use | Fixed at "CTAs + block": green buttons and a deep-green final CTA block. |
| Accent | Fixed at `#1F7A4A` (`--accent` in `site.css`). |

**State A (pre-launch):** waitlist form in the hero, mid-page and final blocks. A successful sign-up swaps all three to "You're in. We'll email you once, at launch." The FAQ shows the free-Premium-year line, and the "What's next" items are votable.

**State B (launch):** Apple's App Store badge in each slot, a QR code (generated at build time) in the hero and final blocks for desktop visitors, the `apple-itunes-app` smart banner, "Download" in the nav, and the "It's out now" FAQ answer.

### Environment variables

| Var | Where | Purpose |
|---|---|---|
| `PUBLIC_LAUNCH_STATE` | build | `a` or `b` (default `a`) |
| `PUBLIC_APP_STORE_ID` | build | Real App Store ID (default placeholder `0000000000`) |
| `PUBLIC_WAITLIST_ENDPOINT` | build | Optional. Posts the form somewhere other than `/api/waitlist`. |
| `RESEND_API_KEY` | runtime | https://resend.com/api-keys |
| `RESEND_AUDIENCE_ID` | runtime | https://resend.com/audiences |
| `WAITLIST_FROM` | runtime | Optional welcome email sender (verified Resend domain) |
| `WAITLIST_WELCOME_SUBJECT` / `WAITLIST_WELCOME_TEXT` | runtime | Optional welcome email overrides |
| `ALLOWED_ORIGIN` | runtime | Lock CORS (default `*`) |
| `PORT` | runtime | Node server port (default `3000`) |

The default welcome email matches the page's promise ("We'll email you once, at launch"). If you set `WAITLIST_WELCOME_TEXT`, keep it consistent with that promise.

## Before switching to State B

1. Set `PUBLIC_APP_STORE_ID` to the live listing's ID.
2. Download Apple's official badges from Apple Marketing Tools (https://tools.applemarketingtools.com) and save them as:
   - `public/badges/download-on-the-app-store-black.svg`
   - `public/badges/download-on-the-app-store-white.svg`

   Until those files exist, State B shows a dashed "Official App Store badge" placeholder instead of a broken image.
3. Build with `PUBLIC_LAUNCH_STATE=b` and check that the QR code and smart banner open the listing.

## Analytics

Events are pushed to `window.dataLayer` (GTM / GA4) and forwarded to `window.plausible` if it's on the page. Each event carries `state`, `headline` and any UTM tags (kept for the session).

| Event | When | Extra props |
|---|---|---|
| `headline_view` | page load | |
| `cta_click` | any "Get early access" / "Download" click | `loc`: `nav`, `hero`, `mid`, `final` |
| `waitlist_signup` | successful waitlist join | `loc` |
| `appstore_click` | App Store badge click (State B; the nav Download link sends `cta_click`) | `loc`: `hero`, `mid`, `final` |
| `faq_open` | an FAQ item is opened | `id` |
| `next_vote` | a "What's next" vote (State A) | `feature` |

The waitlist POST body also includes `headline`, `path`, `referrer` and UTM tags. The handler currently stores only the email in the Resend audience; extend `api/_handler.js` if you want attribution stored with the contact.

## Deploy

- **Vercel:** `vercel --prod`. `vercel.json` sets the Astro build (`dist/`), security headers and caching. `api/waitlist.js` is served at `/api/waitlist`.
- **Netlify:** `netlify deploy --prod`. `netlify.toml` builds to `dist/` and routes `/api/waitlist` to the function.
- **Self-hosted (Node 20+):** `npm run build && RESEND_API_KEY=… RESEND_AUDIENCE_ID=… node server.js`.

## Tests

```bash
npm test             # handler smoke tests + build + built-page checks
npm run check        # astro check (types)
```

`tests/page.mjs` enforces the brief's copy rules on the built page: the privacy line word for word, no on-device or "never shared" claims, no "unlimited", no speed or accuracy figures, no paid-tier prices, and the right CTAs for the launch state. Run it for both states:

```bash
npm run build && node tests/page.mjs
PUBLIC_LAUNCH_STATE=b npm run build && node tests/page.mjs
```

## Icons and social card

`public/favicon.svg` (Leaf Drop) and `public/og-image.svg` are the sources. Regenerate the PNGs with:

```bash
npm run build:icons   # needs Playwright with Chromium
```

App and PWA icons are drawn on the paper tile (`#F8F6F1`) so they're opaque on the home screen. Leaf Drop is still a concept sketch; swap in final vector artwork when the identity designer delivers it.
