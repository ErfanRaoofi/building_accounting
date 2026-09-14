import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ContextService } from '../../core/context.service';
import { ToastService } from '../../core/toast.service';
import { formatJalali, formatMoney, isoDate, JALALI_MONTHS } from '../../core/jalali';
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

@Component({
  selector: 'app-receipts',
  imports: [ReactiveFormsModule, Pager, Skeleton, Busy, FormRail, FormModal, IconAction, MoneyInput, JalaliDatepicker],
  templateUrl: './receipts.html',
})
export class Receipts {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  ctx = inject(ContextService);
  rows = signal<any[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  search = signal('');
  types = signal<any[]>([]);
  units = signal<any[]>([]);
  invoices = signal<any[]>([]);
  credit = signal(0);
  selected = signal<Record<string, boolean>>({});
  received = signal(0);
  loading = signal(true);
  invoicesLoading = signal(false);
  saving = signal(false);
  formOpen = signal(false);
  detailOpen = signal(false);
  detail = signal<any | null>(null);
  formatMoney = formatMoney;
  formatJalali = formatJalali;
  form = this.fb.nonNullable.group({
    receiptTypeId: ['', Validators.required],
    unitId: [''],
    date: [new Date() as Date, Validators.required],
    paymentMethod: ['CASH'],
    description: [''],
    otherAmount: [0],
    receivedAmount: [0],
  });
  selectedType() {
    return this.types().find((t) => t.id === this.form.controls.receiptTypeId.value);
  }
  unpaidInvoices = computed(() => this.invoices().filter((i) => i.remaining > 0));
  selectedTotal = computed(() =>
    this.unpaidInvoices()
      .filter((i) => this.selected()[i.id])
      .reduce((s, i) => s + i.remaining, 0),
  );
  prepaidAmount = computed(() => Math.max(0, this.receivedAmount() - this.selectedTotal()));

  constructor() {
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
    this.form.controls.unitId.valueChanges.subscribe((unitId) => this.loadInvoices(unitId));
    this.form.controls.receiptTypeId.valueChanges.subscribe(() => this.selected.set({}));
    this.form.controls.receivedAmount.valueChanges.subscribe((value) => this.received.set(Number(value) || 0));
  }

  resetAndLoad() {
    this.search.set('');
    this.page.set(1);
    this.rows.set([]);
    this.detail.set(null);
    this.detailOpen.set(false);
    this.loadLookups();
    this.loadList();
  }

  onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.loadList();
    }, 300);
  }

  rowNo(index: number) {
    return (this.page() - 1) * this.pageSize() + index + 1;
  }

  methodLabel(method: string) {
    if (method === 'TRANSFER') return 'واریز';
    if (method === 'CARD') return 'کارتخوان';
    if (method === 'OTHER') return 'سایر';
    return 'نقد';
  }

  openDetail(row: any) {
    this.detail.set(row);
    this.detailOpen.set(true);
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
    const q = this.search().trim();
    withBusy(
      this.loading,
      this.http.get<Paged>('/api/receipts', {
        params: { buildingId, fiscalYearId, ...pageQuery(this.page(), this.pageSize()), ...(q ? { q } : {}) },
      }),
    ).subscribe((res) => {
      this.rows.set(res.items);
      this.total.set(res.total);
    });
  }

  loadLookups() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!buildingId || !fiscalYearId) {
      this.types.set([]);
      this.units.set([]);
      this.invoices.set([]);
      this.credit.set(0);
      return;
    }
    this.http.get<Paged>('/api/receipt-types', { params: { buildingId, ...ALL_QUERY } }).subscribe((res) => {
      this.types.set(res.items);
      const charge = res.items.find((r) => r.kind === 'CHARGE');
      this.form.patchValue({ receiptTypeId: charge?.id || '', unitId: '' });
      this.selected.set({});
    });
    this.http.get<Paged>('/api/units', { params: { buildingId, ...ALL_QUERY } }).subscribe((res) => {
      this.units.set(res.items);
    });
  }

  loadInvoices(unitId: string) {
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!unitId || !fiscalYearId) {
      this.invoices.set([]);
      this.credit.set(0);
      this.invoicesLoading.set(false);
      return;
    }
    withBusy(this.invoicesLoading, this.http.get<{ items: any[]; credit: number }>('/api/charges', { params: { fiscalYearId, unitId } })).subscribe((res) => {
      this.invoices.set(res.items || []);
      this.credit.set(res.credit || 0);
      this.selected.set({});
    });
  }

  toggle(id: string, checked: boolean) {
    this.selected.update((s) => ({ ...s, [id]: checked }));
  }

  selectRemaining() {
    const next: Record<string, boolean> = {};
    for (const row of this.unpaidInvoices()) {
      next[row.id] = true;
    }
    this.selected.set(next);
  }

  clearSelection() {
    this.selected.set({});
  }

  statusLabel(status: string) {
    if (status === 'PAID') return 'پرداخت‌شده';
    if (status === 'PARTIAL') return 'ناقص';
    return 'پرداخت‌نشده';
  }

  receivedAmount() {
    return this.received() || this.selectedTotal();
  }

  lineLabel(line: any, row: any) {
    if (line.chargeInvoice) {
      return `${JALALI_MONTHS[line.chargeInvoice.jalaliMonth - 1]} ${line.chargeInvoice.jalaliYear}`;
    }
    return line.description || row.description || 'پیش‌پرداخت / بستانکار';
  }

  openForm() {
    this.formOpen.set(true);
  }

  save() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    const value = this.form.getRawValue();
    if (!buildingId || !fiscalYearId || !value.date || this.saving()) {
      return;
    }
    const kind = this.selectedType()?.kind;
    let lines: { chargeInvoiceId?: string; amount: number; description?: string }[] = [];
    if (kind === 'CHARGE') {
      if (!value.unitId) {
        this.toast.show('واحد را انتخاب کنید');
        return;
      }
      const picked = [...this.unpaidInvoices()]
        .filter((i) => this.selected()[i.id])
        .sort((a, b) => a.jalaliYear - b.jalaliYear || a.jalaliMonth - b.jalaliMonth);
      const received = Number(value.receivedAmount) || this.selectedTotal();
      if (!received) {
        this.toast.show('مبلغ دریافتی یا حداقل یک ماه بدهکار را مشخص کنید');
        return;
      }
      let left = received;
      for (const row of picked) {
        if (left <= 0) {
          break;
        }
        const amount = Math.min(row.remaining, left);
        if (amount > 0) {
          lines.push({ chargeInvoiceId: row.id, amount });
          left -= amount;
        }
      }
      if (left > 0) {
        lines.push({ amount: left, description: 'پیش‌پرداخت / بستانکار' });
      }
    } else {
      const amount = Number(value.otherAmount);
      if (!amount) {
        this.toast.show('مبلغ دریافت را وارد کنید');
        return;
      }
      lines = [{ amount }];
    }
    withBusy(
      this.saving,
      this.http.post('/api/receipts', {
        buildingId,
        fiscalYearId,
        receiptTypeId: value.receiptTypeId,
        unitId: value.unitId || undefined,
        date: isoDate(value.date),
        paymentMethod: value.paymentMethod,
        description: value.description,
        lines,
      }),
    ).subscribe({
      next: () => {
        this.selected.set({});
        this.form.patchValue({ unitId: '', description: '', otherAmount: 0, receivedAmount: 0, date: new Date() });
        this.received.set(0);
        this.invoices.set([]);
        this.credit.set(0);
        this.loadList();
        this.toast.show('دریافت ثبت شد');
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }
}
