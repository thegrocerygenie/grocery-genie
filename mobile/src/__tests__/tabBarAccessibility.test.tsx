/**
 * The floating tab bar: VoiceOver hears a tab bar with tabs, and Reduce
 * Transparency swaps its blur for an opaque background.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { Slot } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';

import TabsLayout from '../../app/(tabs)/_layout';
import { colors } from '@/constants/theme';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('expo-blur', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    BlurView: (props: object) => (
      <MockView testID="tab-bar-blur">
        <MockView {...props} />
      </MockView>
    ),
  };
});
let mockReduceTransparency = false;
jest.mock('@/hooks/useAccessibilitySetting', () => ({
  useReduceTransparency: () => mockReduceTransparency,
}));

function renderTabs() {
  renderRouter(
    {
      '(tabs)/_layout': TabsLayout,
      '(tabs)/(budget)/_layout': () => <Slot />,
      '(tabs)/(budget)/index': () => null,
      '(tabs)/scan': () => null,
      '(tabs)/history/_layout': () => <Slot />,
      '(tabs)/history/index': () => null,
    },
    { initialUrl: '/' },
  );
}

beforeEach(() => {
  mockReduceTransparency = false;
});

describe('Tab bar accessibility', () => {
  it('is a tab list of tabs, with the current one selected', async () => {
    renderTabs();

    // The container stays non-accessible so VoiceOver reaches the tabs inside it,
    // which is why it is found by test ID, not by role.
    expect((await screen.findByTestId('tab-bar')).props.accessibilityRole).toBe('tablist');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.props.accessibilityLabel)).toEqual(['Budget', 'Scan', 'History']);
    expect(screen.getByRole('tab', { name: 'Budget', selected: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
  });

  it('caps the pill labels so the floating bar keeps its shape at AX sizes', async () => {
    renderTabs();
    await screen.findByTestId('tab-bar');
    for (const label of ['Budget', 'Scan', 'History']) {
      expect(screen.getByText(label).props.maxFontSizeMultiplier).toBe(1.3);
    }
  });

  it('blurs by default', async () => {
    renderTabs();
    expect((await screen.findByTestId('tab-bar')).props.accessibilityRole).toBe('tablist');
    expect(screen.getByTestId('tab-bar-blur')).toBeTruthy();
  });

  it('is opaque, with no blur, under Reduce Transparency', async () => {
    mockReduceTransparency = true;
    renderTabs();

    const bar = await screen.findByTestId('tab-bar');
    expect(bar.props.accessibilityRole).toBe('tablist');
    expect(screen.queryByTestId('tab-bar-blur')).toBeNull();
    expect(StyleSheet.flatten(bar.props.style).backgroundColor).toEqual(colors.iosBg2);
  });
});
