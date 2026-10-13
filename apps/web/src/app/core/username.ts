import { ValidatorFn, Validators } from '@angular/forms';

const USERNAME = /^[\u0600-\u06ffa-z0-9._@-]+$/i;

export const usernameValidators: ValidatorFn[] = [
  Validators.required,
  Validators.minLength(3),
  Validators.maxLength(64),
  Validators.pattern(USERNAME),
];
