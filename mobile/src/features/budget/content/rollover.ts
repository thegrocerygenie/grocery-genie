/**
 * User-facing strings for budget rollover (V1.1, Premium, D2). Externalized
 * for i18n.
 */
export const ROLLOVER_STRINGS = {
  sectionHeader: 'ROLLOVER',
  footer:
    'What you don’t spend carries into next month’s limit. Last month’s leftover joins this month when you turn it on. Overspending doesn’t carry.',
  overallLabel: 'Monthly budget',
  /** VoiceOver label of a budget's switch: "Roll over unspent Groceries". */
  switchLabel: (name: string) => `Roll over unspent ${name}`,
  upgradeTitle: 'Roll over what you don’t spend',
  upgradeMessage: 'With Premium, unspent budget carries into next month instead of resetting.',
  upgradeAction: 'See Premium',
  /** Under the dashboard's spend line: "Includes $40 rolled over". */
  includesRolledOver: (amount: string) => `Includes ${amount} rolled over`,
  rolledOverA11y: (amount: string) => `, including ${amount} rolled over`,
} as const;
