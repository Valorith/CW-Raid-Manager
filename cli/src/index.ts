#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { hostname, platform } from "node:os";
import { stdin } from "node:process";

import { NexusApi, NexusApiError } from "./api.js";
import {
  CONFIG_PATH,
  loadConfig,
  type NexusCliConfig,
  requireProfile,
  saveConfig,
  saveProfile,
} from "./config.js";
import {
  printCrashTelemetryReports,
  printCrashTelemetrySummary,
  printChange,
  printChangeList,
  printInboundWebhooks,
  printJson,
  printNotes,
  printServerVersion,
  printTable,
  printTesters,
  printWebhookInboxList,
  printWebhookLabels,
  printWebhookMessage,
  textToHtml,
} from "./format.js";
import type {
  CrashReviewProvider,
  CrashTelemetryReport,
  CrashTelemetrySummary,
  InboundWebhookMessageStatus,
  InboundWebhookMessage,
  InboundWebhooksResponse,
  TestAssignmentKind,
  TestChange,
  TestChangeChecklistItem,
  TestChangeContextLink,
  TestChangePriority,
  TestChangeResponse,
  TestChangesResponse,
  TestChangeStatus,
  TestManagerServerVersion,
  TestResult,
  WebhookInboxBulkAction,
  WebhookInboxBulkResponse,
  WebhookInboxMessageResponse,
  WebhookInboxResponse,
  WebhookLabelResponse,
  WebhookLabelsResponse,
} from "./types.js";

type FlagValue = string | boolean | string[];
type Flags = Record<string, FlagValue>;

const BOOLEAN_FLAGS = new Set([
  "json",
  "verbose",
  "yes",
  "open",
  "help",
  "include-in-next-patch",
  "ready-to-test",
  "html",
  "local",
  "clear-target-build",
  "clear-test-server-version",
  "clear-github-pr",
  "clear-github-issue",
  "clear-due",
  "clear-assignee",
  "me",
  "clear",
  "include-archived",
  "starred",
  "run-actions",
  "auto-archive",
  "auto-delete",
  "use-eqemu-oracle-context",
  "oracle",
]);
const STATUSES: TestChangeStatus[] = [
  "SUBMITTED",
  "AWAITING_TEST",
  "TESTING",
  "PASSED",
  "FAILED",
  "BLOCKED",
  "RENEWED",
  "CLOSED",
];
const PRIORITIES: TestChangePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const RESULTS: TestResult[] = ["PASS", "FAIL", "BLOCKED"];
const ASSIGNMENTS: TestAssignmentKind[] = [
  "REQUIRED",
  "OPTIONAL",
  "VOLUNTEER",
  "ADMIN_REQUESTED",
];
const WEBHOOK_MESSAGE_STATUSES: InboundWebhookMessageStatus[] = [
  "RECEIVED",
  "PENDING_MERGE",
  "PROCESSED",
  "FAILED",
];
const CRASH_REVIEW_PROVIDERS: CrashReviewProvider[] = ["gemini", "openai"];
const WEBHOOK_BULK_ACTIONS: WebhookInboxBulkAction[] = [
  "markRead",
  "markUnread",
  "archive",
  "unarchive",
  "delete",
  "star",
  "unstar",
  "rerunCrashReview",
  "setLabels",
];
const DEFAULT_LOCAL_API_URL = "http://localhost:4000";
const DEFAULT_LOCAL_APP_URL = "http://localhost:5173";

interface ParsedArgv {
  args: string[];
  flags: Flags;
}

async function main(): Promise<void> {
  const parsed = parseArgv(process.argv.slice(2));
  if (!parsed.args.length || boolFlag(parsed.flags, "help")) {
    printHelp();
    return;
  }

  const command = parsed.args[0];
  const rest = parsed.args.slice(1);
  const jsonMode = boolFlag(parsed.flags, "json");

  switch (command) {
    case "setup":
      await setup(rest, parsed.flags, jsonMode);
      return;
    case "login":
      await login(parsed.flags, jsonMode);
      return;
    case "doctor":
      await doctor(parsed.flags, jsonMode);
      return;
    case "auth":
      await auth(rest, parsed.flags, jsonMode);
      return;
    case "logout":
      await logout(parsed.flags, jsonMode);
      return;
    case "profiles":
      await profiles(rest, parsed.flags, jsonMode);
      return;
    case "tm":
    case "test-manager":
      await testManager(rest, parsed.flags, jsonMode);
      return;
    case "inbox":
    case "webhook-inbox":
    case "wi":
      await webhookInbox(rest, parsed.flags, jsonMode);
      return;
    default:
      throw new Error(`Unknown command "${command}". Run nexus --help.`);
  }
}

function parseArgv(argv: string[]): ParsedArgv {
  const args: string[] = [];
  const flags: Flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }

    if (token.startsWith("--no-")) {
      setFlag(flags, token.slice(5), false);
      continue;
    }

    const equalsIndex = token.indexOf("=");
    const name = token.slice(2, equalsIndex > -1 ? equalsIndex : undefined);
    if (equalsIndex > -1) {
      setFlag(flags, name, token.slice(equalsIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (!BOOLEAN_FLAGS.has(name) && next && !next.startsWith("--")) {
      setFlag(flags, name, next);
      index += 1;
    } else {
      setFlag(flags, name, true);
    }
  }

  return { args, flags };
}

function setFlag(flags: Flags, name: string, value: string | boolean): void {
  const existing = flags[name];
  if (Array.isArray(existing)) {
    existing.push(String(value));
  } else if (typeof existing !== "undefined") {
    flags[name] = [String(existing), String(value)];
  } else {
    flags[name] = value;
  }
}

async function login(flags: Flags, jsonMode: boolean): Promise<void> {
  const localMode = boolFlag(flags, "local");
  const baseUrl =
    stringFlag(flags, "url") ??
    (localMode ? localApiUrl() : process.env.NEXUS_URL);
  if (!baseUrl) {
    throw new Error(
      "login requires --url <nexus-url>. For local dev, run: npm run nexus -- login --local",
    );
  }

  const profileName =
    stringFlag(flags, "profile") ?? (localMode ? "local" : "default");
  const clientName = stringFlag(flags, "name") ?? `Nexus CLI on ${hostname()}`;
  const api = new NexusApi(baseUrl);
  const device = await api.request<{
    deviceCode: string;
    userCode: string;
    verificationUriComplete: string;
    expiresAt: string;
    interval: number;
  }>("/api/cli/auth/device", {
    method: "POST",
    body: { clientName },
  });

  if (jsonMode) {
    console.error(
      JSON.stringify({
        userCode: device.userCode,
        verificationUri: device.verificationUriComplete,
        expiresAt: device.expiresAt,
      }),
    );
  } else {
    console.log(
      `Open this URL to authorize Nexus CLI:\n${device.verificationUriComplete}`,
    );
    console.log(`Code: ${device.userCode}`);
  }

  if (boolFlag(flags, "open", true)) {
    openBrowser(device.verificationUriComplete);
  }

  const tokenResult = await pollDeviceToken(
    api,
    device.deviceCode,
    device.interval,
    device.expiresAt,
  );
  await saveProfile(profileName, {
    baseUrl,
    token: tokenResult.token,
    user: tokenResult.user,
  });

  if (jsonMode) {
    printJson({
      profile: profileName,
      user: tokenResult.user,
      session: tokenResult.session,
    });
  } else {
    console.log(
      `Logged in as ${tokenResult.user.displayName} (${tokenResult.user.email}).`,
    );
    console.log(`Saved profile "${profileName}" to ${CONFIG_PATH}.`);
  }
}

async function setup(
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const target = args[0] ?? (boolFlag(flags, "local") ? "local" : "remote");
  if (target === "local") {
    flags.local = true;
    await login(flags, jsonMode);
    return;
  }

  if (target === "remote" || target === "deployment") {
    await login(flags, jsonMode);
    return;
  }

  throw new Error(
    'Unknown setup target. Run "npm run nexus -- setup --url <nexus-url>" for a deployment or "npm run nexus -- setup local" for local dev.',
  );
}

async function doctor(flags: Flags, jsonMode: boolean): Promise<void> {
  const config = await loadConfig();
  const localMode = boolFlag(flags, "local");
  const profileName =
    stringFlag(flags, "profile") ??
    (localMode ? "local" : (config.activeProfile ?? "default"));
  const profile = config.profiles[profileName];
  const overrideBaseUrl =
    stringFlag(flags, "nexus-url") ??
    (localMode ? localOverrideUrl() : process.env.NEXUS_URL);
  const envToken = process.env.NEXUS_TOKEN;
  const envOnlyBaseUrl =
    overrideBaseUrl ?? (localMode && envToken ? localApiUrl() : undefined);
  const report: {
    configPath: string;
    activeProfile: string;
    checkedProfile: string;
    profile?: ReturnType<typeof redactProfile>;
    auth?: { ok: boolean; message: string; user?: unknown };
    suggestion?: string;
  } = {
    configPath: CONFIG_PATH,
    activeProfile: config.activeProfile,
    checkedProfile: profileName,
  };

  if (!profile) {
    if (envOnlyBaseUrl && envToken) {
      report.profile = {
        baseUrl: envOnlyBaseUrl,
        user: null,
        hasToken: true,
      };
      await checkDoctorAuth(report, envOnlyBaseUrl, envToken);
    } else {
      report.suggestion =
        "Run: npm run nexus -- setup --url <nexus-url> --profile prod";
    }

    if (jsonMode) {
      printJson(report);
    } else {
      console.log("Nexus CLI Doctor");
      console.log(`Config: ${CONFIG_PATH}`);
      console.log(`Active profile: ${profileName}`);
      if (report.auth) {
        console.log(`API: ${report.profile?.baseUrl}`);
        console.log("Token: configured from NEXUS_TOKEN");
        console.log(
          `Auth: ${report.auth.ok ? "OK" : `failed (${report.auth.message})`}`,
        );
      } else {
        console.log("No configured profile found.");
        console.log(report.suggestion);
      }
    }
    return;
  }

  const baseUrl = overrideBaseUrl ?? profile.baseUrl;
  const token = envToken ?? profile.token;
  report.profile = redactProfile({ ...profile, baseUrl });
  await checkDoctorAuth(report, baseUrl, token);

  if (jsonMode) {
    printJson(report);
    return;
  }

  console.log("Nexus CLI Doctor");
  console.log(`Config: ${CONFIG_PATH}`);
  console.log(`Profile: ${profileName}`);
  console.log(`API: ${baseUrl}`);
  console.log(`Token: ${token ? "configured" : "missing"}`);
  console.log(
    `Auth: ${report.auth?.ok ? "OK" : `failed (${report.auth?.message})`}`,
  );
}

async function checkDoctorAuth(
  report: { auth?: { ok: boolean; message: string; user?: unknown } },
  baseUrl: string,
  token: string,
): Promise<void> {
  try {
    const api = new NexusApi(baseUrl, token);
    const response = await api.request<{ user: unknown }>("/api/auth/me");
    report.auth = { ok: true, message: "Authenticated.", user: response.user };
  } catch (error) {
    report.auth = {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function pollDeviceToken(
  api: NexusApi,
  deviceCode: string,
  intervalSeconds: number,
  expiresAt: string,
): Promise<{
  token: string;
  user: { id: string; email: string; displayName: string };
  session: unknown;
}> {
  const expires = new Date(expiresAt).getTime();
  while (Date.now() < expires + 5000) {
    await delay(Math.max(intervalSeconds, 1) * 1000);
    const result = await api.request<{
      status: "pending" | "approved";
      interval?: number;
      token?: string;
      user?: { id: string; email: string; displayName: string };
      session?: unknown;
    }>("/api/cli/auth/device/token", {
      method: "POST",
      body: { deviceCode },
    });

    if (result.status === "approved" && result.token && result.user) {
      return {
        token: result.token,
        user: result.user,
        session: result.session,
      };
    }
    if (result.interval) {
      intervalSeconds = result.interval;
    }
  }

  throw new Error("CLI login expired before approval completed.");
}

async function auth(
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const subcommand = args[0] ?? "status";
  if (subcommand === "status") {
    const api = await apiFromProfile(flags);
    const response = await api.request<{ user: unknown }>("/api/auth/me");
    if (jsonMode) {
      printJson(response);
    } else {
      console.log("Authenticated.");
      printJson(response.user);
    }
    return;
  }

  if (subcommand === "sessions") {
    const action = args[1] ?? "list";
    const api = await apiFromProfile(flags);
    if (action === "list") {
      const response = await api.request<{
        sessions: Array<Record<string, string | null>>;
      }>("/api/cli/auth/sessions");
      if (jsonMode) {
        printJson(response);
      } else {
        printTable(
          ["ID", "Name", "Last Used", "Expires"],
          response.sessions.map((session) => [
            session.id ?? "",
            session.name ?? "",
            session.lastUsedAt ?? "",
            session.expiresAt ?? "",
          ]),
        );
      }
      return;
    }
    if (action === "revoke") {
      const sessionId = requireArg(args, 2, "sessionId");
      await api.request(
        `/api/cli/auth/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: "DELETE",
        },
      );
      if (!jsonMode) {
        console.log("Session revoked.");
      }
      return;
    }
  }

  throw new Error(`Unknown auth command "${subcommand}".`);
}

async function logout(flags: Flags, jsonMode: boolean): Promise<void> {
  const profileName = stringFlag(flags, "profile");
  const { name, profile } = await requireProfile(profileName);
  const api = new NexusApi(profile.baseUrl, profile.token);
  await api.request("/api/cli/auth/logout", { method: "POST" });

  const config = await loadConfig();
  delete config.profiles[name];
  if (config.activeProfile === name) {
    config.activeProfile = Object.keys(config.profiles)[0] ?? "default";
  }
  await saveConfig(config);

  if (jsonMode) {
    printJson({ success: true, profile: name });
  } else {
    console.log(`Logged out profile "${name}".`);
  }
}

async function profiles(
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  const config = await loadConfig();

  if (action === "list") {
    if (jsonMode) {
      printJson(redactConfig(config));
      return;
    }
    const rows = Object.entries(config.profiles).map(([name, profile]) => [
      name === config.activeProfile ? `* ${name}` : name,
      profile.baseUrl,
      profile.user?.email ?? "",
    ]);
    printTable(["Profile", "URL", "User"], rows);
    return;
  }

  if (action === "use") {
    const name = requireArg(args, 1, "profile");
    if (!config.profiles[name]) {
      throw new Error(`Profile "${name}" is not configured.`);
    }
    config.activeProfile = name;
    await saveConfig(config);
    if (!jsonMode) {
      console.log(`Active profile set to "${name}".`);
    }
    return;
  }

  if (action === "remove") {
    const name = requireArg(args, 1, "profile");
    delete config.profiles[name];
    if (config.activeProfile === name) {
      config.activeProfile = Object.keys(config.profiles)[0] ?? "default";
    }
    await saveConfig(config);
    if (!jsonMode) {
      console.log(`Removed profile "${name}".`);
    }
    return;
  }

  throw new Error(`Unknown profiles command "${action}".`);
}

async function testManager(
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const command = args[0] ?? "list";
  const api = await apiFromProfile(flags);

  switch (command) {
    case "list":
      await listChanges(api, flags, jsonMode);
      return;
    case "dashboard":
      await dashboard(api);
      return;
    case "show":
      await showChange(api, requireArg(args, 1, "change"), jsonMode);
      return;
    case "create":
      await createChange(api, flags, jsonMode);
      return;
    case "update":
      await updateChange(api, requireArg(args, 1, "change"), flags, jsonMode);
      return;
    case "status":
      await setStatus(
        api,
        requireArg(args, 1, "change"),
        requireArg(args, 2, "status"),
        flags,
        jsonMode,
      );
      return;
    case "close":
      await setStatus(
        api,
        requireArg(args, 1, "change"),
        "CLOSED",
        flags,
        jsonMode,
      );
      return;
    case "delete":
      await deleteChange(api, requireArg(args, 1, "change"), flags, jsonMode);
      return;
    case "ready":
      await setReadyToTest(
        api,
        requireArg(args, 1, "change"),
        requireArg(args, 2, "true|false"),
        jsonMode,
      );
      return;
    case "refresh-github":
      await refreshGithub(api, requireArg(args, 1, "change"), jsonMode);
      return;
    case "note":
    case "notes":
      await notes(api, args.slice(1), flags, jsonMode);
      return;
    case "tester":
    case "testers":
      await testers(api, args.slice(1), flags, jsonMode);
      return;
    case "volunteer":
      await mutateChange(
        api,
        requireArg(args, 1, "change"),
        "/volunteer",
        "POST",
        undefined,
        jsonMode,
      );
      return;
    case "retest":
      await mutateChange(
        api,
        requireArg(args, 1, "change"),
        "/retest",
        "POST",
        undefined,
        jsonMode,
      );
      return;
    case "result":
      await submitResult(api, args, flags, jsonMode);
      return;
    case "checklist":
      await checklist(api, args.slice(1), flags, jsonMode);
      return;
    case "links":
      await links(api, args.slice(1), flags, jsonMode);
      return;
    case "reports":
      await reports(api, args.slice(1), flags, jsonMode);
      return;
    case "next-patch":
      await nextPatch(api, args.slice(1), flags, jsonMode);
      return;
    case "server-version":
    case "server-versions":
    case "version":
    case "versions":
      await serverVersion(api, args.slice(1), jsonMode);
      return;
    case "users":
      await users(api, args.slice(1), flags, jsonMode);
      return;
    case "settings":
      await settings(api, args.slice(1), flags, jsonMode);
      return;
    default:
      throw new Error(`Unknown Test Manager command "${command}".`);
  }
}

async function listChanges(
  api: NexusApi,
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const response = await api.request<TestChangesResponse>(
    "/api/test-manager/changes",
    {
      query: {
        status: stringFlag(flags, "status"),
        search: stringFlag(flags, "search"),
      },
    },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printChangeList(response.changes);
  }
}

async function dashboard(api: NexusApi): Promise<void> {
  printJson(await api.request<unknown>("/api/test-manager/dashboard"));
}

async function showChange(
  api: NexusApi,
  changeRef: string,
  jsonMode: boolean,
): Promise<void> {
  const change = await fetchChange(api, changeRef);
  if (jsonMode) {
    printJson({ change });
  } else {
    printChange(change);
  }
}

async function createChange(
  api: NexusApi,
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const description = await readContent(
    flags,
    ["description"],
    ["description-file"],
  );
  const checklist = flagValues(flags, "checklist").map(parseChecklistInput);
  const response = await api.request<TestChangeResponse>(
    "/api/test-manager/changes",
    {
      method: "POST",
      body: {
        title: requiredFlag(flags, "title"),
        description: contentToHtml(description ?? "", boolFlag(flags, "html")),
        category: requiredFlag(flags, "category"),
        subsystem: requiredFlag(flags, "subsystem"),
        priority: normalizeEnum(
          stringFlag(flags, "priority") ?? "MEDIUM",
          PRIORITIES,
        ),
        targetBuild: stringFlag(flags, "target-build") ?? null,
        testServerVersion: stringFlag(flags, "test-server-version") ?? null,
        githubPrUrl: stringFlag(flags, "github-pr-url") ?? null,
        githubIssueUrl: stringFlag(flags, "github-issue-url") ?? null,
        contextLinks: [],
        includeInNextPatch: boolFlag(flags, "include-in-next-patch", true),
        autoClosePassCount: numberFlag(flags, "auto-close-pass-count") ?? 0,
        dueAt: stringFlag(flags, "due-at") ?? null,
        assignedToId: stringFlag(flags, "assigned-to") ?? null,
        checklist,
      },
    },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printChange(response.change);
  }
}

async function updateChange(
  api: NexusApi,
  changeRef: string,
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const existing = await fetchChange(api, changeRef);
  const description = await readContent(
    flags,
    ["description"],
    ["description-file"],
  );
  const payload = {
    title: stringFlag(flags, "title") ?? existing.title,
    description:
      typeof description === "string"
        ? contentToHtml(description, boolFlag(flags, "html"))
        : existing.description,
    category: stringFlag(flags, "category") ?? existing.category,
    subsystem: stringFlag(flags, "subsystem") ?? existing.subsystem,
    priority: normalizeEnum(
      stringFlag(flags, "priority") ?? existing.priority,
      PRIORITIES,
    ),
    targetBuild: boolFlag(flags, "clear-target-build")
      ? null
      : (stringFlag(flags, "target-build") ?? existing.targetBuild),
    testServerVersion: boolFlag(flags, "clear-test-server-version")
      ? null
      : (stringFlag(flags, "test-server-version") ??
        existing.testServerVersion),
    githubPrUrl: boolFlag(flags, "clear-github-pr")
      ? null
      : (stringFlag(flags, "github-pr-url") ??
        existing.githubPullRequest?.url ??
        null),
    githubIssueUrl: boolFlag(flags, "clear-github-issue")
      ? null
      : (stringFlag(flags, "github-issue-url") ??
        existing.githubIssue?.url ??
        null),
    contextLinks: existing.contextLinks,
    includeInNextPatch: boolFlag(
      flags,
      "include-in-next-patch",
      existing.includeInNextPatch,
    ),
    autoClosePassCount:
      numberFlag(flags, "auto-close-pass-count") ?? existing.autoClosePassCount,
    dueAt: boolFlag(flags, "clear-due")
      ? null
      : (stringFlag(flags, "due-at") ?? existing.dueAt),
    assignedToId: boolFlag(flags, "clear-assignee")
      ? null
      : (stringFlag(flags, "assigned-to") ?? existing.assignedTo?.id ?? null),
  };
  const response = await api.request<TestChangeResponse>(
    `/api/test-manager/changes/${encodeURIComponent(existing.id)}`,
    { method: "PATCH", body: payload },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printChange(response.change);
  }
}

async function setStatus(
  api: NexusApi,
  changeRef: string,
  statusValue: string,
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const status = normalizeEnum(statusValue, STATUSES);
  const response = await mutateChange(
    api,
    changeRef,
    "/status",
    "PATCH",
    { status, detail: stringFlag(flags, "detail") ?? null },
    true,
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printChange(response.change);
  }
}

async function setReadyToTest(
  api: NexusApi,
  changeRef: string,
  value: string,
  jsonMode: boolean,
): Promise<void> {
  const readyToTest = parseBoolean(value);
  const response = await mutateChange(
    api,
    changeRef,
    "/ready-to-test",
    "PATCH",
    { readyToTest },
    true,
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printChange(response.change);
  }
}

async function deleteChange(
  api: NexusApi,
  changeRef: string,
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  if (!boolFlag(flags, "yes")) {
    throw new Error("Deleting a change requires --yes.");
  }
  const change = await fetchChange(api, changeRef);
  await api.request(
    `/api/test-manager/changes/${encodeURIComponent(change.id)}`,
    {
      method: "DELETE",
    },
  );
  if (jsonMode) {
    printJson({
      deleted: true,
      changeId: change.id,
      publicId: change.publicId,
    });
  } else {
    console.log(`Deleted #${change.publicId}.`);
  }
}

async function refreshGithub(
  api: NexusApi,
  changeRef: string,
  jsonMode: boolean,
): Promise<void> {
  const response = await mutateChange(
    api,
    changeRef,
    "/github-metadata/refresh",
    "POST",
    undefined,
    true,
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printChange(response.change);
  }
}

async function notes(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  const changeRef = requireArg(args, 1, "change");
  const change = await fetchChange(api, changeRef);

  if (action === "list") {
    if (jsonMode) {
      printJson({ notes: change.notes });
    } else {
      printNotes(change.notes);
    }
    return;
  }
  if (action === "add") {
    const content = await readContent(flags, ["text"], ["file"]);
    if (!content) {
      throw new Error("note add requires --text or --file.");
    }
    const response = await api.request<TestChangeResponse>(
      `/api/test-manager/changes/${encodeURIComponent(change.id)}/notes`,
      {
        method: "POST",
        body: {
          contentHtml: contentToHtml(content, boolFlag(flags, "html")),
        },
      },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChange(response.change);
    }
    return;
  }
  if (action === "delete") {
    const noteId = requireArg(args, 2, "noteId");
    const response = await api.request<TestChangeResponse>(
      `/api/test-manager/changes/${encodeURIComponent(change.id)}/notes/${encodeURIComponent(noteId)}`,
      { method: "DELETE" },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChange(response.change);
    }
    return;
  }

  throw new Error(`Unknown note command "${action}".`);
}

async function testers(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  const changeRef = requireArg(args, 1, "change");
  const change = await fetchChange(api, changeRef);

  if (action === "list") {
    if (jsonMode) {
      printJson({ testers: change.testers });
    } else {
      printTesters(change.testers);
    }
    return;
  }
  if (action === "request") {
    const userId = requireArg(args, 2, "userId");
    const assignment = normalizeEnum(
      stringFlag(flags, "assignment") ?? "ADMIN_REQUESTED",
      ASSIGNMENTS,
    );
    const response = await api.request<TestChangeResponse>(
      `/api/test-manager/changes/${encodeURIComponent(change.id)}/request`,
      { method: "POST", body: { userId, assignment } },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChange(response.change);
    }
    return;
  }
  if (action === "remove") {
    const testerId = requireArg(args, 2, "testerId");
    const response = await api.request<TestChangeResponse>(
      `/api/test-manager/changes/${encodeURIComponent(change.id)}/testers/${encodeURIComponent(testerId)}`,
      { method: "DELETE" },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChange(response.change);
    }
    return;
  }

  throw new Error(`Unknown tester command "${action}".`);
}

async function submitResult(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const change = await fetchChange(api, requireArg(args, 1, "change"));
  const result = normalizeEnum(
    requireArg(args, 2, "pass|fail|blocked"),
    RESULTS,
  );
  const notesHtml = contentToHtml(
    (await readContent(flags, ["notes"], ["file"])) ?? "",
    boolFlag(flags, "html"),
  );
  const response = await api.request<TestChangeResponse>(
    `/api/test-manager/changes/${encodeURIComponent(change.id)}/result`,
    { method: "POST", body: { result, notesHtml } },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printChange(response.change);
  }
}

async function checklist(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  const change = await fetchChange(api, requireArg(args, 1, "change"));

  if (action === "list") {
    if (jsonMode) {
      printJson({ checklist: change.checklist });
    } else {
      printTable(
        ["#", "ID", "Title", "Category"],
        change.checklist.map((item, index) => [
          String(index + 1),
          item.id,
          item.title,
          item.category ?? "",
        ]),
      );
    }
    return;
  }
  if (action === "add") {
    const response = await api.request<TestChangeResponse>(
      `/api/test-manager/changes/${encodeURIComponent(change.id)}/checklist`,
      {
        method: "POST",
        body: {
          title: requiredFlag(flags, "title"),
          details: stringFlag(flags, "details") ?? null,
          category: stringFlag(flags, "category") ?? null,
        },
      },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChange(response.change);
    }
    return;
  }

  const item = resolveChecklistItem(
    change,
    requireArg(args, 2, "checklistItem"),
  );
  if (action === "delete") {
    const response = await api.request<TestChangeResponse>(
      `/api/test-manager/changes/${encodeURIComponent(change.id)}/checklist/${encodeURIComponent(item.id)}`,
      { method: "DELETE" },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChange(response.change);
    }
    return;
  }
  if (action === "check" || action === "uncheck" || action === "note") {
    const notes = await readContent(flags, ["notes"], ["file"]);
    const body =
      action === "note"
        ? {
            notesHtml: contentToHtml(notes ?? "", boolFlag(flags, "html")),
          }
        : {
            completed: action === "check",
            ...(typeof notes === "string"
              ? {
                  notesHtml: contentToHtml(notes, boolFlag(flags, "html")),
                }
              : {}),
          };
    const response = await api.request<TestChangeResponse>(
      `/api/test-manager/changes/${encodeURIComponent(change.id)}/checklist/${encodeURIComponent(item.id)}`,
      { method: "POST", body },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChange(response.change);
    }
    return;
  }

  throw new Error(`Unknown checklist command "${action}".`);
}

async function links(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  const change = await fetchChange(api, requireArg(args, 1, "change"));

  if (action === "list") {
    if (jsonMode) {
      printJson({ links: change.contextLinks });
    } else {
      printContextLinks(change.contextLinks);
    }
    return;
  }

  let nextLinks = [...change.contextLinks];
  if (action === "add") {
    nextLinks.push({
      id: stringFlag(flags, "id") ?? `cli-${Date.now()}`,
      kind: normalizeLinkKind(stringFlag(flags, "kind") ?? "OTHER"),
      label: stringFlag(flags, "label") ?? stringFlag(flags, "url") ?? "Link",
      url: requiredFlag(flags, "url"),
      description: stringFlag(flags, "description") ?? "",
    });
  } else if (action === "remove") {
    const linkRef = requireArg(args, 2, "link");
    nextLinks = nextLinks.filter(
      (link, index) => link.id !== linkRef && String(index + 1) !== linkRef,
    );
  } else if (action === "set") {
    const file = requiredFlag(flags, "file");
    nextLinks = JSON.parse(
      await readFile(file, "utf-8"),
    ) as TestChangeContextLink[];
  } else {
    throw new Error(`Unknown links command "${action}".`);
  }

  const response = await api.request<TestChangeResponse>(
    `/api/test-manager/changes/${encodeURIComponent(change.id)}/context-links`,
    { method: "PATCH", body: { contextLinks: nextLinks } },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printChange(response.change);
  }
}

async function reports(
  api: NexusApi,
  args: string[],
  _flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  const change = await fetchChange(api, requireArg(args, 1, "change"));

  if (action === "list") {
    if (jsonMode) {
      printJson({ reports: change.webhookReports });
    } else {
      printReports(change.webhookReports);
    }
    return;
  }
  if (action === "link" || action === "unlink") {
    const messageId = requireArg(args, 2, "messageId");
    const response = await api.request<TestChangeResponse>(
      `/api/test-manager/changes/${encodeURIComponent(change.id)}/webhook-reports${
        action === "unlink" ? `/${encodeURIComponent(messageId)}` : ""
      }`,
      {
        method: action === "link" ? "POST" : "DELETE",
        body: action === "link" ? { messageId } : undefined,
      },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChange(response.change);
    }
    return;
  }

  throw new Error(`Unknown reports command "${action}".`);
}

async function nextPatch(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  if (action === "list") {
    const response = await api.request<TestChangesResponse>(
      "/api/test-manager/next-patch",
      {
        query: { view: stringFlag(flags, "view") ?? "complete" },
      },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChangeList(response.changes);
    }
    return;
  }
  if (action === "count") {
    const response = await api.request<unknown>(
      "/api/test-manager/next-patch/count",
    );
    printJson(response);
    return;
  }
  if (action === "reset") {
    requireYes(flags, "Resetting the next patch queue");
    const response = await api.request<unknown>(
      "/api/test-manager/next-patch/reset",
      {
        method: "POST",
      },
    );
    printJson(response);
    return;
  }
  if (action === "include" || action === "exclude") {
    const response = await setNextPatchInclusion(
      api,
      requireArg(args, 1, "change"),
      action === "include",
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printChange(response.change);
    }
    return;
  }
  if (action === "patch-notes") {
    const response = await api.request<unknown>(
      "/api/test-manager/next-patch/patch-notes",
      {
        method: "POST",
      },
    );
    printJson(response);
    return;
  }

  throw new Error(`Unknown next-patch command "${action}".`);
}

async function serverVersion(
  api: NexusApi,
  args: string[],
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "get";
  if (["get", "list", "status"].includes(action)) {
    const response = await api.request<TestManagerServerVersion>(
      "/api/test-manager/server-version",
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printServerVersion(response);
    }
    return;
  }

  if (action === "set-test" || action === "test") {
    const response = await api.request<TestManagerServerVersion>(
      "/api/test-manager/server-version",
      {
        method: "PUT",
        body: { currentTestServerVersion: requireArg(args, 1, "version") },
      },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printServerVersion(response);
    }
    return;
  }

  if (action === "clear-test") {
    const response = await api.request<TestManagerServerVersion>(
      "/api/test-manager/server-version",
      {
        method: "PUT",
        body: { currentTestServerVersion: null },
      },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printServerVersion(response);
    }
    return;
  }

  if (action === "set-live" || action === "live") {
    const response = await api.request<
      Pick<TestManagerServerVersion, "currentLiveServerVersion">
    >("/api/test-manager/live-server-version", {
      method: "PUT",
      body: { currentLiveServerVersion: requireArg(args, 1, "version") },
    });
    if (jsonMode) {
      printJson(response);
    } else {
      console.log(
        `Current live server: ${response.currentLiveServerVersion ?? "Not set"}`,
      );
    }
    return;
  }

  if (action === "clear-live") {
    const response = await api.request<
      Pick<TestManagerServerVersion, "currentLiveServerVersion">
    >("/api/test-manager/live-server-version", {
      method: "PUT",
      body: { currentLiveServerVersion: null },
    });
    if (jsonMode) {
      printJson(response);
    } else {
      console.log(
        `Current live server: ${response.currentLiveServerVersion ?? "Not set"}`,
      );
    }
    return;
  }

  throw new Error(`Unknown server-version command "${action}".`);
}

async function users(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  if (action === "list") {
    const response = await api.request<{
      users: Array<Record<string, unknown>>;
    }>("/api/test-manager/users");
    if (jsonMode) {
      printJson(response);
    } else {
      printJson(response.users);
    }
    return;
  }
  if (action === "set-tester") {
    requireYes(flags, "Changing Test Manager tester access");
    const userId = requireArg(args, 1, "userId");
    const tester = parseBoolean(requireArg(args, 2, "true|false"));
    const response = await api.request<unknown>(
      `/api/test-manager/users/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        body: { tester },
      },
    );
    printJson(response);
    return;
  }

  throw new Error(`Unknown users command "${action}".`);
}

async function settings(
  api: NexusApi,
  args: string[],
  flags: Flags,
  _jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "get";
  if (action === "get") {
    const response = await api.request<unknown>("/api/test-manager/settings");
    printJson(response);
    return;
  }
  if (action === "update") {
    requireYes(flags, "Updating Test Manager settings");
    const file = requiredFlag(flags, "file");
    const body = JSON.parse(await readFile(file, "utf-8")) as unknown;
    const response = await api.request<unknown>("/api/test-manager/settings", {
      method: "PUT",
      body,
    });
    printJson(response);
    return;
  }

  throw new Error(`Unknown settings command "${action}".`);
}

async function webhookInbox(
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const command = args[0] ?? "list";
  const api = await apiFromProfile(flags);

  switch (command) {
    case "list":
      await listWebhookInbox(api, flags, jsonMode);
      return;
    case "show":
    case "get":
      await showWebhookMessage(api, requireArg(args, 1, "messageId"), jsonMode);
      return;
    case "link":
    case "url":
      printWebhookMessageLink(api, requireArg(args, 1, "messageId"), flags, jsonMode);
      return;
    case "assign":
      await assignWebhookMessage(
        api,
        requireArg(args, 1, "messageId"),
        args[2],
        flags,
        jsonMode,
      );
      return;
    case "unassign":
      await setWebhookMessageAssignment(
        api,
        requireArg(args, 1, "messageId"),
        null,
        jsonMode,
      );
      return;
    case "archive":
      await setWebhookMessageArchived(
        api,
        requireArg(args, 1, "messageId"),
        true,
        jsonMode,
      );
      return;
    case "unarchive":
      await setWebhookMessageArchived(
        api,
        requireArg(args, 1, "messageId"),
        false,
        jsonMode,
      );
      return;
    case "delete":
      await deleteWebhookMessage(api, requireArg(args, 1, "messageId"), flags, jsonMode);
      return;
    case "review":
    case "ai-review":
    case "retry-crash-review":
      await retryWebhookCrashReview(
        api,
        requireArg(args, 1, "messageId"),
        args[2],
        flags,
        jsonMode,
      );
      return;
    case "discord-summary":
    case "send-discord-summary":
      await sendWebhookDiscordSummary(api, requireArg(args, 1, "messageId"), jsonMode);
      return;
    case "read":
      await setWebhookMessageRead(api, requireArg(args, 1, "messageId"), true, jsonMode);
      return;
    case "unread":
      await setWebhookMessageRead(api, requireArg(args, 1, "messageId"), false, jsonMode);
      return;
    case "star":
      await setWebhookMessageStar(api, requireArg(args, 1, "messageId"), true, jsonMode);
      return;
    case "unstar":
      await setWebhookMessageStar(api, requireArg(args, 1, "messageId"), false, jsonMode);
      return;
    case "unread-count":
      await getWebhookUnreadCount(api, flags);
      return;
    case "pending-count":
    case "pending-action-count":
      await getWebhookPendingActionCount(api);
      return;
    case "label":
    case "labels":
      await webhookLabels(api, args.slice(1), flags, jsonMode);
      return;
    case "bulk":
      await bulkWebhookInbox(api, args.slice(1), flags, jsonMode);
      return;
    case "merge":
      await mergeWebhookInboxMessages(api, args.slice(1), flags, jsonMode);
      return;
    case "dismiss-merge":
      await dismissWebhookInboxMerge(api, args.slice(1), flags, jsonMode);
      return;
    case "crash":
    case "crashes":
      await webhookCrashes(api, args.slice(1), flags, jsonMode);
      return;
    case "inspect-crash":
    case "inspect-crash-report":
      await inspectWebhookCrashReport(api, flags, jsonMode);
      return;
    case "sort-crash":
    case "sort-crash-segments":
      await sortWebhookCrashSegments(api, flags);
      return;
    case "group":
    case "groups":
    case "pending-groups":
      await webhookPendingGroups(api, args.slice(1), jsonMode);
      return;
    case "hook":
    case "hooks":
    case "webhook":
    case "webhooks":
    case "endpoints":
      await webhookEndpoints(api, args.slice(1), flags, jsonMode);
      return;
    default:
      throw new Error(`Unknown webhook inbox command "${command}".`);
  }
}

async function listWebhookInbox(
  api: NexusApi,
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const status = stringFlag(flags, "status")
    ? normalizeEnum(requiredFlag(flags, "status"), WEBHOOK_MESSAGE_STATUSES)
    : undefined;
  const readStatus = stringFlag(flags, "read-status")
    ? normalizeChoice(requiredFlag(flags, "read-status"), [
        "read",
        "unread",
        "all",
      ] as const)
    : undefined;
  const labelIds = webhookLabelIds(flags);
  const response = await api.request<WebhookInboxResponse>(
    "/api/admin/webhook-inbox",
    {
      query: {
        page: numberFlag(flags, "page"),
        pageSize: numberFlag(flags, "page-size") ?? numberFlag(flags, "pageSize"),
        webhookId: stringFlag(flags, "webhook-id") ?? stringFlag(flags, "webhookId"),
        status,
        includeArchived: boolFlag(flags, "include-archived") ? true : undefined,
        readStatus: readStatus === "all" ? undefined : readStatus,
        starred: boolFlag(flags, "starred") ? true : undefined,
        labelIds: labelIds.length ? labelIds.join(",") : undefined,
      },
    },
  );

  if (jsonMode) {
    printJson(response);
  } else {
    printWebhookInboxList(response);
  }
}

async function showWebhookMessage(
  api: NexusApi,
  messageId: string,
  jsonMode: boolean,
): Promise<InboundWebhookMessage> {
  const response = await api.request<WebhookInboxMessageResponse>(
    `/api/admin/webhook-inbox/${encodeURIComponent(messageId)}`,
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printWebhookMessage(response.message);
  }
  return response.message;
}

function printWebhookMessageLink(
  api: NexusApi,
  messageId: string,
  flags: Flags,
  jsonMode: boolean,
): void {
  const url = webhookMessageUrl(api, messageId, flags);
  if (boolFlag(flags, "open")) {
    openBrowser(url);
  }
  if (jsonMode) {
    printJson({ messageId, url });
  } else {
    console.log(url);
  }
}

async function assignWebhookMessage(
  api: NexusApi,
  messageId: string,
  adminRef: string | undefined,
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  let adminId: string | null;
  if (boolFlag(flags, "clear")) {
    adminId = null;
  } else if (boolFlag(flags, "me") || adminRef?.toLowerCase() === "me") {
    adminId = await currentUserId(api);
  } else {
    adminId = adminRef ?? requiredFlag(flags, "admin-id");
  }
  await setWebhookMessageAssignment(api, messageId, adminId, jsonMode);
}

async function setWebhookMessageAssignment(
  api: NexusApi,
  messageId: string,
  adminId: string | null,
  jsonMode: boolean,
): Promise<void> {
  const response = await api.request<WebhookInboxMessageResponse>(
    `/api/admin/webhook-inbox/${encodeURIComponent(messageId)}/assign`,
    { method: "PUT", body: { adminId } },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printWebhookMessage(response.message);
  }
}

async function setWebhookMessageArchived(
  api: NexusApi,
  messageId: string,
  archived: boolean,
  jsonMode: boolean,
): Promise<void> {
  const response = await api.request<WebhookInboxMessageResponse>(
    `/api/admin/webhook-inbox/${encodeURIComponent(messageId)}/archive`,
    { method: "PUT", body: { archived } },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printWebhookMessage(response.message);
  }
}

async function deleteWebhookMessage(
  api: NexusApi,
  messageId: string,
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  requireYes(flags, "Deleting a webhook inbox message");
  await api.request(`/api/admin/webhook-inbox/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
  if (jsonMode) {
    printJson({ deleted: true, messageId });
  } else {
    console.log(`Deleted webhook message ${messageId}.`);
  }
}

async function retryWebhookCrashReview(
  api: NexusApi,
  messageId: string,
  providerArg: string | undefined,
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const provider = normalizeChoice(
    stringFlag(flags, "provider") ?? providerArg ?? "gemini",
    CRASH_REVIEW_PROVIDERS,
  );
  const response = await api.request<WebhookInboxMessageResponse>(
    `/api/admin/webhook-inbox/${encodeURIComponent(messageId)}/retry-crash-review`,
    {
      method: "POST",
      body: {
        provider,
        useEqemuOracleContext: eqemuOracleFlag(flags),
      },
    },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printWebhookMessage(response.message);
  }
}

async function sendWebhookDiscordSummary(
  api: NexusApi,
  messageId: string,
  jsonMode: boolean,
): Promise<void> {
  const response = await api.request<WebhookInboxMessageResponse>(
    `/api/admin/webhook-inbox/${encodeURIComponent(messageId)}/send-discord-summary`,
    { method: "POST" },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printWebhookMessage(response.message);
  }
}

async function setWebhookMessageRead(
  api: NexusApi,
  messageId: string,
  read: boolean,
  jsonMode: boolean,
): Promise<void> {
  await api.request(`/api/admin/webhook-inbox/${encodeURIComponent(messageId)}/read`, {
    method: "PUT",
    body: { read },
  });
  if (jsonMode) {
    printJson({ messageId, read });
  } else {
    console.log(`Marked webhook message ${messageId} as ${read ? "read" : "unread"}.`);
  }
}

async function setWebhookMessageStar(
  api: NexusApi,
  messageId: string,
  starred: boolean,
  jsonMode: boolean,
): Promise<void> {
  await api.request(`/api/admin/webhook-inbox/${encodeURIComponent(messageId)}/star`, {
    method: "PUT",
    body: { starred },
  });
  if (jsonMode) {
    printJson({ messageId, starred });
  } else {
    console.log(`${starred ? "Starred" : "Unstarred"} webhook message ${messageId}.`);
  }
}

async function getWebhookUnreadCount(api: NexusApi, flags: Flags): Promise<void> {
  const response = await api.request<{ count: number }>(
    "/api/admin/webhook-inbox/unread-count",
    {
      query: {
        webhookId: stringFlag(flags, "webhook-id") ?? stringFlag(flags, "webhookId"),
      },
    },
  );
  printJson(response);
}

async function getWebhookPendingActionCount(api: NexusApi): Promise<void> {
  const response = await api.request<{ count: number }>(
    "/api/admin/webhook-inbox/pending-action-count",
  );
  printJson(response);
}

async function webhookLabels(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  if (action === "list") {
    const response = await api.request<WebhookLabelsResponse>(
      "/api/admin/webhook-labels",
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printWebhookLabels(response.labels);
    }
    return;
  }

  if (action === "create") {
    const response = await api.request<WebhookLabelResponse>(
      "/api/admin/webhook-labels",
      {
        method: "POST",
        body: {
          name: stringFlag(flags, "name") ?? requireArg(args, 1, "name"),
          color: requiredFlag(flags, "color"),
          autoArchive: boolFlag(flags, "auto-archive"),
          autoDelete: boolFlag(flags, "auto-delete"),
        },
      },
    );
    printLabelResult(response, jsonMode);
    return;
  }

  if (action === "find" || action === "find-or-create") {
    const response = await api.request<WebhookLabelResponse>(
      "/api/admin/webhook-labels/find-or-create",
      {
        method: "POST",
        body: { name: stringFlag(flags, "name") ?? requireArg(args, 1, "name") },
      },
    );
    printLabelResult(response, jsonMode);
    return;
  }

  if (action === "update") {
    const labelId = requireArg(args, 1, "labelId");
    const body: Record<string, unknown> = {};
    assignIfDefined(body, "name", stringFlag(flags, "name"));
    assignIfDefined(body, "color", stringFlag(flags, "color"));
    assignIfDefined(body, "sortOrder", numberFlag(flags, "sort-order"));
    if (flagProvided(flags, "auto-archive")) {
      body.autoArchive = boolFlag(flags, "auto-archive");
    }
    if (flagProvided(flags, "auto-delete")) {
      body.autoDelete = boolFlag(flags, "auto-delete");
    }
    const response = await api.request<WebhookLabelResponse>(
      `/api/admin/webhook-labels/${encodeURIComponent(labelId)}`,
      { method: "PUT", body },
    );
    printLabelResult(response, jsonMode);
    return;
  }

  if (action === "delete") {
    requireYes(flags, "Deleting a webhook label");
    const labelId = requireArg(args, 1, "labelId");
    await api.request(`/api/admin/webhook-labels/${encodeURIComponent(labelId)}`, {
      method: "DELETE",
    });
    if (jsonMode) {
      printJson({ deleted: true, labelId });
    } else {
      console.log(`Deleted webhook label ${labelId}.`);
    }
    return;
  }

  if (action === "set") {
    const messageId = requireArg(args, 1, "messageId");
    const labelIds = [...args.slice(2), ...webhookLabelIds(flags)];
    await setWebhookMessageLabels(api, messageId, labelIds, jsonMode);
    return;
  }

  throw new Error(`Unknown webhook label command "${action}".`);
}

async function setWebhookMessageLabels(
  api: NexusApi,
  messageId: string,
  labelIds: string[],
  jsonMode: boolean,
): Promise<void> {
  await api.request(`/api/admin/webhook-inbox/${encodeURIComponent(messageId)}/labels`, {
    method: "PUT",
    body: { labelIds },
  });
  if (jsonMode) {
    printJson({ messageId, labelIds });
  } else {
    console.log(`Set ${labelIds.length} label(s) on webhook message ${messageId}.`);
  }
}

async function bulkWebhookInbox(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = normalizeWebhookBulkAction(requireArg(args, 0, "action"));
  if (action === "delete") {
    requireYes(flags, "Bulk deleting webhook inbox messages");
  }
  const messageIds = [...args.slice(1), ...webhookMessageIds(flags)];
  if (!messageIds.length) {
    throw new Error("Bulk webhook inbox actions require at least one message id.");
  }
  const labelIds = webhookLabelIds(flags);
  const response = await api.request<WebhookInboxBulkResponse>(
    "/api/admin/webhook-inbox/bulk",
    {
      method: "POST",
      body: {
        messageIds,
        action,
        labelIds: labelIds.length ? labelIds : undefined,
      },
    },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    console.log(`Bulk action ${action}: ${response.success} succeeded, ${response.failed} failed.`);
  }
}

async function mergeWebhookInboxMessages(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const messageIds = [...args, ...webhookMessageIds(flags)];
  if (messageIds.length < 2) {
    throw new Error("Merging webhook inbox messages requires at least two message ids.");
  }
  const combinedText = await readContent(
    flags,
    ["combined-text"],
    ["combined-file"],
  );
  if (!combinedText) {
    throw new Error("Merging webhook inbox messages requires --combined-text or --combined-file.");
  }
  const response = await api.request<WebhookInboxMessageResponse>(
    "/api/admin/webhook-inbox/merge",
    { method: "POST", body: { messageIds, combinedText } },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    printWebhookMessage(response.message);
  }
}

async function dismissWebhookInboxMerge(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const messageIds = [...args, ...webhookMessageIds(flags)];
  if (!messageIds.length) {
    throw new Error("Dismissing a webhook merge requires at least one message id.");
  }
  const response = await api.request<{ success: boolean; processedCount: number }>(
    "/api/admin/webhook-inbox/dismiss-merge",
    { method: "POST", body: { messageIds } },
  );
  if (jsonMode) {
    printJson(response);
  } else {
    console.log(`Processed ${response.processedCount} dismissed merge message(s).`);
  }
}

async function webhookCrashes(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "summary";
  if (action === "summary") {
    const response = await api.request<{ summary: CrashTelemetrySummary }>(
      "/api/admin/webhook-inbox/crashes/summary",
      {
        query: {
          includeArchived: boolFlag(flags, "include-archived") ? true : undefined,
        },
      },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printCrashTelemetrySummary(response.summary);
    }
    return;
  }

  if (action === "list" || action === "reports") {
    const response = await api.request<{ crashes: CrashTelemetryReport[] }>(
      "/api/admin/webhook-inbox/crashes",
      {
        query: {
          version: stringFlag(flags, "version"),
          includeArchived: boolFlag(flags, "include-archived") ? true : undefined,
        },
      },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printCrashTelemetryReports(response.crashes);
    }
    return;
  }

  throw new Error(`Unknown webhook crash command "${action}".`);
}

async function inspectWebhookCrashReport(
  api: NexusApi,
  flags: Flags,
  _jsonMode: boolean,
): Promise<void> {
  const crashReportText = await readContent(
    flags,
    ["text", "crash-report"],
    ["file", "crash-report-file"],
  );
  if (!crashReportText) {
    throw new Error("Crash report inspection requires --text or --file.");
  }
  const response = await api.request<unknown>(
    "/api/admin/webhook-inbox/inspect-crash-report",
    { method: "POST", body: { crashReportText } },
  );
  printJson(response);
}

async function sortWebhookCrashSegments(api: NexusApi, flags: Flags): Promise<void> {
  const raw = await readContent(flags, ["segments"], ["segments-file"]);
  if (!raw) {
    throw new Error("Crash segment sorting requires --segments-file or --segments JSON.");
  }
  const segments = JSON.parse(raw) as Array<{ id: string; text: string }>;
  const response = await api.request<unknown>(
    "/api/admin/webhook-inbox/sort-crash-segments",
    { method: "POST", body: { segments } },
  );
  printJson(response);
}

async function webhookPendingGroups(
  api: NexusApi,
  args: string[],
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  if (action === "list") {
    const response = await api.request<{
      groups: Array<{
        compositeKey: string;
        groupKey: string;
        webhookId: string;
        messageCount: number;
        messageIds: string[];
        firstMessageAt: string;
        expiresAt: string;
        remainingSeconds: number;
        status: "pending" | "processing";
      }>;
    }>("/api/admin/webhooks/pending-merge-groups");
    if (jsonMode) {
      printJson(response);
    } else if (!response.groups.length) {
      console.log("No pending webhook merge groups.");
    } else {
      printTable(
        ["Webhook", "Group", "Messages", "Status", "Remaining"],
        response.groups.map((group) => [
          group.webhookId,
          group.groupKey,
          String(group.messageCount),
          group.status,
          `${group.remainingSeconds}s`,
        ]),
      );
    }
    return;
  }

  if (action === "process" || action === "process-now") {
    const response = await api.request<{ success: boolean }>(
      `/api/admin/webhooks/${encodeURIComponent(requireArg(args, 1, "webhookId"))}/process-group-now`,
      { method: "POST", body: { groupKey: requireArg(args, 2, "groupKey") } },
    );
    printJson(response);
    return;
  }

  throw new Error(`Unknown webhook pending group command "${action}".`);
}

async function webhookEndpoints(
  api: NexusApi,
  args: string[],
  flags: Flags,
  jsonMode: boolean,
): Promise<void> {
  const action = args[0] ?? "list";
  if (action === "list") {
    const response = await api.request<InboundWebhooksResponse>(
      "/api/admin/webhooks",
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printInboundWebhooks(response.webhooks);
    }
    return;
  }

  if (action === "processing-status") {
    printJson(await api.request<unknown>("/api/admin/webhooks/processing-status"));
    return;
  }

  if (action === "test") {
    const payload = await readWebhookPayload(flags, {
      event: "test",
      message: "Hello from Nexus CLI.",
    });
    const response = await api.request<WebhookInboxMessageResponse>(
      `/api/admin/webhooks/${encodeURIComponent(requireArg(args, 1, "webhookId"))}/test`,
      {
        method: "POST",
        body: {
          payload,
          runActions: flagProvided(flags, "run-actions")
            ? boolFlag(flags, "run-actions")
            : undefined,
        },
      },
    );
    if (jsonMode) {
      printJson(response);
    } else {
      printWebhookMessage(response.message);
    }
    return;
  }

  throw new Error(`Unknown webhook endpoint command "${action}".`);
}

async function fetchChange(
  api: NexusApi,
  changeRef: string,
): Promise<TestChange> {
  const normalized = changeRef.replace(/^#/, "");
  const response = await api.request<TestChangeResponse>(
    `/api/test-manager/changes/${encodeURIComponent(normalized)}`,
  );
  return response.change;
}

async function setNextPatchInclusion(
  api: NexusApi,
  changeRef: string,
  includeInNextPatch: boolean,
): Promise<TestChangeResponse> {
  return mutateChange(
    api,
    changeRef,
    "/next-patch",
    "PATCH",
    { includeInNextPatch },
    true,
  );
}

async function mutateChange(
  api: NexusApi,
  changeRef: string,
  suffix: string,
  method: string,
  body: unknown,
  returnResponse: true,
): Promise<TestChangeResponse>;
async function mutateChange(
  api: NexusApi,
  changeRef: string,
  suffix: string,
  method: string,
  body: unknown,
  jsonMode: boolean,
): Promise<TestChangeResponse>;
async function mutateChange(
  api: NexusApi,
  changeRef: string,
  suffix: string,
  method: string,
  body: unknown,
  jsonMode: boolean,
): Promise<TestChangeResponse> {
  const change = await fetchChange(api, changeRef);
  const response = await api.request<TestChangeResponse>(
    `/api/test-manager/changes/${encodeURIComponent(change.id)}${suffix}`,
    { method, body },
  );
  if (jsonMode !== true) {
    printChange(response.change);
  }
  return response;
}

async function apiFromProfile(flags: Flags): Promise<NexusApi> {
  const localMode = boolFlag(flags, "local");
  const profileName =
    stringFlag(flags, "profile") ?? (localMode ? "local" : undefined);
  const overrideBaseUrl =
    stringFlag(flags, "nexus-url") ??
    (localMode ? localOverrideUrl() : process.env.NEXUS_URL);
  const envToken = process.env.NEXUS_TOKEN;
  const envOnlyBaseUrl =
    overrideBaseUrl ?? (localMode && envToken ? localApiUrl() : undefined);
  if (envOnlyBaseUrl && envToken && !stringFlag(flags, "profile")) {
    return new NexusApi(envOnlyBaseUrl, envToken);
  }

  const { profile } = await requireProfile(profileName);
  return new NexusApi(
    overrideBaseUrl ?? profile.baseUrl,
    envToken ?? profile.token,
  );
}

async function currentUserId(api: NexusApi): Promise<string> {
  const response = await api.request<{ user?: { id?: string }; id?: string }>(
    "/api/auth/me",
  );
  const userId = response.user?.id ?? response.id;
  if (!userId) {
    throw new Error("Unable to determine the current user id.");
  }
  return userId;
}

function printLabelResult(
  response: WebhookLabelResponse,
  jsonMode: boolean,
): void {
  if (jsonMode) {
    printJson(response);
  } else {
    printWebhookLabels([response.label]);
  }
}

function webhookMessageUrl(api: NexusApi, messageId: string, flags: Flags): string {
  const url = new URL("/admin/webhooks", appBaseUrl(api, flags));
  url.searchParams.set("messageId", messageId);
  return url.toString();
}

function appBaseUrl(api: NexusApi, flags: Flags): string {
  const explicit =
    stringFlag(flags, "app-url") ??
    process.env.NEXUS_APP_URL ??
    (boolFlag(flags, "local") ? process.env.NEXUS_LOCAL_CLIENT_URL : undefined);
  if (explicit) {
    return trimTrailingSlash(explicit);
  }

  const apiUrl = new URL(api.baseUrl);
  if (
    (apiUrl.hostname === "localhost" || apiUrl.hostname === "127.0.0.1") &&
    apiUrl.port === "4000"
  ) {
    return DEFAULT_LOCAL_APP_URL;
  }
  return apiUrl.origin;
}

function webhookMessageIds(flags: Flags): string[] {
  return [
    ...flagValues(flags, "message-id"),
    ...splitCsv(stringFlag(flags, "message-ids")),
  ].filter(Boolean);
}

function webhookLabelIds(flags: Flags): string[] {
  return [
    ...flagValues(flags, "label-id"),
    ...splitCsv(stringFlag(flags, "label-ids")),
  ].filter(Boolean);
}

function normalizeWebhookBulkAction(value: string): WebhookInboxBulkAction {
  const normalized = value.trim().replace(/[-_]/g, "").toLowerCase();
  const match = WEBHOOK_BULK_ACTIONS.find(
    (action) => action.toLowerCase() === normalized,
  );
  if (!match) {
    throw new Error(
      `Invalid bulk action "${value}". Expected one of: ${WEBHOOK_BULK_ACTIONS.join(", ")}.`,
    );
  }
  return match;
}

function normalizeChoice<T extends string>(
  value: string,
  allowed: readonly T[],
): T {
  const normalized = value.trim().replace(/-/g, "_").toLowerCase();
  const match = allowed.find((item) => item.toLowerCase() === normalized);
  if (!match) {
    throw new Error(
      `Invalid value "${value}". Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

function eqemuOracleFlag(flags: Flags): boolean | undefined {
  if (flagProvided(flags, "use-eqemu-oracle-context")) {
    return boolFlag(flags, "use-eqemu-oracle-context");
  }
  if (flagProvided(flags, "oracle")) {
    return boolFlag(flags, "oracle");
  }
  return undefined;
}

async function readWebhookPayload(
  flags: Flags,
  fallback: unknown,
): Promise<unknown> {
  const raw = await readContent(flags, ["payload"], ["payload-file"]);
  if (raw === null) {
    return fallback;
  }
  return parseJsonOrString(raw);
}

function parseJsonOrString(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function assignIfDefined(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (typeof value !== "undefined") {
    target[key] = value;
  }
}

function splitCsv(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function flagProvided(flags: Flags, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(flags, name);
}

function resolveChecklistItem(
  change: TestChange,
  ref: string,
): TestChangeChecklistItem {
  const byId = change.checklist.find((item) => item.id === ref);
  if (byId) {
    return byId;
  }

  const index = Number(ref);
  if (Number.isInteger(index) && index > 0 && change.checklist[index - 1]) {
    return change.checklist[index - 1];
  }

  const lower = ref.toLowerCase();
  const byTitle = change.checklist.find(
    (item) => item.title.toLowerCase() === lower,
  );
  if (byTitle) {
    return byTitle;
  }

  throw new Error(
    `Checklist item "${ref}" was not found on #${change.publicId}.`,
  );
}

function parseChecklistInput(value: string): {
  title: string;
  details?: string | null;
  category?: string | null;
} {
  const [title, details, category] = value.split("|");
  if (!title?.trim()) {
    throw new Error("Checklist entries must include a title.");
  }
  return {
    title: title.trim(),
    details: details?.trim() || null,
    category: category?.trim() || null,
  };
}

function printContextLinks(links: TestChangeContextLink[]): void {
  if (!links.length) {
    console.log("No context links.");
    return;
  }
  printTable(
    ["#", "ID", "Kind", "Label", "URL"],
    links.map((link, index) => [
      String(index + 1),
      link.id,
      link.kind,
      link.label,
      link.url,
    ]),
  );
}

function printReports(
  reports: Array<{
    id: string;
    messageId: string;
    reportType: string;
    status: string;
    summary: string | null;
  }>,
): void {
  if (!reports.length) {
    console.log("No webhook reports linked.");
    return;
  }
  printTable(
    ["ID", "Message", "Type", "Status", "Summary"],
    reports.map((report) => [
      report.id,
      report.messageId,
      report.reportType,
      report.status,
      report.summary ?? "",
    ]),
  );
}

function redactConfig(config: NexusCliConfig) {
  return {
    activeProfile: config.activeProfile,
    profiles: Object.fromEntries(
      Object.entries(config.profiles).map(([name, profile]) => [
        name,
        {
          baseUrl: profile.baseUrl,
          user: profile.user ?? null,
          hasToken: Boolean(profile.token),
        },
      ]),
    ),
  };
}

function redactProfile(profile: NexusCliConfig["profiles"][string]) {
  return {
    baseUrl: profile.baseUrl,
    user: profile.user ?? null,
    hasToken: Boolean(profile.token),
  };
}

function normalizeEnum<T extends string>(
  value: string,
  allowed: readonly T[],
): T {
  const normalized = value.trim().replace(/-/g, "_").toUpperCase();
  const match = allowed.find((item) => item === normalized);
  if (!match) {
    throw new Error(
      `Invalid value "${value}". Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

function normalizeLinkKind(value: string): TestChangeContextLink["kind"] {
  return normalizeEnum(value, [
    "DISCORD",
    "GITHUB",
    "DOCUMENT",
    "OTHER",
  ] as const);
}

function parseBoolean(value: string): boolean {
  if (/^(1|true|yes|y|on)$/i.test(value)) {
    return true;
  }
  if (/^(0|false|no|n|off)$/i.test(value)) {
    return false;
  }
  throw new Error(`Expected a boolean value, got "${value}".`);
}

function contentToHtml(value: string, alreadyHtml = false): string {
  return alreadyHtml ? value : textToHtml(value);
}

async function readContent(
  flags: Flags,
  inlineNames: string[],
  fileNames: string[],
): Promise<string | null> {
  for (const name of inlineNames) {
    const value = stringFlag(flags, name);
    if (typeof value === "string") {
      return value;
    }
  }

  for (const name of fileNames) {
    const file = stringFlag(flags, name);
    if (file === "-") {
      return readStdin();
    }
    if (file) {
      return readFile(file, "utf-8");
    }
  }

  return null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function requireArg(args: string[], index: number, label: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing required argument: ${label}.`);
  }
  return value;
}

function requiredFlag(flags: Flags, name: string): string {
  const value = stringFlag(flags, name);
  if (!value) {
    throw new Error(`Missing required flag: --${name}.`);
  }
  return value;
}

function requireYes(flags: Flags, action: string): void {
  if (!boolFlag(flags, "yes")) {
    throw new Error(`${action} requires --yes.`);
  }
}

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function flagValues(flags: Flags, name: string): string[] {
  const value = flags[name];
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function boolFlag(flags: Flags, name: string, defaultValue = false): boolean {
  const value = flags[name];
  if (Array.isArray(value) && value.length > 0) {
    return parseBoolean(value[value.length - 1]);
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return parseBoolean(value);
  }
  return defaultValue;
}

function numberFlag(flags: Flags, name: string): number | undefined {
  const value = stringFlag(flags, name);
  if (!value) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`--${name} must be a number.`);
  }
  return number;
}

function localApiUrl(): string {
  return process.env.NEXUS_LOCAL_URL ?? DEFAULT_LOCAL_API_URL;
}

function localOverrideUrl(): string | undefined {
  return process.env.NEXUS_LOCAL_URL;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function openBrowser(url: string): void {
  const currentPlatform = platform();
  const command =
    currentPlatform === "win32"
      ? "cmd"
      : currentPlatform === "darwin"
        ? "open"
        : "xdg-open";
  const args = currentPlatform === "win32" ? ["/c", "start", "", url] : [url];

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    // The URL is printed, so browser launch failure is non-fatal.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printHelp(): void {
  console.log(`Nexus CLI

Quick start from the repo root:
  npm run nexus -- setup --url https://your-nexus-host --profile prod
  npm run nexus -- doctor
  npm run nexus -- inbox list

Usage:
  nexus setup --url <nexus-url> [--profile prod]
  nexus setup local
  nexus doctor [--profile prod]
  nexus login --url <nexus-url> [--profile default]
  nexus login --local
  nexus auth status | sessions list | sessions revoke <sessionId>
  nexus profiles list | use <profile> | remove <profile>
  nexus tm list [--status ACTIVE|CLOSED] [--search text]
  nexus tm dashboard
  nexus tm show <change>
  nexus tm create --title <title> --category <category> --subsystem <subsystem> [--description text] [--test-server-version version]
  nexus tm update <change> [--title title] [--description text] [--test-server-version version] [--clear-test-server-version]
  nexus tm status <change> <status> [--detail text]
  nexus tm close <change>
  nexus tm note list|add|delete <change> [noteId] [--text text] [--file path]
  nexus tm tester list|request|remove <change> [userId|testerId]
  nexus tm checklist list|add|delete|check|uncheck|note <change> [item]
  nexus tm links list|add|remove|set <change>
  nexus tm reports list|link|unlink <change> [messageId]
  nexus tm result <change> pass|fail|blocked --notes <text>
  nexus tm ready <change> true|false
  nexus tm next-patch list|count|include|exclude|reset|patch-notes [change]
  nexus tm server-version get | set-test <version> | set-live <version> | clear-test | clear-live
  nexus tm users list | set-tester <userId> true|false --yes
  nexus tm settings get | update --file settings.json --yes
  nexus inbox list [--status RECEIVED|PENDING_MERGE|PROCESSED|FAILED] [--include-archived]
  nexus inbox show <messageId>
  nexus inbox link <messageId> [--app-url url] [--open]
  nexus inbox assign <messageId> <adminId|me> | unassign <messageId>
  nexus inbox archive|unarchive|delete <messageId>
  nexus inbox review <messageId> [--provider gemini|openai] [--use-eqemu-oracle-context]
  nexus inbox read|unread|star|unstar <messageId>
  nexus inbox labels list|create|find|update|delete|set ...
  nexus inbox bulk <action> <messageId...>
  nexus inbox merge <messageId...> --combined-file path
  nexus inbox crashes summary|list
  nexus inbox groups list|process <webhookId> <groupKey>
  nexus inbox hooks list|test|processing-status

Global flags:
  --profile <name>     Use a configured profile
  --nexus-url <url>    Override the profile Nexus URL
  --local              Use http://localhost:4000 and the local profile for dev
  --app-url <url>      Override the web app URL for generated inbox links
  --json               Print JSON output
  --html               Treat text/file content as already-sanitized HTML
  --yes                Confirm high-impact commands
`);
}

main().catch((error: unknown) => {
  if (error instanceof NexusApiError) {
    console.error(`Nexus API error (${error.status}): ${error.message}`);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
