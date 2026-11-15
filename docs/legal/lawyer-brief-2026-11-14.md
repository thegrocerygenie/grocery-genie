# Privacy policy review brief for counsel

Prepared 2026-11-14 for an outside lawyer. Engineering prepared this; it is not legal advice. Please review the policy in Appendix A, answer the questions in section 4, and return a marked-up text plus a short sign-off note (see section 5).

## 1. The product

- **Grocery Genie** is an iPhone app. A user photographs or imports a grocery receipt; an AI model reads it; the app tracks spending against budgets the user sets and sends budget alerts and a weekly summary.
- **Launch:** iPhone only, planned for Q4 2026. **Markets: United States and Canada.** No EU/UK launch, so the policy has no GDPR sections; we would add them before offering the app there.
- **Price:** free at launch. A paid tier ("Premium", App Store subscription handled through RevenueCat) is built and planned to follow. People who joined the website waitlist are promised a free year of Premium.
- **Company:** not yet formed. The policy uses the placeholder "The Grocery Genie Inc." with no address.
- **Where the policy lives:** inside the app (Settings → Privacy) and, once deployed, at `https://grocerygenie.app/privacy`. Both are generated from one source file, so they always match. Until you sign off, both show "Draft · pending legal review".

## 2. What the app does with data (checked against the code)

| Data | Why | Who processes it | Kept for |
|---|---|---|---|
| Email, name, password hash; Apple/Google account ID | Account and sign-in | Us (Hetzner servers, Supabase database); Apple and Google confirm identity | Until the user deletes the account |
| Receipt photos and files, and the details read from them (store, date, items, prices, tax, totals, currency); corrections and categories | Core feature | Us; **Anthropic** (Claude) reads photos and item names, only after the user agrees in-app before the first scan; can be withdrawn in Settings | Until deleted; deleted receipts restorable for 30 days, then erased with images |
| Budgets, alert and summary settings, receipt languages, push notification token | Core feature | Us; **Expo and Apple** deliver push notifications (alert text can include spending amounts) | Until the account is deleted |
| Sign-in records: time, IP address, device details (user agent), failed attempts | Security | Us | Up to 12 months (automated) |
| App activity events (for example "scan confirmed") | Fixing and improving the app | Us | Up to 13 months (automated) |
| Server logs | Operations | Us (Hetzner) | About 50 MB per service, rotated; older files deleted after 30 days |
| Waitlist email (from the website), IP address in transit | Launch email and the free Premium year | **Cloudflare** (website and form), **Resend** (stores the waitlist, sends email) | Until 90 days after Premium launches, or sooner on request; a one-way hash of a redeemed email outlives account deletion until then, to stop double claims |
| Account emails (verification, password reset, email change) | Account | **Resend** | Resend's own retention |
| Subscription status and purchase events (once Premium is live) | Paid tier | **RevenueCat**, Apple (App Store) | Not yet stated in the policy (see 4.6) |

Not collected: location, contacts, health data, browsing history, advertising identifiers. No ads, no ad or attribution SDKs, no cross-app tracking, no sale of data.

Account deletion is in the app (Settings → Delete account). It erases the account and all its data immediately and revokes Sign in with Apple. This is required by Apple (App Review Guideline 5.1.1(v)). Apple also requires a public policy URL (5.1.1(i)) and clear disclosure plus permission before sending personal data to a third-party AI (5.1.2(i)); the app asks before the first scan.

## 3. What changed since the internal review

An engineering review on 2026-10-27 (`docs/legal/privacy-review-2026-10-27.md`) found three likely App Store rejections. All three are now built: in-app account deletion, Sign in with Apple revocation, and AI consent before the first scan. The retention jobs for sign-in records and app events now run. The policy text in Appendix A was updated to match.

## 4. Questions for you

1. **Controller identity.** What should "Who we are" say before the company exists? Can we launch under an individual's name, or must the entity be formed first? What postal address must appear?
2. **Canada, PIPEDA.** Our servers and processors may be outside Canada (Anthropic, Resend, Cloudflare, Expo and RevenueCat are US companies; the Hetzner and Supabase regions are not fixed yet). Does the policy need an explicit statement that data may be stored and processed outside Canada and may be accessible to foreign authorities?
3. **Quebec, Law 25.** Do we need to name a person in charge of protecting personal information and publish their title and contact? A privacy impact assessment before transferring Quebec residents' data outside Quebec? A French version of the policy or the app for Quebec users?
4. **United States.** Do CCPA/CPRA or any other state privacy law apply at our size? If not, should we still keep a short "your rights" section for California and the other states? Our request reply time is 30 days; is that fine everywhere (CCPA allows 45)?
5. **Waitlist and launch emails.** The website form says "We'll email you once, at launch. Sign up in the app with this same email and we'll match it to your account for the free Premium year." Is that enough consent under **CASL** (Canada) for the launch email and the Premium email? Under **CAN-SPAM**, our emails need a postal address and an unsubscribe link; what address do we use before the company exists?
6. **RevenueCat and App Store purchases.** The policy does not yet name RevenueCat or describe subscription data. What should it say, and must it be in place at launch if Premium follows later?
7. **AI processing.** The policy says Anthropic does not train on our data under its commercial terms, and we get the user's agreement in the app before the first scan. Is the consent wording sufficient, and should the policy state Anthropic's retention period for API inputs?
8. **Retention.** Are 12 months (sign-in security records) and 13 months (app activity events) defensible? Is the log retention sentence acceptable as written?
9. **Terms of use.** No Terms document exists; the sign-up screen links to the privacy policy only. Can we rely on Apple's standard end-user licence agreement for the App Store, or do we need our own terms (for example for the free-year offer and the paid tier)?
10. **Anything missing** that you would expect in a consumer finance-adjacent app in the US and Canada (for example a breach-notification commitment, a children's section, or a notice for the website). The website sets no cookies today. It stores a randomly chosen headline variant in the browser's local storage for an A/B test, and its code has hooks for Plausible analytics (a cookie-less service) that are not switched on yet. Does either need a notice?

## 5. What we need back

- The policy text marked up (Appendix A), or a replacement.
- Answers to section 4, or the facts you need from us to answer them.
- A short note saying the final text is approved, naming the version you approved (its "Last updated" date). We then remove the draft banner from the app and the website.

Contacts in the policy: `privacy@grocerygenie.app` (privacy and data requests) and `support@grocerygenie.app` (help).

## Appendix A: the policy text under review

Generated from `mobile/src/features/settings/content/privacy.ts` on 2026-11-14 (do not edit here; edit that file). Effective October 27, 2026. Last updated November 11, 2026. Company name is a placeholder; the privacy address resolves to `privacy@grocerygenie.app`.

### Who we are

Grocery Genie is provided by The Grocery Genie Inc. ("we"). For questions about your data or to make a request, email privacy@grocerygenie.app.

### What we collect

Your account: your email address and name. Your password is stored only as a secure hash. If you sign in with Apple or Google, we store the account ID they give us and your email address, and your name if Google shares it.

Your receipts: the photos and files you scan or import, and what we read from them: store, date, items, quantities, prices, tax, totals and currency. We keep the corrections you make and the categories you choose, so the app can learn your items.

Your settings: budgets, category caps, alert and weekly summary choices, receipt languages, and your device’s notification token. Budget alerts and the weekly summary are on by default; you can turn them off in Settings → Alerts.

Security and app activity: the time, IP address and device details of sign-ins and failed attempts, to protect your account; and basic events about how you use the app (for example, that a scan started or was confirmed), to fix and improve it. These stay with us and our hosting providers.

Our waitlist: if you joined the waitlist on our website, we keep that email address. When Premium launches, we compare it with the email address on your account to find you and give you the free year of Premium we offered waitlist members. Unsubscribing stops our emails but keeps your address for the offer; if you ask us to delete it, you give up the free year.

### How we use it

To read your receipts, track spending against your budgets, show your history and trends, send the alerts and summaries you have on, keep your account secure, and fix and improve the app. We do not sell your data or share it for advertising, we do not show ads, and we do not track you across other apps or websites.

### Who else processes it

These companies process data for us, only to provide the service, under terms that require them to protect it at least as well as this policy does:

Hetzner runs our servers, and Supabase hosts our database.

Cloudflare hosts our website and its waitlist form: if you join the waitlist, your email address and IP address pass through Cloudflare on their way to Resend.

Anthropic (Claude) reads receipt photos and item names to extract the details and suggest categories. We send them only after you allow it: the app asks before your first scan or import. You can turn this off at any time in Settings → Read receipts with AI; scans and imports then stop, and you can still enter receipts manually. Under its commercial terms, Anthropic does not use this data to train its models.

Expo and Apple deliver push notifications: your device’s notification token and the alert text, which can include spending amounts.

Resend sends account emails, such as verification, password reset and email change, and keeps our waitlist.

Apple and Google confirm your identity when you sign in with them.

### On your phone

Your sign-in is kept in the iOS Keychain. A receipt you capture without a connection stays on your phone until it uploads, then the local copy is deleted.

### How long we keep it

Your account and receipts: until you delete them.

Receipts and budgets you delete: you can restore them from Settings → Recently deleted for 30 days. After that they are permanently erased, including receipt images.

Sign-in security records: up to 12 months. App activity events: up to 13 months.

Waitlist email addresses: until 90 days after Premium launches, when the free-year offer closes, or sooner if you ask us to delete yours.

Server logs: each part of our service keeps about 50 MB of logs, and the oldest lines are deleted as new ones arrive. Logs are never archived, and older log files are deleted after 30 days.

### Deleting your account

Go to Settings → Delete account. This permanently erases your account, receipts, receipt images, budgets, settings and notifications, and, if you use Sign in with Apple, revokes the app’s access to your Apple ID.

If you redeemed the free year of Premium offered to our waitlist, we keep a one-way fingerprint of your waitlist email, not the email itself, until the offer closes 90 days after Premium launches, so the offer can’t be claimed twice. It is not linked to you and is then deleted.

### Your choices and rights

You can see and correct most of your data in the app. To get a copy of your data, or for any other request about it, email privacy@grocerygenie.app. We reply within 30 days, and we will not treat you differently for making a request.

### Children

Grocery Genie is not meant for children under 13, and we do not knowingly collect their data. If you believe a child has given us data, email privacy@grocerygenie.app and we will delete it.

### Security

We use encrypted connections, store passwords only as secure hashes, keep your sign-in in the iOS Keychain, and limit who can access our systems. No system is perfectly secure; if a breach affects your data, we will tell you as the law requires.

### Changes to this policy

If we change this policy in a way that matters, we will tell you in the app before the change takes effect. The effective date above shows the current version.
