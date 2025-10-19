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

## Environment Configuration

1. **Clone configuration templates**

   ```bash
   cp server/.env.example server/.env
   cp config/app.config.example.json config/app.config.json
   ```

2. **Edit `server/.env`** with your secrets and connection details:

   - `DATABASE_URL` must point to a MySQL database (schema will be managed by Prisma).
   - `CLIENT_URL` should be the base URL the client is served from (e.g., `http://localhost:5173` in development).
   - `SESSION_SECRET` should be a long, random string.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` must align with your Google OAuth configuration. The callback URL must also be registered in the Google Cloud Console.

3. **Edit `config/app.config.json`** to adjust deployment-specific values (host, port, client base URL, OAuth callback override). You can relocate the file and point to it with `APP_CONFIG_PATH=/path/to/app.config.json`.

## Installation

Install dependencies for both workspaces from the project root:

```bash
cd "CW Raid Manager"
npm install
```

This installs shared dev tooling plus the `client` and `server` dependencies.

## Database & Prisma

Generate the Prisma client and run the initial migration:

```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
```

Follow the prompts to create the database schema.

## Development Workflow

Run both the API and front-end concurrently from the project root:

```bash
npm run dev
```

- Server: <http://localhost:4000>
- Client: <http://localhost:5173>

The dev server proxies `/api/*` requests to the Fastify instance.

### Useful Scripts

- `npm run build` – Builds both workspaces.
- `npm run lint` – Lints server and client code.
- `npm run format` – Runs Prettier across server/client source.
- `npm run --workspace server prisma:migrate` – Prisma migration helper (dev).

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
   - `GOOGLE_CALLBACK_URL` – Typically `https://<railway-domain>/api/auth/google/callback`.
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
