-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `googleId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `nickname` VARCHAR(191) NULL,
    `admin` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_googleId_key`(`googleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Guild` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `defaultRaidStartTime` VARCHAR(5) NULL,
    `defaultRaidEndTime` VARCHAR(5) NULL,

    UNIQUE INDEX `Guild_name_key`(`name`),
    UNIQUE INDEX `Guild_slug_key`(`slug`),
    INDEX `Guild_createdById_fkey`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuildDiscordWebhook` (
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `webhookUrl` VARCHAR(512) NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT false,
    `usernameOverride` VARCHAR(120) NULL,
    `avatarUrl` VARCHAR(512) NULL,
    `mentionRoleId` VARCHAR(120) NULL,
    `eventSubscriptions` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `label` VARCHAR(120) NOT NULL DEFAULT 'Primary Webhook',
    `mentionSubscriptions` JSON NOT NULL,

    INDEX `GuildDiscordWebhook_guildId_idx`(`guildId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuildMembership` (
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('LEADER', 'OFFICER', 'RAID_LEADER', 'MEMBER', 'FRIENDS_FAMILY') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GuildMembership_userId_fkey`(`userId`),
    UNIQUE INDEX `GuildMembership_guildId_userId_key`(`guildId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuildApplication` (
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GuildApplication_userId_fkey`(`userId`),
    UNIQUE INDEX `GuildApplication_guildId_userId_key`(`guildId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Characters` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `class` ENUM('BARD', 'BEASTLORD', 'BERSERKER', 'CLERIC', 'DRUID', 'ENCHANTER', 'MAGICIAN', 'MONK', 'NECROMANCER', 'PALADIN', 'RANGER', 'ROGUE', 'SHADOWKNIGHT', 'SHAMAN', 'WARRIOR', 'WIZARD', 'UNKNOWN') NOT NULL,
    `archetype` ENUM('PRIEST', 'MELEE', 'CASTER', 'HYBRID') NULL,
    `userId` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NULL,
    `isMain` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Characters_name_key`(`name`),
    INDEX `Characters_guildId_fkey`(`guildId`),
    INDEX `Characters_userId_fkey`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RaidEvent` (
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `targetZones` JSON NOT NULL,
    `targetBosses` JSON NOT NULL,
    `notes` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,

    INDEX `RaidEvent_createdById_fkey`(`createdById`),
    INDEX `RaidEvent_guildId_fkey`(`guildId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuildLootParserSettings` (
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `patterns` JSON NOT NULL,
    `emoji` VARCHAR(16) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GuildLootParserSettings_guildId_key`(`guildId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RaidLootEvent` (
    `id` VARCHAR(191) NOT NULL,
    `raidId` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `looterName` VARCHAR(191) NOT NULL,
    `looterClass` VARCHAR(50) NULL,
    `eventTime` DATETIME(3) NULL,
    `emoji` VARCHAR(16) NULL,
    `note` VARCHAR(500) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RaidLootEvent_createdById_fkey`(`createdById`),
    INDEX `RaidLootEvent_guildId_idx`(`guildId`),
    INDEX `RaidLootEvent_raidId_idx`(`raidId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceEvent` (
    `id` VARCHAR(191) NOT NULL,
    `raidEventId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `snapshot` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `eventType` ENUM('LOG', 'START', 'END', 'RESTART') NOT NULL DEFAULT 'LOG',

    INDEX `AttendanceEvent_createdById_fkey`(`createdById`),
    INDEX `AttendanceEvent_raidEventId_fkey`(`raidEventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceRecord` (
    `id` VARCHAR(191) NOT NULL,
    `attendanceEventId` VARCHAR(191) NOT NULL,
    `characterId` VARCHAR(191) NULL,
    `characterName` VARCHAR(191) NOT NULL,
    `level` INTEGER NULL,
    `class` ENUM('BARD', 'BEASTLORD', 'BERSERKER', 'CLERIC', 'DRUID', 'ENCHANTER', 'MAGICIAN', 'MONK', 'NECROMANCER', 'PALADIN', 'RANGER', 'ROGUE', 'SHADOWKNIGHT', 'SHAMAN', 'WARRIOR', 'WIZARD', 'UNKNOWN') NULL,
    `groupNumber` INTEGER NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'BENCHED') NOT NULL DEFAULT 'PRESENT',
    `flags` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AttendanceRecord_attendanceEventId_fkey`(`attendanceEventId`),
    INDEX `AttendanceRecord_characterId_fkey`(`characterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Guild` ADD CONSTRAINT `Guild_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildDiscordWebhook` ADD CONSTRAINT `GuildDiscordWebhook_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildMembership` ADD CONSTRAINT `GuildMembership_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildMembership` ADD CONSTRAINT `GuildMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildApplication` ADD CONSTRAINT `GuildApplication_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildApplication` ADD CONSTRAINT `GuildApplication_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Characters` ADD CONSTRAINT `Characters_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Characters` ADD CONSTRAINT `Characters_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RaidEvent` ADD CONSTRAINT `RaidEvent_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RaidEvent` ADD CONSTRAINT `RaidEvent_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildLootParserSettings` ADD CONSTRAINT `GuildLootParserSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RaidLootEvent` ADD CONSTRAINT `RaidLootEvent_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RaidLootEvent` ADD CONSTRAINT `RaidLootEvent_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RaidLootEvent` ADD CONSTRAINT `RaidLootEvent_raidId_fkey` FOREIGN KEY (`raidId`) REFERENCES `RaidEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceEvent` ADD CONSTRAINT `AttendanceEvent_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceEvent` ADD CONSTRAINT `AttendanceEvent_raidEventId_fkey` FOREIGN KEY (`raidEventId`) REFERENCES `RaidEvent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceRecord` ADD CONSTRAINT `AttendanceRecord_attendanceEventId_fkey` FOREIGN KEY (`attendanceEventId`) REFERENCES `AttendanceEvent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceRecord` ADD CONSTRAINT `AttendanceRecord_characterId_fkey` FOREIGN KEY (`characterId`) REFERENCES `Characters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

