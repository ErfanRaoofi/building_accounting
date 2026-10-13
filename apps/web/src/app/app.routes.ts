import { Route } from '@angular/router';
import {
  authGuard,
  adminGuard,
  staffGuard,
  reportsGuard,
  unitsGuard,
  buildingGuard,
  fiscalYearGuard,
  guestGuard,
} from './core/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/register/register').then((m) => m.Register),
  },
  {
    path: 'select-building',
    canActivate: [authGuard],
    loadComponent: () => import('./features/select-building/select-building').then((m) => m.SelectBuilding),
  },
  {
    path: 'select-fiscal-year',
    canActivate: [authGuard, buildingGuard],
    loadComponent: () => import('./features/select-fiscal-year/select-fiscal-year').then((m) => m.SelectFiscalYear),
  },
  {
    path: 'print/unit-charges',
    canActivate: [authGuard, fiscalYearGuard, reportsGuard],
    loadComponent: () => import('./features/print/print-charges').then((m) => m.PrintCharges),
  },
  {
    path: 'print/payments',
    canActivate: [authGuard, fiscalYearGuard, reportsGuard],
    loadComponent: () => import('./features/print/print-payments').then((m) => m.PrintPayments),
  },
  {
    path: 'print/debtors',
    canActivate: [authGuard, fiscalYearGuard, reportsGuard],
    loadComponent: () => import('./features/print/print-debtors').then((m) => m.PrintDebtors),
  },
  {
    path: 'print/balance',
    canActivate: [authGuard, fiscalYearGuard, reportsGuard],
    loadComponent: () => import('./features/print/print-balance').then((m) => m.PrintBalance),
  },
  {
    path: '',
    canActivate: [authGuard, fiscalYearGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/home/home-redirect').then((m) => m.HomeRedirect) },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'buildings',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/buildings/buildings').then((m) => m.Buildings),
      },
      {
        path: 'backups',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/backups/backups').then((m) => m.Backups),
      },
      {
        path: 'settings',
        canActivate: [staffGuard],
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
      },
      { path: 'fiscal-years', redirectTo: 'settings' },
      { path: 'tariffs', redirectTo: 'settings' },
      {
        path: 'units',
        canActivate: [unitsGuard],
        loadComponent: () => import('./features/units/units').then((m) => m.Units),
      },
      {
        path: 'units/:id/ledger',
        canActivate: [unitsGuard],
        loadComponent: () => import('./features/unit-ledger/unit-ledger').then((m) => m.UnitLedger),
      },
      {
        path: 'receipts',
        canActivate: [staffGuard],
        loadComponent: () => import('./features/receipts/receipts').then((m) => m.Receipts),
      },
      {
        path: 'receipt-payments',
        canActivate: [staffGuard],
        loadComponent: () => import('./features/receipt-payments/receipt-payments').then((m) => m.ReceiptPayments),
      },
      {
        path: 'payments',
        canActivate: [staffGuard],
        loadComponent: () => import('./features/payments/payments').then((m) => m.Payments),
      },
      {
        path: 'reports/charges',
        canActivate: [reportsGuard],
        loadComponent: () => import('./features/reports-charges/reports-charges').then((m) => m.ReportsCharges),
      },
      {
        path: 'reports/debtors',
        canActivate: [reportsGuard],
        loadComponent: () => import('./features/reports-debtors/reports-debtors').then((m) => m.ReportsDebtors),
      },
      {
        path: 'reports/payments',
        canActivate: [reportsGuard],
        loadComponent: () => import('./features/reports-payments/reports-payments').then((m) => m.ReportsPayments),
      },
      {
        path: 'reports/balance',
        canActivate: [reportsGuard],
        loadComponent: () => import('./features/reports-balance/reports-balance').then((m) => m.ReportsBalance),
      },
    ],
  },
];
