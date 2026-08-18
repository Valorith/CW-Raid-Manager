// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import type { PlainBossNotesDocument } from '../services/api.js';
import { plainBossNotesChanged, plainBossNotesValues } from './plainBossNotes.js';

const document: PlainBossNotesDocument = {
  revision: 'a'.repeat(64),
  fieldCount: 2,
  protectedCount: 1,
  lines: [
    {
      id: 'line-1',
      kind: 'paragraph',
      label: 'Text',
      depth: 0,
      segments: [
        { type: 'editable', id: 'field-1', value: 'Before', role: 'text' },
        { type: 'protected', kind: 'link', label: 'Link target preserved' },
        { type: 'editable', id: 'field-2', value: 'Label', role: 'link-label' }
      ]
    }
  ]
};

test('extracts only editable values from a structured plain-text document', () => {
  assert.deepEqual(plainBossNotesValues(document), {
    'field-1': 'Before',
    'field-2': 'Label'
  });
});

test('detects value, missing-field, and extra-field changes', () => {
  const original = plainBossNotesValues(document);
  assert.equal(plainBossNotesChanged({ ...original }, original), false);
  assert.equal(plainBossNotesChanged({ ...original, 'field-2': 'Changed' }, original), true);
  assert.equal(plainBossNotesChanged({ 'field-1': 'Before' }, original), true);
  assert.equal(plainBossNotesChanged({ ...original, unexpected: '' }, original), true);
});
