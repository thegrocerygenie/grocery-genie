/**
 * Device check 2026-11-03, BUG-5: on iOS 26 and later the "Prices" large title
 * was not drawn (and Trend's, now and then). Both set a blur effect on their
 * header; iOS 26+ draws its own glass there, and the blur on top of it hides
 * the large title. Budget and History, whose titles draw, set the blur only
 * before iOS 26 (headerBlurFor). Jest can't draw a native header, so this
 * checks the options each screen gives it.
 */
import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

import PricesScreen from '../../app/items/index';
import TopItemsScreen from '../../app/top-items';
import TrendScreen from '../../app/trend';

type HeaderOptions = { title?: string; headerLargeTitle?: boolean; headerBlurEffect?: string };
const mockHeaders: HeaderOptions[] = [];

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  const MockStack = Object.assign(() => null, {
    Screen: ({ options }: { options: HeaderOptions }) => {
      mockHeaders.push(options);
      return null;
    },
  });
  return { ...actual, Stack: MockStack, useRouter: () => ({ push: jest.fn() }) };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-segmented-control/segmented-control', () => () => null);
jest.mock('@/features/price-intelligence/hooks/useItems', () => ({
  useItems: () => ({
    data: { items: [], pending_suggestions: 0 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    isRefetching: false,
  }),
}));
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({ data: undefined, isLoading: false }),
}));

function headerOf(screen: React.ComponentType): HeaderOptions {
  mockHeaders.length = 0;
  const Screen = screen;
  render(<Screen />);
  const options = mockHeaders[mockHeaders.length - 1];
  if (!options) throw new Error('the screen set no header options');
  return options;
}

const SCREENS: [string, React.ComponentType][] = [
  ['Items', PricesScreen],
  ['Trend', TrendScreen],
  ['Top items', TopItemsScreen],
];

describe('Large title headers on iOS 26 and later (BUG-5)', () => {
  const realVersion = Platform.Version;
  afterEach(() => {
    Object.defineProperty(Platform, 'Version', { value: realVersion, configurable: true });
  });

  it.each(SCREENS)('%s sets no header blur on iOS 27, so its large title draws', (_, screen) => {
    Object.defineProperty(Platform, 'Version', { value: '27.0', configurable: true });

    const options = headerOf(screen);
    expect(options.headerLargeTitle).toBe(true);
    expect(options.headerBlurEffect).toBeUndefined();
  });

  it.each(SCREENS)('%s keeps the blur before iOS 26, where nothing else is drawn', (_, screen) => {
    Object.defineProperty(Platform, 'Version', { value: '18.5', configurable: true });

    expect(headerOf(screen).headerBlurEffect).toBe('systemChromeMaterial');
  });
});
