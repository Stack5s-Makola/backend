import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

const run = (value: unknown) => {
  const interceptor = new ResponseInterceptor();
  const next = { handle: () => of(value) } as CallHandler;
  return firstValueFrom(interceptor.intercept({} as ExecutionContext, next));
};

describe('ResponseInterceptor', () => {
  it('uses the message and data a service returns', async () => {
    await expect(
      run({ message: 'User retrieved', data: { id: 'u1' } }),
    ).resolves.toEqual({
      success: true,
      message: 'User retrieved',
      data: { id: 'u1' },
    });
  });

  it('passes pagination meta through when present', async () => {
    const result = await run({
      message: 'Users retrieved',
      data: [],
      meta: { total: 0, page: 1, limit: 20, pages: 0 },
    });

    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
  });

  it('omits meta when a service did not set any', async () => {
    expect(await run({ message: 'ok', data: null })).not.toHaveProperty('meta');
  });

  it('wraps a bare payload as data', async () => {
    await expect(run([1, 2, 3])).resolves.toEqual({
      success: true,
      message: 'Request successful',
      data: [1, 2, 3],
    });
  });

  it('normalises an empty response to null data', async () => {
    await expect(run(undefined)).resolves.toEqual({
      success: true,
      message: 'Request successful',
      data: null,
    });
  });

  it('treats an array as the payload, not a service result', async () => {
    const result = await run([{ data: 'not a wrapper' }]);
    expect(result.data).toEqual([{ data: 'not a wrapper' }]);
  });
});
