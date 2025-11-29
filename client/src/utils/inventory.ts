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
