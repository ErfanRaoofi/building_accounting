import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Building, ContextService } from '../../core/context.service';
import { withBusy } from '../../core/with-busy';
import { GateFrame } from '../../shared/gate-frame';
import { Skeleton } from '../../shared/skeleton';
import { BuildingLogo } from '../../shared/building-logo';

@Component({
  selector: 'app-select-building',
  imports: [GateFrame, Skeleton, BuildingLogo],
  templateUrl: './select-building.html',
  host: { class: 'block h-full' },
})
export class SelectBuilding {
  private router = inject(Router);
  auth = inject(AuthService);
  ctx = inject(ContextService);
  loading = signal(true);
  greeting = computed(() => {
    const name = this.auth.user()?.name?.trim();
    return name ? `${name}، ساختمان مورد نظر را انتخاب کنید.` : 'ساختمان مورد نظر را انتخاب کنید.';
  });
  solo = computed(() => this.ctx.buildings().length === 1);

  constructor() {
    withBusy(this.loading, this.ctx.ensureBuildings()).subscribe({
      error: () => this.loading.set(false),
    });
  }

  enter(building: Building) {
    this.ctx.selectBuilding(building.id);
    this.router.navigateByUrl('/select-fiscal-year');
  }
}
