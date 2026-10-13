import { Component, ElementRef, HostListener, computed, inject, model, output, signal, viewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ContextService } from '../../core/context.service';
import { ToastService } from '../../core/toast.service';
import { formatMoneyToman, isoDate, normalizeDigits } from '../../core/jalali';
import { PAYMENT_METHOD_OPTIONS } from '../../core/payment-method';
import { watchBuildingYear } from '../../core/watch-context';
import { ALL_QUERY, Paged } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormRail } from '../../shared/form-rail';
import { MoneyInput } from '../../shared/money-input';
import { JalaliDatepicker } from '../../shared/jalali-datepicker';

type Focusable = { focus(): void };

@Component({
  selector: 'app-receipt-form-rail',
  imports: [FormsModule, ReactiveFormsModule, Skeleton, Busy, FormRail, MoneyInput, JalaliDatepicker],
  templateUrl: './receipt-form-rail.html',
})
export class ReceiptFormRail {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private unitPickTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingEdit: any | null = null;
  ctx = inject(ContextService);

  open = model(false);
  saved = output<void>();

  typeField = viewChild<ElementRef<HTMLSelectElement>>('typeEl');
  unitField = viewChild<ElementRef<HTMLInputElement>>('unitEl');
  unitMenu = viewChild<ElementRef<HTMLElement>>('unitMenu');
  dateField = viewChild<JalaliDatepicker>('dateEl');
  otherAmountField = viewChild<MoneyInput>('otherAmt');
  receivedAmountField = viewChild<MoneyInput>('receivedAmt');

  types = signal<any[]>([]);
  units = signal<any[]>([]);
  unitQuery = signal('');
  unitMenuOpen = signal(false);
  unitHighlight = signal(0);
  invoices = signal<any[]>([]);
  credit = signal(0);
  chargeReceipt = signal<{ id: string; number: string; totalAmount: number } | null>(null);
  selected = signal<Record<string, boolean>>({});
  editBoost = signal<Record<string, number>>({});
  monthDraft = signal<Record<string, number>>({});
  received = signal(0);
  invoicesLoading = signal(false);
  saving = signal(false);
  occupancyId = signal<string | null>(null);
  editingId = signal<string | null>(null);

  formatMoneyToman = formatMoneyToman;
  paymentMethods = PAYMENT_METHOD_OPTIONS;

  form = this.fb.nonNullable.group({
    receiptTypeId: ['', Validators.required],
    unitId: [''],
    date: [new Date() as Date, Validators.required],
    paymentMethod: ['CASH'],
    description: [''],
    otherAmount: [0],
    receivedAmount: [0],
  });

  filteredUnits = computed(() => {
    const q = normalizeDigits(this.unitQuery()).trim().toLowerCase();
    const list = this.units();
    if (!q || this.form.controls.unitId.value) {
      return list;
    }
    return list.filter((u) => {
      const number = normalizeDigits(String(u.number || '')).toLowerCase();
      const owner = String(u.ownerName || '').toLowerCase();
      return number.includes(q) || owner.includes(q);
    });
  });

  selectedUnitLabel = computed(() => {
    const id = this.form.controls.unitId.value;
    if (!id) {
      return '';
    }
    const unit = this.units().find((u) => u.id === id);
    return unit ? `${unit.number} — ${unit.ownerName || 'بدون مالک'}` : '';
  });

  unpaidInvoices = computed(() => this.invoices().filter((i) => this.invoiceRemaining(i) > 0));
  selectedTotal = computed(() => {
    const draft = this.monthDraft();
    let sum = 0;
    for (const row of this.unpaidInvoices()) {
      const typed = Math.round(Number(draft[row.id]) || 0);
      if (typed > 0) {
        sum += typed;
      } else if (this.selected()[row.id]) {
        sum += this.invoiceRemaining(row);
      }
    }
    return sum;
  });
  prepaidAmount = computed(() => {
    const allocated = this.monthDraftTotal() || this.selectedTotal();
    return Math.max(0, this.receivedAmount() - allocated);
  });
  monthDraftTotal = computed(() => Object.values(this.monthDraft()).reduce((sum, amount) => sum + (Number(amount) || 0), 0));

  constructor() {
    watchBuildingYear(this.ctx, () => this.loadLookups());
    this.form.controls.unitId.valueChanges.subscribe((unitId) => this.loadInvoices(unitId));
    this.form.controls.receiptTypeId.valueChanges.subscribe(() => {
      if (!this.pendingEdit) {
        this.selected.set({});
      }
    });
    this.form.controls.receivedAmount.valueChanges.subscribe((value) => this.received.set(Number(value) || 0));
  }

  @HostListener('document:keydown', ['$event'])
  onHotkey(event: KeyboardEvent) {
    if (!this.open() || event.key !== 'F9') {
      return;
    }
    event.preventDefault();
    this.save();
  }

  selectedType() {
    return this.types().find((t) => t.id === this.form.controls.receiptTypeId.value);
  }

  invoiceRemaining(row: { id: string; remaining: number }) {
    return (Number(row.remaining) || 0) + (this.editBoost()[row.id] || 0);
  }

  monthAmount(id: string) {
    return this.monthDraft()[id] || 0;
  }

  canEditMonth(row: { id: string; remaining: number }) {
    return this.invoiceRemaining(row) > 0 || (!!this.editingId() && this.monthAmount(row.id) > 0);
  }

  rememberMonth(id: string, value: number | null) {
    const row = this.invoices().find((item) => item.id === id);
    if (!row || !this.canEditMonth(row)) {
      return;
    }
    const cap = this.invoiceRemaining(row);
    const prev = this.monthDraft();
    const prevSum = Object.values(prev).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
    const extra = Math.max(0, this.received() - prevSum);
    const amount = Math.min(Math.max(0, Math.round(Number(value) || 0)), Math.max(0, cap));
    const next = { ...prev, [id]: amount };
    this.monthDraft.set(next);
    this.selected.update((s) => ({ ...s, [id]: amount > 0 }));
    const sum = Object.values(next).reduce((total, item) => total + (Number(item) || 0), 0);
    this.form.patchValue({ receivedAmount: sum + extra });
  }

  openCreate() {
    this.editingId.set(null);
    this.editBoost.set({});
    this.monthDraft.set({});
    this.pendingEdit = null;
    this.form.reset(this.blankForm());
    this.unitQuery.set('');
    this.selected.set({});
    this.received.set(0);
    this.invoices.set([]);
    this.credit.set(0);
    this.chargeReceipt.set(null);
    this.unitMenuOpen.set(false);
    this.open.set(true);
    queueMicrotask(() => this.focusStart());
  }

  openEdit(row: any) {
    this.editingId.set(row.id);
    this.pendingEdit = row;
    const boost: Record<string, number> = {};
    for (const line of row.lines || []) {
      const invoiceId = line.chargeInvoiceId || line.chargeInvoice?.id;
      if (invoiceId) {
        boost[invoiceId] = (boost[invoiceId] || 0) + Number(line.amount || 0);
      }
    }
    this.editBoost.set(boost);
    this.monthDraft.set({ ...boost });
    this.form.patchValue({
      receiptTypeId: row.receiptTypeId,
      unitId: row.unitId || '',
      date: new Date(row.date),
      paymentMethod: row.paymentMethod || 'CASH',
      description: row.description || '',
      receivedAmount: row.receiptType?.kind === 'CHARGE' ? row.totalAmount : 0,
      otherAmount: row.receiptType?.kind === 'CHARGE' ? 0 : row.totalAmount,
    });
    this.received.set(row.receiptType?.kind === 'CHARGE' ? row.totalAmount : 0);
    this.unitQuery.set(row.unit ? `${row.unit.number} — ${row.unit.ownerName || 'بدون مالک'}` : '');
    this.open.set(true);
    this.loadInvoices(row.unitId || '');
    queueMicrotask(() => this.focusStart());
  }

  close() {
    this.open.set(false);
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
      if (!this.editingId()) {
        const charge = res.items.find((r) => r.kind === 'CHARGE');
        this.form.patchValue({ receiptTypeId: charge?.id || '', unitId: '' });
        this.unitQuery.set('');
        this.selected.set({});
      }
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
      this.chargeReceipt.set(null);
      this.invoicesLoading.set(false);
      return;
    }
    withBusy(
      this.invoicesLoading,
      this.http.get<{ items: any[]; credit: number; chargeReceipt?: { id: string; number: string; totalAmount: number } | null }>(
        '/api/charges',
        { params: { fiscalYearId, unitId } },
      ),
    ).subscribe((res) => {
      this.invoices.set(res.items || []);
      this.credit.set(res.credit || 0);
      this.chargeReceipt.set(res.chargeReceipt || null);
      if (this.pendingEdit) {
        const next: Record<string, boolean> = {};
        for (const line of this.pendingEdit.lines || []) {
          const invoiceId = line.chargeInvoiceId || line.chargeInvoice?.id;
          if (invoiceId) {
            next[invoiceId] = true;
          }
        }
        this.selected.set(next);
        this.pendingEdit = null;
      } else if (!this.editingId()) {
        this.selected.set({});
      }
    });
  }

  toggle(id: string, checked: boolean) {
    const row = this.invoices().find((item) => item.id === id);
    if (!row || (!checked && !this.canEditMonth(row) && !this.monthAmount(id))) {
      return;
    }
    if (checked && this.invoiceRemaining(row) <= 0) {
      return;
    }
    this.selected.update((s) => ({ ...s, [id]: checked }));
    const amount = checked ? this.invoiceRemaining(row) : 0;
    const prev = this.monthDraft();
    const prevSum = Object.values(prev).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const extra = Math.max(0, this.received() - prevSum);
    const next = { ...prev, [id]: amount };
    this.monthDraft.set(next);
    const sum = Object.values(next).reduce((total, value) => total + (Number(value) || 0), 0);
    this.form.patchValue({ receivedAmount: sum + extra });
  }

  setOccupancy(row: { id: string; occupancy?: string; paidAmount?: number }, occupancy: 'VACANT' | 'OCCUPIED') {
    if (this.occupancyId() || row.occupancy === occupancy) {
      return;
    }
    const oldBoost = this.editBoost()[row.id] || 0;
    const currentDraft = this.monthAmount(row.id);
    const previousPaid = Number(row.paidAmount) || 0;
    this.occupancyId.set(row.id);
    this.http.patch<any>(`/api/charges/invoices/${row.id}/occupancy`, { occupancy }).subscribe({
      next: (updated) => {
        this.occupancyId.set(null);
        this.invoices.update((items) =>
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
        const paid = Number(updated.paidAmount) || 0;
        const peeled = Math.max(0, previousPaid - paid);
        if (this.editingId()) {
          const nextBoost = Math.min(oldBoost, paid);
          this.editBoost.update((boost) => ({ ...boost, [row.id]: nextBoost }));
          const cap = Number(updated.amount) || 0;
          const nextDraft = currentDraft === oldBoost ? nextBoost : Math.min(currentDraft, cap);
          if (nextDraft !== currentDraft) {
            this.monthDraft.update((draft) => ({ ...draft, [row.id]: nextDraft }));
          }
        } else if (peeled) {
          this.credit.update((credit) => credit + peeled);
        }
        this.toast.show(occupancy === 'VACANT' ? 'این ماه خالی شد' : 'این ماه پر شد');
      },
      error: (err) => {
        this.occupancyId.set(null);
        this.toast.show(err.error?.message || 'خطا');
      },
    });
  }

  selectRemaining() {
    const nextSelected: Record<string, boolean> = {};
    const nextDraft: Record<string, number> = { ...this.monthDraft() };
    let sum = 0;
    for (const row of this.unpaidInvoices()) {
      nextSelected[row.id] = true;
      const amount = this.invoiceRemaining(row);
      nextDraft[row.id] = amount;
      sum += amount;
    }
    this.selected.set(nextSelected);
    this.monthDraft.set(nextDraft);
    this.form.patchValue({ receivedAmount: sum });
    this.received.set(sum);
  }

  clearSelection() {
    this.selected.set({});
    this.monthDraft.set({});
    this.form.patchValue({ receivedAmount: 0 });
    this.received.set(0);
  }

  statusLabel(status: string) {
    if (status === 'PAID') return 'پرداخت‌شده';
    if (status === 'PARTIAL') return 'ناقص';
    return 'پرداخت‌نشده';
  }

  receivedAmount() {
    return this.received() || this.selectedTotal();
  }

  blankForm() {
    const charge = this.types().find((t) => t.kind === 'CHARGE');
    return {
      receiptTypeId: charge?.id || this.types()[0]?.id || '',
      unitId: '',
      date: new Date() as Date,
      paymentMethod: 'CASH',
      description: '',
      otherAmount: 0,
      receivedAmount: 0,
    };
  }

  focusStart() {
    if (this.selectedType()?.kind === 'CHARGE') {
      this.focusUnit();
      return;
    }
    this.typeField()?.nativeElement.focus();
  }

  focusUnit() {
    const input = this.unitField()?.nativeElement;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }

  focusNext(target?: Focusable | ElementRef<HTMLElement> | HTMLElement | null) {
    if (!target) {
      return;
    }
    queueMicrotask(() => {
      if (target instanceof ElementRef) {
        target.nativeElement.focus();
        if (target.nativeElement instanceof HTMLInputElement) {
          target.nativeElement.select();
        }
        return;
      }
      if (target instanceof HTMLElement) {
        target.focus();
        if (target instanceof HTMLInputElement) {
          target.select();
        }
        return;
      }
      target.focus();
    });
  }

  onEnter(event: Event, next?: Focusable | ElementRef<HTMLElement> | HTMLElement | null) {
    event.preventDefault();
    this.focusNext(next);
  }

  onUnitInput(value: string) {
    this.unitQuery.set(value);
    this.unitMenuOpen.set(true);
    this.unitHighlight.set(0);
    if (this.form.controls.unitId.value) {
      this.form.patchValue({ unitId: '' });
    }
    queueMicrotask(() => this.scrollUnitHighlight());
  }

  onUnitFocus() {
    this.unitMenuOpen.set(true);
    setTimeout(() => this.scrollUnitHighlight(), 0);
  }

  onUnitBlur() {
    clearTimeout(this.unitPickTimer);
    this.unitPickTimer = setTimeout(() => {
      this.unitMenuOpen.set(false);
      if (this.form.controls.unitId.value) {
        this.unitQuery.set(this.selectedUnitLabel());
      }
    }, 150);
  }

  onUnitKeydown(event: KeyboardEvent) {
    const list = this.filteredUnits();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.unitMenuOpen.set(true);
      this.unitHighlight.update((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
      setTimeout(() => this.scrollUnitHighlight(), 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.unitHighlight.update((i) => Math.max(i - 1, 0));
      setTimeout(() => this.scrollUnitHighlight(), 0);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = list[this.unitHighlight()] || (list.length === 1 ? list[0] : null);
      if (hit) {
        this.pickUnit(hit);
      }
      this.focusNext(this.dateField());
      return;
    }
    if (event.key === 'Escape') {
      this.unitMenuOpen.set(false);
    }
  }

  scrollUnitHighlight() {
    const menu = this.unitMenu()?.nativeElement;
    const item = menu?.querySelector<HTMLElement>(`[data-unit-index="${this.unitHighlight()}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }

  pickUnit(unit: { id: string; number: string; ownerName?: string }) {
    this.form.patchValue({ unitId: unit.id });
    this.unitQuery.set(`${unit.number} — ${unit.ownerName || 'بدون مالک'}`);
    this.unitMenuOpen.set(false);
  }

  clearUnit() {
    this.form.patchValue({ unitId: '' });
    this.unitQuery.set('');
    this.unitMenuOpen.set(true);
    this.focusUnit();
  }

  amountField() {
    return this.selectedType()?.kind === 'CHARGE' ? this.receivedAmountField() : this.otherAmountField();
  }

  onAmountEnter(event: Event) {
    event.preventDefault();
    this.save();
  }

  private pickInvoicesForAmount(amount: number) {
    const unpaid = [...this.unpaidInvoices()].sort(
      (a, b) => a.jalaliYear - b.jalaliYear || a.jalaliMonth - b.jalaliMonth,
    );
    const picked: any[] = [];
    let left = amount;
    for (const row of unpaid) {
      if (left <= 0) {
        break;
      }
      picked.push(row);
      left -= this.invoiceRemaining(row);
    }
    return picked;
  }

  private allocateReceivedToMonths(received: number) {
    const picked = this.pickInvoicesForAmount(received);
    const nextSelected: Record<string, boolean> = {};
    const nextDraft: Record<string, number> = {};
    let left = received;
    for (const row of picked) {
      if (left <= 0) {
        break;
      }
      const amount = Math.min(this.invoiceRemaining(row), left);
      if (amount > 0) {
        nextSelected[row.id] = true;
        nextDraft[row.id] = amount;
        left -= amount;
      }
    }
    this.selected.set(nextSelected);
    this.monthDraft.set(nextDraft);
  }

  linesFromMonthDraft(received: number) {
    if (this.invoicesLoading()) {
      this.toast.show('صبر کنید تا ماه‌ها بارگذاری شوند');
      return null;
    }
    const lines: { chargeInvoiceId?: string; amount: number; description?: string }[] = [];
    for (const row of this.invoices()) {
      const amount = Math.round(Number(this.monthDraft()[row.id]) || 0);
      if (!amount) {
        continue;
      }
      const cap = this.invoiceRemaining(row);
      if (amount > cap) {
        this.toast.show(`مبلغ ${row.monthTitle} از شارژ این ماه بیشتر است`);
        return null;
      }
      lines.push({ chargeInvoiceId: row.id, amount });
    }
    const monthSum = lines.reduce((sum, line) => sum + line.amount, 0);
    if (!monthSum && !received) {
      this.toast.show('مبلغ حداقل یک ماه را وارد کنید');
      return null;
    }
    if (received && received < monthSum) {
      this.toast.show('مبلغ دریافتی از جمع ماه‌ها کمتر است');
      return null;
    }
    const total = Math.max(received, monthSum);
    if (total > monthSum) {
      lines.push({ amount: total - monthSum, description: 'پیش‌پرداخت / بستانکار' });
    }
    return lines;
  }

  save() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    const value = this.form.getRawValue();
    const id = this.editingId();
    if (!buildingId || !fiscalYearId || !value.date || this.saving()) {
      return;
    }
    const kind = this.selectedType()?.kind;
    let lines: { chargeInvoiceId?: string; amount: number; description?: string }[] = [];
    if (!value.unitId) {
      this.toast.show('واحد را انتخاب کنید');
      this.focusUnit();
      return;
    }
    if (kind === 'CHARGE') {
      const received = Number(value.receivedAmount) || this.selectedTotal();
      if (!this.monthDraftTotal() && received) {
        this.allocateReceivedToMonths(received);
      }
      if (id || this.monthDraftTotal()) {
        const edited = this.linesFromMonthDraft(received);
        if (!edited) {
          return;
        }
        lines = edited;
      } else {
        this.toast.show('مبلغ دریافتی یا حداقل یک ماه بدهکار را مشخص کنید');
        this.focusNext(this.receivedAmountField());
        return;
      }
    } else {
      const amount = Number(value.otherAmount);
      if (!amount) {
        this.toast.show('مبلغ دریافت را وارد کنید');
        this.focusNext(this.otherAmountField());
        return;
      }
      lines = [{ amount }];
    }
    const payload = {
      receiptTypeId: value.receiptTypeId,
      unitId: value.unitId || undefined,
      date: isoDate(value.date),
      paymentMethod: value.paymentMethod,
      description: value.description,
      lines,
    };
    const request = id
      ? this.http.patch<{ appended?: boolean; number?: string }>(`/api/receipts/${id}`, payload)
      : this.http.post<{ appended?: boolean; number?: string }>('/api/receipts', { buildingId, fiscalYearId, ...payload });
    withBusy(this.saving, request).subscribe({
      next: (res) => {
        if (id) {
          this.open.set(false);
          this.editingId.set(null);
          this.editBoost.set({});
          this.monthDraft.set({});
          this.saved.emit();
          this.toast.show('دریافت ویرایش شد');
        } else {
          this.selected.set({});
          this.monthDraft.set({});
          this.form.patchValue({ unitId: '', description: '', otherAmount: 0, receivedAmount: 0, date: new Date() });
          this.unitQuery.set('');
          this.received.set(0);
          this.invoices.set([]);
          this.credit.set(0);
          this.chargeReceipt.set(null);
          this.saved.emit();
          this.toast.show(res?.appended ? `به سند واحد ${res.number} اضافه شد` : 'دریافت ثبت شد');
          queueMicrotask(() => this.focusStart());
        }
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }
}
