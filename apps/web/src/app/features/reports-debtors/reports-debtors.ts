import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ContextService } from '../../core/context.service';
import { formatMoney } from '../../core/jalali';
import { watchBuildingYear } from '../../core/watch-context';
import { DEFAULT_PAGE_SIZE, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';

type MonthOption = { year: number; month: number; title: string };

@Component({
  selector: 'app-reports-debtors',
  imports: [RouterLink, Pager, Skeleton],
  templateUrl: './reports-debtors.html',
})
export class ReportsDebtors {
  private http = inject(HttpClient);
  ctx = inject(ContextService);
  data = signal<any>(null);
  months = signal<MonthOption[]>([]);
  fromKey = signal('');
  toKey = signal('');
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  loading = signal(true);
  formatMoney = formatMoney;

  constructor() {
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.page.set(1);
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
    this.page.set(1);
    this.load();
  }

  setTo(key: string) {
    this.toKey.set(key);
    this.page.set(1);
    this.load();
  }

  printQuery(): Record<string, string> {
    const from = this.parseKey(this.fromKey());
    const to = this.parseKey(this.toKey());
    if (!from || !to) {
      return {};
    }
    return {
      fromYear: String(from.year),
      fromMonth: String(from.month),
      toYear: String(to.year),
      toMonth: String(to.month),
    };
  }

  rangeLabel(data: any) {
    const from = data?.range?.from;
    const to = data?.range?.to;
    if (!from || !to) {
      return '';
    }
    if (from.year === to.year && from.month === to.month) {
      return from.title;
    }
    return `از ${from.title} تا ${to.title}`;
  }

  monthsLabel(row: { unpaidMonths?: MonthOption[] }) {
    return (row.unpaidMonths || []).map((m) => m.title).join('، ');
  }

  load() {
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!fiscalYearId) {
      this.data.set(null);
      this.loading.set(false);
      return;
    }
    withBusy(
      this.loading,
      this.http.get('/api/reports/debtors', {
        params: { fiscalYearId, ...pageQuery(this.page(), this.pageSize()), ...this.printQuery() },
      }),
    ).subscribe((res: any) => {
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
