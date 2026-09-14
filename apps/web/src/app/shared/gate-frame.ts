import { Component, inject, input } from '@angular/core';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-gate-frame',
  templateUrl: './gate-frame.html',
  host: { class: 'block h-full' },
})
export class GateFrame {
  auth = inject(AuthService);
  step = input(1);
  title = input.required<string>();
  subtitle = input('');
  showAccount = input(false);
  steps = [
    { n: 1, label: 'ورود' },
    { n: 2, label: 'ساختمان' },
    { n: 3, label: 'سال مالی' },
  ];

  initial() {
    return this.auth.user()?.name?.trim().charAt(0) || 'م';
  }
}
