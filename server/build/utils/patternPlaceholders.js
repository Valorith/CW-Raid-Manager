const PLACEHOLDER_PATTERN = /\{([a-z0-9_]+)\}/i;
const PLACEHOLDER_SCAN_PATTERN = /\{([a-z0-9_]+)\}/gi;
const PLACEHOLDER_REGEX_MAP = {
    timestamp: '\\[[^\\]]+\\]',
    looter: '(?<looter>.+?)',
    item: '(?<item>[^.]+?)',
    method: '(?<method>[^.]+?)',
    itemid: '\\((?<itemId>\\d{1,10})\\)'
};
export function convertPlaceholdersToRegex(input) {
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
    let match;
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
function escapeLiteral(segment) {
    return segment
        .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
        .replace(/\s+/g, '\\s+');
}
