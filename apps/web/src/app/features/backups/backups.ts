import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../core/toast.service';
import { formatJalali } from '../../core/jalali';
import { DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormModal } from '../../shared/form-modal';
import { IconAction } from '../../shared/icon-action';

type BackupRow = {
  id: string;
  filename: string;
  sizeBytes: number;
  kind: 'MANUAL' | 'SCHEDULED' | 'UPLOAD';
  status: 'READY' | 'FAILED';
  createdAt: string;
  createdBy?: { name: string } | null;
};

type BackupSettings = {
  enabled: boolean;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  hour: number;
  keepLast: number;
};

@Component({
  selector: 'app-backups',
  imports: [ReactiveFormsModule, Pager, Skeleton, Busy, FormModal, IconAction],
  templateUrl: './backups.html',
})
export class Backups {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  rows = signal<BackupRow[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  loading = signal(true);
  savingSettings = signal(false);
  creating = signal(false);
  uploading = signal(false);
  restoring = signal(false);
  restoreOpen = signal(false);
  restoreAck = signal(false);
  restoreTarget = signal<BackupRow | null>(null);
  actionId = signal<string | null>(null);
  hours = Array.from({ length: 24 }, (_, hour) => hour);
  formatJalali = formatJalali;
  settingsForm = this.fb.nonNullable.group({
    enabled: [false],
    frequency: ['DAILY' as BackupSettings['frequency'], Validators.required],
    hour: [2, Validators.required],
    keepLast: [14, [Validators.required, Validators.min(1), Validators.max(365)]],
  });

  constructor() {
    this.loadSettings();
    this.loadList();
  }

  loadSettings() {
    this.http.get<BackupSettings>('/api/backups/settings').subscribe((res) => {
      this.settingsForm.reset({
        enabled: res.enabled,
        frequency: res.frequency,
        hour: res.hour,
        keepLast: res.keepLast,
      });
    });
  }

  loadList() {
    withBusy(
      this.loading,
      this.http.get<Paged<BackupRow>>('/api/backups', { params: pageQuery(this.page(), this.pageSize()) }),
    ).subscribe((res) => {
      this.rows.set(res.items);
      this.total.set(res.total);
    });
  }

  saveSettings() {
    if (this.settingsForm.invalid || this.savingSettings()) {
      return;
    }
    withBusy(this.savingSettings, this.http.patch('/api/backups/settings', {
      ...this.settingsForm.getRawValue(),
      hour: Number(this.settingsForm.controls.hour.value),
      keepLast: Number(this.settingsForm.controls.keepLast.value),
    })).subscribe({
      next: () => this.toast.show('زمان‌بندی ذخیره شد'),
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  createNow() {
    if (this.creating()) {
      return;
    }
    withBusy(this.creating, this.http.post('/api/backups', {})).subscribe({
      next: () => {
        this.page.set(1);
        this.loadList();
        this.toast.show('بک‌آپ تهیه شد');
      },
      error: (err) => this.toast.show(err.error?.message || 'تهیه بک‌آپ ناموفق بود'),
    });
  }

  pickFile() {
    this.fileInput()?.nativeElement.click();
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploading()) {
      return;
    }
    const body = new FormData();
    body.append('file', file);
    withBusy(this.uploading, this.http.post('/api/backups/upload', body)).subscribe({
      next: () => {
        this.page.set(1);
        this.loadList();
        this.toast.show('فایل بک‌آپ آپلود شد');
      },
      error: (err) => this.toast.show(err.error?.message || 'آپلود ناموفق بود'),
    });
  }

  download(row: BackupRow) {
    if (row.status !== 'READY' || this.actionId()) {
      return;
    }
    this.actionId.set(`download:${row.id}`);
    this.http.get(`/api/backups/${row.id}/download`, { responseType: 'blob', observe: 'response' }).subscribe({
      next: (res) => {
        const blob = res.body;
        if (!blob) {
          this.toast.show('دانلود ناموفق بود');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = row.filename;
        a.click();
        URL.revokeObjectURL(url);
        this.actionId.set(null);
      },
      error: () => {
        this.actionId.set(null);
        this.toast.show('دانلود ناموفق بود');
      },
    });
  }

  openRestore(row: BackupRow) {
    if (row.status !== 'READY') {
      return;
    }
    this.restoreTarget.set(row);
    this.restoreAck.set(false);
    this.restoreOpen.set(true);
  }

  confirmRestore() {
    const row = this.restoreTarget();
    if (!row || !this.restoreAck() || this.restoring()) {
      return;
    }
    withBusy(this.restoring, this.http.post<{ ok: boolean; users?: number }>(`/api/backups/${row.id}/restore`, { confirm: 'RESTORE' })).subscribe({
      next: (res) => {
        this.restoreOpen.set(false);
        this.toast.show(`بازیابی انجام شد${res.users != null ? ` (${res.users} کاربر)` : ''}. در حال بارگذاری مجدد…`);
        setTimeout(() => {
          localStorage.clear();
          location.href = '/login';
        }, 800);
      },
      error: (err) => this.toast.show(err.error?.message || 'بازیابی ناموفق بود'),
    });
  }

  remove(row: BackupRow) {
    if (this.actionId()) {
      return;
    }
    this.actionId.set(`delete:${row.id}`);
    this.http.delete(`/api/backups/${row.id}`).subscribe({
      next: () => {
        this.actionId.set(null);
        this.loadList();
        this.toast.show('بک‌آپ حذف شد');
      },
      error: (err) => {
        this.actionId.set(null);
        this.toast.show(err.error?.message || 'حذف ناموفق بود');
      },
    });
  }

  kindLabel(kind: BackupRow['kind']) {
    if (kind === 'SCHEDULED') return 'زمان‌بندی';
    if (kind === 'UPLOAD') return 'آپلود';
    return 'دستی';
  }

  statusLabel(status: BackupRow['status']) {
    return status === 'READY' ? 'آماده' : 'ناموفق';
  }

  formatSize(bytes: number) {
    if (!bytes) return '۰ بایت';
    const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const formatted = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: value >= 10 || index === 0 ? 0 : 1 }).format(value);
    return `${formatted} ${units[index]}`;
  }

  hourLabel(hour: number) {
    return `${String(hour).padStart(2, '0')}:00`.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  }

  busy(kind: string, id: string) {
    return this.actionId() === `${kind}:${id}`;
  }
}
