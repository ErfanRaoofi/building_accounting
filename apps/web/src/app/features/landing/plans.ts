export type LandingPlan = {
  id: string;
  label: string;
  priceLabel: string;
  periodLabel: string;
  description: string;
  featured?: boolean;
  features: string[];
};

/** قیمت‌ها و محدودیت‌ها را از این‌جا ویرایش کنید */
export const LANDING_PLANS: LandingPlan[] = [
  {
    id: 'basic',
    label: 'پایه',
    priceLabel: '۱٬۴۹۰٬۰۰۰',
    periodLabel: 'تومان / سال',
    description: 'برای یک ساختمان کوچک که می‌خواهد شارژ و دریافت را منظم کند.',
    features: ['یک ساختمان', 'شارژ و تعرفه', 'دریافت و پرداخت', 'گزارش بدهکاران'],
  },
  {
    id: 'pro',
    label: 'حرفه‌ای',
    priceLabel: '۳٬۹۰۰٬۰۰۰',
    periodLabel: 'تومان / سال',
    description: 'انتخاب مدیران ساختمان‌هایی که گزارش و چاپ دقیق می‌خواهند.',
    featured: true,
    features: [
      'تا پنج ساختمان',
      'بیلان مالی',
      'چاپ گزارش‌ها',
      'سال مالی و نقش‌ها',
      'دفتر واحد',
    ],
  },
  {
    id: 'org',
    label: 'سازمانی',
    priceLabel: '۷٬۹۰۰٬۰۰۰',
    periodLabel: 'تومان / سال',
    description: 'برای مجموعه‌ها و شرکت‌های مدیریتی با چند ملک و پشتیبانی اختصاصی.',
    features: [
      'ساختمان نامحدود',
      'همه امکانات حرفه‌ای',
      'بک‌آپ و نگه‌داری',
      'پشتیبانی اختصاصی',
    ],
  },
];

export function planById(id: string) {
  return LANDING_PLANS.find((plan) => plan.id === id) || LANDING_PLANS[1];
}
