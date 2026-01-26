# Webhook Feature Plan

## Goal
Add a full-featured inbound webhook system with an admin-only UI page, allowing admins to register webhooks, copy URLs, assign actions, and view a complete inbox history with payloads and action results.

## Scope Summary
- Admin-only sub-page in the top navbar (Admin dropdown).
- Webhook registration (create/edit/enable/copy URL).
- Action system with initial actions (Discord relay, Crash Review placeholder).
- Webhook inbox with full history, payload viewer, action run results.
- Retention configurable per webhook; default is indefinite.

## Decisions (Locked In)
- Scope: global/admin only (not guild-scoped).
- Token visibility: always visible for admins (admin-only page).
- Retention: configurable per webhook; default indefinite.
- Actions v1:
  - Discord relay (post payload to Discord webhook URL).
  - Crash Review (placeholder; later LLM analysis).

## Repository Touchpoints
- Server (Fastify + Prisma): `server/src/routes`, `server/src/services`, `server/prisma/schema.prisma`
- Client (Vue 3): `client/src/views`, `client/src/router`, `client/src/services/api.ts`
- Docs: `docs/Webhook-Plan.md`

## Proposed Data Model (Prisma)
- `InboundWebhook`
  - `id`, `label`, `description`, `isEnabled`
  - `token` (plaintext, admin-visible)
  - `retentionPolicy` (Json or fields: mode, days, maxCount; default indefinite)
  - `createdById`, `createdAt`, `updatedAt`
  - `lastReceivedAt`
- `InboundWebhookAction`
  - `id`, `webhookId`, `type`, `name`, `isEnabled`, `config` (Json), `sortOrder`
- `InboundWebhookMessage`
  - `id`, `webhookId`, `receivedAt`, `sourceIp`
  - `headers` (Json), `payload` (Json), `rawBody` (String?)
  - `status` (RECEIVED/PROCESSED/FAILED)
  - `actionSummary` (Json or String)
- `InboundWebhookActionRun`
  - `id`, `messageId`, `actionId`, `status`, `error`, `result` (Json), `durationMs`, `createdAt`

## Backend Plan

### Routes
- Public ingress:
  - `POST /api/webhook-inbox/:webhookId/:token`
    - Validate token & enabled flag.
    - Store message + headers + payload.
    - Respond 204 immediately.
    - Run actions asynchronously.
- Admin-only:
  - `GET /api/admin/webhooks` (list registrations + actions)
  - `POST /api/admin/webhooks` (create)
  - `PUT /api/admin/webhooks/:webhookId` (update)
  - `DELETE /api/admin/webhooks/:webhookId`
  - `POST /api/admin/webhooks/:webhookId/actions`
  - `PUT /api/admin/webhooks/:webhookId/actions/:actionId`
  - `DELETE /api/admin/webhooks/:webhookId/actions/:actionId`
  - `GET /api/admin/webhook-inbox` (list messages, filters, pagination)
  - `GET /api/admin/webhook-inbox/:messageId` (message detail + action runs)

### Services
- `inboundWebhookService.ts`
  - Token generation, URL building.
  - Message persistence + action runner.
  - Action execution with run logging.

### Action Types (v1)
1. Discord Relay
   - Config: `discordWebhookUrl`, optional `mapAsDiscord` flag.
2. Crash Review
   - Placeholder: store payload, mark action run as `SKIPPED` or `PENDING_REVIEW` until LLM integration.

## Client Plan

### Admin Navigation
- Add route `/admin/webhooks` with `requiresAdmin`.
- Add Admin dropdown item “Webhook Inbox”.

### New View: `AdminWebhooksView.vue`
- Header: stats for registrations/messages/failures.
- Tabs:
  - **Endpoints**: list registrations, create/edit, enable/disable, copy URL, action editor, retention config.
  - **Inbox**: table list, filters, status, click to open payload/action details.
- Payload viewer: JSON pretty print with copy button.
- Action runs: status badges, error message, duration.

### API Client
- Extend `client/src/services/api.ts` with webhook CRUD + inbox endpoints.
- Add types in `client/src/services/types.ts`.

## Retention Policy
- Default: indefinite.
- Admin-configurable:
  - `mode: "indefinite" | "days" | "maxCount"`
  - `days?: number`
  - `maxCount?: number`
- Apply cleanup task (optional cron later).

## Progress Tracker

### Phase 1 — Backend Schema
- [x] Add Prisma models + enums
- [ ] Migration + Prisma generate

### Phase 2 — Backend Services & Routes
- [x] Implement inbound webhook service
- [x] Add ingress route
- [x] Add admin CRUD routes
- [x] Add inbox list/detail routes

### Phase 3 — Client UI
- [x] Add router entry + nav item
- [x] Build AdminWebhooksView layout
- [x] Build Endpoints tab
- [x] Build Inbox tab
- [x] Implement payload viewer + action runs
- [x] Add retention policy controls

### Phase 4 — QA
- [ ] Manual tests for ingress
- [ ] Admin-only access checks
- [ ] Action runner smoke test
- [ ] UI checks (desktop + mobile)
