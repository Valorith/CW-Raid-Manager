-- Add a personal flag to distinguish personal roster entries from guild bank alts.
ALTER TABLE `GuildBankCharacter`
  ADD COLUMN `isPersonal` BOOLEAN NOT NULL DEFAULT false
  AFTER `normalizedName`;
