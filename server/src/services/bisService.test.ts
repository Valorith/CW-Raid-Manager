import assert from 'node:assert/strict';
import test from 'node:test';

import { CharacterClass, type Prisma } from '@prisma/client';

import { buildBisVoteUpsert, nominateResolvedBisCandidate } from './bisService.js';

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

test('allows a newly nominated item to replace an existing vote in the same slot', async () => {
  const oldCandidateId = 'candidate-old';
  const newCandidate = {
    id: 'candidate-new',
    characterClass: CharacterClass.WARRIOR,
    slotId: 13
  };
  let voteUpsert: Prisma.BisVoteUpsertArgs | null = null;
  let candidateCleanup: Prisma.BisSlotCandidateDeleteManyArgs | null = null;

  const tx = {
    bisVote: {
      findUnique: async () => ({ candidateId: oldCandidateId }),
      upsert: async (args: Prisma.BisVoteUpsertArgs) => {
        voteUpsert = args;
        return {};
      }
    },
    bisSlotCandidate: {
      findUnique: async () => null,
      findFirst: async () => ({ itemName: 'Previously Submitted Item', slotId: 13 }),
      create: async () => newCandidate,
      deleteMany: async (args: Prisma.BisSlotCandidateDeleteManyArgs) => {
        candidateCleanup = args;
        return { count: 1 };
      }
    }
  } as unknown as Prisma.TransactionClient;

  const candidate = await nominateResolvedBisCandidate(
    tx,
    'user-1',
    {
      characterClass: CharacterClass.WARRIOR,
      slotId: 13
    },
    {
      itemId: 1002,
      itemName: 'Replacement Item',
      itemIconId: 42
    }
  );

  assert.equal(candidate.id, newCandidate.id);
  assert.deepEqual(voteUpsert, buildBisVoteUpsert('user-1', newCandidate));
  assert.deepEqual(candidateCleanup, {
    where: {
      id: oldCandidateId,
      submittedById: 'user-1',
      votes: {
        none: {}
      }
    }
  });
});
