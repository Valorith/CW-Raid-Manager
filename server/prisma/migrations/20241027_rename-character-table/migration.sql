-- Drop existing foreign keys referencing the Character table
ALTER TABLE `AttendanceRecord` DROP FOREIGN KEY `AttendanceRecord_characterId_fkey`;
ALTER TABLE `Character` DROP FOREIGN KEY `Character_guildId_fkey`;
ALTER TABLE `Character` DROP FOREIGN KEY `Character_userId_fkey`;

-- Rename the table to avoid reserved keyword conflicts
RENAME TABLE `Character` TO `Characters`;

-- Rename unique index to match Prisma's expected naming convention
ALTER TABLE `Characters` RENAME INDEX `Character_name_key` TO `Characters_name_key`;

-- Recreate foreign keys against the renamed table
ALTER TABLE `Characters`
  ADD CONSTRAINT `Characters_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Characters_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AttendanceRecord`
  ADD CONSTRAINT `AttendanceRecord_characterId_fkey` FOREIGN KEY (`characterId`) REFERENCES `Characters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
