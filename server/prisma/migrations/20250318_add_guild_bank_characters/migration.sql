-- Track guild bank character aliases for each guild
CREATE TABLE `GuildBankCharacter` (
  `id` VARCHAR(191) NOT NULL,
  `guildId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `normalizedName` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `GuildBankCharacter_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX `GuildBankCharacter_guildId_normalizedName_key` ON `GuildBankCharacter`(`guildId`, `normalizedName`);
CREATE INDEX `GuildBankCharacter_guildId_idx` ON `GuildBankCharacter`(`guildId`);
