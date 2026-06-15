ALTER TABLE `TestChangeChecklistItem`
  ADD COLUMN `shared` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `sharedCompletedAt` DATETIME(3) NULL,
  ADD COLUMN `sharedCompletedById` VARCHAR(191) NULL;

CREATE INDEX `TestChangeChecklistItem_sharedCompletedById_idx`
  ON `TestChangeChecklistItem`(`sharedCompletedById`);

ALTER TABLE `TestChangeChecklistItem`
  ADD CONSTRAINT `TestChangeChecklistItem_sharedCompletedById_fkey`
  FOREIGN KEY (`sharedCompletedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
