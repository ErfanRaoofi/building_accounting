import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ContextService } from '../core/context.service';

import { BuildingLogo } from '../shared/building-logo';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BuildingLogo],
  templateUrl: './shell.html',
  host: {
    class: 'block h-dvh overflow-hidden',
  },
})
export class Shell {
  private router = inject(Router);
  auth = inject(AuthService);
  ctx = inject(ContextService);
  menuOpen = signal(false);
  initial = computed(() => this.auth.user()?.name?.trim().charAt(0) || 'م');
  links = computed(() => {
    const items: { path: string; label: string; icon: string }[] = [];
    if (this.auth.isAdmin()) {
      items.push(
        { path: '/buildings', label: 'ساختمان‌ها', icon: 'M4 21V8l8-5 8 5v13M9 21v-7h6v7M4 21h16' },
        { path: '/backups', label: 'بک‌آپ', icon: 'M4 7h16v4H4zM4 15h16v4H4zM8 7V5h8v2M8 15v-2h8v2' },
      );
    }
    if (this.auth.canSeeUnits()) {
      items.push({ path: '/units', label: this.auth.isStaff() ? 'واحدها' : 'واحد من', icon: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z' });
    }
    if (this.auth.canSeeAccounting()) {
      items.push(
        { path: '/receipts', label: 'دریافت‌ها', icon: 'M7 4h10a2 2 0 0 1 2 2v14l-3-1.5L13 20l-3-1.5L7 20V6a2 2 0 0 1 2-2z' },
        { path: '/payments', label: 'پرداخت‌ها', icon: 'M4 8h16v10H4zM4 11h16M8 15h5' },
      );
    }
    if (this.auth.canSeeReports()) {
      items.push(
        { path: '/reports/charges', label: 'گزارش شارژ', icon: 'M5 19V8M10 19V5M15 19v-7M20 19H4' },
        { path: '/reports/debtors', label: 'گزارش بدهکاران', icon: 'M4 7h16v12H4zM8 7V5h8v2M8 12h8M8 16h6' },
        { path: '/reports/payments', label: 'گزارش پرداخت', icon: 'M7 4h10v16H7zM10 8h4M10 12h4M10 16h3' },
      );
    }
    if (this.auth.canSeeSettings()) {
      items.push({ path: '/settings', label: 'تنظیمات', icon: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 3v2M12 19v2M4.2 6.2l1.4 1.4M18.4 16.4l1.4 1.4M3 12h2M19 12h2M4.2 17.8l1.4-1.4M18.4 7.6l1.4-1.4' });
    }
    return items;
  });

  constructor() {
    this.ctx.loadBuildings();
  }

  closeMenu() {
    this.menuOpen.set(false);
  }

  changeBuilding() {
    this.closeMenu();
    this.router.navigateByUrl('/select-building');
  }

  changeFiscalYear() {
    this.closeMenu();
    this.router.navigateByUrl('/select-fiscal-year');
  }
}
