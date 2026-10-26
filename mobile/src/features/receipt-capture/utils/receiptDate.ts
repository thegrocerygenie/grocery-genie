/**
 * Receipt dates are calendar days ("YYYY-MM-DD") with no time zone. The date
 * picker works in local Date objects, so convert through local fields only:
 * `new Date('2026-03-15')` parses as UTC midnight and can land on the 14th.
 */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** The API accepts up to one day ahead of today, for phones ahead of UTC. */
export function latestReceiptDate(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}
