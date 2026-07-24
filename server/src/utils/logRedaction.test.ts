import assert from 'node:assert/strict';
import test from 'node:test';

import { redactRequestLogUrl } from './logRedaction.js';

test('redacts inbound webhook tokens from request log URLs', () => {
  assert.equal(
    redactRequestLogUrl('/api/webhook-inbox/webhook-123/secret-token-value'),
    '/api/webhook-inbox/webhook-123/:redacted'
  );
  assert.equal(
    redactRequestLogUrl('/api/webhook-inbox/webhook-123/secret-token-value?source=discord'),
    '/api/webhook-inbox/webhook-123/:redacted?source=discord'
  );
});

test('leaves unrelated request log URLs unchanged', () => {
  assert.equal(redactRequestLogUrl('/api/auth/me'), '/api/auth/me');
});
