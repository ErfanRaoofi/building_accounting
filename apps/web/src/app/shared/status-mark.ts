import { Component, input } from '@angular/core';

@Component({
  selector: 'app-status-mark',
  template: `
    @switch (status()) {
      @case ('PAID') {
        <span class="ui-status-mark ui-status-paid" title="پرداخت" aria-label="پرداخت">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12.5l5 5L20 7" />
          </svg>
        </span>
      }
      @case ('UNPAID') {
        <span class="ui-status-mark ui-status-unpaid" title="بدهکار" aria-label="بدهکار">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </span>
      }
      @case ('PARTIAL') {
        <span class="ui-status-mark ui-status-partial" title="ناقص" aria-label="ناقص">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
            <path d="M6 12h12" />
          </svg>
        </span>
      }
      @default {
        <span class="ui-status-mark ui-status-empty" aria-label="بدون فاکتور">—</span>
      }
    }
  `,
  host: { class: 'inline-flex justify-center' },
})
export class StatusMark {
  status = input.required<string>();
}
