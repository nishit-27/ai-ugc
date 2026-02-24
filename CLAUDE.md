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
- All tables defined in `lib/db-schema.js` using `CREATE TABLE IF NOT EXISTS`
- Each feature has its own `lib/db-<feature>.js` with CRUD functions
- Re-export everything from `lib/db.js`
- Use `ensureDatabaseReady()` for reads, `initDatabase()` for writes in API routes
- SQL uses Neon's tagged template: `` sql`SELECT * FROM table WHERE id = ${id}` ``

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

## Environment Variables

Required in `.env`:
- `DATABASE_URL` — Neon Postgres connection string
- `FAL_KEY` — FAL AI API key
- `OPENAI_API_KEY` — OpenAI API key
- `UPLOAD_STORAGE_BUCKET_KEY` — GCS bucket name
- `GCS_SERVICE_ACCOUNT_KEY` — GCS service account JSON
- `LATE_API_KEY` — Social media posting API key
- `NEXTAUTH_SECRET` — NextAuth session secret
