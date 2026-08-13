import { apiRequest } from '@/lib/api/client';
import { CropTwinApiError } from '@/lib/api/errors';

function response(body: string, status = 200): Response { return { ok: status >= 200 && status < 300, status, text: async () => body } as Response; }
function abortableFetch(): typeof fetch { return jest.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); })) as typeof fetch; }

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe('API transport', () => {
  it('converts timeouts', async () => {
    jest.useFakeTimers(); globalThis.fetch = abortableFetch();
    const request = apiRequest('/health', { timeoutMs: 25, baseUrl: 'http://example.test' });
    const rejection = expect(request).rejects.toMatchObject({ kind: 'timeout', code: 'REQUEST_TIMEOUT' });
    await jest.advanceTimersByTimeAsync(25); await rejection;
  });

  it('converts caller cancellation', async () => {
    globalThis.fetch = abortableFetch(); const controller = new AbortController();
    const request = apiRequest('/health', { signal: controller.signal, baseUrl: 'http://example.test' }); controller.abort();
    await expect(request).rejects.toMatchObject({ kind: 'cancelled', code: 'REQUEST_CANCELLED' });
  });

  it('preserves structured FastAPI errors', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response(JSON.stringify({ error: { status_code: 409, code: 'STATE_CONFLICT', message: 'State changed.', details: { current: 3 } } }), 409));
    await expect(apiRequest('/state', { baseUrl: 'http://example.test' })).rejects.toMatchObject({ kind: 'backend', statusCode: 409, code: 'STATE_CONFLICT', message: 'State changed.', details: { current: 3 } });
  });

  it('rejects malformed JSON', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response('<html>bad gateway</html>'));
    await expect(apiRequest('/health', { baseUrl: 'http://example.test' })).rejects.toMatchObject({ kind: 'malformed', code: 'MALFORMED_JSON' });
  });

  it('does not retry POST requests in the transport', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(apiRequest('/farms', { method: 'POST', body: { name: 'A' }, baseUrl: 'http://example.test' })).rejects.toBeInstanceOf(CropTwinApiError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
