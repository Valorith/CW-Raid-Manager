import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface RecordedRequest {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}

interface ExpectedRequest {
  method: string;
  url: string;
  body?: unknown | ((body: unknown) => void);
}

type Handler = (
  request: IncomingMessage,
  body: unknown,
  records: RecordedRequest[],
) => unknown;

const CLI_PATH = fileURLToPath(new URL("./index.js", import.meta.url));

test("tm list sends bearer auth and renders JSON from the configured profile", async () => {
  await withMockServer(
    async ({ baseUrl, records, configPath }) => {
      await writeConfig(configPath, baseUrl);
      const result = await runCli(
        ["tm", "list", "--json", "--status", "ACTIVE"],
        {
          NEXUS_CONFIG_PATH: configPath,
        },
      );

      assert.equal(result.code, 0, result.stderr);
      assert.equal(records.length, 1);
      assert.equal(records[0].method, "GET");
      assert.equal(records[0].url, "/api/test-manager/changes?status=ACTIVE");
      assert.equal(records[0].authorization, "Bearer test-token");
      assert.deepEqual(JSON.parse(result.stdout), { changes: [] });
    },
    route({
      "GET /api/test-manager/changes": () => ({ changes: [] }),
    }),
  );
});

test("tm create posts the expected payload without contacting a real database", async () => {
  await withMockServer(
    async ({ baseUrl, records, configPath }) => {
      await writeConfig(configPath, baseUrl);
      const result = await runCli(
        [
          "tm",
          "create",
          "--json",
          "--title",
          "Crash fix",
          "--category",
          "Server",
          "--subsystem",
          "Zone",
          "--priority",
          "high",
          "--description",
          "Line one\n\nLine two",
          "--checklist",
          "Boot zone|Confirm startup|Smoke",
        ],
        { NEXUS_CONFIG_PATH: configPath },
      );

      assert.equal(result.code, 0, result.stderr);
      assert.equal(records.length, 1);
      assert.equal(records[0].method, "POST");
      assert.equal(records[0].url, "/api/test-manager/changes");
      assert.deepEqual(records[0].body, {
        title: "Crash fix",
        description: "<p>Line one</p><p>Line two</p>",
        category: "Server",
        subsystem: "Zone",
        priority: "HIGH",
        targetBuild: null,
        githubPrUrl: null,
        githubIssueUrl: null,
        contextLinks: [],
        includeInNextPatch: true,
        autoClosePassCount: 0,
        dueAt: null,
        assignedToId: null,
        checklist: [
          { title: "Boot zone", details: "Confirm startup", category: "Smoke" },
        ],
      });
      assert.equal(JSON.parse(result.stdout).change.publicId, 77);
    },
    route({
      "POST /api/test-manager/changes": () => ({
        change: fixtureChange({ publicId: 77 }),
      }),
    }),
  );
});

test("tm update resolves public ids and sends a merged full update payload", async () => {
  await withMockServer(
    async ({ baseUrl, records, configPath }) => {
      await writeConfig(configPath, baseUrl);
      const result = await runCli(
        [
          "tm",
          "update",
          "#55",
          "--json",
          "--title",
          "Updated title",
          "--clear-target-build",
        ],
        { NEXUS_CONFIG_PATH: configPath },
      );

      assert.equal(result.code, 0, result.stderr);
      assert.equal(records.length, 2);
      assert.equal(records[0].method, "GET");
      assert.equal(records[0].url, "/api/test-manager/changes/55");
      assert.equal(records[1].method, "PATCH");
      assert.equal(records[1].url, "/api/test-manager/changes/change-55");
      assert.deepEqual(records[1].body, {
        title: "Updated title",
        description: "<p>Original</p>",
        category: "Ops",
        subsystem: "Deploy",
        priority: "MEDIUM",
        targetBuild: null,
        githubPrUrl: "https://github.com/example/repo/pull/5",
        githubIssueUrl: null,
        contextLinks: [],
        includeInNextPatch: true,
        autoClosePassCount: 0,
        dueAt: null,
        assignedToId: null,
      });
      assert.equal(JSON.parse(result.stdout).change.title, "Updated title");
    },
    route({
      "GET /api/test-manager/changes/55": () => ({
        change: fixtureChange({
          id: "change-55",
          publicId: 55,
          targetBuild: "prod",
          githubPullRequest: { url: "https://github.com/example/repo/pull/5" },
        }),
      }),
      "PATCH /api/test-manager/changes/change-55": (_request, body) => ({
        change: fixtureChange({
          id: "change-55",
          publicId: 55,
          title: (body as { title?: string }).title ?? "Updated",
        }),
      }),
    }),
  );
});

test("login stores the approved CLI token in a temp config profile", async () => {
  await withMockServer(
    async ({ baseUrl, configPath }) => {
      const result = await runCli(
        [
          "login",
          "--url",
          baseUrl,
          "--profile",
          "ci",
          "--name",
          "CI Runner",
          "--no-open",
          "--json",
        ],
        { NEXUS_CONFIG_PATH: configPath },
      );

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stderr, /"userCode":"ABCD-1234"/);
      assert.deepEqual(JSON.parse(result.stdout), {
        profile: "ci",
        user: {
          id: "user-1",
          email: "tester@example.com",
          displayName: "Tester",
        },
        session: { id: "session-1" },
      });

      const config = JSON.parse(await readFile(configPath, "utf-8")) as {
        activeProfile: string;
        profiles: Record<string, { baseUrl: string; token: string }>;
      };
      assert.equal(config.activeProfile, "ci");
      assert.equal(config.profiles.ci.baseUrl, baseUrl);
      assert.equal(config.profiles.ci.token, "nxcli_token");
    },
    route({
      "POST /api/cli/auth/device": () => ({
        deviceCode: "device-code",
        userCode: "ABCD-1234",
        verificationUriComplete:
          "https://example.test/cli/authorize?user_code=ABCD-1234",
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        interval: 0,
      }),
      "POST /api/cli/auth/device/token": () => ({
        status: "approved",
        token: "nxcli_token",
        user: {
          id: "user-1",
          email: "tester@example.com",
          displayName: "Tester",
        },
        session: { id: "session-1" },
      }),
    }),
  );
});

test("tm command families map to the Test Manager API without a real database", async () => {
  await withMockServer(
    async ({ baseUrl, records, configPath }) => {
      await writeConfig(configPath, baseUrl);
      const tempDir = dirname(configPath);
      const linksFile = join(tempDir, "links.json");
      const settingsFile = join(tempDir, "settings.json");
      await writeFile(
        linksFile,
        JSON.stringify([
          {
            id: "docs",
            kind: "DOCUMENT",
            label: "Docs",
            url: "https://example.test/docs",
            description: "Design notes",
          },
        ]),
        "utf-8",
      );
      await writeFile(
        settingsFile,
        JSON.stringify({
          roles: [{ key: "ADMIN", permissions: [] }],
          discordNotifications: {
            enabled: false,
            webhookUrl: "",
            events: [],
          },
        }),
        "utf-8",
      );

      const cases: Array<{ args: string[]; expected: ExpectedRequest[] }> = [
        {
          args: ["tm", "dashboard"],
          expected: [{ method: "GET", url: "/api/test-manager/dashboard" }],
        },
        {
          args: ["tm", "show", "5", "--json"],
          expected: [{ method: "GET", url: "/api/test-manager/changes/5" }],
        },
        {
          args: ["tm", "status", "5", "testing", "--detail", "Started"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "PATCH",
              url: "/api/test-manager/changes/change-5/status",
              body: { status: "TESTING", detail: "Started" },
            },
          ],
        },
        {
          args: ["tm", "ready", "5", "false", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "PATCH",
              url: "/api/test-manager/changes/change-5/ready-to-test",
              body: { readyToTest: false },
            },
          ],
        },
        {
          args: ["tm", "refresh-github", "5", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/github-metadata/refresh",
            },
          ],
        },
        {
          args: [
            "tm",
            "tester",
            "request",
            "5",
            "user-2",
            "--assignment",
            "required",
            "--json",
          ],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/request",
              body: { userId: "user-2", assignment: "REQUIRED" },
            },
          ],
        },
        {
          args: ["tm", "tester", "remove", "5", "tester-1", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "DELETE",
              url: "/api/test-manager/changes/change-5/testers/tester-1",
            },
          ],
        },
        {
          args: ["tm", "volunteer", "5", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/volunteer",
            },
          ],
        },
        {
          args: ["tm", "retest", "5", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/retest",
            },
          ],
        },
        {
          args: ["tm", "result", "5", "blocked", "--notes", "Need logs", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/result",
              body: { result: "BLOCKED", notesHtml: "<p>Need logs</p>" },
            },
          ],
        },
        {
          args: [
            "tm",
            "checklist",
            "add",
            "5",
            "--title",
            "Verify zone",
            "--details",
            "Boot once",
            "--category",
            "Smoke",
            "--json",
          ],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/checklist",
              body: {
                title: "Verify zone",
                details: "Boot once",
                category: "Smoke",
              },
            },
          ],
        },
        {
          args: ["tm", "checklist", "check", "5", "1", "--notes", "Done", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/checklist/item-1",
              body: { completed: true, notesHtml: "<p>Done</p>" },
            },
          ],
        },
        {
          args: [
            "tm",
            "checklist",
            "note",
            "5",
            "Smoke boot",
            "--notes",
            "<p>Raw</p>",
            "--html",
            "--json",
          ],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/checklist/item-1",
              body: { notesHtml: "<p>Raw</p>" },
            },
          ],
        },
        {
          args: ["tm", "checklist", "delete", "5", "item-1", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "DELETE",
              url: "/api/test-manager/changes/change-5/checklist/item-1",
            },
          ],
        },
        {
          args: ["tm", "note", "add", "5", "--text", "Looks good", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/notes",
              body: { contentHtml: "<p>Looks good</p>" },
            },
          ],
        },
        {
          args: ["tm", "note", "delete", "5", "note-1", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "DELETE",
              url: "/api/test-manager/changes/change-5/notes/note-1",
            },
          ],
        },
        {
          args: [
            "tm",
            "links",
            "add",
            "5",
            "--url",
            "https://example.test/runbook",
            "--label",
            "Runbook",
            "--kind",
            "document",
            "--json",
          ],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "PATCH",
              url: "/api/test-manager/changes/change-5/context-links",
              body: (body: unknown) => {
                const links = (body as { contextLinks?: Array<Record<string, unknown>> })
                  .contextLinks;
                assert.equal(links?.length, 3);
                assert.match(String(links?.[2]?.id), /^cli-\d+$/);
                assert.deepEqual(
                  {
                    kind: links?.[2]?.kind,
                    label: links?.[2]?.label,
                    url: links?.[2]?.url,
                    description: links?.[2]?.description,
                  },
                  {
                    kind: "DOCUMENT",
                    label: "Runbook",
                    url: "https://example.test/runbook",
                    description: "",
                  },
                );
              },
            },
          ],
        },
        {
          args: ["tm", "links", "remove", "5", "link-1", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "PATCH",
              url: "/api/test-manager/changes/change-5/context-links",
              body: {
                contextLinks: [
                  {
                    id: "link-2",
                    kind: "GITHUB",
                    label: "PR",
                    url: "https://github.com/example/repo/pull/1",
                    description: "",
                  },
                ],
              },
            },
          ],
        },
        {
          args: ["tm", "links", "set", "5", "--file", linksFile, "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "PATCH",
              url: "/api/test-manager/changes/change-5/context-links",
              body: {
                contextLinks: [
                  {
                    id: "docs",
                    kind: "DOCUMENT",
                    label: "Docs",
                    url: "https://example.test/docs",
                    description: "Design notes",
                  },
                ],
              },
            },
          ],
        },
        {
          args: ["tm", "reports", "link", "5", "message-1", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "POST",
              url: "/api/test-manager/changes/change-5/webhook-reports",
              body: { messageId: "message-1" },
            },
          ],
        },
        {
          args: ["tm", "reports", "unlink", "5", "message-1", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "DELETE",
              url: "/api/test-manager/changes/change-5/webhook-reports/message-1",
            },
          ],
        },
        {
          args: ["tm", "next-patch", "exclude", "5", "--json"],
          expected: [
            { method: "GET", url: "/api/test-manager/changes/5" },
            {
              method: "PATCH",
              url: "/api/test-manager/changes/change-5/next-patch",
              body: { includeInNextPatch: false },
            },
          ],
        },
        {
          args: ["tm", "next-patch", "reset", "--yes", "--json"],
          expected: [
            { method: "POST", url: "/api/test-manager/next-patch/reset" },
          ],
        },
        {
          args: ["tm", "next-patch", "patch-notes", "--json"],
          expected: [
            { method: "POST", url: "/api/test-manager/next-patch/patch-notes" },
          ],
        },
        {
          args: ["tm", "users", "list", "--json"],
          expected: [{ method: "GET", url: "/api/test-manager/users" }],
        },
        {
          args: ["tm", "users", "set-tester", "user-2", "true", "--yes", "--json"],
          expected: [
            {
              method: "PATCH",
              url: "/api/test-manager/users/user-2",
              body: { tester: true },
            },
          ],
        },
        {
          args: ["tm", "settings", "get", "--json"],
          expected: [{ method: "GET", url: "/api/test-manager/settings" }],
        },
        {
          args: ["tm", "settings", "update", "--file", settingsFile, "--yes", "--json"],
          expected: [
            {
              method: "PUT",
              url: "/api/test-manager/settings",
              body: {
                roles: [{ key: "ADMIN", permissions: [] }],
                discordNotifications: {
                  enabled: false,
                  webhookUrl: "",
                  events: [],
                },
              },
            },
          ],
        },
      ];

      for (const testCase of cases) {
        records.length = 0;
        const result = await runCli(testCase.args, {
          NEXUS_CONFIG_PATH: configPath,
        });
        assert.equal(result.code, 0, `${testCase.args.join(" ")}\n${result.stderr}`);
        assertRecordedRequests(records, testCase.expected);
      }
    },
    route({
      "GET /api/test-manager/dashboard": () => ({ openChanges: [] }),
      "GET /api/test-manager/changes/5": () => ({
        change: fixtureCoverageChange(),
      }),
      "PATCH /api/test-manager/changes/change-5/status": () => ({
        change: fixtureCoverageChange(),
      }),
      "PATCH /api/test-manager/changes/change-5/ready-to-test": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/changes/change-5/github-metadata/refresh": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/changes/change-5/request": () => ({
        change: fixtureCoverageChange(),
      }),
      "DELETE /api/test-manager/changes/change-5/testers/tester-1": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/changes/change-5/volunteer": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/changes/change-5/retest": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/changes/change-5/result": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/changes/change-5/checklist": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/changes/change-5/checklist/item-1": () => ({
        change: fixtureCoverageChange(),
      }),
      "DELETE /api/test-manager/changes/change-5/checklist/item-1": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/changes/change-5/notes": () => ({
        change: fixtureCoverageChange(),
      }),
      "DELETE /api/test-manager/changes/change-5/notes/note-1": () => ({
        change: fixtureCoverageChange(),
      }),
      "PATCH /api/test-manager/changes/change-5/context-links": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/changes/change-5/webhook-reports": () => ({
        change: fixtureCoverageChange(),
      }),
      "DELETE /api/test-manager/changes/change-5/webhook-reports/message-1": () => ({
        change: fixtureCoverageChange(),
      }),
      "PATCH /api/test-manager/changes/change-5/next-patch": () => ({
        change: fixtureCoverageChange(),
      }),
      "POST /api/test-manager/next-patch/reset": () => ({ resetCount: 2 }),
      "POST /api/test-manager/next-patch/patch-notes": () => ({ notes: [] }),
      "GET /api/test-manager/users": () => ({ users: [] }),
      "PATCH /api/test-manager/users/user-2": () => ({ success: true }),
      "GET /api/test-manager/settings": () => ({
        roles: [],
        discordNotifications: {
          enabled: false,
          webhookUrl: "",
          events: [],
        },
      }),
      "PUT /api/test-manager/settings": () => ({ success: true }),
    }),
  );
});

test("auth session commands use scoped CLI auth endpoints", async () => {
  await withMockServer(
    async ({ baseUrl, records, configPath }) => {
      await writeConfig(configPath, baseUrl);

      const cases: Array<{ args: string[]; expected: ExpectedRequest[] }> = [
        {
          args: ["auth", "status", "--json"],
          expected: [{ method: "GET", url: "/api/auth/me" }],
        },
        {
          args: ["auth", "sessions", "list", "--json"],
          expected: [{ method: "GET", url: "/api/cli/auth/sessions" }],
        },
        {
          args: ["auth", "sessions", "revoke", "session-1", "--json"],
          expected: [
            {
              method: "DELETE",
              url: "/api/cli/auth/sessions/session-1",
            },
          ],
        },
        {
          args: ["logout", "--json"],
          expected: [{ method: "POST", url: "/api/cli/auth/logout" }],
        },
      ];

      for (const testCase of cases) {
        records.length = 0;
        await writeConfig(configPath, baseUrl);
        const result = await runCli(testCase.args, {
          NEXUS_CONFIG_PATH: configPath,
        });
        assert.equal(result.code, 0, `${testCase.args.join(" ")}\n${result.stderr}`);
        assertRecordedRequests(records, testCase.expected);
      }
    },
    route({
      "GET /api/auth/me": () => ({
        user: { id: "user-1", email: "tester@example.com" },
      }),
      "GET /api/cli/auth/sessions": () => ({
        sessions: [
          {
            id: "session-1",
            name: "CI",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastUsedAt: null,
            expiresAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      }),
      "DELETE /api/cli/auth/sessions/session-1": () => ({
        statusCode: 204,
      }),
      "POST /api/cli/auth/logout": () => ({ success: true }),
    }),
  );
});

test("profiles list JSON output does not expose stored tokens", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "nexus-cli-test-"));
  const configPath = join(tempDir, "config.json");
  await writeConfig(configPath, "https://nexus.example.test");

  const result = await runCli(["profiles", "list", "--json"], {
    NEXUS_CONFIG_PATH: configPath,
  });

  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout) as {
    profiles: Record<string, Record<string, unknown>>;
  };
  assert.equal(output.profiles.default.token, undefined);
  assert.equal(output.profiles.default.hasToken, true);
  assert.equal(output.profiles.default.baseUrl, "https://nexus.example.test");
});

test("high-impact commands require explicit confirmation before making requests", async () => {
  await withMockServer(async ({ baseUrl, records, configPath }) => {
    await writeConfig(configPath, baseUrl);
    const settingsFile = join(dirname(configPath), "settings.json");
    const commands = [
      ["tm", "next-patch", "reset"],
      ["tm", "delete", "5"],
      ["tm", "users", "set-tester", "user-1", "true"],
      ["tm", "settings", "update", "--file", settingsFile],
    ];

    for (const command of commands) {
      records.length = 0;
      const result = await runCli(command, {
        NEXUS_CONFIG_PATH: configPath,
      });

      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /requires --yes/);
      assert.equal(records.length, 0, command.join(" "));
    }
  }, route({}));
});

function assertRecordedRequests(
  records: RecordedRequest[],
  expected: ExpectedRequest[],
): void {
  assert.equal(
    records.length,
    expected.length,
    JSON.stringify(records, null, 2),
  );

  for (const [index, expectedRequest] of expected.entries()) {
    const record = records[index];
    assert.equal(record.method, expectedRequest.method);
    assert.equal(record.url, expectedRequest.url);
    assert.equal(record.authorization, "Bearer test-token");
    if ("body" in expectedRequest) {
      if (typeof expectedRequest.body === "function") {
        expectedRequest.body(record.body);
      } else {
        assert.deepEqual(record.body, expectedRequest.body);
      }
    }
  }
}

function route(routes: Record<string, Handler>): Handler {
  return (request, body, records) => {
    const key = `${request.method ?? "GET"} ${new URL(request.url ?? "/", "http://localhost").pathname}`;
    const handler = routes[key];
    if (!handler) {
      return { statusCode: 404, body: { error: `Unhandled ${key}` } };
    }
    return handler(request, body, records);
  };
}

async function withMockServer(
  testFn: (context: {
    baseUrl: string;
    records: RecordedRequest[];
    configPath: string;
  }) => Promise<void>,
  handler: Handler,
): Promise<void> {
  const records: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    const body = await readJsonBody(request);
    records.push({
      method: request.method ?? "GET",
      url: request.url ?? "/",
      authorization: request.headers.authorization,
      body,
    });

    try {
      const result = handler(request, body, records) as
        | { statusCode?: number; body?: unknown }
        | unknown;
      if (
        result &&
        typeof result === "object" &&
        "statusCode" in result &&
        ("body" in result ||
          typeof (result as { statusCode?: unknown }).statusCode === "number")
      ) {
        sendJson(
          response,
          (result as { statusCode?: number }).statusCode ?? 200,
          (result as { body?: unknown }).body,
        );
      } else {
        sendJson(response, 200, result);
      }
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const tempDir = await mkdtemp(join(tmpdir(), "nexus-cli-test-"));
  const configPath = join(tempDir, "config.json");

  try {
    await testFn({
      baseUrl: `http://127.0.0.1:${address.port}`,
      records,
      configPath,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function runCli(args: string[], env: Record<string, string>) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(process.execPath, [CLI_PATH, ...args], {
        env: { ...process.env, ...env },
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("close", (code) => {
        resolve({
          code,
          stdout: Buffer.concat(stdout).toString("utf-8").trim(),
          stderr: Buffer.concat(stderr).toString("utf-8").trim(),
        });
      });
    },
  );
}

async function writeConfig(configPath: string, baseUrl: string): Promise<void> {
  await writeFile(
    configPath,
    JSON.stringify({
      activeProfile: "default",
      profiles: {
        default: {
          baseUrl,
          token: "test-token",
        },
      },
    }),
    "utf-8",
  );
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : undefined;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body ?? null));
}

function fixtureChange(
  overrides: Partial<Record<string, unknown>> = {},
): TestChangeFixture {
  return {
    id: "change-1",
    publicId: 1,
    title: "Original title",
    description: "<p>Original</p>",
    category: "Ops",
    subsystem: "Deploy",
    priority: "MEDIUM",
    status: "SUBMITTED",
    targetBuild: null,
    githubPullRequest: null,
    githubIssue: null,
    contextLinks: [],
    includeInNextPatch: true,
    readyToTest: true,
    autoClosePassCount: 0,
    dueAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    assignedTo: null,
    checklist: [],
    testers: [],
    notes: [],
    webhookReports: [],
    summary: {
      testerCount: 0,
      passCount: 0,
      failCount: 0,
      blockedCount: 0,
      checklistCount: 0,
      checklistCompleted: 0,
    },
    ...overrides,
  };
}

function fixtureCoverageChange(): TestChangeFixture {
  return fixtureChange({
    id: "change-5",
    publicId: 5,
    title: "Coverage change",
    checklist: [
      {
        id: "item-1",
        title: "Smoke boot",
        details: null,
        category: "Smoke",
        completed: false,
        notesHtml: "",
      },
    ],
    contextLinks: [
      {
        id: "link-1",
        kind: "DOCUMENT",
        label: "Design",
        url: "https://example.test/design",
        description: "",
      },
      {
        id: "link-2",
        kind: "GITHUB",
        label: "PR",
        url: "https://github.com/example/repo/pull/1",
        description: "",
      },
    ],
    testers: [
      {
        id: "tester-1",
        assignment: "REQUIRED",
        status: "REQUESTED",
        result: null,
        user: {
          id: "user-2",
          email: "tester@example.com",
          displayName: "Tester",
        },
      },
    ],
    notes: [
      {
        id: "note-1",
        contentHtml: "<p>Existing</p>",
        createdAt: "2026-01-01T00:00:00.000Z",
        author: {
          id: "user-1",
          email: "author@example.com",
          displayName: "Author",
        },
      },
    ],
  });
}

type TestChangeFixture = Record<string, unknown>;
