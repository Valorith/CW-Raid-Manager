import { readFileSync } from 'node:fs';
import { parseLootCouncilEvents } from '../client/src/services/lootCouncilParser.ts';

const content = readFileSync('eqlog_Valgor_CWR.txt', 'utf8');
const events = parseLootCouncilEvents(content, new Date('2025-01-01T00:00:00Z'));
let printed = 0;
for (const event of events) {
  if (event.type !== 'SYNC_SUMMARY') continue;
  console.log(event.timestamp.toISOString(), event.itemName, 'session', event.sessionId, 'order', event.sessionOrder, 'idx', event.sessionItemIndex);
  if (++printed >= 50) break;
}
