import { GoogleGenAI } from '@google/genai';
const MODEL_NAME = 'gemini-2.5-pro';
const MAX_INPUT_CHARS = 250_000;
const MAX_OUTPUT_TOKENS = 16384; // Must account for Gemini 2.5's internal thinking tokens
const FOLLOWUP_OUTPUT_TOKENS = 4096;
const TEMPERATURE = 0.2;
const FUNCTION_NAME = 'crash_review';
// GitHub repository for source code links
const GITHUB_REPO_URL = 'https://github.com/Valorith/Server';
const GITHUB_BRANCH = 'main';
const ANALYSIS_SUFFIX = [
    '',
    'CODE REFERENCES:',
    'When referencing specific source files in the EQEmu server codebase, use this format:',
    '  [[source:zone/client_packet.cpp:123]] for a specific line',
    '  [[source:zone/client_packet.cpp]] for the whole file',
    'Common paths: zone/*.cpp, world/*.cpp, common/*.cpp, common/repositories/*.h',
    'Include these references in evidence and next steps when you identify specific code locations.',
    'Only reference server-side code files, not system DLLs or client files.',
    '',
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
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured.`);
    }
    return value;
}
function truncate(text, maxChars) {
    return text.length > maxChars ? `${text.slice(0, maxChars)}\n...<truncated>` : text;
}
// Valid source file extensions for GitHub linking
const VALID_SOURCE_EXTENSIONS = ['.cpp', '.h', '.hpp', '.c', '.cc', '.lua', '.pl', '.pm', '.py', '.sql'];
/**
 * Convert [[source:path/to/file.cpp:123]] references to GitHub links.
 * Invalid paths are converted to plain text (code formatting without link).
 */
function convertCodeReferencesToLinks(text) {
    // Pattern: [[source:path/to/file.ext]] or [[source:path/to/file.ext:linenum]]
    const pattern = /\[\[source:([^\]]+)\]\]/g;
    return text.replace(pattern, (match, reference) => {
        const parts = reference.trim().split(':');
        let filePath = parts[0];
        let lineNumber;
        // Handle line number (could be second part if path doesn't have colons)
        if (parts.length === 2 && /^\d+$/.test(parts[1])) {
            lineNumber = parts[1];
        }
        else if (parts.length > 2) {
            // Path might contain colons (unlikely but handle it)
            // Assume last part is line number if it's numeric
            const lastPart = parts[parts.length - 1];
            if (/^\d+$/.test(lastPart)) {
                lineNumber = lastPart;
                filePath = parts.slice(0, -1).join(':');
            }
        }
        // Clean up the file path
        filePath = filePath.trim().replace(/^\/+/, ''); // Remove leading slashes
        // Validate it looks like a source file
        const ext = filePath.toLowerCase().match(/\.[a-z]+$/)?.[0];
        const isValidSource = ext && VALID_SOURCE_EXTENSIONS.includes(ext);
        // Also check it doesn't look like a system path or client file
        const isSystemPath = /^(c:|\/usr|\/lib|windows|system32)/i.test(filePath);
        const isClientFile = /eqgame|eqclient/i.test(filePath);
        if (!isValidSource || isSystemPath || isClientFile) {
            // Return as code-formatted plain text (no link)
            return lineNumber ? `\`${filePath}:${lineNumber}\`` : `\`${filePath}\``;
        }
        // Build GitHub URL
        const baseUrl = `${GITHUB_REPO_URL}/blob/${GITHUB_BRANCH}/${filePath}`;
        const url = lineNumber ? `${baseUrl}#L${lineNumber}` : baseUrl;
        const displayText = lineNumber ? `${filePath}:${lineNumber}` : filePath;
        // Return as markdown link
        return `[${displayText}](${url})`;
    });
}
/**
 * Apply code reference conversion to all text fields in findings.
 */
function processCodeReferencesInFindings(findings) {
    return {
        ...findings,
        hypotheses: findings.hypotheses.map(h => ({
            ...h,
            evidence: h.evidence.map(e => convertCodeReferencesToLinks(e)),
            nextSteps: h.nextSteps.map(s => convertCodeReferencesToLinks(s))
        })),
        recommendedNextSteps: findings.recommendedNextSteps.map(s => convertCodeReferencesToLinks(s))
    };
}
function compressCrashReportForAnalysis(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const output = [];
    let inModules = false;
    const seenModules = new Set();
    let moduleLines = 0;
    let omittedModules = 0;
    let skippingRaw = false;
    let omittedLines = 0;
    const crashStackLines = [];
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line)
            continue;
        if (/^Raw Head:/i.test(line) || /^Raw Tail:/i.test(line)) {
            skippingRaw = true;
            continue;
        }
        if (skippingRaw) {
            // Preserve crash stack trace lines even when skipping raw sections
            // These contain the actual crash location info (e.g., "[Crash] Zone [zonename] file.cpp (123): FunctionName")
            if (/\[Crash\]/i.test(line) || /\.cpp\s*\(\d+\):/i.test(line) || /\.h\s*\(\d+\):/i.test(line)) {
                crashStackLines.push(line);
                continue;
            }
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
    // Add crash stack trace lines that were preserved from raw sections
    if (crashStackLines.length > 0) {
        output.push('');
        output.push('Crash Stack Trace:');
        output.push(...crashStackLines);
    }
    if (omittedLines > 0) {
        output.push(`Raw sections omitted: ${omittedLines}`);
    }
    if (output.length > MAX_ANALYSIS_LINES) {
        return `${output.slice(0, MAX_ANALYSIS_LINES).join('\n')}\n...<truncated>`;
    }
    return output.join('\n');
}
export async function reviewCrashReport(input, options, attempts = 1) {
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
    const analysisPayload = {
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
        console.warn(`[CrashReview] Response truncated due to MAX_TOKENS. ` +
            `Thinking: ${usage?.thoughtsTokenCount ?? '?'}, ` +
            `Output: ${usage?.candidatesTokenCount ?? '?'}, ` +
            `Total: ${usage?.totalTokenCount ?? '?'}. ` +
            `Consider increasing MAX_OUTPUT_TOKENS (current: ${effectiveMaxOutputTokens}).`);
    }
    if (!analysisText.trim()) {
        throw new Error('Gemini returned an empty analysis response.');
    }
    const analysisSections = splitAnalysisSections(analysisText);
    const parsed = parseAnalysisToFindings(analysisText);
    if (shouldRequestFollowup(analysisSections, parsed)) {
        const missingSections = getMissingSections(analysisSections, parsed);
        const followupPrompt = buildFollowupPrompt(analysisText, missingSections);
        const followupPayload = {
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
            if (parsed.recommendedNextSteps.length === 0 &&
                followupFindings.recommendedNextSteps.length > 0) {
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
            // Convert code references to GitHub links
            return processCodeReferencesInFindings(parsed);
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
    // Convert code references to GitHub links
    return processCodeReferencesInFindings(parsed);
}
function extractResponseMetadata(response) {
    const metadata = {};
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
function stripNonJsonArtifacts(text) {
    return text
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
        .trim();
}
function parseAnalysisToFindings(text) {
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
function splitAnalysisSections(text) {
    const headers = ['Summary', 'Signature', 'Hypotheses', 'Missing Info', 'Recommended Next Steps'];
    const result = {};
    let current = null;
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
function extractValueFromLines(lines, label) {
    const prefix = `${label}:`;
    const match = lines.find((line) => line.startsWith(prefix));
    if (!match)
        return null;
    const value = match.slice(prefix.length).trim();
    if (!value || value.toLowerCase() === 'unknown')
        return null;
    return value;
}
function parseBulletList(section) {
    return section
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-'))
        .map((line) => line.replace(/^[-]\s*/, '').trim())
        .filter(Boolean);
}
function parseHypothesesFromSection(section) {
    const bullets = parseBulletList(section);
    if (bullets.length > 0) {
        return bullets.map((bullet) => {
            const parts = bullet.split('|').map((part) => part.trim());
            const title = parts[0] || 'Hypothesis';
            let confidence = 0.5;
            let evidence = [];
            let nextSteps = [];
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
function shouldRequestFollowup(sections, findings) {
    const missingHeaders = !sections.Summary ||
        !sections.Signature ||
        !sections.Hypotheses ||
        !sections['Missing Info'] ||
        !sections['Recommended Next Steps'];
    if (missingHeaders)
        return true;
    if (findings.hypotheses.length === 0)
        return true;
    const hasMissingInfo = findings.missingInfo.length > 0;
    const hasNextSteps = findings.recommendedNextSteps.length > 0;
    return !hasMissingInfo || !hasNextSteps;
}
function buildFollowupPrompt(analysisText, sections) {
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
function getMissingSections(sections, findings) {
    const missing = [];
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
function parseNumberedHypotheses(section) {
    const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
    const hypotheses = [];
    let current = null;
    let mode = null;
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
            if (!item)
                continue;
            if (mode === 'evidence') {
                current.evidence.push(item);
            }
            else if (mode === 'next') {
                current.nextSteps.push(item);
            }
        }
    }
    if (current) {
        hypotheses.push(current);
    }
    return hypotheses;
}
function parseFunctionCallText(text) {
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
    const args = {};
    const pairRegex = /(\w+)\s*=\s*("[\s\S]*?"|'[\s\S]*?')/g;
    let match;
    while ((match = pairRegex.exec(inner)) !== null) {
        const key = match[1];
        const raw = match[2];
        const value = raw.slice(1, -1);
        args[key] = value;
    }
    return Object.keys(args).length > 0 ? args : null;
}
function parseLooseFunctionArgs(inner) {
    const summaryMatch = inner.match(/summary\s*=\s*"([\s\S]*?)"/i);
    const exceptionMatch = inner.match(/exception"?\s*[:=]\s*"([\s\S]*?)"/i);
    const topFrameMatch = inner.match(/topFrame"?\s*[:=]\s*"([\s\S]*?)"/i);
    const crashModuleMatch = inner.match(/crashing_module\s*=\s*"([\s\S]*?)"/i);
    if (!summaryMatch && !exceptionMatch && !topFrameMatch && !crashModuleMatch) {
        return null;
    }
    const result = {};
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
function parseFunctionCallArgsToObject(inner) {
    const normalized = normalizeFunctionCallArgsText(inner);
    if (!normalized)
        return null;
    try {
        return JSON.parse(normalized);
    }
    catch {
        return null;
    }
}
function normalizeFunctionCallArgsText(inner) {
    const trimmed = inner.trim();
    if (!trimmed)
        return '';
    let text = trimmed;
    text = text.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
    text = text.replace(/([,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=/g, '$1"$2":');
    text = text.replace(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/g, '"$1":');
    text = text.replace(/([,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
    text = text.replace(/'/g, '"');
    return `{${text}}`;
}
function coerceFindingsFromFunctionText(args, rawText) {
    const asString = (value) => (typeof value === 'string' ? value : null);
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
function isFindingsIncomplete(findings) {
    return (findings.hypotheses.length === 0 &&
        findings.missingInfo.length === 0 &&
        findings.recommendedNextSteps.length === 0);
}
function extractFunctionCallArgs(response) {
    const directCalls = typeof response?.functionCalls === 'function'
        ? response.functionCalls()
        : response?.functionCalls;
    if (Array.isArray(directCalls) && directCalls.length > 0) {
        return normalizeFunctionCallArgs(directCalls[0]);
    }
    const parts = response?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
        const partWithCall = parts.find((part) => part?.functionCall);
        if (partWithCall?.functionCall) {
            return normalizeFunctionCallArgs(partWithCall.functionCall);
        }
    }
    return null;
}
function normalizeFunctionCallArgs(call) {
    if (!call)
        return null;
    const args = call.args ?? call.arguments ?? call;
    if (!args)
        return null;
    if (typeof args === 'string') {
        try {
            return JSON.parse(args);
        }
        catch {
            return null;
        }
    }
    if (typeof args === 'object') {
        return args;
    }
    return null;
}
function coerceFindings(raw) {
    const hypothesesRaw = Array.isArray(raw.hypotheses) ? raw.hypotheses : [];
    const hypotheses = hypothesesRaw
        .map((item) => {
        const record = item && typeof item === 'object' ? item : null;
        if (!record)
            return null;
        return {
            title: typeof record.title === 'string' ? record.title : 'Unknown hypothesis',
            confidence: typeof record.confidence === 'number' ? record.confidence : 0.5,
            evidence: Array.isArray(record.evidence)
                ? record.evidence.filter((value) => typeof value === 'string')
                : [],
            nextSteps: Array.isArray(record.nextSteps)
                ? record.nextSteps.filter((value) => typeof value === 'string')
                : []
        };
    })
        .filter(Boolean);
    const signatureRaw = raw.signature && typeof raw.signature === 'object'
        ? raw.signature
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
            ? raw.missingInfo.filter((value) => typeof value === 'string')
            : [],
        recommendedNextSteps: Array.isArray(raw.recommendedNextSteps)
            ? raw.recommendedNextSteps.filter((value) => typeof value === 'string')
            : [],
        rawModelNotes: typeof raw.rawModelNotes === 'string' ? raw.rawModelNotes : undefined
    };
}
function extractJsonObject(text) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) {
        return '';
    }
    return text.slice(first, last + 1);
}
function repairJson(text) {
    const output = [];
    let inString = false;
    let escape = false;
    const isValidEscape = (char, nextChars) => {
        if ('"\\/bfnrt'.includes(char))
            return true;
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
            }
            else {
                output.push(char);
            }
            continue;
        }
        if (escape) {
            const nextChars = text.slice(i + 1, i + 5);
            if (isValidEscape(char, nextChars)) {
                output.push('\\', char);
            }
            else {
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
function completeJsonObject(text) {
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
        }
        else if (char === '}') {
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
function parseLooseFindings(text) {
    const normalized = text.replace(/\r/g, '').trim();
    if (!normalized)
        return null;
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
function extractSection(text, headings) {
    const headingRegex = new RegExp(`^(${headings.join('|')})\s*:`, 'i');
    const lines = text.split('\n');
    let inSection = false;
    const collected = [];
    for (const line of lines) {
        if (headingRegex.test(line.trim())) {
            inSection = true;
            const content = line.replace(headingRegex, '').trim();
            if (content)
                collected.push(content);
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
function extractListSection(text, headings) {
    const section = extractSection(text, headings);
    if (!section)
        return [];
    return section
        .split(/\s*(?:- |\* )/)
        .map((item) => item.trim())
        .filter(Boolean);
}
function parseHypotheses(sectionText) {
    if (!sectionText)
        return [];
    const bullets = sectionText
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (bullets.length === 0)
        return [];
    return bullets.map((line) => ({
        title: line.replace(/^[-*]\s*/, ''),
        confidence: 0.5,
        evidence: [],
        nextSteps: []
    }));
}
function parseBestEffortJson(text) {
    const start = text.indexOf('{');
    if (start === -1)
        return null;
    const trimmedCandidate = salvageJsonPrefix(text.slice(start));
    if (trimmedCandidate) {
        try {
            return JSON.parse(trimmedCandidate);
        }
        catch {
            // continue to fallback below
        }
    }
    return null;
}
function salvageJsonPrefix(text) {
    const cutPositions = [];
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
        }
        catch {
            continue;
        }
    }
    const fallback = completeJsonObject(text);
    try {
        JSON.parse(fallback);
        return fallback;
    }
    catch {
        return '';
    }
}
function buildFallbackFindings(reason, preview) {
    const sanitizedPreview = preview.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '').trim();
    return {
        summary: 'Gemini returned a non-JSON response. See raw notes for details.',
        hypotheses: [],
        missingInfo: ['Model response was not valid JSON.'],
        recommendedNextSteps: ['Retry the analysis.', 'Ensure the prompt returns JSON only.'],
        rawModelNotes: `${reason} Raw response preview: ${sanitizedPreview}`
    };
}
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
export async function inspectCrashReport(crashReportText) {
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
    let parsed;
    try {
        parsed = JSON.parse(jsonMatch[0]);
    }
    catch {
        throw new Error('Failed to parse inspection response - invalid JSON');
    }
    const highlights = [];
    if (Array.isArray(parsed.highlights)) {
        for (const item of parsed.highlights) {
            if (!item || typeof item !== 'object')
                continue;
            const h = item;
            const rawText = typeof h.text === 'string' ? h.text : '';
            const comment = typeof h.comment === 'string' ? h.comment : '';
            const severity = ['critical', 'important', 'info'].includes(h.severity) ? h.severity : 'info';
            const category = typeof h.category === 'string' ? h.category : 'other';
            if (!rawText || rawText.length < 2)
                continue;
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
                    severity: severity,
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
    const filteredHighlights = [];
    for (const h of highlights) {
        const overlaps = filteredHighlights.some((existing) => h.startIndex < existing.endIndex && h.endIndex > existing.startIndex);
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
// Use Flash model for sorting - faster and doesn't have thinking token overhead
const SORT_MODEL_NAME = 'gemini-2.0-flash';
const SEGMENT_SORT_PROMPT = `Sort crash report segments and identify duplicates.

Return JSON only:
{"orderedIds":["id1","id2"],"removeIds":["id3"],"confidence":0.85,"reasoning":"brief explanation"}

Rules:
- orderedIds: non-duplicate IDs in correct order (use chunk numbers if present)
- removeIds: duplicate/redundant segment IDs
- Look for: chunk numbers, EXCEPTION headers (start), RtlUserThreadStart (end)
- Segments with "[**Crash**] **Zone**" prefix are often duplicates of "Crash Report" chunks

Segments:
`;
// Aggressive compression for sorting - we only need minimal context
const SORT_HEAD_CHARS = 400;
const SORT_TAIL_CHARS = 200;
const SORT_SEGMENT_MAX_CHARS = SORT_HEAD_CHARS + SORT_TAIL_CHARS + 100;
/**
 * Compress a segment for sorting purposes.
 * We only need enough context to identify ordering, not full content.
 */
function compressSegmentForSorting(text) {
    if (!text || text.length <= SORT_SEGMENT_MAX_CHARS) {
        return text;
    }
    // Extract key ordering indicators
    const lines = text.split(/\r?\n/);
    const indicators = [];
    // Look for explicit chunk numbers
    const chunkMatch = text.match(/\*?\*?Chunk\*?\*?\s*\[(\d+)\]/i);
    if (chunkMatch) {
        indicators.push(`[CHUNK ${chunkMatch[1]}]`);
    }
    // Look for header indicators (typically at start of crash)
    const headerPatterns = [
        /EXCEPTION_\w+/i,
        /SymInit:/i,
        /OS-Version:/i,
        /Crash Report.*Chunk\s*\[\d+\]/i
    ];
    for (const pattern of headerPatterns) {
        const match = text.match(pattern);
        if (match) {
            indicators.push(match[0]);
            break;
        }
    }
    // Look for footer indicators (typically at end of crash)
    const footerPatterns = [
        /RtlUserThreadStart/i,
        /BaseThreadInitThunk/i,
        /ntdll.*RtlUser/i
    ];
    for (const pattern of footerPatterns) {
        if (pattern.test(text)) {
            indicators.push('[END INDICATOR PRESENT]');
            break;
        }
    }
    // Get first and last lines for continuity checking
    const head = text.slice(0, SORT_HEAD_CHARS);
    const tail = text.length > SORT_TAIL_CHARS ? text.slice(-SORT_TAIL_CHARS) : '';
    // Build compressed output
    const parts = [];
    if (indicators.length > 0) {
        parts.push(`Indicators: ${indicators.join(', ')}`);
    }
    parts.push(`--- HEAD ---\n${head}`);
    if (tail) {
        parts.push(`--- TAIL ---\n${tail}`);
    }
    return parts.join('\n');
}
export async function sortCrashReportSegments(segments) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured.');
    }
    if (segments.length < 2) {
        throw new Error('At least 2 segments are required for sorting.');
    }
    // First, try to sort by explicit chunk numbers if present
    const chunkOrder = tryChunkNumberSort(segments);
    if (chunkOrder) {
        return chunkOrder;
    }
    // If some segments have chunk numbers, filter out likely duplicates
    // (segments with [**Crash**] **Zone** prefix that don't have chunk numbers)
    const filteredResult = filterDuplicateSegments(segments);
    if (filteredResult) {
        // We filtered out duplicates - try chunk sort again
        const chunkOrderAfterFilter = tryChunkNumberSort(filteredResult.keepSegments);
        if (chunkOrderAfterFilter) {
            return {
                ...chunkOrderAfterFilter,
                removeIds: [...chunkOrderAfterFilter.removeIds, ...filteredResult.removeIds],
                reasoning: `${chunkOrderAfterFilter.reasoning}. Also removed ${filteredResult.removeIds.length} duplicate log-streaming segments.`
            };
        }
        // If still can't sort by chunks, continue with AI but use filtered segments
        segments = filteredResult.keepSegments;
    }
    const ai = new GoogleGenAI({ apiKey });
    // Build the prompt with compressed segments
    let prompt = SEGMENT_SORT_PROMPT;
    for (const segment of segments) {
        const compressed = compressSegmentForSorting(segment.text);
        prompt += `\n=== ID: ${segment.id} ===\n${compressed}\n`;
    }
    // Retry with exponential backoff for rate limiting
    const MAX_RETRIES = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: SORT_MODEL_NAME,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                    temperature: 0.1
                }
            });
            const responseText = response.text ?? '';
            // Extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Failed to parse sorting response - no JSON found');
            }
            let parsed;
            try {
                parsed = JSON.parse(jsonMatch[0]);
            }
            catch {
                throw new Error('Failed to parse sorting response - invalid JSON');
            }
            // Validate the response
            if (!Array.isArray(parsed.orderedIds)) {
                throw new Error('Invalid response: orderedIds must be an array');
            }
            const segmentIds = new Set(segments.map(s => s.id));
            const orderedIds = parsed.orderedIds.filter(id => typeof id === 'string' && segmentIds.has(id));
            let removeIds = Array.isArray(parsed.removeIds)
                ? parsed.removeIds.filter(id => typeof id === 'string' && segmentIds.has(id))
                : [];
            // Add back any IDs we filtered out earlier
            if (filteredResult) {
                removeIds = [...removeIds, ...filteredResult.removeIds];
            }
            // Create a set of all IDs that are accounted for
            const accountedIds = new Set([...orderedIds, ...removeIds]);
            // Ensure all segment IDs are accounted for
            if (accountedIds.size !== segments.length + (filteredResult?.removeIds.length ?? 0)) {
                // Add any missing IDs to orderedIds (don't auto-remove)
                console.warn('AI sorting response incomplete, some IDs missing. Adding to orderedIds.');
                for (const segment of segments) {
                    if (!accountedIds.has(segment.id)) {
                        orderedIds.push(segment.id);
                    }
                }
            }
            return {
                orderedIds,
                removeIds,
                confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
                reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'Unable to determine reasoning'
            };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Check if it's a rate limit error (429)
            const isRateLimitError = lastError.message.includes('429') ||
                lastError.message.toLowerCase().includes('resource exhausted') ||
                lastError.message.toLowerCase().includes('rate limit');
            if (isRateLimitError && attempt < MAX_RETRIES) {
                // Exponential backoff: 2s, 4s, 8s
                const delayMs = Math.pow(2, attempt) * 1000;
                console.warn(`[CrashSegmentSort] Rate limited (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }
            // For non-rate-limit errors or final attempt, throw
            throw lastError;
        }
    }
    throw lastError ?? new Error('Failed to sort crash segments after retries');
}
/**
 * Filter out duplicate segments that are likely redundant.
 * When we have segments with explicit chunk numbers AND segments with [**Crash**] **Zone** prefix,
 * the latter are often real-time log duplicates of the chunked crash report.
 */
function filterDuplicateSegments(segments) {
    const chunkedSegments = [];
    const logStreamSegments = [];
    for (const segment of segments) {
        // Check if this segment has an explicit chunk number
        const hasChunkNumber = /\*?\*?Chunk\*?\*?\s*\[\d+\]/i.test(segment.text);
        // Check if this is a log-streaming segment (starts with [**Crash**] **Zone**)
        const isLogStream = /^\[?\*?\*?Crash\*?\*?\]?\s*\*?\*?Zone\*?\*?/i.test(segment.text.trim());
        if (hasChunkNumber) {
            chunkedSegments.push(segment);
        }
        else if (isLogStream) {
            logStreamSegments.push(segment);
        }
        else {
            // Unknown type - keep in chunked to be safe
            chunkedSegments.push(segment);
        }
    }
    // Only filter if we have BOTH chunked and log-stream segments
    // and the majority are chunked (suggesting the log-stream ones are duplicates)
    if (chunkedSegments.length > 0 && logStreamSegments.length > 0 && chunkedSegments.length >= logStreamSegments.length) {
        console.log(`[CrashSegmentSort] Filtering ${logStreamSegments.length} log-stream duplicates, keeping ${chunkedSegments.length} chunked segments`);
        return {
            keepSegments: chunkedSegments,
            removeIds: logStreamSegments.map(s => s.id)
        };
    }
    return null;
}
/**
 * Try to sort segments by explicit chunk numbers (e.g., "Chunk [1]", "Chunk [2]").
 * Returns null if not all segments have clear chunk numbers.
 */
function tryChunkNumberSort(segments) {
    const segmentsWithChunks = [];
    for (const segment of segments) {
        // Look for "Chunk [N]" pattern (with optional markdown formatting)
        const match = segment.text.match(/\*?\*?Chunk\*?\*?\s*\[(\d+)\]/i);
        if (match) {
            segmentsWithChunks.push({ id: segment.id, chunk: parseInt(match[1], 10) });
        }
    }
    // Only use chunk sorting if ALL segments have chunk numbers
    if (segmentsWithChunks.length !== segments.length) {
        return null;
    }
    // Check for duplicates or gaps that would indicate unreliable chunk numbers
    const chunkNumbers = segmentsWithChunks.map(s => s.chunk).sort((a, b) => a - b);
    const hasDuplicates = new Set(chunkNumbers).size !== chunkNumbers.length;
    if (hasDuplicates) {
        return null;
    }
    // Sort by chunk number
    segmentsWithChunks.sort((a, b) => a.chunk - b.chunk);
    return {
        orderedIds: segmentsWithChunks.map(s => s.id),
        removeIds: [],
        confidence: 0.95,
        reasoning: `Sorted by explicit chunk numbers [${chunkNumbers.join(', ')}]`
    };
}
