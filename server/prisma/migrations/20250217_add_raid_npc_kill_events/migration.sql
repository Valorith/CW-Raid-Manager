-- Create table for tracking NPC kill events per raid
CREATE TABLE `RaidNpcKillEvent` (
  `id` VARCHAR(191) NOT NULL,
  `raidId` VARCHAR(191) NOT NULL,
  `guildId` VARCHAR(191) NOT NULL,
  `npcName` VARCHAR(191) NOT NULL,
  `npcNameNormalized` VARCHAR(191) NOT NULL,
  `killerName` VARCHAR(191) NULL,
  `occurredAt` DATETIME(3) NOT NULL,
  `logSignature` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `RaidNpcKillEvent_signature_idx` ON `RaidNpcKillEvent`(`raidId`, `logSignature`);
CREATE INDEX `RaidNpcKillEvent_raid_idx` ON `RaidNpcKillEvent`(`raidId`);
CREATE INDEX `RaidNpcKillEvent_guild_idx` ON `RaidNpcKillEvent`(`guildId`);
CREATE INDEX `RaidNpcKillEvent_raid_npc_idx` ON `RaidNpcKillEvent`(`raidId`, `npcNameNormalized`);

ALTER TABLE `RaidNpcKillEvent`
  ADD CONSTRAINT `RaidNpcKillEvent_raidId_fkey`
    FOREIGN KEY (`raidId`) REFERENCES `RaidEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `RaidNpcKillEvent`
  ADD CONSTRAINT `RaidNpcKillEvent_guildId_fkey`
    FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
