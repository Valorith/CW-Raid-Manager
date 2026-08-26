# WebMCP rollout

CW Nexus exposes a small, authenticated WebMCP tool set as a progressive enhancement. The
integration is disabled by default and does not add or change any server endpoints.

## Initial tool set

- `list_upcoming_raids`: read active and upcoming raids for a viewer guild.
- `get_raid_details`: read a bounded raid summary without signup identities.
- `search_market_listings`: read at most four lowest-price matching listings.
- `find_bosses`: find boss-note entries by boss, zone, or group.
- `open_boss_notes`: navigate the visible app to a validated boss-note entry.

The first four tools are read-only. `open_boss_notes` changes the current route but does not
persist data. All tool results are marked as potentially untrusted because they can contain
guild-authored or externally sourced text.

## Enable locally

1. Use a Chrome version with WebMCP support and enable
   `chrome://flags/#enable-webmcp-testing`.
2. Start the app with
   `ENABLE_IN_PROCESS_SCHEDULERS=false VITE_ENABLE_WEBMCP=true npm run dev`.
3. Sign in at `http://localhost:5173`.
4. Inspect and execute the registered tools in Chrome's WebMCP developer tooling.

Local API reads can use the configured shared Railway data. Keep in-process schedulers disabled and
do not exercise mutation endpoints as part of this initial tool set.

## Production hold point

Do not add an origin-trial token or set `VITE_ENABLE_WEBMCP=true` in the production build until the
local deterministic tests, client checks, and browser execution checks all pass. Browser support is
feature-detected, so an enabled build still behaves normally where `document.modelContext` is
unavailable.

## Initial validation record

The 2026-08-26 validation campaign covered:

- closed-schema and runtime input validation, guild authorization, bounded output, navigation
  failure handling, atomic registration failure, and pending-registration cancellation;
- the full client, CLI, and server test/lint suites plus client type-checking and all production
  builds;
- native Chrome 151 discovery and execution through `document.modelContext.getTools()` and
  `executeTool()` using deterministic browser-intercepted fixtures;
- successful execution of all five tools with no signup identities, no non-GET API requests, and
  no console warnings or errors in the clean run;
- invalid, over-limit, and unauthorized tool calls failing before any API request;
- guild/authentication lifecycle changes unregistering and restoring the five-tool set; and
- optimized default-off and enabled bundles exposing zero and five tools respectively.

No production origin-trial configuration, shared database mutation, migration, or deployment was
performed during this campaign.

## Rollback

The immediate operational rollback is to remove or set `VITE_ENABLE_WEBMCP=false` in the build
environment and rebuild the client. This prevents every registration attempt without changing the
normal application UI or API behavior.

The code-level rollback boundary is isolated to:

- `client/src/composables/useWebMcp.ts`
- `client/src/webmcp/`
- the `useWebMcp` import and invocation in `client/src/App.vue`
- the WebMCP tests and this document

No database migration or server rollback is required for this phase.
