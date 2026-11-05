import { formatLongDate, toIsoDate } from '@/features/receipt-capture/utils/receiptDate';

/**
 * PI-03 AC 10 (DA-7): the "Mute until" choices, in the order shown:
 * 0 Forever, 1 one week, 2 one month, 3 three months (MUTE_COPY.choices).
 */
export type MuteChoice = 0 | 1 | 2 | 3;

export const MUTE_FOREVER: MuteChoice = 0;

/** `date` plus `months` calendar months, kept on the month's last day if it is shorter. */
function addMonths(date: Date, months: number): Date {
  const target = new Date(date);
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

/**
 * When a mute of `choice` made at `now` ends, as the ISO time the API takes
 * (UTC); null for Forever. Weeks and months are counted on the phone's
 * calendar, so "1 month" from 31 January ends on the last day of February.
 */
export function muteUntil(choice: MuteChoice, now: Date = new Date()): string | null {
  switch (choice) {
    case 0:
      return null;
    case 1: {
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      return end.toISOString();
    }
    case 2:
      return addMonths(now, 1).toISOString();
    case 3:
      return addMonths(now, 3).toISOString();
  }
}

/** A mute's end (ISO, UTC) as the user's local date: "Mar 27, 2026". */
export function formatMuteEnd(iso: string): string {
  return formatLongDate(toIsoDate(new Date(iso)));
}
