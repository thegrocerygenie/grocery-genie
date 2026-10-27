import { SUPPORT_EMAIL } from '@/constants/links';

export interface PolicySection {
  heading: string;
  paragraphs: string[];
}

/**
 * Settings → Privacy. Drafted on 2026-10-26 from what the code stores and
 * sends (backend models, LLM provider, email, push and sign-in services).
 * NOT LEGAL ADVICE: have it reviewed, then set `reviewed` to true, which
 * removes the draft banner. Update it whenever data handling changes.
 */
export const PRIVACY_POLICY: {
  reviewed: boolean;
  updated: string;
  sections: PolicySection[];
} = {
  reviewed: false,
  updated: 'October 26, 2026',
  sections: [
    {
      heading: 'What we collect',
      paragraphs: [
        'Your account: your email address and name. Your password is stored only as a secure hash. If you sign in with Apple or Google, we store the account ID they give us and the email address (Google also shares your name).',
        'Your receipts: the photos and files you scan or import, and what we read from them: store, date, items, quantities, prices and totals. We also keep the corrections you make and the categories you choose, so the app can learn your items.',
        'Your settings: budgets, category caps, alert and weekly summary choices, receipt languages, and your device’s notification token.',
        'Sign-in activity: the time, IP address and device type of sign-ins and failed attempts, used to protect your account. Basic app events (for example, that a scan started) go only to our own servers.',
      ],
    },
    {
      heading: 'How we use it',
      paragraphs: [
        'To read your receipts, track spending against your budgets, show your history and trends, send the alerts and summaries you turn on, and keep your account secure. We do not sell your data, show ads, or use ad trackers.',
      ],
    },
    {
      heading: 'Who else processes it',
      paragraphs: [
        'Anthropic (Claude) reads receipt photos and item names for us, to extract the details and suggest categories.',
        'Expo delivers push notifications: your device’s notification token and the alert text.',
        'Resend sends account emails, such as verification and password reset.',
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
      heading: 'Keeping and deleting',
      paragraphs: [
        'Deleted receipts and budgets can be restored from Settings → Recently deleted for 30 days. After that they are hidden, but are not yet erased from our servers.',
        `To delete your account and all your data, or to get a copy of it, email ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [`Questions about your privacy: ${SUPPORT_EMAIL}.`],
    },
  ],
};
