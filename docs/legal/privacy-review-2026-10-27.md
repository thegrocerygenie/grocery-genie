# Privacy policy review: in-app text, 2026-10-27

Reviewed: `mobile/src/features/settings/content/privacy.ts` (drafted 2026-10-26), against the code on `main` at `105631b`, Apple's App Review Guidelines (fetched 2026-10-27), GDPR / UK GDPR Article 13, CCPA/CPRA, and COPPA. Claude did a full claim-by-claim pass. Codex did a second, independent read-only pass. Each finding below was checked against the code.

**This is not legal advice.** It is an engineering review of what the code does against what the text says, plus a checklist of what regulators and Apple ask for. A lawyer should review the final text, especially the controller identity, lawful bases, and the CCPA applicability call.

## Status after the revision (2026-10-27, main at `8dbe4f8`)

`privacy.ts` now holds the revised text. It uses the facts supplied on 2026-10-27:
- The controller is "The Grocery Genie Inc." (a placeholder in one constant, `COMPANY`).
- Privacy requests go to `PRIVACY_EMAIL`.
- The hosts are Hetzner and Supabase (from `docs/DEPLOYMENT.md`).
- There is no EU/UK launch, so there are no GDPR basis or transfer sections; add them before you offer the app there.
- Retention uses the defaults.

The draft banner stays until a lawyer signs off.

| Claim in the new text | Backed by code? |
| --- | --- |
| Settings → Delete account erases everything and revokes Apple | Yes: PR 18 (`account_service.py`). The real Apple revoke call is still untested on a device with production keys. |
| Deleted receipts and budgets are permanently erased after 30 days, images included | Yes: PR 14 (`purge_tasks.py`, daily beat) |
| Sign-in security records are kept for up to 12 months | **No.** `auth_events` has no purge yet; the "Privacy minimization" card includes it. |
| Server logs are kept for up to 30 days | **No.** It depends on the Docker logging and the host's settings; `docker/docker-compose.yml` sets no log options. |
| Anthropic does not train on our data | Anthropic's commercial terms; check against the current terms before launch |
| No AI consent claim | Deliberate. Blocker 3 (AI consent) is still open, so the text doesn't claim it. Add the consent wording when that ships. |
| Alerts and the weekly summary are on by default | Yes: `database.py` and `notificationStore.ts` defaults |

Still open before launch: blocker 3 (AI consent), the sign-up policy link, the minimization fixes, a public policy URL for App Store Connect, the App Store privacy label (table below), and legal sign-off.

## Verdict (as first reviewed)

Not launch-ready. Three items will likely get the app rejected by App Store review. Each one needs code, not just new text.

| # | Blocker | Rule | Status |
| --- | --- | --- | --- |
| 1 | Account deletion works only by email. | 5.1.1(v): "If your app supports account creation, you must also offer account deletion within the app." | In progress: session "In-app account deletion" |
| 2 | Sign in with Apple tokens cannot be revoked. `apple_auth.py` (around line 138) checks the token exchange, then discards it, so no refresh token is stored. | 5.1.1(v), Apple TN3194 | Sent to the account-deletion session |
| 3 | Receipt photos go to a third-party AI (Anthropic) without just-in-time disclosure and explicit permission. | 5.1.2(i): "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." | Not started |

Two more items are close to blockers:

- The sign-up screen's "Terms" and "Privacy Policy" are styled text with no press handler (`mobile/app/onboarding/sign-up.tsx:202-205`). No Terms document exists. 5.1.1(i) also needs a public policy URL for App Store Connect. The marketing site (`marketing/`, Vercel) can host it.
- The in-app policy still shows "Draft · pending legal review" (`reviewed: false`).

## Claim check

| Claim in the current text | Verdict | Evidence |
| --- | --- | --- |
| Email and name; password only as a hash | True | `database.py:31-43`; bcrypt in `security.py:39-50` |
| Apple/Google: account ID and email; "Google also shares your name" | True, with a minimization issue | The app requests Apple's full name and sends it (`socialSignIn.ts:94-113`), but the backend drops it (`routes/auth.py:221`). Stop requesting it, or store it and disclose it. |
| Receipts: store, date, items, quantities, prices, totals | Incomplete | Also currency, subtotal, tax, unit, categories, confidence scores (`llm/schemas.py`, `database.py:153-206`) |
| Corrections and categories are kept | True | `receipt_corrections` keeps the original and corrected values |
| Settings and notification token | True | `database.py:66-83`, `push_tokens` |
| Sign-in activity: time, IP, device type | Partly | The full user agent is stored, not a device type. No retention limit (`auth_events`). Apple/Google sign-ins are not logged. |
| App events "go only to our own servers" | True, but understated | The server logs about 10 analytics events with the user ID, receipt totals, budget amounts, and raw original/corrected item values (`analytics_service.py`, `receipt_service.py:283-293, 567-575`) |
| No selling, ads, or ad trackers | True in code | No ad, attribution, or analytics SDK in `mobile/package.json`; no ATT. Vendor contracts are unproven. |
| Anthropic reads photos and item names | True | The full image goes through LiteLLM (`llm/provider.py:49-76`). `llm_api_base` is configurable; the production route must be Anthropic or the text must change. |
| Expo: token and alert text | Understated | Alert text includes amounts, and weekly summaries include total spend and top category (`summary_tasks.py:83-119`). Expo forwards to Apple Push Notification service. |
| Resend: verification and reset emails | Understated | Also email-change emails. Without a Resend key, the fallback logs the full email, live links included (`email.py:80-85`). Make sure production always has the key. |
| Apple and Google confirm identity | True | `apple_auth.py`, `google_auth.py` |
| Sign-in in the iOS Keychain | True | `expo-secure-store`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`authStore.ts`) |
| Offline photo deleted after upload | Mostly true | True after upload (`offlineQueue.ts`). Failed uploads stay until discarded. Camera/import cache copies are left to iOS. |
| Restorable for 30 days, then hidden but not erased | True today | No purge, and server images are never deleted (`image/storage.py`). In progress: session "Purge soft-deleted data after 30 days". |
| Email us to delete or export | Not backed by code | No deletion or export path exists (manual handling unproven) |

## Missing from the text

Ranked by risk. "Store" means a likely review rejection; "legal" means regulatory exposure.

1. **Retention schedule (store + legal).** One period or rule each for: account, receipts and their three image copies (original, JPEG render, thumbnail), corrections, `auth_events`, server logs, notifications, backups, and processor copies. "Not yet erased" is not a retention policy.
2. **Processors, in full (store + legal).** Name the hosting provider: none is chosen in the repo yet, and the text must name it once it is. Also name Apple (APNs, Sign in with Apple), Google, Expo, Resend, and Anthropic: what each receives, why, and where (US). 5.1.1(i) also asks for a statement that each gives "the same or equal protection".
3. **Who we are (legal).** The controller's legal name and address, and a privacy contact. Today the only contact is a personal-looking address (`adetayo@fsgamified.com`, from `constants/links.ts`).
4. **GDPR/UK, if you offer the app there (legal):**
   - the lawful basis for each purpose: contract for core features, legitimate interests for security and analytics, consent for AI processing if that is the basis you choose;
   - transfers to the US and their safeguards (SCCs or the Data Privacy Framework);
   - the rights to access, correct, delete, restrict, object, port, and withdraw consent;
   - the right to complain to a supervisory authority.
5. **California (legal, if CCPA applies):** categories collected, sources, purposes, "we do not sell or share", rights, and how to use them. CCPA likely does not apply at launch (its revenue and volume thresholds), but a short section costs little.
6. **Children (legal):** not directed to under-13s; delete their data if you learn of it.
7. **Security (best practice):** a measured statement (TLS, hashed passwords, Keychain, access limits). Don't claim encryption at rest until production proves it.
8. **Changes and effective date (best practice):** how users hear about material changes. Use an effective date, not only "last updated".

## Code changes the text depends on

- **Blockers 1–3 above.**
- **Minimization:**
  - Stop requesting Apple full name, or store it and disclose it.
  - Drop raw original/corrected values from analytics logs.
  - Give `auth_events` a retention limit, for example 12 months.
  - Make the email log fallback impossible in production.
- **Sign-up links:** make "Privacy Policy" open the policy. Write Terms, or drop the word.
- **Push defaults:** 80%, 100%, and the weekly summary are on by default, and permission is requested right after sign-in. That's allowed, but the text should say alerts are on by default and can be turned off. 5.1.2(i) also forbids requiring push for any feature, and the app doesn't.

## App Store privacy label (App Store Connect)

What the code supports today. Every type is **linked to the user** and **not used for tracking**.

| Data type | Purposes |
| --- | --- |
| Contact Info: Name, Email Address | App Functionality |
| Financial Info: Other Financial Info (budgets, spend) | App Functionality, Analytics |
| Purchases: Purchase History (receipt items and prices) | App Functionality, Product Personalization, Analytics |
| User Content: Photos or Videos; Other User Content (PDFs, corrections) | App Functionality |
| Identifiers: User ID | App Functionality, Analytics |
| Identifiers: Device ID (Expo push token) | App Functionality |
| Usage Data: Product Interaction | Analytics |
| Diagnostics: Other Diagnostic Data (extraction timings, confidence) | Analytics, App Functionality |
| Other Data: IP address and user agent in `auth_events` | App Functionality (security) |

Not collected: location, contacts, health, crash data, browsing history.

## Decisions needed from you

1. The controller's legal name and postal address, and whether privacy mail goes to a role address (for example `privacy@…`).
2. The production hosting provider and region.
3. Whether you will offer the app in the EU/UK at launch. If not, limit App Store availability and keep a short GDPR section anyway.
4. The AI consent design: a one-time consent sheet before the first scan, with manual entry as the alternative, versus per-scan. Recommended: one-time, revocable in Settings.
5. The retention periods: proposed below.

## Proposed text

This replaces `privacy.ts` once blockers 1 and 3 and the purge ship. `[BRACKETS]` mark facts only you can supply. The wording describes deletion and purge as the two sessions are building them, so it must match their final reports.

**Who we are.** Grocery Genie is provided by [LEGAL ENTITY NAME], [POSTAL ADDRESS] ("we"). Questions or requests about your data: [PRIVACY EMAIL].

**What we collect**
- *Your account:* email address and name. Your password is stored only as a secure hash. If you sign in with Apple or Google, we store the account ID they give us and your email address, and your name if Google shares it.
- *Your receipts:* the photos and files you scan or import, and what we read from them: store, date, items, quantities, prices, taxes, totals and currency. We keep the corrections you make and the categories you choose, so the app can learn your items.
- *Your settings:* budgets, category caps, alert and weekly-summary choices (budget alerts and the weekly summary are on by default; you can turn them off in Settings → Alerts), receipt languages, and your device's notification token.
- *Security and app activity:* the time, IP address and device details of sign-ins and failed attempts, to protect your account; and basic events about how you use the app (for example, that a scan started or was confirmed), to improve it. These stay with us and our hosting provider.

**How we use it.** To read your receipts, track spending against your budgets, show your history and trends, send the alerts and summaries you have on, keep your account secure, and fix and improve the app. We do not sell or share your data for advertising, show ads, or track you across other apps and websites.

**Our legal basis (EU/UK).** We process your data to provide the service you signed up for (contract); to secure and improve it (our legitimate interests); and, for reading receipts with AI, with your permission, which you can withdraw in Settings.

**Who else processes it.** These companies process data for us under contracts that require them to protect it as this policy does:
- [HOSTING PROVIDER] runs our servers and database ([REGION]).
- Anthropic (Claude) reads receipt photos and item names to extract details and suggest categories, only after you allow it. Anthropic does not use this data to train its models.
- Expo and Apple deliver push notifications: your device's notification token and the alert text, which can include spending amounts.
- Resend sends account emails (verification, password reset, email change).
- Apple and Google confirm your identity when you sign in with them.

Some of these companies are in the United States. For users in the EU and UK, we rely on [Standard Contractual Clauses / the EU-US Data Privacy Framework] for these transfers.

**On your phone.** Your sign-in is kept in the iOS Keychain. A receipt you capture without a connection stays on your phone until it uploads, then the local copy is deleted.

**How long we keep it**
- *Receipts and budgets you delete:* restorable from Settings → Recently deleted for 30 days, then permanently erased, including receipt images.
- *Your account:* until you delete it.
- *Sign-in security records:* [12 months].
- *Server logs:* [30 days].
- *Backups:* overwritten within [N] days.
- *AI processing:* Anthropic keeps API inputs for a limited time under its own policy, [VERIFY CURRENT PERIOD], and does not train on them.

**Deleting your account.** Go to Settings → Delete account. This permanently erases your account, receipts, images, budgets and settings, and signs you out of Sign in with Apple. Backups clear within [N] days.

**Your rights.** You can access, correct, export or delete your data, and object to or restrict some uses. Email [PRIVACY EMAIL]; we reply within 30 days. In the EU or UK, you can also complain to your data protection authority. California residents have similar rights to know, delete and correct, and we will not treat you differently for using them.

**Children.** Grocery Genie is not for children under 13, and we do not knowingly collect their data. If you think a child has given us data, contact us and we will delete it.

**Security.** We protect your data with encrypted connections, hashed passwords, the iOS Keychain, and limited access to our systems. No system is perfectly secure; if a breach affects you, we will tell you as the law requires.

**Changes.** If we change this policy in a way that matters, we will tell you in the app before the change takes effect. Effective [DATE].

Before launch, check every claim in this proposed text against the shipped code: account deletion, purge, AI consent, and the retention jobs. Also check that the Anthropic retention and no-training statements still match Anthropic's current commercial terms.
