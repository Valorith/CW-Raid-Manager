import { DEFAULT_GEMINI_MODEL } from './geminiCrashReviewService.js';

export interface PatchNoteChangeInput {
  id: string;
  publicId: number;
  title: string;
  description: string;
  category: string;
  subsystem: string;
  priority: string;
  targetBuild: string | null;
}

export interface GeneratedPatchNote {
  changeId: string;
  publicId: number;
  note: string;
}

const MAX_CHANGES = 50;
const MAX_DESCRIPTION_CHARS = 1400;
const MAX_OUTPUT_TOKENS = 8192;
const TEMPERATURE = 0.25;

async function createGeminiClient(apiKey: string) {
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey });
}

function requireGeminiApiKey(): string {
  const value = process.env.GEMINI_API_KEY;
  if (!value) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return value;
}

function htmlToPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
}

function normalizeNote(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/^\s*\d+\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackNote(change: PatchNoteChangeInput): string {
  const title = change.title.replace(/^\[[^\]]+\]\s*/, '').trim();
  const area = change.subsystem || change.category;
  return area ? `${title} improves ${area.toLowerCase()} behavior.` : `${title} has been updated.`;
}

function parsePatchNoteResponse(text: string): Array<{ publicId?: unknown; changeId?: unknown; note?: unknown }> {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Gemini returned patch notes in an unexpected format.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Gemini returned patch notes in an unexpected format.');
  }

  return parsed as Array<{ publicId?: unknown; changeId?: unknown; note?: unknown }>;
}

export async function generatePatchNotesForChanges(
  changes: PatchNoteChangeInput[]
): Promise<{ notes: GeneratedPatchNote[]; model: string }> {
  const apiKey = requireGeminiApiKey();
  const ai = await createGeminiClient(apiKey);
  const limitedChanges = changes.slice(0, MAX_CHANGES);

  const promptChanges = limitedChanges.map((change, index) => ({
    order: index + 1,
    changeId: change.id,
    publicId: change.publicId,
    title: change.title,
    category: change.category,
    subsystem: change.subsystem,
    priority: change.priority,
    targetBuild: change.targetBuild,
    description: truncate(htmlToPlainText(change.description), MAX_DESCRIPTION_CHARS)
  }));

  const prompt = [
    'You write public patch notes for an EverQuest emulator server.',
    'Generate one patch note for each completed Test Manager change below, preserving the input order.',
    'Each note must be one to three sentences, with a strong preference for one clear sentence.',
    'Write player/admin-facing notes that describe the practical improvement without mentioning testing workflow, QA, checklist progress, pass counts, internal IDs, or implementation minutiae unless needed for clarity.',
    'Do not number the notes. Do not use markdown.',
    'Return ONLY valid JSON as an array. Each item must have exactly: "changeId", "publicId", "note".',
    '',
    JSON.stringify(promptChanges, null, 2)
  ].join('\n');

  const response = await ai.models.generateContent({
    model: DEFAULT_GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE
    }
  });

  const responseText = response.text ?? '';
  const parsed = parsePatchNoteResponse(responseText);
  const notesByChangeId = new Map<string, string>();
  const notesByPublicId = new Map<number, string>();

  parsed.forEach((item) => {
    const note = normalizeNote(item.note);
    if (!note) {
      return;
    }
    if (typeof item.changeId === 'string') {
      notesByChangeId.set(item.changeId, note);
    }
    if (typeof item.publicId === 'number') {
      notesByPublicId.set(item.publicId, note);
    }
  });

  return {
    model: DEFAULT_GEMINI_MODEL,
    notes: limitedChanges.map((change) => ({
      changeId: change.id,
      publicId: change.publicId,
      note: notesByChangeId.get(change.id) ?? notesByPublicId.get(change.publicId) ?? fallbackNote(change)
    }))
  };
}
