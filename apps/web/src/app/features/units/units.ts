import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ContextService } from '../../core/context.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { formatMoney } from '../../core/jalali';
import { watchBuilding } from '../../core/watch-context';
import { ALL_QUERY, DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormRail } from '../../shared/form-rail';
import { IconAction } from '../../shared/icon-action';
import { MoneyInput } from '../../shared/money-input';

@Component({
  selector: 'app-units',
  imports: [ReactiveFormsModule, RouterLink, Pager, Skeleton, Busy, FormRail, IconAction, MoneyInput],
  templateUrl: './units.html',
})
export class Units {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  ctx = inject(ContextService);
  auth = inject(AuthService);
  rows = signal<any[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  tariffs = signal<any[]>([]);
  loading = signal(true);
  saving = signal(false);
  formOpen = signal(false);
  editingId = signal<string | null>(null);
  formatMoney = formatMoney;
  form = this.fb.nonNullable.group({
    number: ['', Validators.required],
    floor: [null as number | null],
    bedrooms: [null as number | null],
    occupancy: ['OCCUPIED'],
    ownerName: [''],
    residentName: [''],
    phone: [''],
    tariffId: [''],
    customMonthlyCharge: [null as number | null],
  });

  constructor() {
    watchBuilding(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.page.set(1);
    this.load();
    this.loadTariffs();
  }

  load() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId) {
      this.rows.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }
    withBusy(
      this.loading,
      this.http.get<Paged>('/api/units', { params: { buildingId, ...pageQuery(this.page(), this.pageSize()) } }),
    ).subscribe((res) => {
      this.rows.set(res.items);
      this.total.set(res.total);
    });
  }

  loadTariffs() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId) {
      this.tariffs.set([]);
      return;
    }
    this.http.get<Paged>('/api/tariffs', { params: { buildingId, ...ALL_QUERY } }).subscribe((res) => this.tariffs.set(res.items));
  }

  blankForm() {
    return {
      occupancy: 'OCCUPIED',
      number: '',
      floor: null as number | null,
      bedrooms: null as number | null,
      ownerName: '',
      residentName: '',
      phone: '',
      tariffId: '',
      customMonthlyCharge: null as number | null,
    };
  }

  openForm() {
    this.editingId.set(null);
    this.form.reset(this.blankForm());
    this.formOpen.set(true);
  }

  openEdit(row: any) {
    this.editingId.set(row.id);
    this.form.reset({
      number: row.number || '',
      floor: row.floor ?? null,
      bedrooms: row.bedrooms ?? null,
      occupancy: row.occupancy || 'OCCUPIED',
      ownerName: row.ownerName || '',
      residentName: row.residentName || '',
      phone: row.phone || '',
      tariffId: row.tariffId || '',
      customMonthlyCharge: row.customMonthlyCharge ?? null,
    });
    this.formOpen.set(true);
  }

  save() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId || this.form.invalid || this.saving()) {
      return;
    }
    const value = this.form.getRawValue();
    const id = this.editingId();
    const payload = {
      ...value,
      tariffId: value.tariffId || null,
      customMonthlyCharge: value.customMonthlyCharge,
    };
    const request = id
      ? this.http.patch(`/api/units/${id}`, payload)
      : this.http.post('/api/units', {
          buildingId,
          ...payload,
          tariffId: value.tariffId || undefined,
          customMonthlyCharge: value.customMonthlyCharge || undefined,
        });
    withBusy(this.saving, request).subscribe({
      next: () => {
        if (id) {
          this.formOpen.set(false);
          this.editingId.set(null);
          this.load();
          this.toast.show('واحد ویرایش شد');
        } else {
          this.form.reset(this.blankForm());
          this.resetAndLoad();
          this.toast.show('واحد ذخیره شد');
        }
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }
}
