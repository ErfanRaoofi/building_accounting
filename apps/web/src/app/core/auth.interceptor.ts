import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const PUBLIC_AUTH_URL = /\/api\/auth\/(login|register|buildings|refresh|logout)(?:\?|$)/;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (
        !(err instanceof HttpErrorResponse) ||
        err.status !== 401 ||
        PUBLIC_AUTH_URL.test(req.url)
      ) {
        return throwError(() => err);
      }

      return auth.refreshSession().pipe(
        switchMap(() => {
          const nextToken = auth.token();
          const retry = nextToken
            ? req.clone({ setHeaders: { Authorization: `Bearer ${nextToken}` } })
            : req;
          return next(retry);
        }),
        catchError((refreshErr) => {
          auth.logout();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
