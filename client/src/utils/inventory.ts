export const WORN_SLOT_LABELS = [
    'Charm', // 0
    'Ear 1',
    'Head',
    'Face',
    'Ear 2',
    'Neck',
    'Shoulders',
    'Arms',
    'Back',
    'Wrist 1',
    'Wrist 2',
    'Range',
    'Hands',
    'Primary',
    'Secondary',
    'Finger 1',
    'Finger 2',
    'Chest',
    'Legs',
    'Feet',
    'Waist',
    'Power Source',
    'Ammo'
];

export const WORN_SLOT_KEYS = [
    'charm',
    'ear1',
    'head',
    'face',
    'ear2',
    'neck',
    'shoulders',
    'arms',
    'back',
    'wrist1',
    'wrist2',
    'range',
    'hands',
    'primary',
    'secondary',
    'finger1',
    'finger2',
    'chest',
    'legs',
    'feet',
    'waist',
    'powersource',
    'ammo'
];

export const WORN_SLOT_SHORT_LABELS = [
    'Charm', 'Ear1', 'Head', 'Face', 'Ear2', 'Neck', 'Shldr', 'Arms', 'Back', 'Wrst1', 'Wrst2',
    'Range', 'Hands', 'Prim', 'Sec', 'Fing1', 'Fing2', 'Chest', 'Legs', 'Feet', 'Waist', 'Power', 'Ammo'
];

export interface WornSlotUiDefinition {
    slotId: number;
    label: string;
    shortLabel: string;
    key: string;
    row: number;
    col: number;
}

export const WORN_SLOT_UI_LAYOUT: WornSlotUiDefinition[] = [
    { slotId: 1, label: WORN_SLOT_LABELS[1], shortLabel: WORN_SLOT_SHORT_LABELS[1], key: WORN_SLOT_KEYS[1], row: 1, col: 1 },
    { slotId: 2, label: WORN_SLOT_LABELS[2], shortLabel: WORN_SLOT_SHORT_LABELS[2], key: WORN_SLOT_KEYS[2], row: 1, col: 2 },
    { slotId: 3, label: WORN_SLOT_LABELS[3], shortLabel: WORN_SLOT_SHORT_LABELS[3], key: WORN_SLOT_KEYS[3], row: 1, col: 3 },
    { slotId: 4, label: WORN_SLOT_LABELS[4], shortLabel: WORN_SLOT_SHORT_LABELS[4], key: WORN_SLOT_KEYS[4], row: 1, col: 4 },
    { slotId: 17, label: WORN_SLOT_LABELS[17], shortLabel: WORN_SLOT_SHORT_LABELS[17], key: WORN_SLOT_KEYS[17], row: 2, col: 1 },
    { slotId: 5, label: WORN_SLOT_LABELS[5], shortLabel: WORN_SLOT_SHORT_LABELS[5], key: WORN_SLOT_KEYS[5], row: 2, col: 4 },
    { slotId: 7, label: WORN_SLOT_LABELS[7], shortLabel: WORN_SLOT_SHORT_LABELS[7], key: WORN_SLOT_KEYS[7], row: 3, col: 1 },
    { slotId: 8, label: WORN_SLOT_LABELS[8], shortLabel: WORN_SLOT_SHORT_LABELS[8], key: WORN_SLOT_KEYS[8], row: 3, col: 4 },
    { slotId: 20, label: WORN_SLOT_LABELS[20], shortLabel: WORN_SLOT_SHORT_LABELS[20], key: WORN_SLOT_KEYS[20], row: 4, col: 1 },
    { slotId: 6, label: WORN_SLOT_LABELS[6], shortLabel: WORN_SLOT_SHORT_LABELS[6], key: WORN_SLOT_KEYS[6], row: 4, col: 4 },
    { slotId: 9, label: WORN_SLOT_LABELS[9], shortLabel: WORN_SLOT_SHORT_LABELS[9], key: WORN_SLOT_KEYS[9], row: 5, col: 1 },
    { slotId: 10, label: WORN_SLOT_LABELS[10], shortLabel: WORN_SLOT_SHORT_LABELS[10], key: WORN_SLOT_KEYS[10], row: 5, col: 4 },
    { slotId: 18, label: WORN_SLOT_LABELS[18], shortLabel: WORN_SLOT_SHORT_LABELS[18], key: WORN_SLOT_KEYS[18], row: 6, col: 1 },
    { slotId: 12, label: WORN_SLOT_LABELS[12], shortLabel: WORN_SLOT_SHORT_LABELS[12], key: WORN_SLOT_KEYS[12], row: 6, col: 2 },
    { slotId: 0, label: WORN_SLOT_LABELS[0], shortLabel: WORN_SLOT_SHORT_LABELS[0], key: WORN_SLOT_KEYS[0], row: 6, col: 3 },
    { slotId: 19, label: WORN_SLOT_LABELS[19], shortLabel: WORN_SLOT_SHORT_LABELS[19], key: WORN_SLOT_KEYS[19], row: 6, col: 4 },
    { slotId: 15, label: WORN_SLOT_LABELS[15], shortLabel: WORN_SLOT_SHORT_LABELS[15], key: WORN_SLOT_KEYS[15], row: 7, col: 2 },
    { slotId: 16, label: WORN_SLOT_LABELS[16], shortLabel: WORN_SLOT_SHORT_LABELS[16], key: WORN_SLOT_KEYS[16], row: 7, col: 3 },
    { slotId: 21, label: WORN_SLOT_LABELS[21], shortLabel: WORN_SLOT_SHORT_LABELS[21], key: WORN_SLOT_KEYS[21], row: 7, col: 4 },
    { slotId: 13, label: WORN_SLOT_LABELS[13], shortLabel: WORN_SLOT_SHORT_LABELS[13], key: WORN_SLOT_KEYS[13], row: 8, col: 1 },
    { slotId: 14, label: WORN_SLOT_LABELS[14], shortLabel: WORN_SLOT_SHORT_LABELS[14], key: WORN_SLOT_KEYS[14], row: 8, col: 2 },
    { slotId: 11, label: WORN_SLOT_LABELS[11], shortLabel: WORN_SLOT_SHORT_LABELS[11], key: WORN_SLOT_KEYS[11], row: 8, col: 3 },
    { slotId: 22, label: WORN_SLOT_LABELS[22], shortLabel: WORN_SLOT_SHORT_LABELS[22], key: WORN_SLOT_KEYS[22], row: 8, col: 4 }
];

export const GENERAL_SLOT_IDS = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
export const BAG_POCKET_INDICES = Array.from({ length: 10 }, (_, index) => index);
export const BANK_SLOT_IDS = Array.from({ length: 24 }, (_, index) => 2000 + index);

export type ResolvedSlotPlacement = {
    area: 'worn' | 'inventory' | 'inventoryBag' | 'bank' | 'bankBag' | 'unknown';
    slotId: number | null;
    slotLabel: string;
    parentSlotId?: number | null;
    parentLabel?: string;
    bagSlotIndex?: number | null;
};

export function generalSlotLabel(slotId: number) {
    const idx = slotId - 22;
    return idx >= 1 ? `General ${idx}` : `General ${slotId}`;
}

export function bankSlotLabel(slotId: number) {
    return `Bank ${slotId - 1999}`;
}

export function resolveSlotPlacement(slotId: number | null): ResolvedSlotPlacement {
    if (typeof slotId !== 'number' || Number.isNaN(slotId)) {
        return { area: 'unknown', slotId: null, slotLabel: 'Unknown slot' };
    }

    if (slotId >= 0 && slotId < WORN_SLOT_LABELS.length) {
        return {
            area: 'worn',
            slotId,
            slotLabel: WORN_SLOT_LABELS[slotId]
        };
    }

    // General slots themselves (23-32)
    if (slotId >= GENERAL_SLOT_IDS[0] && slotId <= GENERAL_SLOT_IDS[GENERAL_SLOT_IDS.length - 1]) {
        return {
            area: 'inventory',
            slotId,
            slotLabel: generalSlotLabel(slotId)
        };
    }

    // General Inventory Bag Slots (User provided ranges)
    // Slot 23: 4010-4209
    // ...
    // Slot 32: 5810-6009 (Assuming 6810 was a typo for 5810 based on +200 pattern)
    if (slotId >= 4010 && slotId <= 6009) {
        const offset = slotId - 4010;
        const bagIndex = Math.floor(offset / 200);
        const bagSlotIndex = offset % 200;
        const parentSlotId = 23 + bagIndex;

        if (GENERAL_SLOT_IDS.includes(parentSlotId)) {
            return {
                area: 'inventoryBag',
                slotId,
                slotLabel: `Bag slot ${bagSlotIndex + 1}`,
                parentSlotId,
                parentLabel: generalSlotLabel(parentSlotId),
                bagSlotIndex
            };
        }
    }

    // Bank slots (2000-2023)
    if (slotId >= BANK_SLOT_IDS[0] && slotId <= BANK_SLOT_IDS[BANK_SLOT_IDS.length - 1]) {
        return {
            area: 'bank',
            slotId,
            slotLabel: bankSlotLabel(slotId)
        };
    }

    // Bank bag slots (User provided range: 6210 - 11009)
    // 24 bank slots * 200 slots/bag = 4800 slots
    // 6210 + 4800 - 1 = 11009. Matches perfectly.
    if (slotId >= 6210 && slotId <= 11009) {
        const offset = slotId - 6210;
        const bagIndex = Math.floor(offset / 200);
        const bagSlotIndex = offset % 200;
        const parentSlotId = 2000 + bagIndex;

        if (BANK_SLOT_IDS.includes(parentSlotId)) {
            return {
                area: 'bankBag',
                slotId,
                slotLabel: `Bank bag slot ${bagSlotIndex + 1}`,
                parentSlotId,
                parentLabel: bankSlotLabel(parentSlotId),
                bagSlotIndex
            };
        }
    }

    // Fallback
    // console.log('Unresolved slot:', slotId);
    return {
        area: 'unknown',
        slotId,
        slotLabel: `Slot ${slotId}`
    };
}

export function slotDisplayLabel(resolved: ResolvedSlotPlacement): string {
    if (resolved.area === 'inventoryBag' && resolved.parentLabel) {
        return `${resolved.parentLabel} (Slot ${resolved.bagSlotIndex != null ? resolved.bagSlotIndex + 1 : '?'})`;
    }
    if (resolved.area === 'bankBag' && resolved.parentLabel) {
        return `${resolved.parentLabel} (Slot ${resolved.bagSlotIndex != null ? resolved.bagSlotIndex + 1 : '?'})`;
    }
    return resolved.slotLabel;
}
