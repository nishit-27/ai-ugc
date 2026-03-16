# CLAUDE.md — AI UGC Project

## Quick Reference

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run lint     # ESLint check
```

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5
- **Styling:** Tailwind CSS v4, shadcn/ui, Radix UI primitives
- **Database:** Neon (serverless Postgres) via `@neondatabase/serverless`
- **Auth:** NextAuth v5 beta (`lib/auth.ts`)
- **Storage:** Google Cloud Storage (resumable uploads)
- **AI:** OpenAI, FAL (video gen), Google Generative AI
- **Video:** FFmpeg/FFprobe, Fabric.js (canvas compositing)
- **DnD:** @dnd-kit/core + @dnd-kit/sortable
- **Charts:** Recharts

## Project Structure

```
app/                 # Next.js App Router pages & API routes
  (dashboard)/       # Authenticated dashboard pages (layout with sidebar)
  api/               # API route handlers
components/          # React components organized by feature
  layout/            # Sidebar, headers
  templates/         # Pipeline builder components
  analytics/         # Analytics dashboard + pivot table
  variables/         # Custom variable management
  ui/                # shadcn/ui primitives
hooks/               # Custom React hooks (useVariables, useAnalytics, etc.)
lib/                 # Server-side utilities
  db-*.js            # Database CRUD modules (one per table/feature)
  db.js              # Barrel re-export of all DB modules
  db-schema.js       # Table creation (initDatabase / ensureDatabaseReady)
  db-client.js       # Neon SQL tagged template connection
  processTemplateJob.ts  # Pipeline job processing engine
types/               # TypeScript type definitions
```

## Key Patterns

### Database
- **ORM:** Drizzle ORM with `drizzle-orm/neon-http` driver
- **Schema:** All 28 tables defined in `lib/schema.ts` using Drizzle `pgTable()`
- **Connection:** `lib/drizzle.ts` exports a lazy-init `db` instance
- **DDL:** `lib/db-schema.js` handles runtime migrations (`initDatabase` / `ensureDatabaseReady`)
- Each feature has its own `lib/db-<feature>.js` with CRUD functions
- Re-export everything from `lib/db.js`
- Use `ensureDatabaseReady()` for reads, `initDatabase()` for writes in API routes
- Simple CRUD uses Drizzle query builder: `db.select().from(table).where(eq(table.id, id))`
- Complex queries (aggregation, CTEs, LATERAL joins) use raw SQL via `sql` from `./db-client`
- Drizzle returns camelCase properties matching the schema — no transform functions needed
- `drizzle-kit` available for schema management: `npm run db:push`, `npm run db:studio`

### API Routes
- Standard Next.js App Router: `export async function GET/POST/PUT/DELETE`
- Always set `export const dynamic = 'force-dynamic'`
- Use `auth()` from `@/lib/auth` for session
- Use `after()` from `next/server` for background processing
- Return `NextResponse.json(...)`

### Hooks
- All marked `'use client'`
- Pattern: `useState` + `useCallback` + `useEffect` for data loading
- Return `{ data, loading, actionCallbacks }`
- Some use module-level caching or localStorage

### Components
- All UI components are `'use client'`
- Use CSS variables for theming: `var(--primary)`, `var(--border)`, etc.
- Icons from `lucide-react`
- Toast notifications via `useToast()` hook

### Pipeline System
- Pipeline = array of `MiniAppStep` objects with `type`, `config`, `enabled`
- Step types: video-generation, batch-video-generation, text-overlay, bg-music, attach-video, compose
- Jobs stored in `template_jobs` table, batches in `pipeline_batches`
- Master pipeline creates one job per model with shared pipeline config

## Hard Rules

1. **No raw SQL in API routes.** All SQL lives in `lib/db-*.js` modules. Routes import functions from `@/lib/db`. If you need a new query, add a function to the appropriate db module, export it from `lib/db.js`, then import it in the route.
2. **Barrel-export new DB functions.** Every new function in `lib/db-*.js` must be added to `lib/db.js` barrel exports.
3. **Use Drizzle query builder for new simple CRUD.** Import `db` from `./drizzle` and tables from `./schema`. Only fall back to raw `sql` from `./db-client` for complex queries (aggregations, CTEs, JSONB operators).
4. **New tables go in `lib/schema.ts`.** Define with `pgTable()`, add `.notNull()` to columns that have defaults and should never be null.
3. **`export const dynamic = 'force-dynamic'`** on every API route.
4. **`ensureDatabaseReady()` for reads, `initDatabase()` for writes** at the top of API route handlers.
5. **DOM/browser helpers go in `lib/domUtils.ts`**, date/formatting helpers in `lib/dateUtils.ts`. Never mix them.
6. **Component barrel exports** — each component folder has an `index.ts`. Add new components to it.
7. **Hooks own all API communication.** Components never call `fetch()` directly — they receive data and callbacks from hooks.
8. **`useSearchParams()` requires a `<Suspense>` boundary** in Next.js 16.
9. **Run `npm run build` after any change** to catch type errors. The project uses TypeScript strict mode.

## Landmines / Gotchas

- **`lib/processJob.ts` has pre-existing build errors** — missing exports from `lib/utils.ts`. Don't touch it unless you're fixing it.
- **`components/queue/` is empty** — the route exists but uses inline components.
- **Model groups dual-write** — `model_group_memberships` table is the source of truth, but `models.group_name` column is still synced as a legacy fallback. Both must be updated together (see `db-models.js`).
- **`db-model-account-mappings.js` has a lazy `ensureApiKeyIndex()` migration** — adds `api_key_index` column on first use.
- **Post deduplication** — uses both `post_idempotency_keys` table AND in-memory caching. Don't bypass either.
- **All storage is R2** — `signed-url` endpoint is a no-op but kept for backward compatibility.

## Commands

```bash
npm run dev        # Start dev server (port 3000)
npm run build      # Production build (type-checks)
npm run lint       # ESLint check
npm run test       # Run vitest tests
npm run test:watch # Run vitest in watch mode
```

## Full Architecture

See `@ARCHITECTURE.md` for the complete map of all 20 pages, ~101 API routes, 28 database tables, 23 hooks, and 17 component folders.

## Environment Variables

Required in `.env`:
- `DATABASE_URL` — Neon Postgres connection string
- `FAL_KEY` — FAL AI API key
- `OPENAI_API_KEY` — OpenAI API key
- `UPLOAD_STORAGE_BUCKET_KEY` — GCS bucket name
- `GCS_SERVICE_ACCOUNT_KEY` — GCS service account JSON
- `LATE_API_KEY` — Social media posting API key
- `NEXTAUTH_SECRET` — NextAuth session secret
