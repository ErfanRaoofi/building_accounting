import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
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
  private route = inject(ActivatedRoute);
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
    const query = this.route.snapshot.queryParamMap;
    const range: Record<string, string> = {};
    for (const key of ['fromYear', 'fromMonth', 'toYear', 'toMonth']) {
      const value = query.get(key);
      if (value) {
        range[key] = value;
      }
    }
    withBusy(this.loading, this.http.get('/api/reports/unit-charges', { params: { fiscalYearId, ...ALL_QUERY, ...range } })).subscribe((res: any) => {
      this.data.set(res);
      setTimeout(() => window.print(), 400);
    });
  }

  shownMonths(data: any) {
    return data?.range?.months || data?.months || [];
  }

  rangeLabel(data: any) {
    const from = data?.range?.from;
    const to = data?.range?.to;
    if (!from || !to) {
      return '';
    }
    if (from.year === to.year && from.month === to.month) {
      return to.title;
    }
    return `از ${from.title} تا ${to.title}`;
  }
}
