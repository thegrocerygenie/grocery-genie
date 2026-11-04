/**
 * V11-P5: the waitlist's free year. The app reads the offer, asks for a claim
 * link to the waitlist email, and confirms the link; the server decides who
 * qualifies and grants Premium through RevenueCat.
 */
import { ApiError } from '@/services/api';
import {
  confirmWaitlistClaim,
  getWaitlistOffer,
  requestWaitlistClaim,
} from '../services/waitlistOfferApi';
import { claimErrorMessage, isPlausibleEmail } from '../utils/waitlistOffer';
import { WAITLIST_OFFER_STRINGS as S } from '../content/waitlistOffer';

const mockApiClient = jest.fn();
jest.mock('@/services/api', () => {
  const actual = jest.requireActual('@/services/api');
  return { ...actual, apiClient: (...a: unknown[]) => mockApiClient(...a) };
});

beforeEach(() => mockApiClient.mockReset().mockResolvedValue({}));

describe('waitlist offer API', () => {
  it('reads the offer', async () => {
    await getWaitlistOffer();
    expect(mockApiClient).toHaveBeenCalledWith('/api/users/me/waitlist-offer');
  });

  it('asks for a claim link to the waitlist email, trimmed', async () => {
    await requestWaitlistClaim('  member@example.com ');
    expect(mockApiClient).toHaveBeenCalledWith('/api/users/me/waitlist-offer/claim', {
      method: 'POST',
      body: JSON.stringify({ email: 'member@example.com' }),
    });
  });

  it('confirms the link without needing a session', async () => {
    await confirmWaitlistClaim('tok');
    expect(mockApiClient).toHaveBeenCalledWith('/api/users/me/waitlist-offer/confirm', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok' }),
      skipAuth: true,
    });
  });
});

describe('claim errors', () => {
  const err = (status: number, code: string) => new ApiError(status, { detail: { code } });

  it('maps each server code to a message', () => {
    expect(claimErrorMessage(err(409, 'waitlist_offer_redeemed'))).toBe(S.errorRedeemed);
    expect(claimErrorMessage(err(409, 'waitlist_offer_closed'))).toBe(S.errorClosed);
    expect(claimErrorMessage(err(409, 'waitlist_not_eligible'))).toBe(S.errorNotEligible);
    expect(claimErrorMessage(err(400, 'invalid_token'))).toBe(S.errorInvalidLink);
    expect(claimErrorMessage(new Error('offline'))).toBe(S.errorGeneric);
  });

  it('checks the email looks like one before sending', () => {
    expect(isPlausibleEmail('member@example.com')).toBe(true);
    expect(isPlausibleEmail(' member@example.com ')).toBe(true);
    expect(isPlausibleEmail('member@')).toBe(false);
    expect(isPlausibleEmail('example.com')).toBe(false);
  });
});
