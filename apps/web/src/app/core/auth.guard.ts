import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { ContextService } from './context.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) {
    return true;
  }
  return router.parseUrl('/login');
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }
  if (!auth.isAdmin()) {
    return router.parseUrl(auth.homePath());
  }
  return true;
};

export const staffGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }
  if (!auth.isStaff()) {
    return router.parseUrl(auth.homePath());
  }
  return true;
};

export const reportsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }
  if (!auth.canSeeReports()) {
    return router.parseUrl(auth.homePath());
  }
  return true;
};

export const unitsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }
  if (!auth.canSeeUnits()) {
    return router.parseUrl(auth.homePath());
  }
  return true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return true;
  }
  return router.parseUrl('/select-building');
};

export const buildingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const ctx = inject(ContextService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }
  return ctx.ensureBuildings().pipe(
    map(() => {
      if (ctx.building()) {
        return true;
      }
      return router.parseUrl('/select-building');
    }),
  );
};

export const fiscalYearGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const ctx = inject(ContextService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }
  return ctx.ensureBuildings().pipe(
    switchMap(() => {
      if (!ctx.building()) {
        return of(router.parseUrl('/select-building'));
      }
      return ctx.ensureFiscalYears().pipe(
        map(() => {
          if (ctx.fiscalYear()) {
            return true;
          }
          return router.parseUrl('/select-fiscal-year');
        }),
      );
    }),
  );
};
