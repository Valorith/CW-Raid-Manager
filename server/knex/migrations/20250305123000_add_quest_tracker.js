/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`QuestBlueprint\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`guildId\` VARCHAR(191) NOT NULL,
        \`createdById\` VARCHAR(191) NOT NULL,
        \`title\` VARCHAR(191) NOT NULL,
        \`summary\` VARCHAR(500) NULL,
        \`visibility\` ENUM('GUILD','LINK_ONLY','PRIVATE') NOT NULL DEFAULT 'GUILD',
        \`isArchived\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`metadata\` JSON NOT NULL DEFAULT (json_object()),
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`QuestBlueprint_guildId_idx\`(\`guildId\`),
        INDEX \`QuestBlueprint_createdById_idx\`(\`createdById\`),
        CONSTRAINT \`QuestBlueprint_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`QuestBlueprint_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`QuestNode\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`blueprintId\` VARCHAR(191) NOT NULL,
        \`title\` VARCHAR(191) NOT NULL,
        \`description\` VARCHAR(1000) NULL,
        \`nodeType\` ENUM('DELIVER','KILL','LOOT','SPEAK_WITH','EXPLORE','TRADESKILL','FISH','FORAGE','USE','TOUCH','GIVE_CASH') NOT NULL,
        \`requirements\` JSON NOT NULL DEFAULT (json_object()),
        \`metadata\` JSON NOT NULL DEFAULT (json_object()),
        \`positionX\` INT NOT NULL DEFAULT 0,
        \`positionY\` INT NOT NULL DEFAULT 0,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`QuestNode_blueprintId_idx\`(\`blueprintId\`),
        INDEX \`QuestNode_nodeType_idx\`(\`nodeType\`),
        CONSTRAINT \`QuestNode_blueprintId_fkey\` FOREIGN KEY (\`blueprintId\`) REFERENCES \`QuestBlueprint\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`QuestNodeLink\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`blueprintId\` VARCHAR(191) NOT NULL,
        \`parentNodeId\` VARCHAR(191) NOT NULL,
        \`childNodeId\` VARCHAR(191) NOT NULL,
        \`conditions\` JSON NOT NULL DEFAULT (json_object()),
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`QuestNodeLink_blueprintId_idx\`(\`blueprintId\`),
        INDEX \`QuestNodeLink_childNodeId_idx\`(\`childNodeId\`),
        UNIQUE INDEX \`QuestNodeLink_parentNodeId_childNodeId_key\`(\`parentNodeId\`, \`childNodeId\`),
        CONSTRAINT \`QuestNodeLink_blueprintId_fkey\` FOREIGN KEY (\`blueprintId\`) REFERENCES \`QuestBlueprint\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`QuestNodeLink_parentNodeId_fkey\` FOREIGN KEY (\`parentNodeId\`) REFERENCES \`QuestNode\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`QuestNodeLink_childNodeId_fkey\` FOREIGN KEY (\`childNodeId\`) REFERENCES \`QuestNode\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`QuestAssignment\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`blueprintId\` VARCHAR(191) NOT NULL,
        \`guildId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`status\` ENUM('ACTIVE','COMPLETED','CANCELLED','PAUSED') NOT NULL DEFAULT 'ACTIVE',
        \`startedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`completedAt\` DATETIME(3) NULL,
        \`cancelledAt\` DATETIME(3) NULL,
        \`lastProgressAt\` DATETIME(3) NULL,
        \`progressSummary\` JSON NOT NULL DEFAULT (json_object()),
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`QuestAssignment_guildId_idx\`(\`guildId\`),
        INDEX \`QuestAssignment_userId_idx\`(\`userId\`),
        INDEX \`QuestAssignment_blueprintId_idx\`(\`blueprintId\`),
        CONSTRAINT \`QuestAssignment_blueprintId_fkey\` FOREIGN KEY (\`blueprintId\`) REFERENCES \`QuestBlueprint\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`QuestAssignment_guildId_fkey\` FOREIGN KEY (\`guildId\`) REFERENCES \`Guild\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`QuestAssignment_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    await trx.schema.raw(`
      CREATE TABLE IF NOT EXISTS \`QuestNodeProgress\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`assignmentId\` VARCHAR(191) NOT NULL,
        \`nodeId\` VARCHAR(191) NOT NULL,
        \`status\` ENUM('NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED') NOT NULL DEFAULT 'NOT_STARTED',
        \`progressCount\` INT NOT NULL DEFAULT 0,
        \`targetCount\` INT NOT NULL DEFAULT 0,
        \`notes\` VARCHAR(500) NULL,
        \`startedAt\` DATETIME(3) NULL,
        \`completedAt\` DATETIME(3) NULL,
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`QuestNodeProgress_assignment_node_unique\`(\`assignmentId\`, \`nodeId\`),
        INDEX \`QuestNodeProgress_nodeId_idx\`(\`nodeId\`),
        CONSTRAINT \`QuestNodeProgress_assignmentId_fkey\` FOREIGN KEY (\`assignmentId\`) REFERENCES \`QuestAssignment\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`QuestNodeProgress_nodeId_fkey\` FOREIGN KEY (\`nodeId\`) REFERENCES \`QuestNode\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  });
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.raw('DROP TABLE IF EXISTS \`QuestNodeProgress\`;');
    await trx.schema.raw('DROP TABLE IF EXISTS \`QuestAssignment\`;');
    await trx.schema.raw('DROP TABLE IF EXISTS \`QuestNodeLink\`;');
    await trx.schema.raw('DROP TABLE IF EXISTS \`QuestNode\`;');
    await trx.schema.raw('DROP TABLE IF EXISTS \`QuestBlueprint\`;');
  });
}
