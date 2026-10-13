import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ContextService } from '../../core/context.service';
import { ToastService } from '../../core/toast.service';
import { formatJalali, formatMoney, isoDate } from '../../core/jalali';
import { PAYMENT_METHOD_OPTIONS } from '../../core/payment-method';
import { watchBuildingYear } from '../../core/watch-context';
import { ALL_QUERY, DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormRail } from '../../shared/form-rail';
import { MoneyInput } from '../../shared/money-input';
import { JalaliDatepicker } from '../../shared/jalali-datepicker';
import { ImageCropper } from '../../shared/image-cropper';

type NoticeKind = 'NOTICE' | 'BILL';
type BoardFilter = 'all' | 'unpaid' | 'paid' | 'notice';

type NoticeSummary = {
  unpaidBills: number;
  unpaidAmount: number;
  paidBills: number;
  notices: number;
};

@Component({
  selector: 'app-dashboard',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Pager,
    Skeleton,
    Busy,
    FormRail,
    MoneyInput,
    JalaliDatepicker,
    ImageCropper,
  ],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  auth = inject(AuthService);
  ctx = inject(ContextService);
  cropper = viewChild(ImageCropper);

  rows = signal<any[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  filter = signal<BoardFilter>('all');
  summary = signal<NoticeSummary | null>(null);
  preview = signal<{ url: string; title: string } | null>(null);
  loading = signal(true);
  saving = signal(false);
  removingId = signal<string | null>(null);
  paying = signal(false);

  noticeOpen = signal(false);
  payOpen = signal(false);
  payingBill = signal<any | null>(null);
  categories = signal<any[]>([]);

  noticeImage = signal<File | null>(null);
  noticePreview = signal<string | null>(null);
  cropTarget = signal<'notice' | 'proof' | null>(null);
  proofImage = signal<File | null>(null);
  proofPreview = signal<string | null>(null);

  formatMoney = formatMoney;
  formatJalali = formatJalali;
  paymentMethods = PAYMENT_METHOD_OPTIONS;
  filters: { id: BoardFilter; label: string }[] = [
    { id: 'all', label: 'همه' },
    { id: 'unpaid', label: 'قبض باز' },
    { id: 'paid', label: 'پرداخت‌شده' },
    { id: 'notice', label: 'اطلاعیه' },
  ];
  isStaff = computed(() => this.auth.isStaff());
  shortcuts = computed(() => {
    if (this.auth.isStaff()) {
      return [
        { path: '/units', label: 'واحدها', hint: 'ساکنین و شارژ' },
        { path: '/receipts', label: 'دریافت‌ها', hint: 'وصول شارژ' },
        { path: '/payments', label: 'پرداخت‌ها', hint: 'هزینه‌های ساختمان' },
        { path: '/reports/debtors', label: 'بدهکاران', hint: 'مانده واحدها' },
      ];
    }
    if (this.auth.canSeeReports()) {
      return [
        { path: '/reports/charges', label: 'گزارش شارژ', hint: 'وضعیت ماه‌ها' },
        { path: '/reports/debtors', label: 'بدهکاران', hint: 'مانده واحدها' },
        { path: '/reports/payments', label: 'گزارش پرداخت', hint: 'هزینه‌ها' },
      ];
    }
    return [];
  });

  noticeForm = this.fb.nonNullable.group({
    kind: ['BILL' as NoticeKind, Validators.required],
    title: ['', Validators.required],
    description: [''],
    date: [new Date() as Date, Validators.required],
    amount: [null as number | null],
  });

  payForm = this.fb.nonNullable.group({
    categoryId: ['', Validators.required],
    date: [new Date() as Date, Validators.required],
    amount: [0, Validators.required],
    paymentMethod: ['TRANSFER'],
    payee: [''],
    description: [''],
    trackingNumber: [''],
    documentNumber: [''],
  });

  constructor() {
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.page.set(1);
    this.loadSummary();
    this.loadList();
    if (this.isStaff()) {
      this.loadCategories();
    }
  }

  setFilter(id: BoardFilter) {
    if (this.filter() === id) {
      return;
    }
    this.filter.set(id);
    this.page.set(1);
    this.loadList();
  }

  loadSummary() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!buildingId || !fiscalYearId) {
      this.summary.set(null);
      return;
    }
    this.http.get<NoticeSummary>('/api/notices/summary', { params: { buildingId, fiscalYearId } }).subscribe({
      next: (res) => this.summary.set(res),
      error: () => this.summary.set(null),
    });
  }

  private listParams(buildingId: string, fiscalYearId: string) {
    const params: Record<string, string> = { buildingId, fiscalYearId, ...pageQuery(this.page(), this.pageSize()) };
    const filter = this.filter();
    if (filter === 'unpaid') {
      params['kind'] = 'BILL';
      params['billStatus'] = 'UNPAID';
    } else if (filter === 'paid') {
      params['kind'] = 'BILL';
      params['billStatus'] = 'PAID';
    } else if (filter === 'notice') {
      params['kind'] = 'NOTICE';
    }
    return params;
  }

  loadList() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!buildingId || !fiscalYearId) {
      this.rows.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }
    withBusy(
      this.loading,
      this.http.get<Paged>('/api/notices', { params: this.listParams(buildingId, fiscalYearId) }),
    ).subscribe({
      next: (res) => {
        this.rows.set(res.items);
        this.total.set(res.total);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.show(err.error?.message || 'بارگذاری داشبورد ناموفق بود');
      },
    });
  }

  loadCategories() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId) {
      this.categories.set([]);
      return;
    }
    this.http.get<Paged>('/api/expense-categories', { params: { buildingId, ...ALL_QUERY } }).subscribe({
      next: (res) => this.categories.set(res.items),
      error: () => this.categories.set([]),
    });
  }

  categoryLabel(c: any) {
    return c?.parent ? `${c.parent.name} / ${c.name}` : c?.name || '—';
  }

  kindLabel(kind: NoticeKind) {
    return kind === 'BILL' ? 'قبض' : 'اطلاعیه';
  }

  statusLabel(row: any) {
    if (row.kind !== 'BILL') {
      return '';
    }
    return row.billStatus === 'PAID' ? 'پرداخت‌شده' : 'پرداخت‌نشده';
  }

  openPreview(url?: string | null, title?: string) {
    if (!url) {
      return;
    }
    this.preview.set({ url, title: title || 'تصویر' });
  }

  closePreview() {
    this.preview.set(null);
  }

  openNoticeForm(kind: NoticeKind = 'BILL') {
    this.clearNoticeImage();
    this.noticeForm.reset({
      kind,
      title: '',
      description: '',
      date: new Date(),
      amount: null,
    });
    this.noticeOpen.set(true);
  }

  pickNoticeImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.cropTarget.set('notice');
    this.cropper()?.pick(file);
  }

  pickProofImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.cropTarget.set('proof');
    this.cropper()?.pick(file);
  }

  onCropped(blob: Blob) {
    if (blob.size > 2 * 1024 * 1024) {
      this.toast.show('حجم تصویر بعد از کوچک‌سازی هنوز زیاد است');
      return;
    }
    const target = this.cropTarget();
    const file = new File([blob], `${target || 'image'}-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    if (target === 'proof') {
      this.clearProofImage();
      this.proofImage.set(file);
      this.proofPreview.set(url);
    } else {
      this.clearNoticeImage();
      this.noticeImage.set(file);
      this.noticePreview.set(url);
    }
    this.cropTarget.set(null);
  }

  clearNoticeImage() {
    this.noticeImage.set(null);
    const prev = this.noticePreview();
    if (prev?.startsWith('blob:')) {
      URL.revokeObjectURL(prev);
    }
    this.noticePreview.set(null);
  }

  clearProofImage() {
    this.proofImage.set(null);
    const prev = this.proofPreview();
    if (prev?.startsWith('blob:')) {
      URL.revokeObjectURL(prev);
    }
    this.proofPreview.set(null);
  }

  saveNotice() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    const value = this.noticeForm.getRawValue();
    if (!buildingId || !fiscalYearId || !value.date || this.saving()) {
      return;
    }
    const title = value.title.trim();
    if (!title) {
      this.toast.show('عنوان را وارد کنید');
      return;
    }
    const body = new FormData();
    body.set('buildingId', buildingId);
    body.set('fiscalYearId', fiscalYearId);
    body.set('kind', value.kind);
    body.set('title', title);
    body.set('date', isoDate(value.date));
    if (value.description?.trim()) {
      body.set('description', value.description.trim());
    }
    if (value.kind === 'BILL' && value.amount) {
      body.set('amount', String(Math.round(value.amount)));
    }
    const file = this.noticeImage();
    if (file) {
      body.set('file', file);
    }
    withBusy(this.saving, this.http.post('/api/notices', body)).subscribe({
      next: () => {
        this.noticeOpen.set(false);
        this.clearNoticeImage();
        this.loadSummary();
        this.loadList();
        this.toast.show(value.kind === 'BILL' ? 'قبض ثبت شد' : 'اطلاعیه ثبت شد');
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا در ثبت'),
    });
  }

  removeNotice(row: any) {
    if (this.removingId()) {
      return;
    }
    if (!confirm(`«${row.title}» حذف شود؟`)) {
      return;
    }
    this.removingId.set(row.id);
    this.http.delete(`/api/notices/${row.id}`).subscribe({
      next: () => {
        this.removingId.set(null);
        this.loadSummary();
        this.loadList();
        this.toast.show('حذف شد');
      },
      error: (err) => {
        this.removingId.set(null);
        this.toast.show(err.error?.message || 'حذف ناموفق بود');
      },
    });
  }

  openPay(row: any) {
    if (row.kind !== 'BILL' || row.billStatus !== 'UNPAID') {
      return;
    }
    this.clearProofImage();
    this.payingBill.set(row);
    this.payForm.reset({
      categoryId: this.categories()[0]?.id || '',
      date: new Date(),
      amount: row.amount || 0,
      paymentMethod: 'TRANSFER',
      payee: row.title || '',
      description: row.description || '',
      trackingNumber: '',
      documentNumber: '',
    });
    this.payOpen.set(true);
  }

  savePayment() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    const bill = this.payingBill();
    const value = this.payForm.getRawValue();
    const proof = this.proofImage();
    if (!buildingId || !fiscalYearId || !bill || !value.date || this.paying()) {
      return;
    }
    if (!value.amount) {
      this.toast.show('مبلغ را وارد کنید');
      return;
    }
    const payload = {
      buildingId,
      fiscalYearId,
      noticeId: bill.id,
      categoryId: value.categoryId,
      date: isoDate(value.date),
      amount: value.amount,
      paymentMethod: value.paymentMethod,
      payee: value.payee,
      description: value.description,
      trackingNumber: value.trackingNumber,
      documentNumber: value.documentNumber,
    };
    const finish = () => {
      this.payOpen.set(false);
      this.payingBill.set(null);
      this.clearProofImage();
      this.loadSummary();
      this.loadList();
      this.toast.show('پرداخت قبض ثبت شد');
    };
    withBusy(this.paying, this.http.post<any>('/api/payments', payload)).subscribe({
      next: (payment) => {
        if (!proof) {
          finish();
          return;
        }
        const body = new FormData();
        body.set('file', proof);
        this.http.post(`/api/payments/${payment.id}/proof-image`, body).subscribe({
          next: () => finish(),
          error: (err) => {
            this.loadSummary();
            this.loadList();
            this.toast.show(err.error?.message || 'پرداخت ثبت شد ولی آپلود رسید ناموفق بود');
          },
        });
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا در ثبت پرداخت'),
    });
  }
}
