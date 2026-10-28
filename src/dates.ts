/* Date handling shared by trips, pitches and logistics. Lives outside
   src/features because feature modules must not import each other, and all
   three need the same parsing and display rules. */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* ----------------------------------------------------------------
   Dates

   Handled as integers rather than Date objects throughout. A date-only string
   parses as UTC while `new Date()` reports local time, so comparing the two
   shifts a day in most of the world — and "is this trip over?" must not
   depend on the reader's timezone.
   ---------------------------------------------------------------- */

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

/* Exactly YYYY-MM-DD. Every date column is a String column holding that
   format, so anything else is backend drift and should surface as
   "Dates to be confirmed" rather than be quietly accepted. */
export function parseDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Sortable, comparable integer: 2026-11-06 becomes 20261106. */
export function ordinal(date: DateParts): number {
  return date.year * 10000 + date.month * 100 + date.day;
}

export function todayOrdinal(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

export function isoDate(date: DateParts): string {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${date.year}-${month}-${day}`;
}

/** Today as YYYY-MM-DD in the reader's timezone, for date input bounds. */
export function todayIso(): string {
  const now = new Date();
  return isoDate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}

/* Writes the range into `target` as two <time> elements, so the machine-
   readable dates survive alongside the display text.

   Three shapes, each closed up as tightly as it can be without becoming
   ambiguous:
     same month   6–13 November 2026
     same year    28 October – 4 November 2026
     neither      28 December 2026 – 3 January 2027 */
export function renderDateRange(
  target: HTMLElement,
  startDate: string,
  endDate: string,
): void {
  target.replaceChildren();
  const from = parseDate(startDate);
  const to = parseDate(endDate);
  if (!from || !to) {
    target.textContent = "Dates to be confirmed";
    return;
  }

  const start = document.createElement("time");
  start.dateTime = isoDate(from);
  const end = document.createElement("time");
  end.dateTime = isoDate(to);
  end.textContent = `${to.day} ${monthName(to.month)} ${to.year}`;

  let separator = " – ";
  if (from.year === to.year && from.month === to.month) {
    start.textContent = String(from.day);
    /* Both halves are bare numbers, so the dash closes up. */
    separator = "–";
  } else if (from.year === to.year) {
    start.textContent = `${from.day} ${monthName(from.month)}`;
  } else {
    start.textContent = `${from.day} ${monthName(from.month)} ${from.year}`;
  }

  target.append(start, document.createTextNode(separator), end);
}

/** "15 December 2026", or "" for an unparseable date. */
export function formatDay(value: string): string {
  const date = parseDate(value);
  return date ? `${date.day} ${monthName(date.month)} ${date.year}` : "";
}

/** A datetime-local value as "6 November, 14:30", or "" when empty or
    unparseable. The time is shown as entered: it is the time at the
    destination, so no timezone conversion applies. */
export function formatDateTime(value: string | null): string {
  if (!value) {
    return "";
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  const date = match ? parseDate(match[1]) : null;
  if (!match || !date) {
    return "";
  }
  return `${date.day} ${monthName(date.month)}, ${match[2]}`;
}
