export interface MediaWikiRenderOptions {
  resolveWikiLink?: (target: string) => string | null;
  wikiBaseUrl?: string | null;
}

interface WikiLinkMarkup {
  end: number;
  inner: string;
}

interface WikiListEntry {
  content: string;
  markers: string;
}

interface WikiTableCell {
  attributes: string;
  content: string;
  header: boolean;
}

const DEFAULT_WIKI_BASE_URL = 'https://wiki.clumsysworld.com';
const MAX_IMAGE_WIDTH = 1600;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeResolvedUrl(value: string): string | null {
  if ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('#')) return value;
  return safeExternalUrl(value);
}

function wikiUrl(options: MediaWikiRenderOptions, target: string): string | null {
  if (!options.wikiBaseUrl) return null;

  try {
    const [pageName, ...fragmentParts] = target.split('#');
    const url = new URL('/index.php', options.wikiBaseUrl);
    url.searchParams.set('title', pageName.trim().replace(/ /g, '_'));
    const fragment = fragmentParts.join('#').trim();
    if (fragment) url.hash = fragment.replace(/ /g, '_');
    return url.toString();
  } catch {
    return null;
  }
}

function wikiFileUrl(
  options: MediaWikiRenderOptions,
  fileName: string,
  width?: number
): string | null {
  if (!options.wikiBaseUrl) return null;

  try {
    const url = new URL('/index.php', options.wikiBaseUrl);
    url.searchParams.set('title', `Special:Redirect/file/${fileName.trim().replace(/ /g, '_')}`);
    if (width) url.searchParams.set('width', String(width));
    return url.toString();
  } catch {
    return null;
  }
}

function parseWikiLinkAt(source: string, start: number): WikiLinkMarkup | null {
  if (!source.startsWith('[[', start)) return null;

  let doubleBracketDepth = 1;
  let singleBracketDepth = 0;
  let index = start + 2;

  while (index < source.length) {
    if (source.startsWith('[[', index) && singleBracketDepth === 0) {
      doubleBracketDepth += 1;
      index += 2;
      continue;
    }

    if (source[index] === '[' && source[index + 1] !== '[') {
      singleBracketDepth += 1;
      index += 1;
      continue;
    }

    if (source[index] === ']' && singleBracketDepth > 0) {
      singleBracketDepth -= 1;
      index += 1;
      continue;
    }

    if (source.startsWith(']]', index) && singleBracketDepth === 0) {
      doubleBracketDepth -= 1;
      if (doubleBracketDepth === 0) {
        return {
          inner: source.slice(start + 2, index),
          end: index + 2
        };
      }
      index += 2;
      continue;
    }

    index += 1;
  }

  return null;
}

function parseWholeWikiLink(source: string): string | null {
  const parsed = parseWikiLinkAt(source, 0);
  return parsed && parsed.end === source.length ? parsed.inner : null;
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let doubleBracketDepth = 0;
  let singleBracketDepth = 0;
  let quote = '';

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      current += character;
      if (character === quote) quote = '';
      continue;
    }

    const precedingText = source.slice(0, index).trimEnd();
    const previousNonWhitespace = precedingText[precedingText.length - 1];
    if ((character === '"' || character === "'") && previousNonWhitespace === '=') {
      quote = character;
      current += character;
      continue;
    }

    if (source.startsWith('[[', index)) {
      doubleBracketDepth += 1;
      current += '[[';
      index += 1;
      continue;
    }

    if (source.startsWith(']]', index) && doubleBracketDepth > 0) {
      doubleBracketDepth -= 1;
      current += ']]';
      index += 1;
      continue;
    }

    if (character === '[') singleBracketDepth += 1;
    if (character === ']' && singleBracketDepth > 0) singleBracketDepth -= 1;

    if (
      source.startsWith(separator, index) &&
      doubleBracketDepth === 0 &&
      singleBracketDepth === 0
    ) {
      parts.push(current);
      current = '';
      index += separator.length - 1;
      continue;
    }

    current += character;
  }

  parts.push(current);
  return parts;
}

function plainWikiText(source: string): string {
  return source
    .replace(/\[\[(?:File|Image):[^\]]+\]\]/gi, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[(?:https?:\/\/|mailto:)[^\s\]]+\s+([^\]]+)\]/gi, '$1')
    .replace(/'{2,5}/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function renderFile(
  source: string,
  options: MediaWikiRenderOptions,
  block: boolean
): string | null {
  const parts = splitTopLevel(source, '|');
  const fileMatch = parts[0]?.trim().match(/^(?:File|Image)\s*:\s*(.+)$/i);
  if (!fileMatch) return null;

  const fileName = fileMatch[1].trim();
  let alignment = '';
  let altText = '';
  let caption = '';
  let linkTarget = '';
  let linkSpecified = false;
  let thumbnail = false;
  let width: number | undefined;

  for (const rawPart of parts.slice(1)) {
    const part = rawPart.trim();
    const normalized = part.toLowerCase();
    const widthMatch = normalized.match(/^(\d+)(?:x\d+)?px$/);

    if (['left', 'right', 'center', 'none'].includes(normalized)) {
      alignment = normalized;
    } else if (normalized === 'thumb' || normalized === 'thumbnail' || normalized === 'frame') {
      thumbnail = true;
    } else if (normalized === 'frameless' || normalized === 'border' || normalized === 'upright') {
      // These options affect native MediaWiki chrome, but do not contribute caption text.
    } else if (widthMatch) {
      width = Math.min(MAX_IMAGE_WIDTH, Math.max(1, Number(widthMatch[1])));
    } else if (normalized.startsWith('alt=')) {
      altText = part.slice(part.indexOf('=') + 1).trim();
    } else if (normalized.startsWith('link=')) {
      linkSpecified = true;
      linkTarget = part.slice(part.indexOf('=') + 1).trim();
    } else if (part) {
      caption = part;
    }
  }

  const src = wikiFileUrl(options, fileName, width);
  if (!src) return `<span class="wiki-file-missing">${escapeHtml(fileName)}</span>`;

  const fallbackAlt = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const image = `<img src="${escapeHtml(src)}" alt="${escapeHtml(altText || plainWikiText(caption) || fallbackAlt)}" loading="lazy">`;
  let linkedImage = image;

  if (linkSpecified && linkTarget !== '') {
    const explicitLink = safeExternalUrl(linkTarget) ?? wikiUrl(options, linkTarget);
    if (explicitLink) {
      linkedImage = `<a class="wiki-file__link" href="${escapeHtml(explicitLink)}" target="_blank" rel="noopener noreferrer">${image}</a>`;
    }
  } else if (!linkSpecified) {
    const filePage = wikiUrl(options, `File:${fileName}`);
    if (filePage) {
      linkedImage = `<a class="wiki-file__link" href="${escapeHtml(filePage)}" target="_blank" rel="noopener noreferrer">${image}</a>`;
    }
  }

  const widthStyle = width ? ` style="--wiki-file-width: ${width}px"` : '';
  const captionHtml = caption ? `<figcaption>${renderInline(caption, options)}</figcaption>` : '';
  const effectiveBlock = block || thumbnail || Boolean(alignment);

  if (!effectiveBlock) {
    return `<span class="wiki-file wiki-file--inline"${widthStyle}>${linkedImage}</span>`;
  }

  const classes = [
    'wiki-file',
    'wiki-file--block',
    thumbnail ? 'wiki-file--thumb' : '',
    alignment ? `wiki-file--${alignment}` : ''
  ]
    .filter(Boolean)
    .join(' ');

  return `<figure class="${classes}"${widthStyle}>${linkedImage}${captionHtml}</figure>`;
}

function renderInternalLink(source: string, options: MediaWikiRenderOptions): string {
  const parts = splitTopLevel(source, '|');
  const target = parts[0]?.trim() ?? '';
  const label = (parts.slice(1).join('|') || target).trim();

  if (/^(?:File|Image)\s*:/i.test(target)) {
    return renderFile(source, options, false) ?? escapeHtml(label);
  }

  if (/^Category\s*:/i.test(target)) return '';

  const resolved = options.resolveWikiLink?.(target) ?? null;
  const safeResolved = resolved ? safeResolvedUrl(resolved) : null;
  if (safeResolved) {
    return `<a class="wiki-link" href="${escapeHtml(safeResolved)}">${renderInline(label, options)}</a>`;
  }

  const fallback = wikiUrl(options, target);
  if (fallback) {
    return `<a class="wiki-link wiki-link--external-wiki" href="${escapeHtml(fallback)}" target="_blank" rel="noopener noreferrer">${renderInline(label, options)}</a>`;
  }

  return `<span class="wiki-link wiki-link--unresolved" title="Wiki page not found">${renderInline(label, options)}</span>`;
}

function renderInline(source: string, options: MediaWikiRenderOptions): string {
  const tokens: string[] = [];
  const preserve = (html: string) => {
    const token = `\u0000WIKI_TOKEN_${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };

  let value = source.replace(/<!--([\s\S]*?)-->/g, '');
  value = value.replace(/<nowiki>([\s\S]*?)<\/nowiki>/gi, (_match, literal) =>
    preserve(escapeHtml(String(literal)))
  );
  value = value.replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, '');
  value = value.replace(/<ref\b[^>]*\/\s*>/gi, '');

  let withLinks = '';
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseWikiLinkAt(value, index);
    if (!parsed) {
      withLinks += value[index];
      continue;
    }

    withLinks += preserve(renderInternalLink(parsed.inner, options));
    index = parsed.end - 1;
  }
  value = withLinks;

  value = value.replace(
    /\[((?:https?:\/\/|mailto:)[^\s\]]+)(?:\s+([^\]]+))?\]/gi,
    (_match, rawUrl, rawLabel) => {
      const url = safeExternalUrl(String(rawUrl));
      const label = String(rawLabel ?? rawUrl).trim();
      if (!url) return escapeHtml(label);
      return preserve(
        `<a class="wiki-external-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      );
    }
  );

  value = value.replace(
    /<\s*(\/?)\s*(br|code|kbd|samp|sub|sup|small|big|u|s|strike)\s*\/?>/gi,
    (_match, closing, rawTag) => {
      const tag = String(rawTag).toLowerCase() === 'strike' ? 's' : String(rawTag).toLowerCase();
      if (tag === 'br') return preserve('<br>');
      return preserve(`<${closing ? '/' : ''}${tag}>`);
    }
  );

  value = escapeHtml(value);
  value = value.replace(/'''''(.+?)'''''/g, '<strong><em>$1</em></strong>');
  value = value.replace(/'''(.+?)'''/g, '<strong>$1</strong>');
  value = value.replace(/''(.+?)''/g, '<em>$1</em>');
  value = value.replace(/&amp;((?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+));/gi, '&$1;');

  tokens.forEach((html, index) => {
    value = value.replaceAll(`\u0000WIKI_TOKEN_${index}\u0000`, html);
  });
  return value;
}

function safeTableStyle(value: string): string {
  const allowed: string[] = [];

  for (const declaration of value.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator === -1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = declaration.slice(separator + 1).trim();
    const normalizedValue = propertyValue.toLowerCase();

    if (
      property === 'text-align' &&
      ['left', 'center', 'right', 'justify'].includes(normalizedValue)
    ) {
      allowed.push(`${property}: ${normalizedValue}`);
    } else if (
      property === 'vertical-align' &&
      ['top', 'middle', 'bottom', 'baseline'].includes(normalizedValue)
    ) {
      allowed.push(`${property}: ${normalizedValue}`);
    } else if (property === 'font-weight' && /^(?:normal|bold|[1-9]00)$/.test(normalizedValue)) {
      allowed.push(`${property}: ${normalizedValue}`);
    } else if (
      (property === 'color' || property === 'background-color' || property === 'border-color') &&
      /^#[0-9a-f]{3,8}$/i.test(normalizedValue)
    ) {
      allowed.push(`${property}: ${normalizedValue}`);
    } else if (property === 'width' && /^\d+(?:\.\d+)?(?:px|em|rem|%)$/.test(normalizedValue)) {
      allowed.push(`${property}: ${normalizedValue}`);
    }
  }

  return allowed.join('; ');
}

function renderTableAttributes(source: string): string {
  const attributes: string[] = [];
  const matcher = /([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/gi;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(source))) {
    const name = match[1].toLowerCase();
    const value = String(match[2] ?? match[3] ?? match[4] ?? '').trim();

    if (name === 'colspan' || name === 'rowspan') {
      const size = Number(value);
      if (Number.isInteger(size) && size >= 1 && size <= 100) {
        attributes.push(`${name}="${size}"`);
      }
    } else if (name === 'style') {
      const style = safeTableStyle(value);
      if (style) attributes.push(`style="${escapeHtml(style)}"`);
    } else if (name === 'scope' && ['row', 'col', 'rowgroup', 'colgroup'].includes(value)) {
      attributes.push(`scope="${value}"`);
    }
  }

  return attributes.length ? ` ${attributes.join(' ')}` : '';
}

function splitTableAttributePrefix(source: string): { attributes: string; content: string } {
  let quote = '';
  let doubleBracketDepth = 0;
  let singleBracketDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    const precedingText = source.slice(0, index).trimEnd();
    const previousNonWhitespace = precedingText[precedingText.length - 1];
    if ((character === '"' || character === "'") && previousNonWhitespace === '=') {
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
    if (character === '[') singleBracketDepth += 1;
    if (character === ']' && singleBracketDepth > 0) singleBracketDepth -= 1;
    if (character !== '|' || doubleBracketDepth || singleBracketDepth) continue;

    const prefix = source.slice(0, index).trim();
    if (/[a-z][\w-]*\s*=/i.test(prefix)) {
      return {
        attributes: prefix,
        content: source.slice(index + 1).trim()
      };
    }
    break;
  }

  return { attributes: '', content: source.trim() };
}

function parseTableCells(source: string, header: boolean): WikiTableCell[] {
  const separator = header ? '!!' : '||';
  return splitTopLevel(source, separator).map((rawCell) => {
    const cell = splitTableAttributePrefix(rawCell);
    return {
      header,
      attributes: cell.attributes,
      content: cell.content
    };
  });
}

function renderTable(lines: string[], options: MediaWikiRenderOptions): string {
  const rows: WikiTableCell[][] = [];
  let currentRow: WikiTableCell[] = [];
  let caption = '';

  const flushRow = () => {
    if (currentRow.length) rows.push(currentRow);
    currentRow = [];
  };

  for (const line of lines.slice(1, -1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('|-')) {
      flushRow();
      continue;
    }
    if (trimmed.startsWith('|+')) {
      caption = splitTableAttributePrefix(trimmed.slice(2)).content;
      continue;
    }
    if (trimmed.startsWith('!')) {
      currentRow.push(...parseTableCells(trimmed.slice(1), true));
      continue;
    }
    if (trimmed.startsWith('|')) {
      currentRow.push(...parseTableCells(trimmed.slice(1), false));
      continue;
    }
    if (currentRow.length) {
      currentRow[currentRow.length - 1].content += ` ${trimmed}`;
    }
  }
  flushRow();

  if (rows.length === 0) return '';
  const captionHtml = caption ? `<caption>${renderInline(caption, options)}</caption>` : '';
  const rowsHtml = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => {
            const tag = cell.header ? 'th' : 'td';
            return `<${tag}${renderTableAttributes(cell.attributes)}>${renderInline(cell.content, options)}</${tag}>`;
          })
          .join('')}</tr>`
    )
    .join('');

  return `<div class="wiki-table-wrap"><table class="wiki-table">${captionHtml}<tbody>${rowsHtml}</tbody></table></div>`;
}

function listContainer(marker: string): 'dl' | 'ol' | 'ul' {
  if (marker === '#') return 'ol';
  if (marker === ';' || marker === ':') return 'dl';
  return 'ul';
}

function listItemTag(marker: string): 'dd' | 'dt' | 'li' {
  if (marker === ';') return 'dt';
  if (marker === ':') return 'dd';
  return 'li';
}

function renderListEntries(
  entries: WikiListEntry[],
  options: MediaWikiRenderOptions,
  depth = 0
): string {
  let output = '';
  let index = 0;

  while (index < entries.length) {
    const entryMarkers = entries[index].markers;
    const marker = entryMarkers[depth] ?? entryMarkers[entryMarkers.length - 1] ?? '*';
    const container = listContainer(marker);
    output += `<${container}>`;

    while (index < entries.length) {
      const entry = entries[index];
      const entryMarker = entry.markers[depth] ?? entry.markers[entry.markers.length - 1] ?? '*';
      if (listContainer(entryMarker) !== container) break;

      const itemTag = listItemTag(entryMarker);
      let nextIndex = index + 1;
      while (nextIndex < entries.length && entries[nextIndex].markers.length > depth + 1) {
        nextIndex += 1;
      }
      const children = entries.slice(index + 1, nextIndex);
      const childHtml = children.length ? renderListEntries(children, options, depth + 1) : '';
      output += `<${itemTag}>${renderInline(entry.content, options)}${childHtml}</${itemTag}>`;
      index = nextIndex;
    }

    output += `</${container}>`;
  }

  return output;
}

function headingId(source: string, counts: Map<string, number>): string {
  const base =
    plainWikiText(source)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  const count = (counts.get(base) ?? 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function renderCategories(categories: string[], options: MediaWikiRenderOptions): string {
  if (!categories.length) return '';
  const unique = [...new Set(categories)];
  const links = unique
    .map((category) => {
      const href = wikiUrl(options, `Category:${category}`);
      return href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(category)}</a>`
        : `<span>${escapeHtml(category)}</span>`;
    })
    .join('');
  return `<nav class="wiki-categories" aria-label="Categories"><strong>Categories:</strong><div>${links}</div></nav>`;
}

export function renderMediaWiki(source: string, options: MediaWikiRenderOptions = {}): string {
  const resolvedOptions: MediaWikiRenderOptions = {
    ...options,
    wikiBaseUrl: options.wikiBaseUrl === undefined ? DEFAULT_WIKI_BASE_URL : options.wikiBaseUrl
  };
  const normalized = source.replace(/\r\n?/g, '\n').replace(/<!--([\s\S]*?)-->/g, '');
  const lines = normalized.split('\n');
  const output: string[] = [];
  const categories: string[] = [];
  const headingCounts = new Map<string, number>();
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${renderInline(paragraph.join(' '), resolvedOptions)}</p>`);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (/^__(?:NOTOC|TOC|FORCETOC|NOEDITSECTION)__$/i.test(trimmed)) {
      flushParagraph();
      continue;
    }

    const wholeWikiLink = parseWholeWikiLink(trimmed);
    if (wholeWikiLink) {
      const category = wholeWikiLink.match(/^Category\s*:\s*([^|]+)(?:\|.*)?$/i);
      if (category) {
        flushParagraph();
        categories.push(category[1].trim());
        continue;
      }

      if (/^(?:File|Image)\s*:/i.test(wholeWikiLink)) {
        flushParagraph();
        output.push(renderFile(wholeWikiLink, resolvedOptions, true) ?? '');
        continue;
      }
    }

    if (trimmed.startsWith('{|')) {
      flushParagraph();
      const tableLines = [line];
      while (index + 1 < lines.length) {
        index += 1;
        tableLines.push(lines[index]);
        if (lines[index].trim() === '|}') break;
      }
      output.push(renderTable(tableLines, resolvedOptions));
      continue;
    }

    const heading = trimmed.match(/^(={1,6})\s*(.+?)\s*\1$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(6, Math.max(2, heading[1].length));
      const id = headingId(heading[2], headingCounts);
      output.push(`<h${level} id="${id}">${renderInline(heading[2], resolvedOptions)}</h${level}>`);
      continue;
    }

    const template = trimmed.match(/^\{\{(Note|Tip|Warning)\|([\s\S]+)\}\}$/i);
    if (template) {
      flushParagraph();
      const kind = template[1].toLowerCase();
      output.push(
        `<aside class="wiki-callout wiki-callout--${kind}"><strong>${escapeHtml(template[1])}</strong><p>${renderInline(template[2], resolvedOptions)}</p></aside>`
      );
      continue;
    }

    if (/^-{4,}$/.test(trimmed)) {
      flushParagraph();
      output.push('<hr>');
      continue;
    }

    const listMatch = line.match(/^([*#;:]+)\s*(.*)$/);
    if (listMatch) {
      flushParagraph();
      const entries: WikiListEntry[] = [{ markers: listMatch[1], content: listMatch[2] }];
      while (index + 1 < lines.length) {
        const next = lines[index + 1].match(/^([*#;:]+)\s*(.*)$/);
        if (!next) break;
        index += 1;
        entries.push({ markers: next[1], content: next[2] });
      }
      output.push(renderListEntries(entries, resolvedOptions));
      continue;
    }

    if (/^\s/.test(line)) {
      flushParagraph();
      const preLines = [line.slice(1)];
      while (index + 1 < lines.length && /^\s/.test(lines[index + 1])) {
        index += 1;
        preLines.push(lines[index].slice(1));
      }
      output.push(`<pre>${escapeHtml(preLines.join('\n'))}</pre>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  output.push(renderCategories(categories, resolvedOptions));
  return output.filter(Boolean).join('\n');
}
