import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../constants/domain';

export const ROLES_KEY = 'roles';

/**
 * Restricts a controller or handler to the given roles.
 *
 *   @Roles('ADMIN')
 *
 * Enforced by RolesGuard, which reads the role off the JWT payload that
 * JwtAuthGuard put on the request.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
