import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { Notification } from './entities/Notification.entity';
import { NotificationsService } from './notifications.service';

const USER = '11111111-1111-4111-8111-111111111111';

function row(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    userId: USER,
    type: 'listing_approved',
    title: 'Your listing is live',
    body: '"Kente cloth" has been approved.',
    referenceId: 'cccccccc-1111-4111-8111-111111111111',
    readAt: null,
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    ...overrides,
  } as Notification;
}

describe('NotificationsService', () => {
  const insert = jest.fn();
  const find = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const count = jest.fn();
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    insert.mockResolvedValue({ identifiers: [{ id: 'new' }] });
    find.mockResolvedValue([]);
    findOne.mockResolvedValue(row());
    update.mockResolvedValue({ affected: 1 });
    count.mockResolvedValue(0);

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: { insert, find, findOne, update, count },
        },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('notify', () => {
    it('records the notification', async () => {
      await service.notify({
        userId: USER,
        type: 'listing_approved',
        title: 'Your listing is live',
        body: 'It is approved.',
        referenceId: 'ref',
      });

      expect(insert).toHaveBeenCalledWith({
        userId: USER,
        type: 'listing_approved',
        title: 'Your listing is live',
        body: 'It is approved.',
        referenceId: 'ref',
      });
    });

    it('defaults referenceId to null rather than undefined', async () => {
      await service.notify({
        userId: USER,
        type: 'shop_verified',
        title: 'Verified',
        body: 'Your shop is verified.',
      });

      const [values] = insert.mock.calls[0] as [{ referenceId: null }];

      expect(values.referenceId).toBeNull();
    });

    it('never throws - it is a side effect of something that already worked', async () => {
      insert.mockRejectedValue(new Error('database is down'));

      await expect(
        service.notify({
          userId: USER,
          type: 'listing_approved',
          title: 'x',
          body: 'y',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('listFor', () => {
    it('returns them newest first, capped', async () => {
      find.mockResolvedValue([row()]);

      const { data } = await service.listFor(USER);

      expect(data[0]).toEqual({
        id: 'aaaaaaaa-1111-4111-8111-111111111111',
        type: 'listing_approved',
        title: 'Your listing is live',
        body: '"Kente cloth" has been approved.',
        referenceId: 'cccccccc-1111-4111-8111-111111111111',
        read: false,
        createdAt: '2026-09-24T10:00:00.000Z',
      });
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' }, take: 50 }),
      );
    });

    it('scopes to the caller', async () => {
      await service.listFor(USER);

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER } }),
      );
    });

    it('narrows to unread when asked', async () => {
      await service.listFor(USER, true);

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER, readAt: IsNull() } }),
      );
    });

    it('reports a read one as read', async () => {
      find.mockResolvedValue([row({ readAt: new Date() })]);

      const { data } = await service.listFor(USER);

      expect(data[0].read).toBe(true);
    });
  });

  describe('unreadCountFor', () => {
    it('counts only the unread ones, for this user', async () => {
      count.mockResolvedValue(3);

      await expect(service.unreadCountFor(USER)).resolves.toEqual({
        message: 'Unread count retrieved',
        data: { unread: 3 },
      });
      expect(count).toHaveBeenCalledWith({
        where: { userId: USER, readAt: IsNull() },
      });
    });
  });

  describe('markRead', () => {
    it('stamps it read', async () => {
      await expect(service.markRead(USER, 'aaaa')).resolves.toMatchObject({
        data: { read: true },
      });
      expect(update).toHaveBeenCalled();
    });

    it('is a no-op when it was already read', async () => {
      findOne.mockResolvedValue(row({ readAt: new Date() }));

      await service.markRead(USER, 'aaaa');

      expect(update).not.toHaveBeenCalled();
    });

    it('404s for a notification belonging to someone else', async () => {
      // The lookup is scoped by userId, so another user's row simply is not
      // found - there is no way to touch it.
      findOne.mockResolvedValue(null);

      await expect(service.markRead(USER, 'aaaa')).rejects.toThrow(
        new NotFoundException('No notification found for that id'),
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('looks it up by id AND user', async () => {
      await service.markRead(USER, 'aaaa');

      expect(findOne).toHaveBeenCalledWith({
        where: { id: 'aaaa', userId: USER },
      });
    });
  });

  describe('markAllRead', () => {
    it('marks every unread one, and says how many', async () => {
      update.mockResolvedValue({ affected: 4 });

      await expect(service.markAllRead(USER)).resolves.toEqual({
        message: 'Notifications marked as read',
        data: { marked: 4 },
      });
      expect(update).toHaveBeenCalledWith(
        { userId: USER, readAt: IsNull() },
        expect.objectContaining({ readAt: expect.any(Date) }),
      );
    });

    it('reports zero rather than undefined when there was nothing to do', async () => {
      update.mockResolvedValue({ affected: undefined });

      const { data } = await service.markAllRead(USER);

      expect(data.marked).toBe(0);
    });
  });
});
