import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ContextService } from '../../core/context.service';
import { formatJalali, formatMoney } from '../../core/jalali';
import { ALL_QUERY } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Skeleton } from '../../shared/skeleton';

@Component({
  selector: 'app-print-payments',
  imports: [Skeleton],
  templateUrl: './print-payments.html',
  host: { class: 'block h-full' },
})
export class PrintPayments {
  private http = inject(HttpClient);
  ctx = inject(ContextService);
  data = signal<any>(null);
  loading = signal(true);
  formatMoney = formatMoney;
  formatJalali = formatJalali;
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
    withBusy(this.loading, this.http.get('/api/reports/payments', { params: { buildingId, fiscalYearId, ...ALL_QUERY } })).subscribe((res) => {
      this.data.set(res);
      setTimeout(() => window.print(), 400);
    });
  }
}
