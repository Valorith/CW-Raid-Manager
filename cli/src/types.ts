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
