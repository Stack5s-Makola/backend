import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MapService } from './map.service';

/** Opens up the protected `get` so the request itself can be tested. */
class TestableMapService extends MapService {
  call<T>(path: string, params: Record<string, string> = {}) {
    return this.get<T>(path, params);
  }
}

describe('MapService', () => {
  const env: Record<string, string | undefined> = {
    MAPBOX_SECRET_TOKEN: 'sk.test-token',
  };
  const config = { get: (key: string) => env[key] } as ConfigService;
  let service: TestableMapService;
  let fetchMock: jest.SpyInstance;

  /** The URL the service actually asked for. */
  const requestedUrl = () => {
    const [url] = fetchMock.mock.calls[0] as [URL];

    return url;
  };

  beforeEach(() => {
    env.MAPBOX_SECRET_TOKEN = 'sk.test-token';
    service = new TestableMapService(config);
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ features: [] }),
      text: () => Promise.resolve(''),
    } as Response);
  });

  afterEach(() => fetchMock.mockRestore());

  describe('isConfigured', () => {
    it('is true with a token', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('is false without one, rather than throwing', () => {
      env.MAPBOX_SECRET_TOKEN = undefined;

      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('get', () => {
    it('calls Mapbox at the given path', async () => {
      await service.call('/geocoding/v5/mapbox.places/accra.json');

      expect(requestedUrl().origin).toBe('https://api.mapbox.com');
      expect(requestedUrl().pathname).toBe(
        '/geocoding/v5/mapbox.places/accra.json',
      );
    });

    it('adds the access token so call sites never handle it', async () => {
      await service.call('/anything');

      expect(requestedUrl().searchParams.get('access_token')).toBe(
        'sk.test-token',
      );
    });

    it('passes the query through', async () => {
      await service.call('/anything', { limit: '5', country: 'gh' });

      expect(requestedUrl().searchParams.get('limit')).toBe('5');
      expect(requestedUrl().searchParams.get('country')).toBe('gh');
    });

    it('returns the parsed body', async () => {
      await expect(service.call('/anything')).resolves.toEqual({
        features: [],
      });
    });

    it('503s when no token is configured, naming the variable', async () => {
      env.MAPBOX_SECRET_TOKEN = undefined;

      await expect(service.call('/anything')).rejects.toThrow(
        'MAPBOX_SECRET_TOKEN is missing',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('503s when Mapbox cannot be reached', async () => {
      fetchMock.mockRejectedValue(new Error('network is down'));

      await expect(service.call('/anything')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('503s when Mapbox rejects the request', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Not Authorized - Invalid Token'),
        json: () => Promise.resolve({}),
      });

      await expect(service.call('/anything')).rejects.toThrow(
        'The map request failed',
      );
    });

    it('never puts the token in the error it returns', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        // Mapbox echoes the query back on some errors.
        text: () => Promise.resolve('bad token: sk.test-token'),
        json: () => Promise.resolve({}),
      });

      await expect(service.call('/anything')).rejects.toThrow(
        /^((?!sk\.test-token).)*$/s,
      );
    });
  });
});
