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

  // docs/marketing/decisions.md #2 and #7: waitlist sign-ups get a free year of
  // Premium, matched by comparing the waitlist email with the account email.
  // docs/launch-open-items.md §6 asks the policy to say so before the waitlist grows.
  it('says the waitlist email is matched to the account to apply the offer', () => {
    expect(text()).toMatch(/joined the waitlist on our website/i);
    expect(text()).toMatch(/compare it with the email address on your account/i);
    expect(text()).toMatch(/free year of Premium/);
    expect(text()).toMatch(/Resend sends account emails[^.]*and keeps our waitlist/);
  });

  // docs/marketing/decisions.md #10 and #11: unsubscribing keeps the offer,
  // deleting gives it up, and the waitlist is deleted when the claim window closes.
  it('says unsubscribing keeps the offer and how long waitlist emails are kept', () => {
    expect(text()).toMatch(/Unsubscribing stops our emails but keeps your address for the offer/);
    expect(text()).toMatch(/ask us to delete it, you give up the free year/i);
    expect(text()).toMatch(
      /Waitlist email addresses: until 90 days after Premium launches, when the free-year offer closes/,
    );
  });

  // docs/marketing/decisions.md #13: a redeemed free year leaves a one-way
  // fingerprint of the waitlist email after account deletion, until the offer closes.
  it('says a redeemed waitlist offer leaves a fingerprint after account deletion', () => {
    expect(text()).toMatch(
      /keep a one-way fingerprint of your waitlist email, not the email itself, until the offer closes/,
    );
  });

  // docker/docker-compose.yml rotates logs by size (5 × 10 MB per service), and
  // a host job deletes rotated files after 30 days (docs/DEPLOYMENT.md 1.9).
  // A quiet service's current file can hold older lines, so the text must not
  // promise a hard 30-day limit.
  it('describes server logs as the rotation and cleanup enforce them', () => {
    expect(text()).not.toMatch(/Server logs: up to 30 days/);
    expect(text()).toMatch(/about 50 MB/);
    expect(text()).toMatch(/never archived/i);
    expect(text()).toMatch(/older log files are deleted after 30 days/i);
  });
});
