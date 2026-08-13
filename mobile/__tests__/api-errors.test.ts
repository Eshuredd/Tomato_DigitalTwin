import { parseBackendError } from '@/lib/api/errors';

it('uses the HTTP status when a structured backend status is absent', () => {
  expect(parseBackendError({ error: { code: 'NO_STATE', message: 'Missing', details: {} } }, 404)).toMatchObject({ kind: 'backend', code: 'NO_STATE', statusCode: 404 });
});
