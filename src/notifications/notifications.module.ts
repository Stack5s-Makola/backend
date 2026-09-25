import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/Notification.entity';
import { NotificationsService } from './notifications.service';

/**
 * Notifications, shared by whoever needs to raise one.
 *
 * No controller of its own: each side of the app exposes its own routes, so
 * the seller's live under /api/seller/notifications and read the token there.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
