/**
 * V11-P5: Settings → "Claim your waitlist offer", for an account whose email
 * is not the one it joined the waitlist with (Apple's Hide My Email). The
 * user enters the waitlist email; the server sends a link to it.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import WaitlistOfferScreen from '../../app/settings/waitlist-offer';
import ConfirmWaitlistClaimScreen from '../../app/onboarding/confirm-waitlist-claim';
import { Linking, StyleSheet, type ViewStyle } from 'react-native';
import { spacing } from '@/constants/theme';
import { SUPPORT_EMAIL } from '@/constants/links';
import { WAITLIST_OFFER_STRINGS as S } from '@/features/premium/content/waitlistOffer';
import { ApiError } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const mockOffer = jest.fn();
const mockRequest = jest.fn();
const mockConfirm = jest.fn();
jest.mock('@/features/premium/services/waitlistOfferApi', () => ({
  getWaitlistOffer: () => mockOffer(),
  requestWaitlistClaim: (email: string) => mockRequest(email),
  confirmWaitlistClaim: (token: string) => mockConfirm(token),
}));
jest.mock('@/features/auth/services/authApi', () => ({
  fetchMe: async () => ({ id: 'u-1', is_premium: false }),
}));

function renderAt(url: string) {
  return renderRouter(
    {
      _layout: () => {
        const { Stack } = jest.requireActual('expo-router');
        return (
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
          >
            <Stack />
          </QueryClientProvider>
        );
      },
      index: () => null,
      'settings/waitlist-offer': WaitlistOfferScreen,
      'onboarding/confirm-waitlist-claim': ConfirmWaitlistClaimScreen,
      'onboarding/sign-in': () => null,
    },
    { initialUrl: url },
  );
}

const open = {
  window_open: true,
  claim_available: true,
  closes_at: '2027-04-01T00:00:00Z',
  redemption: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ accessToken: 'token' });
  mockOffer.mockResolvedValue(open);
  mockRequest.mockResolvedValue({ status: 'sent' });
});

describe('Claim your waitlist offer', () => {
  it('sends a link to the waitlist email and says where to look', async () => {
    renderAt('/settings/waitlist-offer');
    const input = await screen.findByLabelText(S.emailLabel);
    const send = screen.getByLabelText(S.send);
    // Nothing to send until the email looks like one.
    expect(send.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(input, 'member@example.com');
    fireEvent.press(screen.getByLabelText(S.send));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('member@example.com'));
    expect(await screen.findByText(S.sentTitle)).toBeTruthy();
    expect(screen.getByText(S.sentBody('member@example.com'))).toBeTruthy();
  });

  it('shows why a claim was refused, inline', async () => {
    mockRequest.mockRejectedValue(
      new ApiError(409, { detail: { code: 'waitlist_offer_redeemed' } }),
    );
    renderAt('/settings/waitlist-offer');

    fireEvent.changeText(await screen.findByLabelText(S.emailLabel), 'member@example.com');
    fireEvent.press(screen.getByLabelText(S.send));

    expect(await screen.findByText(S.errorRedeemed)).toBeTruthy();
  });

  it('says the offer has closed instead of showing the form', async () => {
    mockOffer.mockResolvedValue({ ...open, window_open: false, claim_available: false });
    renderAt('/settings/waitlist-offer');

    expect(await screen.findByText(S.closedBody)).toBeTruthy();
    expect(screen.queryByLabelText(S.emailLabel)).toBeNull();
  });

  it('shows the free year once it is granted', async () => {
    mockOffer.mockResolvedValue({
      ...open,
      claim_available: false,
      redemption: { status: 'granted', expires_at: '2028-01-10T12:00:00Z' },
    });
    renderAt('/settings/waitlist-offer');

    expect(await screen.findByText(S.grantedTitle)).toBeTruthy();
    expect(screen.queryByLabelText(S.emailLabel)).toBeNull();
  });

  it('pads the bottom of the screen with a theme token', async () => {
    renderAt('/settings/waitlist-offer');

    const scroll = await screen.findByTestId('waitlist-offer-scroll');
    const style = StyleSheet.flatten(scroll.props.contentContainerStyle as ViewStyle);
    expect(style.paddingBottom).toBe(spacing.screenBottom);
  });

  it('says a failed free year needs support, and emails support', async () => {
    const canOpen = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockOffer.mockResolvedValue({
      ...open,
      claim_available: false,
      redemption: { status: 'failed', expires_at: null },
    });
    renderAt('/settings/waitlist-offer');

    expect(await screen.findByText(S.grantFailedBody)).toBeTruthy();
    expect(screen.queryByText(S.pendingTitle)).toBeNull();
    fireEvent.press(screen.getByLabelText(S.contactSupport));

    await waitFor(() =>
      expect(openUrl).toHaveBeenCalledWith(expect.stringContaining(`mailto:${SUPPORT_EMAIL}`)),
    );
    canOpen.mockRestore();
    openUrl.mockRestore();
  });
});

describe('the claim link', () => {
  it('confirms the token and says the free year is on', async () => {
    mockConfirm.mockResolvedValue({ status: 'granted', expires_at: '2028-01-10T12:00:00Z' });
    renderAt('/onboarding/confirm-waitlist-claim?token=tok');

    expect(await screen.findByText(S.confirmedTitle)).toBeTruthy();
    expect(mockConfirm).toHaveBeenCalledWith('tok');
  });

  it('says to contact support when the free year could not be applied', async () => {
    mockConfirm.mockResolvedValue({ status: 'failed', expires_at: null });
    renderAt('/onboarding/confirm-waitlist-claim?token=abc');

    expect(await screen.findByText(S.grantFailedBody)).toBeTruthy();
    expect(screen.queryByText(S.confirmedTitle)).toBeNull();
  });

  it('explains a refused link', async () => {
    mockConfirm.mockRejectedValue(new ApiError(409, { detail: { code: 'waitlist_offer_closed' } }));
    renderAt('/onboarding/confirm-waitlist-claim?token=tok');

    expect(await screen.findByText(S.errorClosed)).toBeTruthy();
  });
});
