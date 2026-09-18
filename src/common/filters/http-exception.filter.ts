import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorBody {
  success: false;
  message: string;
  data: null;
  errors?: Record<string, string>;
}

/**
 * Catches everything thrown anywhere in the app and returns the error shape
 * from the architecture document:
 *
 *   { "success": false, "message": "Product not found", "data": null }
 *
 * Validation failures additionally carry a field -> message map under
 * `errors`, built by the exception factory wired up in main.ts.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorBody = {
      success: false,
      message: 'Internal server error',
      data: null,
    };

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        body.message = payload;
      } else if (typeof payload === 'object' && payload !== null) {
        const { message, errors } = payload as {
          message?: string | string[];
          errors?: Record<string, string>;
        };

        body.message = Array.isArray(message)
          ? message[0]
          : (message ?? exception.message);

        if (errors) {
          body.errors = errors;
        }
      }
    } else {
      // An unexpected error: log the detail, but never leak it to the client.
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }
}
