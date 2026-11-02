/**
 * Budget currencies offered in Settings → Currency: the currencies of the
 * markets the receipt languages cover (RC-05). A user whose currency is
 * elsewhere (set from the device at sign-up) still sees it listed.
 */
export const BUDGET_CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'RSD', name: 'Serbian Dinar' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'INR', name: 'Indian Rupee' },
] as const;
