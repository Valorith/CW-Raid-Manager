# Gemini Crash Review (CRASH REVIEW Webhook Action) — Implementation & Setup Plan

## Goal
Enable the existing **Inbound Webhook Action** type `CRASH_REVIEW` to:
1) Accept a crash report from your C++ EverQuest emulator server (via this app’s inbound webhook URL),
2) Send that crash report to **Gemini `gemini-2.5-pro`** for analysis,
3) Store Gemini’s findings back into this app (DB `InboundWebhookActionRun.result`),
4) Display the findings in the Admin → Webhook Inbox UI.

This repository already has:
- Inbound webhook ingestion: `POST /api/webhook-inbox/:webhookId/:token`
- Admin UI to create webhooks + add actions, including `CRASH_REVIEW` (currently placeholder)
- Persistence models: `InboundWebhook*` tables in Prisma

## Current Flow (what exists today)
1) Your C++ server sends a POST to `POST /api/webhook-inbox/:webhookId/:token`.
2) The payload is saved in `InboundWebhookMessage`.
3) Actions execute async in `server/src/services/inboundWebhookService.ts`.
4) `CRASH_REVIEW` currently creates an action-run with status `PENDING_REVIEW` + note “not implemented yet”.

## Target Flow (what we’re building)
1) C++ server POSTs crash report payload to this app’s inbound webhook URL.
2) App stores message immediately and returns **204** quickly.
3) Background action runner:
   - Detects `CRASH_REVIEW`
   - Calls Gemini `gemini-2.5-pro`
   - Parses response into a structured JSON “findings” object
   - Saves findings to `InboundWebhookActionRun.result`
   - Sets action-run status `SUCCESS` (or `FAILED` with error)
   - If an enabled Discord action exists for the same webhook, forwards a summarized report to Discord
4) Admin UI shows:
   - Status (already)
   - Error (already)
   - **Result JSON (new)** and/or a formatted summary

## Decisions (based on your answers)
- Input format: crash reports are **always** Windows plain-text reports in the format you shared (exception line + SymInit + OS version + module list, etc.).
- Output format: use best judgment, but default to **strict JSON findings** from Gemini and store that JSON in `InboundWebhookActionRun.result`.
- Provider/data: OK to send crash reports to Gemini (free tier acceptable for now).
- Discord forwarding: **automatic**: if the webhook has an enabled `DISCORD_RELAY` action, forward the LLM report to that Discord webhook once the LLM result is available.
- UX: Admin inbox should show an **animated “pending” indicator** and the **elapsed waiting time** while the crash review is in progress.
- Scale: crash reports can be large → we need a **smart retention strategy** for the raw crash text, plus truncation/summarization and timeouts.

---

## Part A — Get and store your Gemini API key

### A1) Create an API key
1) Create a Gemini API key in Google AI Studio.
2) Keep the key private (treat like a password).

### A2) Configure the server to read the key
This project already loads `.env` via `dotenv/config` in `server/src/index.ts`.

Pick ONE:

**Option 1 (recommended for dev):** add to `server/.env`
- Create (or edit) `server/.env` and add:
  - `GEMINI_API_KEY=...`

**Option 2 (recommended for prod):** set an environment variable
- Set `GEMINI_API_KEY` in your hosting environment.

Notes:
- Do NOT store API keys in Prisma config JSON, the database, or the client UI.
- This is an admin tool, but webhooks can contain sensitive data. Keep this key server-side only.

---

## Part B — Decide the webhook payload format (what the C++ server will send)

### B1) Recommended JSON payload schema
Even though the underlying report is plain text, send JSON so you can attach metadata and keep the receiver robust.

Recommended schema (minimal + future-proof):
- `event`: constant string (e.g. `crash_report`)
- `app`: `eqemu-zone` / `eqemu-world` / etc.
- `crashReportText`: the full crash report text (or as much as you can provide)
- `meta`: optional structured fields (server name, build ID, git SHA, etc.)

Example:

```json
{
  "event": "crash_report",
  "app": "eqemu-world",
  "serverName": "MyEQEmu",
  "build": {
    "gitSha": "abc123",
    "buildType": "Release",
    "compiler": "msvc",
    "timestampUtc": "2026-01-26T01:26:14Z"
  },
  "host": {
    "os": "Windows Server 2022",
    "cpu": "...",
    "ramGb": 32
  },
  "crash": {
    "utc": "2026-01-26T01:25:59Z",
    "exception": "ACCESS_VIOLATION",
    "signal": "SIGSEGV",
    "thread": "MainThread",
    "stacktrace": "...full stack text here...",
    "logTail": "...last ~200 lines...",
    "notes": "Any operator notes"
  }
}
```

Why this format:
- Fastify will reliably parse JSON.
- You can include both stack trace and log tail.
- It’s easy to evolve without breaking older senders.

### B2) If your crash report is plain text (your current case)
Wrap the entire crash report in JSON so it’s robust across content types and proxies:

```json
{
  "event": "crash_report",
  "app": "eqemu-zone",
  "crashReportText": "...full text report...",
  "meta": {
    "server": "MyEQEmu",
    "utc": "2026-01-26T01:25:59Z",
    "build": "RelWithDebInfo",
    "gitSha": "abc123"
  }
}
```

Avoid sending raw `text/plain` unless you have explicitly verified Fastify is parsing it as a string in your deployment.

### B3) Size guidance (large reports)
Because reports can be quite large:
- Prefer sending the full text, but expect the server to **truncate what is sent to Gemini**.
- Keep the webhook payload itself within whatever body limit your server/proxy enforces.
- If you have extremely large artifacts (minidumps, full logs), send:
  - the crash report text (exception + stack + modules)
  - plus a link/path to the artifact stored elsewhere

Default caps (v1):
- `MAX_GEMINI_INPUT_CHARS`: **250,000** chars (after preprocessing; includes all report sections inserted into the prompt)
- `GEMINI_TIMEOUT_MS`: **120,000ms**
- `GEMINI_MAX_OUTPUT_TOKENS`: **2048**

### B4) Smart crash text retention strategy (store “the important portion”)
Goal: retain the most useful parts for humans and the model, without storing megabytes per crash.

Plan:
1) On ingest (server-side), derive `crashReportExtract` from `crashReportText` using format-aware heuristics.
2) Persist only:
   - `crashReportExtract` (structured or semi-structured text)
   - a bounded head/tail snippet of the raw text
   - the LLM findings (in `InboundWebhookActionRun.result`)

Suggested persisted structure inside `InboundWebhookMessage.payload` (example):

```json
{
  "event": "crash_report",
  "app": "eqemu-zone",
  "meta": { "server": "MyEQEmu", "utc": "..." },
  "crashReport": {
    "exception": "EXCEPTION_ACCESS_VIOLATION",
    "symInit": "SymInit: ...",
    "osVersion": "OS-Version: ...",
    "modulesSnippet": "C:\\EQEmu\\bin\\zone.exe:...\nC:\\Windows...",
    "rawHead": "...first N chars...",
    "rawTail": "...last N chars...",
    "hash": "sha256-of-full-text (optional)"
  }
}
```

Heuristics (good starting point for your format):
- `exception`: first non-empty line (often starts with `EXCEPTION_`).
- `symInit`: first line starting with `SymInit:`.
- `osVersion`: first line starting with `OS-Version:`.
- `modulesSnippet`: include lines matching `*.exe:` and `*.dll:` (module list).
- `rawHead/rawTail`: bounded slices of the original report text.

Concrete default caps (v1):
- `MODULES_MAX_LINES`: **400** lines
- `MODULES_MAX_CHARS`: **60,000** chars (stop early if hit)
- `RAW_HEAD_CHARS`: **25,000** chars
- `RAW_TAIL_CHARS`: **25,000** chars
- `EXTRACT_MAX_CHARS`: **120,000** chars (final combined extract budget)
- Optional: store `hash = sha256(fullText)` so you can de-duplicate without storing full text.

Persistence rule (v1):
- Do **not** persist the entire `crashReportText` if it is large.
- Persist the structured extract (`crashReport.*`), plus bounded head/tail, plus the LLM findings.

Retention policy defaults (recommended for this crash webhook):
- Set this webhook’s retentionPolicy to `days` with **60 days** as the default.
- If using `maxCount` instead, default to **5000** messages.

---

## Part C — Implement the Gemini call in the server

### C1) Add a Gemini client wrapper service
Create a new file (suggestion):
- `server/src/services/geminiCrashReviewService.ts`

Responsibilities:
- Read `process.env.GEMINI_API_KEY`
- Build prompt from webhook payload
- Call Gemini model `gemini-2.5-pro`
- Return a structured “findings” JSON object

You have two implementation choices:

#### Choice 1: Use Google’s Node SDK (recommended)
- Add dependency in `server` workspace:

  ```bash
  npm --workspace server install @google/genai
  ```

Pros:
- Less manual request/response handling
- Cleaner structured output support

#### Choice 2: Call the REST API directly with `fetch`
Pros:
- No new dependency

Cons:
- More manual payload construction and response parsing

Either is fine; the repo already uses `fetch` for Discord relay.

### C1.1) Concrete code example (Node SDK + structured JSON output)
Below is a *starting point* for `server/src/services/geminiCrashReviewService.ts`.

Notes:
- This uses structured output so the response is always JSON.
- The schema is intentionally small and extensible; you can add fields over time.
- Keep the schema simple at first. Deeply nested schemas tend to increase model mistakes.

```ts
import { GoogleGenAI } from '@google/genai';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function truncate(text: string, maxChars: number) {
  return text.length > maxChars ? text.slice(0, maxChars) + '\n...<truncated>' : text;
}

export type CrashReviewFindings = {
  summary: string;
  signature?: {
    exception?: string;
    topFrame?: string;
  };
  hypotheses: Array<{
    title: string;
    confidence: number; // 0..1
    evidence: string[];
    nextSteps: string[];
  }>;
  missingInfo: string[];
  recommendedNextSteps: string[];
};

export async function reviewCrashReport(input: unknown): Promise<CrashReviewFindings> {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const ai = new GoogleGenAI({ apiKey });

  const crashText =
    typeof input === 'string'
      ? input
      : JSON.stringify(input ?? {}, null, 2);

  const prompt = [
    'You are a senior C++ crash triage engineer for an EverQuest emulator server.',
    'Analyze the crash report and provide actionable debugging steps.',
    'Rules:',
    '- If information is missing, say so explicitly.',
    '- Do not invent file names/line numbers unless they appear in the report.',
    '- Prefer hypotheses that fit the evidence.',
    '',
    'Crash report:',
    // Default cap (v1): keep the prompt input bounded for latency.
    truncate(crashText, 250_000),
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: prompt,
    config: {
      // Keep output bounded; tweak after initial testing.
      maxOutputTokens: 2048,
      temperature: 0.2,

      // Force JSON output.
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          signature: {
            type: ['object', 'null'],
            properties: {
              exception: { type: ['string', 'null'] },
              topFrame: { type: ['string', 'null'] },
            },
          },
          hypotheses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                confidence: { type: 'number' },
                evidence: { type: 'array', items: { type: 'string' } },
                nextSteps: { type: 'array', items: { type: 'string' } },
              },
              required: ['title', 'confidence', 'evidence', 'nextSteps'],
            },
          },
          missingInfo: { type: 'array', items: { type: 'string' } },
          recommendedNextSteps: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary', 'hypotheses', 'missingInfo', 'recommendedNextSteps'],
      },
    },
  });

  // response.text is a JSON string because we forced responseMimeType.
  const parsed = JSON.parse(response.text);
  return parsed as CrashReviewFindings;
}
```

### C1.2) Concrete code example (REST `fetch` alternative)
If you prefer no SDK dependency, you can use `fetch`.

Endpoint shape:
- `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=<API_KEY>`

Example request body (simplified):

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "...your prompt..." }]
    }
  ],
  "generationConfig": {
    "temperature": 0.2,
    "maxOutputTokens": 2048
  }
}
```

With REST, you’ll parse the response JSON and extract `candidates[0].content.parts[0].text`.
If you want strict JSON output, add the equivalent JSON-output config supported by the API.

### C2) Define the output shape you want Gemini to return
For best downstream UX, strongly consider **forcing JSON output**.

Example “findings” object to store in `InboundWebhookActionRun.result`:

```json
{
  "signature": {
    "exception": "ACCESS_VIOLATION",
    "topFrame": "Zone::Process() at zone.cpp:123",
    "hash": "...optional..."
  },
  "summary": "Short human-readable summary",
  "hypotheses": [
    {
      "title": "Use-after-free in EntityList",
      "confidence": 0.62,
      "evidence": ["..."],
      "nextSteps": ["..."]
    }
  ],
  "missingInfo": ["Need full symbolicated stack", "Need compiler flags"],
  "recommendedNextSteps": ["Rebuild with ASAN", "Enable core dumps"],
  "rawModelNotes": "Optional extra text"
}
```

### C3) Update the action runner to call Gemini for `CRASH_REVIEW`
Edit:
- `server/src/services/inboundWebhookService.ts`

Replace the placeholder block in the `if (action.type === 'CRASH_REVIEW')` branch with:
1) **Create an action run immediately** with status `PENDING_REVIEW`.
   - This enables the UI “pending” indicator + elapsed timer.
2) Load the stored message (by `messageId`) so you can access:
   - `InboundWebhookMessage.payload`
   - `InboundWebhookMessage.rawBody` (less likely if sender uses JSON, but keep as fallback)
3) Build the model input text using the stored payload:
   - Prefer `payload.crashReportText` (or the extracted `payload.crashReport.*` fields if you adopt B4)
4) Call `geminiCrashReviewService.reviewCrashReport(...)`.
5) Update the same action run record:
   - status `SUCCESS`
   - `durationMs`
   - `result` = findings JSON

If the Gemini call fails:
- Update the action run to `FAILED` with a readable `error` and `durationMs`.

Important operational details (large inputs + reliability):
- Timeout (v1): **120 seconds** for `gemini-2.5-pro`.
- Retries (v1): **1 retry** on transient failures (timeouts / 429 / 5xx) with exponential backoff:
  - delay 1s, then retry once.
- Preprocess/truncate before sending to Gemini (even though the model supports large context):
  - Always include: exception line, SymInit line, OS-Version line.
  - Include: module list (DLL/EXE lines), capped (`MODULES_MAX_LINES` / `MODULES_MAX_CHARS`).
  - Include: bounded head + tail (`RAW_HEAD_CHARS` / `RAW_TAIL_CHARS`).
  - Hard cap the final model input (`MAX_GEMINI_INPUT_CHARS` = 250,000 chars).
- Output limits (v1): `maxOutputTokens = 2048`, `temperature = 0.2`.
- Rate limiting: store a clear error message and mark action run `FAILED`.
- Capture basic telemetry in `result` (recommended): `model`, `inputCharsSent`, `outputChars`, `durationMs`, `attempts`.

### C4) Protect against abuse
Inbound webhooks are public URLs.
Add at least these protections:
- Keep the existing token in the URL secret.
- Ensure `retentionPolicy` is not indefinite for very high-volume senders.
- Consider a max payload size enforcement (Fastify has overall body limits; confirm yours).
- Consider an allowlist of source IPs for your crash webhook (optional).

---

## Part D — Add minimal configuration knobs (optional but recommended)
Right now, `InboundWebhookActionConfig` only supports Discord relay fields.

If you want per-webhook/per-action controls for crash review, extend the action config schema to include e.g.:
- `model`: default `gemini-2.5-pro` (allow switching to `gemini-2.5-flash` later)
- `maxInputChars` (or similar): cap sent-to-model size per webhook
- `maxOutputTokens`, `temperature`
- `promptTemplate`: override prompt template
- `includeSections`: allow enabling/disabling parts of the report (modules, stack, tail)

Touchpoints:
- Server: `server/src/services/inboundWebhookService.ts` (types) and `server/src/routes/admin.ts` (Zod schema)
- Client types: `client/src/services/api.ts` (InboundWebhookActionConfig)
- Client UI: `client/src/views/AdminWebhooksView.vue` (show config inputs when action.type === 'CRASH_REVIEW')

If you don’t need this yet, hardcode `gemini-2.5-pro` + a single prompt in the server.

---

## Part E — Display Gemini findings in the Admin UI (receive result into the app)

### E1) Show `run.result` in the message modal
Currently the modal shows:
- payload JSON
- headers JSON
- action run status + error

Update `client/src/views/AdminWebhooksView.vue` to also render the action run result:
- For each action run, show:
  - `Result` → pretty-print JSON `run.result`

This is the key piece to “receive the result into the app” for admins.

### E2) Inbox “pending LLM” indicator + elapsed timer (required)
Add a visible indicator in the **Inbox table** while waiting for Gemini.

Plan:
- Treat a message as “pending” if **any** `actionRuns[]` has:
  - `action.type === 'CRASH_REVIEW'` AND `status === 'PENDING_REVIEW'`
- Compute elapsed time as:
  - `now - actionRun.createdAt` (preferred)
  - fallback: `now - message.receivedAt`

UI behavior:
- In the Inbox list row, render:
  - a small animated spinner/badge (e.g. “LLM pending”)
  - a continuously updating “waiting: 00:37” duration
- In the modal, show the same “waiting” duration for the pending action.

Implementation notes (still plan-only):
- Keep a `now` ref updated via `setInterval(1000)` and clear it on unmount.
- Update frequency (v1): **1Hz** (once per second).
- Duration formatting (v1):
  - `< 1 hour`: `mm:ss`
  - `>= 1 hour`: `hh:mm:ss`

### E3) Optional UX improvements
- If `run.result.summary` exists, show it inline under the status badge.
- Add “Copy Findings” button.
- Add “Download JSON” button.

## Part F — Forwarding the LLM report to Discord (automatic when DISCORD_RELAY exists)
Because you want Discord forwarding automatically whenever both actions exist:

Chosen approach:
- **Enrich the payload for downstream actions**, then run Discord relay after crash review.

Plan:
1) In the action runner, maintain a mutable `payloadForActions` variable.
2) When `CRASH_REVIEW` completes successfully, set:
   - `payloadForActions = { ...payloadForActions, crashReview: findings }`
3) Ensure Discord relay runs **after** crash review so it can include `crashReview`.

Ordering strategy:
- Prefer implementing a fixed ordering rule in the runner:
  - Run `CRASH_REVIEW` actions first,
  - then run `DISCORD_RELAY` actions,
  - regardless of sortOrder.

Discord message content strategy:
- Keep it short (fits Discord limits).
- Default cap (v1): format to **<= 1500 characters** of content before handing it to Discord relay.
- Include:
  - `summary`
  - 1–3 top hypotheses
  - 3–6 next steps
  - “See Webhook Inbox for full JSON”

Note: this repo’s Discord relay helper already truncates content (around ~1800 chars). Reuse that behavior as a safety net.

---

## Part G — Hooking up the C++ EQEmu server to send crash reports

### G1) Get the inbound webhook URL from the UI
1) Go to Admin → Webhooks.
2) Create a webhook (e.g. label: “EQEmu Crash Reports”).
3) Click “Copy URL”. You’ll get something like:
   - `https://<your-host>/api/webhook-inbox/<webhookId>/<token>`
4) Add an Action to the webhook:
   - Type: “Crash Review”
   - Enabled: true

### G2) Send a crash report from C++
Use your preferred HTTP client. Typical options:
- libcurl
- cpp-httplib
- Boost.Beast

Requirements:
- HTTP POST
- `Content-Type: application/json`
- Body is the JSON payload described in Part B.

### G3) Expectation of responses
- The webhook endpoint should return **204 No Content** quickly.
- The analysis runs asynchronously; check the Admin → Webhook Inbox to see results.

---

## Part H — Testing (end-to-end)

1) Configure `GEMINI_API_KEY`.
2) Restart the server.
3) In Admin → Webhooks:
   - Create a new webhook
   - Add an enabled `CRASH_REVIEW` action
4) Use “Test Payload” to send a sample crash report JSON.
5) Go to Admin → Webhook Inbox:
   - Open the message
   - Confirm an action run is created
   - Confirm status becomes `SUCCESS` and `result` contains Gemini findings

---

## Clarifying questions (none)
All previously open questions have been answered.

If you later decide to support additional crash formats (Linux core/backtrace, minidumps, etc.), we can extend the preprocessor and prompt, but the initial implementation can be optimized specifically for your current Windows text report format.
