import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ContextService, FiscalYear } from '../../core/context.service';
import { formatJalali } from '../../core/jalali';
import { withBusy } from '../../core/with-busy';
import { GateFrame } from '../../shared/gate-frame';
import { Skeleton } from '../../shared/skeleton';
import { BuildingLogo } from '../../shared/building-logo';

@Component({
  selector: 'app-select-fiscal-year',
  imports: [GateFrame, Skeleton, BuildingLogo],
  templateUrl: './select-fiscal-year.html',
  host: { class: 'block h-full' },
})
export class SelectFiscalYear {
  private router = inject(Router);
  auth = inject(AuthService);
  ctx = inject(ContextService);
  formatJalali = formatJalali;
  loading = signal(true);
  years = computed(() => {
    const rows = [...this.ctx.fiscalYears()];
    return rows.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'OPEN' ? -1 : 1;
      }
      return b.title.localeCompare(a.title, 'fa');
    });
  });
  solo = computed(() => this.years().length === 1);
  subtitle = computed(() => {
    const name = this.ctx.building()?.name;
    return name
      ? `برای ${name} سال مالی را مشخص کنید. اسناد روی همین دوره ثبت می‌شوند.`
      : 'سال مالی را مشخص کنید. اسناد روی همین دوره ثبت می‌شوند.';
  });

  constructor() {
    this.ctx.ensureBuildings().subscribe({
      next: () => {
        if (!this.ctx.building()) {
          this.router.navigateByUrl('/select-building');
          return;
        }
        withBusy(this.loading, this.ctx.ensureFiscalYears(false)).subscribe({
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  enter(year: FiscalYear) {
    this.ctx.selectFiscalYear(year.id);
    this.router.navigateByUrl('/units');
  }

  back() {
    this.router.navigateByUrl('/select-building');
  }
}
