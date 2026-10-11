import {
  Component,
  ElementRef,
  OnDestroy,
  forwardRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatMoneyInput, parseMoney } from '../core/jalali';
import { tomanWords } from '../core/persian-words';

@Component({
  selector: 'app-money-input',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInput), multi: true }],
  host: { class: 'block' },
  template: `
    <input
      #el
      class="ui-input ui-money"
      type="text"
      inputmode="numeric"
      dir="ltr"
      autocomplete="off"
      spellcheck="false"
      [value]="display()"
      [disabled]="disabled()"
      [attr.placeholder]="placeholder()"
      (input)="onInput($any($event.target))"
      (focus)="onFocus()"
      (blur)="onBlur()"
      (keydown.enter)="onEnter($event)"
    />
  `,
})
export class MoneyInput implements ControlValueAccessor, OnDestroy {
  placeholder = input('۰');
  nullable = input(false);
  enter = output<Event>();
  el = viewChild<ElementRef<HTMLInputElement>>('el');
  display = signal('');
  disabled = signal(false);
  private value: number | null = null;
  private hintEl: HTMLDivElement | null = null;
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: number | null | undefined) {
    this.value = value == null || !Number.isFinite(Number(value)) ? null : Number(value);
    this.display.set(formatMoneyInput(this.value));
  }

  registerOnChange(fn: (value: number | null) => void) {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean) {
    this.disabled.set(disabled);
  }

  focus() {
    const input = this.el()?.nativeElement;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }

  onEnter(event: Event) {
    event.preventDefault();
    this.enter.emit(event);
  }

  onFocus() {
    this.showHint();
  }

  onInput(input: HTMLInputElement) {
    const caretDigits = digitCount(input.value.slice(0, input.selectionStart ?? input.value.length));
    const parsed = parseMoney(input.value);
    this.value = parsed;
    const next = parsed ?? (this.nullable() ? null : 0);
    const formatted = formatMoneyInput(parsed);
    this.display.set(formatted);
    input.value = formatted;
    setCaretDigits(input, caretDigits);
    this.onChange(next);
    this.showHint();
  }

  onBlur() {
    this.onTouched();
    this.hideHint();
  }

  ngOnDestroy() {
    this.hintEl?.remove();
    this.hintEl = null;
  }

  private showHint() {
    if (this.value == null || !this.value) {
      this.hideHint();
      return;
    }
    if (!this.hintEl) {
      this.hintEl = document.createElement('div');
      this.hintEl.className = 'money-toman-hint';
      document.body.appendChild(this.hintEl);
    }
    const fa = this.value.toLocaleString('fa-IR');
    const toman = Math.round(this.value / 10);
    this.hintEl.hidden = false;
    this.hintEl.textContent = `${fa} ریال\nمعادل ${toman.toLocaleString('fa-IR')} تومان\n${tomanWords(this.value)}`;
    const input = this.el()?.nativeElement;
    if (!input) {
      return;
    }
    const rect = input.getBoundingClientRect();
    const height = this.hintEl.offsetHeight || 36;
    const placeAbove = rect.bottom + height + 10 > window.innerHeight;
    this.hintEl.style.top = `${placeAbove ? rect.top - height - 6 : rect.bottom + 6}px`;
    this.hintEl.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    this.hintEl.style.left = 'auto';
  }

  private hideHint() {
    if (this.hintEl) {
      this.hintEl.hidden = true;
    }
  }
}

function digitCount(value: string) {
  return (value.match(/[\d۰-۹٠-٩]/g) || []).length;
}

function setCaretDigits(el: HTMLInputElement, count: number) {
  let seen = 0;
  const value = el.value;
  for (let i = 0; i <= value.length; i++) {
    if (seen >= count) {
      el.setSelectionRange(i, i);
      return;
    }
    if (/[\d۰-۹٠-٩]/.test(value[i] || '')) {
      seen += 1;
    }
  }
  el.setSelectionRange(value.length, value.length);
}
