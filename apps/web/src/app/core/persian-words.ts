const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

function groupToWords(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundred) {
    parts.push(HUNDREDS[hundred]);
  }
  if (rest >= 10 && rest <= 19) {
    parts.push(TEENS[rest - 10]);
  } else {
    const ten = Math.floor(rest / 10);
    const one = rest % 10;
    if (ten) {
      parts.push(TENS[ten]);
    }
    if (one) {
      parts.push(ONES[one]);
    }
  }
  return parts.join(' و ');
}

export function toPersianWords(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  if (value < 0) {
    return `منفی ${toPersianWords(-value)}`;
  }
  const n = Math.round(Math.abs(value));
  if (n === 0) {
    return 'صفر';
  }
  const parts: string[] = [];
  let remaining = n;
  let scale = 0;
  while (remaining > 0 && scale < SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk) {
      const words = groupToWords(chunk);
      const label = SCALES[scale];
      parts.unshift(label ? `${words} ${label}` : words);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return parts.join(' و ');
}

export function tomanWords(rial: number): string {
  const toman = Math.round(Number(rial || 0) / 10);
  return `${toPersianWords(toman)} تومان`;
}
