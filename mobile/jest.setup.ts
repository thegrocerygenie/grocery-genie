// The budget currency comes from the profile query (useMe). Screen tests mock
// their data hooks and render without a QueryClient, so they get the server's
// default here; a test that checks currency behavior sets its own value with
// jest.mocked(useBudgetCurrency).mockReturnValue('EUR').
jest.mock('@/hooks/useBudgetCurrency', () => ({
  useBudgetCurrency: jest.fn(() => 'USD'),
}));

// Profile writes from a layout; the hook has its own test (jest.unmock there).
jest.mock('@/hooks/useTimeZoneSync', () => ({ useTimeZoneSync: jest.fn() }));

// RevenueCat (V11-P0) is a native module. The app requires it lazily, but a
// test that reaches it gets this inert stand-in instead of the native bridge.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn(async () => ({ created: false })),
    getOfferings: jest.fn(async () => ({ current: null })),
    purchasePackage: jest.fn(async () => ({})),
    restorePurchases: jest.fn(async () => ({})),
  },
}));
