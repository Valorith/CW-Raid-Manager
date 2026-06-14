-- Add self-referential parentId to TestChangeChecklistItem so a checklist item can be a
-- "sub-checklist" group containing child items. Children reference their parent group;
-- ON DELETE SET NULL keeps the table safe from MySQL self-referential cascade quirks
-- (group deletion removes children explicitly in application code).
ALTER TABLE `TestChangeChecklistItem` ADD COLUMN `parentId` VARCHAR(191) NULL;
CREATE INDEX `TestChangeChecklistItem_parentId_idx` ON `TestChangeChecklistItem`(`parentId`);
ALTER TABLE `TestChangeChecklistItem`
  ADD CONSTRAINT `TestChangeChecklistItem_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `TestChangeChecklistItem`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
