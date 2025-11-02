-- Add optional itemId and itemIconId columns to RaidLootEvent to store EQ item metadata
ALTER TABLE `RaidLootEvent`
  ADD COLUMN `itemId` INT NULL,
  ADD COLUMN `itemIconId` INT NULL;

