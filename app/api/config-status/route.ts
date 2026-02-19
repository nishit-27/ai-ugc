import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET() {
  return NextResponse.json({
    falKeyConfigured: !!config.FAL_KEY,
    rapidApiKeyConfigured: !!config.RAPIDAPI_KEY,
    lateApiKeyConfigured: config.LATE_API_KEYS.length > 0,
    databaseConfigured: !!config.DATABASE_URL,
    gcsConfigured: !!process.env.GCS_SERVICE_ACCOUNT_KEY,
    gcsBucketName: config.GCS_BUCKET_NAME,
    defaultMaxSeconds: config.defaultMaxSeconds,
    defaultTimezone: config.defaultTimezone,
  });
}
