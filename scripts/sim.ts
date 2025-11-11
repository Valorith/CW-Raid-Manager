import { parseLootCouncilEvents } from '../client/src/services/lootCouncilParser.ts';
import { normalizeLootItemName } from '../client/src/utils/lootLists';

type LootCouncilItemStatus = 'ACTIVE' | 'AWARDED' | 'REMOVED';
type LootCouncilInterestMode = 'REPLACING' | 'NOT_REPLACING';

type LootCouncilInterestState = {
  playerKey: string;
  playerName: string;
  replacing: string | null;
  mode: LootCouncilInterestMode;
  votes: number | null;
  lastUpdatedAt: Date;
  source: 'LIVE' | 'SYNC';
  voters: string[];
};

type LootCouncilItemState = {
  key: string;
  nameKey: string;
  instanceId: number;
  itemName: string;
  ordinal: number | null;
  startedAt: Date;
  lastUpdatedAt: Date;
  status: LootCouncilItemStatus;
  awardedTo: string | null;
  interests: LootCouncilInterestState[];
};

const lootCouncilState: { items: LootCouncilItemState[] } = { items: [] };
let sequence = 0;

function normalizeLootCouncilItemKey(itemName: string) {
  const normalized = normalizeLootItemName(itemName ?? '');
  return normalized || itemName.trim().toLowerCase();
}

function createItem(nameKey: string, itemName: string, timestamp: Date) {
  sequence += 1;
  const item: LootCouncilItemState = {
    key: `${nameKey}::${timestamp.getTime()}::${sequence}`,
    nameKey,
    instanceId: sequence,
    itemName,
    ordinal: null,
    startedAt: timestamp,
    lastUpdatedAt: timestamp,
    status: 'ACTIVE',
    awardedTo: null,
    interests: []
  };
  lootCouncilState.items.push(item);
  return item;
}

function getCandidates(nameKey: string) {
  return lootCouncilState.items.filter((entry) => entry.nameKey === nameKey);
}

function ensureItem(itemName: string, timestamp: Date) {
  const nameKey = normalizeLootCouncilItemKey(itemName);
  const existing = getCandidates(nameKey);
  if (existing.length === 0) {
    createItem(nameKey, itemName, timestamp);
    return true;
  }
  return false;
}

function ensureCapacity(itemName: string, timestamp: Date, requiredIndex: number) {
  const normalizedIndex = Math.max(1, requiredIndex);
  const nameKey = normalizeLootCouncilItemKey(itemName);
  let candidates = getCandidates(nameKey);
  let created = false;
  while (candidates.length < normalizedIndex) {
    createItem(nameKey, itemName, timestamp);
    candidates = getCandidates(nameKey);
    created = true;
  }
  return created;
}

function selectItem(itemName: string, sessionIndex: number) {
  const nameKey = normalizeLootCouncilItemKey(itemName);
  const candidates = getCandidates(nameKey);
  const ordered = [...candidates].sort((a, b) => {
    const delta = a.startedAt.getTime() - b.startedAt.getTime();
    return delta !== 0 ? delta : a.instanceId - b.instanceId;
  });
  return ordered[sessionIndex - 1] ?? ordered[0];
}

function applySummary(event: ReturnType<typeof parseLootCouncilEvents>[number] & { type: 'SYNC_SUMMARY' }) {
  ensureItem(event.itemName, event.timestamp);
  ensureCapacity(event.itemName, event.timestamp, event.sessionItemIndex ?? 1);
  const item = selectItem(event.itemName, event.sessionItemIndex ?? 1);
  item.lastUpdatedAt = event.timestamp;
}

const log = `[Mon Nov 10 18:14:58 2025] ////// Showing All Loot Requests //////\n[Mon Nov 10 18:14:58 2025] ------ [Showing All Loot Requests For: {Rusty Long Sword}\n[Mon Nov 10 18:14:58 2025] There are no loot requests for this item.\n[Mon Nov 10 18:14:58 2025] ---------------------------------\n[Mon Nov 10 18:14:58 2025] ------ [Showing All Loot Requests For: {Low Quality Cat Pelt}\n[Mon Nov 10 18:14:58 2025] There are no loot requests for this item.\n[Mon Nov 10 18:14:58 2025] ---------------------------------\n[Mon Nov 10 18:14:58 2025] ------ [Showing All Loot Requests For: {Low Quality Cat Pelt}\n[Mon Nov 10 18:14:58 2025] There are no loot requests for this item.\n[Mon Nov 10 18:14:58 2025] ---------------------------------\n[Mon Nov 10 18:14:58 2025] ------ [Showing All Loot Requests For: {High Quality Cat Pelt}\n[Mon Nov 10 18:14:58 2025] There are no loot requests for this item.\n[Mon Nov 10 18:14:58 2025] ---------------------------------\n[Mon Nov 10 18:14:58 2025] ------ [Showing All Loot Requests For: {High Quality Cat Pelt}\n[Mon Nov 10 18:14:58 2025] There are no loot requests for this item.\n[Mon Nov 10 18:14:58 2025] ---------------------------------\n[Mon Nov 10 18:14:58 2025] ////////////////////////////////`;
const events = parseLootCouncilEvents(log, new Date('2025-11-10T18:00:00Z'));
for (const event of events) {
  if (event.type === 'SYNC_SUMMARY') {
    applySummary(event);
  }
}
console.log('count', lootCouncilState.items.length);
console.log(lootCouncilState.items.map((item) => item.itemName));
