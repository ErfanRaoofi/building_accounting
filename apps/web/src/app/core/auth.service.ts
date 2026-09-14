import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { Building, BuildingRole, ContextService } from './context.service';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
};

const TOKEN_KEY = 'mehr.token';
const USER_KEY = 'mehr.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private ctx = inject(ContextService);
  token = signal(localStorage.getItem(TOKEN_KEY));
  user = signal<AuthUser | null>(readUser());
  isLoggedIn = computed(() => !!this.token());
  buildingRoles = computed(() => this.ctx.building()?.roles || []);
  isAdmin = computed(() => !!this.user()?.isSuperAdmin);
  isStaff = computed(() => this.isAdmin() || this.hasRole('MANAGER', 'ACCOUNTANT'));
  canManageMembers = computed(() => this.isAdmin() || this.hasRole('MANAGER'));
  canSeeReports = computed(() => this.isStaff() || this.hasRole('BOARD'));
  canSeeUnits = computed(() => this.isStaff() || this.hasRole('RESIDENT'));
  canSeeAccounting = computed(() => this.isStaff());
  canSeeSettings = computed(() => this.isStaff());

  login(email: string, password: string) {
    return this.http
      .post<{ accessToken: string; user: AuthUser; buildings: Building[] }>('/api/auth/login', { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.accessToken);
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          this.token.set(res.accessToken);
          this.user.set(res.user);
          this.ctx.invalidate();
          this.ctx.clearBuilding();
          this.ctx.setBuildings(res.buildings || []);
        }),
      );
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
    this.ctx.reset();
    this.router.navigateByUrl('/login');
  }

  hasRole(...roles: BuildingRole[]) {
    const current = this.buildingRoles();
    return roles.some((role) => current.includes(role));
  }

  homePath() {
    if (this.isStaff()) {
      return '/units';
    }
    if (this.hasRole('BOARD')) {
      return '/reports/charges';
    }
    if (this.hasRole('RESIDENT')) {
      return '/units';
    }
    return '/units';
  }
}

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AuthUser & { role?: string };
    if (typeof parsed.isSuperAdmin === 'boolean') {
      return { id: parsed.id, email: parsed.email, name: parsed.name, isSuperAdmin: parsed.isSuperAdmin };
    }
    return {
      id: parsed.id,
      email: parsed.email,
      name: parsed.name,
      isSuperAdmin: parsed.role === 'ADMIN',
    };
  } catch {
    return null;
  }
}
