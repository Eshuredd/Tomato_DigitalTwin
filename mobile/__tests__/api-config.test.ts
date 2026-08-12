import { resolveApiBaseUrl } from '@/lib/api/config';

describe('API base URL', () => {
  it('normalizes valid HTTP URLs', () => expect(resolveApiBaseUrl(' http://10.0.2.2:8000/ ')).toBe('http://10.0.2.2:8000'));
  it.each(['relative/path', 'ftp://example.com', 'http://user:pass@example.com', 'https://example.com?q=secret'])('rejects unsafe or invalid values: %s', (value) => expect(() => resolveApiBaseUrl(value)).toThrow('EXPO_PUBLIC_API_BASE_URL'));
});
