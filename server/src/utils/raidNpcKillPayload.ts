import { z } from 'zod';

const killSchema = z.object({
  npcName: z.string().trim().min(2).max(191),
  occurredAt: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .refine((value) => !Number.isNaN(value.getTime()), 'Invalid kill timestamp.'),
  killerName: z.string().min(1).max(191).nullish(),
  rawLine: z.string().max(500).nullish(),
  zoneName: z.string().max(191).nullish(),
  inferred: z.boolean().nullish()
});

// Existing clients send explicit null for special encounters.
export const raidNpcKillAppendSchema = z.object({ kills: z.array(killSchema).max(500) });
export const raidNpcKillImportSchema = z.object({ kills: z.array(killSchema).min(1).max(5000) });
