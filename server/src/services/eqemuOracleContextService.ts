import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

type OracleDomain = 'quest-api' | 'schema' | 'docs';

type OracleReviewRecord = {
  id: string;
  domain: OracleDomain;
  title: string;
  kind?: string;
  language?: string;
  signature?: string;
  summary?: string;
  aliases?: string[];
  matchKeys?: string[];
  sourceUrl?: string;
  sourceRef?: string;
  relatedDocs?: string[];
  provenance?: unknown;
};

type OracleReviewIndex = {
  indexVersion: number;
  generatedAt: string;
  oracleRepo: string;
  sourceCommit: string;
  manifest?: Record<string, unknown>;
  counts?: Record<string, number>;
  records: OracleReviewRecord[];
};

export type EqemuOracleContextTelemetry = {
  enabled: boolean;
  available: boolean;
  sourceCommit?: string;
  manifest?: Record<string, unknown>;
  selectedRecordIds: string[];
  recordCount: number;
  charCount: number;
  lookupMs: number;
  skippedReason?: string;
};

export type EqemuOracleContextResult = {
  promptText: string;
  telemetry: EqemuOracleContextTelemetry;
};

type PreparedIndex = {
  sourceCommit: string;
  manifest?: Record<string, unknown>;
  records: OracleReviewRecord[];
  exact: Map<string, number[]>;
  inverted: Map<string, number[]>;
};

const INDEX_FILENAME = 'eqemuOracleReviewIndex.json';
const MAX_INDEX_BYTES = 6 * 1024 * 1024;
const MAX_CONTEXT_CHARS = 10_000;
const MAX_CONTEXT_RECORDS = 8;
const MAX_FUZZY_TOKENS = 80;
const CACHE_LIMIT = 120;

const STOP_WORDS = new Set([
  'and',
  'the',
  'this',
  'that',
  'with',
  'from',
  'into',
  'error',
  'crash',
  'exception',
  'report',
  'stack',
  'line',
  'file',
  'unknown',
  'server',
  'client',
  'loaded',
  'module',
  'offset'
]);

let preparedIndex: PreparedIndex | null | undefined;
const contextCache = new Map<string, EqemuOracleContextResult>();

function indexCandidates(): string[] {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return [
    resolve(currentDir, '../data', INDEX_FILENAME),
    resolve(currentDir, '../../src/data', INDEX_FILENAME),
    resolve(process.cwd(), 'src/data', INDEX_FILENAME),
    resolve(process.cwd(), 'server/src/data', INDEX_FILENAME)
  ];
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`"'()[\]{}]/g, ' ')
    .replace(/[^a-z0-9_:./-]+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9_:/.-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return Array.from(new Set(tokens)).slice(0, MAX_FUZZY_TOKENS);
}

function addMapValue(map: Map<string, number[]>, key: string, index: number) {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  const values = map.get(normalized);
  if (values) {
    values.push(index);
  } else {
    map.set(normalized, [index]);
  }
}

function recordSearchText(record: OracleReviewRecord): string {
  return [
    record.id,
    record.title,
    record.kind,
    record.language,
    record.signature,
    record.summary,
    ...(record.aliases ?? []),
    ...(record.matchKeys ?? []),
    ...(record.relatedDocs ?? [])
  ]
    .filter(Boolean)
    .join(' ');
}

function loadPreparedIndex(): PreparedIndex | null {
  if (preparedIndex !== undefined) return preparedIndex;

  const indexPath = indexCandidates().find((candidate) => existsSync(candidate));
  if (!indexPath) {
    preparedIndex = null;
    return preparedIndex;
  }

  try {
    const size = statSync(indexPath).size;
    if (size > MAX_INDEX_BYTES) {
      console.warn(`[EQEmu Oracle] Review index is too large (${size} bytes); context enrichment disabled.`);
      preparedIndex = null;
      return preparedIndex;
    }

    const raw = JSON.parse(readFileSync(indexPath, 'utf-8')) as OracleReviewIndex;
    if (raw.indexVersion !== 1 || !Array.isArray(raw.records)) {
      throw new Error('Unexpected EQEmu Oracle review index shape.');
    }

    const exact = new Map<string, number[]>();
    const inverted = new Map<string, number[]>();
    raw.records.forEach((record, index) => {
      for (const key of [
        record.id,
        record.title,
        record.signature,
        ...(record.aliases ?? []),
        ...(record.matchKeys ?? [])
      ]) {
        if (key) addMapValue(exact, key, index);
      }
      for (const token of tokenize(recordSearchText(record))) {
        addMapValue(inverted, token, index);
      }
    });

    preparedIndex = {
      sourceCommit: raw.sourceCommit,
      manifest: compactManifest(raw.manifest),
      records: raw.records,
      exact,
      inverted
    };
  } catch (error) {
    console.warn('[EQEmu Oracle] Failed to load review index; context enrichment disabled.', error);
    preparedIndex = null;
  }

  return preparedIndex;
}

function compactManifest(manifest: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!manifest || typeof manifest !== 'object') return undefined;
  const sources = manifest.sources && typeof manifest.sources === 'object' ? manifest.sources : undefined;
  const counts = manifest.counts && typeof manifest.counts === 'object' ? manifest.counts : undefined;
  const freshnessState =
    typeof manifest.freshness_state === 'string' ? manifest.freshness_state : undefined;
  return { sources, counts, freshnessState };
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function cacheSet(key: string, value: EqemuOracleContextResult) {
  if (contextCache.size >= CACHE_LIMIT) {
    const oldest = contextCache.keys().next().value as string | undefined;
    if (oldest) contextCache.delete(oldest);
  }
  contextCache.set(key, value);
}

function extractIdentifiers(text: string): string[] {
  const identifiers = new Set<string>();
  const add = (value: string | undefined) => {
    const normalized = value ? normalizeKey(value) : '';
    if (normalized) identifiers.add(normalized);
  };

  for (const match of text.matchAll(/\bEVENT_[A-Z0-9_]+\b/g)) {
    add(match[0]);
  }
  for (const match of text.matchAll(/\b(quest|plugin)::([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    add(`${match[1]}::${match[2]}`);
    add(match[2]);
  }
  for (const match of text.matchAll(/\b(?:Undefined subroutine|function|method)\s+([A-Za-z_:][A-Za-z0-9_:]*)/gi)) {
    add(match[1]);
    add(match[1]?.split('::').pop());
  }
  for (const match of text.matchAll(/(?:^|[\s"'(])([A-Za-z0-9_./-]+\.(?:lua|pl|pm))(?::\d+)?/gi)) {
    add(match[1]);
    add(match[1]?.split(/[\\/]/).pop());
  }
  for (const match of text.matchAll(/\b([a-z][a-z0-9_]{2,})\.(?:id|name|itemid|charid|npcid|zoneid)\b/gi)) {
    add(match[1]);
  }

  return Array.from(identifiers).slice(0, 80);
}

function scoreDomain(domain: OracleDomain): number {
  if (domain === 'quest-api') return 30;
  if (domain === 'schema') return 20;
  return 5;
}

function formatRecord(record: OracleReviewRecord): string {
  const lines = [`- [${record.domain}] ${record.title}`];
  if (record.signature) lines.push(`  Signature: ${record.signature}`);
  if (record.summary) lines.push(`  Summary: ${record.summary}`);
  if (record.sourceUrl) lines.push(`  Source: ${record.sourceUrl}`);
  if (record.sourceRef) lines.push(`  Ref: ${record.sourceRef.slice(0, 12)}`);
  return lines.join('\n');
}

function buildResult(
  index: PreparedIndex | null,
  start: number,
  records: OracleReviewRecord[],
  skippedReason?: string
): EqemuOracleContextResult {
  let promptText = '';
  const selected: OracleReviewRecord[] = [];
  for (const record of records.slice(0, MAX_CONTEXT_RECORDS)) {
    const next = formatRecord(record);
    const candidate = promptText ? `${promptText}\n${next}` : next;
    if (candidate.length > MAX_CONTEXT_CHARS) break;
    promptText = candidate;
    selected.push(record);
  }

  const lookupMs = Math.round((performance.now() - start) * 10) / 10;
  return {
    promptText,
    telemetry: {
      enabled: true,
      available: Boolean(index),
      sourceCommit: index?.sourceCommit,
      manifest: index?.manifest,
      selectedRecordIds: selected.map((record) => record.id),
      recordCount: selected.length,
      charCount: promptText.length,
      lookupMs,
      skippedReason: selected.length > 0 ? undefined : skippedReason ?? 'no_relevant_context'
    }
  };
}

export function getEqemuOracleContextForCrashReport(input: string): EqemuOracleContextResult {
  const cacheKey = hashText(input);
  const cached = contextCache.get(cacheKey);
  if (cached) return cached;

  const start = performance.now();
  const index = loadPreparedIndex();
  if (!index) {
    const result = buildResult(null, start, [], 'index_unavailable');
    cacheSet(cacheKey, result);
    return result;
  }

  const scores = new Map<number, number>();
  for (const identifier of extractIdentifiers(input)) {
    const exactMatches = index.exact.get(identifier) ?? [];
    for (const recordIndex of exactMatches) {
      scores.set(recordIndex, (scores.get(recordIndex) ?? 0) + 120);
    }
  }

  for (const token of tokenize(input)) {
    const matches = index.inverted.get(token) ?? [];
    for (const recordIndex of matches.slice(0, 40)) {
      scores.set(recordIndex, (scores.get(recordIndex) ?? 0) + 2);
    }
  }

  const records = Array.from(scores.entries())
    .map(([recordIndex, score]) => ({ record: index.records[recordIndex], score }))
    .filter((item) => item.record)
    .sort((a, b) => {
      const domainDelta = scoreDomain(b.record.domain) - scoreDomain(a.record.domain);
      return b.score + scoreDomain(b.record.domain) - (a.score + scoreDomain(a.record.domain)) || domainDelta;
    })
    .map((item) => item.record);

  const result = buildResult(index, start, records);
  cacheSet(cacheKey, result);
  return result;
}
