import assert from 'node:assert/strict';
import test from 'node:test';

import { CharacterClass } from '@prisma/client';

import { buildBisVoteUpsert } from './bisService.js';

test('replaces the existing BiS vote for the same user, class, and slot', () => {
  const previousVote = buildBisVoteUpsert('user-1', {
    id: 'candidate-old',
    characterClass: CharacterClass.WARRIOR,
    slotId: 13
  });
  const replacementVote = buildBisVoteUpsert('user-1', {
    id: 'candidate-new',
    characterClass: CharacterClass.WARRIOR,
    slotId: 13
  });

  assert.deepEqual(
    replacementVote.where,
    previousVote.where,
    'both items must target the same one-vote-per-slot record'
  );
  assert.deepEqual(replacementVote.update, {
    candidateId: 'candidate-new'
  });
  assert.deepEqual(replacementVote.create, {
    candidateId: 'candidate-new',
    userId: 'user-1',
    characterClass: CharacterClass.WARRIOR,
    slotId: 13
  });
});
