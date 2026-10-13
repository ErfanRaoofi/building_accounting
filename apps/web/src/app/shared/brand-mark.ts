import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand-mark',
  template: `
    <svg
      class="brand-seal"
      [class.brand-seal-on-dark]="onDark()"
      [class.drop-shadow-lg]="!onDark()"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <circle class="seal-field" cx="32" cy="32" r="31" />
      <circle class="seal-ring" cx="32" cy="32" r="26.5" fill="none" stroke-width="2.5" />
      <circle class="seal-tick" cx="32" cy="5.5" r="1.35" />
      <circle class="seal-tick" cx="58.5" cy="32" r="1.35" />
      <circle class="seal-tick" cx="32" cy="58.5" r="1.35" />
      <circle class="seal-tick" cx="5.5" cy="32" r="1.35" />
      <g class="seal-letter">
        <rect x="21" y="28.5" width="6" height="14" rx="2" />
        <rect x="29" y="28.5" width="6" height="14" rx="2" />
        <rect x="37" y="28.5" width="6" height="14" rx="2" />
        <rect x="21" y="38.5" width="22" height="7" rx="3" />
        <circle cx="24" cy="23.5" r="1.9" />
        <circle cx="32" cy="21.8" r="1.9" />
        <circle cx="40" cy="23.5" r="1.9" />
      </g>
    </svg>
  `,
  host: {
    class: 'inline-flex h-12 w-12 shrink-0',
  },
})
export class BrandMark {
  onDark = input(false);
}
