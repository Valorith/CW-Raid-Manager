-- Add canceledAt column to RaidEvent table for tracking canceled raids
ALTER TABLE `RaidEvent` ADD COLUMN `canceledAt` DATETIME(3) NULL;
