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

export function toJalali(date: Date) {
  return toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
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
