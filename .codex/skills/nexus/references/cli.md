# Nexus CLI Reference

The current Nexus CLI surface includes Test Manager commands under `tm` and Webhook Inbox commands under `inbox` (`wi` and `webhook-inbox` aliases).

Run commands from `C:\Github Projects\CWRaidManager` unless using the helper script.

## Entrypoints

```powershell
npm run nexus -- <command>
npm run --silent nexus -- <command> --json
npm run --silent nexus -- inbox list --nexus-url https://nexus.clumsysworld.com --json
```

For ordinary Test Manager and Webhook Inbox work, the local CLI is the client and the expected API target is `https://nexus.clumsysworld.com`. Use `--nexus-url https://nexus.clumsysworld.com` on hosted `tm` and `inbox` commands when the active profile might be `local`. The `nexus:local` npm script pins the `local` profile; use it only for explicit local development against `http://localhost:4000`.

Setup and diagnostics:

```powershell
npm run nexus:setup -- --url https://nexus.clumsysworld.com --profile prod
npm run nexus -- profiles use prod
npm run --silent nexus:doctor -- --json
npm run --silent nexus -- doctor --nexus-url https://nexus.clumsysworld.com --json
npm run nexus -- profiles list --json
npm run nexus -- login --local
npm run nexus:setup:local
npm run nexus:setup:local:fresh
npm run nexus:dev:stop
npm run nexus -- logout --profile local
```

Global flags:

- `--profile <name>`: use a configured profile.
- `--nexus-url <url>`: override the profile URL.
- `--local`: use local API/profile for development.
- `--app-url <url>`: override the web app URL used by generated inbox links.
- `--json`: print JSON where supported.
- `--html`: treat text/file content as already-sanitized HTML.
- `--yes`: confirm high-impact commands.
- `--no-open`: for auth/setup, do not launch a browser automatically.

## Auth And Profiles

```powershell
npm run --silent nexus -- auth status --json
npm run --silent nexus -- auth sessions list --json
npm run --silent nexus -- auth sessions revoke <sessionId>
npm run --silent nexus -- profiles list --json
npm run nexus -- profiles use prod
npm run nexus -- profiles remove prod
```

Do not print tokens. `profiles list --json` reports `hasToken` and redacts the token.

## Current Test Manager Reads

```powershell
npm run --silent nexus -- tm dashboard --nexus-url https://nexus.clumsysworld.com
npm run --silent nexus -- tm list --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm list --status ACTIVE --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm list --status CLOSED --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm list --search "special attacks" --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm show 31 --nexus-url https://nexus.clumsysworld.com --json
```

Valid explicit statuses:

```text
SUBMITTED, AWAITING_TEST, TESTING, PASSED, FAILED, BLOCKED, RENEWED, CLOSED
```

`ACTIVE` is a convenience list filter used by the API for non-closed, ready-to-test changes. For "all changes", omit `--status`.

PowerShell filter examples:

```powershell
$raw = npm run --silent nexus -- tm list --nexus-url https://nexus.clumsysworld.com --json
$data = $raw | ConvertFrom-Json
$data.changes | Where-Object { -not $_.includeInNextPatch } |
  Sort-Object publicId |
  Select-Object publicId,title,status,priority,category,subsystem,targetBuild,readyToTest,includeInNextPatch
```

```powershell
$raw = npm run --silent nexus -- tm list --status ACTIVE --nexus-url https://nexus.clumsysworld.com --json
$data = $raw | ConvertFrom-Json
$data.changes | Where-Object { $_.priority -in @("HIGH", "CRITICAL") }
```

## Create And Update Changes

```powershell
npm run --silent nexus -- tm create `
  --title "Fix familiar buff fade pet dismissal" `
  --category "Spells" `
  --subsystem "Pets" `
  --priority medium `
  --target-build "Test Server" `
  --description "Plain text description" `
  --nexus-url https://nexus.clumsysworld.com `
  --json
```

Creation flags:

- `--title`
- `--description` or `--description-file <path>`
- `--category`
- `--subsystem`
- `--priority low|medium|high|critical`
- `--target-build`
- `--github-pr-url`
- `--github-issue-url`
- `--include-in-next-patch` or `--no-include-in-next-patch`
- `--auto-close-pass-count <number>`
- `--due-at <iso-date>`
- `--assigned-to <userId>`
- repeated `--checklist "title|details|category"`

```powershell
npm run --silent nexus -- tm update 31 `
  --title "Include base skill damage in special attacks" `
  --priority high `
  --target-build "Test Server" `
  --nexus-url https://nexus.clumsysworld.com `
  --json
```

Update clear flags:

- `--clear-target-build`
- `--clear-github-pr`
- `--clear-github-issue`
- `--clear-due`
- `--clear-assignee`

## Status, Ready, Results, And Next Patch

```powershell
npm run --silent nexus -- tm status 31 TESTING --detail "Started verification" --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm close 31 --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm ready 31 true --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm result 31 pass --notes "Verified on hosted API." --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm volunteer 31 --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm retest 31 --nexus-url https://nexus.clumsysworld.com --json
```

Next patch:

```powershell
npm run --silent nexus -- tm next-patch list --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch list --view incomplete --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch count --nexus-url https://nexus.clumsysworld.com
npm run --silent nexus -- tm next-patch include 31 --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch exclude 31 --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch patch-notes --nexus-url https://nexus.clumsysworld.com
npm run --silent nexus -- tm next-patch reset --yes --nexus-url https://nexus.clumsysworld.com
```

## Notes, Testers, Checklist, Links, Reports

Notes:

```powershell
npm run --silent nexus -- tm note list 31 --json
npm run --silent nexus -- tm note add 31 --text "Plain text note" --json
npm run --silent nexus -- tm note add 31 --file note.md --json
npm run --silent nexus -- tm note delete 31 <noteId> --json
```

Testers:

```powershell
npm run --silent nexus -- tm tester list 31 --json
npm run --silent nexus -- tm tester request 31 <userId> --assignment required --json
npm run --silent nexus -- tm tester remove 31 <testerId> --json
```

Checklist:

```powershell
npm run --silent nexus -- tm checklist list 31 --json
npm run --silent nexus -- tm checklist add 31 --title "Verify melee hit" --details "Check base skill damage" --category "Combat" --json
npm run --silent nexus -- tm checklist check 31 1 --notes "Done" --json
npm run --silent nexus -- tm checklist uncheck 31 1 --json
npm run --silent nexus -- tm checklist note 31 1 --notes "Needs retest" --json
npm run --silent nexus -- tm checklist delete 31 1 --json
```

Links:

```powershell
npm run --silent nexus -- tm links list 31 --json
npm run --silent nexus -- tm links add 31 --kind github --label "PR" --url "https://github.com/org/repo/pull/1" --json
npm run --silent nexus -- tm links remove 31 1 --json
npm run --silent nexus -- tm links set 31 --file links.json --json
```

Reports:

```powershell
npm run --silent nexus -- tm reports list 31 --json
npm run --silent nexus -- tm reports link 31 <messageId> --json
npm run --silent nexus -- tm reports unlink 31 <messageId> --json
```

## Admin Commands

```powershell
npm run --silent nexus -- tm users list --json
npm run --silent nexus -- tm users set-tester <userId> true --yes
npm run --silent nexus -- tm settings get
npm run --silent nexus -- tm settings update --file settings.json --yes
```

These require elevated Test Manager permissions on the authenticated user.

## Webhook Inbox Reads

```powershell
npm run --silent nexus -- inbox list --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox list --status FAILED --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox list --include-archived --read-status unread --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox list --starred --label-id <labelId> --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox show <messageId> --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox link <messageId> --nexus-url https://nexus.clumsysworld.com
npm run --silent nexus -- inbox link <messageId> --app-url http://localhost:5173 --open
npm run --silent nexus -- inbox unread-count --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox pending-count --nexus-url https://nexus.clumsysworld.com --json
```

Valid inbox statuses:

```text
RECEIVED, PENDING_MERGE, PROCESSED, FAILED
```

Link generation uses the configured Nexus API origin for deployed profiles. For local API profiles on `localhost:4000`, links default to `http://localhost:5173`. Override with `--app-url` or `NEXUS_APP_URL` when needed.

## Webhook Inbox Mutations

```powershell
npm run --silent nexus -- inbox assign <messageId> me --json
npm run --silent nexus -- inbox assign <messageId> <adminUserId> --json
npm run --silent nexus -- inbox unassign <messageId> --json
npm run --silent nexus -- inbox archive <messageId> --json
npm run --silent nexus -- inbox unarchive <messageId> --json
npm run --silent nexus -- inbox read <messageId> --json
npm run --silent nexus -- inbox unread <messageId> --json
npm run --silent nexus -- inbox star <messageId> --json
npm run --silent nexus -- inbox unstar <messageId> --json
npm run --silent nexus -- inbox review <messageId> --provider gemini --json
npm run --silent nexus -- inbox review <messageId> --provider openai --use-eqemu-oracle-context --json
npm run --silent nexus -- inbox discord-summary <messageId> --json
npm run --silent nexus -- inbox delete <messageId> --yes --json
```

`review` triggers the same crash-review retry endpoint as the admin UI. Use `--provider gemini|openai`; `--use-eqemu-oracle-context` passes the Oracle context option through when supported by the server path.

## Webhook Labels

```powershell
npm run --silent nexus -- inbox labels list --json
npm run --silent nexus -- inbox labels create "Crash" --color "#ff0000" --json
npm run --silent nexus -- inbox labels find "Script Error" --json
npm run --silent nexus -- inbox labels update <labelId> --name "Crash" --color "#ff0000" --json
npm run --silent nexus -- inbox labels set <messageId> <labelId> --json
npm run --silent nexus -- inbox labels set <messageId> --label-id <labelId> --label-id <labelId> --json
npm run --silent nexus -- inbox labels delete <labelId> --yes --json
```

## Bulk, Merge, And Crash Helpers

```powershell
npm run --silent nexus -- inbox bulk archive <messageId> <messageId> --json
npm run --silent nexus -- inbox bulk set-labels <messageId> --label-id <labelId> --json
npm run --silent nexus -- inbox bulk rerun-crash-review <messageId> --json
npm run --silent nexus -- inbox bulk delete <messageId> <messageId> --yes --json
npm run --silent nexus -- inbox merge <messageId> <messageId> --combined-file combined-crash.txt --json
npm run --silent nexus -- inbox dismiss-merge <messageId> <messageId> --json
npm run --silent nexus -- inbox crashes summary --json
npm run --silent nexus -- inbox crashes list --version "2026.05.29" --json
npm run --silent nexus -- inbox inspect-crash --file crash.txt --json
npm run --silent nexus -- inbox sort-crash --segments-file segments.json
```

Bulk actions accept `mark-read`, `mark-unread`, `archive`, `unarchive`, `delete`, `star`, `unstar`, `rerun-crash-review`, and `set-labels`; hyphenated names are normalized to the API actions.

`sort-crash --segments-file` expects JSON:

```json
[
  { "id": "part-1", "text": "..." },
  { "id": "part-2", "text": "..." }
]
```

## Webhook Endpoints And Pending Merge Groups

```powershell
npm run --silent nexus -- inbox hooks list --json
npm run --silent nexus -- inbox hooks processing-status --json
npm run --silent nexus -- inbox hooks test <webhookId> --payload-file payload.json --run-actions --json
npm run --silent nexus -- inbox groups list --json
npm run --silent nexus -- inbox groups process <webhookId> <groupKey> --json
```
