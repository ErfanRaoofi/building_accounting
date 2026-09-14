import { Component, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-password-input',
  imports: [ReactiveFormsModule],
  template: `
    <span class="ui-password">
      <input
        class="ui-input"
        [class.border-rose-300]="invalid()"
        [type]="visible() ? 'text' : 'password'"
        [formControl]="control()"
        [attr.autocomplete]="autocomplete()"
        dir="ltr"
        spellcheck="false"
        autocapitalize="off"
      />
      <button
        class="ui-password-toggle"
        type="button"
        (click)="visible.set(!visible())"
        [attr.aria-label]="visible() ? 'پنهان کردن رمز' : 'نمایش رمز'"
      >
        @if (visible()) {
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 3-3M9.9 5.1A10.8 10.8 0 0 1 12 5c6 0 10 7 10 7a18.5 18.5 0 0 1-3.2 3.8M6.1 6.1C3.9 7.8 2 12 2 12s4 7 10 7a10.4 10.4 0 0 0 4.2-.9" stroke-linecap="round" />
          </svg>
        } @else {
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        }
      </button>
    </span>
  `,
})
export class PasswordInput {
  control = input.required<FormControl<string>>();
  autocomplete = input('current-password');
  invalid = input(false);
  visible = signal(false);
}
