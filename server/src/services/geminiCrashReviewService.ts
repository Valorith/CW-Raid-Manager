import { GoogleGenAI } from '@google/genai';

export type CrashReviewFindings = {
  summary: string;
  signature?: {
    exception?: string | null;
    topFrame?: string | null;
  } | null;
  hypotheses: Array<{
    title: string;
    confidence: number;
    evidence: string[];
    nextSteps: string[];
  }>;
  missingInfo: string[];
  recommendedNextSteps: string[];
  rawModelNotes?: string;
  telemetry?: {
    model: string;
    inputChars: number;
    outputChars?: number;
    attempts: number;
    requestPayload?: Record<string, unknown>;
    parseError?: string;
    finishReason?: string;
    thinkingTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

const MODEL_NAME = 'gemini-2.5-pro';
const MAX_INPUT_CHARS = 250_000;
const MAX_OUTPUT_TOKENS = 16384; // Must account for Gemini 2.5's internal thinking tokens
const FOLLOWUP_OUTPUT_TOKENS = 4096;
const TEMPERATURE = 0.2;
const FUNCTION_NAME = 'crash_review';
const ANALYSIS_SUFFIX = [
  'Return plain-text analysis with these exact headers on their own lines:',
  'Summary:',
  'Signature:',
  'Hypotheses:',
  'Missing Info:',
  'Recommended Next Steps:',
  'Summary must be a single sentence.',
  'Signature must include lines "Exception: <value>" and "TopFrame: <value or unknown>".',
  'Each hypothesis must be one bullet using this format:',
  '- Title | confidence=0.5 | evidence: item1; item2 | next: step1; step2',
  'Missing Info and Recommended Next Steps must be "-" bullets.',
  'Do NOT return JSON or markdown.'
].join('\n');

const MAX_MODULE_LINES = 20;
const MAX_ANALYSIS_LINES = 300;

const CRASH_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    signature: {
      type: ['object', 'null'],
      properties: {
        exception: { type: ['string', 'null'] },
        topFrame: { type: ['string', 'null'] }
      }
    },
    hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          confidence: { type: 'number' },
          evidence: { type: 'array', items: { type: 'string' } },
          nextSteps: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'confidence', 'evidence', 'nextSteps']
      }
    },
    missingInfo: { type: 'array', items: { type: 'string' } },
    recommendedNextSteps: { type: 'array', items: { type: 'string' } },
    rawModelNotes: { type: 'string' }
  },
  required: ['summary', 'hypotheses', 'missingInfo', 'recommendedNextSteps']
};

export interface CrashReviewOptions {
  model?: string;
  maxInputChars?: number;
  maxOutputTokens?: number;
  temperature?: number;
  promptTemplate?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function truncate(text: string, maxChars: number) {
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...<truncated>` : text;
}

function compressCrashReportForAnalysis(text: string) {
  const lines = text.replace(/\r/g, '').split('\n');
  const output: string[] = [];
  let inModules = false;
  const seenModules = new Set<string>();
  let moduleLines = 0;
  let omittedModules = 0;
  let skippingRaw = false;
  let omittedLines = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^Raw Head:/i.test(line) || /^Raw Tail:/i.test(line)) {
      skippingRaw = true;
      continue;
    }

    if (skippingRaw) {
      omittedLines += 1;
      continue;
    }

    if (line === 'Modules:' || line.startsWith('Modules:')) {
      inModules = true;
      output.push('Modules:');
      continue;
    }

    if (inModules) {
      const match = line.match(/\b([A-Za-z0-9._-]+\.(?:exe|dll))\b/);
      const moduleName = match ? match[1].toLowerCase() : '';
      const priority = /\[Crash\]/i.test(line) || /perl|mysql|dbi|dbd|quest/i.test(line);

      if (moduleName && seenModules.has(moduleName)) {
        continue;
      }
      if (moduleName) {
        seenModules.add(moduleName);
      }
      if (moduleLines >= MAX_MODULE_LINES && !priority) {
        omittedModules += 1;
        continue;
      }
      output.push(line);
      moduleLines += 1;
      continue;
    }

    if (/^SymInit:/i.test(line)) {
      output.push(line.replace(/Symbol-SearchPath:\s*'[^']*'/i, 'Symbol-SearchPath: <redacted>'));
      continue;
    }

    output.push(line);
  }

  if (inModules && omittedModules > 0) {
    output.push(`Modules omitted: ${omittedModules}`);
  }

  if (omittedLines > 0) {
    output.push(`Raw sections omitted: ${omittedLines}`);
  }

  if (output.length > MAX_ANALYSIS_LINES) {
    return `${output.slice(0, MAX_ANALYSIS_LINES).join('\n')}\n...<truncated>`;
  }

  return output.join('\n');
}

export async function reviewCrashReport(
  input: string,
  options: CrashReviewOptions,
  attempts = 1
): Promise<CrashReviewFindings> {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const ai = new GoogleGenAI({ apiKey });

  const trimmedInput = truncate(input, options.maxInputChars ?? MAX_INPUT_CHARS);
  const analysisInput = compressCrashReportForAnalysis(trimmedInput);
  const promptTemplate = options.promptTemplate?.trim();
  const isStrict = attempts > 1;
  const maxOutputTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const effectiveMaxOutputTokens = maxOutputTokens;
  const effectiveTemperature = isStrict ? 0 : options.temperature ?? TEMPERATURE;
  const promptCore = promptTemplate
    ? promptTemplate
        .replace(/\{\{crashReport\}\}/gi, analysisInput)
        .replace(/\{\{CrashReport\}\}/g, analysisInput)
    : [
        'You are a senior engineer for an EverQuest emulator server.',
        '',
        'CRITICAL - CLASSIFY THE ERROR TYPE FIRST:',
        '',
        'This is a NATIVE CRASH if ANY of these are present:',
        '   - EXCEPTION_ACCESS_VIOLATION, EXCEPTION_STACK_OVERFLOW, EXCEPTION_INT_DIVIDE_BY_ZERO, or any EXCEPTION_* code',
        '   - Windows exception codes (0xC0000005, 0xC00000FD, etc.)',
        '   - SymInit: or Symbol-SearchPath output',
        '   - Memory addresses like 0x00007FF...',
        '   - Stack frames with module offsets (zone.exe+0x123456, world.exe+0x..., eqgame.exe+0x...)',
        '   - References to system DLLs: ntdll.dll, KERNEL32.DLL, KERNELBASE.dll, ucrtbase.dll',
        '   - "Loaded Modules:" or module loading information',
        '',
        'This is a SCRIPT ERROR only if ALL of these conditions are met:',
        '   - NO Windows exception codes or EXCEPTION_* strings present',
        '   - NO SymInit or memory addresses present',
        '   - AND one of these script indicators IS present:',
        '     * [QuestErrors] or [ScriptError] prefix in the error message',
        '     * Lua stack traceback ("stack traceback:", ".lua:" with line numbers)',
        '     * Perl error messages ("Can\'t locate", "Undefined subroutine", "at /path/to/script.pl line")',
        '     * Quest script paths (quests/*.pl, quests/*.lua)',
        '',
        'DEFAULT: If unsure, classify as NATIVE CRASH. Most reports with memory addresses or exception codes are native crashes.',
        '',
        'For NATIVE CRASHES: Analyze as a C++ crash - identify the exception type, crashing module, and potential causes in the native code.',
        '',
        'For SCRIPT ERRORS: Analyze as a scripting issue - identify the script file, line number, function involved, and what went wrong.',
        '',
        'Rules:',
        '- If information is missing, say so explicitly.',
        '- Do not invent file names/line numbers unless they appear in the report.',
        '- Keep evidence and next steps concise (max 3 each per hypothesis).',
        '- Always include all required fields; use empty arrays if needed.',
        '- Prefer hypotheses that fit the evidence.',
        '- REQUIRED: Start the Summary with "Native crash:" or "Script error:" to indicate the type.',
        '',
        'Report to analyze:',
        analysisInput
      ].join('\n');

  const prompt = `${promptCore}\n\n${ANALYSIS_SUFFIX}`;

  const analysisPayload: any = {
    model: options.model ?? MODEL_NAME,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: effectiveMaxOutputTokens,
      temperature: effectiveTemperature
    }
  };

  const analysisResponse = await ai.models.generateContent(analysisPayload);
  const analysisText = analysisResponse.text ?? '';

  // Check for truncation due to token limits
  const finishReason = analysisResponse?.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    const usage = analysisResponse?.usageMetadata;
    console.warn(
      `[CrashReview] Response truncated due to MAX_TOKENS. ` +
      `Thinking: ${usage?.thoughtsTokenCount ?? '?'}, ` +
      `Output: ${usage?.candidatesTokenCount ?? '?'}, ` +
      `Total: ${usage?.totalTokenCount ?? '?'}. ` +
      `Consider increasing MAX_OUTPUT_TOKENS (current: ${effectiveMaxOutputTokens}).`
    );
  }

  if (!analysisText.trim()) {
    throw new Error('Gemini returned an empty analysis response.');
  }
  const analysisSections = splitAnalysisSections(analysisText);
  const parsed = parseAnalysisToFindings(analysisText);

  if (shouldRequestFollowup(analysisSections, parsed)) {
    const missingSections = getMissingSections(analysisSections, parsed);
    const followupPrompt = buildFollowupPrompt(analysisText, missingSections);
    const followupPayload: any = {
      model: options.model ?? MODEL_NAME,
      contents: [{ role: 'user', parts: [{ text: followupPrompt }] }],
      config: {
        maxOutputTokens: FOLLOWUP_OUTPUT_TOKENS,
        temperature: 0
      }
    };
    const followupResponse = await ai.models.generateContent(followupPayload);
    const followupText = followupResponse.text ?? '';
    if (followupText.trim()) {
      const followupFindings = parseAnalysisToFindings(followupText);
      if (parsed.hypotheses.length === 0 || followupFindings.hypotheses.length > parsed.hypotheses.length) {
        parsed.hypotheses = followupFindings.hypotheses;
      }
      if (parsed.missingInfo.length === 0 && followupFindings.missingInfo.length > 0) {
        parsed.missingInfo = followupFindings.missingInfo;
      }
      if (
        parsed.recommendedNextSteps.length === 0 &&
        followupFindings.recommendedNextSteps.length > 0
      ) {
        parsed.recommendedNextSteps = followupFindings.recommendedNextSteps;
      }
      parsed.rawModelNotes = parsed.rawModelNotes ?? followupFindings.rawModelNotes;
      const responseMetadata = extractResponseMetadata(analysisResponse);
      parsed.telemetry = {
        model: options.model ?? MODEL_NAME,
        inputChars: trimmedInput.length,
        outputChars: analysisResponse.text?.length ?? 0,
        attempts,
        requestPayload: { analysis: analysisPayload, followup: followupPayload },
        ...responseMetadata
      };
      return parsed;
    }
  }
  const responseMetadata = extractResponseMetadata(analysisResponse);
  parsed.telemetry = {
    model: options.model ?? MODEL_NAME,
    inputChars: trimmedInput.length,
    outputChars: analysisResponse.text?.length ?? 0,
    attempts,
    requestPayload: { analysis: analysisPayload },
    ...responseMetadata
  };
  return parsed;
}

function extractResponseMetadata(response: any): {
  finishReason?: string;
  thinkingTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} {
  const metadata: {
    finishReason?: string;
    thinkingTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } = {};

  // Extract finish reason from candidates
  const finishReason = response?.candidates?.[0]?.finishReason;
  if (finishReason) {
    metadata.finishReason = finishReason;
  }

  // Extract token usage from usageMetadata
  const usage = response?.usageMetadata;
  if (usage) {
    if (typeof usage.thoughtsTokenCount === 'number') {
      metadata.thinkingTokens = usage.thoughtsTokenCount;
    }
    if (typeof usage.candidatesTokenCount === 'number') {
      metadata.outputTokens = usage.candidatesTokenCount;
    }
    if (typeof usage.totalTokenCount === 'number') {
      metadata.totalTokens = usage.totalTokenCount;
    }
  }

  return metadata;
}

function stripNonJsonArtifacts(text: string) {
  return text
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
    .trim();
}

function parseAnalysisToFindings(text: string): CrashReviewFindings {
  const sections = splitAnalysisSections(text);
  const summary = sections.Summary?.trim() || 'Crash review analysis unavailable.';
  const signatureLines = (sections.Signature || '').split('\n').map((line) => line.trim());
  const exception = extractValueFromLines(signatureLines, 'Exception');
  const topFrame = extractValueFromLines(signatureLines, 'TopFrame');
  const hypotheses = parseHypothesesFromSection(sections.Hypotheses || '');
  const missingInfo = parseBulletList(sections['Missing Info'] || '');
  const recommendedNextSteps = parseBulletList(sections['Recommended Next Steps'] || '');

  return {
    summary,
    signature: {
      exception,
      topFrame
    },
    hypotheses,
    missingInfo,
    recommendedNextSteps,
    rawModelNotes: text.length > 8000 ? `${text.slice(0, 8000)}...` : text
  };
}

function splitAnalysisSections(text: string) {
  const headers = ['Summary', 'Signature', 'Hypotheses', 'Missing Info', 'Recommended Next Steps'];
  const result: Record<string, string> = {};
  let current: string | null = null;
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch = headers.find((header) => trimmed === `${header}:`);
    if (headerMatch) {
      current = headerMatch;
      result[current] = '';
      continue;
    }
    if (current) {
      result[current] += `${trimmed}\n`;
    }
  }

  return result;
}

function extractValueFromLines(lines: string[], label: string) {
  const prefix = `${label}:`;
  const match = lines.find((line) => line.startsWith(prefix));
  if (!match) return null;
  const value = match.slice(prefix.length).trim();
  if (!value || value.toLowerCase() === 'unknown') return null;
  return value;
}

function parseBulletList(section: string) {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^[-]\s*/, '').trim())
    .filter(Boolean);
}

function parseHypothesesFromSection(section: string): CrashReviewFindings['hypotheses'] {
  const bullets = parseBulletList(section);
  if (bullets.length > 0) {
    return bullets.map((bullet) => {
      const parts = bullet.split('|').map((part) => part.trim());
      const title = parts[0] || 'Hypothesis';
      let confidence = 0.5;
      let evidence: string[] = [];
      let nextSteps: string[] = [];

      for (const part of parts.slice(1)) {
        if (part.startsWith('confidence=')) {
          const value = Number(part.replace('confidence=', '').trim());
          if (!Number.isNaN(value)) {
            confidence = value;
          }
        }
        if (part.startsWith('evidence:')) {
          evidence = part
            .replace('evidence:', '')
            .split(';')
            .map((item) => item.trim())
            .filter(Boolean);
        }
        if (part.startsWith('next:')) {
          nextSteps = part
            .replace('next:', '')
            .split(';')
            .map((item) => item.trim())
            .filter(Boolean);
        }
      }

      return {
        title,
        confidence,
        evidence,
        nextSteps
      };
    });
  }

  return parseNumberedHypotheses(section);
}

function shouldRequestFollowup(
  sections: Record<string, string>,
  findings: CrashReviewFindings
) {
  const missingHeaders =
    !sections.Summary ||
    !sections.Signature ||
    !sections.Hypotheses ||
    !sections['Missing Info'] ||
    !sections['Recommended Next Steps'];

  if (missingHeaders) return true;

  if (findings.hypotheses.length === 0) return true;
  const hasMissingInfo = findings.missingInfo.length > 0;
  const hasNextSteps = findings.recommendedNextSteps.length > 0;
  return !hasMissingInfo || !hasNextSteps;
}

function buildFollowupPrompt(analysisText: string, sections: string[]) {
  return [
    'The previous analysis appears truncated or incomplete.',
    'Return ONLY the missing or incomplete sections using the exact same headers:',
    ...sections.map((section) => `${section}:`),
    'If a section was already complete, you may omit it.',
    'Use the same bullet formatting rules as before.',
    '',
    'Previous analysis:',
    analysisText.trim()
  ].join('\n');
}

function getMissingSections(sections: Record<string, string>, findings: CrashReviewFindings) {
  const missing: string[] = [];
  const headerList = ['Summary', 'Signature', 'Hypotheses', 'Missing Info', 'Recommended Next Steps'];

  for (const header of headerList) {
    if (!sections[header]) {
      missing.push(header);
    }
  }

  const hasMissingInfo = findings.missingInfo.length > 0;
  const hasNextSteps = findings.recommendedNextSteps.length > 0;

  if (!hasMissingInfo && !missing.includes('Missing Info')) {
    missing.push('Missing Info');
  }
  if (!hasNextSteps && !missing.includes('Recommended Next Steps')) {
    missing.push('Recommended Next Steps');
  }

  const truncatedMissing = findings.missingInfo.some((item) => item.length < 8);
  if (truncatedMissing && !missing.includes('Missing Info')) {
    missing.push('Missing Info');
  }

  return missing;
}

function parseNumberedHypotheses(section: string): CrashReviewFindings['hypotheses'] {
  const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
  const hypotheses: CrashReviewFindings['hypotheses'] = [];
  let current: CrashReviewFindings['hypotheses'][number] | null = null;
  let mode: 'evidence' | 'next' | null = null;

  for (const line of lines) {
    const numberedMatch = line.match(/^\d+\.\s*(.+?)\s*\(confidence\s*([0-9.]+)\)/i);
    if (numberedMatch) {
      if (current) {
        hypotheses.push(current);
      }
      const title = numberedMatch[1].trim() || 'Hypothesis';
      const confidence = Number(numberedMatch[2]);
      current = {
        title,
        confidence: Number.isNaN(confidence) ? 0.5 : confidence,
        evidence: [],
        nextSteps: []
      };
      mode = null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (/^Evidence:/i.test(line)) {
      mode = 'evidence';
      continue;
    }

    if (/^Next steps:/i.test(line)) {
      mode = 'next';
      continue;
    }

    if (line.startsWith('-')) {
      const item = line.replace(/^[-]\s*/, '').trim();
      if (!item) continue;
      if (mode === 'evidence') {
        current.evidence.push(item);
      } else if (mode === 'next') {
        current.nextSteps.push(item);
      }
    }
  }

  if (current) {
    hypotheses.push(current);
  }

  return hypotheses;
}

function parseFunctionCallText(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith(`${FUNCTION_NAME}(`)) {
    return null;
  }
  const start = trimmed.indexOf('(');
  const end = trimmed.lastIndexOf(')');
  const inner = end > start ? trimmed.slice(start + 1, end) : trimmed.slice(start + 1);
  const parsedObject = parseFunctionCallArgsToObject(inner);
  if (parsedObject) {
    return parsedObject;
  }

  const looseObject = parseLooseFunctionArgs(inner);
  if (looseObject) {
    return looseObject;
  }

  const args: Record<string, string> = {};
  const pairRegex = /(\w+)\s*=\s*("[\s\S]*?"|'[\s\S]*?')/g;
  let match: RegExpExecArray | null;
  while ((match = pairRegex.exec(inner)) !== null) {
    const key = match[1];
    const raw = match[2];
    const value = raw.slice(1, -1);
    args[key] = value;
  }
  return Object.keys(args).length > 0 ? args : null;
}

function parseLooseFunctionArgs(inner: string): Record<string, unknown> | null {
  const summaryMatch = inner.match(/summary\s*=\s*"([\s\S]*?)"/i);
  const exceptionMatch = inner.match(/exception"?\s*[:=]\s*"([\s\S]*?)"/i);
  const topFrameMatch = inner.match(/topFrame"?\s*[:=]\s*"([\s\S]*?)"/i);
  const crashModuleMatch = inner.match(/crashing_module\s*=\s*"([\s\S]*?)"/i);

  if (!summaryMatch && !exceptionMatch && !topFrameMatch && !crashModuleMatch) {
    return null;
  }

  const result: Record<string, unknown> = {};
  if (summaryMatch) {
    result.summary = summaryMatch[1];
  }
  if (crashModuleMatch) {
    result.crashing_module = crashModuleMatch[1];
  }

  if (exceptionMatch || topFrameMatch) {
    result.signature = {
      exception: exceptionMatch ? exceptionMatch[1] : null,
      topFrame: topFrameMatch ? topFrameMatch[1] : null
    };
  }

  return result;
}

function parseFunctionCallArgsToObject(inner: string): Record<string, unknown> | null {
  const normalized = normalizeFunctionCallArgsText(inner);
  if (!normalized) return null;
  try {
    return JSON.parse(normalized) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeFunctionCallArgsText(inner: string) {
  const trimmed = inner.trim();
  if (!trimmed) return '';
  let text = trimmed;

  text = text.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
  text = text.replace(/([,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=/g, '$1"$2":');
  text = text.replace(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/g, '"$1":');
  text = text.replace(/([,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  text = text.replace(/'/g, '"');

  return `{${text}}`;
}

function coerceFindingsFromFunctionText(args: Record<string, unknown>, rawText: string): CrashReviewFindings {
  const asString = (value: unknown) => (typeof value === 'string' ? value : null);
  const summaryOverride = asString(args.summary);
  const exception = asString(args.exception_type) || asString(args.exception) || null;
  const moduleName = asString(args.crashing_module) || asString(args.module) || null;
  const zone = asString(args.zone) || null;
  const summaryParts = [
    exception ? `Exception: ${exception}` : '',
    moduleName ? `Module: ${moduleName}` : '',
    zone ? `Zone: ${zone}` : ''
  ].filter(Boolean);
  const summary = summaryOverride
    ? summaryOverride
    : summaryParts.length > 0
      ? `Crash review summary. ${summaryParts.join(' · ')}`
      : 'Crash review generated from function-call text.';

  return {
    summary,
    signature: {
      exception,
      topFrame: asString(args.top_frame) || asString(args.topFrame) || null
    },
    hypotheses: [],
    missingInfo: [],
    recommendedNextSteps: [],
    rawModelNotes: rawText.length > 2000 ? `${rawText.slice(0, 2000)}...` : rawText
  };
}

function isFindingsIncomplete(findings: CrashReviewFindings) {
  return (
    findings.hypotheses.length === 0 &&
    findings.missingInfo.length === 0 &&
    findings.recommendedNextSteps.length === 0
  );
}

function extractFunctionCallArgs(response: any): Record<string, unknown> | null {
  const directCalls =
    typeof response?.functionCalls === 'function'
      ? response.functionCalls()
      : response?.functionCalls;
  if (Array.isArray(directCalls) && directCalls.length > 0) {
    return normalizeFunctionCallArgs(directCalls[0]);
  }

  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const partWithCall = parts.find((part: any) => part?.functionCall);
    if (partWithCall?.functionCall) {
      return normalizeFunctionCallArgs(partWithCall.functionCall);
    }
  }

  return null;
}

function normalizeFunctionCallArgs(call: any) {
  if (!call) return null;
  const args = call.args ?? call.arguments ?? call;
  if (!args) return null;
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof args === 'object') {
    return args as Record<string, unknown>;
  }
  return null;
}

function coerceFindings(raw: Record<string, unknown>): CrashReviewFindings {
  const hypothesesRaw = Array.isArray(raw.hypotheses) ? raw.hypotheses : [];
  const hypotheses = hypothesesRaw
    .map((item) => {
      const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
      if (!record) return null;
      return {
        title: typeof record.title === 'string' ? record.title : 'Unknown hypothesis',
        confidence: typeof record.confidence === 'number' ? record.confidence : 0.5,
        evidence: Array.isArray(record.evidence)
          ? record.evidence.filter((value): value is string => typeof value === 'string')
          : [],
        nextSteps: Array.isArray(record.nextSteps)
          ? record.nextSteps.filter((value): value is string => typeof value === 'string')
          : []
      };
    })
    .filter(Boolean) as CrashReviewFindings['hypotheses'];

  const signatureRaw = raw.signature && typeof raw.signature === 'object'
    ? (raw.signature as Record<string, unknown>)
    : null;

  return {
    summary: typeof raw.summary === 'string' ? raw.summary : 'Crash review generated without summary.',
    signature: signatureRaw
      ? {
          exception: typeof signatureRaw.exception === 'string' ? signatureRaw.exception : null,
          topFrame: typeof signatureRaw.topFrame === 'string' ? signatureRaw.topFrame : null
        }
      : null,
    hypotheses,
    missingInfo: Array.isArray(raw.missingInfo)
      ? raw.missingInfo.filter((value): value is string => typeof value === 'string')
      : [],
    recommendedNextSteps: Array.isArray(raw.recommendedNextSteps)
      ? raw.recommendedNextSteps.filter((value): value is string => typeof value === 'string')
      : [],
    rawModelNotes: typeof raw.rawModelNotes === 'string' ? raw.rawModelNotes : undefined
  };
}

function extractJsonObject(text: string) {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    return '';
  }
  return text.slice(first, last + 1);
}

function repairJson(text: string) {
  const output: string[] = [];
  let inString = false;
  let escape = false;

  const isValidEscape = (char: string, nextChars: string) => {
    if ('"\\/bfnrt'.includes(char)) return true;
    if (char === 'u') {
      return /^[0-9a-fA-F]{4}/.test(nextChars);
    }
    return false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (!inString) {
      if (char === '"') {
        inString = true;
        output.push(char);
      } else {
        output.push(char);
      }
      continue;
    }

    if (escape) {
      const nextChars = text.slice(i + 1, i + 5);
      if (isValidEscape(char, nextChars)) {
        output.push('\\', char);
      } else {
        output.push('\\\\', char);
      }
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = false;
      output.push(char);
      continue;
    }

    if (char === '\n') {
      output.push('\\n');
      continue;
    }

    if (char === '\r') {
      output.push('\\r');
      continue;
    }

    if (char === '\t') {
      output.push('\\t');
      continue;
    }

    if (char === '\b') {
      output.push('\\b');
      continue;
    }

    if (char === '\f') {
      output.push('\\f');
      continue;
    }

    output.push(char);
  }

  if (escape) {
    output.push('\\');
  }

  const cleaned = output.join('').replace(/,\s*([}\]])/g, '$1');
  return completeJsonObject(cleaned);
}

function completeJsonObject(text: string) {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) {
    return text;
  }

  let inString = false;
  let escape = false;
  let depth = 0;
  let lastBalancedIndex = -1;

  for (let i = firstBrace; i < text.length; i += 1) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      if (inString) {
        escape = true;
      }
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        lastBalancedIndex = i;
      }
    }
  }

  if (lastBalancedIndex !== -1) {
    return text.slice(firstBrace, lastBalancedIndex + 1);
  }

  let suffix = '';
  if (inString) {
    suffix += '"';
  }
  if (depth > 0) {
    suffix += '}'.repeat(depth);
  }
  return text + suffix;
}

function parseLooseFindings(text: string): CrashReviewFindings | null {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) return null;

  const summary = extractSection(normalized, ['Summary']);
  const missingInfo = extractListSection(normalized, ['Missing Info', 'Missing Information']);
  const recommendedNextSteps = extractListSection(normalized, ['Recommended Next Steps', 'Next Steps']);
  const hypothesesBlocks = extractSection(normalized, ['Hypotheses', 'Hypothesis']);

  if (!summary && !missingInfo.length && !recommendedNextSteps.length && !hypothesesBlocks) {
    return null;
  }

  const hypotheses = parseHypotheses(hypothesesBlocks);

  return {
    summary: summary || 'Model response was not valid JSON, but text was parsed.',
    hypotheses,
    missingInfo,
    recommendedNextSteps,
    rawModelNotes: normalized.length > 2000 ? `${normalized.slice(0, 2000)}...` : normalized
  };
}

function extractSection(text: string, headings: string[]) {
  const headingRegex = new RegExp(`^(${headings.join('|')})\s*:`, 'i');
  const lines = text.split('\n');
  let inSection = false;
  const collected: string[] = [];

  for (const line of lines) {
    if (headingRegex.test(line.trim())) {
      inSection = true;
      const content = line.replace(headingRegex, '').trim();
      if (content) collected.push(content);
      continue;
    }
    if (inSection) {
      if (/^[A-Za-z\s]{3,}:\s*$/.test(line.trim())) {
        break;
      }
      if (/^[A-Za-z\s]{3,}:/.test(line.trim())) {
        break;
      }
      collected.push(line.trim());
    }
  }

  const result = collected.join(' ').replace(/\s+/g, ' ').trim();
  return result || '';
}

function extractListSection(text: string, headings: string[]) {
  const section = extractSection(text, headings);
  if (!section) return [] as string[];
  return section
    .split(/\s*(?:- |\* )/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseHypotheses(sectionText: string) {
  if (!sectionText) return [] as CrashReviewFindings['hypotheses'];
  const bullets = sectionText
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (bullets.length === 0) return [];
  return bullets.map((line) => ({
    title: line.replace(/^[-*]\s*/, ''),
    confidence: 0.5,
    evidence: [],
    nextSteps: []
  }));
}

function parseBestEffortJson(text: string): CrashReviewFindings | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  const trimmedCandidate = salvageJsonPrefix(text.slice(start));
  if (trimmedCandidate) {
    try {
      return JSON.parse(trimmedCandidate) as CrashReviewFindings;
    } catch {
      // continue to fallback below
    }
  }

  return null;
}

function salvageJsonPrefix(text: string) {
  const cutPositions: number[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      if (inString) {
        escape = true;
      }
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '}' || char === ']' || char === ',') {
      cutPositions.push(i);
    }
  }

  for (let i = cutPositions.length - 1; i >= 0; i -= 1) {
    const cut = cutPositions[i];
    const char = text[cut];
    const prefix = char === ',' ? text.slice(0, cut) : text.slice(0, cut + 1);
    const candidate = completeJsonObject(prefix);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  const fallback = completeJsonObject(text);
  try {
    JSON.parse(fallback);
    return fallback;
  } catch {
    return '';
  }
}

function buildFallbackFindings(reason: string, preview: string): CrashReviewFindings {
  const sanitizedPreview = preview.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '').trim();
  return {
    summary: 'Gemini returned a non-JSON response. See raw notes for details.',
    hypotheses: [],
    missingInfo: ['Model response was not valid JSON.'],
    recommendedNextSteps: ['Retry the analysis.', 'Ensure the prompt returns JSON only.'],
    rawModelNotes: `${reason} Raw response preview: ${sanitizedPreview}`
  };
}

// ============================================================================
// Crash Report Inspector - Highlight notable sections
// ============================================================================

export type CrashHighlight = {
  text: string;
  comment: string;
  severity: 'critical' | 'important' | 'info';
  category: string;
};

export type CrashInspectionResult = {
  highlights: Array<CrashHighlight & { startIndex: number; endIndex: number }>;
  summary: string;
  errorType: 'native_crash' | 'script_error' | 'unknown';
};

const INSPECTOR_PROMPT = `You are a crash report analysis expert for an EverQuest emulator server (zone.exe, world.exe, eqgame.exe).

Analyze the crash report and identify SPECIFIC, NARROW sections that are notable for debugging. Return highlights that are as small and precise as possible - individual values, function names, addresses, or short phrases rather than entire lines or blocks.

For each highlight, provide:
- "text": The EXACT text from the report to highlight (must match exactly, case-sensitive)
- "comment": A brief explanation of why this is notable (1-2 sentences max)
- "severity": "critical" (root cause indicators), "important" (significant clues), or "info" (useful context)
- "category": One of: "exception", "address", "module", "function", "stack_frame", "error_message", "script", "variable", "path", "other"

RULES:
1. Each "text" field MUST be an exact substring that appears in the crash report
2. Keep highlights SHORT - prefer "EXCEPTION_ACCESS_VIOLATION" over the entire exception line
3. Highlight specific memory addresses like "0x00007FF..."
4. Highlight specific function names, module names, and file paths
5. For stack traces, highlight individual notable frames, not the entire trace
6. Aim for 5-15 highlights total, focusing on the most diagnostic information
7. Do NOT highlight common boilerplate text or headers

Return ONLY valid JSON in this exact format:
{
  "summary": "One sentence describing the crash type and likely cause",
  "errorType": "native_crash" or "script_error" or "unknown",
  "highlights": [
    {"text": "exact text to highlight", "comment": "why this matters", "severity": "critical", "category": "exception"},
    ...
  ]
}

Crash report to analyze:
`;

export async function inspectCrashReport(crashReportText: string): Promise<CrashInspectionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const trimmedInput = crashReportText.length > MAX_INPUT_CHARS
    ? crashReportText.slice(0, MAX_INPUT_CHARS) + '\n...<truncated>'
    : crashReportText;

  const prompt = INSPECTOR_PROMPT + trimmedInput;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 8192,
      temperature: 0.1
    }
  });

  const responseText = response.text ?? '';

  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse inspection response - no JSON found');
  }

  let parsed: { summary?: string; errorType?: string; highlights?: unknown[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Failed to parse inspection response - invalid JSON');
  }

  const highlights: CrashInspectionResult['highlights'] = [];

  if (Array.isArray(parsed.highlights)) {
    for (const item of parsed.highlights) {
      if (!item || typeof item !== 'object') continue;
      const h = item as Record<string, unknown>;
      const rawText = typeof h.text === 'string' ? h.text : '';
      const comment = typeof h.comment === 'string' ? h.comment : '';
      const severity = ['critical', 'important', 'info'].includes(h.severity as string) ? (h.severity as 'critical' | 'important' | 'info') : 'info';
      const category = typeof h.category === 'string' ? h.category : 'other';

      if (!rawText || rawText.length < 2) continue;

      // Try multiple matching strategies
      let startIndex = -1;
      let matchedText = rawText;

      // Strategy 1: Exact match
      startIndex = crashReportText.indexOf(rawText);
      if (startIndex !== -1) {
        matchedText = rawText;
      }

      // Strategy 2: Trimmed match
      if (startIndex === -1) {
        const trimmed = rawText.trim();
        if (trimmed.length >= 2) {
          startIndex = crashReportText.indexOf(trimmed);
          if (startIndex !== -1) {
            matchedText = trimmed;
          }
        }
      }

      // Strategy 3: Case-insensitive match
      if (startIndex === -1) {
        const lowerReport = crashReportText.toLowerCase();
        const lowerText = rawText.toLowerCase().trim();
        if (lowerText.length >= 2) {
          const lowerIndex = lowerReport.indexOf(lowerText);
          if (lowerIndex !== -1) {
            startIndex = lowerIndex;
            // Use the actual text from the crash report to preserve case
            matchedText = crashReportText.slice(lowerIndex, lowerIndex + lowerText.length);
          }
        }
      }

      // Add highlight if found
      if (startIndex !== -1 && startIndex < crashReportText.length) {
        highlights.push({
          text: matchedText,
          comment,
          severity: severity as 'critical' | 'important' | 'info',
          category,
          startIndex,
          endIndex: startIndex + matchedText.length
        });
      }
    }
  }

  // Sort highlights by position
  highlights.sort((a, b) => a.startIndex - b.startIndex);

  // Remove overlapping highlights (keep the first/higher priority one)
  const filteredHighlights: typeof highlights = [];
  for (const h of highlights) {
    const overlaps = filteredHighlights.some(
      (existing) => h.startIndex < existing.endIndex && h.endIndex > existing.startIndex
    );
    if (!overlaps) {
      filteredHighlights.push(h);
    }
  }

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : 'Crash report inspection complete.',
    errorType: parsed.errorType === 'native_crash' || parsed.errorType === 'script_error'
      ? parsed.errorType
      : 'unknown',
    highlights: filteredHighlights
  };
}

// ============================================================================
// Crash Report Segment Sorting
// ============================================================================

export interface CrashSegmentSortResult {
  orderedIds: string[];
  confidence: number;
  reasoning: string;
}

const SEGMENT_SORT_PROMPT = `You are an expert at analyzing crash reports and log files.

You will be given multiple segments of what appears to be a single crash report that was split into parts (likely due to message length limits). Your task is to determine the correct order of these segments.

Analyze the content of each segment and look for:
- Timestamps or sequence indicators
- Stack trace continuity (function calls that should flow into each other)
- Log message progression
- Headers/footers that indicate beginning or end of report
- Module loading order
- Error propagation flow
- "Continued..." or truncation markers
- Line numbers or offsets

Return a JSON object with this exact structure:
{
  "orderedIds": ["id1", "id2", "id3"],
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this order was chosen"
}

Where:
- orderedIds is an array of the segment IDs in the correct order (first to last)
- confidence is a number between 0 and 1 indicating how confident you are
- reasoning is a brief explanation

IMPORTANT: The orderedIds array must contain ALL the segment IDs provided, no more, no less.

Here are the segments to sort:

`;

export async function sortCrashReportSegments(
  segments: Array<{ id: string; text: string }>
): Promise<CrashSegmentSortResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  if (segments.length < 2) {
    throw new Error('At least 2 segments are required for sorting.');
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build the prompt with all segments
  let prompt = SEGMENT_SORT_PROMPT;
  for (const segment of segments) {
    const truncatedText = segment.text.length > 50000
      ? segment.text.slice(0, 50000) + '\n...<truncated>'
      : segment.text;
    prompt += `\n=== SEGMENT ID: ${segment.id} ===\n${truncatedText}\n`;
  }

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 2048,
      temperature: 0.1
    }
  });

  const responseText = response.text ?? '';

  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse sorting response - no JSON found');
  }

  let parsed: { orderedIds?: unknown[]; confidence?: number; reasoning?: string };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Failed to parse sorting response - invalid JSON');
  }

  // Validate the response
  if (!Array.isArray(parsed.orderedIds)) {
    throw new Error('Invalid response: orderedIds must be an array');
  }

  const segmentIds = new Set(segments.map(s => s.id));
  const orderedIds = parsed.orderedIds.filter(id => typeof id === 'string' && segmentIds.has(id)) as string[];

  // Ensure all segment IDs are present
  if (orderedIds.length !== segments.length) {
    // Fall back to original order if AI response is incomplete
    console.warn('AI sorting response incomplete, some IDs missing. Falling back to adding missing IDs.');
    for (const segment of segments) {
      if (!orderedIds.includes(segment.id)) {
        orderedIds.push(segment.id);
      }
    }
  }

  return {
    orderedIds,
    confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'Unable to determine reasoning'
  };
}
