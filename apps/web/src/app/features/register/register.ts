import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Busy } from '../../shared/busy';
import { GateFrame } from '../../shared/gate-frame';
import { PasswordInput } from '../../shared/password-input';

type PublicBuilding = { id: string; name: string };

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, Busy, GateFrame, PasswordInput],
  templateUrl: './register.html',
  host: { class: 'block h-full' },
})
export class Register {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  error = signal('');
  done = signal(false);
  loading = signal(false);
  buildings = signal<PublicBuilding[]>([]);
  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    buildingId: ['', Validators.required],
    requestedRole: ['RESIDENT' as 'MANAGER' | 'ACCOUNTANT' | 'BOARD' | 'RESIDENT', Validators.required],
  });

  constructor() {
    this.http.get<PublicBuilding[]>('/api/auth/buildings').subscribe({
      next: (rows) => this.buildings.set(rows),
      error: () => this.error.set('فهرست ساختمان‌ها دریافت نشد'),
    });
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.http.post('/api/auth/register', this.form.getRawValue()).subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'ثبت درخواست ناموفق بود');
      },
    });
  }
}
