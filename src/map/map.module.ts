import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MapController } from './map.controller';
import { MapService } from './map.service';

/**
 * Everything that talks to Mapbox.
 *
 * MapService is exported so other modules can use it directly - the buyer
 * and seller sides will want distances and addresses without going through
 * an HTTP round trip of their own.
 */
@Module({
  imports: [ConfigModule],
  controllers: [MapController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
