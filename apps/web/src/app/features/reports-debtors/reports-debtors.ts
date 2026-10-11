import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ContextService } from '../../core/context.service';
import { formatMoney, toJalali } from '../../core/jalali';
import { watchBuildingYear } from '../../core/watch-context';
import { ALL_QUERY } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Skeleton } from '../../shared/skeleton';

type MonthOption = { year: number; month: number; title: string };

@Component({
  selector: 'app-reports-debtors',
  imports: [RouterLink, Skeleton],
  templateUrl: './reports-debtors.html',
})
export class ReportsDebtors {
  private http = inject(HttpClient);
  ctx = inject(ContextService);
  data = signal<any>(null);
  months = signal<MonthOption[]>([]);
  fromKey = signal('');
  toKey = signal('');
  loading = signal(true);
  private loadSeq = 0;
  formatMoney = formatMoney;

  constructor() {
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.fromKey.set('');
    this.toKey.set('');
    this.months.set([]);
    this.load();
  }

  monthKey(month: MonthOption) {
    return `${month.year}-${month.month}`;
  }

  setFrom(key: string) {
    this.fromKey.set(key);
    this.load();
  }

  setTo(key: string) {
    this.toKey.set(key);
    this.load();
  }

  printQuery(): Record<string, string> {
    const from = this.parseKey(this.fromKey());
    const today = toJalali(new Date());
    const to = this.parseKey(this.toKey()) ?? { year: today.jy, month: today.jm };
    return {
      toYear: String(to.year),
      toMonth: String(to.month),
      ...(from ? { fromYear: String(from.year), fromMonth: String(from.month) } : {}),
    };
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

  monthsLabel(row: { unpaidMonths?: Array<MonthOption & { remaining?: number; status?: string }> }) {
    return (row.unpaidMonths || [])
      .map((month) => {
        const amount = month.remaining == null ? '' : ` ${formatMoney(month.remaining)}`;
        const partial = month.status === 'PARTIAL' ? ' ناقص' : '';
        return `${month.title}${partial}${amount}`;
      })
      .join('، ');
  }

  load() {
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!fiscalYearId) {
      this.data.set(null);
      this.loading.set(false);
      return;
    }
    const seq = ++this.loadSeq;
    withBusy(
      this.loading,
      this.http.get('/api/reports/debtors', {
        params: { fiscalYearId, ...ALL_QUERY, ...this.printQuery() },
      }),
    ).subscribe((res: any) => {
      if (seq !== this.loadSeq) {
        return;
      }
      this.data.set(res);
      this.months.set(res.months || []);
      if (res.range?.from) {
        this.fromKey.set(this.monthKey(res.range.from));
      }
      if (res.range?.to) {
        this.toKey.set(this.monthKey(res.range.to));
      }
    });
  }

  private parseKey(key: string) {
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) {
      return null;
    }
    return { year, month };
  }
}
