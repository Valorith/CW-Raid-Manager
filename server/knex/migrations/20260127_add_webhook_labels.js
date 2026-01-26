/**
 * Add labels/tags system for webhook messages.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Create label definitions table
  const hasLabelTable = await knex.schema.hasTable('WebhookMessageLabel');
  if (!hasLabelTable) {
    await knex.schema.raw(`
      CREATE TABLE \`WebhookMessageLabel\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(50) NOT NULL,
        \`color\` VARCHAR(7) NOT NULL,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`WebhookMessageLabel_name_key\` (\`name\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  // Create message-to-label assignment junction table
  const hasAssignmentTable = await knex.schema.hasTable('WebhookMessageLabelAssignment');
  if (!hasAssignmentTable) {
    await knex.schema.raw(`
      CREATE TABLE \`WebhookMessageLabelAssignment\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`messageId\` VARCHAR(191) NOT NULL,
        \`labelId\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`WebhookMessageLabelAssignment_messageId_labelId_key\` (\`messageId\`, \`labelId\`),
        INDEX \`WebhookMessageLabelAssignment_messageId_idx\` (\`messageId\`),
        INDEX \`WebhookMessageLabelAssignment_labelId_idx\` (\`labelId\`),
        CONSTRAINT \`WebhookMessageLabelAssignment_messageId_fkey\` FOREIGN KEY (\`messageId\`) REFERENCES \`InboundWebhookMessage\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`WebhookMessageLabelAssignment_labelId_fkey\` FOREIGN KEY (\`labelId\`) REFERENCES \`WebhookMessageLabel\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasAssignmentTable = await knex.schema.hasTable('WebhookMessageLabelAssignment');
  if (hasAssignmentTable) {
    await knex.schema.dropTable('WebhookMessageLabelAssignment');
  }

  const hasLabelTable = await knex.schema.hasTable('WebhookMessageLabel');
  if (hasLabelTable) {
    await knex.schema.dropTable('WebhookMessageLabel');
  }
}
