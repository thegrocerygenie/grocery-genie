/**
 * Settings → Read receipts with AI: the switch shows the account's consent.
 * Off asks first, then withdraws. On opens the consent sheet, so the user
 * reads the disclosure before allowing.
 */
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AiConsentSettingsSection } from '../components/AiConsentSettingsSection';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

let mockGranted: boolean | undefined = true;
const mockWithdraw = jest.fn();
const mockAsk = jest.fn();
jest.mock('../hooks/useAiConsent', () => ({
  useAiConsentStatus: () => mockGranted,
  useWithdrawAiConsent: () => ({ mutateAsync: mockWithdraw, isPending: false }),
  useAiConsentGate: () => ({
    ensureConsent: jest.fn(),
    askForConsent: mockAsk,
    markRequired: jest.fn(),
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted = true;
  mockWithdraw.mockResolvedValue(undefined);
  mockAsk.mockResolvedValue(true);
});

function toggle() {
  return screen.getByRole('switch', { name: 'Read receipts with AI' });
}

it('shows consent as on', () => {
  render(<AiConsentSettingsSection />);
  expect(toggle().props.value).toBe(true);
  expect(screen.getByText(/Anthropic/)).toBeTruthy();
});

it('shows consent as off', () => {
  mockGranted = false;
  render(<AiConsentSettingsSection />);
  expect(toggle().props.value).toBe(false);
});

it('asks before turning off, then withdraws', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  render(<AiConsentSettingsSection />);

  fireEvent(toggle(), 'valueChange', false);

  expect(alert).toHaveBeenCalledTimes(1);
  expect(mockWithdraw).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as AlertButton[];
  const turnOff = buttons.find((b) => b.style === 'destructive');
  turnOff?.onPress?.();
  await waitFor(() => expect(mockWithdraw).toHaveBeenCalledTimes(1));
});

it('keeps consent when the user cancels', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  render(<AiConsentSettingsSection />);

  fireEvent(toggle(), 'valueChange', false);
  const buttons = alert.mock.calls[0][2] as AlertButton[];
  buttons.find((b) => b.style === 'cancel')?.onPress?.();

  expect(mockWithdraw).not.toHaveBeenCalled();
});

it('tells the user when withdrawing failed', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockWithdraw.mockRejectedValue(new TypeError('Network request failed'));
  render(<AiConsentSettingsSection />);

  fireEvent(toggle(), 'valueChange', false);
  (alert.mock.calls[0][2] as AlertButton[]).find((b) => b.style === 'destructive')?.onPress?.();

  await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
  expect(alert.mock.calls[1][0]).toMatch(/Couldn’t turn off/);
});

it('turning on opens the consent sheet', () => {
  mockGranted = false;
  render(<AiConsentSettingsSection />);
  fireEvent(toggle(), 'valueChange', true);
  expect(mockAsk).toHaveBeenCalledTimes(1);
  expect(mockWithdraw).not.toHaveBeenCalled();
});
