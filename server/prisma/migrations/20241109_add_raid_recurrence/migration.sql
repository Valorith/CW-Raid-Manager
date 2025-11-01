-- Add recurrence support for raid events.

CREATE TABLE `RaidEventSeries` (
  `id` VARCHAR(191) NOT NULL,
  `guildId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `frequency` ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL,
  `interval` INT NOT NULL DEFAULT 1,
  `endDate` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RaidEvent` ADD COLUMN `recurrenceSeriesId` VARCHAR(191) NULL;

CREATE INDEX `RaidEvent_recurrenceSeriesId_idx` ON `RaidEvent`(`recurrenceSeriesId`);
CREATE INDEX `RaidEventSeries_guildId_idx` ON `RaidEventSeries`(`guildId`);
CREATE INDEX `RaidEventSeries_createdById_idx` ON `RaidEventSeries`(`createdById`);

ALTER TABLE `RaidEvent`
  ADD CONSTRAINT `RaidEvent_recurrenceSeriesId_fkey`
    FOREIGN KEY (`recurrenceSeriesId`) REFERENCES `RaidEventSeries`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `RaidEventSeries`
  ADD CONSTRAINT `RaidEventSeries_guildId_fkey`
    FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `RaidEventSeries`
  ADD CONSTRAINT `RaidEventSeries_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
