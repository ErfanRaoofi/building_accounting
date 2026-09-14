import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

const ICONS: Record<string, string[]> = {
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  ledger: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  enter: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
  generate: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
  view: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'],
  lock: ['M7 11V8a5 5 0 0 1 10 0v3', 'M6 11h12v10H6z'],
  restore: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'],
  download: ['M12 3v12', 'M8 11l4 4 4-4', 'M5 21h14'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
};

@Component({
  selector: 'app-icon-action',
  imports: [RouterLink],
  template: `
    @if (link(); as href) {
      <a class="ui-icon-btn" [class.ui-icon-btn-danger]="danger()" [routerLink]="href" [attr.aria-label]="label()" [title]="label()">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          @for (d of paths(); track d) {
            <path [attr.d]="d" />
          }
        </svg>
      </a>
    } @else {
      <button
        type="button"
        class="ui-icon-btn"
        [class.ui-icon-btn-danger]="danger()"
        [disabled]="disabled() || busy()"
        [attr.aria-label]="label()"
        [title]="label()"
      >
        @if (busy()) {
          <span class="ui-spinner" aria-hidden="true"></span>
        } @else {
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            @for (d of paths(); track d) {
              <path [attr.d]="d" />
            }
          </svg>
        }
      </button>
    }
  `,
  host: { class: 'inline-flex' },
})
export class IconAction {
  icon = input.required<string>();
  label = input.required<string>();
  link = input<string | readonly (string | number)[] | null>(null);
  disabled = input(false);
  busy = input(false);
  danger = input(false);
  paths = computed(() => ICONS[this.icon()] || ICONS['edit']);
}
