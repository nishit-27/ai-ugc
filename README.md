# AI UGC Generator (Next.js)

Create AI-powered UGC videos from TikTok content: paste a TikTok URL, upload a model image, and generate a face-swapped video. Schedule or publish directly to TikTok via Late API.

## Features

- **Generate**: TikTok URL + model image → FAL (Kling motion-control) → downloadable video
- **Posts**: List, filter, retry, delete Late posts; create new posts with generated or uploaded videos
- **Connections**: Profiles, connect TikTok/Instagram/YouTube/Facebook/Twitter/LinkedIn via Late; invite links
- **Large video uploads**: Browser uploads directly to Google Cloud Storage using resumable chunked upload sessions

## Getting Startedddd

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Create a `.env.local` in the project root (see parent `webapp/.env.example` for reference):

| Variable | Purpose |
|---------|---------|
| `FAL_KEY` | FAL API key for video generation |
| `RAPIDAPI_KEY` | RapidAPI key (TikTok download API) |
| `LATE_API_KEY` | Late API key for TikTok posting and profiles/accounts |
| `TIKTOK_ACCOUNT_ID` | Optional pre-configured TikTok account ID |
| `MAX_VIDEO_SECONDS` | Max video duration in seconds (default 10) |
| `DEFAULT_TIMEZONE` | Timezone for scheduling (default Asia/Kolkata) |
| `UPLOAD_STORAGE_BUCKET_KEY` | Base64 JSON bucket mapping used by app storage (`IMAGES`, `DRIVE`, `TEMPLATES`) |
| `GCS_BUCKET_NAME` | GCS bucket for FAL uploads (optional; required for generation) |
| `GCS_PROJECT_ID` | GCP project ID for GCS |
| `GOOGLE_APPLICATION_CREDENTIALS` or `GCS_SERVICE_ACCOUNT_KEY` | GCS credentials |

## Requirements

- **ffmpeg** and **ffprobe** on the system path (for trimming TikTok videos before upload to FAL).

## API routes

- `POST /api/upload-image` – upload model image
- `POST /api/upload-video` – legacy server-side video upload (small files)
- `POST /api/upload-video/session` – create resumable direct-upload session for browser -> GCS
- `POST /api/upload-video/complete` – finalize upload, store DB record, return signed preview URL
- `POST /api/generate` – start generation job (TikTok URL + imageName + maxSeconds)
- `GET /api/jobs` – list jobs
- `GET /api/job/[id]` – job status; `DELETE` – delete job
- `POST /api/batch-generate` – batch jobs
- `GET /api/videos` – list generated videos
- `GET /api/config-status` – which keys are configured
- `GET /api/serve/uploads/[filename]`, `/api/serve/output/[filename]` – serve uploaded/generated files
- TikTok: `GET /api/tiktok/accounts`, `GET /api/tiktok/connect`, `POST /api/tiktok/upload`
- Late: `/api/late/posts`, `/api/late/profiles`, `/api/late/accounts`, `/api/late/connect/[platform]`, `/api/late/invite/[platform]`, etc.

## GCS CORS for Direct Browser Uploads

Direct resumable uploads require bucket CORS to allow browser `PUT` requests with `Content-Range`.

Example `cors.json`:

```json
[
  {
    "origin": ["http://localhost:3000"],
    "method": ["GET", "HEAD", "PUT", "POST", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Range", "Range", "x-goog-resumable", "x-goog-upload-status", "x-goog-upload-offset"],
    "maxAgeSeconds": 3600
  }
]
```

Apply it to your upload bucket:

```bash
gsutil cors set cors.json gs://YOUR_DRIVE_BUCKET_NAME
```

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [FAL](https://fal.ai)
- [Late API](https://getlate.dev)
