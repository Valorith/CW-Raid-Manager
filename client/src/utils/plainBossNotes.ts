import type { PlainBossNotesDocument } from '../services/api';

export function plainBossNotesValues(document: PlainBossNotesDocument): Record<string, string> {
  return Object.fromEntries(
    document.lines.flatMap((line) =>
      line.segments.flatMap((segment) =>
        segment.type === 'editable' ? [[segment.id, segment.value] as const] : []
      )
    )
  );
}

export function plainBossNotesChanged(
  current: Record<string, string>,
  original: Record<string, string>
): boolean {
  const currentKeys = Object.keys(current);
  const originalKeys = Object.keys(original);
  return (
    currentKeys.length !== originalKeys.length ||
    currentKeys.some((key) => current[key] !== original[key])
  );
}
