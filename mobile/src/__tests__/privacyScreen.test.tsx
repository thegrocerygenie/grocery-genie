/**
 * Settings → Privacy: an in-app policy drafted from what the app stores and
 * sends, shown with a draft banner until it has been reviewed.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';

import PrivacyScreen from '../../app/settings/privacy';
import { PRIVACY_EMAIL } from '@/constants/links';
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

  const text = () => PRIVACY_POLICY.sections.flatMap((s) => s.paragraphs).join(' ');
  const headings = () => PRIVACY_POLICY.sections.map((s) => s.heading);

  it('says who we are and how to reach us about privacy', () => {
    expect(text()).toContain('The Grocery Genie Inc.');
    expect(text()).toContain(PRIVACY_EMAIL);
  });

  it('names every company that processes data for us', () => {
    for (const processor of [
      'Hetzner',
      'Supabase',
      'Anthropic',
      'Expo',
      'Resend',
      'Apple',
      'Google',
    ]) {
      expect(text()).toContain(processor);
    }
  });

  it('points to in-app account deletion and says deleted data is erased', () => {
    expect(text()).toMatch(/Settings → Delete account/);
    expect(text()).toMatch(/permanently erased/i);
    expect(text()).not.toMatch(/not yet erased/i);
  });

  // App Store 5.1.2(i): the app asks before a receipt goes to Anthropic
  // (app/ai-consent.tsx), and Settings turns it off.
  it('says receipts go to Anthropic only after the user allows it, and how to stop', () => {
    expect(text()).toMatch(/only after you allow it/i);
    expect(text()).toMatch(/Settings → Read receipts with AI/);
    expect(text()).toMatch(/enter receipts manually/i);
  });

  it('covers retention, rights, children, security and changes', () => {
    for (const heading of [
      'How long we keep it',
      'Your choices and rights',
      'Children',
      'Security',
      'Changes to this policy',
    ]) {
      expect(headings()).toContain(heading);
    }
    expect(PRIVACY_POLICY.effective).toMatch(/2026/);
  });
});
