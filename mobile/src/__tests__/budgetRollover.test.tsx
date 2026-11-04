/**
 * BC-FR Budget Management (V1.1, Premium): "Optional rollover toggle". Budget
 * settings has a rollover switch per budget for a Premium user, an upgrade
 * prompt for a free one, and the dashboard shows what rolled over.
 */
import { Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import BudgetSettingsScreen from '../../app/budget-settings';
import { ApiError } from '@/services/api';
import DashboardScreen from '../../app/(tabs)/(budget)/index';
import type { BudgetResponse, DashboardData } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const mockCreate = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue({});
const mockDelete = jest.fn().mockResolvedValue(undefined);
const mockRollover = jest.fn().mockResolvedValue({});
const mockBudgets: { data: BudgetResponse[] | undefined } = { data: undefined };
const mockPremium = { value: true };

jest.mock('@/features/budget/hooks/useBudget', () => ({
  useBudgets: () => ({ data: mockBudgets.data, isLoading: false }),
  useBudgetCreate: () => ({ mutateAsync: mockCreate }),
  useBudgetUpdate: () => ({ mutateAsync: mockUpdate }),
  useBudgetDelete: () => ({ mutateAsync: mockDelete }),
  useBudgetRollover: () => ({ mutateAsync: mockRollover }),
}));
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 'c-groc', name: 'Groceries', is_default: true, sort_order: 1 },
      { id: 'c-hou', name: 'Household', is_default: true, sort_order: 2 },
    ],
  }),
}));
jest.mock('@/features/premium/hooks/usePremium', () => ({
  useIsPremium: () => mockPremium.value,
}));

const mockDashboard: { data: DashboardData | undefined } = { data: undefined };
jest.mock('@/features/budget/hooks/useDashboard', () => ({
  useDashboardSpending: () => ({
    data: mockDashboard.data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

function budget(
  id: string,
  categoryId: string | null,
  amount: number,
  rollover = false,
): BudgetResponse {
  return {
    id,
    category_id: categoryId,
    amount,
    period_type: 'monthly',
    period_start: '2026-10-01',
    rollover_enabled: rollover,
  };
}

let routerScreen: ReturnType<typeof renderRouter>;

function renderSettings() {
  routerScreen = renderRouter(
    {
      _layout: () => (
        <Stack>
          <Stack.Screen name="budget-settings" options={{ presentation: 'modal' }} />
        </Stack>
      ),
      index: () => null,
      paywall: () => null,
      'budget-settings': BudgetSettingsScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/budget-settings'));
}

async function save() {
  fireEvent.press(screen.getByLabelText('Save'));
  await waitFor(() => expect(routerScreen.getPathname()).toBe('/'));
}

describe('Budget settings rollover (Premium)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPremium.value = true;
    mockBudgets.data = [budget('b-overall', null, 500), budget('b-groc', 'c-groc', 200, true)];
  });

  it('shows a rollover switch for each budget, set as saved', () => {
    renderSettings();

    expect(screen.getByLabelText('Roll over unspent Monthly budget').props.value).toBe(false);
    expect(screen.getByLabelText('Roll over unspent Groceries').props.value).toBe(true);
    // Household has no limit, so nothing to roll over.
    expect(screen.queryByLabelText('Roll over unspent Household')).toBeNull();
    expect(screen.queryByTestId('premium-upgrade-prompt')).toBeNull();
  });

  it('saves only the switches that changed', async () => {
    renderSettings();

    fireEvent(screen.getByLabelText('Roll over unspent Monthly budget'), 'valueChange', true);
    await save();

    expect(mockRollover).toHaveBeenCalledTimes(1);
    expect(mockRollover).toHaveBeenCalledWith({ budgetId: 'b-overall', enabled: true });
  });

  it('turns rollover on for a budget it creates', async () => {
    mockCreate.mockResolvedValueOnce(budget('b-hou', 'c-hou', 40));
    renderSettings();

    fireEvent.changeText(screen.getByLabelText('Household budget amount'), '40');
    fireEvent(screen.getByLabelText('Roll over unspent Household'), 'valueChange', true);
    await save();

    expect(mockRollover).toHaveBeenCalledWith({ budgetId: 'b-hou', enabled: true });
  });

  it('opens the paywall, not an error, when Premium lapsed before Save', async () => {
    mockRollover.mockRejectedValueOnce(
      new ApiError(403, { detail: { code: 'premium_required', feature: 'budget_rollover' } }),
    );
    renderSettings();

    fireEvent(screen.getByLabelText('Roll over unspent Monthly budget'), 'valueChange', true);
    fireEvent.press(screen.getByLabelText('Save'));

    await waitFor(() => expect(routerScreen.getPathname()).toBe('/paywall'));
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('Budget settings rollover (free)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPremium.value = false;
    mockBudgets.data = [budget('b-overall', null, 500)];
  });

  it('invites a free user to upgrade instead of showing switches', () => {
    renderSettings();

    expect(screen.getByTestId('premium-upgrade-prompt')).toBeTruthy();
    expect(screen.queryByLabelText('Roll over unspent Monthly budget')).toBeNull();
  });

  it('opens the paywall from the prompt', () => {
    renderSettings();

    fireEvent.press(screen.getByLabelText('See Premium'));

    expect(routerScreen.getPathname()).toBe('/paywall');
  });
});

describe('Dashboard shows what rolled over', () => {
  function withRollover(rolled: number) {
    mockDashboard.data = {
      period: '2026-04',
      overall: {
        budget: 400 + rolled,
        spent: 100,
        remaining: 300 + rolled,
        percent: 25,
        rolled_over: rolled,
      },
      categories: [],
      top_items: [],
      trend: [],
      previous_period: '2026-03',
      category_changes: [],
      has_receipts: true,
    };
  }

  it('says how much of the limit rolled over', () => {
    withRollover(40);
    renderRouter({ index: DashboardScreen }, { initialUrl: '/' });

    expect(screen.getByText('Includes $40 rolled over')).toBeTruthy();
  });

  it('says nothing without a rollover', () => {
    withRollover(0);
    renderRouter({ index: DashboardScreen }, { initialUrl: '/' });

    expect(screen.queryByText(/rolled over/)).toBeNull();
  });
});
