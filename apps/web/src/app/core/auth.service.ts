import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, finalize, shareReplay, tap, throwError } from 'rxjs';
import { Building, BuildingRole, ContextService } from './context.service';

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  isSuperAdmin: boolean;
};

type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  buildings: Building[];
};

const TOKEN_KEY = 'mehr.token';
const REFRESH_KEY = 'mehr.refresh';
const USER_KEY = 'mehr.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private ctx = inject(ContextService);
  private refreshInFlight: Observable<AuthSession> | null = null;
  token = signal(localStorage.getItem(TOKEN_KEY));
  refreshToken = signal(localStorage.getItem(REFRESH_KEY));
  user = signal<AuthUser | null>(readUser());
  isLoggedIn = computed(() => !!this.token() || !!this.refreshToken());
  buildingRoles = computed(() => this.ctx.building()?.roles || []);
  isAdmin = computed(() => !!this.user()?.isSuperAdmin);
  isStaff = computed(() => this.isAdmin() || this.hasRole('MANAGER', 'ACCOUNTANT'));
  canManageMembers = computed(() => this.isAdmin() || this.hasRole('MANAGER'));
  canSeeReports = computed(() => this.isStaff() || this.hasRole('BOARD'));
  canSeeUnits = computed(() => this.isStaff() || this.hasRole('RESIDENT'));
  canSeeAccounting = computed(() => this.isStaff());
  canSeeSettings = computed(() => this.isStaff());

  login(username: string, password: string) {
    return this.http.post<AuthSession>('/api/auth/login', { username, password }).pipe(
      tap((res) => {
        this.persistSession(res);
        this.ctx.invalidate();
        this.ctx.clearBuilding();
        this.ctx.setBuildings(res.buildings || []);
      }),
    );
  }

  refreshSession() {
    const refreshToken = this.refreshToken() || localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) {
      return throwError(() => new Error('no-refresh-token'));
    }
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.http
        .post<AuthSession>('/api/auth/refresh', { refreshToken })
        .pipe(
          tap((res) => this.persistSession(res)),
          finalize(() => {
            this.refreshInFlight = null;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.refreshInFlight;
  }

  logout() {
    const refreshToken = this.refreshToken() || localStorage.getItem(REFRESH_KEY);
    this.clearSession();
    this.ctx.reset();
    if (refreshToken) {
      this.http.post('/api/auth/logout', { refreshToken }).subscribe({ error: () => undefined });
    }
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

  private persistSession(res: AuthSession) {
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.token.set(res.accessToken);
    this.refreshToken.set(res.refreshToken);
    this.user.set(res.user);
  }

  private clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.refreshToken.set(null);
    this.user.set(null);
  }
}

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AuthUser & { role?: string; email?: string };
    const username = parsed.username || parsed.email || '';
    if (typeof parsed.isSuperAdmin === 'boolean') {
      return { id: parsed.id, username, name: parsed.name, isSuperAdmin: parsed.isSuperAdmin };
    }
    return {
      id: parsed.id,
      username,
      name: parsed.name,
      isSuperAdmin: parsed.role === 'ADMIN',
    };
  } catch {
    return null;
  }
}
