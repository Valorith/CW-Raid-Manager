import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_BOSS_NOTES_LENGTH,
  PlainBossNotesConversionError,
  applyPlainBossNotesEdits,
  createPlainBossNotesDocument,
  encodePlainTextForWikitext,
  type PlainBossNotesDocument
} from './plainBossNotes.js';

const BLACKSMITH_FIXTURE = `[[File:Blacksmith Yragbor.jpg|500px|thumb|right|[https://alla.clumsysworld.com/?a=npc&id=92110 Blacksmith Yragbor]]]
{| class="wikitable"
! colspan="2" style="text-align: center; font-weight:bold; background-color:#cd9934; color:#ffffff;" | Blacksmith Yragbor
|-
| style="font-weight:bold;" | Race:
| Giant
|-
| colspan="2" style="text-align: center; font-weight:bold;" | [[File:Blacksmith_Yragbor_Map.jpg]]
|}
----
=== Encounter NPCs and Abilities ===
* Already Spawned at Start - [[Blacksmith Yragbor]]
** Perma-rooted
** [https://alla.clumsysworld.com/?a=spell&id=1318 Muscle Spawm]
*** Snare
*** 5 Poison Counters

=== Heal Rotation ===
* 2 Person [[CH Chain and Audio Triggers#2_Person_CH_Chain| CH Chain]]<br>
* 3 Person [[CH Chain and Audio Triggers#3_Person_CH_Chain| CH Chain]]

[[Category:NPC]]
[[Category:Ancients]]`;

function fieldValues(document: PlainBossNotesDocument): Record<string, string> {
  return Object.fromEntries(
    document.lines.flatMap((line) =>
      line.segments.flatMap((segment) =>
        segment.type === 'editable' ? [[segment.id, segment.value] as const] : []
      )
    )
  );
}

function findField(document: PlainBossNotesDocument, value: string): string {
  for (const line of document.lines) {
    for (const segment of line.segments) {
      if (segment.type === 'editable' && segment.value === value) return segment.id;
    }
  }
  throw new Error(`Editable field not found: ${value}`);
}

function expectConversionError(
  callback: () => unknown,
  code: PlainBossNotesConversionError['code']
) {
  assert.throws(
    callback,
    (error) => error instanceof PlainBossNotesConversionError && error.code === code
  );
}

test('projects Blacksmith Yragbor into readable fields while locking wiki structure', () => {
  const document = createPlainBossNotesDocument(BLACKSMITH_FIXTURE);
  const values = Object.values(fieldValues(document));

  assert.ok(values.includes('Blacksmith Yragbor'));
  assert.ok(values.includes('Race:'));
  assert.ok(values.includes('Giant'));
  assert.ok(values.includes('Encounter NPCs and Abilities'));
  assert.ok(values.includes('Already Spawned at Start - '));
  assert.ok(values.includes('Muscle Spawm'));
  assert.ok(values.includes('CH Chain'));
  assert.ok(!values.includes(']'));
  assert.equal(values.at(-1), '');
  assert.ok(document.protectedCount >= 12);
  assert.ok(
    document.lines.some((line) =>
      line.segments.some((segment) => segment.type === 'protected' && segment.kind === 'media')
    )
  );
  assert.ok(
    document.lines.some((line) =>
      line.segments.some((segment) => segment.type === 'protected' && segment.kind === 'category')
    )
  );
  assert.ok(
    document.lines.some((line) =>
      line.segments.some(
        (segment) => segment.type === 'protected' && segment.label === 'Link target preserved'
      )
    )
  );
});

test('an unchanged plain-text document round-trips byte-for-byte', () => {
  for (const source of [
    BLACKSMITH_FIXTURE,
    "Text with '''bold''', ''italics'', &amp; entities.\r\n\r\n[[Category:Test]]",
    '',
    'Unicode raid note: Žek ⚔️ 日本語'
  ]) {
    const document = createPlainBossNotesDocument(source);
    const result = applyPlainBossNotesEdits(source, document.revision, fieldValues(document));
    assert.equal(result.changed, false);
    assert.equal(result.notes, source);
    assert.equal(result.document.revision, document.revision);
  }
});

test('edits readable fields while preserving protected source and inserting before categories', () => {
  const document = createPlainBossNotesDocument(BLACKSMITH_FIXTURE);
  const values = fieldValues(document);
  values[findField(document, 'Giant')] = 'Storm giant & master smith';
  values[findField(document, 'Muscle Spawm')] = 'Muscle Spawn';
  values[findField(document, '')] = 'Bring fire resistance.\nAssign backup tanks.';

  const result = applyPlainBossNotesEdits(BLACKSMITH_FIXTURE, document.revision, values);

  assert.equal(result.changed, true);
  assert.match(result.notes, /\| Storm giant &#38; master smith/);
  assert.match(
    result.notes,
    /\[https:\/\/alla\.clumsysworld\.com\/\?a=spell&id=1318 Muscle Spawn\]/
  );
  assert.match(
    result.notes,
    /Bring fire resistance\.\nAssign backup tanks\.\n\n\[\[Category:NPC\]\]/
  );
  for (const protectedSource of [
    '[[File:Blacksmith Yragbor.jpg|500px|thumb|right|[https://alla.clumsysworld.com/?a=npc&id=92110 Blacksmith Yragbor]]]',
    '{| class="wikitable"',
    '| style="font-weight:bold;" |',
    '[[File:Blacksmith_Yragbor_Map.jpg]]',
    '[[CH Chain and Audio Triggers#2_Person_CH_Chain|',
    '[[Category:NPC]]',
    '[[Category:Ancients]]'
  ]) {
    assert.ok(result.notes.includes(protectedSource), protectedSource);
  }
});

test('plain text is entity-encoded so it cannot become active MediaWiki syntax', () => {
  const hostile = `[[Evil|link]] {{Template}} <script>alert(1)</script> | = * # : ; ! ---- __TOC__ &`;
  const encoded = encodePlainTextForWikitext(hostile);
  for (const activeToken of ['[[', '{{', '<script>', '|', '----', '__TOC__']) {
    assert.doesNotMatch(encoded, new RegExp(activeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const source = 'Safe paragraph\n[[Category:Ancients]]';
  const document = createPlainBossNotesDocument(source);
  const values = fieldValues(document);
  values[findField(document, 'Safe paragraph')] = hostile;
  const result = applyPlainBossNotesEdits(source, document.revision, values);

  assert.ok(result.notes.includes(encoded));
  assert.ok(result.notes.endsWith('[[Category:Ancients]]'));
});

test('rejects stale, incomplete, extra, multiline, and oversized saves without producing output', () => {
  const source = 'Original text';
  const document = createPlainBossNotesDocument(source);
  const values = fieldValues(document);

  expectConversionError(
    () => applyPlainBossNotesEdits(`${source} changed`, document.revision, values),
    'revision_conflict'
  );

  const missing = { ...values };
  delete missing[findField(document, 'Original text')];
  expectConversionError(
    () => applyPlainBossNotesEdits(source, document.revision, missing),
    'invalid_fields'
  );
  expectConversionError(
    () => applyPlainBossNotesEdits(source, document.revision, { ...values, unexpected: 'x' }),
    'invalid_fields'
  );

  expectConversionError(
    () =>
      applyPlainBossNotesEdits(source, document.revision, {
        ...values,
        [findField(document, 'Original text')]: 'Line one\nLine two'
      }),
    'invalid_value'
  );

  expectConversionError(
    () =>
      applyPlainBossNotesEdits(source, document.revision, {
        ...values,
        [findField(document, '')]: 'x'.repeat(MAX_BOSS_NOTES_LENGTH + 1)
      }),
    'too_large'
  );
});

test('an empty page can be safely created through the append field', () => {
  const document = createPlainBossNotesDocument('');
  const values = fieldValues(document);
  values[findField(document, '')] = 'First paragraph\n\nSecond paragraph';

  const result = applyPlainBossNotesEdits('', document.revision, values);
  assert.equal(result.notes, 'First paragraph\n\nSecond paragraph');
  assert.equal(result.changed, true);
});

test('preserves complex and malformed structures even when neighboring text changes', () => {
  const source = `Lead text <!-- hidden --> after comment
Before {{Nested|one={{Two|value=a||b}}}} after template
Citation<ref name="one">[[Hidden target|Hidden label]] {{Citation}}</ref> remains
Literal <nowiki>[[not a link]] {{not a template}}</nowiki> remains
 <code>preformatted</code> line
{| class="wikitable"
| style="width: 50%" | Visible || {{Cell|one=a||b}}
|-
! Header one !! Header two
|}
Broken [[File:Never-closes.jpg
[[Category:Ancients]]`;
  const document = createPlainBossNotesDocument(source);
  const values = fieldValues(document);
  values[findField(document, 'Lead text ')] = 'Updated lead ';
  values[findField(document, ' after template')] = ' after locked template';
  values[findField(document, 'preformatted')] = 'formatted sample';

  const result = applyPlainBossNotesEdits(source, document.revision, values);
  for (const protectedSource of [
    '<!-- hidden -->',
    '{{Nested|one={{Two|value=a||b}}}}',
    '<ref name="one">[[Hidden target|Hidden label]] {{Citation}}</ref>',
    '<nowiki>[[not a link]] {{not a template}}</nowiki>',
    ' <code>',
    '{{Cell|one=a||b}}',
    'Broken [[File:Never-closes.jpg',
    '[[Category:Ancients]]'
  ]) {
    assert.ok(result.notes.includes(protectedSource), protectedSource);
  }
  assert.match(result.notes, /^Updated lead <!-- hidden -->/);
  assert.match(result.notes, /\{\{Nested\|one=.*\}\} after locked template/);
  assert.match(result.notes, / <code>formatted sample<\/code> line/);
});

test('every readable field can be changed independently without changing other field values', () => {
  const document = createPlainBossNotesDocument(BLACKSMITH_FIXTURE);
  const originalValues = fieldValues(document);

  for (const [fieldId, originalValue] of Object.entries(originalValues)) {
    if (!originalValue) continue;
    const marker = `Changed ${fieldId}`;
    const result = applyPlainBossNotesEdits(BLACKSMITH_FIXTURE, document.revision, {
      ...originalValues,
      [fieldId]: marker
    });
    const convertedValues = fieldValues(result.document);
    assert.equal(convertedValues[fieldId], marker);
    for (const [otherId, otherValue] of Object.entries(originalValues)) {
      if (otherId !== fieldId) assert.equal(convertedValues[otherId], otherValue);
    }
  }
});
