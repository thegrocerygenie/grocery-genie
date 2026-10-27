/**
 * Settings → Privacy: an in-app policy drafted from what the app stores and
 * sends, shown with a draft banner until it has been reviewed.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';

import PrivacyScreen from '../../app/settings/privacy';
import { SUPPORT_EMAIL } from '@/constants/links';
import { PRIVACY_POLICY } from '@/features/settings/content/privacy';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

describe('Privacy policy', () => {
  it('shows every section with its text', () => {
    render(<PrivacyScreen />);

    for (const section of PRIVACY_POLICY.sections) {
      expect(screen.getByText(section.heading)).toBeTruthy();
      for (const paragraph of section.paragraphs) {
        expect(screen.getByText(paragraph)).toBeTruthy();
      }
    }
  });

  it('marks itself as a draft until it is reviewed', () => {
    render(<PrivacyScreen />);

    expect(PRIVACY_POLICY.reviewed).toBe(false);
    expect(screen.getByText(/Draft/)).toBeTruthy();
  });

  it('names who processes receipts and how to reach us', () => {
    const text = PRIVACY_POLICY.sections.flatMap((s) => s.paragraphs).join(' ');

    for (const processor of ['Anthropic', 'Expo', 'Resend', 'Apple', 'Google']) {
      expect(text).toContain(processor);
    }
    expect(text).toContain(SUPPORT_EMAIL);
    // The app has no in-app account deletion yet; the policy must not claim it.
    expect(text).not.toMatch(/delete your account in (the app|Settings)/i);
  });
});
