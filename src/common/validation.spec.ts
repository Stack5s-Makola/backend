import { BadRequestException } from '@nestjs/common';
import { validationPipe } from './validation';
import { UpdateUserStatusDto } from '../admin/dto';

const metadata = {
  type: 'body' as const,
  metatype: UpdateUserStatusDto,
  data: '',
};

describe('validationPipe', () => {
  it('accepts a valid payload', async () => {
    await expect(
      validationPipe.transform({ status: 'suspended' }, metadata),
    ).resolves.toEqual({ status: 'suspended' });
  });

  it('reports a bad value as a field -> message map', async () => {
    expect.assertions(2);

    try {
      await validationPipe.transform({ status: 'deleted' }, metadata);
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as {
        message: string;
        errors: Record<string, string>;
      };
      expect(body.message).toBe('Validation failed');
      expect(body.errors.status).toContain('status must be one of');
    }
  });
});

describe('flattened validation errors', () => {
  it('keeps one message per failing field', async () => {
    expect.assertions(1);

    try {
      await validationPipe.transform({}, metadata);
    } catch (error) {
      const { errors } = (error as BadRequestException).getResponse() as {
        errors: Record<string, string>;
      };
      expect(Object.keys(errors)).toEqual(['status']);
    }
  });
});
