import type { ExportFormat, ExportInclude } from '@/features/settings/services/exportApi';
import type { ExportPeriod } from '@/features/settings/utils/exportRange';

/** User-facing strings for Settings → Export data (V11-P2, PREM-04). Externalized for i18n. */
export const EXPORT_STRINGS = {
  screenTitle: 'Export data',
  backTitle: 'Settings',
  settingsRow: 'Export data',
  // PREM-04 AC 8: the design's line, reworded because the default range is not everything.
  intro: 'Export your receipts, prices and budgets for the dates you choose. Yours forever.',

  rangeHeader: 'RANGE',
  period: 'Period',
  from: 'From',
  to: 'To',
  periods: {
    last12: 'Last 12 months',
    all: 'All time',
    thisYear: 'This year',
    custom: 'Custom',
  } satisfies Record<ExportPeriod, string>,
  periodOrder: ['last12', 'all', 'thisYear', 'custom'] as const satisfies readonly ExportPeriod[],
  allTimeFrom: 'First receipt',
  allTimeTo: 'Today',
  rangeInvalid: 'From is after To. Pick a From month on or before the To month.',
  monthPickerTitle: (which: 'from' | 'to') => (which === 'from' ? 'From month' : 'To month'),
  previousYear: 'Previous year',
  nextYear: 'Next year',
  monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  monthsLong: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  close: 'Close',

  formatHeader: 'FORMAT',
  // PREM-04 AC 2: CSV first, then JSON and the PDF report.
  formatOrder: ['csv', 'json', 'pdf'] as const satisfies readonly ExportFormat[],
  formats: {
    csv: { title: 'CSV', detail: 'Spreadsheet-ready' },
    json: { title: 'JSON', detail: 'For developers' },
    pdf: { title: 'PDF report', detail: 'Formatted summary' },
  } satisfies Record<ExportFormat, { title: string; detail: string }>,

  includesHeader: 'INCLUDES',
  includeOrder: [
    'receipts',
    'prices',
    'budgets',
    'images',
  ] as const satisfies readonly ExportInclude[],
  includes: {
    receipts: 'Receipts & line items',
    prices: 'Price history',
    budgets: 'Categories & budgets',
    images: 'Receipt images',
  } satisfies Record<ExportInclude, string>,
  includesFooter: 'Keep at least one on. With receipt images, the download is a zip.',

  // PREM-04 AC 4: the count comes from the server.
  action: (count: number) =>
    count === 1 ? 'Export 1 receipt' : `Export ${count.toLocaleString()} receipts`,
  actionNoCount: 'Export',
  // With Receipts & line items off the export holds no receipts, so no count.
  actionData: 'Export data',
  counting: 'Counting receipts…',
  noReceipts: 'No receipts in this range',
  preparing: 'Preparing your export…',
  deletedNote: 'Receipts and budgets you deleted aren’t included.',
  failed: 'Couldn’t export your data. Check your connection and try again.',
  busy: 'You’ve exported several times this hour, or an export is still being prepared. Try again in a few minutes.',

  upgradeTitle: 'Export your data with Premium',
  upgradeMessage:
    'Premium lets you download your receipts, budgets and prices as CSV, JSON or a PDF report.',
  upgradeAction: 'See Premium',
} as const;
