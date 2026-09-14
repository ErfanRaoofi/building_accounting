import { Component, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Building, ContextService } from '../../core/context.service';
import { ToastService } from '../../core/toast.service';
import { DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormRail } from '../../shared/form-rail';
import { IconAction } from '../../shared/icon-action';
import { LogoCropper } from '../../shared/logo-cropper';
import { BuildingLogo } from '../../shared/building-logo';

@Component({
  selector: 'app-buildings',
  imports: [ReactiveFormsModule, Pager, Skeleton, Busy, FormRail, IconAction, LogoCropper, BuildingLogo],
  templateUrl: './buildings.html',
})
export class Buildings {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private router = inject(Router);
  ctx = inject(ContextService);
  rows = signal<Building[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  loading = signal(true);
  saving = signal(false);
  formOpen = signal(false);
  editingId = signal<string | null>(null);
  cropper = viewChild(LogoCropper);
  pendingLogo = signal<Blob | null>(null);
  pendingPreview = signal('');
  editingLogoUrl = signal<string | null>(null);
  editingUpdatedAt = signal<string | null>(null);
  savingLogo = signal(false);
  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    address: [''],
    managerName: [''],
    phone: [''],
  });

  constructor() {
    this.loadList();
  }

  resetAndLoad() {
    this.page.set(1);
    this.loadList();
  }

  loadList() {
    withBusy(this.loading, this.http.get<Paged<Building>>('/api/buildings', { params: pageQuery(this.page(), this.pageSize()) })).subscribe(
      (res) => {
        this.rows.set(res.items);
        this.total.set(res.total);
      },
    );
  }

  blankForm() {
    return { name: '', address: '', managerName: '', phone: '' };
  }

  openForm() {
    this.clearPending();
    this.editingId.set(null);
    this.editingLogoUrl.set(null);
    this.editingUpdatedAt.set(null);
    this.form.reset(this.blankForm());
    this.formOpen.set(true);
  }

  openEdit(row: Building) {
    this.clearPending();
    this.editingId.set(row.id);
    this.editingLogoUrl.set(row.logoUrl || null);
    this.editingUpdatedAt.set(row.updatedAt || null);
    this.form.reset({
      name: row.name || '',
      address: row.address || '',
      managerName: row.managerName || '',
      phone: row.phone || '',
    });
    this.formOpen.set(true);
  }

  onCropped(blob: Blob) {
    const id = this.editingId();
    if (id) {
      this.uploadLogo(id, blob, false);
      return;
    }
    this.clearPending();
    this.pendingLogo.set(blob);
    this.pendingPreview.set(URL.createObjectURL(blob));
  }

  uploadLogo(id: string, blob: Blob, thenEnter: boolean) {
    const data = new FormData();
    data.append('file', blob, 'logo.png');
    withBusy(this.savingLogo, this.http.post<Building>(`/api/buildings/${id}/logo`, data)).subscribe({
      next: (building) => {
        this.ctx.replaceBuilding(building);
        this.editingLogoUrl.set(building.logoUrl || null);
        this.editingUpdatedAt.set(building.updatedAt || null);
        this.loadList();
        this.toast.show('لوگو ذخیره شد');
        if (thenEnter) {
          this.ctx.selectBuilding(building.id);
          this.router.navigateByUrl('/select-fiscal-year');
        }
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  clearLogo() {
    if (this.pendingPreview()) {
      this.clearPending();
      return;
    }
    const id = this.editingId();
    if (!id || this.savingLogo()) {
      return;
    }
    withBusy(this.savingLogo, this.http.delete<Building>(`/api/buildings/${id}/logo`)).subscribe({
      next: (building) => {
        this.ctx.replaceBuilding(building);
        this.editingLogoUrl.set(null);
        this.editingUpdatedAt.set(building.updatedAt || null);
        this.loadList();
        this.toast.show('لوگو حذف شد');
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  save() {
    if (this.form.invalid || this.saving()) {
      return;
    }
    const id = this.editingId();
    const value = this.form.getRawValue();
    const pending = this.pendingLogo();
    const request = id
      ? this.http.patch<Building>(`/api/buildings/${id}`, value)
      : this.http.post<Building>('/api/buildings', value);
    withBusy(this.saving, request).subscribe({
      next: (building) => {
        if (id) {
          this.formOpen.set(false);
          this.editingId.set(null);
          this.ctx.replaceBuilding(building);
          this.loadList();
          this.toast.show('ساختمان ویرایش شد');
          return;
        }
        this.form.reset(this.blankForm());
        this.ctx.replaceBuilding(building);
        this.ctx.selectBuilding(building.id);
        if (pending) {
          this.uploadLogo(building.id, pending, true);
          this.clearPending();
          return;
        }
        this.router.navigateByUrl('/select-fiscal-year');
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  open(row: Building) {
    this.ctx.selectBuilding(row.id);
    this.router.navigateByUrl('/select-fiscal-year');
  }

  private clearPending() {
    const url = this.pendingPreview();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.pendingLogo.set(null);
    this.pendingPreview.set('');
  }
}
