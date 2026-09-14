import { Component, computed, input, model, output } from '@angular/core';
import { PAGE_SIZES } from '../core/pagination';

@Component({
  selector: 'app-pager',
  templateUrl: './pager.html',
  host: { class: 'mt-3 block' },
})
export class Pager {
  page = model(1);
  size = model(10);
  total = input(0);
  itemLabel = input('');
  changed = output<void>();
  sizes = PAGE_SIZES;
  fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

  pages = computed(() => Math.max(1, Math.ceil((this.total() || 0) / this.size()) || 1));
  current = computed(() => Math.min(Math.max(1, this.page()), this.pages()));
  from = computed(() => (this.total() ? (this.current() - 1) * this.size() + 1 : 0));
  to = computed(() => Math.min(this.current() * this.size(), this.total()));

  prev() {
    this.page.set(Math.max(1, this.current() - 1));
    this.changed.emit();
  }

  next() {
    this.page.set(Math.min(this.pages(), this.current() + 1));
    this.changed.emit();
  }

  changeSize(raw: string) {
    this.size.set(Number(raw) || 10);
    this.page.set(1);
    this.changed.emit();
  }
}
