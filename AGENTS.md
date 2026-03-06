# Repository Guidelines

## Architecture Overview
- This is a monorepo with a Vue 3 + Vite client in `client/` and a Fastify + Prisma server in `server/`.
- The server owns authentication, authorization, persistence, cron/scheduler work, webhook processing, and EQ data integrations.
- The client is mostly feature-driven: route views in `client/src/views/` often orchestrate their own data loading and mutations through `client/src/services/api.ts`.
- Pinia is used for shared cross-view state (`auth`, loot monitor state, attention indicators, tooltip/cache-like state, guild bank, character admin), not as a blanket replacement for local component state.
- Do not edit generated or built output in `server/build/`; change source files under `server/src/` or `client/src/`.

## Project Structure & Key Areas
- `client/src/views/` contains the main feature surfaces. Some files are intentionally large feature containers, especially raid-, loot-, and admin-related views.
- `client/src/services/api.ts` is the primary client/server contract layer. API payload/result interfaces are maintained manually here and in `client/src/services/types.ts`.
- `client/src/stores/` holds shared state. Check an existing store before introducing another global store.
- `client/src/composables/` and `client/src/components/` hold reusable UI/state helpers such as global error handling, minimum-loading delays, modal flows, and toast dispatch.
- `server/src/routes/` is the HTTP layer. Route files validate input, enforce auth, and delegate to services.
- `server/src/services/` contains almost all business logic and data access. Prefer adding or extending service functions instead of pushing logic into routes.
- `server/src/utils/` contains lower-level infrastructure helpers such as Prisma bootstrapping, EQ DB access, slug generation, Sentry, and parser utilities.
- `server/prisma/schema.prisma` defines the Prisma client data model for the application database.
- `server/prisma/migrations/` contains older Prisma migrations. `server/knex/migrations/` contains many newer schema changes.
- `assets/` contains shared icons and other static resources served by the server. Loot item icons are read from `assets/icons/items`.
- Root-level `eqlog_*.txt` and `RaidRoster-*.txt` files are useful sanitized fixtures for parser/ingest work.

## Build, Test, and Development Commands
- `npm run dev` starts both server and client.
- `npm run build` builds both workspaces.
- `npm run lint` runs ESLint across server and client.
- `npm test` currently aliases linting; it is not a separate test suite.
- `npm --workspace client run type-check` runs `vue-tsc`.
- `npm --workspace server run prisma:generate` refreshes Prisma client types after schema edits.
- `npm --workspace server run prisma:migrate` applies Prisma migrations for areas still using that flow.
- `npm --workspace server run knex:migrate` applies Knex migrations for newer schema changes.
- `npm --workspace server run cron:snapshot` runs the EQ snapshot cron entrypoint manually.

## Frontend Patterns
- Use Vue SFCs with `<script setup lang="ts">`.
- Prefer existing API helpers in `client/src/services/api.ts` over ad hoc `axios` calls in new code. The repo already centralizes many endpoints there.
- When API shapes change, update both the server response serializer and the manual client typings. There is no generated shared schema between workspaces.
- Shared enums/labels for the client live in `client/src/services/types.ts`; extend those when adding UI-facing enum values.
- Use `useMinimumLoading` for screens that would otherwise flicker during quick requests.
- Use `useErrorModal` for user-visible failures and `useToastBus` for transient success/warning/error toasts.
- Router auth is driven by route `meta` flags and `useAuthStore()`. The auth store fetches `/api/auth/me` and relies on cookie-based auth.
- Existing large views such as `RaidDetailView.vue`, `LootTrackerView.vue`, and several admin pages are feature hubs. When adding substantial new logic, prefer extracting composables/components instead of making those files even denser.
- `client/src/utils/defaultLogHandle.ts` persists File System Access handles in IndexedDB for default EQ log files. Preserve that storage format when changing saved-log behavior.
- `client/src/utils/patternPlaceholders.ts` intentionally mirrors the server placeholder-to-regex behavior for loot parser settings. Keep client/server versions aligned.

## Backend Patterns
- Register routes in `server/src/routes/index.ts` and keep route prefixes consistent with the existing `/api/...` structure.
- Protected endpoints use `preHandler: [authenticate]`. Auth is cookie-backed JWT via `cwraid_token`.
- Validate params, query, and body with `zod`.
- Use `safeParse()` when returning a friendly `400` response.
- Use `parse()` when invalid input should be treated as a programmer/configuration error inside an already-constrained path.
- Route handlers should stay thin: parse input, check permissions, call services, shape the response.
- Keep data access in services. Several areas already depend on service helpers like `ensureUserCanViewGuild`, `ensureCanManageRaid`, `getUserGuildRole`, and `canManageGuild`.
- Use `withPreferredDisplayName()` before returning user-facing records that may prefer nickname over display name.
- Preserve Fastify type augmentations in `server/src/types/fastify.d.ts` and `server/src/types/fastify-sensible.d.ts`; routes rely on typed `request.user` and reply helpers like `reply.badRequest()`.
- Preserve the Prisma augmentation in `server/src/types/prisma-augment.d.ts` unless the underlying Prisma typing workaround is removed deliberately.
- The server can boot without `DATABASE_URL`, but `server/src/utils/prisma.ts` swaps in a proxy client that throws on DB access. Treat that as a degraded startup mode, not full functionality.

## Data Model & Persistence Rules
- The application database is MySQL accessed through Prisma models in `server/prisma/schema.prisma`.
- JSON columns are used heavily for flexible feature data, including raid targets, loot parser settings, webhook payloads/actions, merged message metadata, snapshot summaries, and similar UI-driven structures. Preserve existing shapes unless the client and serializers are updated together.
- Important model groups include:
- `Auth and membership`: `User`, `Guild`, `GuildMembership`, `GuildApplication`.
- `Raid domain`: `RaidEvent`, `RaidEventSeries`, `RaidSignup`, `AttendanceEvent`, `AttendanceRecord`, `RaidLootEvent`, `RaidNpcKillEvent`.
- `Quest tracker`: `QuestBlueprint`, `QuestBlueprintFolder`, `QuestNode`, `QuestNodeLink`, `QuestAssignment`, `QuestNodeProgress`.
- `Guild tooling`: `GuildLootParserSettings`, `GuildLootListEntry`, `GuildDiscordWebhook`, `GuildBankCharacter`, `GuildNpcNote`.
- `Webhook inbox/admin`: `InboundWebhook`, `InboundWebhookAction`, `InboundWebhookMessage`, `InboundWebhookActionRun`, read/star/label tables.
- `NPC respawn tracker`: `NpcDefinition`, `NpcKillRecord`, `NpcRespawnSubscription`, `NpcRespawnNotification`, `PendingNpcKillClarification`, `NpcFavorite`.
- `Admin/snapshot data`: `MoneyTrackerSettings`, `MoneySnapshot`, `MetallurgySnapshot`, `AccountNote`, `CharacterAssociation`, `CharacterWatch`, `WebhookDebugMessage`, `SystemSetting`.
- Guild membership is the main source of truth for guild access. Some features intentionally derive “guild characters” from guild members’ user IDs rather than only from `Character.guildId`.
- Character admin notes, manual associations, watch lists, and snapshot tables are stored locally even when the source operational data comes from the external EQ database.
- Raid recurrence is modeled with `RaidEventSeries` plus `RaidEvent.recurrenceSeriesId`.
- Money and metallurgy history is stored locally as snapshots, while the live/raw totals come from the EQ database.
- Some fields use `BigInt`, `Decimal`, and `Json`; be careful with client serialization and formatting when adding new fields.

## Mixed Migration Strategy
- This repo uses both Prisma migrations and Knex migrations.
- Older schema history lives in `server/prisma/migrations/`.
- Many newer schema changes live in `server/knex/migrations/`.
- Before adding a migration, inspect recent migrations in the same feature area and follow the active convention there instead of assuming Prisma-only.
- Even when the migration is authored in Knex, keep `server/prisma/schema.prisma` in sync so Prisma client types remain correct.
- After schema edits, run `npm --workspace server run prisma:generate`.

## External Data Sources & Integrations
- `server/src/utils/eqDb.ts` manages a separate mysql2 pool for the external EQ content/game database.
- Features that use the EQ database include item lookups, item stats, guild bank snapshots, character admin, player event logs, task data, connections analysis, guild donations, money tracking, metallurgy, and parts of the NPC respawn flow.
- EQ-backed code should guard with `isEqDbConfigured()` and degrade cleanly when that database is unavailable.
- Some EQ-backed services perform runtime schema discovery because upstream EQ schemas vary by server deployment. Preserve that compatibility logic unless the target schema is explicitly fixed.
- OAuth integrations live in `server/src/plugins/googleOAuth.ts` and `server/src/plugins/discordOAuth.ts`.
- Outbound Discord webhook logic is spread across guild webhook settings, raid/loot/NPC notifications, and webhook debug SSE flows.
- Inbound webhook ingestion lives under `/api/webhook-inbox` and stores raw payloads plus action execution history.
- Sentry is initialized during server startup in `server/src/app.ts`.
- Gemini-based crash review logic exists in `server/src/services/geminiCrashReviewService.ts`; keep AI-specific prompting/config localized there rather than leaking it across unrelated services.

## Shared Resources & Mirrored Logic
- Shared zone/reference data exists in both `client/src/data/` and `server/src/data/` for different use cases.
- Shared asset lookups rely on `assets/icons` and `/assets/icons` static serving from the Fastify app.
- Loot parser placeholder behavior exists in both `client/src/utils/patternPlaceholders.ts` and `server/src/utils/patternPlaceholders.ts`; update both when changing placeholder syntax.
- Client-facing class labels/icons and role categorization live in `client/src/services/types.ts`; reuse those helpers instead of re-encoding class metadata in views.

## Testing & Change Guidance
- Run targeted checks for the layer you touched.
- `Client UI/state`: `npm --workspace client run type-check` and `npm run lint`.
- `Server/service/schema`: `npm run lint` and `npm --workspace server run build`.
- `Schema changes`: `npm --workspace server run prisma:generate` plus the relevant migration command.
- `Parser changes`: validate against the root log fixtures or relevant scripts in `scripts/`.
- Because automated coverage is limited, include concise manual verification notes for complex UI flows, live monitoring, OAuth, webhook, scheduler, or EQ DB integration work.
- If you change an API response shape, verify the matching client interface and consuming view/store code in the same change.

## Coding Style & Naming Conventions
- TypeScript uses 2-space indentation and project ESLint/Prettier rules.
- Vue components use PascalCase filenames; variables/functions use camelCase; constants use SCREAMING_SNAKE_CASE.
- Keep comments targeted and technical. Most files already prefer self-explanatory code over commentary.
- Follow existing naming patterns in domain services instead of inventing new terminology for the same concepts.

## Commit & Pull Request Guidelines
- Use conventional, descriptive commit messages.
- Keep changes scoped by feature area when possible; parser, UI, webhook, and schema work all review more easily when separated.
- PRs should include a summary, testing evidence, screenshots for UI changes, and any migration/manual setup notes.

## Security & Configuration Tips
- Copy `server/.env.example` to `server/.env` and populate `DATABASE_URL`, OAuth credentials, and `SESSION_SECRET`.
- `APP_CONFIG_PATH` can point to `config/app.config.json` for file-based overrides.
- The server can derive `DATABASE_URL` from `MYSQL*` environment variables; EQ DB configuration is separate via `EQ_DB_*`.
- Never commit real player/account logs or unsanitized webhook payloads.
