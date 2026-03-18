import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET() {
  const socialApiConfigured = config.LATE_API_KEYS.length > 0;

  return NextResponse.json({
    falKeyConfigured: !!config.FAL_KEY,
    rapidApiKeyConfigured: !!config.RAPIDAPI_KEY,
    lateApiKeyConfigured: socialApiConfigured,
    zernioApiConfigured: socialApiConfigured,
    databaseConfigured: !!config.DATABASE_URL,
    gcsConfigured: !!process.env.GCS_SERVICE_ACCOUNT_KEY,
    gcsBucketName: config.GCS_BUCKET_NAME,
    defaultMaxSeconds: config.defaultMaxSeconds,
    defaultTimezone: config.defaultTimezone,
  });
}
