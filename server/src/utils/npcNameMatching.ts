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

function addPunctuationVariants(values: Set<string>, value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return;
  }
  const canonical = normalizePunctuation(normalized);
  values.add(normalized);
  values.add(canonical);
  for (const variant of NPC_NAME_APOSTROPHE_VARIANTS) {
    values.add(canonical.replace(/'/g, variant));
  }
}

export function buildTrackedNpcLookupCandidates(value: string) {
  const normalized = normalizePunctuation(value);
  const structuralCandidates = new Set<string>([normalized]);

  if (normalized.startsWith('the ')) {
    structuralCandidates.add(normalized.slice(4));
  } else {
    structuralCandidates.add(`the ${normalized}`);
  }

  const descriptorIndex = normalized.indexOf(' the ', 1);
  if (descriptorIndex > 0) {
    structuralCandidates.add(normalized.slice(0, descriptorIndex));
  }

  const candidates = new Set<string>();
  for (const candidate of structuralCandidates) {
    addPunctuationVariants(candidates, candidate);
  }
  candidates.delete('');
  return [...candidates];
}

export function buildTrackedNpcLookupPrefix(value: string) {
  const normalized = normalizePunctuation(value);
  const apostropheIndex = normalized.indexOf("'");
  if (apostropheIndex < 3) {
    return null;
  }
  return normalized.slice(0, apostropheIndex);
}

export function getTrackedNpcNameMatchRank(logName: string, configuredName: string) {
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

  return null;
}
