import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Mapbox's API root. Every endpoint hangs off this. */
const MAPBOX_API = 'https://api.mapbox.com';

/** A slow map lookup should fail rather than hold a request open. */
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);

  constructor(private readonly config: ConfigService) {}

  /** The secret token, or a 503 saying which variable is missing. */
  private get token(): string {
    const token = this.config.get<string>('MAPBOX_SECRET_TOKEN');

    if (!token) {
      throw new ServiceUnavailableException(
        'Maps are not configured: MAPBOX_SECRET_TOKEN is missing',
      );
    }

    return token;
  }

  /**
   * Calls Mapbox and hands back the parsed body.
   *
   * `path` is everything after the host, without the access token - this adds
   * it, so the token never has to appear at a call site.
   *
   * Every failure becomes a 503 rather than leaking Mapbox's own status: a
   * map lookup failing is this API being unable to serve the request, not the
   * caller having done anything wrong.
   */
  protected async get<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(`${MAPBOX_API}${path}`);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set('access_token', this.token);

    let response: Response;

    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Could not reach Mapbox: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!response.ok) {
      // Mapbox explains a rejection in the body; a bad token and a malformed
      // query look identical without it. Logged, never returned - the body
      // can carry the token back in an error message.
      const detail = await response.text().catch(() => '');

      this.logger.error(
        `Mapbox rejected ${path}: ${response.status} ${detail.slice(0, 300)}`,
      );

      throw new ServiceUnavailableException('The map request failed');
    }

    return (await response.json()) as T;
  }

  /** Whether a token is configured at all, without throwing. */
  isConfigured(): boolean {
    return Boolean(this.config.get<string>('MAPBOX_SECRET_TOKEN'));
  }
}
