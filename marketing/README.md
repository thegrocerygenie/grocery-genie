# Grocery Genie — Marketing Site

The pre-launch landing page for Grocery Genie. Vanilla HTML, CSS, and a small JS file. Ships zero JS framework, renders in under 50KB on the wire (excluding fonts and the social card), and works without JavaScript except for the waitlist submit.

## What's here

```
marketing/
├── index.html              # the page
├── styles.css              # all visual styles (extracted from the design handoff)
├── tokens.css              # design system tokens (Apple-lens v2)
├── app.js                  # waitlist form handler + smooth-scroll
│
├── api/
│   ├── _handler.js         # framework-agnostic waitlist join logic
│   └── waitlist.js         # Vercel / Cloudflare Pages Function entry
│
├── netlify/
│   └── functions/
│       └── waitlist.js     # Netlify Function entry
│
├── server.js               # standalone Node http server (dev + self-hosted)
│
├── favicon.svg             # source-of-truth icon
├── favicon-32.png          # generated 32×32
├── apple-touch-icon.png    # generated 180×180
├── icon-192.png            # generated 192×192 (PWA)
├── icon-512.png            # generated 512×512 (PWA)
├── og-image.svg            # source-of-truth Open Graph card
├── og-image.png            # generated 1200×630
├── site.webmanifest        # PWA manifest
├── robots.txt
├── sitemap.xml
│
├── vercel.json             # Vercel headers + caching
├── netlify.toml            # Netlify redirects + headers + caching
├── package.json            # scripts (dev/start/build:icons)
├── .env.example            # required + optional env vars
└── .gitignore
```

## Run locally

```bash
cp .env.example .env        # then fill in RESEND_API_KEY + RESEND_AUDIENCE_ID
npm run dev                 # http://localhost:3000 (auto-reloads on file changes)
```

You can preview the page without a Resend key — the form will just return a "temporarily unavailable" message.

## Deploy targets

The site is portable. Pick whichever fits.

### Vercel

```bash
vercel --prod
```

`vercel.json` configures security headers and immutable caching on assets. The function at `api/waitlist.js` is auto-detected and routed to `/api/waitlist`. Add `RESEND_API_KEY` and `RESEND_AUDIENCE_ID` in the Vercel project's Environment Variables.

### Netlify

```bash
netlify deploy --prod
```

`netlify.toml` redirects `/api/waitlist` to the function in `netlify/functions/`. Add the same env vars in the Netlify site config.

### Cloudflare Pages

The `api/waitlist.js` ESM signature works as a Pages Function out of the box. Set `public` directory to `.` and add the env vars in the Pages project. (The `vercel.json` headers won't apply on Cloudflare — set headers via `_headers` if you want them; the markup itself doesn't depend on them.)

### Self-hosted (Docker, fly.io, Render, EC2, anywhere Node 20+ runs)

```bash
RESEND_API_KEY=re_... RESEND_AUDIENCE_ID=... PORT=3000 node server.js
```

`server.js` serves the static files and dispatches `/api/waitlist` itself — no Express, no extra deps.

### GitHub Pages / static-only host

The page itself works without the API (the form will fail open with an error). If you must use a static-only host, point the form at a third-party form service like Formspark or Buttondown by editing `app.js`'s `fetch('/api/waitlist', ...)` call.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `RESEND_API_KEY` | yes | API key from https://resend.com/api-keys |
| `RESEND_AUDIENCE_ID` | yes | Audience (waitlist) ID from https://resend.com/audiences |
| `WAITLIST_FROM` | no | If set, fires a welcome email to each signup. Must be a verified sender (e.g. `Grocery Genie <hello@grocerygenie.app>`) |
| `WAITLIST_WELCOME_SUBJECT` | no | Override default subject line |
| `WAITLIST_WELCOME_TEXT` | no | Override default plain-text body |
| `ALLOWED_ORIGIN` | no | Lock CORS to a specific origin. Defaults to `*` |
| `PORT` | no | Local dev port. Defaults to `3000` |

## Resend setup (one-time)

1. Create an account at https://resend.com.
2. Create an audience: https://resend.com/audiences → copy the audience ID into `RESEND_AUDIENCE_ID`.
3. Create an API key: https://resend.com/api-keys → copy into `RESEND_API_KEY`.
4. (Optional) Verify a sending domain at https://resend.com/domains and set `WAITLIST_FROM=Grocery Genie <hello@yourdomain.com>` to enable welcome emails.

## Regenerating icons

If you edit `favicon.svg` or `og-image.svg`, regenerate the PNGs:

```bash
npm run build:icons
```

Requires ImageMagick (`convert`). On macOS: `brew install imagemagick`. On Debian/Ubuntu: `apt install imagemagick`.

## Analytics

`app.js` dispatches a `waitlist:join` `CustomEvent` after successful sign-up and forwards to common SDK globals if present (`window.plausible`, `window.gtag`). To add Plausible, GA4, or any tag:

```html
<!-- in <head> of index.html -->
<script defer data-domain="grocerygenie.app" src="https://plausible.io/js/script.js"></script>
```

That's it — `app.js` calls `plausible('Waitlist Join', { props: { source } })` when the form succeeds.

## Notes

- The phone-mock illustrations in the hero/features are **inline static SVG/HTML**, captured from the design handoff's React mocks. Zero runtime React. They will look pixel-identical without any JS.
- The page is iOS-first in messaging but the markup degrades gracefully on Android, desktop, and reduced-motion / dark-mode preferences (color-scheme is set to `light` because the visual design is paper-on-paper; flip if you need dark mode).
- Form has both client and server-side validation, in-memory rate limiting (6 req/min/IP), and friendly error messages. For production scale beyond a single instance, replace the in-memory limiter in `api/_handler.js` with Upstash Ratelimit or similar.
