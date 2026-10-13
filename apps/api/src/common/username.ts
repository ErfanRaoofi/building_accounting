import { Transform } from 'class-transformer';
import { registerDecorator, ValidationOptions } from 'class-validator';

const USERNAME = /^[\u0600-\u06ffa-z0-9._@-]+$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isUsername(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }
  const username = normalizeUsername(value);
  return username.length >= 3 && username.length <= 64 && USERNAME.test(username);
}

export function UsernameField(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    Transform(({ value }) => (typeof value === 'string' ? normalizeUsername(value) : value))(target, propertyKey);
    registerDecorator({
      name: 'isUsername',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: {
        message: 'نام کاربری باید ۳ تا ۶۴ نویسه باشد: حرف، عدد، نقطه، خط تیره یا @',
        ...options,
      },
      validator: {
        validate: isUsername,
      },
    });
  };
}
