import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ContextService } from '../../core/context.service';
import { ToastService } from '../../core/toast.service';
import { formatJalali, formatMoney, isoDate } from '../../core/jalali';
import { watchBuildingYear } from '../../core/watch-context';
import { ALL_QUERY, DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormRail } from '../../shared/form-rail';
import { FormModal } from '../../shared/form-modal';
import { IconAction } from '../../shared/icon-action';
import { MoneyInput } from '../../shared/money-input';
import { JalaliDatepicker } from '../../shared/jalali-datepicker';

@Component({
  selector: 'app-payments',
  imports: [ReactiveFormsModule, Pager, Skeleton, Busy, FormRail, FormModal, IconAction, MoneyInput, JalaliDatepicker],
  templateUrl: './payments.html',
})
export class Payments {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  ctx = inject(ContextService);
  rows = signal<any[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  categories = signal<any[]>([]);
  loading = signal(true);
  saving = signal(false);
  addingCategory = signal(false);
  formOpen = signal(false);
  categoryOpen = signal(false);
  editingId = signal<string | null>(null);
  formatMoney = formatMoney;
  formatJalali = formatJalali;
  form = this.fb.nonNullable.group({
    categoryId: ['', Validators.required],
    date: [new Date() as Date, Validators.required],
    amount: [0, Validators.required],
    payee: [''],
    paymentMethod: ['CASH'],
    description: [''],
    newCategory: [''],
    parentId: [''],
  });

  constructor() {
    watchBuildingYear(this.ctx, () => this.resetAndLoad());
  }

  resetAndLoad() {
    this.page.set(1);
    this.loadLookups();
    this.loadList();
  }

  loadList() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    if (!buildingId || !fiscalYearId) {
      this.rows.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }
    withBusy(
      this.loading,
      this.http.get<Paged>('/api/payments', { params: { buildingId, fiscalYearId, ...pageQuery(this.page(), this.pageSize()) } }),
    ).subscribe((res) => {
      this.rows.set(res.items);
      this.total.set(res.total);
    });
  }

  loadLookups() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId) {
      this.categories.set([]);
      return;
    }
    this.http.get<Paged>('/api/expense-categories', { params: { buildingId, ...ALL_QUERY } }).subscribe((res) => this.categories.set(res.items));
  }

  categoryLabel(c: any) {
    return c.parent ? `${c.parent.name} / ${c.name}` : c.name;
  }

  blankForm() {
    return {
      categoryId: this.categories()[0]?.id || '',
      date: new Date() as Date,
      amount: 0,
      payee: '',
      paymentMethod: 'CASH',
      description: '',
      newCategory: '',
      parentId: '',
    };
  }

  openForm() {
    this.editingId.set(null);
    this.form.reset(this.blankForm());
    this.formOpen.set(true);
  }

  openEdit(row: any) {
    this.editingId.set(row.id);
    this.form.patchValue({
      categoryId: row.categoryId,
      date: new Date(row.date),
      amount: row.amount,
      payee: row.payee || '',
      paymentMethod: row.paymentMethod || 'CASH',
      description: row.description || '',
    });
    this.formOpen.set(true);
  }

  addCategory() {
    const buildingId = this.ctx.buildingId();
    const name = this.form.controls.newCategory.value;
    if (!buildingId || !name || this.addingCategory()) {
      return;
    }
    withBusy(
      this.addingCategory,
      this.http.post('/api/expense-categories', {
        buildingId,
        name,
        parentId: this.form.controls.parentId.value || undefined,
      }),
    ).subscribe({
        next: (created: any) => {
          this.form.patchValue({ newCategory: '', parentId: '', categoryId: created?.id || this.form.controls.categoryId.value });
          this.categoryOpen.set(false);
          this.loadLookups();
          this.toast.show('سرفصل افزوده شد');
        },
        error: (err) => this.toast.show(err.error?.message || 'خطا'),
      });
  }

  save() {
    const buildingId = this.ctx.buildingId();
    const fiscalYearId = this.ctx.fiscalYearId();
    const value = this.form.getRawValue();
    const id = this.editingId();
    if (!buildingId || !fiscalYearId || !value.date || this.saving()) {
      return;
    }
    if (!value.amount) {
      this.toast.show('مبلغ را وارد کنید');
      return;
    }
    const payload = {
      categoryId: value.categoryId,
      date: isoDate(value.date),
      amount: value.amount,
      payee: value.payee,
      paymentMethod: value.paymentMethod,
      description: value.description,
    };
    const request = id
      ? this.http.patch(`/api/payments/${id}`, payload)
      : this.http.post('/api/payments', { buildingId, fiscalYearId, ...payload });
    withBusy(this.saving, request).subscribe({
      next: () => {
        if (id) {
          this.formOpen.set(false);
          this.editingId.set(null);
          this.loadList();
          this.toast.show('پرداخت ویرایش شد');
        } else {
          this.form.patchValue({ amount: 0, payee: '', description: '', date: new Date() });
          this.loadList();
          this.toast.show('پرداخت ثبت شد');
        }
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }
}
