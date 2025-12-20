-- Add zoneName column to track which zone NPC kills occurred in
ALTER TABLE `RaidNpcKillEvent` ADD COLUMN `zoneName` VARCHAR(191) NULL;
