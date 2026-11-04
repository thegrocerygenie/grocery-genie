/**
 * User-facing strings for the waitlist's free year of Premium (V11-P5):
 * the Settings row, "Claim your waitlist offer" and the claim link screen.
 * Externalized for i18n.
 */
export const WAITLIST_OFFER_STRINGS = {
  /** The locale these strings are written in; dates use it. */
  dateLocale: 'en-US',
  settingsRow: 'Claim your waitlist offer',
  settingsDetail: 'A free year of Premium',
  screenTitle: 'Waitlist offer',
  backTitle: 'Settings',
  heading: 'A free year of Premium',
  intro:
    'Joined our waitlist with a different email, or signed in with Hide My Email? Enter the email you joined with and we’ll send it a link. Tap the link on this iPhone to start your free year.',
  emailLabel: 'Waitlist email',
  emailPlaceholder: 'you@example.com',
  send: 'Send link',
  sending: 'Sending…',
  closesOn: (date: string) => `Claim it by ${date}.`,
  sentTitle: 'Check your inbox',
  sentBody: (email: string) =>
    `If ${email} is on our waitlist, we’ve sent it a link. It works for 24 hours.`,
  sendAgain: 'Use a different email',
  closedBody: 'The waitlist offer has closed.',
  grantedTitle: 'Your free year is on',
  grantedBody: (date: string) => `Premium is yours until ${date}.`,
  pendingTitle: 'Your free year is on its way',
  pendingBody: 'We matched your waitlist email. Premium will turn on shortly.',
  loadFailed: 'Couldn’t load the offer. Check your connection and try again.',
  retry: 'Try Again',
  // The claim link screen (onboarding/confirm-waitlist-claim).
  confirming: 'Claiming your free year…',
  confirmingLabel: 'Claiming your free year',
  confirmedTitle: 'Your free year is on',
  failedTitle: 'Couldn’t claim the offer',
  continue: 'Continue',
  // Errors, by the server's code.
  errorRedeemed: 'That waitlist email or this account already has its free year.',
  errorClosed: 'The waitlist offer has closed.',
  errorNotEligible: 'That email isn’t on our waitlist from before launch.',
  errorInvalidLink: 'This link is invalid or has expired. Ask for a new one in Settings.',
  errorInvalidEmail: 'Enter the email you joined the waitlist with.',
  errorGeneric: 'Something went wrong. Check your connection and try again.',
} as const;
