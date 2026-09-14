import { Component, computed, input } from '@angular/core';

export function buildingLogoSrc(url?: string | null, updatedAt?: string | null) {
  if (!url) {
    return '';
  }
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(updatedAt || '')}`;
}

@Component({
  selector: 'app-building-logo',
  host: { class: 'contents' },
  template: `
    <span
      class="ui-logo"
      [class.ui-logo-sm]="size() === 'sm'"
      [class.ui-logo-md]="size() === 'md'"
      [class.ui-logo-lg]="size() === 'lg'"
      [attr.aria-label]="alt()"
    >
      @if (src()) {
        <img [src]="src()" [alt]="alt()" />
      } @else {
        <svg class="h-[55%] w-[55%] opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 21V8l8-5 8 5v13M9 21v-7h6v7M4 21h16" />
        </svg>
      }
    </span>
  `,
})
export class BuildingLogo {
  url = input<string | null | undefined>(null);
  updatedAt = input<string | null | undefined>(null);
  alt = input('');
  size = input<'sm' | 'md' | 'lg'>('md');
  src = computed(() => buildingLogoSrc(this.url(), this.updatedAt()) || null);
}
