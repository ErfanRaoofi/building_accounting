import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { ContextService } from '../../core/context.service';
import { ToastService } from '../../core/toast.service';
import { formatJalali, formatMoney, isoDate } from '../../core/jalali';
import { watchBuildingYear } from '../../core/watch-context';
import { ALL_QUERY, DEFAULT_PAGE_SIZE, Paged } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { MoneyInput } from '../../shared/money-input';
import { JalaliDatepicker } from '../../shared/jalali-datepicker';
import { Busy } from '../../shared/busy';

@Component({
  selector: 'app-unit-ledger',
  imports: [FormsModule, ReactiveFormsModule, RouterLink, Pager, Skeleton, MoneyInput, JalaliDatepicker, Busy],
  templateUrl: './unit-ledger.html',
})
export class UnitLedger {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  auth = inject(AuthService);
  ctx = inject(ContextService);
  data = signal<any>(null);
  requests = signal<any[]>([]);
  invoicePage = signal(1);
  invoiceSize = signal(12);
  receiptPage = signal(1);
  receiptSize = signal(DEFAULT_PAGE_SIZE);
  loading = signal(true);
  requestsLoading = signal(false);
  submitting = signal(false);
  formOpen = signal(false);
  savingId = signal<string | null>(null);
  imagePreview = signal<string | null>(null);
  imageFile = signal<File | null>(null);
  formatMoney = formatMoney;
  formatJalali = formatJalali;
  private paidDraft: Record<string, number> = {};
  isResidentPortal = computed(() => !this.auth.isStaff() && this.auth.hasRole('RESIDENT'));
  form = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(1)]],
    date: [new Date() as Date, Validators.required],
    paymentMethod: ['TRANSFER' as string],
    description: [''],
  });

  constructor() {
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.invoicePage.set(1);
    this.receiptPage.set(1);
    this.load();
    if (this.isResidentPortal()) {
      this.loadRequests();
    }
  }

  load(quiet = false) {
    const id = this.route.snapshot.paramMap.get('id')!;
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!fiscalYearId) {
      this.data.set(null);
      this.loading.set(false);
      return;
    }
    const request = this.http.get(`/api/units/${id}/ledger`, {
      params: {
        fiscalYearId,
        invoicePage: String(this.invoicePage()),
        invoicePageSize: String(this.invoiceSize()),
        receiptPage: String(this.receiptPage()),
        receiptPageSize: String(this.receiptSize()),
      },
    });
    const apply = (res: unknown) => {
      this.paidDraft = {};
      this.data.set(res);
    };
    if (quiet) {
      request.subscribe(apply);
      return;
    }
    withBusy(this.loading, request).subscribe(apply);
  }

  loadRequests() {
    const unitId = this.route.snapshot.paramMap.get('id')!;
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!fiscalYearId) {
      this.requests.set([]);
      return;
    }
    withBusy(
      this.requestsLoading,
      this.http.get<Paged<any>>('/api/payment-requests', {
        params: { unitId, fiscalYearId, ...ALL_QUERY },
      }),
    ).subscribe({
      next: (res) => this.requests.set(res.items),
      error: () => this.requests.set([]),
    });
  }

  statusLabel(status: string) {
    return status === 'PAID' ? 'پرداخت‌شده' : status === 'PARTIAL' ? 'ناقص' : 'پرداخت‌نشده';
  }

  requestStatusLabel(status: string) {
    return status === 'APPROVED' ? 'تأیید شده' : status === 'REJECTED' ? 'رد شده' : 'در انتظار تأیید';
  }

  requestStatusClass(status: string) {
    return status === 'APPROVED' ? 'ui-chip-paid' : status === 'REJECTED' ? 'ui-chip-unpaid' : 'ui-chip-partial';
  }

  methodLabel(method: string) {
    return method === 'CASH' ? 'نقد' : method === 'CARD' ? 'کارت' : method === 'TRANSFER' ? 'حواله' : 'سایر';
  }

  rememberPaid(id: string, value: number | null) {
    this.paidDraft[id] = Number(value) || 0;
  }

  commitPaid(row: { id: string; paidAmount: number }) {
    const next = this.paidDraft[row.id];
    if (next == null || next === Number(row.paidAmount) || this.savingId()) {
      return;
    }
    this.savingId.set(row.id);
    this.http.patch(`/api/charges/invoices/${row.id}/paid`, { paidAmount: next }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.load(true);
        this.toast.show('دریافت این ماه روی سند واحد ثبت شد');
      },
      error: (err) => {
        this.savingId.set(null);
        this.toast.show(err.error?.message || 'خطا');
      },
    });
  }

  setOccupancy(row: { id: string; occupancy?: string }, occupancy: 'VACANT' | 'OCCUPIED') {
    if (this.savingId() || row.occupancy === occupancy) {
      return;
    }
    this.savingId.set(row.id);
    this.http.patch(`/api/charges/invoices/${row.id}/occupancy`, { occupancy }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.load();
        this.toast.show(occupancy === 'VACANT' ? 'این ماه خالی شد' : 'این ماه ساکن شد');
      },
      error: (err) => {
        this.savingId.set(null);
        this.toast.show(err.error?.message || 'خطا');
      },
    });
  }

  openPaymentForm() {
    this.form.reset({
      amount: 0,
      date: new Date(),
      paymentMethod: 'TRANSFER',
      description: '',
    });
    this.clearImage();
    this.formOpen.set(true);
  }

  closePaymentForm() {
    this.formOpen.set(false);
    this.clearImage();
  }

  onImagePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.toast.show('فقط تصویر مجاز است');
      input.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.toast.show('حجم تصویر حداکثر ۲ مگابایت است');
      input.value = '';
      return;
    }
    this.imageFile.set(file);
    const reader = new FileReader();
    reader.onload = () => this.imagePreview.set(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  clearImage() {
    this.imageFile.set(null);
    const prev = this.imagePreview();
    if (prev?.startsWith('blob:')) {
      URL.revokeObjectURL(prev);
    }
    this.imagePreview.set(null);
  }

  submitPayment() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    const unitId = this.route.snapshot.paramMap.get('id');
    const value = this.form.getRawValue();
    const file = this.imageFile();
    if (!buildingId || !fiscalYearId || !unitId || this.submitting()) {
      return;
    }
    const amount = Math.round(Number(value.amount) || 0);
    if (amount < 1) {
      this.toast.show('مبلغ را وارد کنید');
      return;
    }
    if (!value.date) {
      this.toast.show('تاریخ را وارد کنید');
      return;
    }
    if (!file) {
      this.toast.show('تصویر فیش را بارگذاری کنید');
      return;
    }
    const body = new FormData();
    body.set('buildingId', buildingId);
    body.set('fiscalYearId', fiscalYearId);
    body.set('unitId', unitId);
    body.set('amount', String(amount));
    body.set('date', isoDate(value.date));
    body.set('paymentMethod', value.paymentMethod);
    if (value.description?.trim()) {
      body.set('description', value.description.trim());
    }
    body.set('file', file);
    withBusy(this.submitting, this.http.post('/api/payment-requests', body)).subscribe({
      next: () => {
        this.toast.show('درخواست پرداخت ثبت شد و در انتظار تأیید است');
        this.closePaymentForm();
        this.loadRequests();
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا در ثبت درخواست'),
    });
  }
}
