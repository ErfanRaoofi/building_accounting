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
