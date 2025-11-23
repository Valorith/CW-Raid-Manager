-- Add Friends/Family rank alongside existing guild roles
ALTER TABLE `GuildMembership`
MODIFY `role` ENUM('LEADER', 'OFFICER', 'RAID_LEADER', 'MEMBER', 'FRIENDS_FAMILY') NOT NULL;
