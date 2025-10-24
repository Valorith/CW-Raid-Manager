-- CreateTable
CREATE TABLE `GuildApplication` (
  `id` VARCHAR(191) NOT NULL,
  `guildId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `GuildApplication_guildId_userId_key` ON `GuildApplication`(`guildId`, `userId`);

-- AddForeignKey
ALTER TABLE `GuildApplication` ADD CONSTRAINT `GuildApplication_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildApplication` ADD CONSTRAINT `GuildApplication_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
