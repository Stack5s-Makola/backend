import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MapService } from './map.service';

/**
 * Map lookups, backed by Mapbox.
 *
 * Guarded: every call spends Mapbox quota against the account's secret token,
 * so an open route would let anyone run the bill up.
 */
@Controller('map')
@UseGuards(JwtAuthGuard)
export class MapController {
  constructor(private readonly map: MapService) {}

  /**
   * GET /api/map/status - whether maps are wired up.
   *
   * Says only whether a token is configured, never what it is. Useful while
   * the real endpoints are being added, and worth keeping afterwards: a map
   * screen failing on a deploy with no token set is otherwise a silent 503.
   */
  @Get('status')
  status() {
    return {
      message: 'Map status retrieved',
      data: { configured: this.map.isConfigured() },
    };
  }
}
