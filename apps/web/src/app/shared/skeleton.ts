import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  templateUrl: './skeleton.html',
  host: {
    class: 'block',
    'aria-busy': 'true',
    'aria-live': 'polite',
  },
})
export class Skeleton {
  kind = input<'list' | 'cards' | 'table' | 'stats' | 'ledger' | 'checks' | 'print'>('list');
  rows = input(6);
  items = computed(() => Array.from({ length: this.rows() }, (_, i) => i + 1));
}
