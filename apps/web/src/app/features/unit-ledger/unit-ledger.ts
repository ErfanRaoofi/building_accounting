import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ContextService } from '../../core/context.service';
import { formatJalali, formatMoney } from '../../core/jalali';
import { watchBuildingYear } from '../../core/watch-context';
import { DEFAULT_PAGE_SIZE } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';

@Component({
  selector: 'app-unit-ledger',
  imports: [RouterLink, Pager, Skeleton],
  templateUrl: './unit-ledger.html',
})
export class UnitLedger {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  ctx = inject(ContextService);
  data = signal<any>(null);
  invoicePage = signal(1);
  invoiceSize = signal(DEFAULT_PAGE_SIZE);
  receiptPage = signal(1);
  receiptSize = signal(DEFAULT_PAGE_SIZE);
  loading = signal(true);
  formatMoney = formatMoney;
  formatJalali = formatJalali;

  constructor() {
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.invoicePage.set(1);
    this.receiptPage.set(1);
    this.load();
  }

  load() {
    const id = this.route.snapshot.paramMap.get('id')!;
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!fiscalYearId) {
      this.data.set(null);
      this.loading.set(false);
      return;
    }
    withBusy(
      this.loading,
      this.http.get(`/api/units/${id}/ledger`, {
        params: {
          fiscalYearId,
          invoicePage: String(this.invoicePage()),
          invoicePageSize: String(this.invoiceSize()),
          receiptPage: String(this.receiptPage()),
          receiptPageSize: String(this.receiptSize()),
        },
      }),
    ).subscribe((res) => this.data.set(res));
  }

  statusLabel(status: string) {
    return status === 'PAID' ? 'پرداخت‌شده' : status === 'PARTIAL' ? 'ناقص' : 'پرداخت‌نشده';
  }
}
