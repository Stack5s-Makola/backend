import { BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { validationPipe } from '../../common/validation';
import {
  ListListingsDto,
  ListSellersDto,
  ListUsersDto,
  ModerationReasonDto,
  SearchBuyersDto,
} from '.';

// Runs a payload through the app's pipe and returns its field errors
async function errorsFor(
  metatype: ArgumentMetadata['metatype'],
  value: object,
  type: ArgumentMetadata['type'] = 'query',
) {
  try {
    await validationPipe.transform(value, { type, metatype, data: '' });
    return {};
  } catch (error) {
    return (
      (error as BadRequestException).getResponse() as {
        errors: Record<string, string>;
      }
    ).errors;
  }
}

describe('admin DTO validation', () => {
  it('accepts every documented user status', async () => {
    for (const status of ['active', 'suspended', 'deleted']) {
      expect(await errorsFor(ListUsersDto, { status })).toEqual({});
    }
  });

  it('rejects an unknown user status', async () => {
    expect(await errorsFor(ListUsersDto, { status: 'banned' })).toEqual({
      status: 'status must be one of: active, suspended, deleted',
    });
  });

  it('requires q on buyer search', async () => {
    expect(await errorsFor(SearchBuyersDto, {})).toEqual({
      q: 'Search term "q" is required',
    });
  });

  it('rejects an unknown seller verification status', async () => {
    expect(
      await errorsFor(ListSellersDto, { verificationStatus: 'maybe' }),
    ).toEqual({
      verificationStatus:
        'verificationStatus must be one of: pending, approved, rejected',
    });
  });

  it('validates listing filters', async () => {
    expect(
      await errorsFor(ListListingsDto, {
        status: 'live',
        sellerId: 'abc',
        categoryId: 'xyz',
      }),
    ).toEqual({
      status: 'status must be one of: pending, approved, rejected, removed',
      sellerId: 'sellerId must be a valid UUID',
      categoryId: 'categoryId must be a valid UUID',
    });
  });

  it('accepts valid listing filters', async () => {
    expect(
      await errorsFor(ListListingsDto, {
        status: 'pending',
        sellerId: '3a1f1fc7-3055-44b7-b7c0-d470fd56fcd5',
        q: 'kente',
      }),
    ).toEqual({});
  });

  it('allows a missing moderation reason', async () => {
    expect(await errorsFor(ModerationReasonDto, {}, 'body')).toEqual({});
  });

  it('caps the moderation reason at 500 characters', async () => {
    expect(
      await errorsFor(ModerationReasonDto, { reason: 'x'.repeat(501) }, 'body'),
    ).toEqual({ reason: 'reason cannot exceed 500 characters' });
  });
});
