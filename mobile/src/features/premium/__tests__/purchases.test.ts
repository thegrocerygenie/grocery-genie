/**
 * V11-P0 (D1): the RevenueCat SDK is a native module, so it loads only in a
 * development or App Store build. In Expo Go, without the SDK key, or when
 * the module is missing, Premium purchases are unavailable and nothing throws.
 */
import { ExecutionEnvironment } from 'expo-constants';

import {
  getPremiumOffer,
  isPurchasesAvailable,
  purchasePremium,
  resetPurchasesForTests,
  restorePremium,
} from '../services/purchases';

const mockConstants = { executionEnvironment: ExecutionEnvironment.Bare as string };
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
  ExecutionEnvironment: { StoreClient: 'storeClient', Bare: 'bare', Standalone: 'standalone' },
}));

const trial = {
  price: 0,
  priceString: '$0.00',
  cycles: 1,
  periodUnit: 'WEEK',
  periodNumberOfUnits: 1,
};
const monthly = {
  identifier: '$rc_monthly',
  product: {
    identifier: 'gg_premium_monthly',
    price: 4.99,
    priceString: '$4.99',
    currencyCode: 'USD',
    introPrice: trial,
  },
};
const annual = {
  identifier: '$rc_annual',
  product: {
    identifier: 'gg_premium_yearly',
    price: 39.99,
    priceString: '$39.99',
    currencyCode: 'USD',
    introPrice: { ...trial, periodUnit: 'DAY', periodNumberOfUnits: 7 },
  },
};
// RevenueCat's INTRO_ELIGIBILITY_STATUS: 1 ineligible, 2 eligible.
const ELIGIBLE = { status: 2, description: '' };
const mockPurchases = {
  configure: jest.fn(),
  logIn: jest.fn(async () => ({ created: false })),
  getOfferings: jest.fn(async () => ({
    current: { monthly, annual, availablePackages: [monthly, annual] },
  })),
  checkTrialOrIntroductoryPriceEligibility: jest.fn(
    async (): Promise<Record<string, { status: number; description: string }>> => ({
      gg_premium_monthly: ELIGIBLE,
      gg_premium_yearly: ELIGIBLE,
    }),
  ),
  purchasePackage: jest.fn(async () => ({ productIdentifier: 'gg_premium_monthly' })),
  restorePurchases: jest.fn(async () => ({})),
};
jest.mock('react-native-purchases', () => ({ __esModule: true, default: mockPurchases }));

beforeEach(() => {
  jest.clearAllMocks();
  resetPurchasesForTests();
  mockConstants.executionEnvironment = ExecutionEnvironment.Bare;
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_test';
});

describe('purchases availability', () => {
  it('is available in a development or App Store build with the SDK key', () => {
    expect(isPurchasesAvailable()).toBe(true);
  });

  it('is unavailable in Expo Go, which has no native module', () => {
    mockConstants.executionEnvironment = ExecutionEnvironment.StoreClient;
    expect(isPurchasesAvailable()).toBe(false);
  });

  it('is unavailable without the RevenueCat SDK key', () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = '';
    expect(isPurchasesAvailable()).toBe(false);
  });

  it('getPremiumOffer returns null when unavailable and never configures', async () => {
    mockConstants.executionEnvironment = ExecutionEnvironment.StoreClient;
    expect(await getPremiumOffer('u-1')).toBeNull();
    expect(mockPurchases.configure).not.toHaveBeenCalled();
  });
});

describe('the Premium offer', () => {
  it('PREM-01 AC 1: configures RevenueCat for the user and reads both plans, yearly first', async () => {
    const offer = await getPremiumOffer('u-1');
    expect(mockPurchases.configure).toHaveBeenCalledWith({
      apiKey: 'appl_test',
      appUserID: 'u-1',
    });
    expect(offer?.plans.map((p) => [p.kind, p.priceString, p.price])).toEqual([
      ['yearly', '$39.99', 39.99],
      ['monthly', '$4.99', 4.99],
    ]);
  });

  it('PREM-01 AC 2: a plan carries the 7-day trial only when the App Store allows it', async () => {
    let offer = await getPremiumOffer('u-1');
    expect(offer?.plans.map((p) => p.trialDays)).toEqual([7, 7]);
    expect(mockPurchases.checkTrialOrIntroductoryPriceEligibility).toHaveBeenCalledWith([
      'gg_premium_yearly',
      'gg_premium_monthly',
    ]);

    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValueOnce({
      gg_premium_monthly: { status: 1, description: '' },
      gg_premium_yearly: { status: 1, description: '' },
    });
    offer = await getPremiumOffer('u-1');
    expect(offer?.plans.map((p) => p.trialDays)).toEqual([null, null]);
  });

  it('an eligibility check that fails shows no trial, never a misleading one', async () => {
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockRejectedValueOnce(
      new Error('offline'),
    );
    const offer = await getPremiumOffer('u-1');
    expect(offer?.plans.map((p) => p.trialDays)).toEqual([null, null]);
  });

  it('an offering with only the monthly package still shows it', async () => {
    mockPurchases.getOfferings.mockResolvedValueOnce({
      current: { monthly, annual: null, availablePackages: [monthly] },
    } as unknown as Awaited<ReturnType<typeof mockPurchases.getOfferings>>);
    const offer = await getPremiumOffer('u-1');
    expect(offer?.plans.map((p) => p.kind)).toEqual(['monthly']);
  });

  it('logs in again when another user opens the paywall', async () => {
    await getPremiumOffer('u-1');
    await getPremiumOffer('u-2');
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
    expect(mockPurchases.logIn).toHaveBeenCalledWith('u-2');
  });

  it('returns null when the offering has no package', async () => {
    mockPurchases.getOfferings.mockResolvedValueOnce({
      current: null,
    } as unknown as Awaited<ReturnType<typeof mockPurchases.getOfferings>>);
    expect(await getPremiumOffer('u-1')).toBeNull();
  });

  it('returns null when RevenueCat fails, without throwing', async () => {
    mockPurchases.getOfferings.mockRejectedValueOnce(new Error('offline'));
    expect(await getPremiumOffer('u-1')).toBeNull();
  });
});

describe('purchase and restore', () => {
  it('buys the chosen plan', async () => {
    const offer = await getPremiumOffer('u-1');
    await purchasePremium('u-1', offer!.plans[0]!);
    expect(mockPurchases.purchasePackage).toHaveBeenLastCalledWith(annual);
    const outcome = await purchasePremium('u-1', offer!.plans[1]!);
    expect(mockPurchases.purchasePackage).toHaveBeenLastCalledWith(monthly);
    expect(outcome).toEqual({ kind: 'purchased' });
  });

  it('reports a cancelled purchase as cancelled, not failed', async () => {
    const offer = await getPremiumOffer('u-1');
    mockPurchases.purchasePackage.mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), { userCancelled: true }),
    );
    expect(await purchasePremium('u-1', offer!.plans[0]!)).toEqual({ kind: 'cancelled' });
  });

  it('reports a failed purchase with its message', async () => {
    const offer = await getPremiumOffer('u-1');
    mockPurchases.purchasePackage.mockRejectedValueOnce(new Error('payment declined'));
    expect(await purchasePremium('u-1', offer!.plans[0]!)).toEqual({
      kind: 'failed',
      message: 'payment declined',
    });
  });

  it('restores purchases for the signed-in user', async () => {
    expect(await restorePremium('u-1')).toEqual({ kind: 'restored' });
    expect(mockPurchases.configure).toHaveBeenCalledWith({
      apiKey: 'appl_test',
      appUserID: 'u-1',
    });
    expect(mockPurchases.restorePurchases).toHaveBeenCalled();
  });

  it('restore is unavailable in Expo Go', async () => {
    mockConstants.executionEnvironment = ExecutionEnvironment.StoreClient;
    expect(await restorePremium('u-1')).toEqual({ kind: 'unavailable' });
  });
});
