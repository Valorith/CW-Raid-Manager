export type GuildRole = 'LEADER' | 'OFFICER' | 'RAID_LEADER' | 'MEMBER';
export type LootListType = 'WHITELIST' | 'BLACKLIST';

export type CharacterClass =
  | 'BARD'
  | 'BEASTLORD'
  | 'BERSERKER'
  | 'CLERIC'
  | 'DRUID'
  | 'ENCHANTER'
  | 'MAGICIAN'
  | 'MONK'
  | 'NECROMANCER'
  | 'PALADIN'
  | 'RANGER'
  | 'ROGUE'
  | 'SHADOWKNIGHT'
  | 'SHAMAN'
  | 'WARRIOR'
  | 'WIZARD'
  | 'UNKNOWN';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'BENCHED';

export type DiscordWidgetTheme = 'LIGHT' | 'DARK';

export const guildRoleOrder: GuildRole[] = ['LEADER', 'OFFICER', 'RAID_LEADER', 'MEMBER'];
export const lootListTypeOrder: LootListType[] = ['WHITELIST', 'BLACKLIST'];
export const lootListTypeLabels: Record<LootListType, string> = {
  WHITELIST: 'Whitelist',
  BLACKLIST: 'Blacklist'
};

export const characterClassLabels: Record<CharacterClass, string> = {
  BARD: 'BRD',
  BEASTLORD: 'BST',
  BERSERKER: 'BER',
  CLERIC: 'CLR',
  DRUID: 'DRU',
  ENCHANTER: 'ENC',
  MAGICIAN: 'MAG',
  MONK: 'MNK',
  NECROMANCER: 'NEC',
  PALADIN: 'PAL',
  RANGER: 'RNG',
  ROGUE: 'ROG',
  SHADOWKNIGHT: 'SHD',
  SHAMAN: 'SHM',
  WARRIOR: 'WAR',
  WIZARD: 'WIZ',
  UNKNOWN: 'UNK'
};

export const characterClassIcons: Record<CharacterClass, string | null> = {
  BARD: '/class-icons/Bardicon.PNG.webp',
  BEASTLORD: '/class-icons/Beastlordicon.PNG.webp',
  BERSERKER: '/class-icons/Berserkericon.PNG.webp',
  CLERIC: '/class-icons/Clericicon.PNG.webp',
  DRUID: '/class-icons/Druidicon.PNG.webp',
  ENCHANTER: '/class-icons/Enchantericon.PNG.webp',
  MAGICIAN: '/class-icons/Magicianicon.PNG.webp',
  MONK: '/class-icons/Monkicon.PNG.webp',
  NECROMANCER: '/class-icons/Necromancericon.PNG.webp',
  PALADIN: '/class-icons/Paladinicon.PNG.webp',
  RANGER: '/class-icons/Rangericon.PNG.webp',
  ROGUE: '/class-icons/Rogueicon.PNG.webp',
  SHADOWKNIGHT: '/class-icons/Skicon.PNG.webp',
  SHAMAN: '/class-icons/Shamanicon.PNG.webp',
  WARRIOR: '/class-icons/Warrioricon.PNG.webp',
  WIZARD: '/class-icons/Wizardicon.PNG.webp',
  UNKNOWN: null
};

export function getCharacterClassIcon(characterClass?: CharacterClass | null): string | null {
  if (!characterClass) {
    return null;
  }

  return characterClassIcons[characterClass] ?? null;
}

export type RaidRoleCategory = 'TANK' | 'HEALER' | 'SUPPORT' | 'DPS';

export const roleCategoryOrder: RaidRoleCategory[] = ['TANK', 'HEALER', 'SUPPORT', 'DPS'];

export const roleCategoryLabels: Record<RaidRoleCategory, string> = {
  TANK: 'Tanks',
  HEALER: 'Healers',
  SUPPORT: 'Support',
  DPS: 'Damage'
};

export const characterClassRoleCategory: Record<CharacterClass, RaidRoleCategory> = {
  WARRIOR: 'TANK',
  PALADIN: 'TANK',
  SHADOWKNIGHT: 'TANK',
  CLERIC: 'HEALER',
  BARD: 'SUPPORT',
  ENCHANTER: 'SUPPORT',
  SHAMAN: 'SUPPORT',
  DRUID: 'SUPPORT',
  BEASTLORD: 'DPS',
  BERSERKER: 'DPS',
  MONK: 'DPS',
  RANGER: 'DPS',
  ROGUE: 'DPS',
  MAGICIAN: 'DPS',
  NECROMANCER: 'DPS',
  WIZARD: 'DPS',
  UNKNOWN: 'DPS'
};

export function getRoleCategoryForClass(characterClass: CharacterClass): RaidRoleCategory {
  return characterClassRoleCategory[characterClass] ?? 'DPS';
}
