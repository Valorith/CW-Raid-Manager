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
├── config/            # Environment configuration templates
└── RaidRoster-*.txt   # Sample EverQuest roster export
```

## Prerequisites

- Node.js 18+
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

- `npm run lint` runs ESLint for both workspaces.
- `npm run build` builds both workspaces.
- `npm --workspace client run type-check` runs `vue-tsc`.
- `npm --workspace server run prisma:generate` refreshes Prisma client types after schema edits.
- `npm --workspace server run cron:snapshot` runs the snapshot cron entrypoint manually.

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
   - Optional: `APP_CONFIG_PATH` if you store a custom `config/app.config.json`.

4. **Set build/start commands in Railway.**

   - Install command: `npm install`
   - Build command: `npm run build`
   - Start command: `npm run start`

   The build step generates the production Vue bundle in `client/dist` and compiles the Fastify server. The start command runs through the database bootstrapper and launches the API + static assets on the port Railway provides.

5. **Run migrations during deployment.**  
   Apply Prisma migrations against the Railway database any time the schema changes:

   ```bash
   railway run npm run --workspace server prisma:deploy
   ```

   The wrapper ensures `DATABASE_URL` is present even when Railway only supplies the `MYSQL_*` variables.

   > The helper accepts `--allow-missing` for commands (like `prisma generate`) that do not require a live database connection; otherwise the process exits early so migrations/startup never proceed without credentials.

6. **Redeploy on changes.**  
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
