/** User-facing strings for Settings → Export data (V11-P2). Externalized for i18n. */
export const EXPORT_STRINGS = {
  screenTitle: 'Export data',
  backTitle: 'Settings',
  settingsRow: 'Export data',
  heading: 'Take your data with you',
  intro:
    'Download your receipts, line items, budgets and price history as one file, then save it to Files, AirDrop it or send it anywhere.',
  formatLabel: 'File format',
  formats: ['JSON', 'CSV'] as const,
  formatDetail: {
    json: 'One JSON file. Best for other apps and developers.',
    csv: 'A zip of spreadsheets: receipts, line items, budgets and prices, one file each.',
  },
  deletedNote: 'Receipts and budgets you deleted aren’t included.',
  action: 'Export data',
  preparing: 'Preparing your export…',
  failed: 'Couldn’t export your data. Check your connection and try again.',
  upgradeTitle: 'Export your data with Premium',
  upgradeMessage: 'Premium lets you download every receipt, budget and price as JSON or CSV.',
  upgradeAction: 'See Premium',
} as const;
