/**
 * Business day utilities for CMS deadline calculations.
 *
 * CMS rules that depend on this:
 * - NOE: 5 business days from election date (§418.21)
 * - NOTR: per benefit period rules
 *
 * Always test the Friday edge case:
 * election on Friday 2026-03-06 → deadline Friday 2026-03-13 (not 2026-03-11)
 *
 * All date arithmetic is done in UTC to avoid DST / timezone edge cases
 * when dates are constructed from ISO strings (e.g. new Date("2026-03-06")).
 */

/**
 * Returns US federal holidays for a given year as YYYY-MM-DD strings.
 * Observance rules applied (e.g. Monday when holiday falls on Sunday).
 */
function federalHolidays(year: number): Set<string> {
  const holidays: Date[] = [
    new Date(Date.UTC(year, 0, 1)), // New Year's Day (Jan 1)
    nthWeekday(year, 0, 1, 3), // MLK Jr Day (3rd Mon Jan)
    nthWeekday(year, 1, 1, 3), // Presidents Day (3rd Mon Feb)
    lastWeekday(year, 4, 1), // Memorial Day (last Mon May)
    new Date(Date.UTC(year, 5, 19)), // Juneteenth (Jun 19)
    new Date(Date.UTC(year, 6, 4)), // Independence Day (Jul 4)
    nthWeekday(year, 8, 1, 1), // Labor Day (1st Mon Sep)
    nthWeekday(year, 9, 1, 2), // Columbus Day (2nd Mon Oct)
    new Date(Date.UTC(year, 10, 11)), // Veterans Day (Nov 11)
    nthWeekday(year, 10, 4, 4), // Thanksgiving (4th Thu Nov)
    new Date(Date.UTC(year, 11, 25)), // Christmas (Dec 25)
  ];

  const observed = holidays.map((d) => observedDate(d));
  return new Set(observed.map(toIso));
}

/** Shift to observed date: if Sunday → Monday, if Saturday → Friday */
function observedDate(d: Date): Date {
  const day = d.getUTCDay();
  if (day === 0) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  if (day === 6) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));
  return d;
}

/** Nth weekday of a month. weekday: 0=Sun, 1=Mon … n: 1-based */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

/** Last weekday of a month */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, last.getUTCDate() - offset));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Add N business days to a date, skipping weekends and US federal holidays.
 *
 * @param startDate - The starting date (e.g. election date for NOE)
 * @param days      - Number of business days to add (e.g. 5 for NOE)
 * @returns         - The deadline date
 *
 * @example
 * // NOE: election on Friday 2026-03-06 → deadline 2026-03-13
 * addBusinessDays(new Date("2026-03-06"), 5) // → 2026-03-13
 */
export function addBusinessDays(startDate: Date, days: number): Date {
  // Normalize to UTC midnight to avoid local-time drift
  let current = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()),
  );
  let remaining = days;
  const holidayCache = new Map<number, Set<string>>();

  while (remaining > 0) {
    current = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1),
    );

    const year = current.getUTCFullYear();
    if (!holidayCache.has(year)) {
      holidayCache.set(year, federalHolidays(year));
    }

    const holidays = holidayCache.get(year) ?? new Set<string>();
    const iso = toIso(current);

    if (!isWeekend(current) && !holidays.has(iso)) {
      remaining--;
    }
  }

  return current;
}

/**
 * Returns true if a date is a US business day (not weekend, not federal holiday).
 */
export function isBusinessDay(date: Date): boolean {
  if (isWeekend(date)) return false;
  const holidays = federalHolidays(date.getUTCFullYear());
  return !holidays.has(toIso(date));
}

/**
 * Returns the hospice cap year for a given date.
 * Cap year: November 1 (year N) – October 31 (year N+1)
 *
 * @returns Object with capYear label and start/end dates
 */
export function getCapYear(date: Date): {
  label: string;
  start: Date;
  end: Date;
  year: number;
} {
  const month = date.getUTCMonth(); // 0-indexed, UTC
  // November = 10, so if month >= 10 we're in the new cap year
  const capStartYear = month >= 10 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;

  return {
    label: `${capStartYear}-${capStartYear + 1}`,
    start: new Date(Date.UTC(capStartYear, 10, 1)), // Nov 1
    end: new Date(Date.UTC(capStartYear + 1, 9, 31)), // Oct 31
    year: capStartYear,
  };
}
