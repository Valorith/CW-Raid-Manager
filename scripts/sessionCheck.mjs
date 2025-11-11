import { parseLootCouncilEvents } from '../client/src/services/lootCouncilParser.ts';

const log = `[Mon Nov 10 14:56:12 2025] ////// Showing All Loot Requests //////\n[Mon Nov 10 14:56:12 2025] ------ [Showing All Loot Requests For: {Rusty Long Sword}\n[Mon Nov 10 14:56:12 2025] There are no loot requests for this item.\n[Mon Nov 10 14:56:12 2025] ---------------------------------\n[Mon Nov 10 14:56:12 2025] ------ [Showing All Loot Requests For: {Low Quality Cat Pelt}\n[Mon Nov 10 14:56:12 2025] There are no loot requests for this item.\n[Mon Nov 10 14:56:12 2025] ---------------------------------\n[Mon Nov 10 14:56:12 2025] ------ [Showing All Loot Requests For: {Low Quality Cat Pelt}\n[Mon Nov 10 14:56:12 2025] There are no loot requests for this item.\n[Mon Nov 10 14:56:12 2025] ---------------------------------\n[Mon Nov 10 14:56:12 2025] ------ [Showing All Loot Requests For: {High Quality Cat Pelt}\n[Mon Nov 10 14:56:12 2025] There are no loot requests for this item.\n[Mon Nov 10 14:56:12 2025] ---------------------------------\n[Mon Nov 10 14:56:12 2025] ------ [Showing All Loot Requests For: {High Quality Cat Pelt}\n[Mon Nov 10 14:56:12 2025] There are no loot requests for this item.\n[Mon Nov 10 14:56:12 2025] ---------------------------------\n[Mon Nov 10 14:56:12 2025] ////////////////////////////////`;

const events = parseLootCouncilEvents(log, new Date('2025-11-10T14:00:00Z'));
for (const event of events) {
  if (event.type === 'SYNC_SUMMARY') {
    console.log(event.itemName, { sessionId: event.sessionId, order: event.sessionOrder, idx: event.sessionItemIndex, empty: event.empty });
  }
}
