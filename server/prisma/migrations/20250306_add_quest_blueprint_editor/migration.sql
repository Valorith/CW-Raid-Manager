ALTER TABLE `QuestBlueprint`
  ADD COLUMN `lastEditedById` VARCHAR(191) NULL AFTER `metadata`,
  ADD COLUMN `lastEditedByName` VARCHAR(191) NULL AFTER `lastEditedById`;
