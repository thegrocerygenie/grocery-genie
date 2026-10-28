/**
 * The consent sheet route answers the code that opened it (useAiConsentGate):
 * yes only after the server saved consent, no for manual entry or a swipe down.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AiConsentSheet, { SHEET_DISMISS_MS } from '../../app/ai-consent';
import { requestAiConsent } from '@/features/ai-consent/services/consentPrompt';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));
const mockGrant = jest.fn();
let mockGrantError = false;
jest.mock('@/features/ai-consent/hooks/useAiConsent', () => ({
  useGrantAiConsent: () => ({
    mutate: mockGrant,
    isPending: false,
    isError: mockGrantError,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGrantError = false;
});

it('closes once the server saved consent, and answers yes after the sheet is gone', async () => {
  mockGrant.mockImplementation((_v: unknown, opts: { onSuccess: () => void }) => opts.onSuccess());
  let answered: boolean | undefined;
  const answer = requestAiConsent(jest.fn()).then((a) => (answered = a));
  const { unmount } = render(<AiConsentSheet />);

  fireEvent.press(screen.getByRole('button', { name: 'Allow' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
  // iOS cannot open the photo picker while the sheet is still closing.
  await Promise.resolve();
  expect(answered).toBeUndefined();

  // The route unmounts as soon as the sheet starts closing; a picker presented
  // then lands on the closing sheet, and iOS drops it with no error.
  jest.useFakeTimers();
  try {
    unmount();
    await Promise.resolve();
    expect(answered).toBeUndefined();

    jest.advanceTimersByTime(SHEET_DISMISS_MS);
    await answer;
    expect(answered).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('stays open with the reason when saving fails', () => {
  mockGrantError = true;
  render(<AiConsentSheet />);

  expect(screen.getByText('Couldn’t save. Check your connection and try again.')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

it('answers no and opens manual entry', async () => {
  const answer = requestAiConsent(jest.fn());
  render(<AiConsentSheet />);

  fireEvent.press(screen.getByRole('button', { name: 'Enter receipts manually' }));

  await expect(answer).resolves.toBe(false);
  expect(mockReplace).toHaveBeenCalledWith('/manual-entry');
  expect(mockGrant).not.toHaveBeenCalled();
});

it('answers no when swiped down', async () => {
  const answer = requestAiConsent(jest.fn());
  const { unmount } = render(<AiConsentSheet />);

  unmount();

  await expect(answer).resolves.toBe(false);
});

it('does not answer a newer request with the delayed yes', async () => {
  mockGrant.mockImplementation((_v: unknown, opts: { onSuccess: () => void }) => opts.onSuccess());
  const first = requestAiConsent(jest.fn());
  const { unmount } = render(<AiConsentSheet />);
  fireEvent.press(screen.getByRole('button', { name: 'Allow' }));

  jest.useFakeTimers();
  try {
    unmount();
    let second: boolean | undefined;
    void requestAiConsent(jest.fn()).then((a) => (second = a));
    jest.advanceTimersByTime(SHEET_DISMISS_MS);

    await expect(first).resolves.toBe(true);
    expect(second).toBeUndefined();
  } finally {
    jest.useRealTimers();
  }
});
