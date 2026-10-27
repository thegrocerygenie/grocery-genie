/**
 * Settings → Help & feedback: answers to common questions, and feedback by
 * email to the address in src/constants/links.ts.
 */
import React from 'react';
import { Alert, Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import HelpScreen from '../../app/settings/help';
import { SUPPORT_EMAIL } from '@/constants/links';
import { HELP_TOPICS } from '@/features/settings/content/help';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '0.1.0' } }));

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('Help & feedback', () => {
  it('lists every help topic with its answer', () => {
    render(<HelpScreen />);

    for (const topic of HELP_TOPICS) {
      expect(screen.getByText(topic.question)).toBeTruthy();
      expect(screen.getByText(topic.answer)).toBeTruthy();
    }
  });

  it('opens Mail to the support address, with the app version in the subject', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<HelpScreen />);

    fireEvent.press(screen.getByLabelText('Send feedback'));

    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(open).toHaveBeenCalledWith(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Grocery Genie feedback (v0.1.0)')}`,
    );
  });

  it('shows the address when no mail app can send', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const open = jest.spyOn(Linking, 'openURL');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(<HelpScreen />);

    fireEvent.press(screen.getByLabelText('Send feedback'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][1]).toContain(SUPPORT_EMAIL);
    expect(open).not.toHaveBeenCalled();
  });
});
