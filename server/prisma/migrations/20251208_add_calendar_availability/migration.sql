-- Create CalendarAvailability table for tracking user availability on calendar dates
CREATE TABLE `CalendarAvailability` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `guildId` VARCHAR(191) NOT NULL,
  `date` DATE NOT NULL,
  `status` ENUM('AVAILABLE', 'UNAVAILABLE') NOT NULL DEFAULT 'UNAVAILABLE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `CalendarAvailability_userId_guildId_date_key` (`userId`, `guildId`, `date`),
  INDEX `CalendarAvailability_guildId_idx` (`guildId`),
  INDEX `CalendarAvailability_userId_idx` (`userId`),
  INDEX `CalendarAvailability_guildId_date_idx` (`guildId`, `date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add foreign key constraints
ALTER TABLE `CalendarAvailability`
  ADD CONSTRAINT `CalendarAvailability_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE `CalendarAvailability`
  ADD CONSTRAINT `CalendarAvailability_guildId_fkey`
  FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
