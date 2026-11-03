import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { PurchasesPackage } from 'react-native-purchases';

/**
 * Premium through RevenueCat (V11-P0, decision D1). The app only buys and
 * restores here; whether the user is Premium comes from the backend
 * (`is_premium` on the profile), which trusts RevenueCat, never the app.
 *
 * `react-native-purchases` is a native module: it loads only in a development
 * or App Store build. Expo Go and tests without a mock never load it, and
 * nothing here throws.
 */

export interface PremiumOffer {
  /** The App Store price for the user's storefront, e.g. "$5.99". */
  priceString: string;
  pkg: PurchasesPackage;
}

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
    current: { monthly: PurchasesPackage | null; availablePackages: PurchasesPackage[] } | null;
  }>;
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

/** The monthly package of the current offering, or null. Never throws. */
export async function getPremiumOffer(userId: string): Promise<PremiumOffer | null> {
  try {
    const sdk = await purchasesFor(userId);
    if (!sdk) return null;
    const offering = (await sdk.getOfferings()).current;
    const pkg = offering?.monthly ?? offering?.availablePackages[0] ?? null;
    return pkg ? { priceString: pkg.product.priceString, pkg } : null;
  } catch {
    return null;
  }
}

/** Show Apple's purchase sheet for the offer. Never throws. */
export async function purchasePremium(
  userId: string,
  offer: PremiumOffer,
): Promise<PurchaseOutcome> {
  try {
    const sdk = await purchasesFor(userId);
    if (!sdk) return { kind: 'unavailable' };
    await sdk.purchasePackage(offer.pkg);
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
