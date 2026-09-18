import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { JwtPayload } from './jwt-auth.guard';

const contextFor = (user?: JwtPayload) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const require = (...roles: string[]) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  it('allows a route with no @Roles()', () => {
    require();
    expect(guard.canActivate(contextFor())).toBe(true);
  });

  it('allows a user holding the required role', () => {
    require('ADMIN');
    expect(guard.canActivate(contextFor({ sub: 'u1', role: 'ADMIN' }))).toBe(
      true,
    );
  });

  it('accepts a role stored in lowercase', () => {
    require('ADMIN');
    expect(
      guard.canActivate(contextFor({ sub: 'u1', role: 'admin' as never })),
    ).toBe(true);
  });

  it('rejects a user holding a different role', () => {
    require('ADMIN');
    expect(() =>
      guard.canActivate(contextFor({ sub: 'u1', role: 'BUYER' })),
    ).toThrow(ForbiddenException);
  });

  it('rejects an unauthenticated request', () => {
    require('ADMIN');
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});
