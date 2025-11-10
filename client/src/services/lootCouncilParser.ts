const timestampRegex =
  /^\[(?<day>\w{3}) (?<month>\w{3}) (?<date>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2}) (?<year>\d{4})]/;

export type LootCouncilInterestMode = 'REPLACING' | 'NOT_REPLACING';

export type LootCouncilEvent =
  | {
      type: 'ITEM_CONSIDERED';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
      ordinal?: number | null;
    }
  | {
      type: 'REQUEST';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
      playerName: string;
      replacing?: string | null;
      mode: LootCouncilInterestMode;
    }
  | {
      type: 'SYNC_SUMMARY';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
      requests: Array<{
        playerName: string;
        replacing?: string | null;
        mode: LootCouncilInterestMode;
        votes?: number | null;
      }>;
      empty: boolean;
    }
  | {
      type: 'VOTE';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
      candidateName: string;
      voterName: string;
    }
  | {
      type: 'AWARD';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
      awardedTo: string;
    }
  | {
      type: 'DONATION';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
    }
  | {
      type: 'RANDOM_AWARD';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
      awardedTo: string;
    }
  | {
      type: 'MASTER_LOOTED';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
    }
  | {
      type: 'LEFT_ON_CORPSE';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
    };

interface LootCouncilSyncBlock {
  itemName: string;
  timestamp: Date;
  rawLine: string;
  requests: Array<{
    playerName: string;
    votes?: number | null;
    replacing?: string | null;
    mode: LootCouncilInterestMode;
  }>;
  markedEmpty: boolean;
}

interface PendingSyncRequest {
  playerName: string;
  votes?: number | null;
  timestamp: Date;
  rawLine: string;
}

export function parseLootCouncilEvents(
  content: string,
  raidStart: Date,
  raidEnd?: Date | null
): LootCouncilEvent[] {
  const events: LootCouncilEvent[] = [];
  const lines = content.split(/\r?\n/);
  let currentSync: LootCouncilSyncBlock | null = null;
  let pendingSyncRequest: PendingSyncRequest | null = null;

  function finalizeSyncBlock() {
    if (!currentSync) {
      pendingSyncRequest = null;
      return;
    }
    if (pendingSyncRequest) {
      currentSync.requests.push({
        playerName: pendingSyncRequest.playerName,
        votes: pendingSyncRequest.votes ?? null,
        replacing: null,
        mode: 'REPLACING'
      });
      pendingSyncRequest = null;
    }
    events.push({
      type: 'SYNC_SUMMARY',
      key: buildEventKey(
        currentSync.timestamp,
        `${currentSync.itemName}::sync-summary::${currentSync.requests.length}`
      ),
      timestamp: currentSync.timestamp,
      rawLine: currentSync.rawLine,
      itemName: currentSync.itemName,
      requests: currentSync.requests,
      empty: currentSync.markedEmpty && currentSync.requests.length === 0
    });
    currentSync = null;
    pendingSyncRequest = null;
  }

  for (const line of lines) {
    const timestamp = extractTimestamp(line);
    if (!timestamp || !isWithinRaid(timestamp, raidStart, raidEnd)) {
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const considerMatch = trimmed.match(
      /^(?:\d+\)\s*)?(?:\[[^\]]+\]\s*)?(?<item>.+?)\s+is\s+(?:now\s+)?being\s+considered\s+by\s+the\s+loot\s+council/i
    );
    if (considerMatch?.groups?.item) {
      finalizeSyncBlock();
      const ordinalMatch = trimmed.match(/^(?<ordinal>\d+)\)/);
      events.push({
        type: 'ITEM_CONSIDERED',
        key: buildEventKey(timestamp, `${considerMatch.groups.item}::considered`),
        timestamp,
        rawLine: line,
        itemName: cleanItemName(considerMatch.groups.item),
        ordinal: ordinalMatch?.groups?.ordinal ? Number(ordinalMatch.groups.ordinal) : null
      });
      continue;
    }

    const pendingListMatch = trimmed.match(
      /^(?<ordinal>\d+)\)\s+(?:\[[^\]]+\]\s*)?(?<item>.+?)\s+\|\s+Status:\s+Pending/i
    );
    if (pendingListMatch?.groups?.item) {
      finalizeSyncBlock();
      events.push({
        type: 'ITEM_CONSIDERED',
        key: buildEventKey(timestamp, `${pendingListMatch.groups.item}::pending`),
        timestamp,
        rawLine: line,
        itemName: cleanItemName(pendingListMatch.groups.item),
        ordinal: pendingListMatch.groups.ordinal
          ? Number(pendingListMatch.groups.ordinal)
          : null
      });
      continue;
    }

    const requestReplaceMatch = trimmed.match(
      /\[Loot Council] System said, '(?<player>.+?) has requested to be considered for (?<item>.+?) to replace (?<replace>.+?)\./i
    );
    if (requestReplaceMatch?.groups) {
      finalizeSyncBlock();
      events.push({
        type: 'REQUEST',
        key: buildEventKey(timestamp, `${requestReplaceMatch.groups.item}::${requestReplaceMatch.groups.player}::request`),
        timestamp,
        rawLine: line,
        itemName: cleanItemName(requestReplaceMatch.groups.item),
        playerName: requestReplaceMatch.groups.player.trim(),
        replacing: requestReplaceMatch.groups.replace.trim(),
        mode: 'REPLACING'
      });
      continue;
    }

    const requestNoReplaceMatch = trimmed.match(
      /\[Loot Council] System said, '(?<player>.+?) has requested to be considered for (?<item>.+?)\.\s+(?<playerRepeat>.+?) is not replacing anything\./i
    );
    if (requestNoReplaceMatch?.groups) {
      finalizeSyncBlock();
      events.push({
        type: 'REQUEST',
        key: buildEventKey(timestamp, `${requestNoReplaceMatch.groups.item}::${requestNoReplaceMatch.groups.player}::request`),
        timestamp,
        rawLine: line,
        itemName: cleanItemName(requestNoReplaceMatch.groups.item),
        playerName: requestNoReplaceMatch.groups.player.trim(),
        replacing: null,
        mode: 'NOT_REPLACING'
      });
      continue;
    }

    const voteMatch = trimmed.match(
      /\[Loot Council] System said, '(?<voter>.+?) has voted for (?<candidate>.+?) to recieve (?<item>.+?)'\s*$/i
    );
    if (voteMatch?.groups) {
      finalizeSyncBlock();
      events.push({
        type: 'VOTE',
        key: buildEventKey(
          timestamp,
          `${voteMatch.groups.item}::${voteMatch.groups.candidate}::vote::${voteMatch.groups.voter}`
        ),
        timestamp,
        rawLine: line,
        itemName: cleanItemName(voteMatch.groups.item),
        candidateName: voteMatch.groups.candidate.trim(),
        voterName: voteMatch.groups.voter.trim()
      });
      continue;
    }

    const awardMatch = trimmed.match(
      /^(?:\[[^\]]+\]\s*)?(?<item>.+?) has been awarded to (?<player>.+?) by the Loot Council(?:\.)?/i
    );
    if (awardMatch?.groups) {
      finalizeSyncBlock();
      events.push({
        type: 'AWARD',
        key: buildEventKey(timestamp, `${awardMatch.groups.item}::award`),
        timestamp,
        rawLine: line,
        itemName: cleanItemName(awardMatch.groups.item),
        awardedTo: awardMatch.groups.player.trim()
      });
      continue;
    }

    const donationMatch = trimmed.match(
      /^(?:\[[^\]]+\]\s*)?(?<item>.+?) has been donated to the Master Looter's guild\./i
    );
    if (donationMatch?.groups) {
      finalizeSyncBlock();
      events.push({
        type: 'DONATION',
        key: buildEventKey(timestamp, `${donationMatch.groups.item}::donation`),
        timestamp,
        rawLine: line,
        itemName: cleanItemName(donationMatch.groups.item)
      });
      continue;
    }


    const randomAwardMatch = trimmed.match(
      /^(?:\[[^\]]+\]\s*)?(?<item>.+?) has been awarded to (?<player>.+?) by random roll\./i
    );
    if (randomAwardMatch?.groups) {
      finalizeSyncBlock();
      const cleanedItem = cleanItemName(randomAwardMatch.groups.item);
      events.push({
        type: 'RANDOM_AWARD',
        key: buildEventKey(timestamp, `${cleanedItem}::random-award`),
        timestamp,
        rawLine: line,
        itemName: cleanedItem,
        awardedTo: randomAwardMatch.groups.player.trim()
      });
      continue;
    }

    const masterLootedMatch = trimmed.match(
      /^(?:\[[^\]]+\]\s*)?(?<item>.+?) has been looted by the Master Looter\./i
    );
    if (masterLootedMatch?.groups) {
      finalizeSyncBlock();
      const cleanedItem = cleanItemName(masterLootedMatch.groups.item);
      events.push({
        type: 'MASTER_LOOTED',
        key: buildEventKey(timestamp, `${cleanedItem}::master-looted`),
        timestamp,
        rawLine: line,
        itemName: cleanedItem
      });
      continue;
    }

    const leftOnMatch = trimmed.match(
      /^(?:\[[^\]]+\]\s*)?(?<item>.+?) has been left on the '(?<target>.+?)'\./i
    );
    if (leftOnMatch?.groups) {
      finalizeSyncBlock();
      const cleanedItem = cleanItemName(leftOnMatch.groups.item);
      events.push({
        type: 'LEFT_ON_CORPSE',
        key: buildEventKey(timestamp, `${cleanedItem}::left-on`),
        timestamp,
        rawLine: line,
        itemName: cleanedItem
      });
      continue;
    }

    const syncHeaderMatch = trimmed.match(
      /^-+\s*\[Showing All Loot Requests For:\s*{(?<item>.+?)}$/i
    );
    if (syncHeaderMatch?.groups?.item) {
      finalizeSyncBlock();
      currentSync = {
        itemName: cleanItemName(syncHeaderMatch.groups.item),
        timestamp,
        rawLine: line,
        requests: [],
        markedEmpty: false
      };
      pendingSyncRequest = null;
      continue;
    }

    if (currentSync) {
      if (/^There are no loot requests for this item\./i.test(trimmed)) {
        currentSync.markedEmpty = true;
        pendingSyncRequest = null;
        continue;
      }

      const syncRequestMatch = trimmed.match(
        /^Request\s+#\d+\)\s+(?<player>[^,]+),\s+Current Votes:\s+(?<votes>\d+)/i
      );
      if (syncRequestMatch?.groups) {
        if (pendingSyncRequest) {
          currentSync.requests.push({
            playerName: pendingSyncRequest.playerName,
            votes: pendingSyncRequest.votes ?? null,
            replacing: null,
            mode: 'REPLACING'
          });
        }
        pendingSyncRequest = {
          playerName: syncRequestMatch.groups.player.trim(),
          votes: Number(syncRequestMatch.groups.votes),
          timestamp,
          rawLine: line
        };
        continue;
      }

      const syncReplaceMatch = trimmed.match(/^Item Replaced:\s+(?<replacement>.+?)\s+-->/i);
      if (syncReplaceMatch?.groups && pendingSyncRequest) {
        currentSync.requests.push({
          playerName: pendingSyncRequest.playerName,
          votes: pendingSyncRequest.votes ?? null,
          replacing: syncReplaceMatch.groups.replacement.trim(),
          mode: 'REPLACING'
        });
        pendingSyncRequest = null;
        continue;
      }

      if (/^-{5,}/.test(trimmed) || /^\/{5,}/.test(trimmed)) {
        finalizeSyncBlock();
        continue;
      }
    }
  }

  finalizeSyncBlock();
  return events;
}

function extractTimestamp(line: string) {
  const match = line.match(timestampRegex);
  if (!match?.groups) {
    return null;
  }
  const { day, month, date, time, year } = match.groups;
  const composed = `${day} ${month} ${date} ${time} ${year}`;
  const parsed = new Date(composed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinRaid(timestamp: Date, start: Date, end?: Date | null) {
  if (timestamp < start) {
    return false;
  }
  if (end && timestamp > end) {
    return false;
  }
  return true;
}

function cleanItemName(value: string) {
  return value.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function buildEventKey(timestamp: Date, identifier: string) {
  return `${timestamp.toISOString()}::${identifier}`;
}
