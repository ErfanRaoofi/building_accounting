export const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'نقد' },
  { value: 'TRANSFER', label: 'کارت به کارت / واریز' },
  { value: 'CARD', label: 'کارتخوان' },
  { value: 'OTHER', label: 'سایر' },
] as const;

export function paymentMethodLabel(method: string | null | undefined) {
  return PAYMENT_METHOD_OPTIONS.find((row) => row.value === method)?.label || 'سایر';
}
