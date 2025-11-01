# CW Raid Manager

CW Raid Manager is a full-stack tool for coordinating EverQuest raids. It tracks guild membership, characters, raid schedules, attendance, and loot distribution — including the ability to import roster exports and loot logs straight from the game.

## Features

### Authentication & User Management
- Google OAuth sign-in with secure, signed sessions
- User profiles with customizable nicknames and display names
- Character ownership and main/alt designation

### Guild Management
- Role-based permissions system (Leader, Officer, Raid Leader, Member)
- Guild applications with approval workflow
- Customizable guild descriptions and default raid settings
- Discord integration:
  - Embeddable Discord widget with theme customization
  - Webhook notifications for raid events, signups, and loot
  - Configurable event subscriptions and role mentions

### Character Management
- Character registry linking mains/alts to guilds
- Automatic class detection and archetype classification (Priest, Melee, Caster, Hybrid)
- Character-specific attendance and loot history
- Unknown character assignment workflow for imported rosters

### Raid Planning & Scheduling
- Raid event creation with target zones, bosses, and notes
- Recurring raid events (daily, weekly, monthly)
- Raid signup system with character selection
- Discord voice channel links per raid
- Raid status tracking (scheduled, active, ended)

### Attendance Tracking
- Manual attendance event creation
- EverQuest roster export import (`RaidRoster-*.txt`)
- Attendance preview and verification before saving
- Multiple attendance snapshots per raid (start, end, checkpoints)
- Attendance status tracking (present, absent, late, benched)
- Group number preservation from in-game roster

### Loot Management
- Live loot tracking with real-time log monitoring
- EverQuest log file parsing with customizable patterns
- Loot event recording with timestamps and looter details
- Loot whitelist/blacklist system with item ID matching
- Configurable loot emoji and notes
- Adjustable parsing time windows
- Loot detail modals for editing and review

### Metrics & Analytics
- Guild-level attendance and loot metrics
- Interactive charts with Chart.js visualization
- Character-based and member-based metrics views
- Customizable date range selection with timeline view
- Attendance rate calculations and trends
- Loot distribution analysis

### Admin Features
- System-wide administration panel
- User management and admin privileges

## Tech Stack

- **Frontend:** Vue 3 + Vite + Pinia + Vue Router + Chart.js
- **Backend:** Fastify (TypeScript), Prisma ORM, Zod validation
- **Database:** MySQL (5.7+/8.0)
- **Authentication:** Google OAuth 2.0 with @fastify/oauth2
- **Additional:** @fastify/multipart for file uploads, @fastify/jwt for session management

## Project Structure

```
CW-Raid-Manager/
├── client/                    # Vue 3 front-end application
│   ├── src/
│   │   ├── components/        # Reusable Vue components
│   │   ├── views/            # Page components (Dashboard, Guilds, Raids, Loot, Metrics, etc.)
│   │   ├── stores/           # Pinia state management
│   │   ├── services/         # API communication and business logic
│   │   ├── router/           # Vue Router configuration
│   │   └── utils/            # Helper functions and utilities
│   └── package.json
├── server/                    # Fastify + Prisma API
│   ├── src/
│   │   ├── routes/           # API endpoints (auth, guilds, raids, attendance, loot, metrics)
│   │   ├── services/         # Business logic layer
│   │   ├── middleware/       # Authentication and request processing
│   │   ├── plugins/          # Fastify plugins
│   │   └── utils/            # Server utilities
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema definition
│   │   └── migrations/       # Database migration history
│   └── package.json
├── scripts/                   # Build and development scripts
│   ├── dev.cjs               # Concurrent dev server runner
│   └── run-with-db-url.cjs   # Railway database URL helper
├── config/                    # Application configuration
│   └── app.config.json       # Deployment settings
├── RaidRoster-*.txt          # Sample EverQuest roster exports
└── package.json              # Workspace root configuration
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

- `npm run build` – Builds both workspaces for production
- `npm run lint` – Lints server and client code with ESLint
- `npm run format` – Runs Prettier across server/client source
- `npm run --workspace server prisma:migrate` – Run Prisma migrations (dev)
- `npm run --workspace server prisma:generate` – Regenerate Prisma client
- `npm run dev:server` – Run only the API server
- `npm run dev:client` – Run only the Vue dev server

### Development Tips

- The client dev server proxies `/api/*` requests to `http://localhost:4000`
- Hot module replacement (HMR) is enabled for both frontend and backend
- Database schema changes require running `prisma migrate dev` and restarting the server
- Use the browser console and Vue DevTools for frontend debugging
- Server logs are output via Pino logger in the console
- The `tsx watch` mode automatically restarts the server on file changes

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

## Working with Game Data

### Roster Imports

The application supports importing EverQuest roster exports directly from in-game dumps. Sample format in `RaidRoster-*.txt`:

```
<Group #> <Character Name> <Level> <Class> [Role Flags...]
```

**Import workflow:**

1. Navigate to a raid event
2. Click **Upload Attendance** and select the `.txt` export
3. Review the parsed roster preview with character matching
4. Assign unknown characters to registered users or create new characters
5. Save to create an attendance event

The system automatically validates classes, levels, and role flags, preserving group assignments and attendance status.

### Loot Tracking

The application provides two methods for tracking loot distribution:

**1. Live Log Monitoring**
- Upload an EverQuest log file to start monitoring
- Real-time parsing of loot events as they occur
- Visual console display of accepted/rejected loot lines
- Customizable parsing patterns in guild settings
- Automatic looter class detection and item categorization

**2. Historical Log Upload**
- Parse completed log files from past raids
- Configurable time window filtering (e.g., raid start to raid end + buffer)
- Batch import of loot events
- Preview before committing to database

**Loot log format examples** (see `Loot event Examples.txt`):
```
[Sun Sep 14 21:36:45 2025] Eye of Eashen has been awarded to Loladin by the Master Looter.
[Sun Oct 05 22:33:19 2025] Cloak of the Falling Stars has been awarded to Watchout by random roll.
[Sun Oct 12 22:45:56 2025] Harbinger's Fearful Lantern has been awarded to Podo by the Loot Council.
```

**Loot lists:**
- Maintain whitelist/blacklist of items by name or item ID
- Automatic filtering during log parsing
- Bulk item management with search and sorting

## Usage Guide

### Getting Started

1. **Sign in with Google** - Click "Sign in with Google" on the landing page
2. **Create or join a guild** - Navigate to the Guilds page to create a new guild or apply to existing ones
3. **Add characters** - Register your EverQuest characters and link them to your account
4. **Plan raids** - Create raid events with target zones, bosses, and schedules
5. **Track attendance** - Upload roster exports or manually log attendance
6. **Monitor loot** - Upload log files or use live monitoring to track loot distribution
7. **View metrics** - Access guild metrics to analyze attendance rates and loot trends

### Key Workflows

**For Guild Leaders:**
- Manage guild settings and Discord integration
- Approve/deny guild applications
- Configure loot parser settings and loot lists
- Set up recurring raid schedules
- Configure Discord webhooks for automated notifications

**For Raid Leaders:**
- Create and schedule raid events
- Track signups and manage raid rosters
- Upload attendance data from in-game roster dumps
- Monitor and record loot distribution
- View raid-specific metrics

**For Members:**
- Register characters and designate mains/alts
- Sign up for raids with preferred characters
- View personal attendance and loot history
- Access guild metrics and leaderboards

## Discord Integration

The application provides rich Discord integration:

- **Guild Widget**: Embed a live Discord server widget on your guild page
- **Webhooks**: Automated notifications for:
  - New raid events created
  - Raid status changes (started, ended)
  - Raid signups
  - Loot distribution
  - Attendance updates
- **Customization**: Configure webhook display names, avatars, and role mentions
- **Selective Subscriptions**: Choose which events trigger notifications

## Future Enhancements

- Enhanced permission enforcement for specific raid leader workflows
- DKP (Dragon Kill Points) or EPGP loot system integration
- Calendar view for raid scheduling
- Mobile-responsive UI improvements
- Automated tests (unit and E2E) for critical flows
- Export functionality for attendance and loot reports
- Integration with additional EverQuest log parsers

## Troubleshooting

### Database Connection Issues

- **Error: Can't connect to MySQL server**
  - Verify MySQL is running: `mysql -u root -p`
  - Check `DATABASE_URL` in `server/.env` matches your MySQL instance
  - Ensure database exists: `CREATE DATABASE cw_raid_manager;`

- **Prisma Client not found**
  - Run `npm run --workspace server prisma:generate`
  - Restart the development server

### Authentication Issues

- **OAuth callback fails**
  - Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
  - Ensure `GOOGLE_CALLBACK_URL` matches the URL registered in Google Cloud Console
  - Check that `CLIENT_URL` matches the frontend origin

- **Session expires immediately**
  - Set a secure `SESSION_SECRET` in `server/.env`
  - Clear browser cookies and try again

### Import/Upload Issues

- **Roster import fails to parse**
  - Verify the roster format matches EverQuest's export format
  - Check that character classes are spelled correctly
  - Ensure the file encoding is UTF-8

- **Loot log parsing not working**
  - Verify log timestamps are within the parsing window
  - Check parser patterns in Guild Settings → Parser Settings
  - Use the debug console to see which lines are accepted/rejected
  - Ensure log file format matches EverQuest's standard output

### Performance Issues

- **Slow metric loading**
  - Large date ranges may take time to aggregate
  - Consider narrowing the date range
  - Check database indexes are properly created

- **File upload timeouts**
  - Large log files may take time to process
  - Split log files into smaller chunks if needed
  - Increase server timeout in `config/app.config.json` if necessary

## Contributing

This is a private project, but suggestions and bug reports are welcome via GitHub issues.

---

Questions or feedback? Open an issue or continue iterating from here. Happy raiding! 🗡️
