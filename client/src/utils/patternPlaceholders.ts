const PLACEHOLDER_PATTERN = /\{([a-z0-9_]+)\}/i;
const PLACEHOLDER_SCAN_PATTERN = /\{([a-z0-9_]+)\}/gi;

const PLACEHOLDER_REGEX_MAP: Record<string, string> = {
  timestamp: '\\[[^\\]]+\\]',
  looter: '(?<looter>.+?)',
  item: '(?<item>[^.]+?)',
  method: '(?<method>[^.]+?)'
};

const REVERSE_PLACEHOLDER_REPLACEMENTS = Object.entries(PLACEHOLDER_REGEX_MAP).map(([token, fragment]) => ({
  regex: new RegExp(escapeRegexForReverse(fragment), 'gi'),
  placeholder: `{${token}}`
}));

export function convertPlaceholdersToRegex(input: string): string {
  if (!input) {
    return '';
  }

  const trimmed = input.trim();
  if (!PLACEHOLDER_PATTERN.test(trimmed)) {
    return trimmed;
  }

  let result = '';
  let lastIndex = 0;
  PLACEHOLDER_SCAN_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_SCAN_PATTERN.exec(trimmed)) !== null) {
    const literal = trimmed.slice(lastIndex, match.index);
    if (literal) {
      result += escapeLiteral(literal);
    }

    const token = match[1]?.toLowerCase() ?? '';
    result += PLACEHOLDER_REGEX_MAP[token] ?? escapeLiteral(match[0]);
    lastIndex = match.index + match[0].length;
  }

  const tail = trimmed.slice(lastIndex);
  if (tail) {
    result += escapeLiteral(tail);
  }

  return result;
}

export function convertRegexToPlaceholders(pattern: string): string {
  if (!pattern) {
    return '';
  }

  let result = pattern;
  for (const { regex, placeholder } of REVERSE_PLACEHOLDER_REPLACEMENTS) {
    result = result.replace(regex, placeholder);
  }

  result = result
    .replace(/\\s\+/g, ' ')
    .replace(/\\([.*+?^${}()|[\]\\])/g, '$1');

  return result.trim();
}

function escapeLiteral(segment: string) {
  return segment
    .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}

function escapeRegexForReverse(fragment: string) {
  return fragment.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
