-- CreateTable
CREATE TABLE `FitrepTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `version` VARCHAR(50) NOT NULL DEFAULT '1.0',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `fields` JSON NOT NULL,
    `metadata` JSON NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FitrepTemplate_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FitrepReport` (
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `rateeUserId` VARCHAR(191) NULL,
    `rateeCharacterId` VARCHAR(191) NULL,
    `rateeName` VARCHAR(191) NOT NULL,
    `rateeRank` VARCHAR(191) NULL,
    `periodStart` DATE NULL,
    `periodEnd` DATE NULL,
    `raterUserId` VARCHAR(191) NULL,
    `raterCharacterId` VARCHAR(191) NULL,
    `raterName` VARCHAR(191) NOT NULL,
    `raterRank` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED') NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(191) NULL,
    `formData` JSON NOT NULL,
    `aiPrompt` TEXT NULL,
    `aiGeneratedData` JSON NULL,
    `exampleReports` JSON NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FitrepReport_guildId_idx`(`guildId`),
    INDEX `FitrepReport_rateeUserId_idx`(`rateeUserId`),
    INDEX `FitrepReport_raterUserId_idx`(`raterUserId`),
    INDEX `FitrepReport_status_idx`(`status`),
    INDEX `FitrepReport_periodStart_periodEnd_idx`(`periodStart`, `periodEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FitrepExample` (
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `filePath` VARCHAR(512) NULL,
    `fileName` VARCHAR(255) NULL,
    `fileSize` INTEGER NULL,
    `mimeType` VARCHAR(100) NULL,
    `extractedData` JSON NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FitrepExample_guildId_idx`(`guildId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FitrepAiSession` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `exampleIds` JSON NOT NULL,
    `generatedData` JSON NULL,
    `model` VARCHAR(100) NULL,
    `tokensUsed` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FitrepAiSession_reportId_idx`(`reportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FitrepReport` ADD CONSTRAINT `FitrepReport_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepReport` ADD CONSTRAINT `FitrepReport_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `FitrepTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepReport` ADD CONSTRAINT `FitrepReport_rateeUserId_fkey` FOREIGN KEY (`rateeUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepReport` ADD CONSTRAINT `FitrepReport_rateeCharacterId_fkey` FOREIGN KEY (`rateeCharacterId`) REFERENCES `Character`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepReport` ADD CONSTRAINT `FitrepReport_raterUserId_fkey` FOREIGN KEY (`raterUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepReport` ADD CONSTRAINT `FitrepReport_raterCharacterId_fkey` FOREIGN KEY (`raterCharacterId`) REFERENCES `Character`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepReport` ADD CONSTRAINT `FitrepReport_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepReport` ADD CONSTRAINT `FitrepReport_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepExample` ADD CONSTRAINT `FitrepExample_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepExample` ADD CONSTRAINT `FitrepExample_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `FitrepTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepExample` ADD CONSTRAINT `FitrepExample_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FitrepAiSession` ADD CONSTRAINT `FitrepAiSession_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `FitrepReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
