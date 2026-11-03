/**
 * The dashboard's category section at large Dynamic Type. The design says
 * "Test up to AX5". At AX5 the section header and its "Top items" link do not
 * fit on one line, and a category row has no room for the name, the icon and
 * the amount side by side, so the header wraps and the row stacks.
 */
import { renderRouter, screen } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { BudgetCategorySummary, DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const mockDashboard: { data: DashboardData | undefined } = { data: undefined };
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data: mockDashboard.data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

// React Native's iOS font scale for the default size and for AX5.
const DEFAULT_SCALE = 1;
const AX5_SCALE = 3.571;
const mockWindow = { fontScale: DEFAULT_SCALE };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockWindow.fontScale }),
}));

function category(name: string, spent: number, budget = 0): BudgetCategorySummary {
  return {
    category_id: name,
    name,
    budget,
    spent,
    remaining: budget - spent,
    percent: budget > 0 ? (spent / budget) * 100 : 0,
  };
}

function renderDashboard() {
  mockDashboard.data = {
    period: '2026-04',
    overall: { budget: 400, spent: 243, remaining: 157, percent: 60.75 },
    categories: [category('Groceries', 142, 175)],
    top_items: [],
    trend: [],
    previous_period: '2026-03',
    category_changes: [],
    has_receipts: true,
  };
  renderRouter({ index: DashboardScreen }, { initialUrl: '/' });
}

type Node = ReturnType<typeof screen.getByText>;

function styleOf(node: Node) {
  return StyleSheet.flatten(node.props.style) ?? {};
}

function nearestView(node: Node): Node {
  let n = node.parent;
  while (n && n.type !== 'View') n = n.parent;
  return n!;
}

function ancestors(node: Node): Node[] {
  const list: Node[] = [];
  for (let n = node.parent; n; n = n.parent) list.push(n);
  return list;
}

/** The innermost View that holds both nodes. */
function commonView(a: Node, b: Node): Node {
  const ofB = new Set(ancestors(b));
  return ancestors(a).find((n) => n.type === 'View' && ofB.has(n))!;
}

afterEach(() => {
  mockWindow.fontScale = DEFAULT_SCALE;
});

describe.each([
  ['default size', DEFAULT_SCALE],
  ['AX5', AX5_SCALE],
])('category section header at %s', (_size, scale) => {
  it('wraps, and each piece shrinks to the screen', () => {
    mockWindow.fontScale = scale;
    renderDashboard();

    const label = screen.getByText('BY CATEGORY');
    const link = screen.getByRole('button', { name: 'Top items' });
    expect(styleOf(nearestView(label)).flexWrap).toBe('wrap');
    expect(styleOf(label).flexShrink).toBe(1);
    expect(styleOf(link).flexShrink).toBe(1);
  });
});

describe('category row', () => {
  it('keeps the name and the amount on one line at the default size', () => {
    renderDashboard();

    const row = commonView(screen.getByText('Groceries'), screen.getByText('$142'));
    expect(styleOf(row).flexDirection).toBe('row');
  });

  it('puts the name on its own line at AX5, so it wraps instead of clipping', () => {
    mockWindow.fontScale = AX5_SCALE;
    renderDashboard();

    const name = screen.getByText('Groceries');
    const amount = screen.getByText('$142');
    expect(styleOf(commonView(name, amount)).flexDirection ?? 'column').toBe('column');
    expect(name.props.numberOfLines).toBeUndefined();
    expect(styleOf(amount).flexShrink).toBe(0);
  });
});

// The trend button had a fixed 44pt height, which clipped its label at AX5.
it('trend button grows with its label, and the label wraps beside the icon', () => {
  mockWindow.fontScale = AX5_SCALE;
  renderDashboard();

  const button = screen.getByRole('button', { name: 'See 3-month trend' });
  const label = screen.getByText('See 3-month trend');
  expect(styleOf(button).height).toBeUndefined();
  expect(styleOf(button).minHeight).toBeGreaterThanOrEqual(44);
  expect(styleOf(label).flexShrink).toBe(1);
  expect(styleOf(label).textAlign).toBe('center');
});

// The empty state's Scan Receipt button had a fixed 44pt height, so its label
// clipped at AX5.
it('empty-state Scan Receipt button grows with its label', () => {
  mockWindow.fontScale = AX5_SCALE;
  mockDashboard.data = undefined;
  renderRouter({ index: DashboardScreen }, { initialUrl: '/' });

  const button = screen.getByRole('button', { name: 'Scan receipt' });
  const label = screen.getByText('Scan Receipt');
  expect(styleOf(button).height).toBeUndefined();
  expect(styleOf(button).minHeight).toBeGreaterThanOrEqual(44);
  expect(styleOf(label).flexShrink).toBe(1);
  expect(styleOf(label).textAlign).toBe('center');
});
