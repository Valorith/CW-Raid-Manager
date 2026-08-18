import { createHash } from 'node:crypto';

export const MAX_BOSS_NOTES_LENGTH = 200_000;

export type PlainBossNotesLineKind =
  | 'append'
  | 'blank'
  | 'heading'
  | 'list-item'
  | 'paragraph'
  | 'protected'
  | 'table-cell';

export type PlainBossNotesSegment =
  | {
      type: 'editable';
      id: string;
      value: string;
      role: 'link-label' | 'text';
    }
  | {
      type: 'protected';
      kind:
        | 'category'
        | 'comment'
        | 'formatting'
        | 'link'
        | 'media'
        | 'reference'
        | 'structure'
        | 'template';
      label: string;
    };

export interface PlainBossNotesLine {
  id: string;
  kind: PlainBossNotesLineKind;
  label: string;
  depth: number;
  segments: PlainBossNotesSegment[];
}

export interface PlainBossNotesDocument {
  revision: string;
  lines: PlainBossNotesLine[];
  fieldCount: number;
  protectedCount: number;
}

export class PlainBossNotesConversionError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_fields' | 'invalid_value' | 'revision_conflict' | 'too_large'
  ) {
    super(message);
    this.name = 'PlainBossNotesConversionError';
  }
}

interface EditableRange {
  id: string;
  start: number;
  end: number;
  sourceValue: string;
  displayValue: string;
  append: boolean;
}

interface ParsedPlainBossNotes {
  document: PlainBossNotesDocument;
  fields: EditableRange[];
}

interface SourceLine {
  start: number;
  text: string;
}

interface ParseContext {
  fields: EditableRange[];
  protectedCount: number;
}

const ALLOWED_INLINE_TAGS = new Set([
  'big',
  'br',
  'code',
  'kbd',
  's',
  'samp',
  'small',
  'strike',
  'sub',
  'sup',
  'u'
]);

function revisionFor(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: '\u00a0',
    quot: '"'
  };

  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));/gi,
    (match, decimal, hex, name) => {
      if (decimal) {
        const codePoint = Number(decimal);
        return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      }
      if (hex) {
        const codePoint = Number.parseInt(hex, 16);
        return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      }
      return named[String(name).toLowerCase()] ?? match;
    }
  );
}

export function encodePlainTextForWikitext(value: string): string {
  const entities: Record<string, string> = {
    '&': '&#38;',
    '<': '&#60;',
    '>': '&#62;',
    "'": '&#39;',
    '[': '&#91;',
    ']': '&#93;',
    '{': '&#123;',
    '}': '&#125;',
    '|': '&#124;',
    '=': '&#61;',
    '*': '&#42;',
    '#': '&#35;',
    ':': '&#58;',
    ';': '&#59;',
    '!': '&#33;',
    '-': '&#45;',
    _: '&#95;'
  };
  return Array.from(value, (character) => entities[character] ?? character).join('');
}

function splitSourceLines(source: string): SourceLine[] {
  if (!source) return [];
  const lines: SourceLine[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = cursor;
    while (cursor < source.length && source[cursor] !== '\n' && source[cursor] !== '\r') {
      cursor += 1;
    }
    lines.push({ start, text: source.slice(start, cursor) });
    if (source[cursor] === '\r' && source[cursor + 1] === '\n') cursor += 2;
    else if (cursor < source.length) cursor += 1;
  }
  return lines;
}

function pushProtected(
  segments: PlainBossNotesSegment[],
  context: ParseContext,
  kind: Extract<PlainBossNotesSegment, { type: 'protected' }>['kind'],
  label: string
) {
  segments.push({ type: 'protected', kind, label });
  context.protectedCount += 1;
}

function pushEditable(
  source: string,
  start: number,
  end: number,
  role: Extract<PlainBossNotesSegment, { type: 'editable' }>['role'],
  segments: PlainBossNotesSegment[],
  context: ParseContext
) {
  if (end <= start) return;
  const sourceValue = source.slice(start, end);
  if (!sourceValue.trim()) return;
  const field: EditableRange = {
    id: `field-${context.fields.length + 1}`,
    start,
    end,
    sourceValue,
    displayValue: decodeHtmlEntities(sourceValue),
    append: false
  };
  context.fields.push(field);
  segments.push({ type: 'editable', id: field.id, value: field.displayValue, role });
}

function findBalanced(
  source: string,
  start: number,
  open: string,
  close: string,
  limit: number
): number {
  let depth = 0;
  let singleBracketDepth = 0;
  for (let index = start; index < limit; index += 1) {
    if (source.startsWith(open, index)) {
      depth += 1;
      index += open.length - 1;
      continue;
    }
    if (open === '[[' && source[index] === '[') {
      singleBracketDepth += 1;
      continue;
    }
    if (open === '[[' && source[index] === ']' && singleBracketDepth > 0) {
      singleBracketDepth -= 1;
      continue;
    }
    if (source.startsWith(close, index) && depth > 0 && singleBracketDepth === 0) {
      depth -= 1;
      if (depth === 0) return index + close.length;
      index += close.length - 1;
    }
  }
  return -1;
}

function topLevelPipeIndexes(value: string): number[] {
  const indexes: number[] = [];
  let doubleBracketDepth = 0;
  let templateDepth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value.startsWith('[[', index)) {
      doubleBracketDepth += 1;
      index += 1;
      continue;
    }
    if (value.startsWith(']]', index) && doubleBracketDepth > 0) {
      doubleBracketDepth -= 1;
      index += 1;
      continue;
    }
    if (value.startsWith('{{', index)) {
      templateDepth += 1;
      index += 1;
      continue;
    }
    if (value.startsWith('}}', index) && templateDepth > 0) {
      templateDepth -= 1;
      index += 1;
      continue;
    }
    if (value[index] === '|' && doubleBracketDepth === 0 && templateDepth === 0) {
      indexes.push(index);
    }
  }
  return indexes;
}

function trimRange(source: string, start: number, end: number): { start: number; end: number } {
  while (start < end && /\s/.test(source[start])) start += 1;
  while (end > start && /\s/.test(source[end - 1])) end -= 1;
  return { start, end };
}

function protectedLinkLabel(inner: string): { kind: 'category' | 'link' | 'media'; label: string } {
  const firstPart = inner.split('|', 1)[0].trim();
  if (/^(?:File|Image)\s*:/i.test(firstPart)) {
    return {
      kind: 'media',
      label: `Media preserved: ${firstPart.replace(/^(?:File|Image)\s*:\s*/i, '')}`
    };
  }
  if (/^Category\s*:/i.test(firstPart)) {
    return {
      kind: 'category',
      label: `Category preserved: ${firstPart.replace(/^Category\s*:\s*/i, '')}`
    };
  }
  return { kind: 'link', label: `Link preserved: ${firstPart}` };
}

function parseInlineRange(
  source: string,
  start: number,
  end: number,
  segments: PlainBossNotesSegment[],
  context: ParseContext
) {
  let cursor = start;
  let plainStart = start;
  const flushPlain = (plainEnd: number) => {
    pushEditable(source, plainStart, plainEnd, 'text', segments, context);
  };

  while (cursor < end) {
    if (source.startsWith('<!--', cursor)) {
      flushPlain(cursor);
      const close = source.indexOf('-->', cursor + 4);
      const tokenEnd = close === -1 || close + 3 > end ? end : close + 3;
      pushProtected(segments, context, 'comment', 'Comment preserved');
      cursor = tokenEnd;
      plainStart = cursor;
      continue;
    }

    if (source.startsWith('{{', cursor)) {
      flushPlain(cursor);
      const tokenEnd = findBalanced(source, cursor, '{{', '}}', end);
      const resolvedEnd = tokenEnd === -1 ? end : tokenEnd;
      const title = source
        .slice(cursor + 2, resolvedEnd - (tokenEnd === -1 ? 0 : 2))
        .split('|', 1)[0]
        .trim();
      pushProtected(
        segments,
        context,
        'template',
        `Template preserved${title ? `: ${title}` : ''}`
      );
      cursor = resolvedEnd;
      plainStart = cursor;
      continue;
    }

    if (source.startsWith('[[', cursor)) {
      flushPlain(cursor);
      const tokenEnd = findBalanced(source, cursor, '[[', ']]', end);
      const resolvedEnd = tokenEnd === -1 ? end : tokenEnd;
      const innerStart = cursor + 2;
      const innerEnd = resolvedEnd - (tokenEnd === -1 ? 0 : 2);
      const inner = source.slice(innerStart, innerEnd);
      const protectedLabel = protectedLinkLabel(inner);
      const pipes = topLevelPipeIndexes(inner);
      if (protectedLabel.kind === 'link' && pipes.length > 0) {
        const labelStart = innerStart + pipes[pipes.length - 1] + 1;
        const labelRange = trimRange(source, labelStart, innerEnd);
        const labelSource = source.slice(labelRange.start, labelRange.end);
        if (
          labelSource &&
          !labelSource.includes('[') &&
          !labelSource.includes(']') &&
          !/[{}<>]|'{2,}/.test(labelSource)
        ) {
          pushProtected(segments, context, 'link', 'Link target preserved');
          pushEditable(source, labelRange.start, labelRange.end, 'link-label', segments, context);
        } else {
          pushProtected(segments, context, protectedLabel.kind, protectedLabel.label);
        }
      } else {
        pushProtected(segments, context, protectedLabel.kind, protectedLabel.label);
      }
      cursor = resolvedEnd;
      plainStart = cursor;
      continue;
    }

    if (source[cursor] === '[' && /^(?:https?:\/\/|mailto:)/i.test(source.slice(cursor + 1))) {
      flushPlain(cursor);
      const close = source.indexOf(']', cursor + 1);
      const resolvedEnd = close === -1 || close >= end ? end : close + 1;
      const innerEnd = resolvedEnd - (close === -1 || close >= end ? 0 : 1);
      const inner = source.slice(cursor + 1, innerEnd);
      const separator = inner.search(/\s/);
      if (separator > 0) {
        const labelRange = trimRange(source, cursor + 1 + separator, innerEnd);
        pushProtected(segments, context, 'link', 'External link target preserved');
        pushEditable(source, labelRange.start, labelRange.end, 'link-label', segments, context);
      } else {
        pushProtected(segments, context, 'link', `Link preserved: ${inner}`);
      }
      cursor = resolvedEnd;
      plainStart = cursor;
      continue;
    }

    if (source[cursor] === '<') {
      const tagEnd = source.indexOf('>', cursor + 1);
      if (tagEnd !== -1 && tagEnd < end) {
        const rawTag = source.slice(cursor, tagEnd + 1);
        const tagMatch = rawTag.match(/^<\s*\/?\s*([a-z0-9]+)/i);
        const tagName = tagMatch?.[1]?.toLowerCase() ?? '';
        flushPlain(cursor);
        if (tagName === 'ref' && !/^<\s*\/\s*ref/i.test(rawTag) && !/\/\s*>$/.test(rawTag)) {
          const closeMatch = /<\s*\/\s*ref\s*>/gi;
          closeMatch.lastIndex = tagEnd + 1;
          const match = closeMatch.exec(source.slice(0, end));
          cursor = match ? match.index + match[0].length : tagEnd + 1;
          pushProtected(segments, context, 'reference', 'Reference preserved');
        } else if (tagName === 'nowiki' && !/^<\s*\/\s*nowiki/i.test(rawTag)) {
          const closeIndex = source.toLowerCase().indexOf('</nowiki>', tagEnd + 1);
          cursor = closeIndex !== -1 && closeIndex < end ? closeIndex + 9 : tagEnd + 1;
          pushProtected(segments, context, 'formatting', 'Literal text preserved');
        } else {
          cursor = tagEnd + 1;
          if (tagName && !ALLOWED_INLINE_TAGS.has(tagName)) {
            pushProtected(segments, context, 'formatting', `Formatting preserved: ${tagName}`);
          }
        }
        plainStart = cursor;
        continue;
      }
    }

    if (source[cursor] === "'") {
      const quoteMatch = source.slice(cursor, end).match(/^'{2,5}/);
      if (quoteMatch) {
        flushPlain(cursor);
        cursor += quoteMatch[0].length;
        plainStart = cursor;
        continue;
      }
    }

    cursor += 1;
  }

  flushPlain(end);
}

function topLevelCellRanges(source: string, start: number, end: number, delimiter: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  let currentStart = start;
  let doubleBracketDepth = 0;
  let singleBracketDepth = 0;
  let templateDepth = 0;
  let quote = '';
  for (let index = start; index < end; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (
      (character === '"' || character === "'") &&
      source.slice(start, index).trimEnd().endsWith('=')
    ) {
      quote = character;
      continue;
    }
    if (source.startsWith('[[', index)) {
      doubleBracketDepth += 1;
      index += 1;
      continue;
    }
    if (source.startsWith(']]', index) && doubleBracketDepth > 0) {
      doubleBracketDepth -= 1;
      index += 1;
      continue;
    }
    if (source.startsWith('{{', index)) {
      templateDepth += 1;
      index += 1;
      continue;
    }
    if (source.startsWith('}}', index) && templateDepth > 0) {
      templateDepth -= 1;
      index += 1;
      continue;
    }
    if (character === '[') singleBracketDepth += 1;
    if (character === ']' && singleBracketDepth > 0) singleBracketDepth -= 1;
    if (
      doubleBracketDepth === 0 &&
      singleBracketDepth === 0 &&
      templateDepth === 0 &&
      source.startsWith(delimiter, index)
    ) {
      ranges.push({ start: currentStart, end: index });
      currentStart = index + delimiter.length;
      index += delimiter.length - 1;
    }
  }
  ranges.push({ start: currentStart, end });
  return ranges;
}

function tableCellContentRange(source: string, start: number, end: number) {
  const trimmed = trimRange(source, start, end);
  let doubleBracketDepth = 0;
  let singleBracketDepth = 0;
  let templateDepth = 0;
  let quote = '';
  for (let index = trimmed.start; index < trimmed.end; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (
      (character === '"' || character === "'") &&
      source.slice(trimmed.start, index).trimEnd().endsWith('=')
    ) {
      quote = character;
      continue;
    }
    if (source.startsWith('[[', index)) {
      doubleBracketDepth += 1;
      index += 1;
      continue;
    }
    if (source.startsWith(']]', index) && doubleBracketDepth > 0) {
      doubleBracketDepth -= 1;
      index += 1;
      continue;
    }
    if (source.startsWith('{{', index)) {
      templateDepth += 1;
      index += 1;
      continue;
    }
    if (source.startsWith('}}', index) && templateDepth > 0) {
      templateDepth -= 1;
      index += 1;
      continue;
    }
    if (character === '[') singleBracketDepth += 1;
    if (character === ']' && singleBracketDepth > 0) singleBracketDepth -= 1;
    if (character !== '|' || doubleBracketDepth || singleBracketDepth || templateDepth) continue;
    const prefix = source.slice(trimmed.start, index).trim();
    if (/[a-z][\w-]*\s*=/i.test(prefix)) return trimRange(source, index + 1, trimmed.end);
  }
  return trimmed;
}

function findAppendIndex(source: string): number {
  const trailingCategories = source.match(/(?:\r?\n)?(?:\s*\[\[Category\s*:[^\]]+\]\]\s*)+$/i);
  return trailingCategories?.index ?? source.length;
}

function parsePlainBossNotes(source: string): ParsedPlainBossNotes {
  const lines: PlainBossNotesLine[] = [];
  const context: ParseContext = { fields: [], protectedCount: 0 };
  let insideTable = false;

  for (const [lineIndex, sourceLine] of splitSourceLines(source).entries()) {
    const { start, text } = sourceLine;
    const trimmed = text.trim();
    const segments: PlainBossNotesSegment[] = [];
    let kind: PlainBossNotesLineKind = 'paragraph';
    let label = 'Text';
    let depth = 0;

    if (!trimmed) {
      kind = 'blank';
      label = 'Paragraph break';
    } else if (/^\{\|/.test(trimmed)) {
      insideTable = true;
      kind = 'protected';
      label = 'Table layout';
      pushProtected(segments, context, 'structure', 'Table layout preserved');
    } else if (insideTable && /^\|\}/.test(trimmed)) {
      insideTable = false;
      kind = 'protected';
      label = 'Table layout';
      pushProtected(segments, context, 'structure', 'Table layout preserved');
    } else if (insideTable && /^\|-/.test(trimmed)) {
      kind = 'protected';
      label = 'Table row';
      pushProtected(segments, context, 'structure', 'Table row preserved');
    } else {
      const heading = text.match(/^(\s*)(={2,6})(\s*)([\s\S]*?)(\s*)\2(\s*)$/);
      const list = text.match(/^(\s*)([*#:;]+)(\s*)([\s\S]*)$/);
      const preformatted = text.match(/^([ \t]+)(\S[\s\S]*)$/);
      if (heading) {
        kind = 'heading';
        depth = heading[2].length;
        label = `Heading ${depth}`;
        const contentStart = start + heading[1].length + heading[2].length + heading[3].length;
        parseInlineRange(source, contentStart, contentStart + heading[4].length, segments, context);
      } else if (list) {
        kind = 'list-item';
        depth = list[2].length;
        label = list[2].includes('#')
          ? 'Numbered item'
          : list[2].includes(':')
            ? 'Indented text'
            : 'Bullet item';
        const contentStart = start + list[1].length + list[2].length + list[3].length;
        parseInlineRange(source, contentStart, start + text.length, segments, context);
      } else if (preformatted && !insideTable) {
        label = 'Preformatted text';
        pushProtected(segments, context, 'structure', 'Indentation preserved');
        parseInlineRange(
          source,
          start + preformatted[1].length,
          start + text.length,
          segments,
          context
        );
      } else if (insideTable && /^\s*[!|]\+?/.test(text)) {
        kind = 'table-cell';
        label = 'Table text';
        const markerIndex = text.search(/[!|]/);
        const markerLength = text[markerIndex + 1] === '+' ? 2 : 1;
        const contentStart = start + markerIndex + markerLength;
        const delimiter = text[markerIndex] === '!' ? '!!' : '||';
        for (const [cellIndex, range] of topLevelCellRanges(
          source,
          contentStart,
          start + text.length,
          delimiter
        ).entries()) {
          if (cellIndex > 0) pushProtected(segments, context, 'structure', 'Next table cell');
          const content = tableCellContentRange(source, range.start, range.end);
          parseInlineRange(source, content.start, content.end, segments, context);
        }
      } else if (/^----+$/.test(trimmed)) {
        kind = 'protected';
        label = 'Divider';
        pushProtected(segments, context, 'structure', 'Divider preserved');
      } else {
        parseInlineRange(source, start, start + text.length, segments, context);
      }
    }

    if (trimmed && segments.length === 0) {
      kind = 'protected';
      label = 'Formatting';
      pushProtected(segments, context, 'formatting', 'Formatting preserved');
    }

    lines.push({ id: `line-${lineIndex + 1}`, kind, label, depth, segments });
  }

  const appendField: EditableRange = {
    id: `field-${context.fields.length + 1}`,
    start: findAppendIndex(source),
    end: findAppendIndex(source),
    sourceValue: '',
    displayValue: '',
    append: true
  };
  context.fields.push(appendField);
  lines.push({
    id: 'line-append',
    kind: 'append',
    label: 'Add text',
    depth: 0,
    segments: [{ type: 'editable', id: appendField.id, value: '', role: 'text' }]
  });

  return {
    document: {
      revision: revisionFor(source),
      lines,
      fieldCount: context.fields.length,
      protectedCount: context.protectedCount
    },
    fields: context.fields
  };
}

export function createPlainBossNotesDocument(
  source: string | null | undefined
): PlainBossNotesDocument {
  return parsePlainBossNotes(source ?? '').document;
}

function appendPlainText(source: string, index: number, value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  const converted = normalized
    .split('\n')
    .map((line) => encodePlainTextForWikitext(line))
    .join('\n');
  const before = source.slice(0, index);
  const after = source.slice(index);
  const prefix = !before
    ? ''
    : before.endsWith('\n\n')
      ? ''
      : before.endsWith('\n')
        ? '\n'
        : '\n\n';
  const suffix = !after || after.startsWith('\n') ? '' : '\n';
  return `${prefix}${converted}${suffix}`;
}

export function applyPlainBossNotesEdits(
  source: string | null | undefined,
  revision: string,
  values: Record<string, string>
): { changed: boolean; notes: string; document: PlainBossNotesDocument } {
  const original = source ?? '';
  const parsed = parsePlainBossNotes(original);
  if (parsed.document.revision !== revision) {
    throw new PlainBossNotesConversionError(
      'These notes changed after the plain-text editor was opened. Reload before saving.',
      'revision_conflict'
    );
  }

  const expectedIds = parsed.fields.map((field) => field.id).sort();
  const receivedIds = Object.keys(values).sort();
  if (
    expectedIds.length !== receivedIds.length ||
    expectedIds.some((id, index) => id !== receivedIds[index])
  ) {
    throw new PlainBossNotesConversionError(
      'The plain-text document is incomplete. Reload it before saving.',
      'invalid_fields'
    );
  }

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const field of parsed.fields) {
    const nextValue = values[field.id];
    if (typeof nextValue !== 'string') {
      throw new PlainBossNotesConversionError(
        'Every plain-text field must contain text.',
        'invalid_fields'
      );
    }
    if (!field.append && /[\r\n]/.test(nextValue)) {
      throw new PlainBossNotesConversionError(
        'Use the Add text area for new paragraphs. Existing lines cannot contain line breaks.',
        'invalid_value'
      );
    }
    if (field.append) {
      const insertion = appendPlainText(original, field.start, nextValue);
      if (insertion) replacements.push({ start: field.start, end: field.end, value: insertion });
    } else if (nextValue !== field.displayValue) {
      replacements.push({
        start: field.start,
        end: field.end,
        value: encodePlainTextForWikitext(nextValue)
      });
    }
  }

  let notes = original;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    notes = `${notes.slice(0, replacement.start)}${replacement.value}${notes.slice(replacement.end)}`;
  }
  if (notes.length > MAX_BOSS_NOTES_LENGTH) {
    throw new PlainBossNotesConversionError(
      `Boss notes must be ${MAX_BOSS_NOTES_LENGTH.toLocaleString()} characters or fewer.`,
      'too_large'
    );
  }

  return {
    changed: notes !== original,
    notes,
    document: createPlainBossNotesDocument(notes)
  };
}
