CREATE TABLE IF NOT EXISTS `GuildLootParserSettings` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `guildId` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `patterns` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  `emoji` VARCHAR(16) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GuildLootParserSettings_guildId_key`(`guildId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `GuildLootParserSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `RaidLootEvent` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `raidId` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `guildId` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemName` VARCHAR(191) NOT NULL,
  `looterName` VARCHAR(191) NOT NULL,
  `looterClass` VARCHAR(50) NULL,
  `eventTime` DATETIME(3) NULL,
  `emoji` VARCHAR(16) NULL,
  `note` VARCHAR(500) NULL,
  `createdById` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `RaidLootEvent_raidId_idx`(`raidId`),
  INDEX `RaidLootEvent_guildId_idx`(`guildId`),
  CONSTRAINT `RaidLootEvent_raidId_fkey` FOREIGN KEY (`raidId`) REFERENCES `RaidEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `RaidLootEvent_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `RaidLootEvent_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);
