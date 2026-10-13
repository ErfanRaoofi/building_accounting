import { Component, HostListener, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ContextService } from '../../core/context.service';
import { ToastService } from '../../core/toast.service';
import { formatJalali, formatMoney, formatMoneyToman, isoDate, JALALI_MONTHS, normalizeDigits } from '../../core/jalali';
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel } from '../../core/payment-method';
import { watchBuildingYear } from '../../core/watch-context';
import { ALL_QUERY, DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormRail } from '../../shared/form-rail';
import { FormModal } from '../../shared/form-modal';
import { IconAction } from '../../shared/icon-action';
import { MoneyInput } from '../../shared/money-input';
import { JalaliDatepicker } from '../../shared/jalali-datepicker';
import { ReceiptFormRail } from './receipt-form-rail';

@Component({
  selector: 'app-receipts',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    Pager,
    Skeleton,
    Busy,
    FormRail,
    FormModal,
    IconAction,
    MoneyInput,
    JalaliDatepicker,
    ReceiptFormRail,
  ],
  templateUrl: './receipts.html',
})
export class Receipts {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private unitSearchTimer: ReturnType<typeof setTimeout> | undefined;
  ctx = inject(ContextService);
  receiptForm = viewChild<ReceiptFormRail>('receiptForm');
  rows = signal<any[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  search = signal('');
  unitSearch = signal('');
  sort = signal('date_desc');
  typeTotals = signal<{ id: string; name: string; amount: number }[]>([]);
  totalsTotal = signal(0);
  loading = signal(true);
  occupancyId = signal<string | null>(null);
  removingId = signal<string | null>(null);
  formOpen = signal(false);
  detailOpen = signal(false);
  detail = signal<any | null>(null);
  pendingRequests = signal<any[]>([]);
  pendingLoading = signal(false);
  reviewingId = signal<string | null>(null);
  rejectOpen = signal(false);
  rejectId = signal<string | null>(null);
  rejectReason = signal('');
  voidOpen = signal(false);
  voidReason = signal('');
  paymentEditOpen = signal(false);
  paymentEditSaving = signal(false);
  paymentEditRemoving = signal(false);
  editingPaymentId = signal<string | null>(null);
  editingPaymentKind = signal<string | null>(null);
  payInvoices = signal<any[]>([]);
  payMonthDraft = signal<Record<string, number>>({});
  payOwn = signal<Record<string, number>>({});
  payKept = signal<Record<string, boolean>>({});
  payMonthsLoading = signal(false);
  formatMoney = formatMoney;
  formatMoneyToman = formatMoneyToman;
  formatJalali = formatJalali;
  paymentMethods = PAYMENT_METHOD_OPTIONS;
  methodLabel = paymentMethodLabel;
  paymentForm = this.fb.nonNullable.group({
    date: [new Date() as Date, Validators.required],
    amount: [0, [Validators.required, Validators.min(1)]],
    paymentMethod: ['CASH'],
    description: [''],
  });
  payMonthRows = computed(() =>
    this.payInvoices().filter(
      (row) => this.payKept()[row.id] || this.payMonthCap(row) > 0 || this.payMonthAmount(row.id) > 0,
    ),
  );
  payMonthSum = computed(() => Object.values(this.payMonthDraft()).reduce((sum, amount) => sum + (Number(amount) || 0), 0));

  constructor() {
    effect(() => {
      if (!this.detailOpen() && this.paymentEditOpen()) {
        this.closePaymentEdit();
      }
    });
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event) {
    if (this.paymentEditOpen()) {
      event.preventDefault();
      this.closePaymentEdit();
    }
  }

  resetAndLoad() {
    this.search.set('');
    this.unitSearch.set('');
    this.page.set(1);
    this.rows.set([]);
    this.detail.set(null);
    this.detailOpen.set(false);
    this.formOpen.set(false);
    this.rejectOpen.set(false);
    this.rejectId.set(null);
    this.rejectReason.set('');
    this.loadList();
    this.loadPendingRequests();
  }

  onReceiptSaved() {
    this.loadList();
    this.loadPendingRequests();
  }

  loadPendingRequests() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!buildingId || !fiscalYearId) {
      this.pendingRequests.set([]);
      return;
    }
    withBusy(
      this.pendingLoading,
      this.http.get<Paged>('/api/payment-requests', {
        params: { buildingId, fiscalYearId, status: 'PENDING', ...ALL_QUERY },
      }),
    ).subscribe({
      next: (res) => this.pendingRequests.set(res.items),
      error: (err) => {
        this.pendingRequests.set([]);
        this.toast.show(err.error?.message || 'بارگذاری درخواست‌های ساکنین ناموفق بود');
      },
    });
  }

  approveRequest(row: { id: string }) {
    if (this.reviewingId()) {
      return;
    }
    this.reviewingId.set(row.id);
    this.http.post(`/api/payment-requests/${row.id}/approve`, {}).subscribe({
      next: () => {
        this.reviewingId.set(null);
        this.toast.show('درخواست تأیید و دریافت ثبت شد');
        this.loadPendingRequests();
        this.loadList();
      },
      error: (err) => {
        this.reviewingId.set(null);
        this.toast.show(err.error?.message || 'خطا در تأیید');
      },
    });
  }

  openReject(row: { id: string }) {
    this.rejectId.set(row.id);
    this.rejectReason.set('');
    this.rejectOpen.set(true);
  }

  closeReject() {
    this.rejectOpen.set(false);
    this.rejectId.set(null);
    this.rejectReason.set('');
  }

  confirmReject() {
    const id = this.rejectId();
    if (!id || this.reviewingId()) {
      return;
    }
    this.reviewingId.set(id);
    const reason = this.rejectReason().trim();
    this.http.post(`/api/payment-requests/${id}/reject`, reason ? { reason } : {}).subscribe({
      next: () => {
        this.reviewingId.set(null);
        this.closeReject();
        this.toast.show('درخواست رد شد');
        this.loadPendingRequests();
      },
      error: (err) => {
        this.reviewingId.set(null);
        this.toast.show(err.error?.message || 'خطا در رد درخواست');
      },
    });
  }

  onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.loadList();
    }, 300);
  }

  onUnitSearch(value: string) {
    this.unitSearch.set(value);
    clearTimeout(this.unitSearchTimer);
    this.unitSearchTimer = setTimeout(() => {
      this.page.set(1);
      this.loadList();
    }, 300);
  }

  onSort(value: string) {
    this.sort.set(value);
    this.page.set(1);
    this.loadList();
  }

  rowNo(index: number) {
    return (this.page() - 1) * this.pageSize() + index + 1;
  }

  typeAmounts(row: { payments?: { amount?: number; receiptType?: { id?: string; name?: string; kind?: string } }[] }) {
    const grouped = new Map<string, { id: string; name: string; kind: string; amount: number }>();
    for (const payment of row.payments || []) {
      const id = payment.receiptType?.id || 'other';
      const current = grouped.get(id) || {
        id,
        name: payment.receiptType?.name || 'سایر',
        kind: payment.receiptType?.kind || 'OTHER',
        amount: 0,
      };
      current.amount += Number(payment.amount) || 0;
      grouped.set(id, current);
    }
    const rank = (kind: string) => (kind === 'CHARGE' ? 0 : kind === 'ENTRANCE' ? 1 : 2);
    return [...grouped.values()]
      .filter((item) => item.amount > 0)
      .sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name, 'fa'));
  }

  openDetail(row: any) {
    this.formOpen.set(false);
    this.closePaymentEdit();
    this.detail.set(row);
    this.detailOpen.set(true);
  }

  openPaymentEdit(pay: any) {
    const receipt = this.detail();
    this.editingPaymentId.set(pay.id);
    this.editingPaymentKind.set(pay.receiptType?.kind || null);
    this.paymentForm.reset({
      date: new Date(pay.date),
      amount: Number(pay.amount) || 0,
      paymentMethod: pay.paymentMethod || 'CASH',
      description: pay.description || '',
    });
    this.seedPayMonths(pay);
    this.paymentEditOpen.set(true);
    if (pay.receiptType?.kind === 'CHARGE' && receipt?.unitId) {
      this.loadPayMonths(receipt.unitId);
    } else {
      this.payInvoices.set([]);
    }
  }

  closePaymentEdit() {
    this.paymentEditOpen.set(false);
    this.editingPaymentId.set(null);
    this.editingPaymentKind.set(null);
    this.payInvoices.set([]);
    this.payMonthDraft.set({});
    this.payOwn.set({});
    this.payKept.set({});
  }

  payMonthAmount(id: string) {
    return this.payMonthDraft()[id] || 0;
  }

  payMonthCap(row: { id: string; remaining?: number }) {
    return Math.max(0, (Number(row.remaining) || 0) + (this.payOwn()[row.id] || 0));
  }

  payPrepaid() {
    return Math.max(0, Math.round(Number(this.paymentForm.controls.amount.value) || 0) - this.payMonthSum());
  }

  rememberPayMonth(id: string, value: number | null) {
    const row = this.payInvoices().find((item) => item.id === id);
    if (!row) {
      return;
    }
    const amount = Math.min(this.payMonthCap(row), Math.max(0, Math.round(Number(value) || 0)));
    const next = { ...this.payMonthDraft(), [id]: amount };
    this.payMonthDraft.set(next);
    const sum = Object.values(next).reduce((total, item) => total + (Number(item) || 0), 0);
    const current = Math.round(Number(this.paymentForm.controls.amount.value) || 0);
    if (sum > current) {
      this.paymentForm.patchValue({ amount: sum });
    }
  }

  private seedPayMonths(pay: any) {
    const own: Record<string, number> = {};
    for (const line of pay.lines || []) {
      const invoiceId = line.chargeInvoiceId || line.chargeInvoice?.id;
      if (!invoiceId) {
        continue;
      }
      own[invoiceId] = (own[invoiceId] || 0) + (Number(line.amount) || 0);
    }
    this.payOwn.set(own);
    this.payMonthDraft.set({ ...own });
  }

  private loadPayMonths(unitId: string) {
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!fiscalYearId) {
      return;
    }
    withBusy(
      this.payMonthsLoading,
      this.http.get<{ items: any[] }>('/api/charges', { params: { fiscalYearId, unitId } }),
    ).subscribe({
      next: (res) => {
        const items = res.items || [];
        const kept: Record<string, boolean> = {};
        for (const row of items) {
          if (this.payMonthCap(row) > 0 || this.payMonthAmount(row.id) > 0) {
            kept[row.id] = true;
          }
        }
        this.payKept.set(kept);
        this.payInvoices.set(items);
      },
      error: () => this.payInvoices.set([]),
    });
  }

  setPayOccupancy(row: { id: string; occupancy?: string }, occupancy: 'VACANT' | 'OCCUPIED') {
    if (this.occupancyId() || row.occupancy === occupancy) {
      return;
    }
    const receipt = this.detail();
    const paymentId = this.editingPaymentId();
    this.occupancyId.set(row.id);
    this.http.patch<any>(`/api/charges/invoices/${row.id}/occupancy`, { occupancy }).subscribe({
      next: (updated) => {
        this.occupancyId.set(null);
        this.payInvoices.update((items) =>
          items.map((item) =>
            item.id === updated.id
              ? {
                  ...item,
                  occupancy: updated.occupancy,
                  amount: updated.amount,
                  paidAmount: updated.paidAmount,
                  remaining: updated.remaining,
                  status: updated.status,
                }
              : item,
          ),
        );
        if (receipt?.id) {
          this.http.get<any>(`/api/receipts/${receipt.id}`).subscribe((fresh) => {
            this.detail.set(fresh);
            this.rows.update((items) => items.map((item) => (item.id === fresh.id ? fresh : item)));
            const pay = (fresh.payments || []).find((item: { id: string }) => item.id === paymentId);
            if (pay) {
              this.seedPayMonths(pay);
              this.paymentForm.patchValue({ amount: Number(pay.amount) || 0 });
            }
          });
        }
        this.toast.show(occupancy === 'VACANT' ? 'این ماه خالی شد' : 'این ماه پر شد');
      },
      error: (err) => {
        this.occupancyId.set(null);
        this.toast.show(err.error?.message || 'خطا');
      },
    });
  }

  savePaymentEdit() {
    const receipt = this.detail();
    const paymentId = this.editingPaymentId();
    const value = this.paymentForm.getRawValue();
    if (!receipt?.id || !paymentId || this.paymentEditSaving()) {
      return;
    }
    const amount = Math.round(Number(value.amount) || 0);
    if (amount < 1) {
      this.toast.show('مبلغ واریزی را وارد کنید');
      return;
    }
    if (!value.date) {
      this.toast.show('تاریخ را وارد کنید');
      return;
    }
    if (this.editingPaymentKind() === 'CHARGE' && this.payMonthsLoading()) {
      this.toast.show('صبر کنید تا ماه‌ها بارگذاری شوند');
      return;
    }
    const kind = this.editingPaymentKind();
    const body: Record<string, unknown> = {
      date: isoDate(value.date),
      amount,
      paymentMethod: value.paymentMethod,
      description: value.description?.trim() || null,
    };
    if (kind === 'CHARGE') {
      const lines: { chargeInvoiceId?: string; amount: number; description?: string }[] = [];
      for (const row of this.payInvoices()) {
        const monthAmount = Math.round(Number(this.payMonthDraft()[row.id]) || 0);
        if (!monthAmount) {
          continue;
        }
        if (monthAmount > this.payMonthCap(row)) {
          this.toast.show(`مبلغ ${row.monthTitle} از مانده این ماه بیشتر است`);
          return;
        }
        lines.push({ chargeInvoiceId: row.id, amount: monthAmount });
      }
      const monthSum = lines.reduce((sum, line) => sum + line.amount, 0);
      if (amount < monthSum) {
        this.toast.show('مبلغ واریزی از جمع ماه‌ها کمتر است');
        return;
      }
      body['lines'] = lines;
    }
    withBusy(
      this.paymentEditSaving,
      this.http.patch<any>(`/api/receipts/${receipt.id}/payments/${paymentId}`, body),
    ).subscribe({
      next: (updated) => {
        this.detail.set(updated);
        this.rows.update((items) => items.map((row) => (row.id === updated.id ? updated : row)));
        this.closePaymentEdit();
        this.toast.show('واریزی ویرایش شد');
        this.loadList();
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا در ویرایش واریزی'),
    });
  }

  removePaymentEdit() {
    const receipt = this.detail();
    const paymentId = this.editingPaymentId();
    if (!receipt?.id || !paymentId || this.paymentEditRemoving()) {
      return;
    }
    if (this.editingFromRequest()) {
      this.voidReason.set('');
      this.voidOpen.set(true);
      return;
    }
    if (!confirm('این واریزی از سند واحد حذف شود؟ خود سند باقی می‌ماند.')) {
      return;
    }
    this.deletePayment();
  }

  confirmVoidPayment() {
    const reason = this.voidReason().trim();
    if (reason.length < 3) {
      this.toast.show('دلیل حذف را بنویسید');
      return;
    }
    this.deletePayment(reason);
  }

  editingFromRequest() {
    const paymentId = this.editingPaymentId();
    const payment = (this.detail()?.payments || []).find((row: { id: string }) => row.id === paymentId);
    return Boolean(payment?.fromRequest);
  }

  private deletePayment(reason?: string) {
    const receipt = this.detail();
    const paymentId = this.editingPaymentId();
    if (!receipt?.id || !paymentId || this.paymentEditRemoving()) {
      return;
    }
    withBusy(
      this.paymentEditRemoving,
      this.http.delete<any>(`/api/receipts/${receipt.id}/payments/${paymentId}`, {
        body: reason ? { reason } : {},
      }),
    ).subscribe({
      next: (res) => {
        this.voidOpen.set(false);
        this.voidReason.set('');
        this.closePaymentEdit();
        this.detail.set(res);
        this.rows.update((items) => items.map((row) => (row.id === res.id ? res : row)));
        this.toast.show(reason ? 'واریزی حذف شد و دلیل برای ساکن ثبت شد' : 'واریزی حذف شد');
        this.loadList();
      },
      error: (err) => {
        const message = err.error?.message || 'خطا در حذف واریزی';
        if (!reason && String(message).includes('دلیل')) {
          this.voidReason.set('');
          this.voidOpen.set(true);
        }
        this.toast.show(message);
      },
    });
  }

  loadList() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!buildingId || !fiscalYearId) {
      this.rows.set([]);
      this.total.set(0);
      this.typeTotals.set([]);
      this.totalsTotal.set(0);
      this.loading.set(false);
      return;
    }
    const q = this.search().trim();
    const unitQ = normalizeDigits(this.unitSearch()).trim();
    withBusy(
      this.loading,
      this.http.get<Paged & { totals?: { byType: { id: string; name: string; amount: number }[]; total: number } }>(
        '/api/receipts',
        {
          params: {
            buildingId,
            fiscalYearId,
            sort: this.sort(),
            ...pageQuery(this.page(), this.pageSize()),
            ...(q ? { q } : {}),
            ...(unitQ ? { unitQ } : {}),
          },
        },
      ),
    ).subscribe((res) => {
      this.rows.set(res.items);
      this.total.set(res.total);
      this.typeTotals.set(res.totals?.byType || []);
      this.totalsTotal.set(res.totals?.total || 0);
    });
  }

  detailSubtitle() {
    const row = this.detail();
    if (!row) {
      return '';
    }
    if (this.paymentEditOpen()) {
      return `سند ${row.number}`;
    }
    return row.unit?.number ? `واحد ${row.unit.number}` : row.number;
  }

  openForm() {
    this.detailOpen.set(false);
    this.receiptForm()?.openCreate();
  }

  openEdit(row: any) {
    this.detailOpen.set(false);
    this.receiptForm()?.openEdit(row);
  }

  canDeleteReceipt(row: any) {
    return !row?.unitId;
  }

  remove(row: any) {
    if (this.removingId()) {
      return;
    }
    if (!this.canDeleteReceipt(row)) {
      this.toast.show('سند واحد قابل حذف نیست؛ فقط واریزی‌های داخل آن را حذف کنید');
      return;
    }
    if (!confirm(`دریافت ${row.number} حذف شود؟`)) {
      return;
    }
    this.removingId.set(row.id);
    this.http.delete(`/api/receipts/${row.id}`).subscribe({
      next: () => {
        this.removingId.set(null);
        if (this.detail()?.id === row.id) {
          this.detailOpen.set(false);
          this.detail.set(null);
        }
        this.formOpen.set(false);
        this.loadList();
        this.toast.show('دریافت حذف شد');
      },
      error: (err) => {
        this.removingId.set(null);
        this.toast.show(err.error?.message || 'حذف ناموفق بود');
      },
    });
  }

  statusLabel(status: string) {
    if (status === 'PAID') return 'پرداخت‌شده';
    if (status === 'PARTIAL') return 'ناقص';
    return 'پرداخت‌نشده';
  }

  lineLabel(line: any, row: any) {
    if (line.chargeInvoice) {
      return `${JALALI_MONTHS[line.chargeInvoice.jalaliMonth - 1]} ${line.chargeInvoice.jalaliYear}`;
    }
    return line.description || row.description || 'پیش‌پرداخت / بستانکار';
  }
}
