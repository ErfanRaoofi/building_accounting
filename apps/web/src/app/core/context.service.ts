import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, map, finalize } from 'rxjs';
import { ALL_QUERY, Paged } from './pagination';

export type BuildingRole = 'MANAGER' | 'ACCOUNTANT' | 'BOARD' | 'RESIDENT';

export type Building = {
  id: string;
  name: string;
  address?: string;
  managerName?: string;
  phone?: string;
  logoUrl?: string | null;
  updatedAt?: string;
  isActive: boolean;
  roles?: BuildingRole[];
};
export type FiscalYear = {
  id: string;
  buildingId: string;
  title: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED';
};

const BUILDING_KEY = 'mehr.buildingId';

@Injectable({ providedIn: 'root' })
export class ContextService {
  private http = inject(HttpClient);
  private loaded = false;
  private fyLoadedFor: string | null = null;
  buildings = signal<Building[]>([]);
  fiscalYears = signal<FiscalYear[]>([]);
  buildingsLoading = signal(false);
  fiscalYearsLoading = signal(false);
  buildingId = signal<string | null>(localStorage.getItem(BUILDING_KEY));
  fiscalYearId = signal<string | null>(null);
  building = computed(() => this.buildings().find((b) => b.id === this.buildingId()) || null);
  fiscalYear = computed(() => this.fiscalYears().find((f) => f.id === this.fiscalYearId()) || null);

  ensureBuildings(): Observable<Building[]> {
    if (this.loaded) {
      return of(this.buildings());
    }
    this.buildingsLoading.set(true);
    return this.http.get<Paged<Building>>('/api/buildings', { params: ALL_QUERY }).pipe(
      tap((res) => this.setBuildings(res.items)),
      finalize(() => this.buildingsLoading.set(false)),
      map((res) => res.items),
    );
  }

  loadBuildings() {
    this.ensureBuildings().subscribe();
  }

  setBuildings(rows: Building[]) {
    this.buildings.set(rows);
    this.loaded = true;
    const current = this.buildingId();
    if (current && !rows.some((b) => b.id === current)) {
      this.clearBuilding();
    }
  }

  selectBuilding(id: string) {
    const changed = this.buildingId() !== id;
    this.buildingId.set(id);
    localStorage.setItem(BUILDING_KEY, id);
    this.fiscalYearId.set(null);
    localStorage.removeItem(this.fyKey(id));
    if (changed) {
      this.fiscalYears.set([]);
      this.fyLoadedFor = null;
    }
  }

  clearBuilding() {
    const buildingId = this.buildingId();
    if (buildingId) {
      localStorage.removeItem(this.fyKey(buildingId));
    }
    this.buildingId.set(null);
    this.fiscalYearId.set(null);
    this.fiscalYears.set([]);
    this.fyLoadedFor = null;
    localStorage.removeItem(BUILDING_KEY);
  }

  selectFiscalYear(id: string) {
    const buildingId = this.buildingId();
    this.fiscalYearId.set(id);
    if (buildingId) {
      localStorage.setItem(this.fyKey(buildingId), id);
    }
  }

  ensureFiscalYears(restoreStored = true): Observable<FiscalYear[]> {
    const buildingId = this.buildingId();
    if (!buildingId) {
      this.fiscalYears.set([]);
      this.fiscalYearsLoading.set(false);
      return of([]);
    }
    if (this.fyLoadedFor === buildingId) {
      return of(this.fiscalYears());
    }
    this.fiscalYearsLoading.set(true);
    return this.http.get<Paged<FiscalYear>>('/api/fiscal-years', { params: { buildingId, ...ALL_QUERY } }).pipe(
      tap((res) => {
        const rows = res.items;
        this.fiscalYears.set(rows);
        this.fyLoadedFor = buildingId;
        if (!restoreStored || this.fiscalYearId()) {
          return;
        }
        const stored = this.readFiscalYear(buildingId);
        if (stored && rows.some((row) => row.id === stored)) {
          this.fiscalYearId.set(stored);
        }
      }),
      finalize(() => this.fiscalYearsLoading.set(false)),
      map((res) => res.items),
    );
  }

  loadFiscalYears() {
    this.fyLoadedFor = null;
    this.ensureFiscalYears(false).subscribe();
  }

  replaceBuilding(building: Building) {
    this.buildings.update((rows) => {
      const exists = rows.some((b) => b.id === building.id);
      return exists ? rows.map((b) => (b.id === building.id ? { ...b, ...building, roles: building.roles ?? b.roles } : b)) : [...rows, building];
    });
  }

  invalidate() {
    this.loaded = false;
    this.fyLoadedFor = null;
    this.buildings.set([]);
    this.fiscalYears.set([]);
  }

  reset() {
    this.invalidate();
    this.clearBuilding();
  }

  private fyKey(buildingId: string) {
    return `mehr.fiscalYear.${buildingId}`;
  }

  private readFiscalYear(buildingId: string) {
    return localStorage.getItem(this.fyKey(buildingId));
  }
}
