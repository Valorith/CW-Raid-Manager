-- AlterTable: Add guide field to User table
ALTER TABLE `User` ADD COLUMN `guide` BOOLEAN NULL DEFAULT false;
