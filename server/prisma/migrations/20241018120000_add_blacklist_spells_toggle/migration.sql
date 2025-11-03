-- Add blacklistSpells toggle to guilds
ALTER TABLE `Guild`
  ADD COLUMN `blacklistSpells` BOOLEAN NOT NULL DEFAULT 0;
