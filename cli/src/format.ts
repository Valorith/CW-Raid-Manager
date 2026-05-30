import type {
  TestChange,
  TestChangeNote,
  TestChangeTester,
  TestManagerServerVersion,
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
