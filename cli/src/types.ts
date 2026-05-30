export type TestChangeStatus =
  | "SUBMITTED"
  | "AWAITING_TEST"
  | "TESTING"
  | "PASSED"
  | "FAILED"
  | "BLOCKED"
  | "RENEWED"
  | "CLOSED";

export type TestChangePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TestResult = "PASS" | "FAIL" | "BLOCKED";
export type TestAssignmentKind =
  | "REQUIRED"
  | "OPTIONAL"
  | "VOLUNTEER"
  | "ADMIN_REQUESTED";

export interface TestManagerUserSummary {
  id: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  isGuide: boolean;
  isTester: boolean;
}

export interface TestChangeChecklistItem {
  id: string;
  title: string;
  details: string;
  category: string;
  sortOrder: number;
}

export interface TestChangeTester {
  id: string;
  assignment: TestAssignmentKind;
  status: string;
  result: TestResult | null;
  notesHtml: string;
  user: TestManagerUserSummary | null;
}

export interface TestChangeNote {
  id: string;
  contentHtml: string;
  result: TestResult | null;
  createdAt: string;
  author: TestManagerUserSummary | null;
}

export interface TestChangeContextLink {
  id: string;
  kind: "DISCORD" | "GITHUB" | "DOCUMENT" | "OTHER";
  label: string;
  url: string;
  description: string;
}

export interface TestChangeWebhookReport {
  id: string;
  messageId: string;
  webhookLabel: string;
  receivedAt: string;
  status: string;
  reportType: string;
  summary: string | null;
}

export interface TestChange {
  id: string;
  publicId: number;
  title: string;
  description: string;
  category: string;
  subsystem: string;
  priority: TestChangePriority;
  status: TestChangeStatus;
  targetBuild: string | null;
  testServerVersion: string | null;
  githubPrUrl?: string | null;
  githubIssueUrl?: string | null;
  githubPullRequest?: { url: string } | null;
  githubIssue?: { url: string } | null;
  contextLinks: TestChangeContextLink[];
  includeInNextPatch: boolean;
  readyToTest: boolean;
  autoClosePassCount: number;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: TestManagerUserSummary | null;
  checklist: TestChangeChecklistItem[];
  testers: TestChangeTester[];
  notes: TestChangeNote[];
  webhookReports: TestChangeWebhookReport[];
  summary: {
    testerCount: number;
    passCount: number;
    failCount: number;
    blockedCount: number;
    checklistCount: number;
    checklistCompleted: number;
  };
}

export interface TestChangeResponse {
  change: TestChange;
}

export interface TestChangesResponse {
  changes: TestChange[];
}

export interface TestManagerServerVersion {
  currentTestServerVersion: string | null;
  currentLiveServerVersion: string | null;
  futureChangesPaused?: number;
  versionChangesResumed?: number;
}

export type InboundWebhookRetentionMode = "indefinite" | "days" | "maxCount";
export type InboundWebhookActionType =
  | "DISCORD_RELAY"
  | "CRASH_REVIEW"
  | "CLAWDBOT_RELAY";
export type InboundWebhookIntakeType =
  | "GENERIC"
  | "EQEMU_SERVER_CRASH_REPORT";
export type InboundWebhookMessageStatus =
  | "RECEIVED"
  | "PENDING_MERGE"
  | "PROCESSED"
  | "FAILED";
export type InboundWebhookActionRunStatus =
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED"
  | "PENDING_REVIEW";
export type WebhookInboxBulkAction =
  | "markRead"
  | "markUnread"
  | "archive"
  | "unarchive"
  | "delete"
  | "star"
  | "unstar"
  | "rerunCrashReview"
  | "setLabels";
export type CrashReviewProvider = "gemini" | "openai";

export interface InboundWebhookRetentionPolicy {
  mode: InboundWebhookRetentionMode;
  days?: number;
  maxCount?: number;
}

export interface InboundWebhookActionConfig {
  discordWebhookUrl?: string;
  devDiscordWebhookUrl?: string;
  discordMode?: "RAW" | "WRAP";
  discordTemplate?: string;
  crashModel?: string;
  crashMaxInputChars?: number;
  crashMaxOutputTokens?: number;
  crashTemperature?: number;
  crashPromptTemplate?: string;
  useEqemuOracleContext?: boolean;
}

export interface InboundWebhookAction {
  id: string;
  webhookId: string;
  type: InboundWebhookActionType;
  name: string;
  isEnabled: boolean;
  config: InboundWebhookActionConfig;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface InboundWebhook {
  id: string;
  label: string;
  description?: string | null;
  isEnabled: boolean;
  intakeType: InboundWebhookIntakeType;
  token?: string;
  retentionPolicy?: InboundWebhookRetentionPolicy;
  mergeWindowSeconds?: number;
  autoMerge?: boolean;
  devMode?: boolean;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  lastReceivedAt?: string | null;
  actions?: InboundWebhookAction[];
}

export interface InboundWebhookActionRun {
  id: string;
  messageId: string;
  actionId: string;
  status: InboundWebhookActionRunStatus;
  error?: string | null;
  result?: Record<string, unknown> | null;
  durationMs?: number | null;
  createdAt: string;
  action?: InboundWebhookAction | null;
}

export interface WebhookMessageLabel {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  autoArchive: boolean;
  autoDelete: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebhookMessageLinkedTestChange {
  id: string;
  changeId: string;
  publicId: number;
  title: string;
  status: TestChangeStatus;
  priority: TestChangePriority;
  linkedAt: string;
  linkedBy?: TestManagerUserSummary | null;
}

export interface InboundWebhookMessage {
  id: string;
  webhookId: string;
  receivedAt: string;
  sourceIp?: string | null;
  headers: Record<string, unknown>;
  payload: unknown;
  rawBody?: string | null;
  status: InboundWebhookMessageStatus;
  actionSummary?: Array<{ actionId: string; status: string }> | null;
  assignedAdminId?: string | null;
  assignedAt?: string | null;
  archivedAt?: string | null;
  assignedAdmin?: TestManagerUserSummary | null;
  webhook?: InboundWebhook | null;
  actionRuns?: InboundWebhookActionRun[];
  isRead?: boolean;
  isStarred?: boolean;
  labels?: WebhookMessageLabel[];
  linkedTestChanges?: WebhookMessageLinkedTestChange[];
  mergedFromIds?: string[] | null;
  mergedAt?: string | null;
}

export interface WebhookInboxResponse {
  messages: InboundWebhookMessage[];
  total: number;
}

export interface WebhookInboxMessageResponse {
  message: InboundWebhookMessage;
}

export interface WebhookLabelResponse {
  label: WebhookMessageLabel;
}

export interface WebhookLabelsResponse {
  labels: WebhookMessageLabel[];
}

export interface InboundWebhooksResponse {
  webhooks: InboundWebhook[];
}

export interface WebhookInboxBulkResponse {
  success: number;
  failed: number;
}

export interface CrashTelemetryReport {
  id: string;
  messageId: string;
  webhookId: string;
  webhookLabel: string | null;
  receivedAt: string;
  status: InboundWebhookMessageStatus;
  fingerprint: string;
  platformName: string | null;
  crashReport: string;
  serverVersion: string;
  compileDate: string | null;
  compileTime: string | null;
  serverName: string | null;
  serverShortName: string | null;
  uptimeSeconds: number | null;
  osMachine: string | null;
  osRelease: string | null;
  osVersion: string | null;
  osSysname: string | null;
  processId: number | null;
  rssMemoryMb: number | null;
  cpus: number | null;
  originationInfo: string | null;
  lineCount: number;
  reviewStatus: string | null;
  reviewSummary: string | null;
}

export interface CrashTelemetryVersionGroup {
  serverVersion: string;
  compileDate: string | null;
  compileTime: string | null;
  platformName: string | null;
  latestServerName: string | null;
  latestOs: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  totalCrashes: number;
  uniqueCrashes: number;
  reviewedCrashes: number;
  affectedServers: number;
}

export interface CrashTelemetrySummary {
  groups: CrashTelemetryVersionGroup[];
  totalCrashes: number;
  uniqueCrashes: number;
  versions: number;
  reviewedCrashes: number;
  latestCrashAt: string | null;
}
