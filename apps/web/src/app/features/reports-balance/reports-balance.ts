import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ContextService } from '../../core/context.service';
import { formatMoney } from '../../core/jalali';
import { watchBuildingYear } from '../../core/watch-context';
import { withBusy } from '../../core/with-busy';
import { Skeleton } from '../../shared/skeleton';

export type BalanceReport = {
  building: { id: string; name: string };
  fiscalYear: { id: string; title: string };
  receiptsTotal: number;
  paymentsTotal: number;
  balance: number;
  receiptsByType: { id: string; name: string; amount: number }[];
  paymentsByCategory: { id: string; name: string; amount: number }[];
  months: {
    year: number;
    month: number;
    title: string;
    receipts: number;
    payments: number;
    balance: number;
    cumulative: number;
  }[];
};

@Component({
  selector: 'app-reports-balance',
  imports: [RouterLink, Skeleton],
  templateUrl: './reports-balance.html',
})
export class ReportsBalance {
  private http = inject(HttpClient);
  ctx = inject(ContextService);
  data = signal<BalanceReport | null>(null);
  loading = signal(true);
  formatMoney = formatMoney;

  constructor() {
    watchBuildingYear(this.ctx, () => this.load());
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
      this.http.get<BalanceReport>('/api/reports/balance', { params: { buildingId, fiscalYearId } }),
    ).subscribe({
      next: (res) => this.data.set(res),
      error: () => {
        this.data.set(null);
        this.loading.set(false);
      },
    });
  }
}
