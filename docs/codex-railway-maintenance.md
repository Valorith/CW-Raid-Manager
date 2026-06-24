# Codex Railway Maintenance Automation

This repo includes a local Codex automation for daily Railway usage and log review.

## What Runs

`npm run codex:railway-maintenance` does the following:

1. Verifies `railway`, `gh`, and `codex` are available and authenticated.
2. Captures redacted Railway evidence into `~/.codex/automations/cw-railway-maintenance/runs/<timestamp>/evidence/`.
3. Appends a machine-readable run summary to `~/.codex/automations/cw-railway-maintenance/metrics/history.jsonl`.
4. Creates isolated per-task clones under `~/.codex/automations/cw-railway-maintenance/runs/<timestamp>/workspaces/`.
5. Runs Codex twice, once for safe usage optimizations and once for safe log-derived bug fixes.
6. If Codex leaves a small verified diff, the wrapper commits it on a branch from `origin/main`, opens a GitHub PR, and sends a Telegram message with the PR link.

The automation does not mutate Railway resources, environment variables, databases, production services, or live app data. Railway CLI usage is read-only.

## Schedule

Install the macOS `launchd` trigger:

```bash
npm run codex:railway-maintenance:install
```

The LaunchAgent runs daily at 2:00 AM local time.

Uninstall it:

```bash
npm run codex:railway-maintenance:uninstall
```

## Manual Checks

Collect Railway evidence without running Codex:

```bash
npm run codex:railway-maintenance:collect
```

Run only one task:

```bash
npm run codex:railway-maintenance -- --task usage
npm run codex:railway-maintenance -- --task bugs
```

Use a shorter Railway lookback window:

```bash
npm run codex:railway-maintenance:collect -- --since 1h
```

## Local State

Default state root:

```text
~/.codex/automations/cw-railway-maintenance
```

Important files:

- `runs/<timestamp>/run-state.json`: full run result.
- `runs/<timestamp>/run.log`: command timeline.
- `runs/<timestamp>/evidence/`: redacted Railway metrics, deployment data, app logs, HTTP errors, and slow HTTP logs.
- `runs/<timestamp>/workspaces/`: isolated Git clones used for Codex investigation and PR branches.
- `runs/<timestamp>/codex-last-message-*.md`: Codex final notes for each task.
- `runs/<timestamp>/codex-events-*.jsonl`: Codex JSONL event stream.
- `runs/<timestamp>/unpublished-*.patch`: preserved patch when Codex made changes but verification or metadata failed.
- `metrics/history.jsonl`: append-only timeline of evidence digests and task outcomes.
- `state/last-run.json`: most recent run summary.
- `logs/launchd.out.log` and `logs/launchd.err.log`: LaunchAgent stdout/stderr.

Override the state root with:

```bash
CODEX_RAILWAY_MAINTENANCE_HOME=/path/to/state npm run codex:railway-maintenance
```

## Verification

By default, PR-worthy changes must pass:

```bash
git diff --check && npm test
```

Override this for a run:

```bash
CODEX_RAILWAY_MAINTENANCE_VERIFY_COMMAND="git diff --check && npm run lint" npm run codex:railway-maintenance
```

Disable verification only for troubleshooting:

```bash
npm run codex:railway-maintenance -- --no-verify
```

Each isolated workspace is prepared before Codex runs with:

```bash
npm install
```

Override or disable that prep step:

```bash
CODEX_RAILWAY_MAINTENANCE_PREP_COMMAND="npm install --ignore-scripts" npm run codex:railway-maintenance
npm run codex:railway-maintenance -- --no-prepare
```
