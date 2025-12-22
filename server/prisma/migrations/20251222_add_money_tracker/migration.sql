-- CreateTable
CREATE TABLE `MoneyTrackerSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'singleton',
    `autoSnapshotEnabled` BOOLEAN NOT NULL DEFAULT false,
    `snapshotHour` INTEGER NOT NULL DEFAULT 3,
    `snapshotMinute` INTEGER NOT NULL DEFAULT 0,
    `lastSnapshotAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MoneySnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `snapshotDate` DATE NOT NULL,
    `totalPlatinum` BIGINT NOT NULL DEFAULT 0,
    `totalGold` BIGINT NOT NULL DEFAULT 0,
    `totalSilver` BIGINT NOT NULL DEFAULT 0,
    `totalCopper` BIGINT NOT NULL DEFAULT 0,
    `totalPlatinumBank` BIGINT NOT NULL DEFAULT 0,
    `totalGoldBank` BIGINT NOT NULL DEFAULT 0,
    `totalSilverBank` BIGINT NOT NULL DEFAULT 0,
    `totalCopperBank` BIGINT NOT NULL DEFAULT 0,
    `totalPlatinumCursor` BIGINT NOT NULL DEFAULT 0,
    `totalGoldCursor` BIGINT NOT NULL DEFAULT 0,
    `totalSilverCursor` BIGINT NOT NULL DEFAULT 0,
    `totalCopperCursor` BIGINT NOT NULL DEFAULT 0,
    `totalPlatinumEquivalent` BIGINT NOT NULL DEFAULT 0,
    `totalSharedPlatinum` BIGINT NOT NULL DEFAULT 0,
    `totalGuildBankPlatinum` BIGINT NOT NULL DEFAULT 0,
    `topCharacters` JSON NOT NULL DEFAULT (json_array()),
    `topGuildBanks` JSON NULL,
    `characterCount` INTEGER NOT NULL DEFAULT 0,
    `sharedBankCount` INTEGER NOT NULL DEFAULT 0,
    `guildBankCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(191) NULL,

    INDEX `MoneySnapshot_snapshotDate_idx`(`snapshotDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
