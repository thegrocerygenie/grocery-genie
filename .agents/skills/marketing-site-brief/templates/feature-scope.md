# {Stage} feature scope: what Grocery Genie ships at {version}

Written {date} from `{branch}` at `{short sha}`, for the {stage} landing page.

This describes the whole app as of {stage}: everything from earlier stages plus what {stage} adds. It comes from the code. The PRD is used only to name user stories. Section 5 lists what the site must not claim.

How to read the status column:
- **Built**: in the code, with a test that would fail if it broke.
- **Built, device check pending**: built and tested, but not yet checked on a real iPhone. It can appear on the site; recheck before launch.
- **Built, unverified**: built, but untested or not measured. Hold it off the site.
- **Hold**: built, but switched off or unconfigured in production. Keep it off the site.

---

## 1. Positioning

- **One-line pitch:** {from the app's onboarding or About screen}
- **The promise:** {one sentence on the outcome}
- **Who it's for:** {personas this stage serves, from 00-overview.md}
- **Why it's different:** {the contrast; at later stages, the one-scan story}
- **Platform:** {from mobile/app.json}
- **Price:** {tiers and limits from the code and decisions.md}

## 2. Feature list

One subsection per value layer the app has shipped, newest layer first. Within each layer, group by pillar in the order a user meets them.

### Layer: {name} ({stage it shipped in})

#### Pillar: {name}

| Feature | Benefit line | What it actually does | Story | Since | Status |
|---|---|---|---|---|---|
| {name} | {copy-ready, benefit first} | {facts, with numbers the code confirms} | {story ID or "added"} | {stage} | {status} |

{Repeat for every pillar and layer.}

### Trust, privacy and accessibility

| Feature | What it actually does | Status |
|---|---|---|

## 3. What changed since {previous stage}

- **New:** {features added at this stage}
- **Changed:** {earlier features whose behaviour, copy, limits or tier changed}
- **Removed:** {earlier features that are gone, and why}
- **Planned for {stage} but not built:** {story IDs; keep these off the site}

## 4. Decisions to make before the copy is final

{Numbered. Each one names the fact, where it lives, and the options.}

## 5. Don't put these on the page

| Claim (current site or a likely draft) | Reality | Stage |
|---|---|---|

{Include every later-stage feature, every false or unsupported privacy claim, every unmeasured number, every past date, and any stat or testimonial without a source.}

## 6. Sources checked

- Privacy wording: `privacy.ts` at `{sha}` (`reviewed: {true|false}`)
- AI provider terms: {URLs, date checked}
- Device checks still open: {list}
