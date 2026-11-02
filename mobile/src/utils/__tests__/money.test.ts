import { countsTowardBudget, currencySymbol, deviceCurrency, formatMoney } from '../money';

jest.mock('expo-localization', () => ({
  getLocales: () => mockLocales,
}));
let mockLocales: { currencyCode: string | null }[] = [];

describe('formatMoney', () => {
  it.each([
    [12.5, 'USD', '$12.50'],
    [12.5, 'EUR', '€12.50'],
    [12.5, 'GBP', '£12.50'],
    [-3, 'USD', '-$3.00'],
  ])('formats %p %s as %s', (amount, currency, text) => {
    expect(formatMoney(amount, currency)).toBe(text);
  });

  it('can drop the cents', () => {
    expect(formatMoney(40, 'USD', { decimals: 0 })).toBe('$40');
  });

  it('writes a code it cannot format before the amount', () => {
    expect(formatMoney(5, '€')).toBe('€ 5.00');
  });
});

describe('currencySymbol', () => {
  it.each([
    ['USD', '$'],
    ['EUR', '€'],
    ['GBP', '£'],
  ])('%s is %s', (currency, symbol) => {
    expect(currencySymbol(currency)).toBe(symbol);
  });
});

describe('currencySymbol on Hermes', () => {
  // Hermes on the device has no formatToParts; seen on the iOS 27 Simulator,
  // where the Currency screen showed "USD" instead of "$".
  const original = Intl.NumberFormat.prototype.formatToParts;
  beforeEach(() => {
    // @ts-expect-error simulating an engine without formatToParts
    delete Intl.NumberFormat.prototype.formatToParts;
  });
  afterEach(() => {
    Intl.NumberFormat.prototype.formatToParts = original;
  });

  it.each([
    ['USD', '$'],
    ['EUR', '€'],
    ['CHF', 'CHF'],
    ['MXN', 'MX$'],
  ])('%s is still %s', (currency, symbol) => {
    expect(currencySymbol(currency)).toBe(symbol);
  });
});

describe('deviceCurrency', () => {
  it("is the iPhone region's currency", () => {
    mockLocales = [{ currencyCode: 'EUR' }];
    expect(deviceCurrency()).toBe('EUR');
  });

  it('is undefined when the region has none', () => {
    mockLocales = [{ currencyCode: null }];
    expect(deviceCurrency()).toBeUndefined();
  });
});

describe('countsTowardBudget', () => {
  it('counts a receipt in the budget currency', () => {
    expect(countsTowardBudget('USD', 'USD')).toBe(true);
  });

  it('leaves out a receipt in another currency', () => {
    expect(countsTowardBudget('EUR', 'USD')).toBe(false);
  });
});
