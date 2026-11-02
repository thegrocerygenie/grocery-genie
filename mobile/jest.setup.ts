// The budget currency comes from the profile query (useMe). Screen tests mock
// their data hooks and render without a QueryClient, so they get the server's
// default here; a test that checks currency behavior sets its own value with
// jest.mocked(useBudgetCurrency).mockReturnValue('EUR').
jest.mock('@/hooks/useBudgetCurrency', () => ({
  useBudgetCurrency: jest.fn(() => 'USD'),
}));

// Profile writes from a layout; the hook has its own test (jest.unmock there).
jest.mock('@/hooks/useTimeZoneSync', () => ({ useTimeZoneSync: jest.fn() }));
