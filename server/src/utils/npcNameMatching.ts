export const NPC_NAME_APOSTROPHE_VARIANTS = [
  "'",
  '`',
  '´',
  'ʹ',
  'ʻ',
  'ʼ',
  'ʽ',
  'ˈ',
  '‘',
  '’',
  '‛',
  '′',
  '‵',
  '❛',
  '❜',
  '＇',
  'ꞌ'
] as const;

const APOSTROPHE_LIKE_PATTERN = new RegExp(`[${NPC_NAME_APOSTROPHE_VARIANTS.join('')}]`, 'gu');

function normalizeWhitespace(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizePunctuation(value: string) {
  // Replace before compatibility normalization because characters such as the spacing acute
  // accent (U+00B4) decompose into a space plus combining mark under NFKC. Replace once more
  // afterward to cover quote characters produced or retained by normalization.
  return normalizeWhitespace(value.replace(APOSTROPHE_LIKE_PATTERN, "'")).replace(
    APOSTROPHE_LIKE_PATTERN,
    "'"
  );
}

function compactName(value: string) {
  return value.replace(/^the /, '').replace(/[^\p{L}\p{N}]/gu, '');
}

export interface NpcNameMatchOptions {
  // Loot listings drop titles ("Prince Thirneg" for "Prince Thirneg the Petulant"). Death lines
  // keep them, so a bare base name there may be a different NPC and is not matched by default.
  allowOmittedTitle?: boolean;
}

// Lower ranks are stronger. EQ log names can differ from configured names by apostrophe style,
// a leading "The", a title present on only one side ("Vynoissu the Undying" in death lines,
// "Prince Thirneg" in loot lines), or hyphenation and spacing ("All-Seeing Eye", "AllSeeing Eye").
export function getTrackedNpcNameMatchRank(
  logName: string,
  configuredName: string,
  options: NpcNameMatchOptions = {}
) {
  const log = normalizePunctuation(logName);
  const configured = normalizePunctuation(configuredName);

  if (!log || !configured) {
    return null;
  }
  if (log === configured) {
    return 0;
  }

  const logWithoutArticle = log.replace(/^the /, '');
  const configuredWithoutArticle = configured.replace(/^the /, '');
  if (logWithoutArticle === configuredWithoutArticle) {
    return 1;
  }

  if (log.startsWith(`${configured} the `)) {
    return 2;
  }

  if (options.allowOmittedTitle && configured.startsWith(`${log} the `)) {
    return 3;
  }

  const compactLog = compactName(log);
  if (compactLog.length >= 4 && compactLog === compactName(configured)) {
    return 4;
  }

  return null;
}

export function findBestTrackedNpcNameMatches<T extends { npcName: string }>(
  logName: string,
  definitions: readonly T[],
  options: NpcNameMatchOptions = {}
): T[] {
  const ranked = definitions.flatMap((definition) => {
    const rank = getTrackedNpcNameMatchRank(logName, definition.npcName, options);
    return rank === null ? [] : [{ definition, rank }];
  });
  const bestRank = ranked.reduce(
    (best, candidate) => Math.min(best, candidate.rank),
    Number.POSITIVE_INFINITY
  );
  return ranked
    .filter((candidate) => candidate.rank === bestRank)
    .map((candidate) => candidate.definition);
}

// Compares two names seen in the log (a death line and a loot listing) for deduplication.
export function npcNamesReferToSameNpc(left: string, right: string) {
  const options = { allowOmittedTitle: true };
  return (
    getTrackedNpcNameMatchRank(left, right, options) !== null ||
    getTrackedNpcNameMatchRank(right, left, options) !== null
  );
}
