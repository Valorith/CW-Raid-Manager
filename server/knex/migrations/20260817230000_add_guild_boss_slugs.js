const BOSS_SLUG_MAX_LENGTH = 191;

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildUniqueSlug(name, usedSlugs) {
  const base = slugify(name).slice(0, BOSS_SLUG_MAX_LENGTH) || 'boss';
  let candidate = base;
  let counter = 2;

  while (usedSlugs.has(candidate.toLowerCase())) {
    const suffix = `-${counter}`;
    candidate = `${base.slice(0, BOSS_SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
    counter += 1;
  }

  return candidate;
}

/**
 * Add stable, guild-scoped slugs for compact boss share links.
 *
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasSlug = await knex.schema.hasColumn('GuildBoss', 'slug');
  if (!hasSlug) {
    await knex.schema.alterTable('GuildBoss', (table) => {
      table.string('slug', BOSS_SLUG_MAX_LENGTH).nullable().after('name');
    });
  }

  const bosses = await knex('GuildBoss')
    .select('id', 'guildId', 'name', 'slug', 'updatedAt')
    .orderBy([{ column: 'guildId', order: 'asc' }, { column: 'createdAt', order: 'asc' }]);
  const usedByGuild = new Map();

  for (const boss of bosses) {
    const usedSlugs = usedByGuild.get(boss.guildId) ?? new Set();
    usedByGuild.set(boss.guildId, usedSlugs);

    if (boss.slug) {
      usedSlugs.add(String(boss.slug).toLowerCase());
      continue;
    }

    const slug = buildUniqueSlug(boss.name, usedSlugs);
    await knex('GuildBoss').where({ id: boss.id }).update({ slug, updatedAt: boss.updatedAt });
    usedSlugs.add(slug.toLowerCase());
  }

  await knex.schema.alterTable('GuildBoss', (table) => {
    table.string('slug', BOSS_SLUG_MAX_LENGTH).notNullable().alter();
  });

  const indexResult = await knex.raw(
    "SHOW INDEX FROM `GuildBoss` WHERE Key_name = 'GuildBoss_guild_slug_key'"
  );
  const indexRows = Array.isArray(indexResult) ? indexResult[0] : [];
  if (!Array.isArray(indexRows) || indexRows.length === 0) {
    await knex.schema.alterTable('GuildBoss', (table) => {
      table.unique(['guildId', 'slug'], {
        indexName: 'GuildBoss_guild_slug_key'
      });
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasSlug = await knex.schema.hasColumn('GuildBoss', 'slug');
  if (!hasSlug) return;

  await knex.schema.alterTable('GuildBoss', (table) => {
    table.dropUnique(['guildId', 'slug'], 'GuildBoss_guild_slug_key');
    table.dropColumn('slug');
  });
}
