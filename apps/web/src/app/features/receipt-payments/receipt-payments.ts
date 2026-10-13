import { Component, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ContextService } from '../../core/context.service';
import { formatJalali, formatMoney, formatMoneyToman } from '../../core/jalali';
import { paymentMethodLabel } from '../../core/payment-method';
import { watchBuildingYear } from '../../core/watch-context';
import { DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { ReceiptFormRail } from '../receipts/receipt-form-rail';

type PaymentRow = {
  id: string;
  date: string;
  amount: number;
  paymentMethod: string;
  description?: string | null;
  monthsLabel?: string | null;
  fromRequest?: boolean;
  receiptType?: { id: string; name: string; kind?: string } | null;
  receipt?: {
    id: string;
    number: string;
    unitId?: string | null;
    unit?: { id: string; number: string; ownerName?: string | null; residentName?: string | null } | null;
  } | null;
};

type ListResponse = Paged<PaymentRow> & {
  totals?: { byType: { id: string; name: string; amount: number }[]; total: number };
};

@Component({
  selector: 'app-receipt-payments',
  imports: [RouterLink, Pager, Skeleton, ReceiptFormRail],
  templateUrl: './receipt-payments.html',
})
export class ReceiptPayments {
  private http = inject(HttpClient);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private unitSearchTimer: ReturnType<typeof setTimeout> | undefined;
  ctx = inject(ContextService);
  receiptForm = viewChild<ReceiptFormRail>('receiptForm');

  rows = signal<PaymentRow[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  search = signal('');
  unitSearch = signal('');
  sort = signal('date_desc');
  typeTotals = signal<{ id: string; name: string; amount: number }[]>([]);
  totalsTotal = signal(0);
  loading = signal(true);
  formOpen = signal(false);

  formatMoney = formatMoney;
  formatMoneyToman = formatMoneyToman;
  formatJalali = formatJalali;
  methodLabel = paymentMethodLabel;

  constructor() {
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.page.set(1);
    this.formOpen.set(false);
    this.load();
  }

  onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 300);
  }

  onUnitSearch(value: string) {
    this.unitSearch.set(value);
    clearTimeout(this.unitSearchTimer);
    this.unitSearchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 300);
  }

  onSort(value: string) {
    this.sort.set(value);
    this.page.set(1);
    this.load();
  }

  rowNo(index: number) {
    return (this.page() - 1) * this.pageSize() + index + 1;
  }

  openCreate() {
    this.receiptForm()?.openCreate();
  }

  onReceiptSaved() {
    this.load();
  }

  load() {
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
    const params: Record<string, string> = {
      buildingId,
      fiscalYearId,
      ...pageQuery(this.page(), this.pageSize()),
      sort: this.sort(),
    };
    if (this.search().trim()) {
      params['q'] = this.search().trim();
    }
    if (this.unitSearch().trim()) {
      params['unitQ'] = this.unitSearch().trim();
    }
    withBusy(this.loading, this.http.get<ListResponse>('/api/receipt-payments', { params })).subscribe((res) => {
      this.rows.set(res.items || []);
      this.total.set(res.total || 0);
      this.typeTotals.set(res.totals?.byType || []);
      this.totalsTotal.set(res.totals?.total || 0);
    });
  }
}
