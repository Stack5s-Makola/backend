import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from './entities/Notification.entity';
import type { NotificationType } from './entities/Notification.entity';

/** How many a single request returns. */
const PAGE_SIZE = 50;

/** One line in the notifications screen. */
export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** The listing or shop it is about, for the app to navigate to. */
  referenceId: string | null;
  read: boolean;
  createdAt: string;
}

/** What a caller passes to raise one. */
export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  referenceId?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  /**
   * Records a notification.
   *
   * Never throws. Raising one is always a side effect of something else that
   * already succeeded - approving a listing, verifying a shop - and a failure
   * to write the line must not undo that. It is logged instead.
   */
  async notify(input: NewNotification): Promise<void> {
    try {
      await this.notifications.insert({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        referenceId: input.referenceId ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Could not record a ${input.type} notification for ${input.userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Someone's notifications, newest first. */
  async listFor(userId: string, unreadOnly = false) {
    const rows = await this.notifications.find({
      where: {
        userId,
        ...(unreadOnly ? { readAt: IsNull() } : {}),
      },
      order: { createdAt: 'DESC' },
      take: PAGE_SIZE,
    });

    return {
      message: 'Notifications retrieved',
      data: rows.map((row) => this.toRow(row)),
    };
  }

  /** How many are still unread, for the badge on the bell. */
  async unreadCountFor(userId: string) {
    const unread = await this.notifications.count({
      where: { userId, readAt: IsNull() },
    });

    return { message: 'Unread count retrieved', data: { unread } };
  }

  /**
   * Marks one as read.
   *
   * Scoped to the caller, so passing someone else's id is a 404 rather than
   * a way to touch their rows.
   */
  async markRead(userId: string, id: string) {
    const row = await this.notifications.findOne({ where: { id, userId } });

    if (!row) {
      throw new NotFoundException('No notification found for that id');
    }

    if (!row.readAt) {
      await this.notifications.update({ id }, { readAt: new Date() });
    }

    return { message: 'Notification marked as read', data: { id, read: true } };
  }

  /** Marks everything unread as read. */
  async markAllRead(userId: string) {
    const { affected } = await this.notifications.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );

    return {
      message: 'Notifications marked as read',
      data: { marked: affected ?? 0 },
    };
  }

  private toRow(row: Notification): NotificationRow {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      referenceId: row.referenceId,
      read: row.readAt !== null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
