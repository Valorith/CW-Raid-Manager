import type {
  CrashTelemetryReport,
  CrashTelemetrySummary,
  InboundWebhook,
  InboundWebhookMessage,
  TestChange,
  TestChangeNote,
  TestChangeTester,
  TestManagerServerVersion,
  WebhookInboxResponse,
  WebhookMessageLabel,
} from "./types.js";

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function textToHtml(value: string): string {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function printChangeList(changes: TestChange[]): void {
  if (!changes.length) {
    console.log("No changes found.");
    return;
  }

  printTable(
    ["ID", "Status", "Priority", "Version", "Title", "Updated"],
    changes.map((change) => [
      `#${change.publicId}`,
      change.status,
      change.priority,
      change.testServerVersion ?? "",
      change.title,
      formatDate(change.updatedAt),
    ]),
  );
}

export function printChange(change: TestChange): void {
  console.log(`#${change.publicId} ${change.title}`);
  console.log(`Status: ${change.status}  Priority: ${change.priority}`);
  console.log(`Category: ${change.category}  Subsystem: ${change.subsystem}`);
  if (change.targetBuild) {
    console.log(`Target build: ${change.targetBuild}`);
  }
  if (change.testServerVersion) {
    console.log(`Test server version: ${change.testServerVersion}`);
  }
  if (change.assignedTo) {
    console.log(`Assigned to: ${change.assignedTo.displayName}`);
  }
  console.log(
    `Summary: ${change.summary.testerCount} tester(s), ${change.summary.passCount} pass, ${change.summary.failCount} fail, ${change.summary.blockedCount} blocked`,
  );
  console.log(
    `Next patch: ${change.includeInNextPatch ? "yes" : "no"}  Ready: ${change.readyToTest ? "yes" : "no"}`,
  );
  const description = stripHtml(change.description);
  if (description) {
    console.log("\nDescription:");
    console.log(description);
  }
}

export function printServerVersion(version: TestManagerServerVersion): void {
  console.log(
    `Current test server: ${version.currentTestServerVersion ?? "Not set"}`,
  );
  console.log(
    `Current live server: ${version.currentLiveServerVersion ?? "Not set"}`,
  );
  if (typeof version.futureChangesPaused === "number") {
    console.log(`Future changes paused: ${version.futureChangesPaused}`);
  }
  if (typeof version.versionChangesResumed === "number") {
    console.log(`Version changes resumed: ${version.versionChangesResumed}`);
  }
}

export function printNotes(notes: TestChangeNote[]): void {
  if (!notes.length) {
    console.log("No notes found.");
    return;
  }

  for (const note of notes) {
    console.log(
      `${note.id}  ${formatDate(note.createdAt)}  ${note.author?.displayName ?? "Unknown"}`,
    );
    console.log(stripHtml(note.contentHtml));
    console.log("");
  }
}

export function printTesters(testers: TestChangeTester[]): void {
  if (!testers.length) {
    console.log("No testers assigned.");
    return;
  }

  printTable(
    ["ID", "User", "Assignment", "Status", "Result"],
    testers.map((tester) => [
      tester.id,
      tester.user?.displayName ?? "Unknown",
      tester.assignment,
      tester.status,
      tester.result ?? "",
    ]),
  );
}

export function printWebhookInboxList(response: WebhookInboxResponse): void {
  if (!response.messages.length) {
    console.log("No webhook inbox messages found.");
    return;
  }

  printTable(
    ["ID", "Received", "Webhook", "Status", "Assigned", "Labels", "Summary"],
    response.messages.map((message) => [
      message.id,
      formatDate(message.receivedAt),
      message.webhook?.label ?? message.webhookId,
      `${message.status}${message.archivedAt ? " archived" : ""}`,
      message.assignedAdmin?.displayName ?? message.assignedAdminId ?? "",
      message.labels?.map((label) => label.name).join(", ") ?? "",
      summarizeWebhookMessage(message, 80),
    ]),
  );
  console.log(`Total: ${response.total}`);
}

export function printWebhookMessage(message: InboundWebhookMessage): void {
  console.log(`Webhook message ${message.id}`);
  console.log(`Status: ${message.status}${message.archivedAt ? " archived" : ""}`);
  console.log(`Received: ${formatDate(message.receivedAt)}`);
  console.log(`Webhook: ${message.webhook?.label ?? message.webhookId}`);
  if (message.sourceIp) {
    console.log(`Source IP: ${message.sourceIp}`);
  }
  console.log(
    `Read: ${message.isRead ? "yes" : "no"}  Starred: ${message.isStarred ? "yes" : "no"}`,
  );
  console.log(
    `Assigned: ${message.assignedAdmin?.displayName ?? message.assignedAdminId ?? "unassigned"}`,
  );
  if (message.labels?.length) {
    console.log(`Labels: ${message.labels.map((label) => label.name).join(", ")}`);
  }
  if (message.mergedFromIds?.length) {
    console.log(`Merged from: ${message.mergedFromIds.join(", ")}`);
  }
  if (message.linkedTestChanges?.length) {
    console.log(
      `Linked changes: ${message.linkedTestChanges
        .map((change) => `#${change.publicId} ${change.title}`)
        .join("; ")}`,
    );
  }

  if (message.actionRuns?.length) {
    console.log("\nAction runs:");
    printTable(
      ["ID", "Action", "Status", "Duration", "Error"],
      message.actionRuns.map((run) => [
        run.id,
        run.action?.name ?? run.actionId,
        run.status,
        typeof run.durationMs === "number" ? `${run.durationMs}ms` : "",
        run.error ?? "",
      ]),
    );
  }

  const body = webhookBodyText(message);
  if (body) {
    console.log("\nBody:");
    console.log(truncate(body, 4000));
  }
}

export function printWebhookLabels(labels: WebhookMessageLabel[]): void {
  if (!labels.length) {
    console.log("No webhook labels found.");
    return;
  }

  printTable(
    ["ID", "Name", "Color", "Auto Archive", "Auto Delete"],
    labels.map((label) => [
      label.id,
      label.name,
      label.color,
      label.autoArchive ? "yes" : "no",
      label.autoDelete ? "yes" : "no",
    ]),
  );
}

export function printInboundWebhooks(webhooks: InboundWebhook[]): void {
  if (!webhooks.length) {
    console.log("No inbound webhooks found.");
    return;
  }

  printTable(
    ["ID", "Label", "Enabled", "Type", "Actions", "Last Received"],
    webhooks.map((webhook) => [
      webhook.id,
      webhook.label,
      webhook.isEnabled ? "yes" : "no",
      webhook.intakeType,
      String(webhook.actions?.length ?? 0),
      webhook.lastReceivedAt ? formatDate(webhook.lastReceivedAt) : "",
    ]),
  );
}

export function printCrashTelemetrySummary(summary: CrashTelemetrySummary): void {
  console.log(
    `Crashes: ${summary.totalCrashes} total, ${summary.uniqueCrashes} unique, ${summary.reviewedCrashes} reviewed`,
  );
  console.log(`Versions: ${summary.versions}`);
  if (summary.latestCrashAt) {
    console.log(`Latest: ${formatDate(summary.latestCrashAt)}`);
  }
  if (!summary.groups.length) {
    return;
  }
  console.log("");
  printTable(
    ["Version", "Total", "Unique", "Reviewed", "Servers", "Last Seen"],
    summary.groups.map((group) => [
      group.serverVersion,
      String(group.totalCrashes),
      String(group.uniqueCrashes),
      String(group.reviewedCrashes),
      String(group.affectedServers),
      formatDate(group.lastSeenAt),
    ]),
  );
}

export function printCrashTelemetryReports(reports: CrashTelemetryReport[]): void {
  if (!reports.length) {
    console.log("No crash telemetry reports found.");
    return;
  }

  printTable(
    ["ID", "Message", "Version", "Status", "Review", "Received", "Summary"],
    reports.map((report) => [
      report.id,
      report.messageId,
      report.serverVersion,
      report.status,
      report.reviewStatus ?? "",
      formatDate(report.receivedAt),
      report.reviewSummary ?? "",
    ]),
  );
}

export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((header, column) =>
    Math.max(
      header.length,
      ...rows.map((row) => String(row[column] ?? "").length),
    ),
  );
  const render = (row: string[]) =>
    row
      .map((cell, column) => String(cell ?? "").padEnd(widths[column]))
      .join("  ");

  console.log(render(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(render(row));
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function summarizeWebhookMessage(
  message: InboundWebhookMessage,
  maxLength: number,
): string {
  const body = webhookBodyText(message).replace(/\s+/g, " ").trim();
  return truncate(body, maxLength);
}

function webhookBodyText(message: InboundWebhookMessage): string {
  if (typeof message.rawBody === "string" && message.rawBody.trim()) {
    return message.rawBody.trim();
  }
  if (typeof message.payload === "string") {
    return message.payload.trim();
  }
  if (typeof message.payload === "undefined" || message.payload === null) {
    return "";
  }
  try {
    return JSON.stringify(message.payload, null, 2);
  } catch {
    return String(message.payload);
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
