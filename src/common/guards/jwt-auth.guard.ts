import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UserRole } from '../constants/domain';

/**
 * The claims this API expects on an access token.
 *
 * The auth module issues these at login; this guard only verifies them, so
 * the two sides only need to agree on `sub` and `role`.
 */
export interface JwtPayload {
  sub: string;
  email?: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/** Verifies the `Authorization: Bearer <token>` header and attaches the payload. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token is missing');
    }

    try {
      request.user = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'Authentication token is invalid or expired',
      );
    }

    return true;
  }

  private extractToken(request: AuthenticatedRequest) {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme?.toLowerCase() === 'bearer' ? token : undefined;
  }
}
