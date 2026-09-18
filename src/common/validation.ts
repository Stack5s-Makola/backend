import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';

/**
 * Flattens class-validator's nested errors into the field -> message map the
 * architecture document specifies:
 *
 *   { "success": false, "message": "Validation failed",
 *     "errors": { "price": "Price must be greater than 0" } }
 */
function flatten(
  errors: ValidationError[],
  parent = '',
  target: Record<string, string> = {},
) {
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const [first] = Object.values(error.constraints ?? {});

    if (first) {
      target[path] = first;
    }

    if (error.children?.length) {
      flatten(error.children, path, target);
    }
  }

  return target;
}

/**
 * The app-wide validation pipe: coerces DTO types and reports failures in the
 * standard error shape.
 *
 * `whitelist` is deliberately off: several existing DTOs do not declare every
 * field their endpoints accept (CreateUserDto has no `phone` or `role`), and
 * stripping would silently drop that data.
 */
export const validationPipe = new ValidationPipe({
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  exceptionFactory: (errors: ValidationError[]) =>
    new BadRequestException({
      message: 'Validation failed',
      errors: flatten(errors),
    }),
});
