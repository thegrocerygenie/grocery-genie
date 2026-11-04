/**
 * User-facing strings for Settings → Categories (BC-05 AC 3, V11-P1).
 * Externalized for i18n.
 */

/** Custom categories a user can add on top of the eight defaults (server cap). */
export const MAX_CUSTOM_CATEGORIES = 10;

/** Longest name the server takes (`CATEGORY_NAME_MAX` in the backend). */
export const CATEGORY_NAME_MAX = 40;

export const CATEGORY_STRINGS = {
  screenTitle: 'Categories',
  back: 'Settings',
  settingsRow: 'Categories',
  settingsDetailPremium: 'Add up to 10 of your own',
  settingsDetailFree: 'Your own categories with Premium',
  intro:
    'Every item on a receipt goes into a category. Add your own to track spending the way you think about it.',
  yoursHeader: 'YOUR CATEGORIES',
  defaultsHeader: 'BUILT IN',
  count: (n: number) => `${n} of ${MAX_CUSTOM_CATEGORIES}`,
  countLabel: (n: number) => `${n} of ${MAX_CUSTOM_CATEGORIES} custom categories used`,
  add: 'Add Category',
  addPrompt: 'New Category',
  addBody: 'Give it a short name, like “Garden” or “Party supplies”.',
  limitReached: `You’ve added ${MAX_CUSTOM_CATEGORIES} categories, the most you can have. Delete one to add another.`,
  empty: 'No categories of your own yet.',
  defaultsFooter:
    'Built-in categories can’t be renamed or deleted. Receipts are sorted into them automatically; correct an item once and Grocery Genie remembers.',
  rowHint: 'Rename or delete',
  rowActions: (name: string) => name,
  rename: 'Rename',
  renamePrompt: 'Rename Category',
  delete: 'Delete',
  deleteTitle: (name: string) => `Delete “${name}”?`,
  deleteBody:
    'Items in it move to Other, and its budget is removed. Your spending totals don’t change.',
  cancel: 'Cancel',
  save: 'Save',
  nameTaken: 'A category with that name already exists.',
  nameInvalid: `Use 1 to ${CATEGORY_NAME_MAX} characters.`,
  failed: 'That didn’t save. Check your connection and try again.',
  loadFailed: 'Categories couldn’t be loaded.',
  retry: 'Try Again',
  upgradeTitle: 'Make categories your own',
  upgradeMessage: `Premium adds up to ${MAX_CUSTOM_CATEGORIES} categories of your own, for budgets and corrections.`,
  upgradeAction: 'See Premium',
  lapsedNote:
    'Your categories stay and keep their spending. Renew Premium to rename them or add more.',
} as const;
