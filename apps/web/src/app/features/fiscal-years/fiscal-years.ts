import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import { ContextService, FiscalYear } from '../../core/context.service';
import { ToastService } from '../../core/toast.service';
import { formatJalali, isoDate } from '../../core/jalali';
import { watchBuilding } from '../../core/watch-context';
import { DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormRail } from '../../shared/form-rail';
import { IconAction } from '../../shared/icon-action';
import { JalaliDatepicker } from '../../shared/jalali-datepicker';

@Component({
  selector: 'app-fiscal-years',
  imports: [ReactiveFormsModule, Pager, Skeleton, Busy, FormRail, IconAction, JalaliDatepicker],
  templateUrl: './fiscal-years.html',
})
export class FiscalYears {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  ctx = inject(ContextService);
  rows = signal<FiscalYear[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  loading = signal(true);
  saving = signal(false);
  actionId = signal<string | null>(null);
  formOpen = signal(false);
  editingId = signal<string | null>(null);
  formatJalali = formatJalali;
  form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    startDate: [null as Date | null, Validators.required],
    endDate: [null as Date | null, Validators.required],
  });

  constructor() {
    watchBuilding(this.ctx, () => this.resetAndLoad());
  }

  openForm() {
    this.editingId.set(null);
    this.form.reset();
    this.formOpen.set(true);
  }

  openEdit(row: FiscalYear) {
    this.editingId.set(row.id);
    this.form.reset({
      title: row.title,
      startDate: new Date(row.startDate),
      endDate: new Date(row.endDate),
    });
    this.formOpen.set(true);
  }

  resetAndLoad() {
    this.page.set(1);
    this.loadList();
  }

  loadList() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId) {
      this.rows.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }
    withBusy(
      this.loading,
      this.http.get<Paged<FiscalYear>>('/api/fiscal-years', { params: { buildingId, ...pageQuery(this.page(), this.pageSize()) } }),
    ).subscribe((res) => {
      this.rows.set(res.items);
      this.total.set(res.total);
    });
  }

  save() {
    const buildingId = this.ctx.buildingId();
    const value = this.form.getRawValue();
    const id = this.editingId();
    if (!buildingId || !value.startDate || !value.endDate || this.saving()) {
      return;
    }
    withBusy(
      this.saving,
      id
        ? this.http.patch(`/api/fiscal-years/${id}`, {
            title: value.title,
            startDate: isoDate(value.startDate),
            endDate: isoDate(value.endDate),
          })
        : this.http.post('/api/fiscal-years', {
            buildingId,
            title: value.title,
            startDate: isoDate(value.startDate),
            endDate: isoDate(value.endDate),
          }),
    ).subscribe({
        next: () => {
          if (id) {
            this.formOpen.set(false);
            this.editingId.set(null);
            this.ctx.loadFiscalYears();
            this.loadList();
            this.toast.show('سال مالی ویرایش شد');
          } else {
            this.form.reset();
            this.ctx.loadFiscalYears();
            this.resetAndLoad();
            this.toast.show('سال مالی ایجاد شد');
          }
        },
        error: (err) => this.toast.show(err.error?.message || 'خطا'),
      });
  }

  generate(id: string) {
    if (this.actionId()) {
      return;
    }
    this.actionId.set(`generate:${id}`);
    this.http
      .post('/api/charges/generate', { fiscalYearId: id })
      .pipe(finalize(() => this.actionId.set(null)))
      .subscribe({
        next: (res: any) => this.toast.show(`${res.created} فاکتور شارژ صادر شد`),
        error: (err) => this.toast.show(err.error?.message || 'خطا'),
      });
  }

  close(id: string) {
    if (this.actionId()) {
      return;
    }
    this.actionId.set(`close:${id}`);
    this.http
      .post(`/api/fiscal-years/${id}/close`, {})
      .pipe(finalize(() => this.actionId.set(null)))
      .subscribe({
        next: () => {
          this.ctx.loadFiscalYears();
          this.resetAndLoad();
          this.toast.show('سال مالی بسته شد');
        },
        error: (err) => this.toast.show(err.error?.message || 'خطا'),
      });
  }

  busy(kind: string, id: string) {
    return this.actionId() === `${kind}:${id}`;
  }
}
