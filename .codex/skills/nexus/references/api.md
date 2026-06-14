# Nexus API Reference

Prefer the CLI for normal use. Use direct HTTP only for diagnostics, unsupported workflows, or to reason about the system contract.

Base local API:

```text
http://localhost:4000
```

CLI bearer tokens are scoped to:

- `GET /api/auth/me`
- `POST /api/cli/auth/logout`
- `GET /api/cli/auth/sessions`
- `DELETE /api/cli/auth/sessions/:sessionId`
- `GET|POST|PATCH|PUT|DELETE /api/test-manager/*`
- `GET|POST|PUT|DELETE /api/admin/webhook-inbox*`
- `GET|POST|PUT|DELETE /api/admin/webhook-labels*`
- `GET /api/admin/webhooks`, `GET /api/admin/webhooks/processing-status`, `GET /api/admin/webhooks/pending-merge-groups`, `POST /api/admin/webhooks/:webhookId/test`, `POST /api/admin/webhooks/:webhookId/process-group-now`

Do not use CLI tokens for unrelated application APIs. Older CLI sessions may have only the `test-manager` scope; the server currently treats that as sufficient for Webhook Inbox CLI compatibility, but fresh sessions request both `test-manager` and `webhook-inbox`.

## CLI Auth API

Routes are mounted under `/api/cli/auth`.

```http
POST /api/cli/auth/device
```

Body:

```json
{ "clientName": "Nexus CLI on HOSTNAME" }
```

Returns a device code, user code, browser verification URL, expiration, polling interval, and scopes.

```http
POST /api/cli/auth/device/token
```

Body:

```json
{ "deviceCode": "..." }
```

Returns `pending` until browser approval, then `approved` with `token`, `session`, and `user`. Expired, denied, or consumed codes fail.

Browser session routes:

```http
GET /api/cli/auth/device/:userCode
POST /api/cli/auth/device/:userCode/approve
POST /api/cli/auth/device/:userCode/deny
```

CLI session routes:

```http
GET /api/cli/auth/sessions
DELETE /api/cli/auth/sessions/:sessionId
POST /api/cli/auth/logout
```

## Current Test Manager Routes

Routes are mounted under `/api/test-manager`.

Dashboard:

```http
GET /api/test-manager/dashboard
```

Next patch:

```http
GET /api/test-manager/next-patch?view=complete
GET /api/test-manager/next-patch?view=incomplete
GET /api/test-manager/next-patch/count
POST /api/test-manager/next-patch/reset
POST /api/test-manager/next-patch/patch-notes
```

Changes:

```http
GET /api/test-manager/changes
GET /api/test-manager/changes?status=ACTIVE
GET /api/test-manager/changes?status=CLOSED
GET /api/test-manager/changes?search=text
POST /api/test-manager/changes
GET /api/test-manager/changes/:changeId
PATCH /api/test-manager/changes/:changeId
DELETE /api/test-manager/changes/:changeId
```

Change subresources:

```http
POST /api/test-manager/changes/:changeId/github-metadata/refresh
PATCH /api/test-manager/changes/:changeId/context-links
POST /api/test-manager/changes/:changeId/webhook-reports
DELETE /api/test-manager/changes/:changeId/webhook-reports/:messageId
PATCH /api/test-manager/changes/:changeId/status
PATCH /api/test-manager/changes/:changeId/next-patch
PATCH /api/test-manager/changes/:changeId/ready-to-test
DELETE /api/test-manager/changes/:changeId/testers/:testerId
POST /api/test-manager/changes/:changeId/volunteer
POST /api/test-manager/changes/:changeId/retest
POST /api/test-manager/changes/:changeId/request
POST /api/test-manager/changes/:changeId/checklist
POST /api/test-manager/changes/:changeId/checklist/:checklistItemId
DELETE /api/test-manager/changes/:changeId/checklist/:checklistItemId
POST /api/test-manager/changes/:changeId/result
POST /api/test-manager/changes/:changeId/notes
DELETE /api/test-manager/changes/:changeId/notes/:noteId
```

Users and settings:

```http
GET /api/test-manager/users
PATCH /api/test-manager/users/:userId
GET /api/test-manager/settings
PUT /api/test-manager/settings
```

## Data Shapes

Core `TestChange` fields returned by the CLI/API:

```text
id, publicId, title, description, category, subsystem, priority, status,
targetBuild, githubPrUrl, githubIssueUrl, githubPullRequest, githubIssue,
contextLinks, includeInNextPatch, readyToTest, autoClosePassCount, dueAt,
createdAt, updatedAt, assignedTo, checklist, testers, notes, webhookReports,
summary
```

Valid statuses:

```text
SUBMITTED, AWAITING_TEST, TESTING, PASSED, FAILED, BLOCKED, RENEWED, CLOSED
```

Valid priorities:

```text
LOW, MEDIUM, HIGH, CRITICAL
```

Valid test results:

```text
PASS, FAIL, BLOCKED
```

Valid tester assignment kinds:

```text
REQUIRED, OPTIONAL, VOLUNTEER, ADMIN_REQUESTED
```

Context link kinds:

```text
DISCORD, GITHUB, DOCUMENT, OTHER
```

## Payload Notes

Create/update change payloads include title, description HTML, category, subsystem, priority, target build, GitHub PR/issue URLs, context links, next-patch inclusion, auto-close pass count, due date, assignee ID, and checklist items.

Text-rich fields are stored as sanitized HTML. The CLI converts plain text to simple HTML by default. Use `--html` only when the input is already sanitized HTML.

Change references can be public IDs in the CLI. Raw API `:changeId` routes accept the server route resolver input, but the CLI fetches by public ID first and then mutates by internal ID. Prefer CLI references like `31` or `#31`.

## Webhook Inbox Routes

Routes are mounted under `/api/admin` and require an admin user.

Inbox messages:

```http
GET /api/admin/webhook-inbox
GET /api/admin/webhook-inbox?page=1&pageSize=25&status=FAILED
GET /api/admin/webhook-inbox/:messageId
PUT /api/admin/webhook-inbox/:messageId/assign
PUT /api/admin/webhook-inbox/:messageId/archive
DELETE /api/admin/webhook-inbox/:messageId
POST /api/admin/webhook-inbox/:messageId/retry-crash-review
POST /api/admin/webhook-inbox/:messageId/send-discord-summary
PUT /api/admin/webhook-inbox/:messageId/read
PUT /api/admin/webhook-inbox/:messageId/star
PUT /api/admin/webhook-inbox/:messageId/labels
POST /api/admin/webhook-inbox/bulk
POST /api/admin/webhook-inbox/merge
POST /api/admin/webhook-inbox/dismiss-merge
```

Counts and crash helpers:

```http
GET /api/admin/webhook-inbox/unread-count
GET /api/admin/webhook-inbox/pending-action-count
GET /api/admin/webhook-inbox/crashes/summary
GET /api/admin/webhook-inbox/crashes
POST /api/admin/webhook-inbox/inspect-crash-report
POST /api/admin/webhook-inbox/sort-crash-segments
```

Labels:

```http
GET /api/admin/webhook-labels
POST /api/admin/webhook-labels
POST /api/admin/webhook-labels/find-or-create
PUT /api/admin/webhook-labels/:labelId
DELETE /api/admin/webhook-labels/:labelId
```

Webhook endpoints and merge groups used by the inbox UI:

```http
GET /api/admin/webhooks
GET /api/admin/webhooks/processing-status
POST /api/admin/webhooks/:webhookId/test
GET /api/admin/webhooks/pending-merge-groups
POST /api/admin/webhooks/:webhookId/process-group-now
```

The CLI command family is `inbox` with aliases `wi` and `webhook-inbox`. Prefer those commands over raw HTTP unless debugging route behavior.
