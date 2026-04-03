export interface EqItemTypeOption {
  value: number;
  label: string;
}

export interface EqItemSlotOption {
  slotId: number;
  label: string;
}

// Derived from EQEmu docs:
// https://docs.eqemu.io/server/items/item-types/
export const EQEMU_ITEM_TYPE_OPTIONS: EqItemTypeOption[] = [
  { value: 0, label: '1H Slashing' },
  { value: 1, label: '2H Slashing' },
  { value: 2, label: '1H Piercing' },
  { value: 3, label: '1H Blunt' },
  { value: 4, label: '2H Blunt' },
  { value: 5, label: 'Archery' },
  { value: 7, label: 'Throwing' },
  { value: 8, label: 'Shield' },
  { value: 10, label: 'Armor' },
  { value: 11, label: 'Tradeskill Items' },
  { value: 12, label: 'Lockpicking' },
  { value: 14, label: 'Food' },
  { value: 15, label: 'Drink' },
  { value: 16, label: 'Light Source' },
  { value: 17, label: 'Common Inventory Item' },
  { value: 18, label: 'Bind Wound' },
  { value: 19, label: 'Thrown Casting Items' },
  { value: 20, label: 'Spells / Song Sheets' },
  { value: 21, label: 'Potions' },
  { value: 22, label: 'Fletched Arrows' },
  { value: 23, label: 'Wind Instruments' },
  { value: 24, label: 'Stringed Instruments' },
  { value: 25, label: 'Brass Instruments' },
  { value: 26, label: 'Percussion Instruments' },
  { value: 27, label: 'Ammo' },
  { value: 29, label: 'Jewelry' },
  { value: 31, label: 'Readable Notes and Scrolls' },
  { value: 32, label: 'Readable Books' },
  { value: 33, label: 'Keys' },
  { value: 34, label: 'Odd Items' },
  { value: 35, label: '2H Piercing' },
  { value: 36, label: 'Fishing Poles' },
  { value: 37, label: 'Fishing Bait' },
  { value: 38, label: 'Alcoholic Beverages' },
  { value: 39, label: 'More Keys' },
  { value: 40, label: 'Compasses' },
  { value: 42, label: 'Poisons' },
  { value: 45, label: 'Hand to Hand' },
  { value: 52, label: 'Charms' },
  { value: 53, label: 'Dyes' },
  { value: 54, label: 'Augments' },
  { value: 55, label: 'Augment Solvents' },
  { value: 56, label: 'Augment Distillers' },
  { value: 58, label: 'Fellowship Banner Materials' },
  { value: 60, label: 'Cultural Armor Manuals' },
  { value: 63, label: 'New Curencies like Orum' }
];

// Derived from EQEmu docs:
// https://docs.eqemu.io/server/inventory/item-slots/
export const EQEMU_ITEM_SLOT_OPTIONS: EqItemSlotOption[] = [
  { slotId: 0, label: 'Charm' },
  { slotId: 1, label: 'Ear 1' },
  { slotId: 2, label: 'Head' },
  { slotId: 3, label: 'Face' },
  { slotId: 4, label: 'Ear 2' },
  { slotId: 5, label: 'Neck' },
  { slotId: 6, label: 'Shoulder' },
  { slotId: 7, label: 'Arms' },
  { slotId: 8, label: 'Back' },
  { slotId: 9, label: 'Bracer 1' },
  { slotId: 10, label: 'Bracer 2' },
  { slotId: 11, label: 'Range' },
  { slotId: 12, label: 'Hands' },
  { slotId: 13, label: 'Primary' },
  { slotId: 14, label: 'Secondary' },
  { slotId: 15, label: 'Ring 1' },
  { slotId: 16, label: 'Ring 2' },
  { slotId: 17, label: 'Chest' },
  { slotId: 18, label: 'Legs' },
  { slotId: 19, label: 'Feet' },
  { slotId: 20, label: 'Waist' },
  { slotId: 21, label: 'Powersource' },
  { slotId: 22, label: 'Ammo' }
];
