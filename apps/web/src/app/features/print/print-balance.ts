import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ContextService } from '../../core/context.service';
import { formatJalali, formatMoney } from '../../core/jalali';
import { withBusy } from '../../core/with-busy';
import { Skeleton } from '../../shared/skeleton';
import type { BalanceReport } from '../reports-balance/reports-balance';

@Component({
  selector: 'app-print-balance',
  imports: [Skeleton],
  templateUrl: './print-balance.html',
  host: { class: 'block h-full' },
})
export class PrintBalance {
  private http = inject(HttpClient);
  ctx = inject(ContextService);
  data = signal<BalanceReport | null>(null);
  loading = signal(true);
  formatMoney = formatMoney;
  today = formatJalali(new Date());

  print() {
    window.print();
  }

  constructor() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!buildingId || !fiscalYearId) {
      this.loading.set(false);
      return;
    }
    withBusy(
      this.loading,
      this.http.get<BalanceReport>('/api/reports/balance', { params: { buildingId, fiscalYearId } }),
    ).subscribe((res) => {
      this.data.set(res);
      setTimeout(() => window.print(), 400);
    });
  }
}
