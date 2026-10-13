import { toGregorian, toJalaali, jalaaliMonthLength, isValidJalaaliDate } from 'jalaali-js';

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

export function monthChipLabel(month: { month?: number; title?: string }) {
  if (month.month && month.month >= 1 && month.month <= 12) {
    return JALALI_MONTHS[month.month - 1];
  }
  return (month.title || '').split(/\s+/)[0];
}

export function toJalali(date: Date) {
  return toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function jalaliToDate(year: number, month: number, day: number) {
  const g = toGregorian(year, month, day);
  return new Date(g.gy, g.gm - 1, g.gd);
}

export function formatJalali(date: string | Date | null | undefined) {
  if (!date) {
    return '';
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  const j = toJalali(d);
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
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

export function parseJalali(value: string): Date | null {
  const match = normalizeDigits(value)
    .trim()
    .match(/^(\d{3,4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) {
    return null;
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!isValidJalaaliDate(y, m, d)) {
    return null;
  }
  return jalaliToDate(y, m, d);
}

export function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** مبلغ به تومان (فقط عدد؛ واحد را در هدر/برچسب بنویسید) */
export function formatMoney(value: number | null | undefined) {
  const toman = Math.round(Number(value || 0) / 10);
  return new Intl.NumberFormat('fa-IR').format(toman);
}

/** برای کارت‌ها و متن‌های بدون هدر ستون */
export function formatMoneyToman(value: number | null | undefined) {
  return `${formatMoney(value)} تومان`;
}

export function compactMoney(value: number | null | undefined) {
  const toman = Math.round(Number(value || 0) / 10);
  const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
  if (toman >= 1_000_000) {
    return `${fa.format(Math.round((toman / 1_000_000) * 10) / 10)}م`;
  }
  if (toman >= 10_000) {
    return `${fa.format(Math.round(toman / 1000))}هزار`;
  }
  return fa.format(toman);
}

export function formatMoneyRial(value: number | null | undefined) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(Number(value || 0)));
}

export function parseMoney(raw: string): number | null {
  const digits = normalizeDigits(raw).replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

export function formatMoneyInput(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return '';
  }
  return formatMoneyRial(value);
}

/** Live mask while typing Jalali date digits → 1405/01/15 */
export function maskJalaliTyping(raw: string) {
  const digits = normalizeDigits(raw).replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  let out = y;
  if (digits.length > 4) {
    out += `/${m}`;
  }
  if (digits.length > 6) {
    out += `/${d}`;
  }
  return out;
}

export function monthLength(year: number, month: number) {
  return jalaaliMonthLength(year, month);
}

export function patchJalaliDate(control: { setValue(value: Date): void }, raw: string) {
  const parsed = parseJalali(raw);
  if (parsed) {
    control.setValue(parsed);
  }
}
