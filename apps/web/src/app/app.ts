import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/toast.service';
import { HttpLoadingService } from './core/http-loading.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    @if (httpLoading.active()) {
      <div class="ui-http-progress" dir="ltr" aria-hidden="true">
        <div class="ui-http-progress-bar"></div>
      </div>
    }
    <router-outlet />
    @if (toast.message(); as text) {
      <div
        class="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4 print:hidden"
      >
        <div class="animate-toast rounded-2xl bg-ink-950 px-4 py-3 text-sm font-medium text-white shadow-xl">
          {{ text }}
        </div>
      </div>
    }
  `,
})
export class App {
  toast = inject(ToastService);
  httpLoading = inject(HttpLoadingService);
}
