# CW Raid Manager

CW Raid Manager is a full-stack tool for coordinating EverQuest raids. It tracks guild membership, characters, raid schedules, and attendance — including the ability to import roster exports straight from the game and verify them before saving.

## Features

- Google OAuth sign-in with secure, signed sessions.
- Guild management with role-based permissions (Leader, Officer, Raid Leader, Member).
- Character registry that links mains/alts to guilds.
- Raid event planner with zones, boss targets, notes, and status tracking.
- Attendance events that can be created manually or by importing EverQuest roster exports (`RaidRoster-*.txt`).

## Tech Stack

- **Frontend:** Vue 3 + Vite + Pinia + Vue Router
- **Backend:** Fastify (TypeScript), Prisma ORM
- **Database:** MySQL (5.7+/8.0)

## Project Structure

```
CW Raid Manager/
├── client/            # Vue front-end application
├── server/            # Fastify + Prisma API
├── cli/               # Nexus command-line tooling
├── config/            # Environment configuration templates
└── RaidRoster-*.txt   # Sample EverQuest roster export
```

## Prerequisites

- Node.js 20.19+ (the repo also declares this in `.node-version`)
- npm 9+ (or a compatible package manager that supports workspaces)
- MySQL instance (local or remote)
- Google OAuth 2.0 credentials (Client ID & Secret)

## Local Development

Use this flow when you want to run the app locally with the Vite client and Fastify server in watch mode.

### 1. Install dependencies

From the repo root:

```bash
npm install
```

### 2. Create local config files

```bash
cp server/.env.example server/.env
cp config/app.config.example.json config/app.config.json
```

Then update `server/.env` with your local values:

- `DATABASE_URL`: MySQL connection string for your local database.
- `CLIENT_URL`: usually `http://localhost:5173`.
- `SESSION_SECRET`: long random string for local sessions.
- OAuth settings: at least one provider must be configured if you need to sign in locally.

If you use `config/app.config.json`, keep it aligned with your local host, port, and callback URLs. You can also point elsewhere with `APP_CONFIG_PATH=/path/to/app.config.json`.

Note: the server entrypoints currently load `server/.env` via `dotenv/config`. A `server/.env.local` file is not loaded automatically unless you wire that behavior in.

### 3. Prepare the database

This repo uses both Prisma migrations and Knex migrations. For a fresh local database, run:

```bash
npm --workspace server run prisma:generate
npm --workspace server run prisma:migrate
npm --workspace server run knex:migrate
```

`prisma:migrate` applies the older Prisma migration history, and `knex:migrate` applies newer schema changes.

For an existing database that has already been baselined through Knex, prefer checking Knex status first:

```bash
npm --workspace server exec -- knex --knexfile knexfile.js migrate:status
```

Do not apply the older Prisma migration history to a Knex-baselined database just because `prisma migrate status` reports those Prisma migrations as unapplied. That status means Prisma's own migration table is not the source of truth for that database; inspect the active feature area's recent migrations before choosing Prisma or Knex.

### 4. Start the app

Run both workspaces from the repo root:

```bash
npm run dev
```

Local URLs:

- Client: <http://localhost:5173>
- Server/API: <http://localhost:4000>

The client proxies `/api/*` requests to the Fastify server during development.

If you only want one side running:

```bash
npm run dev:server
npm run dev:client
```

### 5. Useful local checks

- `npm run lint` runs ESLint for the server, client, and CLI workspaces.
- `npm test` runs linting plus mocked CLI coverage and server CLI-scope unit tests.
- `npm run build` builds the server, client, and CLI workspaces.
- `server/build/` is generated server output and is not tracked in Git.
- `npm --workspace client run type-check` runs `vue-tsc`.
- `npm --workspace server run prisma:generate` refreshes Prisma client types after schema edits.
- `npm --workspace server run cron:snapshot` runs the snapshot cron entrypoint manually.

## Nexus CLI

The repo includes a first-party Nexus CLI in the `cli/` workspace. It authenticates through a
browser-approved device flow and stores a revocable `nxcli_` session token in the user's local
config file. From the repo root, use the `npm run nexus -- ...` wrapper; it builds the CLI
automatically when source files changed.

First-time local setup:

```bash
npm run nexus:setup
```

The setup command applies local migrations, starts any missing local dev processes, waits for the
API/client to become ready, opens the browser authorization flow, and saves a `local` profile. If
your local API or client is on a different URL, set `NEXUS_LOCAL_URL` or `NEXUS_LOCAL_CLIENT_URL`
before running setup.

Useful shortcuts:

```bash
npm run nexus:setup:fresh
npm run nexus:doctor
npm run nexus:local -- tm list --status ACTIVE
npm run nexus:dev:stop
```

Use `nexus:setup:fresh` when you want to remove the existing `local` CLI profile and re-test the
first-run browser approval flow. Dev process logs are written under `.nexus/logs/`.

Log in to a hosted Nexus deployment:

```bash
npm run nexus -- setup --url https://your-nexus-host --profile prod
npm run nexus -- profiles use prod
```

Common Test Manager commands:

```bash
npm run nexus -- tm list --status ACTIVE
npm run nexus -- tm show 123
npm run nexus -- tm create --title "Fix crash" --category Server --subsystem Zone --description "What changed"
npm run nexus -- tm note add 123 --text "Verified on current build."
npm run nexus -- tm result 123 pass --notes "Smoke test passed."
npm run nexus -- tm close 123 --detail "Released."
```

Build and test the CLI without touching the live database:

```bash
npm --workspace cli run test
```

For non-login commands, use `--nexus-url` if you need to override the active profile's Nexus URL.
The shorter `--url` flag is reserved for `login` and command-specific URL fields such as
`tm links add --url`. You can also use `--local` with Test Manager commands to select the `local`
profile directly.

High-impact commands such as deleting changes, resetting the next-patch queue, changing tester
access, or updating Test Manager settings require `--yes`. CLI bearer tokens are scoped to
Test Manager, `/api/auth/me`, and CLI session-management endpoints.

## Deploying to Railway

Railway can host both the Fastify API and the Vue client behind a single project. The platform automatically builds each workspace using the commands in `package.json`, so make sure the repository is connected to Railway (either through GitHub or the CLI) before starting.

1. **Create or link a Railway project.**  
   Install the [Railway CLI](https://docs.railway.app/develop/cli) and run `railway login`, then `railway init` from the repository root to link the repo to project `f7cb462c-a401-4899-90c6-04fefd18bb34` (or connect the GitHub repo from the dashboard).

2. **Provision the database.**  
   Add a MySQL service. Railway will inject `MYSQL_URL`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLHOST`, `MYSQLPORT`, and friends into both build and runtime environments.

3. **Environment variables required for the web service.**  
   The script `scripts/run-with-db-url.cjs` derives `DATABASE_URL` automatically from the standard Railway MySQL variables, so you do not need to duplicate the connection string. Make sure the following keys are defined:

   - `CLIENT_URL` – Base URL for the deployed client (usually `https://<railway-domain>`). When absent, the server falls back to the generated `RAILWAY_STATIC_URL`.
   - `SESSION_SECRET` – Long, random string used to sign cookies and JWTs.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` – OAuth credentials configured for the Railway domain.
   - `GOOGLE_CALLBACK_URL` – Must exactly match the Google console redirect (`https://<railway-domain>/api/auth/google/callback`).
   - Optional cost controls: set `EQ_DB_POOL_LIMIT` to a small value for the external EQ database and add Prisma's `connection_limit` parameter to `DATABASE_URL` if the Railway MySQL plan has a low connection cap.
   - Optional scheduler override: `ENABLE_IN_PROCESS_SCHEDULERS=true` starts the web process schedulers for single-service deployments. Leave it unset for the recommended separate web + cron Railway setup.
   - Optional: `APP_CONFIG_PATH` if you store a custom `config/app.config.json`.

4. **Deploy with the checked-in Railway config.**

   This repo includes [`railway.json`](./railway.json), which tells Railway to:

   - build with `npm run build`

   That avoids Railpack guessing wrong in this npm-workspaces setup and ensures the production Vue bundle plus `server/build/index.js` exist before any service boots.

   Do not set a shared `startCommand` in `railway.json` for this repo. Railway applies config-as-code overrides to every service that deploys this repository, which will break the dedicated cron service if it is forced to use the web server command.

5. **Set start commands per service in Railway.**

   For this shared monorepo, configure service-specific runtime settings in the Railway dashboard:

   - Web/API service:
     - Start command: `npm run start`
     - Health check: `GET /health`
   - Cron service:
     - Start command: `npm run cron:snapshot --prefix server`
     - Cron schedule: `*/5 * * * *`
     - No health check required

6. **Run migrations during deployment.**  
   Apply Prisma migrations against the Railway database only for schema changes that are still authored through Prisma migrations:

   ```bash
   railway run npm run --workspace server prisma:deploy
   ```

   Apply Knex migrations when `server/knex/migrations/` changes:

   ```bash
   railway run npm --workspace server run knex:migrate
   ```

   The wrapper ensures `DATABASE_URL` is present even when Railway only supplies the `MYSQL_*` variables.

   > The helper accepts `--allow-missing` for commands (like `prisma generate`) that do not require a live database connection; otherwise the process exits early so migrations/startup never proceed without credentials.

7. **Redeploy on changes.**  
   Push to the connected branch or run `railway up` to trigger a new build. Railway rebuilds the workspaces and restarts the service with the latest code.

## Handling Roster Imports

The file `RaidRoster-20210829-203204.txt` demonstrates the expected EverQuest export format:

```
<Group #> <Character Name> <Level> <Class> [Role Flags...]
```

Upload the text file via the Raid detail screen:

1. Navigate to a raid.
2. Click **Upload Attendance** and select the `.txt` export.
3. Review the parsed roster preview.
4. Save to create an attendance event; you can discard or edit before committing.

The API validates and normalizes classes, levels, and flags, allowing final confirmation in the UI before persisting.

## Next Steps

- Flesh out permission enforcement for officer/raid leader workflows.
- Surface richer attendance analytics (per character, per guild).
- Introduce loot assignment tracking linked to attendance events.
- Add automated tests (unit and E2E) for critical flows.

---

Questions or feedback? Open an issue or continue iterating from here. Happy raiding!
