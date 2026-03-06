import { describe, it, expect } from 'vitest';
import { probeFallbackApiHealth, resolveSupervisorProxyBaseUrl } from './runtime.js';

describe('runtime route helpers', () => {
  describe('resolveSupervisorProxyBaseUrl', () => {
    it('prefers explicit supervisor proxy URL values', () => {
      const result = resolveSupervisorProxyBaseUrl({
        SUPERVISOR_PROXY_URL: 'http://127.0.0.1:3555/',
      });

      expect(result).toBe('http://127.0.0.1:3555');
    });

    it('derives base URL from supervisor events URL', () => {
      const result = resolveSupervisorProxyBaseUrl({
        SUPERVISOR_EVENTS_URL: 'http://127.0.0.1:3457/supervisor/events',
      });

      expect(result).toBe('http://127.0.0.1:3457');
    });

    it('returns null when no supervisor URL is configured', () => {
      expect(resolveSupervisorProxyBaseUrl({})).toBeNull();
    });
  });

  describe('probeFallbackApiHealth', () => {
    it('returns healthy when fallback endpoint responds successfully', async () => {
      const fetchMock = (async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch;

      const result = await probeFallbackApiHealth('http://127.0.0.1:3457', fetchMock);

      expect(result.state).toBe('healthy');
      expect(result.http_status).toBe(200);
    });

    it('returns disabled when supervisor reports fallback disabled', async () => {
      const fetchMock = (async () =>
        new Response(
          JSON.stringify({
            success: false,
            code: 'fallback_unavailable',
            error: 'Fallback API service is disabled',
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          },
        )) as typeof fetch;

      const result = await probeFallbackApiHealth('http://127.0.0.1:3457', fetchMock);

      expect(result.state).toBe('disabled');
    });

    it('returns unknown when probe request cannot reach supervisor', async () => {
      const fetchMock = (async () => {
        throw new Error('connect ECONNREFUSED');
      }) as typeof fetch;

      const result = await probeFallbackApiHealth('http://127.0.0.1:3457', fetchMock);

      expect(result.state).toBe('unknown');
      expect(result.detail).toContain('Unable to reach');
    });
  });
});
