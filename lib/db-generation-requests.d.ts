export function createGenerationRequest(params: {
  type: string;
  provider: string;
  model: string;
  status?: string;
  cost?: number | null;
  durationSeconds?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
  createdByEmail?: string | null;
}): Promise<{ id: string; [key: string]: unknown }>;

export function updateGenerationRequest(
  id: string,
  params: {
    status?: string;
    cost?: number | null;
    durationSeconds?: number | null;
    error?: string | null;
  },
): Promise<void>;

export function getGenerationRequestStats(params?: {
  period?: '24h' | '7d' | '30d';
  from?: string | null;
  to?: string | null;
}): Promise<{
  summary: {
    total_requests: number;
    successful: number;
    failed: number;
    total_cost: number;
    image_cost: number;
    video_cost: number;
    image_requests: number;
    video_requests: number;
  };
  daily: Array<{
    date: string;
    image_success: number;
    video_success: number;
    failed: number;
    image_cost: number;
    video_cost: number;
  }>;
  byModel: Array<{
    model: string;
    type: string;
    total: number;
    successful: number;
    failed: number;
    total_cost: number;
  }>;
  byUser: Array<{
    user_key: string;
    display_name: string;
    email: string | null;
    total: number;
    successful: number;
    failed: number;
    total_cost: number;
    images: number;
    videos: number;
  }>;
  byJob: Array<{
    job_id: string;
    total: number;
    successful: number;
    failed: number;
    total_cost: number;
    total_duration: number;
  }>;
  timeseries: Array<{
    ts: string;
    success: number;
    failed: number;
    processing: number;
  }>;
  recent: Array<{
    id: string;
    type: string;
    model: string;
    status: string;
    cost: number | null;
    duration_seconds: number | null;
    error: string | null;
    created_by: string | null;
    created_by_email: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
}>;
