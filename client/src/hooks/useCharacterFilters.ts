import type { CharacterClass } from '../services/types';

type FilterOption = {
  label: string;
  value: 'ALL' | 'MAIN' | CharacterClass;
  gradient: string;
  border: string;
  icon: string | null;
};

const iconBase = '/class-icons';
const classFilterConfig: Array<{ value: CharacterClass; gradient: string; border: string; icon: string }> = [
  { value: 'BARD', gradient: 'linear-gradient(145deg, rgba(236, 72, 153, 0.85), rgba(244, 114, 182, 0.85))', border: 'rgba(244, 114, 182, 0.65)', icon: `${iconBase}/Bardicon.PNG.webp` },
  { value: 'BEASTLORD', gradient: 'linear-gradient(145deg, rgba(59, 130, 246, 0.85), rgba(96, 165, 250, 0.85))', border: 'rgba(96, 165, 250, 0.65)', icon: `${iconBase}/Beastlordicon.PNG.webp` },
  { value: 'BERSERKER', gradient: 'linear-gradient(145deg, rgba(239, 68, 68, 0.85), rgba(248, 113, 113, 0.85))', border: 'rgba(248, 113, 113, 0.65)', icon: `${iconBase}/Berserkericon.PNG.webp` },
  { value: 'CLERIC', gradient: 'linear-gradient(145deg, rgba(34, 197, 94, 0.85), rgba(74, 222, 128, 0.85))', border: 'rgba(74, 222, 128, 0.65)', icon: `${iconBase}/Clericicon.PNG.webp` },
  { value: 'DRUID', gradient: 'linear-gradient(145deg, rgba(16, 185, 129, 0.85), rgba(45, 212, 191, 0.85))', border: 'rgba(45, 212, 191, 0.65)', icon: `${iconBase}/Druidicon.PNG.webp` },
  { value: 'ENCHANTER', gradient: 'linear-gradient(145deg, rgba(129, 140, 248, 0.85), rgba(165, 180, 252, 0.85))', border: 'rgba(165, 180, 252, 0.65)', icon: `${iconBase}/Enchantericon.PNG.webp` },
  { value: 'MAGICIAN', gradient: 'linear-gradient(145deg, rgba(249, 115, 22, 0.85), rgba(251, 146, 60, 0.85))', border: 'rgba(251, 146, 60, 0.65)', icon: `${iconBase}/Magicianicon.PNG.webp` },
  { value: 'MONK', gradient: 'linear-gradient(145deg, rgba(34, 197, 94, 0.85), rgba(134, 239, 172, 0.85))', border: 'rgba(134, 239, 172, 0.65)', icon: `${iconBase}/Monkicon.PNG.webp` },
  { value: 'NECROMANCER', gradient: 'linear-gradient(145deg, rgba(71, 85, 105, 0.85), rgba(148, 163, 184, 0.85))', border: 'rgba(148, 163, 184, 0.65)', icon: `${iconBase}/Necromancericon.PNG.webp` },
  { value: 'PALADIN', gradient: 'linear-gradient(145deg, rgba(192, 132, 252, 0.85), rgba(217, 180, 254, 0.85))', border: 'rgba(217, 180, 254, 0.65)', icon: `${iconBase}/Paladinicon.PNG.webp` },
  { value: 'RANGER', gradient: 'linear-gradient(145deg, rgba(34, 197, 94, 0.85), rgba(74, 222, 128, 0.85))', border: 'rgba(74, 222, 128, 0.65)', icon: `${iconBase}/Rangericon.PNG.webp` },
  { value: 'ROGUE', gradient: 'linear-gradient(145deg, rgba(100, 116, 139, 0.85), rgba(148, 163, 184, 0.85))', border: 'rgba(148, 163, 184, 0.65)', icon: `${iconBase}/Rogueicon.PNG.webp` },
  { value: 'SHADOWKNIGHT', gradient: 'linear-gradient(145deg, rgba(59, 130, 246, 0.85), rgba(99, 102, 241, 0.85))', border: 'rgba(99, 102, 241, 0.65)', icon: `${iconBase}/Skicon.PNG.webp` },
  { value: 'SHAMAN', gradient: 'linear-gradient(145deg, rgba(20, 184, 166, 0.85), rgba(45, 212, 191, 0.85))', border: 'rgba(45, 212, 191, 0.65)', icon: `${iconBase}/Shamanicon.PNG.webp` },
  { value: 'WARRIOR', gradient: 'linear-gradient(145deg, rgba(148, 163, 184, 0.85), rgba(226, 232, 240, 0.85))', border: 'rgba(226, 232, 240, 0.65)', icon: `${iconBase}/Warrioricon.PNG.webp` },
  { value: 'WIZARD', gradient: 'linear-gradient(145deg, rgba(59, 130, 246, 0.85), rgba(96, 165, 250, 0.85))', border: 'rgba(96, 165, 250, 0.65)', icon: `${iconBase}/Wizardicon.PNG.webp` }
];

const colorMap = classFilterConfig.reduce<Record<CharacterClass, { gradient: string; border: string }>>((map, entry) => {
  map[entry.value] = { gradient: entry.gradient, border: entry.border };
  return map;
}, {} as any);

const iconMap = classFilterConfig.reduce<Partial<Record<CharacterClass, string>>>((map, entry) => {
  map[entry.value] = entry.icon;
  return map;
}, {});

export function buildCharacterFilterOptions(labels: Record<CharacterClass, string>): FilterOption[] {
  const baseFilters: FilterOption[] = [
    {
      label: 'ALL',
      value: 'ALL',
      gradient: 'linear-gradient(145deg, rgba(39, 51, 89, 0.85), rgba(15, 23, 42, 0.85))',
      border: 'rgba(148, 163, 184, 0.35)',
      icon: null
    },
    {
      label: 'MAIN',
      value: 'MAIN',
      gradient: 'linear-gradient(145deg, rgba(250, 204, 21, 0.85), rgba(251, 191, 36, 0.85))',
      border: 'rgba(252, 211, 77, 0.65)',
      icon: null
    }
  ];

  const classFilters = Object.entries(labels)
    .filter(([value]) => value !== 'UNKNOWN')
    .map(([value, label]) => {
      const classKey = value as CharacterClass;
      const colors = colorMap[classKey];
      return {
        label,
        value: classKey,
        gradient: colors?.gradient ?? 'linear-gradient(145deg, rgba(39, 51, 89, 0.85), rgba(15, 23, 42, 0.85))',
        border: colors?.border ?? 'rgba(148, 163, 184, 0.35)',
        icon: iconMap[classKey] ?? null
      };
    });

  return [...baseFilters, ...classFilters];
}
