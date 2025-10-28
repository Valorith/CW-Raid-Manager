DELETE FROM _prisma_migrations 
WHERE migration_name IN (
  '20241026_raid-actual-times',
  '20241027_add_attendance_event_type', 
  '20241027_rename-character-table',
  '20241029_add_guild_applications',
  '20241029_add_user_nickname',
  '20241030_add_user_admin',
  '20241103_multi_guild_webhooks',
  '20241104_add_mention_subscriptions'
);