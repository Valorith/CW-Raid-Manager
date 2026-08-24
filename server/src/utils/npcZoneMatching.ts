const ZONE_APOSTROPHE_PATTERN = /[`´‘’ʼ]/gu;

const DIRECTION_WORDS: Readonly<Record<string, string>> = {
  e: 'east',
  n: 'north',
  s: 'south',
  w: 'west'
};

function normalizeZoneText(value: string) {
  return value
    .replace(ZONE_APOSTROPHE_PATTERN, "'")
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getZoneTokens(value: string) {
  const tokens = normalizeZoneText(value).split(' ').filter(Boolean);
  if (tokens[0] === 'the') {
    tokens.shift();
  }
  return tokens.map((token) => DIRECTION_WORDS[token] ?? token);
}

function getEditDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function getTrackedNpcZoneMatchRank(logZone: string, configuredZone: string) {
  const rawLogZone = normalizeZoneText(logZone);
  const rawConfiguredZone = normalizeZoneText(configuredZone);
  if (!rawLogZone || !rawConfiguredZone) {
    return null;
  }
  if (rawLogZone === rawConfiguredZone) {
    return 0;
  }

  const logTokens = getZoneTokens(logZone);
  const configuredTokens = getZoneTokens(configuredZone);
  const canonicalLogZone = logTokens.join(' ');
  const canonicalConfiguredZone = configuredTokens.join(' ');
  if (canonicalLogZone === canonicalConfiguredZone) {
    return 1;
  }

  const compactLogZone = logTokens.join('');
  const compactConfiguredZone = configuredTokens.join('');
  if (compactLogZone === compactConfiguredZone) {
    return 2;
  }

  // EQ sometimes presents directional city zones in reverse order, such as
  // "Cabilis West" in the log and "West Cabilis" in tracker configuration.
  if (
    logTokens.length === configuredTokens.length &&
    [...logTokens].sort().join(' ') === [...configuredTokens].sort().join(' ')
  ) {
    return 3;
  }

  // Keep typo tolerance deliberately narrow. A unique one-character correction handles
  // observed spellings such as Drakkal/Drakkel without treating prefixes as zone matches.
  if (
    Math.min(compactLogZone.length, compactConfiguredZone.length) >= 7 &&
    Math.abs(compactLogZone.length - compactConfiguredZone.length) <= 1 &&
    getEditDistance(compactLogZone, compactConfiguredZone) === 1
  ) {
    return 4;
  }

  return null;
}

export function findUniqueBestTrackedNpcZoneMatch<T extends { zoneName?: string | null }>(
  logZone: string,
  candidates: readonly T[]
): T | null {
  const ranked = candidates.flatMap((candidate) => {
    if (!candidate.zoneName) {
      return [];
    }
    const rank = getTrackedNpcZoneMatchRank(logZone, candidate.zoneName);
    return rank === null ? [] : [{ candidate, rank }];
  });
  const bestRank = ranked.reduce(
    (best, candidate) => Math.min(best, candidate.rank),
    Number.POSITIVE_INFINITY
  );
  const bestMatches = ranked.filter((candidate) => candidate.rank === bestRank);
  return bestMatches.length === 1 ? bestMatches[0].candidate : null;
}
