import { WAITLIST_OFFER_STRINGS as S } from '@/features/premium/content/waitlistOffer';
import { apiErrorCode } from '@/services/api';

/** The message for a refused claim, from the server's error code. */
export function claimErrorMessage(error: unknown): string {
  switch (apiErrorCode(error)) {
    case 'waitlist_offer_redeemed':
      return S.errorRedeemed;
    case 'waitlist_offer_closed':
      return S.errorClosed;
    case 'waitlist_not_eligible':
      return S.errorNotEligible;
    case 'invalid_token':
      return S.errorInvalidLink;
    case 'invalid_email':
      return S.errorInvalidEmail;
    default:
      return S.errorGeneric;
  }
}

/** Enough of an email to send: something@something.tld. */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** A date for the offer's copy, in the strings' locale. */
export function offerDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(S.dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
