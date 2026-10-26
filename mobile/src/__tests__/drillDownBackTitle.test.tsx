/**
 * Trend and Top items open from the Budget tab. Their back button must say
 * "Budget", not the route group name "(tabs)".
 */
import React from 'react';
import { Stack, router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import TopItemsScreen from '../../app/top-items';
import TrendScreen from '../../app/trend';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({ data: undefined, isLoading: true }),
}));

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

// The native stack passes header options to its host config as props.
function headerConfig(title: string): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
  const walk = (node: HostNode | string): void => {
    if (typeof node === 'string') return;
    if (node.type === 'RNSScreenStackHeaderConfig' && node.props.title === title) {
      found = node.props;
    }
    node.children?.forEach(walk);
  };
  const root = screen.toJSON() as HostNode | HostNode[] | null;
  (Array.isArray(root) ? root : root ? [root] : []).forEach(walk);
  return found;
}

function open(path: '/trend' | '/top-items') {
  renderRouter(
    {
      _layout: () => <Stack />,
      '(tabs)/index': () => null,
      trend: TrendScreen,
      'top-items': TopItemsScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push(path));
}

describe('drill-down back title', () => {
  it.each([
    ['/trend', 'Trend'],
    ['/top-items', 'Top items'],
  ] as const)('%s says "Budget" on its back button', (path, title) => {
    open(path);

    expect(headerConfig(title)?.backTitle).toBe('Budget');
  });
});
