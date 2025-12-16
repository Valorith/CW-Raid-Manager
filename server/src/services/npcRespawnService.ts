import { Prisma } from '@prisma/client';

import { prisma } from '../utils/prisma.js';

// Input types
export interface NpcDefinitionInput {
  npcName: string;
  zoneName?: string | null;
  respawnMinMinutes?: number | null;
  respawnMaxMinutes?: number | null;
  notes?: string | null;
  allaLink?: string | null;
  lootItems?: Array<{
    itemId?: number | null;
    itemName: string;
    itemIconId?: number | null;
    allaLink?: string | null;
  }>;
}

export interface NpcKillRecordInput {
  npcDefinitionId: string;
  killedAt: Date;
  killedByName?: string | null;
  killedById?: string | null;
  notes?: string | null;
}

export interface NpcSubscriptionInput {
  npcDefinitionId: string;
  notifyMinutes?: number;
  isEnabled?: boolean;
}

// Helper functions
function normalizeNpcName(name: string) {
  return name.trim().toLowerCase();
}

function normalizeAllaLink(input?: string | null) {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol;
}

// Type for formatted NPC definition
type NpcDefinitionWithRelations = Prisma.NpcDefinitionGetPayload<{
  include: { lootItems: true; killRecords: { orderBy: { killedAt: 'desc' }; take: 1 } };
}>;

function formatNpcDefinition(record: NpcDefinitionWithRelations) {
  const lastKill = record.killRecords[0] ?? null;

  return {
    id: record.id,
    guildId: record.guildId,
    npcName: record.npcName,
    zoneName: record.zoneName ?? null,
    respawnMinMinutes: record.respawnMinMinutes ?? null,
    respawnMaxMinutes: record.respawnMaxMinutes ?? null,
    notes: record.notes ?? null,
    allaLink: record.allaLink ?? null,
    createdById: record.createdById ?? null,
    createdByName: record.createdByName ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lootItems: record.lootItems.map((item) => ({
      id: item.id,
      itemId: item.itemId ?? null,
      itemName: item.itemName,
      itemIconId: item.itemIconId ?? null,
      allaLink: item.allaLink ?? null
    })),
    lastKill: lastKill
      ? {
          id: lastKill.id,
          killedAt: lastKill.killedAt,
          killedByName: lastKill.killedByName ?? null,
          killedById: lastKill.killedById ?? null,
          notes: lastKill.notes ?? null
        }
      : null
  };
}

type NpcKillRecordFull = Prisma.NpcKillRecordGetPayload<{
  include: { npcDefinition: true };
}>;

function formatKillRecord(record: NpcKillRecordFull) {
  return {
    id: record.id,
    guildId: record.guildId,
    npcDefinitionId: record.npcDefinitionId,
    npcName: record.npcDefinition.npcName,
    zoneName: record.npcDefinition.zoneName ?? null,
    respawnMinMinutes: record.npcDefinition.respawnMinMinutes ?? null,
    respawnMaxMinutes: record.npcDefinition.respawnMaxMinutes ?? null,
    killedAt: record.killedAt,
    killedByName: record.killedByName ?? null,
    killedById: record.killedById ?? null,
    notes: record.notes ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

// NPC Definition CRUD operations
export async function listNpcDefinitions(guildId: string) {
  const definitions = await prisma.npcDefinition.findMany({
    where: { guildId },
    include: {
      lootItems: true,
      killRecords: {
        orderBy: { killedAt: 'desc' },
        take: 1
      }
    },
    orderBy: { npcName: 'asc' }
  });
  return definitions.map(formatNpcDefinition);
}

export async function getNpcDefinition(guildId: string, npcDefinitionId: string) {
  const definition = await prisma.npcDefinition.findFirst({
    where: { guildId, id: npcDefinitionId },
    include: {
      lootItems: true,
      killRecords: {
        orderBy: { killedAt: 'desc' },
        take: 1
      }
    }
  });
  return definition ? formatNpcDefinition(definition) : null;
}

export async function getNpcDefinitionByName(guildId: string, npcName: string) {
  const normalized = normalizeNpcName(npcName);
  const definition = await prisma.npcDefinition.findFirst({
    where: { guildId, npcNameNormalized: normalized },
    include: {
      lootItems: true,
      killRecords: {
        orderBy: { killedAt: 'desc' },
        take: 1
      }
    }
  });
  return definition ? formatNpcDefinition(definition) : null;
}

export async function createNpcDefinition(
  guildId: string,
  creator: { userId: string; displayName: string },
  input: NpcDefinitionInput
) {
  const npcName = input.npcName.trim();
  if (!npcName) {
    throw new Error('NPC name is required.');
  }
  const normalized = normalizeNpcName(npcName);

  // Check for duplicates
  const existing = await prisma.npcDefinition.findFirst({
    where: { guildId, npcNameNormalized: normalized }
  });
  if (existing) {
    throw new Error('An NPC with this name already exists.');
  }

  const lootItems = (input.lootItems ?? []).map((item) => {
    const itemName = item.itemName.trim();
    if (!itemName) {
      throw new Error('Loot item name is required.');
    }
    return {
      itemId: item.itemId ?? null,
      itemName,
      itemIconId: item.itemIconId ?? null,
      allaLink: normalizeAllaLink(item.allaLink)
    };
  });

  const definitionId = await prisma.$transaction(async (tx) => {
    const record = await tx.npcDefinition.create({
      data: {
        guildId,
        npcName,
        npcNameNormalized: normalized,
        zoneName: input.zoneName?.trim() || null,
        respawnMinMinutes: input.respawnMinMinutes ?? null,
        respawnMaxMinutes: input.respawnMaxMinutes ?? null,
        notes: input.notes?.trim() || null,
        allaLink: normalizeAllaLink(input.allaLink),
        createdById: creator.userId,
        createdByName: creator.displayName
      }
    });

    if (lootItems.length > 0) {
      await tx.npcDefinitionLoot.createMany({
        data: lootItems.map((item) => ({
          npcDefinitionId: record.id,
          itemId: item.itemId,
          itemName: item.itemName,
          itemIconId: item.itemIconId,
          allaLink: item.allaLink
        }))
      });
    }

    return record.id;
  });

  const created = await prisma.npcDefinition.findUnique({
    where: { id: definitionId },
    include: {
      lootItems: true,
      killRecords: {
        orderBy: { killedAt: 'desc' },
        take: 1
      }
    }
  });

  if (!created) {
    throw new Error('NPC definition could not be found after creation.');
  }
  return formatNpcDefinition(created);
}

export async function updateNpcDefinition(
  guildId: string,
  npcDefinitionId: string,
  input: NpcDefinitionInput
) {
  const existing = await prisma.npcDefinition.findFirst({
    where: { guildId, id: npcDefinitionId }
  });
  if (!existing) {
    throw new Error('NPC definition not found.');
  }

  const npcName = input.npcName.trim();
  if (!npcName) {
    throw new Error('NPC name is required.');
  }
  const normalized = normalizeNpcName(npcName);

  // Check for duplicates if name changed
  if (normalized !== existing.npcNameNormalized) {
    const duplicate = await prisma.npcDefinition.findFirst({
      where: { guildId, npcNameNormalized: normalized, id: { not: npcDefinitionId } }
    });
    if (duplicate) {
      throw new Error('An NPC with this name already exists.');
    }
  }

  const lootItems = (input.lootItems ?? []).map((item) => {
    const itemName = item.itemName.trim();
    if (!itemName) {
      throw new Error('Loot item name is required.');
    }
    return {
      itemId: item.itemId ?? null,
      itemName,
      itemIconId: item.itemIconId ?? null,
      allaLink: normalizeAllaLink(item.allaLink)
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.npcDefinition.update({
      where: { id: npcDefinitionId },
      data: {
        npcName,
        npcNameNormalized: normalized,
        zoneName: input.zoneName?.trim() || null,
        respawnMinMinutes: input.respawnMinMinutes ?? null,
        respawnMaxMinutes: input.respawnMaxMinutes ?? null,
        notes: input.notes?.trim() || null,
        allaLink: normalizeAllaLink(input.allaLink)
      }
    });

    // Replace loot items
    await tx.npcDefinitionLoot.deleteMany({ where: { npcDefinitionId } });
    if (lootItems.length > 0) {
      await tx.npcDefinitionLoot.createMany({
        data: lootItems.map((item) => ({
          npcDefinitionId,
          itemId: item.itemId,
          itemName: item.itemName,
          itemIconId: item.itemIconId,
          allaLink: item.allaLink
        }))
      });
    }
  });

  const updated = await prisma.npcDefinition.findUnique({
    where: { id: npcDefinitionId },
    include: {
      lootItems: true,
      killRecords: {
        orderBy: { killedAt: 'desc' },
        take: 1
      }
    }
  });

  if (!updated) {
    throw new Error('NPC definition could not be found after update.');
  }
  return formatNpcDefinition(updated);
}

export async function deleteNpcDefinition(guildId: string, npcDefinitionId: string) {
  const existing = await prisma.npcDefinition.findFirst({
    where: { guildId, id: npcDefinitionId }
  });
  if (!existing) {
    return;
  }
  await prisma.npcDefinition.delete({ where: { id: npcDefinitionId } });
}

// NPC Kill Record operations
export async function listKillRecords(guildId: string, limit = 50) {
  const records = await prisma.npcKillRecord.findMany({
    where: { guildId },
    include: { npcDefinition: true },
    orderBy: { killedAt: 'desc' },
    take: limit
  });
  return records.map(formatKillRecord);
}

export async function listKillRecordsForNpc(guildId: string, npcDefinitionId: string, limit = 20) {
  const records = await prisma.npcKillRecord.findMany({
    where: { guildId, npcDefinitionId },
    include: { npcDefinition: true },
    orderBy: { killedAt: 'desc' },
    take: limit
  });
  return records.map(formatKillRecord);
}

export async function createKillRecord(
  guildId: string,
  input: NpcKillRecordInput
) {
  // Verify NPC definition exists and belongs to guild
  const definition = await prisma.npcDefinition.findFirst({
    where: { guildId, id: input.npcDefinitionId }
  });
  if (!definition) {
    throw new Error('NPC definition not found.');
  }

  const record = await prisma.npcKillRecord.create({
    data: {
      guildId,
      npcDefinitionId: input.npcDefinitionId,
      killedAt: input.killedAt,
      killedByName: input.killedByName?.trim() || null,
      killedById: input.killedById || null,
      notes: input.notes?.trim() || null
    },
    include: { npcDefinition: true }
  });

  return formatKillRecord(record);
}

export async function deleteKillRecord(guildId: string, killRecordId: string) {
  const existing = await prisma.npcKillRecord.findFirst({
    where: { guildId, id: killRecordId }
  });
  if (!existing) {
    return;
  }
  await prisma.npcKillRecord.delete({ where: { id: killRecordId } });
}

// Subscription operations
export async function getUserSubscriptions(userId: string, guildId: string) {
  const subscriptions = await prisma.npcRespawnSubscription.findMany({
    where: {
      userId,
      npcDefinition: { guildId }
    },
    include: {
      npcDefinition: {
        include: {
          lootItems: true,
          killRecords: {
            orderBy: { killedAt: 'desc' },
            take: 1
          }
        }
      }
    }
  });

  return subscriptions.map((sub) => ({
    id: sub.id,
    npcDefinitionId: sub.npcDefinitionId,
    notifyMinutes: sub.notifyMinutes,
    isEnabled: sub.isEnabled,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
    npcDefinition: formatNpcDefinition(sub.npcDefinition)
  }));
}

export async function upsertSubscription(userId: string, input: NpcSubscriptionInput) {
  const existing = await prisma.npcRespawnSubscription.findUnique({
    where: {
      npcDefinitionId_userId: {
        npcDefinitionId: input.npcDefinitionId,
        userId
      }
    }
  });

  if (existing) {
    return prisma.npcRespawnSubscription.update({
      where: { id: existing.id },
      data: {
        notifyMinutes: input.notifyMinutes ?? existing.notifyMinutes,
        isEnabled: input.isEnabled ?? existing.isEnabled
      }
    });
  }

  return prisma.npcRespawnSubscription.create({
    data: {
      npcDefinitionId: input.npcDefinitionId,
      userId,
      notifyMinutes: input.notifyMinutes ?? 5,
      isEnabled: input.isEnabled ?? true
    }
  });
}

export async function deleteSubscription(userId: string, npcDefinitionId: string) {
  const existing = await prisma.npcRespawnSubscription.findUnique({
    where: {
      npcDefinitionId_userId: {
        npcDefinitionId,
        userId
      }
    }
  });
  if (existing) {
    await prisma.npcRespawnSubscription.delete({ where: { id: existing.id } });
  }
}

// Record a kill for a tracked NPC (called automatically from raid NPC kill detection)
// Only records if the NPC is already configured in the respawn tracker
export async function recordKillForTrackedNpc(
  guildId: string,
  input: {
    npcName: string;
    npcNameNormalized: string;
    killedAt: Date;
    killedByName?: string | null;
  }
) {
  // Find the NPC definition by normalized name
  const definition = await prisma.npcDefinition.findFirst({
    where: {
      guildId,
      npcNameNormalized: input.npcNameNormalized
    }
  });

  if (!definition) {
    // NPC is not tracked in the respawn tracker, skip
    return null;
  }

  // Check if we already have a kill record for this exact time
  // to avoid duplicates from multiple log uploads
  const existingKill = await prisma.npcKillRecord.findFirst({
    where: {
      guildId,
      npcDefinitionId: definition.id,
      killedAt: input.killedAt
    }
  });

  if (existingKill) {
    // Already recorded this kill
    return existingKill;
  }

  // Create the kill record
  const record = await prisma.npcKillRecord.create({
    data: {
      guildId,
      npcDefinitionId: definition.id,
      killedAt: input.killedAt,
      killedByName: input.killedByName?.trim() || null,
      killedById: null,
      notes: 'Auto-recorded from raid log'
    }
  });

  return record;
}

// Get respawn tracker data - combines NPC definitions with latest kills and respawn calculations
export async function getRespawnTrackerData(guildId: string) {
  const definitions = await prisma.npcDefinition.findMany({
    where: { guildId },
    include: {
      lootItems: true,
      killRecords: {
        orderBy: { killedAt: 'desc' },
        take: 1
      }
    },
    orderBy: { npcName: 'asc' }
  });

  return definitions.map((def) => {
    const lastKill = def.killRecords[0] ?? null;
    const now = new Date();

    let respawnStatus: 'unknown' | 'up' | 'window' | 'down' = 'unknown';
    let respawnMinTime: Date | null = null;
    let respawnMaxTime: Date | null = null;
    let progressPercent: number | null = null;

    if (lastKill && def.respawnMinMinutes !== null) {
      const killedTime = new Date(lastKill.killedAt).getTime();
      respawnMinTime = new Date(killedTime + def.respawnMinMinutes * 60 * 1000);

      if (def.respawnMaxMinutes !== null) {
        respawnMaxTime = new Date(killedTime + def.respawnMaxMinutes * 60 * 1000);
      }

      const totalWindowMs = (def.respawnMaxMinutes ?? def.respawnMinMinutes) * 60 * 1000;
      const elapsedMs = now.getTime() - killedTime;
      progressPercent = Math.min(100, Math.max(0, (elapsedMs / totalWindowMs) * 100));

      if (now >= (respawnMaxTime ?? respawnMinTime)) {
        respawnStatus = 'up';
      } else if (now >= respawnMinTime) {
        respawnStatus = 'window';
      } else {
        respawnStatus = 'down';
      }
    }

    return {
      ...formatNpcDefinition(def),
      respawnStatus,
      respawnMinTime,
      respawnMaxTime,
      progressPercent
    };
  });
}
