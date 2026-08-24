export const ENRAGED_CORFLUNK_NAME = 'Enraged Corflunk';
export const ENRAGED_ZARCHOOMI_NAME = 'Enraged Zarchoomi';
export const ENRAGED_TWINS_COMPLETION_WINDOW_MS = 2 * 60 * 1000;

const CLASSIC_BRAAG_NAME = 'braag the morphling';

export interface EncounterKillEvent {
  npcName: string;
  occurredAt: Date;
  killerName?: string | null;
  zoneName?: string | null;
}

export interface EncounterCompletion {
  npcName: string;
  occurredAt: Date;
  killerName: string | null;
  zoneName: string | null;
}

function normalizeNpcName(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeZoneIdentity(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function buildEncounterKillKey(event: Pick<EncounterKillEvent, 'npcName' | 'occurredAt'>) {
  return `${normalizeNpcName(event.npcName)}|${event.occurredAt.toISOString()}`;
}

export function isEnragedTwinNpcName(value: string) {
  const normalized = normalizeNpcName(value);
  return (
    normalized === ENRAGED_CORFLUNK_NAME.toLowerCase() ||
    normalized === ENRAGED_ZARCHOOMI_NAME.toLowerCase()
  );
}

// Classic Braag's apparent death is an intermediate morph transition. The real encounter
// completion is emitted separately from his final "Until next time..." shout with no killer.
export function shouldDeferStandaloneTrackerKill(
  event: Pick<EncounterKillEvent, 'npcName' | 'killerName' | 'zoneName'>
) {
  return (
    normalizeNpcName(event.npcName) === CLASSIC_BRAAG_NAME &&
    Boolean(event.killerName) &&
    normalizeZoneIdentity(event.zoneName) === 'shadowspine'
  );
}

export function findEnragedTwinsCompletions(
  events: EncounterKillEvent[],
  relevantEventKeys?: ReadonlySet<string>
) {
  const corflunks = events
    .filter((event) => normalizeNpcName(event.npcName) === ENRAGED_CORFLUNK_NAME.toLowerCase())
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const zarchoomis = events
    .filter((event) => normalizeNpcName(event.npcName) === ENRAGED_ZARCHOOMI_NAME.toLowerCase())
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const usedZarchoomiKeys = new Set<string>();
  const completions: EncounterCompletion[] = [];

  for (const corflunk of corflunks) {
    const corflunkKey = buildEncounterKillKey(corflunk);
    const matchingZarchoomi = zarchoomis
      .filter((zarchoomi) => {
        const key = buildEncounterKillKey(zarchoomi);
        return (
          !usedZarchoomiKeys.has(key) &&
          Math.abs(zarchoomi.occurredAt.getTime() - corflunk.occurredAt.getTime()) <=
            ENRAGED_TWINS_COMPLETION_WINDOW_MS &&
          (!relevantEventKeys || relevantEventKeys.has(corflunkKey) || relevantEventKeys.has(key))
        );
      })
      .sort(
        (left, right) =>
          Math.abs(left.occurredAt.getTime() - corflunk.occurredAt.getTime()) -
          Math.abs(right.occurredAt.getTime() - corflunk.occurredAt.getTime())
      )[0];

    if (!matchingZarchoomi) {
      continue;
    }

    const zarchoomiKey = buildEncounterKillKey(matchingZarchoomi);
    usedZarchoomiKeys.add(zarchoomiKey);
    const finalKill =
      corflunk.occurredAt >= matchingZarchoomi.occurredAt ? corflunk : matchingZarchoomi;
    const otherKill = finalKill === corflunk ? matchingZarchoomi : corflunk;
    completions.push({
      npcName: ENRAGED_CORFLUNK_NAME,
      occurredAt: finalKill.occurredAt,
      killerName: finalKill.killerName?.trim() || null,
      zoneName: finalKill.zoneName?.trim() || otherKill.zoneName?.trim() || null
    });
  }

  return completions;
}
