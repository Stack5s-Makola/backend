import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest, JwtPayload } from '../guards/jwt-auth.guard';

/** Pulls the authenticated user's JWT payload off the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
