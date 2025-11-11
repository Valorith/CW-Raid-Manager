import { parseLootCouncilEvents } from '../client/src/services/lootCouncilParser';
const log = `[Mon Nov 10 13:41:15 2025] ////// Showing All Loot Requests //////\n[Mon Nov 10 13:41:15 2025] ------ [Showing All Loot Requests For: {Rusty Long Sword}\n[Mon Nov 10 13:41:15 2025] There are no loot requests for this item.\n[Mon Nov 10 13:41:15 2025] ---------------------------------\n[Mon Nov 10 13:41:15 2025] ------ [Showing All Loot Requests For: {Low Quality Cat Pelt}\n[Mon Nov 10 13:41:15 2025] There are no loot requests for this item.\n[Mon Nov 10 13:41:15 2025] ---------------------------------\n[Mon Nov 10 13:41:15 2025] ------ [Showing All Loot Requests For: {Low Quality Cat Pelt}\n[Mon Nov 10 13:41:15 2025] There are no loot requests for this item.\n[Mon Nov 10 13:41:15 2025] ---------------------------------\n[Mon Nov 10 13:41:15 2025] ------ [Showing All Loot Requests For: {High Quality Cat Pelt}\n[Mon Nov 10 13:41:15 2025] There are no loot requests for this item.\n[Mon Nov 10 13:41:15 2025] ---------------------------------\n[Mon Nov 10 13:41:15 2025] ------ [Showing All Loot Requests For: {High Quality Cat Pelt}\n[Mon Nov 10 13:41:15 2025] There are no loot requests for this item.\n[Mon Nov 10 13:41:15 2025] ---------------------------------\n[Mon Nov 10 13:41:15 2025] ////////////////////////////////`;
const events = parseLootCouncilEvents(log, new Date('2025-11-10T13:00:00Z'));
for (const event of events) {
  if (event.type === 'SYNC_SUMMARY') {
    console.log(event.itemName, event.sessionId, event.sessionItemIndex, event.requests.length, event.empty);
  }
}
