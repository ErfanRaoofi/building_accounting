import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ContextService } from '../../core/context.service';
import { formatJalali, formatMoney } from '../../core/jalali';
import { watchBuildingYear } from '../../core/watch-context';
import { DEFAULT_PAGE_SIZE, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';

@Component({
  selector: 'app-reports-payments',
  imports: [RouterLink, Pager, Skeleton],
  templateUrl: './reports-payments.html',
})
export class ReportsPayments {
  private http = inject(HttpClient);
  ctx = inject(ContextService);
  data = signal<any>(null);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  loading = signal(true);
  formatMoney = formatMoney;
  formatJalali = formatJalali;

  constructor() {
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.page.set(1);
    this.load();
  }

  load() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!buildingId || !fiscalYearId) {
      this.data.set(null);
      this.loading.set(false);
      return;
    }
    withBusy(
      this.loading,
      this.http.get('/api/reports/payments', { params: { buildingId, fiscalYearId, ...pageQuery(this.page(), this.pageSize()) } }),
    ).subscribe((res) => this.data.set(res));
  }
}
