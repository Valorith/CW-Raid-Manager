# Nexus CLI Setup And Troubleshooting

## GitHub Repo Bootstrap

Canonical GitHub repo:

```text
https://github.com/Valorith/CW-Raid-Manager.git
```

One-command bootstrap from any PowerShell location:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\rgagn\.codex\skills\nexus\scripts\bootstrap-nexus-cli.ps1" -NexusUrl "https://your-nexus-host" -Profile prod
```

Fresh local profile bootstrap for development:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\rgagn\.codex\skills\nexus\scripts\bootstrap-nexus-cli.ps1" -LocalSetup -Fresh
```

Manual bootstrap:

```powershell
New-Item -ItemType Directory -Force "C:\Github Projects" | Out-Null
git clone https://github.com/Valorith/CW-Raid-Manager.git "C:\Github Projects\CWRaidManager"
Set-Location "C:\Github Projects\CWRaidManager"
npm install
npm run nexus:setup -- --url <nexus-url> --profile prod
npm run nexus -- profiles use prod
```

If the repo is private, GitHub auth must already be available through Git Credential Manager, `gh auth login`, SSH, or another configured Git auth method.

Prerequisites:

- Git available on `PATH`.
- Node.js matching the repo requirement, currently `>=20.19.0`.
- npm available on `PATH`.
- Hosted Nexus API URL for normal use. Local server configuration is only needed for explicit local development.

## Hosted Setup

From `C:\Github Projects\CWRaidManager`:

```powershell
npm run nexus:setup -- --url <nexus-url> --profile prod
npm run nexus -- profiles use prod
npm run nexus:doctor
```

This command:

1. Calls the hosted Nexus API device authorization endpoint.
2. Launches browser authorization.
3. Saves the CLI profile after browser approval.

The only expected manual step is auth in the browser.

## Explicit Local Development Setup

Use this only when the user explicitly wants a local API/client stack for development:

```powershell
npm run nexus:setup:local
npm run nexus:setup:local:fresh
```

Local setup runs Prisma generation, applies migrations, starts local API/client dev processes if needed, and saves a `local` profile. Fresh setup removes the target local profile before rerunning setup. Both setup paths may still ask for browser auth.

Stop dev processes started by setup:

```powershell
npm run nexus:dev:stop
```

The stop command only knows about processes recorded in `.nexus\dev-processes.json`. If a server was started manually, stop that process separately.

## Config And URLs

Default local API:

```text
http://localhost:4000
```

Default local client:

```text
http://localhost:5173
```

Default Windows config path:

```text
C:\Users\rgagn\AppData\Roaming\Nexus CLI\config.json
```

Useful environment overrides:

```powershell
$env:NEXUS_LOCAL_URL = "http://localhost:4000"
$env:NEXUS_LOCAL_CLIENT_URL = "http://localhost:5173"
$env:NEXUS_CONFIG_PATH = "C:\path\to\config.json"
$env:NEXUS_TOKEN = "<token>"
```

Do not print token values.

## Health Checks

```powershell
npm run nexus:doctor
npm run --silent nexus:doctor -- --json
npm run --silent nexus -- auth status --json
```

If the hosted API is down or auth fails, verify the profile URL and token:

```powershell
npm run --silent nexus -- profiles list --json
npm run nexus:setup -- --url <nexus-url> --profile prod
```

If local setup should not run migrations or start dev processes:

```powershell
npm run nexus:setup:local -- --skip-migrations
npm run nexus:setup:local -- --skip-dev
```

## Common Issues

API not reachable:

- For hosted use, check the active profile URL and whether the deployment is up.
- For local dev, run `npm run nexus:setup:local`.
- Check `.nexus\logs\server.log` if local setup started the server.
- Check the configured API URL in `npm run --silent nexus -- profiles list --json`.

Auth failed or expired:

- Run `npm run nexus:setup -- --url <nexus-url> --profile prod` again and complete browser auth.
- For a clean local profile, run `npm run nexus:setup:local:fresh`.

Build fails on Windows with Prisma query engine rename or lock errors:

- Stop running dev server processes before a full build.
- Use `npm run nexus:dev:stop` for setup-managed processes.
- Manually stop any server started outside setup.

CLI command returns npm noise:

- Use `npm run --silent ...` for parseable output.

PowerShell JSON parsing:

```powershell
$raw = npm run --silent nexus -- tm list --json
$data = $raw | ConvertFrom-Json
$data.changes | Select-Object publicId,title,status
```
