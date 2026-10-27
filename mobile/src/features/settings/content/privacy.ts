import { PRIVACY_EMAIL } from '@/constants/links';

export interface PolicySection {
  heading: string;
  paragraphs: string[];
}

/** Placeholder until the company is formed; change it here only. */
const COMPANY = 'The Grocery Genie Inc.';

/**
 * Settings → Privacy. Revised on 2026-10-27 from the privacy review in
 * docs/legal/privacy-review-2026-10-27.md, against what the code on main
 * stores, sends, and erases. NOT LEGAL ADVICE: have it reviewed, then set
 * `reviewed` to true, which removes the draft banner. Update it whenever data
 * handling changes; the review lists which claims still wait on code.
 */
export const PRIVACY_POLICY: {
  reviewed: boolean;
  effective: string;
  updated: string;
  sections: PolicySection[];
} = {
  reviewed: false,
  effective: 'October 27, 2026',
  updated: 'October 27, 2026',
  sections: [
    {
      heading: 'Who we are',
      paragraphs: [
        `Grocery Genie is provided by ${COMPANY} ("we"). For questions about your data or to make a request, email ${PRIVACY_EMAIL}.`,
      ],
    },
    {
      heading: 'What we collect',
      paragraphs: [
        'Your account: your email address and name. Your password is stored only as a secure hash. If you sign in with Apple or Google, we store the account ID they give us and your email address, and your name if Google shares it.',
        'Your receipts: the photos and files you scan or import, and what we read from them: store, date, items, quantities, prices, tax, totals and currency. We keep the corrections you make and the categories you choose, so the app can learn your items.',
        'Your settings: budgets, category caps, alert and weekly summary choices, receipt languages, and your device’s notification token. Budget alerts and the weekly summary are on by default; you can turn them off in Settings → Alerts.',
        'Security and app activity: the time, IP address and device details of sign-ins and failed attempts, to protect your account; and basic events about how you use the app (for example, that a scan started or was confirmed), to fix and improve it. These stay with us and our hosting providers.',
      ],
    },
    {
      heading: 'How we use it',
      paragraphs: [
        'To read your receipts, track spending against your budgets, show your history and trends, send the alerts and summaries you have on, keep your account secure, and fix and improve the app. We do not sell your data or share it for advertising, we do not show ads, and we do not track you across other apps or websites.',
      ],
    },
    {
      heading: 'Who else processes it',
      paragraphs: [
        'These companies process data for us, only to provide the service, under terms that require them to protect it at least as well as this policy does:',
        'Hetzner runs our servers, and Supabase hosts our database.',
        'Anthropic (Claude) reads receipt photos and item names to extract the details and suggest categories. We send them only after you allow it: the app asks before your first scan or import. You can turn this off at any time in Settings → Read receipts with AI; scans and imports then stop, and you can still enter receipts manually. Under its commercial terms, Anthropic does not use this data to train its models.',
        'Expo and Apple deliver push notifications: your device’s notification token and the alert text, which can include spending amounts.',
        'Resend sends account emails, such as verification, password reset and email change.',
        'Apple and Google confirm your identity when you sign in with them.',
      ],
    },
    {
      heading: 'On your phone',
      paragraphs: [
        'Your sign-in is kept in the iOS Keychain. A receipt you capture without a connection stays on your phone until it uploads, then the local copy is deleted.',
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [
        'Your account and receipts: until you delete them.',
        'Receipts and budgets you delete: you can restore them from Settings → Recently deleted for 30 days. After that they are permanently erased, including receipt images.',
        'Sign-in security records: up to 12 months. Server logs: up to 30 days.',
      ],
    },
    {
      heading: 'Deleting your account',
      paragraphs: [
        'Go to Settings → Delete account. This permanently erases your account, receipts, receipt images, budgets, settings and notifications, and, if you use Sign in with Apple, revokes the app’s access to your Apple ID.',
      ],
    },
    {
      heading: 'Your choices and rights',
      paragraphs: [
        `You can see and correct most of your data in the app. To get a copy of your data, or for any other request about it, email ${PRIVACY_EMAIL}. We reply within 30 days, and we will not treat you differently for making a request.`,
      ],
    },
    {
      heading: 'Children',
      paragraphs: [
        `Grocery Genie is not meant for children under 13, and we do not knowingly collect their data. If you believe a child has given us data, email ${PRIVACY_EMAIL} and we will delete it.`,
      ],
    },
    {
      heading: 'Security',
      paragraphs: [
        'We use encrypted connections, store passwords only as secure hashes, keep your sign-in in the iOS Keychain, and limit who can access our systems. No system is perfectly secure; if a breach affects your data, we will tell you as the law requires.',
      ],
    },
    {
      heading: 'Changes to this policy',
      paragraphs: [
        'If we change this policy in a way that matters, we will tell you in the app before the change takes effect. The effective date above shows the current version.',
      ],
    },
  ],
};
