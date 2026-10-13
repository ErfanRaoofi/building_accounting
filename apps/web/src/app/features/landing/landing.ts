import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandMark } from '../../shared/brand-mark';
import { Busy } from '../../shared/busy';
import { LANDING_PLANS, planById } from './plans';

@Component({
  selector: 'app-landing',
  imports: [ReactiveFormsModule, RouterLink, BrandMark, Busy],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
  host: { class: 'block h-full w-full overflow-y-auto' },
})
export class Landing {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  auth = inject(AuthService);

  plans = LANDING_PLANS;
  menuOpen = signal(false);
  loading = signal(false);
  done = signal(false);
  error = signal('');
  selectedPlanId = signal(LANDING_PLANS.find((p) => p.featured)?.id || LANDING_PLANS[0].id);

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    mobile: ['', [Validators.required, Validators.pattern(/^09\d{9}$/)]],
    buildingName: ['', [Validators.required, Validators.minLength(2)]],
    planId: [this.selectedPlanId(), Validators.required],
    note: [''],
  });

  closeMenu() {
    this.menuOpen.set(false);
  }

  scrollTo(id: string) {
    this.closeMenu();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  choosePlan(planId: string) {
    this.selectedPlanId.set(planId);
    this.form.controls.planId.setValue(planId);
    this.scrollTo('inquiry');
  }

  selectedPlanLabel() {
    return planById(this.form.controls.planId.value).label;
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const raw = this.form.getRawValue();
    const plan = planById(raw.planId);
    this.http
      .post('/api/purchase-inquiries', {
        name: raw.name.trim(),
        mobile: raw.mobile.trim(),
        buildingName: raw.buildingName.trim(),
        planId: plan.id,
        planLabel: plan.label,
        note: raw.note.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.done.set(true);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err.error?.message || 'ارسال درخواست ناموفق بود. دوباره تلاش کنید.');
        },
      });
  }
}
