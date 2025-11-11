import { readFileSync } from 'node:fs';
import { parseLootCouncilEvents } from '../client/src/services/lootCouncilParser.ts';
import { normalizeLootItemName } from '../client/src/utils/lootLists';

type LootCouncilItemState = {
  key: string;
  nameKey: string;
  instanceId: number;
  itemName: string;
};

const state: LootCouncilItemState[] = [];
let sequence = 0;

function normalizeKey(itemName: string) {
  const normalized = normalizeLootItemName(itemName ?? '');
  return normalized || itemName.trim().toLowerCase();
}

function getCandidates(nameKey: string) {
  return state.filter((entry) => entry.nameKey === nameKey);
}

function createItem(nameKey: string, itemName: string) {
  sequence += 1;
  const item = { key: `${nameKey}::${sequence}`, nameKey, instanceId: sequence, itemName };
  state.push(item);
  return item;
}

function ensure(itemName: string) {
  const nameKey = normalizeKey(itemName);
  if (getCandidates(nameKey).length === 0) {
    createItem(nameKey, itemName);
  }
}

function ensureCapacity(itemName: string, index: number) {
  const nameKey = normalizeKey(itemName);
  while (getCandidates(nameKey).length < index) {
    createItem(nameKey, itemName);
  }
}

function select(itemName: string, index: number) {
  const candidates = [...getCandidates(normalizeKey(itemName))].sort((a, b) => a.instanceId - b.instanceId);
  return candidates[index - 1] ?? candidates[0];
}

const events = parseLootCouncilEvents(readFileSync('eqlog_Valgor_CWR.txt', 'utf8'), new Date('2025-10-19T22:00:00Z'));
for (const event of events) {
  if (event.type !== 'SYNC_SUMMARY') continue;
  if (event.sessionId !== 24) continue;
  const index = event.sessionItemIndex ?? 1;
  ensure(event.itemName);
  ensureCapacity(event.itemName, index);
  select(event.itemName, index);
}
console.log(state.map((item) => item.itemName));
