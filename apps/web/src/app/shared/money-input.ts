import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatMoneyInput, parseMoney } from '../core/jalali';

@Component({
  selector: 'app-money-input',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInput), multi: true }],
  host: { class: 'block' },
  template: `
    <input
      class="ui-input ui-money"
      type="text"
      inputmode="numeric"
      dir="ltr"
      autocomplete="off"
      spellcheck="false"
      [value]="display()"
      [disabled]="disabled()"
      [attr.placeholder]="placeholder()"
      (input)="onInput($any($event.target).value)"
      (blur)="touched()"
    />
  `,
})
export class MoneyInput implements ControlValueAccessor {
  placeholder = input('۰');
  nullable = input(false);
  display = signal('');
  disabled = signal(false);
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: number | null | undefined) {
    this.display.set(formatMoneyInput(value));
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

  onInput(raw: string) {
    const parsed = parseMoney(raw);
    const value = parsed ?? (this.nullable() ? null : 0);
    this.display.set(formatMoneyInput(parsed));
    this.onChange(value);
  }

  touched() {
    this.onTouched();
  }
}
