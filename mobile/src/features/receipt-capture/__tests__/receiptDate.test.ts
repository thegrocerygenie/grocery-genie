import { fromIsoDate, latestReceiptDate, toIsoDate } from '../utils/receiptDate';

describe('receipt date helpers', () => {
  it('reads a YYYY-MM-DD date as that calendar day in local time', () => {
    const d = fromIsoDate('2026-03-15');

    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 15]);
  });

  it('writes the local calendar day back as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 2, 5, 23, 59))).toBe('2026-03-05');
  });

  it('round-trips a date unchanged', () => {
    expect(toIsoDate(fromIsoDate('2026-12-31'))).toBe('2026-12-31');
  });

  it('allows up to one day ahead, as the API does', () => {
    expect(toIsoDate(latestReceiptDate(new Date(2026, 9, 31, 22, 0)))).toBe('2026-11-01');
  });
});
