const timestampRegex =
  /^\[(?<day>\w{3}) (?<month>\w{3}) (?<date>\d{1,2}) (?<time>\d{2}:\d{2}:\d{2}) (?<year>\d{4})]/;

export type LootCouncilInterestMode = 'REPLACING' | 'NOT_REPLACING';

export type LootCouncilConsideredOrigin = 'ANNOUNCE' | 'PENDING';

export type LootCouncilEvent =
  | {
      type: 'ITEM_CONSIDERED';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
      ordinal?: number | null;
      origin: LootCouncilConsideredOrigin;
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
      sessionId?: number | null;
      sessionOrder?: number | null;
      sessionItemIndex?: number | null;
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
    }
  | {
      type: 'DISCARDED';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
    }
  | {
      type: 'WITHDRAWAL';
      key: string;
      timestamp: Date;
      rawLine: string;
      itemName: string;
      playerName: string;
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
  sessionId: number | null;
  sessionOrder: number | null;
  sessionItemIndex: number | null;
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
  let syncSessionId = 0;
  let syncSessionActive = false;
  let syncSessionExplicit = false;
  let syncSessionBlockOrder = 0;
  let syncSessionItemIndexes = new Map<string, number>();
  let pendingPreviousSnapshot: Map<string, PendingSnapshotEntry> | null = null;
  let pendingBuildingSnapshot: Map<string, PendingSnapshotEntry> | null = null;
  let pendingBlockActive = false;

  interface PendingSnapshotEntry {
    itemName: string;
    rawLine: string;
    timestamp: Date;
  }

  const pendingLootHeaderPattern = /^-+\s*Pending Loot\s*-+$/i;

  const finalizePendingSnapshot = (timestamp: Date) => {
    if (!pendingBuildingSnapshot) {
      pendingBlockActive = false;
      return;
    }
    if (pendingPreviousSnapshot) {
      for (const [key, entry] of pendingPreviousSnapshot) {
        if (!pendingBuildingSnapshot.has(key)) {
          events.push({
            type: 'DISCARDED',
            key: buildEventKey(timestamp, `${entry.itemName}::pending-discard`),
            timestamp,
            rawLine: entry.rawLine,
            itemName: entry.itemName
          });
        }
      }
    }
    pendingPreviousSnapshot = pendingBuildingSnapshot;
    pendingBuildingSnapshot = null;
    pendingBlockActive = false;
  };

  const summaryStartPattern = /^\/{2,}\s*Showing All Loot Requests\s*\/{2,}$/i;

  function beginSyncSession(explicit: boolean) {
    syncSessionId += 1;
    syncSessionActive = true;
    syncSessionExplicit = explicit;
    syncSessionBlockOrder = 0;
    syncSessionItemIndexes = new Map();
  }

  function endSyncSession() {
    syncSessionActive = false;
    syncSessionExplicit = false;
    syncSessionBlockOrder = 0;
    syncSessionItemIndexes = new Map();
  }

  function registerSessionItemIndex(itemName: string) {
    if (!syncSessionActive) {
      return null;
    }
    const key = cleanItemName(itemName).toLowerCase();
    const next = (syncSessionItemIndexes.get(key) ?? 0) + 1;
    syncSessionItemIndexes.set(key, next);
    return next;
  }

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
    const identifierParts = [
      currentSync.itemName,
      'sync-summary',
      currentSync.requests.length.toString(),
      (currentSync.sessionItemIndex ?? 0).toString()
    ];
    events.push({
      type: 'SYNC_SUMMARY',
      key: buildEventKey(currentSync.timestamp, identifierParts.join('::')),
      timestamp: currentSync.timestamp,
      rawLine: currentSync.rawLine,
      itemName: currentSync.itemName,
      requests: currentSync.requests,
      empty: currentSync.markedEmpty && currentSync.requests.length === 0,
      sessionId: currentSync.sessionId,
      sessionOrder: currentSync.sessionOrder,
      sessionItemIndex: currentSync.sessionItemIndex
    });
    currentSync = null;
    pendingSyncRequest = null;
  }

  let lastTimestamp: Date | null = null;

  for (const rawLine of lines) {
    const sanitizedLine = sanitizeLogLine(rawLine);
    const timestamp = extractTimestamp(sanitizedLine);
    if (!timestamp || !isWithinRaid(timestamp, raidStart, raidEnd)) {
      continue;
    }
    lastTimestamp = timestamp;
    let handledPendingBlockLine = false;
    const trimmed = sanitizedLine.trim();
    if (!trimmed) {
      if (pendingBlockActive) {
        handledPendingBlockLine = true;
      }
      continue;
    }
    const lineBody = stripTimestampPrefix(trimmed);

    if (summaryStartPattern.test(lineBody)) {
      finalizeSyncBlock();
      if (!syncSessionActive) {
        beginSyncSession(true);
      }
      continue;
    }
    if (isSummaryEndLine(lineBody)) {
      finalizeSyncBlock();
      if (syncSessionActive) {
        endSyncSession();
        continue;
      }
    }

    if (pendingLootHeaderPattern.test(lineBody)) {
      finalizePendingSnapshot(timestamp);
      pendingBuildingSnapshot = new Map();
      pendingBlockActive = true;
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
        rawLine,
        itemName: cleanItemName(considerMatch.groups.item),
        ordinal: ordinalMatch?.groups?.ordinal ? Number(ordinalMatch.groups.ordinal) : null,
        origin: 'ANNOUNCE'
      });
      continue;
    }

    const pendingListMatch = trimmed.match(
      /^(?<ordinal>\d+)\)\s+(?:\[(?<zone>[^\]]+)\]\s*)?(?<item>.+?)\s+\|\s+Status:\s+Pending(?:\s+\|\s+NPC:\s+(?<npc>.+))?/i
    );
    if (pendingListMatch?.groups?.item) {
      handledPendingBlockLine = true;
      finalizeSyncBlock();
      const cleanedItem = cleanItemName(pendingListMatch.groups.item);
      if (pendingBuildingSnapshot) {
        const zoneKey = pendingListMatch.groups.zone?.trim().toLowerCase() ?? 'unknown-zone';
        const npcKey = pendingListMatch.groups.npc?.trim().toLowerCase() ?? 'unknown-npc';
        const normalizedKey = `${cleanedItem.toLowerCase()}::${zoneKey}::${npcKey}`;
        pendingBuildingSnapshot.set(normalizedKey, {
          itemName: cleanedItem,
          rawLine,
          timestamp
        });
      }
      events.push({
        type: 'ITEM_CONSIDERED',
        key: buildEventKey(timestamp, `${pendingListMatch.groups.item}::pending`),
        timestamp,
        rawLine,
        itemName: cleanedItem,
        ordinal: pendingListMatch.groups.ordinal
          ? Number(pendingListMatch.groups.ordinal)
          : null,
        origin: 'PENDING'
      });
      continue;
    }

    if (pendingBlockActive) {
      const normalizedBody = lineBody.trim();
      if (
        /^Options:/i.test(normalizedBody) ||
        /^\[Loot Council]/i.test(normalizedBody) ||
        /^>/.test(normalizedBody) ||
        /^-+/.test(normalizedBody) ||
        normalizedBody.length === 0
      ) {
        handledPendingBlockLine = true;
        continue;
      }
    }

    if (pendingBlockActive && !handledPendingBlockLine) {
      finalizePendingSnapshot(timestamp);
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
        rawLine,
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
        rawLine,
        itemName: cleanItemName(requestNoReplaceMatch.groups.item),
        playerName: requestNoReplaceMatch.groups.player.trim(),
        replacing: null,
        mode: 'NOT_REPLACING'
      });
      continue;
    }

    const withdrawalMatch = trimmed.match(
      /\[Loot Council] System said, '(?<player>.+?) has withdrawn their interest in (?<item>.+?)!'\s*$/i
    );
    if (withdrawalMatch?.groups) {
      finalizeSyncBlock();
      events.push({
        type: 'WITHDRAWAL',
        key: buildEventKey(timestamp, `${withdrawalMatch.groups.item}::${withdrawalMatch.groups.player}::withdrawal`),
        timestamp,
        rawLine,
        itemName: cleanItemName(withdrawalMatch.groups.item),
        playerName: withdrawalMatch.groups.player.trim()
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
        rawLine,
        itemName: cleanItemName(voteMatch.groups.item),
        candidateName: voteMatch.groups.candidate.trim(),
        voterName: voteMatch.groups.voter.trim()
      });
      continue;
    }

    const awardMatch = trimmed.match(
      /^(?:\[[^\]]+\]\s*)?(?<item>.+?) has been awarded to (?<player>.+?) by the (?:Loot Council|Master Looter)(?:\.)?/i
    );
    if (awardMatch?.groups) {
      finalizeSyncBlock();
      events.push({
        type: 'AWARD',
        key: buildEventKey(timestamp, `${awardMatch.groups.item}::award`),
        timestamp,
        rawLine,
        itemName: cleanItemName(awardMatch.groups.item),
        awardedTo: awardMatch.groups.player.trim()
      });
      continue;
    }

    // Donation/left-on/master loot patterns handled below


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
        rawLine,
        itemName: cleanedItem,
        awardedTo: randomAwardMatch.groups.player.trim()
      });
      continue;
    }

    const dispositionMatch = trimmed.match(
      /^(?:\[[^\]]+\]\s*)?(?<item>.+?) (?:has been donated to the Master Looter(?:'s)? guild|has been left on the '(?<target>.+?)'|has been looted by the Master Looter)\./i
    );
    if (dispositionMatch?.groups) {
      finalizeSyncBlock();
      const cleanedItem = cleanItemName(dispositionMatch.groups.item);
      const keySuffix = dispositionMatch.groups.target ? 'left-on' : 'master/dispose';
      events.push({
        type: 'LEFT_ON_CORPSE',
        key: buildEventKey(timestamp, `${cleanedItem}::${keySuffix}`),
        timestamp,
        rawLine,
        itemName: cleanedItem
      });
      continue;
    }

    const discardedMatch = trimmed.match(/(?:.*\.\s+)?(?<item>[^.]+?)\s+discarded!$/i);
    if (discardedMatch?.groups) {
      finalizeSyncBlock();
      const cleanedItem = cleanItemName(discardedMatch.groups.item);
      events.push({
        type: 'DISCARDED',
        key: buildEventKey(timestamp, `${cleanedItem}::discarded`),
        timestamp,
        rawLine,
        itemName: cleanedItem
      });
      continue;
    }

    const syncHeaderMatch = lineBody.match(
      /^-+\s*\[?Showing All Loot Requests For:\s*{(?<item>.+?)}]?$/i
    );
    if (syncHeaderMatch?.groups?.item) {
      finalizeSyncBlock();
      if (!syncSessionActive) {
        beginSyncSession(false);
      }
      syncSessionBlockOrder = syncSessionActive ? syncSessionBlockOrder + 1 : syncSessionBlockOrder;
      currentSync = {
        itemName: cleanItemName(syncHeaderMatch.groups.item),
        timestamp,
        rawLine,
        requests: [],
        markedEmpty: false,
        sessionId: syncSessionActive && syncSessionExplicit ? syncSessionId : null,
        sessionOrder: syncSessionActive ? syncSessionBlockOrder : null,
        sessionItemIndex: registerSessionItemIndex(syncHeaderMatch.groups.item)
      };
      pendingSyncRequest = null;
      continue;
    }

    if (currentSync) {
      if (/^There are no loot requests for this item\./i.test(lineBody)) {
        currentSync.markedEmpty = true;
        pendingSyncRequest = null;
        continue;
      }

      const syncRequestMatch = lineBody.match(
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
          rawLine
        };
        continue;
      }

      const syncReplaceMatch = lineBody.match(/^Item Replaced:\s+(?<replacement>.+?)\s+-->/i);
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

    }
  }

  finalizeSyncBlock();
  finalizePendingSnapshot(lastTimestamp ?? raidStart);
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
  return value
    .replace(/^\s*\d+\)\s*/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/^\s*\[[^\]]+]\s*/, '')
    .trim();
}

function sanitizeLogLine(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]/g, '');
}

function isSummaryEndLine(value: string) {
  if (!/^[/\s]+$/.test(value)) {
    return false;
  }
  const slashCount = (value.match(/\//g) ?? []).length;
  return slashCount >= 5;
}

function stripTimestampPrefix(value: string) {
  return value.replace(/^\[[^\]]+]\s*/, '');
}

function buildEventKey(timestamp: Date, identifier: string) {
  return `${timestamp.toISOString()}::${identifier}`;
}
