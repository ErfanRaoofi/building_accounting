import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ContextService } from '../../core/context.service';
import { formatJalali, formatMoney } from '../../core/jalali';
import { ALL_QUERY } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Skeleton } from '../../shared/skeleton';
import { StatusMark } from '../../shared/status-mark';

@Component({
  selector: 'app-print-charges',
  imports: [Skeleton, StatusMark],
  templateUrl: './print-charges.html',
  host: { class: 'block h-full' },
})
export class PrintCharges {
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
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!fiscalYearId) {
      this.loading.set(false);
      return;
    }
    withBusy(this.loading, this.http.get('/api/reports/unit-charges', { params: { fiscalYearId, ...ALL_QUERY } })).subscribe((res: any) => {
      this.data.set(res);
      setTimeout(() => window.print(), 400);
    });
  }
}
