import { Component, input } from '@angular/core';

@Component({
  selector: 'app-busy',
  template: `
    @if (on()) {
      <span class="ui-spinner" aria-hidden="true"></span>
      {{ busyText() }}
    } @else {
      <ng-content />
    }
  `,
  host: { class: 'inline-flex items-center justify-center gap-2' },
})
export class Busy {
  on = input(false);
  busyText = input('در حال ذخیره...');
}
