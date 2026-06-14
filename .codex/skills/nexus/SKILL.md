---
name: nexus
description: Use the Nexus CLI and API for CWRaidManager work, including cloning or installing Nexus from GitHub, local setup, auth troubleshooting, profile/session management, Test Manager operations, and Webhook Inbox review workflows.
---

# Nexus

Use this skill whenever the user asks about Nexus, the Nexus CLI/API, hosted or local Nexus setup, Nexus auth or profiles, cloning/installing the Nexus repo, Test Manager, or Webhook Inbox CLI workflows.

## Default Approach

Prefer the CLI over raw HTTP because it handles profiles, bearer tokens, JSON formatting, text-to-HTML conversion, change lookup by public ID, inbox link generation, and safe defaults.

The Nexus CLI currently has Test Manager and Webhook Inbox command families. Keep the skill framed around Nexus generally so future CLI areas can be added without renaming the skill.

Default repo path:

```powershell
C:\Github Projects\CWRaidManager
```

If the repo or CLI is not installed on the machine, read `references/local-setup.md` and use the GitHub bootstrap workflow. The canonical repo is `https://github.com/Valorith/CW-Raid-Manager.git`.

For ordinary Test Manager and Webhook Inbox work, treat the local Nexus CLI as the client and the hosted Nexus API as the expected target:

```text
https://nexus.clumsysworld.com
```

Use `--nexus-url https://nexus.clumsysworld.com` on hosted `tm` and `inbox` commands when the active profile might be `local`. Do not start a local API service unless the user explicitly asks for local development testing.

From the repo root, prefer these forms:

```powershell
npm run --silent nexus -- tm list --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm show 27 --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox list --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox show <messageId> --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus:doctor -- --json
```

Use the helper script when you are not already in the repo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\rgagn\.codex\skills\nexus\scripts\nexus-cli.ps1" inbox list --json
```

Use `npm run --silent nexus:local -- ...` or `--local` only when the user explicitly wants to target `http://localhost:4000`.

For machine parsing, always use `--json` where supported and `npm run --silent` to avoid npm banners. Never print bearer tokens or raw config files containing tokens.

If the hosted URL ever needs to be rediscovered, use Railway from `C:\Github Projects\CWRaidManager` and filter output to public URL variables only: `CLIENT_URL`, `PUBLIC_CLIENT_URL`, `DISCORD_PUBLIC_CLIENT_URL`, `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_STATIC_URL`, and `NEXUS_URL`. Do not print secrets or raw full variable dumps.

## Read Workflow

1. Check CLI health when the API/auth state matters:

```powershell
npm run --silent nexus:doctor -- --json
```

If that checks `local` / `http://localhost:4000` and fails with `fetch failed`, do not ask to start a local API service. Retry against the hosted API:

```powershell
npm run --silent nexus -- doctor --nexus-url https://nexus.clumsysworld.com --json
```

If the hosted doctor succeeds, use `--nexus-url https://nexus.clumsysworld.com` on subsequent `tm` and `inbox` commands.

2. If auth is not ready for the hosted API, tell the user to run setup with the hosted server URL and complete browser auth:

```powershell
npm run nexus:setup -- --url https://nexus.clumsysworld.com --profile prod
npm run nexus -- profiles use prod
```

3. Query data with the narrowest command that answers the question.

Common queries:

```powershell
npm run --silent nexus -- tm list --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm list --status ACTIVE --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm list --search "encounter" --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch list --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch list --view incomplete --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch count --nexus-url https://nexus.clumsysworld.com
npm run --silent nexus -- tm dashboard --nexus-url https://nexus.clumsysworld.com
npm run --silent nexus -- tm show 27 --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox list --status FAILED --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox show <messageId> --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox link <messageId> --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox crashes summary --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox labels list --nexus-url https://nexus.clumsysworld.com --json
```

For "not included in the next patch", `tm list` and filter `includeInNextPatch == false`. `tm next-patch list` only returns the included queue.

## Mutation Workflow

Use mutations only when the user asks to make a change. Confirm before high-impact operations unless the user has already clearly requested that exact action. Commands that require `--yes` are intentionally high-impact.

Useful write commands:

```powershell
npm run --silent nexus -- tm create --title "Title" --category "Systems" --subsystem "Expedition" --description "Plain text" --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm update 27 --priority high --target-build "Test Server" --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm status 27 TESTING --detail "Started verification" --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm close 27 --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm note add 27 --text "Added validation notes." --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm result 27 pass --notes "Verified." --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm ready 27 true --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch include 27 --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch exclude 27 --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox assign <messageId> me --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox review <messageId> --provider gemini --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox archive <messageId> --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox labels set <messageId> <labelId> --nexus-url https://nexus.clumsysworld.com --json
```

High-impact examples:

```powershell
npm run --silent nexus -- tm delete 27 --yes --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- tm next-patch reset --yes --nexus-url https://nexus.clumsysworld.com
npm run --silent nexus -- tm users set-tester <userId> true --yes --nexus-url https://nexus.clumsysworld.com
npm run --silent nexus -- tm settings update --file settings.json --yes --nexus-url https://nexus.clumsysworld.com
npm run --silent nexus -- inbox delete <messageId> --yes --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox bulk delete <messageId> <messageId> --yes --nexus-url https://nexus.clumsysworld.com --json
npm run --silent nexus -- inbox labels delete <labelId> --yes --nexus-url https://nexus.clumsysworld.com --json
```

## Output Expectations

For change lists, include public ID, title, status, priority, category/subsystem, target build, ready-to-test, and next-patch inclusion. Mention filters used. If you had to start setup or recover from a stopped API, say so briefly.

When returning write results, identify the changed record by public ID and summarize the state that changed. Avoid dumping full JSON unless the user asks for it.

For Webhook Inbox work, prefer `inbox list --json` for filtering and `inbox show <messageId> --json` for full payloads/action runs. Use `inbox link <messageId>` when the user asks for a browser link. Use `inbox review <messageId>` for AI crash review, `inbox archive`/`unarchive` for lifecycle changes, and `inbox delete --yes` only when deletion is explicitly requested. When summarizing inbox data, omit raw payloads, bearer tokens, webhook tokens, and Discord webhook URLs unless the user explicitly asks for sensitive config detail.

## References

Load only what is needed:

- `references/cli.md` for the full CLI command catalog and PowerShell parsing examples.
- `references/api.md` for HTTP routes, auth scopes, and payload notes.
- `references/local-setup.md` for cloning from GitHub, installing dependencies, setup, fresh vs non-fresh setup, dev process control, and common troubleshooting.
