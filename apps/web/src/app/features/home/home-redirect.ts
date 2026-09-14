import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ContextService } from '../../core/context.service';
import { ALL_QUERY, Paged } from '../../core/pagination';

@Component({
  selector: 'app-home-redirect',
  template: '',
})
export class HomeRedirect {
  private auth = inject(AuthService);
  private ctx = inject(ContextService);
  private http = inject(HttpClient);
  private router = inject(Router);

  constructor() {
    if (this.auth.isStaff() || this.auth.hasRole('BOARD') || !this.auth.hasRole('RESIDENT')) {
      this.router.navigateByUrl(this.auth.homePath(), { replaceUrl: true });
      return;
    }
    const buildingId = this.ctx.buildingId();
    if (!buildingId) {
      this.router.navigateByUrl('/units', { replaceUrl: true });
      return;
    }
    this.http.get<Paged<{ id: string }>>('/api/units', { params: { buildingId, ...ALL_QUERY } }).subscribe({
      next: (res) => {
        if (res.items.length === 1) {
          this.router.navigate(['/units', res.items[0].id, 'ledger'], { replaceUrl: true });
          return;
        }
        this.router.navigateByUrl('/units', { replaceUrl: true });
      },
      error: () => this.router.navigateByUrl('/units', { replaceUrl: true }),
    });
  }
}
