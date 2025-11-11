# Repository Guidelines

## Project Structure & Module Organization
- `client/` holds the Vue 3 + Vite front-end (Pinia stores, views, services, assets).
- `server/` contains the Fastify API, Prisma schema, and migration scripts.
- `scripts/`, `config/`, and `assets/` provide supporting tooling, configuration templates, and static resources.
- Log fixtures (`eqlog_*.txt`, `RaidRoster-*.txt`) live at the repo root for parser and ingest tests.

## Build, Test, and Development Commands
- `npm run dev` – boots the Fastify API and Vite dev server concurrently (http://localhost:4000 and http://localhost:5173).
- `npm run build` – builds both workspaces (`server` first, then `client/dist`).
- `npm run lint` / `npm run format` – run ESLint and Prettier across client/server sources.
- `npm --workspace server run prisma:migrate` – apply or create Prisma migrations; pair with `prisma generate` after schema edits.
- `npm --workspace client run type-check` – verifies Vue/TypeScript types via `vue-tsc`.

## Coding Style & Naming Conventions
- TypeScript/JavaScript use 2‑space indentation (enforced by project ESLint/Prettier configs).
- Prefer PascalCase for Vue components (`LootTrackerView.vue`), camelCase for variables/functions, SCREAMING_SNAKE for constants.
- Vue single-file components co-locate `<script setup lang="ts">`, `<template>`, and scoped `<style>`.
- Run `npm run lint` before committing; formatters are configured for both workspaces.

## Testing Guidelines
- Client type safety: `npm --workspace client run type-check`.
- Server tests (when added) should live alongside source files or under `server/test`.
- Parser experiments can be validated via scripts in `scripts/` (e.g., `scripts/testParser.ts` using `ts-node` or `npx tsc` + `node`).
- Name test files `<feature>.spec.ts` or `<feature>.test.ts` and mirror the source directory structure.

## Commit & Pull Request Guidelines
- Follow conventional, descriptive commit messages (e.g., `feat(loottable): normalize duplicate summary entries`).
- Each PR should include: summary of changes, testing evidence (commands + results or screenshots), and references to any issues (`Fixes #123`).
- Keep PRs focused; split parser, client UI, and server changes when possible to ease review.
- Attach screenshots/GIFs for UI updates and note any migrations or manual steps required for reviewers.

## Security & Configuration Tips
- Copy `server/.env.example` to `server/.env` and populate `DATABASE_URL`, OAuth secrets, and `SESSION_SECRET`.
- Use `config/app.config.json` for environment-specific overrides; point to it with `APP_CONFIG_PATH` when deploying.
- Never commit real logs containing player info; use sanitized fixtures instead.
