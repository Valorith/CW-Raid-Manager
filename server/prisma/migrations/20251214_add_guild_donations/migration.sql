-- CreateEnum (only if not exists)
-- Note: MySQL doesn't have native ENUM types at the schema level, Prisma handles this as VARCHAR

-- CreateTable
CREATE TABLE `GuildDonation` (
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `raidId` VARCHAR(191) NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `itemId` INTEGER NULL,
    `itemIconId` INTEGER NULL,
    `donatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('PENDING', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `rejectedById` VARCHAR(191) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GuildDonation_guildId_idx`(`guildId`),
    INDEX `GuildDonation_guildId_status_idx`(`guildId`, `status`),
    INDEX `GuildDonation_raidId_idx`(`raidId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GuildDonation` ADD CONSTRAINT `GuildDonation_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildDonation` ADD CONSTRAINT `GuildDonation_raidId_fkey` FOREIGN KEY (`raidId`) REFERENCES `RaidEvent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildDonation` ADD CONSTRAINT `GuildDonation_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
