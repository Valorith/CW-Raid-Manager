import { parseLootCouncilEvents } from '../client/src/services/lootCouncilParser';
const log = `[Mon Nov 10 12:20:53 2025] ////// Showing All Loot Requests //////
[Mon Nov 10 12:20:53 2025] ------ [Showing All Loot Requests For: {Low Quality Cat Pelt}
[Mon Nov 10 12:20:53 2025] Request #1) Vayle, Current Votes: 0
[Mon Nov 10 12:20:53 2025] Item Replaced: Rusty Two Handed Battle Axe --> [Vote for Player]
[Mon Nov 10 12:20:53 2025] --------------------------------
[Mon Nov 10 12:20:53 2025] Request #2) Valgor, Current Votes: 0
[Mon Nov 10 12:20:53 2025] Item Replaced: Nothing --> [Vote for Player]
[Mon Nov 10 12:20:53 2025] --------------------------------
[Mon Nov 10 12:20:53 2025] ------ [Showing All Loot Requests For: {Spider Silk}
[Mon Nov 10 12:20:53 2025] Request #1) Vayle, Current Votes: 0
[Mon Nov 10 12:20:53 2025] Item Replaced: Orb of Mastery --> [Vote for Player]
[Mon Nov 10 12:20:53 2025] --------------------------------
[Mon Nov 10 12:20:53 2025] //// //////////////////////////////////
[Mon Nov 10 12:20:53 2025] ////////////////////////////////`;
const events = parseLootCouncilEvents(log, new Date('2025-11-10T12:00:00Z'));
console.log(events.map((e) => ({ type: e.type, item: e.itemName, idx: (e as any).sessionItemIndex })));
