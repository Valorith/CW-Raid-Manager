const changeStatuses = [
  'SUBMITTED',
  'AWAITING_TEST',
  'TESTING',
  'PASSED',
  'FAILED',
  'BLOCKED',
  'RENEWED',
  'CLOSED'
];

const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const assignmentKinds = ['REQUIRED', 'OPTIONAL', 'VOLUNTEER', 'ADMIN_REQUESTED'];
const runStatuses = ['NOT_STARTED', 'TESTING', 'DONE', 'BLOCKED'];
const results = ['PASS', 'FAIL', 'BLOCKED'];
const historyEventTypes = [
  'CHANGE_CREATED',
  'TESTING_REQUESTED',
  'TESTER_VOLUNTEERED',
  'TEST_RESULT_ADDED',
  'NOTE_UPDATED',
  'STATUS_CHANGED',
  'CHECKLIST_UPDATED',
  'ASSIGNMENT_UPDATED',
  'CHANGE_RENEWED',
  'CHANGE_CLOSED'
];

/**
 * Add global test manager role flag and persistence tables.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasTesterColumn = await knex.schema.hasColumn('User', 'tester');
  if (!hasTesterColumn) {
    await knex.schema.alterTable('User', (table) => {
      table.boolean('tester').nullable().defaultTo(false).after('guide');
    });
  }

  const hasChanges = await knex.schema.hasTable('TestChange');
  if (!hasChanges) {
    await knex.schema.createTable('TestChange', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.specificType('publicId', 'int unsigned not null auto_increment unique');
      table.string('title', 191).notNullable();
      table.text('description', 'longtext').notNullable();
      table.string('category', 80).notNullable();
      table.string('subsystem', 80).notNullable();
      table.enu('priority', priorities).notNullable().defaultTo('MEDIUM');
      table.enu('status', changeStatuses).notNullable().defaultTo('SUBMITTED');
      table.string('targetBuild', 120).nullable();
      table.string('assignedToId', 191).nullable();
      table.string('createdById', 191).notNullable();
      table.string('closedById', 191).nullable();
      table.dateTime('dueAt', { precision: 3 }).nullable();
      table.dateTime('closedAt', { precision: 3 }).nullable();
      table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.datetime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.index(['status', 'priority', 'updatedAt'], 'TestChange_status_priority_updated_idx');
      table.index(['createdById'], 'TestChange_createdById_idx');
      table.index(['assignedToId'], 'TestChange_assignedToId_idx');
      table.index(['closedById'], 'TestChange_closedById_idx');
      table
        .foreign('createdById', 'TestChange_createdById_fkey')
        .references('User.id')
        .onDelete('CASCADE');
      table
        .foreign('assignedToId', 'TestChange_assignedToId_fkey')
        .references('User.id')
        .onDelete('SET NULL');
      table
        .foreign('closedById', 'TestChange_closedById_fkey')
        .references('User.id')
        .onDelete('SET NULL');
    });
  }

  const hasChecklist = await knex.schema.hasTable('TestChangeChecklistItem');
  if (!hasChecklist) {
    await knex.schema.createTable('TestChangeChecklistItem', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('changeId', 191).notNullable();
      table.string('title', 191).notNullable();
      table.string('details', 1000).nullable();
      table.string('category', 80).nullable();
      table.integer('sortOrder').notNullable().defaultTo(0);
      table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.datetime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.index(['changeId', 'sortOrder'], 'TestChecklist_change_sort_idx');
      table
        .foreign('changeId', 'TestChecklist_changeId_fkey')
        .references('TestChange.id')
        .onDelete('CASCADE');
    });
  }

  const hasTesters = await knex.schema.hasTable('TestChangeTester');
  if (!hasTesters) {
    await knex.schema.createTable('TestChangeTester', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('changeId', 191).notNullable();
      table.string('userId', 191).notNullable();
      table.enu('assignment', assignmentKinds).notNullable().defaultTo('VOLUNTEER');
      table.enu('status', runStatuses).notNullable().defaultTo('NOT_STARTED');
      table.enu('result', results).nullable();
      table.text('notesHtml', 'longtext').nullable();
      table.string('requestedById', 191).nullable();
      table.dateTime('startedAt', { precision: 3 }).nullable();
      table.dateTime('completedAt', { precision: 3 }).nullable();
      table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.datetime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.unique(['changeId', 'userId'], { indexName: 'TestChangeTester_change_user_key' });
      table.index(['changeId', 'status'], 'TestChangeTester_change_status_idx');
      table.index(['userId', 'status'], 'TestChangeTester_user_status_idx');
      table.index(['requestedById'], 'TestChangeTester_requestedById_idx');
      table
        .foreign('changeId', 'TestChangeTester_changeId_fkey')
        .references('TestChange.id')
        .onDelete('CASCADE');
      table
        .foreign('userId', 'TestChangeTester_userId_fkey')
        .references('User.id')
        .onDelete('CASCADE');
      table
        .foreign('requestedById', 'TestChangeTester_requestedById_fkey')
        .references('User.id')
        .onDelete('SET NULL');
    });
  }

  const hasChecklistProgress = await knex.schema.hasTable('TestChangeChecklistProgress');
  if (!hasChecklistProgress) {
    await knex.schema.createTable('TestChangeChecklistProgress', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('testerId', 191).notNullable();
      table.string('checklistItemId', 191).notNullable();
      table.boolean('completed').notNullable().defaultTo(false);
      table.dateTime('completedAt', { precision: 3 }).nullable();
      table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.datetime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.unique(['testerId', 'checklistItemId'], {
        indexName: 'TestChecklistProgress_tester_item_key'
      });
      table.index(['checklistItemId'], 'TestChecklistProgress_item_idx');
      table.index(['testerId'], 'TestChecklistProgress_tester_idx');
      table
        .foreign('testerId', 'TestChecklistProgress_testerId_fkey')
        .references('TestChangeTester.id')
        .onDelete('CASCADE');
      table
        .foreign('checklistItemId', 'TestChecklistProgress_itemId_fkey')
        .references('TestChangeChecklistItem.id')
        .onDelete('CASCADE');
    });
  }

  const hasNotes = await knex.schema.hasTable('TestChangeNote');
  if (!hasNotes) {
    await knex.schema.createTable('TestChangeNote', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('changeId', 191).notNullable();
      table.string('testerId', 191).nullable();
      table.string('authorId', 191).notNullable();
      table.text('contentHtml', 'longtext').notNullable();
      table.enu('result', results).nullable();
      table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
      table.datetime('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.index(['changeId', 'createdAt'], 'TestChangeNote_change_created_idx');
      table.index(['authorId'], 'TestChangeNote_authorId_idx');
      table.index(['testerId'], 'TestChangeNote_testerId_idx');
      table
        .foreign('changeId', 'TestChangeNote_changeId_fkey')
        .references('TestChange.id')
        .onDelete('CASCADE');
      table
        .foreign('authorId', 'TestChangeNote_authorId_fkey')
        .references('User.id')
        .onDelete('CASCADE');
      table
        .foreign('testerId', 'TestChangeNote_testerId_fkey')
        .references('TestChangeTester.id')
        .onDelete('SET NULL');
    });
  }

  const hasHistory = await knex.schema.hasTable('TestChangeHistory');
  if (!hasHistory) {
    await knex.schema.createTable('TestChangeHistory', (table) => {
      table.charset('utf8mb4');
      table.collate('utf8mb4_unicode_ci');
      table.string('id', 191).primary();
      table.string('changeId', 191).notNullable();
      table.string('actorUserId', 191).nullable();
      table.enu('eventType', historyEventTypes).notNullable();
      table.string('label', 191).notNullable();
      table.string('detail', 1000).nullable();
      table.json('metadata').nullable();
      table.datetime('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));

      table.index(['changeId', 'createdAt'], 'TestHistory_change_created_idx');
      table.index(['actorUserId'], 'TestHistory_actorUserId_idx');
      table
        .foreign('changeId', 'TestHistory_changeId_fkey')
        .references('TestChange.id')
        .onDelete('CASCADE');
      table
        .foreign('actorUserId', 'TestHistory_actorUserId_fkey')
        .references('User.id')
        .onDelete('SET NULL');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  for (const tableName of [
    'TestChangeHistory',
    'TestChangeNote',
    'TestChangeChecklistProgress',
    'TestChangeTester',
    'TestChangeChecklistItem',
    'TestChange'
  ]) {
    const exists = await knex.schema.hasTable(tableName);
    if (exists) {
      await knex.schema.dropTable(tableName);
    }
  }

  const hasTesterColumn = await knex.schema.hasColumn('User', 'tester');
  if (hasTesterColumn) {
    await knex.schema.alterTable('User', (table) => {
      table.dropColumn('tester');
    });
  }
}
