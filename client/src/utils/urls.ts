export interface NormalizedUrlResult {
  normalized: string | null;
  valid: boolean;
}

export function normalizeOptionalUrl(value?: string | null): NormalizedUrlResult {
  if (value === undefined || value === null) {
    return { normalized: null, valid: true };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { normalized: null, valid: true };
  }

  const normalized = tryParseUrl(trimmed) ?? tryParseUrl(`https://${trimmed}`);
  if (!normalized) {
    return { normalized: null, valid: false };
  }

  return { normalized, valid: true };
}

function tryParseUrl(value: string): string | null {
  try {
    return new URL(value).toString();
  } catch (error) {
    return null;
  }
}
