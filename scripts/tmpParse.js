require('ts-node/register/transpile-only');
const { parseLootCouncilEvents } = require('../client/src/services/lootCouncilParser');
const log = `[Mon Nov 10 13:02:18 2025] ////// Showing All Loot Requests //////
[Mon Nov 10 13:02:18 2025] ------ [Showing All Loot Requests For: {Low Quality Cat Pelt}
[Mon Nov 10 13:02:18 2025] Request #1) Vayle, Current Votes: 0
[Mon Nov 10 13:02:18 2025] Item Replaced: Rusty Two Handed Battle Axe --> [Vote for Player]
[Mon Nov 10 13:02:18 2025] --------------------------------
[Mon Nov 10 13:02:18 2025] Request #2) Valgor, Current Votes: 0
[Mon Nov 10 13:02:18 2025] Item Replaced: Nothing --> [Vote for Player]
[Mon Nov 10 13:02:18 2025] --------------------------------
[Mon Nov 10 13:02:18 2025] ------ [Showing All Loot Requests For: {Chunk of Meat}
[Mon Nov 10 13:02:18 2025] There are no loot requests for this item.
[Mon Nov 10 13:02:18 2025] ---------------------------------
[Mon Nov 10 13:02:18 2025] ////////////////////////////////`;
const events = parseLootCouncilEvents(log, new Date('2025-11-10T12:00:00Z'));
console.log(events);
