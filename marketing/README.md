# Grocery Genie — Marketing Site

The landing page for Grocery Genie, built from the Claude Design handoff **"Grocery Genie Marketing Site v5"** and the MVP brief (`docs/marketing/mvp/design-brief.md`, `docs/marketing/decisions.md`).

- **Astro** with static output. Every section is plain HTML/CSS at build time.
- **React** for the phone mockups. They render to static HTML; only the hero animation (`HeroMoment`) hydrates on the client.
- A small client script (`src/scripts/site.ts`) handles the waitlist form, analytics events, "What's next" votes and the sticky-nav rule.
- The **Resend-backed waitlist API** in `api/` is unchanged in shape and runs on Cloudflare Workers (production), Netlify, Vercel or the bundled Node server.

## What's here

```
marketing/
├── src/
│   ├── pages/index.astro          # the page (all sections, in design order)
│   ├── pages/privacy.astro        # /privacy: the app's privacy.ts, rendered at build time
│   ├── pages/support.astro        # /support: help, data requests, account deletion
│   ├── layouts/DocPage.astro      # nav + one text column + footer, for /privacy and /support
│   ├── legal.ts                   # re-exports PRIVACY_POLICY and PRIVACY_EMAIL from ../mobile
│   ├── config.ts                  # launch state, App Store ID, headlines, lists, privacy line
│   ├── components/
│   │   ├── CtaSlot.astro          # hero / mid / final CTA: waitlist form (A) or App Store badge + QR (B)
│   │   ├── SiteHead.astro         # <head> metadata shared by every page (title, canonical, OG)
│   │   ├── SiteFooter.astro       # footer shared by every page
│   │   ├── Wordmark.astro         # Leaf Drop mark + "grocerygenie"
│   │   └── mocks/                 # phone mockups (React); HeroMoment is the animated hero
│   ├── scripts/site.ts            # waitlist submit, events, votes, nav
│   └── styles/
│       ├── tokens-v2.css          # app design tokens (Apple-lens v2)
│       └── site.css               # page styles, ported 1:1 from the v5 design
├── public/                        # favicon, app icons, OG card, manifest, robots, sitemap, badges/
├── api/                           # waitlist handler (+ Vercel entry)
├── worker/index.js                # Cloudflare Worker: /api/waitlist, then static assets
├── netlify/functions/             # Netlify entry for the waitlist handler
├── wrangler.toml                  # Cloudflare Worker config (name, assets, routing)
├── server.js                      # Node server: serves dist/ and /api/waitlist
├── scripts/render-icons.mjs       # renders PNG icons + OG card from their SVGs
└── tests/
    ├── smoke.mjs                  # waitlist handler tests (no network)
    ├── page.mjs                   # built-page checks against the brief's copy rules
    └── legal-pages.mjs            # /privacy matches privacy.ts; /support, footer and sitemap checks
```

## Privacy and support pages

`/privacy` (`src/pages/privacy.astro`) is the App Store privacy policy URL, and `/support` (`src/pages/support.astro`) is the support URL. Both use `src/layouts/DocPage.astro`, the shared `SiteHead` and `SiteFooter`, and `src/styles/doc.css`.

**The privacy text has one source: the app.** `/privacy` imports `PRIVACY_POLICY` from `mobile/src/features/settings/content/privacy.ts` at build time (through `src/legal.ts`), so the site always shows what Settings → Privacy shows, draft banner included while `reviewed` is `false`. Edit the text there, never in `marketing/`. How it works:

- The build reads `../mobile`, so it needs the whole repo checked out, not `marketing/` alone. Cloudflare Workers Builds (Path `/marketing/`), Netlify and Vercel all clone the whole repo. If `../mobile` is missing, the build fails on the import.
- `privacy.ts` imports `@/constants/links` (the app's path alias). `mobile-sources.mjs` maps exactly that specifier for Vite (`astro.config.mjs`), and `tsconfig.json` maps it for `astro check`. Any other `@/...` or React Native import added to `privacy.ts` fails the build on purpose: map it in `mobile-sources.mjs` only if it's plain TypeScript.
- `vite.tsconfig` points at this folder's `tsconfig.json`, because `mobile/tsconfig.json` extends `expo/tsconfig.base`, which isn't installed when only the site's dependencies are.
- `tests/legal-pages.mjs` loads `privacy.ts` straight from `../mobile` and checks that every heading and paragraph, the dates and the draft notice are on the built page.
- **A change to `privacy.ts` must redeploy the site.** If the Cloudflare Worker has build watch paths set, include `mobile/src/features/settings/content/privacy.ts` and `mobile/src/constants/links.ts`.

`/support` states only what the app does today. Its steps come from the Settings screens named in the page's header comment; update the page when those screens change.

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
4. **Record the switch date.** It's the waitlist cut-off for the free year of Premium. Sign-ups before it qualify; later ones don't.
   - Write the date into `docs/marketing/decisions.md` #9.
   - Set `GG_WAITLIST_CUTOFF` on the backend to the same date (V1.1 story V11-P5).
   - Tick "Record the switch date" in `docs/launch-open-items.md` §6.

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

Production runs on **Cloudflare Workers with static assets** (decision #21 in `docs/marketing/decisions.md`). The Worker is named `grocery-genie-marketing`.

### Cloudflare Workers (production)

`wrangler.toml` serves `dist/` as static assets and sends only `/api/*` to `worker/index.js`, which handles `/api/waitlist`. Static requests never run the script, so they cost nothing. `public/_headers` sets the security and caching headers on static files; the Worker sets its own headers on API responses.

One-time setup, in the Cloudflare dashboard (Workers & Pages → Create application → Import a repository):

1. Pick this repo. **Project name** must match `name` in `wrangler.toml` (`grocery-genie-marketing`). **Build command:** `npm run build`. **Deploy command:** `npx wrangler deploy`. **Path** (under Advanced settings): `/marketing/`.
2. Under the Worker's **Settings**:
   - **Build → Variables and secrets** (used only while `npm run build` runs): `PUBLIC_LAUNCH_STATE` and `PUBLIC_APP_STORE_ID`. They're baked into the page, so change them and redeploy.
   - **Variables and Secrets** (used by the Worker at runtime): secrets `RESEND_API_KEY` and `RESEND_AUDIENCE_ID`; plain-text variables `ALLOWED_ORIGIN=https://grocerygenie.app`, and `WAITLIST_FROM` if you send the welcome email. `keep_vars = true` in `wrangler.toml` stops each deploy from deleting the plain-text variables.
3. **Domains & Routes:** add `grocerygenie.app` as a custom domain (and `www.grocerygenie.app`, redirected to the apex). The domain's DNS must be on Cloudflare.
4. **Security → WAF → Rate limiting rules** on the zone: limit `POST /api/waitlist` per IP (for example 10 requests per minute, then block). The in-memory limiter in `api/_handler.js` counts per running copy of the Worker, so it doesn't hold up on its own.

The build uses the Node version in `.node-version` (24). Astro needs 22.23.4 or later, so don't set `NODE_VERSION` lower than that.

After that, every push to `main` builds and deploys. With preview builds on, other branches get a preview URL.

From the CLI instead of Git:

```bash
npm run build && npx wrangler deploy
npx wrangler secret put RESEND_API_KEY
```

Run the Worker locally (page + `/api/waitlist`). Wrangler reads secrets from `.dev.vars`, or from `.env` when there is no `.dev.vars`. With the real Resend keys in `.env`, a test sign-up joins the real waitlist and can send the welcome email, so put test values in `.dev.vars` first:

```bash
npm run build && npx wrangler dev
```

### Other hosts

- **Netlify (fallback):** `netlify deploy --prod`. `netlify.toml` builds to `dist/` and routes `/api/waitlist` to the function; headers come from `public/_headers`.
- **Vercel:** `vercel --prod`. `vercel.json` sets the build, headers and caching, and `api/waitlist.js` serves `/api/waitlist`. Vercel's free Hobby plan is non-commercial only, so this needs Pro.
- **Self-hosted (Node 22.23.4+):** `npm run build && RESEND_API_KEY=… RESEND_AUDIENCE_ID=… node server.js`.

If you change a header, change `public/_headers` and `vercel.json` together.

## Tests

```bash
npm test             # handler smoke tests + build + built-page checks (page.mjs, legal-pages.mjs)
npm run check        # astro check (types)
```

`tests/page.mjs` enforces the brief's copy rules on the built page: the privacy line word for word, no on-device or "never shared" claims, no "unlimited", no speed or accuracy figures, no paid-tier prices, and the right CTAs for the launch state. Run it for both states:

```bash
npm run build && npm run test:pages
PUBLIC_LAUNCH_STATE=b npm run build && npm run test:pages
```

## Icons and social card

`public/favicon.svg` (Leaf Drop) and `public/og-image.svg` are the sources. Regenerate the PNGs with:

```bash
npm run build:icons   # needs Playwright with Chromium
```

App and PWA icons are drawn on the paper tile (`#F8F6F1`) so they're opaque on the home screen. Leaf Drop is still a concept sketch; swap in final vector artwork when the identity designer delivers it.
