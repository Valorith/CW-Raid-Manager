export interface MediaWikiRenderOptions {
  resolveWikiLink?: (target: string) => string | null;
}

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

function renderInline(source: string, options: MediaWikiRenderOptions): string {
  const tokens: string[] = [];
  const preserve = (html: string) => {
    const token = `\u0000WIKI_TOKEN_${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };

  let value = source.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, rawTarget, rawLabel) => {
    const target = String(rawTarget).trim();
    const label = String(rawLabel ?? rawTarget).trim();
    const resolved = options.resolveWikiLink?.(target) ?? null;
    if (!resolved) {
      return preserve(
        `<span class="wiki-link wiki-link--unresolved" title="Boss page not found">${escapeHtml(label)}</span>`
      );
    }
    return preserve(`<a class="wiki-link" href="${escapeHtml(resolved)}">${escapeHtml(label)}</a>`);
  });

  value = value.replace(
    /\[((?:https?:\/\/|mailto:)[^\s\]]+)(?:\s+([^\]]+))?\]/gi,
    (_match, rawUrl, rawLabel) => {
      const url = safeExternalUrl(String(rawUrl));
      const label = String(rawLabel ?? rawUrl).trim();
      if (!url) {
        return escapeHtml(label);
      }
      return preserve(
        `<a class="wiki-external-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      );
    }
  );

  value = escapeHtml(value);
  value = value.replace(/'''''(.+?)'''''/g, '<strong><em>$1</em></strong>');
  value = value.replace(/'''(.+?)'''/g, '<strong>$1</strong>');
  value = value.replace(/''(.+?)''/g, '<em>$1</em>');

  tokens.forEach((html, index) => {
    value = value.replace(`\u0000WIKI_TOKEN_${index}\u0000`, html);
  });
  return value;
}

function renderTable(lines: string[], options: MediaWikiRenderOptions): string {
  const rows: Array<{ cells: string[]; header: boolean }> = [];
  let caption = '';

  for (const line of lines.slice(1, -1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('|-')) continue;
    if (trimmed.startsWith('|+')) {
      caption = trimmed.slice(2).trim();
      continue;
    }
    if (trimmed.startsWith('!')) {
      rows.push({ cells: trimmed.slice(1).split(/\s*!!\s*/), header: true });
      continue;
    }
    if (trimmed.startsWith('|')) {
      rows.push({ cells: trimmed.slice(1).split(/\s*\|\|\s*/), header: false });
    }
  }

  if (rows.length === 0) return '';
  const captionHtml = caption ? `<caption>${renderInline(caption, options)}</caption>` : '';
  const rowsHtml = rows
    .map((row) => {
      const tag = row.header ? 'th' : 'td';
      const cells = row.cells.map((cell) => `<${tag}>${renderInline(cell, options)}</${tag}>`);
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
  return `<div class="wiki-table-wrap"><table class="wiki-table">${captionHtml}<tbody>${rowsHtml}</tbody></table></div>`;
}

export function renderMediaWiki(source: string, options: MediaWikiRenderOptions = {}): string {
  const normalized = source.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const output: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${renderInline(paragraph.join(' '), options)}</p>`);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (trimmed.startsWith('{|')) {
      flushParagraph();
      const tableLines = [line];
      while (index + 1 < lines.length) {
        index += 1;
        tableLines.push(lines[index]);
        if (lines[index].trim() === '|}') break;
      }
      output.push(renderTable(tableLines, options));
      continue;
    }

    const heading = trimmed.match(/^(={1,6})\s*(.+?)\s*\1$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(6, Math.max(2, heading[1].length));
      output.push(`<h${level}>${renderInline(heading[2], options)}</h${level}>`);
      continue;
    }

    const template = trimmed.match(/^\{\{(Note|Tip|Warning)\|([\s\S]+)\}\}$/i);
    if (template) {
      flushParagraph();
      const kind = template[1].toLowerCase();
      output.push(
        `<aside class="wiki-callout wiki-callout--${kind}"><strong>${escapeHtml(template[1])}</strong><p>${renderInline(template[2], options)}</p></aside>`
      );
      continue;
    }

    if (/^-{4,}$/.test(trimmed)) {
      flushParagraph();
      output.push('<hr>');
      continue;
    }

    const listMatch = line.match(/^([*#]+)\s*(.+)$/);
    if (listMatch) {
      flushParagraph();
      const marker = listMatch[1][0];
      const listLines = [listMatch[2]];
      while (index + 1 < lines.length) {
        const next = lines[index + 1].match(new RegExp(`^\\${marker}+\\s*(.+)$`));
        if (!next) break;
        index += 1;
        listLines.push(next[1]);
      }
      const tag = marker === '*' ? 'ul' : 'ol';
      output.push(
        `<${tag}>${listLines.map((item) => `<li>${renderInline(item, options)}</li>`).join('')}</${tag}>`
      );
      continue;
    }

    if (line.startsWith(':')) {
      flushParagraph();
      output.push(`<blockquote>${renderInline(line.slice(1).trim(), options)}</blockquote>`);
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
  return output.filter(Boolean).join('\n');
}
