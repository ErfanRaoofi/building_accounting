import { Component, HostListener, input, model } from '@angular/core';

@Component({
  selector: 'app-form-rail',
  templateUrl: './form-rail.html',
})
export class FormRail {
  open = model(false);
  title = input('');
  subtitle = input('');
  wide = input(false);

  close() {
    this.open.set(false);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event) {
    if (this.open() && !event.defaultPrevented) {
      this.close();
    }
  }
}
