import { encodePathSegment, farmPath, queryString, sessionPath } from '@/lib/api/paths';

describe('API paths', () => {
  it('encodes every dynamic path segment', () => { expect(sessionPath(' state/a b ', 'history')).toBe('/sessions/state%2Fa%20b/history'); expect(farmPath('farm#1')).toBe('/farms/farm%231'); });
  it('rejects empty segments', () => expect(() => encodePathSegment('  ')).toThrow());
  it('encodes query values and omits missing values', () => expect(queryString({ date: '2026-08-12', note: 'a & b', missing: undefined })).toBe('?date=2026-08-12&note=a%20%26%20b'));
});
