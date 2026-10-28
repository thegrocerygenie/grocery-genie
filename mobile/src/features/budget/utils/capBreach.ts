interface CapSpend {
  name: string;
  spent: number;
  /** The category's cap; 0 when the category has none. */
  cap: number;
}

// The banner opens Budgets (L5); pausing alerts lives in Settings → Alerts.
const ACTION = 'Adjust limits.';

/** "A", "A and B", "A, B and C". Category names may hold "&", so lists use "and". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Design "Dashboard · over budget": the banner names the categories over their
 * caps, furthest over first. With no cap crossed it speaks to the overall
 * budget, and with neither there is no banner (null).
 */
export function capBreachMessage(categories: CapSpend[], overallOver: boolean): string | null {
  const breached = categories
    .filter((c) => c.cap > 0 && c.spent > c.cap)
    .sort((a, b) => b.spent / b.cap - a.spent / a.cap);

  if (breached.length === 1) return `${breached[0].name} crossed its cap. ${ACTION}`;
  if (breached.length > 1) {
    return `${joinNames(breached.map((c) => c.name))} crossed their caps. ${ACTION}`;
  }
  return overallOver ? `You’re over your monthly budget. ${ACTION}` : null;
}
