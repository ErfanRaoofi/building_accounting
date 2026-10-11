import { toGregorian, toJalaali, jalaaliMonthLength } from 'jalaali-js';

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

const TEHRAN = 'Asia/Tehran';

/** Gregorian parts in Tehran. The API container runs in UTC, so local getters are 3:30 behind. */
function tehranGregorian(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const hour = n('hour');
  return {
    year: n('year'),
    month: n('month'),
    day: n('day'),
    hour: hour === 24 ? 0 : hour,
    minute: n('minute'),
  };
}

export function toJalali(date: Date) {
  const g = tehranGregorian(date);
  return toJalaali(g.year, g.month, g.day);
}

export function tehranClock(date: Date) {
  const g = tehranGregorian(date);
  return { hour: g.hour, minute: g.minute };
}

export function jalaliToDate(year: number, month: number, day: number) {
  const g = toGregorian(year, month, day);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
}

export function lastJalaliDay(year: number, month: number) {
  return jalaaliMonthLength(year, month);
}

export function monthsBetween(start: Date, end: Date) {
  const from = toJalali(start);
  const to = toJalali(end);
  const months: { year: number; month: number; title: string }[] = [];
  let y = from.jy;
  let m = from.jm;
  while (y < to.jy || (y === to.jy && m <= to.jm)) {
    months.push({ year: y, month: m, title: `${JALALI_MONTHS[m - 1]} ${y}` });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function money(value: { toString(): string } | number | string | null | undefined) {
  if (value == null) {
    return 0;
  }
  return Number(value);
}

const DIGIT_MAP: Record<string, string> = {
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

export function normalizeDigits(value: string) {
  return [...value]
    .map((char) => DIGIT_MAP[char] ?? char)
    .join('');
}
