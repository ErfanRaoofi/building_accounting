import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Busy } from '../../shared/busy';
import { GateFrame } from '../../shared/gate-frame';
import { PasswordInput } from '../../shared/password-input';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, Busy, GateFrame, PasswordInput],
  templateUrl: './login.html',
  host: { class: 'block h-full' },
})
export class Login {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  error = signal('');
  loading = signal(false);
  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => this.router.navigateByUrl('/select-building'),
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'ورود ناموفق بود. ایمیل یا رمز را بررسی کنید.');
      },
    });
  }
}
