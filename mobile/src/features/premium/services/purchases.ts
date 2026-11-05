import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { PurchasesIntroPrice, PurchasesPackage } from 'react-native-purchases';

/**
 * Premium through RevenueCat (V11-P0, decision D1). The app only buys and
 * restores here; whether the user is Premium comes from the backend
 * (`is_premium` on the profile), which trusts RevenueCat, never the app.
 *
 * `react-native-purchases` is a native module: it loads only in a development
 * or App Store build. Expo Go and tests without a mock never load it, and
 * nothing here throws.
 */

export type PlanKind = 'yearly' | 'monthly';

/** One plan of the RevenueCat offering (PREM-01 AC 1), priced by the App Store. */
export interface PremiumPlan {
  kind: PlanKind;
  /** The App Store price for the user's storefront, e.g. "$39.99". */
  priceString: string;
  price: number;
  currencyCode: string;
  /**
   * Days of free trial this user may take on this plan (PREM-01 AC 2): set
   * only when the product has a free introductory offer and RevenueCat says
   * the user is eligible; null otherwise, including when eligibility is unknown.
   */
  trialDays: number | null;
  pkg: PurchasesPackage;
}

/** The offering's plans, yearly first (PREM-01 AC 1). Never empty. */
export interface PremiumOffer {
  plans: PremiumPlan[];
}

// RevenueCat's INTRO_ELIGIBILITY_STATUS_ELIGIBLE.
const INTRO_ELIGIBLE = 2;

export type PurchaseOutcome =
  | { kind: 'purchased' }
  | { kind: 'cancelled' }
  | { kind: 'unavailable' }
  | { kind: 'failed'; message: string };

export type RestoreOutcome =
  | { kind: 'restored' }
  | { kind: 'unavailable' }
  | { kind: 'failed'; message: string };

interface PurchasesModule {
  configure: (config: { apiKey: string; appUserID: string }) => void;
  logIn: (appUserID: string) => Promise<unknown>;
  getOfferings: () => Promise<{
    current: {
      monthly: PurchasesPackage | null;
      annual: PurchasesPackage | null;
      availablePackages: PurchasesPackage[];
    } | null;
  }>;
  checkTrialOrIntroductoryPriceEligibility: (
    productIds: string[],
  ) => Promise<Record<string, { status: number }>>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<unknown>;
  restorePurchases: () => Promise<unknown>;
}

function apiKey(): string {
  return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
}

// Required lazily: Expo Go has no native module, so the package never loads there.
function loadPurchases(): PurchasesModule | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases') as { default?: PurchasesModule };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

/** False in Expo Go, without EXPO_PUBLIC_REVENUECAT_IOS_API_KEY, or without the module. */
export function isPurchasesAvailable(): boolean {
  return apiKey() !== '' && loadPurchases() !== null;
}

let configuredFor: string | null = null;

/** Only for tests: forget which user the SDK was configured for. */
export function resetPurchasesForTests(): void {
  configuredFor = null;
}

/**
 * The SDK, configured for `userId`: RevenueCat's app user id is the Grocery
 * Genie user id, so the webhook names the user.
 */
async function purchasesFor(userId: string): Promise<PurchasesModule | null> {
  const key = apiKey();
  const sdk = key ? loadPurchases() : null;
  if (!sdk) return null;
  if (configuredFor === null) {
    sdk.configure({ apiKey: key, appUserID: userId });
    configuredFor = userId;
  } else if (configuredFor !== userId) {
    await sdk.logIn(userId);
    configuredFor = userId;
  }
  return sdk;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'purchase error';
}

/** Length in days of a free introductory offer, or null for a paid one. */
function freeTrialDays(intro: PurchasesIntroPrice | null | undefined): number | null {
  if (!intro || intro.price !== 0) return null;
  const perUnit = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 }[intro.periodUnit] ?? null;
  if (perUnit === null) return null;
  return perUnit * intro.periodNumberOfUnits * Math.max(1, intro.cycles);
}

/** Which products the user may take an introductory offer on. Unknown: none. */
async function eligibleForIntro(sdk: PurchasesModule, productIds: string[]): Promise<Set<string>> {
  try {
    const byId = await sdk.checkTrialOrIntroductoryPriceEligibility(productIds);
    return new Set(productIds.filter((id) => byId[id]?.status === INTRO_ELIGIBLE));
  } catch {
    return new Set();
  }
}

/**
 * The current offering's Yearly and Monthly packages (PREM-01 AC 1), yearly
 * first, each with the trial the user may take (AC 2); null when the offering
 * has neither. Never throws.
 */
export async function getPremiumOffer(userId: string): Promise<PremiumOffer | null> {
  try {
    const sdk = await purchasesFor(userId);
    if (!sdk) return null;
    const offering = (await sdk.getOfferings()).current;
    if (!offering) return null;
    const packages: [PlanKind, PurchasesPackage | null][] = [
      ['yearly', offering.annual],
      ['monthly', offering.monthly ?? (offering.annual ? null : offering.availablePackages[0])],
    ];
    const found = packages.filter((p): p is [PlanKind, PurchasesPackage] => p[1] != null);
    if (found.length === 0) return null;
    const eligible = await eligibleForIntro(
      sdk,
      found.map(([, pkg]) => pkg.product.identifier),
    );
    return {
      plans: found.map(([kind, pkg]) => ({
        kind,
        priceString: pkg.product.priceString,
        price: pkg.product.price,
        currencyCode: pkg.product.currencyCode,
        trialDays: eligible.has(pkg.product.identifier)
          ? freeTrialDays(pkg.product.introPrice)
          : null,
        pkg,
      })),
    };
  } catch {
    return null;
  }
}

/** Show Apple's purchase sheet for the plan. Never throws. */
export async function purchasePremium(userId: string, plan: PremiumPlan): Promise<PurchaseOutcome> {
  try {
    const sdk = await purchasesFor(userId);
    if (!sdk) return { kind: 'unavailable' };
    await sdk.purchasePackage(plan.pkg);
    return { kind: 'purchased' };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      (error as { userCancelled?: unknown }).userCancelled
    ) {
      return { kind: 'cancelled' };
    }
    return { kind: 'failed', message: errorMessage(error) };
  }
}

/** Restore the Apple ID's purchases to this user. Never throws. */
export async function restorePremium(userId: string): Promise<RestoreOutcome> {
  try {
    const sdk = await purchasesFor(userId);
    if (!sdk) return { kind: 'unavailable' };
    await sdk.restorePurchases();
    return { kind: 'restored' };
  } catch (error) {
    return { kind: 'failed', message: errorMessage(error) };
  }
}
