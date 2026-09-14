import { Component, HostListener, input, model } from '@angular/core';

@Component({
  selector: 'app-form-modal',
  templateUrl: './form-modal.html',
})
export class FormModal {
  open = model(false);
  title = input('');
  wide = input(false);

  close() {
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.open()) {
      this.close();
    }
  }
}
