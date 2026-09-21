import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { PasswordService } from './password.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NEW_PASSWORD = 'a-brand-new-password';

describe('PasswordService.reset', () => {
  const findOne = jest.fn();
  const update = jest.fn();
  let service: PasswordService;

  beforeEach(async () => {
    jest.clearAllMocks();
    findOne.mockResolvedValue({ id: USER_ID });
    update.mockResolvedValue({ affected: 1 });

    const module = await Test.createTestingModule({
      providers: [
        PasswordService,
        { provide: getRepositoryToken(User), useValue: { findOne, update } },
      ],
    }).compile();

    service = module.get(PasswordService);
  });

  it('says reset when the password is changed', async () => {
    await expect(
      service.reset({ userId: USER_ID, password: NEW_PASSWORD }),
    ).resolves.toEqual({
      message: 'Password changed',
      data: { reset: true },
    });
  });

  it('stores a bcrypt hash, never the password', async () => {
    await service.reset({ userId: USER_ID, password: NEW_PASSWORD });

    const [, values] = update.mock.calls[0] as [
      unknown,
      { passwordHash: string },
    ];

    expect(values.passwordHash).not.toBe(NEW_PASSWORD);
    expect(values.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('stores a hash the new password actually matches', async () => {
    await service.reset({ userId: USER_ID, password: NEW_PASSWORD });

    const [, values] = update.mock.calls[0] as [
      unknown,
      { passwordHash: string },
    ];

    await expect(
      bcrypt.compare(NEW_PASSWORD, values.passwordHash),
    ).resolves.toBe(true);
    await expect(
      bcrypt.compare('the-old-one', values.passwordHash),
    ).resolves.toBe(false);
  });

  it('changes only the named account', async () => {
    await service.reset({ userId: USER_ID, password: NEW_PASSWORD });

    const [where] = update.mock.calls[0] as [{ id: string }];

    expect(where).toEqual({ id: USER_ID });
  });

  it('404s when no account has that id', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.reset({ userId: USER_ID, password: NEW_PASSWORD }),
    ).rejects.toThrow(new NotFoundException('No account found for that id'));
  });

  it('writes nothing when the account does not exist', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.reset({ userId: USER_ID, password: NEW_PASSWORD }),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('touches no field but the password', async () => {
    await service.reset({ userId: USER_ID, password: NEW_PASSWORD });

    const [, values] = update.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];

    expect(Object.keys(values)).toEqual(['passwordHash']);
  });

  it('never returns the hash it wrote', async () => {
    const result = await service.reset({
      userId: USER_ID,
      password: NEW_PASSWORD,
    });

    expect(JSON.stringify(result)).not.toContain('$2b$');
    expect(JSON.stringify(result)).not.toContain(NEW_PASSWORD);
  });
});
