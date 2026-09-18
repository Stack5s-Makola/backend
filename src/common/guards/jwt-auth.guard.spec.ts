import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';

const contextFor = (request: Partial<AuthenticatedRequest>) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as ExecutionContext;

describe('JwtAuthGuard', () => {
  let jwt: { verifyAsync: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    guard = new JwtAuthGuard(jwt as unknown as JwtService);
  });

  it('rejects a request with no Authorization header', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-bearer scheme', async () => {
    const context = contextFor({ headers: { authorization: 'Basic abc' } });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token that fails verification', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    const context = contextFor({ headers: { authorization: 'Bearer bad' } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches the payload to the request on success', async () => {
    const payload = { sub: 'u1', role: 'ADMIN' as const };
    jwt.verifyAsync.mockResolvedValue(payload);
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer good' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });

  it('accepts a lowercase bearer scheme', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', role: 'ADMIN' });
    const context = contextFor({ headers: { authorization: 'bearer good' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
