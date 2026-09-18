import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
}

// What a service returns before the envelope is put around it
interface ServiceResult {
  message?: string;
  data?: unknown;
  meta?: Record<string, unknown>;
}

function isServiceResult(value: unknown): value is ServiceResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ('data' in value || 'message' in value)
  );
}

/**
 * Wraps every successful response in the shape the architecture document
 * defines, so the Admin Web and mobile clients can read every endpoint
 * the same way:
 *
 *   { "success": true, "message": "...", "data": {} }
 *
 * A service may return `{ message, data, meta }` to set its own message and
 * pagination meta. Anything else is treated as the payload itself.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<unknown>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<unknown>> {
    return next.handle().pipe(
      map((result) => {
        if (isServiceResult(result)) {
          const { message, data, meta } = result;
          return {
            success: true as const,
            message: message ?? 'Request successful',
            data: data ?? null,
            ...(meta ? { meta } : {}),
          };
        }

        return {
          success: true as const,
          message: 'Request successful',
          data: result ?? null,
        };
      }),
    );
  }
}
