/**
 * Consent to send receipts to third-party AI (App Store 5.1.2(i)).
 *
 * The version names the text below. Bump it with the server's
 * AI_CONSENT_POLICY_VERSION (backend/app/services/ai_consent.py) whenever this
 * text changes what is sent, to whom, or why: every user is then asked again.
 */
export const AI_CONSENT_POLICY_VERSION = '2026-10-27';

export const AI_CONSENT_COPY = {
  title: 'Read receipts with AI',
  intro:
    'To read a receipt, Grocery Genie sends the receipt photo and the item names on it to Anthropic, which runs the Claude AI model.',
  points: [
    {
      symbol: 'doc.text.viewfinder',
      text: 'Why: to read the store, items and prices, and to suggest categories.',
    },
    {
      symbol: 'hand.raised.fill',
      text: 'Anthropic does not train its models on this data.',
    },
    {
      symbol: 'gearshape.fill',
      text: 'You can turn this off at any time in Settings → Read receipts with AI.',
    },
  ],
  allow: 'Allow',
  manual: 'Enter receipts manually',
  saveFailed: 'Couldn’t save. Check your connection and try again.',
} as const;

export const AI_CONSENT_SETTINGS_COPY = {
  header: 'AI',
  title: 'Read receipts with AI',
  footer: 'Sends receipt photos and item names to Anthropic’s Claude to read them.',
  offTitle: 'Turn off AI receipt reading?',
  offMessage:
    'Scans and imports stop until you turn this back on. Photos waiting to upload stay on this phone. You can still enter receipts manually.',
  offConfirm: 'Turn Off',
  cancel: 'Cancel',
  offFailedTitle: 'Couldn’t turn off AI receipt reading',
  offFailedMessage: 'Check your connection and try again.',
} as const;
