import { Component, ElementRef, HostListener, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatJalali, JALALI_MONTHS, jalaliToDate, monthLength, parseJalali, toJalali } from '../core/jalali';

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

type CalCell = { day: number | null; date: Date | null };

@Component({
  selector: 'app-jalali-datepicker',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => JalaliDatepicker), multi: true }],
  host: { class: 'block' },
  template: `
    <div class="relative">
      <input
        class="ui-input pr-11"
        type="text"
        dir="ltr"
        autocomplete="off"
        spellcheck="false"
        inputmode="numeric"
        [value]="display()"
        [disabled]="disabled()"
        [attr.placeholder]="placeholder()"
        [attr.aria-expanded]="open()"
        (input)="onType($any($event.target).value)"
        (focus)="openCal()"
        (blur)="touched()"
        (keydown.escape)="onInputEsc($event)"
      />
      <button
        class="absolute top-1/2 right-1.5 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        type="button"
        tabindex="-1"
        [disabled]="disabled()"
        aria-label="انتخاب تاریخ"
        (click)="toggle(); $event.stopPropagation()"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18" />
        </svg>
      </button>
    </div>
    @if (open()) {
      <div class="mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" dir="rtl" role="dialog" aria-label="تقویم شمسی">
        <div class="mb-3 flex items-center justify-between gap-1">
          <button class="ui-btn-ghost h-9 w-9 px-0" type="button" aria-label="ماه قبل" (click)="shiftMonth(-1)">›</button>
          <p class="min-w-0 flex-1 text-center text-sm font-bold text-slate-900">{{ monthTitle() }}</p>
          <button class="ui-btn-ghost h-9 w-9 px-0" type="button" aria-label="ماه بعد" (click)="shiftMonth(1)">‹</button>
        </div>
        <div class="mb-1 grid grid-cols-7 text-center text-xs font-medium text-slate-400">
          @for (d of weekdays; track d) {
            <span class="py-1">{{ d }}</span>
          }
        </div>
        <div class="grid grid-cols-7 gap-0.5">
          @for (cell of cells(); track $index) {
            @if (cell.day) {
              <button
                class="h-9 rounded-lg text-sm transition"
                type="button"
                [class.bg-brand-700]="isSelected(cell.date)"
                [class.text-white]="isSelected(cell.date)"
                [class.font-bold]="isSelected(cell.date)"
                [class.ring-1]="isToday(cell.date) && !isSelected(cell.date)"
                [class.ring-brand-600]="isToday(cell.date) && !isSelected(cell.date)"
                [class.text-brand-800]="isToday(cell.date) && !isSelected(cell.date)"
                [class.hover:bg-slate-100]="!isSelected(cell.date)"
                (click)="pick(cell.date!)"
              >
                {{ cell.day.toLocaleString('fa-IR') }}
              </button>
            } @else {
              <span class="h-9"></span>
            }
          }
        </div>
        <div class="mt-2 flex justify-between gap-2">
          <button class="ui-btn-ghost h-9 flex-1 px-3 text-sm" type="button" (click)="pick(today)">امروز</button>
          @if (nullable() && value()) {
            <button class="ui-btn-ghost h-9 flex-1 px-3 text-sm" type="button" (click)="clear()">پاک کردن</button>
          }
        </div>
      </div>
    }
  `,
})
export class JalaliDatepicker implements ControlValueAccessor {
  private host = inject(ElementRef<HTMLElement>);
  placeholder = input('1405/01/15');
  nullable = input(false);
  weekdays = WEEKDAYS;
  today = new Date();
  open = signal(false);
  display = signal('');
  disabled = signal(false);
  value = signal<Date | null>(null);
  viewYear = signal(toJalali(new Date()).jy);
  viewMonth = signal(toJalali(new Date()).jm);
  monthTitle = computed(
    () => `${JALALI_MONTHS[this.viewMonth() - 1]} ${this.viewYear().toLocaleString('fa-IR', { useGrouping: false })}`,
  );
  cells = computed(() => this.buildCells(this.viewYear(), this.viewMonth()));
  private onChange: (value: Date | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.closeCal();
    }
  }

  writeValue(value: Date | string | null | undefined) {
    const date = this.asDate(value);
    this.value.set(date);
    this.display.set(date ? formatJalali(date) : '');
    if (date) {
      const j = toJalali(date);
      this.viewYear.set(j.jy);
      this.viewMonth.set(j.jm);
    }
  }

  registerOnChange(fn: (value: Date | null) => void) {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean) {
    this.disabled.set(disabled);
  }

  toggle() {
    if (this.disabled()) {
      return;
    }
    this.open.update((v) => !v);
  }

  openCal() {
    if (!this.disabled()) {
      this.open.set(true);
    }
  }

  closeCal() {
    this.open.set(false);
  }

  onInputEsc(event: Event) {
    if (!this.open()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.closeCal();
  }

  onType(raw: string) {
    this.display.set(raw);
    const parsed = parseJalali(raw);
    if (!parsed && this.nullable() && !raw.trim()) {
      this.value.set(null);
      this.onChange(null);
      return;
    }
    if (!parsed) {
      return;
    }
    this.setValue(parsed, false);
  }

  pick(date: Date) {
    this.setValue(date, true);
    this.closeCal();
  }

  clear() {
    this.value.set(null);
    this.display.set('');
    this.onChange(null);
    this.touched();
    this.closeCal();
  }

  shiftMonth(delta: number) {
    let month = this.viewMonth() + delta;
    let year = this.viewYear();
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    this.viewYear.set(year);
    this.viewMonth.set(month);
  }

  isSelected(date: Date | null) {
    const current = this.value();
    return !!(date && current && formatJalali(date) === formatJalali(current));
  }

  isToday(date: Date | null) {
    return !!(date && formatJalali(date) === formatJalali(this.today));
  }

  touched() {
    this.onTouched();
  }

  private setValue(date: Date, syncDisplay: boolean) {
    this.value.set(date);
    if (syncDisplay) {
      this.display.set(formatJalali(date));
    }
    const j = toJalali(date);
    this.viewYear.set(j.jy);
    this.viewMonth.set(j.jm);
    this.onChange(date);
    this.touched();
  }

  private asDate(value: Date | string | null | undefined) {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(+date) ? null : date;
  }

  private buildCells(year: number, month: number): CalCell[] {
    const first = jalaliToDate(year, month, 1);
    const pad = (first.getDay() + 1) % 7;
    const length = monthLength(year, month);
    const cells: CalCell[] = [];
    for (let i = 0; i < pad; i++) {
      cells.push({ day: null, date: null });
    }
    for (let day = 1; day <= length; day++) {
      cells.push({ day, date: jalaliToDate(year, month, day) });
    }
    return cells;
  }
}
