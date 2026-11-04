# Launch email to the waitlist (draft)

Written 2026-11-04. It goes out when the site switches to the App Store (`PUBLIC_LAUNCH_STATE=b`). The offer terms come from [decisions](decisions.md) #2, #7 and #9–#13. Square brackets mark the things to fill in.

**Send to:** waitlist contacts created before the switch date (decisions #9). Include unsubscribed contacts only if the law allows a transactional notice about their offer. Otherwise they learn about it from the FAQ.

## Before sending

- [ ] **Claim step.** "Settings → Claim your waitlist offer" exists only once V1.1 story V11-P5 ships. If it isn't live, drop that sentence.
- [ ] **Premium features.** The list matches the V1.1 gating (plan D2). Check it against the build on send day.
- [ ] **Price comparison.** The sentence about prices covers V1.1 price history and store comparison. Remove it if those aren't released.
- [ ] **Premium timing.** If Premium isn't live yet, use the alternative free-year section below.
- [ ] **Dates and links.** Fill in the App Store link, the email merge field and the claim deadline (Premium launch + 90 days).

---

**Subject:** Grocery Genie is on the App Store, and your free year of Premium is waiting
**Preview text:** Sign up with this email to claim it.

Hi,

You joined the Grocery Genie waitlist, and it's out now: **[App Store link]**

**What it does**
Snap a grocery receipt and Grocery Genie reads every line, sorts each item into a category, and updates your budget. You get a heads-up at 50%, 80% and 100% of your budget, before you overspend rather than after. You can also see what you've paid for an item over time, and which store charges less.

It's free on iPhone.

**Your free year of Premium**
As a waitlist member, you get a free year of Premium. Here's how to claim it:

1. Download the app and **sign up with this email address: [email]**.
2. That's it. We'll add Premium to your account automatically.

Used a different email, or Hide My Email with Sign in with Apple? Go to **Settings → Claim your waitlist offer** and confirm this address.

Claim it by **[Premium launch date + 90 days]**. Your year runs 12 months from the day it's added.

**What Premium adds:** unlimited receipt scans, custom categories, a 12-month spending trend, budget rollover and data export.

Thanks for waiting with us.
— The Grocery Genie team

*You're getting this because you joined the Grocery Genie waitlist. Reply "unsubscribe" to stop our emails; you'll keep the free year. Reply "delete" to have your email removed; that gives up the free year.*

---

## If Premium launches after the app

Replace the free-year section with:

> **Your free year of Premium**
> Premium, our paid plan, is coming soon, and your first year is on us. Sign up in the app now with this email address, [email], and we'll add it to your account automatically when Premium launches. You'll have 90 days from then to claim it, and we'll email you when it's live.

In that case, send a second email when Premium launches, with the claim deadline.
