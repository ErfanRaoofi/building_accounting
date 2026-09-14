import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ContextService } from '../../core/context.service';
import { ToastService } from '../../core/toast.service';
import { formatMoney } from '../../core/jalali';
import { watchBuilding } from '../../core/watch-context';
import { DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormRail } from '../../shared/form-rail';
import { IconAction } from '../../shared/icon-action';
import { MoneyInput } from '../../shared/money-input';

@Component({
  selector: 'app-tariffs',
  imports: [ReactiveFormsModule, Pager, Skeleton, Busy, FormRail, IconAction, MoneyInput],
  templateUrl: './tariffs.html',
})
export class Tariffs {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  ctx = inject(ContextService);
  rows = signal<any[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  loading = signal(true);
  saving = signal(false);
  formOpen = signal(false);
  editingId = signal<string | null>(null);
  formatMoney = formatMoney;
  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    monthlyAmount: [0, Validators.required],
    isActive: [true],
  });

  constructor() {
    watchBuilding(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.page.set(1);
    this.loadList();
  }

  blankForm() {
    return { name: '', monthlyAmount: 0, isActive: true };
  }

  openForm() {
    this.editingId.set(null);
    this.form.reset(this.blankForm());
    this.formOpen.set(true);
  }

  openEdit(row: any) {
    this.editingId.set(row.id);
    this.form.reset({
      name: row.name || '',
      monthlyAmount: row.monthlyAmount || 0,
      isActive: row.isActive !== false,
    });
    this.formOpen.set(true);
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
      this.http.get<Paged>('/api/tariffs', { params: { buildingId, ...pageQuery(this.page(), this.pageSize()) } }),
    ).subscribe((res) => {
      this.rows.set(res.items);
      this.total.set(res.total);
    });
  }

  save() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId || this.form.invalid || this.saving()) {
      return;
    }
    const value = this.form.getRawValue();
    const id = this.editingId();
    const request = id
      ? this.http.patch(`/api/tariffs/${id}`, value)
      : this.http.post('/api/tariffs', { buildingId, name: value.name, monthlyAmount: value.monthlyAmount });
    withBusy(this.saving, request).subscribe({
      next: () => {
        if (id) {
          this.formOpen.set(false);
          this.editingId.set(null);
          this.loadList();
          this.toast.show('تعرفه ویرایش شد');
        } else {
          this.form.reset(this.blankForm());
          this.resetAndLoad();
          this.toast.show('تعرفه ذخیره شد');
        }
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }
}
