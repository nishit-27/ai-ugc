# ARCHITECTURE.md — AI UGC Project

> Single source of truth for project structure. Auto-generated maps of every page, API route, database table, hook, and component folder.

## High-Level Data Flow

```
User → Page (app/(dashboard)/*) → Hook (hooks/use*.ts) → fetch("/api/...") → API Route → lib/db-*.js → Neon Postgres
                                                                                              ↓
                                                                              lib/db-client.js (sql tagged template)
```

## Pipeline Flow

```
Master Pipeline Page
  → POST /api/templates (creates pipeline_batch + N template_jobs, one per model)
  → after() calls processTemplateJob.ts per job
  → Steps execute sequentially: video-generation → text-overlay → bg-music → compose → etc.
  → FAL AI webhook → POST /api/fal-webhook → updates template_job status
  → On completion: POST /api/templates/master/[batchId]/post → Late API → social platforms
```

---

## Dashboard Pages (20 routes)

| Route | Page File | Hooks Used | Component Folder |
|-------|-----------|------------|-----------------|
| `/generate` | `app/(dashboard)/generate/page.tsx` | `useModels`, `useBatches` | `generate/` |
| `/models` | `app/(dashboard)/models/page.tsx` | `useModels` | `models/` |
| `/model-groups` | `app/(dashboard)/model-groups/page.tsx` | — | — |
| `/batches` | `app/(dashboard)/batches/page.tsx` | `useBatches` | `batches/` |
| `/batches/[id]` | `app/(dashboard)/batches/[id]/page.tsx` | — | — |
| `/jobs` | `app/(dashboard)/jobs/page.tsx` | `useTemplates`, `usePipelineBatches`, `useModelFilterOptions` | `templates/` |
| `/jobs/batch/[id]` | `app/(dashboard)/jobs/batch/[id]/page.tsx` | — | `templates/` |
| `/jobs/master/[id]` | `app/(dashboard)/jobs/master/[id]/page.tsx` | — | `templates/` |
| `/master-pipeline` | `app/(dashboard)/master-pipeline/page.tsx` | — | `templates/` |
| `/templates` | `app/(dashboard)/templates/page.tsx` | — | `templates/` |
| `/compose` | `app/(dashboard)/compose/page.tsx` | `useComposeCanvas`, `useResizablePanel`, `useTimelinePlayhead` | `compose/` |
| `/posts` | `app/(dashboard)/posts/page.tsx` | `usePosts`, `useModelFilterOptions` | `posts/` |
| `/connections` | `app/(dashboard)/connections/page.tsx` | `useConnections` | `connections/` |
| `/videos` | `app/(dashboard)/videos/page.tsx` | `useGeneratedVideos`, `useModelFilterOptions` | `videos/` |
| `/images` | `app/(dashboard)/images/page.tsx` | `useGeneratedImages` | `images/` |
| `/analytics` | `app/(dashboard)/analytics/page.tsx` | `useAnalytics` | `analytics/` |
| `/variables` | `app/(dashboard)/variables/page.tsx` | `useVariables` | `variables/` |
| `/pricing` | `app/(dashboard)/pricing/page.tsx` | — | `pricing/` |
| `/queue` | `app/(dashboard)/queue/page.tsx` | — | `queue/` |
| `/delete` | `app/(dashboard)/delete/page.tsx` | — | — |

---

## API Endpoints (~101 routes)

### Analytics (13 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET, POST | `/api/analytics/accounts` | List/create tracked analytics accounts |
| GET, DELETE | `/api/analytics/accounts/[id]` | Get/delete account with media+snapshots |
| POST | `/api/analytics/accounts/[id]/refresh` | Refresh single account |
| POST | `/api/analytics/auto-sync` | Auto-discover Late API accounts |
| GET | `/api/analytics/cron` | Scheduled daily sync (light/full) |
| GET | `/api/analytics/daily-metrics` | Aggregated daily media metrics |
| GET | `/api/analytics/follower-history` | Historical follower counts |
| GET | `/api/analytics/media` | List media items (filtered, sorted) |
| GET | `/api/analytics/overview` | Overall engagement summary |
| GET | `/api/analytics/platform-breakdown` | Per-platform metrics |
| GET | `/api/analytics/posting-activity` | Posting frequency metrics |
| GET | `/api/analytics/posting-times` | Day-of-week/hour heatmap |
| POST | `/api/analytics/refresh` | Manual hard sync |

### Templates & Pipeline (8 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET, POST | `/api/templates` | List/create template jobs |
| GET, DELETE | `/api/templates/[id]` | Get/delete template job |
| PATCH | `/api/templates/[id]/overrides` | Update job overrides |
| PATCH | `/api/templates/[id]/post-status` | Mark posted/rejected |
| POST | `/api/templates/[id]/process` | Start processing job |
| POST | `/api/templates/[id]/regenerate` | Clone and regenerate |
| GET, POST | `/api/template-presets` | List/create presets |
| PUT, DELETE | `/api/template-presets/[id]` | Update/delete preset |

### Pipeline Batches (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/pipeline-batches` | List all pipeline batches |
| GET, DELETE | `/api/pipeline-batches/[id]` | Get/delete batch |
| POST | `/api/pipeline-batches/[id]/fail-queued` | Fail stuck queued jobs |
| PATCH | `/api/pipeline-batches/[id]/master-config` | Update master config |

### Master Posting (1 route)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/templates/master/[batchId]/post` | Post master batch to social media |

### Models (7 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET, POST | `/api/models` | List/create models |
| GET, PATCH, DELETE | `/api/models/[id]` | Get/update/delete model |
| GET, PUT | `/api/models/[id]/accounts` | Get/replace account mappings |
| GET, POST | `/api/models/[id]/images` | List/upload model images |
| DELETE, PATCH | `/api/models/[id]/images/[imageId]` | Delete/set-primary image |
| GET | `/api/models/inactive-accounts` | Find unhealthy mapped accounts |
| GET, POST, PATCH, DELETE | `/api/model-groups` | CRUD for model groups |

### Late API / Social (13 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/late/accounts` | List all Late accounts |
| DELETE | `/api/late/accounts/[id]` | Delete account |
| GET | `/api/late/accounts/health` | Account health check |
| GET | `/api/late/connect/[platform]` | Get connect/auth URL |
| GET | `/api/late/invite/[platform]` | Get invite URL |
| GET | `/api/late/posts` | List posts |
| GET, PATCH, DELETE | `/api/late/posts/[id]` | Get/update/delete post |
| POST | `/api/late/posts/[id]/retry` | Retry failed post |
| POST | `/api/late/posts/[id]/unpublish` | Unpublish post |
| GET, POST | `/api/late/profiles` | List/create profiles |
| GET, PATCH, DELETE | `/api/late/profiles/[id]` | Get/update/delete profile |

### Video Generation (5 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/generate` | Create single video gen job |
| POST | `/api/batch-generate` | Create batch of jobs |
| POST | `/api/fal-webhook` | FAL AI completion webhook |
| POST | `/api/recover-stuck-jobs` | Recovery for stuck jobs |
| GET | `/api/compose-jobs` | List jobs for composition |

### Image Generation (4 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/generate-first-frame` | Single face-swap image |
| POST | `/api/generate-first-frame/batch` | Batch face-swap |
| POST | `/api/generate-carousel-image` | Carousel face-swap |
| GET, DELETE | `/api/generated-images`, `/api/generated-images/[id]` | List/delete generated images |

### Frame Extraction (2 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/extract-frames` | Extract + score frames |
| POST | `/api/extract-timeline-frames` | Evenly-spaced timeline frames |

### Uploads & Files (6 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/upload-image` | Upload image to R2 |
| POST | `/api/upload-video` | Upload video to R2 |
| POST | `/api/upload-video/session` | Create resumable upload session |
| POST | `/api/upload-video/complete` | Finalize resumable upload |
| GET, POST | `/api/signed-url` | Sign URLs (no-op for R2 public) |
| GET | `/api/serve/[...path]` | Serve local uploads/output |

### Posts & Publishing (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/posts/upload` | Upload video + create post |
| POST | `/api/posts/by-jobs` | Get posts for job IDs |
| POST | `/api/tiktok/upload` | Legacy TikTok upload |

### Jobs (legacy) (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/jobs` | List all jobs |
| GET, DELETE | `/api/job/[id]` | Get/delete job |
| GET | `/api/batches`, `/api/batches/[id]` | List/get batches |

### Variables (6 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET, POST | `/api/variables` | List/create variables |
| GET, PUT, DELETE | `/api/variables/[id]` | Get/update/delete variable |
| GET, POST | `/api/variables/values` | Get/set job variable values |
| GET | `/api/variables/pivot` | Pivot table query |
| POST | `/api/variables/backfill` | Backfill "Runable Integration" |
| POST | `/api/variables/backfill-media` | Link media items to jobs |

### Music (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET, POST | `/api/music-tracks` | List/upload music |
| POST | `/api/music-tracks/sign` | Sign music URLs |
| GET, POST | `/api/trending-tracks` | Get/refresh trending tracks |

### TikTok (4 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/tiktok/accounts` | List TikTok accounts |
| GET | `/api/tiktok/connect` | Get connect URL |
| GET | `/api/tiktok/logs/[id]` | Post publish logs |
| GET | `/api/tiktok/status/[id]` | Post status check |

### Utilities (6 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/videos` | List all videos |
| POST | `/api/video-duration` | Get duration via ffprobe |
| POST | `/api/parse-tiktok-urls` | Extract URLs from text/CSV |
| POST | `/api/resolve-video-url` | Resolve social media download URL |
| GET | `/api/pricing` | Generation cost analytics |
| GET, POST | `/api/init-db` | Initialize database |
| GET | `/api/config-status` | Check env config |
| GET | `/api/settings/[key]` | Get setting value |
| GET | `/api/accounts/model-map` | Account→model mapping (cached) |
| POST | `/api/fetch-carousel-media` | Fetch carousel images from URLs |

---

## Database Tables (28)

| # | Table | Module | Purpose |
|---|-------|--------|---------|
| 1 | `jobs` | `db-jobs.js` | Legacy video generation jobs |
| 2 | `template_jobs` | `db-template-jobs.js` | Pipeline-based video generation jobs |
| 3 | `template_job_post_locks` | `db-template-jobs.js` | Distributed locks for posting |
| 4 | `pipeline_batches` | `db-pipeline-batches.js` | Groups of template jobs |
| 5 | `batches` | `db-batches.js` | Legacy job batches |
| 6 | `models` | `db-models.js` | AI model profiles |
| 7 | `model_images` | `db-model-images.js` | Images per model (face-swap sources) |
| 8 | `model_group_memberships` | `db-models.js` | Many-to-many model↔group |
| 9 | `model_account_mappings` | `db-model-account-mappings.js` | Model↔social account links |
| 10 | `tiktok_accounts` | `db-accounts.js` | Legacy TikTok account records |
| 11 | `posts` | `db-posts.js` | Social media post records |
| 12 | `post_idempotency_keys` | `db-posts.js` | Dedup keys for post creation |
| 13 | `post_request_locks` | `db-posts.js` | Distributed locks for posting |
| 14 | `media_files` | `db-media-files.js` | Uploaded file metadata |
| 15 | `generated_images` | `db-generated-images.js` | AI-generated face-swap images |
| 16 | `music_tracks` | `db-music-tracks.js` | Background music library |
| 17 | `template_presets` | `db-template-presets.js` | Saved pipeline configurations |
| 18 | `trending_tracks` | `db-trending-tracks.js` | Cached trending TikTok tracks |
| 19 | `app_settings` | `db-settings.js` | Key-value app settings |
| 20 | `analytics_accounts` | `db-analytics.js` | Tracked social accounts |
| 21 | `analytics_account_snapshots` | `db-analytics.js` | Daily follower/engagement snapshots |
| 22 | `analytics_media_items` | `db-analytics.js` | Individual post performance |
| 23 | `analytics_media_snapshots` | `db-analytics.js` | Daily per-post metric snapshots |
| 24 | `custom_variables` | `db-custom-variables.js` | User-defined variable definitions |
| 25 | `job_variable_values` | `db-custom-variables.js` | Variable values per job |
| 26 | `media_variable_values` | `db-custom-variables.js` | Variable values per media item |
| 27 | `generation_requests` | `db-generation-requests.js` | AI generation cost tracking |
| 28 | `late_profile_api_keys` | `db-late-profile-keys.js` | Profile→API key routing |

---

## Hooks (23)

| Hook | APIs Called | Used By |
|------|-----------|---------|
| `useAnalytics` | `/api/analytics/*` | `/analytics` |
| `useBatches` | `/api/batches` | `/generate`, `/batches` |
| `useComposeCanvas` | (none, local state) | `/compose` |
| `useConnections` | `/api/late/profiles`, `/api/late/accounts` | `/connections` |
| `useGeneratedImages` | `/api/generated-images` | `/images` |
| `useGeneratedVideos` | `/api/videos?mode=generated` | `/videos` |
| `useJobs` | `/api/jobs` | `/generate` (via JobsProvider) |
| `useModelFilterOptions` | `/api/models` | `/posts`, `/videos`, `/jobs` |
| `useModels` | `/api/models`, `/api/models/[id]/images` | `/generate`, `/models` |
| `useMusicTracks` | `/api/music-tracks` | pipeline config |
| `usePageVisibility` | (none, visibilitychange event) | `useBatches`, `useJobs`, etc. |
| `usePipelineBatches` | `/api/pipeline-batches` | `/jobs` |
| `usePosts` | `/api/late/posts`, `/api/accounts/model-map`, `/api/videos` | `/posts` |
| `usePresets` | `/api/template-presets` | pipeline builder |
| `useResizablePanel` | (none, local state) | `/compose` |
| `useStuckJobRecovery` | `/api/recover-stuck-jobs` | `useBatches`, `useJobs`, `useTemplates` |
| `useTemplates` | `/api/templates` | `/jobs` |
| `useTimelinePlayhead` | (none, local state) | `/compose` |
| `useToast` | (none, React Context) | many pages |
| `useTrendingTracks` | `/api/trending-tracks` | pipeline config |
| `useVariables` | `/api/variables` | `/variables` |
| `useVideoUpload` | (GCS direct upload) | video upload flows |
| `use-mobile` | (none, matchMedia) | layout |

---

## Component Folders (17)

| Folder | Files | Barrel Export |
|--------|-------|-------------|
| `analytics/` | 18 components + `pivot/` subfolder | `index.ts` |
| `auth/` | 3 components | `index.ts` |
| `batches/` | 1 component | `index.ts` |
| `compose/` | 8 components + `presets.ts` | `index.ts` |
| `connections/` | 4 components + `profileAvatar.ts` | `index.ts` |
| `generate/` | 3 components | `index.ts` |
| `images/` | 2 components | `index.ts` |
| `layout/` | 1 component (Sidebar) | `index.ts` |
| `media/` | 1 component | `index.ts` |
| `models/` | 4 components | `index.ts` |
| `posts/` | 5 components | `index.ts` |
| `pricing/` | 1 component | `index.ts` |
| `queue/` | (empty) | — |
| `templates/` | 21 components + 4 subfolders | `index.ts` |
| `ui/` | 27 components (shadcn + custom) | — |
| `variables/` | 2 components + `variable-colors.ts` | `index.ts` |
| `videos/` | 2 components | `index.ts` |

---

## DB Module Map

| Module File | Tables Owned | Function Count |
|-------------|-------------|---------------|
| `db-client.js` | (connection) | 1 |
| `db-schema.js` | (DDL for all tables) | 2 |
| `db-jobs.js` | `jobs` | 9 |
| `db-accounts.js` | `tiktok_accounts` | 5 |
| `db-media-files.js` | `media_files` | 5 |
| `db-posts.js` | `posts`, `post_idempotency_keys`, `post_request_locks` | 15 |
| `db-models.js` | `models`, `model_group_memberships` | 14 |
| `db-model-images.js` | `model_images` | 7 |
| `db-model-account-mappings.js` | `model_account_mappings` | 8 |
| `db-batches.js` | `batches` | 6 |
| `db-pipeline-batches.js` | `pipeline_batches` | 7 |
| `db-template-jobs.js` | `template_jobs`, `template_job_post_locks` | 17 |
| `db-template-presets.js` | `template_presets` | 4 |
| `db-music-tracks.js` | `music_tracks` | 3 |
| `db-settings.js` | `app_settings` | 2 |
| `db-trending-tracks.js` | `trending_tracks` | 3 |
| `db-generated-images.js` | `generated_images` | 7 |
| `db-late-profile-keys.js` | `late_profile_api_keys` | 5 |
| `db-custom-variables.js` | `custom_variables`, `job_variable_values`, `media_variable_values` | 12 |
| `db-generation-requests.js` | `generation_requests` | 3 |
| `db-analytics.js` | `analytics_accounts`, `analytics_account_snapshots`, `analytics_media_items`, `analytics_media_snapshots` | 25 |

---

## Polling & Caching Strategy

| Hook | Active Poll | Idle Poll | Hidden Tab | Cache |
|------|-----------|----------|------------|-------|
| `useJobs` | 1.5s | 30s | 2min | localStorage |
| `useTemplates` | 1.5s | 30s | 2min | localStorage |
| `useBatches` | 3s | 60s | paused | — |
| `usePipelineBatches` | 3s | 30s | 2min | localStorage |
| `usePosts` | 5s | 60s | 2min | localStorage + module cache |
| `useAnalytics` | — | — | — | module cache (30s) |
| `useModels` | — | — | — | module cache (60s) |
| `useGeneratedVideos` | — | — | — | module cache (60s) |

---

## Key Lib Files (non-DB)

| File | Purpose |
|------|---------|
| `lib/auth.ts` | NextAuth v5 config |
| `lib/config.ts` | Environment variable access |
| `lib/processTemplateJob.ts` | Pipeline step execution engine |
| `lib/lateAccountPool.ts` | Multi-key Late API client |
| `lib/dateUtils.ts` | Date formatting (+ re-exports from domUtils) |
| `lib/domUtils.ts` | Browser DOM helpers (download, clipboard) |
| `lib/db-transforms.js` | snake_case → camelCase row transforms |
