import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

type JsonRecord = Record<string, unknown>;

type OracleReviewRecord = {
  id: string;
  domain: 'quest-api' | 'schema' | 'docs';
  title: string;
  kind?: string;
  language?: string;
  signature?: string;
  summary?: string;
  aliases: string[];
  matchKeys: string[];
  sourceUrl?: string;
  sourceRef?: string;
  relatedDocs?: string[];
  provenance?: unknown;
};

const DEFAULT_REPO = 'https://github.com/Valorith/eqemu-oracle.git';
const DEFAULT_REF = 'main';
const DEFAULT_OUT = 'src/data/eqemuOracleReviewIndex.json';
const MAX_OUTPUT_BYTES = 6 * 1024 * 1024;
const DOC_SECTION_LIMIT = 700;
const DOC_SUMMARY_CHARS = 360;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1];
  }
  return undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function compactText(value: unknown, maxChars = DOC_SUMMARY_CHARS): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 1)}…` : normalized;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`"'()[\]{}]/g, ' ')
    .replace(/[^a-z0-9_:./-]+/g, ' ')
    .trim();
}

function unique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value ? normalizeKey(value) : '';
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function compactProvenance(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const effectiveSource = asString(record.effective_source);
  return effectiveSource ? { effectiveSource } : undefined;
}

function findDataRoot(sourceRoot: string): string {
  const candidates = [
    join(sourceRoot, 'plugins/eqemu-oracle/data'),
    join(sourceRoot, 'data')
  ];
  for (const candidate of candidates) {
    try {
      statSync(join(candidate, 'merged/quest-api/records.json'));
      statSync(join(candidate, 'manifest.json'));
      return candidate;
    } catch {
      // Try the next layout.
    }
  }
  throw new Error(`Could not find Oracle data under ${sourceRoot}`);
}

function maybeGit(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function resolveSource(): { sourceRoot: string; sourceCommit: string; cleanup?: () => void } {
  const sourceArg = argValue('--source') ?? process.env.ORACLE_CONTEXT_SOURCE_DIR;
  if (sourceArg) {
    const sourceRoot = resolve(sourceArg);
    return {
      sourceRoot,
      sourceCommit: maybeGit(['rev-parse', 'HEAD'], sourceRoot) ?? 'local-source'
    };
  }

  const repo = argValue('--repo') ?? process.env.ORACLE_CONTEXT_REPO ?? DEFAULT_REPO;
  const ref = argValue('--ref') ?? process.env.ORACLE_CONTEXT_REF ?? DEFAULT_REF;
  const tmpRoot = mkdtempSync(join(tmpdir(), 'eqemu-oracle-context-'));
  execFileSync('git', ['clone', '--depth=1', '--branch', ref, repo, tmpRoot], { stdio: 'inherit' });
  return {
    sourceRoot: tmpRoot,
    sourceCommit: maybeGit(['rev-parse', 'HEAD'], tmpRoot) ?? ref,
    cleanup: () => rmSync(tmpRoot, { recursive: true, force: true })
  };
}

function questRecord(record: JsonRecord): OracleReviewRecord | null {
  const id = asString(record.id);
  const name = asString(record.name);
  if (!id || !name) return null;

  const language = asString(record.language);
  const kind = asString(record.kind);
  if (kind === 'constant') return null;
  const container = asString(record.container);
  const signature = asString(record.signature);
  const aliases = unique([
    name,
    container,
    language,
    kind,
    signature,
    container && name ? `${container}.${name}` : undefined,
    container === 'quest' && name ? `quest::${name}` : undefined,
    container === 'plugin' && name ? `plugin::${name}` : undefined
  ]);

  return {
    id,
    domain: 'quest-api',
    title: [language, kind, container, name].filter(Boolean).join(' '),
    kind,
    language,
    signature,
    summary: compactText(signature ? `${signature}` : name, 220),
    aliases,
    matchKeys: aliases,
    sourceUrl: asString(record.source_url),
    sourceRef: asString(record.source_ref),
    relatedDocs: asStringArray(record.related_docs),
    provenance: compactProvenance(record.provenance)
  };
}

function schemaRecord(record: JsonRecord): OracleReviewRecord | null {
  const table = asString(record.table);
  if (!table) return null;
  const columns = Array.isArray(record.columns) ? (record.columns as JsonRecord[]) : [];
  const columnNames = columns.map((column) => asString(column.name)).filter((value): value is string => Boolean(value));
  const aliases = unique([table, ...columnNames, asString(record.category)]);
  return {
    id: `schema:${table}`,
    domain: 'schema',
    title: `schema table ${table}`,
    kind: 'table',
    summary: compactText(`Columns: ${columnNames.slice(0, 36).join(', ')}`, 420),
    aliases,
    matchKeys: aliases,
    sourceUrl: asString(record.source_url),
    sourceRef: asString(record.source_ref),
    provenance: compactProvenance(record.provenance)
  };
}

function docsRecord(record: JsonRecord): OracleReviewRecord | null {
  const id = asString(record.id);
  const heading = asString(record.heading) ?? asString(record.page_title);
  const summary = compactText(record.summary ?? record.content, DOC_SUMMARY_CHARS);
  if (!id || !heading || !summary) return null;
  const aliases = unique([
    ...asStringArray(record.search_aliases),
    heading,
    asString(record.page_title),
    asString(record.path),
    asString(record.slug)
  ]);
  return {
    id,
    domain: 'docs',
    title: `docs ${heading}`,
    kind: 'section',
    summary,
    aliases,
    matchKeys: aliases,
    sourceUrl: asString(record.docs_url) ?? asString(record.source_url),
    sourceRef: asString(record.source_ref)
  };
}

function isUsefulDocsSection(record: JsonRecord): boolean {
  const haystack = [
    record.id,
    record.heading,
    record.page_title,
    record.path,
    record.summary,
    record.content
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\b(quest|script|lua|perl|npc|spawn|zone|loot|item|merchant|task|database|schema|error|crash|rule|event|bot|spell)\b/.test(
    haystack
  );
}

function buildIndex(sourceRoot: string, sourceCommit: string) {
  const dataRoot = findDataRoot(sourceRoot);
  const mergedRoot = join(dataRoot, 'merged');
  const manifest = readJson<JsonRecord>(join(dataRoot, 'manifest.json'));

  const questRecords = readJson<JsonRecord[]>(join(mergedRoot, 'quest-api/records.json'))
    .map(questRecord)
    .filter((record): record is OracleReviewRecord => Boolean(record));
  const schemaRecords = readJson<JsonRecord[]>(join(mergedRoot, 'schema/index.json'))
    .map(schemaRecord)
    .filter((record): record is OracleReviewRecord => Boolean(record));
  const docsRecords = readJson<JsonRecord[]>(join(mergedRoot, 'docs/sections.json'))
    .filter(isUsefulDocsSection)
    .slice(0, DOC_SECTION_LIMIT)
    .map(docsRecord)
    .filter((record): record is OracleReviewRecord => Boolean(record));

  return {
    indexVersion: 1,
    generatedAt: new Date().toISOString(),
    oracleRepo: DEFAULT_REPO,
    sourceCommit,
    manifest,
    counts: {
      questApi: questRecords.length,
      schema: schemaRecords.length,
      docs: docsRecords.length
    },
    records: [...questRecords, ...schemaRecords, ...docsRecords]
  };
}

const source = resolveSource();
try {
  const outputPath = resolve(process.cwd(), argValue('--out') ?? process.env.ORACLE_CONTEXT_OUT ?? DEFAULT_OUT);
  const index = buildIndex(source.sourceRoot, source.sourceCommit);
  mkdirSync(resolve(outputPath, '..'), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(index)}\n`);
  const size = statSync(outputPath).size;
  if (size > MAX_OUTPUT_BYTES && !hasArg('--allow-large')) {
    throw new Error(
      `Generated Oracle review index is ${size} bytes, above ${MAX_OUTPUT_BYTES}. Refine the generator or pass --allow-large deliberately.`
    );
  }
  console.log(`Wrote ${outputPath}`);
  console.log(`Oracle commit: ${source.sourceCommit}`);
  console.log(`Records: ${index.records.length}; bytes: ${size}`);
} finally {
  source.cleanup?.();
}
