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
