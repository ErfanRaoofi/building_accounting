import { WritableSignal } from '@angular/core';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

export function withBusy<T>(busy: WritableSignal<boolean>, source: Observable<T>): Observable<T> {
  busy.set(true);
  return source.pipe(finalize(() => busy.set(false)));
}
