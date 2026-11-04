import { apiClient } from '@/services/api';

/** A matched free year: pending while the RevenueCat grant is retried; failed when it could not be applied (contact support). */
export interface WaitlistRedemption {
  status: 'pending' | 'granted' | 'failed';
  expires_at: string | null;
}

/** `GET /api/users/me/waitlist-offer` (V11-P5). */
export interface WaitlistOffer {
  window_open: boolean;
  /** Show "Claim your waitlist offer": open, and no free year yet. */
  claim_available: boolean;
  closes_at: string | null;
  redemption: WaitlistRedemption | null;
}

export function getWaitlistOffer(): Promise<WaitlistOffer> {
  return apiClient<WaitlistOffer>('/api/users/me/waitlist-offer');
}

/**
 * Ask the server to send a claim link to the waitlist email. It answers the
 * same whether or not the email is on the waitlist.
 */
export function requestWaitlistClaim(email: string): Promise<{ status: 'sent' }> {
  return apiClient('/api/users/me/waitlist-offer/claim', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
}

/** The link in the claim email: the token is the proof, so no session needed. */
export function confirmWaitlistClaim(token: string): Promise<WaitlistRedemption> {
  return apiClient('/api/users/me/waitlist-offer/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
    skipAuth: true,
  });
}
