import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  message = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(text: string, ms = 2800) {
    this.message.set(text);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.message.set(''), ms);
  }
}
