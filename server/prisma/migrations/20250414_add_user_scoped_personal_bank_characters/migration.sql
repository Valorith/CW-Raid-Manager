-- Scope personal bank characters to the creating user.
ALTER TABLE `GuildBankCharacter`
  ADD COLUMN `userId` VARCHAR(191) NULL AFTER `guildId`;

ALTER TABLE `GuildBankCharacter`
  ADD INDEX `GuildBankCharacter_userId_idx` (`userId`);

ALTER TABLE `GuildBankCharacter`
  DROP INDEX `GuildBankCharacter_guildId_normalizedName_key`,
  ADD UNIQUE INDEX `GuildBankCharacter_guildId_normalizedName_isPersonal_userId_key`
    (`guildId`, `normalizedName`, `isPersonal`, `userId`);

ALTER TABLE `GuildBankCharacter`
  ADD CONSTRAINT `GuildBankCharacter_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
