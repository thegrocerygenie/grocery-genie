/**
 * BC-02 AC 4: the Budget settings screen edits the user's budgets in place.
 * It prefills saved limits, PATCHes the ones that changed, deletes a cleared
 * category limit, and only POSTs categories that had no budget.
 */
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import BudgetSettingsScreen from '../../app/budget-settings';
import type { BudgetResponse } from '@/features/budget/types';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const mockCreate = jest.fn().mockResolvedValue({});
const mockUpdate = jest.fn().mockResolvedValue({});
const mockDelete = jest.fn().mockResolvedValue(undefined);
const mockBudgets: { data: BudgetResponse[] | undefined } = { data: undefined };

jest.mock('@/features/budget/hooks/useBudget', () => ({
  useBudgets: () => ({ data: mockBudgets.data, isLoading: false }),
  useBudgetCreate: () => ({ mutateAsync: mockCreate }),
  useBudgetUpdate: () => ({ mutateAsync: mockUpdate }),
  useBudgetDelete: () => ({ mutateAsync: mockDelete }),
}));
jest.mock('@/features/budget/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 'c-groc', name: 'Groceries', is_default: true, sort_order: 1 },
      { id: 'c-hou', name: 'Household', is_default: true, sort_order: 2 },
    ],
  }),
}));

function budget(id: string, categoryId: string | null, amount: number, start: string) {
  return {
    id,
    category_id: categoryId,
    amount,
    period_type: 'monthly',
    period_start: start,
    rollover_enabled: false,
  };
}

let routerScreen: ReturnType<typeof renderRouter>;

function renderSettings() {
  // Open settings from another screen, as the app does, so Save can go back.
  // The Stack layout renders the header, where Save lives.
  routerScreen = renderRouter(
    {
      // Mirrors app/_layout.tsx, which declares this route as a modal.
      _layout: () => (
        <Stack>
          <Stack.Screen
            name="budget-settings"
            options={{ title: 'Budget Settings', presentation: 'modal' }}
          />
        </Stack>
      ),
      index: () => null,
      'budget-settings': BudgetSettingsScreen,
    },
    { initialUrl: '/' },
  );
  act(() => router.push('/budget-settings'));
}

async function save() {
  fireEvent.press(screen.getByLabelText('Save'));
  // Save closes the screen once every change is stored.
  await waitFor(() => expect(routerScreen.getPathname()).toBe('/'));
}

describe('Budget settings edits budgets in place', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBudgets.data = [
      budget('b-overall', null, 500, '2026-10-15'),
      budget('b-groc', 'c-groc', 200, '2026-10-01'),
    ];
  });

  it('prefills the saved limits and start day', () => {
    renderSettings();

    expect(screen.getByLabelText('Monthly limit').props.value).toBe('500');
    expect(screen.getByLabelText('Start day').props.value).toBe('15');
    expect(screen.getByLabelText('Groceries budget amount').props.value).toBe('200');
    expect(screen.getByLabelText('Household budget amount').props.value).toBe('');
    expect(screen.getByText('Resets on the 15th of each month.')).toBeTruthy();
  });

  it('updates a changed limit instead of creating another budget', async () => {
    renderSettings();

    fireEvent.changeText(screen.getByLabelText('Monthly limit'), '600');
    await save();

    expect(mockUpdate).toHaveBeenCalledWith({ budgetId: 'b-overall', data: { amount: 600 } });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('moves the start day on the overall budget', async () => {
    renderSettings();

    fireEvent.changeText(screen.getByLabelText('Start day'), '1');
    await save();

    expect(mockUpdate).toHaveBeenCalledWith({
      budgetId: 'b-overall',
      data: { amount: 500, period_start: expect.stringMatching(/^\d{4}-\d{2}-01$/) },
    });
  });

  it('names the start day it will save, at most the 28th', () => {
    renderSettings();

    fireEvent.changeText(screen.getByLabelText('Start day'), '31');

    expect(screen.getByText('Resets on the 28th of each month.')).toBeTruthy();
  });

  it('deletes a category limit the user cleared', async () => {
    renderSettings();

    fireEvent.changeText(screen.getByLabelText('Groceries budget amount'), '');
    await save();

    expect(mockDelete).toHaveBeenCalledWith('b-groc');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('creates a budget only for a category that had none', async () => {
    renderSettings();

    fireEvent.changeText(screen.getByLabelText('Household budget amount'), '50');
    await save();

    expect(mockCreate).toHaveBeenCalledWith({
      category_id: 'c-hou',
      amount: 50,
      period_type: 'monthly',
      period_start: expect.stringMatching(/^\d{4}-\d{2}-15$/),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('saves nothing when nothing changed', async () => {
    renderSettings();

    await save();

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
